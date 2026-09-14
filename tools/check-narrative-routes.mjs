/** Source-known checks for six frozen English/Japanese dialogue revisions.
 * --browser additionally stages each exact node through the real bundled runner
 * and UI. Direct node selection is a diagnostic, not ordinary gameplay or a
 * blind comparison. No source, bundle, state authority or baseline is changed. */
import { strict as assert } from 'node:assert';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CANDIDATES, INPUTS, ORIGINAL_BUNDLE } from './prepare-narrative-product.mjs';

export const TARGETS = [
  {
    "conversation": "sol_first",
    "node": "vc_krajcik",
    "en": "dd13e9d321c6ee16f318535246ab8f51cab8c24bc3a6de131f3d337b7b759827",
    "ja": "c299b56521e8b78e31566edc43bcccf3107024d10b44b8480153577b749be84c"
  },
  {
    "conversation": "krajcik",
    "node": "k_choice",
    "en": "f3d579bfb46a8cea756dee7e0f0d9d07b0f675984962b58ec7675e11bfa78907",
    "ja": "0d7d76d037a2c1887fccee1983000de269875dd15c69763b52d29b477790fcb4"
  },
  {
    "conversation": "krajcik",
    "node": "k_refuse",
    "en": "920de0029707eb93a6904579bacda5dc53a3a500b209d5685fa183ad068b598b",
    "ja": "49cc1f17d6227d3bb337e88ae0c13f08d1e841c99a3cc6dc7c73510d000ed273"
  },
  {
    "conversation": "krajcik",
    "node": "ag_refused",
    "en": "1ee9da92fe1793e17c28c4afdb6078499ac4d241b86a36f2893654337c10eec7",
    "ja": "199f1f2f67f70b6641cf359ba57fbd3e9566a06cb4541312c37297d747897eb8"
  },
  {
    "conversation": "krajcik",
    "node": "k_accept",
    "en": "baf341c248e5a33883f357fccb556a44f47420cd2f5a5074309d0f6261dd0cc7",
    "ja": "f3ffd5b4861be5c3c03a8387b334b78fb60893d33d9c16fd2e0798508757fadd"
  },
  {
    "conversation": "krajcik",
    "node": "k_end",
    "en": "7ca84c8d497761cae7b5b1d212c5b163410b47784cb0d16a86ea09b8109b31ea",
    "ja": "e2234f2278ef2e41b1fcad2b8115998e5d1b4db32089c6dc31bfa24bebef1e90"
  }
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const displayText = (text, lang) => text.replace(/\n(?!\n)/g, lang === 'ja' ? '' : ' ').replace(/ {2,}/g, ' ').trim();

export async function verifySourceRoutes(root) {
  for (const [path, pin] of Object.entries(INPUTS)) {
    assert.equal(hash(readFileSync(join(root, path))), CANDIDATES[path]?.sha256 ?? pin, 'Unexpected candidate input: ' + path);
  }
  const { CONVERSATIONS } = await import(pathToFileURL(join(root, 'src/content/story.js')));
  const { setLocale, localiseNode, t, has } = await import(pathToFileURL(join(root, 'src/content/i18n.js')));
  const rows = [];
  for (const language of ['en', 'ja']) {
    setLocale(language);
    for (const target of TARGETS) {
      const node = { ...CONVERSATIONS[target.conversation].nodes[target.node], id: target.node };
      const key = `c.${target.conversation}.${target.node}.text`;
      assert.equal(hash(node.text), target.en, 'English source text pin: ' + key);
      if (language === 'ja') assert(has(key), 'Missing Japanese merged override: ' + key);
      const route = localiseNode(target.conversation, node, null);
      assert.equal(route.node.text, t(key, node.text), 'Runner translation route: ' + key);
      assert.equal(hash(route.node.text), target[language], 'Frozen localized text pin: ' + key);
      const { text: ignoredText, ...routeOther } = route.node;
      const { text: ignoredSource, ...sourceOther } = node;
      assert.deepEqual(routeOther, sourceOther, 'Translation changed node logic: ' + key);
      rows.push({ language, conversation: target.conversation, node: target.node,
        sourceSha256: hash(node.text), textSha256: hash(route.node.text),
        displaySha256: hash(displayText(route.node.text, language)),
        expectedDisplay: displayText(route.node.text, language) });
    }
  }
  setLocale('en');
  return rows;
}

async function verifyBrowser(root, output, rows, report) {
  const prepared = JSON.parse(readFileSync(join(root, 'test-results/narrative-product-build-r2/report.json')));
  assert.equal(prepared.status, 'prepared and content/root verified');
  assert.equal(prepared.baselineReproduced, true);
  assert.equal(prepared.baselineDistSha256, ORIGINAL_BUNDLE);
  assert.equal(prepared.sourceCommit, execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim());
  const bundle = readFileSync(join(root, 'dist/cinderline.1.0.0.js'));
  report.bundleSha256 = hash(bundle);
  assert.equal(report.bundleSha256, prepared.candidateBundleSha256);
  assert.notEqual(report.bundleSha256, ORIGINAL_BUNDLE);
  assert.equal(report.bundleSha256, hash(readFileSync(join(root, 'cinderline.1.0.0.js'))));
  report.sourceCommit = prepared.sourceCommit;
  report.runId = process.env.GITHUB_RUN_ID || null;
  report.runAttempt = process.env.GITHUB_RUN_ATTEMPT || null;
  const { chromium } = await import('playwright');
  const { serveStatic } = await import(pathToFileURL(join(root, '.kit/lib/browser/serve.mjs')));
  const site = await serveStatic({ root: join(root, 'dist'), basePath: '/narrative-route' });
  let browser;
  try {
    report.browserAttempted = true;
    browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-sandbox', '--disable-gpu-sandbox', '--ignore-gpu-blocklist'] });
    report.browserExecuted = true;
    report.browserVersion = browser.version();
    report.browser = 'Chromium mobile emulation, not Mobile Safari';
    report.viewport = { width: 667, height: 375 };
    report.contextOptions = { viewport: report.viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
    for (const row of rows) {
      const context = await browser.newContext(report.contextOptions);
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        const [response] = await Promise.all([
          page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/cinderline.1.0.0.js')),
          page.goto(`${site.origin}/index.html`, { waitUntil: 'domcontentloaded' }),
        ]);
        assert.equal(response.status(), 200);
        assert.equal(hash(await response.body()), report.bundleSha256, 'Served runtime bytes differ');
        await page.waitForFunction(() => window.CINDERLINE?.ready && window.CINDERLINE?.game, null, { timeout: 120000 });
        await page.evaluate(async () => { await window.CINDERLINE.startNewGame(); });
        const selected = await page.evaluate(({ language, conversation, node }) => {
          const G = window.CINDERLINE.game;
          G.menus.settings.language = language;
          G.applySettings(G.menus.settings);
          G.emit('locale', language);
          const D = G.director;
          D.startConversation(D.conversations[conversation], null);
          D.dialogue.goto(node);
          return { language: document.documentElement.getAttribute('data-lang'),
            conversation: D.dialogue.convo.id, node: D.dialogue.node.id, englishText: D.dialogue.node.text };
        }, row);
        // Let the actual update/render path finish; the tap handler renders its
        // final frame before clearing typing and can leave a caret in the DOM.
        await page.waitForFunction(({ conversation, node }) => {
          const G = window.CINDERLINE.game;
          return G.director.dialogue.convo?.id === conversation
            && G.director.dialogue.node?.id === node && G.dialogueUI.typing === false;
        }, row, { timeout: 90000 });
        const rendered = { ...selected, ...await page.evaluate(() => {
          const ui = window.CINDERLINE.game.dialogueUI;
          return { full: ui.full, domText: ui.txt.textContent,
            choices: [...ui.choicesNode.children].map(n => n.textContent) };
        }) };
        assert.equal(rendered.language, row.language);
        assert.equal(rendered.conversation, row.conversation);
        assert.equal(rendered.node, row.node);
        assert.equal(hash(rendered.englishText), row.sourceSha256, 'Bundled source differs');
        assert.equal(rendered.full, row.expectedDisplay, 'Bundled locale/UI text differs');
        assert.equal(rendered.domText, row.expectedDisplay, 'Rendered DOM text differs');
        assert(await page.locator('#dlg.on .dlg-txt').isVisible(), 'Dialogue is not visible');
        const actualViewport = { viewport: page.viewportSize(), ...await page.evaluate(() => ({
          innerWidth, innerHeight, devicePixelRatio, maxTouchPoints: navigator.maxTouchPoints,
        })) };
        assert.deepEqual(actualViewport.viewport, report.viewport, 'Browser viewport differs');
        assert.equal(actualViewport.innerWidth, report.viewport.width);
        assert.equal(actualViewport.innerHeight, report.viewport.height);
        assert.equal(actualViewport.devicePixelRatio, report.contextOptions.deviceScaleFactor);
        assert(actualViewport.maxTouchPoints > 0, 'Touch emulation is absent');
        const file = `${row.language}-${row.conversation}-${row.node}.png`;
        const png = await page.screenshot({ path: join(output, file), fullPage: false });
        report.screens.push({ language: row.language, conversation: row.conversation, node: row.node,
          file, bytes: png.length, sha256: hash(png), renderedSha256: hash(rendered.domText),
          choices: rendered.choices, viewport: actualViewport, browserErrors: errors });
        assert.deepEqual(errors, [], 'Browser errors');
      } finally { await context.close(); }
    }
  } finally { if (browser) await browser.close(); await site.close(); }
}

/** Export original PNG and report bytes, including a clearly failed/partial
 * diagnostic. Complete means each file is complete, not that the diagnostic
 * passed. The receiver must independently match the actual run/commit, frozen
 * source pins, prepared bundle and all contiguous chunks/end records. */
export function exportRouteArtifacts(root, emit = line => console.log(line), environment = process.env) {
  const output = join(root, 'test-results/narrative-route-r2');
  const reportBytes = readFileSync(join(output, 'report.json'));
  const report = JSON.parse(reportBytes);
  assert(['passed', 'failed'].includes(report.status), 'Route report is not final');
  for (const key of ['browserRequested', 'browserAttempted', 'browserExecuted']) assert.equal(typeof report[key], 'boolean', 'Missing browser lifecycle field');
  assert(!report.browserExecuted || report.browserAttempted, 'Executed browser without a launch attempt');
  assert(!report.browserAttempted || report.browserRequested, 'Browser attempt without a request');
  assert(Array.isArray(report.screens) && report.screens.length <= 12, 'Unexpected screen count');
  assert(Array.isArray(report.sourceRoutes) && [0, 12].includes(report.sourceRoutes.length), 'Unexpected source route count');
  const expected = ['en', 'ja'].flatMap(language => TARGETS.map(({ conversation, node }) => ({
    language, conversation, node, file: `${language}-${conversation}-${node}.png`,
  })));
  if (report.status === 'passed' || report.browserExecuted) assert.equal(report.sourceRoutes.length, 12, 'Incomplete source route set');
  if (report.sourceRoutes.length) {
    for (let i = 0; i < 12; i++) {
      const row = report.sourceRoutes[i], route = expected[i], pin = TARGETS[i % 6];
      for (const key of ['language', 'conversation', 'node']) assert.equal(row[key], route[key]);
      assert.equal(row.sourceSha256, pin.en);
      assert.equal(row.textSha256, pin[route.language]);
    }
  }
  const files = [];
  for (let i = 0; i < report.screens.length; i++) {
    const screen = report.screens[i], target = expected[i];
    for (const key of ['language', 'conversation', 'node', 'file']) assert.equal(screen[key], target[key], 'Unexpected screen route or path');
    const bytes = readFileSync(join(output, screen.file));
    assert.equal(bytes.length, screen.bytes, 'Screen length changed');
    assert.equal(hash(bytes), screen.sha256, 'Screen bytes changed');
    assert(bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'Screen is not an original PNG');
    assert.equal(bytes.toString('ascii', 12, 16), 'IHDR');
    assert.equal(bytes.readUInt32BE(16), 667, 'Unexpected PNG width');
    assert.equal(bytes.readUInt32BE(20), 375, 'Unexpected PNG height');
    files.push({ path: screen.file, bytes });
  }
  if (report.screens.length) {
    assert.equal(report.browserRequested, true);
    assert.equal(report.browserAttempted, true);
    assert.equal(report.browserExecuted, true, 'Screens without executed browser');
    assert(/^[a-f0-9]{64}$/.test(report.bundleSha256 || ''), 'Missing bundle pin');
    assert(/^[a-f0-9]{40}$/.test(report.sourceCommit || ''), 'Missing source commit');
    assert(/^[1-9][0-9]*$/.test(report.runId || '') && /^[1-9][0-9]*$/.test(report.runAttempt || ''), 'Missing actual run provenance');
    assert.equal(report.sourceCommit, execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), 'Report belongs to another checkout');
    assert.equal(String(report.runId), environment.GITHUB_RUN_ID, 'Report belongs to another workflow run');
    assert.equal(String(report.runAttempt), environment.GITHUB_RUN_ATTEMPT, 'Report belongs to another workflow attempt');
    assert.equal(report.sourceCommit, environment.GITHUB_SHA, 'Report does not match actual workflow commit');
  }
  if (report.status === 'passed' && report.browserRequested) {
    assert.equal(report.browserExecuted, true);
    assert.equal(report.sourceRoutes.length, 12);
    assert.equal(report.screens.length, 12, 'Incomplete successful browser diagnostic');
  }
  files.push({ path: 'report.json', bytes: reportBytes });
  for (const file of files) assert(file.bytes.length <= 4 * 1024 * 1024, 'Per-file export cap exceeded');
  assert(files.reduce((sum, file) => sum + file.bytes.length, 0) <= 32 * 1024 * 1024, 'Total export cap exceeded');
  // All files are verified before any bytes are emitted. No PNG decoding,
  // re-encoding, cropping, scaling or screenshot replacement occurs here.
  for (const { path, bytes } of files) {
    const metadata = { file: path, bytes: bytes.length, sha256: hash(bytes),
      commit: report.sourceCommit || null, runId: report.runId || null, runAttempt: report.runAttempt || null,
      bundleSha256: report.bundleSha256 || null, diagnosticStatus: report.status,
      screenCount: report.screens.length, complete: true };
    emit('[narrative-route-meta] ' + JSON.stringify(metadata));
    for (let offset = 0; offset < bytes.length; offset += 3000) emit('[narrative-route-chunk] ' + JSON.stringify({ file: path, offset, base64: bytes.subarray(offset, offset + 3000).toString('base64') }));
    emit('[narrative-route-end] ' + JSON.stringify(metadata));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootArg = process.argv.indexOf('--root');
  const root = rootArg >= 0 ? resolve(process.argv[rootArg + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
  if (process.argv.includes('--export')) {
    exportRouteArtifacts(root);
  } else {
  const output = join(root, 'test-results/narrative-route-r2'); mkdirSync(output, { recursive: true });
  const report = { status: 'started', sourceRoutes: [], screens: [], browserRequested: process.argv.includes('--browser'), browserAttempted: false, browserExecuted: false,
    scope: 'Source-known finite locale and staged dialogue UI diagnostic. Direct node selection, fresh isolated context per node, natural typewriter completion through the real update/render path. No ordinary-play path, readability/visual-quality verdict, Mobile Safari claim, blind comparison or element verdict.' };
  try {
    const rows = await verifySourceRoutes(root);
    report.sourceRoutes = rows.map(({ expectedDisplay, ...row }) => row);
    if (process.argv.includes('--browser')) await verifyBrowser(root, output, rows, report);
    report.status = 'passed';
    console.log(JSON.stringify({ status: report.status, sourceRoutes: report.sourceRoutes.length, screens: report.screens.length, bundleSha256: report.bundleSha256 || null }));
  } catch (error) { report.status = 'failed'; report.error = String(error); process.exitCode = 1; }
  finally { writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
  }
}
