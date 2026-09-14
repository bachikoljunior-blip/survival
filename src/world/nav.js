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
    this.costRevision = 0;
    this._nextCost = new Float32Array(n).fill(1);
    this._gasCursor = -1;
    this._gasAge = 0;
    /** Connected-region id, so we never path between disjoint surfaces. */
    this.region = new Int32Array(n).fill(-1);

    // A* working sets, preallocated.
    this._g = new Float32Array(n);
    this._came = new Int32Array(n);
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
  findPath(sx, sy, sz, tx, ty, tz, budget = 900, ignoreGas = false) {
    const search = this.createPathSearch(sx, sy, sz, tx, ty, tz, ignoreGas);
    if (!search) return null;
    const path = search.step(budget);
    // Retain the last synchronous predecessor/cost trace for diagnostics.
    for (const [i, node] of search.nodes) { this._g[i] = node.g; this._came[i] = node.parent; }
    return path;
  }

  /** Each caller owns its pending search; other enemies cannot reset it. */
  createPathSearch(sx, sy, sz, tx, ty, tz, ignoreGas = false) {
    const start = this.nearest(sx, sz, sy), goal = this.nearest(tx, tz, ty);
    if (start < 0 || goal < 0 || this.region[start] !== this.region[goal]) return null;
    return new PathSearch(this, start, goal, tx, tz, ignoreGas);
  }

  _pt(i) {
    return { x: this.xOf(i % this.nx), y: this.height[i], z: this.zOf((i / this.nx) | 0) };
  }

  /** Walkability and traversal cost along a grid line, including corner walls. */
  _segmentCost(a, b, ignoreGas = false, maxCellCost = Infinity, costs = this.cost) {
    let x0 = a % this.nx, z0 = (a / this.nx) | 0;
    const x1 = b % this.nx, z1 = (b / this.nx) | 0;
    const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;
    let hy = this.height[a];
    if (Number.isNaN(hy) || (!ignoreGas && costs[a] > maxCellCost)) return Infinity;
    let total = 0;
    let guard = 0;
    while (guard++ < 512) {
      if (x0 === x1 && z0 === z1) return total;
      const px = x0, pz = z0;
      const e2 = 2 * err;
      if (e2 > -dz) { err -= dz; x0 += sx; }
      if (e2 < dx) { err += dx; z0 += sz; }
      if (!this.inBounds(x0, z0)) return Infinity;
      const i = this.i(x0, z0);
      if (Number.isNaN(this.height[i])) return Infinity;
      if (Math.abs(this.height[i] - hy) > 0.45) return Infinity;
      const diagonal = px !== x0 && pz !== z0;
      if (diagonal) {
        for (const j of [this.i(px, z0), this.i(x0, pz)]) {
          if (Number.isNaN(this.height[j]) || Math.abs(this.height[j] - hy) > 0.45) return Infinity;
        }
      }
      const cost = ignoreGas ? 1 : costs[i];
      if (cost > maxCellCost) return Infinity;
      total += (diagonal ? DIAG : 1) * cost;
      hy = this.height[i];
    }
    return Infinity;
  }

  _clear(a, b) { return Number.isFinite(this._segmentCost(a, b, true)); }

  /** Cheap short steering is reserved for walkable, unpolluted corridors. */
  canSteerDirect(sx, sy, sz, tx, tz, ignoreGas = false) {
    if (!this.walkable(sx, sz, sy) || !this.walkable(tx, tz, sy)) return false;
    const a = this.i(this.ixOf(sx), this.izOf(sz));
    const b = this.i(this.ixOf(tx), this.izOf(tz));
    return Number.isFinite(this._segmentCost(a, b, ignoreGas, 1 + 200 / 900 * 5.5));
  }

  /**
   * Raise the traversal cost of cells with bad air. Enemies that breathe will
   * then route around the gas instead of walking into it, which makes the
   * player's use of the gas feel like a real tactic against a real opponent.
   */
  applyGasCost(gas, agentHeight = 1.7) {
    this._sampleGasCost(gas, this.cost, 0, this.cost.length, agentHeight);
    this.costRevision++;
    this._gasRevision = gas.revision;
    this._gasCursor = -1;
    this._gasAge = 0;
  }

  _sampleGasCost(gas, output, start, end, agentHeight = 1.7) {
    let changed = false;
    for (let i = start; i < end; i++) {
      if (Number.isNaN(this.height[i])) { output[i] = 1; continue; }
      const ix = i % this.nx, iz = (i / this.nx) | 0;
      const ppm = gas.sample(this.xOf(ix), this.height[i] + agentHeight * 0.6, this.zOf(iz));
      output[i] = 1 + clamp01(ppm / 900) * 5.5;
      if (output[i] !== this.cost[i]) changed = true;
    }
    return changed;
  }

  /** Bound work per simulation tick, then publish a complete cost grid at once.
   * Source rebakes restart the pending sweep. Wind/intensity are resampled at
   * least every 0.5 s plus one sweep; actors never see a half-written grid.
   */
  updateGasCost(gas, dt, maxCells = 4096) {
    this._gasAge += dt;
    if (this._gasCursor >= 0 && this._gasJobRevision !== gas.revision) this._gasCursor = -1;
    if (this._gasCursor < 0) {
      if (this._gasRevision === gas.revision && this._gasAge < 0.5) return;
      this._gasCursor = 0;
      this._gasJobRevision = gas.revision;
      this._gasChanged = false;
    }
    const end = Math.min(this._gasCursor + maxCells, this.cost.length);
    this._gasChanged = this._sampleGasCost(gas, this._nextCost, this._gasCursor, end) || this._gasChanged;
    this._gasCursor = end;
    if (end === this.cost.length) {
      const previous = this.cost;
      this.cost = this._nextCost;
      this._nextCost = previous;
      if (this._gasChanged) this.costRevision++;
      this._gasRevision = this._gasJobRevision;
      this._gasCursor = -1;
      this._gasAge = 0;
    }
  }

  get stats() {
    let walk = 0;
    for (let i = 0; i < this.height.length; i++) if (!Number.isNaN(this.height[i])) walk++;
    return { cells: this.height.length, walkable: walk, regions: this.regionCount };
  }
}

