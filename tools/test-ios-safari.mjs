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

import { createHash } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyCalibrationTapProxyResetReconciliation,
  classifyOrientationObservation,
  classifyOrientationPostTimeoutReconciliation,
  classifyOrientationProxyResetReconciliation,
  classifySafariEducationPrimaryObservation,
  classifyTrustedTapAttempt,
  coordinateResidual,
  deriveCoordinateCalibration,
  isExactCalibrationTapProxyReset,
  isExactOrientationPostClientTimeout,
  isExactOrientationProxyReset,
  requireSafariEducationDismissedSnapshot,
  safariEducationButtonCandidates,
  safariEducationState,
  selectSafariEducationClose,
  singleNativeElementId,
  translateWebPoint,
  validateCoordinateCalibration,
  validateCalibrationResetNativeWindow,
  validateCalibrationResetSnapshot,
  validateSafariEducationControlSnapshot,
  validateSafariEducationLiveElement,
  validateStableViewport,
} from './ios_safari_coordinates.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const OUTPUT = resolve(ROOT, process.env.CINDERLINE_IOS_OUTPUT || 'test-results/ios-safari');
const REPORT = resolve(OUTPUT, 'report.json');
const GAMEPLAY_SHOT = resolve(OUTPUT, 'ios-safari-gameplay.png');
const PAUSE_SHOT = resolve(OUTPUT, 'ios-safari-pause.png');
const SAFARI_EDUCATION_SOURCE = resolve(OUTPUT, 'native-safari-education.xml');
const SAFARI_EDUCATION_SHOT = resolve(OUTPUT, 'native-safari-education.png');
const SAFARI_EDUCATION_BEFORE_TAP_SOURCE = resolve(
  OUTPUT, 'native-safari-education-before-mobile-tap.xml',
);
const SAFARI_EDUCATION_AFTER_TAP_SOURCE = resolve(
  OUTPUT, 'native-safari-education-after-mobile-tap.xml',
);
const SAFARI_EDUCATION_AFTER_CLICK_SOURCE = resolve(
  OUTPUT, 'native-safari-education-after-element-click.xml',
);
const APPIUM_URL = new URL(process.env.APPIUM_URL || 'http://127.0.0.1:4723/');
const EXTERNAL_URL = process.env.CINDERLINE_TEST_URL || '';
const UDID = process.env.IOS_SIMULATOR_UDID || '';
const PLATFORM_VERSION = process.env.IOS_SIMULATOR_PLATFORM_VERSION || '';
const BOOT_TIMEOUT = Number(process.env.CINDERLINE_IOS_TIMEOUT || 240000);
const SAFARI_EDUCATION_FALLBACK_READ_TIMEOUT_MS = 30000;

mkdirSync(OUTPUT, { recursive: true });

const sourceSha256 = (source) => createHash('sha256').update(source).digest('hex');

const report = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  target: 'iPhone SE (3rd generation) iOS Simulator / Mobile Safari / landscape',
  checks: [],
  device: null,
  coordinateCalibration: [],
  coordinateCalibrationStages: [],
  coordinateCalibrationAttempts: [],
  coordinateCalibrationEvents: [],
  orientationTransitions: [],
  nativeSafariEducation: {
    checked: false,
    present: null,
    dismissed: null,
    markers: [],
    closeCandidates: [],
    buttonCount: null,
    selectedButton: null,
    maxActuations: 2,
    actuationsStarted: 0,
    fallbackAuthorized: null,
    dismissalAttempts: [],
    contextRestoration: null,
    nativeSource: null,
    screenshot: null,
  },
  layout: null,
  interaction: {},
  persistence: null,
  soak: null,
  screenshots: {},
  runtimeErrorCapture: {
    stages: [],
    limitation: 'Listeners start after each page has reached ready and trusted multi-point coordinate calibration has completed. Pre-listener boot errors that neither block ready nor enter CINDERLINE.faults are outside this capture window.',
  },
  errors: [],
  diagnostics: {
    pollErrorCount: 0,
    pollErrors: [],
    cleanupErrors: [],
  },
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

