#!/usr/bin/env node
/**
 * Vantage sweep — screenshots the world from a set of named camera positions.
 * This is the harness the visual critics work from; every look-and-feel claim
 * in this project is checked against these frames.
 *
 *   node tools/vantage.mjs                  full sweep at 667x375
 *   node tools/vantage.mjs --only stacks    a single vantage
 *   node tools/vantage.mjs --w 1334 --h 750 larger frames for detail review
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '../.kit/lib/browser/serve.mjs';
import { launchHeadless } from '../.kit/lib/browser/launch.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'shots');
mkdirSync(OUT, { recursive: true });

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const W = Number(arg('w', 667)), H = Number(arg('h', 375)), DPR = Number(arg('dpr', 2));
const ONLY = arg('only', null);
const PREFIX = arg('prefix', 'v');

/** [name, x, y, z, yaw(deg), pitch(deg)] — yaw 0 looks toward -Z. */
const VANTAGES = [
  ['stacks_yard',   -112, 1.7, -78,   0,  -4],
  ['stacks_roof',   -112, 21.2, -62,  178, -16],
  ['stacks_gate',    -92, 1.7, -84,   270, -3],
  ['marrow_west',   -128, 1.7, 0,     270, -3],
  ['marrow_mid',     -30, 1.7, 2,     270, -3],
  ['marrow_east',     10, 1.7, -2,     90,  -3],
  ['slip_edge',      -76, 1.7, 0,     270, -14],
  ['slip_bottom',    -58, -8.2, 4,    315,  10],
  // Placed by tools/probe_roofspot.mjs. The old position pointed at a brick
  // wall four metres away, which is why that frame measured 28% pure black —
  // the same fault as the old marrow_roof, found the same way, by ray-picking
  // what the camera was actually looking at instead of adjusting the lighting.
  ['slip_bridge',    -84, 11.8, -24,    0, -14],
  // Placed with tools/probe_roofspot.mjs: on a roof with 90m of clearance
  // ahead. The old position was jammed 3.1m against a wall, which is why the
  // frame was 43% black and why three separate lighting fixes moved it zero.
  ['marrow_roof',    -80, 11.1, -20,    0,  -6],
  ['cinder_line',     25, 1.7, -16,    0,   -4],
  ['cut_trench',      74, 1.7, 24,     0,  -10],
  ['survey',          62, 1.7, -28,    0,   -4],
  ['ventfield',       84, 1.7, -66,   270,  -3],
  ['south_marrow',   -60, 1.7, 52,    270,  -3],
  ['heatplant',      -46, 1.7, -98,    0,   -5],
  ['overview',       -60, 52,  70,   340,  -30],
  ['skyline',       -112, 21.2, -62,  135, -6],
];

// The static server is `.kit/lib/browser/serve.mjs`. Four copies of it lived in this
// directory — here, shot, perf and playthrough — identical apart from which MIME types
// each had happened to list. Serving under a sub-path is not incidental: it is how the
// build gets proved against GitHub Pages project-site hosting before it is published.
const BASE = arg('base', '/cinderline-test');
const site = await serveStatic({ root: DIST, basePath: BASE });

// `proxy: false` is load-bearing, not tidiness. launchHeadless honours HTTPS_PROXY by
// default, and Playwright then force-appends `<-loopback>` to --proxy-bypass-list, which
// *un*-bypasses loopback and sends this harness's own 127.0.0.1 fetches out through the
// egress proxy. Measured here: the default returns HTTP 405 with zero page errors, so the
// run would proceed and then time out on `CINDERLINE.ready` — reading as a boot failure in
// the game rather than a proxy misconfiguration. With `proxy: false` the same navigation
// returns 200. Nothing in this file talks to the public internet.
const browser = await launchHeadless({ noSandbox: true, angleSwiftshader: true, proxy: false });
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });

await page.goto(`${site.origin}/index.html`, { waitUntil: 'domcontentloaded' });
try {
  await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready === true', null, { timeout: 90000 });
} catch {
  const note = await page.evaluate(() => document.getElementById('boot-note')?.textContent);
  console.error('BOOT FAILED:', note);
  await browser.close(); await site.close();
  process.exit(1);
}

const stats = await page.evaluate(() => window.CINDERLINE.stats || null);

// The sweep photographs the WORLD. Leaving the title screen up put a scrim
// over the left third of every frame and a menu column over the right, which
// then showed up in the luma statistics as crushed shadows that were not in
// the render at all.
await page.evaluate(() => {
  const ui = document.getElementById('ui');
  if (ui) ui.style.display = 'none';
});
console.log('world stats:', JSON.stringify(stats));

const results = [];
for (const [name, x, y, z, yaw, pitch] of VANTAGES) {
  if (ONLY && name !== ONLY) continue;
  await page.evaluate(([x, y, z, yaw, pitch]) => {
    const C = window.CINDERLINE;
    if (C.setCamera) { C.setCamera(x, y, z, yaw, pitch); return; }
    const cam = C.engine.camera;
    cam.position.set(x, y, z);
    cam.quaternion.setFromEuler(new C.THREE.Euler(pitch * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ'));
    C.engine.renderer.shadowMap.needsUpdate = true;
    if (C.atmos) C.atmos.shadowDirty = true;
  }, [x, y, z, yaw, pitch]);
  // Let the atmosphere settle, shadows re-render and particles populate.
  await page.waitForTimeout(1400);
  const file = join(OUT, `${PREFIX}-${name}.png`);
  await page.screenshot({ path: file });
  const perf = await page.evaluate(() => window.CINDERLINE.engine.perfSnapshot());
  results.push({ name, draws: perf.draws, tris: perf.tris });
  console.log(`  ${name.padEnd(16)} draws=${String(perf.draws).padStart(4)} tris=${String(perf.tris).padStart(7)}`);
}

writeFileSync(join(OUT, `${PREFIX}-vantages.json`), JSON.stringify({ stats, results, errors }, null, 2));
if (errors.length) { console.log('--- errors ---'); console.log(errors.slice(0, 10).join('\n')); }

await browser.close();
await site.close();
process.exit(errors.length ? 1 : 0);
