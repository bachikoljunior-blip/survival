#!/usr/bin/env node
/**
 * Save migration gate.
 *
 * Two layers, because one of them alone would be a lie:
 *
 *   1. The migration engine itself, imported from `src/game/state.js` and
 *      driven directly. It gets a real v1 save captured from the real game at
 *      revision 193f408 (`tools/fixtures/save-v1.json`) — not a hand-authored
 *      guess at what v1 looked like — plus every rejection case, plus a staged
 *      1->2->3 chain driven through an injected registry so the "one step at a
 *      time" claim is exercised rather than asserted.
 *
 *   2. The game. The old save goes into localStorage, the real build boots,
 *      the real CONTINUE button is pressed, and the progress the old save
 *      carried has to actually be in the running game afterwards. Then the
 *      cases that must NOT load — a save from a newer build, an unreadable one
 *      — have to leave the stored bytes untouched and say so on screen.
 *
 * Exit status is non-zero on any failure. This is a gate, not a report.
 *
 *   node tools/save_migration.mjs            both layers (needs dist/)
 *   node tools/save_migration.mjs --unit     layer 1 only, no browser
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// An in-memory localStorage, installed BEFORE the module is imported so the
// loader layer below can drive the real Storage object without a browser.
const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};

const {
  SAVE_KEY, SAVE_RESCUE_KEY, SAVE_VERSION, SAVE_STATUS, SAVE_MIGRATIONS, SAVE_LOADABLE,
  migrateSave, GameState, Storage,
} = await import('../src/game/state.js');

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'shots');
const UNIT_ONLY = process.argv.includes('--unit');
const FORCE_FAILURE = process.argv.includes('--force-failure');

const results = [];
/** Where `check` writes. Redirected while a negative control re-runs a layer. */
let sink = results;
const check = (name, ok, detail = '') => {
  sink.push({ name, ok: !!ok, detail });
  if (sink === results) console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  return !!ok;
};

const FIXTURE = JSON.parse(readFileSync(join(ROOT, 'tools/fixtures/save-v1.json'), 'utf8'));
const V1 = FIXTURE.payload;

