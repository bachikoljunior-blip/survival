#!/usr/bin/env node
/**
 * F6 gate — is the public surface actually serving the revision we intended?
 *
 * A deployment job reporting success is not evidence. Neither is the URL
 * loading. This fetches what a real visitor receives and compares it, byte for
 * byte, against the production build of the intended commit.
 *
 * Why content identity rather than an embedded revision string: this repository
 * publishes through a branch-source Pages mirror that `validate:pages-root`
 * requires to be byte-identical to `dist/` (decision OD-005), and a commit
 * cannot contain its own SHA. An identifier stamped at build time would
 * therefore either break the mirror check or be a constant. SHA-256 of the
 * served assets answers the real question — is what users receive what we
 * built — and it is the method the earlier verified publication already used.
 *
 *   npm run build && node tools/gates/f6_public_revision.mjs
 *   node tools/gates/f6_public_revision.mjs --url https://example.github.io/repo/
 *   node tools/gates/f6_public_revision.mjs --expect-sha <sha>   record only
 *
 * Exit 0 only when every served asset matches the local build and the page
 * boots without a blocking error. This is a gate, not a report.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const DIST = join(ROOT, 'dist');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const URL_BASE = (arg('url', process.env.F6_PUBLIC_URL || 'https://bachikoljunior-blip.github.io/survival/')).replace(/\/?$/, '/');
const EXPECT_SHA = arg('expect-sha', process.env.F6_EXPECT_SHA || '');
const SKIP_BOOT = argv.includes('--no-boot');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const problems = [];
const note = (s) => console.log(`      ${s}`);

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('F6 gate FAILED: dist/ has no production build to compare against. Run `npm run build` first.');
  process.exit(1);
}

const bundles = readdirSync(DIST).filter((n) => /^cinderline\..*\.js$/.test(n));
if (bundles.length !== 1) {
  console.error(`F6 gate FAILED: expected exactly one bundle in dist/, found ${bundles.length}.`);
  process.exit(1);
}

const ASSETS = ['index.html', bundles[0], 'styles.css', 'manifest.webmanifest'];

console.log(`F6 gate: comparing ${URL_BASE} against the local production build`);
if (EXPECT_SHA) console.log(`      intended revision: ${EXPECT_SHA}`);

for (const name of ASSETS) {
  const local = readFileSync(join(DIST, name));
  let served;
  try {
    const res = await fetch(URL_BASE + name, { cache: 'no-store' });
    if (!res.ok) { problems.push(`${name}: public surface returned HTTP ${res.status}`); continue; }
    served = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    problems.push(`${name}: could not be fetched — ${(e && e.message) || e}`);
    continue;
  }
  const a = sha256(local); const b = sha256(served);
  if (a !== b) {
    problems.push(`${name}: served content differs from the intended build (local ${a.slice(0, 12)}, served ${b.slice(0, 12)}, ${local.length} vs ${served.length} bytes)`);
  } else {
    note(`ok  ${name} — ${a.slice(0, 12)} (${local.length} bytes)`);
  }
}

// The primary journey: the real page, in a real browser, reaching ready with no
// blocking error. Skipped only when explicitly asked, and never silently.
if (!SKIP_BOOT && !problems.length) {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
             '--no-sandbox', '--disable-gpu-sandbox', '--ignore-gpu-blocklist'],
    });
    const ctx = await browser.newContext({
      viewport: { width: 667, height: 375 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));
    await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const ready = await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready === true', null, { timeout: 120000 })
      .then(() => true).catch(() => false);
    const titleUp = await page.evaluate(() => {
      const b = window.CINDERLINE && window.CINDERLINE.game && window.CINDERLINE.game.menus;
      return !!(b && b.titleButtons && b.titleButtons.new);
    }).catch(() => false);
    if (!ready) problems.push('the public page never reached CINDERLINE.ready');
    else if (!titleUp) problems.push('the public page booted but the title menu is not present');
    else note(`ok  the public page boots and reaches the title menu`);
    if (errors.length) problems.push(`blocking runtime error on the public page: ${errors[0]}`);
    await browser.close();
  } catch (e) {
    problems.push(`the boot check could not run — ${(e && e.message) || e}`);
  }
} else if (SKIP_BOOT) {
  note('boot check skipped by --no-boot; this run does not verify the primary journey');
}

if (problems.length) {
  console.error('\nF6 gate FAILED:');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nThe public surface is not serving the intended build. Do not record this');
  console.error('delivery as verified. Revert to the last verified revision or redeploy.');
  process.exit(1);
}

console.log(`\nF6 gate: ok — the public surface serves the intended build${EXPECT_SHA ? ` (${EXPECT_SHA})` : ''}.`);
process.exit(0);
