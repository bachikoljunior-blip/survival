import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ShadowBatches } from '../src/render/shadow_batches.js';
import { MeshBuilder } from '../src/world/geom.js';

function fixture() {
  const scene = new THREE.Scene();
  const light = new THREE.DirectionalLight();
  light.position.set(0, 12, 0); light.target.position.set(0, 0, 0);
  Object.assign(light.shadow.camera, {left:-10,right:10,top:10,bottom:-10,near:0.1,far:30});
  light.shadow.camera.updateProjectionMatrix();
  scene.add(light, light.target);
  const camera = new THREE.PerspectiveCamera();
  const batches = new ShadowBatches(scene);
  const update = () => batches.update(light, camera);
  return {scene,light,camera,batches,update};
}

function cube(parent, x = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial());
  mesh.position.set(x,0,0); mesh.castShadow=true; parent.add(mesh); return mesh;
}

test('same transformed triangles are retained while hidden and distant objects are excluded', () => {
  const f=fixture(), a=cube(f.scene); a.rotation.y=0.37; a.position.set(1,0,2);
  const hidden=new THREE.Group(); hidden.visible=false; f.scene.add(hidden); cube(hidden);
  cube(f.scene,100);
  f.update();
  assert.equal(f.batches.stats.staticSources,1);
  const packed=f.batches.static.mesh.geometry;
  assert.equal(f.batches.static.count,a.geometry.index.count);
  for(let i=0;i<a.geometry.attributes.position.count;i++) {
    const expected=a.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(a.matrixWorld);
    const actual=new THREE.Vector3().fromBufferAttribute(packed.attributes.position,i);
    assert.ok(expected.distanceTo(actual)<1e-6);
  }
  assert.equal(a.castShadow,false);
  a.position.x+=2; f.update();
  assert.equal(f.batches.static.mesh.geometry.attributes.position.getX(0),Math.fround(a.getVertexPosition(0,new THREE.Vector3()).applyMatrix4(a.matrixWorld).x));
  f.batches.setEnabled(false); assert.equal(a.castShadow,true);
  assert.equal(f.batches.static.mesh.visible,false);
});

test('moving skinned bodies and held props use the current actual bone transforms', () => {
  const f=fixture(), actor=new THREE.Group(); actor.name='actor:test'; f.scene.add(actor);
  const g=new THREE.BoxGeometry(1,1,1), n=g.attributes.position.count;
  g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(n*4),4));
  const weights=new Float32Array(n*4); for(let i=0;i<n;i++)weights[i*4]=1;
  g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const bone=new THREE.Bone(), body=new THREE.SkinnedMesh(g,new THREE.MeshStandardMaterial());
  body.add(bone); body.bind(new THREE.Skeleton([bone])); body.castShadow=true; actor.add(body);
  const held=cube(bone); held.position.x=1.2;
  f.update();
  assert.equal(f.batches.stats.dynamicSources,2);
  const before=f.batches.dynamic.mesh.geometry.attributes.position.getY(0);
  bone.position.y=0.45; actor.position.x=2; f.update();
  assert.ok(Math.abs(f.batches.dynamic.mesh.geometry.attributes.position.getY(0)-before-0.45)<1e-6);
  const actual=new THREE.Vector3().fromBufferAttribute(f.batches.dynamic.mesh.geometry.attributes.position,0);
  const expected=body.getVertexPosition(0,new THREE.Vector3()).applyMatrix4(body.matrixWorld);
  assert.ok(actual.distanceTo(expected)<1e-6);
  f.scene.remove(actor); f.update();
  assert.equal(f.batches.stats.dynamicSources,0);
  assert.equal(f.batches.dynamic.mesh.visible,false);
  assert.equal(f.batches.owned.has(body),false);
});

