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

import { createServer, request as httpRequest } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const OUTPUT = resolve(ROOT, process.env.CINDERLINE_IOS_OUTPUT || 'test-results/ios-safari');
const REPORT = resolve(OUTPUT, 'report.json');
const GAMEPLAY_SHOT = resolve(OUTPUT, 'ios-safari-gameplay.png');
const PAUSE_SHOT = resolve(OUTPUT, 'ios-safari-pause.png');
const APPIUM_URL = new URL(process.env.APPIUM_URL || 'http://127.0.0.1:4723/');
const EXTERNAL_URL = process.env.CINDERLINE_TEST_URL || '';
const UDID = process.env.IOS_SIMULATOR_UDID || '';
const PLATFORM_VERSION = process.env.IOS_SIMULATOR_PLATFORM_VERSION || '';
const BOOT_TIMEOUT = Number(process.env.CINDERLINE_IOS_TIMEOUT || 240000);

mkdirSync(OUTPUT, { recursive: true });

const report = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  target: 'iPhone SE (3rd generation) iOS Simulator / Mobile Safari / landscape',
  checks: [],
  device: null,
  layout: null,
  interaction: {},
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
    let pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
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
      done({ server, url: `http://127.0.0.1:${address.port}/` });
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

async function webdriver(pathname, { method = 'POST', body } = {}) {
  const url = new URL(pathname.replace(/^\//, ''), APPIUM_URL);
  const encoded = body === undefined ? '' : JSON.stringify(body);
  const response = await new Promise((resolveRequest, rejectRequest) => {
    const request = httpRequest(url, {
      method,
      headers: body === undefined ? undefined : {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(encoded),
      },
    }, (incoming) => {
      let text = '';
      incoming.setEncoding('utf8');
      incoming.on('data', (chunk) => { text += chunk; });
      incoming.on('end', () => resolveRequest({ ok: incoming.statusCode >= 200 && incoming.statusCode < 300, status: incoming.statusCode, text }));
    });
    request.setTimeout(900000, () => request.destroy(new Error(`WebDriver ${method} ${pathname} exceeded 15 minutes`)));
    request.on('error', rejectRequest);
    if (encoded) request.write(encoded);
    request.end();
  });
  const text = response.text;
  let payload;
  try { payload = text ? JSON.parse(text) : {}; }
  catch { payload = { value: text }; }
  if (!response.ok || payload?.value?.error) {
    throw new Error(`WebDriver ${method} ${pathname}: ${payload?.value?.message || payload?.value || `HTTP ${response.status}`}`);
  }
  return payload.value;
}

let sessionId = '';
const sessionPath = (suffix = '') => `session/${sessionId}${suffix}`;
const execute = (script, args = []) => webdriver(sessionPath('/execute/sync'), { body: { script, args } });

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
  await webdriver(sessionPath('/actions'), { body: { actions } });
  await webdriver(sessionPath('/actions'), { method: 'DELETE' }).catch(() => {});
}

const WEB_ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';

async function clickElement(selector) {
  const element = await webdriver(sessionPath('/element'), {
    body: { using: 'css selector', value: selector },
  });
  const id = element?.[WEB_ELEMENT_KEY] || element?.ELEMENT;
  if (!id) throw new Error(`Safari did not resolve element: ${selector}`);
  await webdriver(sessionPath(`/element/${encodeURIComponent(id)}/click`), { body: {} });
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

try {
  if (!UDID) throw new Error('IOS_SIMULATOR_UDID is required');
  if (!PLATFORM_VERSION) throw new Error('IOS_SIMULATOR_PLATFORM_VERSION is required');
  const baseUrl = EXTERNAL_URL || (localServer = await startServer()).url;
  report.baseUrl = baseUrl;
  await waitForHttp(baseUrl);
  await waitForHttp(new URL('status', APPIUM_URL));

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
          'appium:newCommandTimeout': 300,
          'appium:safariAllowPopups': true,
          'appium:includeSafariInWebviews': true,
          'appium:simulatorStartupTimeout': 300000,
          'appium:wdaLaunchTimeout': 180000,
          'appium:wdaStartupRetries': 3,
          'appium:wdaStartupRetryInterval': 10000,
          'appium:showXcodeLog': true,
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

  await webdriver(sessionPath('/orientation'), { body: { orientation: 'LANDSCAPE' } });
  await webdriver(sessionPath('/url'), { body: { url: baseUrl } });
  await waitForScript('return Boolean(window.CINDERLINE && window.CINDERLINE.ready === true);', BOOT_TIMEOUT);
  await execute('localStorage.clear(); return true;');
  await webdriver(sessionPath('/refresh'), { body: {} });
  await waitForScript('return Boolean(window.CINDERLINE && window.CINDERLINE.ready === true);', BOOT_TIMEOUT);
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
  check(Boolean(newGame), 'new-game control is discoverable', JSON.stringify(title.buttons));
  await clickElement('.title-menu .btn:nth-child(2)');
  await waitForScript('return window.CINDERLINE.game.mode === window.CINDERLINE.MODE.PLAY;', 30000);
  check(true, 'trusted Mobile Safari tap starts a new game', baseUrl);

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
      move(110, 250), down(), move(110, 190, 350), pause(0), pause(150), pause(550), up(), pause(0),
    ]),
    finger('attack-thumb', [
      pause(0), pause(0), pause(350), move(attackX, attackY), down(), pause(150), up(), pause(550),
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
} catch (error) {
  report.failures.push(error.stack || error.message || String(error));
} finally {
  if (sessionId) {
    await webdriver(sessionPath(), { method: 'DELETE' })
      .catch((error) => report.errors.push(`session cleanup: ${error.message}`));
  }
  if (localServer?.server) await new Promise((done) => localServer.server.close(done));
  report.status = report.failures.length ? 'failed' : 'passed';
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(`[ios-safari] ${report.status.toUpperCase()}: ${report.failures.length} failure(s)`);
for (const failure of report.failures) console.error(`- ${failure}`);
if (report.failures.length) process.exit(1);
