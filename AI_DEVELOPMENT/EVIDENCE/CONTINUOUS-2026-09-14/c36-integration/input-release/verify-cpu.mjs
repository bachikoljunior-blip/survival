import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = Object.fromEntries(['src/core/util.js','src/core/input.js','src/core/engine.js','src/game/game.js',
  'tools/test-ios-safari.mjs'].map(path => [path, read('source/' + path)]));
const candidate = read('candidate/tools/test-ios-safari.mjs');
const plain = text => text.replace(/^import .*;\n/gm, '').replace(/^export \{.*\};\n/gm, '').replace(/\bexport /g, '');
const fixed = source['src/game/game.js'].slice(source['src/game/game.js'].indexOf('  fixedUpdate(dt) {'),
  source['src/game/game.js'].indexOf('  _drainEvents(a) {'));
const helpers = candidate.slice(candidate.indexOf('function observeIosStreetRelease('), candidate.indexOf('function finger('));
const movement = text => text.slice(text.indexOf('      moveForCapture: async () => {') + 22,
  text.indexOf('\n      },\n    });', text.indexOf('      moveForCapture: async () => {'))) + '\n}';

function fixture() {
  let now = 0, id = 0;
  const timers = new Map(), listeners = new Map(), checks = [], report = { interaction: {} };
  const document = {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
  };
  const win = { innerWidth: 667, innerHeight: 375, addEventListener() {}, __cinderlineIosInput: [] };
  const context = vm.createContext({ window: win, document, navigator: {},
    performance: { now: () => now }, Date: { now: () => now },
    setTimeout(fn, ms) { const key = ++id; timers.set(key, { at: now + ms, fn }); return key; },
    clearTimeout(key) { timers.delete(key); }, requestAnimationFrame() { return 1; }, cancelAnimationFrame() {},
    THREE: { Scene: class {}, PerspectiveCamera: class {} }, __DEV__: false,
    separateActors() {}, report, check(passed, name, detail) { checks.push({ passed: !!passed, name, detail }); },
  });
  vm.runInContext(plain(source['src/core/util.js']) + '\n' + plain(source['src/core/input.js']) + '\n'
    + plain(source['src/core/engine.js']) + '\nconst MODE={PLAY:1,DIALOGUE:2,MENU:3};\n'
    + 'class NativeGame { ' + fixed + ' }\n'
    + 'globalThis.native={Input,Engine,NativeGame,MODE};\n' + helpers, context);
  const { Input, Engine, NativeGame, MODE } = context.native;
  const input = new Input({ addEventListener() {} }), engine = new Engine({});
  const game = new NativeGame();
  Object.assign(game, { input, time: 0, playTime: 0, mode: MODE.PLAY, gas: { update() {} }, actors: [],
    _playerInput() {}, _updateZone() {}, audio: { ctx: { get currentTime() { return now / 1000; } } },
    player: { pos: { toArray: () => [game.x || 0, 0, 0] } }, });
  engine.running = true;
  engine.tierLocked = true;
  engine.addUpdater(dt => game.fixedUpdate(dt));
  win.CINDERLINE = { engine, input, game, MODE };
  const event = (x, y, pointerId = 1) => ({ pointerType: 'touch', pointerId, clientX: x, clientY: y,
    cancelable: true, preventDefault() {} });
  const frame = ms => { now = ms; engine._frame(now); };
  const gesture = () => {
    input._onDown(event(110, 250)); input._onMove(event(110, 190)); frame(20);
    assert.equal(input.move.mag, 1);
    input._onUp(event(110, 190)); game.x = 2;
    win.__cinderlineIosInput.push({ type: 'pointerdown', trusted: true, pointerType: 'touch' },
      { type: 'pointerup', trusted: true, pointerType: 'touch' });
  };
  context.execute = async (script, args = []) => {
    context.args = args;
    const value = vm.runInContext('(function(){' + script + '\n}).apply(null,args)', context);
    return value === undefined ? null : JSON.parse(JSON.stringify(value));
  };
  context.performActions = async () => gesture();
  for (const name of ['finger', 'move', 'down', 'pause', 'up']) context[name] = (...args) => ({ name, args });
  const begin = () => vm.runInContext('observeIosStreetRelease(0)', context);
  const probe = () => win.__cinderlineIosRelease;
  const fireDown = () => { for (const fn of [...(listeners.get('pointerdown') || [])]) fn(event(110, 190)); };
  const timerNext = () => {
    const entry = [...timers.entries()].sort((a,b) => a[1].at-b[1].at)[0];
    if (!entry) return false;
    timers.delete(entry[0]); now = entry[1].at; entry[1].fn(); return true;
  };
  const settle = async promise => {
    let done = false, value, error;
    promise.then(v => { done=true; value=v; }, e => { done=true; error=e; });
    for (let i=0; i<40 && !done; i++) {
      for (let j=0; j<30; j++) await Promise.resolve();
      if (!done && !timerNext()) throw new Error('fixture promise stalled');
    }
    assert.equal(done, true); if (error) throw error; return value;
  };
  return { input, engine, game, win, document, frame, gesture, context, begin, probe, fireDown, checks, report,
    timers, listeners, timerNext, settle, schedule: (fn, ms) => context.setTimeout(fn, ms),
    setNow: n => { now=n; }, runMovement: text => vm.runInContext('(' + movement(text) + ')()', context) };
}

