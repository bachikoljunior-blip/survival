import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {validateReport,validateMetadata,recover} from '../candidate/tools/recover-ios-audio-c29.mjs';
import {exportPrepared,FILES,hash,gitBlob} from '../candidate/tools/prepare-grain-product.mjs';
const checks=[];const check=(name,fn)=>{fn();checks.push({name,passed:true});};
const summary=JSON.parse(readFileSync('main-integration-c30/evidence/ios-r1-log-summary.json'));
// Explicitly a lossless projection of known acquisition fields, not a recovered full report.
const report={status:summary.status,checks:summary.checks,failures:summary.failures,audioCapture:{status:summary.captureStatus,provenance:summary.provenance,clips:summary.clips}};
const metadata=JSON.parse(readFileSync('root-ultra-v2-handoff/c29-ci-fourth.json')).ios_artifacts.artifacts[0];
check('preserved official metadata pins',()=>validateMetadata(metadata));
check('actual log summary fields under original full-report schema',()=>validateReport(report));
for(const [label,change] of [['artifact head',r=>r.workflow_run.head_sha='0'.repeat(40)],['expired',r=>r.expired=true],['archive digest',r=>r.digest='sha256:bad']])check(label+' rejected',()=>{const r=structuredClone(metadata);change(r);assert.throws(()=>validateMetadata(r));});
for(const [label,change] of [['wrong recorder',r=>r.audioCapture.provenance.actualRecorderBlob='bad'],['missing clip',r=>r.audioCapture.clips.pop()],['duplicate clip',r=>r.audioCapture.clips[2]=r.audioCapture.clips[0]],['failed clock',r=>r.audioCapture.clips[0].timing.captureClockGuardPassed=false]])check(label+' rejected',()=>{const r=structuredClone(report);change(r);assert.throws(()=>validateReport(r));});
const root=mkdtempSync('main-integration-c30/evidence/transport-fixture-');
try{
 const base=join(root,'test-results/ios-c29-original-recovery-r1');mkdirSync(join(base,'input/audio'),{recursive:true});
 writeFileSync(join(base,'artifact-metadata.json'),JSON.stringify(metadata));writeFileSync(join(base,'input/report.json'),JSON.stringify(report));writeFileSync(join(base,'input/audio/audio-street-walk.mp4'),'synthetic invalid bytes');
 check('wrong raw media fails before any successful export',()=>{const lines=[];assert.throws(()=>recover(root,line=>lines.push(line)));assert.equal(lines.length,0);assert.equal(JSON.parse(readFileSync(join(base,'recovery-report.json'))).status,'original recovery failed');});
 const out=join(root,'test-results/grain-product-build-r1');mkdirSync(out,{recursive:true});
 const files=FILES.map((path,i)=>{const bytes=Buffer.alloc(i===0?6007:i===6?0:9,i+1),output=path.replaceAll('/','__');writeFileSync(join(out,output),bytes);return{path,output,bytes:bytes.length,sha256:hash(bytes),gitBlob:gitBlob(bytes)};});
 const prep={status:'prepared and content/root verified',sourceCommit:'synthetic transport fixture only',files};writeFileSync(join(out,'report.json'),JSON.stringify(prep));
 check('complete export offsets, 3000-byte boundaries, zero-byte blob and SHA roundtrip',()=>{
  const lines=[];exportPrepared(root,line=>lines.push(line));const captured=new Map();
  for(const line of lines){const [,kind,json]=line.match(/^\[prepared-grain-(meta|chunk|end)\] (.*)$/);const item=JSON.parse(json);
   if(kind==='meta'){assert(!captured.has(item.file));captured.set(item.file,{meta:item,parts:[],offset:0});}
   else {const c=captured.get(item.file);assert(c);if(kind==='chunk'){assert.equal(item.offset,c.offset);const b=Buffer.from(item.base64,'base64');assert(b.length<=3000);c.parts.push(b);c.offset+=b.length;}else{assert.deepEqual(item,c.meta);const b=Buffer.concat(c.parts);assert.equal(b.length,item.bytes);assert.equal(hash(b),item.sha256);assert.equal(gitBlob(b),item.gitBlob);c.end=true;}}
  }assert.equal(captured.size,8);assert([...captured.values()].every(c=>c.end));
 });
 check('last prepared file corruption causes zero partial export',()=>{writeFileSync(join(out,files.at(-1).output),'bad');const lines=[];assert.throws(()=>exportPrepared(root,line=>lines.push(line)));assert.equal(lines.length,0);});
}finally{rmSync(root,{recursive:true,force:true});}
writeFileSync('main-integration-c30/evidence/transport-controls.json',JSON.stringify({scope:'CPU metadata and complete transport controls; no original iOS media recovered and no production build executed',checks},null,2)+'\n');
console.log(JSON.stringify({passed:checks.length,checks},null,2));
