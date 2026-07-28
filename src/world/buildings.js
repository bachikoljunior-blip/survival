/**
 * Parametric buildings.
 *
 * Hollis is a mid-century industrial city: brick row buildings over shopfronts,
 * concrete-panel housing slabs, and steel-framed works sheds. Each style has
 * its own massing rules, window rhythm and roofline so that a player standing
 * at a junction can tell which district they are looking into.
 *
 * Facade detail is generated only on sides flagged as street-facing, and window
 * recesses are five quads rather than a modelled frame. That is the difference
 * between a district that runs and one that does not.
 */

import { FACE } from './geom.js';
import { TAU, clamp01, lerp } from '../core/util.js';
import * as P from './props.js';

const T = {
  brick: [1, 1, 1],
  concrete: [1, 1, 1],
  panel: [0.95, 0.95, 0.94],
  trim: [0.8, 0.78, 0.74],
  dark: [0.12, 0.12, 0.13],
  glassLit: [1, 1, 1],
};

/** Window treatments, chosen per-opening. */
const WIN = { OPEN: 0, GLASS: 1, BOARDED: 2, BROKEN: 3, LIT: 4, CURTAIN: 5 };

function chooseWindow(rng, opts) {
  const { litChance = 0.0, boardChance = 0.18 } = opts;
  const r = rng.f();
  if (r < litChance) return WIN.LIT;
  if (r < litChance + boardChance) return WIN.BOARDED;
  if (r < litChance + boardChance + 0.28) return WIN.BROKEN;
  if (r < litChance + boardChance + 0.5) return WIN.OPEN;
  if (r < litChance + boardChance + 0.7) return WIN.CURTAIN;
  return WIN.GLASS;
}

/**
 * Cut a window into a wall plane.
 * @param dirX,dirZ outward normal of the wall (axis-aligned unit)
 */
function window_(cb, cx, cy, cz, w, h, nx, nz, kind, rng, depth = 0.16) {
  const tx = -nz, tz = nx;               // tangent along the wall
  const rot = Math.atan2(nz, nx);
  const back = 0.02;

  // Reveal: a shallow box pushed into the wall. Dark inside, so the opening
  // reads as depth rather than a painted rectangle.
  cb.m('dark').boxRot({
    x: cx - nx * depth * 0.5, y: cy, z: cz - nz * depth * 0.5,
    w: w, h: h, d: depth, rot: -rot,
    uvScale: 1.2, tint: [0.1, 0.1, 0.11], ao: 0.0, aoTop: 0.45,
    faces: FACE.ALL,
  });

  // Sill and lintel catch the light and give the facade its horizontal rhythm.
  cb.m('concrete').boxRot({
    x: cx + nx * 0.035, y: cy - 0.07, z: cz + nz * 0.035,
    w: w + 0.16, h: 0.07, d: 0.14, rot: -rot, uvScale: 1.6, tint: T.trim, ao: 0.2,
  });
  cb.m('concrete').boxRot({
    x: cx + nx * 0.02, y: cy + h, z: cz + nz * 0.02,
    w: w + 0.12, h: 0.09, d: 0.1, rot: -rot, uvScale: 1.6, tint: T.trim, ao: 0.1,
  });

  switch (kind) {
    case WIN.GLASS:
      cb.m('glass').boxRot({
        x: cx - nx * 0.06, y: cy + 0.02, z: cz - nz * 0.06,
        w: w - 0.06, h: h - 0.04, d: 0.02, rot: -rot, uvScale: 1.4, tint: [0.7, 0.74, 0.76],
      });
      break;
    case WIN.LIT:
      // A lit window is a promise that someone is alive in there.
      cb.m('screenglow').boxRot({
        x: cx - nx * 0.08, y: cy + 0.02, z: cz - nz * 0.08,
        w: w - 0.08, h: h - 0.06, d: 0.02, rot: -rot, uvScale: 1, tint: [1.5, 0.68, 0.23],
      });
      break;
    case WIN.BOARDED: {
      const n = 3;
      for (let i = 0; i < n; i++) {
        cb.m('wood').boxRot({
          x: cx - nx * 0.05 + tx * rng.sym(0.03), y: cy + 0.06 + i * ((h - 0.14) / n),
          z: cz - nz * 0.05 + tz * rng.sym(0.03),
          w: w + 0.1, h: (h - 0.14) / n * 0.82, d: 0.035,
          rot: -rot + rng.sym(0.05), uvScale: 1.6, tint: [0.62, 0.53, 0.4],
        });
      }
      break;
    }
    case WIN.BROKEN: {
      // Shards clinging to the frame; nothing behind them.
      for (let i = 0; i < 3; i++) {
        const ox = rng.sym(w * 0.35);
        cb.m('glass').boxRot({
          x: cx - nx * 0.06 + tx * ox, y: cy + h * rng.range(0.5, 0.82),
          z: cz - nz * 0.06 + tz * ox,
          w: rng.range(0.1, w * 0.4), h: rng.range(0.08, h * 0.3), d: 0.015,
          rot: -rot, uvScale: 2, tint: [0.6, 0.66, 0.68],
        });
      }
      break;
    }
    case WIN.CURTAIN:
      cb.m('fabric').boxRot({
        x: cx - nx * 0.09, y: cy + 0.03, z: cz - nz * 0.09,
        w: w - 0.05, h: h - 0.08, d: 0.02, rot: -rot, uvScale: 1.4,
        tint: [0.44, 0.42, 0.38], ao: 0.35,
      });
      break;
    default:
      break;   // OPEN — the reveal alone
  }
  return kind === WIN.LIT ? { x: cx - nx * 0.4, y: cy + h * 0.5, z: cz - nz * 0.4 } : null;
}

