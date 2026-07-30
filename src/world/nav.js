/**
 * Navigation.
 *
 * A 2D walkability grid derived from the collision world, with A* over it and
 * per-agent path caching. Enemies fight on connected surfaces — the street, a
 * roof, an interior floor — and each surface is its own layer in the grid, so
 * an enemy on the street never paths "through" a first-floor room above it.
 *
 * Deliberately, most enemies cannot climb. The rooftops are the player's
 * advantage and the game says so mechanically rather than in a tooltip.
 */

import { clamp, clamp01 } from '../core/util.js';

const DIAG = Math.SQRT2;

export class NavGrid {
  /**
   * @param {CollisionWorld} world
   * @param {object} bounds { minX, minZ, maxX, maxZ }
   * @param {number} cell
   */
  constructor(world, bounds, cell = 1.1) {
    this.world = world;
    this.cell = cell;
    this.minX = bounds.minX; this.minZ = bounds.minZ;
    this.nx = Math.ceil((bounds.maxX - bounds.minX) / cell);
    this.nz = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
    const n = this.nx * this.nz;

    /** Walkable surface height per cell, or NaN if no surface. */
    this.height = new Float32Array(n).fill(NaN);
    /** Cost multiplier — raised in bad air and near hazards so AI avoids them. */
    this.cost = new Float32Array(n).fill(1);
    /** Connected-region id, so we never path between disjoint surfaces. */
    this.region = new Int32Array(n).fill(-1);

    // A* working sets, preallocated.
    this._g = new Float32Array(n);
    this._f = new Float32Array(n);
    this._came = new Int32Array(n);
    this._state = new Uint8Array(n);
    this._stamp = new Int32Array(n);
    this._epoch = 0;
    this._open = new BinaryHeap((i) => this._f[i]);
    this.regionCount = 0;
  }

  i(ix, iz) { return iz * this.nx + ix; }
  ixOf(x) { return Math.floor((x - this.minX) / this.cell); }
  izOf(z) { return Math.floor((z - this.minZ) / this.cell); }
  xOf(ix) { return this.minX + (ix + 0.5) * this.cell; }
  zOf(iz) { return this.minZ + (iz + 0.5) * this.cell; }
  inBounds(ix, iz) { return ix >= 0 && iz >= 0 && ix < this.nx && iz < this.nz; }

