import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {setTimeout as realSetTimeout} from 'node:timers';
import {Audio as Revised} from './fixtures/revised/src/audio/audio.js';
import {fixture,method,Original,Candidate as TitleBroken} from './fixtures/lifecycle-fixture.mjs';
import * as proposed from './candidate/tools/ios_audio_capture.mjs';
import * as baseline from './source/tools/ios_audio_capture.mjs';

const results={scope:'Exact-method CPU fixtures with inert WebAudio/DOM nodes. Adapter integration uses a explicitly stubbed recorder import; no product build, browser, recording or listening.',checks:[],cases:[]};
const test=(name,condition)=>{assert.ok(condition,name);results.checks.push({name,passed:true});};
const hash=b=>createHash('sha256').update(b).digest('hex');
const MODE={PLAY:'play',TITLE:'title',MENU:'menu',LOADING:'loading'};
const openPause=method('additional-source/screens.js','openPause',{t:(key,fallback)=>fallback});
const closePause=method('additional-source/screens.js','closePause');
const wireUI=method('source/src/game/game.js','_wireUI',{MODE,Storage:{hasSave:()=>true},__BUILD_ID__:'CPU-fixture',isPortrait:()=>false});
const setMode=method('source/src/game/game.js','setMode',{MODE});

function setup(Class=Revised){
  const f=fixture(Class),{g,a}=f,on=new Set(),actions=[],settingsCalls=[];
  g.engine={frame:10,time:1,on(){}};g.input={setEnabled(){}};g.setMode=setMode;
  g.settings={quality:'high',masterVolume:.85,musicVolume:.7,sfxVolume:1};
  g.applySettings=settings=>{settingsCalls.push({...settings});g.settings={...settings};};
  Object.assign(g.menus,{game:g,fromTitle:false,openPause,closePause,pauseNode:{classList:{add:k=>on.add(k),remove:k=>on.delete(k),contains:k=>on.has(k)}},saveButton:{style:{}},pauseTitle:{},panels:{settings:{tab:{style:{}}},status:{tab:{style:{}}}},showPanel(){},_flushSettings(){},setRotateVisible(){}});
  Object.defineProperty(g.menus,'pauseOpen',{get:()=>on.has('on')});
  Object.assign(g.hud,{visible:true,setVisible(v){this.visible=v;}});
  g.player.pos.toArray=()=>[g.player.pos.x,g.player.pos.y,g.player.pos.z];
  wireUI.call(g);g.director.currentInterior='arcade';g.forcedMood='interior';g.teleport('arcade_in');f.step();
  window.CINDERLINE={game:g,engine:g.engine,build:'CPU fixture only'};
  const waitFrames=async n=>{for(let i=0;i<n;i++){f.step();g.engine.frame++;g.engine.time+=1/60;}};
  const evaluate=async(fn,arg)=>{if(['pause','title','settings','close'].includes(arg))actions.push(arg);return fn(arg);};
  const report={checks:[],failures:[]};
  const check=(ok,name,detail)=>{report.checks.push({passed:Boolean(ok),name,detail});if(!ok)report.failures.push(name+': '+detail);};
  return {...f,actions,settingsCalls,evaluate,waitFrames,report,check};
}

