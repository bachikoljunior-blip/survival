import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {exportFrameWorkReport} from './candidate/tools/export-ios-frame-work.mjs';
const root=mkdtempSync(resolve('main-integration-c36/export-fixture-'));
mkdirSync(join(root,'test-results/ios-safari'),{recursive:true});mkdirSync(join(root,'tools'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const env={CINDERLINE_IOS_FRAME_WORK_CAPTURE:'1',GITHUB_EVENT_NAME:'push',
 GITHUB_REF:'refs/heads/claude/repo-instructions-constraints-r0070m',GITHUB_RUN_ATTEMPT:'1',
 GITHUB_WORKFLOW:'Floor gates',GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'12345'};
const provenance={runCommit:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,runAttempt:'1'};
for(const [file,key]of [['ios_audio_capture.mjs','helperSha256'],['test-ios-safari.mjs','harnessSha256'],['frame_work_probe.mjs','frameWorkProbeSha256']]){
 const b=readFileSync(new URL('candidate/tools/'+file,import.meta.url));writeFileSync(join(root,'tools',file),b);provenance[key]=hash(b);
}
const original={status:'failed',failures:['SYNTHETIC fixture acquisition error'],audioCapture:{provenance},
 safariFrameWork:{provenance,complete:false,rows:[{fixture:true}]},fixturePadding:'検査'.repeat(4000)};
const target=join(root,'test-results/ios-safari/report.json');
const reset=()=>writeFileSync(target,JSON.stringify(original));reset();
const results=[];
function check(name,fn){fn();results.push({name,passed:true});}
check('failed diagnostic original bytes round-trip with contiguous chunks and matching end identity',()=>{
 const output=[];const meta=exportFrameWorkReport(root,env,x=>output.push(x));
 const start=JSON.parse(output[0].slice('[ios-frame-work-meta] '.length)),end=JSON.parse(output.at(-1).slice('[ios-frame-work-end] '.length));
 assert.deepEqual(start,end);assert.deepEqual(start,meta);assert.equal(start.diagnosticStatus,'failed');
 const chunks=output.slice(1,-1).map(x=>JSON.parse(x.slice('[ios-frame-work-chunk] '.length)));
 let offset=0;for(const [index,c]of chunks.entries()){assert.equal(c.index,index);assert.equal(c.offset,offset);assert.equal(c.total,chunks.length);const b=Buffer.from(c.base64,'base64');assert.ok(b.length<=3000);offset+=b.length;}
 const rebuilt=Buffer.concat(chunks.map(c=>Buffer.from(c.base64,'base64')));assert.deepEqual(rebuilt,readFileSync(target));assert.equal(hash(rebuilt),start.sha256);assert.equal(offset,start.bytes);
});
for(const [key,value]of [['CINDERLINE_IOS_FRAME_WORK_CAPTURE','0'],['GITHUB_EVENT_NAME','pull_request'],['GITHUB_REF','refs/heads/main'],['GITHUB_RUN_ATTEMPT','2'],['GITHUB_WORKFLOW','Mobile Safari simulator'],['GITHUB_SHA','bad'],['GITHUB_RUN_ID','0']])
 check('reject '+key+' before any byte emits',()=>{let count=0;assert.throws(()=>exportFrameWorkReport(root,{...env,[key]:value},()=>count++));assert.equal(count,0);});
check('reject wrong original run before output',()=>{const b=JSON.parse(JSON.stringify(original));b.audioCapture.provenance.runId='99';writeFileSync(target,JSON.stringify(b));let n=0;assert.throws(()=>exportFrameWorkReport(root,env,()=>n++),/runId/);assert.equal(n,0);reset();});
check('reject wrong frame-work provenance before output',()=>{const b=JSON.parse(JSON.stringify(original));b.safariFrameWork.provenance.frameWorkProbeSha256='0'.repeat(64);writeFileSync(target,JSON.stringify(b));let n=0;assert.throws(()=>exportFrameWorkReport(root,env,()=>n++),/Frame-work provenance/);assert.equal(n,0);reset();});
check('missing frame-work snapshot still exports the exact original failure report',()=>{const b=JSON.parse(JSON.stringify(original));delete b.safariFrameWork;writeFileSync(target,JSON.stringify(b));const m=exportFrameWorkReport(root,env,()=>{});assert.equal(m.frameWorkPresent,false);assert.equal(m.diagnosticStatus,'failed');reset();});
check('oversize report emits no partial payload',()=>{writeFileSync(target,Buffer.alloc(8*1024*1024+1,32));let n=0;assert.throws(()=>exportFrameWorkReport(root,env,()=>n++),/capacity/);assert.equal(n,0);reset();});
const report={scope:'Synthetic transport fixtures using exact candidate source bytes, not a new Safari report or recording.',passed:results.length,failed:0,results,exporterSha256:hash(readFileSync(new URL('candidate/tools/export-ios-frame-work.mjs',import.meta.url)))};
writeFileSync(new URL('diagnostic-export-verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:0,exporterSha256:report.exporterSha256}));
