import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Audio as Original } from './source/src/audio/audio.js';
import { Audio as Candidate } from './candidate/src/audio/audio.js';
import { buildHollisData } from './source/src/content/world_data.js';
import { clamp01, lerp } from './source/src/core/util.js';

// Source-known CPU review: exact production methods, inert WebAudio nodes.
// No real audio, renderer, iOS execution, actual timing, or listening claim.
const source = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const sha256 = s => createHash('sha256').update(s).digest('hex');
const result = {scope:'Independent exact-method CPU fixtures with inert WebAudio nodes; not browser or audio rendering.',checks:[],negativeControls:[],observations:[]};
const check = (name,condition,detail) => {assert.ok(condition,name);result.checks.push({name,passed:true,...(detail===undefined?{}:{detail})});};
const near = (a,b) => Math.abs(a-b)<1e-10;
const final = p => p.calls.at(-1)?.value;
function method(file,name,deps={}) {
  const text=source(file), re=new RegExp('^  (?:async )?'+name+'\\([^\\n]*\\) \\{','m'), start=text.search(re);
  assert.ok(start>=0,name+' exists');
  const end=text.indexOf('\n  }',start)+4;
  const exact=text.slice(start,end);
  return Function(...Object.keys(deps),'return ({'+exact+'})['+JSON.stringify(name)+'];')(...Object.values(deps));
}
const MODE={PLAY:'play',TITLE:'title',LOADING:'loading'};
const regionAt=method('source/src/world/city.js','regionAt');
const updateZone=method('source/src/game/game.js','_updateZone');
const teleport=method('source/src/game/game.js','teleport');
const enterDoor=method('source/src/game/director.js','enterDoor',{MODE});
const setTitleCamera=method('source/src/game/game.js','setTitleCamera',{TITLE_YAW:2.10,TITLE_PITCH:-.02});
const toTitle=method('source/src/game/game.js','toTitle',{MODE,Storage:{hasSave:()=>true},__BUILD_ID__:'source-known-cpu-fixture'});
const data=buildHollisData();
let handlers=new Map(), nextTimer=0;
globalThis.window={addEventListener:(k,f)=>{const a=handlers.get(k)||[];a.push(f);handlers.set(k,a);},removeEventListener:(k,f)=>handlers.set(k,(handlers.get(k)||[]).filter(x=>x!==f))};
globalThis.document={hidden:false,addEventListener(){}};
globalThis.setTimeout=()=>++nextTimer;globalThis.clearTimeout=()=>{};
globalThis.setInterval=()=>++nextTimer;globalThis.clearInterval=()=>{};
function param() {return {value:0,calls:[],setTargetAtTime(value,time,tau){assert.ok(Number.isFinite(value)&&Number.isFinite(time)&&tau>0);this.calls.push({value,time,tau});},setValueAtTime(value,time){this.value=value;this.calls.push({value,time});},linearRampToValueAtTime(value,time){this.calls.push({value,time});},exponentialRampToValueAtTime(value,time){this.calls.push({value,time});},cancelScheduledValues(){}};}
function node(){return {gain:param(),frequency:param(),Q:param(),detune:param(),playbackRate:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),connect(){},disconnect(){},start(){},stop(){}};}
class Context {
  constructor(){this.currentTime=0;this.sampleRate=8000;this.state='running';this.destination=node();}
  createDynamicsCompressor=node;createGain=node;createBiquadFilter=node;createConvolver=node;createOscillator=node;createBufferSource=node;
  createBuffer(channels,length,sampleRate){const arrays=Array.from({length:channels},()=>new Float32Array(length));return {sampleRate,length,duration:length/sampleRate,numberOfChannels:channels,getChannelData:i=>arrays[i]};}
  resume(){this.state='running';return Promise.resolve();}suspend(){this.state='suspended';return Promise.resolve();}
}
window.AudioContext=Context;
const vec=(x=0,y=0,z=0)=>({x,y,z,set(x,y,z){Object.assign(this,{x,y,z});}});
function fixture(Class=Candidate,{unlock=true,preSync=true}={}) {
  handlers=new Map();const events=new Map(),timeline=[];
  const city={regions:data.regions,regionAt,interiors:new Map(data.interiors.map(d=>[d.id,d])),spawns:new Map(data.spawns.map(d=>[d.id,d]))};
  for(const room of data.interiors) for(const s of room.spawns||[]) city.spawns.set(s.id,{...s,x:room.ox+s.x,z:room.oz+s.z,y:s.y??0,rot:s.rot??0});
  const g={city,zone:null,forcedMood:null,moodName:'street',mode:MODE.PLAY,interiorPpm:null,gas:{groundAt:()=>0},atmos:{setMood:m=>timeline.push({event:'mood',value:m})},camera:{},on(k,f){const list=events.get(k)||[];list.push(f);events.set(k,list);},emit(k,...args){timeline.push({event:k,value:k==='zone'?args[0]?.id??null:args[0]});for(const f of events.get(k)||[])f(...args);},setMode(m){this.mode=m;this.emit('mode',m);},teleport,_updateZone:updateZone,setTitleCamera,toTitle};
  g.player={pos:vec(),vel:vec(),group:{visible:true},ambientPpm:40,placeAt(x,y,z,rot){this.pos.set(x,y,z);this.rot=rot;}};
  g.director={game:g,currentInterior:null,state:{discover(){}},refreshCast(){},quests:{notify(){}},_pollReach(){},enterDoor};
  g.menus={fadeOut:()=>Promise.resolve(),fadeIn:()=>Promise.resolve(),closePause(){},hideDeath(){},hideEnding(){},showTitle(){}};g.hud={setVisible(){}};
  g.teleport('start');g._updateZone(1/60);
  const a=new Class(g);g.audio=a;
  const step=()=>{if(a.ctx)a.ctx.currentTime+=1/60;g._updateZone(1/60);a.update(1/60);};
  const unlockAudio=()=>{for(const f of [...handlers.get('pointerdown')||[]])f();};
  if(preSync)a.update(1/60);if(unlock)unlockAudio();
  return {a,g,step,unlockAudio,timeline};
}


export {fixture,check,result,source,sha256,method,MODE,Original,Candidate};
