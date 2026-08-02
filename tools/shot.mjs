#!/usr/bin/env node
/**
 * Screenshot / inspection harness.
 *
 * Boots the built game in headless Chromium with a WebGL-capable configuration,
 * drives it through the exposed window.CINDERLINE handle, and writes PNGs plus
 * a console/error report. This is the tool the critics look at — every visual
 * claim in this project is checked against real frames from a real run.
 *
 *   node tools/shot.mjs                       default sweep
 *   node tools/shot.mjs --w 667 --h 375       explicit viewport (SE 3 landscape)
 *   node tools/shot.mjs --script foo.mjs      run a custom in-page driver
 *   node tools/shot.mjs --locale ja-JP        boot as a Japanese device
 *   node tools/shot.mjs --q stage=settings    query string for the driver
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '../.kit/lib/browser/serve.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'shots');
mkdirSync(OUT, { recursive: true });

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf('--' + k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const has = (k) => argv.includes('--' + k);

const W = Number(arg('w', 667));
const H = Number(arg('h', 375));
const DPR = Number(arg('dpr', 2));
const WAIT = Number(arg('wait', 4000));
const TAG = arg('tag', 'shot');

// Serve from a subdirectory to prove subdirectory hosting works. The server is
// `.kit/lib/browser/serve.mjs` — this file, perf, playthrough and vantage each
// carried their own copy of it, differing only in which MIME types they had
// remembered to list.
const BASE = '/cinderline-test';
const site = await serveStatic({ root: DIST, basePath: BASE });
// `--q stage=settings` reaches the driver as location.search, which is how a
// single probe file covers several screens without one boot per screen.
const QUERY = arg('q', '');
const URL_ = `${site.origin}/index.html${QUERY ? `?${QUERY}` : ''}`;

const browser = await chromium.launch({
  args: [
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
  ],
});

// `--locale ja-JP` makes the context look like a Japanese device to
// navigator.languages, which is the only way to exercise first-run detection —
// every other route reaches Japanese by toggling a setting that, on a real
// first visit, does not exist yet.
const LOCALE = arg('locale', null);
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: DPR,
  isMobile: true,
  hasTouch: true,
  ...(LOCALE ? { locale: LOCALE } : {}),
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
});

const logs = [];
const errors = [];
const page = await ctx.newPage();
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));
page.on('requestfailed', (r) => errors.push(`REQUEST FAILED ${r.url()} :: ${r.failure()?.errorText}`));

await page.goto(URL_, { waitUntil: 'domcontentloaded' });

// Wait for the game handle, or surface the boot error text.
try {
  await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready !== false', null, { timeout: 45000 });
} catch (e) {
  const note = await page.evaluate(() => document.getElementById('boot-note')?.textContent || '(no note)');
  console.error('BOOT FAILED:', note);
  errors.push('boot timeout: ' + note);
}

await page.waitForTimeout(WAIT);

const custom = arg('script', null);
if (custom) {
  const src = readFileSync(join(ROOT, custom), 'utf8');
  const result = await page.evaluate(src);
  writeFileSync(join(OUT, `${TAG}-result.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

await page.screenshot({ path: join(OUT, `${TAG}-${W}x${H}.png`) });

const perf = await page.evaluate(() => {
  const C = window.CINDERLINE;
  return C && C.engine ? C.engine.perfSnapshot() : null;
});

console.log('--- perf ---');
console.log(JSON.stringify(perf, null, 2));
if (logs.length) { console.log('--- console ---'); console.log(logs.slice(0, 60).join('\n')); }
if (errors.length) { console.log('--- errors ---'); console.log(errors.join('\n')); }

writeFileSync(join(OUT, `${TAG}-report.json`), JSON.stringify({ perf, logs, errors, viewport: { W, H, DPR } }, null, 2));

await browser.close();
await site.close();
process.exit(errors.length ? 1 : 0);
