#!/usr/bin/env node
/**
 * Save migration and save-loss regression suite (audit H1).
 *
 * The defect this exists for: the loader returned null for any save whose
 * version it did not recognise, the title screen then hid CONTINUE, and the
 * next autosave wrote over the only copy of the playthrough. No warning, no
 * choice, no way back. So the checks here are not "does migrate() run" — they
 * are "is a real published-build save still playable", and "does a save this
 * build genuinely cannot read survive the ninety seconds after it is opened".
 *
 * Everything runs against `src/game/state.js` itself, over an in-memory
 * localStorage. The old-version input is a real v1 blob written by the
 * published v1 build (tools/fixtures/save-v1.json — see
 * tools/make_save_v1_fixture.mjs), not a shape invented here.
 *
 * The suite also sabotages the production code in ways that reintroduce the
 * defect, and fails if the checks still pass — a suite that cannot fail proves
 * nothing.
 *
 *   node tools/save_migration.mjs            positives, fault injection, negatives
 *   node tools/save_migration.mjs --verbose  print every check
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const EVIDENCE_DIR = join(ROOT, 'AI_DEVELOPMENT', 'EVIDENCE');
const VERBOSE = process.argv.includes('--verbose');

// --- localStorage ----------------------------------------------------------
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const {
  GameState, Storage, migrateSave,
  SAVE_KEY, LEGACY_SAVE_KEYS, SAVE_RESCUE_KEY, SAVE_VERSION, SAVE_MIGRATIONS,
} = await import('../src/game/state.js');

const FIXTURE_V1 = readFileSync(join(ROOT, 'tools', 'fixtures', 'save-v1.json'), 'utf8');

// --- check harness ---------------------------------------------------------
let checks = [];
const ok = (name) => { checks.push({ name, pass: true }); if (VERBOSE) console.log(`  ok   ${name}`); };
const bad = (name, detail) => {
  checks.push({ name, pass: false, detail });
  if (VERBOSE) console.log(`  FAIL ${name} — ${detail}`);
};
const expect = (cond, name, detail = '') => (cond ? ok(name) : bad(name, detail || 'expected true'));
const same = (a, b, name) => {
  const x = JSON.stringify(a); const y = JSON.stringify(b);
  return x === y ? ok(name) : bad(name, `${x} !== ${y}`);
};

const reset = () => { store.clear(); Storage.lastLoad = { status: 'none' }; };

/** Everything the save is made of, in a comparable shape. */
const snap = (S) => ({
  flags: [...S.flags].sort(),
  counters: [...S.counters.entries()].sort(),
  inventory: [...S.inventory.entries()].sort(),
  capabilities: [...S.capabilities].sort(),
  trust: [...S.trust.entries()].sort(),
  quests: [...S.quests.entries()].map(([k, q]) => [k, q.state, q.step, q.data]).sort(),
  choices: [...S.choices.entries()].sort(),
  journal: S.journal.map((j) => j.id).sort(),
  discovered: [...S.discovered].sort(),
  chapter: S.chapter, playTime: S.playTime, deaths: S.deaths, kills: S.kills,
  filtersUsed: S.filtersUsed, metersRead: S.metersRead, parries: S.parries,
  lastSpawn: S.lastSpawn, ending: S.ending,
});

/** A state with something in it, built through the real mutators. */
const playedState = () => {
  const S = new GameState();
  S.set('metRen');
  S.bump('metersRead', 3);
  S.give('filter', 2);
  S.unlock('readAir');
  S.record('cellarRow.door', 'forced');
  S.addJournal('badair', 'What the meter says', 'Ninety at the step.');
  S.adjustTrust('teo', 2, 'kept her word');
  S.discover('stacks_roofline');
  S.chapter = 2;
  S.playTime = 613.5;
  S.lastSpawn = 'stacks_yard';
  return S;
};

const PLAYER = {
  pos: { x: 1.5, y: 2.5, z: 3.5 }, yaw: 0.75, hp: 80, stamina: 90,
  lungs: { sat: 0.1, filter: 'filter', masked: true }, lampOn: false, lampBattery: 0.9,
};

