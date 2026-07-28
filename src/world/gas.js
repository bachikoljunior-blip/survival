/**
 * The air.
 *
 * Hollis burns underground. What comes up through the boreholes, the cellars
 * and the cracked street is a mix the old miners had names for: *whitedamp*,
 * the carbon monoxide that kills you without a smell, and *blackdamp*, the
 * oxygen-poor sink that pools in every low place and puts out your lamp before
 * it puts out you. Ren was mine-rescue trained. She uses the old words.
 *
 * Model:
 *   - a coarse 2D field of emission sources, diffused once at build time
 *   - a per-frame wind offset that drifts the field, so a street that was
 *     survivable ten minutes ago may not be now
 *   - exponential falloff with height above the local ground, halved under
 *     cover — this is the rule the whole game is built on: climb, or choke
 *
 * The readout the player sees is a CO meter in ppm because that is the
 * instrument a rescue tech carries. Oxygen deficiency rides along with it.
 */

import { clamp, clamp01, lerp, smoothstep, damp } from '../core/util.js';
import { Noise2 } from '../core/rng.js';

/** Exposure thresholds, in ppm, used by the HUD and by the damage model. */
export const PPM = {
  CLEAR: 35,        // background; the meter is quiet
  ELEVATED: 200,    // headache within the hour — the meter starts ticking
  DANGER: 800,      // minutes, not hours
  LETHAL: 3200,     // a lungful is a serious problem
  MAX: 12000,
};

const SCALE_HEIGHT = 3.6;      // metres; 1/e falloff of concentration with height
const COVERED_MULT = 2.35;     // enclosed volumes hold gas far better than open street

export class GasField {
  /**
   * @param {number} minX @param {number} minZ world bounds
   * @param {number} maxX @param {number} maxZ
   * @param {number} cell grid resolution in metres
   */
  constructor(minX, minZ, maxX, maxZ, cell = 4) {
    this.minX = minX; this.minZ = minZ;
    this.cell = cell;
    this.nx = Math.ceil((maxX - minX) / cell) + 1;
    this.nz = Math.ceil((maxZ - minZ) / cell) + 1;

    this.emit = new Float32Array(this.nx * this.nz);      // source strength
    this.base = new Float32Array(this.nx * this.nz);      // diffused ground-level ppm
    this.scratch = new Float32Array(this.nx * this.nz);
    this.blocked = new Uint8Array(this.nx * this.nz);     // walls: gas does not diffuse through
    this.covered = new Float32Array(this.nx * this.nz);   // 0 open sky .. 1 fully enclosed
    this.groundY = new Float32Array(this.nx * this.nz);   // local ground elevation

    this.sources = [];
    this.wind = { x: 0.7, z: 0.7, speed: 0.35 };
    this._windPhase = 0;
    this._noise = new Noise2(0xc17d);
    this.time = 0;
    this.globalScale = 1.0;      // story events raise or lower the whole burn
    this._targetScale = 1.0;
    this.dirty = true;
  }

  idx(ix, iz) { return iz * this.nx + ix; }
  ix(x) { return clamp(Math.round((x - this.minX) / this.cell), 0, this.nx - 1); }
  iz(z) { return clamp(Math.round((z - this.minZ) / this.cell), 0, this.nz - 1); }

  /**
   * Register an emitter. `id` lets story events switch it on or off — sealing
   * a borehole, opening a cellar, breaching the trench.
   */
  addSource(x, z, strength, radius, id = null, active = true) {
    const s = { x, z, strength, radius, id, active };
    this.sources.push(s);
    this.dirty = true;
    return s;
  }

  setSourceActive(id, active) {
    let changed = false;
    for (const s of this.sources) {
      if (s.id === id && s.active !== active) { s.active = active; changed = true; }
    }
    if (changed) this.dirty = true;
    return changed;
  }

  /** Mark a cell as a wall so gas does not diffuse through the building. */
  setBlocked(x, z) { this.blocked[this.idx(this.ix(x), this.iz(z))] = 1; }

  setCovered(x, z, amount) {
    const i = this.idx(this.ix(x), this.iz(z));
    this.covered[i] = Math.max(this.covered[i], amount);
  }

  setGroundY(x, z, y) {
    const i = this.idx(this.ix(x), this.iz(z));
    this.groundY[i] = y;
  }

