#!/usr/bin/env node
/**
 * GB-TOUCH-SMOKE — the visible touch controls, driven from real touch points.
 *
 * The Gate B representative slice enters through the production input chain,
 * but it presses buttons by name: it proves the wiring behind a control and
 * says nothing about whether a thumb can land on one. This does the other
 * half. Every press below is a touch dispatched at a screen coordinate read
 * off the rendered element, at 667x375 — the size of an iPhone SE in
 * landscape, which is the target device.
 *
 * What it can and cannot show:
 *   · it measures CSS pixels in a mobile-emulated Chromium, so it can falsify
 *     a target that is too small, off-screen, overlapped or dead. It is NOT a
 *     measurement on real glass with a real thumb — see docs/STATE.md B1.
 *   · it drives Chromium's touch pipeline (Input.dispatchTouchEvent), which is
 *     what produces the pointer events the game listens to. It is not a claim
 *     about iOS Safari gesture behaviour.
 *
 *   node tools/touch_smoke.mjs
 *   node tools/touch_smoke.mjs --force-failure   prove the runner can fail
 *   node tools/touch_smoke.mjs --headed
 *
 * Requires a build in dist/ (npm run test:touch builds first).
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const EVIDENCE_DIR = join(ROOT, 'AI_DEVELOPMENT', 'EVIDENCE');
const FORCE_FAILURE = process.argv.includes('--force-failure');

/** iPhone SE 3rd generation, landscape. The stated target viewport. */
const W = 667, H = 375;
/** The project's own hit-target floor, in CSS px. */
const MIN_TARGET = 44;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
};
const BASE = '/cinderline-test';
const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (!p.startsWith(BASE)) { res.writeHead(404); res.end('outside base'); return; }
  p = p.slice(BASE.length) || '/';
  if (p.endsWith('/')) p += 'index.html';
  const file = join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, ''));
  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, r));
const URL_ = `http://127.0.0.1:${server.address().port}${BASE}/index.html`;

const checks = [];
const measurements = {};
const ok = (name, detail = '') => checks.push({ name, pass: true, detail });
const bad = (name, detail) => checks.push({ name, pass: false, detail });
const expect = (cond, name, detail = '') => (cond ? ok(name, detail) : bad(name, detail || 'expected true'));

const browser = await chromium.launch({
  headless: !process.argv.includes('--headed'),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--disable-gpu-sandbox', '--no-sandbox', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));
await page.goto(URL_, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready === true', null, { timeout: 60000 });

// --- raw touch, through Chromium's own touch pipeline -----------------------
const cdp = await ctx.newCDPSession(page);
const points = (list) => list.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), id: p.id }));
const touch = {
  start: (list) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(list) }),
  move: (list) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(list) }),
  /** The points being lifted. An empty list lifts everything still down. */
  end: (list = []) => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: points(list) }),
};

/** Keep the page working while time passes; software GL runs at a few fps. */
const settle = async (ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { await page.evaluate(() => 0); await page.waitForTimeout(40); }
};

// --- into the game ---------------------------------------------------------
await page.evaluate(() => window.CINDERLINE.startNewGame());
await page.waitForFunction(
  () => window.CINDERLINE.game.mode === window.CINDERLINE.MODE.PLAY, null, { timeout: 30000 });
await settle(800);

// Instrument the real systems rather than the input object alone: a tap that
// sets a flag nobody reads is not a working button.
await page.evaluate(() => {
  const C = window.CINDERLINE;
  C.probe = { attackStarts: 0, stickEvents: 0 };
  C.game.on('actor:attackstart', (a) => { if (a === C.game.player) C.probe.attackStarts++; });
  C.input.on('stick', (s) => { if (s) C.probe.stickEvents++; });
});

