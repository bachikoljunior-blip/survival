/** Frozen production render diagnostics; never a reference-work comparison. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function captureShadowContact({page,root,output,name,cachedFrame,check,report}) {
  const captured=await page.evaluate(()=>{
    const C=window.CINDERLINE,r=C.engine.renderer,s=C.atmos.sun.shadow;
    if(C.engine.running) throw new Error('shadow diagnostic needs the already frozen visual capture');
    const original={bias:s.bias,normalBias:s.normalBias};
    const pose=()=>{
      const transforms=[];
      C.game.player.group.traverse(o=>transforms.push([o.name,o.position.toArray(),o.quaternion.toArray(),o.scale.toArray()]));
      return {frame:C.engine.frame,time:C.engine.time,position:C.game.player.pos.toArray(),transforms,
        camera:[C.engine.camera.position.toArray(),C.engine.camera.quaternion.toArray()]};
    };
    const before=pose();
    const frames=[];
    try {
      // The cached production image and a refreshed image at the same values
      // distinguish a stale map from the numerical depth offset hypothesis.
      for(const [variant,bias,normalBias] of [
        ['refreshed',original.bias,original.normalBias],
        ['depth',-0.00015,original.normalBias],
        ['depth-normal',-0.00015,0.012],
        ['repeat',original.bias,original.normalBias],
      ]) {
        s.bias=bias;s.normalBias=normalBias;
        C.atmos.shadowDirty=true;
        C.game.render(0);
        const png=r.domElement.toDataURL('image/png');
        r.getContext().finish();
        frames.push({variant,bias,normalBias,png,perf:C.engine.perfSnapshot()});
      }
      return {original,before,after:pose(),frames,tier:C.engine.tier.name,
        shadowMapSize:s.mapSize.toArray(),shadowCamera:{near:s.camera.near,far:s.camera.far},
        lightPosition:C.atmos.sun.position.toArray(),lightTarget:C.atmos.sun.target.position.toArray()};
    } finally {
      Object.assign(s,original);C.atmos.shadowDirty=true;C.game.render(0);
    }
  });
  // Reuse the parent's synchronous production capture. A later toDataURL on a
  // preserveDrawingBuffer:false canvas can read a discarded drawing buffer.
  const cachedBytes=readFileSync(cachedFrame),cachedPng=PNG.sync.read(cachedBytes);
  const rows=[{variant:'cached',...captured.original,path:cachedFrame.slice(root.length+1),
    width:cachedPng.width,height:cachedPng.height,pngSha256:digest(cachedBytes),rgbaSha256:digest(cachedPng.data)}];
  for(const frame of captured.frames) {
    const bytes=Buffer.from(frame.png.split(',')[1],'base64');
    delete frame.png;
    const png=PNG.sync.read(bytes),path=join(output,`shadow-${name}-${frame.variant}.png`);
    writeFileSync(path,bytes);
    rows.push({...frame,path:path.slice(root.length+1),width:png.width,height:png.height,
      pngSha256:digest(bytes),rgbaSha256:digest(png.data)});
  }
  captured.frames=rows;
  check(JSON.stringify(captured.before)===JSON.stringify(captured.after),
    `shadow ${name}: pose, camera and simulation stay fixed`);
  check(rows.find(r=>r.variant==='refreshed').rgbaSha256===rows.find(r=>r.variant==='repeat').rgbaSha256,
    `shadow ${name}: restoring original values reproduces identical pixels`);
  report.shadowContact??={scope:'Diagnostic alternatives in the same frozen medium-quality production scene. The first image uses the cached production shadow map; all others rebuild it. Only shadow bias and normalBias vary. Alternate values are not shipped settings, a blind verdict, or physical-device performance evidence.',views:[]};
  report.shadowContact.views.push({name,...captured});
}
