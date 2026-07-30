/**
 * Deterministic random number generation.
 *
 * Every piece of generated content in Hollis (building facades, debris scatter,
 * graffiti placement, loot rolls) draws from a seeded stream so that the city
 * is byte-identical on every load and across every device. Nothing in the world
 * uses Math.random().
 */

import { hash32 } from './util.js';

/** sfc32 — small, fast, statistically solid, 128-bit state. */
export function sfc32(a, b, c, d) {
  return function () {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed = 'cinderline') {
    this.reseed(seed);
  }

  reseed(seed) {
    const h = typeof seed === 'number' ? seed >>> 0 : hash32(String(seed));
    // Decorrelate the four lanes so short seeds still produce good streams.
    this.next = sfc32(h ^ 0x9e3779b9, Math.imul(h, 0x85ebca6b) >>> 0, Math.imul(h ^ 0xc2b2ae35, 0x27d4eb2f) >>> 0, (h + 0x165667b1) >>> 0);
    for (let i = 0; i < 12; i++) this.next(); // warm-up
    return this;
  }

  /** Float in [0,1). */
  f() { return this.next(); }
  /** Float in [a,b). */
  range(a, b) { return a + this.next() * (b - a); }
  /** Integer in [a,b] inclusive. */
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  /** Float in [-a,a). */
  sym(a = 1) { return (this.next() * 2 - 1) * a; }
  /** True with probability p. */
  chance(p) { return this.next() < p; }
  /** Random element. */
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  /** Random element, weighted by `weights` (parallel array). */
  weighted(arr, weights) {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i];
    let r = this.next() * total;
    for (let i = 0; i < arr.length; i++) {
      r -= weights[i];
      if (r <= 0) return arr[i];
    }
    return arr[arr.length - 1];
  }
  /** Approximately gaussian (sum of 3 uniforms), mean 0, ~unit spread. */
  gauss() { return (this.next() + this.next() + this.next() - 1.5) * 1.1547; }
  /** Fork a labelled sub-stream — lets one system reseed without disturbing others. */
  fork(label) { return new Rng(hash32(label) ^ Math.floor(this.next() * 0xffffffff)); }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
}

/**
 * 2D value noise with smooth interpolation. Used for ground wear, rust
 * blotching, wall grime and gas drift — anything that wants organic variation
 * without a texture fetch.
 */
export class Noise2 {
  constructor(seed = 1) {
    const r = new Rng(seed);
    this.p = new Uint8Array(512);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    r.shuffle(perm);
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }
  _g(ix, iy) {
    // Hash the integer lattice point to a stable pseudo-random value in [-1,1].
    const h = this.p[(this.p[ix & 255] + (iy & 255)) & 511];
    return h / 127.5 - 1;
  }
  at(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const a = this._g(ix, iy), b = this._g(ix + 1, iy);
    const c = this._g(ix, iy + 1), d = this._g(ix + 1, iy + 1);
    return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
  }
  /**
   * Periodic value noise: the integer lattice wraps at (px, py), so the field
   * tiles exactly with no seam and — critically — none of the diamond artifacts
   * you get from projecting a torus into 2D. Every tiling texture uses this.
   */
  atTiled(x, y, px, py) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const wx = (i) => ((i % px) + px) % px;
    const wy = (i) => ((i % py) + py) % py;
    const x0 = wx(ix), x1 = wx(ix + 1), y0 = wy(iy), y1 = wy(iy + 1);
    const a = this._g(x0, y0), b = this._g(x1, y0);
    const c = this._g(x0, y1), d = this._g(x1, y1);
    const top = a + (b - a) * u;
    const bot = c + (d - c) * u;
    return top + (bot - top) * v;
  }

  /** Seamless fractal sum over a (px, py) tile. Returns roughly [-1,1]. */
  fbmTiled(x, y, px, py, octaves = 4, gain = 0.5) {
    let sum = 0, amp = 1, norm = 0;
    let fx = x, fy = y, PX = px, PY = py;
    for (let i = 0; i < octaves; i++) {
      sum += this.atTiled(fx, fy, PX, PY) * amp;
      norm += amp;
      amp *= gain;
      fx *= 2; fy *= 2; PX *= 2; PY *= 2;
    }
    return sum / norm;
  }

  /** Fractal sum. Returns roughly [-1,1]. */
  fbm(x, y, octaves = 4, lac = 2.0, gain = 0.5) {
    let sum = 0, amp = 1, norm = 0, fx = x, fy = y;
    for (let i = 0; i < octaves; i++) {
      sum += this.at(fx, fy) * amp;
      norm += amp;
      amp *= gain;
      fx *= lac; fy *= lac;
    }
    return sum / norm;
  }
}
