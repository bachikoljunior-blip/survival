#!/usr/bin/env node
/** Fifth pass: does an attack lunge forward or backward? Isolated, no other actors. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
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
  try { const b = readFileSync(join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, '')));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(b);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader', '--disable-gpu-sandbox', '--no-sandbox', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${port}${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready === true', null, { timeout: 90000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.CINDERLINE.startNewGame());
await page.waitForTimeout(4000);

const R = await page.evaluate(() => {
  const C = window.CINDERLINE, g = C.game, p = g.player;
  // isolate: no other actors
  for (const a of [...g.actors]) if (a !== p) g.removeActor(a);
  g.engine.stop();
  p.yaw = p.targetYaw = 0;
  p.stamina = p.maxStamina;
  const fwd = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
  const s0 = { x: p.pos.x, z: p.pos.z };
  const trace = [];
  let fired = null;
  // Directly ask the combat system for a light attack.
  const before = p.state;
  if (g.combat && g.combat.startAttack) fired = g.combat.startAttack(p, 'light1');
  else if (g.combat && g.combat.tryAttack) fired = g.combat.tryAttack(p, 'light1');
  else { p.bufferAction('attack'); fired = 'buffered'; }
  for (let i = 0; i < 70; i++) {
    g.fixedUpdate(1 / 60);
    const along = (p.pos.x - s0.x) * fwd.x + (p.pos.z - s0.z) * fwd.z;
    trace.push({ t: +(i / 60).toFixed(3), along: +along.toFixed(4), st: p.state,
      rootZ: p.animator && p.animator.out ? +(p.animator.out.rootZ ?? 0).toFixed(4) : null,
      atk: p.attack ? p.attack.clip : null, clipT: p.animator?.action ? +(p.animator.action.t ?? 0).toFixed(3) : null });
  }
  const inAtk = trace.filter((r) => r.atk);
  return { before, fired: String(fired), combatKeys: Object.getOwnPropertyNames(Object.getPrototypeOf(g.combat || {})),
    attackFrames: inAtk.length,
    alongAtContactStart: inAtk[0] && inAtk[0].along,
    peakForward: +Math.max(...trace.map((r) => r.along)).toFixed(4),
    peakBackward: +Math.min(...trace.map((r) => r.along)).toFixed(4),
    trace: trace.filter((r, i) => i % 2 === 0).slice(0, 32) };
});
writeFileSync(join(OUT, 'rv5-report.json'), JSON.stringify(R, null, 2));
console.log(JSON.stringify(R, null, 2));
await browser.close(); server.close();