function unitLayer() {
  // The address, as a literal. Every seed in this file is written to SAVE_KEY as
// imported from the module under test, so the suite is blind to the one change
// that loses every existing player's save: moving the key. Changing it to a new
// string passed 100 of 100 checks. It cannot now.
const PUBLISHED_SAVE_KEY = 'cinderline.save.v1';
const PUBLISHED_RESCUE_KEY = 'cinderline.save.rescued';
check('the save is still stored where the published build put it',
  SAVE_KEY === PUBLISHED_SAVE_KEY,
  `SAVE_KEY is "${SAVE_KEY}", the published build wrote "${PUBLISHED_SAVE_KEY}"`);
check('the rescue list is where the game says it is',
  SAVE_RESCUE_KEY === PUBLISHED_RESCUE_KEY, SAVE_RESCUE_KEY);

console.log(`--- layer 1: the migration engine (this build reads v${SAVE_VERSION}) ---`);

  {
    // Not "the fixture says it is old": its own `save_version` is copied from
    // `state.v`, so checking one against the other proves nothing. Ask git what
    // the recorded revision actually shipped.
    const rev = String(FIXTURE._provenance.source_revision || '');
    let shipped = null;
    try {
      const src = execFileSync('git', ['show', `${rev}:src/game/state.js`],
        { cwd: ROOT, encoding: 'utf8' });
      shipped = Number((/export const SAVE_VERSION = (\d+)/.exec(src) || [])[1]);
    } catch { shipped = null; }
    check('the revision the fixture came from really shipped an older format',
      shipped === 1 && shipped < SAVE_VERSION,
      `${rev.slice(0, 7)} shipped SAVE_VERSION ${shipped === null ? '(unreadable)' : shipped}`);
    check('and the fixture is in that format, not this one',
      V1.state.v === 1 && V1.v === undefined,
      `state.v=${V1.state.v} envelope v=${String(V1.v)}`);
  }
  check('the fixture carries real progress',
    V1.state.flags.includes('fixture_legacy_save')
    && V1.state.capabilities.includes('readAir')
    && V1.state.quests.length > 0 && !!V1.player,
    `${V1.state.flags.length} flags, ${V1.state.quests.length} quests`);

  // --- rejection cases. Every one of these must refuse, and must say why. ------
  // A state block that is otherwise plausible, so the checks below are about
  // the VERSION and not about the shape. `flags` and `quests` are the two
  // arrays every save `serialise` has ever written carries, and the loader now
  // requires them — a payload without them is refused earlier, as corrupt.
  const body = (v) => ({ v, flags: ['a_flag'], quests: [['arrival', { state: 'active' }]] });
  const rejects = [
    ['null is empty, not corrupt', null, SAVE_STATUS.EMPTY],
    ['undefined is empty', undefined, SAVE_STATUS.EMPTY],
    ['a string is corrupt', 'not a save', SAVE_STATUS.CORRUPT],
    ['a number is corrupt', 7, SAVE_STATUS.CORRUPT],
    ['an array is corrupt', [{ v: 1 }], SAVE_STATUS.CORRUPT],
    ['an object with no state is corrupt', { v: 1 }, SAVE_STATUS.CORRUPT],
    ['a non-object state is corrupt', { v: 1, state: 'x' }, SAVE_STATUS.CORRUPT],
    ['an unversioned save is unknown', { state: { flags: ['a'], quests: [] } }, SAVE_STATUS.UNKNOWN_VERSION],
    ['a non-integer envelope version is corrupt, not a licence to fall back', { v: 1.5, state: body(1) }, SAVE_STATUS.CORRUPT],
    ['so is a null envelope version', { v: null, state: body(2) }, SAVE_STATUS.CORRUPT],
    ['so is Infinity', { v: 1e999, state: body(2) }, SAVE_STATUS.CORRUPT],
    ['an envelope and a state block that disagree is corrupt', { v: SAVE_VERSION, state: body(1) }, SAVE_STATUS.CORRUPT],
    ['a state block that is an array is corrupt', { v: 1, state: [] }, SAVE_STATUS.CORRUPT],
    ['a state block with no progress fields is corrupt', { v: 1, state: { v: 1 } }, SAVE_STATUS.CORRUPT],
    ['version 0 is corrupt', { v: 0, state: body(0) }, SAVE_STATUS.CORRUPT],
    ['a negative version is corrupt', { v: -3, state: body(-3) }, SAVE_STATUS.CORRUPT],
    ['a newer save is refused, not guessed at', { v: SAVE_VERSION + 1, state: body(SAVE_VERSION + 1) }, SAVE_STATUS.FUTURE],
    ['a far-future save is refused', { v: 9999, state: body(9999) }, SAVE_STATUS.FUTURE],
  ];
  for (const [name, input, want] of rejects) {
    const r = migrateSave(input);
    check(name, r.status === want && r.payload === null && (want === SAVE_STATUS.EMPTY || !!r.reason),
      `status=${r.status} reason=${r.reason || '—'}`);
  }

  // --- the real upgrade -------------------------------------------------------
  const before = JSON.stringify(V1);
  const up = migrateSave(V1);
  check('a real v1 save migrates', up.status === SAVE_STATUS.MIGRATED && !!up.payload,
    `${up.from} -> ${up.to} via ${up.steps.join(', ') || 'nothing'}`);
  check('it is upgraded one step at a time', JSON.stringify(up.steps) === JSON.stringify(['1->2']));
  check('the version lands on the envelope and the state',
    !!up.payload && up.payload.v === SAVE_VERSION && up.payload.state.v === SAVE_VERSION);
  check('migrating does not mutate the stored save', JSON.stringify(V1) === before);
  check('migration is idempotent at the current version',
    !!up.payload && migrateSave(up.payload).status === SAVE_STATUS.OK);

  // Nothing may be invented and nothing may be lost. Compare every field except
  // the version, which is the only thing this migration is allowed to touch.
  {
    const strip = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.v; delete c.state.v; return c; };
    check('no progress is added, dropped or altered',
      !!up.payload && JSON.stringify(strip(V1)) === JSON.stringify(strip(up.payload)));
  }

  // The migrated payload has to be loadable by the state object, not merely
  // shaped right — deserialise refuses anything that is not current.
  {
    const s = new GameState();
    const ok = !!up.payload && s.deserialise(up.payload.state);
    check('the migrated state deserialises', ok);
    check('the old save\'s progress survives the round trip',
      ok && s.flags.has('fixture_legacy_save') && s.capabilities.has('readAir')
      && s.inventory.get('filter') === V1.state.inventory.find((e) => e[0] === 'filter')[1]
      && s.chapter === V1.state.chapter && s.quests.size === V1.state.quests.length,
      ok ? `chapter ${s.chapter}, ${s.flags.size} flags, ${s.quests.size} quests` : '');
    const stale = new GameState();
    check('a v1 state is still refused by deserialise directly',
      stale.deserialise(V1.state) === false);
  }

  // --- staged migration, driven through an injected registry ------------------
  // The shipped chain has one step, so a 1->2->3 walk is proved with a registry
  // built for the test. This exercises the engine's ordering, not the shipped
  // migrations; the shipped step is covered by the fixture case above.
  {
    const seen = [];
    const registry = {
      1: (d) => { seen.push([1, d.v ?? d.state.v]); return { ...d, v: 2, state: { ...d.state, v: 2 }, addedBy1: true }; },
      2: (d) => { seen.push([2, d.v]); return { ...d, v: 3, state: { ...d.state, v: 3 }, addedBy2: true }; },
    };
    const r = migrateSave(V1, registry, 3);
    check('a two-version gap walks every step in order',
      r.status === SAVE_STATUS.MIGRATED
      && JSON.stringify(r.steps) === JSON.stringify(['1->2', '2->3'])
      && JSON.stringify(seen) === JSON.stringify([[1, 1], [2, 2]]),
      `steps=${r.steps.join(',')} saw=${JSON.stringify(seen)}`);
    check('every step\'s output reaches the next one and the result',
      !!r.payload && r.payload.addedBy1 === true && r.payload.addedBy2 === true && r.payload.v === 3);

    // The stamp `migrateSave` puts on at the end is a backstop, and a backstop
    // that is never exercised is decoration. A migration that forgets the
    // version must still come out at the target — otherwise the save migrates
    // again on every boot, forever, and the bug is invisible because the result
    // happens to be correct each time.
    const forgetful = migrateSave(V1, { 1: (d) => ({ ...d }) }, 2);
    // This used to be stamped for it and reported as a successful migration,
    // which made a step that did nothing indistinguishable from one that
    // worked — and a step that returned version 47, or an empty state, just as
    // indistinguishable. A step must arrive where it says it arrived.
    check('a migration that forgets to set the version fails instead of being stamped',
      forgetful.status === SAVE_STATUS.FAILED && forgetful.payload === null,
      forgetful.reason || '');
    const wrongVersion = migrateSave(V1, { 1: (d) => ({ ...d, v: 47, state: { ...d.state, v: 47 } }) }, 2);
    check('a migration that lands on the wrong version fails',
      wrongVersion.status === SAVE_STATUS.FAILED, wrongVersion.reason || '');
    const emptied = migrateSave(V1, { 1: (d) => ({ ...d, v: 2, state: { v: 2, flags: [], quests: [] } }) }, 2);
    check('a migration that empties the save fails instead of reporting success',
      emptied.status === SAVE_STATUS.FAILED, emptied.reason || '');

    const gap = migrateSave(V1, { 1: registry[1] }, 3);
    check('a missing step stops instead of skipping',
      gap.status === SAVE_STATUS.NO_PATH && gap.payload === null, gap.reason || '');

    const throws = migrateSave(V1, { 1: () => { throw new Error('boom'); } }, 2);
    check('a throwing migration fails loudly',
      throws.status === SAVE_STATUS.FAILED && /boom/.test(throws.reason || ''), throws.reason || '');

    const junk = migrateSave(V1, { 1: () => ({ nope: true }) }, 2);
    check('a migration that returns a non-save fails',
      junk.status === SAVE_STATUS.FAILED && junk.payload === null, junk.reason || '');

    check('the shipped registry covers every version below the current one',
      Array.from({ length: SAVE_VERSION - 1 }, (_, i) => i + 1)
        .every((v) => typeof SAVE_MIGRATIONS[v] === 'function'));
    check('only ok and migrated are loadable',
      JSON.stringify(SAVE_LOADABLE) === JSON.stringify([SAVE_STATUS.OK, SAVE_STATUS.MIGRATED]));
  }
}