// ---------------------------------------------------------------------------
// 1. Current-version saves still round-trip. A migration layer that breaks the
//    ordinary case has traded one silent data loss for another.
// ---------------------------------------------------------------------------
function currentVersionRegression() {
  reset();
  const S = playedState();
  const before = snap(S);
  expect(Storage.save(S, PLAYER, { interior: 'marrow_in', takenIds: ['crate_a'] }),
    'current: save writes');

  const loaded = Storage.load();
  expect(!!loaded, 'current: load returns a payload');
  expect(Storage.lastLoad.status === 'ok' && Storage.lastLoad.migrated === false,
    'current: reported as an unmigrated load', JSON.stringify(Storage.lastLoad));
  expect(loaded && loaded.state.v === SAVE_VERSION, 'current: payload is at the current version');

  const R = new GameState();
  expect(R.deserialise(loaded.state), 'current: deserialise accepts it');
  same(snap(R), before, 'current: state survives the round trip');
  expect(loaded.player && loaded.player.hp === 80 && loaded.interior === 'marrow_in',
    'current: envelope survives the round trip');
  expect(store.has(SAVE_KEY), 'current: stored at the versionless key');
}

// ---------------------------------------------------------------------------
// 2. A real save from the published v1 build.
// ---------------------------------------------------------------------------
function migratesPublishedV1() {
  reset();
  const legacyKey = LEGACY_SAVE_KEYS[0];
  store.set(legacyKey, FIXTURE_V1);
  const original = JSON.parse(FIXTURE_V1);

  const loaded = Storage.load();
  expect(!!loaded, 'v1: a published v1 save is loadable at all (it was silently discarded before)');
  if (!loaded) return;

  expect(loaded.state.v === SAVE_VERSION, 'v1: carried to the current version', String(loaded.state.v));
  same(Storage.lastLoad, { status: 'ok', migrated: true, from: 1, steps: [1] },
    'v1: reported as a migration, with the steps it took');

  const R = new GameState();
  expect(R.deserialise(loaded.state), 'v1: the migrated state deserialises');
  // Nothing the player earned may be dropped on the way across.
  same([...R.flags].sort(), [...original.state.flags].sort(), 'v1: flags intact');
  same([...R.inventory.entries()].sort(), original.state.inventory.sort(), 'v1: inventory intact');
  same([...R.capabilities].sort(), original.state.capabilities.sort(), 'v1: capabilities intact');
  same([...R.quests.entries()].map(([k, q]) => [k, q.state, q.step, q.data]).sort(),
    original.state.quests.map(([k, q]) => [k, q.state, q.step, q.data]).sort(),
    'v1: quests intact, step and data included');
  same(R.journal.map((j) => j.id), original.state.journal.map((j) => j.id), 'v1: journal intact');
  expect(R.chapter === original.state.chapter && R.playTime === original.state.playTime &&
    R.lastSpawn === original.state.lastSpawn, 'v1: chapter, play time and spawn intact');

  // The envelope is what puts her back where she was standing.
  same(loaded.player, original.player, 'v1: player envelope untouched by the migration');
  same(loaded.npcPos, original.npcPos, 'v1: cast positions untouched');
  same(loaded.takenIds, original.takenIds, 'v1: world pickups untouched');

  // ...and it has actually moved to the current address, so the next boot is
  // not a migration again.
  expect(store.has(SAVE_KEY), 'v1: relocated to the current key');
  expect(!store.has(legacyKey), 'v1: legacy key cleared once the new one is written');
  const again = Storage.load();
  expect(!!again && Storage.lastLoad.migrated === false, 'v1: second load is a plain load');
  same(snap(new GameState()).ending, null, 'v1: sanity — a fresh state is empty');
}

// ---------------------------------------------------------------------------
// 3. The chain applies every registered step in order.
// ---------------------------------------------------------------------------
function chainMechanism() {
  const versions = Object.keys(SAVE_MIGRATIONS).map(Number).sort((a, b) => a - b);
  expect(versions.length > 0, 'chain: at least one production migration is registered');
  expect(versions[0] === 1 && versions[versions.length - 1] === SAVE_VERSION - 1,
    'chain: registered steps span 1 .. current-1 with no hole',
    JSON.stringify(versions));
  for (let v = 1; v < SAVE_VERSION; v++) {
    expect(typeof SAVE_MIGRATIONS[v] === 'function', `chain: a step exists for v${v}`);
  }

  const payload = JSON.parse(FIXTURE_V1);
  const frozen = JSON.stringify(payload);
  const result = migrateSave(payload);
  expect(result.ok, 'chain: migrating from the oldest supported version succeeds');
  same(result.steps, versions, 'chain: every registered step was applied, in order');
  expect(result.to === SAVE_VERSION, 'chain: lands exactly on the current version');
  expect(JSON.stringify(payload) === frozen, 'chain: the input payload was not mutated');

  // A payload already at the current version is passed through untouched.
  const current = migrateSave({ state: { v: SAVE_VERSION } });
  expect(current.ok && current.steps.length === 0, 'chain: a current save takes no steps');
}

