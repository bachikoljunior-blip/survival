#!/usr/bin/env node
/**
 * Real-touch verification harness.
 *
 * Dispatches genuine CDP touch sequences (not synthetic DOM events, not
 * scrollTop assignment) at the built game, so "the settings panel can be
 * scrolled with a finger" is a measured fact rather than a claim.
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
const ctx = await browser.newContext({
  viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://127.0.0.1:${port}${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready !== false', null, { timeout: 60000 });
await page.waitForTimeout(3000);
// Stop the render loop: swiftshader renders at ~1fps here and every CDP touch
// dispatch would queue behind a frame. The DOM/menu layer is unaffected.
await page.evaluate(() => window.CINDERLINE.engine.stop());

const cdp = await ctx.newCDPSession(page);
const pt = (x, y) => [{ x, y, radiusX: 14, radiusY: 14, force: 1, id: 1 }];
/** A real finger: down, N moves, up. */
async function swipe(x0, y0, x1, y1, steps = 10) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x0, y0) });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t) });
    await page.waitForTimeout(10);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(320);
}
async function tapAt(x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x, y) });
  await page.waitForTimeout(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(220);
}

const out = {};

// ---- open the settings panel exactly as a player would: title -> SETTINGS --
const menuBtn = await page.evaluate(() => {
  const b = document.querySelectorAll('#title .btn');
  const r = [...b].find((n) => n.textContent.startsWith('SETTINGS')).getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await tapAt(menuBtn.x, menuBtn.y);
out.settingsOpen = await page.evaluate(() => !!document.querySelector('.screen.on'));

const geom = () => page.evaluate(() => {
  const p = window.CINDERLINE.game.menus.settingsPanel;
  const rows = [...p.children].map((n) => ({ t: (n.textContent || '').slice(0, 24), top: Math.round(n.getBoundingClientRect().top) }));
  const reach = rows.filter((r) => r.top >= 0 && r.top <= 375);
  return { scrollTop: Math.round(p.scrollTop), scrollH: p.scrollHeight, clientH: p.clientHeight,
    firstVisible: reach[0] && reach[0].t, lastVisible: reach[reach.length - 1] && reach[reach.length - 1].t };
});
out.before = await geom();

// Snapshot the toggle values so we can prove scrolling did not select a row.
const snap = () => page.evaluate(() => JSON.stringify(window.CINDERLINE.game.menus.settings));
const s0 = await snap();

// Four hard upward flicks through the middle of the panel.
for (let i = 0; i < 5; i++) await swipe(300, 300, 300, 90, 10);
out.afterScroll = await geom();
out.settingsUnchangedByScroll = (await snap()) === s0;
await page.screenshot({ path: join(OUT, 'touch-settings-bottom-667x375.png') });

// Bottom of the list reached?
out.atBottom = await page.evaluate(() => {
  const p = window.CINDERLINE.game.menus.settingsPanel;
  return p.scrollTop + p.clientHeight >= p.scrollHeight - 4;
});

// Accessibility rows genuinely on screen and tappable now.
out.accessibilityVisible = await page.evaluate(() => {
  const p = window.CINDERLINE.game.menus.settingsPanel;
  const want = ['Subtitles', 'Screen shake', 'Reduced motion', 'High contrast', 'Damage numbers',
    'Air assistance', 'Combat assistance', 'Vibration'];
  const res = {};
  for (const w of want) {
    const n = [...p.querySelectorAll('.item')].find((x) => x.textContent.includes(w));
    if (!n) { res[w] = 'missing'; continue; }
    const r = n.getBoundingClientRect();
    const onScreen = r.top >= 0 && r.bottom <= 375 && r.height >= 44;
    // Is this element what a touch in its middle would actually reach?
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    res[w] = { onScreen, h: Math.round(r.height), hits: !!(hit && (hit === n || n.contains(hit))) };
  }
  return res;
});

// Tap a real accessibility toggle and prove the value changed.
const tgl = await page.evaluate(() => {
  const p = window.CINDERLINE.game.menus.settingsPanel;
  const n = [...p.querySelectorAll('.item')].find((x) => x.textContent.includes('Vibration'));
  const r = n.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, before: window.CINDERLINE.game.menus.settings.vibration };
});
await tapAt(tgl.x, tgl.y);
out.toggleTap = { before: tgl.before, after: await page.evaluate(() => window.CINDERLINE.game.menus.settings.vibration) };

// C5: change a SECOND setting and prove both survive into the game + storage.
const t2 = await page.evaluate(() => {
  const p = window.CINDERLINE.game.menus.settingsPanel;
  const n = [...p.querySelectorAll('.item')].find((x) => x.textContent.includes('Damage numbers'));
  const r = n.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await tapAt(t2.x, t2.y);
await page.waitForTimeout(500);
out.twoChanges = await page.evaluate(() => {
  const g = window.CINDERLINE.game;
  const saved = JSON.parse(localStorage.getItem('cinderline.settings.v1') || localStorage.getItem(Object.keys(localStorage).find((k) => /settings/i.test(k)) || '') || '{}');
  return {
    panel: { vibration: g.menus.settings.vibration, showDamageNumbers: g.menus.settings.showDamageNumbers },
    game: { vibration: g.settings.vibration, showDamageNumbers: g.settings.showDamageNumbers },
    saved: { vibration: saved.vibration, showDamageNumbers: saved.showDamageNumbers },
    sameObject: g.settings === g.menus.settings,
  };
});

// C3: a drag that ends over a row must NOT commit that row.
const s1 = await snap();
await swipe(300, 300, 300, 200, 12);
out.dragDoesNotSelect = (await snap()) === s1;

console.log(JSON.stringify(out, null, 2));
if (errors.length) console.log('ERRORS', errors);
writeFileSync(join(OUT, 'touch-settings-report.json'), JSON.stringify({ out, errors }, null, 2));
await browser.close();
server.close();
