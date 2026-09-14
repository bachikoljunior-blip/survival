#!/usr/bin/env node

/**
 * High-fidelity CINDERLINE browser gate.
 *
 * Appium/XCUITest drives Mobile Safari on an iPhone SE (3rd generation) iOS
 * Simulator in landscape. This verifies actual iOS/Safari layout, trusted
 * single- and two-finger actions, persistence, orientation recovery, rendering,
 * and runtime stability. It does not measure physical GPU speed, heat, memory
 * pressure, real-glass touch, hand reach, haptics, speakers, or audio latency.
 */

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requestWebDriver } from './webdriver-request.mjs';
import { nativePointerActions } from './ios-pointer-coordinates.mjs';
import { createIosAudioTransfer } from './ios_audio_transfer.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const OUTPUT = resolve(ROOT, process.env.CINDERLINE_IOS_OUTPUT || 'test-results/ios-safari');
const REPORT = resolve(OUTPUT, 'report.json');
const GAMEPLAY_SHOT = resolve(OUTPUT, 'ios-safari-gameplay.png');
const PAUSE_SHOT = resolve(OUTPUT, 'ios-safari-pause.png');
const FAILURE_SHOT = resolve(OUTPUT, 'ios-safari-failure.png');
const APPIUM_URL = new URL(process.env.APPIUM_URL || 'http://127.0.0.1:4723/');
const EXTERNAL_URL = process.env.CINDERLINE_TEST_URL || '';
const UDID = process.env.IOS_SIMULATOR_UDID || '';
const PLATFORM_VERSION = process.env.IOS_SIMULATOR_PLATFORM_VERSION || '';
const BOOT_TIMEOUT = Number(process.env.CINDERLINE_IOS_TIMEOUT || 240000);
const SESSION_REQUEST_TIMEOUT = 900000;
const CAPTURE_AUDIO = process.env.CINDERLINE_IOS_AUDIO_CAPTURE === '1';
const SAFARI_BOOTSTRAP_PATH = '/__ios_safari_bootstrap__.html';
const SAFARI_BOOTSTRAP_HTML = '<!doctype html><html><head><meta charset="utf-8"><title>Safari session ready</title></head><body><p id="ios-safari-bootstrap">Ready</p></body></html>';

mkdirSync(OUTPUT, { recursive: true });

const report = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  target: 'iPhone SE (3rd generation) iOS Simulator / Mobile Safari / landscape',
  transport: { client: 'node:http/https', sessionRequestTimeoutMs: SESSION_REQUEST_TIMEOUT, commandRequestTimeoutMs: 90000 },
  checks: [],
  device: null,
  layout: null,
  interaction: {},
  inputCalibration: [],
  inputActions: [],
  persistence: null,
  soak: null,
  screenshots: {},
  errors: [],
  failures: [],
  status: 'running',
};

function check(condition, name, detail = '') {
  const passed = Boolean(condition);
  report.checks.push({ name, passed, detail });
  if (!passed) report.failures.push(`${name}: ${detail}`);
  return passed;
}

function startServer() {
  const audioTransfer = CAPTURE_AUDIO ? createIosAudioTransfer() : null;
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  };
  const server = createServer((request, response) => {
    if (audioTransfer?.handle(request, response)) return;
    let pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === SAFARI_BOOTSTRAP_PATH) {
      // This one-response page must not leave a partial request blocking cleanup.
      response.setHeader('connection', 'close');
      response.once('finish', () => request.destroy());
      if (request.headers.host !== `127.0.0.1:${server.address().port}`) {
        response.writeHead(421); response.end(); return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { allow: 'GET, HEAD' }); response.end(); return;
      }
      response.writeHead(200, { 'content-type': mime['.html'], 'cache-control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : SAFARI_BOOTSTRAP_HTML);
      return;
    }
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
      const url = `http://127.0.0.1:${address.port}/`;
      audioTransfer?.bind(url);
      done({ server, url, audioTransfer });
    });
  });
}

async function waitForHttp(url, timeout = 90000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status >= 200 && response.status < 500) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`endpoint did not become reachable: ${lastError?.message || 'timeout'}`);
}