// ---------------------------------------------------------------------------
// 4. What happens to a save this build cannot read. This is the whole point.
// ---------------------------------------------------------------------------
function unreadableSavesSurvive() {
  const cases = [
    ['from-newer-build', JSON.stringify({ state: { v: SAVE_VERSION + 1, flags: ['fromTheFuture'] } })],
    ['unreadable', '{"state":{"v":1,'],
    ['unknown-shape', JSON.stringify({ state: { flags: ['noVersionField'] } })],
    ['unknown-shape', JSON.stringify({ state: { v: 'two' } })],
  ];
  for (const [reason, raw] of cases) {
    reset();
    store.set(SAVE_KEY, raw);
    const loaded = Storage.load();
    expect(loaded === null, `${reason}: not loaded`);
    expect(Storage.lastLoad.status === 'failed' && Storage.lastLoad.reason === reason,
      `${reason}: reported with an explicit reason`, JSON.stringify(Storage.lastLoad));
    expect(Storage.lastLoad.rescued === true, `${reason}: reported as kept`);
    expect(store.get(SAVE_RESCUE_KEY) === raw, `${reason}: the exact bytes were kept`);

    // The ninety seconds after the title screen: the game autosaves over the
    // save it could not read. The rescued copy has to outlive that.
    Storage.save(playedState(), PLAYER, {});
    expect(store.get(SAVE_RESCUE_KEY) === raw, `${reason}: survives the autosave that follows`);
    expect(Storage.hasRescuedSave(), `${reason}: the game can tell the player it is there`);
  }

  // A second failure must not overwrite the first rescue — the older copy is
  // the one with a playthrough in it.
  reset();
  const first = JSON.stringify({ state: { v: 99, flags: ['first'] } });
  const second = JSON.stringify({ state: { v: 98, flags: ['second'] } });
  store.set(SAVE_KEY, first); Storage.load();
  store.set(SAVE_KEY, second); Storage.load();
  expect(store.get(SAVE_RESCUE_KEY) === first, 'rescue: the first rescued save is never overwritten');

  // Nothing stored is not a failure.
  reset();
  expect(Storage.load() === null && Storage.lastLoad.status === 'none',
    'empty: no save reads as no save, not as a failure');

  // clear() is the player's own "new game" and must not take the rescue with it.
  reset();
  store.set(SAVE_KEY, JSON.stringify({ state: { v: 99 } }));
  Storage.load();
  Storage.clear();
  expect(Storage.hasRescuedSave(), 'rescue: clear() leaves the rescued save alone');
  Storage.clearRescuedSave();
  expect(!Storage.hasRescuedSave(), 'rescue: the player can drop it deliberately');
}

// ---------------------------------------------------------------------------
// 5. Fault injection: a migration step that is broken at runtime must be
//    reported as a failure and must not destroy the save.
// ---------------------------------------------------------------------------
function brokenStepsFailSafely() {
  const original = SAVE_MIGRATIONS[1];
  const injections = [
    ['throws', () => { throw new Error('bad step'); }],
    ['does not advance the version', (p) => p],
    ['returns nothing', () => null],
    ['drops the state', (p) => ({ ...p, state: undefined })],
  ];
  for (const [label, step] of injections) {
    SAVE_MIGRATIONS[1] = step;
    reset();
    store.set(SAVE_KEY, FIXTURE_V1);
    const loaded = Storage.load();
    expect(loaded === null, `injected step that ${label}: refuses to load`);
    expect(Storage.lastLoad.reason === 'migration-failed',
      `injected step that ${label}: reported as a failed migration`,
      JSON.stringify(Storage.lastLoad));
    expect(store.get(SAVE_RESCUE_KEY) === FIXTURE_V1,
      `injected step that ${label}: the original save is kept whole`);
  }
  SAVE_MIGRATIONS[1] = original;
}

const SUITE = [currentVersionRegression, migratesPublishedV1, chainMechanism,
  unreadableSavesSurvive, brokenStepsFailSafely];

const runSuite = () => {
  checks = [];
  for (const fn of SUITE) fn();
  return checks;
};

