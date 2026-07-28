#!/usr/bin/env node
/** Third pass: is the far skyline geometry actually floating? plus crops. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist'); const OUT = join(ROOT, 'shots');
mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const BASE = '/cinderline-test';
const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (!p.startsWith(BASE)) { res.writeHead(404); res.end(); return; }
  p = p.slice(BASE.length) || '/'; if (p.endsWith('/')) p += 'index.html';
  try { const body = readFileSync(join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, '')));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body); } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader', '--disable-gpu-sandbox', '--no-sandbox', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://127.0.0.1:${port}${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready === true', null, { timeout: 90000 });
await page.waitForTimeout(3000);
await page.evaluate(() => { document.getElementById('ui').style.display = 'none'; });
const R = {};

R.skyline = await page.evaluate(() => {
  const C = window.CINDERLINE, T = C.THREE;
  const out = [];
  C.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const n = (o.name || '') + '|' + (o.parent && o.parent.name || '');
    if (!/sky|back|far|horiz|distant|proxy|silhou/i.test(n)) return;
    o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    out.push({ n, minY: +b.min.y.toFixed(2), maxY: +b.max.y.toFixed(2),
      minX: +b.min.x.toFixed(0), maxX: +b.max.x.toFixed(0), tris: o.geometry.index ? o.geometry.index.count / 3 : 0 });
  });
  // Everything, grouped by name prefix, with min-Y
  const groups = {};
  C.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const k = (o.name || o.type).replace(/\d+/g, '#');
    o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    const g = groups[k] || (groups[k] = { n: 0, minY: 1e9, maxY: -1e9, ext: 0 });
    g.n++; g.minY = Math.min(g.minY, b.min.y); g.maxY = Math.max(g.maxY, b.max.y);
    g.ext = Math.max(g.ext, Math.max(Math.abs(b.min.x), Math.abs(b.max.x), Math.abs(b.min.z), Math.abs(b.max.z)));
  });
  return { named: out, groups: Object.entries(groups).map(([k, v]) => ({ k, n: v.n,
    minY: +v.minY.toFixed(1), maxY: +v.maxY.toFixed(1), extent: Math.round(v.ext) }))
    .sort((a, b) => b.extent - a.extent).slice(0, 25) };
});

// Ray-cast down from a far backdrop building to see if there is ground under it.
R.groundUnderFar = await page.evaluate(() => {
  const C = window.CINDERLINE, T = C.THREE;
  const rc = new T.Raycaster();
  const res = [];
  for (const [x, z] of [[0, -400], [0, -260], [300, 0], [-300, 200], [0, -180], [0, -120]]) {
    rc.set(new T.Vector3(x, 400, z), new T.Vector3(0, -1, 0));
    rc.far = 1200;
    const hits = rc.intersectObjects(C.scene.children, true).filter((h) => h.object.isMesh);
    res.push({ x, z, hits: hits.slice(0, 3).map((h) => ({ y: +h.point.y.toFixed(1),
      name: h.object.name || h.object.type, mat: h.object.material && h.object.material.name })) });
  }
  return res;
});

// re-shoot the overview and skyline with a top crop to inspect the horizon band
for (const [name, x, y, z, yaw, pitch] of [
  ['overview', -60, 52, 70, 340, -30], ['skyline', -112, 21.2, -62, 135, -6],
  ['slip_bottom', -58, -8.2, 4, 315, 10], ['slip_bridge', -70, 11.3, -22, 180, -20],
  ['overview_hi', -60, 90, 90, 340, -22],
]) {
  await page.evaluate(([x, y, z, yaw, pitch]) => window.CINDERLINE.setCamera(x, y, z, yaw, pitch), [x, y, z, yaw, pitch]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, `rv3-${name}.png`), timeout: 120000 });
}

// Fog / atmosphere parameters
R.fog = await page.evaluate(() => {
  const C = window.CINDERLINE;
  const f = C.scene.fog;
  const e = C.engine;
  return { type: f && f.type, color: f && '#' + f.color.getHexString(),
    near: f && f.near, far: f && f.far, density: f && f.density,
    camFar: e.camera.far, camNear: e.camera.near,
    toneMapping: e.renderer.toneMapping, exposure: e.renderer.toneMappingExposure };
});
R.exposureBias = await page.evaluate(() => {
  const g = window.CINDERLINE.game;
  const pick = (o) => Object.keys(o || {}).filter((k) => /expo|bright|grade|lift|gain|contrast/i.test(k))
      .map((k) => [k, typeof o[k] === 'object' ? '[obj]' : o[k]]);
  return { atmos: pick(g.atmos), post: pick(g.post) };
});
R.mapCost = await page.evaluate(() => {
  const m = window.CINDERLINE.game.menus;
  m.openPause('map');
  const t0 = performance.now(); m.refreshMap(); const t1 = performance.now();
  m.refreshMap(); const t2 = performance.now();
  m.closePause();
  return { firstMs: +(t1 - t0).toFixed(2), secondMs: +(t2 - t1).toFixed(2) };
});

writeFileSync(join(OUT, 'rv3-report.json'), JSON.stringify({ R, errors }, null, 2));
console.log(JSON.stringify(R, null, 2));
if (errors.length) console.log('ERRORS', errors.slice(0, 5));
await browser.close(); server.close();
