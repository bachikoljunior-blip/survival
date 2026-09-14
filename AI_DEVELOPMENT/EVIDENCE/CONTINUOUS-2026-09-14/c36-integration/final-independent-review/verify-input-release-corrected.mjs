import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

const read = path => readFileSync(new URL(path, 'file:///workspace/scratch/0b7ad82bafe7/c36-input-release-adoption-review/'), 'utf8');
const source = Object.fromEntries(['src/core/util.js','src/core/input.js','src/core/engine.js','src/game/game.js',
  'tools/test-ios-safari.mjs'].map(path => [path, read('source/' + path)]));
const candidate = readFileSync(new URL('input-release-reviewed-corrected.mjs',import.meta.url),'utf8');
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



const output={candidateSha256:createHash('sha256').update(candidate).digest('hex'),scope:'CPU fixture only; independent retest of exact corrected helpers with original updater chain, no Safari execution',status:'passed',results:[]};
{
 const f=fixture();f.gesture();const original=f.engine.off.bind(f.engine);
 f.engine.off=(...args)=>{original(...args);throw Error('secondary listener removal error');};
 f.begin();f.fireDown();
 assert.equal(f.probe().status,'failed');
 assert.equal(f.probe().reason,'pointerdown recurred before release observation completed');
 assert.equal(f.probe().observationReason,f.probe().reason);
 assert.equal(f.probe().cleanupErrors[0],'secondary listener removal error');
 output.results.push({case:'browser primary failure plus cleanup failure',passed:true,reason:f.probe().reason,cleanupErrors:f.probe().cleanupErrors});
}
{
 const f=fixture();const execute=f.context.execute;
 f.context.execute=async(script,args)=>{
  if(script.includes('return {status:p.status'))throw Error('PRIMARY collection transport failure');
  if(script.includes('p.cleanup(); delete'))throw Error('SECONDARY cleanup transport failure');
  return execute(script,args);
 };
 let observed;
 try {await f.runMovement(candidate);} catch(e){observed=String(e.message||e);}
 assert.equal(observed,'PRIMARY collection transport failure');
 const saved=f.report.interaction.audioStreetRelease;
 assert.equal(saved.after.moveMagnitude,1);
 assert.equal(saved.release.reason,'PRIMARY collection transport failure');
 assert.equal(saved.release.cleanupErrors[0],'SECONDARY cleanup transport failure');
 output.results.push({case:'collection primary failure plus cleanup failure',passed:true,thrown:observed,reason:saved.release.reason,cleanupErrors:saved.release.cleanupErrors});
}
{
 const f=fixture();f.schedule(()=>f.frame(40),40);
 const result=await f.settle(f.runMovement(candidate));
 assert.equal(result.after.moveMagnitude,1);assert.equal(result.release.status,'passed');
 assert.equal(result.release.after.moveMagnitude,0);assert.equal(f.probe(),undefined);
 assert.ok(f.checks.every(c=>c.passed));
 output.results.push({case:'healthy first fixed-step observation retains original immediate read',passed:true,immediate:result.after.moveMagnitude,afterStep:result.release.after.moveMagnitude});
}
{
 const f=fixture();const execute=f.context.execute;
 f.context.execute=async(script,args)=>{
  if(script.includes('p.cleanup(); delete'))throw Error('cleanup transport after observed success');
  return execute(script,args);
 };
 f.schedule(()=>f.frame(40),40);
 let thrown;
 try {await f.settle(f.runMovement(candidate));}catch(e){thrown=e.message;}
 const saved=f.report.interaction.audioStreetRelease.release;
 assert.equal(thrown,'cleanup transport after observed success');assert.equal(saved.status,'failed');
 assert.equal(saved.observationStatus,'passed');assert.equal(saved.after.moveMagnitude,0);
 assert.equal(saved.cleanupErrors[0],thrown);
 output.results.push({case:'cleanup failure invalidates observed success but preserves terminal snapshot',passed:true,status:saved.status,observationStatus:saved.observationStatus,cleanupErrors:saved.cleanupErrors});
}
writeFileSync(new URL('input-release-corrected-verification.json',import.meta.url),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
