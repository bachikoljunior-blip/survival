#!/usr/bin/env node
/**
 * Full playthrough harness.
 *
 * Boots the real build in a browser and drives an actual game from the title
 * screen to an ending, using the game's own systems — quests advance through
 * their real triggers, dialogue runs through the real runner, effects apply to
 * the real state, and the ending is chosen by the real condition evaluator.
 *
 * Every path is run: each of the chapter-2 vent choices, each Krajcik answer,
 * told/untold to Nessa, and each final option. Any uncaught error, missing
 * dialogue node, stalled quest or unreachable ending fails the run.
 *
 *   node tools/playthrough.mjs                  all paths
 *   node tools/playthrough.mjs --path publish   one path
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'shots');
mkdirSync(OUT, { recursive: true });

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const ONLY = arg('path', null);
const SHOTS = argv.includes('--shots');

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
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });

await page.goto(`http://127.0.0.1:${port}${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready === true', null, { timeout: 120000 });

// The in-page driver: it exercises the real systems, never fakes state.
const DRIVER = readFileSync(join(ROOT, 'tools', 'driver.js'), 'utf8');
await page.evaluate(DRIVER);

const PATHS = ONLY ? [ONLY] : ['publish', 'cut', 'deal', 'evacuate', 'leave'];
const results = [];
for (const path of PATHS) {
  const r = await page.evaluate((p) => window.__CLDriver.run(p), path);
  results.push(r);
  const bad = r.errors.length || !r.reachedEnding;
  console.log(`${bad ? 'FAIL' : 'ok  '}  ${path.padEnd(9)} ` +
    `ch${r.chapter} quests=${r.questsDone}/${r.questsTotal} ending=${r.ending || '—'} ` +
    `steps=${r.steps} ${r.errors.length ? '\n      ' + r.errors.join('\n      ') : ''}`);
  if (SHOTS) await page.screenshot({ path: join(OUT, `pt-${path}.png`) });
}

const report = { results, errors, when: new Date().toISOString() };
writeFileSync(join(OUT, 'playthrough.json'), JSON.stringify(report, null, 2));

const failed = results.some((r) => r.errors.length || !r.reachedEnding) || errors.length > 0;
if (errors.length) { console.log('--- page errors ---'); console.log(errors.slice(0, 20).join('\n')); }
console.log(failed ? '\nPLAYTHROUGH FAILED' : '\nPLAYTHROUGH OK');

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