unitLayer();

// ---------------------------------------------------------------------------
// Layer 1b: the loader and the rescue slot
// ---------------------------------------------------------------------------
// The engine can be perfect and the player can still lose a playthrough: the
// damage in audit H1 happened in `Storage.load` and in the ninety seconds
// after it. This drives the real Storage object over an in-memory
// localStorage, because that is where "was it kept?" is decided.
function loaderLayer() {
  const reset = () => { memory.clear(); Storage.lastResult = null; };
  const stored = () => memory.get(SAVE_KEY);
  const rescued = () => memory.get(SAVE_RESCUE_KEY);

  // A current save round-trips and is not reported as migrated.
  {
    reset();
    const S = new GameState();
    S.set('loader_layer'); S.give('filter', 2); S.chapter = 2;
    const filters = S.countItem('filter');       // the state's own count, not a guess
    check('loader: a current save writes', Storage.save(S, null, { interior: 'marrow_in' }));
    const back = Storage.load();
    const R = new GameState();
    check('loader: it loads', !!back && R.deserialise(back.state));
    check('loader: nothing is lost',
      R.has('loader_layer') && R.countItem('filter') === filters && R.chapter === 2,
      `filters ${R.countItem('filter')}/${filters}`);
    check('loader: and it is not reported as a migration',
      Storage.lastResult.status === SAVE_STATUS.OK, Storage.lastResult.status);
    check('loader: no rescue copy is made for a save that loaded', rescued() === undefined);
  }

  // A real v1 save: loadable, reported as migrated, and NOT written back.
  {
    reset();
    const raw = JSON.stringify(V1);
    memory.set(SAVE_KEY, raw);
    const back = Storage.load();
    check('loader: a real v1 save loads', !!back && back.v === SAVE_VERSION);
    check('loader: reported as migrated', Storage.lastResult.status === SAVE_STATUS.MIGRATED);
    check('loader: the stored bytes are left alone until the next real save', stored() === raw);
    check('loader: no rescue copy is made for a save that migrated', rescued() === undefined);
  }

  // Everything this build cannot read: refused, explained, and KEPT.
  const plausible = (v) => ({ v, flags: ['a_flag'], quests: [['arrival', { state: 'active' }]] });
  for (const [label, raw, status] of [
    ['a newer build', JSON.stringify({ v: SAVE_VERSION + 1, state: plausible(SAVE_VERSION + 1) }), SAVE_STATUS.FUTURE],
    ['a truncated write', '{"v":2,"state":{', SAVE_STATUS.CORRUPT],
    ['a save with no version', JSON.stringify({ state: { flags: ['a'], quests: [] } }), SAVE_STATUS.UNKNOWN_VERSION],
    ['a save whose versions disagree', JSON.stringify({ v: SAVE_VERSION, state: plausible(1) }), SAVE_STATUS.CORRUPT],
  ]) {
    reset();
    memory.set(SAVE_KEY, raw);
    check(`loader: ${label} does not load`, Storage.load() === null);
    check(`loader: ${label} is reported as ${status}`,
      Storage.lastResult.status === status, Storage.lastResult.status);
    check(`loader: ${label} is left byte-for-byte alone`, stored() === raw);
    check(`loader: ${label} is copied to the rescue list`,
      Storage.rescuedSaves().some((e) => e.raw === raw));
    check(`loader: ${label} reports that THIS save was kept`, Storage.lastResult.rescued === true);

    // The ninety seconds after the title screen: a new game autosaves over it.
    const S = new GameState();
    S.set('the_new_game_that_overwrites_it');
    Storage.save(S, null, {});
    check(`loader: ${label} survives the new game that follows`,
      Storage.rescuedSaves().some((e) => e.raw === raw));
    check(`loader: and the rescue list is visible to the game`, Storage.hasRescuedSave());
  }

  // Junk in the rescue list must not stop a real playthrough being copied. The
  // first-write-wins slot this replaced reported "copied aside" for a save it
  // had not copied.
  {
    reset();
    const junk = JSON.stringify({ v: 9, state: plausible(9) });
    const real = JSON.stringify({ v: 7, state: { v: 7, chapter: 3, flags: ['three_chapters'], quests: [['arrival', {}]] } });
    memory.set(SAVE_KEY, junk); Storage.load();
    memory.set(SAVE_KEY, real); Storage.load();
    check('loader: earlier junk does not squat the rescue list',
      Storage.rescuedSaves().some((e) => e.raw === real));
    check('loader: and the earlier copy is still there too',
      Storage.rescuedSaves().some((e) => e.raw === junk));
    check('loader: "it was kept" is reported for the save it is said about',
      Storage.lastResult.rescued === true);
  }

  // A browser that will not accept the copy must not be reported as if it had.
  {
    reset();
    const raw = JSON.stringify({ v: 9, state: plausible(9) });
    memory.set(SAVE_KEY, raw);
    const real = globalThis.localStorage;
    globalThis.localStorage = {
      getItem: (k) => (memory.has(k) ? memory.get(k) : null),
      setItem: () => { throw new Error('quota exceeded'); },
      removeItem: (k) => memory.delete(k),
    };
    // finally, because a sabotaged _rescue may let the throw escape, and a
    // leaked storage shim would fail every check after this one for the wrong
    // reason.
    try { Storage.load(); } catch { /* the control being tested */ } finally {
      globalThis.localStorage = real;
    }
    check('loader: a rescue that could not be written reports false, not true',
      !!Storage.lastResult && Storage.lastResult.rescued === false,
      Storage.lastResult ? String(Storage.lastResult.rescued) : 'the load did not complete');
  }

  // The bytes an old build could read are kept before the first new-format
  // save replaces them, so a rolled-back release has something to recover.
  {
    reset();
    const raw = JSON.stringify(V1);
    memory.set(SAVE_KEY, raw);
    Storage.load();
    check('loader: a migrated save is not rescued while it is still readable',
      !Storage.rescuedSaves().some((e) => e.raw === raw));
    const S = new GameState();
    S.set('first_save_of_the_new_format');
    Storage.save(S, null, {});
    check('loader: the pre-upgrade bytes are kept before the format changes under them',
      Storage.rescuedSaves().some((e) => e.raw === raw));
  }

  // A save this build cannot read that appears DURING a session. The rescue
  // used to live only in load(), so the next autosave destroyed it with no
  // message and no copy — a second tab, or a newer deployment on the same
  // origin, is all it takes.
  {
    reset();
    const S = new GameState();
    S.set('a_live_session');
    Storage.save(S, null, {});
    const fromNewerBuild = JSON.stringify({ v: SAVE_VERSION + 1,
      state: { v: SAVE_VERSION + 1, flags: ['thirty_hours'], quests: [['arrival', {}]] } });
    memory.set(SAVE_KEY, fromNewerBuild);        // written by something else
    S.set('a_little_later');
    check('write: the session saves over it', Storage.save(S, null, {}));
    check('write: and the save it could not read was copied first',
      Storage.rescuedSaves().some((e) => e.raw === fromNewerBuild));
  }

  // ...but a save this build CAN read is just overwritten, as it should be.
  {
    reset();
    const S = new GameState();
    S.set('ordinary');
    Storage.save(S, null, {});
    const mine = stored();
    S.set('ordinary_again');
    Storage.save(S, null, {});
    check('write: an ordinary save is not hoarded in the rescue list',
      !Storage.rescuedSaves().some((e) => e.raw === mine),
      `${Storage.rescuedSaves().length} rescued`);
  }

  // Nothing stored is not a failure, and clear() is not a licence to bin it.
  {
    reset();
    check('loader: no save reads as empty, not as a fault',
      Storage.load() === null && Storage.lastResult.status === SAVE_STATUS.EMPTY);
    memory.set(SAVE_KEY, JSON.stringify({ v: 99, state: { v: 99 } }));
    Storage.load();
    Storage.clear();
    check('loader: clear() drops the save', stored() === undefined);
    check('loader: clear() keeps the rescued copies', Storage.hasRescuedSave());
    Storage.clearRescuedSave();
    check('loader: the player can drop the rescued copy deliberately', !Storage.hasRescuedSave());
  }

  // A browser that refuses to store anything must not throw its way out.
  {
    reset();
    const real = globalThis.localStorage;
    globalThis.localStorage = {
      getItem: () => { throw new Error('private browsing'); },
      setItem: () => { throw new Error('private browsing'); },
      removeItem: () => { throw new Error('private browsing'); },
    };
    let threw = false;
    try { Storage.load(); Storage.hasRescuedSave(); Storage.clear(); } catch { threw = true; } finally {
      globalThis.localStorage = real;
    }
    check('loader: storage that throws on every call does not take the game down', !threw);
  }
}

