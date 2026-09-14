import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from './survival/node_modules/three/build/three.module.js';
import { ShadowBatches } from './survival/src/render/shadow_batches.js';
import { WebGLShadowMap } from './survival/node_modules/three/src/renderers/webgl/WebGLShadowMap.js';
import { WebGLGeometries } from './survival/node_modules/three/src/renderers/webgl/WebGLGeometries.js';
import { WebGLObjects } from './survival/node_modules/three/src/renderers/webgl/WebGLObjects.js';
import { WebGLInfo } from './survival/node_modules/three/src/renderers/webgl/WebGLInfo.js';
import { WebGLIndexedBufferRenderer } from './survival/node_modules/three/src/renderers/webgl/WebGLIndexedBufferRenderer.js';
import { WebGLBufferRenderer } from './survival/node_modules/three/src/renderers/webgl/WebGLBufferRenderer.js';
import { City } from './survival/src/world/city.js';
import { MeshBuilder } from './survival/src/world/geom.js';
import { buildHollisData } from './survival/src/content/world_data.js';
import { Actor } from './survival/src/actors/actor.js';
import { ThirdPersonCamera } from './survival/src/actors/player.js';
import { CLIPS } from './survival/src/actors/anim.js';

// These stubs create no rendering context. Opaque shadow materials depend only
// on positions, side and alpha options; the city's source geometry is unchanged.
const ctx = new Proxy({measureText: () => ({width: 6})}, {get:(t,k)=>t[k] ?? (()=>{}), set:(t,k,v)=>(t[k]=v,true)});
globalThis.document = {createElement: () => ({getContext:()=>ctx})};
const materials = new Map();
const mat = (key, opts={}) => {
  if (!materials.has(key)) materials.set(key,new THREE.MeshStandardMaterial(opts));
  return materials.get(key);
};
const mats = {
  get:(kind,opts)=>mat(`${kind}|${JSON.stringify(opts)}`,{side:opts?.side ?? THREE.FrontSide}),
  flat:(color,opts)=>mat(`flat:${color}|${JSON.stringify(opts)}`,{color,...opts}),
  glowShared:()=>mat('glow'),
  character:(color,opts)=>mat(`char:${color}|${JSON.stringify(opts)}`,{color}),
  get count(){return materials.size;},
};

const geomBaseline=execFileSync('git',['show','HEAD:src/world/geom.js'],{cwd:'/workspace/scratch/0b7ad82bafe7/survival',encoding:'utf8'})
  .replace("from 'three'","from 'file:///workspace/scratch/0b7ad82bafe7/survival/node_modules/three/build/three.module.js'")
  .replace("from '../core/util.js'","from 'file:///workspace/scratch/0b7ad82bafe7/survival/src/core/util.js'");
const OldMeshBuilder=(await import('data:text/javascript;base64,'+Buffer.from(geomBaseline).toString('base64'))).MeshBuilder;
const planarChecks={geometries:0,faces:0,originalTriangles:0,simplifiedTriangles:0,maxPlaneError:0,maxBoundaryError:0,maxRelativeAreaError:0};
const actualBuild=MeshBuilder.prototype.build;
MeshBuilder.prototype.build=function(...args){
  const g=actualBuild.apply(this,args), old=OldMeshBuilder.prototype.build.apply(this,args);
  for(const key of ['position','normal','uv','color'])assert.deepEqual(g.attributes[key].array,old.attributes[key].array);
  assert.deepEqual(g.index.array,old.index.array);planarChecks.geometries++;
  const p=g.attributes.position, get=i=>new THREE.Vector3().fromBufferAttribute(p,i);
  for(const f of this.shadowFaces){
    planarChecks.faces++;
    const t1=new THREE.Triangle(...f.indices.slice(0,3).map(get)),t2=new THREE.Triangle(...f.indices.slice(3).map(get));
    const area=t1.getArea()+t2.getArea(),normal=t1.getNormal(new THREE.Vector3());
    let fullArea=0;
    for(let i=f.start;i<f.start+f.count;i+=3){
      const t=new THREE.Triangle(get(this.idx[i]),get(this.idx[i+1]),get(this.idx[i+2]));
      fullArea+=t.getArea();
      if(area>1e-12)assert.ok(t.getNormal(new THREE.Vector3()).dot(normal)>-1e-6);
      for(const v of [t.a,t.b,t.c]){
        const planeError=Math.abs(normal.dot(v.clone().sub(t1.a)));
        const boundaryError=Math.min(t1.closestPointToPoint(v,new THREE.Vector3()).distanceTo(v),t2.closestPointToPoint(v,new THREE.Vector3()).distanceTo(v));
        planarChecks.maxPlaneError=Math.max(planarChecks.maxPlaneError,planeError);
        planarChecks.maxBoundaryError=Math.max(planarChecks.maxBoundaryError,boundaryError);
        assert.ok(planeError<0.0001);assert.ok(boundaryError<0.0001);
      }
    }
    const error=Math.abs(fullArea-area)/Math.max(1e-9,area);
    planarChecks.maxRelativeAreaError=Math.max(planarChecks.maxRelativeAreaError,error);
    assert.ok(error<0.0001);
  }
  planarChecks.originalTriangles+=g.index.count/3;
  planarChecks.simplifiedTriangles+=(g.userData.shadowIndex?.length??g.index.count)/3;
  return g;
};

