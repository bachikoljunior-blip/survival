/**
 * device.mjs — one definition of what "iPhone SE (3rd generation)" means.
 *
 * Five independent harnesses for this device already exist across the game repositories
 * (`Gptgame`, `survival`, and the open branches in `game2` and `Q`), and they already
 * disagree about the target they claim to share:
 *
 *   | repo               | orientation | viewport asserted | DPR | touch floor |
 *   |--------------------|-------------|-------------------|-----|-------------|
 *   | Gptgame            | portrait    | 375 x 667         | 2   | 44          |
 *   | survival           | landscape   | 667 x 375         | 2   | 44          |
 *   | game2 (PR #8/#9)   | landscape   | 667 x 375         | 2   | 44          |
 *   | Q (PR #13)         | landscape   | 667 x 375         | 2   | (none)      |
 *
 * Portrait versus landscape is a real product decision and stays a per-repo choice. The rest
 * is one fact about one phone, and a fact restated in four places is a fact that will drift.
 * Q's harness already dropped the 44 CSS px control-size assertion the other three make.
 *
 * What this module deliberately does NOT provide: any claim about the physical device.
 * Playwright reproduces viewport, DPR, touch emulation and user agent. It does not reproduce
 * GPU throughput, thermal throttling, memory pressure, real multi-touch digitiser behaviour
 * or audio latency, and no check built on it may be reported as evidence for those.
 */

/** CSS px, per Apple's Human Interface Guidelines minimum hit target. */
export const TOUCH_TARGET_FLOOR = 44;

/** The device pixel ratio of every iPhone SE generation, including the 3rd. */
export const DEVICE_PIXEL_RATIO = 2;

/**
 * The two orientations, keyed by the exact Playwright device-descriptor name. Using the
 * descriptor name rather than a hand-rolled context option matters: the descriptor also
 * carries the user agent and the `hasTouch`/`isMobile` flags, and a hand-rolled context that
 * sets only the viewport has repeatedly looked identical while proving much less.
 */
export const SURFACES = {
  portrait: {
    orientation: 'portrait',
    playwrightDevice: 'iPhone SE (3rd gen)',
    viewport: { width: 375, height: 667 },
    mediaQuery: '(orientation: portrait)',
  },
  landscape: {
    orientation: 'landscape',
    playwrightDevice: 'iPhone SE (3rd gen) landscape',
    viewport: { width: 667, height: 375 },
    mediaQuery: '(orientation: landscape)',
  },
};

/** Mobile Safari announces both tokens; desktop Safari announces only the first. */
export const MOBILE_SAFARI_UA = [/Safari\//, /Mobile\//];

/**
 * @param {'portrait'|'landscape'} orientation
 * @returns {typeof SURFACES.portrait}
 */
export function resolveSurface(orientation) {
  const surface = SURFACES[orientation];
  if (!surface) {
    throw new Error(`unknown iPhone SE 3 orientation "${orientation}" — expected portrait or landscape`);
  }
  return surface;
}

/**
 * Turn an observed page reading into the check rows every repo should be asserting.
 *
 * Returned rather than thrown so the caller can fold them into its own report and fail once,
 * with every mismatch visible, instead of stopping at the first.
 *
 * `maxTouchPoints` is recorded and never asserted. Linux WebKit reports 0 under a device
 * descriptor that is genuinely emulating touch, so asserting it would fail a correct run —
 * and treating a non-zero value as hardware evidence would be a stronger claim than the
 * apparatus can support either way. The iOS Simulator tier is where trusted multi-touch
 * gets its evidence.
 *
 * @param {object} observed  page-side reading: {viewport, dpr, userAgent, coarse, orientationMatches, maxTouchPoints}
 * @param {'portrait'|'landscape'} orientation
 * @returns {Array<{name: string, passed: boolean, detail: string}>}
 */
export function deviceChecks(observed, orientation) {
  const surface = resolveSurface(orientation);
  const rows = [];
  const row = (name, passed, detail) => rows.push({ name, passed: Boolean(passed), detail: String(detail) });

  const viewport = observed?.viewport || {};
  row(
    `iPhone SE 3 ${orientation} viewport`,
    viewport.width === surface.viewport.width && viewport.height === surface.viewport.height,
    `${viewport.width}x${viewport.height}, expected ${surface.viewport.width}x${surface.viewport.height}`,
  );
  row('iPhone SE 3 device pixel ratio', observed?.dpr === DEVICE_PIXEL_RATIO, `dpr=${observed?.dpr}, expected ${DEVICE_PIXEL_RATIO}`);
  row('coarse pointer is active', observed?.coarse === true, `coarse=${observed?.coarse}, maxTouchPoints=${observed?.maxTouchPoints} (recorded, not asserted)`);
  row(`${orientation} orientation is active`, observed?.orientationMatches === true, `${surface.mediaQuery} matched=${observed?.orientationMatches}`);
  row(
    'Mobile Safari user agent is active',
    MOBILE_SAFARI_UA.every((pattern) => pattern.test(String(observed?.userAgent || ''))),
    String(observed?.userAgent || '(none)'),
  );
  return rows;
}

/**
 * Check a list of measured control boxes against the touch-target floor.
 *
 * @param {Array<{name: string, width: number, height: number}>} controls
 * @returns {{name: string, passed: boolean, detail: string}}
 */
export function touchTargetCheck(controls) {
  const list = Array.isArray(controls) ? controls : [];
  const undersized = list.filter((c) => !(c.width >= TOUCH_TARGET_FLOOR && c.height >= TOUCH_TARGET_FLOOR));
  return {
    name: `every touch control meets the ${TOUCH_TARGET_FLOOR} CSS px floor`,
    // An empty control list is not a pass. A selector that stopped matching returns [], and
    // "nothing was too small" then reads exactly like "everything was big enough".
    passed: list.length > 0 && undersized.length === 0,
    detail: list.length === 0
      ? 'no controls were measured — the selector matched nothing, which is a fault, not a pass'
      : JSON.stringify(undersized.length ? undersized : { measured: list.length, allAtOrAbove: TOUCH_TARGET_FLOOR }),
  };
}
