#!/usr/bin/env node
/**
 * Independent re-review harness: real frames + real CDP touch at 667x375.
 * Throwaway. Writes shots/rv-*.png and shots/rv-report.json.
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
const logs = [], errors = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e && e.stack || e)));
page.on('requestfailed', (r) => errors.push(`REQFAIL ${r.url()} :: ${r.failure()?.errorText}`));

await page.goto(`http://127.0.0.1:${port}${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready === true', null, { timeout: 90000 });
await page.waitForTimeout(3500);

const cdp = await ctx.newCDPSession(page);
const P = (pts) => pts.map((p, i) => ({ x: p.x, y: p.y, radiusX: 14, radiusY: 14, force: 1, id: p.id ?? (i + 1) }));
const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: P(pts) });
async function tapAt(x, y, hold = 60) {
  await send('touchStart', [{ x, y, id: 1 }]);
  await page.waitForTimeout(hold);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(260);
}
async function swipe(x0, y0, x1, y1, steps = 12, dwell = 12) {
  await send('touchStart', [{ x: x0, y: y0, id: 1 }]);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await send('touchMove', [{ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, id: 1 }]);
    await page.waitForTimeout(dwell);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
}
const R = {};
const shot = (n) => page.screenshot({ path: join(OUT, `rv-${n}.png`) });

// ---------------------------------------------------------------- TITLE ----
await shot('01-title');
R.title = await page.evaluate(() => {
  const t = document.getElementById('title');
  const btns = [...document.querySelectorAll('#title .btn, #title .hit')].map((n) => {
    const r = n.getBoundingClientRect();
    return { t: n.textContent.slice(0, 22), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });
  return { visible: !!t && getComputedStyle(t).display !== 'none', btns,
    fadeOpacity: getComputedStyle(document.getElementById('fade')).opacity,
    mode: window.CINDERLINE.game.mode };
});

// -------------------------------------------------- SETTINGS scroll + tap ---
const setBtn = await page.evaluate(() => {
  const n = [...document.querySelectorAll('#title .btn')].find((b) => b.textContent.startsWith('SETTINGS'));
  const r = n.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await tapAt(setBtn.x, setBtn.y);
await page.waitForTimeout(300);
R.settingsGeom = await page.evaluate(() => {
  const p = window.CINDERLINE.game.menus.settingsPanel;
  const r = p.getBoundingClientRect();
  return { panel: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    scrollH: p.scrollHeight, clientH: p.clientHeight, screensTall: +(p.scrollHeight / p.clientHeight).toFixed(2) };
});
const before = await page.evaluate(() => JSON.stringify(window.CINDERLINE.game.menus.settings));
for (let i = 0; i < 8; i++) await swipe(330, 300, 330, 100, 10, 10);
await page.waitForTimeout(400);
await shot('02-settings-bottom');
R.settingsScroll = await page.evaluate(() => {
  const p = window.CINDERLINE.game.menus.settingsPanel;
  const items = [...p.querySelectorAll('.item')];
  const last = items[items.length - 1];
  const lr = last.getBoundingClientRect();
  const mid = document.elementFromPoint(lr.x + lr.width / 2, lr.y + lr.height / 2);
  // Every row: is a touch at its centre delivered to it?
  const blocked = items.filter((n) => {
    const r = n.getBoundingClientRect();
    if (r.top < 0 || r.bottom > 375) return false;
    const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !(h && (h === n || n.contains(h) || h.contains(n)));
  }).map((n) => {
    const r = n.getBoundingClientRect();
    const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { row: n.textContent.slice(0, 20), blockedBy: h ? (h.className || h.tagName) : 'null',
      top: Math.round(r.top), h: Math.round(r.height) };
  });
  return { scrollTop: Math.round(p.scrollTop), atBottom: p.scrollTop + p.clientHeight >= p.scrollHeight - 4,
    lastRow: last.textContent.slice(0, 30), lastRowTop: Math.round(lr.top), lastRowH: Math.round(lr.height),
    lastRowHit: !!(mid && (mid === last || last.contains(mid))),
    lastRowHitEl: mid ? (mid.className || mid.tagName) : null, blocked };
});
R.settingsUnchangedByScroll = (await page.evaluate(() => JSON.stringify(window.CINDERLINE.game.menus.settings))) === before;
// tap the last row
const lastPos = await page.evaluate(() => {
  const p = window.CINDERLINE.game.menus.settingsPanel;
  const items = [...p.querySelectorAll('.item')];
  const last = items[items.length - 1];
  const r = last.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, before: JSON.stringify(window.CINDERLINE.game.menus.settings) };
});
await tapAt(lastPos.x, lastPos.y);
R.lastRowTapChanged = (await page.evaluate(() => JSON.stringify(window.CINDERLINE.game.menus.settings))) !== lastPos.before;

// close settings, return to title
await page.evaluate(() => { window.CINDERLINE.game.menus.closePause?.(); });
await page.waitForTimeout(200);

// ----------------------------------------------------------------- PLAY ----
await page.evaluate(() => window.CINDERLINE.startNewGame());
await page.waitForTimeout(5000);
await shot('03-play');
R.play = await page.evaluate(() => ({ mode: window.CINDERLINE.game.mode,
  hudHidden: document.getElementById('hud').classList.contains('hidden'),
  fade: getComputedStyle(document.getElementById('fade')).opacity }));

// control geometry + pairwise gaps
R.controls = await page.evaluate(() => {
  const sel = '#hud .abtn, #hud .sysbtn, #hud .hit, .abtn, .sysbtn';
  const nodes = [...new Set([...document.querySelectorAll(sel)])].filter((n) => {
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden';
  });
  const list = nodes.map((n) => {
    const r = n.getBoundingClientRect();
    return { id: (n.className || '') + '|' + (n.dataset.act || n.textContent || '').trim().slice(0, 12),
      x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      disabled: n.classList.contains('dis') };
  });
  const gaps = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
    const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
    const g = (dx === 0 && dy === 0) ? -1 : Math.hypot(dx, dy);
    if (g < 12) gaps.push({ a: a.id, b: b.id, gap: +g.toFixed(1) });
  }
  // also: the .actions container dead area
  const act = document.querySelector('.actions');
  const ar = act ? act.getBoundingClientRect() : null;
  const pe = act ? getComputedStyle(act).pointerEvents : null;
  // sample the container rect: what fraction routes to a button?
  let hitPix = 0, total = 0, containerSwallow = 0;
  if (ar) {
    for (let y = ar.y + 2; y < ar.y + ar.height; y += 4) for (let x = ar.x + 2; x < ar.x + ar.width; x += 4) {
      total++;
      const e = document.elementFromPoint(x, y);
      if (e && e.classList.contains('abtn')) hitPix++;
      else if (e && (e === act || e.id === 'hud')) containerSwallow++;
    }
  }
  return { list, gaps, actions: ar && { x: Math.round(ar.x), y: Math.round(ar.y), w: Math.round(ar.width), h: Math.round(ar.height), pointerEvents: pe },
    coverage: total ? +(hitPix / total * 100).toFixed(1) : null,
    swallowed: total ? +(containerSwallow / total * 100).toFixed(1) : null };
});

// ------------------------------------------- three-finger move+look+attack --
await page.evaluate(() => { window.__lookLog = []; const C = window.CINDERLINE;
  const cam = C.game.camera; window.__yaw0 = cam.yaw; });
const atkBtn = await page.evaluate(() => {
  const n = document.querySelector('.abtn.attack'); const r = n.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
// finger 1: left stick; finger 2: right look drag; finger 3: attack
await send('touchStart', [{ x: 120, y: 250, id: 1 }]);
await page.waitForTimeout(60);
await send('touchStart', [{ x: 120, y: 250, id: 1 }, { x: 420, y: 140, id: 2 }]);
await page.waitForTimeout(60);
for (let i = 1; i <= 12; i++) {
  await send('touchMove', [{ x: 120 + i * 3, y: 250 - i * 3, id: 1 }, { x: 420 + i * 6, y: 140, id: 2 }]);
  await page.waitForTimeout(28);
}
const st1 = await page.evaluate(() => { const C = window.CINDERLINE;
  return { move: { ...C.input.move }, yaw: C.game.camera.yaw, dyaw: C.game.camera.yaw - window.__yaw0,
    stickActive: C.input._stick.active }; });
await send('touchStart', [{ x: 120 + 36, y: 250 - 36, id: 1 }, { x: 420 + 72, y: 140, id: 2 }, { x: atkBtn.x, y: atkBtn.y, id: 3 }]);
await page.waitForTimeout(140);
const st2 = await page.evaluate(() => { const C = window.CINDERLINE;
  return { move: { ...C.input.move }, attackDown: C.input.buttons.attack.down || C.input.buttons.attack._rawDown,
    playerState: C.game.player.state, stickActive: C.input._stick.active,
    yaw: C.game.camera.yaw }; });
await send('touchEnd', [{ x: 120 + 36, y: 250 - 36, id: 1 }, { x: 420 + 72, y: 140, id: 2 }]);
await page.waitForTimeout(200);
const st3 = await page.evaluate(() => { const C = window.CINDERLINE;
  return { move: { ...C.input.move }, attackDown: C.input.buttons.attack.down,
    playerState: C.game.player.state, anim: C.game.player.animator?.action?.name || null }; });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(400);
const st4 = await page.evaluate(() => { const C = window.CINDERLINE;
  return { move: { ...C.input.move }, stickActive: C.input._stick.active,
    attackDown: C.input.buttons.attack.down, camPtr: C.input._camPtr.id }; });
R.threeFinger = { st1, st2, st3, st4 };

// ------------------------------------------------ DIALOGUE 5-choice node ----
await page.evaluate(() => {
  const C = window.CINDERLINE;
  C.game.director.state.items = { salvage: 20 };
  if (C.game.director.state.addItem) C.game.director.state.addItem('salvage', 20);
  C.game.director.openTrade();
});
await page.waitForTimeout(400);
// finish typing
await page.evaluate(() => { const d = window.CINDERLINE.game.dialogueUI; d.shown = d.full.length; d.typing = false; d._render(); d._afterType(); });
await page.waitForTimeout(500);
await shot('04-dialogue-5choice');
R.dialogue = await page.evaluate(() => {
  const d = window.CINDERLINE.game.dialogueUI;
  const wrap = d.choicesNode;
  const wr = wrap.getBoundingClientRect();
  const cs = [...wrap.querySelectorAll('.dlg-choice')].map((n) => {
    const r = n.getBoundingClientRect();
    return { t: n.textContent.slice(0, 26), top: Math.round(r.top), bottom: Math.round(r.bottom),
      h: Math.round(r.height), fullyVisible: r.top >= wr.top - 1 && r.bottom <= wr.bottom + 1 };
  });
  return { n: cs.length, wrap: { top: Math.round(wr.top), h: Math.round(wr.height) },
    scrollH: wrap.scrollHeight, clientH: wrap.clientHeight, choices: cs,
    fullyVisible: cs.filter((c) => c.fullyVisible).length, moreClass: d.choiceWrap.className };
});
// drag that ends on a choice must not commit
const dlgBefore = await page.evaluate(() => window.CINDERLINE.game.director.state.items?.salvage ?? null);
const c0 = await page.evaluate(() => {
  const n = document.querySelector('.dlg-choice'); const r = n.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await swipe(c0.x, c0.y + 60, c0.x, c0.y, 10, 12);
await page.waitForTimeout(300);
R.dragOnChoice = await page.evaluate(() => ({
  stillInDialogue: window.CINDERLINE.game.mode === 'dialogue' || window.CINDERLINE.game.mode === window.CINDERLINE.MODE.DIALOGUE,
  choicesStillUp: !!document.querySelector('.dlg-choice'),
  node: window.CINDERLINE.game.director.dialogue?.node?.text?.slice(0, 30) || null,
}));
R.dlgSalvageAfterDrag = await page.evaluate(() => window.CINDERLINE.game.director.state.items?.salvage ?? null);
R.dlgSalvageBefore = dlgBefore;
// now a real tap on a choice
await tapAt(c0.x, c0.y);
R.tapOnChoice = await page.evaluate(() => ({ salvage: window.CINDERLINE.game.director.state.items?.salvage ?? null,
  node: window.CINDERLINE.game.dialogueUI.full.slice(0, 30) }));
// close dialogue
await page.evaluate(() => { try { window.CINDERLINE.game.director.dialogue.end?.(); } catch {}
  window.CINDERLINE.game.dialogueUI.hide(); window.CINDERLINE.game.setMode(window.CINDERLINE.MODE.PLAY);
  window.CINDERLINE.game.hud.setVisible(true); });
await page.waitForTimeout(400);

// ------------------------------------------------------------ PAUSE HUD -----
await page.evaluate(() => window.CINDERLINE.game.emit('ui:menu'));
await page.waitForTimeout(500);
R.pause = await page.evaluate(() => {
  const hud = document.getElementById('hud');
  const cs = getComputedStyle(hud);
  const lung0 = window.CINDERLINE.game.player.lungs.sat;
  return { hudClass: hud.className, opacity: cs.opacity, pointerEvents: cs.pointerEvents, display: cs.display,
    visibility: cs.visibility, lung0 };
});
await page.waitForTimeout(2500);
R.pauseLungs = await page.evaluate(() => ({ sat: window.CINDERLINE.game.player.lungs.sat,
  hp: window.CINDERLINE.game.player.hp }));
await shot('05-pause');
await page.evaluate(() => window.CINDERLINE.game.menus.closePause());
await page.waitForTimeout(400);

// ---------------------------------------------------------------- DEATH -----
await page.evaluate(() => { const C = window.CINDERLINE;
  C.game.player.hp = 0; C.game.player.kill?.('gas'); });
await page.waitForTimeout(4000);
R.death = await page.evaluate(() => ({ mode: window.CINDERLINE.game.mode,
  on: !!document.querySelector('.screen.death.on'),
  hudHidden: document.getElementById('hud').classList.contains('hidden'),
  fade: getComputedStyle(document.getElementById('fade')).opacity }));
await shot('06-death');

// --------------------------------------------------------------- ENDING -----
await page.evaluate(async () => {
  const C = window.CINDERLINE;
  C.game.menus.hideDeath();
  C.game.player.dead = false; C.game.player.hp = C.game.player.maxHp;
  const S = C.game.director.state;
  S.set('published'); S.set('trench_open');
  await C.game.director.finish();
});
await page.waitForTimeout(2500);
await shot('07-ending');
R.ending = await page.evaluate(() => {
  const n = document.querySelector('.screen.ending');
  const cs = n && getComputedStyle(n);
  const fade = document.getElementById('fade');
  const fs = getComputedStyle(fade);
  const title = document.querySelector('.screen.ending .k, .screen.ending h1, .screen.ending .end-title');
  const tr = title && title.getBoundingClientRect();
  const midEl = title ? document.elementFromPoint(tr.x + 4, tr.y + tr.height / 2) : null;
  return { on: !!(n && n.classList.contains('on')), z: cs && cs.zIndex, opacity: cs && cs.opacity,
    fadeOpacity: fs.opacity, fadeZ: fs.zIndex, fadePE: fs.pointerEvents,
    titleText: title && title.textContent.slice(0, 40),
    titleTop: tr && Math.round(tr.top),
    topmostAtTitle: midEl ? (midEl.className || midEl.id || midEl.tagName) : null,
    body: (document.querySelector('.screen.ending .scroll')?.textContent || '').slice(0, 80) };
});

writeFileSync(join(OUT, 'rv-report.json'), JSON.stringify({ R, logs, errors }, null, 2));
console.log(JSON.stringify(R, null, 2));
console.log('--- console (' + logs.length + ') ---');
console.log(logs.slice(0, 40).join('\n'));
console.log('--- errors (' + errors.length + ') ---');
console.log(errors.slice(0, 20).join('\n'));
await browser.close();
server.close();