/** Every control the player can actually see, with its rendered box. */
const controls = await page.evaluate(() => {
  const out = [];
  const add = (name, node) => {
    if (!node) return;
    const r = node.getBoundingClientRect();
    const cs = getComputedStyle(node);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return;
    out.push({
      name, x: r.x, y: r.y, w: r.width, h: r.height,
      cx: r.x + r.width / 2, cy: r.y + r.height / 2,
      pointerEvents: cs.pointerEvents,
    });
  };
  const hud = window.CINDERLINE.game.hud;
  for (const k of Object.keys(hud.buttons)) add(k, hud.buttons[k]);
  add('menu', hud.sysMenu); add('map', hud.sysMap);
  add('lamp', hud.sysLamp); add('meter', hud.sysMeter);
  return out;
});
measurements.controls = controls;

// ------------------------------------------------------------ 1. hit targets
{
  expect(controls.length >= 8, 'layout: the action and system controls are on screen',
    controls.map((c) => c.name).join(','));
  for (const c of controls) {
    expect(c.w >= MIN_TARGET - 0.5 && c.h >= MIN_TARGET - 0.5,
      `layout: ${c.name} is at least ${MIN_TARGET}px`, `${c.w.toFixed(1)}x${c.h.toFixed(1)}`);
    expect(c.x >= 0 && c.y >= 0 && c.x + c.w <= W && c.y + c.h <= H,
      `layout: ${c.name} is fully on screen`, `${c.x.toFixed(0)},${c.y.toFixed(0)}`);
    expect(c.pointerEvents !== 'none', `layout: ${c.name} accepts touches`, c.pointerEvents);
  }
  // Overlapping targets are how a thumb aimed at ROLL commits an attack.
  for (let i = 0; i < controls.length; i++) {
    for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i], b = controls[j];
      const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      expect(ox * oy === 0, `layout: ${a.name} and ${b.name} do not overlap`,
        `${(ox * oy).toFixed(1)}px²`);
    }
  }
  // The action cluster is a positioning frame, over half of it dead space in
  // the corner a right thumb starts camera drags in. It must not take touches.
  const frame = await page.evaluate(() => {
    const n = window.CINDERLINE.game.hud.actions;
    const r = n.getBoundingClientRect();
    return { pe: getComputedStyle(n).pointerEvents, x: r.x, y: r.y, w: r.width, h: r.height };
  });
  expect(frame.pe === 'none', 'layout: the action cluster frame itself swallows nothing', frame.pe);
  measurements.actionFrame = frame;
}

// ------------------------------------------------------- 2. the movement stick
{
  const before = await page.evaluate(() => {
    const p = window.CINDERLINE.game.player;
    return { x: p.pos.x, z: p.pos.z };
  });
  // Anywhere in the left zone plants the stick under the thumb.
  const ox = 110, oy = 250;
  await touch.start([{ x: ox, y: oy, id: 1 }]);
  await settle(120);
  const planted = await page.evaluate(() => {
    const s = window.CINDERLINE.input._stick;
    const el = document.querySelector('#ui .stick') || document.querySelector('.stick');
    const r = el ? el.getBoundingClientRect() : null;
    return { active: s.active, ox: s.ox, oy: s.oy, radius: s.radius,
      visible: !!r && r.width > 0, vx: r ? r.x + r.width / 2 : null, vy: r ? r.y + r.height / 2 : null };
  });
  expect(planted.active, 'stick: a touch in the left zone plants the stick');
  expect(Math.abs(planted.ox - ox) < 2 && Math.abs(planted.oy - oy) < 2,
    'stick: it is planted under the thumb, not at a fixed spot',
    `${planted.ox},${planted.oy} vs ${ox},${oy}`);
  expect(planted.visible && Math.abs(planted.vx - ox) < 6 && Math.abs(planted.vy - oy) < 6,
    'stick: the drawn ring is where the finger is',
    `${planted.vx},${planted.vy} vs ${ox},${oy}`);
  measurements.stick = planted;

  // Push it to full deflection and hold: she should walk.
  await touch.move([{ x: ox, y: oy - 60, id: 1 }]);
  await settle(1400);
  const held = await page.evaluate(() => {
    const C = window.CINDERLINE;
    return { move: { ...C.input.move }, x: C.game.player.pos.x, z: C.game.player.pos.z,
      stickEvents: C.probe.stickEvents };
  });
  expect(held.move.mag > 0.5, 'stick: a full push reads as a full push', String(held.move.mag));
  const walked = Math.hypot(held.x - before.x, held.z - before.z);
  expect(walked > 0.5, 'stick: the player actually walked', `${walked.toFixed(2)}m`);
  expect(held.stickEvents > 1, 'stick: the HUD was told to follow the thumb', String(held.stickEvents));

  await touch.end([]);
  await settle(200);
  const released = await page.evaluate(() => ({
    active: window.CINDERLINE.input._stick.active, mag: window.CINDERLINE.input.move.mag }));
  expect(!released.active && released.mag === 0, 'stick: lifting the thumb stops her',
    JSON.stringify(released));
  measurements.walkedMetres = walked;
}

