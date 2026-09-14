import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readlinkSync,unlinkSync,symlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {verifyRequiredSafariAudio} from './runtime-fixture/tools/gates/f3_safari_audio.mjs';
import {summarizeAudioCaptureTiming} from '../source-original/tools/mobile_audio_capture.mjs';

const root=fileURLToPath(new URL('./runtime-fixture',import.meta.url));
const reportPath=root+'/test-results/ios-safari/report.json';
const raw=readFileSync(reportPath), original=JSON.parse(raw);
const environment={CINDERLINE_IOS_AUDIO_CAPTURE:'1',GITHUB_SHA:original.audioCapture.provenance.runCommit,
  GITHUB_RUN_ID:original.audioCapture.provenance.runId,GITHUB_RUN_ATTEMPT:original.audioCapture.provenance.runAttempt};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const start=performance.now(), checks=[];
function check(name,fn){fn();checks.push({name,passed:true});}
function changeReport(fn,expected){
  const copy=structuredClone(original);fn(copy);writeFileSync(reportPath,JSON.stringify(copy));
  try {assert.throws(()=>verifyRequiredSafariAudio(root,environment),expected);}
  finally {writeFileSync(reportPath,raw);}
}
const verified=verifyRequiredSafariAudio(root,environment);
check('actual successful C29 report and three original MP4s pass unchanged',()=>{
  assert.equal(verified.status,'passed');assert.equal(verified.clips.length,3);
  assert.equal(verified.originalReport.sha256,'507a4f82645e6ccc8cff34154f39a58ec1786c3ab4e09f385e86a8f5cf4471ed');
  assert.equal(verified.audioQuality,'not measured');assert.equal(verified.comparison,'not measured');
});
check('disabled capture cannot pass from an old successful report',()=>assert.throws(()=>verifyRequiredSafariAudio(root,{...environment,CINDERLINE_IOS_AUDIO_CAPTURE:'0'}),/not enabled/));
for(const key of ['GITHUB_SHA','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT'])
  check('missing actual workflow '+key+' rejects',()=>assert.throws(()=>verifyRequiredSafariAudio(root,{...environment,[key]:''}),/revision\/run\/attempt/));
check('previous run evidence rejects',()=>assert.throws(()=>verifyRequiredSafariAudio(root,{...environment,GITHUB_RUN_ID:'1'}),/another workflow runId/));
check('previous attempt evidence rejects',()=>assert.throws(()=>verifyRequiredSafariAudio(root,{...environment,GITHUB_RUN_ATTEMPT:'2'}),/another workflow runAttempt/));
check('failed Safari report rejects',()=>changeReport(r=>r.status='failed',/complete Safari gate/));
check('a failed existing check rejects',()=>changeReport(r=>r.checks[0].passed=false,/complete Safari gate/));
check('omitted required recorder check rejects',()=>changeReport(r=>r.checks=r.checks.filter(c=>!c.name.includes('audio street-walk: wall, audio')),/Required audio check missing/));
check('no acquisition rejects',()=>changeReport(r=>delete r.audioCapture,/three original Safari scenes/));
check('missing clip rejects',()=>changeReport(r=>r.audioCapture.clips.pop(),/three original Safari scenes/));
check('duplicate clip rejects',()=>changeReport(r=>r.audioCapture.clips[1]=r.audioCapture.clips[0],/three original Safari scenes/));
check('failed cleanup rejects',()=>changeReport(r=>r.audioCapture.cleanupErrors.push('CPU error'),/cleanup did not complete/));
check('changed captured bundle rejects',()=>changeReport(r=>r.audioCapture.provenance.actualBundleHashes['dist/cinderline.1.0.0.js']='0'.repeat(64),/root\/dist provenance/));
check('changed source helper provenance rejects',()=>changeReport(r=>r.audioCapture.provenance.helperSha256='0'.repeat(64),/source\/build provenance/));
check('falsely asserted successful timing rejects',()=>changeReport(r=>r.audioCapture.clips[0].after.engineTime=r.audioCapture.clips[0].before.state.engineTime+0.1,/summary differs/));
check('actual collapsed clock remains rejected by unchanged original function',()=>changeReport(r=>{
  const c=r.audioCapture.clips[0];c.after.engineTime=c.before.state.engineTime+0.1;
  c.timing=summarizeAudioCaptureTiming(c.before.state,c.after,c.telemetry);
},/Original acquisition clock/));
check('incomplete passive telemetry remains rejected',()=>changeReport(r=>{
  const c=r.audioCapture.clips[0];c.telemetry.dropped.clockFrames=1;
  c.timing=summarizeAudioCaptureTiming(c.before.state,c.after,c.telemetry);
},/clock\/telemetry guard/));
check('changed recording path rejects',()=>changeReport(r=>r.audioCapture.clips[0].path='../outside.mp4',/Unexpected original recording path/));
check('changed recording hash rejects',()=>changeReport(r=>r.audioCapture.clips[0].sha256='0'.repeat(64),/recording bytes/));
check('changed recording size rejects',()=>changeReport(r=>r.audioCapture.clips[0].bytes--,/recording bytes/));
function changedLinkedFile(relative,replacement,expected){
  const path=root+'/'+relative,target=readlinkSync(path);unlinkSync(path);writeFileSync(path,replacement);
  try {assert.throws(()=>verifyRequiredSafariAudio(root,environment),expected);}
  finally {unlinkSync(path);symlinkSync(target,path);}
}
check('different root bundle still fails existing 6b preflight',()=>changedLinkedFile('cinderline.1.0.0.js','CPU wrong bundle',/build pin mismatch/));
check('different dist bundle still fails existing 6b preflight',()=>changedLinkedFile('dist/cinderline.1.0.0.js','CPU wrong bundle',/build pin mismatch/));
check('changed original recorder or 5% guard rejects',()=>changedLinkedFile('tools/mobile_audio_capture.mjs',readFileSync(root+'/tools/mobile_audio_capture.mjs','utf8')+'\n',/recorder\/clock-guard source pin mismatch/));
check('changed original MP4 bytes reject',()=>changedLinkedFile('test-results/ios-safari/audio/audio-street-walk.mp4','CPU changed media',/recording bytes/));
// A separate module fixture expands only the declared provenance pin schema.
// This is not a new build/capture pin selection; raw originals remain untouched.
const expandedPin={preparedFromCommit:'0'.repeat(40),preparationReportSha256:'0'.repeat(64)};
const adapter=readFileSync(root+'/tools/ios_audio_capture.mjs','utf8').replace('export const IOS_AUDIO_PIN = Object.freeze({',
  'export const IOS_AUDIO_PIN = Object.freeze({\n  preparedFromCommit: '+JSON.stringify(expandedPin.preparedFromCommit)+',\n  preparationReportSha256: '+JSON.stringify(expandedPin.preparationReportSha256)+',');
