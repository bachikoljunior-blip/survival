/** Bounded CPU fixtures only. No product build, browser, screenshot or CI. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { INPUTS, CANDIDATES, SOURCES, FILES, ORIGINAL_BUNDLE, verifyInputs, changedSources, hash, gitBlob, exportPrepared } from './candidate/tools/prepare-narrative-product.mjs';
import { verifySourceRoutes, exportRouteArtifacts } from './candidate/tools/check-narrative-routes.mjs';
const base=dirname(fileURLToPath(import.meta.url)), baseline=join(base,'baseline'), fixture=join(base,'fixture');
const controls=[];
async function check(name,fn){await fn();controls.push({name,passed:true});}
const before=new Map(SOURCES.map(path=>[path,readFileSync(join(baseline,path))]));
const candidate=new Map(SOURCES.map(path=>[path,readFileSync(join(base,'candidate',CANDIDATES[path].file))]));
await check('All 47 official C39 input bytes accepted; root is actual adopted 8c',()=>{
 assert.equal(Object.keys(verifyInputs(baseline)).length,47);
 assert.equal(hash(readFileSync(join(baseline,'cinderline.1.0.0.js'))),ORIGINAL_BUNDLE);
});
await check('Both frozen journal candidate files accepted byte-exactly',()=>{
 const result=changedSources(before,candidate);assert.equal(result.size,2);
 for(const [path,bytes]of result)assert(bytes.equals(candidate.get(path)));
});
await check('Old period strings rejected as candidate',()=>assert.throws(()=>changedSources(before,before),/Unreviewed candidate source/));
for(const path of SOURCES)await check('One-byte candidate drift rejected: '+path,()=>{
 const changed=new Map(candidate);const bytes=Buffer.from(changed.get(path));bytes[0]^=1;changed.set(path,bytes);
 assert.throws(()=>changedSources(before,changed),/Unreviewed candidate source/);
});
await check('Missing, extra and reversed source sets rejected',()=>{
 for(const entries of [[...candidate].slice(0,1),[...candidate,['src/extra.js',Buffer.alloc(0)]],[...candidate].reverse()])
  assert.throws(()=>changedSources(before,new Map(entries)),/Unexpected candidate source set/);
});
await check('Already modified sources rejected as reproduction baseline',()=>assert.throws(()=>changedSources(candidate,candidate),/Unreviewed source baseline/));
await check('Only the three already-adopted source pins change in baseline INPUTS; remaining 44 identical',()=>{
 const old=readFileSync(join(base,'canonical/tools/prepare-narrative-product.mjs'),'utf8');
 const pins=JSON.parse(old.match(/export const INPUTS = Object.freeze\((\{[\s\S]*?\})\);/)[1]);
 assert.deepEqual(Object.keys(INPUTS),Object.keys(pins));
 assert.deepEqual(Object.keys(INPUTS).filter(p=>INPUTS[p]!==pins[p]).sort(),['src/content/locale/ja/story.js','src/content/locale/ja/story2.js','src/content/story.js']);
});
cpSync(baseline,fixture,{recursive:true});
await check('Baseline period cannot pass journal source admission',async()=>assert.rejects(verifySourceRoutes(fixture),/Unexpected candidate input/));
for(const [path,bytes]of candidate)writeFileSync(join(fixture,path),bytes);
let rows;
await check('Both full merged English/Japanese journal translation routes pass',async()=>{
 rows=await verifySourceRoutes(fixture);assert.equal(rows.length,2);
 assert(rows[0].expectedDisplay.includes('two years and ten months'));
 assert(rows[1].expectedDisplay.includes('2年10か月'));
});
await check('Real DialogueRunner.goto applies exactly one stored Iris journal entry in each locale',async()=>{
 const {DialogueRunner}=await import(pathToFileURL(join(fixture,'src/game/narrative.js')));
 const {GameState}=await import(pathToFileURL(join(fixture,'src/game/state.js')));
 const {CONVERSATIONS}=await import(pathToFileURL(join(fixture,'src/content/story.js')));
 const {setLocale}=await import(pathToFileURL(join(fixture,'src/content/i18n.js')));
 for(const row of rows){
  setLocale(row.language);const state=new GameState();const runner=new DialogueRunner(state,null);
  runner.start(CONVERSATIONS.iris_first);assert.equal(state.journal.filter(j=>j.id==='iris').length,0);
  runner.goto('i_gives');const entries=state.journal.filter(j=>j.id==='iris');
  assert.equal(entries.length,1);assert.equal(hash(entries[0].text),row.sourceSha256);
  assert.equal(runner.node.id,'i_gives');runner.finish();assert.equal(runner.active,false);
 }
 setLocale('en');
});
await check('Single non-target input mutation refuses localized-route admission',async()=>{
 const p=join(fixture,'src/audio/audio.js'),b=readFileSync(p);
 try{writeFileSync(p,Buffer.concat([b,Buffer.from(' ')]));await assert.rejects(verifySourceRoutes(fixture),/Unexpected candidate input/);}
 finally{writeFileSync(p,b);}
});
const output=join(fixture,'test-results/journal-product-build-r1');mkdirSync(output,{recursive:true});
// Transport-only fixture uses the existing 8c root, never a guessed new bundle.
const expected=new Map(FILES.map(path=>[path,candidate.get(path)||readFileSync(join(baseline,path))]));
function preparedFixture(){
 const report={fixtureOnly:true,actualBuild:false,status:'prepared and content/root verified',sourceCommit:'a'.repeat(40),files:[]};
 for(const [path,bytes]of expected){const file=path.replaceAll('/','__');writeFileSync(join(output,file),bytes);report.files.push({path,output:file,bytes:bytes.length,sha256:hash(bytes),gitBlob:gitBlob(bytes)});}
 writeFileSync(join(output,'report.json'),JSON.stringify(report)+'\n');return report;
}
await check('Prepared export now round-trips exactly nine files, including empty file and contiguous chunks',()=>{
 preparedFixture();const lines=[];exportPrepared(fixture,line=>lines.push(line));
 const all=new Map([...expected,['report.json',readFileSync(join(output,'report.json'))]]);let active=null;const done=[];
 for(const line of lines){const m=/^\[prepared-narrative-(meta|chunk|end)\] (.*)$/.exec(line);assert(m);const item=JSON.parse(m[2]);
  if(m[1]==='meta'){assert.equal(active,null);active={meta:item,bytes:[],offset:0};}
  else if(m[1]==='chunk'){assert.equal(item.file,active.meta.file);assert.equal(item.offset,active.offset);const bytes=Buffer.from(item.base64,'base64');assert(bytes.length<=3000);active.bytes.push(bytes);active.offset+=bytes.length;}
  else{assert.deepEqual(item,active.meta);const bytes=Buffer.concat(active.bytes);assert(bytes.equals(all.get(item.file)));assert.equal(hash(bytes),item.sha256);assert.equal(gitBlob(bytes),item.gitBlob);assert.equal(bytes.length,item.bytes);done.push(item.file);active=null;}
 }
 assert.equal(active,null);assert.deepEqual(done,[...FILES,'report.json']);assert.equal(done.length,9);
});
await check('Prepared corruption rejects before first export byte',()=>{
 preparedFixture();writeFileSync(join(output,'.nojekyll'),'corrupt');const lines=[];assert.throws(()=>exportPrepared(fixture,x=>lines.push(x)),/Prepared file changed/);assert.equal(lines.length,0);
});
await check('Prepared file above unchanged 4 MiB cap rejects before first export byte',()=>{
 const report=preparedFixture(),bytes=Buffer.alloc(4*1024*1024+1);
 Object.assign(report.files.at(-1),{bytes:bytes.length,sha256:hash(bytes),gitBlob:gitBlob(bytes)});
 writeFileSync(join(output,'.nojekyll'),bytes);writeFileSync(join(output,'report.json'),JSON.stringify(report));
 const lines=[];assert.throws(()=>exportPrepared(fixture,x=>lines.push(x)),/Bounded export size exceeded/);assert.equal(lines.length,0);
});
const routeOutput=join(fixture,'test-results/journal-route-r1');mkdirSync(routeOutput,{recursive:true});
const route={fixtureOnly:true,status:'passed',browserRequested:false,browserAttempted:false,browserExecuted:false,screens:[],sourceRoutes:rows.map(({expectedDisplay,...row})=>row)};
await check('Two-source-route CPU report exports; zero screenshots claimed',()=>{
 writeFileSync(join(routeOutput,'report.json'),JSON.stringify(route));const lines=[];exportRouteArtifacts(fixture,x=>lines.push(x));
 const metas=lines.filter(x=>x.startsWith('[narrative-route-meta] ')).map(x=>JSON.parse(x.slice('[narrative-route-meta] '.length)));
 assert.equal(metas.length,1);assert.equal(metas[0].file,'report.json');assert.equal(metas[0].screenCount,0);
});
await check('Successful browser report with missing two screenshots rejected before export',()=>{
 writeFileSync(join(routeOutput,'report.json'),JSON.stringify({...route,browserRequested:true,browserAttempted:true,browserExecuted:true}));
 const lines=[];assert.throws(()=>exportRouteArtifacts(fixture,x=>lines.push(x)),/Incomplete successful browser diagnostic/);assert.equal(lines.length,0);
});
await check('Wrong localized journal pin rejected before export',()=>{
 const wrong=structuredClone(route);wrong.sourceRoutes[1].textSha256='0'.repeat(64);writeFileSync(join(routeOutput,'report.json'),JSON.stringify(wrong));
 const lines=[];assert.throws(()=>exportRouteArtifacts(fixture,x=>lines.push(x)));assert.equal(lines.length,0);
});
preparedFixture();writeFileSync(join(routeOutput,'report.json'),JSON.stringify(route,null,2)+'\n');
const result={scope:'Bounded local CPU/source/real-runner and transport fixtures only',controls,passed:controls.length,actualBuild:false,browserExecuted:false,originalScreens:0,candidateBundleSha256:null,remoteMutations:0,newCI:0};
writeFileSync(join(base,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:controls.length,actualBuild:false,browserExecuted:false}));