// ------------------------------------------------------------ 3. the camera
{
  // A point on the right half that is not on any control.
  const free = { x: W - 90, y: 90 };
  const clashes = controls.filter((c) => free.x >= c.x && free.x <= c.x + c.w &&
    free.y >= c.y && free.y <= c.y + c.h);
  expect(clashes.length === 0, 'camera: the drag point is not on a button',
    clashes.map((c) => c.name).join(','));

  const yaw0 = await page.evaluate(() => window.CINDERLINE.game.camera.yaw);
  await touch.start([{ x: free.x, y: free.y, id: 2 }]);
  for (let i = 1; i <= 6; i++) {
    await touch.move([{ x: free.x - i * 12, y: free.y + i * 2, id: 2 }]);
    await page.waitForTimeout(30);
  }
  await settle(300);
  await touch.end([]);
  const yaw1 = await page.evaluate(() => window.CINDERLINE.game.camera.yaw);
  expect(Math.abs(yaw1 - yaw0) > 0.05, 'camera: a drag on the right turns the camera',
    `${yaw0.toFixed(3)} -> ${yaw1.toFixed(3)}`);
  measurements.cameraYaw = { yaw0, yaw1 };
}

// ------------------------------------------------- 4. attack, dodge, guard
{
  const byName = Object.fromEntries(controls.map((c) => [c.name, c]));
  for (const name of ['attack', 'dodge', 'guard']) {
    const c = byName[name];
    if (!c) { bad(`button: ${name} is on screen`, 'not found'); continue; }
    await touch.start([{ x: c.cx, y: c.cy, id: 3 }]);
    await settle(260);
    const down = await page.evaluate((n) => {
      const b = window.CINDERLINE.input.buttons[n];
      return { raw: b._rawDown, down: b.down, cls: [...document.querySelectorAll('.abtn')]
        .filter((e) => e.classList.contains('down')).length };
    }, name);
    expect(down.raw === true, `button: ${name} registers a real touch at its centre`,
      JSON.stringify(down));
    expect(down.cls >= 1, `button: ${name} shows the player it is pressed`, String(down.cls));
    await touch.end([]);
    await settle(260);
    const up = await page.evaluate((n) => {
      const b = window.CINDERLINE.input.buttons[n];
      return { raw: b._rawDown, stuck: [...document.querySelectorAll('.abtn.down')].length };
    }, name);
    expect(up.raw === false, `button: ${name} lets go`, JSON.stringify(up));
    expect(up.stuck === 0, `button: ${name} does not latch on`, String(up.stuck));
  }
  const fired = await page.evaluate(() => window.CINDERLINE.probe.attackStarts);
  expect(fired > 0, 'button: the attack tap reached the combat system, not just the input layer',
    String(fired));
  measurements.attackStarts = fired;
}