for(const [name,Class,failedStage,expectedActions] of [
  ['revised',Revised,null,['pause','title','settings','close']],
  ['original-street',Original,'arcade',[]],
  ['original-title-regression',TitleBroken,'title',['pause','title']],
]){
  const f=setup(Class),evidence={};let error;
  try{await proposed.inspectIosAudioLifecycle({...f,evidence});}catch(e){error=e;}
  test(name+' expected lifecycle status',evidence.lifecycle.status===(failedStage?'failed':'checked'));
  test(name+' later actions stopped or full sequence observed',JSON.stringify(f.actions)===JSON.stringify(expectedActions));
  test(name+' report failures exactly follow result',failedStage?Boolean(error)&&f.report.failures.length===1:!error&&f.report.failures.length===0);
  test(name+' probe does not modify settings',f.settingsCalls.length===0);
  if(failedStage)test(name+' failure sample has actual failing stage',evidence.lifecycle.samples.at(-1).stage===failedStage);
  else {
    test('success checks all five target snapshots',evidence.lifecycle.samples.length===5&&f.report.checks.every(c=>c.passed));
    test('unsettled reverb gains are observations, not target assertions',evidence.lifecycle.samples[0].reverbGainValues.interior===0&&evidence.lifecycle.samples[0].reverbGainValues.street===.2);
    test('normal pause and title-settings flags measured',evidence.lifecycle.samples[1].pauseOpen&&!evidence.lifecycle.samples[1].fromTitle&&evidence.lifecycle.samples[3].pauseOpen&&evidence.lifecycle.samples[3].fromTitle);
  }
  results.cases.push({name,error:error?.message??null,lifecycle:evidence.lifecycle,operations:f.actions});
}
{
  const f=setup(),evidence={};f.a.ambLayers.room.target=0;
  await assert.rejects(proposed.inspectIosAudioLifecycle({...f,evidence}),/mismatch at arcade/);
  test('wrong retained preset value rejected even with correct ambienceState',evidence.lifecycle.samples[0].ambience==='interior'&&f.report.failures.length===1&&f.actions.length===0);
}
{
  const f=setup(),evidence={};const evaluate=async(fn,arg)=>{if(arg==='settings')throw Error('injected execute failure');return f.evaluate(fn,arg);};
  await assert.rejects(proposed.inspectIosAudioLifecycle({...f,evaluate,evidence}),/injected execute failure/);
  test('execute error enters existing report and stops close action',f.report.failures.length===1&&evidence.lifecycle.status==='failed'&&!f.actions.includes('close'));
}
{
  const f=setup(),evidence={};await assert.rejects(proposed.inspectIosAudioLifecycle({...f,evidence,waitFrames:async()=>{throw Error('injected actual-frame wait failure');}}),/actual-frame wait failure/);
  test('frame-wait failure enters report before any state action',evidence.lifecycle.samples.length===0&&f.actions.length===0&&f.report.failures.length===1);
}

