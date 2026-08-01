#!/usr/bin/env node
/**
 * Regenerate the version-1 save fixture.
 *
 * The fixture is not hand-written. It is produced by running the SHIPPED v1
 * save path — `src/game/state.js` as it stands at the commit that was
 * published to GitHub Pages — against a state built with that build's own
 * mutators, and reading back the raw string its `Storage.save()` wrote. That
 * is the only kind of old-version fixture worth testing a migration against:
 * one this project actually put in front of a player.
 *
 *   node tools/make_save_v1_fixture.mjs             regenerate from PUBLISHED_V1
 *   node tools/make_save_v1_fixture.mjs --check     fail if the fixture drifted
 *                                                   in anything but its clock
 *
 * The blob is not byte-stable across runs: `serialise()` stamps `Date.now()`.
 * Everything else is deterministic, and --check compares everything else.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURE = join(ROOT, 'tools', 'fixtures', 'save-v1.json');

/** The commit whose build is live on GitHub Pages. Saves in the wild are its. */
const PUBLISHED_V1 = 'cc96f3a6cd94e11d3c71342ed568816ed55a9e59';

const CHECK = process.argv.includes('--check');

// --- a localStorage the old module can write to ----------------------------
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

// --- load the published v1 module, untouched -------------------------------
const dir = mkdtempSync(join(tmpdir(), 'cinderline-v1-'));
mkdirSync(join(dir, 'src', 'game'), { recursive: true });
mkdirSync(join(dir, 'src', 'core'), { recursive: true });
for (const rel of ['src/game/state.js', 'src/core/util.js']) {
  const source = execFileSync('git', ['show', `${PUBLISHED_V1}:${rel}`], { cwd: ROOT });
  writeFileSync(join(dir, rel), source);
}
const v1 = await import(pathToFileURL(join(dir, 'src', 'game', 'state.js')).href);

if (v1.SAVE_VERSION !== 1) {
  console.error(`FIXTURE ERROR: ${PUBLISHED_V1} is not a version-1 build (v=${v1.SAVE_VERSION})`);
  process.exit(1);
}

// --- a playthrough's worth of state, through the old build's own mutators ---
const S = new v1.GameState();
S.set('metRen');
S.set('sawFirstBorehole');
S.bump('metersRead');
S.bump('metersRead');
S.bump('crisis_lost');
S.give('filter', 2);
S.give('salvage', 5);
S.unlock('readAir');
S.unlock('rigVent');
S.record('cellarRow.door', 'forced');
S.addJournal('badair', 'What the meter says', 'Ninety at the step. Four hundred at the floor.');
S.adjustTrust('teo', 2, 'kept her word');
S.quests.set('arrival', { state: 'active', step: 3, data: { warned: true } });
S.quests.set('cellarRow', { state: 'done', step: 5, data: {} });
S.discover('stacks_roofline');
S.chapter = 2;
S.playTime = 1893.25;
S.deaths = 1;
S.kills = 4;
S.filtersUsed = 1;
S.metersRead = 2;
S.parries = 3;
S.lastSpawn = 'stacks_yard';

// A player and the world envelope, in the exact shape director.save() passes.
const player = {
  pos: { x: -41.5, y: 6.25, z: 118.75 }, yaw: 1.9349,
  hp: 74.5, stamina: 88,
  lungs: { sat: 0.184, filter: 'filter', masked: true },
  lampOn: true, lampBattery: 0.62,
};
const extra = {
  interior: null,
  interiorPpm: null,
  npcState: ['teodor', 'nessa'],
  npcPos: [['teodor', -38.5, 6.2, 121, 0.75, false, false]],
  takenIds: ['stacks_filter_crate'],
  disabledIds: [],
  gasSources: [['stacks_vent', true]],
  gasIntensity: 1,
  crisis: null,
};

if (!v1.Storage.save(S, player, extra)) {
  console.error('FIXTURE ERROR: the v1 save path refused to write');
  process.exit(1);
}
const raw = store.get(v1.SAVE_KEY);
if (!raw) {
  console.error(`FIXTURE ERROR: nothing was written to ${v1.SAVE_KEY}`);
  process.exit(1);
}
// Prove the fixture is loadable BY THE BUILD THAT WROTE IT before shipping it
// as the thing a migration has to accept.
if (!v1.Storage.load()) {
  console.error('FIXTURE ERROR: the v1 build cannot read its own save');
  process.exit(1);
}

const clockless = (text) => {
  const o = JSON.parse(text);
  if (o && o.state) delete o.state.t;
  return JSON.stringify(o);
};

if (CHECK) {
  if (!existsSync(FIXTURE)) {
    console.error(`FIXTURE MISSING: ${FIXTURE}`);
    process.exit(1);
  }
  const onDisk = readFileSync(FIXTURE, 'utf8');
  if (clockless(onDisk) !== clockless(raw)) {
    console.error('FIXTURE DRIFT: the checked-in v1 fixture no longer matches what ' +
      `${PUBLISHED_V1.slice(0, 7)} produces. Regenerate it deliberately, not by accident.`);
    process.exit(1);
  }
  console.log(`FIXTURE OK — matches ${PUBLISHED_V1.slice(0, 7)} (clock field excluded)`);
  process.exit(0);
}

mkdirSync(dirname(FIXTURE), { recursive: true });
writeFileSync(FIXTURE, raw);
console.log(`wrote ${FIXTURE} (${raw.length} bytes) from ${PUBLISHED_V1.slice(0, 7)}`);
