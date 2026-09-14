import assert from 'node:assert/strict';
import * as THREE from './survival/node_modules/three/build/three.module.js';
import { MeshBuilder, FACE } from './survival/src/world/geom.js';
import { City } from './survival/src/world/city.js';
import { buildHollisData } from './survival/src/content/world_data.js';

const stats={builders:0,faces:0,originalTriangles:0,shadowTriangles:0,appendedFixtures:0};
function boundary(indices) {
  const edges=new Map();
  for(let i=0;i<indices.length;i+=3)for(const [a,b] of [[indices[i],indices[i+1]],[indices[i+1],indices[i+2]],[indices[i+2],indices[i]]]) {
    const forward=`${a}:${b}`,reverse=`${b}:${a}`;
    if(edges.has(reverse))edges.delete(reverse);
    else {assert.equal(edges.has(forward),false,'same directed edge twice');edges.set(forward,[a,b]);}
  }
  const next=new Map();for(const [a,b] of edges.values()){assert.equal(next.has(a),false,'branched boundary');next.set(a,b);}
  const start=next.keys().next().value,ring=[];let cur=start;
  do{ring.push(cur);const dest=next.get(cur);assert.notEqual(dest,undefined,'open boundary');next.delete(cur);cur=dest;}while(cur!==start);
  assert.equal(next.size,0,'more than one boundary loop');return ring;
}
const point=(pos,i)=>new THREE.Vector3().fromArray(pos,i*3);
function corners(ring,pos) {
  const keep=[];
  for(let i=0;i<ring.length;i++) {
    const a=point(pos,ring[(i+ring.length-1)%ring.length]),b=point(pos,ring[i]),c=point(pos,ring[(i+1)%ring.length]);
    const u=b.clone().sub(a),v=c.clone().sub(b);
    if(u.lengthSq()===0||v.lengthSq()===0)continue;
    if(u.clone().cross(v).length()>1e-7*u.length()*v.length()||u.dot(v)<0)keep.push(ring[i]);
  }
  return keep;
}
function verify(builder,g) {
  stats.builders++;let last=0,output=0;
  assert.deepEqual([...g.index.array],builder.idx,'colour indices changed');
  for(const face of builder.shadowFaces) {
    assert.ok(face.start>=last&&face.start%3===0&&face.count%3===0&&face.start+face.count<=builder.idx.length,'overlapping or invalid metadata span');
    assert.equal(face.indices.length,6);
    for(const index of face.indices)assert.ok(Number.isInteger(index)&&index>=0&&index<builder.vertCount,'corner out of range');
    const full=builder.idx.slice(face.start,face.start+face.count);
    const originalRing=corners(boundary(full),builder.pos),shadowRing=corners(boundary(face.indices),builder.pos);
    assert.equal(originalRing.length,shadowRing.length,'boundary corner count changed');
    assert.ok(originalRing.length===4||originalRing.length===0,'unexpected original outline');
    if(originalRing.length) {
      assert.ok(shadowRing.some((_,offset)=>originalRing.every((index,i)=>point(builder.pos,index).distanceTo(point(builder.pos,shadowRing[(offset+i)%shadowRing.length]))<1e-10)),'outline or winding changed');
      const a=point(builder.pos,shadowRing[0]),b=point(builder.pos,shadowRing[1]),d=point(builder.pos,shadowRing[3]);
      const normal=b.clone().sub(a).cross(d.clone().sub(a)).normalize();
      const scale=Math.max(1,b.distanceTo(a),d.distanceTo(a));
      for(const index of new Set(full))assert.ok(Math.abs(point(builder.pos,index).sub(a).dot(normal))<scale*1e-7,'nonplanar original face simplified');
      for(let i=0;i<full.length;i+=3) {
        const p=point(builder.pos,full[i]),q=point(builder.pos,full[i+1]),r=point(builder.pos,full[i+2]);
        assert.ok(q.sub(p).cross(r.sub(p)).dot(normal)>=-1e-9,'original triangle winding differs');
      }
    }
    for(let i=last;i<face.start;i++)assert.equal(g.userData.shadowIndex[output++],builder.idx[i],'nonplanar primitive gap changed');
    for(const index of face.indices)assert.equal(g.userData.shadowIndex[output++],index,'metadata corner mapping changed');
    last=face.start+face.count;stats.faces++;
  }
  if(builder.shadowFaces.length) {
    for(let i=last;i<builder.idx.length;i++)assert.equal(g.userData.shadowIndex[output++],builder.idx[i],'nonplanar primitive tail changed');
    assert.equal(output,g.userData.shadowIndex.length,'extra or missing simplified indices');
  }
  stats.originalTriangles+=builder.idx.length/3;
  stats.shadowTriangles+=(g.userData.shadowIndex?.length??builder.idx.length)/3;
}
const originalBuild=MeshBuilder.prototype.build;
MeshBuilder.prototype.build=function(...args){const g=originalBuild.apply(this,args);verify(this,g);return g;};

// Each mask preserves deliberate openings; up/down planes and affine rotation
// check the orientation independently of aggregate surface-area cancellation.
for(let mask=1;mask<=FACE.ALL;mask++)new MeshBuilder().boxRot({x:13.5,y:3.2,z:-6.9,w:7.4,h:6.7,d:8.5,aoCell:0.8,maxSeg:8,faces:mask,rot:0.731,tilt:0.263}).build();
for(const up of [true,false])new MeshBuilder().plane(3,2,-5,17,13,0.5,[1,1,1],up,0.7).build();
const mixed=new MeshBuilder();
mixed.cylinder(1,2,3,0.9,3,7).box({x:6,y:1,z:2,w:8,h:9,d:7,aoCell:0.7});
mixed.prism([[0,0],[3,0],[4,2],[0,3]],0,4).plane(-8,2,1,11,12,0.5,[1,1,1],false,1);
mixed.face4([0,8,0],[3,7,0],[3,7,4],[0,8,4]);
const appended=new MeshBuilder().box({x:0,y:0,z:0,w:2,h:4,d:3}).append(mixed,41,-2,17).cylinder(-2,1,-2,0.7,2,9).append(mixed,-17,9,-33);
const nested=new MeshBuilder().cylinder(0,0,0,1,1,8).append(appended,13,2,-9).box({x:20,y:1,z:20,w:12,h:7,d:9});
mixed.build();appended.build();nested.build();stats.appendedFixtures=2;

const ctx=new Proxy({measureText:()=>({width:6})},{get:(t,k)=>t[k]??(()=>{}),set:(t,k,v)=>(t[k]=v,true)});
globalThis.document={createElement:()=>({getContext:()=>ctx})};
const materials=new Map(),mat=key=>{if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial());return materials.get(key);};
const mats={get:k=>mat(k),flat:c=>mat(`flat:${c}`),glowShared:()=>mat('glow'),character:c=>mat(`char:${c}`),get count(){return materials.size;}};
const beforeCity={...stats};new City(buildHollisData(),mats,{name:'medium'}).build();
const cityOnly=Object.fromEntries(Object.entries(stats).map(([key,value])=>[key,value-(beforeCity[key]??0)]));
console.log(JSON.stringify({method:'Each metadata span preserves one closed oriented boundary and coplanarity; uncovered index spans and colour indices are unchanged. Actual City builders plus all nonempty face masks, both plane sides, rotation/tilt, mixed primitives, translated and nested append.',total:stats,cityOnly},null,2));
