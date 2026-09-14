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

// Reproduce original observations from the immutable Safari report.
const report=JSON.parse(source('original-report.json'));
for(const clip of report.audioCapture.clips){
  const samples=clip.telemetry.trajectory;
  check(clip.name+' recorded region matches exact City.regionAt',samples.every(s=>regionAt.call({regions:data.regions},s.player.position[0],s.player.position[2])?.id===s.region || s.region===null&&regionAt.call({regions:data.regions},s.player.position[0],s.player.position[2])===null));
  result.observations.push({clip:clip.name,count:samples.length,ambience:clip.after.ambience,interior:clip.placed.interior,regions:[...new Set(samples.map(s=>s.region))]});
}
for(const Class of [Original,Candidate]){
  const {a,g,step}=fixture(Class);g.director.currentInterior='arcade';g.teleport('arcade_in');g.forcedMood='interior';step();
  check(Class.name+' '+(Class===Original?'original':'candidate')+' exact arcade route',a.ambienceState===(Class===Original?'street':'interior'));
}

// Real constructor, event-installed unlock, full _create and force replay.
for(const interiorId of [null,...data.interiors.map(i=>i.id)]) for(const beforeUnlock of [true,false]){
  const f=fixture(Candidate,{unlock:false,preSync:false}),{a,g}=f;
  if(interiorId){g.director.currentInterior=interiorId;g.teleport(data.interiors.find(i=>i.id===interiorId).spawns[0].id);}
  g._updateZone(1/60);
  if(beforeUnlock)a.update(1/60);
  const expected=interiorId?(g.city.interiors.get(interiorId).mood==='under'?'under':'interior'):(g.zone?.ambience||'street');
  f.unlockAudio();f.step();
  check('unlock '+interiorId+' sync-first='+beforeUnlock,a.ready&&a.unlocked&&a.ambienceState===expected&&Object.values(a.ambLayers).some(l=>l.target>0));
  check('unlock compressor settings remain fixed '+interiorId+' '+beforeUnlock,a.comp.threshold.value===-14&&a.comp.ratio.value===6&&a.comp.attack.value===.004&&a.comp.release.value===.22);
}

// All actual authored doors and exits. Run the unchanged async Director method;
// the pending fade-in permits updates after teleport and before return to PLAY.
for(const door of data.interactions.filter(x=>x.kind==='door'&&x.interiorId)) {
  const f=fixture(),{a,g,step}=f;let resolveFade;
  g.menus.fadeIn=()=>new Promise(r=>resolveFade=r);
  const promise=g.director.enterDoor(door);await Promise.resolve();
  check('enter '+door.id+' is loading with actual interior already assigned',g.mode===MODE.LOADING&&g.director.currentInterior===door.interiorId);
  step();const expected=g.city.interiors.get(door.interiorId).mood==='under'?'under':'interior';
  check('enter '+door.id+' audio sync during fade',a.ambienceState===expected);
  const windCalls=a.ambLayers.wind.gain.gain.calls.length;step();step();
  check('enter '+door.id+' stable sync schedules no extra wind/reverb transition',a.ambLayers.wind.gain.gain.calls.length===windCalls);
  resolveFade();await promise;
  const room=g.city.interiors.get(door.interiorId),exit={id:'exit_'+door.interiorId,target:room.exit.to};
  const leaving=g.director.enterDoor(exit);await Promise.resolve();step();
  check('leave '+door.id+' returns outdoor preset',a.ambienceState===(g.zone?.ambience||'street')&&g.director.currentInterior===null);
  resolveFade();await leaving;
}

// With both endpoints outside outdoor rectangles, no zone event will repair a
// missing per-frame sync. This is the failure absent from an event-only patch.
function sameNullTransition(Class){const f=fixture(Class);f.g.teleport('arcade_in');f.step();const prior=f.timeline.filter(x=>x.event==='zone').length;f.g.director.currentInterior='arcade';f.step();return {...f,zoneEventCount:f.timeline.filter(x=>x.event==='zone').length-prior};}
const nullTransition=sameNullTransition(Candidate);
check('same-null context needs and receives per-frame room sync',nullTransition.a.ambienceState==='interior'&&nullTransition.zoneEventCount===0);
nullTransition.g.director.currentInterior=null;nullTransition.step();check('same-null room exit returns street',nullTransition.a.ambienceState==='street');

