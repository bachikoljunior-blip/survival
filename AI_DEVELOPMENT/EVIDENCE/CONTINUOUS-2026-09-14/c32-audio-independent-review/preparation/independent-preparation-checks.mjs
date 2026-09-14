import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {prepare,exportPrepared,FILES,hash,gitBlob,verifyInputs} from './prepare-audio-product.mjs';
import {verifyInputs as oldVerifyInputs} from './prepare-grain-product.mjs';
const checks=[];function check(name,fn){fn();checks.push({name,passed:true});}
check('all input-verification logic remains byte-identical to successful predecessor',()=>assert.equal(verifyInputs.toString(),oldVerifyInputs.toString()));
check('Git blob framing uses actual NUL',()=>assert.equal(gitBlob(Buffer.alloc(0)),'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'));
const root=resolve(mkdtempSync('failed-preparation-fixture-'));
execFileSync('git',['init','-q'],{cwd:root});
execFileSync('git',['-c','user.name=CPU fixture','-c','user.email=fixture@example.invalid','commit','--allow-empty','-qm','isolated failure fixture'],{cwd:root});
check('wrong 47-file input set fails with preserved report before any source write',()=>{
  assert.throws(()=>prepare(root),/Unexpected build-input file set/);
  const report=JSON.parse(readFileSync(join(root,'test-results/audio-product-build-r1/report.json')));
  assert.equal(report.status,'preparation failed; no product commit');assert.deepEqual(report.files,[]);assert.deepEqual(report.commands,[]);
  const emitted=[];assert.throws(()=>exportPrepared(root,l=>emitted.push(l)),/No completed build/);assert.equal(emitted.length,0);
});
const transport=resolve(mkdtempSync('bounded-export-fixture-')),out=join(transport,'test-results/audio-product-build-r1');mkdirSync(out,{recursive:true});
const files=FILES.map((path,i)=>{const bytes=Buffer.alloc(i===FILES.length-1?4*1024*1024+1:0),output=path.replaceAll('/','__');writeFileSync(join(out,output),bytes);return {path,output,bytes:bytes.length,sha256:hash(bytes),gitBlob:gitBlob(bytes)};});
writeFileSync(join(out,'report.json'),JSON.stringify({status:'prepared and content/root verified',sourceCommit:'synthetic cap fixture',files}));
check('last exact-hash file over 4 MiB cap refuses before first export',()=>{const emitted=[];assert.throws(()=>exportPrepared(transport,l=>emitted.push(l)),/Bounded export size/);assert.equal(emitted.length,0);});
writeFileSync('independent-preparation-results.json',JSON.stringify({scope:'Only source-equivalence, early failed preparation/report retention, and complete pre-emission export cap CPU checks. No product build or CI.',checks,fixtures:{failedPreparation:root,capExport:transport}},null,2)+'\n');
console.log(JSON.stringify({checks:checks.length,passed:true,fixtures:{failedPreparation:root,capExport:transport}}));