// ------------------------------------------------------------- 5. mis-hits
{
  // Dead space inside the action cluster's frame, clear of every circle.
  const f = measurements.actionFrame;
  let dead = null;
  for (let x = f.x + 4; x < f.x + f.w - 4 && !dead; x += 4) {
    for (let y = f.y + 4; y < f.y + f.h - 4; y += 4) {
      const on = controls.some((c) => x >= c.x - 2 && x <= c.x + c.w + 2 &&
        y >= c.y - 2 && y <= c.y + c.h + 2);
      if (!on) { dead = { x, y }; break; }
    }
  }
  expect(!!dead, 'mis-hit: the cluster has dead space to aim at (that is the point of the test)');
  if (dead) {
    const before = await page.evaluate(() => ({
      any: Object.values(window.CINDERLINE.input.buttons).some((b) => b._rawDown),
      attacks: window.CINDERLINE.probe.attackStarts,
    }));
    await touch.start([{ x: dead.x, y: dead.y, id: 4 }]);
    await settle(260);
    const during = await page.evaluate(() => ({
      pressed: Object.entries(window.CINDERLINE.input.buttons)
        .filter(([, b]) => b._rawDown).map(([k]) => k),
      stickActive: window.CINDERLINE.input._stick.active,
    }));
    await touch.end([]);
    await settle(200);
    const after = await page.evaluate(() => window.CINDERLINE.probe.attackStarts);
    expect(during.pressed.length === 0, 'mis-hit: dead space between the buttons presses nothing',
      during.pressed.join(','));
    expect(after === before.attacks, 'mis-hit: and starts no attack', `${before.attacks} -> ${after}`);
    expect(!during.stickActive, 'mis-hit: nor does it plant the movement stick in the camera zone');
    measurements.deadSpace = dead;
  }
}

// -------------------------------------------------------- 6. two thumbs
{
  const attack = controls.find((c) => c.name === 'attack');
  const startAttacks = await page.evaluate(() => window.CINDERLINE.probe.attackStarts);
  const stick = { x: 110, y: 250 };
  await touch.start([{ x: stick.x, y: stick.y, id: 5 }]);
  await touch.move([{ x: stick.x + 50, y: stick.y - 30, id: 5 }]);
  await settle(150);
  // Second finger lands while the first is still down and still moving.
  await touch.start([{ x: stick.x + 50, y: stick.y - 30, id: 5 },
    { x: attack.cx, y: attack.cy, id: 6 }]);
  await settle(300);
  const both = await page.evaluate(() => ({
    stick: window.CINDERLINE.input._stick.active,
    mag: window.CINDERLINE.input.move.mag,
    attack: window.CINDERLINE.input.buttons.attack._rawDown,
  }));
  expect(both.stick && both.mag > 0.2, 'two thumbs: moving while striking keeps moving',
    JSON.stringify(both));
  expect(both.attack === true, 'two thumbs: the strike registers while the stick is held',
    JSON.stringify(both));

  // Lift the action finger; the stick must survive its neighbour leaving.
  await touch.end([{ x: attack.cx, y: attack.cy, id: 6 }]);
  await settle(200);
  const after = await page.evaluate(() => ({
    stick: window.CINDERLINE.input._stick.active,
    attack: window.CINDERLINE.input.buttons.attack._rawDown,
    attacks: window.CINDERLINE.probe.attackStarts,
  }));
  expect(after.stick === true, 'two thumbs: lifting one finger does not drop the other');
  expect(after.attack === false, 'two thumbs: the button it lifted from is released');
  expect(after.attacks > startAttacks, 'two thumbs: the strike really happened',
    `${startAttacks} -> ${after.attacks}`);
  await touch.end([]);
  await settle(200);
}

