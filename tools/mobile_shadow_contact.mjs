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
    const original={bias:s.bias,normalBias:s.normalBias,batching:C.game.shadowBatches.enabled};
    const pose=()=>{
      const transforms=[];
      C.game.player.group.traverse(o=>transforms.push([o.name,o.position.toArray(),o.quaternion.toArray(),o.scale.toArray()]));
      return {frame:C.engine.frame,time:C.engine.time,position:C.game.player.pos.toArray(),transforms,
        camera:[C.engine.camera.position.toArray(),C.engine.camera.quaternion.toArray()]};
    };
    const before=pose();
    const frames=[];
    const hooks=[];
    let submissions=[];
    C.scene.traverse(object=>{
      if(!object.isMesh) return;
      const previous=object.onBeforeShadow;
      hooks.push([object,previous]);
      object.onBeforeShadow=function(...args){
        previous.apply(this,args);
        const g=this.geometry;
        submissions.push({name:this.name,indices:Math.min(g.drawRange.count,
          Math.max(0,(g.index?.count??g.attributes.position.count)-g.drawRange.start))});
      };
    });
    try {
      // Compare the current production path with the original caster meshes,
      // at the same pose and bias. Restore production and require repeatability.
      for(const [variant,batching] of [
        ['refreshed',original.batching], ['unbatched',false], ['repeat',original.batching],
      ]) {
        C.game.shadowBatches.setEnabled(batching);
        submissions=[];
        C.atmos.shadowDirty=true;
        C.game.render(0);
        const png=r.domElement.toDataURL('image/png');
        r.getContext().finish();
        frames.push({variant,batching,bias:s.bias,normalBias:s.normalBias,png,
          shadowSubmissions:submissions,batches:{...C.game.shadowBatches.stats},perf:C.engine.perfSnapshot()});
      }
      return {original,before,after:pose(),frames,tier:C.engine.tier.name,
        shadowMapSize:s.mapSize.toArray(),shadowCamera:{near:s.camera.near,far:s.camera.far},
        lightPosition:C.atmos.sun.position.toArray(),lightTarget:C.atmos.sun.target.position.toArray()};
    } finally {
      for(const [object,previous] of hooks) object.onBeforeShadow=previous;
      C.game.shadowBatches.setEnabled(original.batching);
      C.atmos.shadowDirty=true;C.game.render(0);
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
    `shadow ${name}: restoring production batches reproduces identical pixels`);
  check(rows[0].rgbaSha256===rows.find(r=>r.variant==='refreshed').rgbaSha256,
    `shadow ${name}: the production map is already current for the captured pose`);
  const fresh=rows.find(r=>r.variant==='refreshed');
  check(fresh.shadowSubmissions.length<=2 && fresh.batches.unsupportedSources===0,
    `shadow ${name}: at most two actual shadow submissions`,JSON.stringify(fresh.shadowSubmissions));
  report.shadowContact??={scope:'Frozen production batches versus original unbatched caster meshes at identical pose, camera and unchanged bias. Native images and actual onBeforeShadow callbacks are recorded. The first production image must match a forced refresh; restored batches must reproduce the same pixels. Draw and triangle counters include shadow, colour and post submissions, including any zero-count proxy calls. This is a renderer diagnostic, not a source-blind reference comparison or physical-device speed measurement.',views:[]};
  report.shadowContact.views.push({name,...captured});
}
