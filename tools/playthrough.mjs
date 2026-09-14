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
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
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
const TRANSCRIPT = argv.includes('--transcript');
const bundleFiles = TRANSCRIPT ? readdirSync(DIST).filter(name => /^cinderline\..+\.js$/.test(name)) : [];
if (TRANSCRIPT && bundleFiles.length !== 1) throw new Error('Expected one actual game bundle for transcript provenance');
const bundleSha256 = TRANSCRIPT ? createHash('sha256').update(readFileSync(join(DIST, bundleFiles[0]))).digest('hex') : null;

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

if (TRANSCRIPT) await page.evaluate(() => {
  const G = window.CINDERLINE.game;
  const events = window.__CLTranscript = [];
  const show = G.dialogueUI.show;
  G.dialogueUI.show = function (...args) {
    const result = show.apply(this, args);
    events.push({ kind: 'dialogue', speaker: this.who.textContent, text: this.full,
      choices: (args[1] || []).map(({text, locked, why, tag}) => ({text, locked: Boolean(locked), why, tag})) });
    return result;
  };
  const showEnding = G.menus.showEnding;
  G.menus.showEnding = function (...args) {
    const result = showEnding.apply(this, args);
    events.push({ kind: 'ending', title: this.endTitle.textContent,
      paragraphs: Array.from(this.endBody.children, node => node.textContent) });
    return result;
  };
});

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

// The in-page driver uses real story systems with the simulation shortcuts
// disclosed in each transcript; its ending flag precedes the final UI fade.
const DRIVER = readFileSync(join(ROOT, 'tools', 'driver.js'), 'utf8');
await page.evaluate(DRIVER);

const PATHS = ONLY ? [ONLY] : ['publish', 'cut', 'deal', 'evacuate', 'leave'];
const results = [];
const transcriptFailures = [];
for (const path of PATHS) {
  if (TRANSCRIPT) await page.evaluate(() => { window.__CLTranscript.length = 0; });
  const r = await page.evaluate((p) => window.__CLDriver.run(p), path);
  if (TRANSCRIPT) {
    const captureErrors = [];
    if (r.reachedEnding) {
      try {
        await page.waitForFunction(() => window.__CLTranscript.some(event => event.kind === 'ending'),
          null, { timeout: 30000 });
      } catch {
        captureErrors.push('Ending UI did not arrive after the recorded ending state');
      }
    }
    const events = await page.evaluate(() => window.__CLTranscript);
    if (!events.some(event => event.kind === 'dialogue' && event.text.trim())) captureErrors.push('No dialogue text captured');
    const endings = events.filter(event => event.kind === 'ending');
    if (endings.length !== 1 || !endings[0].title.trim()
      || !endings[0].paragraphs.some(text => text.trim())) captureErrors.push('Complete ending text not captured');
    const offered = events.filter(event => event.kind === 'dialogue' && event.choices.length).length;
    const selected = events.filter(event => event.kind === 'choice').length;
    if (offered !== selected) captureErrors.push(`Offered choice nodes ${offered} do not match selections ${selected}`);
    const executionSucceeded = Boolean(r.reachedEnding && r.errors.length === 0 && errors.length === 0);
    if (captureErrors.length) transcriptFailures.push({path, errors: captureErrors});
    const transcript = { path, language: LANG || 'en', events,
      execution: r,
      browserErrors: errors.slice(),
      executionSucceeded,
      captureErrors,
      captureSucceeded: executionSucceeded && captureErrors.length === 0,
      bundleSha256,
      scope: 'Actual production dialogue and ending UI method outputs from the existing deterministic story driver. The driver teleports, makes the player gas-immune and clears hostiles with forced damage. This establishes emitted text and story transitions, not ordinary-paced play, combat, movement, survival, rendering quality or a blind comparison.' };
    const json = `${JSON.stringify(transcript)}\n`;
    writeFileSync(join(OUT, `transcript-${LANG || 'en'}-${path}.json`), json);
    console.log(`[story-transcript] ${JSON.stringify({path, language: transcript.language,
      bytes: Buffer.byteLength(json), sha256: createHash('sha256').update(json).digest('hex')})}`);
    const data = Buffer.from(json).toString('base64');
    for (let offset = 0; offset < data.length; offset += 4000) {
      console.log(`[story-transcript-data] ${offset} ${data.slice(offset, offset + 4000)}`);
    }
  }
  results.push(r);
  const bad = r.errors.length || !r.reachedEnding;
  console.log(`${bad ? 'FAIL' : 'ok  '}  ${path.padEnd(9)} ` +
    `ch${r.chapter} quests=${r.questsDone}/${r.questsTotal} ending=${r.ending || '—'} ` +
    `steps=${r.steps} ${r.errors.length ? '\n      ' + r.errors.join('\n      ') : ''}`);
  if (SHOTS) await page.screenshot({ path: join(OUT, `pt-${path}.png`) });
}

const report = { results, errors, transcriptFailures, lang: LANG || 'en', when: new Date().toISOString() };
writeFileSync(join(OUT, `playthrough${LANG ? '-' + LANG : ''}.json`), JSON.stringify(report, null, 2));

const failed = results.some((r) => r.errors.length || !r.reachedEnding) || errors.length > 0 || transcriptFailures.length > 0;
for (const failure of transcriptFailures) console.error(`TRANSCRIPT FAILED ${failure.path}: ${failure.errors.join('; ')}`);
if (errors.length) { console.log('--- page errors ---'); console.log(errors.slice(0, 20).join('\n')); }
console.log(failed ? '\nPLAYTHROUGH FAILED' : '\nPLAYTHROUGH OK');

await browser.close();
await site.close();
process.exitCode = failed ? 1 : 0;
