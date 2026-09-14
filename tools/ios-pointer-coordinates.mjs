// XCUITest /actions uses native screen points, not DOM viewport coordinates.
// Follow the pinned driver's calibrated translation, including its viewport
// scale condition: appium-xcuitest-driver v12.1.3 lib/commands/web.ts.
export function nativePointerActions(actions, calibration, viewport) {
  const { offsetX, offsetY, pixelRatioX, pixelRatioY } = calibration || {};
  const { innerWidth, innerHeight, outerWidth, outerHeight } = viewport || {};
  if (![offsetX, offsetY, pixelRatioX, pixelRatioY, innerWidth, innerHeight, outerWidth, outerHeight].every(Number.isFinite)
      || [pixelRatioX, pixelRatioY, innerWidth, innerHeight, outerWidth, outerHeight].some((n) => n <= 0)) {
    throw new Error('A finite native Safari coordinate calibration and viewport are required');
  }
  const scale = innerWidth > outerWidth || innerHeight > outerHeight;
  return actions.map((source) => ({ ...source, actions: source.actions.map((action) => {
    if (action.type !== 'pointerMove') return { ...action };
    if (action.origin !== 'viewport' || !Number.isFinite(action.x) || !Number.isFinite(action.y)) {
      throw new Error('Only finite DOM viewport pointer coordinates are supported');
    }
    return { ...action,
      x: Math.round(offsetX + action.x * (scale ? pixelRatioX : 1)),
      y: Math.round(offsetY + action.y * (scale ? pixelRatioY : 1)),
    };
  }) }));
}