function webdriver(pathname, options = {}) {
  return requestWebDriver(new URL(pathname.replace(/^\//, ''), APPIUM_URL), {
    ...options,
    timeout: pathname === 'session' && (options.method ?? 'POST') === 'POST' ? SESSION_REQUEST_TIMEOUT
      : Math.min(90000, options.timeout ?? 90000),
  });
}

let sessionId = '';
let pointerCalibration = null;
const sessionPath = (suffix = '') => `session/${sessionId}${suffix}`;
const execute = (script, args = [], timeout = 90000) => webdriver(sessionPath('/execute/sync'), { body: { script, args }, timeout });

async function waitForScript(script, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const value = await execute(script);
      if (value) return value;
    } catch (error) {
      report.errors.push(`poll: ${error.message}`);
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`Safari condition timed out: ${script.slice(0, 140)}`);
}

async function performActions(actions) {
  const viewport = await execute('return {innerWidth,innerHeight,outerWidth,outerHeight};');
  const nativeActions = nativePointerActions(actions, pointerCalibration, viewport);
  report.inputActions.push({ viewport, css: actions, native: nativeActions });
  await webdriver(sessionPath('/actions'), { body: { actions: nativeActions } });
  await webdriver(sessionPath('/actions'), { method: 'DELETE' }).catch(() => {});
}

async function calibratePointerCoordinates() {
  // The driver's public calibration command briefly visits its own tap target
  // and reloads the original URL. Use only before a run/Continue, never in play.
  pointerCalibration = await execute('mobile: calibrateWebToRealCoordinatesTranslation');
  report.inputCalibration.push(pointerCalibration);
  await waitForScript('return Boolean(window.CINDERLINE && window.CINDERLINE.ready === true);', BOOT_TIMEOUT);
}

// Observe the first render after fixed-step progress, never wait for a bad result to turn
// good. This browser-side probe does not step, reset or otherwise alter input.
function observeIosStreetRelease(inputCount) {
  const C = window.CINDERLINE, engine = C.engine, input = C.input;
  if (window.__cinderlineIosRelease) throw new Error('overlapping iOS release observation');
  const snapshot = () => ({ wallMs: performance.now(), audioTime: C.game.audio.ctx.currentTime,
    engineTime: engine.time, engineFrame: engine.frame, inputTime: input._time,
    position: C.game.player.pos.toArray(), stickActive: input._stick.active,
    stickId: input._stick.id, stickX: input._stick.x, stickY: input._stick.y,
    moveMagnitude: input.move.mag, input: window.__cinderlineIosInput.slice(inputCount) });
  const immediate = snapshot();
  const probe = window.__cinderlineIosRelease = { immediate, status: 'pending', timeoutMs: 2000 };
  let timer, off;
  const cleanup = () => {
    const errors = [];
    for (const remove of [() => clearTimeout(timer), () => off && off(),
      () => document.removeEventListener('pointerdown', repress, true)]) {
      try { remove(); } catch (error) { errors.push(String(error.message || error)); }
    }
    if (errors.length) {
      probe.cleanupErrors = [...(probe.cleanupErrors || []), ...errors];
      if (probe.status !== 'failed') Object.assign(probe, { status: 'failed', reason: 'release observation cleanup failed' });
    }
  };
  const finish = (status, reason, after = snapshot()) => {
    if (probe.status !== 'pending') return;
    Object.assign(probe, { status, reason, observationStatus: status, observationReason: reason,
      after, elapsedMs: after.wallMs - immediate.wallMs });
    cleanup();
  };
  const repress = () => finish('failed', 'pointerdown recurred before release observation completed');
  probe.cleanup = cleanup;
  const observe = () => {
    try {
      const after = snapshot();
      if (C.engine !== engine || C.input !== input || !engine.running || engine.isPaused || engine.lost
        || C.game.mode !== C.MODE.PLAY) return finish('failed', 'live gameplay changed', after);
      if (after.wallMs - immediate.wallMs >= probe.timeoutMs) return finish('failed', 'fixed-step observation timed out', after);
      if (after.stickActive || after.stickId !== -1 || after.stickX !== 0 || after.stickY !== 0)
        return finish('failed', 'raw stick is not released', after);
      if (![after.engineTime, after.engineFrame, after.inputTime, after.moveMagnitude].every(Number.isFinite)
        || after.engineTime < immediate.engineTime || after.engineFrame < immediate.engineFrame
        || after.inputTime < immediate.inputTime) return finish('failed', 'invalid or reversed release clocks', after);
      if (after.engineTime > immediate.engineTime) {
        const progressed = after.engineFrame > immediate.engineFrame && after.inputTime > immediate.inputTime;
        finish(progressed && after.moveMagnitude === 0 ? 'passed' : 'failed',
          progressed ? 'first frame after fixed-step progress' : 'engine advanced without input/frame progress', after);
      }
    } catch (error) { finish('failed', String(error.message || error), immediate); }
  };
  document.addEventListener('pointerdown', repress, true);
  off = engine.on('render', observe);
  timer = setTimeout(() => finish('failed', 'fixed-step observation timed out'), probe.timeoutMs);
  observe();
  return immediate;
}

