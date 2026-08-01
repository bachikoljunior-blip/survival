#!/usr/bin/env node
/**
 * Capture a legacy save fixture from a real build.
 *
 * This is not a test. It boots the real game, starts a real new game, puts a
 * distinctive but ordinary amount of progress into the real state object,
 * calls the real `Director.save()` and freezes whatever the shipped code wrote
 * to localStorage. The result is a migration fixture: an old save produced by
 * old code, not a hand-authored guess at what old code used to write.
 *
 * IMPORTANT — reproducing `save-v1.json`:
 *
 *   git checkout 193f408 -- src/ && node build.mjs --dev
 *   node tools/fixtures/capture_legacy_save.mjs --out tools/fixtures/save-v1.json
 *
 * Run against a later revision it captures whatever SAVE_VERSION that revision
 * writes, which is the point — the next format change captures its own "old"
 * fixture the same way, before the change lands. A fixture captured after the
 * change is worthless, because the code that produced it is the code under
 * test.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const DIST = join(ROOT, 'dist');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = join(ROOT, arg('out', 'tools/fixtures/save-legacy.json'));

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
const ctx = await browser.newContext({
  viewport: { width: 667, height: 375 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e && e.stack || e)));
await page.goto(`http://127.0.0.1:${port}${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready === true', null, { timeout: 120000 });

const captured = await page.evaluate(async () => {
  const C = window.CINDERLINE;
  const G = C.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // A real new game: real reset, real spawn, real quest starts.
  await C.startNewGame();
  await sleep(400);
  for (let i = 0; i < 240; i++) G.fixedUpdate(1 / 60);

  // Progress. A fixture with an empty state proves nothing about migrating a
  // populated one, so the save carries a capability, a counter, an inventory
  // entry, a journal note and a trust value.
  const S = G.state;
  S.set('fixture_legacy_save');
  S.unlock('readAir');
  S.bump('metersRead');
  S.bump('metersRead');
  S.give('filter', 2);
  S.addJournal('fixture_note', 'Fixture note', 'Written by the legacy save capture.');
  if (S.trust && S.trust.set) S.trust.set('marsh', 2);
  S.chapter = 1;
  await sleep(80);

  // The real save path, not a hand-built blob.
  const ok = G.director.save(true);
  const raw = localStorage.getItem('cinderline.save.v1');
  return { ok, raw, build: C.build || null };
});

if (!captured.ok || !captured.raw) {
  console.log('FAIL  the game did not write a save');
  await browser.close(); server.close(); process.exit(1);
}
if (errors.length) {
  console.log('FAIL  page errors during capture:\n' + errors.join('\n'));
  await browser.close(); server.close(); process.exit(1);
}

const payload = JSON.parse(captured.raw);
let rev = 'unknown';
try { rev = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch { /* not a repo */ }

const fixture = {
  _provenance: {
    what: 'A real save written by the real game, frozen as a migration fixture.',
    captured_by: 'tools/fixtures/capture_legacy_save.mjs',
    source_revision: rev,
    build_id: captured.build,
    save_version: (payload.state && payload.state.v) ?? null,
    note: 'Do not hand-edit. To reproduce, check out source_revision, build, and re-run the capture script.',
  },
  payload,
};
writeFileSync(OUT, JSON.stringify(fixture, null, 2) + '\n');
console.log(`ok    captured save v${fixture._provenance.save_version} from ${rev.slice(0, 7)} -> ${OUT}`);

await browser.close();
server.close();
process.exit(0);
