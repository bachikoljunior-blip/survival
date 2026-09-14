import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { installFrameWorkProbe, stopFrameWorkProbe } from '../candidate/tools/frame_work_probe.mjs';
import { installFrameWorkProbe as installBase } from '../source/tools/frame_work_probe.mjs';
import vm from 'node:vm';

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
const program = id => ({ id, name: `material-${id}`, cacheKey: `variant-${id}` });
const setup = (programs = [program(1)]) => {
  const s = scene(); s.engine.renderer.info.programs = programs;
  s.C.__audioRecording = {};
  return s;
};
const first = s => { s.tick(1020); s.tick(1040); };
const inventory = () => stopFrameWorkProbe().programIdentity;
const sizes = [];

const initial = setup(); installFrameWorkProbe(); first(initial);
for (let i = 0; i < 5; i++) initial.tick(1060 + i * 20);
const init = inventory();
eq(init.events.length, 1, 'steady count never rescans program properties');
eq(init.entries[0], { observedAt: 0, arrayIndex: 0, id: { value: 1 },
  name: { value: 'material-1', chars: 10, truncated: false },
  cacheKey: { value: 'variant-1', chars: 9, truncated: false } }, 'initial own scalar identity preserved exactly');
ok(init.boundedReadsComplete && init.events[0].wallMs === null, 'initial inventory not presented as timed recording observation');

const growth = setup(); installFrameWorkProbe(); growth.tick(1020);
growth.engine.renderer.info.programs.push(program(2));
const originalRender = growth.engine.renderer.render;
growth.engine.renderer.render = function (arg) {
  if (arg === growth.game.scene) this.info.programs.push(program(3));
  return originalRender.call(this, arg);
};
growth.tick(1040);
// Restore the externally installed test wrapper before stop, preserving the original probe wrapper.
growth.engine.renderer.render = originalRender;
const gd = stopFrameWorkProbe(), gi = gd.programIdentity;
eq(gi.events.map(e => e.boundary), ['installation', 'callback-entry', 'callback-exit'], 'outside-callback and in-callback growth distinguished');
eq(gi.entries.map(e => [e.id.value, e.observedAt]), [[1, 0], [2, 1], [3, 2]], 'new object identities linked to bounded event without phase/compile attribution');
eq(gi.events[1].wallMs, gd.rows[0].before.wallMs, 'entry reuses existing row clock');
eq(gi.events[2].wallMs, gd.rows[0].after.wallMs, 'exit reuses existing row clock');

const replacement = setup(); installFrameWorkProbe(); first(replacement);
replacement.engine.renderer.info.programs[0] = program(9); replacement.tick(1060);
const ri = inventory();
eq(ri.entries.map(e => e.id.value), [1], 'same-count replacement is deliberately unobserved');
ok(ri.scope.includes('Same-count replacement') && ri.scope.includes('never a complete program history'), 'limited observation never claims full program history');

const shrinking = setup([program(1), program(2)]); installFrameWorkProbe(); first(shrinking);
shrinking.engine.renderer.info.programs.pop(); shrinking.tick(1060);
shrinking.engine.renderer.info.programs.push(program(3)); shrinking.tick(1080);
eq(inventory().entries.map(e => e.id.value), [1, 2, 3], 'increase after observed decrease scans again and keeps first-observed identity');

let getterCalls = 0, forbiddenCalls = 0;
const accessor = {};
for (const key of ['id', 'name', 'cacheKey']) Object.defineProperty(accessor, key, { configurable: true,
  get() { getterCalls++; throw new Error('program getter must not run'); } });
const noGL = setup([accessor]);
for (const key of ['compile', 'compileAsync', 'getContext']) noGL.engine.renderer[key] = () => { forbiddenCalls++; throw new Error('GL/compile forbidden'); };
installFrameWorkProbe(); first(noGL); const ai = inventory();
eq(getterCalls, 0, 'program accessors never invoked'); eq(forbiddenCalls, 0, 'GL/context/compile APIs not called');
ok(ai.unavailableFields === 3 && !ai.boundedReadsComplete && ai.entries[0].cacheKey.status === 'accessor-not-read', 'accessor identity explicitly unavailable');