/** Ground-floor shopfront: big glazing, a stall riser and a fascia sign. */
function shopfront(cb, cx, cy, cz, w, h, nx, nz, rng, opts = {}) {
  const rot = Math.atan2(nz, nx);
  const tx = -nz, tz = nx;
  // Stall riser
  cb.m('tile').boxRot({ x: cx + nx * 0.03, y: cy, z: cz + nz * 0.03, w, h: 0.55, d: 0.08, rot: -rot, uvScale: 1.4, tint: [0.7, 0.68, 0.64], ao: 0.5 });
  // Recessed glazing
  cb.m('dark').boxRot({
    x: cx - nx * 0.14, y: cy + 0.55, z: cz - nz * 0.14,
    w, h: h - 0.55, d: 0.3, rot: -rot, uvScale: 1, tint: [0.09, 0.09, 0.1], aoTop: 0.5,
  });
  // Mullions
  const bays = Math.max(2, Math.round(w / 1.2));
  for (let i = 0; i <= bays; i++) {
    const ox = (i / bays - 0.5) * w;
    cb.m('metal').boxRot({
      x: cx - nx * 0.03 + tx * ox, y: cy + 0.55, z: cz - nz * 0.03 + tz * ox,
      w: 0.07, h: h - 0.55, d: 0.09, rot: -rot, uvScale: 2, tint: [0.4, 0.4, 0.4],
    });
  }
  // Broken or boarded glazing — almost never intact.
  const state = rng.f();
  if (state < 0.4) {
    for (let i = 0; i < bays; i++) {
      const ox = ((i + 0.5) / bays - 0.5) * w;
      if (rng.chance(0.6)) continue;
      cb.m('wood').boxRot({
        x: cx - nx * 0.04 + tx * ox, y: cy + 0.6, z: cz - nz * 0.04 + tz * ox,
        w: w / bays * 0.94, h: h - 0.66, d: 0.035, rot: -rot, uvScale: 1.2, tint: [0.6, 0.51, 0.38],
      });
    }
  } else if (state < 0.7) {
    cb.m('glass').boxRot({
      x: cx - nx * 0.05, y: cy + 0.6, z: cz - nz * 0.05,
      w: w * 0.96, h: h - 0.68, d: 0.02, rot: -rot, uvScale: 1, tint: [0.62, 0.66, 0.68],
    });
  }
  // Fascia above
  cb.m('paint').boxRot({
    x: cx + nx * 0.06, y: cy + h, z: cz + nz * 0.06,
    w: w + 0.1, h: 0.52, d: 0.16, rot: -rot, uvScale: 1.2, tint: opts.fasciaTint || [0.36, 0.34, 0.3], ao: 0.2,
  });
  if (opts.sign) {
    return { sign: { x: cx + nx * 0.16, y: cy + h + 0.26, z: cz + nz * 0.16, rot: -rot, w: Math.min(w * 0.92, 4.2), h: 0.42, text: opts.sign } };
  }
  return null;
}