writeFileSync(root+'/tools/ios_audio_capture.expanded-fixture.mjs',adapter);
const expandedVerifier=readFileSync(root+'/tools/gates/f3_safari_audio.mjs','utf8')
  .replace("from '../ios_audio_capture.mjs'","from '../ios_audio_capture.expanded-fixture.mjs'");
writeFileSync(root+'/tools/gates/f3_safari_audio.expanded-fixture.mjs',expandedVerifier);
const {verifyRequiredSafariAudio:verifyExpanded}=await import('./runtime-fixture/tools/gates/f3_safari_audio.expanded-fixture.mjs');
check('added preparedFromCommit pin is required without a verifier allowlist edit',()=>
  assert.throws(()=>verifyExpanded(root,environment),/provenance mismatch: preparedFromCommit/));
check('added preparationReportSha256 pin is required without a verifier allowlist edit',()=>{
  const copy=structuredClone(original);copy.audioCapture.provenance.preparedFromCommit=expandedPin.preparedFromCommit;
  writeFileSync(reportPath,JSON.stringify(copy));
  try {assert.throws(()=>verifyExpanded(root,environment),/provenance mismatch: preparationReportSha256/);}
  finally {writeFileSync(reportPath,raw);}
});
check('all expanded pin fields exactly matched allow continued original guard verification',()=>{
  const copy=structuredClone(original);Object.assign(copy.audioCapture.provenance,expandedPin);
  writeFileSync(reportPath,JSON.stringify(copy));
  try {assert.equal(verifyExpanded(root,environment).status,'passed');}
  finally {writeFileSync(reportPath,raw);}
});
check('read-only originals and report bytes remain exact',()=>{
  assert.equal(hash(readFileSync(reportPath)),hash(raw));
  for(const clip of original.audioCapture.clips)assert.equal(hash(readFileSync(root+'/'+clip.path)),clip.sha256);
});
const result={scope:'Offline read-only verification of already acquired real originals plus negative controls on isolated copies',
  passed:checks.length,checks,elapsed_ms:performance.now()-start,original_report_sha256:hash(raw),
  verifier_sha256:hash(readFileSync(root+'/tools/gates/f3_safari_audio.mjs')),actual_original_checks:original.checks.length,
  actual_original_media_bytes:verified.clips.reduce((sum,c)=>sum+c.bytes,0),actual_original_clips:verified.clips,
  original_guard_blob:'86c1d9c9a0b0eeac3d947aad3d99d25272d3eeaa',new_capture_count:0,evaluation_count:0};
writeFileSync(new URL('audio-proof-controls.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:result.passed,elapsed_ms:result.elapsed_ms,actual_original_checks:result.actual_original_checks,
  actual_original_media_bytes:result.actual_original_media_bytes,new_capture_count:0,evaluation_count:0}));