async function collectIosStreetRelease(immediate, movement) {
  const deadline = Date.now() + 2000;
  let result, primaryError;
  try {
    while (Date.now() < deadline) {
      const observed = await execute(`var p=window.__cinderlineIosRelease;
        if (!p) throw new Error('missing iOS release observation');
        return {status:p.status,reason:p.reason,after:p.after,elapsedMs:p.elapsedMs,
          timeoutMs:p.timeoutMs,cleanupErrors:p.cleanupErrors,
          observationStatus:p.observationStatus,observationReason:p.observationReason};`);
      if (Date.now() >= deadline) {
        result = { status: 'failed', reason: 'release observation transport deadline exceeded', after: immediate, lateResult: observed };
        break;
      }
      if (observed.status !== 'pending') { result = observed; break; }
      await new Promise(done => setTimeout(done, 50));
    }
    movement.release = result ||= { status: 'failed', reason: 'release observation transport deadline exceeded', after: immediate };
  } catch (error) {
    primaryError = error;
    movement.release = result = { status: 'failed', reason: String(error.message || error),
      after: immediate, collectionError: String(error.stack || error) };
  } finally {
    try {
      await execute(`var p=window.__cinderlineIosRelease;
        if (p) { p.cleanup(); delete window.__cinderlineIosRelease;
          if (p.cleanupErrors) throw new Error(p.cleanupErrors.join('; ')); } return true;`);
    } catch (error) {
      const hadPrimaryFailure = result.status === 'failed';
      result.cleanupErrors = [...(result.cleanupErrors || []), String(error.message || error)];
      if (!hadPrimaryFailure) Object.assign(result, { observationStatus: result.status,
        observationReason: result.reason, status: 'failed', reason: 'release observation cleanup failed' });
      primaryError ||= hadPrimaryFailure ? new Error(result.reason) : error;
    }
  }
  if (primaryError) throw primaryError;
  return result;
}

function finger(id, actions) {
  return { type: 'pointer', id, parameters: { pointerType: 'touch' }, actions };
}

const move = (x, y, duration = 0) => ({
  type: 'pointerMove', duration, x: Math.round(x), y: Math.round(y), origin: 'viewport',
});
const down = () => ({ type: 'pointerDown', button: 0 });
const up = () => ({ type: 'pointerUp', button: 0 });
const pause = (duration) => ({ type: 'pause', duration });

async function tap(x, y) {
  await performActions([finger(`tap-${Date.now()}`, [move(x, y), down(), pause(90), up()])]);
}

async function screenshot(path) {
  const encoded = await webdriver(sessionPath('/screenshot'), { method: 'GET' });
  writeFileSync(path, Buffer.from(encoded, 'base64'));
}

async function injectErrorCapture() {
  await execute(`
    window.__cinderlineIosErrors = [];
    window.__cinderlineIosInput = [];
    window.__cinderlineIosTouches = new Set();
    ['pointerdown','pointerup','pointercancel','click'].forEach(function (type) {
      document.addEventListener(type, function (event) {
        var active = window.__cinderlineIosTouches;
        if (type === 'pointerdown' && event.isTrusted && event.pointerType === 'touch') active.add(event.pointerId);
        var node = event.target;
        window.__cinderlineIosInput.push({type:type,trusted:event.isTrusted,pointerType:event.pointerType,
          pointerId:event.pointerId,x:event.clientX,y:event.clientY,activeTouches:active.size,
          target:node && {tag:node.tagName,id:node.id,className:String(node.className),text:node.textContent.slice(0,100)}});
        if (window.__cinderlineIosInput.length > 160) window.__cinderlineIosInput.shift();
        if (type === 'pointerup' || type === 'pointercancel') active.delete(event.pointerId);
      }, true);
    });
    window.addEventListener('error', function (event) {
      window.__cinderlineIosErrors.push(String(event.message || 'error'));
    });
    window.addEventListener('unhandledrejection', function (event) {
      window.__cinderlineIosErrors.push(String(event.reason || 'unhandled rejection'));
    });
    return true;
  `);
}

let localServer = null;
let audioTools = null;
let audioProvenance = null;

