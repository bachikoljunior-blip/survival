#!/usr/bin/env node

import { readFileSync } from 'node:fs';

/**
 * Pure helpers for the iOS Safari coordinate gate.
 *
 * XCUITest gestures use native screen coordinates while Safari reports DOM
 * events in CSS pixels. Two trusted native taps at known screen points let the
 * gate solve the axis-aligned transform without trusting a cached or stale
 * driver calibration result.
 */

const REQUIRED_FIELDS = ['offsetX', 'offsetY', 'pixelRatioX', 'pixelRatioY'];

function finiteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function point(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a coordinate object`);
  }
  return {
    x: finiteNumber(value.x, `${label}.x`),
    y: finiteNumber(value.y, `${label}.y`),
  };
}

export function validateCoordinateCalibration(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('coordinate calibration must be an object');
  }
  const result = {};
  for (const field of REQUIRED_FIELDS) {
    if (!Object.hasOwn(value, field)) {
      throw new Error(`coordinate calibration is missing ${field}`);
    }
    result[field] = finiteNumber(value[field], `coordinate calibration ${field}`);
  }
  if (result.pixelRatioX <= 0 || result.pixelRatioY <= 0) {
    throw new Error('coordinate calibration pixel ratios must be positive');
  }
  return result;
}

export function deriveCoordinateCalibration(nativePoints, webPoints) {
  if (!Array.isArray(nativePoints) || nativePoints.length !== 2
      || !Array.isArray(webPoints) || webPoints.length !== 2) {
    throw new Error('coordinate calibration requires exactly two native and two web points');
  }
  const [native0, native1] = nativePoints.map((value, index) => point(value, `nativePoints[${index}]`));
  const [web0, web1] = webPoints.map((value, index) => point(value, `webPoints[${index}]`));
  const nativeDeltaX = native1.x - native0.x;
  const nativeDeltaY = native1.y - native0.y;
  const webDeltaX = web1.x - web0.x;
  const webDeltaY = web1.y - web0.y;
  if (nativeDeltaX === 0 || nativeDeltaY === 0) {
    throw new Error('native calibration points must differ on both axes');
  }
  if (webDeltaX === 0 || webDeltaY === 0) {
    throw new Error('Safari returned stale or identical calibration points');
  }
  const pixelRatioX = nativeDeltaX / webDeltaX;
  const pixelRatioY = nativeDeltaY / webDeltaY;
  return validateCoordinateCalibration({
    offsetX: native0.x - web0.x * pixelRatioX,
    offsetY: native0.y - web0.y * pixelRatioY,
    pixelRatioX,
    pixelRatioY,
  });
}

export function translateWebPoint(calibration, x, y) {
  const value = validateCoordinateCalibration(calibration);
  return {
    x: value.offsetX + finiteNumber(x, 'web x') * value.pixelRatioX,
    y: value.offsetY + finiteNumber(y, 'web y') * value.pixelRatioY,
  };
}

export function coordinateResidual(calibration, nativePoint, webPoint) {
  const nativeValue = point(nativePoint, 'nativePoint');
  const webValue = point(webPoint, 'webPoint');
  const translated = translateWebPoint(calibration, webValue.x, webValue.y);
  return Math.hypot(translated.x - nativeValue.x, translated.y - nativeValue.y);
}

export function validateTrustedTapSequence(events, expectedAttemptId = null) {
  if (!Array.isArray(events)) throw new Error('trusted tap events must be an array');
  const downs = events.filter((event) => event?.type === 'pointerdown');
  const ups = events.filter((event) => event?.type === 'pointerup');
  const cancels = events.filter((event) => event?.type === 'pointercancel');
  if (cancels.length) throw new Error('trusted tap was cancelled');
  if (downs.length !== 1 || ups.length !== 1) {
    throw new Error('trusted tap requires exactly one pointerdown and one pointerup');
  }
  const down = downs[0];
  const up = ups[0];
  if (events.indexOf(down) >= events.indexOf(up)) {
    throw new Error('trusted tap pointer events are out of order');
  }
  if (!down.trusted || !up.trusted) throw new Error('trusted tap events must be browser-trusted');
  if (!down.targetMatches || !up.targetMatches) throw new Error('trusted tap events must target the calibration overlay');
  if (down.pointerType !== 'touch' || up.pointerType !== 'touch') {
    throw new Error('trusted tap pointer type must be touch');
  }
  if (expectedAttemptId !== null
      && (down.attemptId !== expectedAttemptId || up.attemptId !== expectedAttemptId)) {
    throw new Error('trusted tap contains an event from another attempt');
  }
  if (!Number.isInteger(down.pointerId) || down.pointerId !== up.pointerId) {
    throw new Error('trusted tap pointer identity changed');
  }
  const downPoint = point(down, 'pointerdown');
  const upPoint = point(up, 'pointerup');
  if (Math.hypot(upPoint.x - downPoint.x, upPoint.y - downPoint.y) > 2) {
    throw new Error('trusted tap moved too far between pointerdown and pointerup');
  }
  return { x: downPoint.x, y: downPoint.y, pointerId: down.pointerId };
}

export function classifyTrustedTapAttempt(
  events,
  expectedAttemptId = null,
  attemptNumber = 1,
  maxAttempts = 2,
) {
  if (!Array.isArray(events)) throw new Error('trusted tap events must be an array');
  if (!Number.isInteger(attemptNumber) || !Number.isInteger(maxAttempts)
      || attemptNumber < 1 || maxAttempts < 1 || attemptNumber > maxAttempts) {
    throw new Error('trusted tap attempt bounds are invalid');
  }
  if (events.length === 0) {
    if (attemptNumber === maxAttempts) throw new Error('trusted tap retry budget was exhausted with no browser events');
    return { outcome: 'retry' };
  }
  return {
    outcome: 'complete',
    point: validateTrustedTapSequence(events, expectedAttemptId),
  };
}

export function validateStableViewport(initial, current) {
  const read = (value, label) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`${label} must be a viewport object`);
    }
    const width = finiteNumber(value.width, `${label}.width`);
    const height = finiteNumber(value.height, `${label}.height`);
    if (width <= 0 || height <= 0) throw new Error(`${label} dimensions must be positive`);
    let visualViewport = null;
    if (value.visualViewport !== null && value.visualViewport !== undefined) {
      if (typeof value.visualViewport !== 'object' || Array.isArray(value.visualViewport)) {
        throw new Error(`${label}.visualViewport must be an object or null`);
      }
      visualViewport = {};
      for (const field of ['width', 'height', 'offsetLeft', 'offsetTop', 'scale']) {
        visualViewport[field] = finiteNumber(
          value.visualViewport[field],
          `${label}.visualViewport.${field}`,
        );
      }
      if (visualViewport.width <= 0 || visualViewport.height <= 0 || visualViewport.scale <= 0) {
        throw new Error(`${label}.visualViewport dimensions and scale must be positive`);
      }
    }
    return { width, height, visualViewport };
  };
  const before = read(initial, 'initial viewport');
  const after = read(current, 'current viewport');
  if (before.width !== after.width || before.height !== after.height) {
    throw new Error('Safari viewport changed during coordinate calibration');
  }
  if ((before.visualViewport === null) !== (after.visualViewport === null)) {
    throw new Error('Safari visual viewport availability changed during coordinate calibration');
  }
  if (before.visualViewport) {
    for (const field of ['width', 'height', 'offsetLeft', 'offsetTop', 'scale']) {
      if (before.visualViewport[field] !== after.visualViewport[field]) {
        throw new Error(`Safari visual viewport ${field} changed during coordinate calibration`);
      }
    }
  }
  return after;
}

export function validateHeadlessHarnessContract(harnessSource, workflowSources) {
  const sourceText = String(harnessSource);
  const headlessCaps = sourceText.match(/^\s*['"]appium:isHeadless['"]\s*:\s*true,?\s*$/gm) || [];
  const visibleCaps = sourceText.match(/^\s*['"]appium:isHeadless['"]\s*:\s*false,?\s*$/gm) || [];
  if (headlessCaps.length !== 1 || visibleCaps.length !== 0) {
    throw new Error('Mobile Safari harness must set appium:isHeadless to true exactly once');
  }
  if (!Array.isArray(workflowSources) || workflowSources.length !== 2) {
    throw new Error('both PR and Pages workflows are required');
  }
  for (const [name, source] of workflowSources) {
    const boot = String(source).indexOf('xcrun simctl bootstatus "$udid" -b');
    const record = String(source).indexOf('recordVideo --codec=h264');
    if (boot < 0 || record < 0 || boot >= record) {
      throw new Error(`${name} must finish headless boot before starting the recorder`);
    }
  }
  return true;
}

function expectPass(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS ${name}\n`);
    return true;
  } catch (error) {
    process.stderr.write(`FAIL ${name}: ${error.message}\n`);
    return false;
  }
}

