/** Source-known checks for the two frozen Iris journal duration strings.
 * --browser stages the real conversation effect, then opens the existing menu
 * and journal. Direct node selection is a diagnostic, not ordinary gameplay or
 * a blind comparison. No source, bundle or clock implementation is changed. */
import { strict as assert } from 'node:assert';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CANDIDATES, INPUTS, ORIGINAL_BUNDLE } from './prepare-narrative-product.mjs';

export const TARGETS = [
  {
    "conversation": "iris_first",
    "node": "i_gives",
    "journal": "iris",
    "en": "9d1d608455774a7c55502ae12ad0104517a15836f537336438505bf09621e5a3",
    "ja": "0156cf93d0d49491939147b13457337ebbf26d1cf21f6f401525477356cf7a42"
  }
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const displayText = (text, lang) => text.replace(/\n/g, lang === 'ja' ? '' : ' ').replace(/ {2,}/g, ' ').trim();

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
      const journals = node.effects.filter(effect => effect.journal).map(effect => effect.journal);
      assert.equal(journals.length, 1, 'Unexpected authored journal effect count');
      const [journal, title, text] = journals[0];
      assert.equal(journal, target.journal);
      assert.equal(hash(text), target.en, 'Frozen English journal source pin');
      const key = 'journal.' + journal + '.text';
      if (language === 'ja') assert(has(key), 'Missing Japanese journal translation');
      const route = localiseNode(target.conversation, node, null);
      assert.deepEqual(route.node.effects, node.effects, 'Localization changed authored effects');
      const translated = t(key, text);
      assert.equal(hash(translated), target[language], 'Frozen localized journal pin');
      rows.push({ language, conversation: target.conversation, node: target.node, journal,
        sourceSha256: hash(text), textSha256: hash(translated),
        displaySha256: hash(displayText(translated, language)),
        expectedTitle: t('journal.' + journal + '.title', title),
        expectedDisplay: displayText(translated, language) });
    }
  }
  setLocale('en');
  return rows;
}

