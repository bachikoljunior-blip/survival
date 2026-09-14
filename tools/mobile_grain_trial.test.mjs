import assert from 'node:assert/strict';
import { test } from 'node:test';
import {createHash} from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { PNG } from 'pngjs';
import { captureFrozenGrainFrames, captureGrainTrial } from './mobile_grain_trial.mjs';

const productionBundle=readFileSync(new URL('../cinderline.1.0.0.js',import.meta.url));
assert.equal(createHash('sha256').update(productionBundle).digest('hex'),'6b887bc1cf6ebc0b7fae6c146e46c05d067ad5ba51544fd218d17e8483ea338b');
const bundleText=productionBundle.toString('utf8');
const renderStart=bundleText.indexOf('function Mm(I,B,$,j,V,gt){');
const renderEnd=bundleText.indexOf('function uc(',renderStart);
assert(renderStart>0 && renderEnd>renderStart);
const renderObjectSource=bundleText.slice(renderStart,renderEnd);
assert(renderObjectSource.includes('V.needsUpdate=!0,w.renderBufferDirect'));
const actualRenderObject=renderer=>new Function('w','vi','Xe','oi',renderObjectSource+';return Mm;')(renderer,THREE.DoubleSide,THREE.BackSide,THREE.FrontSide);

// Run the exact production update methods on real Three.js CPU objects. No
// renderer, canvas, browser, screenshots or visual-quality measurements here.
const atmosphereSource = readFileSync(new URL('../src/render/atmosphere.js', import.meta.url), 'utf8');
const classSource = atmosphereSource.slice(atmosphereSource.indexOf('class PlumeField {'), atmosphereSource.indexOf('const BURST_KINDS ='));
assert(classSource.includes('class BurstField {'));
const { PlumeField, BurstField } = new Function('THREE', 'clamp', 'clamp01', `
  const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion();
  const _v3 = new THREE.Vector3(), _col = new THREE.Color();
  ${classSource}
  return { PlumeField, BurstField };
`)(THREE, (x, lo, hi) => Math.min(hi, Math.max(lo, x)), x => Math.min(1, Math.max(0, x)));

function fieldMesh(scene, name) {
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(), 8);
  mesh.name = name;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(24).fill(1), 3);
  const alpha = new THREE.InstancedBufferAttribute(new Float32Array(8), 1);
  const cell = new THREE.InstancedBufferAttribute(new Float32Array(8), 1);
  mesh.geometry.setAttribute('aAlpha', alpha); mesh.geometry.setAttribute('aCell', cell);
  scene.add(mesh);
  return { mesh, alpha, cell };
}
function fixture(mutate = () => {}) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  camera.position.set(3, 2, 4);
  const playerPos = new THREE.Vector3(0, 1, 0);
  const plumes = Object.assign(Object.create(PlumeField.prototype), fieldMesh(scene, 'production-plume'), {
    slots: 1, perSlot: 1,
    anchors: [{ active: true, x: 0, y: 0, z: 0, kind: 'vent' }],
    state: [{ t: 0.4, speed: 0.5, spin: 0.1, off: 0.15, size: 1, op: 1, cell: 2 }],
  });
  const burst = Object.assign(Object.create(BurstField.prototype), fieldMesh(scene, 'production-burst'), { max: 8 });
  const additive = fieldMesh(scene, 'production-burst-add');
  burst.meshAdd = additive.mesh; burst.alphaAdd = additive.alpha; burst.cellAdd = additive.cell;
  burst.parts = [false, true].map(add => ({ alive: true, life: 0.6, maxLife: 1,
    x: 1, y: 1, z: 1, vx: 0.1, vy: 0.2, vz: 0.3, grav: 1, drag: 1,
    size: 1, grow: 0.4, op: 0.7, color: 0x886644, cell: 1, add }));
  const atmos = { sun: new THREE.DirectionalLight(), hemi: new THREE.HemisphereLight(),
    ambient: new THREE.AmbientLight(), emberFill: new THREE.PointLight(), time: 5, exposureBias: 1 };
  scene.add(atmos.sun, atmos.sun.target, atmos.hemi, atmos.ambient, atmos.emberFill);
  const grade = { grain: 0.035, exposure: 1 };
  const beforePNG = PNG.sync.write({ width: 1, height: 1, data: Buffer.from([50, 50, 50, 255]) });
  const trialPNG = PNG.sync.write({ width: 1, height: 1, data: Buffer.from([51, 50, 50, 255]) });
  const renderer = { domElement: { width: 1, height: 1,
    toDataURL: () => 'data:image/png;base64,' + (grade.grain === 0.035 ? beforePNG : trialPNG).toString('base64') },
    renderBufferDirect() {}, getContext: () => ({ finish() {} }), info: { render: { calls: 3, triangles: 6 } } };
  const C = { scene, atmos, post: { enabled: true, tier: { grain: true }, grade,
    matComposite: { uniforms: { uGrain: { value: 0.035 }, uTime: { value: 5 }, uExposure: { value: 1 } } } },
    engine: { camera, renderer, running: false, tier: { name: 'medium' }, tierLocked: true, frame: 3, time: 5 },
    game: { settings: { quality: 'medium' }, player: { pos: playerPos, yaw: 0, hp: 100, state: 'idle' },
      mode: 'play', moodName: 'street', time: 5 } };
  const renderObject=actualRenderObject(renderer);
  let frame = 0;
  C.game.render = dt => {
    assert.equal(dt, 0);
    plumes.update(dt, playerPos, camera); burst.update(dt, camera);
    mutate({ C, plumes, burst, frame: ++frame });
    scene.updateMatrixWorld(true);
    for(const mesh of [plumes.mesh,burst.mesh,burst.meshAdd]) renderObject(mesh,scene,camera,mesh.geometry,mesh.material,null);
    C.post.matComposite.uniforms.uGrain.value = grade.grain;
  };
  return { C, plumes, burst, beforePNG };
}
async function runFixture(mutate) {
  const f = fixture(mutate), previous = globalThis.window;
  globalThis.window = { CINDERLINE: f.C };
  try { return { f, result: await captureFrozenGrainFrames({ beforeGrain: 0.035, trialGrain: 0.012 }) }; }
  finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
}

