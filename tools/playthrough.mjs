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
 *   node tools/playthrough.mjs --lang ja        the same game in Japanese
 *
 * `--lang` is not a cosmetic re-run. The whole localisation design rests on the
 * claim that no translated string ever reaches the game's logic, and the way to
 * find out is to play a complete game with every visible string swapped and see
 * whether the same quest triggers fire, the same conditions evaluate and the
 * same ending is chosen.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '../.kit/lib/browser/serve.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'shots');
mkdirSync(OUT, { recursive: true });

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const ONLY = arg('path', null);
const LANG = arg('lang', null);
const SHOTS = argv.includes('--shots');

const BASE = '/cinderline-test';
const site = await serveStatic({ root: DIST, basePath: BASE });

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

await page.goto(`${site.origin}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready === true', null, { timeout: 120000 });

// Language, if one was asked for — set through the same call the settings panel
// makes, before the driver touches anything.
if (LANG) {
  const got = await page.evaluate((code) => {
    const G = window.CINDERLINE.game;
    G.menus.settings.language = code;
    G.applySettings(G.menus.settings);
    G.emit('locale', code);
    return document.documentElement.getAttribute('data-lang');
  }, LANG);
  if (got !== LANG) {
    console.log(`FAIL  could not switch to ${LANG} (document is "${got}")`);
    process.exit(1);
  }
  console.log(`      language: ${got}`);
}

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

const report = { results, errors, lang: LANG || 'en', when: new Date().toISOString() };
writeFileSync(join(OUT, `playthrough${LANG ? '-' + LANG : ''}.json`), JSON.stringify(report, null, 2));

const failed = results.some((r) => r.errors.length || !r.reachedEnding) || errors.length > 0;
if (errors.length) { console.log('--- page errors ---'); console.log(errors.slice(0, 20).join('\n')); }
console.log(failed ? '\nPLAYTHROUGH FAILED' : '\nPLAYTHROUGH OK');

await browser.close();
await site.close();
process.exit(failed ? 1 : 0);
