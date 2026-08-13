#!/usr/bin/env node

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

  process.stdout.write(`iOS Safari coordinate self-test: ${passed}/${total}\n`);
  if (passed !== total) process.exit(1);
}

if (process.argv.includes('--self-test')) selfTest();