try {
  if (!UDID) throw new Error('IOS_SIMULATOR_UDID is required');
  if (!PLATFORM_VERSION) throw new Error('IOS_SIMULATOR_PLATFORM_VERSION is required');
  if (CAPTURE_AUDIO) {
    audioTools = await import('./ios_audio_capture.mjs');
    audioProvenance = audioTools.verifyIosAudioBuild(ROOT, EXTERNAL_URL);
    report.audioCapture = { status: 'not started', provenance: audioProvenance, clips: [], cleanupErrors: [] };
  }
  const baseUrl = EXTERNAL_URL || (localServer = await startServer()).url;
  report.baseUrl = baseUrl;
  const bootstrapUrl = localServer ? new URL(SAFARI_BOOTSTRAP_PATH, baseUrl).href : null;
  report.safariStartup = { method: bootstrapUrl ? 'local-simctl-preopen' : 'driver-default', bootstrapUrl, verified: false };
  await waitForHttp(baseUrl);
  await waitForHttp(new URL('status', APPIUM_URL));

  if (bootstrapUrl) {
    // The owned loopback document must exist before WebInspector selects a
    // page. Keep URL opening separate from WDA's initial app-state check.
    const startedAt = Date.now();
    report.safariStartup.openUrl = { status: 'running', attempts: 1 };
    await new Promise((done, reject) => {
      execFile('xcrun', ['simctl', 'openurl', UDID, bootstrapUrl],
        { timeout: 90000, maxBuffer: 65536, killSignal: 'SIGKILL' }, (error, stdout, stderr) => {
          report.safariStartup.openUrl = { status: error ? 'failed' : 'passed', attempts: 1,
            elapsedMs: Date.now() - startedAt, stdout, stderr,
            ...(error ? { error: error.message, code: error.code, signal: error.signal } : {}) };
          if (error) reject(new Error(`Safari bootstrap openurl failed: ${error.message}`, { cause: error }));
          else done();
        });
    });
  }

  const created = await webdriver('session', {
    body: {
      capabilities: {
        alwaysMatch: {
          platformName: 'iOS',
          browserName: 'Safari',
          'appium:automationName': 'XCUITest',
          'appium:deviceName': 'iPhone SE (3rd generation)',
          'appium:udid': UDID,
          'appium:platformVersion': PLATFORM_VERSION,
          'appium:noReset': true,
          // noReset keeps the preopened Safari page; WDA uses its ordinary
          // application launch/activation path with no initial deep link.
          // CI has already booted this simulator with simctl. Requiring a
          // desktop window makes Appium restart it before Safari can launch.
          // Native simulator screenshots/video remain available without it.
          'appium:isHeadless': true,
          // Preserve cold WDA build diagnostics and allow a bounded startup.
          // Readiness still has to succeed before any Safari checks can run.
          'appium:showXcodeLog': true,
          'appium:wdaLaunchTimeout': 240000,
          'appium:newCommandTimeout': 300,
          'appium:safariAllowPopups': true,
          'appium:includeSafariInWebviews': true,
        },
        firstMatch: [{}],
      },
    },
  });
  sessionId = created?.sessionId || '';
  if (!sessionId) {
    const sessions = await webdriver('sessions', { method: 'GET' });
    sessionId = sessions?.at?.(-1)?.id || '';
  }
  if (!sessionId) throw new Error('Appium did not return a session id');

  if (bootstrapUrl) {
    const page = await execute('return {url: location.href, ready: Boolean(document.getElementById("ios-safari-bootstrap"))};');
    report.safariStartup.actual = page;
    if (page?.url !== bootstrapUrl || page?.ready !== true) {
      throw new Error(`Safari session bootstrap mismatch: ${JSON.stringify(page)}`);
    }
    report.safariStartup.verified = true;
  }

  await webdriver(sessionPath('/orientation'), { body: { orientation: 'LANDSCAPE' } });
  await webdriver(sessionPath('/url'), { body: { url: baseUrl } });
  await waitForScript('return Boolean(window.CINDERLINE && window.CINDERLINE.ready === true);', BOOT_TIMEOUT);
  await execute('localStorage.clear(); return true;');
  await webdriver(sessionPath('/refresh'), { body: {} });
  await waitForScript('return Boolean(window.CINDERLINE && window.CINDERLINE.ready === true);', BOOT_TIMEOUT);
  await calibratePointerCoordinates();
  await injectErrorCapture();

  const device = await execute(`
    var C = window.CINDERLINE;
    var canvas = document.getElementById('gl').getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      visualViewport: window.visualViewport
        ? { width: visualViewport.width, height: visualViewport.height }
        : null,
      dpr: devicePixelRatio,
      maxTouchPoints: navigator.maxTouchPoints,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      coarse: matchMedia('(pointer: coarse)').matches,
      landscape: matchMedia('(orientation: landscape)').matches,
      ready: C.ready,
      running: C.engine.running,
      build: C.build,
      canvas: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height }
    };
  `);
  report.device = device;
  check(device.viewport.width >= 600 && device.viewport.width <= 667,
    'iPhone SE 3 landscape width', JSON.stringify(device.viewport));
  check(device.viewport.height >= 280 && device.viewport.height <= 375,
    'Mobile Safari landscape height', JSON.stringify(device.viewport));
  check(device.dpr === 2, 'iPhone SE 3 DPR', `dpr=${device.dpr}`);
  check(device.maxTouchPoints > 0 && device.coarse && device.landscape,
    'landscape touch surface is active', JSON.stringify(device));
  check(/Safari\//.test(device.userAgent) && /Mobile\//.test(device.userAgent),
    'actual Mobile Safari user agent is active', device.userAgent);
  check(device.ready && device.running, 'production engine starts in Mobile Safari', JSON.stringify(device));
  check(device.canvas.width >= 600 && device.canvas.height >= 280,
    'render canvas fills the Safari content viewport', JSON.stringify(device.canvas));

  const title = await execute(`
    var buttons = window.CINDERLINE.game.menus.titleButtons;
    var names = ['new', 'settings', 'credits'];
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      buttons: names.map(function (name) {
        var r = buttons[name].getBoundingClientRect();
        return {name:name,x:r.x,y:r.y,width:r.width,height:r.height};
      })
    };
  `);
  report.layout = { title };
  check(title.documentWidth <= title.viewportWidth, 'title has no horizontal overflow', JSON.stringify(title));
  check(title.buttons.every((item) => item.width >= 44 && item.height >= 44),
    'title controls meet the 44 CSS px floor', JSON.stringify(title.buttons));
  const newGame = title.buttons.find((item) => item.name === 'new');
  await tap(newGame.x + newGame.width / 2, newGame.y + newGame.height / 2);
  await waitForScript('return window.CINDERLINE.game.mode === window.CINDERLINE.MODE.PLAY;', 30000);
  const titleInput = await execute('return window.__cinderlineIosInput.slice();');
  report.interaction.titleInput = titleInput;
  check(titleInput.some((event) => event.type === 'pointerup' && event.trusted && event.pointerType === 'touch'
    && event.x >= newGame.x && event.x <= newGame.x + newGame.width
    && event.y >= newGame.y && event.y <= newGame.y + newGame.height),
  'trusted Mobile Safari tap starts a new game', JSON.stringify(titleInput));

  await execute(`
    var C = window.CINDERLINE;
    C.__iosProbe = { attackStarts: 0 };
    C.game.on('actor:attackstart', function (actor) {
      if (actor === C.game.player) C.__iosProbe.attackStarts++;
    });
    return true;
  `);
  const controls = await execute(`
    var hud = window.CINDERLINE.game.hud;
    var nodes = Object.assign({}, hud.buttons, {
      menu: hud.sysMenu, map: hud.sysMap, lamp: hud.sysLamp, meter: hud.sysMeter
    });
    return Object.keys(nodes).map(function (name) {
      var node = nodes[name], r = node.getBoundingClientRect(), cs = getComputedStyle(node);
      return {name:name,x:r.x,y:r.y,width:r.width,height:r.height,
        visible:cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) !== 0};
    });
  `);
  report.layout.controls = controls;
  check(controls.length === 9, 'all required touch controls are present', controls.map((item) => item.name).join(','));
  check(controls.every((item) => item.visible && item.width >= 44 && item.height >= 44),
    'every gameplay control is visible and touch-sized', JSON.stringify(controls));

  const before = await execute(`
    var p=window.CINDERLINE.game.player;
    return {x:p.pos.x,y:p.pos.y,z:p.pos.z,frame:window.CINDERLINE.engine.frame};
  `);
  const attack = controls.find((item) => item.name === 'attack');
  const attackX = attack.x + attack.width / 2;
  const attackY = attack.y + attack.height / 2;
  await performActions([
    finger('move-thumb', [
      move(110, 250), down(), move(110, 190, 350), pause(550), up(),
    ]),
    finger('attack-thumb', [
      // WDA requires an initial position and schedules each touch path by its
      // cumulative duration. The first move creates this contact at 350 ms;
      // the movement contact remains down until 900 ms.
      move(attackX, attackY, 350), down(), pause(150), up(),
    ]),
  ]);
  await new Promise((done) => setTimeout(done, 350));
  const after = await execute(`
    var C=window.CINDERLINE,p=C.game.player;
    return {x:p.pos.x,y:p.pos.y,z:p.pos.z,attackStarts:C.__iosProbe.attackStarts,
      stickActive:C.input._stick.active,moveMagnitude:C.input.move.mag,
      attackRaw:C.input.buttons.attack._rawDown,
      finite:[p.pos.x,p.pos.y,p.pos.z,p.hp].every(Number.isFinite)};
  `);
  const moved = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
  report.interaction.simultaneousMoveAttack = { before, after, moved: +moved.toFixed(4) };
  const twoThumbInput = await execute('return window.__cinderlineIosInput.slice();');
  report.interaction.twoThumbInput = twoThumbInput;
  check(twoThumbInput.some((event) => event.type === 'pointerdown' && event.trusted && event.activeTouches >= 2),
    'two trusted touch contacts overlap in Safari', JSON.stringify(twoThumbInput));
  check(moved > 0.15, 'trusted two-thumb movement moves the player', `distance=${moved.toFixed(4)}`);
  check(after.attackStarts > 0, 'trusted second thumb attacks during movement', `attacks=${after.attackStarts}`);
  check(!after.stickActive && after.moveMagnitude === 0 && !after.attackRaw,
    'trusted touch release clears movement and attack', JSON.stringify(after));
  check(after.finite, 'trusted interaction leaves finite player state', JSON.stringify(after));

  const cameraBefore = await execute('return {yaw:window.CINDERLINE.game.camera.yaw,pitch:window.CINDERLINE.game.camera.pitch};');
  await performActions([finger('look-thumb', [move(500, 90), down(), move(590, 120, 450), up()])]);
  await new Promise((done) => setTimeout(done, 250));
  const cameraAfter = await execute('return {yaw:window.CINDERLINE.game.camera.yaw,pitch:window.CINDERLINE.game.camera.pitch};');
  const cameraDelta = Math.hypot(cameraAfter.yaw - cameraBefore.yaw, cameraAfter.pitch - cameraBefore.pitch);
  report.interaction.camera = { before: cameraBefore, after: cameraAfter, delta: +cameraDelta.toFixed(5) };
  check(cameraDelta > 0.02, 'trusted right-thumb drag moves the camera', `delta=${cameraDelta.toFixed(5)}`);

  const menu = controls.find((item) => item.name === 'menu');
  await tap(menu.x + menu.width / 2, menu.y + menu.height / 2);
  await waitForScript('return window.CINDERLINE.game.mode === window.CINDERLINE.MODE.MENU;');
  await screenshot(PAUSE_SHOT);
  report.screenshots.pause = PAUSE_SHOT.slice(ROOT.length + 1);
  const pauseButtons = await execute(`
    return Array.from(window.CINDERLINE.game.menus.pauseNode.querySelectorAll('.btn')).map(function (node,index) {
      var r=node.getBoundingClientRect();
      return {index:index,text:node.textContent.trim(),x:r.x,y:r.y,width:r.width,height:r.height};
    });
  `);
  check(pauseButtons.length >= 3 && pauseButtons.every((item) => item.width >= 44 && item.height >= 44),
    'pause actions are touch-sized in Safari', JSON.stringify(pauseButtons));
  const saveButton = pauseButtons[0];
  const resumeButton = pauseButtons[pauseButtons.length - 1];
  await tap(saveButton.x + saveButton.width / 2, saveButton.y + saveButton.height / 2);
  await waitForScript("return Boolean(localStorage.getItem('cinderline.save.v1'));", 10000);
  const saved = await execute(`
    var p=window.CINDERLINE.game.player;
    return {x:p.pos.x,y:p.pos.y,z:p.pos.z,bytes:localStorage.getItem('cinderline.save.v1').length};
  `);
  await tap(resumeButton.x + resumeButton.width / 2, resumeButton.y + resumeButton.height / 2);
  await waitForScript('return window.CINDERLINE.game.mode === window.CINDERLINE.MODE.PLAY;');

  await webdriver(sessionPath('/orientation'), { body: { orientation: 'PORTRAIT' } });
  await waitForScript("return document.getElementById('rotate').classList.contains('on');", 15000);
  const portrait = await execute(`return {prompt:document.getElementById('rotate').classList.contains('on'),
    paused:window.CINDERLINE.engine.isPaused,portrait:matchMedia('(orientation: portrait)').matches};`);
  check(portrait.prompt && portrait.paused && portrait.portrait,
    'turning to portrait blocks input and pauses play', JSON.stringify(portrait));
  await webdriver(sessionPath('/orientation'), { body: { orientation: 'LANDSCAPE' } });
  await waitForScript("return !document.getElementById('rotate').classList.contains('on');", 15000);
  const landscapeAgain = await execute(`return {paused:window.CINDERLINE.engine.isPaused,
    landscape:matchMedia('(orientation: landscape)').matches};`);
  check(!landscapeAgain.paused && landscapeAgain.landscape,
    'returning to landscape restores play', JSON.stringify(landscapeAgain));

  const errorsBeforeReload = await execute('return (window.__cinderlineIosErrors || []).slice();');
  report.errors.push(...errorsBeforeReload);
  await webdriver(sessionPath('/refresh'), { body: {} });
  await waitForScript('return Boolean(window.CINDERLINE && window.CINDERLINE.ready === true);', BOOT_TIMEOUT);
  await calibratePointerCoordinates();
  await injectErrorCapture();
  const continueButton = await execute(`
    var r=window.CINDERLINE.game.menus.titleButtons.continue.getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height};
  `);
  check(continueButton.width >= 44 && continueButton.height >= 44,
    'saved run exposes a touch-sized Continue action', JSON.stringify(continueButton));
  await tap(continueButton.x, continueButton.y);
  await waitForScript('return window.CINDERLINE.game.mode === window.CINDERLINE.MODE.PLAY;', 30000);
  const restored = await execute(`var p=window.CINDERLINE.game.player;return{x:p.pos.x,y:p.pos.y,z:p.pos.z};`);
  const restoreDistance = Math.hypot(restored.x - saved.x, restored.y - saved.y, restored.z - saved.z);
  report.persistence = { saved, restored, distance: +restoreDistance.toFixed(4) };
  check(restoreDistance < 5, 'Safari refresh and Continue restore the saved position',
    `distance=${restoreDistance.toFixed(4)}, bytes=${saved.bytes}`);

  const soakBefore = await execute('return window.CINDERLINE.engine.frame;');
  await new Promise((done) => setTimeout(done, 4000));
  const soak = await execute(`
    var C=window.CINDERLINE,p=C.game.player;
    return {frame:C.engine.frame,running:C.engine.running,
      finite:[p.pos.x,p.pos.y,p.pos.z,p.hp,p.stamina].every(Number.isFinite),
      perf:C.engine.perfSnapshot(),faults:(C.faults||[]).length};
  `);
  report.soak = { ...soak, framesAdvanced: soak.frame - soakBefore };
  check(soak.running && soak.finite && soak.faults === 0,
    'Safari soak remains live with finite state and no captured game faults', JSON.stringify(report.soak));
  check(soak.frame - soakBefore >= 5, 'Safari soak keeps producing frames', `advanced=${soak.frame - soakBefore}`);
  check(soak.perf && soak.perf.draws > 0 && soak.perf.tris > 0,
    'Safari renderer submits non-empty geometry', JSON.stringify(soak.perf));
  await screenshot(GAMEPLAY_SHOT);
  report.screenshots.gameplay = GAMEPLAY_SHOT.slice(ROOT.length + 1);

  const errorsAfterReload = await execute('return (window.__cinderlineIosErrors || []).slice();');
  report.errors.push(...errorsAfterReload);
  check(errorsBeforeReload.length === 0 && errorsAfterReload.length === 0,
    'no captured Mobile Safari runtime errors', JSON.stringify({ errorsBeforeReload, errorsAfterReload }));

  if (CAPTURE_AUDIO) {
    await audioTools.captureIosAudio({ execute, tap, root: ROOT, output: resolve(OUTPUT, 'audio'),
      check, report, provenance: audioProvenance, transfer: localServer?.audioTransfer,
      releaseActions: () => webdriver(sessionPath('/actions'), { method: 'DELETE' }),
      waitFrames: async count => {
        const start = await execute('return window.CINDERLINE.engine.frame;');
        await waitForScript(`return window.CINDERLINE.engine.frame >= ${start + count};`, 60000);
      },
      moveForCapture: async () => {
        const before = await execute(`var C=window.CINDERLINE; return {wallMs:performance.now(),
          audioTime:C.game.audio.ctx.currentTime,engineTime:C.engine.time,engineFrame:C.engine.frame,
          position:C.game.player.pos.toArray(),inputCount:window.__cinderlineIosInput.length};`);
        await performActions([finger('audio-street-stick', [
          move(110, 250), down(), move(110, 190, 350), pause(2150), up(),
        ])]);
        const after = await execute(`return (${observeIosStreetRelease.toString()})(arguments[0]);`, [before.inputCount]);
        // Preserve the original immediate read even if transport or cleanup fails.
        const movement = { before, after };
        report.interaction.audioStreetRelease = movement;
        const release = await collectIosStreetRelease(after, movement);
        const distance = Math.hypot(...after.position.map((value, index) => value - before.position[index]));
        check(after.input.some(event => event.type === 'pointerdown' && event.trusted && event.pointerType === 'touch')
          && after.input.some(event => event.type === 'pointerup' && event.trusted && event.pointerType === 'touch'),
        'iOS audio street: actual trusted stick gesture is observed');
        check(distance > 0.15 && release.status === 'passed'
          && !release.after.stickActive && release.after.moveMagnitude === 0,
          'iOS audio street: native movement advances and releases', JSON.stringify({ distance,
            stickActive: after.stickActive, moveMagnitude: after.moveMagnitude, release }));
        return Object.assign(movement, { distance });
      },
    });
    const captureErrors = await execute('return (window.__cinderlineIosErrors || []).slice();');
    check(captureErrors.length === 0, 'iOS audio: no captured Safari runtime errors', JSON.stringify(captureErrors));
  }
} catch (error) {
  report.failures.push(error.stack || error.message || String(error));
  if (sessionId) {
    try {
      report.failureState = await execute(`var C=window.CINDERLINE; return {
        mode:C && C.game.mode,frame:C && C.engine.frame,ready:C && C.ready,
        faults:C && C.faults,errors:window.__cinderlineIosErrors,
        input:window.__cinderlineIosInput,viewport:{width:innerWidth,height:innerHeight},
        visualViewport:window.visualViewport && {width:visualViewport.width,height:visualViewport.height,
          offsetLeft:visualViewport.offsetLeft,offsetTop:visualViewport.offsetTop,scale:visualViewport.scale}};`);
    } catch (probeError) { report.errors.push(`failure state: ${probeError.message}`); }
    try {
      await screenshot(FAILURE_SHOT);
      report.screenshots.failure = FAILURE_SHOT.slice(ROOT.length + 1);
    } catch (shotError) { report.errors.push(`failure screenshot: ${shotError.message}`); }
  }
} finally {
  if (sessionId) {
    await webdriver(sessionPath(), { method: 'DELETE' })
      .catch((error) => report.errors.push(`session cleanup: ${error.message}`));
  }
  localServer?.audioTransfer?.close();
  if (localServer?.server) await new Promise((done) => localServer.server.close(done));
  report.status = report.failures.length ? 'failed' : 'passed';
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(`[ios-safari] ${report.status.toUpperCase()}: ${report.failures.length} failure(s)`);
if (report.safariStartup) console.log(`[ios-safari-startup] ${JSON.stringify(report.safariStartup)}`);
// Keep the exact report and bounded, lossless images readable through the
// ordinary job log as well as the artifact; never substitute them for video.
console.log(`[ios-safari-report] ${JSON.stringify(CAPTURE_AUDIO && audioTools ? audioTools.iosAudioLogSummary(report) : report)}`);
for (const relative of CAPTURE_AUDIO ? [] : Object.values(report.screenshots)) {
  const bytes = readFileSync(resolve(ROOT, relative));
  const data = bytes.toString('base64'), sha256 = createHash('sha256').update(bytes).digest('hex');
  const included = bytes.length <= 8000000;
  console.log(`[ios-safari-image] ${JSON.stringify({path:relative,bytes:bytes.length,sha256,included})}`);
  if (!included) continue;
  for (let offset = 0; offset < data.length; offset += 4000) {
    console.log(`[ios-safari-image-data] ${offset} ${data.slice(offset, offset + 4000)}`);
  }
}
for (const failure of report.failures) console.error(`- ${failure}`);
// Let the pipe drain so a failed run preserves the full report and PNG bytes.
if (report.failures.length) process.exitCode = 1;
