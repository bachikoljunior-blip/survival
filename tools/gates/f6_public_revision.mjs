#!/usr/bin/env node
/**
 * F6 gate — is the public surface actually serving the revision we intended?
 *
 * A deployment job reporting success is not evidence. Neither is the URL
 * loading. This fetches what a real visitor receives and compares it, byte for
 * byte, against the production build of the intended commit.
 *
 * The Pages job rebuilds its deploy-only artifact with CINDERLINE_BUILD_ID set
 * to github.sha. That makes the revision reachable from public index.html, the
 * bundle filename and window.CINDERLINE.build without changing the committed
 * branch-source mirror. Byte identity then proves the rest of the public files
 * came from that same intended build.
 *
 *   npm run build && node tools/gates/f6_public_revision.mjs
 *   node tools/gates/f6_public_revision.mjs --url https://example.github.io/repo/
 *   CINDERLINE_BUILD_ID=<sha> npm run build
 *   node tools/gates/f6_public_revision.mjs --expect-sha <sha>
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

if (EXPECT_SHA && !/^[0-9a-f]{40}$/.test(EXPECT_SHA)) {
  console.error('F6 gate FAILED: --expect-sha/F6_EXPECT_SHA must be one full lowercase commit SHA.');
  process.exit(1);
}

function browserProxyFromEnv() {
  const raw = process.env.HTTPS_PROXY || process.env.https_proxy
    || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!raw) return undefined;
  try {
    const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
    const proxy = {
      server: `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`,
    };
    if (url.username) proxy.username = decodeURIComponent(url.username);
    if (url.password) proxy.password = decodeURIComponent(url.password);
    const bypass = process.env.NO_PROXY || process.env.no_proxy;
    if (bypass) proxy.bypass = bypass;
    return proxy;
  } catch (error) {
    throw new Error(`invalid HTTP(S) proxy configuration: ${error.message}`);
  }
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const problems = [];
const note = (s) => console.log(`      ${s}`);

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('F6 gate FAILED: dist/ has no production build to compare against. Run `npm run build` first.');
  process.exit(1);
}

const distFiles = readdirSync(DIST, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort();
const bundles = distFiles.filter((name) => /^cinderline\..*\.js$/.test(name));
if (bundles.length !== 1) {
  console.error(`F6 gate FAILED: expected exactly one bundle in dist/, found ${bundles.length}.`);
  process.exit(1);
}

const ASSETS = distFiles;

if (EXPECT_SHA && bundles[0] !== `cinderline.${EXPECT_SHA}.js`) {
  console.error(`F6 gate FAILED: the local production build identifies itself as ${bundles[0]}, not revision ${EXPECT_SHA}.`);
  console.error(`Rebuild with CINDERLINE_BUILD_ID=${EXPECT_SHA} before running F6.`);
  process.exit(1);
}

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

// Content identity alone cannot distinguish two commits that happen to emit
// identical bytes. The revision-stamped bundle name is a public identifier in
// index.html, and the running game exposes the same build identifier. Require
// both when a revision is supplied so F6 verifies that revision, not merely an
// equivalent or older deployment.
if (EXPECT_SHA && !problems.length) {
  try {
    const res = await fetch(URL_BASE + 'index.html', { cache: 'no-store' });
    const html = res.ok ? await res.text() : '';
    const escaped = EXPECT_SHA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const revisionScript = new RegExp(`<script\\s+src=["'](?:\\./)?cinderline\\.${escaped}\\.js["']\\s+defer><\\/script>`);
    if (!revisionScript.test(html)) {
      problems.push(`index.html does not identify intended revision ${EXPECT_SHA}`);
    } else {
      note(`ok  public revision identifier — ${EXPECT_SHA}`);
    }
  } catch (e) {
    problems.push(`public revision identifier could not be read — ${(e && e.message) || e}`);
  }
}

// The primary journey: the real page, in a real browser, reaching ready with no
// blocking error. Skipped only when explicitly asked, and never silently.
if (!SKIP_BOOT && !problems.length) {
  try {
    const { chromium } = await import('playwright');
    const proxy = browserProxyFromEnv();
    const browser = await chromium.launch({
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
             '--no-sandbox', '--disable-gpu-sandbox', '--ignore-gpu-blocklist'],
      ...(proxy ? { proxy } : {}),
    });
    const ctx = await browser.newContext({
      viewport: { width: 667, height: 375 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
      // This managed environment's authorized HTTPS proxy terminates TLS with
      // its own CA. Trust that CA path only when a proxy is actually in use;
      // CI and direct public checks continue to enforce the site's certificate.
      ...(proxy ? { ignoreHTTPSErrors: true } : {}),
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));
    await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const ready = await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready === true', null, { timeout: 120000 })
      .then(() => true).catch(() => false);
    const surface = await page.evaluate(() => {
      const b = window.CINDERLINE && window.CINDERLINE.game && window.CINDERLINE.game.menus;
      return {
        titleUp: !!(b && b.titleButtons && b.titleButtons.new),
        build: window.CINDERLINE && window.CINDERLINE.build,
      };
    }).catch(() => ({ titleUp: false, build: null }));
    if (!ready) problems.push('the public page never reached CINDERLINE.ready');
    else if (!surface.titleUp) problems.push('the public page booted but the title menu is not present');
    else if (EXPECT_SHA && surface.build !== EXPECT_SHA) {
      problems.push(`the running public game identifies itself as ${String(surface.build)}, not ${EXPECT_SHA}`);
    }
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
  console.error('delivery as verified. Stop, preserve evidence, investigate, and deliver a');
  console.error('reviewed forward repair/redeploy; R2-9 makes verified rollback unsafe.');
  process.exit(1);
}

console.log(`\nF6 gate: ok — the public surface serves the intended build${EXPECT_SHA ? ` (${EXPECT_SHA})` : ''}.`);
process.exit(0);