loaderLayer();

// ---------------------------------------------------------------------------
// Negative controls
// ---------------------------------------------------------------------------
// A check that cannot fail proves nothing. Each control puts a real defect
// back — including the exact loader this change replaced — and the layers above
// are re-run against it. If they still pass, they are not testing what they say.
//
// LIMIT, stated rather than left to be discovered: these run layers 1 and 1b
// only. Layer 2 — the real browser, the real CONTINUE button, the real title
// warning — has no automated negative control, because each one would need its
// own rebuild and browser run. Its ability to fail has been observed by hand
// and is recorded in the evidence, which is weaker and is labelled as such.
//
// Each control names the check that must catch it. "Something failed" is not
// enough: two controls used to be held up by a single check each, and one was
// "caught" only because the sabotage made the layer throw.
const NEGATIVE_CONTROLS = {
  'no migration registered': () => {
    const kept = { ...SAVE_MIGRATIONS };
    for (const k of Object.keys(SAVE_MIGRATIONS)) delete SAVE_MIGRATIONS[k];
    return () => Object.assign(SAVE_MIGRATIONS, kept);
  },
  // NOT a control: a step that forgets to stamp the version is corrected by
  // migrateSave's final stamp on purpose, and nothing is lost by it. Putting it
  // here would only prove that a harmless thing is harmless.
  //
  // This one is a real defect — writing the upgraded save back over the
  // original at load time takes away the player's last working copy the moment
  // this build is rolled back.
  'a loader that writes the migration back immediately': () => {
    const kept = Storage.load;
    Storage.load = function (...a) {
      const r = kept.apply(this, a);
      if (r && this.lastResult.status === SAVE_STATUS.MIGRATED) {
        localStorage.setItem(SAVE_KEY, JSON.stringify(r));
      }
      return r;
    };
    return () => { Storage.load = kept; };
  },
  'a migration that drops the progress': () => {
    const kept = SAVE_MIGRATIONS[1];
    SAVE_MIGRATIONS[1] = (d) => ({ ...d, v: 2, state: { v: 2 } });
    return () => { SAVE_MIGRATIONS[1] = kept; };
  },
  // What load() looked like before this change: version mismatch -> null, and
  // the caller cannot tell that from "no save".
  'the pre-fix loader': () => {
    const kept = Storage.load;
    Storage.load = function () {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) { this.lastResult = migrateSave(null); return null; }
        const d = JSON.parse(raw);
        if (!d || !d.state || d.state.v !== SAVE_VERSION) return null;
        this.lastResult = migrateSave(d);
        return d;
      } catch { return null; }
    };
    return () => { Storage.load = kept; };
  },
  'a write path that overwrites without looking': () => {
    const kept = Storage.save;
    Storage.save = function (state, player, extra = {}) {
      const payload = { ...extra, v: SAVE_VERSION, state: state.serialise(), player: null,
        savedAt: 0 };
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(payload)); return true; }
      catch { return false; }
    };
    return () => { Storage.save = kept; };
  },
  'discarding instead of rescuing': () => {
    const kept = Storage._rescue;
    Storage._rescue = () => false;
    return () => { Storage._rescue = kept; };
  },
  'a rescue slot that later failures overwrite': () => {
    const kept = Storage._rescue;
    Storage._rescue = function (raw) {
      if (raw == null) return false;
      localStorage.setItem(SAVE_RESCUE_KEY, raw);
      return true;
    };
    return () => { Storage._rescue = kept; };
  },
};