const results = [], started = performance.now();
async function test(name, fn) { const t=performance.now(); await fn(); results.push({name,passed:true,durationMs:performance.now()-t}); }
await test('original Input._onUp leaves last-step mag=1; native Engine + Game + Input next step clears to 0', () => {
  const f=fixture(); f.gesture();
  const before={stickActive:f.input._stick.active,moveMagnitude:f.input.move.mag,engineTime:f.engine.time,
    engineFrame:f.engine.frame,inputTime:f.input._time};
  assert.equal(before.stickActive,false); assert.equal(before.moveMagnitude,1);
  f.frame(40); assert.equal(f.input.move.mag,0); assert.ok(f.input._time>before.inputTime);
  writeFileSync(new URL('evidence/source-race.json',import.meta.url),JSON.stringify({before,after:{
    stickActive:f.input._stick.active,moveMagnitude:f.input.move.mag,engineTime:f.engine.time,
    engineFrame:f.engine.frame,inputTime:f.input._time}},null,2)+'\n');
});
await test('original complete audio movement callback rejects step-before read', async () => {
  const f=fixture(); const result=await f.runMovement(source['tools/test-ios-safari.mjs']);
  assert.equal(result.after.moveMagnitude,1); assert.equal(f.checks[1].passed,false);
});
await test('candidate complete callback preserves immediate read and uses first actual step; original checks still run', async () => {
  const f=fixture(); f.schedule(()=>f.frame(40),40);
  const result=await f.settle(f.runMovement(candidate));
  assert.equal(result.after.moveMagnitude,1); assert.equal(result.release.after.moveMagnitude,0);
  assert.equal(result.release.status,'passed'); assert.ok(result.release.after.inputTime>result.after.inputTime);
  assert.equal(f.checks.length,2); assert.ok(f.checks.every(c=>c.passed));
  assert.equal(f.report.interaction.audioStreetRelease,result); assert.equal(f.probe(),undefined);
  assert.equal(f.timers.size,0); assert.equal(f.listeners.get('pointerdown').size,0);
});
await test('real render-only frame cannot stand in for an input fixed step', () => {
  const f=fixture(); f.gesture(); f.begin(); f.frame(21); assert.equal(f.probe().status,'pending');
  f.frame(40); assert.equal(f.probe().status,'passed');
});
await test('already zero still requires new fixed step and frame', () => {
  const f=fixture(); f.gesture(); f.frame(40); f.begin(); assert.equal(f.probe().status,'pending');
  f.frame(60); assert.equal(f.probe().status,'passed');
});
await test('no engine tick times out, preserving immediate raw read', () => {
  const f=fixture(); f.gesture(); f.begin(); f.timerNext(); assert.equal(f.probe().status,'failed');
  assert.equal(f.probe().immediate.moveMagnitude,1); assert.equal(f.probe().elapsedMs,2000);
});
await test('first input step remaining nonzero fails even when a later step becomes zero', () => {
  const f=fixture(); f.gesture(); f.input._keys.add('up'); f.begin(); f.frame(40);
  assert.equal(f.probe().status,'failed'); f.input._keys.clear(); f.frame(60);
  assert.equal(f.input.move.mag,0); assert.equal(f.probe().status,'failed');
});
await test('engine/frame progress without actual Input.step is rejected', () => {
  const f=fixture(); f.gesture(); f.begin(); f.engine._updaters=[]; f.frame(40);
  assert.equal(f.probe().status,'failed'); assert.match(f.probe().reason,/without input/);
});
await test('frame advance with no fixed time cannot pass and eventually times out', () => {
  const f=fixture(); f.gesture(); f.begin(); f.engine.frame++; f.engine.emit('render');
  assert.equal(f.probe().status,'pending'); f.timerNext(); assert.equal(f.probe().status,'failed');
});
await test('transient pointerdown then pointerup between frames remains failure', () => {
  const f=fixture(); f.gesture(); f.begin(); f.fireDown(); f.frame(40);
  assert.equal(f.input.move.mag,0); assert.equal(f.probe().status,'failed'); assert.match(f.probe().reason,/recurred/);
});
await test('raw stick not synchronously released is immediate failure, not waited away', () => {
  const f=fixture(); f.gesture(); f.input._stick.active=true; f.begin(); assert.equal(f.probe().status,'failed');
  f.input._stick.active=false; f.frame(40); assert.equal(f.probe().status,'failed');
});
for (const [name,change] of [ ['pause',f=>f.engine.addPause('test')],['stopped',f=>f.engine.running=false],
  ['context loss',f=>f.engine.lost=true],['mode change',f=>f.game.mode=3],
  ['engine replacement',f=>f.win.CINDERLINE.engine={}],['input replacement',f=>f.win.CINDERLINE.input={} ]]) {
  await test(name+' cannot pass', () => {const f=fixture();f.gesture();f.begin();change(f);f.engine.emit('render');
    assert.equal(f.probe().status,'failed');});
}
await test('late first fixed step fails the original 2000 ms observation deadline', () => {
  const f=fixture(); f.gesture(); f.begin(); f.frame(2020); assert.equal(f.probe().status,'failed');
});
await test('nonfinite clock is rejected', () => {
  const f=fixture(); f.gesture(); f.input._time=NaN; f.begin(); assert.equal(f.probe().status,'failed');
});
await test('observer cleanup error cannot retain pass and remaining cleanup is attempted', () => {
  const f=fixture(); f.gesture(); const original=f.engine.off.bind(f.engine);
  f.engine.off=(...args)=>{original(...args);throw Error('injected removal error');};
  f.begin(); f.frame(40); assert.equal(f.probe().status,'failed'); assert.match(f.probe().reason,/cleanup/);
  assert.equal(f.listeners.get('pointerdown').size,0); assert.equal(f.timers.size,0);
});
await test('overlapping observation refuses overwrite of first evidence', () => {
  const f=fixture();f.gesture();f.begin();const p=f.probe();assert.throws(()=>f.begin(),/overlapping/);assert.equal(f.probe(),p);
});
await test('transport exception preserves immediate report and cleans observer', async () => {
  const f=fixture(); const execute=f.context.execute;
  f.context.execute=async(script,args)=>{ if(script.includes('return {status:p.status')) throw Error('injected transport error');
    return execute(script,args); };
  await assert.rejects(f.runMovement(candidate),/injected transport/);
  assert.equal(f.report.interaction.audioStreetRelease.after.moveMagnitude,1);
  assert.equal(f.probe(),undefined);assert.equal(f.timers.size,0);assert.equal(f.listeners.get('pointerdown').size,0);
});
await test('late terminal transport response cannot become pass after Node deadline', async () => {
  const f=fixture(); const execute=f.context.execute;
  f.context.execute=async(script,args)=>{ if(script.includes('return {status:p.status')) {
    f.frame(40);f.setNow(3000); } return execute(script,args); };
  const result=await f.runMovement(candidate); assert.equal(result.release.status,'failed');assert.equal(f.checks[1].passed,false);
});
await test('pointerdown failure keeps its original reason when listener cleanup also fails', () => {
  const f=fixture(); f.gesture(); const off=f.engine.off.bind(f.engine);
  f.engine.off=(...args)=>{off(...args);throw Error('SECONDARY listener cleanup failure');};
  f.begin(); f.fireDown();
  assert.equal(f.probe().status,'failed');
  assert.equal(f.probe().reason,'pointerdown recurred before release observation completed');
  assert.equal(f.probe().observationReason,f.probe().reason);
  assert.deepEqual([...f.probe().cleanupErrors],['SECONDARY listener cleanup failure']);
});
await test('collection and cleanup failures retain primary error and terminal release record', async () => {
  const f=fixture(); const execute=f.context.execute;
  f.context.execute=async(script,args)=>{
    if(script.includes('return {status:p.status'))throw Error('PRIMARY collection transport failure');
    if(script.includes('p.cleanup(); delete'))throw Error('SECONDARY cleanup transport failure');
    return execute(script,args);
  };
  await assert.rejects(f.runMovement(candidate),/PRIMARY collection transport failure/);
  const saved=f.report.interaction.audioStreetRelease;
  assert.equal(saved.after.moveMagnitude,1);
  assert.equal(saved.release.status,'failed');
  assert.equal(saved.release.reason,'PRIMARY collection transport failure');
  assert.deepEqual([...saved.release.cleanupErrors],['SECONDARY cleanup transport failure']);
});
await test('a successful first update cannot pass failed terminal cleanup, and observation remains recorded', async () => {
  const f=fixture(); const execute=f.context.execute;
  f.context.execute=async(script,args)=>{
    if(script.includes('return {status:p.status')) f.frame(40);
    if(script.includes('p.cleanup(); delete'))throw Error('SECONDARY terminal cleanup failure');
    return execute(script,args);
  };
  await assert.rejects(f.runMovement(candidate),/SECONDARY terminal cleanup failure/);
  const release=f.report.interaction.audioStreetRelease.release;
  assert.equal(release.status,'failed');
  assert.equal(release.observationStatus,'passed');
  assert.equal(release.after.moveMagnitude,0);
  assert.deepEqual([...release.cleanupErrors],['SECONDARY terminal cleanup failure']);
});
const result={scope:'CPU only: unmodified canonical Input, util/Emitter, Engine._frame and Game.fixedUpdate; DOM, scheduling, native actions, world/render and transport are fixtures, not Safari or physical movement.',
  sourceCommit:'d2c463b54d4ea12abc0a9444627db810440a59a7',candidateSha256:createHash('sha256').update(candidate).digest('hex'),
  passed:results.length,failed:0,durationMs:performance.now()-started,results};
writeFileSync(new URL('evidence/controls.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
