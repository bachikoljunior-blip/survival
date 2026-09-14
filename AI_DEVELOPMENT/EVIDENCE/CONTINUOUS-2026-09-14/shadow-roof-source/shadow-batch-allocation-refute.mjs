import assert from 'node:assert/strict';
import * as THREE from './survival/node_modules/three/build/three.module.js';
import {ShadowBatches} from './survival/src/render/shadow_batches.js';
import {Actor} from './survival/src/actors/actor.js';
import {Player} from './survival/src/actors/player.js';
import {Enemy} from './survival/src/game/ai.js';

// Materials preserve opaque caster behavior; this probe creates no GL context.
const mats = {
  character: (color,opts) => new THREE.MeshStandardMaterial(Object.fromEntries(
    Object.entries({color,roughness:opts?.roughness,metalness:opts?.metalness}).filter(([,v])=>v!==undefined))),
  glow: color => new THREE.MeshBasicMaterial({color}),
};
function makeFixture(kind) {
  const scene = new THREE.Scene(), light = new THREE.DirectionalLight(), camera = new THREE.PerspectiveCamera();
  light.position.set(-30,92,34);
  Object.assign(light.shadow.camera,{left:-48,right:48,top:48,bottom:-48,near:1,far:150});
  light.shadow.camera.updateProjectionMatrix(); scene.add(light,light.target);
  const base = {mats,world:{},gas:{},seed:41};
  const actors = kind === 'same_probe'
    ? ['ren','warden','scav','breaker','civ','dog','teo','nessa'].map((costume,i)=>
      new Actor({...base,costume,name:costume,detail:1,seed:41+i,weapon:i===5?null:'prybar',x:i*2,z:0}))
    : [new Player({...base}),...['scav','scav','breaker','slinger','dog','dog','warden'].map((k,i)=>
      new Enemy(k,{...base,seed:42+i,x:(i+1)*2,z:0}))];
  for (const actor of actors) scene.add(actor.group);
  const batches = new ShadowBatches(scene), update = () => batches.update(light,camera);
  update(); return {actors,batches,update};
}
function measure(f) {
  for (const actor of f.actors) {actor.animator.locomotion.speed=3.5; actor.animator.update(1/60);}
  const before = [...f.batches.dynamic.packs], records = [];
  const snapshots=before.map(p=>({position:p.position.slice(),index:p.index.slice()}));
  const destination=f.batches.dynamic.mesh.geometry.attributes.position;
  const destinationBefore=destination.array.slice(),destinationVersion=destination.version;
  const originals = {Float32Array:globalThis.Float32Array,Uint32Array:globalThis.Uint32Array};
  for (const name of Object.keys(originals)) globalThis[name] = new Proxy(originals[name],{
    construct(target,args,newTarget) {
      const array = Reflect.construct(target,args,newTarget);
      records.push({type:name,bytes:array.byteLength}); return array;
    },
  });
  try {f.update();} finally {Object.assign(globalThis,originals);}
  const after = f.batches.dynamic.packs;
  assert.equal(before.length,after.length);
  const allArraysReplaced = after.every((p,i)=>p.position!==before[i].position&&p.index!==before[i].index);
  const allArraysReused = after.every((p,i)=>p.position===before[i].position&&p.index===before[i].index);
  const allTopologiesStable = after.every((p,i)=>p.position.length===snapshots[i].position.length&&p.index.length===snapshots[i].index.length&&p.index.every((v,j)=>v===snapshots[i].index[j]));
  const animatedSourcePositionsChanged=after.some((p,i)=>p.position.some((v,j)=>v!==snapshots[i].position[j]));
  const animatedDestinationPositionsChanged=destination.array.some((v,j)=>v!==destinationBefore[j]);
  const destinationUploadMarked=destination.version>destinationVersion;
  const sum = records.reduce((n,r)=>n+r.bytes,0);
  const packByteLengths = after.reduce((n,p)=>n+p.position.byteLength+p.index.byteLength,0);
  assert.equal(records.length,0);assert.equal(sum,0);
  assert.equal(allArraysReused,true);assert.equal(allTopologiesStable,true);
  assert.equal(animatedSourcePositionsChanged,true);assert.equal(animatedDestinationPositionsChanged,true);
  assert.equal(destinationUploadMarked,true);
  return {
    skinnedBodies:f.actors.length,dynamicSources:after.length,typedArrayAllocations:records.length,
    typedArrayAllocatedBytes:sum,packByteLengths,bytesPerSecondAt60Updates:sum*60,
    allArraysReplaced,allArraysReused,allTopologiesStable,
    animatedSourcePositionsChanged,animatedDestinationPositionsChanged,destinationUploadMarked,
  };
}
console.log(JSON.stringify({
  sameProbeActors:measure(makeFixture('same_probe')),
  actualPerformanceFixtureLoadout:measure(makeFixture('product')),
},null,2));
