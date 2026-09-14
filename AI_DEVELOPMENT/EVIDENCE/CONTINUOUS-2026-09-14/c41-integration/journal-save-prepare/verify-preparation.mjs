/** Limited local source/Storage and synthetic-report controls; no product build or browser. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,cpSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {INPUTS,CANDIDATES,SOURCES,FILES,ORIGINAL_BUNDLE,verifyInputs,changedSources,hash} from './candidate/tools/prepare-narrative-product.mjs';
import {SCENARIOS,LEGACY_ENGLISH_TEXT,LEGACY_SAVE_KEY,verifySourceRoutes,verifyLegacyLoadEvidence,exportRouteArtifacts,TARGETS} from './candidate/tools/check-narrative-routes.mjs';
const root=dirname(fileURLToPath(import.meta.url)),baseline=join(root,'baseline'),fixture=join(root,'fixture');
const controls=[];async function check(name,fn){await fn();controls.push({name,passed:true});}
const before=new Map(SOURCES.map(p=>[p,readFileSync(join(baseline,p))]));
const candidates=new Map(SOURCES.map(p=>[p,readFileSync(join(root,'candidate',CANDIDATES[p].file))]));
await check('Exact current 47 inputs/root8c and three candidate sources accepted',()=>{
 assert.equal(Object.keys(verifyInputs(baseline)).length,47);assert.equal(hash(readFileSync(join(baseline,'cinderline.1.0.0.js'))),ORIGINAL_BUNDLE);
 assert.equal(changedSources(before,candidates).size,3);assert.equal(FILES.length+1,10);
});
await check('Both prior journal sources and new state source remain exact reviewed bytes',()=>{
 assert.equal(CANDIDATES['src/content/story.js'].sha256,'7cd770bfcb91f959a9b4e60088d41fc9b3eac363faa724138d89d668e07a9d41');
 assert.equal(CANDIDATES['src/content/locale/ja/content.js'].sha256,'480e736a0e37eb482daedf7a81deee179c2613f175a987498507e35d514416a1');
 assert.equal(CANDIDATES['src/game/state.js'].sha256,'356d2bb3d3ae1b019e38bd73c05778ff67b048cffa9775d5bad052fc9d118530');
});
await check('Old two-source set and stale/mutated state candidate rejected',()=>{
 assert.throws(()=>changedSources(before,new Map([...candidates].slice(0,2))),/Unexpected candidate source set/);
 for(const bytes of [before.get('src/game/state.js'),Buffer.concat([candidates.get('src/game/state.js'),Buffer.from(' ')])]){
  const changed=new Map(candidates);changed.set('src/game/state.js',bytes);assert.throws(()=>changedSources(before,changed),/Unreviewed candidate source/);
 }
});
await check('All 47 baseline pins unchanged from actual C40 journal preparation',()=>{
 const source=readFileSync(join(root,'canonical/tools/prepare-narrative-product.mjs'),'utf8');
 assert.deepEqual(INPUTS,JSON.parse(source.match(/export const INPUTS = Object.freeze\((\{[\s\S]*?\})\);/)[1]));
});
cpSync(baseline,fixture,{recursive:true});for(const [p,b]of candidates)writeFileSync(join(fixture,p),b);
let rows;
await check('Real candidate localization provides four exact scenario/language rows',async()=>{
 rows=await verifySourceRoutes(fixture);assert.deepEqual(rows.map(r=>[r.language,r.scenario]),[['en','fresh'],['en','legacy-save'],['ja','fresh'],['ja','legacy-save']]);
 for(const row of rows)assert.equal(row.sourceSha256,TARGETS[0].en);
});
const {GameState,Storage,SAVE_KEY}=await import(pathToFileURL(join(fixture,'src/game/state.js')));
assert.equal(SAVE_KEY,LEGACY_SAVE_KEY);
const memory=new Map();globalThis.localStorage={getItem:key=>memory.get(String(key))??null,setItem:(key,value)=>memory.set(String(key),String(value)),removeItem:key=>memory.delete(String(key)),clear:()=>memory.clear()};
let evidence;
await check('Actual Storage.load/deserialise repairs the exact synthetic old body and preserves the slot and progression',()=>{
 const state=new GameState();state.addJournal('iris','Iris Nadeau',LEGACY_ENGLISH_TEXT);state.journal[0].t=42;
 state.counters.set('fixture-counter',7);state.deaths=3;state.choices.set('fixture-choice','kept');
 state.addJournal('fixture-other','Synthetic unaffected note','Unchanged fixture note.');
 assert.equal(Storage.save(state,null),true);const raw=memory.get(SAVE_KEY),payload=Storage.load();
 const inputRaw=JSON.stringify(payload.state),restored=new GameState(),result=restored.deserialise(payload.state);assert.equal(result,true);
 evidence={fixtureOnly:true,syntheticOnly:true,normalContinueInvoked:true,deserialiseCalls:1,observerRestored:true,result,
  beforeState:JSON.parse(inputRaw),afterState:structuredClone(restored.serialise()),inputUnchanged:JSON.stringify(payload.state)===inputRaw,slotUnchangedAfterLoad:memory.get(SAVE_KEY)===raw};
 // normalContinueInvoked/observerRestored are synthetic report-contract flags
 // here; the real bundled Continue path is reserved for the actual CI browser.
 verifyLegacyLoadEvidence(evidence,TARGETS[0].en);
});
await check('Unrepaired text, unrelated progression drift and journal timestamp drift rejected',()=>{
 for(const mutate of [e=>{e.afterState.journal[0].text=LEGACY_ENGLISH_TEXT;},e=>{e.afterState.deaths++;},e=>{e.afterState.journal[0].t++;}]){
  const changed=structuredClone(evidence);mutate(changed);assert.throws(()=>verifyLegacyLoadEvidence(changed,TARGETS[0].en));
 }
});
await check('False or missing deserializer result is rejected even when all other evidence is valid',()=>{
 for(const mutate of [e=>{e.result=false;},e=>{delete e.result;}]){
  const changed=structuredClone(evidence);mutate(changed);assert.throws(()=>verifyLegacyLoadEvidence(changed,TARGETS[0].en),/Legacy deserializer did not succeed/);
 }
});
await check('Wrong historical text and overwritten slot or unrestored observer flags rejected',()=>{
 for(const mutate of [e=>{e.beforeState.journal[0].text+=' ';},e=>{e.slotUnchangedAfterLoad=false;},e=>{e.observerRestored=false;},e=>{e.normalContinueInvoked=false;},e=>{e.deserialiseCalls=0;}]){
  const changed=structuredClone(evidence);mutate(changed);assert.throws(()=>verifyLegacyLoadEvidence(changed,TARGETS[0].en));
 }
});
const output=join(fixture,'test-results/journal-save-route-r1');mkdirSync(output,{recursive:true});
const report={fixtureOnly:true,status:'passed',browserRequested:false,browserAttempted:false,browserExecuted:false,screens:[],sourceRoutes:rows.map(({expectedDisplay,...row})=>row)};
await check('Four-row CPU report exports exact bytes with zero screenshot claims',()=>{
 writeFileSync(join(output,'report.json'),JSON.stringify(report));const lines=[];exportRouteArtifacts(fixture,x=>lines.push(x));
 const meta=lines.filter(x=>x.startsWith('[narrative-route-meta] '));assert.equal(meta.length,1);assert.equal(JSON.parse(meta[0].slice('[narrative-route-meta] '.length)).screenCount,0);
});
await check('Old two-row set or wrong scenario fails before export',()=>{
 for(const change of [r=>{r.sourceRoutes=r.sourceRoutes.slice(0,2);},r=>{r.sourceRoutes[1].scenario='fresh';}]){
  const bad=structuredClone(report);change(bad);writeFileSync(join(output,'report.json'),JSON.stringify(bad));const lines=[];
  assert.throws(()=>exportRouteArtifacts(fixture,x=>lines.push(x)));assert.equal(lines.length,0);
 }
});
await check('Successful browser report cannot omit any of the four original screens',()=>{
 writeFileSync(join(output,'report.json'),JSON.stringify({...report,browserRequested:true,browserAttempted:true,browserExecuted:true}));
 const lines=[];assert.throws(()=>exportRouteArtifacts(fixture,x=>lines.push(x)),/Incomplete successful browser diagnostic/);assert.equal(lines.length,0);
});
await check('C40 pointer repair and pre-assertion original screenshot retention remain in the new scope',()=>{
 const old=readFileSync(join(root,'repair-baseline/tools/check-narrative-routes.mjs'),'utf8'),next=readFileSync(join(root,'candidate/tools/check-narrative-routes.mjs'),'utf8');
 const extract=s=>s.slice(s.indexOf('            centerHit:'),s.indexOf("            whiteSpace:"));assert.equal(extract(next),extract(old));
 assert(next.indexOf('const png = await page.screenshot(')<next.indexOf('assert.equal(rendered.title'));
 assert(next.includes('finally {\n              if (ownDescriptor) Object.defineProperty'));
});
delete globalThis.localStorage;
writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const result={status:'passed',controls,passed:controls.length,node:process.version,scope:'Local exact-input/source/Storage plus synthetic evidence/export contract controls only. Actual bundled Continue, browser CSS/layout, PNGs and build are not executed.',actualBuild:false,actualBrowser:false,realBundledContinueInvoked:false,originalScreens:0,newRootSha256:null,remoteWrites:0,ciStarts:0};
writeFileSync(join(root,'verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:controls.length,actualBuild:false,actualBrowser:false}));