function fixture(extent=48) {
  const scene=new THREE.Scene(), light=new THREE.DirectionalLight(), camera=new THREE.PerspectiveCamera(58,667/375,0.12,520);
  light.position.set(-30,92,34); light.castShadow=true; light.shadow.mapSize.set(1024,1024);
  Object.assign(light.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,near:1,far:150});
  light.shadow.camera.updateProjectionMatrix(); scene.add(light,light.target);
  const calls=[];
  const noop=()=>{};
  const renderer={getRenderTarget:()=>null,getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,
    state:{setBlending:noop,setScissorTest:noop,viewport:noop,buffers:{depth:{getReversed:()=>false,setTest:noop},color:{setClear:noop}}},
    setRenderTarget:noop,clear:noop,localClippingEnabled:false,
    renderBufferDirect:(cam,sc,g,m,o,group)=>calls.push({object:o,geometry:g,side:m.side,count:Math.min(g.index?.count ?? g.attributes.position.count,g.drawRange.count),group}),
  };
  const shadow=new WebGLShadowMap(renderer,{update:o=>{if(o.isSkinnedMesh)o.skeleton.update();return o.geometry;}},{maxTextureSize:4096});
  shadow.enabled=true; shadow.type=THREE.PCFSoftShadowMap;
  const capture=()=>{calls.length=0;scene.updateMatrixWorld(true);shadow.render([light],scene,camera);return [...calls];};
  const follow=(x,y,z)=>{light.position.set(x-30,y+92,z+34);light.target.position.set(x,y,z);};
  return {scene,light,camera,capture,follow};
}

function shaderVertex(mesh,i,out) {
  const g=mesh.geometry;
  out.fromBufferAttribute(g.attributes.position,i);
  if(g.morphAttributes.position && mesh.morphTargetInfluences){
    const base=out.clone();
    for(let n=0;n<g.morphAttributes.position.length;n++){
      const p=new THREE.Vector3().fromBufferAttribute(g.morphAttributes.position[n],i);
      if(!g.morphTargetsRelative)p.sub(base);
      out.addScaledVector(p,mesh.morphTargetInfluences[n]);
    }
  }
  if(mesh.isSkinnedMesh){
    const v=new THREE.Vector4(out.x,out.y,out.z,1).applyMatrix4(mesh.bindMatrix), skinned=new THREE.Vector4(0,0,0,0);
    const si=g.attributes.skinIndex, sw=g.attributes.skinWeight, m=new THREE.Matrix4();
    for(let k=0;k<4;k++){
      const bone=si.array[i*4+k], weight=sw.array[i*4+k];
      if(weight)skinned.add(v.clone().applyMatrix4(m.fromArray(mesh.skeleton.boneMatrices,bone*16)).multiplyScalar(weight));
    }
    skinned.applyMatrix4(mesh.bindMatrixInverse);out.set(skinned.x,skinned.y,skinned.z);
  }
  return out.applyMatrix4(mesh.matrixWorld);
}

function compare(batches,calls) {
  let maxVertexError=0,vertices=0,missing=0,indexErrors=0;
  for(const call of calls){
    const o=call.object, pack=batches.owned.get(o)?.pack;
    if(!pack){missing++;continue;}
    const g=o.geometry, v=new THREE.Vector3(), p=new THREE.Vector3();
    if(o.isSkinnedMesh)o.skeleton.update();
    assert.equal(pack.position.length,g.attributes.position.count*3);
    for(let i=0;i<g.attributes.position.count;i++){
      shaderVertex(o,i,v);p.fromArray(pack.position,i*3);
      maxVertexError=Math.max(maxVertexError,v.distanceTo(p));vertices++;
    }
    const expectedIndex=g.userData.shadowIndex??g.index.array;
    const expectedCount=Math.min(expectedIndex.length,g.drawRange.count);
    assert.equal(pack.index.length,expectedCount*(call.side===THREE.DoubleSide?2:1));
    for(let i=0;i<expectedCount;i++)if(pack.index[i]!==expectedIndex[i])indexErrors++;
  }
  return {vertices,maxVertexError,missing,indexErrors};
}