const longName = 'N'.repeat(10000), longKey = 'P'.repeat(199872) + 'TAIL'.repeat(32);
const long = setup([{ id: 44, name: longName, cacheKey: longKey }]);
const descriptors = Object.getOwnPropertyDescriptors(long.engine.renderer.info.programs[0]);
Object.freeze(long.engine.renderer.info.programs[0]);
installFrameWorkProbe(); first(long); const li = inventory(), le = li.entries[0];
eq([le.name.prefix.length + le.name.suffix.length, le.cacheKey.prefix.length + le.cacheKey.suffix.length], [96, 256], 'long fields retain only bounded prefix and suffix');
eq([le.name.chars, le.cacheKey.chars], [longName.length, longKey.length], 'original code-unit lengths retained without full key hashing');
ok(li.truncatedFields === 2 && !li.boundedReadsComplete && !JSON.stringify(li).includes('P'.repeat(257)), 'truncation explicitly incomplete and no full long key serialization');
eq(long.engine.renderer.info.programs[0].cacheKey, descriptors.cacheKey.value, 'original frozen program/resource unchanged');

const unusual = setup([{ id: NaN, name: {}, cacheKey: undefined }, {}]);
installFrameWorkProbe(); first(unusual); const ui = inventory();
eq(ui.unavailableFields, 6, 'missing and unsupported properties are explicit unavailable values');
eq(ui.entries[0].name.status, 'unsupported-type', 'unsupported values not coerced or serialized');
eq(ui.entries[1].name.status, 'missing', 'absent properties distinguished from inaccessible descriptors');
const inaccessibleField = setup([new Proxy(program(1), { getOwnPropertyDescriptor() { throw new Error('unreadable field'); } })]);
installFrameWorkProbe(); first(inaccessibleField); const ifi = inventory();
ok(ifi.unavailableFields === 3 && ifi.entries[0].name.status === 'descriptor-unreadable', 'descriptor read failure explicitly distinguished from absent property');

const many = setup(Array.from({ length: 65 }, (_, i) => program(i))); installFrameWorkProbe(); first(many);
const mi = inventory();
ok(mi.entries.length === 64 && mi.capacityReached && !mi.boundedReadsComplete, 'unique-entry cap fails auxiliary coverage without expanding bounds');
sizes.push({ case: 'entry cap', bytes: Buffer.byteLength(JSON.stringify(mi)) });

const wide = setup(Array(130).fill(null)); installFrameWorkProbe(); first(wide); const wi = inventory();
eq(wi.events[0].scanned, 128, 'single array scan has finite 128-entry bound');
ok(wi.capacityReached && wi.skippedEntries === 130, 'oversized/sparse array omission explicit');

const events = setup(); installFrameWorkProbe(); first(events);
for (let i = 0; i < 18; i++) {
  events.engine.renderer.info.programs.push(program(i + 2)); events.tick(1060 + i * 40);
  events.engine.renderer.info.programs.pop(); events.tick(1080 + i * 40);
}
const ei = inventory();
ok(ei.events.length === 16 && ei.capacityReached && !ei.boundedReadsComplete, 'sixteenth event is retained and further scans stop at event cap');

const escaped = setup(Array.from({ length: 64 }, (_, i) => ({ id: i,
  name: '\u0000'.repeat(96), cacheKey: '\u0000'.repeat(256) })));
installFrameWorkProbe(); first(escaped); const bi = inventory();
ok(bi.capacityReached && bi.retainedRecordBytes <= 60000, 'escaped payload reaches independent byte budget');
ok(Buffer.byteLength(JSON.stringify(bi)) <= 65536 && bi.entries.length < 64, 'entire UTF8 JSON inventory stays below 64KiB, not merely raw string lengths');
sizes.push({ case: 'max escaping byte cap', bytes: Buffer.byteLength(JSON.stringify(bi)), entries: bi.entries.length });

