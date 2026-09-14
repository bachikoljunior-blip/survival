import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parseTransport } from './verify-recovered.mjs';
const HERE = dirname(fileURLToPath(import.meta.url)), WORK = resolve(HERE,'../..');
const candidate = join(WORK,'main-integration-c37/candidate');
const recovered = join(WORK,'c36-narrative-prepared-result-ultra/prepared-original');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const blob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const result = JSON.parse(readFileSync(join(HERE,'independent-verification.json')));
const tree = new Map(JSON.parse(readFileSync(join(HERE,'canonical-c36-tree.json'))).tree.map(x=>[x.path,x]));
const manifest = JSON.parse(readFileSync(join(WORK,'main-integration-c37/initial-candidate-manifest.json')));
const checks=[];function check(name,fn){fn();checks.push({name,passed:true});}
const expected=['src/content/story.js','src/content/locale/ja/story.js','src/content/locale/ja/story2.js','cinderline.1.0.0.js','tools/ios_audio_capture.mjs'];
function list(root,prefix=''){return readdirSync(root,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?list(join(root,entry.name),prefix+entry.name+'/'):[prefix+entry.name]);}
check('C37 candidate contains exactly the five authorized product/pin paths',()=>{assert.deepEqual(list(candidate).sort(),[...expected].sort());assert.deepEqual(manifest.candidateFiles.map(f=>f.path).sort(),[...expected].sort());assert.equal(manifest.baseCommit,result.run.head);});
const files=[];
check('all C37 manifest file hashes/blob IDs/lengths match actual candidate bytes',()=>{
 for(const entry of manifest.candidateFiles){const bytes=readFileSync(join(candidate,entry.path));assert.equal(bytes.length,entry.bytes);assert.equal(hash(bytes),entry.sha256);assert.equal(blob(bytes),entry.gitBlob);files.push({path:entry.path,bytes:bytes.length,sha256:hash(bytes),gitBlob:blob(bytes)});}
});
check('three sources and new root are byte-identical to independently decoded preparation outputs',()=>{for(const path of expected.slice(0,4))assert.deepEqual(readFileSync(join(candidate,path)),readFileSync(join(recovered,path)));});
const oldHelper=readFileSync(join(WORK,'main-integration-c36/payload/tools/ios_audio_capture.mjs'),'utf8');
const newHelper=readFileSync(join(candidate,'tools/ios_audio_capture.mjs'),'utf8');
check('IOS helper differs from canonical C36 only in the three exact preparation pins',()=>{
 assert.equal(blob(Buffer.from(oldHelper)),tree.get('tools/ios_audio_capture.mjs').sha);
 let wanted=oldHelper;
 for(const [key,value] of Object.entries(result.adoptionPins)){
  const pattern=new RegExp(`(  ${key}: ')[^']+(',)`,'g');assert.equal([...oldHelper.matchAll(pattern)].length,1);wanted=wanted.replace(pattern,(_,before,after)=>before+value+after);
 }
 assert.equal(newHelper,wanted);assert.equal(hash(Buffer.from(newHelper)),'0ac5b36321b1fdf3d87c6062cd7b070daa7d939f0e3d3e53574d4993320ee513');assert.equal(blob(Buffer.from(newHelper)),'457f3e1efcd596b102969c508dfa7f64e81a7b92');
});
const fixture=join(HERE,'ios-pin-fixture');mkdirSync(join(fixture,'tools'),{recursive:true});mkdirSync(join(fixture,'dist'),{recursive:true});
const modules=[['tools/mobile_audio_capture.mjs','c36-safari-time-loss-ultra/source/tools/mobile_audio_capture.mjs'],['tools/frame_work_probe.mjs','main-integration-c36/payload/tools/frame_work_probe.mjs'],['tools/test-ios-safari.mjs','main-integration-c36/payload/tools/test-ios-safari.mjs']];
const fixtureInputs=[];
for(const [path,origin] of modules){const bytes=readFileSync(join(WORK,origin));assert.equal(blob(bytes),tree.get(path).sha,'Fixture dependency differs from canonical C36');writeFileSync(join(fixture,path),bytes);fixtureInputs.push({path,canonicalGitBlob:blob(bytes),sha256:hash(bytes)});}
writeFileSync(join(fixture,'tools/ios_audio_capture.mjs'),newHelper);
const {IOS_AUDIO_PIN,verifyIosAudioBuild}=await import(pathToFileURL(join(fixture,'tools/ios_audio_capture.mjs')));
const newBundle=readFileSync(join(recovered,'cinderline.1.0.0.js')),oldBundle=readFileSync(join(WORK,'c36-narrative-build-ultra/baseline/cinderline.1.0.0.js'));
assert.equal(hash(oldBundle),'514f671fa64b75dda7f835a430245e9b168f9aca38fbce0b8184b12938679a55');
function bundles(rootBytes,distBytes){writeFileSync(join(fixture,'cinderline.1.0.0.js'),rootBytes);writeFileSync(join(fixture,'dist/cinderline.1.0.0.js'),distBytes);}
let acceptance;
check('actual unchanged pin guard accepts the exact recovered 1094 root and dist',()=>{bundles(newBundle,newBundle);acceptance=verifyIosAudioBuild(fixture);assert.deepEqual(IOS_AUDIO_PIN,{...result.adoptionPins,...result.preservePins});assert.equal(acceptance.actualBundleHashes['cinderline.1.0.0.js'],result.adoptionPins.bundleSha256);assert.equal(acceptance.actualBundleHashes['dist/cinderline.1.0.0.js'],result.adoptionPins.bundleSha256);assert.equal(acceptance.actualRecorderBlob,result.preservePins.recorderBlob);});
check('old 514f root and dist are rejected by the actual candidate guard',()=>{bundles(oldBundle,oldBundle);assert.throws(()=>verifyIosAudioBuild(fixture),/iOS audio build pin mismatch: cinderline\.1\.0\.0\.js/);});
check('old 514f root is rejected even with current 1094 dist',()=>{bundles(oldBundle,newBundle);assert.throws(()=>verifyIosAudioBuild(fixture),/iOS audio build pin mismatch: cinderline\.1\.0\.0\.js/);});
check('old 514f dist is rejected even with current 1094 root',()=>{bundles(newBundle,oldBundle);assert.throws(()=>verifyIosAudioBuild(fixture),/iOS audio build pin mismatch: dist/);});
check('unchanged recorder source pin rejects byte drift',()=>{bundles(newBundle,newBundle);const path=join(fixture,'tools/mobile_audio_capture.mjs'),bytes=readFileSync(path);writeFileSync(path,Buffer.concat([bytes,Buffer.from(' ')]));assert.throws(()=>verifyIosAudioBuild(fixture),/recorder\/clock-guard source pin mismatch/);writeFileSync(path,bytes);});
check('unchanged local DIST authority rejects an external URL without access',()=>{bundles(newBundle,newBundle);assert.throws(()=>verifyIosAudioBuild(fixture,'https://example.invalid'),/requires the existing harness DIST server/);});
check('current recovered bytes remain accepted after all refusal cases',()=>{const again=verifyIosAudioBuild(fixture);assert.deepEqual(again,acceptance);});
const raw=readFileSync(join(WORK,'c36-narrative-prepared-result-ultra/original-job.log'),'utf8'),lines=raw.split(/\r?\n/);
const firstChunk=lines.findIndex(line=>line.includes('[prepared-narrative-chunk] '));const firstEnd=lines.findIndex(line=>line.includes('[prepared-narrative-end] '));
check('independent transport parser rejects a missing raw chunk',()=>{const changed=[...lines];changed.splice(firstChunk,1);assert.throws(()=>parseTransport(changed.join('\n')),/chunk offset/);});
check('independent transport parser rejects a duplicated raw chunk',()=>{const changed=[...lines];changed.splice(firstChunk,0,changed[firstChunk]);assert.throws(()=>parseTransport(changed.join('\n')),/chunk offset/);});
check('independent transport parser rejects differing end metadata',()=>{const changed=[...lines];const index=changed[firstEnd].indexOf('{'),record=JSON.parse(changed[firstEnd].slice(index));record.sha256='0'.repeat(64);changed[firstEnd]=changed[firstEnd].slice(0,index)+JSON.stringify(record);assert.throws(()=>parseTransport(changed.join('\n')),/Metadata\/end mismatch/);});
check('independent transport parser rejects malformed base64',()=>{const changed=[...lines];const index=changed[firstChunk].indexOf('{'),record=JSON.parse(changed[firstChunk].slice(index));record.base64='%'+record.base64.slice(1);changed[firstChunk]=changed[firstChunk].slice(0,index)+JSON.stringify(record);assert.throws(()=>parseTransport(changed.join('\n')),/Invalid base64/);});
check('independent transport parser rejects a missing final end record',()=>{const changed=[...lines];const index=changed.findLastIndex(line=>line.includes('[narrative-route-end] '));changed.splice(index,1);assert.throws(()=>parseTransport(changed.join('\n')),/Truncated final/);});
const summary={status:'passed',scope:'Independent five-file C37 adoption candidate and actual IOS_AUDIO_PIN guard CPU checks, plus malformed transport refusal tests. Original source/raw files are read-only; all fixture writes stay in independent-review. No iOS capture, browser, build, CI, source adoption or remote mutation.',checks,total:checks.length,files,adoptionPins:result.adoptionPins,preservedPins:result.preservePins,fixtureInputs,actualAcceptedGuardReturn:acceptance,remoteMutations:0,sourceAdopted:false,actualBrowserExecutions:0,originalInputsModified:0};
writeFileSync(join(HERE,'adoption-and-guard-verification.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({status:summary.status,checks:summary.total,files:files.length,adoptionPins:summary.adoptionPins}));
