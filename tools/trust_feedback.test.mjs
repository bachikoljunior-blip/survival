import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Director } from '../src/game/director.js';
import { Menus } from '../src/ui/screens.js';
import { Emitter } from '../src/core/util.js';
import { CONVERSATIONS, QUESTS } from '../src/content/story.js';
import { GameState, CHARACTERS } from '../src/game/state.js';
import { applyEffects, testCondition, DialogueRunner } from '../src/game/narrative.js';
import { setLocale } from '../src/content/i18n.js';
function director() {
  const game=new Emitter(),notices=[];
  game.hud={notice:(...args)=>notices.push(args)};
  return {d:new Director(game),notices};
}
const trustEffects=[];
function collect(value){
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value.trust)&&value.trust.length===3)trustEffects.push(value);
  for(const child of Object.values(value))collect(child);
}
collect(CONVERSATIONS);collect(QUESTS);
test('all authored relationship changes retain their consequence without grading choices',()=>{
  assert.ok(trustEffects.length>=40);
  for(const effect of trustEffects){
    const {d,notices}=director();const [id,delta]=effect.trust;
    applyEffects([{trust:effect.trust}],d.state,d.ctx);
    assert.equal(d.state.trustOf(id),Math.max(-100,Math.min(100,delta)));
    assert.deepEqual(notices,[],`${id} ${delta}`);
  }
});
test('the real confession keeps its admission, response, trust consequence and save',()=>{
  const {d,notices}=director(),conversation=CONVERSATIONS.sol_first;
  const node=Object.entries(conversation.nodes).find(([,n])=>n.choices?.some(c=>c.effects?.some(e=>e.flag==='sol_confession')));
  assert.ok(node);
  const choice=node[1].choices.findIndex(c=>c.effects?.some(e=>e.flag==='sol_confession'));
  const runner=new DialogueRunner(d.state,{state:d.state});runner.start(conversation);
  runner.goto(node[0]); // Unit scope: entering an actual authored choice node.
  runner.choose(choice);
  assert.equal(d.state.has('sol_confession'),true);assert.equal(d.state.trustOf('sol'),-8);
  assert.ok(runner.node?.text);assert.ok(notices.every(([,tone])=>tone===''));
  const copy=new GameState();assert.equal(copy.deserialise(d.state.serialise()),true);
  assert.equal(copy.trustOf('sol'),-8);assert.equal(copy.has('sol_confession'),true);
});
test('authored relationship thresholds still change branch availability',()=>{
  let checked=0;
  function visit(value){
    if(!value||typeof value!=='object')return;
    if(Array.isArray(value.trust)&&value.trust.length===2){
      const [id,threshold]=value.trust,s=new GameState();s.trust.set(id,threshold-1);
      assert.equal(testCondition({trust:[id,threshold]},s),false);s.adjustTrust(id,1);
      assert.equal(testCondition({trust:[id,threshold]},s),true);checked++;
    }
    for(const child of Object.values(value))visit(child);
  }
  visit(CONVERSATIONS);assert.ok(checked>0);
});
// DOM construction only; no layout or touch measurement.
class Node{constructor(tag){this.tag=tag;this.children=[];this.className='';this.textContent='';}appendChild(n){this.children.push(n);return n;}set innerHTML(v){assert.equal(v,'');this.children=[];}}
test('the actual People panel contains no graded trust label in either language',()=>{
  const previous=globalThis.document;
  globalThis.document={createElement:tag=>new Node(tag),documentElement:{setAttribute(){}}};
  try{
    for(const lang of ['en','ja']){
      setLocale(lang);const S=new GameState();for(const id of Object.keys(CHARACTERS))S.set(`${id}_met`);
      const context={statusPanel:new Node('div'),game:{state:S,player:{hp:100,maxHp:100,lungs:{sat:0,filterPercent:100},lampBattery:1}}};
      const render=value=>{for(const id of Object.keys(CHARACTERS))S.trust.set(id,value);Menus.prototype.refreshStatus.call(context);return JSON.stringify(context.statusPanel);};
      const neutral=render(0);for(const value of [-100,-41,-13,13,26,41,100])assert.equal(render(value),neutral);
      assert.ok(context.statusPanel.children.length>10);
    }
  }finally{globalThis.document=previous;setLocale('en');}
});
