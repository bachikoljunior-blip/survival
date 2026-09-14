import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from './survival/node_modules/three/build/three.module.js';
import { ShadowBatches } from './survival/src/render/shadow_batches.js';
import { WebGLShadowMap } from './survival/node_modules/three/src/renderers/webgl/WebGLShadowMap.js';
import { WebGLInfo } from './survival/node_modules/three/src/renderers/webgl/WebGLInfo.js';
import { WebGLIndexedBufferRenderer } from './survival/node_modules/three/src/renderers/webgl/WebGLIndexedBufferRenderer.js';
import { WebGLBufferRenderer } from './survival/node_modules/three/src/renderers/webgl/WebGLBufferRenderer.js';
import { City } from './survival/src/world/city.js';
import { buildHollisData } from './survival/src/content/world_data.js';
import { Player, ThirdPersonCamera } from './survival/src/actors/player.js';

const ctx = new Proxy({measureText:()=>({width:6})},{get:(t,k)=>t[k]??(()=>{}),set:(t,k,v)=>(t[k]=v,true)});
globalThis.document = {createElement:()=>({getContext:()=>ctx})};
const materials = new Map();
function standard(key, opts={}) {
  if (!materials.has(key)) materials.set(key,new THREE.MeshStandardMaterial({
    side:opts.side??THREE.FrontSide,transparent:opts.transparent??false,opacity:opts.opacity??1,
  }));
  return materials.get(key);
}
const mats = {
  get:(kind,opts)=>standard(`${kind}|${JSON.stringify(opts)}`,opts),
  flat:(color,opts)=>standard(`flat:${color}|${JSON.stringify(opts)}`,opts),
  character:(color,opts)=>standard(`char:${color}|${JSON.stringify(opts)}`),
  glowShared:()=>standard('glowShared'),
  glow:(color,intensity,opts)=>standard(`glow:${color}:${intensity}|${JSON.stringify(opts)}`,opts),
  get count(){return materials.size;},
};
const city = new City(buildHollisData(),mats,{name:'medium'}).build();
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(58,667/375,0.12,520);
const light = new THREE.DirectionalLight(); light.castShadow=true; light.shadow.mapSize.set(1024,1024);
Object.assign(light.shadow.camera,{left:-48,right:48,top:48,bottom:-48,near:1,far:150});
light.shadow.camera.updateProjectionMatrix(); scene.add(city.root,light,light.target);
// Real player drives the real camera but stays OUT of the scene: this count is
// a lower bound containing City geometry only, with no actor, sky, effects/post.
const player = new Player({mats,world:city.collision,gas:city.gas,seed:41});
const source = fs.readFileSync(new URL('./survival/node_modules/three/src/renderers/WebGLRenderer.js',import.meta.url),'utf8');
function section(startText,endText) {
  const start=source.indexOf(startText),end=source.indexOf(endText,start);
  assert.ok(start>=0&&end>start);return source.slice(start,end);
}
const renderDirectText=section('this.renderBufferDirect = function','\n\t\t// Compile');
const renderObjectText=section('function renderObject( object, scene, camera, geometry, material, group )','\n\t\tfunction getProgram(');
const projectText=section('function projectObject(','\n\t\tfunction renderScene(');
const glCalls=[];
const gl={TRIANGLES:4,UNSIGNED_INT:5125,UNSIGNED_SHORT:5123,
  drawElements:(...args)=>glCalls.push({fn:'drawElements',count:args[1]}),
  drawArrays:(...args)=>glCalls.push({fn:'drawArrays',count:args[2]}),
  drawElementsInstanced:(...args)=>glCalls.push({fn:'drawElementsInstanced',count:args[1],instances:args[4]}),
  drawArraysInstanced:(...args)=>glCalls.push({fn:'drawArraysInstanced',count:args[2],instances:args[3]}),
};
const info=WebGLInfo(gl),ib=new WebGLIndexedBufferRenderer(gl,{},info),b=new WebGLBufferRenderer(gl,{},info);
const noop=()=>{};
const state={setMaterial:noop,setBlending:noop,setScissorTest:noop,viewport:noop,
  buffers:{depth:{getReversed:()=>false,setTest:noop},color:{setClear:noop}}};