const utf = setup([{ id: 1, name: '街'.repeat(96), cacheKey: '😀'.repeat(128) },
  { id: 2, name: '\ud800'.repeat(96), cacheKey: '\ud800'.repeat(256) }]);
installFrameWorkProbe(); first(utf); const utfI = inventory();
eq(JSON.parse(JSON.stringify(utfI)).entries[1].cacheKey.value, '\ud800'.repeat(256), 'lone surrogate identity round trip without encoding failure');
ok(Buffer.byteLength(JSON.stringify(utfI)) <= 65536, 'CJK/astral/escaped surrogate wire bytes bounded');
sizes.push({ case: 'Unicode', bytes: Buffer.byteLength(JSON.stringify(utfI)) });

const absent = setup(); delete absent.engine.renderer.info.programs;
installFrameWorkProbe(); first(absent); const ab = inventory();
ok(ab.unreadableObservations === 1 && !ab.boundedReadsComplete && ab.entries.length === 0, 'missing program inventory ends auxiliary observation explicitly');

const inaccessibleAtInstall = setup();
Object.defineProperty(inaccessibleAtInstall.engine.renderer.info, 'programs', { configurable: true,
  get() { throw new Error('initial count unavailable'); } });
installFrameWorkProbe();
const ia = inventory();
ok(ia.unreadableObservations === 1 && !ia.boundedReadsComplete, 'auxiliary installation count failure cannot replace successful wrapper installation');

let indexGetterCalls = 0;
const indexArray = []; Object.defineProperty(indexArray, '0', { get() { indexGetterCalls++; throw new Error('no index getter'); } });
const index = setup(indexArray); installFrameWorkProbe(); first(index); const ix = inventory();
eq(indexGetterCalls, 0, 'array element accessor not invoked');
ok(ix.skippedEntries === 1 && !ix.boundedReadsComplete, 'array accessor omission explicit');

const unreadable = setup(new Proxy([program(1)], { getOwnPropertyDescriptor() { throw new Error('descriptor inaccessible'); } }));
installFrameWorkProbe(); first(unreadable); const pi = inventory();
ok(pi.unreadableObservations === 1 && !pi.boundedReadsComplete, 'descriptor exception does not replace original frame behavior');

let descriptorReads = 0;
const trackedProgram = new Proxy(program(1), { getOwnPropertyDescriptor(target, key) {
  descriptorReads++; return Object.getOwnPropertyDescriptor(target, key);
} });
const tracked = setup([trackedProgram]); installFrameWorkProbe(); first(tracked);
for (let i = 0; i < 8; i++) tracked.tick(1060 + i * 20);
tracked.engine.renderer.info.programs.push(program(2)); tracked.tick(1240); inventory();
eq(descriptorReads, 3, 'known-object fields read once, including across later array rescans');

let rollbackReads = 0;
const partial = setup([new Proxy(program(1), { getOwnPropertyDescriptor(target, key) { rollbackReads++; return Object.getOwnPropertyDescriptor(target, key); } })]);
delete partial.game.hud.updatePerf;
assert.throws(installFrameWorkProbe, /missing timing target/); assertions++;
eq(rollbackReads, 0, 'initial inventory only runs after successful wrapper installation');
ok(partial.engine._boundFrame === partial.original.bound && !partial.C.__iosFrameWorkProbe, 'partial installation rollback and ownership unchanged');

const thrown = setup();
thrown.engine.addUpdater(() => { throw new Error('original sentinel'); }, 1);
installFrameWorkProbe();
assert.throws(() => thrown.tick(1020), /original sentinel/); assertions++;
assert.throws(() => thrown.tick(1040), /original sentinel/); assertions++;
const td = stopFrameWorkProbe();
ok(td.rows[0].threw && td.restored && thrown.engine._boundFrame === thrown.original.bound, 'original exception and restoration survive auxiliary identity observation');