/** The check each control must be caught BY, not merely "something failed". */
const CONTROL_EXPECTS = {
  'no migration registered': 'a real v1 save migrates',
  'a loader that writes the migration back immediately':
    'loader: the stored bytes are left alone until the next real save',
  'a migration that drops the progress': 'no progress is added, dropped or altered',
  'the pre-fix loader': 'loader: a real v1 save loads',
  'a write path that overwrites without looking': 'write: and the save it could not read was copied first',
  'discarding instead of rescuing': 'loader: a newer build is copied to the rescue list',
  'a rescue slot that later failures overwrite': 'loader: and the earlier copy is still there too',
};

console.log('\n--- negative controls: each one must be caught, by the right check ---');
for (const [name, apply] of Object.entries(NEGATIVE_CONTROLS)) {
  const undo = apply();
  const caught = [];
  let threw = null;
  sink = caught;
  try {
    unitLayer();
    loaderLayer();
  } catch (e) {
    threw = (e && e.message) || String(e);
  } finally {
    sink = results;
    undo();
  }
  const rejected = caught.filter((c) => !c.ok);
  const wanted = CONTROL_EXPECTS[name];
  const byTheRightCheck = rejected.some((c) => c.name === wanted);
  check(`negative control rejected: ${name}`,
    byTheRightCheck,
    byTheRightCheck
      ? `caught by "${wanted}"${threw ? ` (the layer also threw: ${threw})` : ''} and ${rejected.length - 1} other(s)`
      : `expected "${wanted}" to fail; ${rejected.length} other check(s) failed${threw ? `, layer threw: ${threw}` : ''}`);
}

