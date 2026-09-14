import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NavGrid } from '../src/world/nav.js';
import { GasField } from '../src/world/gas.js';
import { City } from '../src/world/city.js';
import { ChunkBuilder } from '../src/world/geom.js';
import { Rng } from '../src/core/rng.js';
import { buildHollisData } from '../src/content/world_data.js';
import { Director } from '../src/game/director.js';
import { GameState } from '../src/game/state.js';
import { Game, MODE } from '../src/game/game.js';
import { AISystem, ARCHETYPES } from '../src/game/ai.js';

// Authored flat test terrain; the actual A*, smoothing and AI steering run.
function flat(n=21, cell=1) {
  const nav=new NavGrid({}, {minX:0,minZ:0,maxX:n*cell,maxZ:n*cell},cell);
  nav.height.fill(0);nav._floodRegions();return nav;
}
function ventWorld() {
  const data=buildHollisData(), city=new City(data,{},{});
  city.gas=new GasField(-150,-130,160,140);
  for(const p of data.props.filter(p=>p.kind==='vent'&&p.id?.startsWith('vent_west_')))
    city._prop(new ChunkBuilder('test-vent'),p,new Rng(p.id));
  for(const s of data.gasSources.filter(s=>s.id==='yard_seep'))
    city.gas.addSource(s.x,s.z,s.strength,s.radius,s.id,s.active!==false);
  city.gas.bake();
  const markerCalls=[];
  const game={gas:city.gas,city,atmos:{setMarkerActive:(...v)=>markerCalls.push(v),plumes:{setAnchorActive(){}}},hud:{notice(){}}};
  return {city,game,markerCalls};
}
test('authored West Heads really stop emitting when the actual choice hook closes them',()=>{
  const {city,game}=ventWorld(), vents=city.gas.sources.filter(s=>s.id?.startsWith('vent_west_'));
  assert.equal(vents.length,3);
  const before=vents.map(s=>city.gas.sample(s.x+2,1.4,s.z));
  Director.prototype._hooks.call({game}).shutVents();city.gas.update(1/60);
  assert.ok(vents.every(s=>!s.active));
  vents.forEach((s,i)=>assert.ok(city.gas.sample(s.x+2,1.4,s.z)<before[i]*0.2));
  assert.equal(city.gas.sources.find(s=>s.id==='yard_seep').active,true);
});
test('legacy choice flags restore omitted source IDs while explicit source states win',()=>{
  for(const [flag,expected] of [['vents_shut',[false,false,false]],['vents_half',[true,false,true]],['vents_left',[true,true,true]]]){
    const {game}=ventWorld(), state=new GameState();state.set(flag);state.set('unrelated_progress');
    const before=state.serialise();delete before.t;
    Director.prototype._restoreGas.call({game,state},{gasSources:[]});
    assert.deepEqual([1,2,3].map(i=>game.gas.sources.find(s=>s.id===`vent_west_${i}`).active),expected);
    const after=state.serialise();delete after.t;assert.deepEqual(after,before);
    Director.prototype._restoreGas.call({game,state},{gasSources:[['vent_west_2',true]],gasIntensity:1.6});
    assert.equal(game.gas.sources.find(s=>s.id==='vent_west_2').active,true);
    assert.equal(game.gas.globalScale,1.6);
  }
});
test('the live fixed-update path publishes bounded gas refreshes, including later intensity changes',()=>{
  const nav=flat(100),gas=new GasField(0,0,100,100);
  gas.addSource(50,50,100,25,'test',false);gas.bake();nav.applyGasCost(gas);
  const game={time:0,playTime:0,mode:MODE.PLAY,input:{step(){}},gas,nav,actors:[],systems:[],_playerInput(){},_updateZone(){}};
  const before=Array.from(nav.cost), revision=nav.costRevision;
  let samples=0,maxSamples=0;const sample=gas.sample.bind(gas);gas.sample=(...args)=>{samples++;return sample(...args);};
  gas.setSourceActive('test',true);
  Game.prototype.fixedUpdate.call(game,1/60);maxSamples=samples;
  assert.deepEqual(Array.from(nav.cost),before,'no half-published grid');
  for(let i=0;i<3;i++){samples=0;Game.prototype.fixedUpdate.call(game,1/60);maxSamples=Math.max(maxSamples,samples);}
  assert.ok(maxSamples<=4096);assert.ok(nav.costRevision>revision);
  const center=nav.i(50,50), on=nav.cost[center];assert.ok(on>before[center]);
  gas.setIntensity(3);
  for(let i=0;i<180;i++)Game.prototype.fixedUpdate.call(game,1/60);
  assert.ok(nav.cost[center]>on*1.1,'wind/intensity are not frozen at the source bake');
  gas.setSourceActive('test',false);
  for(let i=0;i<60;i++)Game.prototype.fixedUpdate.call(game,1/60);
  assert.ok(nav.cost[center]<on,'source closure reaches the live cost field');
});
test('smoothing retains the A* detour around a costly plume and bottled air can cross it',()=>{
  const nav=flat();
  for(let z=8;z<=12;z++)for(let x=9;x<=11;x++)nav.cost[nav.i(x,z)]=6.5;
  const breathing=nav.findPath(2.5,0,10.5,18.5,0,10.5,900);
  assert.ok(breathing.length>2,JSON.stringify(breathing));
  assert.ok(breathing.some(p=>p.z<8||p.z>13),JSON.stringify(breathing));
  const bottled=nav.findPath(2.5,0,10.5,18.5,0,10.5,900,true);
  assert.equal(bottled.length,2);
});
test('short-range production steering follows the detour, then invalidates it when the air clears',()=>{
  const nav=flat(17,0.5),ai=new AISystem({});
  for(let z=4;z<=8;z++)for(let x=5;x<=7;x++)nav.cost[nav.i(x,z)]=6.5;
  const actor=kind=>({arch:ARCHETYPES[kind],pos:{x:.75,y:0,z:3.25},path:null,pathTime:0,
    setMove(x,z,s){this.movement={x,z,s};}});
  const game={nav,world:{lineOfSight(){return true;}}},scav=actor('scav'),warden=actor('warden');
  ai._moveTowards(scav,5.75,3.25,game,1);ai._moveTowards(warden,5.75,3.25,game,1);
  assert.ok(Math.abs(scav.movement.z)>0.1,JSON.stringify(scav));
  assert.equal(warden.movement.z,0);assert.equal(warden.path,null);
  const oldPath=scav.path;nav.cost.fill(1);nav.costRevision++;
  ai._moveTowards(scav,8,3.25,game,1); // Longer than the direct steering radius.
  assert.notEqual(scav.path,oldPath);assert.equal(scav.pathCostRevision,nav.costRevision);
});
test('failed navigation stops steering and smoothing cannot cut a blocked corner',()=>{
  const nav=flat(4),ai=new AISystem({});nav.height[nav.i(1,0)]=NaN;
  assert.equal(nav._clear(nav.i(0,0),nav.i(1,1)),false);
  const e={arch:ARCHETYPES.scav,pos:{x:.5,y:0,z:.5},path:null,pathTime:0,setMove(...v){this.move=v;}};
  let searches=0;const find=nav.createPathSearch.bind(nav);nav.createPathSearch=(...args)=>{searches++;return find(...args);};
  const game={nav,world:{lineOfSight(){return true;}}};
  ai._moveTowards(e,99,99,game,1);
  assert.deepEqual(e.move,[0,0,0]);
  for(let i=0;i<10;i++)ai._moveTowards(e,99,99,game,1);
  assert.equal(searches,1,'failed searches honor the cooldown');
});
test('a bounded search continues across steps without returning an incomplete route',()=>{
  const nav=flat(100);
  const search=nav.createPathSearch(.5,0,.5,99.5,0,99.5);
  assert.equal(search.step(20),null);assert.equal(search.done,false);
  for(let i=0;i<20&&!search.done;i++){search.step(20);assert.ok(search.lastExpanded<=20);}
  assert.equal(search.done,true);assert.ok(search.path?.length>1);
  assert.deepEqual(search.path.at(-1),{x:99.5,y:0,z:99.5});
});
