/**
 * Collision.
 *
 * Every solid in Hollis is a Y-rotated box. That is a deliberate constraint:
 * circle-vs-oriented-rectangle in 2D is exact, branch-free and fast enough to
 * run for every actor every frame on a phone, and it lets the world be built
 * from the same box primitives that draw it.
 *
 * Vertical movement is handled separately from horizontal, which is what gives
 * the controller its predictability: you never get caught on a kerb, you never
 * slide off a roof edge you were standing on, and stairs (built as short boxes)
 * are climbed by the same step-up rule as a single kerb.
 */

import { clamp, clamp01 } from '../core/util.js';

export const LAYER = {
  SOLID: 1,        // blocks movement and sight
  PLATFORM: 2,     // blocks movement, can be stood on, does not block sight
  CLIMB: 4,        // ladder volume
  TRIGGER: 8,      // no collision, reports overlap
  WATER: 16,
  BLOCKSIGHT: 32,  // blocks AI vision but not movement (smoke curtains, tarps)
};

let _idCounter = 1;

export class Box {
  /**
   * @param {number} x centre X
   * @param {number} y0 bottom
   * @param {number} z centre Z
   * @param {number} w full width (local X)
   * @param {number} h height
   * @param {number} d full depth (local Z)
   * @param {number} rot Y rotation, radians
   */
  constructor(x, y0, z, w, h, d, rot = 0, layer = LAYER.SOLID, tag = null) {
    this.id = _idCounter++;
    this.x = x; this.y0 = y0; this.z = z;
    this.hw = w / 2; this.hd = d / 2;
    this.y1 = y0 + h;
    this.rot = rot;
    this.c = Math.cos(rot); this.s = Math.sin(rot);
    this.layer = layer;
    this.tag = tag;
    // Conservative circumscribed radius for broad-phase.
    this.r = Math.hypot(this.hw, this.hd);
    this.enabled = true;
  }

  /** World point -> box local XZ. */
  toLocal(x, z, out) {
    const dx = x - this.x, dz = z - this.z;
    out.x = dx * this.c + dz * this.s;
    out.z = -dx * this.s + dz * this.c;
    return out;
  }

  /** Box local XZ -> world. */
  toWorld(lx, lz, out) {
    out.x = this.x + lx * this.c - lz * this.s;
    out.z = this.z + lx * this.s + lz * this.c;
    return out;
  }

  containsXZ(x, z, pad = 0) {
    const l = _tmpL;
    this.toLocal(x, z, l);
    return Math.abs(l.x) <= this.hw + pad && Math.abs(l.z) <= this.hd + pad;
  }

  /** Squared distance from a point to the box footprint (0 if inside). */
  distSqXZ(x, z) {
    const l = _tmpL;
    this.toLocal(x, z, l);
    const dx = Math.max(0, Math.abs(l.x) - this.hw);
    const dz = Math.max(0, Math.abs(l.z) - this.hd);
    return dx * dx + dz * dz;
  }
}

const _tmpL = { x: 0, z: 0 };
const _tmpW = { x: 0, z: 0 };

export class CollisionWorld {
  constructor(cell = 6) {
    this.cell = cell;
    this.grid = new Map();
    this.boxes = [];
    this.dynamic = [];      // boxes that move/toggle (doors, debris)
  }