// Run unchanged installed renderer list selection and submission methods with
// GL commands recorded, without creating a browser or rendering context.
function colourSubmissions(scene,camera){
  const src=fs.readFileSync(new URL('./survival/node_modules/three/src/renderers/WebGLRenderer.js',import.meta.url),'utf8');
  const ps=src.indexOf('function projectObject('),pe=src.indexOf('\n\t\tfunction renderScene(',ps);
  const rs=src.indexOf('this.renderBufferDirect = function'),re=src.indexOf('\n\t\t};',rs)+'\n\t\t};'.length;
  const pv=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  const frustum=new THREE.Frustum().setFromProjectionMatrix(pv),list=[];
  const project=new Function('_frustum','objects','currentRenderList','currentRenderState','_vector4','_projScreenMatrix',src.slice(ps,pe)+'\nreturn projectObject;')
    (frustum,{update:o=>o.geometry},{push:(...args)=>list.push(args)},{pushLight(){},pushShadow(){}},new THREE.Vector4(),pv);
  const gl={TRIANGLES:4,UNSIGNED_INT:5125,UNSIGNED_SHORT:5123,drawElements(){},drawArrays(){}};
  const info=WebGLInfo(gl),ib=new WebGLIndexedBufferRenderer(gl,{},info),b=new WebGLBufferRenderer(gl,{},info);
  const render=new Function('setProgram','state','bindingStates','attributes','bufferRenderer','indexedBufferRenderer','_gl',src.slice(rs,re)+'\nreturn this.renderBufferDirect;')
    .call({},()=>({}),{setMaterial(){}},{setup(){}},{get:a=>({type:a.array.BYTES_PER_ELEMENT===4?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,bytesPerElement:a.array.BYTES_PER_ELEMENT})},b,ib,gl);
  project(scene,camera,0,false);
  for(const [o,g,m,,,,] of list){o.onBeforeRender();render(camera,scene,g,m,o,null);}
  return {...info.render};
}

const f=fixture();
const city=new City(buildHollisData(),mats,{name:'medium'}).build();
f.scene.add(city.root);
const actorCostumes=process.env.PROBE_ACTORS==='1'?['ren']:['ren','warden','scav','breaker','civ','dog','teo','nessa'];
const actors=actorCostumes.map((costume,i)=>{
  const a=new Actor({name:costume,costume,detail:1,seed:41+i,mats,weapon:i===5?null:'prybar',world:city.collision,gas:city.gas,x:i*2,z:0});
  f.scene.add(a.group);return a;
});
const vantages=[['stacks_yard',-112,1.7,-78,0,-4],['marrow_mid',-30,1.7,2,270,-3],['slip_edge',-76,1.7,0,270,-14],['marrow_roof',-60,11.4,-16,90,-6],['cut_trench',74,1.7,24,0,-10],['ventfield',84,1.7,-66,270,-3],['south_marrow',-60,1.7,52,270,-3],['combat',-112,1.7,-84,0,-3]];
const hashes=Object.fromEntries(['src/world/geom.js','src/world/city.js','src/world/collision.js','src/render/shadow_batches.js','src/game/game.js','src/render/atmosphere.js'].map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL('./survival/'+p,import.meta.url))).digest('hex')]));
const results={environment:{node:process.version,three:THREE.REVISION,renderer:'installed WebGLShadowMap with recording renderBufferDirect; no WebGL context or pixels',materials:'opaque shadow-equivalent substitutes; signs use inert canvas',actorCostumes,productPerformance:'not measured; Node timings are source CPU diagnostics only'},sourceHashes:hashes,planarChecks,world:city.stats,vantages:[],poses:[],edgeCases:{},lifecycle:{}};
const batches=new ShadowBatches(f.scene);
for(const [name,x,y,z,yaw,pitch] of vantages){
  batches.setEnabled(false);f.follow(x,y,z);
  for(let i=0;i<actors.length;i++){actors[i].group.position.set(x+i*2,y,z);actors[i].pos.copy(actors[i].group.position);}
  const cameraRig=new ThirdPersonCamera(f.camera,city.collision);cameraRig.yaw=yaw*Math.PI/180;cameraRig.pitch=pitch*Math.PI/180;cameraRig._manualT=999;
  for(let n=0;n<80;n++)cameraRig.update(1/60,actors[0]);
  city.updateVisibility(f.camera.position.x,f.camera.position.z,104);
  f.camera.updateMatrixWorld(true);
  const source=f.capture();batches.setEnabled(true);batches.update(f.light,f.camera);
  const proxy=f.capture(); const checks=compare(batches,source);
  assert.equal(checks.missing,0);assert.equal(checks.indexErrors,0);assert.ok(checks.maxVertexError<0.00005);
  const colour=colourSubmissions(f.scene,f.camera);
  results.vantages.push({name,sourceShadowDraws:source.length,proxyShadowDraws:proxy.length,...batches.stats,...checks,colourSubmissions:colour,sourceSceneTotalTriangles:colour.triangles+batches.stats.staticTriangles+batches.stats.dynamicTriangles,sourceSceneTotalDraws:colour.calls+proxy.length});
}
for(const clip of ['atk1','heavy','dodge','death','throw'].filter(k=>CLIPS[k])){
  for(const actor of actors)actor.animator.play(clip,{fade:0,force:true});
  for(let n=0;n<3;n++){
    for(const actor of actors)actor.animator.update(CLIPS[clip].dur/4);
    batches.setEnabled(false);const source=f.capture();batches.setEnabled(true);batches.update(f.light,f.camera);const check=compare(batches,source);
    assert.equal(check.missing,0);assert.ok(check.maxVertexError<0.00005);
    results.poses.push({clip,phase:(n+1)/4,...check});
  }
}
const timings=[];
let dynamicAllocatedBytes=0;
const seenDynamicArrays=new WeakSet();
for(const p of batches.dynamic.packs){seenDynamicArrays.add(p.position);seenDynamicArrays.add(p.index);}
for(let n=0;n<120;n++){
  for(const a of actors){a.animator.locomotion.speed=3.5;a.animator.update(1/60);}
  batches.update(f.light,f.camera);timings.push(batches.stats.prepareMs);
  for(const p of batches.dynamic.packs)for(const a of [p.position,p.index])if(!seenDynamicArrays.has(a)){seenDynamicArrays.add(a);dynamicAllocatedBytes+=a.byteLength;}
}
timings.sort((a,b)=>a-b);
results.nodePrepareTiming={samples:timings.length,p50:timings[60],p95:timings[114],max:timings.at(-1),dynamicPackTypedArrayBytesPerUpdate:dynamicAllocatedBytes/120,frameBudgetMs:8};