/** Doorway. Returns a marker the world uses to place an interior transition. */
function doorway(cb, cx, cy, cz, nx, nz, rng, opts = {}) {
  const rot = Math.atan2(nz, nx);
  const w = opts.w ?? 1.15, h = opts.h ?? 2.25;
  cb.m('dark').boxRot({
    x: cx - nx * 0.22, y: cy, z: cz - nz * 0.22,
    w, h, d: 0.44, rot: -rot, uvScale: 1, tint: [0.07, 0.07, 0.08], aoTop: 0.6,
  });
  // Surround
  cb.m('concrete').boxRot({ x: cx + nx * 0.05, y: cy, z: cz + nz * 0.05, w: w + 0.3, h: 0.14, d: 0.14, rot: -rot, uvScale: 2, tint: T.trim });
  cb.m('concrete').boxRot({ x: cx + nx * 0.05, y: cy + h, z: cz + nz * 0.05, w: w + 0.34, h: 0.16, d: 0.16, rot: -rot, uvScale: 2, tint: T.trim, ao: 0.1 });
  for (const s of [-1, 1]) {
    cb.m('concrete').boxRot({
      x: cx + nx * 0.05 + (-nz) * s * (w / 2 + 0.09), y: cy,
      z: cz + nz * 0.05 + nx * s * (w / 2 + 0.09),
      w: 0.16, h, d: 0.16, rot: -rot, uvScale: 2, tint: T.trim, ao: 0.3,
    });
  }
  if (opts.door !== false) {
    const ajar = opts.ajar ?? rng.chance(0.5);
    cb.m('wood').boxRot({
      x: cx - nx * (ajar ? 0.3 : 0.06) + (-nz) * (ajar ? w * 0.34 : 0), y: cy + 0.03,
      z: cz - nz * (ajar ? 0.3 : 0.06) + nx * (ajar ? w * 0.34 : 0),
      w: w - 0.06, h: h - 0.06, d: 0.06, rot: -rot + (ajar ? 0.95 : 0),
      uvScale: 1.2, tint: [0.5, 0.43, 0.34], ao: 0.35,
    });
  }
  return { x: cx - nx * 0.5, y: cy, z: cz - nz * 0.5, rot: rot + Math.PI, nx, nz };
}

// ------------------------------------------------------------------ styles --

/**
 * Build one building.
 * @param {ChunkBuilder} cb
 * @param {object} b  building spec (see world_data.js)
 * @param {Rng} rng
 * @returns {object} { lights:[], signs:[], doors:[], climbNodes:[], aabbs:[] }
 */
export function building(cb, b, rng) {
  const out = { lights: [], signs: [], doors: [], climb: [], aabbs: [], fx: [] };
  const style = b.style || 'row';
  const fn = STYLES[style] || STYLES.row;
  fn(cb, b, rng, out);
  return out;
}

const STYLES = {};

