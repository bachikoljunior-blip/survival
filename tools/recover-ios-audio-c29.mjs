/** Validate and export the original C29 Safari report and production recordings.
 * Used after the official download-artifact action in a read-only CI job. No
 * browser, recording, token handling, remote write or quality judgment occurs. */
import { readFileSync,writeFileSync,mkdirSync,copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve,dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PIN=Object.freeze({artifactId:10349183915,runId:34848677647,
  commit:'f735a3ab6d230835ce06542281e2f53e3ad94737',
  artifactName:'iphone-se3-mobile-safari-f735a3ab6d230835ce06542281e2f53e3ad94737',
  artifactBytes:11456615,artifactDigest:'sha256:20b505c38fc2daf58c205ec3cc60d3f6c44924e51fa77ce52d244f5f1d6f225d',
  bundle:'6b887bc1cf6ebc0b7fae6c146e46c05d067ad5ba51544fd218d17e8483ea338b',
  recorder:'86c1d9c9a0b0eeac3d947aad3d99d25272d3eeaa',
  helper:'3ed2398a23f94c6426bc30eed6ef9123b24d79b99978ec3de01866d186c73e40',
  harness:'ca130ee34963cd1b17b02519b6f013f7c0f1851529bfcee5e4dd072c4fec4779'});
export const CLIPS=Object.freeze([
  {name:'street-walk',bytes:5616926,sha256:'df42d626bfee8aa96060d6c84f64cd0c0eac0ab861e574eea8db87539c0fd652'},
  {name:'vent-air',bytes:1876895,sha256:'18e3c108d767fd0e41202d0a91a69d8963f9ca417fd9d9c77b924672f95036f6'},
  {name:'arcade-room',bytes:1609289,sha256:'1bb5ceacc225fb9d57baf4f02b77f709790bc5bcf50bbd08c9b23e52107d99da'},
]);
const BASE='test-results/ios-c29-original-recovery-r1';
const MAX_FILE=16*1024*1024,MAX_TOTAL=32*1024*1024;
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validateMetadata(meta){
  if(meta.id!==PIN.artifactId || meta.name!==PIN.artifactName || meta.size_in_bytes!==PIN.artifactBytes
    || meta.digest!==PIN.artifactDigest || meta.expired!==false || meta.workflow_run?.id!==PIN.runId
    || meta.workflow_run?.head_sha!==PIN.commit)throw Error('Original artifact metadata mismatch');
}
export function validateReport(report){
  const capture=report.audioCapture,p=capture?.provenance;
  if(report.status!=='passed' || report.failures?.length!==0 || !Array.isArray(report.checks)
    || report.checks.some(c=>c.passed!==true) || capture?.status!=='captured')throw Error('Original successful acquisition report missing');
  if(p?.runCommit!==PIN.commit || String(p.runId)!==String(PIN.runId) || String(p.runAttempt)!=='1'
    || p.actualRecorderBlob!==PIN.recorder || p.helperSha256!==PIN.helper || p.harnessSha256!==PIN.harness
    || p.actualBundleHashes?.['cinderline.1.0.0.js']!==PIN.bundle
    || p.actualBundleHashes?.['dist/cinderline.1.0.0.js']!==PIN.bundle)throw Error('Original acquisition provenance mismatch');
  if(capture.clips?.length!==3)throw Error('Original clip set is incomplete');
  for(const pin of CLIPS){
    const matches=capture.clips.filter(c=>c.name===pin.name);if(matches.length!==1)throw Error('Duplicate/missing original clip');
    const c=matches[0];
    if(c.path!==`test-results/ios-safari/audio/audio-${pin.name}.mp4` || c.bytes!==pin.bytes || c.sha256!==pin.sha256
      || c.timing?.captureClockGuardPassed!==true || c.timing?.telemetryComplete!==true)throw Error('Original clip record differs from preserved CI log');
  }
  return capture;
}
export function recover(root,emit=line=>console.log(line)){
  const output=join(root,BASE),input=join(output,'input');mkdirSync(output,{recursive:true});
  const result={schemaVersion:1,sourceArtifactId:PIN.artifactId,sourceRunId:PIN.runId,sourceCommit:PIN.commit,
    recoveryCommit:process.env.GITHUB_SHA||null,recoveryRunId:process.env.GITHUB_RUN_ID||null,
    status:'started',files:[],scope:'Recovery of existing original C29 bytes only; no rerecording, playback, decoding or blind comparison.'};
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
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  if(process.argv.includes('--metadata-only'))validateMetadata(JSON.parse(readFileSync(join(root,BASE,'artifact-metadata.json'),'utf8')));
  else recover(root);
}