// Visibility after ownership, scene removal, re-addition, and morph refresh.
const actor=actors[0];actor.group.visible=false;batches.update(f.light,f.camera);
results.edgeCases.hiddenActorPackIncluded=batches.dynamic.packs.includes(batches.owned.get(actor.mesh)?.pack);
f.scene.remove(actor.group);batches.update(f.light,f.camera);
results.edgeCases.removedActorOwned=batches.owned.has(actor.mesh);
actor.group.visible=true;f.scene.add(actor.group);batches.update(f.light,f.camera);
results.edgeCases.readdedActorIncluded=batches.dynamic.packs.includes(batches.owned.get(actor.mesh)?.pack);
const mf=fixture(),g=new THREE.BoxGeometry(1,1,1);
g.morphAttributes.position=[g.attributes.position.clone()];for(let i=0;i<g.attributes.position.count;i++)g.morphAttributes.position[0].setY(i,g.attributes.position.getY(i)+0.7);
const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial());mesh.castShadow=true;mf.scene.add(mesh);const mb=new ShadowBatches(mf.scene);mb.update(mf.light,mf.camera);mesh.morphTargetInfluences[0]=0.75;mb.update(mf.light,mf.camera);
results.edgeCases.morphYDelta=mb.owned.get(mesh).pack.position[1]-g.attributes.position.getY(0);
assert.ok(Math.abs(results.edgeCases.morphYDelta-0.525)<1e-6);

// Actual WebGLGeometries/WebGLObjects lifecycle with tracked buffer ownership.
const tracked=new Set(),removed=[],gl={ARRAY_BUFFER:34962},info=WebGLInfo({TRIANGLES:4});
const attrs={update:a=>tracked.add(a),remove:a=>{removed.push(a);tracked.delete(a);}};
const gs=WebGLGeometries(gl,attrs,info,{releaseStatesOfGeometry:()=>{}}), os=WebGLObjects(gl,gs,attrs,info);
os.update(mb.static.mesh);os.update(mb.dynamic.mesh);const old=mb.dynamic.mesh.geometry.attributes.position;
const larger=new THREE.Mesh(new THREE.SphereGeometry(2,32,16),new THREE.MeshStandardMaterial());larger.castShadow=true;larger.name='large';mf.scene.add(larger);mb.update(mf.light,mf.camera);info.render.frame++;os.update(mb.static.mesh);os.update(mb.dynamic.mesh);
results.lifecycle.geometryMemoryAfterGrowth=info.memory.geometries;
mb.dispose();results.lifecycle.geometryMemoryAfterDispose=info.memory.geometries;results.lifecycle.trackedAttributesAfterDispose=tracked.size;
assert.equal(info.memory.geometries,0);assert.equal(tracked.size,0);
fs.writeFileSync(`/workspace/scratch/0b7ad82bafe7/shadow-batch-source-probe-planar${actors.length===1?'-one-actor':''}.json`,JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