test('production dt=0 plume/burst uploads change old records but preserve every data byte', async () => {
  const { result } = await runFixture();
  assert.equal(result.failure, null);
  assert.equal(result.descriptorRestored, true);
  assert.notEqual(result.before.sceneRecord, result.trial.sceneRecord);
  assert.notEqual(result.before.sceneRecord, result.restored.sceneRecord);
  for (const comparison of Object.values(result.sceneComparisons)) {
    assert.equal(comparison.unchanged, true);
    assert.equal(comparison.changedBufferCount, 0);
    assert.equal(comparison.counterDifferenceCount, 12);
    assert(comparison.counterDifferences.some(x => x.path.endsWith('.attributes.aAlpha.version')));
    assert(comparison.counterDifferences.some(x => x.path.endsWith('.attributes.aCell.version')));
    assert(comparison.counterDifferences.some(x => x.path.endsWith('.instanceMatrix.version')));
  }
});

test('real buffer mutation with normal upload increments is rejected and gives old/new values', async () => {
  const { result } = await runFixture(({ plumes, frame }) => { if (frame === 2) plumes.alpha.array[0] += 0.125; });
  const comparison = result.sceneComparisons.beforeTrial;
  assert.equal(comparison.unchanged, false);
  assert.equal(comparison.changedBufferCount, 1);
  assert.match(comparison.bufferDifferences[0].path, /attributes.aAlpha.array$/);
  assert(comparison.bufferDifferences[0].samples.some(x => x.beforeValue !== x.afterValue));
  assert.equal(result.sceneComparisons.beforeRestored.unchanged, true);
});

for (const [name, change, expected] of [
  ['geometry without version increment', ({ plumes }) => { plumes.mesh.geometry.attributes.position.array[0] += 0.125; }, /attributes.position/],
  ['index without version increment', ({ plumes }) => { plumes.mesh.geometry.index.array[0] = 2; }, /\.index/],
  ['instance matrix', ({ plumes }) => { plumes.mesh.instanceMatrix.array[12] += 1; }, /instanceMatrix/],
  ['instance colour', ({ plumes }) => { plumes.mesh.instanceColor.array[0] = 0.2; }, /instanceColor/],
  ['transform', ({ plumes }) => { plumes.mesh.position.x = 1; }, /matrixWorld/],
  ['visibility', ({ plumes }) => { plumes.mesh.visible = false; }, /visible/],
  ['material colour without version increment', ({ plumes }) => { plumes.mesh.material.color.r = 0.1; }, /materials\..*color.r/],
  ['material version remains strict', ({ plumes }) => { plumes.mesh.material.needsUpdate = true; }, /materials\..*version/],
  ['light intensity', ({ C }) => { C.atmos.sun.intensity = 2; }, /light.intensity/],
  ['instance count', ({ plumes }) => { plumes.mesh.count = 0; }, /count/],
  ['draw range', ({ plumes }) => { plumes.mesh.geometry.drawRange.count = 0; }, /drawRange.count/],
]) {
  test(name + ' is rejected', async () => {
    const { result } = await runFixture(values => { if (values.frame === 2) change(values); });
    assert.equal(result.sceneComparisons.beforeTrial.unchanged, false);
    assert(result.sceneComparisons.beforeTrial.differences.some(x => expected.test(x.path)),
      JSON.stringify(result.sceneComparisons.beforeTrial));
  });
}