async function webdriver(pathname, { method = 'POST', body, timeout = 900000 } = {}) {
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
    request.setTimeout(timeout, () => request.destroy(new Error(
      `WebDriver ${method} ${pathname} exceeded ${timeout} ms`,
    )));
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

const ORIENTATION_GET_TIMEOUT_MS = 30000;
const ORIENTATION_POST_TIMEOUT_MS = 60000;
const orientationSettle = () => new Promise((done) => setTimeout(done, 750));

async function readOrientationWithResetRetry(transition, phase) {
  const observation = { phase, reads: [], result: null };
  transition.observations.push(observation);
  for (let readAttempt = 1; readAttempt <= 2; readAttempt += 1) {
    const read = {
      attempt: readAttempt,
      timeoutMs: ORIENTATION_GET_TIMEOUT_MS,
      commandCompleted: false,
      proxyReset: false,
      value: null,
      error: null,
    };
    observation.reads.push(read);
    try {
      const value = await webdriver(sessionPath('/orientation'), {
        method: 'GET', timeout: ORIENTATION_GET_TIMEOUT_MS,
      });
      read.commandCompleted = true;
      read.value = value;
      const classified = classifyOrientationObservation(transition.target, value);
      read.value = classified.observed;
      observation.result = classified.observed;
      return classified.observed;
    } catch (error) {
      read.error = error.message;
      read.proxyReset = isExactOrientationProxyReset(error, sessionId, 'GET');
      if (!read.proxyReset || readAttempt === 2) throw error;
      await orientationSettle();
    }
  }
  throw new Error('orientation read retry budget was exhausted');
}

async function ensureOrientation(stage, target) {
  // Every orientation mutation is preceded by a same-session GET. Besides
  // observing the current state, this drains the exact stale WDA keep-alive
  // socket seen at the 30-second boundary before any state-changing command.
  // A self-generated POST timeout leaves delivery unknown: reconcile it with
  // reads only and never resend that timed-out mutation.
  const transition = {
    stage,
    target,
    maxMutationAttempts: 2,
    before: null,
    observations: [],
    mutations: [],
    outcome: 'started',
    error: null,
  };
  report.orientationTransitions.push(transition);
  try {
    transition.before = await readOrientationWithResetRetry(transition, 'preflight');
    const before = classifyOrientationObservation(target, transition.before);
    if (!before.mutationRequired) {
      transition.outcome = 'already-confirmed';
      return transition;
    }

    for (let mutationIndex = 0; mutationIndex < 2; mutationIndex += 1) {
      const attemptNumber = mutationIndex + 1;
      const mutation = {
        attempt: attemptNumber,
        timeoutMs: ORIENTATION_POST_TIMEOUT_MS,
        commandCompleted: false,
        proxyReset: false,
        clientTimeout: false,
        delivery: 'started',
        observedAfter: null,
        reconciliation: null,
        outcome: 'started',
        error: null,
      };
      transition.mutations.push(mutation);
      let postError = null;
      try {
        await webdriver(sessionPath('/orientation'), {
          body: { orientation: target }, timeout: ORIENTATION_POST_TIMEOUT_MS,
        });
        mutation.commandCompleted = true;
        mutation.delivery = 'response-complete';
      } catch (error) {
        postError = error;
        mutation.error = error.message;
        mutation.proxyReset = isExactOrientationProxyReset(error, sessionId, 'POST');
        mutation.clientTimeout = isExactOrientationPostClientTimeout(
          error,
          sessionId,
          ORIENTATION_POST_TIMEOUT_MS,
        );
        mutation.delivery = mutation.clientTimeout
          ? 'unknown-client-timeout'
          : mutation.proxyReset ? 'unknown-proxy-reset' : 'response-error';
      }

      if (!postError) {
        try {
          await orientationSettle();
          mutation.observedAfter = await readOrientationWithResetRetry(
            transition,
            `mutation-${attemptNumber}-verify`,
          );
          const verified = classifyOrientationObservation(target, mutation.observedAfter);
          if (verified.mutationRequired) {
            throw new Error(`orientation POST completed without reaching ${target}: ${verified.observed}`);
          }
        } catch (error) {
          mutation.outcome = 'rejected-verification';
          mutation.error = error.message;
          throw error;
        }
        mutation.outcome = 'confirmed';
        transition.outcome = 'confirmed';
        return transition;
      }

      if (mutation.clientTimeout) {
        const reconciliation = {
          trigger: 'client-timeout',
          firstObserved: null,
          secondObserved: null,
          decision: null,
          error: null,
        };
        mutation.reconciliation = reconciliation;
        try {
          await orientationSettle();
          reconciliation.firstObserved = await readOrientationWithResetRetry(
            transition,
            `mutation-${attemptNumber}-timeout-first`,
          );
          await orientationSettle();
          reconciliation.secondObserved = await readOrientationWithResetRetry(
            transition,
            `mutation-${attemptNumber}-timeout-second`,
          );
          reconciliation.decision = classifyOrientationPostTimeoutReconciliation(
            target,
            reconciliation.firstObserved,
            reconciliation.secondObserved,
          );
          mutation.outcome = 'confirmed-after-timeout';
          transition.outcome = 'confirmed-after-timeout';
          return transition;
        } catch (error) {
          reconciliation.error = error.message;
          mutation.outcome = 'rejected-timeout-reconciliation';
          throw error;
        }
      }

      if (!mutation.proxyReset) {
        mutation.outcome = 'rejected-non-reset';
        throw postError;
      }
      const reconciliation = {
        trigger: 'proxy-reset',
        firstObserved: null,
        secondObserved: null,
        decision: null,
        error: null,
      };
      mutation.reconciliation = reconciliation;
      try {
        await orientationSettle();
        reconciliation.firstObserved = await readOrientationWithResetRetry(
          transition,
          `mutation-${attemptNumber}-reset-first`,
        );
        await orientationSettle();
        reconciliation.secondObserved = await readOrientationWithResetRetry(
          transition,
          `mutation-${attemptNumber}-reset-second`,
        );
        reconciliation.decision = classifyOrientationProxyResetReconciliation(
          target,
          reconciliation.firstObserved,
          reconciliation.secondObserved,
          attemptNumber,
          2,
        );
        if (!reconciliation.decision.retry) {
          mutation.outcome = 'confirmed-after-reset';
          transition.outcome = 'confirmed-after-reset';
          return transition;
        }
      } catch (error) {
        reconciliation.error = error.message;
        mutation.outcome = 'rejected-reset-reconciliation';
        throw error;
      }
      mutation.outcome = 'retry-stable-opposite';
    }
    throw new Error('orientation mutation retry budget was exhausted');
  } catch (error) {
    transition.outcome = 'rejected';
    transition.error = error.message;
    throw error;
  }
}

async function waitForScript(script, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const value = await execute(script);
      if (value) return value;
    } catch (error) {
      report.diagnostics.pollErrorCount += 1;
      if (report.diagnostics.pollErrors.length < 20) {
        report.diagnostics.pollErrors.push(error.message);
      }
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

async function clickScriptElement(script) {
  const element = await execute(script);
  const id = element?.[WEB_ELEMENT_KEY] || element?.ELEMENT;
  if (!id) throw new Error(`Safari script did not resolve a WebDriver element: ${script}`);
  const rect = await execute(`
    var rect = arguments[0].getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  `, [element]);
  if (!rect || ![rect.x, rect.y, rect.width, rect.height]
    .every((value) => typeof value === 'number' && Number.isFinite(value))
    || rect.width <= 0 || rect.height <= 0) {
    throw new Error(`Safari element has no tappable rect: ${JSON.stringify(rect)}`);
  }
  const point = realPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await nativeTap(point.x, point.y);
}

let coordinateCalibration = null;

async function nativeTap(x, y, timeout = 60000) {
  if (![x, y].every((value) => typeof value === 'number' && Number.isFinite(value))) {
    throw new Error(`native Safari tap coordinates must be finite: ${JSON.stringify({ x, y })}`);
  }
  await webdriver(sessionPath('/execute/sync'), {
    timeout,
    body: { script: 'mobile: tap', args: [{ x: Math.round(x), y: Math.round(y) }] },
  });
}

async function readCalibrationResetSnapshot(attemptId) {
  const context = await webdriver(sessionPath('/context'), { method: 'GET', timeout: 15000 });
  const value = await webdriver(sessionPath('/execute/sync'), {
    timeout: 15000,
    body: {
      script: `
        var attempt = window.__cinderlineIosCalibrationAttempts[arguments[0]];
        var overlay = document.getElementById('__cinderlineIosCalibrationOverlay');
        var r = overlay ? overlay.getBoundingClientRect() : null;
        var s = overlay ? getComputedStyle(overlay) : null;
        return {
          attemptId: attempt ? attempt.id : null,
          events: attempt ? attempt.events.slice() : null,
          href: location.href,
          ready: Boolean(window.CINDERLINE && window.CINDERLINE.ready === true),
          viewport: {width:innerWidth,height:innerHeight,
            visualViewport:window.visualViewport
              ? {width:visualViewport.width,height:visualViewport.height,
                offsetLeft:visualViewport.offsetLeft,offsetTop:visualViewport.offsetTop,
                scale:visualViewport.scale}
              : null},
          overlay: overlay ? {id:overlay.id,attemptId:overlay.dataset.attemptId || null,
            connected:overlay.isConnected,rect:{x:r.x,y:r.y,width:r.width,height:r.height},
            style:{pointerEvents:s.pointerEvents,touchAction:s.touchAction,zIndex:s.zIndex}}
            : null
        };
      `,
      args: [attemptId],
    },
  });
  return { context, ...value };
}

async function calibrationResetWdaBarrier(expectedContext, expectedNativeWindow) {
  const contextBefore = await webdriver(sessionPath('/context'), { method: 'GET', timeout: 15000 });
  if (contextBefore !== expectedContext) {
    throw new Error('calibration reset WDA barrier started in a different web context');
  }
  let nativeWindow;
  let operationError = null;
  let restorationError = null;
  let contextAfter = null;
  try {
    // A timed-out response can still leave the remote context switched. Keep
    // the transition inside the exact restoration scope.
    await webdriver(sessionPath('/context'), {
      body: { name: 'NATIVE_APP' }, timeout: 15000,
    });
    nativeWindow = await webdriver(sessionPath('/window/rect'), { method: 'GET', timeout: 15000 });
    validateCalibrationResetNativeWindow(expectedNativeWindow, nativeWindow);
  } catch (error) {
    operationError = error;
  } finally {
    try {
      await webdriver(sessionPath('/context'), {
        body: { name: expectedContext }, timeout: 15000,
      });
      contextAfter = await webdriver(sessionPath('/context'), {
        method: 'GET', timeout: 15000,
      });
      if (contextAfter !== expectedContext) {
        throw new Error('calibration reset WDA barrier did not restore the exact web context');
      }
    } catch (error) {
      restorationError = error;
    }
  }
  if (restorationError) {
    throw new Error(`calibration reset WDA barrier context restoration failed: ${restorationError.message}`,
      { cause: operationError || restorationError });
  }
  if (operationError) throw operationError;
  return { contextBefore, nativeWindow, contextAfter };
}

async function getNativeWindowRect() {
  const originalContext = await webdriver(sessionPath('/context'), { method: 'GET', timeout: 15000 });
  if (typeof originalContext !== 'string' || !originalContext || originalContext === 'NATIVE_APP') {
    throw new Error(`Safari calibration requires an active web context: ${JSON.stringify(originalContext)}`);
  }
  let nativeWindow;
  let operationError = null;
  let restorationError = null;
  let restoredContext = null;
  try {
    await webdriver(sessionPath('/context'), {
      body: { name: 'NATIVE_APP' }, timeout: 15000,
    });
    nativeWindow = await webdriver(sessionPath('/window/rect'), {
      method: 'GET', timeout: 15000,
    });
  } catch (error) {
    operationError = error;
  } finally {
    try {
      await webdriver(sessionPath('/context'), {
        body: { name: originalContext }, timeout: 15000,
      });
      restoredContext = await webdriver(sessionPath('/context'), {
        method: 'GET', timeout: 15000,
      });
      if (restoredContext !== originalContext) {
        throw new Error('Safari native-window read did not restore the exact web context');
      }
    } catch (error) {
      restorationError = error;
    }
  }
  if (restorationError) {
    throw new Error(`Safari native-window context restoration failed: ${restorationError.message}`,
      { cause: operationError || restorationError });
  }
  if (operationError) throw operationError;
  return nativeWindow;
}

async function dismissKnownSafariEducation() {
  const originalContext = await webdriver(sessionPath('/context'), {
    method: 'GET', timeout: 15000,
  });
  if (typeof originalContext !== 'string' || !originalContext || originalContext === 'NATIVE_APP') {
    throw new Error(`Safari education check requires an active web context: ${JSON.stringify(originalContext)}`);
  }
  const record = report.nativeSafariEducation;
  try {
    // Keep the switch inside the restoration scope: a timed-out response can
    // leave the remote context changed even though the client saw an error.
    await webdriver(sessionPath('/context'), {
      body: { name: 'NATIVE_APP' }, timeout: 15000,
    });
    record.checked = true;
    const source = await webdriver(sessionPath('/source'), { method: 'GET', timeout: 15000 });
    const state = safariEducationState(source);
    record.present = state.present;
    record.dismissed = state.present ? false : null;
    record.markers = state.markers;
    if (!state.present) return record;

    writeFileSync(SAFARI_EDUCATION_SOURCE, source);
    record.nativeSource = SAFARI_EDUCATION_SOURCE.slice(ROOT.length + 1);
    await screenshot(SAFARI_EDUCATION_SHOT);
    record.screenshot = SAFARI_EDUCATION_SHOT.slice(ROOT.length + 1);
    report.screenshots.nativeSafariEducation = record.screenshot;

    const nativeWindow = await webdriver(sessionPath('/window/rect'), {
      method: 'GET', timeout: 15000,
    });
    record.nativeWindow = nativeWindow;
    const candidates = safariEducationButtonCandidates(source);
    record.buttonCount = candidates.length;
    record.closeCandidates = candidates;
    const close = selectSafariEducationClose(source, candidates, nativeWindow);
    record.selectedButton = {
      sourceIndex: close.sourceIndex,
      name: close.name,
      label: close.label,
      rect: close.rect,
    };
    const initialElements = await webdriver(sessionPath('/elements'), {
      body: { using: 'accessibility id', value: close.name },
      timeout: 15000,
    });
    record.selectedButton.matchCount = Array.isArray(initialElements) ? initialElements.length : null;
    const initialElementId = singleNativeElementId(initialElements);
    const initialElementPath = sessionPath(`/element/${encodeURIComponent(initialElementId)}`);
    const initialLiveVerification = {
      rect: null, enabled: null, displayed: null, error: null,
    };
    record.selectedButton.liveVerification = initialLiveVerification;
    try {
      initialLiveVerification.rect = await webdriver(`${initialElementPath}/rect`, { method: 'GET', timeout: 15000 });
      initialLiveVerification.enabled = await webdriver(`${initialElementPath}/enabled`, { method: 'GET', timeout: 15000 });
      initialLiveVerification.displayed = await webdriver(`${initialElementPath}/displayed`, { method: 'GET', timeout: 15000 });
      validateSafariEducationLiveElement(close, initialLiveVerification);
    } catch (error) {
      initialLiveVerification.error = error.message;
      throw error;
    }
    record.closeRect = initialLiveVerification.rect;
    const settleEducation = () => new Promise((done) => setTimeout(done, 750));
    const mobileAttempt = {
      attempt: 1,
      method: 'source-derived-mobile-tap',
      target: null,
      point: null,
      activationBarrier: {
        source: null,
        sourceSha256: null,
        nativeWindow: null,
        present: null,
        markers: [],
        selectedButton: null,
        error: null,
      },
      phase: 'pre-actuation',
      actuationStarted: false,
      delivery: 'not-started',
      actuationError: null,
      commandCompleted: false,
      startedAt: null,
      completedAt: null,
      observation: {
        source: null,
        sourceSha256: null,
        rawSourceUnchanged: null,
        nativeWindow: null,
        present: null,
        markers: [],
        selectedButton: null,
        observedAt: null,
        error: null,
      },
      outcome: 'started',
      error: null,
    };
    record.dismissalAttempts.push(mobileAttempt);
    let activationSource;
    let fallbackTarget;
    try {
      const activation = mobileAttempt.activationBarrier;
      activation.nativeWindow = await webdriver(sessionPath('/window/rect'), {
        method: 'GET', timeout: 15000,
      });
      // This full native source is the final remote barrier before the primary
      // education actuation. The point is derived from this snapshot, never
      // from a literal or cached rect.
      activationSource = await webdriver(sessionPath('/source'), {
        method: 'GET', timeout: 15000,
      });
      writeFileSync(SAFARI_EDUCATION_BEFORE_TAP_SOURCE, activationSource);
      activation.source = SAFARI_EDUCATION_BEFORE_TAP_SOURCE.slice(ROOT.length + 1);
      activation.sourceSha256 = sourceSha256(activationSource);
      const activationResult = validateSafariEducationControlSnapshot(
        close,
        activationSource,
        nativeWindow,
        activation.nativeWindow,
      );
      activation.present = activationResult.state.present;
      activation.markers = activationResult.state.markers;
      activation.selectedButton = activationResult.selected;
      mobileAttempt.target = activationResult.selected;
      mobileAttempt.point = activationResult.point;

      mobileAttempt.phase = 'actuation';
      mobileAttempt.actuationStarted = true;
      mobileAttempt.delivery = 'unknown';
      mobileAttempt.startedAt = new Date().toISOString();
      record.actuationsStarted += 1;
      await nativeTap(mobileAttempt.point.x, mobileAttempt.point.y, 15000);
      mobileAttempt.commandCompleted = true;
      mobileAttempt.delivery = 'response-complete';
      mobileAttempt.completedAt = new Date().toISOString();
      mobileAttempt.phase = 'post-actuation';
      await settleEducation();

      const observation = mobileAttempt.observation;
      observation.nativeWindow = await webdriver(sessionPath('/window/rect'), {
        method: 'GET', timeout: 15000,
      });
      const observedSource = await webdriver(sessionPath('/source'), {
        method: 'GET', timeout: 15000,
      });
      writeFileSync(SAFARI_EDUCATION_AFTER_TAP_SOURCE, observedSource);
      observation.source = SAFARI_EDUCATION_AFTER_TAP_SOURCE.slice(ROOT.length + 1);
      observation.sourceSha256 = sourceSha256(observedSource);
      observation.observedAt = new Date().toISOString();
      const observedResult = classifySafariEducationPrimaryObservation(
        mobileAttempt.target,
        activationSource,
        observedSource,
        nativeWindow,
        observation.nativeWindow,
      );
      observation.rawSourceUnchanged = observedResult.rawSourceUnchanged;
      observation.present = observedResult.state.present;
      observation.markers = observedResult.state.markers;
      observation.selectedButton = observedResult.selected;
      if (observedResult.outcome === 'dismissed') {
        mobileAttempt.outcome = 'dismissed';
        record.dismissed = true;
        return record;
      }
      if (observedResult.outcome !== 'fallback-fresh-element-click') {
        throw new Error(`unexpected Safari education primary result: ${observedResult.outcome}`);
      }
      mobileAttempt.outcome = 'fallback-eligible';
      fallbackTarget = observedResult.selected;
      record.fallbackAuthorized = {
        byAttempt: 1,
        reason: observedResult.outcome,
        source: observation.source,
        sourceSha256: observation.sourceSha256,
        rawSourceUnchanged: observation.rawSourceUnchanged,
      };
    } catch (error) {
      if (mobileAttempt.phase === 'pre-actuation') {
        mobileAttempt.activationBarrier.error = error.message;
      } else if (mobileAttempt.phase === 'actuation') {
        mobileAttempt.actuationError = error.message;
      } else if (mobileAttempt.phase === 'post-actuation') {
        mobileAttempt.observation.error = error.message;
      }
      mobileAttempt.outcome = 'rejected';
      mobileAttempt.error = error.message;
      throw error;
    }

    const fallbackAttempt = {
      attempt: 2,
      method: 'fresh-element-click',
      target: fallbackTarget,
      point: null,
      activationBarrier: {
        authorizedByAttempt: 1,
        source: mobileAttempt.observation.source,
        sourceSha256: mobileAttempt.observation.sourceSha256,
        rawSourceUnchanged: mobileAttempt.observation.rawSourceUnchanged,
        nativeWindow: mobileAttempt.observation.nativeWindow,
        selectedButton: fallbackTarget,
        matchCount: null,
        elementId: null,
        liveVerification: {
          rect: null, enabled: null, displayed: null, error: null,
        },
        error: null,
      },
      phase: 'pre-actuation',
      actuationStarted: false,
      delivery: 'not-started',
      actuationError: null,
      commandCompleted: false,
      startedAt: null,
      completedAt: null,
      observation: {
        source: null,
        sourceSha256: null,
        nativeWindow: null,
        present: null,
        markers: [],
        selectedButton: null,
        observedAt: null,
        error: null,
      },
      outcome: 'started',
      error: null,
    };
    record.dismissalAttempts.push(fallbackAttempt);
    try {
      const fallbackActivation = fallbackAttempt.activationBarrier;
      const fallbackElements = await webdriver(sessionPath('/elements'), {
        body: { using: 'accessibility id', value: fallbackTarget.name },
        timeout: SAFARI_EDUCATION_FALLBACK_READ_TIMEOUT_MS,
      });
      fallbackActivation.matchCount = Array.isArray(fallbackElements)
        ? fallbackElements.length
        : null;
      const fallbackElementId = singleNativeElementId(fallbackElements);
      fallbackActivation.elementId = fallbackElementId;
      const fallbackElementPath = sessionPath(
        `/element/${encodeURIComponent(fallbackElementId)}`,
      );
      const fallbackLiveVerification = fallbackActivation.liveVerification;
      try {
        fallbackLiveVerification.rect = await webdriver(`${fallbackElementPath}/rect`, { method: 'GET', timeout: SAFARI_EDUCATION_FALLBACK_READ_TIMEOUT_MS });
        fallbackLiveVerification.enabled = await webdriver(`${fallbackElementPath}/enabled`, { method: 'GET', timeout: SAFARI_EDUCATION_FALLBACK_READ_TIMEOUT_MS });
        fallbackLiveVerification.displayed = await webdriver(`${fallbackElementPath}/displayed`, { method: 'GET', timeout: SAFARI_EDUCATION_FALLBACK_READ_TIMEOUT_MS });
        validateSafariEducationLiveElement(fallbackTarget, fallbackLiveVerification);
      } catch (error) {
        fallbackLiveVerification.error = error.message;
        throw error;
      }

      fallbackAttempt.phase = 'actuation';
      fallbackAttempt.actuationStarted = true;
      fallbackAttempt.delivery = 'unknown';
      fallbackAttempt.startedAt = new Date().toISOString();
      record.actuationsStarted += 1;
      await webdriver(`${fallbackElementPath}/click`, { body: {}, timeout: 15000 });
      fallbackAttempt.commandCompleted = true;
      fallbackAttempt.delivery = 'response-complete';
      fallbackAttempt.completedAt = new Date().toISOString();
      fallbackAttempt.phase = 'post-actuation';
      await settleEducation();

      const fallbackObservation = fallbackAttempt.observation;
      fallbackObservation.nativeWindow = await webdriver(sessionPath('/window/rect'), {
        method: 'GET', timeout: 15000,
      });
      const finalSource = await webdriver(sessionPath('/source'), {
        method: 'GET', timeout: 15000,
      });
      writeFileSync(SAFARI_EDUCATION_AFTER_CLICK_SOURCE, finalSource);
      fallbackObservation.source = SAFARI_EDUCATION_AFTER_CLICK_SOURCE.slice(ROOT.length + 1);
      fallbackObservation.sourceSha256 = sourceSha256(finalSource);
      fallbackObservation.observedAt = new Date().toISOString();
      const finalState = safariEducationState(finalSource);
      fallbackObservation.present = finalState.present;
      fallbackObservation.markers = finalState.markers;
      fallbackObservation.selectedButton = finalState.present
        ? selectSafariEducationClose(
          finalSource,
          safariEducationButtonCandidates(finalSource),
          fallbackObservation.nativeWindow,
        )
        : null;
      requireSafariEducationDismissedSnapshot(
        fallbackTarget,
        finalSource,
        nativeWindow,
        fallbackObservation.nativeWindow,
      );
      fallbackAttempt.outcome = 'dismissed';
      record.dismissed = true;
      return record;
    } catch (error) {
      if (fallbackAttempt.phase === 'pre-actuation') {
        fallbackAttempt.activationBarrier.error = error.message;
      } else if (fallbackAttempt.phase === 'actuation') {
        fallbackAttempt.actuationError = error.message;
      } else if (fallbackAttempt.phase === 'post-actuation') {
        fallbackAttempt.observation.error = error.message;
      }
      fallbackAttempt.outcome = 'rejected';
      fallbackAttempt.error = error.message;
      throw error;
    }
  } catch (error) {
    record.error = error.message;
    throw error;
  } finally {
    const restoration = { expected: originalContext, actual: null, restored: false, error: null };
    record.contextRestoration = restoration;
    try {
      await webdriver(sessionPath('/context'), {
        body: { name: originalContext }, timeout: 15000,
      });
      restoration.actual = await webdriver(sessionPath('/context'), {
        method: 'GET', timeout: 15000,
      });
      restoration.restored = restoration.actual === originalContext;
      if (!restoration.restored) {
        throw new Error(`Safari education context restoration mismatch: ${JSON.stringify(restoration)}`);
      }
    } catch (error) {
      restoration.error = error.message;
      throw error;
    }
  }
}

async function calibrateCoordinates(stage) {
  const rect = await getNativeWindowRect();
  if (!rect || ![rect.x, rect.y, rect.width, rect.height]
    .every((value) => typeof value === 'number' && Number.isFinite(value))
    || rect.width < 200 || rect.height < 200) {
    throw new Error(`Appium returned an invalid native window rect: ${JSON.stringify(rect)}`);
  }
  await waitForScript('return Boolean(window.CINDERLINE && window.CINDERLINE.ready === true);', BOOT_TIMEOUT);
  const calibrationWebContext = await webdriver(sessionPath('/context'), {
    method: 'GET', timeout: 15000,
  });
  if (typeof calibrationWebContext !== 'string' || !calibrationWebContext
      || calibrationWebContext === 'NATIVE_APP') {
    throw new Error(`Safari calibration requires an exact web context: ${JSON.stringify(calibrationWebContext)}`);
  }
  const calibrationHref = await webdriver(sessionPath('/execute/sync'), {
    timeout: 15000,
    body: { script: 'return location.href;', args: [] },
  });
  if (typeof calibrationHref !== 'string' || !calibrationHref) {
    throw new Error(`Safari calibration requires a stable URL: ${JSON.stringify(calibrationHref)}`);
  }
  const nativePoints = [
    { x: Math.round(rect.x + rect.width * 0.26), y: Math.round(rect.y + rect.height * 0.34) },
    { x: Math.round(rect.x + rect.width * 0.74), y: Math.round(rect.y + rect.height * 0.66) },
    { x: Math.round(rect.x + rect.width * 0.65), y: Math.round(rect.y + rect.height * 0.40) },
  ];
  await execute(`
    var previous = document.getElementById('__cinderlineIosCalibrationOverlay');
    if (previous) previous.remove();
    window.__cinderlineIosCalibrationAttempts = Object.create(null);
    window.__cinderlineIosCalibrationEventLog = [];
    return true;
  `);
  try {
    const viewport = await execute(`return {width:innerWidth,height:innerHeight,
      visualViewport:window.visualViewport
        ? {width:visualViewport.width,height:visualViewport.height,offsetLeft:visualViewport.offsetLeft,
          offsetTop:visualViewport.offsetTop,scale:visualViewport.scale}
        : null};`);
    if (!viewport || ![viewport.width, viewport.height]
      .every((value) => typeof value === 'number' && Number.isFinite(value) && value > 0)) {
      throw new Error(`Safari returned an invalid CSS viewport: ${JSON.stringify(viewport)}`);
    }
    report.coordinateCalibrationStages.push({
      stage, nativeWindow: rect, webViewport: viewport, webContext: calibrationWebContext,
      href: calibrationHref, expectedNativePoints: nativePoints,
    });
    const webPoints = [];
    const settle = () => new Promise((done) => setTimeout(done, 750));
    for (let index = 0; index < nativePoints.length; index += 1) {
      if (index > 0) await settle();
      let pointValue = null;
      for (let retry = 0; retry < 2 && !pointValue; retry += 1) {
        if (retry > 0) await settle();
        const attemptId = `${stage}-${index + 1}-${retry + 1}`;
        const attemptViewport = await execute(`return {width:innerWidth,height:innerHeight,
          visualViewport:window.visualViewport
            ? {width:visualViewport.width,height:visualViewport.height,offsetLeft:visualViewport.offsetLeft,
              offsetTop:visualViewport.offsetTop,scale:visualViewport.scale}
            : null};`);
        try {
          validateStableViewport(viewport, attemptViewport);
        } catch (error) {
          throw new Error(`Safari viewport changed during coordinate calibration: ${JSON.stringify({
            initial: viewport, current: attemptViewport, attemptId,
          })}; ${error.message}`);
        }
        const overlay = await execute(`
          var previous = document.getElementById('__cinderlineIosCalibrationOverlay');
          if (previous) previous.remove();
          var attemptId = ${JSON.stringify(attemptId)};
          var attempt = {id:attemptId,events:[],startedAt:performance.now()};
          window.__cinderlineIosCalibrationAttempts[attemptId] = attempt;
          var overlay = document.createElement('div');
          overlay.id = '__cinderlineIosCalibrationOverlay';
          overlay.dataset.attemptId = attemptId;
          overlay.setAttribute('aria-hidden', 'true');
          Object.assign(overlay.style, {
            position:'fixed',inset:'0',zIndex:'2147483647',pointerEvents:'auto',
            touchAction:'none',background:'transparent'
          });
          function record(event) {
            var entry = {
              attemptId:attemptId,type:event.type,x:event.clientX,y:event.clientY,
              pointerId:Number.isInteger(event.pointerId) ? event.pointerId : null,
              pointerType:event.pointerType || '',trusted:event.isTrusted,
              targetMatches:event.target === overlay,timeStamp:event.timeStamp
            };
            attempt.events.push(entry);
            window.__cinderlineIosCalibrationEventLog.push(entry);
          }
          ['pointerdown','pointerup','pointercancel','click','dblclick'].forEach(function (type) {
            overlay.addEventListener(type, function (event) {
              record(event);
              event.stopImmediatePropagation();
              if (type === 'click' || type === 'dblclick') event.preventDefault();
            }, true);
          });
          ['touchstart','touchend','touchcancel'].forEach(function (type) {
            overlay.addEventListener(type, function (event) {
              var entry = {attemptId:attemptId,type:type,trusted:event.isTrusted,
                targetMatches:event.target === overlay,timeStamp:event.timeStamp};
              attempt.events.push(entry);
              window.__cinderlineIosCalibrationEventLog.push(entry);
              event.stopImmediatePropagation();
            }, true);
          });
          document.documentElement.appendChild(overlay);
          var r=overlay.getBoundingClientRect(),s=getComputedStyle(overlay);
          return {id:overlay.id,attemptId:overlay.dataset.attemptId,
            connected:overlay.isConnected,rect:{x:r.x,y:r.y,width:r.width,height:r.height},
            style:{pointerEvents:s.pointerEvents,touchAction:s.touchAction,zIndex:s.zIndex}};
        `);
        const recordedAttempt = {
          stage, point: index + 1, retry: retry + 1, attemptId,
          nativePoint: nativePoints[index], webViewport: attemptViewport,
          overlay, outcome: 'started', nativeTapCompleted: false,
          browserDeliveryObserved: false, transportOutcome: null,
          reconciliation: null, events: [],
        };
        report.coordinateCalibrationAttempts.push(recordedAttempt);
        try {
          let nativeTapError = null;
          try {
            await nativeTap(nativePoints[index].x, nativePoints[index].y);
            recordedAttempt.nativeTapCompleted = true;
            recordedAttempt.transportOutcome = 'response-complete';
          } catch (error) {
            nativeTapError = error;
          }
          let classified;
          if (nativeTapError) {
            if (!isExactCalibrationTapProxyReset(nativeTapError, sessionId)) throw nativeTapError;
            recordedAttempt.transportOutcome = 'unknown-response-reset';
            recordedAttempt.transportError = nativeTapError.message;
            const reconciliation = {
              firstSnapshot: null,
              barrierStartedAt: null,
              wdaBarrier: null,
              barrierCompletedAt: null,
              secondSnapshot: null,
              decision: 'started',
            };
            recordedAttempt.reconciliation = reconciliation;
            const expectedSnapshot = {
              attemptId,
              context: calibrationWebContext,
              href: calibrationHref,
              viewport: attemptViewport,
              overlay,
            };
            const firstSnapshot = await readCalibrationResetSnapshot(attemptId);
            reconciliation.firstSnapshot = firstSnapshot;
            validateCalibrationResetSnapshot(firstSnapshot, expectedSnapshot);
            const barrierStartedAt = new Date().toISOString();
            reconciliation.barrierStartedAt = barrierStartedAt;
            const barrier = await calibrationResetWdaBarrier(calibrationWebContext, rect);
            reconciliation.wdaBarrier = barrier;
            await settle();
            const secondSnapshot = await readCalibrationResetSnapshot(attemptId);
            reconciliation.secondSnapshot = secondSnapshot;
            classified = classifyCalibrationTapProxyResetReconciliation(
              firstSnapshot,
              secondSnapshot,
              expectedSnapshot,
              retry + 1,
              2,
            );
            recordedAttempt.events = secondSnapshot.events;
            recordedAttempt.browserDeliveryObserved = classified.outcome === 'complete';
            reconciliation.barrierCompletedAt = new Date().toISOString();
            reconciliation.decision = classified.outcome === 'complete'
              ? 'observed-complete'
              : `retry-${classified.reason}`;
          } else {
            await waitForScript(`
              var attempt = window.__cinderlineIosCalibrationAttempts[${JSON.stringify(attemptId)}];
              return attempt && attempt.events.some(function (event) {
                return event.type === 'pointerup' || event.type === 'pointercancel';
              }) ? true : null;
            `, 5000).catch(() => null);
            await new Promise((done) => setTimeout(done, 150));
            const events = await execute(`
              var attempt = window.__cinderlineIosCalibrationAttempts[${JSON.stringify(attemptId)}];
              return attempt ? attempt.events.slice() : [];
            `);
            recordedAttempt.events = events;
            classified = classifyTrustedTapAttempt(events, attemptId, retry + 1, 2);
            recordedAttempt.browserDeliveryObserved = classified.outcome === 'complete';
          }
          if (classified.outcome === 'retry') {
            recordedAttempt.outcome = classified.reason;
            continue;
          }
          pointValue = classified.point;
          recordedAttempt.outcome = 'complete';
        } catch (error) {
          if (recordedAttempt.reconciliation
              && recordedAttempt.reconciliation.decision === 'started') {
            recordedAttempt.reconciliation.decision = 'rejected';
          }
          if (recordedAttempt.events.length === 0) {
            recordedAttempt.events = await execute(`
              var attempt = window.__cinderlineIosCalibrationAttempts[${JSON.stringify(attemptId)}];
              return attempt ? attempt.events.slice() : [];
            `).catch(() => []);
          }
          recordedAttempt.outcome = ['no-events', 'trusted-cancel'].includes(recordedAttempt.outcome)
            ? recordedAttempt.outcome
            : 'rejected';
          recordedAttempt.error = error.message;
          throw error;
        } finally {
          await execute(`
            var overlay=document.getElementById('__cinderlineIosCalibrationOverlay');
            if (overlay) overlay.remove();
            return true;
          `).catch((error) => report.diagnostics.cleanupErrors.push(`attempt overlay cleanup: ${error.message}`));
        }
      }
      webPoints.push({ x: pointValue.x, y: pointValue.y });
    }
    const value = validateCoordinateCalibration(
      deriveCoordinateCalibration(nativePoints.slice(0, 2), webPoints.slice(0, 2)),
    );
    const verificationError = coordinateResidual(value, nativePoints[2], webPoints[2]);
    if (verificationError > 4) {
      throw new Error(`Safari calibration failed its independent third-point check: residual=${verificationError}`);
    }
    const topLeft = translateWebPoint(value, 0, 0);
    const bottomRight = translateWebPoint(value, viewport.width, viewport.height);
    const margin = 3;
    if (topLeft.x < rect.x - margin || topLeft.y < rect.y - margin
      || bottomRight.x > rect.x + rect.width + margin
      || bottomRight.y > rect.y + rect.height + margin) {
      throw new Error(`Safari calibration maps its viewport outside the native window: ${JSON.stringify({
        rect, viewport, topLeft, bottomRight,
      })}`);
    }
    const calibration = {
      stage,
      source: 'two-point transform plus an independent trusted third-point check on the product page',
      ...value,
      nativePoints,
      webPoints,
      nativeWindow: rect,
      webViewport: viewport,
      verificationError,
    };
    coordinateCalibration = value;
    report.coordinateCalibration.push(calibration);
    return calibration;
  } catch (error) {
    const safeStage = stage.replace(/[^a-z0-9_-]+/gi, '-');
    const failureShot = resolve(OUTPUT, `ios-safari-calibration-${safeStage}-failure.png`);
    await screenshot(failureShot)
      .then(() => { report.screenshots[`calibration-${stage}-failure`] = failureShot.slice(ROOT.length + 1); })
      .catch((shotError) => report.diagnostics.cleanupErrors.push(`calibration failure screenshot: ${shotError.message}`));
    throw error;
  } finally {
    await execute('return (window.__cinderlineIosCalibrationEventLog || []).slice();')
      .then((events) => report.coordinateCalibrationEvents.push({ stage, events }))
      .catch((error) => report.diagnostics.cleanupErrors.push(`calibration event-log capture: ${error.message}`));
    await execute(`
      var overlay = document.getElementById('__cinderlineIosCalibrationOverlay');
      if (overlay) overlay.remove();
      return true;
    `).catch((error) => report.diagnostics.cleanupErrors.push(`calibration overlay cleanup: ${error.message}`));
  }
}

function realPoint(x, y) {
  if (!coordinateCalibration) throw new Error('Safari coordinates were used before calibration');
  return translateWebPoint(coordinateCalibration, x, y);
}

function finger(id, actions) {
  return { type: 'pointer', id, parameters: { pointerType: 'touch' }, actions };
}

const move = (x, y, duration = 0) => {
  const point = realPoint(x, y);
  return {
    type: 'pointerMove', duration,
    x: Math.round(point.x), y: Math.round(point.y), origin: 'viewport',
  };
};
const down = () => ({ type: 'pointerDown', button: 0 });
const up = () => ({ type: 'pointerUp', button: 0 });
const pause = (duration) => ({ type: 'pause', duration });

async function screenshot(path) {
  // WDA screenshots have taken more than 40 seconds on the hosted runner;
  // retain that measured margin while avoiding webdriver's 15-minute default.
  const encoded = await webdriver(sessionPath('/screenshot'), {
    method: 'GET', timeout: 60000,
  });
  writeFileSync(path, Buffer.from(encoded, 'base64'));
}

async function injectErrorCapture(stage) {
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
  report.runtimeErrorCapture.stages.push({ stage, installedAt: new Date().toISOString() });
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
          // GitHub's macOS runner pre-boots CoreSimulator without a visible UI.
          // Tell XCUITest to keep that supported headless state; otherwise it
          // shuts down a ready device to launch Simulator.app and can spend the
          // full startup timeout waiting for a window that CI does not need.
          'appium:isHeadless': true,
          'appium:newCommandTimeout': 300,
          'appium:safariAllowPopups': true,
          'appium:includeSafariInWebviews': true,
          'appium:safariInitialUrl': baseUrl,
          'appium:webviewConnectTimeout': 120000,
          'appium:webviewConnectRetries': 20,
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

  await ensureOrientation('initial-landscape', 'LANDSCAPE');
  await webdriver(sessionPath('/url'), { body: { url: baseUrl } });
  await waitForScript('return Boolean(window.CINDERLINE && window.CINDERLINE.ready === true);', BOOT_TIMEOUT);
  await execute('localStorage.clear(); return true;');
  await webdriver(sessionPath('/refresh'), { body: {} });
  await waitForScript('return Boolean(window.CINDERLINE && window.CINDERLINE.ready === true);', BOOT_TIMEOUT);
  await dismissKnownSafariEducation();
  const initialCalibration = await calibrateCoordinates('initial-landscape');
  await waitForScript('return Boolean(window.CINDERLINE && window.CINDERLINE.ready === true);', BOOT_TIMEOUT);
  check(true, 'Safari web coordinates are calibrated to native screen coordinates',
    JSON.stringify(initialCalibration));
  await injectErrorCapture('initial-post-ready-calibration');

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
  await execute(`
    var node = window.CINDERLINE.game.menus.titleButtons.new;
    window.__cinderlineIosTapProbe = [];
    ['pointerdown', 'pointerup', 'click'].forEach(function (type) {
      node.addEventListener(type, function (event) {
        window.__cinderlineIosTapProbe.push({
          type:type,
          trusted:event.isTrusted,
          pointerType:event.pointerType || '',
          clientX:event.clientX,
          clientY:event.clientY,
          targetMatches:event.target === node
        });
      });
    });
    return true;
  `);
  await clickScriptElement('return window.CINDERLINE.game.menus.titleButtons.new;');
  await waitForScript('return window.CINDERLINE.game.mode === window.CINDERLINE.MODE.PLAY;', 30000);
  const titleTapProbe = await execute('return (window.__cinderlineIosTapProbe || []).slice();');
  report.interaction.titleTap = titleTapProbe;
  check(titleTapProbe.some((event) => event.type === 'pointerdown' && event.trusted && event.targetMatches)
      && titleTapProbe.some((event) => event.type === 'pointerup' && event.trusted && event.targetMatches),
    'native Mobile Safari tap emits trusted pointer events', JSON.stringify(titleTapProbe));
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
      move(110, 250), down(), move(110, 190, 350), pause(700), up(),
    ]),
    finger('attack-thumb', [
      move(attackX, attackY), pause(350), down(), pause(700), up(),
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

  await clickScriptElement('return window.CINDERLINE.game.hud.sysMenu;');
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
  await clickScriptElement("return window.CINDERLINE.game.menus.pauseNode.querySelectorAll('.btn')[0];");
  await waitForScript("return Boolean(localStorage.getItem('cinderline.save.v1'));", 10000);
  const saved = await execute(`
    var p=window.CINDERLINE.game.player;
    return {x:p.pos.x,y:p.pos.y,z:p.pos.z,bytes:localStorage.getItem('cinderline.save.v1').length};
  `);
  await clickScriptElement("var b=window.CINDERLINE.game.menus.pauseNode.querySelectorAll('.btn');return b[b.length-1];");
  await waitForScript('return window.CINDERLINE.game.mode === window.CINDERLINE.MODE.PLAY;');

  await ensureOrientation('gameplay-portrait', 'PORTRAIT');
  await waitForScript("return document.getElementById('rotate').classList.contains('on');", 15000);
  const portrait = await execute(`return {prompt:document.getElementById('rotate').classList.contains('on'),
    paused:window.CINDERLINE.engine.isPaused,portrait:matchMedia('(orientation: portrait)').matches};`);
  check(portrait.prompt && portrait.paused && portrait.portrait,
    'turning to portrait blocks input and pauses play', JSON.stringify(portrait));
  await ensureOrientation('gameplay-landscape', 'LANDSCAPE');
  await waitForScript("return !document.getElementById('rotate').classList.contains('on');", 15000);
  const landscapeAgain = await execute(`return {paused:window.CINDERLINE.engine.isPaused,
    landscape:matchMedia('(orientation: landscape)').matches};`);
  check(!landscapeAgain.paused && landscapeAgain.landscape,
    'returning to landscape restores play', JSON.stringify(landscapeAgain));

  const errorsBeforeReload = await execute('return (window.__cinderlineIosErrors || []).slice();');
  report.errors.push(...errorsBeforeReload);
  await webdriver(sessionPath('/refresh'), { body: {} });
  await waitForScript('return Boolean(window.CINDERLINE && window.CINDERLINE.ready === true);', BOOT_TIMEOUT);
  const restoredCalibration = await calibrateCoordinates('post-orientation-landscape');
  await waitForScript('return Boolean(window.CINDERLINE && window.CINDERLINE.ready === true);', BOOT_TIMEOUT);
  check(true, 'Safari coordinates are recalibrated after orientation changes',
    JSON.stringify(restoredCalibration));
  await injectErrorCapture('reload-post-ready-calibration');
  const continueButton = await execute(`
    var r=window.CINDERLINE.game.menus.titleButtons.continue.getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height};
  `);
  check(continueButton.width >= 44 && continueButton.height >= 44,
    'saved run exposes a touch-sized Continue action', JSON.stringify(continueButton));
  await clickScriptElement('return window.CINDERLINE.game.menus.titleButtons.continue;');
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
    'no captured post-ready Mobile Safari runtime errors', JSON.stringify({ errorsBeforeReload, errorsAfterReload }));
} catch (error) {
  report.failures.push(error.stack || error.message || String(error));
} finally {
  if (sessionId) {
    await webdriver(sessionPath(), { method: 'DELETE' })
      .catch((error) => report.diagnostics.cleanupErrors.push(`session cleanup: ${error.message}`));
  }
  if (localServer?.server) await new Promise((done) => localServer.server.close(done));
  report.status = report.failures.length ? 'failed' : 'passed';
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(`[ios-safari] ${report.status.toUpperCase()}: ${report.failures.length} failure(s)`);
for (const failure of report.failures) console.error(`- ${failure}`);
if (report.failures.length) process.exit(1);