  _key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }

  add(box) {
    this.boxes.push(box);
    this._index(box);
    return box;
  }

  _index(box) {
    const c = this.cell;
    const ix0 = Math.floor((box.x - box.r) / c), ix1 = Math.floor((box.x + box.r) / c);
    const iz0 = Math.floor((box.z - box.r) / c), iz1 = Math.floor((box.z + box.r) / c);
    box._cells = [];
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const k = this._key(ix, iz);
        let a = this.grid.get(k);
        if (!a) this.grid.set(k, (a = []));
        a.push(box);
        box._cells.push(k);
      }
    }
  }

  remove(box) {
    if (box._cells) {
      for (const k of box._cells) {
        const a = this.grid.get(k);
        if (a) {
          const i = a.indexOf(box);
          if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); }
        }
      }
      box._cells = null;
    }
    const i = this.boxes.indexOf(box);
    if (i >= 0) { this.boxes[i] = this.boxes[this.boxes.length - 1]; this.boxes.pop(); }
  }

  /** Collect boxes whose cells overlap the given circle. Reuses `out`. */
  query(x, z, radius, out, layerMask = 0xffff) {
    out.length = 0;
    const c = this.cell;
    const ix0 = Math.floor((x - radius) / c), ix1 = Math.floor((x + radius) / c);
    const iz0 = Math.floor((z - radius) / c), iz1 = Math.floor((z + radius) / c);
    const seen = _querySeen;
    seen.clear();
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const a = this.grid.get(this._key(ix, iz));
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const b = a[i];
          if (!b.enabled || !(b.layer & layerMask)) continue;
          if (seen.has(b.id)) continue;
          seen.add(b.id);
          out.push(b);
        }
      }
    }
    return out;
  }

  /**
   * Push a circle out of every solid it overlaps, in the plane.
   * @returns {number} number of contacts resolved
   */
  resolveCircle(pos, radius, feetY, headY, stepHeight) {
    const list = _queryList;
    this.query(pos.x, pos.z, radius + 2, list, LAYER.SOLID | LAYER.PLATFORM);
    let contacts = 0;
    // Two iterations settle corners without jitter; a third buys nothing.
    for (let pass = 0; pass < 2; pass++) {
      let moved = false;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        // Vertical rejection: below our step-up reach, or above our head.
        if (b.y1 <= feetY + stepHeight + 0.001) continue;
        if (b.y0 >= headY - 0.02) continue;

        const l = _tmpL;
        b.toLocal(pos.x, pos.z, l);
        const px = clamp(l.x, -b.hw, b.hw);
        const pz = clamp(l.z, -b.hd, b.hd);
        let dx = l.x - px, dz = l.z - pz;
        let d2 = dx * dx + dz * dz;

        if (d2 > radius * radius) continue;

        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = radius - d;
          l.x += (dx / d) * push;
          l.z += (dz / d) * push;
        } else {
          // Centre is inside: escape along the shallowest axis.
          const ox = b.hw - Math.abs(l.x);
          const oz = b.hd - Math.abs(l.z);
          if (ox < oz) l.x = Math.sign(l.x || 1) * (b.hw + radius);
          else l.z = Math.sign(l.z || 1) * (b.hd + radius);
        }
        b.toWorld(l.x, l.z, _tmpW);
        pos.x = _tmpW.x; pos.z = _tmpW.z;
        contacts++;
        moved = true;
      }
      if (!moved) break;
    }
    return contacts;
  }

  /**
   * Highest supporting surface under a circle, searching downward from `fromY`.
   * Returns { y, box } or null. `maxDrop` bounds the search so an actor over a
   * void reports no ground rather than snapping to the street below.
   */
  groundUnder(x, z, radius, fromY, maxDrop = 3.0) {
    const list = _queryList;
    this.query(x, z, radius + 0.5, list, LAYER.SOLID | LAYER.PLATFORM);
    let best = -Infinity, bestBox = null;
    const lo = fromY - maxDrop;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.y1 > fromY + 0.02 || b.y1 < lo) continue;
      if (b.distSqXZ(x, z) > radius * radius) continue;
      if (b.y1 > best) { best = b.y1; bestBox = b; }
    }
    return bestBox ? { y: best, box: bestBox } : null;
  }

  /** Lowest ceiling above a point within `maxUp`. Returns Infinity if clear. */
  ceilingAbove(x, z, radius, fromY, maxUp = 4.0) {
    const list = _queryList;
    this.query(x, z, radius + 0.5, list, LAYER.SOLID | LAYER.PLATFORM);
    let best = Infinity;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.y0 < fromY + 0.05 || b.y0 > fromY + maxUp) continue;
      if (b.distSqXZ(x, z) > radius * radius) continue;
      if (b.y0 < best) best = b.y0;
    }
    return best;
  }

  /**
   * Any solid overlapping the capsule? Used to validate teleports and spawns,
   * and by the vault to find what is in the way.
   *
   * Returns the box with the LOWEST top surface among the overlaps rather than
   * whichever one the spatial hash happened to visit first. That matters: the
   * caller almost always wants "the thing I could get over", and an arbitrary
   * answer made the auto-vault fire or not fire depending on insertion order.
   */
  overlaps(x, y, z, radius, height) {
    const list = _queryList;
    this.query(x, z, radius + 0.5, list, LAYER.SOLID | LAYER.PLATFORM);
    let best = null;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.y1 <= y + 0.05 || b.y0 >= y + height - 0.05) continue;
      if (b.distSqXZ(x, z) < radius * radius) {
        if (!best || b.y1 < best.y1) best = b;
      }
    }
    return best;
  }

  /** As `overlaps`, but stops at the first hit. Cheaper when only truth matters. */
  anyOverlap(x, y, z, radius, height) {
    const list = _queryList;
    this.query(x, z, radius + 0.5, list, LAYER.SOLID | LAYER.PLATFORM);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.y1 <= y + 0.05 || b.y0 >= y + height - 0.05) continue;
      if (b.distSqXZ(x, z) < radius * radius) return b;
    }
    return null;
  }

  /**
   * Segment cast against boxes. Slab method per box, broad-phased by walking
   * the grid cells the segment passes through.
   * @returns {{t:number, box:Box, nx:number, ny:number, nz:number}|null}
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, layerMask = LAYER.SOLID) {
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;

    const list = _queryList;
    // Broad-phase over a swollen circle around the segment's XZ extent.
    const mx = ox + dx * maxDist * 0.5, mz = oz + dz * maxDist * 0.5;
    this.query(mx, mz, maxDist * 0.5 + 2, list, layerMask);

    let bestT = maxDist, best = null, bn = [0, 0, 0];
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      // Transform ray into box local space (Y is unrotated).
      const lox = (ox - b.x) * b.c + (oz - b.z) * b.s;
      const loz = -(ox - b.x) * b.s + (oz - b.z) * b.c;
      const ldx = dx * b.c + dz * b.s;
      const ldz = -dx * b.s + dz * b.c;

      let t0 = 0, t1 = bestT;
      let hitAxis = -1, hitSign = 1;

      // X slab
      if (Math.abs(ldx) < 1e-8) { if (Math.abs(lox) > b.hw) continue; }
      else {
        let ta = (-b.hw - lox) / ldx, tb = (b.hw - lox) / ldx;
        let sgn = -Math.sign(ldx);
        if (ta > tb) { const t = ta; ta = tb; tb = t; sgn = -sgn; }
        if (ta > t0) { t0 = ta; hitAxis = 0; hitSign = sgn; }
        if (tb < t1) t1 = tb;
        if (t0 > t1) continue;
      }
      // Y slab
      if (Math.abs(dy) < 1e-8) { if (oy < b.y0 || oy > b.y1) continue; }
      else {
        let ta = (b.y0 - oy) / dy, tb = (b.y1 - oy) / dy;
        let sgn = -Math.sign(dy);
        if (ta > tb) { const t = ta; ta = tb; tb = t; sgn = -sgn; }
        if (ta > t0) { t0 = ta; hitAxis = 1; hitSign = sgn; }
        if (tb < t1) t1 = tb;
        if (t0 > t1) continue;
      }
      // Z slab
      if (Math.abs(ldz) < 1e-8) { if (Math.abs(loz) > b.hd) continue; }
      else {
        let ta = (-b.hd - loz) / ldz, tb = (b.hd - loz) / ldz;
        let sgn = -Math.sign(ldz);
        if (ta > tb) { const t = ta; ta = tb; tb = t; sgn = -sgn; }
        if (ta > t0) { t0 = ta; hitAxis = 2; hitSign = sgn; }
        if (tb < t1) t1 = tb;
        if (t0 > t1) continue;
      }

      if (t0 >= 0 && t0 < bestT) {
        bestT = t0;
        best = b;
        if (hitAxis === 0) bn = [hitSign * b.c, 0, hitSign * b.s];
        else if (hitAxis === 1) bn = [0, hitSign, 0];
        else bn = [-hitSign * b.s, 0, hitSign * b.c];
      }
    }
    return best ? { t: bestT, box: best, nx: bn[0], ny: bn[1], nz: bn[2],
                    x: ox + dx * bestT, y: oy + dy * bestT, z: oz + dz * bestT } : null;
  }

  /** Convenience: is there a clear line between two points? */
  lineOfSight(ax, ay, az, bx, by, bz, layerMask = LAYER.SOLID | LAYER.BLOCKSIGHT) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    const hit = this.raycast(ax, ay, az, dx, dy, dz, d - 0.05, layerMask);
    return !hit;
  }

  /**
   * Sphere cast used by the camera to avoid clipping through geometry.
   * Conservative and cheap: samples along the segment.
   */
  sphereCast(ox, oy, oz, dx, dy, dz, maxDist, radius) {
    const steps = Math.max(4, Math.ceil(maxDist / (radius * 0.85)));
    const list = _queryList;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * maxDist;
      const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
      this.query(px, pz, radius + 1, list, LAYER.SOLID);
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (py + radius < b.y0 || py - radius > b.y1) continue;
        if (b.distSqXZ(px, pz) < radius * radius) {
          return Math.max(0, ((i - 1) / steps) * maxDist);
        }
      }
    }
    return maxDist;
  }

  /** Climb volumes (ladders) overlapping a point. */
  climbAt(x, y, z, radius) {
    const list = _queryList;
    this.query(x, z, radius + 1, list, LAYER.CLIMB);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (y + 1.6 < b.y0 || y > b.y1) continue;
      if (b.distSqXZ(x, z) < radius * radius) return b;
    }
    return null;
  }

  get stats() { return { boxes: this.boxes.length, cells: this.grid.size }; }

  clear() {
    this.grid.clear();
    this.boxes.length = 0;
  }
}

