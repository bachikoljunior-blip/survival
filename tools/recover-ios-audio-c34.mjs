/** Validate and export the original C34 Safari report and production recordings.
 * Used after the official download-artifact action in a read-only CI job. No
 * browser, recording, token handling, remote write or quality judgment occurs. */
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deepStrictEqual } from 'node:assert';
import { resolve,dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PIN=Object.freeze({artifactId:10357143198,runId:34866156884,
  commit:'81de9354117a54397bf2c9e64e18a91c397dd06a',
  artifactName:'iphone-se3-mobile-safari-81de9354117a54397bf2c9e64e18a91c397dd06a',
  artifactBytes:13304946,artifactDigest:'sha256:e5a88dfd8818a3d79092683043343e851d7d71c56e5ec61fb983ceb49e90fdb3',
  bundle:'514f671fa64b75dda7f835a430245e9b168f9aca38fbce0b8184b12938679a55',
  recorder:'785541d3beaed0e35e8bcf042973eabb7bdb5d6c',
  helper:'1b3bc6fd170473c5f4ee9276699c51d12852f1ae1bd132c80ec6b00824cdf819',
  summarySha256:'43ca3a6ba708c6ae7284b9142b33ef633e78fbe08ed0f0fc1f566b84fcc7ac5f',
  harness:'ca130ee34963cd1b17b02519b6f013f7c0f1851529bfcee5e4dd072c4fec4779'});
export const CLIPS=Object.freeze([
  {name:'street-walk',bytes:5358430,sha256:'0d8de149dcbda05affacbd61d71939ac3e916247c83651b23094ce7655834607',clockGuardPassed:false},
  {name:'cut-gas-air',bytes:2911713,sha256:'ddc4dbc677da7c51f5eedafa8b04133af0722d39e233a40b1fd52c1c0342ce67',clockGuardPassed:true},
  {name:'arcade-room',bytes:1328121,sha256:'92ba5564206d976a6f9d689a8b5656e18544ac7d681373fc34697798f4a5d586',clockGuardPassed:true},
]);
const BASE='test-results/ios-c34-original-recovery-r1';
const MAX_FILE=16*1024*1024,MAX_TOTAL=32*1024*1024;
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validateMetadata(meta){
  if(meta.id!==PIN.artifactId || meta.name!==PIN.artifactName || meta.size_in_bytes!==PIN.artifactBytes
    || meta.digest!==PIN.artifactDigest || meta.expired!==false || meta.workflow_run?.id!==PIN.runId
    || meta.workflow_run?.head_sha!==PIN.commit)throw Error('Original artifact metadata mismatch');
}
export function validateReport(report){
  const capture=report.audioCapture,p=capture?.provenance;
  const expectedBytes=readFileSync(new URL('./candidates/c34-ios-source-summary.json',import.meta.url));
  if(sha(expectedBytes)!==PIN.summarySha256)throw Error('Preserved C34 summary bytes changed');
  // Match the exact original log projection, including every failure and the
  // unrun lifecycle. JSON normalization mirrors the source log's omission of
  // undefined fields; the original reportBytes are never serialized for export.
  deepStrictEqual(JSON.parse(JSON.stringify(iosAudioLogSummary(report))),JSON.parse(expectedBytes),
    'Original C34 report differs from the preserved failed source summary');
  if(p?.runCommit!==PIN.commit || String(p.runId)!==String(PIN.runId) || String(p.runAttempt)!=='1'
    || p.actualRecorderBlob!==PIN.recorder || p.helperSha256!==PIN.helper || p.harnessSha256!==PIN.harness
    || p.actualBundleHashes?.['cinderline.1.0.0.js']!==PIN.bundle
    || p.actualBundleHashes?.['dist/cinderline.1.0.0.js']!==PIN.bundle)throw Error('Original acquisition provenance mismatch');
  if(capture.clips?.length!==3)throw Error('Original clip set is incomplete');
  for(const pin of CLIPS){
    const matches=capture.clips.filter(c=>c.name===pin.name);if(matches.length!==1)throw Error('Duplicate/missing original clip');
    const c=matches[0];
    if(c.path!==`test-results/ios-safari/audio/audio-${pin.name}.mp4` || c.bytes!==pin.bytes || c.sha256!==pin.sha256
      || c.timing?.captureClockGuardPassed!==pin.clockGuardPassed || c.timing?.telemetryComplete!==true)throw Error('Original clip record differs from preserved CI log');
  }
  return capture;
}
export function recover(root,emit=line=>console.log(line)){
  const output=join(root,BASE),input=join(output,'input');mkdirSync(output,{recursive:true});
  const result={schemaVersion:1,sourceArtifactId:PIN.artifactId,sourceRunId:PIN.runId,sourceCommit:PIN.commit,
    recoveryCommit:process.env.GITHUB_SHA||null,recoveryRunId:process.env.GITHUB_RUN_ID||null,
    status:'started',files:[],scope:'Recovery of existing original failed C34 bytes only; acquisition remains failed and lifecycle remains not run. No rerecording, playback, decoding or blind comparison.'};
  try{
    validateMetadata(JSON.parse(readFileSync(join(output,'artifact-metadata.json'),'utf8')));
    const reportBytes=readFileSync(join(input,'report.json'));validateReport(JSON.parse(reportBytes));
    const files=[{file:'report.json',bytes:reportBytes},...CLIPS.map(pin=>{
      const file=`audio/audio-${pin.name}.mp4`,bytes=readFileSync(join(input,file));
      if(bytes.length!==pin.bytes || sha(bytes)!==pin.sha256)throw Error('Original media bytes differ: '+file);
      return {file,bytes};
    })];
    if(files.some(f=>f.bytes.length>MAX_FILE) || files.reduce((n,f)=>n+f.bytes.length,0)>MAX_TOTAL)throw Error('Original media exceeds complete export limits');
    // Check every original byte before emitting any part of a successful set.
    for(const {file,bytes} of files){
      const dest=file.replaceAll('/','__');writeFileSync(join(output,dest),bytes);
      result.files.push({file,output:dest,bytes:bytes.length,sha256:sha(bytes)});
    }
    result.status='original bytes verified and prepared for export';
    const resultBytes=Buffer.from(JSON.stringify(result,null,2)+'\n');
    for(const {file,bytes} of [...files,{file:'recovery-report.json',bytes:resultBytes}]){
      const meta={file,bytes:bytes.length,sha256:sha(bytes),sourceArtifactId:PIN.artifactId,sourceCommit:PIN.commit,complete:true};
      emit('[ios-original-meta] '+JSON.stringify(meta));
      for(let offset=0;offset<bytes.length;offset+=3000)emit('[ios-original-chunk] '+JSON.stringify({file,offset,base64:bytes.subarray(offset,offset+3000).toString('base64')}));
      emit('[ios-original-end] '+JSON.stringify(meta));
    }
  }catch(error){result.status='original recovery failed';result.error=String(error);throw error;}
  finally{writeFileSync(join(output,'recovery-report.json'),JSON.stringify(result,null,2)+'\n');}
}
// Copied byte-for-byte from the pinned source helper 1b3bc6fd; no browser import.
export function iosAudioLogSummary(report) {
  return { status: report.status, checks: report.checks, failures: report.failures,
    capabilities: report.safariAudioCapabilities, provenance: report.audioCapture?.provenance,
    lifecycle: report.audioCapture?.lifecycle,
    captureStatus: report.audioCapture?.status, comparison: report.audioCapture?.comparison,
    clips: (report.audioCapture?.clips || []).map(clip => ({ name: clip.name, path: clip.path,
      bytes: clip.bytes, sha256: clip.sha256, mime: clip.mime, timing: clip.timing,
      tracks: clip.before?.tracks })) };
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  if(process.argv.includes('--metadata-only'))validateMetadata(JSON.parse(readFileSync(join(root,BASE,'artifact-metadata.json'),'utf8')));
  else recover(root);
}
