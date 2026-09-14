import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as Current from './fixture/src/game/state.js';
import * as Before from './fixture/src/game/state-before.js';
import { CONVERSATIONS as originalStory } from './fixture/src/content/story-before.js';
import { CONVERSATIONS as correctedStory } from './fixture/src/content/story.js';
import { DialogueRunner } from './fixture/src/game/narrative.js';
import { setLocale, t } from './fixture/src/content/i18n.js';

const here = new URL('./', import.meta.url);
const sha = b => createHash('sha256').update(b).digest('hex');
const clone = x => JSON.parse(JSON.stringify(x));
const freeze = x => {
  if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); }
  return x;
};
const checks = [];
async function check(name, body) {
  await body(); checks.push({ name, passed: true });
}
const original = originalStory.iris_first.nodes.i_gives.effects.find(e => e.journal).journal;
const corrected = correctedStory.iris_first.nodes.i_gives.effects.find(e => e.journal).journal;
const entry = (overrides = {}) => ({ id: original[0], title: original[1], text: original[2], t: 418.75,
  extra: { retained: ['additional', 17, null] }, ...overrides });
const expected = e => ({ ...e, text: corrected[2] });
function populated(journal = [entry()]) {
  const s = new Before.GameState();
  s.flags = new Set(['arrived', 'choice:sample:retained']);
  s.counters = new Map([['a', 5]]); s.inventory = new Map([['salvage', 13]]);
  s.capabilities = new Set(['readAir']); s.trust = new Map([['iris', 41], ['sol', -9]]);
  s.quests = new Map([['sample', { state: 'active', step: 3, data: { retained: 7 } }]]);
  s.choices = new Map([['sample', 'retained']]); s.discovered = new Set(['sample-place']);
  s.chapter = 4; s.playTime = 4567.25; s.deaths = 2; s.kills = 3;
  s.filtersUsed = 4; s.metersRead = 5; s.parries = 6; s.lastSpawn = 'sample-spawn';
  s.ending = 'sample-ending'; s.journal = journal;
  return s.serialise();
}
function restore(Module, payload) {
  const s = new Module.GameState(); assert.equal(s.deserialise(payload), true); return s;
}
const storageData = new Map(); let storageWrites = [];
globalThis.localStorage = {
  getItem: key => storageData.has(key) ? storageData.get(key) : null,
  setItem: (key, value) => { storageWrites.push(['set', key]); storageData.set(key, String(value)); },
  removeItem: key => { storageWrites.push(['remove', key]); storageData.delete(key); },
};
function freshStorage(raw) {
  storageData.clear(); storageWrites = [];
  Current.Storage._preUpgrade = null; Before.Storage._preUpgrade = null;
  if (raw !== undefined) storageData.set(Current.SAVE_KEY, raw);
}
const player = { pos: { x: 3, y: 2, z: -5 }, yaw: 0.7, hp: 81, stamina: 62,
  lungs: { sat: 7, filter: 0.6, masked: true }, lampOn: true, lampBattery: 0.8 };
const world = { takenIds: ['sample-taken'], disabledIds: ['sample-disabled'], npcState: ['sample-npc'],
  npcPos: [['sample-npc', 2, 3, 4, 0.6, false, true]], gasSources: [['sample-gas', true]],
  interior: 'sample-interior', interiorPpm: 11, gasIntensity: 0.6,
  crisis: { site: 'sample-site', rescued: 2, lost: 1, timeLeft: 41, done: [true, false] },
  additionalEnvelope: { retained: ['a', 9] } };
