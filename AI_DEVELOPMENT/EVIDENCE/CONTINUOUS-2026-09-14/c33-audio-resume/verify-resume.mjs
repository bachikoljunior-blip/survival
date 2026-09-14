import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Audio as Original} from './source/src/audio/audio.js';
import {Audio as Candidate} from './candidate/src/audio/audio.js';
import {Audio as Reviewed} from './reviewed-source/src/audio/audio.js';
import {Audio as Composite} from './composite/src/audio/audio.js';

const report={scope:'Exact Audio constructor, _installUnlock, _create and update against inert WebAudio nodes and a CPU event bus. Fixture isTrusted fields simulate branches; no browser gesture, audio output, simulator, recording or real resume is claimed.',checks:[],cases:[]};
const check=(name,value)=>{assert.ok(value,name);report.checks.push({name,passed:true});};
let timer=0;globalThis.setTimeout=()=>++timer;globalThis.clearTimeout=()=>{};globalThis.setInterval=()=>++timer;globalThis.clearInterval=()=>{};
const param=()=>({value:0,setTargetAtTime(){},setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}});
const node=()=>({gain:param(),frequency:param(),Q:param(),detune:param(),playbackRate:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),connect(){},disconnect(){},start(){},stop(){}});
function fixture(Class,{initialState='running',rejectFirstResume=false}={}){
  const events=new Map(),documentEvents=new Map();let activation=null,contexts=0;
  const add=(map,k,fn)=>{const a=map.get(k)||[];a.push(fn);map.set(k,a);};
  const calls=[];
  class Context{
    constructor(){contexts++;this.currentTime=0;this.sampleRate=8000;this.state=initialState;this.destination=node();}
    createDynamicsCompressor=node;createGain=node;createBiquadFilter=node;createConvolver=node;createOscillator=node;createBufferSource=node;
    createBuffer(ch,length,sampleRate){const arrays=Array.from({length:ch},()=>new Float32Array(length));return {sampleRate,length,duration:length/sampleRate,numberOfChannels:ch,getChannelData:i=>arrays[i]};}
    resume(){calls.push({state:this.state,activation:activation?{...activation}:null});if(rejectFirstResume&&calls.length===1)return Promise.reject(Error('injected first resume rejection'));if(this.state==='closed')return Promise.reject(Error('injected closed context'));this.state='running';return Promise.resolve();}
    suspend(){this.state='suspended';return Promise.resolve();}
  }
  globalThis.window={AudioContext:Context,addEventListener:(k,fn)=>add(events,k,fn),removeEventListener:(k,fn)=>events.set(k,(events.get(k)||[]).filter(f=>f!==fn))};
  globalThis.document={hidden:false,addEventListener:(k,fn)=>add(documentEvents,k,fn)};
  const game={zone:null,mode:'play',director:{currentInterior:null},city:{interiors:new Map()},on(){},player:{pos:{x:0,y:0,z:0},ambientPpm:40}};
  const audio=new Class(game);
  const dispatch=(type,trusted=true)=>{activation={type,isTrusted:trusted};try{for(const fn of [...events.get(type)||[]])fn(activation);}finally{activation=null;}};
  return {audio,calls,dispatch,events,documentEvents,contexts:()=>contexts};
}

