#!/usr/bin/env node

/**
 * Fast iPhone SE (3rd generation) browser gate for CINDERLINE.
 *
 * Playwright WebKit exercises the production build at 667x375 / DPR 2. Real
 * Playwright touchscreen taps cover menus and action buttons; deterministic
 * PointerEvents cover a simultaneous move-and-attack path that Linux WebKit
 * cannot express through Playwright's single-touch API. The later Appium gate
 * repeats that path with two trusted touches in Mobile Safari.
 *
 * This is a rendering, interaction, persistence, and hang-regression gate. It
 * is not evidence for physical-phone FPS, GPU speed, thermals, memory pressure,
 * hand reach, haptics, speakers, or audio latency.
 */

import { createServer } from 'node:http';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { chromium, devices, webkit } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const OUTPUT = resolve(ROOT, process.env.CINDERLINE_WEBKIT_OUTPUT || 'test-results/iphone-webkit');
const BASELINE = resolve(ROOT, 'tests/baselines/iphone-se3-webkit-gameplay.png');
const ACTUAL = resolve(OUTPUT, 'iphone-se3-webkit-gameplay.png');
const CANDIDATE = resolve(OUTPUT, 'iphone-se3-webkit-baseline-candidate.png');
const DIFF = resolve(OUTPUT, 'iphone-se3-webkit-diff.png');
const REPORT = resolve(OUTPUT, 'report.json');
const TRACE = resolve(OUTPUT, 'trace.zip');
const BROWSER_NAME = process.env.CINDERLINE_BROWSER || 'webkit';
const EXTERNAL_URL = process.env.CINDERLINE_TEST_URL || '';
const REQUIRE_BASELINE = process.env.CINDERLINE_REQUIRE_BASELINE === '1';
const BOOT_TIMEOUT = Number(process.env.CINDERLINE_BOOT_TIMEOUT || 180000);
const FRAME_TIMEOUT = Number(process.env.CINDERLINE_FRAME_TIMEOUT || 90000);
const FRAME_GAP_HANG_LIMIT = Number(process.env.CINDERLINE_FRAME_GAP_HANG_LIMIT || 5000);
const W = 667;
const H = 375;

mkdirSync(OUTPUT, { recursive: true });

const report = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  target: 'iPhone SE (3rd gen) landscape / Playwright WebKit',
  browser: BROWSER_NAME,
  checks: [],
  timings: {},
  device: null,
  layout: null,
  interaction: {},
  persistence: null,
  soak: null,
  screenshots: {},
  visualRegression: null,
  errors: { page: [], console: [], request: [], http: [] },
  failures: [],
  status: 'running',
};

function check(condition, name, detail = '') {
  const passed = Boolean(condition);
  report.checks.push({ name, passed, detail });
  if (!passed) report.failures.push(`${name}: ${detail}`);
  return passed;
}

function quantile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function imageStats(png) {
  let sum = 0;
  let sumSq = 0;
  let dark = 0;
  const pixels = png.width * png.height;
  for (let index = 0; index < png.data.length; index += 4) {
    const luma = 0.2126 * png.data[index]
      + 0.7152 * png.data[index + 1]
      + 0.0722 * png.data[index + 2];
    sum += luma;
    sumSq += luma * luma;
    if (luma < 4) dark++;
  }
  const mean = sum / pixels;
  return {
    width: png.width,
    height: png.height,
    meanLuma: +mean.toFixed(3),
    lumaStdDev: +Math.sqrt(Math.max(0, sumSq / pixels - mean * mean)).toFixed(3),
    nearBlackRatio: +(dark / pixels).toFixed(5),
  };
}

