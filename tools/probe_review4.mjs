#!/usr/bin/env node
/** Fourth pass: character face, dog, attack root motion, smoke. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist'); const OUT = join(ROOT, 'shots');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const BASE = '/cinderline-test';
const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (!p.startsWith(BASE)) { res.writeHead(404); res.end(); return; }
  p = p.slice(BASE.length) || '/'; if (p.endsWith('/')) p += 'index.html';
  try { const body = readFileSync(join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, '')));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader', '--disable-gpu-sandbox', '--no-sandbox', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push('[' + m.type() + '] ' + m.text()); });
await page.goto(`http://127.0.0.1:${port}${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready === true', null, { timeout: 90000 });
await page.waitForTimeout(3000);
const R = {};
await page.evaluate(() => window.CINDERLINE.startNewGame());
await page.waitForTimeout(4500);
await page.evaluate(() => { document.getElementById('ui').style.display = 'none'; });

// Free camera helper: park the real camera by hand for a portrait.
async function look(px, py, pz, cx, cy, cz) {
  await page.evaluate(([px, py, pz, cx, cy, cz]) => {
    const C = window.CINDERLINE, T = C.THREE;
    C.game.camera.enabled = false;
    const cam = C.engine.camera;
    cam.position.set(cx, cy, cz);
    cam.lookAt(new T.Vector3(px, py, pz));
    cam.updateMatrixWorld(true);
    C.engine.renderer.shadowMap.needsUpdate = true;
    if (C.atmos) C.atmos.shadowDirty = true;
  }, [px, py, pz, cx, cy, cz]);
  await page.waitForTimeout(1400);
}

// --- Ren's face, front, 1.1m ------------------------------------------------
const pp = await page.evaluate(() => {
  const p = window.CINDERLINE.game.player;
  p.group.visible = true;
  p.yaw = p.targetYaw = 0;   // facing +? whatever; we orbit to the front
  return { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw };
});
// yaw 0 in this rig faces -Z, so stand in front at -Z
await look(pp.x, pp.y + 1.62, pp.z, pp.x, pp.y + 1.66, pp.z - 0.95);
await page.screenshot({ path: join(OUT, 'rv4-face-front.png'), timeout: 120000 });
await look(pp.x, pp.y + 1.62, pp.z, pp.x, pp.y + 1.72, pp.z + 0.95);
await page.screenshot({ path: join(OUT, 'rv4-face-back.png'), timeout: 120000 });
await look(pp.x, pp.y + 0.95, pp.z, pp.x + 2.6, pp.y + 1.2, pp.z - 1.6);
await page.screenshot({ path: join(OUT, 'rv4-silhouette.png'), timeout: 120000 });

// --- dog --------------------------------------------------------------------
R.dog = await page.evaluate(() => {
  const C = window.CINDERLINE;
  const p = C.game.player;
  const d = C.game.spawnEnemy('dog', p.pos.x + 3, p.pos.z + 1);
  return { ok: !!d, kind: d && d.kind, y: d && d.pos.y };
});
await page.waitForTimeout(2200);
const dp = await page.evaluate(() => {
  const C = window.CINDERLINE;
  const d = C.game.actors.find((a) => a.kind === 'dog');
  if (!d) return null;
  d.animator?.locomotion && (d.animator.locomotion.speed = 0);
  return { x: d.pos.x, y: d.pos.y, z: d.pos.z,
    headRot: d.rig && d.rig.bones ? null : null };
});
if (dp) {
  await look(dp.x, dp.y + 0.4, dp.z, dp.x + 1.9, dp.y + 0.75, dp.z - 1.4);
  await page.screenshot({ path: join(OUT, 'rv4-dog.png'), timeout: 120000 });
}

// --- attack root motion: does the player move forward through contact? ------
R.attack = await page.evaluate(async () => {
  const C = window.CINDERLINE;
  const g = C.game, p = g.player;
  g.camera.enabled = true;
  p.yaw = p.targetYaw = 0;
  const start = { x: p.pos.x, z: p.pos.z };
  const samples = [];
  p.bufferAction('attack');
  for (let i = 0; i < 60; i++) {
    g.fixedUpdate(1 / 60);
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const along = (p.pos.x - start.x) * fx + (p.pos.z - start.z) * fz;
    samples.push({ t: +(i / 60).toFixed(3), along: +along.toFixed(4), st: p.state });
  }
  // forward displacement at the strike window
  return { samples: samples.filter((s, i) => i % 3 === 0),
    maxAlong: +Math.max(...samples.map((s) => s.along)).toFixed(4),
    minAlong: +Math.min(...samples.map((s) => s.along)).toFixed(4) };
});

// --- smoke: alpha and billboarding -----------------------------------------
R.smoke = await page.evaluate(() => {
  const C = window.CINDERLINE;
  const a = C.game.atmos;
  const out = {};
  for (const k of ['plumes', 'burst', 'ash', 'embers']) {
    const f = a[k]; if (!f || !f.mesh) { out[k] = 'no mesh'; continue; }
    const m = f.mesh.material;
    out[k] = { transparent: m.transparent, blending: m.blending, depthWrite: m.depthWrite,
      opacity: m.opacity, hasAAlpha: !!(f.mesh.geometry && f.mesh.geometry.attributes.aAlpha),
      count: f.mesh.count ?? f.mesh.geometry?.instanceCount };
  }
  return out;
});

writeFileSync(join(OUT, 'rv4-report.json'), JSON.stringify({ R, errors }, null, 2));
console.log(JSON.stringify(R, null, 2));
if (errors.length) { console.log('--- errors/warnings (' + errors.length + ') ---'); console.log(errors.slice(0, 15).join('\n')); }
await browser.close(); server.close();