for(const [name,Class] of [['original',Original],['candidate',Candidate],['reviewed22',Reviewed],['composite',Composite]]){
  const f=fixture(Class);f.dispatch('pointerdown');const ctx=f.audio.ctx;ctx.state='suspended';f.dispatch('pointerdown');
  const fixed=Class===Candidate||Class===Composite;
  check(name+' later suspended context behavior reproduced',ctx.state===(fixed?'running':'suspended'));
  check(name+' no second context created',f.contexts()===1&&f.audio.ctx===ctx);
  check(name+' real-handler resume call count',f.calls.length===(fixed?1:0));
  report.cases.push({name,case:'later-suspension',state:ctx.state,ready:f.audio.ready,unlocked:f.audio.unlocked,contexts:f.contexts(),resumeCalls:f.calls,gestureListeners:[...f.events].filter(([k])=>['pointerdown','keydown','touchstart'].includes(k)).map(([type,handlers])=>({type,count:handlers.length}))});
}
for(const [name,Class] of [['original',Original],['candidate',Candidate],['reviewed22',Reviewed],['composite',Composite]]){
  const f=fixture(Class,{initialState:'suspended',rejectFirstResume:true});f.dispatch('pointerdown');await Promise.resolve();
  check(name+' rejected initial resume is not treated as a running context',f.audio.ctx.state==='suspended'&&f.audio.ready&&f.audio.unlocked);
  f.dispatch('touchstart');await Promise.resolve();const fixed=Class===Candidate||Class===Composite;
  check(name+' later gesture handles initial rejection without recreation',f.contexts()===1&&f.audio.ctx.state===(fixed?'running':'suspended')&&f.calls.length===(fixed?2:1));
  report.cases.push({name,case:'initial-resume-rejection',state:f.audio.ctx.state,contexts:f.contexts(),resumeCalls:f.calls});
}
for(const [name,Class] of [['candidate',Candidate],['composite',Composite]]){
  const f=fixture(Class);
  for(const type of ['pointerdown','keydown','touchstart'])f.dispatch(type,false);
  check(name+' untrusted initial events neither create nor resume',f.contexts()===0&&f.calls.length===0&&!f.audio.unlocked);
  f.dispatch('keydown');const ctx=f.audio.ctx;
  for(const type of ['pointerdown','keydown','touchstart']){ctx.state='suspended';f.dispatch(type,false);}
  check(name+' untrusted later events cannot resume existing context',f.calls.length===0&&ctx.state==='suspended');
  for(const type of ['pointerdown','keydown','touchstart']){ctx.state='suspended';f.dispatch(type);}
  check(name+' every retained genuine-input handler resumes same context synchronously',f.calls.length===3&&f.calls.every(c=>c.activation?.isTrusted)&&f.contexts()===1&&f.audio.ctx===ctx);
  const n=f.calls.length;f.dispatch('pointerdown');f.dispatch('touchstart');f.dispatch('keydown');
  check(name+' running context ignores repeated gesture events',f.calls.length===n&&f.contexts()===1);
  ctx.state='closed';f.dispatch('pointerdown');f.dispatch('touchstart');f.dispatch('keydown');
  check(name+' closed context is preserved without resume or replacement',ctx.state==='closed'&&f.calls.length===n&&f.contexts()===1);
  ctx.state='suspended';f.audio.update(1/60);f.audio.update(1/60);
  check(name+' update does not poll or resume a suspended context',f.calls.length===n&&ctx.state==='suspended');
  report.cases.push({name,case:'event-trust-and-closed-state',contexts:f.contexts(),resumeCalls:f.calls,stateAfterUpdates:ctx.state});
}
for(const [name,Before,After] of [['baseline',Original,Candidate],['reviewed22',Reviewed,Composite]]){
  const unchanged=Object.getOwnPropertyNames(Before.prototype).filter(n=>n!=='constructor'&&n!=='_installUnlock');
  check(name+' every other Audio method byte-identical',unchanged.every(n=>Before.prototype[n].toString()===After.prototype[n].toString()));
}
check('same exact unlock repair in both candidate versions',Candidate.prototype._installUnlock.toString()===Composite.prototype._installUnlock.toString());
const hash=b=>createHash('sha256').update(b).digest('hex');
report.pins=Object.fromEntries(['source','candidate','reviewed-source','composite'].map(n=>[n,hash(readFileSync(n+'/src/audio/audio.js'))]));
report.status='passed for bounded CPU defect/candidate controls; actual Safari effectiveness not measured';
writeFileSync('verification.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({checks:report.checks.length,pins:report.pins,status:report.status},null,2));
