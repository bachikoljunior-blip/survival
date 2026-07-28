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
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'shots');
mkdirSync(OUT, { recursive: true });

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const W = Number(arg('w', 667)), H = Number(arg('h', 375)), DPR = Number(arg('dpr', 2));
const ONLY = arg('only', null);
const PREFIX = arg('prefix', 'rvv');

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
  ['slip_bridge',    -70, 11.3, -22,  180, -20],
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
  viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });

await page.goto(`http://127.0.0.1:${port}${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
try {
  await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready === true', null, { timeout: 90000 });
} catch {
  const note = await page.evaluate(() => document.getElementById('boot-note')?.textContent);
  console.error('BOOT FAILED:', note);
  await browser.close(); server.close();
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
  await page.screenshot({ path: file, timeout: 120000 });
  const perf = await page.evaluate(() => window.CINDERLINE.engine.perfSnapshot());
  results.push({ name, draws: perf.draws, tris: perf.tris });
  console.log(`  ${name.padEnd(16)} draws=${String(perf.draws).padStart(4)} tris=${String(perf.tris).padStart(7)}`);
}

writeFileSync(join(OUT, `${PREFIX}-vantages.json`), JSON.stringify({ stats, results, errors }, null, 2));
if (errors.length) { console.log('--- errors ---'); console.log(errors.slice(0, 10).join('\n')); }

await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
