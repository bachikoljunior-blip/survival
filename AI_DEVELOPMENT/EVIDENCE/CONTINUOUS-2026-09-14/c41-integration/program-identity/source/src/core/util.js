/**
 * Small shared utilities. Kept dependency-free and allocation-light — most of
 * these run every frame.
 */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invlerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v, a, b, c, d) => lerp(c, d, clamp01(invlerp(a, b, v)));
export const smoothstep = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const smootherstep = (t) => { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); };

/** Frame-rate independent exponential approach. `rate` = 1/e time in seconds. */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-dt / Math.max(1e-5, rate)));

/** Shortest signed angular difference, result in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

export function dampAngle(a, b, rate, dt) {
  return a + angleDelta(a, b) * (1 - Math.exp(-dt / Math.max(1e-5, rate)));
}

/** Move `a` toward `b` by at most `maxDelta`. */
export function approach(a, b, maxDelta) {
  const d = b - a;
  if (Math.abs(d) <= maxDelta) return b;
  return a + Math.sign(d) * maxDelta;
}

export function approachAngle(a, b, maxDelta) {
  const d = angleDelta(a, b);
  if (Math.abs(d) <= maxDelta) return b;
  return a + Math.sign(d) * maxDelta;
}

/** Deterministic 32-bit string hash (FNV-1a). Used for stable content ids. */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Pick a value from an array using a 0..1 float. */
export const pick = (arr, t) => arr[Math.min(arr.length - 1, Math.floor(t * arr.length))];

export function shuffleInPlace(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/** Removes an element by identity, swapping the tail in. Order is not kept. */
export function swapRemove(arr, item) {
  const i = arr.indexOf(item);
  if (i < 0) return false;
  arr[i] = arr[arr.length - 1];
  arr.pop();
  return true;
}

/** Simple deep clone for plain JSON-shaped data (save games, content defs). */
export function deepClone(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(deepClone);
  const o = {};
  for (const k in v) o[k] = deepClone(v[k]);
  return o;
}

/** Format seconds as M:SS. */
export function mmss(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, '0')}`;
}

/** Format a run duration as e.g. "1h 24m". */
export function duration(sec, hSuffix = 'h', mSuffix = 'm') {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}${hSuffix} ${m}${mSuffix}` : `${m}${mSuffix}`;
}

/** Tiny typed event emitter. */
export class Emitter {
  constructor() { this._m = new Map(); }
  on(k, fn) {
    let a = this._m.get(k);
    if (!a) this._m.set(k, (a = []));
    a.push(fn);
    return () => this.off(k, fn);
  }
  once(k, fn) {
    const off = this.on(k, (...args) => { off(); fn(...args); });
    return off;
  }
  off(k, fn) {
    const a = this._m.get(k);
    if (a) swapRemove(a, fn);
  }
  emit(k, ...args) {
    const a = this._m.get(k);
    if (!a) return;
    // Copy: handlers may unsubscribe during dispatch.
    for (const fn of a.slice()) {
      try { fn(...args); } catch (e) { reportSwallowed(`event:${k}`, e); }
    }
  }
  clear() { this._m.clear(); }
}

/**
 * Where a swallowed listener error goes.
 *
 * One listener must not be able to stop the others, so `emit` catches — but
 * catching also meant the error never reached the page's uncaught-error path.
 * A throw inside the `render` listener therefore killed the picture (measured:
 * 124 GL draw calls in four seconds before, zero after) while the loop, the
 * HUD and the clock all carried on, with nothing on screen and nothing in the
 * fault log. The boot installs a reporter here so those errors are treated as
 * what they are.
 */
let swallowedReporter = null;
export const onSwallowedError = (fn) => { swallowedReporter = fn; };
function reportSwallowed(where, error) {
  console.error(`[${where}]`, error);
  if (swallowedReporter) {
    try { swallowedReporter(where, error); } catch { /* the reporter itself */ }
  }
}

/**
 * A reusable object pool. `make` constructs, `reset` prepares for reuse.
 * Used for particles, damage numbers, audio voices and projectiles so that
 * steady-state gameplay performs no allocation.
 */
export class Pool {
  constructor(make, reset, initial = 0) {
    this.make = make;
    this.reset = reset;
    this.free = [];
    for (let i = 0; i < initial; i++) this.free.push(make());
  }
  get(...args) {
    const o = this.free.pop() || this.make();
    if (this.reset) this.reset(o, ...args);
    return o;
  }
  put(o) { this.free.push(o); }
}
