import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const here = new URL('./', import.meta.url);
const baseline = await readFile(new URL('baseline/tools/frame_work_probe.mjs', here), 'utf8');
const candidate = await readFile(new URL('candidate/tools/frame_work_probe.mjs', here), 'utf8');
const sha = s => createHash('sha256').update(s).digest('hex');
const plain = x => JSON.parse(JSON.stringify(x));
const results = [];
const facts = {};
async function check(name, body) { await body(); results.push({ name, passed: true }); }
const program = (id = 0, overrides = {}) => ({ id, name: `name-${id}`, cacheKey: `key-${id}`, ...overrides });

function fixture(source = candidate, programs = [program()], options = {}) {
  const metrics = { nowCalls: 0, encodes: 0, descriptorReads: 0, gl: 0, callbacks: 0 };
  let time = 100, action = null;
  const advance = value => { time += value; };
  const noOp = function () { advance(0.2); return this; };
  const audioProto = { update: noOp };
  const audio = Object.assign(Object.create(audioProto), { ctx: { currentTime: 3, state: 'running' } });
  const renderer = { info: { programs }, render: noOp };
  for (const key of ['getContext', 'compile', 'compileAsync', 'getProgramParameter']) {
    Object.defineProperty(renderer, key, { get() { metrics.gl++; throw new Error('GL access forbidden in fixture'); } });
  }
  const game = {
    audio, camera: { update: noOp }, atmos: { update: noOp }, hud: { update: noOp, updatePerf: noOp },
    city: { updateVisibility: noOp }, post: { render: noOp, quadScene: {}, quad: {}, matComposite: {} },
    input: { step: noOp }, gas: { update: noOp }, nav: { updateGasCost: noOp },
    _playerInput: noOp, _drainEvents: noOp, _updateZone: noOp,
    actors: [{ kind: 'sample', update: noOp }], systems: [{ update: noOp }],
    scene: {}, mode: 'play', render: noOp,
  };
  game.player = game.actors[0]; game.combat = game.systems[0]; game.post.quad.material = game.post.matComposite;
  const engine = {
    renderer, _updaters: [{ order: 1, fn: noOp }], frame: 0, time: 0, accum: 0,
    clockLast: 80, dtRaw: 1 / 60, running: true, isPaused: false, lost: false,
    tier: { name: 'low' }, timeScale: 1,
    emit(event) { if (event === 'render') game.render(); return event; },
  };
  game.render = function () { renderer.render(game.scene); game.post.render(); renderer.render(game.post.quadScene); };
  const callbackToken = {};
  engine._boundFrame = function (timestamp) {
    metrics.callbacks++;
    if (action) action({ engine, game, renderer, advance });
    engine._updaters[0].fn(); game.audio.update(); game.input.step();
    game.actors[0].update(); game.systems[0].update(); engine.emit('render');
    engine.frame++; engine.time += 1 / 60; engine.clockLast = timestamp; game.audio.ctx.currentTime += 1 / 60;
    return callbackToken;
  };
  if (options.beforeInstall) options.beforeInstall({ engine, game, renderer, metrics });
  const targets = [[engine, '_boundFrame'], [engine, 'emit'], [engine._updaters[0], 'fn'],
    [audio, 'update'], [game, 'render'], [game.camera, 'update'], [game.atmos, 'update'],
    [game.hud, 'update'], [game.hud, 'updatePerf'], [game.city, 'updateVisibility'], [game.post, 'render'],
    [renderer, 'render'], [game.input, 'step'], [game.gas, 'update'], [game.nav, 'updateGasCost'],
    [game, '_playerInput'], [game, '_drainEvents'], [game, '_updateZone'],
    [game.actors[0], 'update'], [game.systems[0], 'update']];
  const descriptors = targets.map(([object, key]) => ({ object, key, descriptor: Object.getOwnPropertyDescriptor(object, key), value: object[key] }));
  const C = { engine, game };
  if (!options.noRecording) C.__audioRecording = { recorder: { state: 'recording' } };
  const observed = options.descriptorCostObjects || new Set();
  const context = vm.createContext({ window: { CINDERLINE: C }, console,
    performance: { now() { metrics.nowCalls++; advance(0.1); return time; } },
    TextEncoder: class {
      encode(value) { metrics.encodes++; return new TextEncoder().encode(value); }
    },
    observeDescriptor(object) {
      if (observed.has(object)) { metrics.descriptorReads++; advance(options.descriptorCost || 0); }
    },
  });
  vm.runInContext(`const realDescriptor = Object.getOwnPropertyDescriptor;
    Object.getOwnPropertyDescriptor = function (object, key) {
      observeDescriptor(object); return realDescriptor(object, key);
    };`, context);
  vm.runInContext(source.replace(/^export /gm, '') + '\nthis.probeAPI = { installFrameWorkProbe, stopFrameWorkProbe };', context);
  const api = context.probeAPI;
  const assertRestored = () => {
    for (const row of descriptors) {
      assert.deepEqual(Object.getOwnPropertyDescriptor(row.object, row.key), row.descriptor);
      assert.equal(row.object[row.key], row.value);
    }
    assert.equal(C.__iosFrameWorkProbe, undefined);
  };
  return { C, engine, game, renderer, programs, metrics, api, descriptors, assertRestored, callbackToken,
    advance, setAction(fn) { action = fn; }, setRecording() { C.__audioRecording = { recorder: { state: 'recording' } }; },
    install() { return api.installFrameWorkProbe(); },
    frame(timestamp = engine.clockLast + 16.667) { return engine._boundFrame(timestamp); },
    stop() { return api.stopFrameWorkProbe(); } };
}

