import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameState, Storage, SAVE_KEY, SAVE_RESCUE_KEY, SAVE_LOADABLE, SAVE_VERSION, DEFAULT_SETTINGS } from '../src/game/state.js';
import { Menus } from '../src/ui/screens.js';
import { Emitter } from '../src/core/util.js';
import { Director } from '../src/game/director.js';
import { Game, MODE } from '../src/game/game.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/save-v1.json',import.meta.url),'utf8')).payload;
const legacy=JSON.stringify(fixture),memory=new Map();let failKey=null;
beforeEach(()=>{memory.clear();failKey=null;globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>{if(k===failKey)throw new Error('storage refused');memory.set(k,String(v));},removeItem:k=>memory.delete(k)};Storage.lastResult=null;Storage._preUpgrade=null;});
const putCopies=raws=>memory.set(SAVE_RESCUE_KEY,JSON.stringify(raws.map((raw,i)=>({raw,at:1000+i}))));
const current=()=>JSON.stringify({...fixture,savedAt:123456});
test('real legacy restore keeps original bytes and preserves the replaced save',()=>{
  assert.ok(SAVE_LOADABLE.includes(Storage.inspectRescuedSave(legacy).status));
  const previous=current();putCopies([legacy]);memory.set(SAVE_KEY,previous);
  Storage._preUpgrade='stale';Storage.lastResult={status:'future'};
  assert.deepEqual(Storage.restoreRescuedSave(legacy),{ok:true});assert.equal(memory.get(SAVE_KEY),legacy);
  assert.ok(Storage.rescuedSaves().some(e=>e.raw===previous));assert.equal(Storage._preUpgrade,null);assert.equal(Storage.lastResult,null);
  assert.ok(Storage.load());assert.equal(memory.get(SAVE_KEY),legacy);
});
test('future, corrupt and stale selected copies cannot replace current progress',()=>{
  for(const raw of [JSON.stringify({...fixture,v:999}),'not JSON','missing']){
    putCopies(raw==='missing'?[legacy]:[raw]);const previous=current();memory.set(SAVE_KEY,previous);const before=new Map(memory);
    assert.equal(Storage.restoreRescuedSave(raw).ok,false);assert.deepEqual(memory,before);
  }
});
test('backup refusal leaves current and all saved copies unchanged',()=>{
  putCopies([legacy]);memory.set(SAVE_KEY,current());const before=new Map(memory);failKey=SAVE_RESCUE_KEY;
  assert.deepEqual(Storage.restoreRescuedSave(legacy),{ok:false,reason:'backup_failed'});assert.deepEqual(memory,before);
});
test('main write refusal preserves current and all preexisting copies',()=>{
  putCopies([legacy]);memory.set(SAVE_KEY,current());const before=new Map(memory);failKey=SAVE_KEY;
  assert.deepEqual(Storage.restoreRescuedSave(legacy),{ok:false,reason:'write_failed'});assert.deepEqual(memory,before);
});
test('inspection leaves unreadable originals available for export',()=>{
  const raw='<unreadable save bytes>';putCopies([raw]);const before=new Map(memory);
  assert.equal(Storage.inspectRescuedSave(raw).status,'corrupt');assert.deepEqual(memory,before);assert.equal(Storage.rescuedSaves()[0].raw,raw);
});
function fullList(){
  const victim=legacy,selected=JSON.stringify({...fixture,padding:'s'.repeat(3000)}),other=JSON.stringify({...fixture,padding:'o'.repeat(1000)}),previous=JSON.stringify({...fixture,padding:'c'.repeat(2000)});
  const copies=[victim,other,selected];putCopies(copies);memory.set(SAVE_KEY,previous);return {copies,selected,previous};
}
test('full-list quota permits staging but rejects main write without losing any copy',()=>{
  const {copies,selected,previous}=fullList(),before=new Map(memory),writes=[];
  const size=()=>[...memory.values()].reduce((n,s)=>n+s.length,0);
  const staged=JSON.stringify([...Storage.rescuedSaves(),{raw:previous,at:Date.now()}]);
  const stageSize=size()-memory.get(SAVE_RESCUE_KEY).length+staged.length;
  const limit=stageSize+Math.floor((selected.length-previous.length)/2);
  localStorage.setItem=(k,v)=>{v=String(v);const next=size()-(memory.get(k)?.length??0)+v.length,accepted=next<=limit;writes.push({k,accepted});if(!accepted)throw new Error('QuotaExceededError');memory.set(k,v);};
  assert.deepEqual(Storage.restoreRescuedSave(selected),{ok:false,reason:'write_failed'});
  assert.ok(writes.some(x=>x.k===SAVE_RESCUE_KEY&&x.accepted));assert.ok(writes.some(x=>x.k===SAVE_KEY&&!x.accepted));
  assert.deepEqual(memory,before);for(const raw of copies)assert.ok(Storage.rescuedSaves().some(e=>e.raw===raw));
});
test('if rollback also fails, the staged list still retains all recovery points',()=>{
  const {copies,selected,previous}=fullList();let writes=0;
  localStorage.setItem=(k,v)=>{writes++;if(writes>=2)throw new Error('storage permission changed');memory.set(k,String(v));};
  assert.deepEqual(Storage.restoreRescuedSave(selected),{ok:false,reason:'write_failed'});assert.equal(memory.get(SAVE_KEY),previous);
  for(const raw of [...copies,previous])assert.ok(Storage.rescuedSaves().some(e=>e.raw===raw));
});
test('successful full-list restore preserves every distinct save in main or backup',()=>{
  const {copies,selected,previous}=fullList();assert.deepEqual(Storage.restoreRescuedSave(selected),{ok:true});assert.equal(memory.get(SAVE_KEY),selected);
  for(const raw of [...copies,previous])assert.ok(memory.get(SAVE_KEY)===raw||Storage.rescuedSaves().some(e=>e.raw===raw));
  assert.ok(Storage.rescuedSaves().length<=3);
});
test('malformed but valid JSON is rejected before any save or in-memory state is changed',()=>{
  for(const [field,value] of [['inventory',{}],['counters',[1]],['trust',[null]],['capabilities',{}],['quests',[null]],['journal',{}],['playTime','broken']]){
    const bad=structuredClone(fixture);bad.state[field]=value;const raw=JSON.stringify(bad);putCopies([raw]);memory.set(SAVE_KEY,legacy);const before=new Map(memory);
    assert.equal(Storage.inspectRescuedSave(raw).status,'corrupt',field);assert.equal(Storage.restoreRescuedSave(raw).ok,false);assert.deepEqual(memory,before);
    const state=new GameState();state.set('keep');assert.equal(state.deserialise({...bad.state,v:SAVE_VERSION}),false);assert.equal(state.has('keep'),true);
  }
});
test('malformed world fields are refused before replacing storage or resetting the live world',()=>{
  for(const [field,value] of [['takenIds',{}],['disabledIds',{}],['gasSources',{}],['npcPos',{}],['npcPos',[null]],['player',{...fixture.player,x:'broken'}],['crisis',{site:'stacks',rescued:0,lost:0,timeLeft:'broken'}]]){
    const bad=structuredClone(fixture);bad[field]=value;const raw=JSON.stringify(bad);
    putCopies([raw]);memory.set(SAVE_KEY,legacy);const before=new Map(memory);
    assert.equal(Storage.inspectRescuedSave(raw).status,'corrupt',field);
    assert.equal(Storage.restoreRescuedSave(raw).ok,false);assert.deepEqual(memory,before);
    let reset=false;const context={game:{},resetWorld(){reset=true;}};
    assert.equal(Director.prototype.applySave.call(context,bad),false);assert.equal(reset,false);
  }
});
// This DOM double exercises real menu/event code, not browser layout or input.
class Node{
  constructor(tag){this.tag=tag;this.children=[];this.events={};this.attrs={};this.style={setProperty(){}};this._classes=new Set();this.textContent='';this._html='';this.classList={add:(...v)=>v.forEach(x=>this._classes.add(x)),remove:(...v)=>v.forEach(x=>this._classes.delete(x)),contains:v=>this._classes.has(v),toggle:(v,on)=>{const value=on??!this._classes.has(v);value?this._classes.add(v):this._classes.delete(v);return value;}};}
  set className(v){this._classes=new Set(v.split(/\s+/).filter(Boolean));}get className(){return [...this._classes].join(' ');}
  set innerHTML(v){this._html=v;this.children=[];}get innerHTML(){return this._html;}
  appendChild(n){if(n.parentNode)n.parentNode.removeChild(n);this.children.push(n);n.parentNode=this;return n;}setAttribute(k,v){this.attrs[k]=v;}addEventListener(t,fn){(this.events[t]??=[]).push(fn);}
  scrollIntoView(){} // Layout is checked in WebKit, not this event-code double.
  removeChild(n){this.children=this.children.filter(child=>child!==n);n.parentNode=null;}
  setPointerCapture(){}remove(){this.parentNode.children=this.parentNode.children.filter(n=>n!==this);}
  click(){for(const fn of this.events.click??[])fn();}pointerTap(){const event={pointerId:1,clientX:10,clientY:10,stopPropagation(){}};for(const t of ['pointerdown','pointerup'])for(const fn of this.events[t]??[])fn(event);}
}
const descend=n=>[n,...n.children.flatMap(descend)];
test('actual title recovery and SAVE wiring protect the restored copy; normal play can still save',()=>{
  const previous={document:globalThis.document,window:globalThis.window};
  globalThis.document={createElement:tag=>new Node(tag),body:new Node('body'),documentElement:new Node('html')};globalThis.window={innerWidth:667,innerHeight:375,addEventListener(){}};
  try{
    putCopies([legacy]);memory.set(SAVE_KEY,current());
    const g=new Emitter();g.mode=MODE.TITLE;g.playTime=0;g.settings={...DEFAULT_SETTINGS};g.player={pos:{x:0,y:0,z:0},yaw:0,hp:100,stamina:100,lungs:{sat:0,filter:null,masked:false},lampOn:false,lampBattery:1};g.city={interactions:[]};g.gas={sources:[],_targetScale:1};
    const notices=[];g.hud={visible:false,setVisible(value){this.visible=value;},notice:(...a)=>notices.push(a)};g.setMode=mode=>{g.mode=mode;};g.applySettings=()=>{};g.engine=new Emitter();g.engine.addPause=()=>{};g.engine.removePause=()=>{};
    g.director=new Director(g);g.menus=new Menus(g,new Node('root'));Game.prototype._wireUI.call(g);
    g.menus.showTitle(Storage.hasSave());g.menus.openPause('settings',true);
    descend(g.menus.settingsPanel).find(n=>n.tag==='button'&&n.textContent==='USE THIS COPY').click();assert.equal(memory.get(SAVE_KEY),legacy);
    const save=g.menus.saveButton;assert.equal(save.style.display,'none');save.pointerTap();g.emit('ui:save');assert.equal(g.director.save(true),false);
    assert.equal(memory.get(SAVE_KEY),legacy);assert.equal(notices.length,0);
    g.mode=MODE.PLAY;g.hud.visible=true;g.menus.openPause('settings',false);assert.equal(save.style.display,'');
    g.menus.rebuild();assert.equal(g.menus.fromTitle,false,'language rebuild must preserve gameplay settings');
    assert.equal(g.menus.currentTab,'settings');assert.equal(g.menus.saveButton.style.display,'');
    assert.equal(descend(g.menus.settingsPanel).filter(n=>n.textContent==='USE THIS COPY').length,0);
    g.director.state.set('normal_save_control');g.menus.saveButton.pointerTap();assert.ok(JSON.parse(memory.get(SAVE_KEY)).state.flags.includes('normal_save_control'));
    g.menus.closePause();assert.equal(g.mode,MODE.PLAY);assert.equal(g.hud.visible,true);
  }finally{globalThis.document=previous.document;globalThis.window=previous.window;}
});
test('the actual export action emits original unreadable bytes and cleans its temporary link',async()=>{
  const previous={document:globalThis.document,create:URL.createObjectURL,revoke:URL.revokeObjectURL,timer:globalThis.setTimeout};let exported,download,revoked;
  globalThis.document={body:new Node('body'),createElement:tag=>{const n=new Node(tag);if(tag==='a')n.click=()=>{download=n.download;};return n;}};
  URL.createObjectURL=blob=>{exported=blob;return 'blob:unit-test';};URL.revokeObjectURL=url=>{revoked=url;};globalThis.setTimeout=fn=>{fn();return 1;};
  try{putCopies(['original unreadable bytes']);const p=new Node('div');Menus.prototype.refreshSavedCopies.call({fromTitle:true},p);const buttons=descend(p).filter(n=>n.tag==='button');assert.equal(buttons.length,1);buttons[0].click();assert.equal(await exported.text(),'original unreadable bytes');assert.equal(download,'cinderline-save-copy-1.json');assert.equal(revoked,'blob:unit-test');assert.equal(document.body.children.length,0);}
  finally{globalThis.document=previous.document;URL.createObjectURL=previous.create;URL.revokeObjectURL=previous.revoke;globalThis.setTimeout=previous.timer;}
});
