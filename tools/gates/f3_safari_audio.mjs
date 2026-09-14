#!/usr/bin/env node
/** Required acquisition evidence, not an audio-quality or comparison verdict.
 * Reads original Safari output only. Does not launch a browser, synthesize,
 * resample or replay media, change the mix, or replace any core F3 check. */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {IOS_AUDIO_PIN,verifyIosAudioBuild} from '../ios_audio_capture.mjs';
import {summarizeAudioCaptureTiming} from '../mobile_audio_capture.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const REPORT='test-results/ios-safari/report.json';
const OUTPUT='test-results/ios-safari/f3-audio-verification.json';
const SCENES=['street-walk','cut-gas-air','arcade-room'];
const REQUIRED_CHECKS=[
  'wall, audio and simulation clocks stay aligned for capture',
  'passive clock and pose telemetry is complete',
  'audio and real game clocks advance during recording',
  'simultaneous live native video and production audio tracks',
  'recording ends in finite live gameplay',
];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const requireThat=(condition,message)=>{if(!condition)throw Error(message);};

export function verifyRequiredSafariAudio(root=ROOT,environment=process.env){
  requireThat(environment.CINDERLINE_IOS_AUDIO_CAPTURE==='1','Required Safari audio capture was not enabled');
  requireThat(/^[a-f0-9]{40}$/.test(environment.GITHUB_SHA||'')
    && /^[1-9][0-9]*$/.test(environment.GITHUB_RUN_ID||'')
    && /^[1-9][0-9]*$/.test(environment.GITHUB_RUN_ATTEMPT||''),'Actual workflow revision/run/attempt are required');
  // Keep the root/dist/recorder preflight against the explicitly prepared build.
  const expected=verifyIosAudioBuild(root);
  const reportBytes=readFileSync(join(root,REPORT)), report=JSON.parse(reportBytes);
  requireThat(report.status==='passed' && Array.isArray(report.failures) && report.failures.length===0
    && Array.isArray(report.checks) && report.checks.length>0 && report.checks.every(c=>c.passed===true),
    'The complete Safari gate did not pass');
  const capture=report.audioCapture, provenance=capture?.provenance;
  requireThat(capture?.status==='captured' && Array.isArray(capture.clips)
    && isDeepStrictEqual(capture.clips.map(c=>c.name),SCENES),'All three original Safari scenes are required');
  requireThat(Array.isArray(capture.cleanupErrors) && capture.cleanupErrors.length===0,
    'Safari audio cleanup did not complete');
  for(const key of [...Object.keys(IOS_AUDIO_PIN),'actualRecorderBlob','helperSha256','harnessSha256','frameWorkProbeSha256','transferHelperSha256'])
    requireThat(provenance?.[key]===expected[key],'Safari source/build provenance mismatch: '+key);
  requireThat(isDeepStrictEqual(provenance.actualBundleHashes,expected.actualBundleHashes),
    'Safari root/dist provenance differs from the actual checked build');
  for(const [key,variable] of [['runCommit','GITHUB_SHA'],['runId','GITHUB_RUN_ID'],['runAttempt','GITHUB_RUN_ATTEMPT']])
    requireThat(String(provenance[key])===String(environment[variable]),'Safari evidence belongs to another workflow '+key);
  const clips=[];
  for(const clip of capture.clips){
    for(const suffix of REQUIRED_CHECKS){
      const matches=report.checks.filter(c=>c.name===`audio ${clip.name}: ${suffix}`);
      requireThat(matches.length===1 && matches[0].passed===true,'Required audio check missing or failed: '+clip.name+' / '+suffix);
    }
    // Re-run the exact unchanged recorder function over the original endpoints
    // and full passive telemetry. No new clock tolerance or resampling rule.
    const timing=summarizeAudioCaptureTiming(clip.before.state,clip.after,clip.telemetry);
    requireThat(isDeepStrictEqual(timing,clip.timing),'Recorded timing summary differs from original telemetry: '+clip.name);
    requireThat(timing.captureClockGuardPassed===true && timing.telemetryComplete===true,
      'Original acquisition clock/telemetry guard failed: '+clip.name);
    requireThat(typeof clip.mime==='string' && (clip.mime.includes('mp4')||clip.mime.includes('webm')),
      'Original native recording container is missing: '+clip.name);
    const extension=clip.mime.includes('mp4')?'mp4':'webm';
    const path=`test-results/ios-safari/audio/audio-${clip.name}.${extension}`;
    requireThat(clip.path===path,'Unexpected original recording path: '+clip.name);
    const bytes=readFileSync(join(root,path));
    requireThat(Number.isSafeInteger(clip.bytes) && clip.bytes>0 && bytes.length===clip.bytes && sha(bytes)===clip.sha256,
      'Original recording bytes are missing or changed: '+clip.name);
    clips.push({name:clip.name,path,bytes:bytes.length,sha256:clip.sha256,timing});
  }
  return {status:'passed',scope:'Required original Safari acquisition only; existing core F3 is independently required',
    runCommit:environment.GITHUB_SHA,runId:environment.GITHUB_RUN_ID,runAttempt:environment.GITHUB_RUN_ATTEMPT,
    originalReport:{path:REPORT,bytes:reportBytes.length,sha256:sha(reportBytes)},
    recorderBlob:expected.actualRecorderBlob,actualBundleHashes:expected.actualBundleHashes,clips,
    audioQuality:'not measured',comparison:'not measured'};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let result;
  try {result=verifyRequiredSafariAudio();}
  catch(error){result={status:'failed',error:String(error),audioQuality:'not measured',comparison:'not measured'};process.exitCode=1;}
  const target=join(ROOT,OUTPUT);mkdirSync(dirname(target),{recursive:true});
  writeFileSync(target,JSON.stringify(result,null,2)+'\n');
  console.log('[f3-safari-audio] '+JSON.stringify(result));
}