const actualNow = Date.now;
// Only fixture wall time is fixed, so ordinary serialization timestamps can be
// compared exactly. This is not a browser or elapsed-time measurement.
Date.now = () => 1720000000123;
try {
  const beforeBytes = await readFile(new URL('fixture/src/game/state-before.js', here));
  const afterBytes = await readFile(new URL('fixture/src/game/state.js', here));
  const before = beforeBytes.toString(), after = afterBytes.toString();
  await check('Exact source pins and inverse of the two hunks preserve every other byte', () => {
    assert.equal(sha(beforeBytes), 'ad1cd826a7d55a329e74e6a988c1441d4852675b2abc8e0e07df672af42dd7cc');
    assert.equal(sha(afterBytes), '356d2bb3d3ae1b019e38bd73c05778ff67b048cffa9775d5bad052fc9d118530');
    const definition = after.slice(after.indexOf('// Saves retain the authored English'), after.indexOf('export class GameState'));
    assert.match(definition, /const LEGACY_IRIS_JOURNAL_TEXT = `/);
    const assignment = after.slice(after.indexOf('    this.journal = (d.journal'), after.indexOf('    this.discovered = new Set(d.discovered'));
    const restored = after.replace(definition, '').replace(assignment, '    this.journal = d.journal || [];\n');
    assert.equal(restored, before);
  });
  await check('Storage, validation, save version and migration bytes remain identical', () => {
    assert.equal(after.slice(0, after.indexOf('/** People whose opinion')), before.slice(0, before.indexOf('/** People whose opinion')));
    assert.equal(after.slice(after.indexOf('// --------------------------------------------------------------- persistence')),
      before.slice(before.indexOf('// --------------------------------------------------------------- persistence')));
    assert.equal(Current.SAVE_VERSION, 2); assert.equal(Current.SAVE_KEY, Before.SAVE_KEY);
    assert.equal(Current.SAVE_MIGRATIONS[1].toString(), Before.SAVE_MIGRATIONS[1].toString());
  });
  await check('Legacy match comes from the canonical effect and repaired text equals frozen C40 content', async () => {
    assert.deepEqual(original.slice(0, 2), corrected.slice(0, 2));
    assert.equal(original[2].replace('one month.', 'ten months.'), corrected[2]);
    const literal = after.match(/const LEGACY_IRIS_JOURNAL_TEXT = `([^`]+)`;/)[1];
    assert.equal(literal, original[2]);
    assert.equal(sha(await readFile(new URL('fixture/src/content/story.js', here))), '7cd770bfcb91f959a9b4e60088d41fc9b3eac363faa724138d89d668e07a9d41');
    assert.equal(sha(await readFile(new URL('fixture/src/content/locale/ja/content.js', here))), '480e736a0e37eb482daedf7a81deee179c2613f175a987498507e35d514416a1');
  });
  await check('Frozen input is untouched; only matching entries are copied with timestamps and extra fields', () => {
    const d = freeze(populated([entry({ id: 'unrelated' }), entry()])); const snap = JSON.stringify(d);
    const s = restore(Current, d);
    assert.equal(JSON.stringify(d), snap); assert.notEqual(s.journal, d.journal);
    assert.equal(s.journal[0], d.journal[0]); assert.notEqual(s.journal[1], d.journal[1]);
    assert.deepEqual(s.journal[1], expected(d.journal[1]));
  });
  await check('Nine close but nonmatching entries are retained without editing or replacement', () => {
    const cases = [entry({ id: 'IRIS' }), entry({ title: original[1] + ' ' }),
      entry({ text: original[2] + ' ' }), entry({ text: original[2].replaceAll('\n', '\r\n') }),
      entry({ text: original[2].replaceAll('\n', ' ') }), entry({ text: original[2].replace('She', 'she') }),
      entry({ text: '利用者の本文' }), entry({ text: corrected[2] }), entry({ text: '' })];
    const d = freeze(populated(cases)); const s = restore(Current, d);
    assert.deepEqual(s.journal, cases); cases.forEach((e, i) => assert.equal(s.journal[i], e));
  });
  await check('Duplicate exact entries retain ordering, count, timestamps and their different extra fields', () => {
    const d = freeze(populated([entry({ t: 0 }), entry({ id: 'other' }), entry({ t: 99, extra: { second: true } })]));
    const s = restore(Current, d);
    assert.deepEqual(s.journal, [expected(d.journal[0]), d.journal[1], expected(d.journal[2])]);
  });
  await check('Every serialized progress field differs from the old reader only at the permitted text', () => {
    const d = freeze(populated()); const old = restore(Before, d).serialise(); const next = restore(Current, d).serialise();
    old.journal = [expected(old.journal[0])]; assert.deepEqual(next, old);
  });
  await check('Deserialization emits no journal, choice, trust or other effect event', () => {
    const s = new Current.GameState(); const events = []; s.emit = (...args) => events.push(args);
    assert.equal(s.deserialise(freeze(populated())), true); assert.deepEqual(events, []);
    assert.equal(s.addJournal(...corrected), false); assert.deepEqual(events, []);
  });
  await check('Invalid inputs reject before state mutation and optional journal defaults are unchanged', () => {
    const invalid = [null, { ...populated(), v: 1 }, { ...populated(), journal: [null] },
      { ...populated(), journal: [entry({ text: 3 })] }, { ...populated(), journal: {} }];
    for (const d of invalid) {
      const s = new Current.GameState(); const snapshot = s.serialise();
      assert.equal(s.deserialise(d), false); assert.deepEqual(s.serialise(), snapshot);
    }
    for (const value of [undefined, null, []]) {
      const d = populated(); d.journal = value;
      assert.deepEqual(restore(Current, d).serialise(), restore(Before, d).serialise());
    }
  });
  await check('Real v2 save/load/deserialise/save preserves player, world, envelope and all progress', () => {
    freshStorage(); const s = restore(Before, populated());
    assert.equal(Before.Storage.save(s, player, world), true);
    const raw = localStorage.getItem(Current.SAVE_KEY); const originalPayload = JSON.parse(raw);
    const loaded = Current.Storage.load(); const frozen = freeze(loaded); const snapshot = JSON.stringify(frozen);
    const repaired = restore(Current, frozen.state); assert.equal(JSON.stringify(frozen), snapshot);
    assert.equal(localStorage.getItem(Current.SAVE_KEY), raw);
    assert.equal(Current.Storage.save(repaired, player, world), true);
    const expectedPayload = clone(originalPayload); expectedPayload.state.journal[0].text = corrected[2];
    assert.deepEqual(JSON.parse(localStorage.getItem(Current.SAVE_KEY)), expectedPayload);
  });
  await check('Inspect/load/hasSave repair no storage slot and leave loaded payload text unchanged', () => {
    const payload = { ...world, v: 2, state: populated(), player: null, savedAt: Date.now() };
    const raw = JSON.stringify(payload); freshStorage(raw);
    assert.equal(Current.Storage.inspect().status, 'ok');
    assert.equal(Current.Storage.hasSave(), true);
    assert.equal(Current.Storage.load().state.journal[0].text, original[2]);
    assert.equal(localStorage.getItem(Current.SAVE_KEY), raw); assert.deepEqual(storageWrites, []);
  });
  await check('Existing v1 to v2 migration retains input and rescues original bytes at the next real save', () => {
    const v1 = { ...world, state: { ...populated(), v: 1 }, player: null, savedAt: Date.now() - 1 };
    const raw = JSON.stringify(v1); freshStorage(raw);
    const migration = Current.migrateSave(freeze(v1));
    assert.equal(migration.status, 'migrated'); assert.deepEqual(migration.steps, ['1->2']);
    const copy = clone(v1); copy.v = 2; copy.state.v = 2; assert.deepEqual(migration.payload, copy);
    const loaded = Current.Storage.load(); assert.deepEqual(storageWrites, []);
    const s = restore(Current, loaded.state); assert.equal(s.journal[0].text, corrected[2]);
    assert.equal(Current.Storage.save(s, player, world), true);
    assert(Current.Storage.rescuedSaves().some(e => e.raw === raw)); assert.equal(JSON.stringify(v1), raw);
  });
  await check('Repeated repair is idempotent and the original v2 reader accepts the corrected save', () => {
    const first = restore(Current, populated()).serialise(); const frozen = freeze(first);
    const next = restore(Current, frozen); assert.equal(next.journal[0], frozen.journal[0]);
    assert.deepEqual(next.serialise(), first);
    assert.deepEqual(restore(Before, next.serialise()).serialise(), first);
    freshStorage(); assert.equal(Current.Storage.save(next, player, world), true);
    const loadedByOld = Before.Storage.load(); assert.equal(loadedByOld.v, 2);
    assert.deepEqual(restore(Before, loadedByOld.state).serialise(), first);
  });
  await check('Real C40 DialogueRunner effects and full resulting progress match with both state readers in EN and JA', () => {
    for (const language of ['en', 'ja']) {
      setLocale(language);
      const run = Module => {
        const s = new Module.GameState(); s.playTime = 91.125;
        const runner = new DialogueRunner(s, {}); runner.convo = correctedStory.iris_first; runner.active = true;
        runner.goto('i_gives'); return s.serialise();
      };
      const beforeState = run(Before); const candidateState = run(Current);
      assert.deepEqual(candidateState, beforeState);
      assert.equal(candidateState.journal.filter(j => j.id === original[0]).length, 1);
      assert.equal(candidateState.journal.find(j => j.id === original[0]).text, corrected[2]);
      assert.deepEqual(restore(Current, freeze(candidateState)).serialise(), candidateState);
    }
  });
  await check('Loaded legacy entry resolves to exact corrected EN fallback and frozen JA localization', () => {
    const s = restore(Current, freeze(populated())); const body = s.journal[0].text;
    setLocale('en'); assert.equal(t('journal.iris.text', body), corrected[2]);
    setLocale('ja'); assert.equal(sha(t('journal.iris.text', body)), '0156cf93d0d49491939147b13457337ebbf26d1cf21f6f401525477356cf7a42');
  });
  await writeFile(new URL('independent-controls.json', here), JSON.stringify({
    scope: 'Independent bounded source and CPU save compatibility review', nodeVersion: process.version,
    passed: checks.length, controls: checks, blocking: 0, producerControlsCountedAsIndependent: 0,
    storageFixture: 'In-memory Web Storage API with synthetic saves; no user save read',
    fixtureClock: 'Fixed Date.now only for exact serialization comparisons; no elapsed-time claims',
    actualBuild: false, actualBrowser: false, screens: 0, newBundleSha256: null,
    localGitCalls: 0, remoteWrites: 0, ciStarts: 0, newSpawn: 0, libraryAccess: 0,
  }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: checks.length, blocking: 0, actualBuild: false, actualBrowser: false }));
} finally { Date.now = actualNow; }
