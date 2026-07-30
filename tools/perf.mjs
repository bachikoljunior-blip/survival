#!/usr/bin/env node
/**
 * Performance measurement.
 *
 * IMPORTANT AND NON-NEGOTIABLE: this runs against SwiftShader, a software
 * rasteriser. The frame times it reports are NOT representative of any phone
 * and are never quoted as such anywhere in this project.
 *
 * What it measures that *is* meaningful and device-independent:
 *
 *   · draw calls and triangles per frame at each vantage and quality tier
 *   · shader program count (a real mobile cost — each new program is a stall)
 *   · texture and geometry counts, and estimated texture memory
 *   · CPU time per simulation step, isolated from rendering
 *   · world build time
 *   · allocation behaviour in steady state (JS heap growth over 60 s)
 *
 * Those numbers are the ones that decide whether a mobile GPU can keep up, and
 * they are measurable honestly here.
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
         '--no-sandbox', '--disable-gpu-sandbox', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'],
});
const ctx = await browser.newContext({
  viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));

await page.goto(`http://127.0.0.1:${port}${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready === true', null, { timeout: 120000 });

const bundleBytes = readFileSync(join(DIST, readFileSync(join(DIST, 'index.html'), 'utf8')
  .match(/src="([^"]+\.js)"/)[1])).length;

const VANTAGES = [
  ['stacks_yard',   -112, 1.7, -78,   0,  -4],
  ['marrow_mid',     -30, 1.7, 2,     270, -3],
  ['slip_edge',      -76, 1.7, 0,     270, -14],
  ['marrow_roof',    -60, 11.4, -16,   90, -6],
  ['cut_trench',      74, 1.7, 24,     0, -10],
  ['ventfield',       84, 1.7, -66,   270, -3],
  ['south_marrow',   -60, 1.7, 52,    270, -3],
  ['combat',        -112, 1.7, -84,     0, -3],
];

const results = { tiers: {}, sim: null, memory: null, build: null, bundleBytes, errors };

results.build = await page.evaluate(() => ({
  worldTris: window.CINDERLINE.stats.tris,
  chunks: window.CINDERLINE.stats.chunks,
  collisionBoxes: window.CINDERLINE.stats.collision.boxes,
  materials: window.CINDERLINE.stats.materials,
  lightMarkers: window.CINDERLINE.stats.lights,
}));

for (const tier of ['low', 'medium', 'high']) {
  await page.evaluate((t) => {
    const C = window.CINDERLINE;
    C.engine.setTier(t, true);
    C.game.menus.hideTitle();
    C.game.setMode(C.MODE.PLAY);
    C.game.hud.setVisible(true);
  }, tier);
  await page.waitForTimeout(1200);

  const rows = [];
  for (const [name, x, y, z, yaw, pitch] of VANTAGES) {
    if (name === 'combat') {
      await page.evaluate(() => {
        const g = window.CINDERLINE.game;
        for (const a of [...g.actors]) if (a.faction === 'hostile') g.removeActor(a);
        const kinds = ['scav', 'scav', 'breaker', 'slinger', 'dog', 'dog', 'warden'];
        kinds.forEach((k, i) => {
          const ang = (i / kinds.length) * Math.PI * 2;
          const e = g.spawnEnemy(k, g.player.pos.x + Math.cos(ang) * 7, g.player.pos.z + Math.sin(ang) * 7);
          e.aggro = true; e.awareness = 1; e.aiState = 'combat'; e.target = g.player;
        });
      });
      await page.waitForTimeout(900);
    }
    await page.evaluate(([x, y, z, yaw, pitch]) => window.CINDERLINE.setCamera(x, y, z, yaw, pitch),
      [x, y, z, yaw, pitch]);
    await page.waitForTimeout(1100);
    const s = await page.evaluate(() => window.CINDERLINE.engine.perfSnapshot());
    rows.push({ vantage: name, draws: s.draws, tris: s.tris, programs: s.programs,
                textures: s.textures, geometries: s.geometries, res: s.res });
  }
  results.tiers[tier] = rows;
  console.log(`\n── tier: ${tier} ──`);
  console.log('  vantage           draws     tris  programs');
  for (const r of rows) {
    console.log(`  ${r.vantage.padEnd(16)} ${String(r.draws).padStart(5)} ${String(r.tris).padStart(8)}  ${String(r.programs).padStart(8)}`);
  }
}

// --- CPU cost of one simulation step, rendering excluded -----------------
results.sim = await page.evaluate(async () => {
  const g = window.CINDERLINE.game;
  const N = 600;
  // Warm up so JIT and allocation are settled.
  for (let i = 0; i < 120; i++) g.fixedUpdate(1 / 60);
  const samples = [];
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    g.fixedUpdate(1 / 60);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const at = (p) => samples[Math.floor(samples.length * p)];
  return {
    actors: g.actors.length,
    meanMs: samples.reduce((a, b) => a + b, 0) / samples.length,
    p50: at(0.5), p90: at(0.9), p99: at(0.99), max: samples[samples.length - 1],
  };
});
console.log(`\n── simulation step (${results.sim.actors} actors, render excluded) ──`);
console.log(`  mean ${results.sim.meanMs.toFixed(3)} ms   p50 ${results.sim.p50.toFixed(3)}   ` +
            `p90 ${results.sim.p90.toFixed(3)}   p99 ${results.sim.p99.toFixed(3)}   max ${results.sim.max.toFixed(3)}`);

// --- allocation behaviour ------------------------------------------------
results.memory = await page.evaluate(async () => {
  const g = window.CINDERLINE.game;
  const read = () => (performance.memory ? performance.memory.usedJSHeapSize : 0);
  for (let i = 0; i < 600; i++) g.fixedUpdate(1 / 60);
  const before = read();
  const t0 = performance.now();
  let steps = 0;
  while (performance.now() - t0 < 4000) { g.fixedUpdate(1 / 60); steps++; }
  const after = read();
  return {
    supported: !!performance.memory,
    beforeMB: before / 1048576,
    afterMB: after / 1048576,
    growthKBPerSecond: before ? ((after - before) / 1024) / 4 : null,
    steps,
  };
});
if (results.memory.supported) {
  console.log(`\n── heap over 4 s of simulation ──`);
  console.log(`  ${results.memory.beforeMB.toFixed(1)} MB -> ${results.memory.afterMB.toFixed(1)} MB ` +
              `(${results.memory.growthKBPerSecond.toFixed(0)} KB/s, ${results.memory.steps} steps)`);
}

console.log(`\n── build ──`);
console.log(`  world triangles     ${results.build.worldTris}`);
console.log(`  chunks              ${results.build.chunks}`);
console.log(`  collision boxes     ${results.build.collisionBoxes}`);
console.log(`  shared materials    ${results.build.materials}`);
console.log(`  bundle (minified)   ${(bundleBytes / 1024).toFixed(0)} KB`);

writeFileSync(join(OUT, 'perf.json'), JSON.stringify(results, null, 2));
console.log('\nNote: frame timings are deliberately not reported — this harness runs on');
console.log('SwiftShader (software rendering) and any fps figure from it would be');
console.log('meaningless for a phone. Draw calls, triangles, programs and CPU step');
console.log('cost are device-independent and are the numbers above.');

if (errors.length) { console.log('\n--- errors ---'); console.log(errors.join('\n')); }
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