// Isolate only the shared recorder import for wrapper sequencing/cleanup tests.
// The candidate itself remains unchanged and the exact Safari evaluate/cleanup
// implementation runs through an in-process execute port.
mkdirSync('tests',{recursive:true});
const text=readFileSync('candidate/tools/ios_audio_capture.mjs','utf8');
assert.ok(text.includes("from './mobile_audio_capture.mjs'"));
writeFileSync('tests/adapter-under-test.mjs',text.replace("from './mobile_audio_capture.mjs'","from './capture-stub.mjs'"));
writeFileSync('tests/capture-stub.mjs','export async function captureMobileAudio(args){return globalThis.__captureLifecycleFixture(args);}\n');
const adapter=await import('./tests/adapter-under-test.mjs');
for(const [name,mode,Class,expectedOperations] of [
  ['wrapper-success','success',Revised,['pause','title','settings','close']],
  ['wrapper-thrown-capture','throw',Revised,[]],
  ['wrapper-failed-capture-check','check-false',Revised,[]],
  ['wrapper-missing-clip','missing',Revised,[]],
  ['wrapper-wrong-final-room','wrong-room',Revised,[]],
  ['wrapper-native-reported-failure','reported-failure',Revised,[]],
  ['wrapper-false-clock-field-without-callback','guard-false',Revised,[]],
  ['wrapper-missing-timing-fields','missing-timing',Revised,[]],
  ['wrapper-title-failure','success',TitleBroken,['pause','title']],
]){
  const f=setup(Class);let releases=0,error;const originalSettings={...f.g.settings};
  globalThis.__captureLifecycleFixture=async({report,check})=>{
    report.audioCapture={status:'captured',clips:[{name:'fixture-1',placed:{interior:null}},{name:'cut-gas-air',placed:{interior:null}},{name:'fixture-3',placed:{interior:'arcade'}}]};
    for(const clip of report.audioCapture.clips)clip.timing={captureClockGuardPassed:true,telemetryComplete:true};
    if(mode==='throw'){f.g.settings.quality='low';throw Error('injected capture failure');}
    if(mode==='check-false')check(false,'injected original recording guard failure','fixture');
    if(mode==='reported-failure')f.check(false,'injected native movement failure','fixture');
    if(mode==='missing')report.audioCapture.clips.pop();
    if(mode==='wrong-room')report.audioCapture.clips.at(-1).placed.interior=null;
    if(mode==='guard-false')report.audioCapture.clips[0].timing.captureClockGuardPassed=false;
    if(mode==='missing-timing')delete report.audioCapture.clips[1].timing;
  };
  const execute=async(script,args=[])=>{
    if(script.includes('var key =')&&['pause','title','settings','close'].includes(args[0]))f.actions.push(args[0]);
    const value=Function(script).apply(null,args);
    await new Promise(resolve=>realSetTimeout(resolve,0));
    return value;
  };
  try{await adapter.captureIosAudio({execute,tap:async()=>{},moveForCapture:async()=>{},releaseActions:async()=>{releases++;},waitFrames:f.waitFrames,root:process.cwd(),output:'tests/output-'+name,check:f.check,report:f.report,provenance:{kind:'CPU fixture'}});}catch(e){error=e;}
  const ok=name==='wrapper-success';
  test(name+' success/failure return preserved',ok?!error:Boolean(error));
  test(name+' exact following operation budget',JSON.stringify(f.actions)===JSON.stringify(expectedOperations));
  test(name+' native actions always released',releases===1);
  test(name+' original settings restored',JSON.stringify(f.g.settings)===JSON.stringify(originalSettings));
  test(name+' lifecycle status accurately retained',f.report.audioCapture.lifecycle.status===(ok?'checked':Class===TitleBroken?'failed':'not run'));
  if(!ok)test(name+' failure cleanup reapplies original settings',f.report.safariAudioCleanupFinal.fallbackSettingsApplied&&f.settingsCalls.length===1);
  results.cases.push({name,error:error?.message??null,operations:f.actions,lifecycleStatus:f.report.audioCapture.lifecycle.status,reportFailures:f.report.failures,cleanup:f.report.safariAudioCleanupFinal});
}
for(const name of ['verifyIosAudioBuild','createSafariEvaluate','safariAudioCapabilities'])test(name+' unchanged',proposed[name].toString()===baseline[name].toString());
test('baseline81c pin unchanged',JSON.stringify(proposed.IOS_AUDIO_PIN)===JSON.stringify(baseline.IOS_AUDIO_PIN));
test('recorder and all three-clock functions byte-identical',readFileSync('source/tools/mobile_audio_capture.mjs').equals(readFileSync('candidate/tools/mobile_audio_capture.mjs')));
test('lifecycle function contains no sound or clock mutation',!/(setAmbience|setTargetAtTime|\.resume\(|\.update\(|applySettings|AudioContext|MediaRecorder)/.test(proposed.inspectIosAudioLifecycle.toString()));
test('transport cap/chunk/deadline unchanged',text.includes('const CHUNK_CHARS = 131072;')&&text.includes('const MAX_TRANSFER_CHARS = 48 * 1024 * 1024;')&&text.includes('timeoutMs = 120000'));
results.status='passed';results.candidateSha256=hash(readFileSync('candidate/tools/ios_audio_capture.mjs'));results.baselineSha256=hash(readFileSync('source/tools/ios_audio_capture.mjs'));
writeFileSync('verification.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({status:results.status,checks:results.checks.length,cases:results.cases.map(c=>({name:c.name,error:c.error,lifecycleStatus:c.lifecycleStatus||c.lifecycle?.status})),candidateSha256:results.candidateSha256},null,2));
