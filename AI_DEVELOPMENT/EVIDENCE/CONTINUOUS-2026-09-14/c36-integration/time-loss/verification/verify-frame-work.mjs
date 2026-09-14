import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { installFrameWorkProbe, stopFrameWorkProbe } from '../candidate/tools/frame_work_probe.mjs';

const source = readFileSync(new URL('../source/src/core/engine.js', import.meta.url), 'utf8');
const util = readFileSync(new URL('../source/src/core/util.js', import.meta.url), 'utf8');
const data = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const { Engine } = await import(data(source
  .replace("import * as THREE from 'three';", 'const THREE={Scene:class{},PerspectiveCamera:class{}};')
  .replace("'./util.js'", JSON.stringify(data(util)))));
let ms = 1000, queued, assertions = 0;
const ok = (value, message) => { assert.ok(value, message); assertions++; };
const eq = (a, b, message) => { assert.deepEqual(a, b, message); assertions++; };
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => ms } });
globalThis.requestAnimationFrame = callback => { queued = callback; return 1; };
globalThis.cancelAnimationFrame = () => {};
const cost = amount => { ms += amount; };
function scene() {
  ms = 1000;
  const engine = new Engine({});
  engine.tierLocked = true;
  const counters = { steps: 0, renders: 0 };
  const game = {
    mode: 'play', audio: { ctx: { state: 'running', get currentTime() { return ms / 1000; } }, update() { cost(3); } },
    camera: { update() { cost(2); } }, atmos: { update() { cost(5); } },
    hud: { update() { cost(7); }, updatePerf() { cost(11); } },
    city: { updateVisibility() { cost(13); } }, post: { render() { engine.renderer.render(); } },
    render() { this.camera.update(); this.atmos.update(); this.audio.update();
      this.hud.update(); this.hud.updatePerf(); this.city.updateVisibility(); this.post.render(); },
  };
  engine.renderer = { render() { counters.renders++; cost(counters.renders === 3 ? 850 : 2); } };
  engine.addUpdater(() => { counters.steps++; cost(1); }, 0);
  engine.on('render', () => game.render());
  const C = { engine, game };
  globalThis.window = { CINDERLINE: C };
  const original = { bound: engine._boundFrame, emit: engine.emit, updater: engine._updaters[0].fn,
    render: game.render, renderer: engine.renderer.render };
  engine.start();
  const tick = (raf, entry = raf) => { ms = entry; const fn = queued; fn(raf); };
  return { C, engine, game, counters, original, tick };
}
function replay(profile) {
  const s = scene();
  s.C.__audioRecording = {};
  if (profile) installFrameWorkProbe();
  const states = [];
  for (const raf of [1020, 1040, 1060, 1960, 1980, 2000]) {
    if (raf === 1960 || raf === 2000) s.C.__audioRecording = {};
    s.tick(raf);
    states.push({ time: s.engine.time, accum: s.engine.accum, frame: s.engine.frame, ...s.counters });
  }
  return { s, states, diagnostic: profile ? stopFrameWorkProbe() : null };
}
const baseline = replay(false), observed = replay(true);
eq(observed.states, baseline.states, 'actual Engine._frame simulation/render result unchanged by instrumentation');
const d = observed.diagnostic;
eq(d.rows.length, 5, 'one already queued original callback explicitly absent');
eq(d.recordingCount, 3, 'original recording identities distinguish three clips');
ok(d.complete && d.restored, 'bounded complete result and restored wrappers');
const expensive = d.rows.find(row => row.phaseMs['renderer.render'] === 850);
ok(expensive, 'injected renderer-call delay observed in its phase');
eq(expensive.engineWallMs, 20, 'render delay does not become the same callback rAF input');
eq(expensive.phaseMs['audio.update'], 3, 'separate audio call elapsed observed');
eq(expensive.phaseMs['post.render'], 850, 'nested rendering times are inclusive');
ok(expensive.callbackElapsedMs > expensive.phaseMs['renderer.render'], 'callback includes remaining work');
ok(expensive.engineAdvanceSeconds < 0.05, 'long renderer callback did not retroactively advance simulation');
const following = d.rows.find(row => row.rafTimestampMs === 1960);
ok(Math.abs(following.engineAdvanceSeconds - 4 / 60) < 1e-12, 'following 900 ms rAF still caps actual engine at four steps');
eq(following.after.accum, 0, 'original backlog discard preserved');
eq(observed.s.engine._boundFrame, observed.s.original.bound, 'bound callback identity restored');
eq(observed.s.engine.emit, observed.s.original.emit, 'inherited emitter identity restored');
ok(!Object.hasOwn(observed.s.engine, 'emit'), 'inherited emitter own-property shape restored');
eq(observed.s.engine._updaters[0].fn, observed.s.original.updater, 'updater identity restored');
eq(observed.s.game.render, observed.s.original.render, 'render identity restored');
eq(observed.s.engine.renderer.render, observed.s.original.renderer, 'renderer identity restored');
const rowCount = d.rows.length;
observed.s.tick(2020);
eq(d.rows.length, rowCount, 'queued restored wrapper no longer records');
eq(stopFrameWorkProbe(), null, 'cleanup idempotent');