/** Brick row building: shopfront below, sash windows above, parapet and cornice. */
STYLES.row = (cb, b, rng, out) => {
  const { x, z, w, d, floors = 3, rot = 0 } = b;
  const fh = b.floorH ?? 3.3;
  const h = floors * fh;
  const key = b.mat || 'brick';

  cb.m(key).boxRot({ x, y: 0, z, w, h, d, rot, uvScale: 0.42, tint: T.brick, ao: 0.5, aoTop: 0.1, faces: FACE.NOBOTTOM });
  out.aabbs.push({ x, z, w, d, y0: 0, y1: h, rot });

  // Plinth
  cb.m('concrete').boxRot({ x, y: 0, z, w: w + 0.16, h: 0.5, d: d + 0.16, rot, uvScale: 0.7, tint: [0.72, 0.7, 0.66], ao: 0.6 });
  // Cornice + parapet
  cb.m('concrete').boxRot({ x, y: h - 0.22, z, w: w + 0.34, h: 0.28, d: d + 0.34, rot, uvScale: 0.7, tint: T.trim, ao: 0.1 });
  cb.m(key).boxRot({ x, y: h + 0.06, z, w: w + 0.1, h: b.parapet ?? 0.85, d: d + 0.1, rot, uvScale: 0.6, tint: T.brick, ao: 0.2 });
  cb.m('concrete').boxRot({ x, y: h + 0.06 + (b.parapet ?? 0.85), z, w: w + 0.2, h: 0.1, d: d + 0.2, rot, uvScale: 0.8, tint: T.trim });
  // Roof deck (asphalt felt)
  cb.m('asphalt').boxRot({ x, y: h, z, w: w - 0.05, h: 0.06, d: d - 0.05, rot, uvScale: 0.5, tint: [0.82, 0.8, 0.78] });
  out.roof = { y: h + 0.06, x, z, w: w - 0.4, d: d - 0.4, rot };

  facadeGrid(cb, b, rng, out, {
    floors, fh, h, winW: 0.95, winH: 1.55, spacing: b.bay ?? 2.1,
    groundShop: b.shop !== false, litChance: b.lit ?? 0.05,
  });
  roofClutter(cb, b, rng, out, h + 0.06);
};

/** Concrete-panel housing slab. Long, repetitive, balconied — the Stacks. */
STYLES.slab = (cb, b, rng, out) => {
  const { x, z, w, d, floors = 8, rot = 0 } = b;
  const fh = b.floorH ?? 2.85;
  const h = floors * fh;

  cb.m('concrete').boxRot({ x, y: 0, z, w, h, d, rot, uvScale: 0.32, tint: T.panel, ao: 0.45, aoTop: 0.1, faces: FACE.NOBOTTOM });
  out.aabbs.push({ x, z, w, d, y0: 0, y1: h, rot });

  // Panel joints: the horizontal banding that defines this typology.
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let f = 1; f < floors; f++) {
    cb.m('concrete').boxRot({ x, y: f * fh - 0.06, z, w: w + 0.07, h: 0.12, d: d + 0.07, rot, uvScale: 1.2, tint: [0.86, 0.85, 0.82], ao: 0.25 });
  }
  // Vertical joints on the long faces
  const bays = Math.max(3, Math.round(w / 3.2));
  for (let i = 1; i < bays; i++) {
    const ox = (i / bays - 0.5) * w;
    cb.m('concrete').boxRot({ x: x + ox * c, y: 0, z: z + ox * s, w: 0.1, h, d: d + 0.06, rot, uvScale: 1.4, tint: [0.86, 0.85, 0.82] });
  }

  facadeGrid(cb, b, rng, out, {
    floors, fh, h, winW: 1.2, winH: 1.3, spacing: w / bays,
    groundShop: false, litChance: b.lit ?? 0.1, balconies: b.balconies !== false,
  });

  // Roof: parapet, plant room, aerials.
  cb.m('concrete').boxRot({ x, y: h, z, w: w + 0.24, h: 0.95, d: d + 0.24, rot, uvScale: 0.7, tint: [0.9, 0.89, 0.86], ao: 0.15 });
  cb.m('asphalt').boxRot({ x, y: h, z, w: w - 0.2, h: 0.07, d: d - 0.2, rot, uvScale: 0.4, tint: [0.8, 0.78, 0.76] });
  out.roof = { y: h + 0.07, x, z, w: w - 1.2, d: d - 1.2, rot };
  cb.m('concrete').boxRot({ x: x + (w * 0.3) * c, y: h + 0.07, z: z + (w * 0.3) * s, w: 4.2, h: 2.6, d: Math.min(d * 0.6, 4.5), rot, uvScale: 0.7, tint: [0.84, 0.83, 0.8], ao: 0.3 });
  P.ladder(cb, x + (w * 0.3 - 2.3) * c, h + 0.07, z + (w * 0.3 - 2.3) * s, rot, 2.6, rng, { caged: false });
  roofClutter(cb, b, rng, out, h + 0.07);
};