// ...and the layers still pass once production behaviour is restored, or the
// controls above proved nothing about the real code.
{
  const after = [];
  sink = after;
  unitLayer();
  loaderLayer();
  sink = results;
  const stillFailing = after.filter((c) => !c.ok);
  check('production behaviour is restored after the controls',
    stillFailing.length === 0, stillFailing.map((c) => c.name).join(', '));
}

let crashed = null;
const finish = () => {
  if (crashed) sink.push({ name: 'the run completed', ok: false, detail: crashed });
  if (FORCE_FAILURE) results.push({ name: 'forced failure', ok: false, detail: '--force-failure was passed' });
  const failed = results.filter((r) => !r.ok);
  try {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, 'save-migration.json'), JSON.stringify({
      save_version: SAVE_VERSION,
      fixture: FIXTURE._provenance,
      passed: failed.length === 0,
      crashed,
      results, page_errors: pageErrors, when: new Date().toISOString(),
    }, null, 2));
  } catch (e) { console.error('could not write the report:', e.message); }
  for (const r of results.filter((x) => !x.ok)) console.log(`FAIL  ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
  console.log(failed.length
    ? `\nSAVE MIGRATION FAILED (${failed.length} of ${results.length})`
    : `\nSAVE MIGRATION OK (${results.length} checks)`);
  process.exit(failed.length ? 1 : 0);
};
process.on('uncaughtException', (e) => { crashed = String(e && e.stack || e); finish(); });
process.on('unhandledRejection', (e) => { crashed = String(e && e.stack || e); finish(); });

if (UNIT_ONLY) finish();

// ---------------------------------------------------------------------------
// Layer 2: the game
// ---------------------------------------------------------------------------
// Everything below can throw: a Playwright timeout in the middle of case B used
// to kill the process before a single check line was printed and before the
// evidence was written — leaving the PREVIOUS run's passing artifact on disk,
// describing a build that no longer exists. The report is written on the way
// out no matter how this ends.

console.log('\n--- layer 2: the real build ---');
mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const BASE = '/cinderline-test';
const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (!p.startsWith(BASE)) { res.writeHead(404); res.end(); return; }
  p = p.slice(BASE.length) || '/';
  if (p.endsWith('/')) p += 'index.html';
  try {
    const body = readFileSync(join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, '')));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
         '--no-sandbox', '--disable-gpu-sandbox', '--ignore-gpu-blocklist'],
});

const pageErrors = [];
/**
 * Boot the game with `seed` already in storage, exactly as a returning player
 * would find it. A fresh context each time: a migration test that inherits the
 * previous case's storage is testing nothing.
 */
async function boot(seed) {
  const ctx = await browser.newContext({
    viewport: { width: 667, height: 375 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push('PAGEERROR ' + String((e && e.stack) || e)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE ' + m.text()); });
  await page.addInitScript(([key, text]) => {
    if (text === null) localStorage.removeItem(key);
    else localStorage.setItem(key, text);
  }, [SAVE_KEY, seed]);
  await page.goto(`http://127.0.0.1:${port}${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready === true', null, { timeout: 120000 });
  return { ctx, page };
}

/**
 * Tap a title button the way a thumb does.
 *
 * The buttons are bound through the menu's own pointerdown/pointerup tap
 * handler, so a synthetic `.click()` would prove nothing about the control the
 * player actually presses. This sends a real touch at the button's real
 * on-screen position and fails if the button is not there to be hit.
 */
async function tapTitle(page, key) {
  const box = await page.evaluate((k) => {
    const b = window.CINDERLINE.game.menus.titleButtons[k];
    if (!b) return null;
    const r = b.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
  }, key);
  if (!box) throw new Error(`title button "${key}" is not on screen`);
  await page.touchscreen.tap(box.x, box.y);
  return box;
}