  /**
   * Diffuse the source field across the grid. Run at build time and again only
   * when a source is toggled, which is rare — this is not a per-frame cost.
   */
  bake(iterations = 46) {
    this.emit.fill(0);
    for (const s of this.sources) {
      if (!s.active) continue;
      const cx = this.ix(s.x), cz = this.iz(s.z);
      const rad = Math.ceil(s.radius / this.cell);
      for (let dz = -rad; dz <= rad; dz++) {
        for (let dx = -rad; dx <= rad; dx++) {
          const ix = cx + dx, iz = cz + dz;
          if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) continue;
          const d = Math.hypot(dx, dz) * this.cell;
          if (d > s.radius) continue;
          const k = 1 - d / s.radius;
          this.emit[this.idx(ix, iz)] += s.strength * k * k;
        }
      }
    }

    this.base.set(this.emit);
    const a = this.base, b = this.scratch;
    let src = a, dst = b;
    for (let it = 0; it < iterations; it++) {
      for (let iz = 0; iz < this.nz; iz++) {
        for (let ix = 0; ix < this.nx; ix++) {
          const i = this.idx(ix, iz);
          if (this.blocked[i]) { dst[i] = src[i] * 0.35; continue; }
          let sum = src[i] * 2;
          let n = 2;
          if (ix > 0 && !this.blocked[i - 1]) { sum += src[i - 1]; n++; }
          if (ix < this.nx - 1 && !this.blocked[i + 1]) { sum += src[i + 1]; n++; }
          if (iz > 0 && !this.blocked[i - this.nx]) { sum += src[i - this.nx]; n++; }
          if (iz < this.nz - 1 && !this.blocked[i + this.nx]) { sum += src[i + this.nx]; n++; }
          // Re-inject emission each pass so sources hold their peak, and decay
          // slightly so the field falls off with distance rather than levelling.
          dst[i] = (sum / n) * 0.982 + this.emit[i] * 0.055;
        }
      }
      const t = src; src = dst; dst = t;
    }
    if (src !== this.base) this.base.set(src);

    // Enclosed cells retain what reaches them.
    for (let i = 0; i < this.base.length; i++) {
      this.base[i] *= lerp(1, COVERED_MULT, this.covered[i]);
    }
    this.dirty = false;
  }

  /** Bilinear sample of the diffused ground field, with wind advection. */
  sampleGround(x, z) {
    // Wind pushes the plume: sampling *upwind* of the query point makes the
    // gas appear to have travelled downwind.
    const wx = x - this.wind.x * this._windPhase;
    const wz = z - this.wind.z * this._windPhase;

    const fx = clamp((wx - this.minX) / this.cell, 0, this.nx - 1.001);
    const fz = clamp((wz - this.minZ) / this.cell, 0, this.nz - 1.001);
    const ix = fx | 0, iz = fz | 0;
    const tx = fx - ix, tz = fz - iz;
    const i00 = this.idx(ix, iz), i10 = i00 + 1;
    const i01 = i00 + this.nx, i11 = i01 + 1;
    const top = lerp(this.base[i00], this.base[i10], tx);
    const bot = lerp(this.base[i01], this.base[i11], tx);
    let v = lerp(top, bot, tz);

    // Turbulent breathing so a borderline street is not a flat, gamey plateau.
    const turb = this._noise.fbm(x * 0.055 + this.time * 0.06, z * 0.055 - this.time * 0.04, 3);
    v *= 1 + turb * 0.34;
    return Math.max(0, v * this.globalScale);
  }

  /** Ground elevation the field uses for its height falloff. */
  groundAt(x, z) {
    const i = this.idx(this.ix(x), this.iz(z));
    return this.groundY[i];
  }

  coveredAt(x, z) {
    const i = this.idx(this.ix(x), this.iz(z));
    return this.covered[i];
  }

  /**
   * Concentration in ppm at an arbitrary point. This is the function the whole
   * game asks: it is what the meter reads, what the AI avoids, and what decides
   * whether the roof was worth climbing.
   */
  sample(x, y, z) {
    const ground = this.sampleGround(x, z);
    if (ground <= 0.5) return PPM.CLEAR * 0.4;
    const gy = this.groundAt(x, z);
    const above = Math.max(0, y - gy);
    const cov = this.coveredAt(x, z);
    // Under cover the gas has nowhere to go, so it stratifies far more slowly.
    const sh = SCALE_HEIGHT * lerp(1, 3.1, cov);
    const v = ground * Math.exp(-above / sh);
    return clamp(v + PPM.CLEAR * 0.4, 0, PPM.MAX);
  }

  /** Cheap gradient, used by AI to flee toward better air. */
  gradient(x, y, z, out) {
    const e = this.cell;
    const c = this.sample(x, y, z);
    out.x = (this.sample(x + e, y, z) - c) / e;
    out.z = (this.sample(x, y, z + e) - c) / e;
    return out;
  }

  update(dt) {
    this.time += dt;
    // The wind veers slowly. Over a mission it can turn a safe route bad, which
    // is the intended source of unscripted tension.
    const t = this.time * 0.021;
    const ang = this._noise.fbm(t, t * 0.7, 3) * Math.PI * 1.5;
    this.wind.x = damp(this.wind.x, Math.cos(ang), 6.0, dt);
    this.wind.z = damp(this.wind.z, Math.sin(ang), 6.0, dt);
    this.wind.speed = 0.3 + 0.7 * (0.5 + 0.5 * this._noise.fbm(t * 2.2, 4.1, 2));
    this._windPhase = Math.sin(this.time * 0.037) * 9.5 * this.wind.speed;
    this.globalScale = damp(this.globalScale, this._targetScale, 4.0, dt);
    if (this.dirty) this.bake();
  }

  /** Story hook: the burn advances or is pushed back. */
  setIntensity(v) { this._targetScale = v; }
}

