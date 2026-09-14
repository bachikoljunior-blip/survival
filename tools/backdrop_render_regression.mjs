/** Isolate the ground tessellation change in a real, frozen production scene.
 * The old mesh is built by the archived production source, not an imitation.
 * These are regression diagnostics, not a reference-work blind comparison.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export const BEFORE_COMMIT = '80dd49044496d5a1434a81efcc615bbbfcb0c0fd';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const pack = attribute => {
  const array = attribute.array;
  const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  return { type: array.constructor.name, itemSize: attribute.itemSize,
    normalized: attribute.normalized, sha256: digest(bytes), base64: bytes.toString('base64') };
};

export async function previousGround(root) {
  mkdirSync(join(root, 'test-results'), { recursive: true });
  const folder = mkdtempSync(join(root, 'test-results', 'ground-source-'));
  try {
    const archive = execFileSync('git', ['archive', BEFORE_COMMIT, 'src'], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
    execFileSync('tar', ['-xf', '-', '-C', folder], { input: archive });
    const module = path => import(pathToFileURL(join(folder, 'src', path)).href);
    const [{ City }, { Rng }, { buildHollisData }] = await Promise.all([
      module('world/city.js'), module('core/rng.js'), module('content/world_data.js'),
    ]);
    const data = buildHollisData();
    const make = seed => {
      const city = new City(data, null, null);
      const material = new THREE.MeshBasicMaterial();
      city._mat = () => material; // Geometry-only construction; real material stays in the browser.
      city._buildBackdrop(new Rng(seed));
      const ground = city.root.getObjectByName('backdrop:ash');
      const geometry = ground.geometry;
      const result = { attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([k,v]) => [k,pack(v)])), index: pack(geometry.index) };
      city.root.traverse(o => o.geometry?.dispose()); material.dispose();
      return result;
    };
    const first = make('ground-control-1'), second = make('ground-control-2');
    for (const key of Object.keys(first.attributes)) {
      if (first.attributes[key].sha256 !== second.attributes[key].sha256) throw new Error(`ground RNG dependency: ${key}`);
    }
    if (first.index.sha256 !== second.index.sha256) throw new Error('ground RNG dependency: index');
    return { ...first, bounds: data.bounds, sourceCommit: BEFORE_COMMIT, sourceSha256: digest(readFileSync(join(folder,'src/world/city.js'))) };
  } finally { rmSync(folder, { recursive: true, force: true }); }
}

function difference(a, b) {
  const x = PNG.sync.read(readFileSync(a)), y = PNG.sync.read(readFileSync(b));
  if (x.width !== y.width || x.height !== y.height) throw new Error('regression image dimensions differ');
  let changedPixelsExact=0;
  for(let i=0;i<x.data.length;i+=4) {
    if(x.data[i]!==y.data[i] || x.data[i+1]!==y.data[i+1] || x.data[i+2]!==y.data[i+2] || x.data[i+3]!==y.data[i+3]) changedPixelsExact++;
  }
  return { perceptualPixels:pixelmatch(x.data,y.data,null,x.width,x.height,{threshold:0.1}),
    changedPixelsExact, totalPixels:x.width*x.height };
}

export async function exerciseBackdrop({ page, root, output, check, report }) {
  const previous = await previousGround(root);
  report.backdropRegression = { scope: 'Old ground geometry substituted in the same frozen current production scene. All other geometry, materials, lighting and camera are held constant within each pair. World-only diagnostic views; no gameplay, physical FPS or reference-comparison claim.',
    sourceCommit: previous.sourceCommit, sourceSha256: previous.sourceSha256,
    oldAttributeHashes: Object.fromEntries(Object.entries(previous.attributes).map(([k,v])=>[k,v.sha256])),
    oldIndexHash: previous.index.sha256, views: [] };
  await page.evaluate(data => {
    const C = window.CINDERLINE, T = C.THREE;
    const attribute = a => {
      const bytes = Uint8Array.from(atob(a.base64), c => c.charCodeAt(0));
      return new T.BufferAttribute(new window[a.type](bytes.buffer), a.itemSize, a.normalized);
    };
    const old = new T.BufferGeometry();
    for (const [key,a] of Object.entries(data.attributes)) old.setAttribute(key, attribute(a));
    old.setIndex(attribute(data.index)); old.computeBoundingSphere();
    const mesh = C.city.root.getObjectByName('backdrop:ash');
    const ui = document.getElementById('ui');
    C.__groundRegression = { mesh, old, current: mesh.geometry, uiDisplay: ui.style.display, wasRunning:C.engine.running };
    C.engine.stop(); ui.style.display = 'none';
  }, previous);
  try {
    const views = [
      ['street', -112, 1.7, -78, 0, -4],
      ['roof', -112, 21.2, -62, 135, -6],
      ['city_edge', -140, 4, -124, 25, -12],
      ['horizon_ground', -150, 30, 90, 210, -25],
    ];
    for (const [name,...camera] of views) {
      const setup = await page.evaluate(args => {
        const C=window.CINDERLINE;
        C.setCamera(...args); C.game.render(0);
        return { requestedPlayerCamera: args, cameraPosition:C.engine.camera.position.toArray(), cameraQuaternion:C.engine.camera.quaternion.toArray(), time:C.engine.time, tier:C.engine.tier.name, resolution:C.engine.perfSnapshot().res };
      }, camera);
      const captures = {};
      for (const variant of ['current', 'previous', 'repeat']) {
        const measured = await page.evaluate(variant => {
          const C=window.CINDERLINE, state=C.__groundRegression, r=C.engine.renderer;
          state.mesh.geometry = variant==='previous' ? state.old : state.current;
          const original=r.renderBufferDirect, passes={}, objects={};
          r.renderBufferDirect=function(...args) {
            const before=this.info.render.triangles, target=this.getRenderTarget();
            const value=original.apply(this,args), count=this.info.render.triangles-before;
            const pass=target===null?'screen':target===C.post.sceneRT?'sceneColor':target===C.atmos.sun.shadow.map?'sunShadow':
              [C.post.bloomA,C.post.bloomB,C.post.bloomC,C.post.bloomD].includes(target)?'bloom':'other';
            passes[pass]=(passes[pass]||0)+count;
            const object=args[4]?.name||args[4]?.type||'unnamed';
            objects[object]=(objects[object]||0)+count;
            return value;
          };
          r.info.reset();
          try { C.post.render(C.scene,C.engine.camera,C.engine.time); }
          finally { r.renderBufferDirect=original; }
          // Capture this actual frame in the same JS turn. A paused WebKit
          // page screenshot can otherwise retain the previous compositor frame.
          const framePng=r.domElement.toDataURL('image/png');
          r.getContext().finish();
          return { passes, ashTriangles:objects['backdrop:ash']||0,
            allPassTriangles:r.info.render.triangles, attributedTriangles:Object.values(passes).reduce((a,b)=>a+b,0),
            geometryTriangles:state.mesh.geometry.index.count/3, framePng };
        }, variant);
        const nativeFile=join(output,`ground-${name}-${variant}-frame.png`);
        const frameBytes=Buffer.from(measured.framePng.split(',')[1],'base64');
        writeFileSync(nativeFile,frameBytes);
        const frame=PNG.sync.read(frameBytes);
        measured.nativeImage={width:frame.width,height:frame.height,pngSha256:digest(frameBytes),rgbaSha256:digest(frame.data)};
        delete measured.framePng;
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const file=join(output,`ground-${name}-${variant}.png`);
        await page.screenshot({path:file});
        captures[variant]={file:file.slice(root.length+1),nativeFile:nativeFile.slice(root.length+1),...measured};
      }
      const pair=difference(join(root,captures.current.nativeFile),join(root,captures.previous.nativeFile));
      const control=difference(join(root,captures.current.nativeFile),join(root,captures.repeat.nativeFile));
      check(control.changedPixelsExact===0,`ground regression ${name}: unchanged rendering control is byte-identical`,JSON.stringify(control));
      check(Object.values(captures).every(c=>c.attributedTriangles===c.allPassTriangles),`ground regression ${name}: pass counts reconcile exactly`);
      check(captures.current.geometryTriangles===1256 && captures.previous.geometryTriangles===723456,
        `ground regression ${name}: actual old/new geometry counts`);
      check(captures.current.ashTriangles===1256 && captures.previous.ashTriangles===723456 && captures.repeat.ashTriangles===1256,
        `ground regression ${name}: both compared ground meshes are actually submitted`);
      report.backdropRegression.views.push({name,...setup,captures,pairDifference:pair,controlDifference:control,
        pixelComparisonSurface:'Native rendered canvas captured synchronously; viewport screenshots are separately retained.',
        mainSceneBudgetMet:captures.current.passes.sceneColor<=300000});
    }
  } finally {
    await page.evaluate(() => {
      const C=window.CINDERLINE, s=C.__groundRegression;
      if (!s) return;
      s.mesh.geometry=s.current; s.old.dispose();
      document.getElementById('ui').style.display=s.uiDisplay;
      if (s.wasRunning) C.engine.start();
      delete C.__groundRegression;
    });
  }
}