test('end-to-end CPU report preserves old failed equality and uses byte guard; these are synthetic PNG fixtures', async () => {
  const parent = dirname(fileURLToPath(import.meta.url));
  const root = mkdtempSync(join(parent, '.grain-cpu-'));
  mkdirSync(join(root, 'dist')); mkdirSync(join(root, 'out'));
  writeFileSync(join(root, 'dist/cinderline.1.0.0.js'), 'CPU fixture; not a production bundle');
  const previous = globalThis.window;
  try {
    for (const shouldMutate of [false, true]) {
      const f = fixture(({ plumes, frame }) => { if (shouldMutate && frame === 2) plumes.alpha.array[0] += 0.125; });
      globalThis.window = { CINDERLINE: f.C };
      const cachedFrame = join(root, 'out', 'fixture.png'); writeFileSync(cachedFrame, f.beforePNG);
      const report = {}, checks = [];
      await captureGrainTrial({ page: { evaluate: (fn, args) => fn(args) }, root, output: join(root, 'out'),
        name: 'synthetic-cpu-only', cachedFrame, report, check: (ok, ...detail) => checks.push({ ok, detail }) });
      const row = report.grainTrial.views[0];
      assert.equal(row.sceneRecordsUnchanged, false);
      assert.equal(row.sceneDataUnchanged, !shouldMutate);
      assert.equal(row.validControlledCapture, !shouldMutate);
      assert.equal(row.pixelsRestored, true);
      assert.equal(row.pngBytesRestored, true);
      assert.equal(row.descriptorRestored, true);
      assert.equal(report.grainTrial.verdict, 'not measured');
      assert.equal(checks[0].ok, !shouldMutate);
    }
  } finally {
    if (previous === undefined) delete globalThis.window; else globalThis.window = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

// These controls execute the exact renderer-side branch from the pinned
// production bundle. renderBufferDirect is a CPU stub, so no GPU result is claimed.
const doubleSided=({plumes,frame})=>{if(frame===1){plumes.mesh.material.transparent=true;plumes.mesh.material.side=THREE.DoubleSide;}};
test('actual production double-pass material invalidations are accounted for, with exact renderer restoration',async()=>{
  const {result}=await runFixture(doubleSided);
  assert.equal(result.rendererMethodRestored,true);
  for(const comparison of Object.values(result.sceneComparisons)){
    assert.equal(comparison.unchanged,true);
    assert.equal(comparison.strictDifferenceCount,1);
    assert.equal(comparison.classifiedMaterialCounterCount,1);
    assert.equal(comparison.materialVersionAudit.length,1);
    assert.equal(comparison.materialVersionAudit[0].acceptedAsObservedRenderCounter,true);
    assert.equal(comparison.materialVersionAudit[0].side,THREE.DoubleSide);
  }
});
for(const [label,mutation] of [
  ['extra update outside renderer',({plumes})=>{plumes.mesh.material.needsUpdate=true;}],
  ['material colour change during counted passes',({plumes})=>{plumes.mesh.material.color.r=.123;}],
  ['forceSinglePass change',({plumes})=>{plumes.mesh.material.forceSinglePass=true;plumes.mesh.material.needsUpdate=true;}],
  ['non-double-side change',({plumes})=>{plumes.mesh.material.side=THREE.FrontSide;plumes.mesh.material.needsUpdate=true;}],
  ['texture upload version',({plumes})=>{plumes.mesh.material.map.needsUpdate=true;}],
]) test(label+' remains rejected',async()=>{
  const {result}=await runFixture(values=>{doubleSided(values);if(values.frame===1)values.plumes.mesh.material.map=new THREE.Texture();if(values.frame===2)mutation(values);});
  assert.equal(result.sceneComparisons.beforeTrial.unchanged,false);
  assert.equal(result.rendererMethodRestored,true);
});

// Independent review regression controls: cleanup failures never validate a capture.
test('review: renderer restores after render throws', async()=>{
 const f=fixture(({frame})=>{if(frame===2)throw Error('CPU render failure');});
 const original=f.C.engine.renderer.renderBufferDirect; const previous=globalThis.window;
 globalThis.window={CINDERLINE:f.C};
 try {const result=await captureFrozenGrainFrames({beforeGrain:.035,trialGrain:.012});
 assert(result.failure.includes('CPU render failure'));
 assert.equal(f.C.engine.renderer.renderBufferDirect,original);
 assert.equal(result.rendererMethodRestored,true);}
 finally {globalThis.window=previous;}
});
test('review: grain restore exception must still restore renderer', async()=>{
 const f=fixture(({C,frame})=>{if(frame===2)Object.defineProperty(C.post.grade,'grain',{writable:false,configurable:false});});
 const original=f.C.engine.renderer.renderBufferDirect; const previous=globalThis.window;
 globalThis.window={CINDERLINE:f.C};
 try {const result=await captureFrozenGrainFrames({beforeGrain:.035,trialGrain:.012});
 assert.match(result.failure,/restoration descriptor:.*Cannot redefine property/s);
 assert.equal(result.descriptorRestored,false); assert.equal(result.rendererMethodRestored,true);
 assert.equal(f.C.engine.renderer.renderBufferDirect,original);}
 finally {globalThis.window=previous;}
});