function compareScreenshot() {
  const actual = PNG.sync.read(readFileSync(ACTUAL));
  const stats = imageStats(actual);
  const result = {
    baseline: BASELINE.slice(ROOT.length + 1),
    baselinePresent: existsSync(BASELINE),
    actual: ACTUAL.slice(ROOT.length + 1),
    diff: null,
    diffPixels: null,
    diffRatio: null,
    threshold: 0.25,
    maximumDiffRatio: 0.15,
    stats,
  };

  check(stats.meanLuma > 5 && stats.meanLuma < 248, 'gameplay render has usable luminance', JSON.stringify(stats));
  check(stats.lumaStdDev > 11, 'gameplay render is not flat or cleared', JSON.stringify(stats));
  check(stats.nearBlackRatio < 0.86, 'gameplay render is not predominantly black', JSON.stringify(stats));

  if (BROWSER_NAME !== 'webkit') {
    result.skipped = `visual comparison is WebKit-only; current surrogate is ${BROWSER_NAME}`;
    return result;
  }

  if (!result.baselinePresent) {
    copyFileSync(ACTUAL, CANDIDATE);
    report.screenshots.baselineCandidate = CANDIDATE.slice(ROOT.length + 1);
    if (REQUIRE_BASELINE) {
      check(false, 'reviewed WebKit visual baseline exists',
        `promote ${CANDIDATE.slice(ROOT.length + 1)} to ${BASELINE.slice(ROOT.length + 1)}`);
    }
    return result;
  }

  const baseline = PNG.sync.read(readFileSync(BASELINE));
  if (baseline.width !== actual.width || baseline.height !== actual.height) {
    check(false, 'visual baseline dimensions match',
      `${baseline.width}x${baseline.height} != ${actual.width}x${actual.height}`);
    return result;
  }

  const diff = new PNG({ width: actual.width, height: actual.height });
  const diffPixels = pixelmatch(
    baseline.data,
    actual.data,
    diff.data,
    actual.width,
    actual.height,
    { threshold: result.threshold, includeAA: false, diffColor: [255, 68, 68] },
  );
  const diffRatio = diffPixels / (actual.width * actual.height);
  writeFileSync(DIFF, PNG.sync.write(diff));
  result.diff = DIFF.slice(ROOT.length + 1);
  result.diffPixels = diffPixels;
  result.diffRatio = +diffRatio.toFixed(6);
  check(diffRatio <= result.maximumDiffRatio, 'visual regression stays within tolerance',
    `ratio=${result.diffRatio}, limit=${result.maximumDiffRatio}`);
  return result;
}

function startServer() {
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  };
  const base = '/cinderline-test';
  const server = createServer((request, response) => {
    let pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    if (!pathname.startsWith(base)) {
      response.writeHead(404);
      response.end('outside test base');
      return;
    }
    pathname = pathname.slice(base.length) || '/';
    if (pathname.endsWith('/')) pathname += 'index.html';
    const relative = normalize(pathname).replace(/^[/\\]+/, '').replace(/^(\.\.[/\\])+/, '');
    const file = join(DIST, relative);
    try {
      const body = readFileSync(file);
      response.writeHead(200, {
        'content-type': mime[extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(404);
      response.end('not found');
    }
  });
  return new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      done({ server, url: `http://127.0.0.1:${address.port}${base}/` });
    });
  });
}

async function waitFrames(page, count, timeout = FRAME_TIMEOUT) {
  const start = await page.evaluate(() => window.CINDERLINE?.engine?.frame ?? -1);
  await page.waitForFunction(
    ({ start, count }) => (window.CINDERLINE?.engine?.frame ?? -1) >= start + count,
    { start, count },
    { timeout, polling: 100 },
  );
  return page.evaluate(() => window.CINDERLINE.engine.frame);
}

async function pointer(page, type, pointerId, x, y, isPrimary = true) {
  await page.evaluate(({ type, pointerId, x, y, isPrimary }) => {
    const target = type === 'pointerdown' ? document.getElementById('gl') : window;
    if (!target) throw new Error('game canvas is missing');
    target.dispatchEvent(new PointerEvent(type, {
      pointerId,
      pointerType: 'touch',
      isPrimary,
      clientX: x,
      clientY: y,
      width: 18,
      height: 18,
      pressure: type === 'pointerup' || type === 'pointercancel' ? 0 : 0.65,
      button: 0,
      buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
      bubbles: true,
      cancelable: true,
      composed: true,
    }));
  }, { type, pointerId, x, y, isPrimary });
}

async function center(page, expression) {
  return page.evaluate((source) => {
    const node = Function(`return (${source})`)();
    if (!node) throw new Error(`missing tap target: ${source}`);
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) throw new Error(`tap target has no box: ${source}`);
    return {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      width: rect.width,
      height: rect.height,
    };
  }, expression);
}