const NB = new Int8Array([1, 0, -1, 0, 0, 1, 0, -1, 1, 1, 1, -1, -1, 1, -1, -1]);

/** A resumable A*. The expansion limit is per step, not a reason to discard
 * explored alternatives or stop permanently at a wall. The cost snapshot is
 * consistent while other actors run and the live gas grid is refreshed.
 */
class PathSearch {
  constructor(nav, start, goal, tx, tz, ignoreGas) {
    this.nav = nav; this.start = start; this.goal = goal;
    this.tx = tx; this.tz = tz; this.ignoreGas = ignoreGas;
    this.cost = ignoreGas ? null : nav.cost.slice();
    this.costRevision = nav.costRevision;
    this.sourceRevision = nav._gasRevision;
    this.nodes = new Map();
    this.open = new BinaryHeap(i => this.nodes.get(i).f);
    this.nodes.set(start, {g:0, f:this.heuristic(start), parent:-1, closed:false});
    this.open.push(start);
    this.done = false; this.path = null; this.expanded = 0; this.lastExpanded = 0;
  }

  heuristic(i) {
    const n = this.nav.nx;
    const dx = Math.abs(i % n - this.goal % n);
    const dz = Math.abs(((i / n) | 0) - ((this.goal / n) | 0));
    return dx + dz + (DIAG - 2) * Math.min(dx, dz);
  }

  step(budget = 700) {
    this.lastExpanded = 0;
    if (this.done) return this.path;
    const nav = this.nav;
    while (this.open.size && this.lastExpanded < budget) {
      const cur = this.open.pop(), node = this.nodes.get(cur);
      if (cur === this.goal) { this.done = true; this.path = this.finish(); return this.path; }
      node.closed = true;
      this.lastExpanded++; this.expanded++;
      const cx = cur % nav.nx, cz = (cur / nav.nx) | 0, hy = nav.height[cur];
      for (let k = 0; k < 8; k++) {
        const nx = cx + NB[k * 2], nz = cz + NB[k * 2 + 1];
        if (!nav.inBounds(nx, nz)) continue;
        const ni = nav.i(nx, nz), nh = nav.height[ni];
        if (Number.isNaN(nh) || Math.abs(nh - hy) > 0.45) continue;
        if (k >= 4) {
          const a = nav.height[nav.i(nx, cz)], b = nav.height[nav.i(cx, nz)];
          if (Number.isNaN(a) || Number.isNaN(b) || Math.abs(a - hy) > 0.45 || Math.abs(b - hy) > 0.45) continue;
        }
        let next = this.nodes.get(ni);
        if (next?.closed) continue;
        const g = node.g + (k >= 4 ? DIAG : 1) * (this.ignoreGas ? 1 : this.cost[ni]);
        if (!next) {
          next = {g, f:g + this.heuristic(ni) * 1.04, parent:cur, closed:false};
          this.nodes.set(ni, next); this.open.push(ni);
        } else if (g < next.g) {
          next.g = g; next.f = g + this.heuristic(ni) * 1.04; next.parent = cur;
          this.open.update(ni);
        }
      }
    }
    if (!this.open.size) this.done = true;
    return null;
  }

  finish() {
    const nav = this.nav, raw = [];
    for (let cur = this.goal; cur !== -1; cur = this.nodes.get(cur).parent) raw.push(cur);
    raw.reverse();
    if (raw.length === 1) return [{x:this.tx, y:nav.height[this.goal], z:this.tz}];
    const points = [nav._pt(raw[0])];
    let anchor = 0;
    for (let i = 2; i < raw.length; i++) {
      const replacedCost = this.nodes.get(raw[i]).g - this.nodes.get(raw[anchor]).g + 0.001;
      if (nav._segmentCost(raw[anchor], raw[i], this.ignoreGas, Infinity, this.cost) > replacedCost) {
        anchor = i - 1; points.push(nav._pt(raw[anchor]));
      }
    }
    points.push({x:this.tx, y:nav.height[this.goal], z:this.tz});
    return points;
  }
}

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
