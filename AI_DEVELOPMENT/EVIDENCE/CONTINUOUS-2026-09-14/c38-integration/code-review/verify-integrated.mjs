import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {verifyIosAudioBuild,captureIosAudio} from './fixture/tools/ios_audio_capture.mjs';
import {verifyRequiredSafariAudio} from './fixture/tools/gates/f3_safari_audio.mjs';
import {exportFrameWorkReport} from './fixture/tools/export-ios-frame-work.mjs';
import {summarizeAudioCaptureTiming} from './fixture/tools/mobile_audio_capture.mjs';
const dir=dirname(fileURLToPath(import.meta.url)), root=join(dir,'fixture');
const sha=b=>createHash('sha256').update(b).digest('hex');
const tests=[];
function ok(name,fn){fn();tests.push({name,passed:true});}
const env={...process.env,CINDERLINE_IOS_AUDIO_CAPTURE:'1',CINDERLINE_IOS_FRAME_WORK_CAPTURE:'1',
 GITHUB_SHA:'bf743056ce143f09e4c6544ef1c7df4b73b232fd',GITHUB_RUN_ID:'123456789',GITHUB_RUN_ATTEMPT:'1',
 GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/claude/repo-instructions-constraints-r0070m',GITHUB_WORKFLOW:'Floor gates'};
Object.assign(process.env,env);
const provenance=verifyIosAudioBuild(root),reportPath=join(root,'test-results/ios-safari/report.json');
mkdirSync(dirname(reportPath),{recursive:true});
function write(report){writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');}
ok('real root/dist 1094 and unchanged recorder pin pass preflight',()=>{
 assert.equal(provenance.bundleSha256,'1094c1d96bed6b953c1655ce65549c484b8f09e275f055bff283499cece110f7');
 assert.equal(provenance.actualRecorderBlob,'785541d3beaed0e35e8bcf042973eabb7bdb5d6c');
 assert.equal(provenance.transferHelperSha256,'55150670ce3a89c24b9b3348110e29f315d9479ac14438faadf14389987eb41a');
});
// These invented endpoints and bytes are only a strict-verifier positive fixture,
// never recording evidence and never a Safari or quality measurement.
const before={wallMs:0,audioTime:0,engineTime:0,engineFrame:0,audioState:'running'};
const after={wallMs:1000,audioTime:1,engineTime:1,engineFrame:60,audioState:'running'};
const pose={listener:{position:[0,0,0],right:[1,0,0],forward:[0,0,1]},player:{position:[0,0,0],velocity:[0,0,0]},threats:[]};
const telemetry={clockFrames:[before,after],trajectory:[pose,pose],errors:[],dropped:{clockFrames:0,trajectory:0,sfxEvents:0}};
const checks=['wall, audio and simulation clocks stay aligned for capture','passive clock and pose telemetry is complete',
 'audio and real game clocks advance during recording','simultaneous live native video and production audio tracks','recording ends in finite live gameplay'];
const report={status:'passed',failures:[],checks:[],audioCapture:{status:'captured',provenance,cleanupErrors:[],clips:[]}};
for(const name of ['street-walk','cut-gas-air','arcade-room']){
 const path=`test-results/ios-safari/audio/audio-${name}.webm`,bytes=Buffer.from('SYNTHETIC verifier fixture; not recorded media');
 mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),bytes);
 report.audioCapture.clips.push({name,path,bytes:bytes.length,sha256:sha(bytes),mime:'video/webm',before:{state:before},after,telemetry,timing:summarizeAudioCaptureTiming(before,after,telemetry)});
 report.checks.push(...checks.map(suffix=>({name:`audio ${name}: ${suffix}`,passed:true})));
}
write(report);ok('F3 exact new provenance positive synthetic verifier control',()=>assert.equal(verifyRequiredSafariAudio(root,env).status,'passed'));
for(const variant of ['missing','tampered']){
 const altered=structuredClone(report);
 if(variant==='missing')delete altered.audioCapture.provenance.transferHelperSha256;
 else altered.audioCapture.provenance.transferHelperSha256='0'.repeat(64);
 write(altered);
 ok(`F3 rejects ${variant} transfer helper key`,()=>assert.throws(()=>verifyRequiredSafariAudio(root,env),/Safari source\/build provenance mismatch: transferHelperSha256/));
 let emitted=[];ok(`export rejects ${variant} transfer helper key before emitting`,()=>{
  assert.throws(()=>exportFrameWorkReport(root,env,v=>emitted.push(v)),/Original diagnostic source\/run mismatch: transferHelperSha256/);assert.equal(emitted.length,0);
 });
}
write(report);const exactBytes=readFileSync(reportPath);let lines=[];
exportFrameWorkReport(root,env,v=>lines.push(v));
function decode(lines){return Buffer.concat(lines.filter(x=>x.startsWith('[ios-frame-work-chunk] ')).map(x=>Buffer.from(JSON.parse(x.slice(23)).base64,'base64')));}
ok('exact-key successful synthetic report export is byte-identical',()=>assert.deepEqual(decode(lines),exactBytes));
const frameTamper=structuredClone(report);frameTamper.safariFrameWork={provenance:{...provenance,transferHelperSha256:'0'.repeat(64)}};write(frameTamper);
ok('frame-work nested transfer identity mismatch is rejected before output',()=>{let out=[];assert.throws(()=>exportFrameWorkReport(root,env,x=>out.push(x)),/Frame-work provenance differs/);assert.equal(out.length,0);});
const requests=[];
const fake=createServer(async(req,res)=>{
 let body='';for await(const chunk of req)body+=chunk;
 requests.push({method:req.method,path:req.url,body:body?JSON.parse(body):null});
 res.setHeader('content-type','application/json');
 if(req.method==='GET'&&req.url==='/status')res.end(JSON.stringify({value:{ready:true,message:'SYNTHETIC Appium status'}}));
 else if(req.method==='POST'&&req.url==='/session'){
  res.statusCode=500;res.end(JSON.stringify({value:{error:'session not created',message:'SYNTHETIC controlled WDA session rejection 8100',stacktrace:''}}));
 }else {res.statusCode=404;res.end(JSON.stringify({value:{error:'unknown command',message:'Unexpected fixture command'}}));}
});
await new Promise(done=>fake.listen(0,'127.0.0.1',done));
function run(args,vars){return new Promise((done,reject)=>{
 const child=spawn(process.execPath,args,{cwd:root,env:{...env,...vars}});let stdout='',stderr='';
 const timer=setTimeout(()=>{child.kill();reject(Error('Synthetic harness exceeded 20-second fixture budget'));},20000);
 child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('error',reject);
 child.on('close',(code,signal)=>{clearTimeout(timer);done({code,signal,stdout,stderr});});
});}
let harness;
try{harness=await run(['tools/test-ios-safari.mjs'],{IOS_SIMULATOR_UDID:'SYNTHETIC-UDID',IOS_SIMULATOR_PLATFORM_VERSION:'18.5',APPIUM_URL:`http://127.0.0.1:${fake.address().port}/`,CINDERLINE_TEST_URL:'',CINDERLINE_IOS_OUTPUT:''});}
finally{await new Promise(done=>fake.close(done));}
writeFileSync(join(dir,'synthetic-harness-stdout.log'),harness.stdout);writeFileSync(join(dir,'synthetic-harness-stderr.log'),harness.stderr);
const raw=readFileSync(reportPath),failed=JSON.parse(raw);
writeFileSync(join(dir,'synthetic-session-failed-original-report.json'),raw);
ok('actual unmodified harness fails actual local HTTP POST/session rejection',()=>{assert.equal(harness.code,1);assert.equal(harness.signal,null);assert.deepEqual(requests.map(x=>[x.method,x.path]),[['GET','/status'],['POST','/session']]);});
ok('session failure remains original failed reason with zero checks/clips and not-started audio',()=>{
 assert.equal(failed.status,'failed');assert.deepEqual(failed.checks,[]);assert.equal(failed.failures.length,1);
 assert.match(failed.failures[0],/^Error: WebDriver POST \/session: SYNTHETIC controlled WDA session rejection 8100/);
 assert.equal(failed.audioCapture.status,'not started');assert.deepEqual(failed.audioCapture.clips,[]);assert.deepEqual(failed.audioCapture.cleanupErrors,[]);assert.deepEqual(failed.audioCapture.provenance,provenance);
 assert.equal(failed.device,null);assert.equal(failed.safariFrameWork,undefined);
});
ok('original WDA capability and 240000ms readiness budget unchanged',()=>{let caps=requests[1].body.capabilities.alwaysMatch;assert.equal(caps['appium:wdaLaunchTimeout'],240000);assert.equal(caps['appium:isHeadless'],true);assert.equal(caps['appium:showXcodeLog'],true);assert.equal(Object.hasOwn(caps,'appium:usePreinstalledWDA'),false);});
ok('strict F3 rejects session-failed original report',()=>assert.throws(()=>verifyRequiredSafariAudio(root,env),/The complete Safari gate did not pass/));
lines=[];const meta=exportFrameWorkReport(root,env,x=>lines.push(x));
writeFileSync(join(dir,'synthetic-session-original-export.log'),lines.join('\n')+'\n');
ok('strict exporter recovers exact failed original bytes and reports failure without frame work',()=>{
 assert.deepEqual(decode(lines),raw);assert.equal(meta.sha256,sha(raw));assert.equal(meta.diagnosticStatus,'failed');assert.equal(meta.frameWorkPresent,false);assert.deepEqual(readFileSync(reportPath),raw);
});
const noUdid=await run(['tools/test-ios-safari.mjs'],{IOS_SIMULATOR_UDID:'',IOS_SIMULATOR_PLATFORM_VERSION:'18.5',CINDERLINE_IOS_OUTPUT:''});
const early=JSON.parse(readFileSync(reportPath));
ok('preflight missing UDID remains failed before provenance and strict export refuses it',()=>{
 assert.equal(noUdid.code,1);assert.match(early.failures[0],/IOS_SIMULATOR_UDID is required/);assert.equal(early.audioCapture,undefined);
 let out=[];assert.throws(()=>exportFrameWorkReport(root,env,x=>out.push(x)),/Original diagnostic source\/run mismatch/);assert.equal(out.length,0);
});
// Exercise the real adapter's replacement and cleanup after the new initial
// object, with a controlled page-operation failure (no game/browser/audio).
let first=true;const adapterReport={failures:[],audioCapture:{status:'not started',provenance,clips:[],cleanupErrors:[]}};
const initial=adapterReport.audioCapture;
let adapterError;
try{await captureIosAudio({root,output:join(root,'adapter-output'),report:adapterReport,provenance,captureFrameWork:false,
 execute:async script=>{if(first){first=false;return {quality:'low'};}if(script.includes('var old'))throw Error('unused');if(script.includes('Promise.resolve().then'))throw Error('SYNTHETIC page capture operation failure');return null;},
 tap:async()=>{},moveForCapture:async()=>{},releaseActions:async()=>{},waitFrames:async()=>{},check:()=>{}});}catch(e){adapterError=e;}
ok('real adapter replaces not-started evidence and preserves failed capture/cleanup provenance',()=>{
 assert.match(adapterError?.message||'',/SYNTHETIC page capture operation failure/);assert.notEqual(adapterReport.audioCapture,initial);
 assert.equal(adapterReport.audioCapture.status,'acquisition failed');assert.match(adapterReport.audioCapture.reason,/SYNTHETIC page capture operation failure/);
 assert.deepEqual(adapterReport.audioCapture.provenance,provenance);assert.deepEqual(adapterReport.audioCapture.cleanupErrors,[]);
});
writeFileSync(join(dir,'integration-verification.json'),JSON.stringify({scope:'Local synthetic verifier + actual harness over fake Appium HTTP; no Safari, actual recording, CI or quality measurement',testsPassed:tests.length,tests,provenance,harness:{code:harness.code,requests,reportBytes:raw.length,reportSha256:sha(raw),exportMeta:meta},adapter:{status:adapterReport.audioCapture.status,reason:adapterReport.audioCapture.reason,cleanupErrors:adapterReport.audioCapture.cleanupErrors}},null,2)+'\n');
console.log(JSON.stringify({passed:tests.length,syntheticOnly:true,actualSafari:false}));