async function verifyBrowser(root, output, rows, report) {
  const prepared = JSON.parse(readFileSync(join(root, 'test-results/journal-product-build-r1/report.json')));
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
        const selected = await page.evaluate(({ language, conversation, node, journal }) => {
          const G = window.CINDERLINE.game;
          G.menus.settings.language = language;
          G.applySettings(G.menus.settings);
          G.emit('locale', language);
          const before = G.state.journal.filter(entry => entry.id === journal).length;
          if (before !== 0) throw Error('Journal entry already exists in fresh context');
          const D = G.director;
          D.startConversation(D.conversations[conversation], null);
          D.dialogue.goto(node); // Real authored effects call State.addJournal.
          const active = { conversation: D.dialogue.convo.id, node: D.dialogue.node.id };
          const entries = G.state.journal.filter(entry => entry.id === journal);
          if (entries.length !== 1) throw Error('Authored effect did not create one journal entry');
          const stored = { ...entries[0] };
          D.dialogue.finish();
          G.emit('ui:menu'); // Existing mode transition; no clock override.
          G.menus.showPanel('journal');
          return { language: document.documentElement.getAttribute('data-lang'), ...active,
            journalCountBefore: before, journalCountAfter: entries.length, stored };
        }, row);
        assert.equal(selected.language, row.language);
        assert.equal(selected.conversation, row.conversation);
        assert.equal(selected.node, row.node);
        assert.equal(selected.stored.id, row.journal);
        assert.equal(hash(selected.stored.text), row.sourceSha256, 'Bundled journal effect differs');
        // Scroll the existing journal entry into view; retain the original full
        // viewport PNG, menu layout, text, font sizes and product update path.
        const rendered = await page.evaluate(async ({ expectedTitle }) => {
          const G = window.CINDERLINE.game, menus = G.menus, panel = menus.journalPanel;
          if (G.mode !== 'menu' || !menus.pauseOpen || menus.activePanel !== 'journal') throw Error('Journal menu is not open');
          const blocks = [...panel.children].filter(element => element.children.length === 2
            && element.firstElementChild.textContent === expectedTitle);
          if (blocks.length !== 1) throw Error('Journal entry title is missing or duplicated');
          const block = blocks[0], body = block.lastElementChild;
          block.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const rect = element => { const r = element.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, top:r.top, right:r.right, bottom:r.bottom, left:r.left }; };
          const b = body.getBoundingClientRect();
          const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          return { title: block.firstElementChild.textContent, domText: body.textContent,
            blockRect: rect(block), bodyRect: rect(body), panelRect: rect(panel),
            panelClient: { width: panel.clientWidth, height: panel.clientHeight },
            panelScroll: { left: panel.scrollLeft, top: panel.scrollTop, width: panel.scrollWidth, height: panel.scrollHeight },
            visible: getComputedStyle(panel).display !== 'none' && getComputedStyle(body).visibility === 'visible',
            centerHit: hit === body || body.contains(hit)
              || (hit === panel && getComputedStyle(body).pointerEvents === 'none'
                && getComputedStyle(panel).pointerEvents === 'auto'),
            hitElement: hit ? { tag: hit.tagName, id: hit.id, className: hit.className } : null,
            hitIsPanel: hit === panel,
            pointerEvents: { body: getComputedStyle(body).pointerEvents, panel: getComputedStyle(panel).pointerEvents },
            whiteSpace: getComputedStyle(body).whiteSpace, fontStyle: getComputedStyle(body).fontStyle,
            dialogueVisible: G.dialogueUI.node.classList.contains('on') };
        }, row);
        // Preserve actual layout and original PNG even if a visual assertion fails.
        const actualViewport = { viewport: page.viewportSize(), ...await page.evaluate(() => ({
          innerWidth, innerHeight, devicePixelRatio, maxTouchPoints: navigator.maxTouchPoints,
        })) };
        const file = `${row.language}-${row.conversation}-${row.node}.png`;
        const png = await page.screenshot({ path: join(output, file), fullPage: false });
        report.screens.push({ language: row.language, conversation: row.conversation, node: row.node,
          file, bytes: png.length, sha256: hash(png), renderedSha256: hash(rendered.domText),
          journal: row.journal, storedSha256: hash(selected.stored.text),
          journalCountBefore: selected.journalCountBefore, journalCountAfter: selected.journalCountAfter,
          journalLayout: rendered, viewport: actualViewport, browserErrors: errors });
        assert.equal(rendered.title, row.expectedTitle, 'Bundled journal title differs');
        assert.equal(rendered.domText, row.expectedDisplay, 'Rendered journal text differs');
        assert.equal(rendered.visible, true, 'Journal is not visible');
        assert.equal(rendered.centerHit, true, 'Journal pointer hit is outside its text or owning scroller');
        assert.equal(rendered.dialogueVisible, false, 'Dialogue still overlays the journal');
        const block = rendered.blockRect, panel = rendered.panelRect;
        assert(block.width > 0 && block.height > 0, 'Journal has no layout');
        assert(block.left >= Math.max(0, panel.left) - 1 && block.right <= Math.min(667, panel.right) + 1
          && block.top >= Math.max(0, panel.top) - 1 && block.bottom <= Math.min(375, panel.bottom) + 1,
          'Journal title/body is clipped by panel or viewport');
        assert(rendered.panelScroll.width <= rendered.panelClient.width + 1, 'Journal panel overflows horizontally');
        assert.deepEqual(actualViewport.viewport, report.viewport, 'Browser viewport differs');
        assert.equal(actualViewport.innerWidth, report.viewport.width);
        assert.equal(actualViewport.innerHeight, report.viewport.height);
        assert.equal(actualViewport.devicePixelRatio, report.contextOptions.deviceScaleFactor);
        assert(actualViewport.maxTouchPoints > 0, 'Touch emulation is absent');
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
  const output = join(root, 'test-results/journal-route-r1');
  const reportBytes = readFileSync(join(output, 'report.json'));
  const report = JSON.parse(reportBytes);
  assert(['passed', 'failed'].includes(report.status), 'Route report is not final');
  for (const key of ['browserRequested', 'browserAttempted', 'browserExecuted']) assert.equal(typeof report[key], 'boolean', 'Missing browser lifecycle field');
  assert(!report.browserExecuted || report.browserAttempted, 'Executed browser without a launch attempt');
  assert(!report.browserAttempted || report.browserRequested, 'Browser attempt without a request');
  assert(Array.isArray(report.screens) && report.screens.length <= 2, 'Unexpected screen count');
  assert(Array.isArray(report.sourceRoutes) && [0, 2].includes(report.sourceRoutes.length), 'Unexpected source route count');
  const expected = ['en', 'ja'].flatMap(language => TARGETS.map(({ conversation, node }) => ({
    language, conversation, node, file: `${language}-${conversation}-${node}.png`,
  })));
  if (report.status === 'passed' || report.browserExecuted) assert.equal(report.sourceRoutes.length, 2, 'Incomplete source route set');
  if (report.sourceRoutes.length) {
    for (let i = 0; i < 2; i++) {
      const row = report.sourceRoutes[i], route = expected[i], pin = TARGETS[i % TARGETS.length];
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
    assert.equal(report.sourceRoutes.length, 2);
    assert.equal(report.screens.length, 2, 'Incomplete successful browser diagnostic');
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
  const output = join(root, 'test-results/journal-route-r1'); mkdirSync(output, { recursive: true });
  const report = { status: 'started', sourceRoutes: [], screens: [], browserRequested: process.argv.includes('--browser'), browserAttempted: false, browserExecuted: false,
    scope: 'Source-known finite locale and staged journal UI diagnostic. Direct i_gives node selection executes the real authored journal effect; a fresh isolated context per language opens the existing menu and scrolls the entry into view. No ordinary-play path, readability/visual-quality verdict, Mobile Safari claim, blind comparison or element verdict.' };
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