function expectFail(name, fn) {
  try {
    fn();
    process.stderr.write(`FAIL ${name}: unexpectedly accepted\n`);
    return false;
  } catch {
    process.stdout.write(`PASS ${name}\n`);
    return true;
  }
}

function selfTest() {
  let passed = 0;
  let total = 0;
  const pass = (name, fn) => { total += 1; if (expectPass(name, fn)) passed += 1; };
  const fail = (name, fn) => { total += 1; if (expectFail(name, fn)) passed += 1; };
  const good = { offsetX: 5, offsetY: 11, pixelRatioX: 0.5, pixelRatioY: 0.75 };
  const tapEvent = (type, overrides = {}) => ({
    type, x: 123, y: 45, pointerId: 7, pointerType: 'touch',
    trusted: true, targetMatches: true, attemptId: 'attempt-1', ...overrides,
  });
  const goodTap = [
    tapEvent('pointerdown'),
    tapEvent('touchstart'),
    tapEvent('pointerup', { x: 124, y: 46 }),
    tapEvent('touchend'),
    tapEvent('click', { x: 124, y: 46 }),
  ];

  pass('valid flat numeric calibration', () => validateCoordinateCalibration(good));
  pass('two points derive the expected transform', () => {
    const result = deriveCoordinateCalibration(
      [{ x: 55, y: 86 }, { x: 155, y: 236 }],
      [{ x: 100, y: 100 }, { x: 300, y: 300 }],
    );
    if (result.offsetX !== 5 || result.offsetY !== 11
        || result.pixelRatioX !== 0.5 || result.pixelRatioY !== 0.75) {
      throw new Error(JSON.stringify(result));
    }
  });
  pass('translation applies the derived transform', () => {
    const result = translateWebPoint(good, 300, 300);
    if (result.x !== 155 || result.y !== 236) throw new Error(JSON.stringify(result));
  });
  pass('independent third point has zero residual', () => {
    const residual = coordinateResidual(good, { x: 105, y: 161 }, { x: 200, y: 200 });
    if (residual !== 0) throw new Error(`residual=${residual}`);
  });
  pass('independent third point exposes a wrong transform', () => {
    const residual = coordinateResidual(good, { x: 205, y: 261 }, { x: 200, y: 200 });
    if (residual < 100) throw new Error(`residual=${residual}`);
  });
  pass('trusted pointer sequence yields its web point', () => {
    const result = validateTrustedTapSequence(goodTap, 'attempt-1');
    if (result.x !== 123 || result.y !== 45 || result.pointerId !== 7) throw new Error(JSON.stringify(result));
  });
  pass('zero-event delivery is the only retryable outcome', () => {
    if (classifyTrustedTapAttempt([], 'attempt-1', 1, 2).outcome !== 'retry') throw new Error('not retryable');
  });
  pass('zero-event then valid retry preserves successful attempt', () => {
    const first = classifyTrustedTapAttempt([], 'attempt-1', 1, 2);
    const second = classifyTrustedTapAttempt(goodTap, 'attempt-1', 2, 2);
    if (first.outcome !== 'retry' || second.outcome !== 'complete' || second.point.x !== 123) {
      throw new Error(JSON.stringify({ first, second }));
    }
  });
  pass('complete pointer delivery is accepted without click', () => {
    const result = classifyTrustedTapAttempt(goodTap.slice(0, 4), 'attempt-1', 1, 2);
    if (result.outcome !== 'complete') throw new Error(JSON.stringify(result));
  });
  pass('stable viewport is accepted', () => validateStableViewport(
    { width: 667, height: 311 }, { width: 667, height: 311 },
  ));
  pass('stable visual viewport is accepted', () => validateStableViewport(
    { width: 667, height: 311, visualViewport: {
      width: 667, height: 311, offsetLeft: 0, offsetTop: 0, scale: 1,
    } },
    { width: 667, height: 311, visualViewport: {
      width: 667, height: 311, offsetLeft: 0, offsetTop: 0, scale: 1,
    } },
  ));

  fail('actual all-null Appium failure', () => validateCoordinateCalibration({
    offsetX: null, offsetY: null, pixelRatioX: null, pixelRatioY: null,
  }));
  fail('mixed null calibration', () => validateCoordinateCalibration({ ...good, offsetX: null }));
  fail('missing calibration field', () => validateCoordinateCalibration({
    offsetX: 0, offsetY: 0, pixelRatioX: 1,
  }));
  fail('array calibration', () => validateCoordinateCalibration([0, 0, 1, 1]));
  fail('numeric strings', () => validateCoordinateCalibration({ ...good, pixelRatioX: '0.5' }));
  fail('NaN calibration', () => validateCoordinateCalibration({ ...good, offsetY: Number.NaN }));
  fail('positive Infinity calibration', () => validateCoordinateCalibration({ ...good, pixelRatioX: Infinity }));
  fail('negative Infinity calibration', () => validateCoordinateCalibration({ ...good, pixelRatioY: -Infinity }));
  fail('zero pixel ratio', () => validateCoordinateCalibration({ ...good, pixelRatioX: 0 }));
  fail('negative pixel ratio', () => validateCoordinateCalibration({ ...good, pixelRatioY: -1 }));
  fail('same web point on both axes', () => deriveCoordinateCalibration(
    [{ x: 100, y: 100 }, { x: 200, y: 200 }],
    [{ x: 50, y: 50 }, { x: 50, y: 50 }],
  ));
  fail('same web x axis', () => deriveCoordinateCalibration(
    [{ x: 100, y: 100 }, { x: 200, y: 200 }],
    [{ x: 50, y: 50 }, { x: 50, y: 80 }],
  ));
  fail('same web y axis', () => deriveCoordinateCalibration(
    [{ x: 100, y: 100 }, { x: 200, y: 200 }],
    [{ x: 50, y: 50 }, { x: 80, y: 50 }],
  ));
  fail('same native x axis', () => deriveCoordinateCalibration(
    [{ x: 100, y: 100 }, { x: 100, y: 200 }],
    [{ x: 50, y: 50 }, { x: 80, y: 80 }],
  ));
  fail('opposite-axis transform', () => deriveCoordinateCalibration(
    [{ x: 100, y: 100 }, { x: 200, y: 200 }],
    [{ x: 80, y: 80 }, { x: 50, y: 50 }],
  ));
  fail('click alone is not retryable or complete', () => classifyTrustedTapAttempt([
    tapEvent('click'),
  ], 'attempt-1', 1, 2));
  fail('zero-event retry budget exhaustion', () => classifyTrustedTapAttempt([], 'attempt-2', 2, 2));
  fail('pointerdown without pointerup fails immediately', () => classifyTrustedTapAttempt([
    tapEvent('pointerdown'),
  ], 'attempt-1'));
  fail('pointerup without pointerdown fails immediately', () => classifyTrustedTapAttempt([
    tapEvent('pointerup'),
  ], 'attempt-1'));
  fail('pointerup before pointerdown is rejected', () => validateTrustedTapSequence([
    tapEvent('pointerup'), tapEvent('pointerdown'),
  ], 'attempt-1'));
  fail('untrusted pointer sequence', () => validateTrustedTapSequence([
    tapEvent('pointerdown', { trusted: false }), tapEvent('pointerup'),
  ], 'attempt-1'));
  fail('changed pointer identity', () => validateTrustedTapSequence([
    tapEvent('pointerdown'), tapEvent('pointerup', { pointerId: 8 }),
  ], 'attempt-1'));
  fail('cancelled pointer sequence', () => validateTrustedTapSequence([
    tapEvent('pointerdown'), tapEvent('pointercancel'), tapEvent('pointerup'),
  ], 'attempt-1'));
  fail('wrong calibration target', () => validateTrustedTapSequence([
    tapEvent('pointerdown', { targetMatches: false }), tapEvent('pointerup', { targetMatches: false }),
  ], 'attempt-1'));
  fail('non-touch pointer sequence', () => validateTrustedTapSequence([
    tapEvent('pointerdown', { pointerType: 'mouse' }), tapEvent('pointerup', { pointerType: 'mouse' }),
  ], 'attempt-1'));
  fail('tap movement beyond tolerance', () => validateTrustedTapSequence([
    tapEvent('pointerdown', { x: 10, y: 20 }), tapEvent('pointerup', { x: 13, y: 20 }),
  ], 'attempt-1'));
  fail('duplicate pointer sequence', () => validateTrustedTapSequence([
    ...goodTap, tapEvent('pointerdown'), tapEvent('pointerup'),
  ], 'attempt-1'));
  fail('late prior-attempt events cannot satisfy the current attempt', () => validateTrustedTapSequence([
    tapEvent('pointerdown', { attemptId: 'attempt-0' }),
    tapEvent('pointerup', { attemptId: 'attempt-0' }),
  ], 'attempt-1'));
  fail('viewport width change', () => validateStableViewport(
    { width: 667, height: 311 }, { width: 666, height: 311 },
  ));
  fail('viewport height change', () => validateStableViewport(
    { width: 667, height: 311 }, { width: 667, height: 310 },
  ));
  fail('visual viewport availability change', () => validateStableViewport(
    { width: 667, height: 311, visualViewport: null },
    { width: 667, height: 311, visualViewport: {
      width: 667, height: 311, offsetLeft: 0, offsetTop: 0, scale: 1,
    } },
  ));
  fail('visual viewport size change', () => validateStableViewport(
    { width: 667, height: 311, visualViewport: {
      width: 667, height: 311, offsetLeft: 0, offsetTop: 0, scale: 1,
    } },
    { width: 667, height: 311, visualViewport: {
      width: 666, height: 311, offsetLeft: 0, offsetTop: 0, scale: 1,
    } },
  ));
  fail('visual viewport offset change', () => validateStableViewport(
    { width: 667, height: 311, visualViewport: {
      width: 667, height: 311, offsetLeft: 0, offsetTop: 0, scale: 1,
    } },
    { width: 667, height: 311, visualViewport: {
      width: 667, height: 311, offsetLeft: 1, offsetTop: 0, scale: 1,
    } },
  ));
  fail('visual viewport scale change', () => validateStableViewport(
    { width: 667, height: 311, visualViewport: {
      width: 667, height: 311, offsetLeft: 0, offsetTop: 0, scale: 1,
    } },
    { width: 667, height: 311, visualViewport: {
      width: 667, height: 311, offsetLeft: 0, offsetTop: 0, scale: 1.1,
    } },
  ));
  fail('non-finite visual viewport field', () => validateStableViewport(
    { width: 667, height: 311, visualViewport: {
      width: 667, height: 311, offsetLeft: 0, offsetTop: 0, scale: 1,
    } },
    { width: 667, height: 311, visualViewport: {
      width: 667, height: 311, offsetLeft: 0, offsetTop: Number.NaN, scale: 1,
    } },
  ));

  const harnessSource = readFileSync(new URL('./test-ios-safari.mjs', import.meta.url), 'utf8');
  const workflowSources = ['gates.yml', 'pages.yml'].map((name) => [
    name,
    readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8'),
  ]);
  pass('headless harness preserves the workflow-prebooted Simulator', () => {
    validateHeadlessHarnessContract(harnessSource, workflowSources);
  });
  fail('visible-mode regression is rejected', () => {
    validateHeadlessHarnessContract(
      harnessSource.replace("'appium:isHeadless': true", "'appium:isHeadless': false"),
      workflowSources,
    );
  });
  fail('recorder-before-boot regression is rejected', () => {
    validateHeadlessHarnessContract(harnessSource, workflowSources.map(([name, source], index) => [
      name,
      index === 0
        ? source.replace(
          'xcrun simctl bootstatus "$udid" -b',
          'recordVideo --codec=h264\nxcrun simctl bootstatus "$udid" -b',
        )
        : source,
    ]));
  });

  process.stdout.write(`iOS Safari coordinate self-test: ${passed}/${total}\n`);
  if (passed !== total) process.exit(1);
}

if (process.argv.includes('--self-test')) selfTest();
