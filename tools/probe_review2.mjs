#!/usr/bin/env node
/** Second review pass: persistence, context loss, left-hand, typography, geometry cost. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'shots');
mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
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
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader', '--disable-gpu-sandbox', '--no-sandbox', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
const logs = [], errors = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e && e.stack || e)));
await page.goto(`http://127.0.0.1:${port}${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready === true', null, { timeout: 90000 });
await page.waitForTimeout(3000);
const R = {};

// ------------------------------------------------------- geometry / uv1 cost
R.geometry = await page.evaluate(() => {
  const C = window.CINDERLINE;
  let uv = 0, uv1 = 0, pos = 0, meshes = 0, withUv1 = 0;
  C.scene.traverse((o) => {
    if (!o.geometry) return;
    meshes++;
    const a = o.geometry.attributes;
    if (a.position) pos += a.position.array.byteLength;
    if (a.uv) uv += a.uv.array.byteLength;
    if (a.uv1) { uv1 += a.uv1.array.byteLength; withUv1++; }
  });
  // does anything actually read uv1?
  let aoOnUv1 = 0, aoTotal = 0;
  const seen = new Set();
  C.scene.traverse((o) => {
    const m = o.material; if (!m) return;
    for (const mm of Array.isArray(m) ? m : [m]) {
      if (seen.has(mm.uuid)) continue; seen.add(mm.uuid);
      if (mm.aoMap) { aoTotal++; if ((mm.aoMap.channel ?? 0) !== 0) aoOnUv1++; }
    }
  });
  return { meshes, posKB: Math.round(pos / 1024), uvKB: Math.round(uv / 1024),
    uv1KB: Math.round(uv1 / 1024), meshesWithUv1: withUv1,
    materialsWithAoMap: aoTotal, aoMapsSamplingUv1: aoOnUv1 };
});

// ------------------------------------------------------- typography / contrast
R.typography = await page.evaluate(() => {
  const rows = [];
  const want = ['#title .title-blurb', '#title .btn', '.dlg-txt', '.dlg-who', '.dlg-choice',
    '.screen .body', '.item .lbl', '.item .sub', '.objective', '.notice', '.prompt',
    '.screen.ending .k', '.screen.ending .scroll', '.subs div', '.air .ppm', '.hpnum'];
  for (const s of want) {
    const n = document.querySelector(s);
    if (!n) { rows.push({ sel: s, missing: true }); continue; }
    const cs = getComputedStyle(n);
    rows.push({ sel: s, fontPx: parseFloat(cs.fontSize), color: cs.color, lineHeight: cs.lineHeight });
  }
  return rows;
});

// ---------------------------------------------------------- context loss ----
R.ctxLoss = await page.evaluate(() => {
  const C = window.CINDERLINE;
  const gl = C.engine.renderer.getContext();
  const ext = gl.getExtension('WEBGL_lose_context');
  if (!ext) return { skipped: 'no WEBGL_lose_context' };
  ext.loseContext();
  return { fired: true };
});
await page.waitForTimeout(1200);
R.ctxLossUi = await page.evaluate(() => {
  const n = document.getElementById('ctxlost');
  return { on: !!(n && n.classList.contains('on')), display: n && getComputedStyle(n).display,
    text: n && n.textContent.replace(/\s+/g, ' ').slice(0, 120) };
});
await page.screenshot({ path: join(OUT, 'rv-08-ctxlost.png') });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready === true', null, { timeout: 90000 });
await page.waitForTimeout(2500);

// ---------------------------------------------- save on background + reload --
await page.evaluate(() => window.CINDERLINE.startNewGame());
await page.waitForTimeout(4000);
await page.evaluate(() => {
  const C = window.CINDERLINE;
  // walk somewhere distinctive
  C.game.player.placeAt(-100, 1, -60);
  C.game.director.state.set('probe_marker');
});
await page.waitForTimeout(600);
R.beforeBg = await page.evaluate(() => ({ hasSave: !!localStorage.getItem(
  Object.keys(localStorage).find((k) => /save/i.test(k)) || 'x') }));
await page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  document.dispatchEvent(new Event('visibilitychange'));
});
await page.waitForTimeout(900);
R.bgSave = await page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => /save/i.test(x));
  const v = k && JSON.parse(localStorage.getItem(k));
  return { key: k, hasMarker: !!(v && JSON.stringify(v).includes('probe_marker')),
    px: v && v.player && Math.round(v.player.x) };
});

// ---------------------------------------- world reset on load after a run ---
R.loadReset = await page.evaluate(async () => {
  const C = window.CINDERLINE;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  document.dispatchEvent(new Event('visibilitychange'));
  const g = C.game;
  // spawn hostiles and aggro them
  const e1 = g.spawnEnemy('warden', -98, -58);
  const e2 = g.spawnEnemy('warden', -96, -56);
  const before = g.actors.filter((a) => a.constructor.name === 'Enemy' || a.kind === 'warden').length;
  g.director.crisis = { site: 'test', marks: [], rescued: 0, lost: 0, timeLeft: 99, done: false };
  await g.director.retry();
  const after = g.actors.filter((a) => a.constructor.name === 'Enemy' || a.kind === 'warden').length;
  return { before, after, crisisAfter: g.director.crisis, mode: g.mode };
});

// --------------------------------------------- "Saved." with storage blocked
R.savedMessage = await page.evaluate(() => {
  const C = window.CINDERLINE;
  const orig = Storage === undefined ? null : null;
  const real = localStorage.setItem.bind(localStorage);
  localStorage.setItem = () => { throw new DOMException('QuotaExceededError'); };
  let noticeText = null;
  const obs = new MutationObserver(() => {
    const n = document.querySelector('.notice');
    if (n) noticeText = n.textContent;
  });
  obs.observe(document.body, { childList: true, subtree: true });
  C.game.emit('ui:save');
  obs.disconnect();
  localStorage.setItem = real;
  const n = [...document.querySelectorAll('.notice')].map((x) => x.textContent);
  return { notices: n, captured: noticeText };
});

// --------------------------------------------------------- left-handed mode
await page.evaluate(() => {
  const C = window.CINDERLINE;
  C.game.applySettings({ ...C.game.settings, leftHanded: true });
});
await page.waitForTimeout(500);
R.leftHanded = await page.evaluate(() => {
  const C = window.CINDERLINE;
  const acts = [...document.querySelectorAll('.abtn')].map((n) => {
    const r = n.getBoundingClientRect();
    return { c: n.className.replace('abtn hit ', ''), x: Math.round(r.x), x2: Math.round(r.right) };
  });
  const split = C.input._splitX();
  const stickZoneIsLeft = !C.input.leftHanded;
  // does the stick zone overlap any action button?
  const overlap = acts.filter((a) => C.input.leftHanded ? (a.x2 > split) : (a.x < split));
  return { split, leftHanded: C.input.leftHanded, acts, buttonsInStickZone: overlap };
});
await page.screenshot({ path: join(OUT, 'rv-09-lefthanded.png') });
await page.evaluate(() => { const C = window.CINDERLINE;
  C.game.applySettings({ ...C.game.settings, leftHanded: false }); });
await page.waitForTimeout(300);

// --------------------------------------------------------------- map cost ---
R.map = await page.evaluate(() => {
  const C = window.CINDERLINE;
  const t0 = performance.now();
  C.game.emit('ui:map');
  const t1 = performance.now();
  const m = C.game.menus;
  const t2 = performance.now();
  C.game.emit('ui:map');
  const t3 = performance.now();
  return { firstOpenMs: +(t1 - t0).toFixed(1), secondOpenMs: +(t3 - t2).toFixed(1),
    hasCache: !!(m._mapCache || m._cityCanvas || m.mapBase) };
});
await page.waitForTimeout(600);
await page.screenshot({ path: join(OUT, 'rv-10-map.png') });
await page.evaluate(() => window.CINDERLINE.game.menus.closePause());

// ------------------------------------------------------- ending typography --
await page.evaluate(async () => {
  const C = window.CINDERLINE;
  C.game.director.state.set('published');
  await C.game.director.finish();
});
await page.waitForTimeout(2000);
R.endingLayout = await page.evaluate(() => {
  const n = document.querySelector('.screen.ending');
  const kids = [...n.querySelectorAll('*')].slice(0, 8).map((c) => {
    const r = c.getBoundingClientRect(); const cs = getComputedStyle(c);
    return { cls: c.className || c.tagName, x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.width), font: parseFloat(cs.fontSize), color: cs.color };
  });
  const scroller = n.querySelector('.scroll');
  return { kids, scrollable: scroller ? { scrollH: scroller.scrollHeight, clientH: scroller.clientHeight } : null,
    hasScrollClass: !!scroller };
});

writeFileSync(join(OUT, 'rv-report2.json'), JSON.stringify({ R, logs, errors }, null, 2));
console.log(JSON.stringify(R, null, 2));
console.log('--- console (' + logs.length + ') ---'); console.log(logs.slice(0, 50).join('\n'));
console.log('--- errors (' + errors.length + ') ---'); console.log(errors.slice(0, 20).join('\n'));
await browser.close(); server.close();