const renderer={info,state,getRenderTarget:()=>null,getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,
  setRenderTarget:noop,clear:noop,localClippingEnabled:false};
renderer.renderBufferDirect=new Function('setProgram','state','bindingStates','attributes','bufferRenderer','indexedBufferRenderer','_gl','_emptyScene',renderDirectText+'\nreturn this.renderBufferDirect;')
  .call({},()=>({}),state,{setup(){}},{get:a=>({type:a.array.BYTES_PER_ELEMENT===4?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,bytesPerElement:a.array.BYTES_PER_ELEMENT})},b,ib,gl,new THREE.Scene());
const renderObject=new Function('_this','DoubleSide','BackSide','FrontSide',renderObjectText+'\nreturn renderObject;')
  (renderer,THREE.DoubleSide,THREE.BackSide,THREE.FrontSide);
const objects={update:o=>o.geometry};
const shadow=new WebGLShadowMap(renderer,objects,{maxTextureSize:4096});
shadow.enabled=true;shadow.autoUpdate=false;shadow.type=THREE.PCFSoftShadowMap;
function colour() {
  const pv=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  const frustum=new THREE.Frustum().setFromProjectionMatrix(pv,THREE.WebGLCoordinateSystem,camera.reversedDepth),list=[];
  const project=new Function('_frustum','objects','currentRenderList','currentRenderState','_vector4','_projScreenMatrix',projectText+'\nreturn projectObject;')
    (frustum,objects,{push:(...args)=>list.push(args)},{pushLight(){},pushShadow(){}},new THREE.Vector4(),pv);
  project(scene,camera,0,false);
  info.reset();glCalls.length=0;
  for(const [o,g,m,,,group] of list)renderObject(o,scene,camera,g,m,group);
  return {...info.render,queuedGroups:list.filter(row=>row[5]!==null).length,
    transparentDoubleSided:list.filter(row=>row[2].transparent&&row[2].side===THREE.DoubleSide).length};
}
function shadowCount(refresh) {
  info.reset();glCalls.length=0;shadow.needsUpdate=refresh;shadow.render([light],scene,camera);
  return {...info.render};
}
const batches=new ShadowBatches(scene),results=[];
for(const y of [11.4,10.1]) {
  batches.setEnabled(false);player.placeAt(-60,y,-16);
  const rig=new ThirdPersonCamera(camera,city.collision);rig.yaw=Math.PI/2;rig.pitch=-6*Math.PI/180;rig._manualT=999;
  for(let n=0;n<80;n++)rig.update(1/60,player);
  camera.updateMatrixWorld(true);
  light.position.set(player.pos.x-30,player.pos.y+92,player.pos.z+34);light.target.position.copy(player.pos);
  city.updateVisibility(camera.position.x,camera.position.z,104);scene.updateMatrixWorld(true);
  const nativeShadow=shadowCount(true),nativeColour=colour();
  batches.setEnabled(true);batches.update(light,camera);
  const batchShadow=shadowCount(true),batchColour=colour();
  const stableSecondFrame=shadowCount(true),noRefresh=shadowCount(false);
  assert.ok(batchShadow.triangles<=nativeShadow.triangles);
  assert.equal(batchColour.triangles,nativeColour.triangles);
  assert.equal(batchColour.queuedGroups,0);
  assert.equal(batchColour.transparentDoubleSided,0);
  assert.equal(stableSecondFrame.triangles,batchShadow.triangles);
  assert.equal(noRefresh.triangles,0);
  results.push({playerPos:player.pos.toArray(),cameraPos:camera.position.toArray(),
    groundUnder:city.collision.groundUnder(-60,-16,0.34,12,5)?.y,
    nativeShadow,nativeColour,batchShadow,batchColour,
    nativeRefreshedTotal:nativeShadow.triangles+nativeColour.triangles,
    batchRefreshedTotal:batchShadow.triangles+batchColour.triangles,
    batchStaticSources:batches.stats.staticSources,
    stableSecondFrameShadowTriangles:stableSecondFrame.triangles,
    skippedShadowTriangles:noRefresh.triangles});
}
console.log(JSON.stringify({environment:'Node with installed Three.js source and recording GL methods; City-only lower bound, no browser or GPU timing',results},null,2));
