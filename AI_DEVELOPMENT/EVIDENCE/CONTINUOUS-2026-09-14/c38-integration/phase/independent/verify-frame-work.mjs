import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { installFrameWorkProbe, stopFrameWorkProbe } from '../candidate/tools/frame_work_probe.mjs';

const source = readFileSync(new URL('../source/src/core/engine.js', import.meta.url), 'utf8');
const util = readFileSync(new URL('../source/src/core/util.js', import.meta.url), 'utf8');
const data = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const { Engine } = await import(data(source
  .replace("import * as THREE from 'three';", 'const THREE={Scene:class{},PerspectiveCamera:class{}};')
  .replace("'./util.js'", JSON.stringify(data(util)))));
let ms = 1000, queued, assertions = 0, clockCost = 0;
const ok = (value, message) => { assert.ok(value, message); assertions++; };
const eq = (a, b, message) => { assert.deepEqual(a, b, message); assertions++; };
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => { const value = ms; ms += clockCost; return value; } } });
globalThis.requestAnimationFrame = callback => { queued = callback; return 1; };
globalThis.cancelAnimationFrame = () => {};
const cost = amount => { ms += amount; };
function scene() {
  ms = 1000;
  const engine = new Engine({});
  engine.tierLocked = true;
  const counters = { steps: 0, renders: 0 };
  const game = {
    scene: {}, input: { step() {} }, gas: { update() {} }, nav: { updateGasCost() {} },
    actors: [{ update() {} }], systems: [{ update() {} }],
    _playerInput() {}, _drainEvents() {}, _updateZone() {},
    mode: 'play', audio: { ctx: { state: 'running', get currentTime() { return ms / 1000; } }, update() { cost(3); } },
    camera: { update() { cost(2); } }, atmos: { update() { cost(5); } },
    hud: { update() { cost(7); }, updatePerf() { cost(11); } },
    city: { updateVisibility() { cost(13); } }, post: { quadScene: {}, quad: {}, matComposite: {},
      render() { engine.renderer.render(game.scene); this.quad.material = this.matComposite;
        engine.renderer.render(this.quadScene); } },
    render() { this.camera.update(); this.atmos.update(); this.audio.update();
      this.hud.update(); this.hud.updatePerf(); this.city.updateVisibility(); this.post.render(); },
  };
  engine.renderer = { info: { programs: [{}] }, render() { counters.renders++; cost(counters.renders === 3 ? 850 : 2); } };
  engine.addUpdater(() => { counters.steps++; cost(1); game.input.step(); game.gas.update();
    game.nav.updateGasCost(); game._playerInput();
    for (const actor of game.actors) { actor.update(); game._drainEvents(actor); }
    for (const system of game.systems) system.update(); game._updateZone(); }, 0);
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
const expensive = d.rows.find(row => row.phaseMs['renderer.world'] === 850);
ok(expensive, 'injected renderer-call delay observed in its phase');
eq(expensive.engineWallMs, 20, 'render delay does not become the same callback rAF input');
eq(expensive.phaseMs['audio.update'], 3, 'separate audio call elapsed observed');
eq(expensive.phaseMs['post.render'], 852, 'nested rendering times are inclusive');
eq(expensive.phaseMs['renderer.composite'], 2, 'second normal render measured separately');
eq(expensive.phaseMs['renderer.render'], 852, 'compatible aggregate retains both actual calls');
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

const detail = scene();
detail.game.nav.updateGasCost = () => cost(45.5);
detail.engine.renderer.render = arg => { if (arg === detail.game.scene) {
  cost(446); detail.engine.renderer.info.programs.push({});
} else cost(1); };
const navOriginal = detail.game.nav.updateGasCost;
installFrameWorkProbe(); detail.C.__audioRecording = {};
detail.tick(1020); detail.tick(2000);
const dd = stopFrameWorkProbe(), dr = dd.rows[0];
eq(dr.phaseMs['fixed.navGasCost'], 182, 'four fixed calls attribute 182 ms to nav in synthetic fixture');
eq(dr.phaseCalls['fixed.navGasCost'], 4, 'four fixed invocations retained');
eq(dr.phaseMs['renderer.world'], 446, 'world renderer separated');
eq(dr.phaseMs['renderer.composite'], 1, 'composite renderer separated');
eq(dd.slowCalls.filter(call => call.phase === 'fixed.navGasCost').map(call => call.elapsedMs), [45.5, 45.5, 45.5, 45.5], 'individual fixed calls are not collapsed');
eq(dd.slowCalls.find(call => call.phase === 'renderer.world').elapsedMs, 446, 'individual renderer call retained');
eq(dr.programsAfter - dr.programsBefore, 1, 'renderer program-count change observed without GL queries');
ok(dr.probeClockReads > 30, 'actual observer clock calls counted');
eq(dr.observerBookkeepingMs, 0, 'zero-cost fake clock assigns no phase body time to observer bookkeeping');
eq(detail.game.nav.updateGasCost, navOriginal, 'fixed target identity restored');

const slowCap = scene(); installFrameWorkProbe(); slowCap.C.__audioRecording = {};
for (let i = 1; i <= 300; i++) slowCap.tick(1000 + 20 * i);
const sc = stopFrameWorkProbe();
// Fixture city and HUD are slow, but only renderer/fixed detail events consume the cap.
eq(sc.slowCallsDropped, 0, 'outer render/HUD overlap does not flood individual-detail events');
const actualCap = scene(); actualCap.game.gas.update = () => cost(9);
installFrameWorkProbe(); actualCap.C.__audioRecording = {};
for (let i = 1; i <= 300; i++) actualCap.tick(1000 + 20 * i);
const ac = stopFrameWorkProbe();
eq(ac.slowCalls.length, 256, 'individual slow call array bounded');
ok(ac.slowCallsDropped > 0 && !ac.detailComplete && !ac.complete, 'detail overflow reported and cannot claim complete');

const registration = scene(); installFrameWorkProbe();
registration.game.actors.push({update() {}});
const rc = stopFrameWorkProbe();
ok(rc.errors.includes('fixed detail target registration changed during capture') && !rc.complete, 'unobserved registration change does not claim complete');

const missing = scene(), originalGas = missing.game.gas.update;
delete missing.game.nav.updateGasCost;
assert.throws(installFrameWorkProbe, /missing timing target/); assertions++;
eq(missing.game.gas.update, originalGas, 'partial fixed-detail installation rollback restores earlier targets');
eq(missing.engine._boundFrame, missing.original.bound, 'partial detail failure restores scheduled frame callback');

const observer = scene(); installFrameWorkProbe(); observer.C.__audioRecording = {};
observer.tick(1020); clockCost = 0.25; observer.tick(1040); clockCost = 0;
const od = stopFrameWorkProbe(), obs = od.rows[0];
ok(obs.observerBookkeepingMs > 0, 'injected observer clock/bookkeeping elapsed is visible');
eq(obs.engineWallMs, 20, 'observer elapsed never normalizes original rAF input');
eq(obs.acceptedDtSeconds, 0.02, 'actual engine input guard retains uncorrected value');
ok(obs.callbackElapsedMs > 40 && obs.probeClockReads > 30, 'raw callback retains measured instrumentation elapsed');
ok(obs.observedWrapperEntryMs <= obs.before.wallMs, 'observed entry marker includes some wrapper setup before clock snapshot');
ok(obs.observedWrapperExitMs >= obs.after.wallMs, 'observed exit marker includes some wrapper finalization after clock snapshot');

const other = scene(); other.game.post.render = function () {
  other.engine.renderer.render(other.game.scene);
  this.quad.material = {}; other.engine.renderer.render(this.quadScene);
  this.quad.material = this.matComposite; other.engine.renderer.render(this.quadScene);
};
installFrameWorkProbe(); other.C.__audioRecording = {}; other.tick(1020); other.tick(1040);
const otherRow = stopFrameWorkProbe().rows[0];
eq(otherRow.phaseCalls['renderer.other'], 1, 'non-composite post pass remains distinct');
eq(otherRow.phaseCalls['renderer.composite'], 1, 'only composite material is labeled composite');

const result = { passed: assertions, status: 'pass', scope: 'CPU fixture using canonical actual Engine._frame, fake rAF/performance and fake phase bodies. No real Safari, CPU utilization, GPU or physical-device performance measurement.',
  synchronousDelayExample: expensive, followingFrame: following };
writeFileSync(new URL('frame-work-result.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ passed: assertions, status: 'pass' }));