await check('Frozen candidate reverses to fresh canonical source with only the declared additions', () => {
  assert.equal(sha(baseline), 'eabc3f8ba621e992902a63790b86f0787bb84998bd5b9fa239ab20414d661fe8');
  assert.equal(sha(candidate), '33dfcc32bdc7a2b3de52c0295f822dd4f8eff112bb74fbf3d6e45926e23ac618');
  const inventoryBlock = candidate.slice(candidate.indexOf('  // Auxiliary inventory only:'), candidate.indexOf('  const clock ='));
  const initialBlock = candidate.slice(candidate.indexOf("    try { observePrograms(programCount(), 'installation'); }"), candidate.indexOf('    C.__iosFrameWorkProbe ='));
  const reversed = candidate.replace(inventoryBlock, '').replace(initialBlock, '')
    .replace("      observePrograms(row.programsBefore, 'callback-entry', row);\n", '')
    .replace("        observePrograms(row.programsAfter, 'callback-exit', row);\n", '')
    .replace('slowCalls, fixedTargets, programIdentity,', 'slowCalls, fixedTargets,');
  assert.equal(reversed, baseline);
  assert.equal((candidate.match(/performance\.now\(/g) || []).length, (baseline.match(/performance\.now\(/g) || []).length);
});
await check('Serialized page functions retain initial and callback entry/exit identities with original array/object identity', () => {
  const p0 = program(), programs = [p0]; const f = fixture(candidate, programs); f.install();
  const p1 = program(1); programs.push(p1); f.frame();
  f.setAction(() => programs.push(program(2))); f.frame(); f.setAction(null);
  const report = f.stop(), identity = report.programIdentity;
  assert.deepEqual(plain(identity.events.map(e => e.boundary)), ['installation', 'callback-entry', 'callback-exit']);
  assert.deepEqual(plain(identity.entries.map(e => e.id.value)), [0, 1, 2]);
  assert.equal(identity.events[0].wallMs, null); assert.equal(identity.events[0].recording, null);
  assert.equal(identity.events[1].wallMs, report.rows[0].before.wallMs);
  assert.equal(identity.events[2].wallMs, report.rows[1].after.wallMs);
  assert.equal(f.renderer.info.programs, programs); assert.equal(programs[0], p0); assert.equal(programs[1], p1);
  assert.equal(f.metrics.gl, 0); f.assertRestored(); assert.equal(f.stop(), null);
});
await check('Same-count replacement and temporary objects are unobserved; decrease then growth rescans without refreshing seen objects', () => {
  const p0 = program(), programs = [p0, program(1)]; const f = fixture(candidate, programs); f.install();
  p0.name = 'changed after first observation'; programs[1] = program(99); f.frame();
  programs.pop(); f.frame(); programs.push(program(2)); f.frame();
  f.setAction(() => { programs.push(program(88)); programs.pop(); }); f.frame();
  const identity = f.stop().programIdentity;
  assert.deepEqual(plain(identity.entries.map(e => e.id.value)), [0, 1, 2]);
  assert.equal(identity.entries[0].name.value, 'name-0'); assert.equal(identity.events.length, 2);
  assert.match(identity.scope, /Same-count replacement/); assert.match(identity.scope, /temporary programs/);
});
await check('Program field and array-index getters are not invoked; inherited values are explicitly missing', () => {
  let getters = 0;
  const accessor = {}; for (const key of ['id', 'name', 'cacheKey']) Object.defineProperty(accessor, key, { get() { getters++; throw new Error('getter'); } });
  const inherited = Object.create(program(7)); const programs = [accessor, inherited];
  Object.defineProperty(programs, '2', { get() { getters++; throw new Error('index getter'); }, configurable: true });
  programs.length = 4; const f = fixture(candidate, programs); f.install(); const identity = f.stop().programIdentity;
  assert.equal(getters, 0); assert.equal(identity.entries.length, 2); assert.equal(identity.skippedEntries, 2);
  for (const key of ['id', 'name', 'cacheKey']) {
    assert.equal(identity.entries[0][key].status, 'accessor-not-read'); assert.equal(identity.entries[1][key].status, 'missing');
  }
  assert.equal(identity.unavailableFields, 6); assert.equal(identity.boundedReadsComplete, false); f.assertRestored();
});
await check('Unsupported field types and throwing descriptors are reported without coercion', () => {
  let coercions = 0; const forbidden = { toString() { coercions++; throw new Error('coercion'); } };
  const bad = program(0, { id: NaN, name: forbidden, cacheKey: 3n });
  const inaccessible = new Proxy(program(1), { getOwnPropertyDescriptor() { throw new Error('unreadable descriptor'); } });
  const f = fixture(candidate, [bad, inaccessible]); f.install(); const identity = f.stop().programIdentity;
  assert.equal(coercions, 0); assert.equal(identity.unavailableFields, 6);
  for (const key of ['id', 'name', 'cacheKey']) {
    assert.equal(identity.entries[0][key].status, 'unsupported-type'); assert.equal(identity.entries[1][key].status, 'descriptor-unreadable');
  }
  assert.equal(identity.boundedReadsComplete, false); f.assertRestored();
});
await check('Absent/non-array/inaccessible inventory stops auxiliary observation while original timing completeness stays independent', () => {
  for (const programs of [null, undefined, { length: 1 }]) {
    const f = fixture(candidate, [], { beforeInstall({ renderer }) { renderer.info.programs = programs; } }); f.install();
    for (let i = 0; i < 6; i++) { if (i % 2 === 0) f.setRecording(); f.frame(); }
    const r = f.stop(); assert.equal(r.programIdentity.unreadableObservations, 1);
    assert.equal(r.programIdentity.entries.length, 0); assert.equal(r.programIdentity.boundedReadsComplete, false);
    assert.equal(r.complete, true); assert.equal(r.detailComplete, true); f.assertRestored();
  }
  const programs = new Proxy([program()], { getOwnPropertyDescriptor() { throw new Error('array descriptor'); } });
  const f = fixture(candidate, programs); f.install(); const r = f.stop();
  assert.equal(r.programIdentity.unreadableObservations, 1); assert.equal(r.programIdentity.boundedReadsComplete, false); f.assertRestored();
});
await check('Long surrogate/control-character strings preserve bounded UTF-16 slices and round-trip JSON', () => {
  const name = 'a'.repeat(47) + '😀' + '\u0000'.repeat(110) + '😀' + 'z'.repeat(47);
  const key = 'b'.repeat(127) + '😀' + '\ud800'.repeat(500) + '😀' + 'y'.repeat(127);
  const f = fixture(candidate, [program(0, { name, cacheKey: key })]); f.install();
  const identity = f.stop().programIdentity, e = identity.entries[0];
  assert.equal(e.name.prefix, name.slice(0, 48)); assert.equal(e.name.suffix, name.slice(-48));
  assert.equal(e.name.chars, name.length); assert.equal(e.cacheKey.prefix, key.slice(0, 128)); assert.equal(e.cacheKey.suffix, key.slice(-128));
  assert.equal(e.cacheKey.chars, key.length); assert.equal(identity.truncatedFields, 2);
  assert.equal(e.name.prefix.length + e.name.suffix.length, 96); assert.equal(e.cacheKey.prefix.length + e.cacheKey.suffix.length, 256);
  assert.deepEqual(plain(plain(identity)), plain(identity)); assert.equal(identity.boundedReadsComplete, false);
});
await check('Entry and scan caps stop boundedly and expose incomplete identity', () => {
  const f = fixture(candidate, Array.from({ length: 65 }, (_, i) => program(i))); f.install();
  const a = f.stop().programIdentity; assert.equal(a.entries.length, 64); assert.equal(a.capacityReached, true); assert.equal(a.boundedReadsComplete, false);
  const p = program(), programs = Array(200).fill(p); const g = fixture(candidate, programs); g.install();
  const b = g.stop().programIdentity; assert.equal(b.events[0].scanned, 128); assert.equal(b.entries.length, 1);
  assert.equal(b.skippedEntries, 72); assert.equal(b.capacityReached, true); assert.equal(b.boundedReadsComplete, false);
});
await check('Event limit and escaping-heavy retained record byte limit cannot expand the fixed payload envelope', () => {
  const programs = []; const f = fixture(candidate, programs); f.install();
  for (let i = 0; i < 20; i++) { programs.push(program(i)); f.frame(); }
  const eventCap = f.stop().programIdentity; assert.equal(eventCap.events.length, 16); assert.equal(eventCap.capacityReached, true);
  const long = '\u0000'.repeat(2000); const escaped = Array.from({ length: 64 }, (_, i) => program(i, { name: long, cacheKey: long }));
  const g = fixture(candidate, escaped); g.install(); const bytesCap = g.stop().programIdentity;
  assert.equal(bytesCap.capacityReached, true); assert(bytesCap.entries.length < 64); assert(bytesCap.retainedRecordBytes <= 60000);
  const bytes = Buffer.byteLength(JSON.stringify(bytesCap)); assert(bytes <= 65536);
  facts.escapingHeavyInventory = { entries: bytesCap.entries.length, retainedRecordBytes: bytesCap.retainedRecordBytes, totalUtf8Bytes: bytes };
});
await check('Steady saved frames cause no further descriptor scans, encodes or GL access', () => {
  const p = program(), programs = [p], observed = new Set([p, programs]);
  const f = fixture(candidate, programs, { descriptorCostObjects: observed }); f.install();
  const before = { ...f.metrics }; for (let i = 0; i < 32; i++) f.frame();
  assert.equal(f.metrics.descriptorReads, before.descriptorReads); assert.equal(f.metrics.encodes, before.encodes); assert.equal(f.metrics.gl, 0);
  const identity = f.stop().programIdentity; assert.equal(identity.events.length, 1); assert.equal(identity.entries.length, 1);
  facts.steadyFrames = { frames: 32, additionalDescriptorReads: 0, additionalEncodes: 0, glAccess: 0 };
});
await check('All original timing rows, lifecycle fields, clock reads and complete/detailComplete match the original VM probe', () => {
  const run = source => {
    const programs = [program()], f = fixture(source, programs); f.install();
    for (let i = 0; i < 6; i++) {
      if (i % 2 === 0) f.setRecording();
      if (i === 1) programs.push(program(1));
      f.frame(); if (i === 2) f.engine.emit('pause');
    }
    const report = plain(f.stop()); delete report.programIdentity; f.assertRestored();
    return { report, nowCalls: f.metrics.nowCalls };
  };
  assert.deepEqual(run(candidate), run(baseline));
});
await check('Synthetic descriptor cost is inside existing observer intervals without extra clock reads or phase normalization', () => {
  const run = cost => {
    const programs = [], p = program(), observed = new Set([p]); const f = fixture(candidate, programs, { descriptorCostObjects: observed, descriptorCost: cost });
    f.install(); programs.push(p); f.frame(); const result = f.stop(); return { row: result.rows[0], nowCalls: f.metrics.nowCalls };
  };
  const zero = run(0), added = run(2);
  assert.equal(added.nowCalls, zero.nowCalls);
  assert(Math.abs((added.row.observerBookkeepingMs - zero.row.observerBookkeepingMs) - 6) < 1e-8);
  assert(Math.abs((added.row.callbackElapsedMs - zero.row.callbackElapsedMs) - 6) < 1e-8);
  assert.deepEqual(plain(added.row.phaseMs), plain(zero.row.phaseMs));
  facts.syntheticObserverCost = { programFields: 3, costPerDescriptorMs: 2, observedAdditionalMs: 6, actualSafariMeasured: false };
});
await check('Source exception propagates by identity and stop restores all own and inherited descriptors', () => {
  const f = fixture(); f.install(); const failure = new Error('source exception');
  f.setAction(() => { throw failure; }); assert.throws(() => f.frame(), error => error === failure);
  const report = f.stop(); assert.equal(report.rows[0].threw, true); f.assertRestored();
  const rollback = fixture(candidate, [program()], { beforeInstall({ game }) { delete game.gas.update; } });
  assert.throws(() => rollback.install(), /missing timing target: update/); rollback.assertRestored();
});
await check('Inactive and post-stop callbacks preserve original return and perform no identity collection', () => {
  const f = fixture(candidate, [program()], { noRecording: true }); f.install();
  const encoded = f.metrics.encodes; assert.equal(f.frame(), f.callbackToken); assert.equal(f.metrics.encodes, encoded);
  const r = f.stop(); assert.equal(r.rows.length, 0); f.assertRestored();
  assert.equal(f.frame(), f.callbackToken); assert.equal(f.metrics.encodes, encoded);
});
await check('4096-row overflow retains original timing failure and explicitly leaves later identities unobserved', () => {
  const programs = [program()], f = fixture(candidate, programs); f.install();
  for (let i = 0; i < 4098; i++) {
    if (i === 1365 || i === 2730) f.setRecording();
    if (i === 4096) programs.push(program(999));
    f.frame();
  }
  const r = f.stop(); assert.equal(r.rows.length, 4096); assert.equal(r.dropped, 2); assert.equal(r.recordingCount, 3);
  assert.equal(r.complete, false); assert.equal(r.detailComplete, false); assert.equal(r.programIdentity.entries.length, 1);
  assert.match(r.programIdentity.scope, /callbacks after the row cap are unobserved/); assert.equal(f.metrics.callbacks, 4098); f.assertRestored();
});

await writeFile(new URL('independent-controls.json', here), JSON.stringify({
  scope: 'Independent bounded VM/source review; synthetic renderer/program objects and clocks',
  nodeVersion: process.version, passed: results.length, controls: results, facts, blocking: 0,
  producerAssertionsCountedAsIndependent: 0, actualSafari: false, actualEngineExecutionByIndependentReviewer: false,
  actualProgramInventory: false, actualCPUorGPUCauseMeasured: false, actualObserverOverheadMeasured: false,
  actualBuild: false, actualBrowser: false, generatedRoot: null, newCI: 0, remoteWrites: 0, localGitCalls: 0,
  newSpawn: 0, libraryAccess: 0, automationChanges: 0,
}, null, 2) + '\n');
console.log(JSON.stringify({ passed: results.length, blocking: 0, facts }));
