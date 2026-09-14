import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=dirname(fileURLToPath(import.meta.url)), fixture=resolve(root,'fixture');
const sha=b=>createHash('sha256').update(b).digest('hex'), checks=[], cases=[];
const check=(name,fn)=>{fn();checks.push(name);};
const clone=x=>JSON.parse(JSON.stringify(x));
function copyTree(from,to){mkdirSync(to,{recursive:true});for(const e of readdirSync(from,{withFileTypes:true})){const a=resolve(from,e.name),b=resolve(to,e.name);if(e.isDirectory())copyTree(a,b);else copyFileSync(a,b);}}
copyTree(resolve(root,'baseline/src'),resolve(fixture,'src'));
copyFileSync(resolve(root,'candidate/src/game/state.js'),resolve(fixture,'src/game/state.js'));
const newStoryPath=resolve(root,'../c40-journal-period-repair-ultra/candidate/src/content/story.js');
const newJaPath=resolve(root,'../c40-journal-period-repair-ultra/candidate/src/content/locale/ja/content.js');
check('C40 authored text inputs are exact frozen source candidates only; no root invented',()=>{
 assert.equal(sha(readFileSync(newStoryPath)),'7cd770bfcb91f959a9b4e60088d41fc9b3eac363faa724138d89d668e07a9d41');
 assert.equal(sha(readFileSync(newJaPath)),'480e736a0e37eb482daedf7a81deee179c2613f175a987498507e35d514416a1');
});
copyFileSync(newStoryPath,resolve(fixture,'src/content/story.js'));
copyFileSync(newJaPath,resolve(fixture,'src/content/locale/ja/content.js'));
const old=await import(pathToFileURL(resolve(root,'baseline/src/game/state.js')));
const changed=await import(pathToFileURL(resolve(fixture,'src/game/state.js')));
const oldStory=await import(pathToFileURL(resolve(root,'baseline/src/content/story.js')));
const newStory=await import(pathToFileURL(resolve(fixture,'src/content/story.js')));
const {applyEffects}=await import(pathToFileURL(resolve(fixture,'src/game/narrative.js')));
const i18n=await import(pathToFileURL(resolve(fixture,'src/content/i18n.js')));
const {CONTENT_JA}=await import(pathToFileURL(resolve(fixture,'src/content/locale/ja/content.js')));
const oldEntry=oldStory.CONVERSATIONS.iris_first.nodes.i_gives.effects[3].journal;
const newEntry=newStory.CONVERSATIONS.iris_first.nodes.i_gives.effects[3].journal;
check('candidate legacy exact id/title/text matches canonical story and only the period changes',()=>{
 assert.deepEqual(oldEntry.slice(0,2),['iris','Iris Nadeau']);
 assert.deepEqual(newEntry,[oldEntry[0],oldEntry[1],oldEntry[2].replace('one month.','ten months.')]);
 const c=readFileSync(resolve(root,'candidate/src/game/state.js'),'utf8');
 assert(c.includes('const LEGACY_IRIS_JOURNAL_TEXT = `'+oldEntry[2]+'`;'));
});
const now=Date.now;Date.now=()=>1789419600123;
class MemoryStorage {
 constructor(raw){this.values=new Map(raw===undefined?[]:[[changed.SAVE_KEY,raw]]);this.writes=[];}
 getItem(k){return this.values.get(k)??null;}
 setItem(k,v){this.values.set(k,String(v));this.writes.push([k,String(v)]);}
 removeItem(k){this.values.delete(k);this.writes.push([k,null]);}
}
function sample(entries){
 const s=new old.GameState();s.flags=new Set(['iris_gave_pass','choice:log_intent:publish','untouched']);
 s.counters=new Map([['honest',9]]);s.inventory=new Map([['keySurvey',1],['filter',3],['bandage',1]]);
 s.capabilities=new Set(['readAir']);s.trust=new Map([['iris',18],['sol',-3],['teo',4],['nessa',2],['krajcik',-5]]);
 s.quests=new Map([['case',{state:'active',step:2,data:{nested:['keep',7]}}]]);
 s.choices=new Map([['log_intent','publish']]);s.discovered=new Set(['office']);s.chapter=3;s.playTime=1324.25;
 s.deaths=2;s.kills=3;s.filtersUsed=4;s.metersRead=5;s.parries=6;s.lastSpawn='office';s.ending='record';
 s.journal=clone(entries);return s;
}
const known={id:oldEntry[0],title:oldEntry[1],text:oldEntry[2],t:777.25,extra:{untouched:[1,'two']}};
const other={id:'folder',title:'Unchanged note',text:'An unrelated saved note.',t:999.5};
const player={pos:{x:4,y:5,z:6},yaw:1.25,hp:42,stamina:31,lungs:{sat:.2,filter:.9,masked:true},lampOn:true,lampBattery:.4};
const extras={interior:'field_office',takenIds:['x'],disabledIds:['y'],npcState:['iris'],npcPos:[['iris',1,2,3,4,true,false]],gasSources:[['bore',true]],gasIntensity:.3,interiorPpm:321,crisis:{site:'cellar',rescued:1,lost:0,timeLeft:27,done:[true,false]},customEnvelope:{keep:'verbatim'}};
function makePayload(entries,version=2){
 globalThis.localStorage=new MemoryStorage();old.Storage._preUpgrade=null;old.Storage.lastResult=null;
 assert.equal(old.Storage.save(sample(entries),player,extras),true);
 const p=JSON.parse(localStorage.getItem(old.SAVE_KEY));if(version===1){delete p.v;p.state.v=1;}return p;
}
function loadCandidate(payload){
 const original=JSON.stringify(payload);globalThis.localStorage=new MemoryStorage(original);
 changed.Storage._preUpgrade=null;changed.Storage.lastResult=null;
 const loaded=changed.Storage.load();assert(loaded);
 assert.equal(localStorage.getItem(changed.SAVE_KEY),original);assert.equal(localStorage.writes.length,0);
 const before=clone(loaded),state=new changed.GameState();let journalEvents=0;state.on('journal',()=>journalEvents++);
 assert.equal(state.deserialise(loaded.state),true);
 assert.deepEqual(loaded,before);assert.equal(journalEvents,0);
 return {state,loaded,original};
}
const variants=[
 ['old-v2',[other,known],true],
 ['already-corrected',[other,{...known,text:newEntry[2]}],false],
 ['different-id',[{...known,id:'iris-custom'}],false],
 ['different-title',[{...known,title:'Iris Nadeau '}],false],
 ['different-body',[{...known,text:oldEntry[2]+' '}],false],
 ['different-newline',[{...known,text:oldEntry[2].replaceAll('\n',' ')}],false],
 ['custom-body',[{...known,text:'My custom one month. note.'}],false],
 ['Japanese-body',[{...known,title:'アイリス・ナドー',text:'彼女は差分のファイルを2年1か月つけていた。'}],false],
 ['empty',[],false],
 ['duplicates',[known,other,{...known,t:888}],true],
];
for(const [name,entries,repair] of variants){
 const payload=makePayload(entries),{state,loaded}=loadCandidate(payload);
 const baseline=new old.GameState();assert.equal(baseline.deserialise(loaded.state),true);
 const expected=clone(baseline.serialise());if(repair)for(const j of expected.journal)if(j.id==='iris')j.text=newEntry[2];
 check(name+': actual deserialise changes only selected text; all serialised progress and extra journal data retained',()=>assert.deepEqual(state.serialise(),expected));
 check(name+': format, inspection, input bytes and journal event behavior unchanged',()=>{
  assert.equal(changed.SAVE_VERSION,2);assert.equal(changed.SAVE_KEY,'cinderline.save.v1');assert.equal(changed.Storage.lastResult.status,'ok');
  assert.deepEqual(loaded,payload);assert.equal(localStorage.getItem(changed.SAVE_KEY),JSON.stringify(payload));
 });
 assert.equal(changed.Storage.save(state,player,extras),true);
 const saved=JSON.parse(localStorage.getItem(changed.SAVE_KEY));
 check(name+': actual Storage save preserves all envelope/world/player fields',()=>{
  assert.deepEqual({...saved,state:null},{...payload,state:null});assert.deepEqual(saved.state,expected);
 });
 const restored=changed.Storage.load(), second=new changed.GameState();assert(second.deserialise(restored.state));
 check(name+': second JSON/load/deserialise roundtrip is idempotent and old version2 reader accepts output',()=>{
  assert.deepEqual(second.serialise(),expected);
  const rollback=new old.GameState();assert(rollback.deserialise(saved.state));assert.deepEqual(rollback.serialise(),expected);
 });
 cases.push({name,repairedEntries:repair?entries.filter(j=>j.id==='iris').length:0,inputPayloadSha256:sha(JSON.stringify(payload)),savedPayloadSha256:sha(JSON.stringify(saved)),stateBeforeSha256:sha(JSON.stringify(baseline.serialise())),stateAfterSha256:sha(JSON.stringify(state.serialise()))});
}
{
 const payload=makePayload([known],1),{state,loaded,original}=loadCandidate(payload);
 check('old-v1: existing envelope migration and rescue state retained; journal repairs after normal migration',()=>{
  assert.equal(changed.Storage.lastResult.status,'migrated');assert.deepEqual(changed.Storage.lastResult.steps,['1->2']);
  assert.equal(loaded.v,2);assert.equal(loaded.state.v,2);assert.equal(state.journal[0].text,newEntry[2]);
  assert.equal(changed.Storage._preUpgrade,original);
 });
 assert(changed.Storage.save(state,player,extras));
 check('old-v1: original v1 bytes rescued by unchanged normal save',()=>assert(changed.Storage.rescuedSaves().some(x=>x.raw===original)));
}
{
 const payload=makePayload([known]);delete payload.state.journal;
 const {state}=loadCandidate(payload);check('older optional journal omission remains an empty journal',()=>assert.deepEqual(state.journal,[]));
 const invalid=clone(payload.state);invalid.journal=[{id:'iris',title:'Iris Nadeau',text:123}];
 const before=state.serialise();check('invalid state rejects before any change',()=>{assert.equal(state.deserialise(invalid),false);assert.deepEqual(state.serialise(),before);});
}
{
 const baseline=sample([known]);assert.equal(baseline.addJournal(...newEntry),false);
 check('baseline reproduces stale saved text despite new authored journal attempt',()=>assert.equal(baseline.journal[0].text,oldEntry[2]));
 const {state}=loadCandidate(makePayload([known]));
 check('repaired entry keeps duplicate addJournal semantics; no newly emitted journal',()=>{assert.equal(state.addJournal(...newEntry),false);assert.equal(state.journal.length,1);assert.equal(state.journal[0].text,newEntry[2]);});
}
const displayResults=[];
for(const lang of ['en','ja']){
 i18n.setLocale(lang);
 const fresh=new changed.GameState(),baseline=new old.GameState();
 applyEffects(newStory.CONVERSATIONS.iris_first.nodes.i_gives.effects,fresh,null);
 applyEffects(newStory.CONVERSATIONS.iris_first.nodes.i_gives.effects,baseline,null);
 check(lang+': actual new authored effects store English and retain every side effect',()=>{
  assert.deepEqual(fresh.serialise(),baseline.serialise());assert.equal(fresh.journal[0].text,newEntry[2]);
 });
 globalThis.localStorage=new MemoryStorage();changed.Storage._preUpgrade=null;changed.Storage.save(fresh,player,extras);
 const loaded=changed.Storage.load(),second=new changed.GameState();assert(second.deserialise(loaded.state));
 check(lang+': newly acquired current journal roundtrips unchanged',()=>assert.deepEqual(second.serialise(),fresh.serialise()));
 const {state}=loadCandidate(makePayload([known]));
 const displayed=i18n.t('journal.iris.text',state.journal[0].text);
 check(lang+': actual locale renderer fallback chooses corrected English or authored C40 Japanese',()=>{
  assert.equal(displayed,lang==='en'?newEntry[2]:CONTENT_JA.journal.iris.text);
  assert.match(displayed,lang==='en'?/two years and\nten months/:/2年10か月/);
 });
 displayResults.push({locale:lang,storedText:state.journal[0].text,displayedText:displayed});
}
Date.now=now;
const baseline=readFileSync(resolve(root,'baseline/src/game/state.js'),'utf8'),candidate=readFileSync(resolve(root,'candidate/src/game/state.js'),'utf8');
const constant=candidate.slice(candidate.indexOf('// Saves retain the authored English'),candidate.indexOf('export class GameState'));
const mapping=candidate.slice(candidate.indexOf('    this.journal = (d.journal || []).map'),candidate.indexOf('    this.discovered = new Set(d.discovered'));
check('inverse of two bounded edits restores canonical whole-file bytes',()=>assert.equal(candidate.replace(constant,'').replace(mapping,'    this.journal = d.journal || [];\n'),baseline));
check('all Storage functions and SAVE_VERSION/migration/validation code unchanged',()=>{
 assert.equal(candidate.slice(candidate.indexOf('// --------------------------------------------------------------- persistence')),baseline.slice(baseline.indexOf('// --------------------------------------------------------------- persistence')));
 assert.equal(candidate.slice(0,candidate.indexOf('// Saves retain the authored English')),baseline.slice(0,baseline.indexOf('export class GameState')));
});
const result={status:'passed',candidateSha256:sha(candidate),finiteChecks:checks.length,checks,cases,displayResults,actualModuleImports:true,actualStorageJsonRoundtrip:true,storageBackend:'in-memory Web Storage API fixture; no user save was read',newContentInputs:'C40 frozen source candidates only, no generated root/build',limits:'No compilation, browser/DOM rendering, CI, original user save or device measurement. Whole GameState/Storage/narrative/i18n modules execute in Node against controlled JSON save fixtures.'};
writeFileSync(resolve(root,'verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,finiteChecks:checks.length,cases:cases.length,candidateSha256:result.candidateSha256}));