const paused = scene(); installFrameWorkProbe(); paused.C.__audioRecording = {};
paused.tick(1020); paused.engine.addPause('test'); paused.tick(1040);
paused.engine.removePause('test'); paused.tick(1060);
const pd = stopFrameWorkProbe();
ok(pd.rows.some(row => row.before.paused && row.after.engineFrame === row.before.engineFrame), 'paused callbacks sampled');
ok(pd.rows.filter(row => row.before.paused).every(row => row.acceptedDtSeconds === null), 'paused stored dtRaw never presented as accepted frame input');
eq(pd.lifecycle.map(event => event.event), ['pause', 'resume'], 'pause/resume interval evidence retained');
eq(pd.complete, false, 'one recording cannot claim three complete captures');

const capped = scene(); installFrameWorkProbe(); capped.C.__audioRecording = {};
for (let i = 1; i <= 4100; i++) capped.tick(1000 + i * 20);
const cd = stopFrameWorkProbe();
eq(cd.rows.length, 4096, 'row allocation bounded'); ok(cd.dropped > 0 && !cd.complete, 'capacity overflow cannot claim complete');

const replaced = scene(); installFrameWorkProbe();
const replacement = () => 42; replaced.engine._updaters[0].fn = replacement;
const rd = stopFrameWorkProbe();
eq(replaced.engine._updaters[0].fn, replacement, 'external replacement never overwritten');
ok(!rd.restored && rd.errors.length > 0, 'identity change is reported');

const broken = scene(); delete broken.game.hud.updatePerf;
assert.throws(installFrameWorkProbe, /missing timing target/); assertions++;
eq(broken.engine._boundFrame, broken.original.bound, 'partial installation rolled back');
eq(broken.engine._updaters[0].fn, broken.original.updater, 'partial updater installation rolled back');
ok(!broken.C.__iosFrameWorkProbe, 'failed install leaves no probe owner');

const thrown = scene(); thrown.engine.addUpdater(() => { throw new Error('original failure sentinel'); }, 1);
installFrameWorkProbe(); thrown.C.__audioRecording = {};
assert.throws(() => thrown.tick(1020), /original failure sentinel/); assertions++;
assert.throws(() => thrown.tick(1040), /original failure sentinel/); assertions++;
const td = stopFrameWorkProbe();
ok(td.rows.some(row => row.threw), 'original thrown callback preserved and annotated');

const result = { passed: assertions, status: 'pass', scope: 'CPU fixture using canonical actual Engine._frame, fake rAF/performance and fake phase bodies. No real Safari, CPU utilization, GPU or physical-device performance measurement.',
  synchronousDelayExample: expensive, followingFrame: following };
writeFileSync(new URL('frame-work-result.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ passed: assertions, status: 'pass' }));
