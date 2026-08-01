#!/usr/bin/env node
/**
 * Post-boot fault recovery (audit H2).
 *
 * The page's own error handler stops listening the moment the bundle sets
 * `__cinderlineBooted`, and nothing in the repo listened for
 * `unhandledrejection` at all. The loop re-arms its rAF at the top of the
 * frame, so a throw inside a frame does not stop the loop — it repeats, and
 * what the player gets is a picture that has stopped changing, no message, no
 * save and no way out.
 *
 * This drives real faults into a real production build and reads the answer
 * off the screen: was the game saved, was the player told, and did a fault the
 * game could not survive reach the recovery panel — without putting that panel
 * in front of a player whose game is still running.
 *
 *   node tools/fault_recovery.mjs
 *   node tools/fault_recovery.mjs --force-failure   prove the runner can fail
 *   node tools/fault_recovery.mjs --headed
 *
 * Requires a build in dist/ (npm run test:faults builds first).
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UI_JA } from '../src/content/locale/ja/ui.js';
import { SAVE_KEY, SAVE_VERSION } from '../src/game/state.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const EVIDENCE_DIR = join(ROOT, 'AI_DEVELOPMENT', 'EVIDENCE');
const FORCE_FAILURE = process.argv.includes('--force-failure');
const W = 667, H = 375;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
};
const BASE = '/cinderline-test';
const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (!p.startsWith(BASE)) { res.writeHead(404); res.end('outside base'); return; }
  p = p.slice(BASE.length) || '/';
  if (p.endsWith('/')) p += 'index.html';
  const file = join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, ''));
  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, r));
const URL_ = `http://127.0.0.1:${server.address().port}${BASE}/index.html`;

const browser = await chromium.launch({
  headless: !process.argv.includes('--headed'),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--disable-gpu-sandbox', '--no-sandbox', '--enable-webgl', '--ignore-gpu-blocklist'],
});

const checks = [];
/**
 * Report and record on the way out, however this ends.
 *
 * A Playwright timeout in the middle of case 5 used to kill the process before
 * a single check line was printed and before the evidence was written — which
 * left the PREVIOUS run's `passed: true` artifact on disk, describing a build
 * that no longer had an error handler in it. A gate that cannot report its own
 * failure is not a gate.
 */