let localServer = null;
let browser = null;
let context = null;
let page = null;

try {
  const baseUrl = EXTERNAL_URL || (localServer = await startServer()).url;
  report.baseUrl = baseUrl;
  const browserType = BROWSER_NAME === 'chromium' ? chromium : webkit;
  browser = await browserType.launch(BROWSER_NAME === 'chromium' ? {
    headless: true,
    args: [
      '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
      '--disable-gpu-sandbox', '--no-sandbox', '--enable-webgl', '--ignore-gpu-blocklist',
    ],
  } : { headless: true });

  const profile = devices['iPhone SE (3rd gen) landscape'];
  if (!profile) throw new Error('Playwright has no iPhone SE (3rd gen) landscape profile');
  report.emulation = { profile: 'iPhone SE (3rd gen) landscape', hasTouch: profile.hasTouch, isMobile: profile.isMobile };
  context = await browser.newContext({
    ...profile,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    colorScheme: 'dark',
    recordVideo: { dir: resolve(OUTPUT, 'video'), size: profile.viewport },
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => report.errors.page.push(error.stack || error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.console.push(message.text());
  });
  page.on('requestfailed', (request) => report.errors.request.push({
    url: request.url(),
    error: request.failure()?.errorText || 'unknown',
  }));
  page.on('response', (response) => {
    if (response.status() >= 400) report.errors.http.push({ url: response.url(), status: response.status() });
  });

  const bootStarted = Date.now();
  const entry = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.CINDERLINE?.ready === true, null,
    { timeout: BOOT_TIMEOUT, polling: 250 });
  report.timings.bootMs = Date.now() - bootStarted;

  const device = await page.evaluate(() => {
    const C = window.CINDERLINE;
    const canvas = document.getElementById('gl').getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      dpr: devicePixelRatio,
      maxTouchPoints: navigator.maxTouchPoints,
      userAgent: navigator.userAgent,
      coarse: matchMedia('(pointer: coarse)').matches,
      landscape: matchMedia('(orientation: landscape)').matches,
      ready: C.ready,
      running: C.engine.running,
      build: C.build,
      tier: C.engine.tier?.name || null,
      canvas: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height },
    };
  });
  report.device = device;
  check(entry?.status() === 200, 'entry responds successfully', `status=${entry?.status()}`);
  check(device.viewport.width === W && device.viewport.height === H,
    'iPhone SE 3 landscape viewport', JSON.stringify(device.viewport));
  check(device.dpr === 2, 'iPhone SE 3 DPR', `dpr=${device.dpr}`);
  check(report.emulation.hasTouch && report.emulation.isMobile && device.coarse,
    'touch emulation and coarse pointer are active',
    JSON.stringify({ ...report.emulation, maxTouchPoints: device.maxTouchPoints, coarse: device.coarse }));
  check(device.landscape, 'landscape orientation is active', `landscape=${device.landscape}`);
  check(device.ready && device.running, 'production engine reaches a running title', JSON.stringify(device));
  check(device.canvas.width === W && device.canvas.height === H, 'render canvas fills the viewport', JSON.stringify(device.canvas));

  const titleLayout = await page.evaluate(() => {
    const buttons = window.CINDERLINE.game.menus.titleButtons;
    const names = ['new', 'settings', 'credits'];
    return {
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      buttons: names.map((name) => {
        const rect = buttons[name].getBoundingClientRect();
        return { name, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }),
    };
  });
  report.layout = { title: titleLayout };
  check(titleLayout.documentWidth <= W && titleLayout.documentHeight <= H,
    'title has no page overflow', JSON.stringify(titleLayout));
  check(titleLayout.buttons.every((item) => item.width >= 44 && item.height >= 44),
    'title controls meet the 44 CSS px floor', JSON.stringify(titleLayout.buttons));

  const newGame = titleLayout.buttons.find((item) => item.name === 'new');
  await page.touchscreen.tap(newGame.x + newGame.width / 2, newGame.y + newGame.height / 2);
  await page.waitForFunction(() => window.CINDERLINE.game.mode === window.CINDERLINE.MODE.PLAY,
    null, { timeout: 30000, polling: 100 });
  await waitFrames(page, 8);
  check(true, 'trusted title tap starts a new game', page.url());

  const controls = await page.evaluate(() => {
    const hud = window.CINDERLINE.game.hud;
    const nodes = { ...hud.buttons, menu: hud.sysMenu, map: hud.sysMap, lamp: hud.sysLamp, meter: hud.sysMeter };
    return Object.entries(nodes).map(([name, node]) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        name,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        visible: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0,
      };
    });
  });
  report.layout.controls = controls;
  check(controls.length === 9, 'all required touch controls are present', controls.map((item) => item.name).join(','));
  check(controls.every((item) => item.visible && item.width >= 44 && item.height >= 44),
    'every touch control is visible and at least 44 CSS px', JSON.stringify(controls));
  check(controls.every((item) => item.x >= 0 && item.y >= 0 && item.x + item.width <= W && item.y + item.height <= H),
    'every touch control remains inside the target viewport', JSON.stringify(controls));

  // Freeze a stable authored gameplay view for the WebKit visual baseline.
  await page.evaluate(() => window.CINDERLINE.setCamera(-70, 11.3, -22, 180, -20));
  await waitFrames(page, 8);
  await page.evaluate(() => window.CINDERLINE.engine.addPause('iphone-webkit-baseline'));
  await page.screenshot({ path: ACTUAL });
  report.screenshots.gameplay = ACTUAL.slice(ROOT.length + 1);
  report.visualRegression = compareScreenshot();
  await page.evaluate(() => {
    const C = window.CINDERLINE;
    C.engine.removePause('iphone-webkit-baseline');
    C.game.teleport('start');
  });
  await waitFrames(page, 5);

  await page.evaluate(() => {
    const C = window.CINDERLINE;
    C.__iphoneProbe = { attackStarts: 0 };
    C.game.on('actor:attackstart', (actor) => {
      if (actor === C.game.player) C.__iphoneProbe.attackStarts++;
    });
  });
  const before = await page.evaluate(() => {
    const player = window.CINDERLINE.game.player;
    return { x: player.pos.x, y: player.pos.y, z: player.pos.z, frame: window.CINDERLINE.engine.frame };
  });
  const attack = controls.find((item) => item.name === 'attack');
  await pointer(page, 'pointerdown', 41, 110, 250, true);
  await pointer(page, 'pointermove', 41, 110, 190, true);
  await waitFrames(page, 4);
  await page.touchscreen.tap(attack.x + attack.width / 2, attack.y + attack.height / 2);
  await waitFrames(page, 20);
  await pointer(page, 'pointerup', 41, 110, 190, true);
  await waitFrames(page, 3);
  const after = await page.evaluate(() => {
    const C = window.CINDERLINE;
    const player = C.game.player;
    return {
      x: player.pos.x,
      y: player.pos.y,
      z: player.pos.z,
      attackStarts: C.__iphoneProbe.attackStarts,
      stickActive: C.input._stick.active,
      moveMagnitude: C.input.move.mag,
      attackRaw: C.input.buttons.attack._rawDown,
      finite: [player.pos.x, player.pos.y, player.pos.z, player.hp].every(Number.isFinite),
    };
  });
  const moved = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
  report.interaction.simultaneousMoveAttack = { before, after, moved: +moved.toFixed(4) };
  check(moved > 0.15, 'left-thumb movement moves the player', `distance=${moved.toFixed(4)}`);
  check(after.attackStarts > 0, 'trusted second touch starts an attack during movement', `attacks=${after.attackStarts}`);
  check(!after.stickActive && after.moveMagnitude === 0 && !after.attackRaw,
    'touch release clears movement and attack', JSON.stringify(after));
  check(after.finite, 'interaction leaves finite player state', JSON.stringify(after));

  const cameraBefore = await page.evaluate(() => ({
    yaw: window.CINDERLINE.game.camera.yaw,
    pitch: window.CINDERLINE.game.camera.pitch,
  }));
  await pointer(page, 'pointerdown', 51, 500, 90, true);
  await pointer(page, 'pointermove', 51, 590, 120, true);
  await waitFrames(page, 3);
  await pointer(page, 'pointerup', 51, 590, 120, true);
  const cameraAfter = await page.evaluate(() => ({
    yaw: window.CINDERLINE.game.camera.yaw,
    pitch: window.CINDERLINE.game.camera.pitch,
  }));
  const cameraDelta = Math.hypot(cameraAfter.yaw - cameraBefore.yaw, cameraAfter.pitch - cameraBefore.pitch);
  report.interaction.camera = { before: cameraBefore, after: cameraAfter, delta: +cameraDelta.toFixed(5) };
  check(cameraDelta > 0.02, 'right-thumb drag moves the camera', `delta=${cameraDelta.toFixed(5)}`);

  const menu = controls.find((item) => item.name === 'menu');
  await page.touchscreen.tap(menu.x + menu.width / 2, menu.y + menu.height / 2);
  await page.waitForFunction(() => window.CINDERLINE.game.mode === window.CINDERLINE.MODE.MENU);
  const pauseShot = resolve(OUTPUT, 'pause-menu.png');
  await page.screenshot({ path: pauseShot });
  report.screenshots.pause = pauseShot.slice(ROOT.length + 1);
  const pauseButtons = await page.evaluate(() => {
    const nodes = [...window.CINDERLINE.game.menus.pauseNode.querySelectorAll('.btn')];
    return nodes.map((node, index) => {
      const rect = node.getBoundingClientRect();
      return { index, text: node.textContent.trim(), x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
  });
  check(pauseButtons.length >= 3 && pauseButtons.every((item) => item.width >= 44 && item.height >= 44),
    'pause actions are touch-sized', JSON.stringify(pauseButtons));
  const saveButton = pauseButtons[0];
  const resumeButton = pauseButtons[pauseButtons.length - 1];
  await page.touchscreen.tap(saveButton.x + saveButton.width / 2, saveButton.y + saveButton.height / 2);
  await page.waitForFunction(() => Boolean(localStorage.getItem('cinderline.save.v1')));
  const saved = await page.evaluate(() => {
    const player = window.CINDERLINE.game.player;
    return { x: player.pos.x, y: player.pos.y, z: player.pos.z, bytes: localStorage.getItem('cinderline.save.v1').length };
  });
  await page.touchscreen.tap(resumeButton.x + resumeButton.width / 2, resumeButton.y + resumeButton.height / 2);
  await page.waitForFunction(() => window.CINDERLINE.game.mode === window.CINDERLINE.MODE.PLAY);

  await page.setViewportSize({ width: H, height: W });
  await page.waitForFunction(() => document.getElementById('rotate')?.classList.contains('on'));
  const portrait = await page.evaluate(() => ({
    prompt: document.getElementById('rotate')?.classList.contains('on') === true,
    paused: window.CINDERLINE.engine.isPaused,
    portrait: matchMedia('(orientation: portrait)').matches,
  }));
  check(portrait.prompt && portrait.paused && portrait.portrait,
    'portrait rotation raises a blocking prompt and pauses play', JSON.stringify(portrait));
  await page.setViewportSize({ width: W, height: H });
  await page.waitForFunction(() => !document.getElementById('rotate')?.classList.contains('on'));
  const landscapeAgain = await page.evaluate(() => ({
    paused: window.CINDERLINE.engine.isPaused,
    landscape: matchMedia('(orientation: landscape)').matches,
  }));
  check(!landscapeAgain.paused && landscapeAgain.landscape,
    'returning to landscape restores play', JSON.stringify(landscapeAgain));

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.CINDERLINE?.ready === true, null,
    { timeout: BOOT_TIMEOUT, polling: 250 });
  const continueButton = await center(page, 'window.CINDERLINE.game.menus.titleButtons.continue');
  check(continueButton.width >= 44 && continueButton.height >= 44,
    'saved run exposes a touch-sized Continue action', JSON.stringify(continueButton));
  await page.touchscreen.tap(continueButton.x, continueButton.y);
  await page.waitForFunction(() => window.CINDERLINE.game.mode === window.CINDERLINE.MODE.PLAY,
    null, { timeout: 30000, polling: 100 });
  await waitFrames(page, 5);
  const restored = await page.evaluate(() => {
    const player = window.CINDERLINE.game.player;
    return { x: player.pos.x, y: player.pos.y, z: player.pos.z, mode: window.CINDERLINE.game.mode };
  });
  const restoreDistance = Math.hypot(restored.x - saved.x, restored.y - saved.y, restored.z - saved.z);
  report.persistence = { saved, restored, distance: +restoreDistance.toFixed(4) };
  check(restoreDistance < 5, 'same-tab reload and Continue restore the saved position',
    `distance=${restoreDistance.toFixed(4)}, bytes=${saved.bytes}`);

  await page.evaluate(() => {
    window.__cinderlineFrames = [];
    window.__cinderlineSampling = true;
    let previous = performance.now();
    const sample = (now) => {
      if (!window.__cinderlineSampling) return;
      window.__cinderlineFrames.push(now - previous);
      previous = now;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await pointer(page, 'pointerdown', 71, 110, 250, true);
  await pointer(page, 'pointermove', 71, 145, 195, true);
  const soakStarted = Date.now();
  await waitFrames(page, 30);
  await pointer(page, 'pointerup', 71, 145, 195, true);
  const soak = await page.evaluate(() => {
    window.__cinderlineSampling = false;
    const C = window.CINDERLINE;
    const player = C.game.player;
    return {
      frames: window.__cinderlineFrames.slice(1),
      engineFrame: C.engine.frame,
      running: C.engine.running,
      finite: [player.pos.x, player.pos.y, player.pos.z, player.hp, player.stamina].every(Number.isFinite),
      perf: C.engine.perfSnapshot(),
      faults: (C.faults || []).length,
    };
  });
  report.timings.soakMs = Date.now() - soakStarted;
  report.soak = {
    samples: soak.frames.length,
    medianFrameGapMs: quantile(soak.frames, 0.5),
    p95FrameGapMs: quantile(soak.frames, 0.95),
    maximumFrameGapMs: soak.frames.length ? Math.max(...soak.frames) : null,
    engineFrame: soak.engineFrame,
    running: soak.running,
    finite: soak.finite,
    perf: soak.perf,
    faults: soak.faults,
  };
  check(soak.running && soak.finite && soak.faults === 0,
    'automated play remains live with finite state and no captured game faults', JSON.stringify(report.soak));
  check(soak.frames.length >= 20, 'automated play continues producing frames', `samples=${soak.frames.length}`);
  check((report.soak.p95FrameGapMs ?? Infinity) < FRAME_GAP_HANG_LIMIT,
    'runner frame-gap hang guard', `p95=${report.soak.p95FrameGapMs}ms, limit=${FRAME_GAP_HANG_LIMIT}ms`);
  check(soak.perf && soak.perf.draws > 0 && soak.perf.tris > 0,
    'renderer submits non-empty geometry after the soak', JSON.stringify(soak.perf));

  check(report.errors.page.length === 0, 'no page errors', `${report.errors.page.length} error(s)`);
  check(report.errors.console.length === 0, 'no console errors', `${report.errors.console.length} error(s)`);
  check(report.errors.request.length === 0, 'no failed requests', `${report.errors.request.length} failure(s)`);
  check(report.errors.http.length === 0, 'no HTTP error responses', `${report.errors.http.length} error response(s)`);
} catch (error) {
  report.failures.push(error.stack || error.message || String(error));
} finally {
  if (context) {
    try { await context.tracing.stop({ path: TRACE }); }
    catch (error) { report.failures.push(`trace: ${error.message}`); }
  }
  if (page) await page.close().catch(() => {});
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (localServer?.server) await new Promise((done) => localServer.server.close(done));
  report.status = report.failures.length ? 'failed' : 'passed';
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(`[iphone-webkit] ${report.status.toUpperCase()}: ${report.failures.length} failure(s)`);
console.log(`[iphone-webkit] boot=${report.timings.bootMs ?? 'n/a'}ms soak=${report.timings.soakMs ?? 'n/a'}ms`);
if (report.visualRegression?.diffRatio != null) {
  console.log(`[iphone-webkit] visual diff ratio=${report.visualRegression.diffRatio}`);
}
for (const failure of report.failures) console.error(`- ${failure}`);
if (report.failures.length) process.exit(1);