/** What the title screen is telling the player right now. */
const titleFacts = (page) => page.evaluate(() => {
  const M = window.CINDERLINE.game.menus;
  const btn = M.titleButtons.continue;
  return {
    continueShown: btn.style.display !== 'none' && !btn.classList.contains('off'),
    warning: (M.titleWarn.textContent || '').trim(),
  };
});

/** The progress actually present in the running game. */
const liveState = (page) => page.evaluate(() => {
  const S = window.CINDERLINE.game.state;
  return {
    flags: [...S.flags].sort(),
    capabilities: [...S.capabilities].sort(),
    inventory: [...S.inventory.entries()].sort(),
    quests: [...S.quests.entries()].map(([id, q]) => [id, q.state, q.step]).sort(),
    journal: S.journal.map((j) => j.id).sort(),
    chapter: S.chapter,
  };
});

const storedSave = (page) => page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);

// --- case A: the old save loads, and the player keeps their game ------------
{
  const seed = JSON.stringify(V1);
  const { ctx, page } = await boot(seed);
  const title = await titleFacts(page);
  check('A. an old save offers CONTINUE', title.continueShown, `warning="${title.warning || '—'}"`);
  check('A. and does not warn about it', title.warning === '');
  // Reading a save is not permission to write one. The title screen has now
  // inspected it twice (Continue visibility, then the warning check) and the
  // stored bytes must be exactly as the old build left them — if this session
  // goes wrong, the previous build still has to be able to open its own save.
  check('A. inspecting an old save does not rewrite it', (await storedSave(page)) === seed);

  // The real button under a real touch, not the internal call behind it.
  const box = await tapTitle(page, 'continue');
  check('A. the CONTINUE target is at least 44px tall', box.h >= 44, `${Math.round(box.w)}x${Math.round(box.h)}px`);
  await page.waitForFunction(
    () => window.CINDERLINE.game.mode === window.CINDERLINE.MODE.PLAY, null, { timeout: 30000 });

  const live = await liveState(page);
  check('A. the old save\'s progress is in the running game',
    live.flags.includes('fixture_legacy_save')
    && live.capabilities.includes('readAir')
    && live.chapter === V1.state.chapter
    && live.journal.includes('fixture_note')
    && live.quests.length === V1.state.quests.length,
    `chapter ${live.chapter}, ${live.flags.length} flags, ${live.quests.length} quests`);
  check('A. every flag, item and quest from the old save is present',
    V1.state.flags.every((f) => live.flags.includes(f))
    && V1.state.capabilities.every((c) => live.capabilities.includes(c))
    && V1.state.inventory.every(([id, n]) => live.inventory.some(([i, m]) => i === id && m === n))
    && V1.state.quests.every(([id, q]) => live.quests.some(([i, st]) => i === id && st === q.state)));

  const notice = await page.evaluate(() =>
    [...document.querySelectorAll('.notice')].map((n) => n.textContent).join(' | '));
  check('A. the player is told the save was updated', /updated|更新/.test(notice), notice || '(none)');

  // ...and the first real save after a migration writes the new format. Play
  // legitimately autosaves, so this asserts the format, not that nothing wrote.
  const after = await page.evaluate(async (k) => {
    window.CINDERLINE.game.director.save(true);
    return localStorage.getItem(k);
  }, SAVE_KEY);
  const parsed = JSON.parse(after);
  check('A. the next save is written in the current format',
    parsed.v === SAVE_VERSION && parsed.state.v === SAVE_VERSION, `v=${parsed.v}`);
  check('A. and it still carries the migrated progress',
    parsed.state.flags.includes('fixture_legacy_save') && parsed.state.capabilities.includes('readAir'));

  await page.screenshot({ path: join(OUT, 'save-migration-loaded.png') });
  await ctx.close();
}

// --- case B: a save from a newer build ---------------------------------------
{
  const future = JSON.stringify({ ...V1, v: SAVE_VERSION + 5, state: { ...V1.state, v: SAVE_VERSION + 5 } });
  const { ctx, page } = await boot(future);
  const title = await titleFacts(page);
  check('B. a newer save does not offer CONTINUE', !title.continueShown);
  check('B. and the title screen says why', title.warning.length > 0, title.warning);
  check('B. the newer save is left byte-for-byte alone', (await storedSave(page)) === future);
  await page.screenshot({ path: join(OUT, 'save-migration-future.png') });
  await ctx.close();
}