const _queryList = [];
const _querySeen = new Set();

/**
 * Move a capsule with gravity, step-up and ground snapping.
 * This is the single function that defines how the game feels to walk in, so it
 * is written for predictability over physical accuracy.
 *
 * @param {CollisionWorld} world
 * @param {object} a actor: { pos:Vector3, vel:Vector3, radius, height, grounded, groundY, stepHeight, coyote }
 * @param {number} dt
 * @returns {object} flags { grounded, hitWall, hitCeiling, groundBox, steppedUp, fellDist }
 */
export function moveActor(world, a, dt) {
  const pos = a.pos, vel = a.vel;
  const r = a.radius, h = a.height;
  const step = a.stepHeight ?? 0.42;

  const startY = pos.y;
  let hitWall = false, hitCeiling = false, steppedUp = false;

  // --- horizontal -----------------------------------------------------------
  const wasGrounded = a.grounded;
  const prevY = pos.y;

  const dx = vel.x * dt, dz = vel.z * dt;
  const dist = Math.hypot(dx, dz);
  const startX = pos.x, startZ = pos.z;
  // Substep so fast movement cannot tunnel through a wall.
  const sub = Math.max(1, Math.ceil(dist / (r * 0.7)));
  const slide = (feetY, headY, tol, rad) => {
    let hit = false;
    for (let i = 0; i < sub; i++) {
      pos.x += dx / sub;
      pos.z += dz / sub;
      const bx = pos.x, bz = pos.z;
      const c = world.resolveCircle(pos, rad, feetY, headY, tol);
      if (c > 0 && Math.hypot(pos.x - bx, pos.z - bz) > 1e-4) hit = true;
    }
    return hit;
  };

  hitWall = slide(pos.y, pos.y + h, step, r);

  // Step-up, horizontal half.
  //
  // Resolving at foot height alone is not enough on a real staircase. A fire
  // escape's treads are 0.14 m deep and the body is 0.34 m across, so standing
  // on one tread always overlaps the tread two above — which is higher than a
  // step, therefore solid, therefore a wall. The flight is unclimbable no
  // matter how good the vertical rule is.
  //
  // So when a grounded actor is genuinely stopped, replay the same move with
  // the feet one step higher. Anything short enough to stand on stops being an
  // obstacle; anything taller still is one. The move is only kept if it made
  // real progress AND there is something to stand on at the far end.
  if (hitWall && dist > 1e-5 && (wasGrounded || (a.coyote ?? 0) > 0)) {
    const ux = dx / dist, uz = dz / dist;
    const advLow = (pos.x - startX) * ux + (pos.z - startZ) * uz;
    if (advLow < dist * 0.7) {
      const lowX = pos.x, lowZ = pos.z;
      const raised = prevY + step;
      let ok = false, adv = advLow;

      pos.x = startX; pos.z = startZ;
      slide(raised, raised + h, 0.001, r);
      adv = (pos.x - startX) * ux + (pos.z - startZ) * uz;
      if (adv > advLow + 1e-3) {
        const g = world.groundUnder(pos.x, pos.z, r * 0.92, raised, step * 2 + 0.2);
        if (g && g.y - prevY <= step + 1e-4) ok = true;
      }

      // Staircase pass. A flight whose treads are shallower than the body is
      // unclimbable with a full-width capsule at any step height: standing on
      // one tread always overlaps the tread two above it, which is higher than
      // a step and therefore a wall. Hollis's fire escapes are exactly this —
      // 0.14 m treads under a 0.34 m body — and they are the vertical network
      // the whole game routes through.
      //
      // So probe again with a narrow body, and keep it only if the destination
      // is somewhere a person could actually stand: ground within one step, and
      // nothing solid above that ground inside the torso. That second test is
      // what stops this from being a way to squeeze through walls and slots.
      if (!ok) {
        pos.x = startX; pos.z = startZ;
        slide(raised, raised + h, 0.001, r * 0.5);
        adv = (pos.x - startX) * ux + (pos.z - startZ) * uz;
        if (adv > advLow + 1e-3) {
          const g = world.groundUnder(pos.x, pos.z, r * 0.5, raised, step * 2 + 0.2);
          if (g && g.y - prevY <= step + 1e-4 &&
              !world.anyOverlap(pos.x, g.y + step + 0.02, pos.z, r * 0.72, h - step)) {
            ok = true;
          }
        }
      }

      if (ok) hitWall = adv < dist * 0.98;
      else { pos.x = lowX; pos.z = lowZ; }
    }
  }

  // --- vertical -------------------------------------------------------------

  vel.y -= (a.gravity ?? 22.0) * dt;
  // Terminal velocity keeps long falls readable rather than instant.
  if (vel.y < -32) vel.y = -32;
  pos.y += vel.y * dt;

  // Ceiling
  const ceil = world.ceilingAbove(pos.x, pos.z, r * 0.85, pos.y, h + 0.1);
  if (ceil < pos.y + h) {
    pos.y = ceil - h - 0.001;
    if (vel.y > 0) vel.y = 0;
    hitCeiling = true;
  }

  let grounded = false;
  let groundBox = null;

  // Ground resolution.
  //
  // The search origin is one step-height ABOVE where the feet were, not just
  // above where they are. That single choice is what makes step-up work at all:
  // `groundUnder` rejects any surface higher than its origin, so searching from
  // the feet can only ever find the floor you are already on, and every kerb,
  // stair nose and ramp box in the city reads as a wall.
  //
  // Reaching upward is only legitimate while walking. In the air we search from
  // the feet, otherwise falling past a ledge would snag on it.
  const canStep = wasGrounded || (a.coyote ?? 0) > 0;
  const reach = canStep ? step : 0.03;

  // 1) Swept landing and step-up, in one query. The span searched covers the
  //    whole distance the feet travelled this step — so a fast fall cannot pass
  //    through a floor between two frames — plus one step above, so a surface
  //    the body is pressed against is found and climbed.
  if (vel.y <= 0.001) {
    const from = prevY + reach;
    const depth = reach + Math.max(0.08, prevY - pos.y) + 0.08;
    const g = world.groundUnder(pos.x, pos.z, r * 0.92, from, depth);
    if (g && pos.y <= g.y + 0.03 && g.y - prevY <= reach + 1e-4) {
      // No headroom test here on purpose. On any staircase the next tread sits
      // above your feet and inside your body cylinder, so a ceiling probe at
      // the destination rejects every stair in the city. If a step-up ever does
      // put a head into something, the ceiling clamp above and `resolveCircle`
      // on the following frame recover from it — predictability first.
      pos.y = g.y;
      vel.y = 0;
      grounded = true;
      groundBox = g.box;
      if (g.y - prevY > 0.005) steppedUp = true;
    }
  }

  // 2) Step-down snap. While already grounded and not launched, stick to a
  //    surface up to one step below, so kerbs, stair noses and shallow slopes
  //    are walked down instead of stepped off.
  if (!grounded && wasGrounded && vel.y <= 0.8) {
    const g = world.groundUnder(pos.x, pos.z, r * 0.92, prevY + 0.03, step + 0.12);
    if (g && prevY - g.y <= step + 0.08 && g.y <= prevY + 0.03) {
      pos.y = g.y;
      vel.y = 0;
      grounded = true;
      groundBox = g.box;
    }
  }

  // Safety net. If anything ever does put an actor under the world, put them
  // back rather than letting them fall forever.
  if (pos.y < (a.floorLimit ?? -80)) {
    const g = world.groundUnder(a.spawnX ?? pos.x, a.spawnZ ?? pos.z, r, 40, 60);
    pos.set(a.spawnX ?? pos.x, g ? g.y + 0.1 : 0.1, a.spawnZ ?? pos.z);
    vel.set(0, 0, 0);
    grounded = true;
    a.fallStartY = pos.y;
  }

  const fellDist = grounded && !a.grounded ? Math.max(0, a.fallStartY - pos.y) : 0;

  if (grounded) {
    a.fallStartY = pos.y;
    a.coyote = 0.13;
  } else {
    a.coyote = Math.max(0, (a.coyote ?? 0) - dt);
    if (a.grounded) a.fallStartY = startY;
  }
  a.grounded = grounded;
  a.groundY = grounded ? pos.y : a.groundY;

  return { grounded, hitWall, hitCeiling, groundBox, steppedUp, fellDist };
}