/** Steel-framed works shed. Corrugated skin, sawtooth roof lights, big doors. */
STYLES.works = (cb, b, rng, out) => {
  const { x, z, w, d, rot = 0 } = b;
  const h = b.h ?? 8.5;

  cb.m('corrugated').boxRot({ x, y: 1.4, z, w, h: h - 1.4, d, rot, uvScale: 0.4, tint: [0.95, 0.94, 0.92], ao: 0.3, faces: FACE.SIDES });
  // Brick base course — cheaper to build, and it grounds the mass.
  cb.m('brick').boxRot({ x, y: 0, z, w: w + 0.08, h: 1.5, d: d + 0.08, rot, uvScale: 0.55, tint: T.brick, ao: 0.55 });
  out.aabbs.push({ x, z, w, d, y0: 0, y1: h, rot });

  // Sawtooth roof: north-light glazing, the signature of a real works.
  const c = Math.cos(rot), s = Math.sin(rot);
  const teeth = Math.max(2, Math.round(d / 6));
  for (let i = 0; i < teeth; i++) {
    const oz = (i / teeth - 0.5 + 0.5 / teeth) * d;
    const px = x - oz * s, pz = z + oz * c;
    cb.m('corrugated').boxRot({ x: px, y: h, z: pz, w, h: 1.5, d: d / teeth * 0.5, rot, uvScale: 0.6, tint: [0.92, 0.91, 0.9], ao: 0.2 });
    cb.m('glass').boxRot({
      x: px - (d / teeth * 0.3) * s, y: h + 0.1, z: pz + (d / teeth * 0.3) * c,
      w: w - 0.4, h: 1.3, d: 0.06, rot, uvScale: 0.8, tint: [0.6, 0.64, 0.66],
    });
    cb.m('metal').boxRot({ x: px, y: h + 1.5, z: pz, w: w + 0.2, h: 0.1, d: d / teeth * 1.05, rot, uvScale: 0.9, tint: [0.5, 0.5, 0.5] });
  }
  out.roof = { y: h + 1.6, x, z, w: w - 1, d: d - 1, rot };

  // Steel columns and a crane rail visible along the flank.
  for (let i = 0; i <= 4; i++) {
    const ox = (i / 4 - 0.5) * w;
    cb.m('rust').boxRot({ x: x + ox * c + (d / 2 + 0.12) * s, y: 0, z: z + ox * s - (d / 2 + 0.12) * c, w: 0.26, h: h, d: 0.26, rot, uvScale: 1, tint: [0.6, 0.5, 0.42], ao: 0.4 });
  }

  // Roller shutter door on the flagged face.
  const face = b.doorFace ?? 'pz';
  const [nx, nz] = FACE_NORMAL[face];
  const wx = nx * c - nz * s, wz = nx * s + nz * c;
  const off = (Math.abs(nx) > 0.5 ? w : d) / 2;
  const dx = x + wx * off, dz = z + wz * off;
  cb.m('corrugated').boxRot({ x: dx + wx * 0.06, y: 0, z: dz + wz * 0.06, w: 4.4, h: 4.6, d: 0.14, rot: -Math.atan2(wz, wx), uvScale: 1.1, tint: [0.72, 0.7, 0.66], ao: 0.4 });
  cb.m('rust').boxRot({ x: dx + wx * 0.1, y: 4.6, z: dz + wz * 0.1, w: 4.8, h: 0.4, d: 0.3, rot: -Math.atan2(wz, wx), uvScale: 1.4, tint: [0.6, 0.5, 0.42] });
  if (b.door) {
    out.doors.push({ ...doorway(cb, dx + wx * 0.02, 0, dz + wz * 0.02, wx, wz, rng, { w: 1.1, h: 2.2 }), id: b.door });
  }

  // High strip windows only.
  facadeGrid(cb, b, rng, out, {
    floors: 1, fh: h, h, winW: 1.6, winH: 1.0, spacing: 3.0,
    groundShop: false, litChance: b.lit ?? 0.02, yOffset: h - 2.4, skipGround: true,
  });
  roofClutter(cb, b, rng, out, h + 1.6, 0.4);
};