// ---------------------------------------------------------------------------
// Negative controls. Each one puts the defect back. If the suite still passes,
// the suite is not testing what it says it is.
// ---------------------------------------------------------------------------
const NEGATIVES = {
  'no-migration-registry': () => {
    const kept = { ...SAVE_MIGRATIONS };
    for (const k of Object.keys(SAVE_MIGRATIONS)) delete SAVE_MIGRATIONS[k];
    return () => Object.assign(SAVE_MIGRATIONS, kept);
  },
  // The exact loader this change replaced.
  'pre-fix-loader': () => {
    const kept = Storage.load;
    Storage.load = function () {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) { this.lastLoad = { status: 'none' }; return null; }
        const d = JSON.parse(raw);
        if (!d || !d.state || d.state.v !== SAVE_VERSION) return null;
        this.lastLoad = { status: 'ok', migrated: false, from: d.state.v, steps: [] };
        return d;
      } catch { return null; }
    };
    return () => { Storage.load = kept; };
  },
  'discard-instead-of-rescue': () => {
    const kept = Storage._rescue;
    Storage._rescue = function (raw, reason, from) {
      this.lastLoad = { status: 'failed', reason, from: from ?? null, rescued: false };
      return null;
    };
    return () => { Storage._rescue = kept; };
  },
  'rescue-overwritten-by-later-failures': () => {
    const kept = Storage._rescue;
    Storage._rescue = function (raw, reason, from) {
      try { localStorage.setItem(SAVE_RESCUE_KEY, raw); } catch { /* ignore */ }
      this.lastLoad = { status: 'failed', reason, from: from ?? null, rescued: true };
      return null;
    };
    return () => { Storage._rescue = kept; };
  },
  'silent-migration': () => {
    const kept = Storage.load;
    Storage.load = function (...a) {
      const r = kept.apply(this, a);
      this.lastLoad = { status: r ? 'ok' : 'none', migrated: false, from: null, steps: [] };
      return r;
    };
    return () => { Storage.load = kept; };
  },
};

// --- run -------------------------------------------------------------------
console.log('save migration suite — audit H1');
console.log(`  current SAVE_VERSION ${SAVE_VERSION}; fixture from the published v1 build\n`);

const positives = runSuite();
const failed = positives.filter((c) => !c.pass);
for (const c of failed) console.log(`  FAIL ${c.name} — ${c.detail}`);
console.log(`positives: ${positives.length - failed.length}/${positives.length} passed`);

let uncaught = [];
for (const [name, apply] of Object.entries(NEGATIVES)) {
  const revert = apply();
  let caught = 0;
  try {
    caught = runSuite().filter((c) => !c.pass).length;
  } catch (e) {
    caught = 1;                       // a throw is a rejection too
  } finally {
    revert();
  }
  if (caught === 0) uncaught.push(name);
  console.log(`negative ${name}: ${caught ? `rejected by ${caught} check(s)` : 'NOT REJECTED'}`);
}

// The suite has to be able to fail after all that patching, so run it clean.
const rerun = runSuite().filter((c) => !c.pass);
const restored = rerun.length === failed.length;

mkdirSync(EVIDENCE_DIR, { recursive: true });
writeFileSync(join(EVIDENCE_DIR, 'GB-H1-SAVE-MIGRATION.json'), JSON.stringify({
  task: 'GB-H1',
  scope: 'Save migration and save-loss behaviour in src/game/state.js, over an in-memory ' +
    'localStorage. The old-version input is a real blob written by the published v1 build. ' +
    'Not a browser run and not a claim about iOS storage eviction.',
  saveVersion: SAVE_VERSION,
  registeredMigrations: Object.keys(SAVE_MIGRATIONS).map(Number),
  multiStepChainExercised: SAVE_VERSION - 1 > 1,
  checks: positives,
  negativeControls: Object.keys(NEGATIVES).map((name) => ({ name, rejected: !uncaught.includes(name) })),
  productionBehaviourRestored: restored,
  passed: failed.length === 0 && uncaught.length === 0 && restored,
}, null, 2));

if (!restored) {
  console.log('\nSAVE MIGRATION FAILED — the suite did not restore production behaviour');
  process.exit(1);
}

if (failed.length || uncaught.length) {
  console.log(`\nSAVE MIGRATION FAILED — ${failed.length} check(s) failed, ` +
    `${uncaught.length} negative control(s) not rejected`);
  process.exit(1);
}
console.log(`\nSAVE MIGRATION OK — ${positives.length} checks, ` +
  `${Object.keys(NEGATIVES).length} negative controls all rejected`);
