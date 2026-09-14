// Independent finite source/VM controls. No build, browser, bundled Continue or images.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,writeFileSync,cpSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url)), producer=join(here,'../c41-journal-save-build-preparation-ultra');
const hash=b=>createHash('sha256').update(b).digest('hex');
const source=readFileSync(join(producer,'candidate/tools/check-narrative-routes.mjs'),'utf8');
const old=readFileSync(join(producer,'superseded-v1/candidate/tools/check-narrative-routes.mjs'),'utf8');
assert.equal(hash(source),'98d6085d50952d8d1881c7fe82a16f08de4df3cc499f5cc98c7b888384fab29a');
assert.equal(hash(old),'634d0337d04c032cd04d827c13e8ae8c6d110d60ea7f8a1d06062e45f75ffd7f');
assert(source.replace("  assert.equal(evidence.result, true, 'Legacy deserializer did not succeed');\n",'')===old,'Final repair is exactly one added result assertion');
const {verifyLegacyLoadEvidence,verifySourceRoutes,LEGACY_ENGLISH_TEXT,LEGACY_SAVE_KEY,TARGETS,SCENARIOS}=await import(pathToFileURL(join(producer,'candidate/tools/check-narrative-routes.mjs')));
const {SOURCES,CANDIDATES,changedSources,verifyInputs}=await import(pathToFileURL(join(producer,'candidate/tools/prepare-narrative-product.mjs')));
const controls=[];
async function control(name,fn){await fn();controls.push({name,passed:true});}
const fixture=join(here,'fixture');mkdirSync(fixture,{recursive:true});cpSync(join(producer,'baseline'),fixture,{recursive:true});
cpSync(join(fixture,'src/game/state.js'),join(fixture,'src/game/state-before.js'));
const before=new Map(SOURCES.map(p=>[p,readFileSync(join(fixture,p))]));
const candidates=new Map(SOURCES.map(p=>[p,readFileSync(join(producer,'candidate',CANDIDATES[p].file))]));
await control('exact 47 baseline inputs; three-source all-or-nothing admission',()=>{
 assert.equal(Object.keys(verifyInputs(fixture)).length,47);assert.equal(changedSources(before,candidates).size,3);
 const bad=new Map(candidates);bad.set('src/game/state.js',before.get('src/game/state.js'));
 assert.throws(()=>changedSources(before,bad));for(const p of SOURCES)assert.deepEqual(readFileSync(join(fixture,p)),before.get(p));
});
for(const [p,b]of candidates)writeFileSync(join(fixture,p),b);
const rows=await verifySourceRoutes(fixture);
await control('actual frozen source/effects/localization yields exact four ordered rows',()=>assert.deepEqual(rows.map(r=>[r.language,r.scenario]),[['en','fresh'],['en','legacy-save'],['ja','fresh'],['ja','legacy-save']]));
const {GameState,Storage,SAVE_KEY}=await import(pathToFileURL(join(fixture,'src/game/state.js')));
const {GameState:OldState}=await import(pathToFileURL(join(fixture,'src/game/state-before.js')));
const {DialogueRunner}=await import(pathToFileURL(join(fixture,'src/game/narrative.js')));
const {CONVERSATIONS}=await import(pathToFileURL(join(fixture,'src/content/story.js')));
const {setLocale}=await import(pathToFileURL(join(fixture,'src/content/i18n.js')));
const callbackStart=source.indexOf('const selected = await page.evaluate(')+'const selected = await page.evaluate('.length;
const callback=source.slice(callbackStart,source.indexOf('}, { ...row, saveKey:',callbackStart)+1);
await control('actual empty-context precondition rejects a preexisting slot without writes',()=>{
 const token='await page.evaluate(saveKey => {';const start=source.indexOf(token)+'await page.evaluate('.length;
 const guard=source.slice(start,source.indexOf('}, LEGACY_SAVE_KEY);',start)+1);
 for(const value of [null,'existing unrelated synthetic slot']){
  const fn=vm.runInNewContext('('+guard+')',{localStorage:{getItem:key=>{assert.equal(key,SAVE_KEY);return value;}}});
  if(value===null)assert.doesNotThrow(()=>fn(SAVE_KEY));else assert.throws(()=>fn(SAVE_KEY),/not an empty synthetic save context/);
 }
});
async function stage(row,options={}){
 const events=[],memory=new Map();
 globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>{memory.set(k,String(v));events.push('set:'+k);},removeItem:k=>memory.delete(k)};
 const state=options.oldState?new OldState():new GameState();
 state.deaths=4;state.choices.set('independent-fixture','preserved');state.addJournal('fixture-other','Other','Retained note');
 if(options.ownMethod)Object.defineProperty(state,'deserialise',{value:state.deserialise,writable:true,enumerable:false,configurable:true});
 const descriptor=Object.getOwnPropertyDescriptor(state,'deserialise'),original=state.deserialise;
 const runner=new DialogueRunner(state,{});
 const game={state,menus:{settings:{language:row.language},showPanel:p=>events.push('panel:'+p)},
   applySettings:s=>setLocale(s.language),emit:e=>events.push(e),
   toTitle:async()=>{events.push('toTitle');if(options.titleThrows)throw Error('synthetic title failure');}};
 game.director={conversations:CONVERSATIONS,dialogue:runner,startConversation:c=>runner.start(c),
   save:()=>{events.push('Director.save stub -> actual Storage.save');if(options.saveFails)return false;return Storage.save(state,null);}};
 const C={game,continueGame:async()=>{
   events.push('Continue stub -> actual Storage.load');if(options.continueThrows)throw Error('synthetic continue failure');
   if(options.noDeserialize)return;
   const payload=Storage.load();state.deserialise(payload.state);
   if(options.twice)state.deserialise(payload.state);
   if(options.slotOverwrite)localStorage.setItem(SAVE_KEY,'changed by synthetic negative');
   if(options.afterThrows)throw Error('synthetic post-deserialize failure');
 }};
 const fn=vm.runInNewContext('('+callback+')',{window:{CINDERLINE:C},localStorage,document:{documentElement:{getAttribute:()=>game.menus.settings.language}},structuredClone,TextEncoder},{timeout:3000});
 let selected,error;
 try{selected=await fn({...row,saveKey:SAVE_KEY,legacyEnglishText:LEGACY_ENGLISH_TEXT});}catch(e){error=String(e);}
 const restored=state.deserialise===original;
 const descriptorAfter=Object.getOwnPropertyDescriptor(state,'deserialise');
 assert.equal(restored,true);
 assert.deepEqual(descriptorAfter,descriptor);
 delete globalThis.localStorage;
 return {selected,error,events,restored,slot:memory.get(SAVE_KEY)};
}
let evidence;
for(const row of rows)await control('actual selected callback with '+row.language+'/'+row.scenario+' and synthetic Continue boundary',async()=>{
 const r=await stage(row);assert.equal(r.error,undefined);assert.equal(r.selected.scenario,row.scenario);assert.equal(hash(r.selected.stored.text),TARGETS[0].en);
 if(row.scenario==='fresh'){assert.equal(r.selected.saveLoad,null);assert(!r.events.includes('toTitle'));}
 else{verifyLegacyLoadEvidence(r.selected.saveLoad,TARGETS[0].en);assert(r.events.indexOf('toTitle')<r.events.indexOf('Continue stub -> actual Storage.load'));assert.equal(r.selected.saveLoad.deserialiseCalls,1);assert.equal(r.selected.saveLoad.result,true);evidence=structuredClone(r.selected.saveLoad);}
});
for(const [name,opts,message]of [
 ['title throws',{titleThrows:true},'synthetic title failure'],['Continue throws',{continueThrows:true},'synthetic continue failure'],
 ['post-deserialization throws',{afterThrows:true},'synthetic post-deserialize failure'],['Continue returns without deserializing',{noDeserialize:true},'did not deserialize'],
 ['Continue deserializes twice',{twice:true},'did not deserialize'],['real-save boundary refuses fixture',{saveFails:true},'Real save could not'],
])await control('observer restoration and refusal when '+name,async()=>{const r=await stage(rows[1],opts);assert.match(r.error,new RegExp(message));assert.equal(r.restored,true);});
await control('own-method descriptor restored exactly',async()=>{const r=await stage(rows[1],{ownMethod:true});assert.equal(r.error,undefined);verifyLegacyLoadEvidence(r.selected.saveLoad,TARGETS[0].en);});
await control('normal old-state reader cannot satisfy the repair evidence',async()=>{const r=await stage(rows[1],{oldState:true});assert.equal(r.error,undefined);assert.throws(()=>verifyLegacyLoadEvidence(r.selected.saveLoad,TARGETS[0].en));});
await control('slot overwrite remains refused',async()=>{const r=await stage(rows[1],{slotOverwrite:true});assert.equal(r.error,undefined);assert.throws(()=>verifyLegacyLoadEvidence(r.selected.saveLoad,TARGETS[0].en),/overwrote/);});
const oldValidator=old.slice(old.indexOf('export function verifyLegacyLoadEvidence'),old.indexOf('\nasync function verifyBrowser')).replace('export function','function');
const oldFn=vm.runInNewContext(oldValidator+'\nverifyLegacyLoadEvidence',{assert,structuredClone,hash,LEGACY_ENGLISH_TEXT});
const counterexample=[];
for(const kind of ['false','missing'])await control('old accepted '+kind+' result; final rejects before export',()=>{
 const e=structuredClone(evidence);if(kind==='false')e.result=false;else delete e.result;
 assert.doesNotThrow(()=>oldFn(e,TARGETS[0].en));assert.throws(()=>verifyLegacyLoadEvidence(e,TARGETS[0].en),/deserializer did not succeed/);
 counterexample.push({kind,oldAccepted:true,finalAccepted:false});
});
for(const [name,mutate]of [['progression',e=>e.afterState.deaths++],['journal timestamp',e=>e.afterState.journal[0].t++],['input change',e=>e.inputUnchanged=false],['observer not restored',e=>e.observerRestored=false]])await control('reject contradictory '+name,()=>{const e=structuredClone(evidence);mutate(e);assert.throws(()=>verifyLegacyLoadEvidence(e,TARGETS[0].en));});
// Export VM reads synthetic bytes from memory; there are no screenshot files.
const exp=source.slice(source.indexOf('export function exportRouteArtifacts'),source.indexOf('\nif (process.argv[1]')).replace('export function','function');
const head='8058f8431b7885e9e929e6cb57bb415d26d9f5b1',environment={GITHUB_SHA:head,GITHUB_RUN_ID:'777',GITHUB_RUN_ATTEMPT:'1'};
const pngHeader=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(pngHeader);pngHeader.write('IHDR',12);pngHeader.writeUInt32BE(667,16);pngHeader.writeUInt32BE(375,20);
const report={fixtureOnly:true,status:'passed',browserRequested:true,browserAttempted:true,browserExecuted:true,sourceCommit:head,runId:'777',runAttempt:'1',bundleSha256:'a'.repeat(64),sourceRoutes:rows.map(({expectedDisplay,...r})=>r),screens:rows.map(r=>({language:r.language,scenario:r.scenario,conversation:r.conversation,node:r.node,file:r.scenario+'-'+r.language+'-'+r.conversation+'-'+r.node+'.png',bytes:24,sha256:hash(pngHeader),saveLoad:r.scenario==='legacy-save'?evidence:null}))};
function exportFixture(r){
 const lines=[];const read=p=>p.endsWith('/report.json')?Buffer.from(JSON.stringify(r)):pngHeader;
 const fn=vm.runInNewContext(exp+'\nexportRouteArtifacts',{assert,join,readFileSync:read,hash,Buffer,TARGETS,SCENARIOS,verifyLegacyLoadEvidence,execFileSync:()=>head});
 let error;try{fn('/synthetic',s=>lines.push(s),environment);}catch(e){error=String(e);}
 return {lines,error};
}
await control('four-screen memory export has five exact files with explicit synthetic provenance',()=>{const e=exportFixture(report);assert.equal(e.error,undefined);assert.equal(e.lines.filter(x=>x.startsWith('[narrative-route-meta]')).length,5);});
for(const [name,mutate]of [['false result',r=>r.screens[1].saveLoad.result=false],['missing result',r=>delete r.screens[1].saveLoad.result],['missing fourth image',r=>r.screens.pop()],['wrong scenario',r=>r.screens[1].scenario='fresh'],['wrong run',r=>r.runId='778']])await control('export emits zero bytes for '+name,()=>{const r=structuredClone(report);mutate(r);const out=exportFixture(r);assert(out.error);assert.equal(out.lines.length,0);});
await control('failed partial route preserves failed status and available diagnostic bytes',()=>{const r=structuredClone(report);r.status='failed';r.error='synthetic visual failure';r.screens=r.screens.slice(0,2);const e=exportFixture(r);assert.equal(e.error,undefined);const metas=e.lines.filter(x=>x.startsWith('[narrative-route-meta] ')).map(x=>JSON.parse(x.slice('[narrative-route-meta] '.length)));assert.equal(metas.length,3);assert(metas.every(m=>m.diagnosticStatus==='failed'&&m.screenCount===2));});
const result={status:'PASS',candidateSha256:hash(source),supersededSha256:hash(old),controls,checkCount:controls.length,counterexample,blocking:[],actualBuild:false,actualBrowser:false,actualBundledContinue:false,actualScreenshots:0,syntheticScreenshotFilesWritten:0,limits:['VM selected callback uses actual DialogueRunner, GameState and Storage with synthetic browser/Director-save/Continue boundaries; it is not actual browser or bundled Continue execution.','Export fixture supplies an in-memory 24-byte header solely for validator branches, not a valid rendered image; no PNG file exists.','State comparison is the before/after deserialise snapshot, not a measurement of all later world restoration actions.','Inherited pointer/visual controls are pinned and byte-compared; prior 28 controls are not recounted as new controls.']};
writeFileSync(join(here,'added-scope-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',checks:controls.length,blocking:[],actualBrowser:false,actualBuild:false}));