/** Civic / office block: banded windows, stone base, flat parapet. */
STYLES.civic = (cb, b, rng, out) => {
  const { x, z, w, d, floors = 4, rot = 0 } = b;
  const fh = b.floorH ?? 3.6;
  const h = floors * fh;

  cb.m('concrete').boxRot({ x, y: 0, z, w, h, d, rot, uvScale: 0.36, tint: [1, 1, 1], ao: 0.45, aoTop: 0.1, faces: FACE.NOBOTTOM });
  out.aabbs.push({ x, z, w, d, y0: 0, y1: h, rot });

  cb.m('concrete').boxRot({ x, y: 0, z, w: w + 0.4, h: 1.1, d: d + 0.4, rot, uvScale: 0.55, tint: [0.78, 0.77, 0.74], ao: 0.55 });
  for (let f = 1; f < floors; f++) {
    cb.m('concrete').boxRot({ x, y: f * fh - 0.1, z, w: w + 0.22, h: 0.34, d: d + 0.22, rot, uvScale: 0.9, tint: [0.88, 0.87, 0.84], ao: 0.2 });
  }
  cb.m('concrete').boxRot({ x, y: h - 0.1, z, w: w + 0.5, h: 0.42, d: d + 0.5, rot, uvScale: 0.7, tint: [0.82, 0.81, 0.78], ao: 0.05 });
  cb.m('concrete').boxRot({ x, y: h + 0.32, z, w: w + 0.2, h: 1.0, d: d + 0.2, rot, uvScale: 0.7, tint: [0.86, 0.85, 0.82], ao: 0.15 });
  cb.m('asphalt').boxRot({ x, y: h + 0.32, z, w: w - 0.2, h: 0.07, d: d - 0.2, rot, uvScale: 0.4, tint: [0.8, 0.78, 0.76] });
  out.roof = { y: h + 0.39, x, z, w: w - 1, d: d - 1, rot };

  facadeGrid(cb, b, rng, out, {
    floors, fh, h, winW: 1.7, winH: 1.9, spacing: b.bay ?? 2.6,
    groundShop: false, litChance: b.lit ?? 0.06, tallGround: true,
  });
  roofClutter(cb, b, rng, out, h + 0.39);
};

const FACE_NORMAL = { pz: [0, 1], nz: [0, -1], px: [1, 0], nx: [-1, 0] };

/**
 * Lay a grid of openings across the flagged faces of a building.
 * `b.faces` is a string like 'pz,px' naming which sides get detail. Sides that
 * abut another building or face away from any street are left flat, which is
 * both correct and the main geometry saving.
 */