// --- case C: an unreadable save ---------------------------------------------
{
  const junk = '{"state":{"v":1,"flags":[]';   // truncated, as a full disk leaves it
  const { ctx, page } = await boot(junk);
  const title = await titleFacts(page);
  check('C. a corrupt save does not offer CONTINUE', !title.continueShown);
  check('C. and the title screen says so', title.warning.length > 0, title.warning);
  check('C. the corrupt bytes are left alone', (await storedSave(page)) === junk);
  // The message must be TRUE at the moment it is on screen: the review that
  // opened these checks found a warning that said "left untouched" three
  // seconds before the game overwrote the file.
  check('C. the rescue copy the message promises actually exists',
    await page.evaluate(() => !!localStorage.getItem('cinderline.save.rescued')));

  // A refused CONTINUE must not quietly start a new game over the save it just
  // refused, and the explanation must still be on screen once everything has
  // settled — not evicted by the notices a new game pushes.
  await page.evaluate(() => window.CINDERLINE.continueGame());
  await page.waitForTimeout(1500);
  const afterRefusal = await titleFacts(page);
  check('C. a refused CONTINUE does not start a new game',
    await page.evaluate(() => window.CINDERLINE.game.mode === window.CINDERLINE.MODE.TITLE));
  check('C. and the explanation is still on screen afterwards',
    afterRefusal.warning.length > 0, afterRefusal.warning);
  check('C. and the refused save is still where it was',
    (await storedSave(page)) === junk);

  // A language change rebuilds the title screen. The warning has to come back
  // with it, in the new language.
  await page.evaluate(() => {
    const g = window.CINDERLINE.game;
    g.menus.settings.language = 'ja';
    g.applySettings(g.menus.settings);
    g.emit('locale', 'ja');
  });
  await page.waitForTimeout(600);
  const afterLocale = await titleFacts(page);
  check('C. the warning survives a language change',
    afterLocale.warning.length > 0, afterLocale.warning);
  check('C. and comes back in the new language',
    /[\u3040-\u30ff\u4e00-\u9faf]/.test(afterLocale.warning), afterLocale.warning);

  // The game still has to be playable, and once a new game IS started the
  // warning must stop being shown — it is no longer true of anything.
  await tapTitle(page, 'new');
  await page.waitForFunction(
    () => window.CINDERLINE.game.mode === window.CINDERLINE.MODE.PLAY, null, { timeout: 30000 });
  check('C. a new game still starts',
    await page.evaluate(() => window.CINDERLINE.game.mode === window.CINDERLINE.MODE.PLAY
      && !!window.CINDERLINE.game.director.state.quests.get('arrival')));
  check('C. the rescued copy outlives the new game that follows',
    await page.evaluate(() => !!localStorage.getItem('cinderline.save.rescued')));
  await page.evaluate(() => window.CINDERLINE.game.emit('ui:quit'));
  await page.waitForFunction(
    () => window.CINDERLINE.game.mode === window.CINDERLINE.MODE.TITLE, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const backAtTitle = await titleFacts(page);
  check('C. and the old warning is gone once it is no longer true',
    backAtTitle.warning === '', backAtTitle.warning);
  await ctx.close();
}

// --- case D: no save at all --------------------------------------------------
{
  const { ctx, page } = await boot(null);
  const title = await titleFacts(page);
  check('D. a first-time player is offered no CONTINUE', !title.continueShown);
  check('D. and is not warned about a save they never had', title.warning === '', title.warning);
  await ctx.close();
}

// --- case E: current-version save/load regression ----------------------------
// The migration work must not have broken the ordinary path: play, save, come
// back, continue, and find the same game.
{
  const { ctx, page } = await boot(null);
  await tapTitle(page, 'new');
  await page.waitForFunction(
    () => window.CINDERLINE.game.mode === window.CINDERLINE.MODE.PLAY, null, { timeout: 30000 });
  const written = await page.evaluate(async (k) => {
    const G = window.CINDERLINE.game;
    const S = G.state;
    S.set('regression_flag');
    S.unlock('rigVent');
    S.give('bandage', 3);
    S.addJournal('regression_note', 'Regression note', 'Written by the save gate.');
    for (let i = 0; i < 120; i++) G.fixedUpdate(1 / 60);
    const ok = G.director.save(true);
    return { ok, raw: localStorage.getItem(k) };
  }, SAVE_KEY);
  check('E. a normal save is written', written.ok && !!written.raw);
  const beforeReload = await liveState(page);
  await ctx.close();

  const second = await boot(written.raw);
  const title = await titleFacts(second.page);
  check('E. the returning player is offered CONTINUE', title.continueShown);
  check('E. with no warning', title.warning === '', title.warning);
  await tapTitle(second.page, 'continue');
  await second.page.waitForFunction(
    () => window.CINDERLINE.game.mode === window.CINDERLINE.MODE.PLAY, null, { timeout: 30000 });
  const afterReload = await liveState(second.page);
  check('E. the game comes back exactly as it was saved',
    JSON.stringify(beforeReload) === JSON.stringify(afterReload),
    JSON.stringify(beforeReload) === JSON.stringify(afterReload) ? '' :
      `before=${JSON.stringify(beforeReload).slice(0, 200)} after=${JSON.stringify(afterReload).slice(0, 200)}`);
  const notice = await second.page.evaluate(() =>
    [...document.querySelectorAll('.notice')].map((n) => n.textContent).join(' | '));
  check('E. a current save is not reported as migrated', !/updated from an older|更新しました/.test(notice), notice || '(none)');
  await second.ctx.close();
}

check('no page errors in any case', pageErrors.length === 0, pageErrors.slice(0, 5).join(' / '));

finish();
