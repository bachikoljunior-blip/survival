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
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SAVE_KEY, SAVE_VERSION, SAVE_STATUS, SAVE_MIGRATIONS, SAVE_LOADABLE,
  migrateSave, GameState,
} from '../src/game/state.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'shots');
const UNIT_ONLY = process.argv.includes('--unit');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  return !!ok;
};

const FIXTURE = JSON.parse(readFileSync(join(ROOT, 'tools/fixtures/save-v1.json'), 'utf8'));
const V1 = FIXTURE.payload;

console.log(`--- layer 1: the migration engine (this build reads v${SAVE_VERSION}) ---`);

check('the fixture really is an old save',
  FIXTURE._provenance.save_version === 1 && V1.state.v === 1 && V1.v === undefined,
  `captured from ${String(FIXTURE._provenance.source_revision).slice(0, 7)}`);
check('the fixture carries real progress',
  V1.state.flags.includes('fixture_legacy_save')
  && V1.state.capabilities.includes('readAir')
  && V1.state.quests.length > 0 && !!V1.player,
  `${V1.state.flags.length} flags, ${V1.state.quests.length} quests`);

// --- rejection cases. Every one of these must refuse, and must say why. ------
const rejects = [
  ['null is empty, not corrupt', null, SAVE_STATUS.EMPTY],
  ['undefined is empty', undefined, SAVE_STATUS.EMPTY],
  ['a string is corrupt', 'not a save', SAVE_STATUS.CORRUPT],
  ['a number is corrupt', 7, SAVE_STATUS.CORRUPT],
  ['an array is corrupt', [{ v: 1 }], SAVE_STATUS.CORRUPT],
  ['an object with no state is corrupt', { v: 1 }, SAVE_STATUS.CORRUPT],
  ['a non-object state is corrupt', { v: 1, state: 'x' }, SAVE_STATUS.CORRUPT],
  ['an unversioned save is unknown', { state: { flags: [] } }, SAVE_STATUS.UNKNOWN_VERSION],
  ['a non-integer version is unknown', { v: 1.5, state: { flags: [] } }, SAVE_STATUS.UNKNOWN_VERSION],
  ['version 0 is corrupt', { v: 0, state: {} }, SAVE_STATUS.CORRUPT],
  ['a negative version is corrupt', { v: -3, state: {} }, SAVE_STATUS.CORRUPT],
  ['a newer save is refused, not guessed at', { v: SAVE_VERSION + 1, state: { v: SAVE_VERSION + 1 } }, SAVE_STATUS.FUTURE],
  ['a far-future save is refused', { v: 9999, state: { v: 9999 } }, SAVE_STATUS.FUTURE],
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
  check('a migration that forgets to set the version is stamped anyway',
    forgetful.status === SAVE_STATUS.MIGRATED
    && forgetful.payload.v === 2 && forgetful.payload.state.v === 2,
    `v=${forgetful.payload && forgetful.payload.v}`);
  check('and its result does not migrate a second time',
    forgetful.payload && migrateSave(forgetful.payload).status === SAVE_STATUS.OK);

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

if (UNIT_ONLY) {
  const failed = results.filter((r) => !r.ok);
  console.log(failed.length ? `\nSAVE MIGRATION FAILED (${failed.length})` : '\nSAVE MIGRATION OK (unit layer only)');
  process.exit(failed.length ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Layer 2: the game
// ---------------------------------------------------------------------------
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
  // The game still has to be playable.
  await tapTitle(page, 'new');
  await page.waitForFunction(
    () => window.CINDERLINE.game.mode === window.CINDERLINE.MODE.PLAY, null, { timeout: 30000 });
  check('C. a new game still starts', true);
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

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
writeFileSync(join(OUT, 'save-migration.json'), JSON.stringify({
  save_version: SAVE_VERSION,
  fixture: FIXTURE._provenance,
  results, page_errors: pageErrors, when: new Date().toISOString(),
}, null, 2));
console.log(failed.length
  ? `\nSAVE MIGRATION FAILED (${failed.length} of ${results.length})`
  : `\nSAVE MIGRATION OK (${results.length} checks)`);
process.exit(failed.length ? 1 : 0);