function facadeGrid(cb, b, rng, out, cfg) {
  const { x, z, w, d, rot = 0 } = b;
  const {
    floors, fh, h, winW, winH, spacing, groundShop, litChance,
    balconies = false, tallGround = false, yOffset = null, skipGround = false,
  } = cfg;
  const c = Math.cos(rot), s = Math.sin(rot);
  const sides = (b.faces || 'pz,nz,px,nx').split(',');

  for (const side of sides) {
    const nrm = FACE_NORMAL[side.trim()];
    if (!nrm) continue;
    const [lnx, lnz] = nrm;
    // Rotate the local face normal into world space.
    const nx = lnx * c - lnz * s;
    const nz = lnx * s + lnz * c;
    const faceLen = Math.abs(lnx) > 0.5 ? d : w;
    const offset = (Math.abs(lnx) > 0.5 ? w : d) / 2;

    const fx = x + nx * offset, fz = z + nz * offset;
    const tx = -nz, tz = nx;            // along-face tangent

    const bays = Math.max(1, Math.floor((faceLen - 0.9) / spacing));
    if (bays < 1) continue;
    const step = (faceLen - 0.9) / bays;

    for (let f = 0; f < floors; f++) {
      const isGround = f === 0 && yOffset === null;
      if (skipGround && isGround && yOffset === null) { /* handled by yOffset */ }
      const baseY = yOffset !== null ? yOffset : f * fh;

      if (isGround && groundShop) {
        // One wide shopfront rather than punched windows.
        const sw = Math.min(faceLen - 1.6, bays * step - 0.4);
        if (sw > 1.8) {
          const r = shopfront(cb, fx, 0.02, fz, sw, tallGround ? 3.4 : 2.7, nx, nz, rng, {
            sign: b.signs && b.signs[side.trim()],
            fasciaTint: b.fascia,
          });
          if (r && r.sign) out.signs.push(r.sign);
        }
        // Entrance door beside the shopfront.
        if (b.entry === side.trim() || (!b.entry && side.trim() === (b.faces || 'pz').split(',')[0])) {
          const ox = (faceLen / 2 - 0.9);
          out.doors.push({
            ...doorway(cb, fx + tx * ox, 0.02, fz + tz * ox, nx, nz, rng, {}),
            id: b.door || null, label: b.doorLabel,
          });
        }
        continue;
      }

      for (let i = 0; i < bays; i++) {
        const ox = (i + 0.5) * step - (faceLen - 0.9) / 2;
        const cy = baseY + (fh - winH) * 0.5 + 0.1;
        const kind = chooseWindow(rng, { litChance, boardChance: b.boarded ?? 0.18 });
        const lit = window_(cb, fx + tx * ox, cy, fz + tz * ox, winW, winH, nx, nz, kind, rng);
        if (lit) out.lights.push({ ...lit, kind: 'window' });

        if (balconies && f > 0 && i % 2 === 0) {
          balcony(cb, fx + tx * ox, baseY, fz + tz * ox, nx, nz, step * 1.9, rng);
        }
      }
    }
  }
}

/** Slab-block balcony with an improvised windbreak. */
function balcony(cb, cx, cy, cz, nx, nz, w, rng) {
  const rot = -Math.atan2(nz, nx);
  const dep = 1.05;
  cb.m('concrete').boxRot({ x: cx + nx * dep * 0.5, y: cy - 0.02, z: cz + nz * dep * 0.5, w, h: 0.14, d: dep, rot, uvScale: 1, tint: [0.86, 0.85, 0.82], ao: 0.3 });
  // Balustrade
  cb.m('concrete').boxRot({ x: cx + nx * dep, y: cy + 0.12, z: cz + nz * dep, w, h: 0.9, d: 0.09, rot, uvScale: 1.1, tint: [0.84, 0.83, 0.8], ao: 0.2 });
  for (const s of [-1, 1]) {
    cb.m('concrete').boxRot({
      x: cx + nx * dep * 0.5 + (-nz) * s * w * 0.5, y: cy + 0.12,
      z: cz + nz * dep * 0.5 + nx * s * w * 0.5,
      w: 0.09, h: 0.9, d: dep, rot, uvScale: 1.4, tint: [0.84, 0.83, 0.8], ao: 0.3,
    });
  }
  // Life on the balcony: sheeting, a chair, stored fuel.
  const roll = rng.f();
  if (roll < 0.4) {
    cb.m('fabric').boxRot({ x: cx + nx * dep, y: cy + 1.0, z: cz + nz * dep, w: w * 0.95, h: 1.1, d: 0.03, rot, uvScale: 1.2, tint: [0.5, 0.5, 0.45], ao: 0.3 });
  } else if (roll < 0.62) {
    cb.m('paint').boxRot({ x: cx + nx * dep * 0.55, y: cy + 0.12, z: cz + nz * dep * 0.55, w: 0.5, h: 0.55, d: 0.4, rot: rot + rng.sym(0.4), uvScale: 1.6, tint: [0.5, 0.48, 0.42] });
  } else if (roll < 0.78) {
    for (let i = 0; i < 3; i++) {
      cb.m('rust').boxRot({ x: cx + nx * dep * 0.5 + (-nz) * (i - 1) * 0.34, y: cy + 0.12, z: cz + nz * dep * 0.5 + nx * (i - 1) * 0.34, w: 0.3, h: 0.42, d: 0.3, rot, uvScale: 2, tint: [0.6, 0.5, 0.42] });
    }
  }
}