const cap = setup(); installFrameWorkProbe();
for (let i = 1; i <= 4100; i++) {
  if (i === 1400 || i === 2800) cap.C.__audioRecording = {};
  if (i === 4099) cap.engine.renderer.info.programs.push(program(999));
  cap.tick(1000 + i * 20);
}
const cd = stopFrameWorkProbe();
ok(cd.rows.length === 4096 && cd.dropped === 3 && cd.recordingCount === 3 && !cd.complete, 'natural three-recording cap still fails with dropped rows');
eq(cd.programIdentity.entries.map(e => e.id.value), [1], 'post-cap program growth stays unobserved');

function timing(install) {
  const s = setup(); install(); s.tick(1020); clockCost = 0.25; s.tick(1040); clockCost = 0;
  const d = stopFrameWorkProbe(); return d.rows;
}
eq(timing(installFrameWorkProbe), timing(installBase), 'identical timing row/clock-read output with same fake clock proves no extra performance.now instrumentation');

const overhead = setup(); installFrameWorkProbe(); overhead.tick(1020);
overhead.engine.renderer.info.programs.push(new Proxy(program(2), { getOwnPropertyDescriptor(target, key) {
  cost(2); return Object.getOwnPropertyDescriptor(target, key);
} }));
overhead.tick(1040); const oh = stopFrameWorkProbe().rows[0];
ok(oh.observerBookkeepingMs >= 6 && oh.engineWallMs === 20 && oh.acceptedDtSeconds === 0.02,
  'synthetic identity-read overhead is retained in observer intervals, never subtracted from engine clock');

const serialized = setup();
vm.runInNewContext(`(${installFrameWorkProbe.toString()})()`, { window: { CINDERLINE: serialized.C }, performance, TextEncoder });
first(serialized);
const sd = vm.runInNewContext(`(${stopFrameWorkProbe.toString()})()`, { window: { CINDERLINE: serialized.C } });
ok(sd.programIdentity.entries[0].id.value === 1 && sd.restored, 'actual exported function remains self-contained when serialized into page context');

const shape = setup();
const targets = [[shape.engine, '_boundFrame'], [shape.engine, 'emit'], [shape.engine.renderer, 'render'],
  [shape.game, 'render'], [shape.game.hud, 'updatePerf'], [shape.game.gas, 'update'], [shape.engine._updaters[0], 'fn']];
const oldDescriptors = targets.map(([target, key]) => Object.getOwnPropertyDescriptor(target, key));
const oldProgramDescriptors = Object.getOwnPropertyDescriptors(shape.engine.renderer.info.programs[0]);
const oldPrograms = shape.engine.renderer.info.programs;
installFrameWorkProbe(); first(shape); const sh = stopFrameWorkProbe();
eq(targets.map(([target, key]) => Object.getOwnPropertyDescriptor(target, key)), oldDescriptors, 'own/inherited function descriptors exactly restored');
eq(Object.getOwnPropertyDescriptors(oldPrograms[0]), oldProgramDescriptors, 'all original program descriptors unchanged');
ok(shape.engine.renderer.info.programs === oldPrograms && !shape.C.__iosFrameWorkProbe && sh.restored && stopFrameWorkProbe() === null,
  'program array/resource identity and idempotent probe ownership cleanup preserved');

const maximalEnvelope = { ...bi, entries: [], events: [], retainedRecordBytes: 60000,
  capacityReached: false, boundedReadsComplete: false,
  skippedEntries: Number.MAX_SAFE_INTEGER, unavailableFields: Number.MAX_SAFE_INTEGER,
  truncatedFields: Number.MAX_SAFE_INTEGER, unreadableObservations: Number.MAX_SAFE_INTEGER };
const envelopeBytes = Buffer.byteLength(JSON.stringify(maximalEnvelope));
const conservativeInventoryBound = 60000 + envelopeBytes + 16 * 4;
ok(conservativeInventoryBound < 65536, 'fixed-envelope and worst bounded event-counter growth fit reserved allowance');

const result = { status: 'passed', assertions, sizes, envelopeBytes, conservativeInventoryBound,
  scope: 'Limited CPU/VM fixtures with actual canonical Engine._frame and synthetic renderer programs. No actual Safari/program inventory/compile/GPU performance or real observer-cost measurement. Existing timing62 fixture is separately retained.' };
writeFileSync(new URL('program-identity-result.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
