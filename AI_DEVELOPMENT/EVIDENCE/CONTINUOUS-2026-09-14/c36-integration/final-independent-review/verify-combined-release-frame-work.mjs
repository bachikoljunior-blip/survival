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




const probeSource=readFileSync(new URL('frame-work-reviewed-final.mjs',import.meta.url),'utf8');
const output={status:'passed',scope:'Combined CPU fixture for exact release observer and exact frame-work wrapper; original Input/Engine fixed updater chain, fake DOM/clock/render bodies. No Safari or performance measurement.',releaseSha256:createHash('sha256').update(candidate).digest('hex'),probeSha256:createHash('sha256').update(probeSource).digest('hex'),results:[]};
for(const failedRelease of [false,true]) {
 const f=fixture();
 for(const key of ['camera','atmos','hud','city','post'])f.game[key]={update(){},updatePerf(){},updateVisibility(){},render(){}};
 f.game.audio.update=()=>{};f.engine.renderer={render(){}};
 f.game.render=()=>{f.game.camera.update();f.game.atmos.update();f.game.audio.update();f.game.hud.update();f.game.hud.updatePerf();f.game.city.updateVisibility();f.game.post.render();f.engine.renderer.render();};
 f.engine.on('render',()=>f.game.render());
 vm.runInContext(probeSource.replace(/^export /gm,''),f.context);
 const beforeBound=f.engine._boundFrame,beforeEmit=f.engine.emit,beforeUpdater=f.engine._updaters[0].fn;
 vm.runInContext('installFrameWorkProbe()',f.context);
 f.win.CINDERLINE.__audioRecording={recorder:{state:'recording'}};
 f.gesture();if(failedRelease)f.input._keys.add('up');const immediate=f.begin();
 f.setNow(40);f.engine._boundFrame(40);
 const release=JSON.parse(JSON.stringify(f.probe()));
 assert.equal(immediate.moveMagnitude,1);assert.equal(release.status,failedRelease?'failed':'passed');
 assert.equal(release.after.moveMagnitude,failedRelease?1:0);
 f.setNow(60);f.engine._boundFrame(60);
 f.win.CINDERLINE.__audioRecording={recorder:{state:'recording'}};f.setNow(80);f.engine._boundFrame(80);
 f.win.CINDERLINE.__audioRecording={recorder:{state:'recording'}};f.setNow(100);f.engine._boundFrame(100);
 const timing=vm.runInContext('stopFrameWorkProbe()',f.context);
 assert.equal(timing.complete,true);assert.equal(timing.recordingCount,3);assert.equal(timing.rows.length,4);
 assert.equal(timing.restored,true);assert.equal(f.engine._boundFrame,beforeBound);assert.equal(f.engine.emit,beforeEmit);assert.equal(f.engine._updaters[0].fn,beforeUpdater);
 assert.equal(f.listeners.get('pointerdown').size,0);
 output.results.push({case:failedRelease?'nonzero first-step remains failure with timing wrapper':'healthy first-step remains pass with timing wrapper',passed:true,releaseStatus:release.status,timingRows:timing.rows.length,recordings:timing.recordingCount,wrappersRestored:timing.restored});
}
writeFileSync(new URL('combined-release-frame-work-verification.json',import.meta.url),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