/** Rooftop mechanical clutter, aerials and stored junk. */
function roofClutter(cb, b, rng, out, y, density = 1) {
  const { x, z, w, d, rot = 0 } = b;
  const c = Math.cos(rot), s = Math.sin(rot);
  const local = (ox, oz) => [x + ox * c - oz * s, z + ox * s + oz * c];

  const n = Math.max(1, Math.round((w * d) / 55 * density));
  for (let i = 0; i < n; i++) {
    const ox = rng.sym(w * 0.34), oz = rng.sym(d * 0.34);
    const [px, pz] = local(ox, oz);
    const roll = rng.f();
    if (roll < 0.34) P.acUnit(cb, px, y, pz, rot + rng.sym(0.4), rng, { w: rng.range(1.1, 1.9), d: rng.range(0.9, 1.4) });
    else if (roll < 0.5) P.crate(cb, px, y, pz, rng);
    else if (roll < 0.62) P.drum(cb, px, y, pz, rng, { tipped: rng.chance(0.4) });
    else if (roll < 0.72) P.pallet(cb, px, y, pz, rng);
    else if (roll < 0.86) {
      // Aerial mast — a good silhouette element against the smoke.
      cb.m('metal').cylinder(px, y, pz, 0.05, rng.range(1.6, 3.4), 6, 1.6, [0.44, 0.44, 0.46], false, 0.2);
      for (let k = 0; k < 4; k++) {
        cb.m('metal').boxRot({ x: px, y: y + 1.2 + k * 0.42, z: pz, w: rng.range(0.5, 1.3), h: 0.03, d: 0.03, rot: rot + rng.sym(0.5), uvScale: 3, tint: [0.44, 0.44, 0.46] });
      }
    } else {
      cb.m('rust').boxRot({ x: px, y, z: pz, w: rng.range(0.6, 1.4), h: 0.5, d: rng.range(0.5, 1.1), rot: rng.f() * TAU, uvScale: 1.4, tint: [0.6, 0.5, 0.42], ao: 0.4 });
    }
  }
  // Vent stacks along one edge.
  const stacks = Math.max(1, Math.round(w / 9));
  for (let i = 0; i < stacks; i++) {
    const [px, pz] = local((i / stacks - 0.4) * w, d * 0.36);
    cb.m('rust').cylinder(px, y, pz, 0.16, rng.range(0.7, 1.5), 8, 1.4, [0.62, 0.52, 0.44], false, 0.3);
    cb.m('dark').cylinder(px, y + 1.5, pz, 0.2, 0.1, 8, 1.6, [0.24, 0.24, 0.24], true, 0);
  }
  if (rng.chance(0.35 * density)) {
    const [px, pz] = local(rng.sym(w * 0.28), rng.sym(d * 0.28));
    P.waterTank(cb, px, y, pz, rng, { r: rng.range(1.1, 1.7), h: rng.range(2.0, 2.8), legH: rng.range(1.6, 2.4) });
  }
  // Ash drift on the deck.
  cb.m('ash').boxRot({ x, y: y + 0.005, z, w: w * 0.92, h: 0.01, d: d * 0.92, rot, uvScale: 0.35, tint: [0.68, 0.66, 0.62] });
}

export { doorway, window_, WIN };