// ------------------------------------------------------- 7. dialogue choices
{
  const opened = await page.evaluate(async () => {
    const C = window.CINDERLINE;
    return await new Promise((resolve) => {
      // A real conversation through the real runner. The probe only opens it;
      // the answer below is given by touching the screen.
      C.game.director.startConversation({
        id: 'touchProbe',
        start: 'start',
        nodes: {
          start: {
            text: 'Probe line.',
            choices: [{ text: 'First answer', goto: 'a' }, { text: 'Second answer', goto: 'b' }],
          },
          a: { text: 'You said first.', next: 'end' },
          b: { text: 'You said second.', next: 'end' },
        },
      }, null, () => {});
      setTimeout(() => resolve(C.game.mode === C.MODE.DIALOGUE), 400);
    });
  });
  expect(opened, 'dialogue: a conversation is on screen to answer');

  const choiceBoxes = await page.evaluate(() => [...document.querySelectorAll('.dlg-choice')]
    .map((n) => {
      const r = n.getBoundingClientRect();
      return { text: n.textContent, x: r.x, y: r.y, w: r.width, h: r.height,
        cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    }));
  measurements.choices = choiceBoxes;
  expect(choiceBoxes.length === 2, 'dialogue: both answers are drawn', String(choiceBoxes.length));
  for (const c of choiceBoxes) {
    expect(c.h >= MIN_TARGET - 0.5, `dialogue: "${c.text.slice(0, 18)}" is at least ${MIN_TARGET}px tall`,
      c.h.toFixed(1));
    expect(c.x >= 0 && c.x + c.w <= W && c.y >= 0 && c.y + c.h <= H,
      `dialogue: "${c.text.slice(0, 18)}" is fully on screen`,
      `${c.x.toFixed(0)},${c.y.toFixed(0)} ${c.w.toFixed(0)}x${c.h.toFixed(0)}`);
  }

  if (choiceBoxes.length === 2) {
    // A drag that ends over a row must NOT commit that row — scrolling a choice
    // list past an answer is not choosing it.
    const second = choiceBoxes[1];
    await touch.start([{ x: second.cx, y: second.cy - 30, id: 7 }]);
    await touch.move([{ x: second.cx, y: second.cy, id: 7 }]);
    await touch.end([]);
    await settle(300);
    const afterDrag = await page.evaluate(() => window.CINDERLINE.game.mode === window.CINDERLINE.MODE.DIALOGUE);
    expect(afterDrag, 'dialogue: a drag that lands on an answer does not commit it');

    await touch.start([{ x: second.cx, y: second.cy, id: 8 }]);
    await settle(120);
    await touch.end([]);
    await settle(400);
    const answered = await page.evaluate(() => {
      const dlg = document.getElementById('dlg');
      return { txt: dlg ? (dlg.querySelector('.dlg-txt')?.textContent || '') : '',
        choices: document.querySelectorAll('.dlg-choice').length };
    });
    expect(answered.txt.includes('second'), 'dialogue: the answer the thumb landed on is the one taken',
      answered.txt.slice(0, 40));
    expect(answered.choices === 0, 'dialogue: the list closes once answered', String(answered.choices));

    // "TAP TO CONTINUE" is a touch target too, and it is the way back to play.
    const box = await page.evaluate(() => {
      const r = document.querySelector('#dlg .dlg-box').getBoundingClientRect();
      return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, h: r.height };
    });
    await touch.start([{ x: box.cx, y: box.cy, id: 9 }]);
    await settle(120);
    await touch.end([]);
    await page.waitForFunction(
      () => window.CINDERLINE.game.mode === window.CINDERLINE.MODE.PLAY, null, { timeout: 8000 })
      .then(() => ok('dialogue: tapping the box closes the conversation and returns to play'))
      .catch(() => bad('dialogue: tapping the box closes the conversation and returns to play',
        'still not in play mode'));
    await settle(400);
  }
}

