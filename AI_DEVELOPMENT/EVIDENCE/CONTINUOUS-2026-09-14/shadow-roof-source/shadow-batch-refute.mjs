import fs from 'node:fs';
import * as THREE from './survival/node_modules/three/build/three.module.js';
import { ShadowBatches } from './survival/src/render/shadow_batches.js';
import { WebGLIndexedBufferRenderer } from './survival/node_modules/three/src/renderers/webgl/WebGLIndexedBufferRenderer.js';
import { WebGLInfo } from './survival/node_modules/three/src/renderers/webgl/WebGLInfo.js';

function fixture() {
  const scene = new THREE.Scene(), light = new THREE.DirectionalLight(), camera = new THREE.PerspectiveCamera();
  light.position.set(0, 12, 0); light.target.position.set(0, 0, 0);
  Object.assign(light.shadow.camera, {left:-10,right:10,top:10,bottom:-10,near:0.1,far:30});
  light.shadow.camera.updateProjectionMatrix(); scene.add(light, light.target);
  const batches = new ShadowBatches(scene), actor = new THREE.Group(); actor.name = 'actor:refutation'; scene.add(actor);
  const cube = parent => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());
    mesh.castShadow = true; parent.add(mesh); return mesh;
  };
  const staticSource = cube(scene), dynamicSource = cube(actor);
  const update = () => batches.update(light,camera); update();
  return {scene,light,camera,batches,staticSource,dynamicSource,update};
}

const f = fixture(), glCalls = [];
const gl = {TRIANGLES:4,UNSIGNED_INT:5125,drawElements(...args){glCalls.push(args);}};
const info = WebGLInfo(gl), indexedBufferRenderer = new WebGLIndexedBufferRenderer(gl,{},info);
const source = fs.readFileSync(new URL('./survival/node_modules/three/src/renderers/WebGLRenderer.js',import.meta.url),'utf8');
const start = source.indexOf('this.renderBufferDirect = function');
const end = source.indexOf('\n\t\t};',start) + '\n\t\t};'.length;
if (start < 0 || end < start) throw new Error('renderBufferDirect extraction failed');
const exactMethod = source.slice(start,end);
const state = {setMaterial(){}}, bindingStates = {setup(){}};
const attributes = {get(){return {type:gl.UNSIGNED_INT,bytesPerElement:4};}};
const renderBufferDirect = new Function('setProgram','state','bindingStates','attributes','bufferRenderer','indexedBufferRenderer','_gl',exactMethod+'\nreturn this.renderBufferDirect;')
  .call({},()=>({}),state,bindingStates,attributes,{},indexedBufferRenderer,gl);
for (const batch of [f.batches.static,f.batches.dynamic]) {
  const mesh = batch.mesh;
  mesh.onBeforeRender(); renderBufferDirect(f.camera,f.scene,mesh.geometry,mesh.material,mesh,null);
}
const zeroDraw = {
  sourceVersion:THREE.REVISION,
  visibleBatches:[f.batches.static.mesh.visible,f.batches.dynamic.mesh.visible],
  sourceCounts:[f.batches.stats.staticSources,f.batches.stats.dynamicSources],
  glCalls,rendererCalls:info.render.calls,triangles:info.render.triangles,
};
const g = fixture(); g.staticSource.castShadow = false; g.update();
const afterExplicitFalse = {castShadow:g.staticSource.castShadow,stillOwned:g.batches.owned.has(g.staticSource),staticSources:g.batches.stats.staticSources,staticIndices:g.batches.static.count};
g.batches.setEnabled(false);
const afterDisable = {castShadow:g.staticSource.castShadow,owned:g.batches.owned.has(g.staticSource)};
const h = fixture(); h.staticSource.castShadow = false; h.scene.remove(h.staticSource); h.update();
const afterRemoval = {castShadow:h.staticSource.castShadow,owned:h.batches.owned.has(h.staticSource),staticSources:h.batches.stats.staticSources};
h.scene.add(h.staticSource); h.update();
const afterReaddition = {castShadow:h.staticSource.castShadow,owned:h.batches.owned.has(h.staticSource),staticSources:h.batches.stats.staticSources};
const j = fixture(); j.staticSource.castShadow = false; j.staticSource.material.alphaTest = 0.5; j.update();
const afterUnsupported = {castShadow:j.staticSource.castShadow,owned:j.batches.owned.has(j.staticSource),unsupported:j.batches.stats.unsupportedSources};
console.log(JSON.stringify({zeroDraw,ownership:{afterExplicitFalse,afterDisable,afterRemoval,afterReaddition,afterUnsupported}},null,2));