/**
 * Per-actor respiratory state. Shared by the player and by any NPC that
 * breathes — which is most of them, and is why luring a crew into a low street
 * is a legitimate tactic.
 */
export class Lungs {
  constructor(opts = {}) {
    /** Carboxyhaemoglobin saturation, 0..1. 0.5 is fatal. */
    this.sat = 0;
    /** Filter cartridge charge, 0..1. Null means no mask fitted. */
    this.filter = opts.filter ?? null;
    this.filterQuality = opts.filterQuality ?? 0.85;   // fraction removed when fresh
    this.masked = opts.masked ?? false;
    this.tolerance = opts.tolerance ?? 1.0;            // trained lungs, or a bad chest
    this.exertion = 0;                                  // 0..1, raises intake
    this.lastPpm = 0;
    this.lastIntake = 0;
    this.dead = false;
  }

  fitFilter(charge = 1) { this.filter = charge; this.masked = true; }
  removeFilter() { this.filter = null; this.masked = false; }

  /**
   * @param {number} ppm ambient concentration
   * @param {number} dt
   * @returns {object} { intake, satDelta, filterSpent }
   */
  update(ppm, dt) {
    this.lastPpm = ppm;

    // Breathing rate scales with exertion; sprinting in bad air is how people
    // actually die in these places.
    const breath = 1 + this.exertion * 1.5;

    let effective = ppm;
    let spent = 0;
    if (this.masked && this.filter !== null && this.filter > 0) {
      // A cartridge stops less as it loads up, and loads faster in worse air.
      const eff = this.filterQuality * Math.pow(clamp01(this.filter), 0.45);
      effective = ppm * (1 - eff);
      spent = (ppm / PPM.DANGER) * dt * 0.028 * breath;
      this.filter = Math.max(0, this.filter - spent);
      if (this.filter <= 0) this.filter = 0;
    }

    this.lastIntake = effective;

    // Uptake toward an equilibrium saturation for this concentration
    // (a compressed Coburn-style curve — the shape, not the clinical values).
    const equilibrium = clamp01(effective / (PPM.LETHAL * 1.15));
    const rate = (effective > PPM.CLEAR * 1.6 ? 0.055 : 0.0) * breath / this.tolerance;
    const clearRate = 0.031 * (effective < PPM.ELEVATED ? 1 : 0.15);

    const before = this.sat;
    if (equilibrium > this.sat) {
      this.sat += (equilibrium - this.sat) * rate * dt * 3.4;
    }
    // Clearing happens whenever the ambient is below current saturation's
    // equivalent, and is slow — you do not simply walk it off.
    if (equilibrium < this.sat) {
      this.sat -= Math.min(this.sat - equilibrium, clearRate * dt);
    }
    this.sat = clamp01(this.sat);

    return { intake: effective, satDelta: this.sat - before, filterSpent: spent };
  }

  /** 0..1 severity used for the screen effect and for stamina penalties. */
  get severity() { return clamp01(this.sat / 0.42); }
  /** True once saturation is doing organ damage. */
  get critical() { return this.sat > 0.34; }
  get filterPercent() { return this.filter === null ? -1 : Math.round(this.filter * 100); }
}
