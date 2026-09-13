import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../src/core/input.js';

// Real Input and Button state machines; EventTarget replaces only DOM wiring.
function input() {
  const w=globalThis.window,d=globalThis.document;
  globalThis.window=new EventTarget();globalThis.document=new EventTarget();
  try { return new Input(new EventTarget()); }
  finally {globalThis.window=w;globalThis.document=d;}
}
const frame=i=>i.step(1/60);
const tap=i=>{i.setVirtual('guard',true);i.setVirtual('guard',false);frame(i);frame(i);};

test('the default guard still requires a hold',()=>{
  const i=input();i.setVirtual('guard',true);frame(i);assert.equal(i.down('guard'),true);
  i.setVirtual('guard',false);frame(i);assert.equal(i.down('guard'),false);
});
test('a subframe tap latches guard until the next tap, not the release',()=>{
  const i=input();i.setToggleMode('guard',true);tap(i);
  assert.equal(i.buttons.guard.down,false);assert.equal(i.down('guard'),true);
  for(let n=0;n<120;n++) frame(i);
  assert.equal(i.down('guard'),true);tap(i);assert.equal(i.down('guard'),false);
});
test('holding changes state only once and two subframe taps cancel each other',()=>{
  const i=input();i.setToggleMode('guard',true);i.setVirtual('guard',true);
  for(let n=0;n<60;n++) frame(i);
  assert.equal(i.down('guard'),true);i.setVirtual('guard',false);frame(i);
  for(let n=0;n<2;n++){i.setVirtual('guard',true);i.setVirtual('guard',false);}
  frame(i);assert.equal(i.down('guard'),true);frame(i);frame(i);assert.equal(i.down('guard'),true);
});
test('pause/reset, explicit cancellation and changing modes clear latched guard',()=>{
  const i=input();i.setToggleMode('guard',true);tap(i);i.reset();assert.equal(i.down('guard'),false);
  tap(i);i.clearToggle('guard');assert.equal(i.down('guard'),false);
  tap(i);i.setToggleMode('guard',false);assert.equal(i.down('guard'),false);
  i.setToggleMode('guard',true);assert.equal(i.down('guard'),false);
});
test('disabled input cannot latch a press behind a menu',()=>{
  const i=input();i.setToggleMode('guard',true);i.setEnabled(false);tap(i);
  i.setEnabled(true);frame(i);assert.equal(i.down('guard'),false);
});
test('a press queued while simulation is paused is discarded on resume',()=>{
  const i=input();i.setToggleMode('guard',true);i.setEnabled(false);
  i._onKey({code:'KeyQ'},true);i._onKey({code:'KeyQ'},false);
  i.setEnabled(true);frame(i);frame(i);assert.equal(i.down('guard'),false);
  assert.equal(i.pressed('guard'),false);
});
test('keyboard guard follows the same toggle path and does not alter attack semantics',()=>{
  const i=input();i.setToggleMode('guard',true);
  i._onKey({code:'KeyQ'},true);frame(i);i._onKey({code:'KeyQ'},false);frame(i);
  assert.equal(i.down('guard'),true);assert.equal(i.buttons.guard._rawDown,false);
  i.setVirtual('attack',true);i.setVirtual('attack',false);frame(i);
  assert.equal(i.pressed('attack'),true);frame(i);assert.equal(i.down('attack'),false);
});
test('a second source can release a toggle while the first source is still held',()=>{
  const i=input();i.setToggleMode('guard',true);i._onKey({code:'KeyQ'},true);frame(i);
  assert.equal(i.down('guard'),true);tap(i);assert.equal(i.down('guard'),false);
  i._onKey({code:'KeyQ'},false);frame(i);assert.equal(i.down('guard'),false);
});
test('cancelling discards old queued toggle presses without delayed rearming',()=>{
  const i=input();i.setToggleMode('guard',true);
  for(let n=0;n<3;n++){i.setVirtual('guard',true);i.setVirtual('guard',false);}
  frame(i);i.clearToggle('guard');
  for(let n=0;n<20;n++){frame(i);assert.equal(i.down('guard'),false);}
  tap(i);assert.equal(i.down('guard'),true);
});
