import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {INPUTS,SOURCE,CANDIDATE_SOURCE,ORIGINAL_BUNDLE,changedSource,FILES,hash,gitBlob,exportPrepared} from './candidate/tools/prepare-audio-product.mjs';
const checks=[];const check=(name,fn)=>{fn();checks.push({name,passed:true});};
const old=readFileSync('ios-audio-content-diagnosis-ultra/source/src/audio/audio.js');
const candidate=readFileSync('audio-product-build-prep-ultra/candidate/tools/candidates/audio-interior-r1.js');
check('original exact audio and candidate bytes accepted',()=>assert.deepEqual(changedSource(old,candidate),candidate));
check('changed original audio rejected',()=>assert.throws(()=>changedSource(Buffer.concat([old,Buffer.from(' ')]),candidate)));
check('changed candidate rejected',()=>assert.throws(()=>changedSource(old,Buffer.concat([candidate,Buffer.from(' ')]))));
check('current root and postfx are exact adopted C31',()=>{
 assert.equal(hash(readFileSync('c30-grain-product-prepared/original/cinderline.1.0.0.js')),ORIGINAL_BUNDLE);
 assert.equal(hash(readFileSync('c30-grain-product-prepared/original/src/render/postfx.js')),INPUTS['src/render/postfx.js']);
 assert.equal(hash(candidate),CANDIDATE_SOURCE);
});
check('47 inputs change only adopted postfx baseline',()=>{
 const report=JSON.parse(readFileSync('c30-grain-product-prepared/original/report.json'));
 assert.equal(Object.keys(INPUTS).length,47);assert.deepEqual(Object.keys(INPUTS),Object.keys(report.inputs));
 for(const [path,pin] of Object.entries(INPUTS))assert.equal(pin,path==='src/render/postfx.js'?'b9a4f9422242d27c329b77e6502f251281fddf80a6a62880202adc2040ce1a5a':report.inputs[path].sha256);
});
const root=mkdtempSync('audio-product-build-prep-ultra/transport-fixture-');
try{
 const out=join(root,'test-results/audio-product-build-r1');mkdirSync(out,{recursive:true});
 const files=FILES.map((path,i)=>{const bytes=Buffer.alloc(i===0?6007:i===6?0:9,i+1),output=path.replaceAll('/','__');writeFileSync(join(out,output),bytes);return{path,output,bytes:bytes.length,sha256:hash(bytes),gitBlob:gitBlob(bytes)};});
 const prep={status:'prepared and content/root verified',sourceCommit:'synthetic transport fixture only',files};writeFileSync(join(out,'report.json'),JSON.stringify(prep));
 check('complete output with zero bytes and chunk boundaries roundtrips',()=>{
  const lines=[];exportPrepared(root,line=>lines.push(line));const captured=new Map();
  for(const line of lines){const [,kind,json]=line.match(/^\[prepared-audio-(meta|chunk|end)\] (.*)$/);const item=JSON.parse(json);
   if(kind==='meta'){assert(!captured.has(item.file));captured.set(item.file,{meta:item,parts:[],offset:0});}
   else {const c=captured.get(item.file);assert(c);if(kind==='chunk'){assert.equal(item.offset,c.offset);const b=Buffer.from(item.base64,'base64');assert(b.length<=3000);c.parts.push(b);c.offset+=b.length;}else{assert.deepEqual(item,c.meta);const b=Buffer.concat(c.parts);assert.equal(b.length,item.bytes);assert.equal(hash(b),item.sha256);assert.equal(gitBlob(b),item.gitBlob);c.end=true;}}
  }assert.equal(captured.size,8);assert([...captured.values()].every(c=>c.end));
 });
 check('last file corruption rejected before first export',()=>{writeFileSync(join(out,files.at(-1).output),'bad');const lines=[];assert.throws(()=>exportPrepared(root,line=>lines.push(line)));assert.equal(lines.length,0);});
}finally{rmSync(root,{recursive:true,force:true});}
writeFileSync('audio-product-build-prep-ultra/verification.json',JSON.stringify({scope:'CPU source and complete export boundaries only; actual candidate build and listening unmeasured',checks},null,2)+'\n');
console.log(JSON.stringify({passed:checks.length,checks}));