// Preset relationships, actual ppm bounds, negative and high altitude. This
// matrix uses authored expected levels and checks both unchanged and changing
// contexts, rather than simply reading the stored target back.
const expected={street:[.5,.05],camp:[.4,.04],slip:[1,.35],vents:[.9,.85],cut:[.6,.3],road:[.4,.1],empty:[.35,.06],interior:[.18,.02],under:[1,.5]};
for(const [preset,[burn,hiss]] of Object.entries(expected)){
  const {a,g}=fixture();g.zone={id:'matrix-'+preset,ambience:preset};a.update(1/60);
  for(const [ppm,y] of [[-500,-20],[40,0],[200,20],[2400,40],[1e6,-100],[1300,9]]){
    g.player.ambientPpm=ppm;g.player.pos.y=y;a.ctx.currentTime+=1/60;a.update(1/60);
    const wantHiss=.1*(hiss+(.9-hiss)*Math.max(0,Math.min(1,(ppm-200)/2200)));
    const wantBurn=.42*burn*(.25+.75*Math.max(0,Math.min(1,1-(y+2)/22)));
    check(preset+' ppm='+ppm+' y='+y,near(final(a.ambLayers.hiss.gain.gain),wantHiss)&&near(final(a.ambLayers.burn.gain.gain),wantBurn));
  }
  g.player.ambientPpm=40;a.ambLayers.hiss.target=0;a.ambLayers.burn.target=0;a.update(1/60);
  check(preset+' intentional zero not replaced by fallback',final(a.ambLayers.hiss.gain.gain)===0&&final(a.ambLayers.burn.gain.gain)===0);
}

// Negative controls remove one correction at a time. No candidate file edits.
function mutant(name,methodName,from,to,deps={}){
  class Broken extends Candidate{}
  const original=Candidate.prototype[methodName].toString();assert.ok(original.includes(from));
  const changed=original.replace(from,to);
  Broken.prototype[methodName]=Function(...Object.keys(deps),'return ({'+changed+'})['+JSON.stringify(methodName)+'];')(...Object.values(deps));
  return Broken;
}
const noFrame=mutant('no-frame','update','this._syncAmbience();','',{clamp01,lerp});
const noFrameResult=sameNullTransition(noFrame);
check('negative control rejects removed frame sync',noFrameResult.a.ambienceState!=='interior');
result.negativeControls.push({mutation:'remove _syncAmbience from update',detected:true,observed:noFrameResult.a.ambienceState,expected:'interior'});
const noTarget=mutant('no-target','setAmbience','L.target = P[k] ?? 0;','',{REVERB_SPACE:{interior:'interior',under:'tunnel'}});
const missing=fixture(noTarget);missing.g.zone={ambience:'cut'};missing.a.update(1/60);
const depthFor=f=>.25+.75*Math.max(0,Math.min(1,1-(f.g.player.pos.y+2)/22));
const retainedControl=fixture(Candidate);retainedControl.g.zone={ambience:'cut'};retainedControl.a.update(1/60);
check('negative retained-target probe accepts unchanged candidate',near(final(retainedControl.a.ambLayers.burn.gain.gain),.42*.6*depthFor(retainedControl)));
check('negative control rejects missing retained target',!near(final(missing.a.ambLayers.burn.gain.gain),.42*.6*depthFor(missing)));
result.negativeControls.push({mutation:'remove retained preset target',detected:true,observed:final(missing.a.ambLayers.burn.gain.gain)});
const noBurn=mutant('no-burn','update','(B.target ?? 0.5) * ','',{clamp01,lerp});
const burnWrong=fixture(noBurn);burnWrong.g.zone={ambience:'interior'};burnWrong.a.update(1/60);
const burnControl=fixture(Candidate);burnControl.g.zone={ambience:'interior'};burnControl.a.update(1/60);
check('negative burn probe accepts unchanged candidate',near(final(burnControl.a.ambLayers.burn.gain.gain),.42*.18*depthFor(burnControl)));
check('negative control rejects unscaled burn',!near(final(burnWrong.a.ambLayers.burn.gain.gain),.42*.18*depthFor(burnWrong)));
result.negativeControls.push({mutation:'remove regional burn factor',detected:true,observed:final(burnWrong.a.ambLayers.burn.gain.gain)});

// Existing lifecycle edge: toTitle parks the player outdoors but retains the
// director's currentInterior. Record the candidate difference, not a pass.
for(const Class of [Original,Candidate])for(const id of ['arcade','cellar']){
  const {a,g,step}=fixture(Class);g.director.currentInterior=id;g.teleport(id+'_in');g.forcedMood=id==='cellar'?'under':'interior';step();
  await g.toTitle();step();
  result.observations.push({case:'quit-room-to-title',version:Class===Original?'original':'candidate',room:id,mode:g.mode,currentInterior:g.director.currentInterior,position:{...g.player.pos,set:undefined},region:g.zone?.id??null,ambience:a.ambienceState,forcedMood:g.forcedMood,music:a.musicState,reverb:Object.fromEntries(Object.entries(a.reverbs).map(([k,v])=>[k,final(v.gain.gain)]))});
}
result.audioSha256=sha256(source('candidate/src/audio/audio.js'));
result.originalReportSha256=sha256(source('original-report.json'));
result.status='passed for specified functional invariants; lifecycle observation requires integration-owner review';
result.testScriptSha256=sha256(source('independent-review.mjs'));
writeFileSync(new URL('independent-review-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({checks:result.checks.length,negativeControls:result.negativeControls.length,observations:result.observations,output:'independent-review-results.json'},null,2));