// ------------------------------------------------------ 8. turning the device
{
  await page.setViewportSize({ width: H, height: W });     // portrait
  await settle(900);
  const portrait = await page.evaluate(() => {
    const r = document.getElementById('rotate');
    return { on: !!r && r.classList.contains('on'),
      pe: r ? getComputedStyle(r).pointerEvents : 'none',
      paused: window.CINDERLINE.engine.isPaused,
      attacks: window.CINDERLINE.probe.attackStarts };
  });
  expect(portrait.on, 'orientation: turning to portrait raises the landscape prompt');
  expect(portrait.paused, 'orientation: and stops the world behind it');
  expect(portrait.pe !== 'none', 'orientation: the prompt is a barrier, not decoration', portrait.pe);

  // Touching where the attack button used to be must not reach the game.
  const attack = controls.find((c) => c.name === 'attack');
  await touch.start([{ x: Math.min(attack.cx, H - 10), y: Math.min(attack.cy, W - 10), id: 9 }]);
  await settle(250);
  await touch.end([]);
  const throughPlate = await page.evaluate(() => ({
    pressed: Object.values(window.CINDERLINE.input.buttons).some((b) => b._rawDown),
    attacks: window.CINDERLINE.probe.attackStarts,
  }));
  expect(!throughPlate.pressed && throughPlate.attacks === portrait.attacks,
    'orientation: touches do not fall through the prompt to the controls behind it',
    JSON.stringify(throughPlate));

  await page.setViewportSize({ width: W, height: H });      // back to landscape
  await settle(900);
  const back = await page.evaluate(() => {
    const r = document.getElementById('rotate');
    const hud = window.CINDERLINE.game.hud;
    const out = { on: !!r && r.classList.contains('on'), paused: window.CINDERLINE.engine.isPaused,
      controls: [] };
    for (const k of Object.keys(hud.buttons)) {
      const b = hud.buttons[k].getBoundingClientRect();
      out.controls.push({ name: k, w: b.width, h: b.height, x: b.x, y: b.y });
    }
    return out;
  });
  expect(!back.on && !back.paused, 'orientation: turning back resumes play', JSON.stringify(back.paused));
  for (const c of back.controls) {
    expect(c.w >= MIN_TARGET - 0.5 && c.h >= MIN_TARGET - 0.5 &&
      c.x >= 0 && c.y >= 0 && c.x + c.w <= W && c.y + c.h <= H,
      `orientation: ${c.name} is still a ${MIN_TARGET}px target on screen after the turn`,
      `${c.w.toFixed(1)}x${c.h.toFixed(1)} at ${c.x.toFixed(0)},${c.y.toFixed(0)}`);
  }
  measurements.afterRotate = back.controls;

  // And it still works.
  const attack2 = back.controls.find((c) => c.name === 'attack');
  const before = await page.evaluate(() => window.CINDERLINE.probe.attackStarts);
  await touch.start([{ x: attack2.x + attack2.w / 2, y: attack2.y + attack2.h / 2, id: 10 }]);
  await settle(260);
  await touch.end([]);
  await settle(400);
  const after = await page.evaluate(() => window.CINDERLINE.probe.attackStarts);
  expect(after > before, 'orientation: the controls still answer a thumb after the turn',
    `${before} -> ${after}`);
}

const engineErrors = pageErrors.filter((e) => !e.includes('probe:'));
expect(engineErrors.length === 0, 'run: no uncaught errors during the whole run',
  engineErrors.slice(0, 3).join(' | '));

await browser.close();
server.close();

// ---------------------------------------------------------------- report ---
if (FORCE_FAILURE) bad('forced failure', '--force-failure was passed');
const failed = checks.filter((c) => !c.pass);
for (const c of checks) console.log(`  ${c.pass ? 'ok  ' : 'FAIL'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);

mkdirSync(EVIDENCE_DIR, { recursive: true });
writeFileSync(join(EVIDENCE_DIR, 'GB-TOUCH-SMOKE.json'), JSON.stringify({
  task: 'GB-TOUCH-SMOKE',
  scope: 'Visible touch targets driven by dispatched touch points in mobile-emulated Chromium at ' +
    `${W}x${H}. Not a measurement on a real device, and not a claim about iOS Safari gestures.`,
  viewport: { width: W, height: H, minTarget: MIN_TARGET },
  measurements,
  checks,
  passed: failed.length === 0,
}, null, 2));

console.log(`\n${failed.length ? 'TOUCH SMOKE FAILED' : 'TOUCH SMOKE OK'} — ` +
  `${checks.length - failed.length}/${checks.length} checks`);
process.exit(failed.length ? 1 : 0);