  /**
   * Sample the collision world to find the walkable surface in each column.
   * `probeFrom` is the height we drop from — the street level for the outdoor
   * grid, or the floor level for an interior.
   */
  bake(probeFrom = 12, agentRadius = 0.42, agentHeight = 1.75) {
    const w = this.world;
    for (let iz = 0; iz < this.nz; iz++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const x = this.xOf(ix), z = this.zOf(iz);
        const g = w.groundUnder(x, z, agentRadius * 0.8, probeFrom, probeFrom + 4);
        const i = this.i(ix, iz);
        if (!g) { this.height[i] = NaN; continue; }
        // Reject if there is not enough headroom to stand.
        const ceil = w.ceilingAbove(x, z, agentRadius * 0.7, g.y, agentHeight + 0.3);
        if (ceil < g.y + agentHeight) { this.height[i] = NaN; continue; }
        // Reject if a solid overlaps where the body would be.
        if (w.overlaps(x, g.y + 0.05, z, agentRadius * 0.75, agentHeight - 0.2)) {
          this.height[i] = NaN; continue;
        }
        this.height[i] = g.y;
      }
    }
    this._floodRegions();
    return this;
  }

  /** Label connected components so pathfinding can fail fast. */
  _floodRegions() {
    this.region.fill(-1);
    let id = 0;
    const stack = [];
    for (let start = 0; start < this.height.length; start++) {
      if (Number.isNaN(this.height[start]) || this.region[start] >= 0) continue;
      stack.length = 0;
      stack.push(start);
      this.region[start] = id;
      while (stack.length) {
        const cur = stack.pop();
        const cx = cur % this.nx, cz = (cur / this.nx) | 0;
        const hy = this.height[cur];
        for (let k = 0; k < 8; k++) {
          const nx = cx + NB[k * 2], nz = cz + NB[k * 2 + 1];
          if (!this.inBounds(nx, nz)) continue;
          const ni = this.i(nx, nz);
          if (this.region[ni] >= 0 || Number.isNaN(this.height[ni])) continue;
          // A step of more than ~0.45m is not a walk, it is a climb or a fall.
          if (Math.abs(this.height[ni] - hy) > 0.45) continue;
          this.region[ni] = id;
          stack.push(ni);
        }
      }
      id++;
    }
    this.regionCount = id;
  }

  /** Nearest walkable cell to a world point, searching outward. */
  nearest(x, z, y = null, maxRings = 6) {
    const cx = this.ixOf(x), cz = this.izOf(z);
    let best = -1, bestD = Infinity;
    for (let ring = 0; ring <= maxRings; ring++) {
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue;
          const ix = cx + dx, iz = cz + dz;
          if (!this.inBounds(ix, iz)) continue;
          const i = this.i(ix, iz);
          if (Number.isNaN(this.height[i])) continue;
          if (y !== null && Math.abs(this.height[i] - y) > 2.2) continue;
          const d = dx * dx + dz * dz;
          if (d < bestD) { bestD = d; best = i; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  walkable(x, z, y = null) {
    const ix = this.ixOf(x), iz = this.izOf(z);
    if (!this.inBounds(ix, iz)) return false;
    const i = this.i(ix, iz);
    if (Number.isNaN(this.height[i])) return false;
    if (y !== null && Math.abs(this.height[i] - y) > 1.0) return false;
    return true;
  }

  heightAt(x, z) {
    const ix = this.ixOf(x), iz = this.izOf(z);
    if (!this.inBounds(ix, iz)) return NaN;
    return this.height[this.i(ix, iz)];
  }

  /**
   * A*. Returns an array of {x,y,z} waypoints, already string-pulled, or null.
   * `budget` bounds node expansion so a pathological request cannot stall a frame.
   */
  findPath(sx, sy, sz, tx, ty, tz, budget = 900) {
    const start = this.nearest(sx, sz, sy);
    const goal = this.nearest(tx, tz, ty);
    if (start < 0 || goal < 0) return null;
    if (this.region[start] !== this.region[goal]) return null;
    if (start === goal) return [{ x: tx, y: this.height[goal], z: tz }];

    this._epoch++;
    const ep = this._epoch;
    const heap = this._open;
    heap.clear();

    const gx = goal % this.nx, gz = (goal / this.nx) | 0;
    const h = (i) => {
      const ix = i % this.nx, iz = (i / this.nx) | 0;
      const dx = Math.abs(ix - gx), dz = Math.abs(iz - gz);
      // Octile distance — admissible for 8-connected grids.
      return (dx + dz) + (DIAG - 2) * Math.min(dx, dz);
    };

    this._g[start] = 0;
    this._f[start] = h(start);
    this._came[start] = -1;
    this._stamp[start] = ep;
    this._state[start] = 1;
    heap.push(start);

    let expanded = 0;
    let found = false;
    while (heap.size > 0 && expanded < budget) {
      const cur = heap.pop();
      if (cur === goal) { found = true; break; }
      this._state[cur] = 2;
      expanded++;

      const cx = cur % this.nx, cz = (cur / this.nx) | 0;
      const hy = this.height[cur];
      for (let k = 0; k < 8; k++) {
        const nx = cx + NB[k * 2], nz = cz + NB[k * 2 + 1];
        if (!this.inBounds(nx, nz)) continue;
        const ni = this.i(nx, nz);
        if (Number.isNaN(this.height[ni])) continue;
        if (Math.abs(this.height[ni] - hy) > 0.45) continue;
        // Do not cut diagonal corners through a blocked cell.
        if (k >= 4) {
          const a = this.i(cx + NB[k * 2], cz);
          const b = this.i(cx, cz + NB[k * 2 + 1]);
          if (Number.isNaN(this.height[a]) || Number.isNaN(this.height[b])) continue;
        }
        if (this._stamp[ni] === ep && this._state[ni] === 2) continue;

        const step = (k >= 4 ? DIAG : 1) * this.cost[ni];
        const ng = this._g[cur] + step;
        if (this._stamp[ni] !== ep) {
          this._stamp[ni] = ep;
          this._state[ni] = 0;
          this._g[ni] = Infinity;
        }
        if (ng < this._g[ni]) {
          this._g[ni] = ng;
          this._f[ni] = ng + h(ni) * 1.04;   // slight weight: faster, still good paths
          this._came[ni] = cur;
          if (this._state[ni] !== 1) { this._state[ni] = 1; heap.push(ni); }
          else heap.update(ni);
        }
      }
    }

    if (!found) return null;

    // Reconstruct
    const raw = [];
    let cur = goal;
    while (cur !== -1 && raw.length < 512) {
      raw.push(cur);
      cur = this._came[cur];
    }
    raw.reverse();

    // String-pull: drop waypoints that are directly reachable from the last
    // kept one. Turns a staircase of grid cells into a natural walk line.
    const pts = [];
    let anchor = 0;
    pts.push(this._pt(raw[0]));
    for (let i = 2; i < raw.length; i++) {
      if (!this._clear(raw[anchor], raw[i])) {
        anchor = i - 1;
        pts.push(this._pt(raw[anchor]));
      }
    }
    const last = this._pt(raw[raw.length - 1]);
    pts.push({ x: tx, y: last.y, z: tz });
    return pts;
  }

  _pt(i) {
    return { x: this.xOf(i % this.nx), y: this.height[i], z: this.zOf((i / this.nx) | 0) };
  }

  /** Bresenham-ish walkability test between two cells. */
  _clear(a, b) {
    let x0 = a % this.nx, z0 = (a / this.nx) | 0;
    const x1 = b % this.nx, z1 = (b / this.nx) | 0;
    const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;
    let hy = this.height[a];
    let guard = 0;
    while (guard++ < 512) {
      if (x0 === x1 && z0 === z1) return true;
      const e2 = 2 * err;
      if (e2 > -dz) { err -= dz; x0 += sx; }
      if (e2 < dx) { err += dx; z0 += sz; }
      if (!this.inBounds(x0, z0)) return false;
      const i = this.i(x0, z0);
      if (Number.isNaN(this.height[i])) return false;
      if (Math.abs(this.height[i] - hy) > 0.45) return false;
      hy = this.height[i];
    }
    return false;
  }

  /**
   * Raise the traversal cost of cells with bad air. Enemies that breathe will
   * then route around the gas instead of walking into it, which makes the
   * player's use of the gas feel like a real tactic against a real opponent.
   */
  applyGasCost(gas, agentHeight = 1.7) {
    for (let iz = 0; iz < this.nz; iz++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const i = this.i(ix, iz);
        if (Number.isNaN(this.height[i])) continue;
        const ppm = gas.sample(this.xOf(ix), this.height[i] + agentHeight * 0.6, this.zOf(iz));
        this.cost[i] = 1 + clamp01(ppm / 900) * 5.5;
      }
    }
  }

  get stats() {
    let walk = 0;
    for (let i = 0; i < this.height.length; i++) if (!Number.isNaN(this.height[i])) walk++;
    return { cells: this.height.length, walkable: walk, regions: this.regionCount };
  }
}

const NB = new Int8Array([1, 0, -1, 0, 0, 1, 0, -1, 1, 1, 1, -1, -1, 1, -1, -1]);

/** Indexed binary heap with decrease-key. */
class BinaryHeap {
  constructor(scoreFn) {
    this.content = [];
    this.pos = new Map();
    this.score = scoreFn;
  }
  get size() { return this.content.length; }
  clear() { this.content.length = 0; this.pos.clear(); }
  push(v) {
    this.content.push(v);
    this.pos.set(v, this.content.length - 1);
    this._up(this.content.length - 1);
  }
  pop() {
    const top = this.content[0];
    const end = this.content.pop();
    this.pos.delete(top);
    if (this.content.length > 0) {
      this.content[0] = end;
      this.pos.set(end, 0);
      this._down(0);
    }
    return top;
  }
  update(v) {
    const i = this.pos.get(v);
    if (i !== undefined) this._up(i);
  }
  _up(i) {
    const v = this.content[i], s = this.score(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      const pv = this.content[p];
      if (s >= this.score(pv)) break;
      this.content[i] = pv; this.pos.set(pv, i);
      this.content[p] = v; this.pos.set(v, p);
      i = p;
    }
  }
  _down(i) {
    const n = this.content.length;
    const v = this.content[i], s = this.score(v);
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let best = i, bs = s;
      if (l < n) { const ls = this.score(this.content[l]); if (ls < bs) { best = l; bs = ls; } }
      if (r < n) { const rs = this.score(this.content[r]); if (rs < bs) { best = r; bs = rs; } }
      if (best === i) break;
      const bv = this.content[best];
      this.content[i] = bv; this.pos.set(bv, i);
      this.content[best] = v; this.pos.set(v, best);
      i = best;
    }
  }
}