test('instance count and changed matrices update the actual retained silhouettes', () => {
  const f=fixture(), mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial(),2);
  mesh.castShadow=true;mesh.setMatrixAt(0,new THREE.Matrix4().makeTranslation(-2,0,0));
  mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(2,0,0));f.scene.add(mesh);f.update();
  assert.equal(f.batches.static.count,72);
  const n=mesh.geometry.attributes.position.count;
  const before=f.batches.static.mesh.geometry.attributes.position.getZ(n);
  mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(2,0,1));mesh.instanceMatrix.needsUpdate=true;f.update();
  assert.equal(f.batches.static.mesh.geometry.attributes.position.getZ(n),before+1);
  mesh.count=1;f.update();assert.equal(f.batches.static.count,36);
});

test('winding preserves side choices and negative object transforms', () => {
  for(const side of [THREE.FrontSide,THREE.BackSide,THREE.DoubleSide]) {
    for(const scale of [1,-1]) {
      const f=fixture(), mesh=cube(f.scene);mesh.material.side=side;mesh.scale.x=scale;f.update();
      const original=mesh.geometry.index.array, actual=f.batches.static.mesh.geometry.index.array;
      const reverse=(side===THREE.BackSide)!==(scale<0);
      assert.deepEqual([...actual.slice(0,3)],[original[0],original[reverse?2:1],original[reverse?1:2]]);
      assert.equal(f.batches.static.count,side===THREE.DoubleSide?72:36);
    }
  }
});

test('material sampling and custom depth paths retain their original casters', () => {
  const f=fixture(), sampled=cube(f.scene);sampled.material.alphaTest=0.5;
  const custom=cube(f.scene,2);custom.customDepthMaterial=new THREE.MeshDepthMaterial();
  const supported=cube(f.scene,-2);f.update();
  assert.equal(sampled.castShadow,true);assert.equal(custom.castShadow,true);
  assert.equal(f.batches.stats.unsupportedSources,2);
  supported.material.alphaTest=0.5;f.update();
  assert.equal(supported.castShadow,true);assert.equal(f.batches.static.mesh.visible,false);
});

test('the shadow proxy emits no colour triangles and cannot intercept a ray pick', () => {
  const f=fixture();cube(f.scene);f.update();const mesh=f.batches.static.mesh;
  mesh.onBeforeShadow();assert.equal(mesh.geometry.drawRange.count,36);
  mesh.onBeforeRender();assert.equal(mesh.geometry.drawRange.count,0);
  mesh.onBeforeShadow();assert.equal(mesh.geometry.drawRange.count,36);
  const hits=[];mesh.raycast(new THREE.Raycaster(),hits);assert.deepEqual(hits,[]);
  f.batches.dispose();assert.equal(mesh.parent,null);
});

test('planar depth indices preserve mixed primitive surfaces and translated appends', () => {
  const source=new MeshBuilder();
  source.boxRot({x:0,y:0,z:0,w:8,h:4,d:6,rot:0.37,tilt:0.08,aoCell:0.5});
  source.cylinder(6,0,0,1.2,3,12);
  const extension=new MeshBuilder();extension.plane(0,-0.2,0,22,18,1,[1,1,1],true,0.7);
  source.append(extension,1,0,1);
  const g=source.build(), compact=g.clone();compact.setIndex(new THREE.BufferAttribute(g.userData.shadowIndex,1));
  assert.ok(compact.index.count<g.index.count/4);
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const original=new THREE.Mesh(g,material), reduced=new THREE.Mesh(compact,material);
  original.updateMatrixWorld();reduced.updateMatrixWorld();
  let matches=0;
  for(let x=-9;x<10;x+=0.71) for(let z=-7;z<8;z+=0.83) {
    const ray=new THREE.Raycaster(new THREE.Vector3(x,8,z),new THREE.Vector3(0,-1,0));
    const a=ray.intersectObject(original)[0],b=ray.intersectObject(reduced)[0];
    assert.equal(!!a,!!b);
    if(a) {assert.ok(a.point.distanceTo(b.point)<1e-5);matches++;}
  }
  assert.ok(matches>300);
  // The colour mesh and its AO grid are retained. Only the depth index differs.
  assert.equal(g.index.count,source.idx.length);
  assert.deepEqual([...g.index.array],source.idx);
});