let crashed = null;
const finish = () => {
  if (crashed) checks.push({ name: 'the run completed', pass: false, detail: crashed });
  if (FORCE_FAILURE) checks.push({ name: 'forced failure', pass: false, detail: '--force-failure was passed' });
  const failed = checks.filter((c) => !c.pass);
  for (const c of checks) console.log(`  ${c.pass ? 'ok  ' : 'FAIL'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  try {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(join(EVIDENCE_DIR, 'GB-H2-FAULT-RECOVERY.json'), JSON.stringify({
      task: 'GB-H2',
      scope: 'Post-boot uncaught errors and rejected promises, in a production build at 667x375. ' +
        'Not a claim about any specific real-world crash, and not a device measurement.',
      viewport: { width: W, height: H },
      crashed,
      checks,
      passed: failed.length === 0,
    }, null, 2));
  } catch (e) { console.error('could not write the evidence:', e.message); }
  console.log(`\n${failed.length ? 'FAULT RECOVERY FAILED' : 'FAULT RECOVERY OK'} — ` +
    `${checks.length - failed.length}/${checks.length} checks`);
  process.exit(failed.length ? 1 : 0);
};
process.on('uncaughtException', (e) => { crashed = String(e && e.stack || e); finish(); });
process.on('unhandledRejection', (e) => { crashed = String(e && e.stack || e); finish(); });

const ok = (name, detail = '') => checks.push({ name, pass: true, detail });
const bad = (name, detail) => checks.push({ name, pass: false, detail });
const expect = (cond, name, detail = '') => (cond ? ok(name, detail) : bad(name, detail || 'expected true'));

/** A booted page, plus the faults the browser itself saw. */
async function open({ locale = null } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    ...(locale ? { locale } : {}),
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
      '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));
  await page.goto(URL_, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready === true', null, { timeout: 60000 });
  await page.waitForTimeout(600);
  return { ctx, page, pageErrors };
}

/** What the player can see right now. */
const surface = (page) => page.evaluate(() => {
  const panel = document.getElementById('ctxlost');
  return {
    panelOn: !!panel && panel.classList.contains('on'),
    panelTitle: panel ? (panel.querySelector('.k')?.textContent || '') : '',
    panelText: panel ? (panel.querySelector('.s')?.textContent || '') : '',
    reloadLabel: document.getElementById('ctxlost-reload')?.textContent || '',
    notices: [...document.querySelectorAll('.notice')].map((n) => n.textContent),
    faults: (window.CINDERLINE.faults || []).map((f) => ({ kind: f.kind, message: f.message })),
    frame: window.CINDERLINE.engine.frame,
    running: window.CINDERLINE.engine.running,
    lost: window.CINDERLINE.engine.lost,
    paused: window.CINDERLINE.engine.isPaused,
  };
});

const throwLater = (page, message) => page.evaluate((m) => {
  setTimeout(() => { throw new Error(m); }, 0);
}, message);

const rejectLater = (page, message) => page.evaluate((m) => {
  setTimeout(() => { Promise.reject(new Error(m)); }, 0);
}, message);

/**
 * Let time pass with the page actually doing something.
 *
 * A plain waitForTimeout is not the same environment a player is in: under
 * software GL the loop runs at a handful of frames a second, and Chromium
 * holds its unhandled-rejection notification until the page next has work to
 * do. Polling keeps the page busy the way a running game does, so what is
 * being measured is the game's handling and not the harness's idleness.
 */
const settle = async (page, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await page.evaluate(() => 0);
    await page.waitForTimeout(50);
  }
};

const waitForFaults = async (page, n, ms = 6000) => {
  try {
    await page.waitForFunction(
      (want) => (window.CINDERLINE.faults || []).length >= want, n, { timeout: ms, polling: 100 });
    return true;
  } catch { return false; }
};

// ---------------------------------------------------------------- 1. control
// Nothing injected. If this run shows a notice or a panel, every check below
// is meaningless.
{
  const { ctx, page, pageErrors } = await open();
  await settle(page, 2000);
  const s = await surface(page);
  expect(!s.panelOn, 'clean boot: the recovery panel stays hidden');
  expect(s.notices.length === 0, 'clean boot: no fault notice', JSON.stringify(s.notices));
  expect(s.faults.length === 0, 'clean boot: no faults recorded', JSON.stringify(s.faults));
  expect(pageErrors.length === 0, 'clean boot: the browser saw no uncaught errors', pageErrors.join(' | '));
  expect(s.running && s.frame > 0, 'clean boot: the loop is running', `frame ${s.frame}`);
  await ctx.close();
}

// ------------------------------------------------- 2. one survivable error
{
  const { ctx, page } = await open();
  const before = (await surface(page)).frame;
  await throwLater(page, 'probe: one-off sync error');
  await waitForFaults(page, 1);
  const s1 = await surface(page);
  expect(s1.faults.length === 1 && s1.faults[0].kind === 'error',
    'sync error: caught after boot', JSON.stringify(s1.faults));
  expect(!!s1.faults[0] && s1.faults[0].message.includes('one-off sync error'),
    'sync error: the message is carried, not swallowed', JSON.stringify(s1.faults));
  expect(s1.notices.length >= 1, 'sync error: the player is told');
  expect(!s1.panelOn, 'sync error: a survivable fault does not put a wall in front of the player');

  // The escalation timer is 1200ms; a live loop must still be playing after it.
  await settle(page, 2000);
  const s2 = await surface(page);
  expect(!s2.panelOn, 'sync error: still no panel once the stall check has run');
  expect(s2.frame > before, 'sync error: the loop kept advancing', `${before} -> ${s2.frame}`);
  await ctx.close();
}

// ------------------------------------------------- 3. rejected promise
{
  const { ctx, page } = await open();
  await rejectLater(page, 'probe: rejected promise');
  await waitForFaults(page, 1);
  const s = await surface(page);
  expect(s.faults.length === 1 && s.faults[0].kind === 'rejection',
    'rejection: caught after boot (nothing listened for this at all before)',
    JSON.stringify(s.faults));
  expect(!!s.faults[0] && s.faults[0].message.includes('rejected promise'),
    'rejection: the reason is carried', JSON.stringify(s.faults));
  expect(s.notices.length >= 1, 'rejection: the player is told');
  await ctx.close();
}

// ------------------------------------------------- 4. the save is written
{
  const { ctx, page } = await open();
  await page.evaluate(() => window.CINDERLINE.startNewGame());
  await page.waitForTimeout(1200);
  await page.evaluate((k) => localStorage.removeItem(k), SAVE_KEY);
  // Prove the periodic autosave is not about to write anyway, or "the fault
  // saved the game" is indistinguishable from a timer that happened to fire.
  await settle(page, 1200);
  expect(await page.evaluate((k) => localStorage.getItem(k) === null, SAVE_KEY),
    'in play: nothing else was about to write a save');
  await throwLater(page, 'probe: fault during play');
  await waitForFaults(page, 1);
  await settle(page, 400);
  const saved = await page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, SAVE_KEY);
  expect(!!saved && !!saved.state, 'in play: the game saved itself when the fault arrived');
  expect(!!saved && saved.v === SAVE_VERSION && saved.state.v === SAVE_VERSION,
    'in play: the save it wrote is at the current version',
    saved ? `envelope ${saved.v}, state ${saved.state.v}` : 'none');
  await ctx.close();
}

// ------------------------------------------------- 5. a repeating fault
{
  const { ctx, page } = await open();
  for (let i = 0; i < 3; i++) {
    await throwLater(page, 'probe: repeating fault');
    await settle(page, 150);
  }
  await waitForFaults(page, 3);
  await settle(page, 300);
  const s = await surface(page);
  expect(s.panelOn, 'repeat: a fault that keeps happening reaches the recovery panel',
    `${s.faults.length} faults, lost=${s.lost} paused=${s.paused} running=${s.running} frame=${s.frame}`);
  expect(s.panelTitle && s.panelTitle !== '' && !s.panelText.includes('graphics context'),
    'repeat: the panel says what actually happened, not context loss',
    `${s.panelTitle} / ${s.panelText.slice(0, 60)}`);
  expect(!!s.reloadLabel, 'repeat: the panel offers a way out', s.reloadLabel);

  // The way out has to work. A marker on the current document, not a
  // navigation event: the page under test is throwing, and waiting on the
  // navigation alone hid whether the NEW document actually came up.
  if (!s.panelOn) {
    bad('repeat: the panel is there to click', 'no panel, so the reload path was not exercised');
  } else {
  await page.evaluate(() => { window.__beforeReload = true; });
  await page.click('#ctxlost-reload');
  await page.waitForFunction(
    'window.__beforeReload === undefined && window.CINDERLINE && window.CINDERLINE.ready === true',
    null, { timeout: 90000, polling: 250 });
  const after = await surface(page);
  expect(!after.panelOn && after.faults.length === 0,
    'repeat: reloading actually recovers', JSON.stringify(after.faults));
  }
  await ctx.close();
}

// ------------------------------------------------- 6. a fault that stops the loop
{
  const { ctx, page } = await open();
  // A frozen loop with a live page is exactly the silent freeze H2 describes.
  await page.evaluate(() => { window.CINDERLINE.engine.stop(); });
  const firedAt = Date.now();
  await throwLater(page, 'probe: fault with a stopped loop');
  await waitForFaults(page, 1);
  const during = await surface(page);
  const elapsed = Date.now() - firedAt;
  // Only meaningful if we got here before the 1200ms escalation timer. On a
  // loaded host we do not, and saying "it waited" then would be measuring the
  // harness, so say so instead of passing.
  if (elapsed < 1000) {
    expect(!during.panelOn,
      'stall: the panel waits for the stall check rather than firing on sight', `${elapsed}ms`);
  } else {
    ok('stall: (not measured — the fault took longer to arrive than the escalation timer)',
      `${elapsed}ms`);
  }
  await settle(page, 1800);
  const s = await surface(page);
  expect(s.panelOn, 'stall: a fault after which the picture stopped reaches the recovery panel');
  await ctx.close();
}

// ------------------------------------------------- 6b. the real silent freeze
// A fixed-step updater that throws: the loop re-arms its rAF at the top of the
// frame and then dies before it can count the frame, forever. This is the
// shape of the failure H2 is about, driven through the engine's own updater
// chain rather than simulated.
{
  const { ctx, page } = await open();
  await page.evaluate(() => {
    window.CINDERLINE.engine.addUpdater(() => { throw new Error('probe: updater fault'); }, -999);
  });
  const frozenAt = (await surface(page)).frame;
  await waitForFaults(page, 1);
  await settle(page, 2000);
  const s = await surface(page);
  expect(s.frame === frozenAt, 'frozen loop: the frame counter really did stop',
    `${frozenAt} -> ${s.frame}`);
  expect(s.panelOn, 'frozen loop: the player is given the recovery panel instead of a still picture');
  await ctx.close();
}

// ------------------------------- 6c. an error the game's own bus swallows
// `emit` catches, so one listener cannot stop the others. That also meant a
// throw in the `render` listener stopped the picture — measured at zero GL
// draw calls — while the loop, the HUD and the clock carried on and nothing
// appeared on screen. Caught is not the same as handled.
{
  const { ctx, page } = await open();
  const drewBefore = await page.evaluate(() => {
    const gl = window.CINDERLINE.engine.renderer.getContext();
    window.__draws = 0;
    for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const real = gl[m] && gl[m].bind(gl);
      if (real) gl[m] = (...a) => { window.__draws++; return real(...a); };
    }
    return 0;
  });
  await settle(page, 1500);
  const drawsAlive = await page.evaluate(() => window.__draws);
  expect(drawsAlive > 0, 'swallowed: the picture is being drawn before the break',
    `${drawsAlive} draw calls`);

  await page.evaluate(() => {
    // The engine is what emits `render`; this is the listener the renderer
    // itself hangs off, and a throw here is what stopped the picture.
    window.CINDERLINE.engine.on('render', () => {
      throw new Error('probe: render listener fault');
    });
  });
  await page.evaluate(() => { window.__draws = 0; });
  await waitForFaults(page, 1);
  await settle(page, 2000);
  const s = await surface(page);
  const drawsAfter = await page.evaluate(() => window.__draws);
  expect(s.faults.some((f) => f.kind === 'listener'),
    'swallowed: an error the event bus caught still reaches the fault path',
    JSON.stringify(s.faults.slice(-2)));
  expect(s.panelOn || s.notices.length > 0,
    'swallowed: and the player is told rather than left with a still picture',
    `panel=${s.panelOn} notices=${s.notices.length} draws=${drawsAfter}`);
  await ctx.close();
  void drewBefore;
}

// ------------------------------------------------- 7. Japanese
{
  const { ctx, page } = await open({ locale: 'ja-JP' });
  for (let i = 0; i < 3; i++) {
    await throwLater(page, 'probe: repeating fault');
    await settle(page, 150);
  }
  await waitForFaults(page, 3);
  await settle(page, 300);
  const s = await surface(page);
  expect(s.panelOn, 'ja: the panel appears on a Japanese device');
  expect(s.panelOn && s.panelTitle === UI_JA.fault.title,
    'ja: the panel is in Japanese',
    `panel ${s.panelOn ? 'on' : 'OFF'}: "${s.panelTitle}" vs "${UI_JA.fault.title}"`);
  expect(/[ぁ-んァ-ヶ一-龠]/.test(s.notices.join('')), 'ja: the notice is in Japanese',
    JSON.stringify(s.notices));
  await ctx.close();
}

// ------------------------------------------------- 8. before the bundle boots
{
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true });
  const page = await ctx.newPage();
  // The bundle never arrives: the pre-boot handlers in index.html are all
  // there is, and a boot that dies inside a promise fires only the rejection.
  await page.route('**/cinderline*.js', (route) => route.abort());
  await page.goto(URL_, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { setTimeout(() => Promise.reject(new Error('probe: boot broke')), 0); });
  await settle(page, 800);
  const note = await page.evaluate(() => {
    const n = document.getElementById('boot-note');
    return { text: n?.textContent || '', cls: n?.className || '', booted: window.__cinderlineBooted };
  });
  expect(note.booted === false, 'pre-boot: the bundle really did not boot', String(note.booted));
  expect(note.text.includes('boot broke'),
    'pre-boot: a rejected promise reaches the loading plate', note.text);
  expect(note.cls.includes('err'), 'pre-boot: it reads as a failure', note.cls);
  await ctx.close();
}

finish();
