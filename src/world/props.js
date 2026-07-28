/**
 * Prop library.
 *
 * Density is what separates a real place from a grey-box. Every one of these
 * writes into a shared ChunkBuilder, so an alley containing forty objects still
 * costs the same handful of draw calls as an empty one.
 *
 * Material keys are resolved by the city builder; see MATKEYS for the set.
 */

import { FACE } from './geom.js';
import { clamp01, TAU } from '../core/util.js';

export const MATKEYS = [
  'concrete', 'brick', 'plaster', 'asphalt', 'rubble', 'ash', 'tile', 'wood',
  'metal', 'rust', 'corrugated', 'paint', 'fabric', 'glass', 'dark',
  'emberglow', 'lampglow', 'screenglow', 'toxicglow',
];

/** Small helpers shared by the prop functions. */
const T = {
  steel: [0.62, 0.62, 0.63],
  darksteel: [0.34, 0.34, 0.36],
  rust: [0.66, 0.5, 0.4],
  wood: [0.7, 0.6, 0.46],
  plastic: [0.55, 0.55, 0.55],
  canvas: [0.62, 0.62, 0.56],
  white: [1, 1, 1],
  dim: [0.5, 0.5, 0.5],
};

// ------------------------------------------------------------- containers --

/** 200-litre steel drum. `burning` adds a fire and marks it as a light source. */
export function drum(cb, x, y, z, rng, opts = {}) {
  const { burning = false, tipped = false, rot = rng.f() * TAU } = opts;
  const mk = rng.chance(0.55) ? 'rust' : 'metal';
  const r = 0.29, h = 0.88;
  if (tipped) {
    // Lying on its side: two end caps and a barrel body built as a squat box.
    cb.m(mk).boxRot({ x, y, z, w: 0.58, h: 0.58, d: 0.88, rot, uvScale: 1.1, tint: T.steel, ao: 0.4 });
    cb.m('dark').boxRot({ x, y: y + 0.03, z, w: 0.6, h: 0.52, d: 0.06, rot, uvScale: 1, tint: T.darksteel });
  } else {
    cb.m(mk).cylinder(x, y, z, r, h, 10, 1.0, T.steel, true, 0.42);
    // Rolling hoops.
    for (const hy of [0.26, 0.58]) {
      cb.m('dark').cylinder(x, y + hy, z, r + 0.022, 0.05, 10, 1.4, T.darksteel, false, 0.2);
    }
  }
  if (burning) {
    // The fire itself is an emissive cone plus a hot rim; particles and the
    // point light are attached by the city builder from the marker list.
    cb.m('emberglow').cylinder(x, y + h - 0.06, z, r - 0.04, 0.05, 10, 1, T.white, true, 0);
    return { light: { x, y: y + h + 0.25, z, kind: 'fire' }, fx: { x, y: y + h, z, kind: 'firebarrel' } };
  }
  return null;
}

/** Wooden crate, optionally stacked and broken. */
export function crate(cb, x, y, z, rng, opts = {}) {
  const { size = rng.range(0.5, 0.78), rot = rng.sym(0.5), broken = rng.chance(0.22) } = opts;
  const s = size;
  cb.m('wood').boxRot({ x, y, z, w: s, h: s * 0.82, d: s * 0.92, rot, uvScale: 1.6, tint: T.wood, ao: 0.42 });
  // Corner battens read as construction at a glance.
  for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    cb.m('wood').boxRot({
      x: x + ox * s * 0.46 * Math.cos(rot) - oz * s * 0.42 * Math.sin(rot),
      y: y, z: z + ox * s * 0.46 * Math.sin(rot) + oz * s * 0.42 * Math.cos(rot),
      w: 0.06, h: s * 0.82, d: 0.06, rot, uvScale: 2, tint: [0.55, 0.47, 0.36], ao: 0.4,
    });
  }
  if (broken) {
    cb.m('wood').boxRot({ x: x + rng.sym(0.3), y, z: z + rng.sym(0.3), w: 0.4, h: 0.05, d: 0.16, rot: rng.f() * TAU, uvScale: 2, tint: T.wood });
  }
}

/** Euro-style pallet. */
export function pallet(cb, x, y, z, rng, opts = {}) {
  const rot = opts.rot ?? rng.f() * TAU;
  const lean = opts.lean ?? false;
  if (lean) {
    // Leaning against something — reads as scavenged, not placed.
    const b = cb.m('wood');
    for (let i = 0; i < 5; i++) {
      b.boxRot({ x: x + (i - 2) * 0.2 * Math.cos(rot), y, z: z + (i - 2) * 0.2 * Math.sin(rot), w: 0.16, h: 1.1, d: 0.05, rot, uvScale: 2, tint: T.wood, ao: 0.4 });
    }
    return;
  }
  const b = cb.m('wood');
  for (let i = 0; i < 3; i++) {
    b.boxRot({ x, y: y + i * 0.055, z, w: 1.0, h: 0.05, d: 1.15, rot, uvScale: 1.4, tint: T.wood, ao: 0.35 });
    if (i < 2) {
      for (const oz of [-0.45, 0, 0.45]) {
        b.boxRot({ x: x - oz * Math.sin(rot), y: y + 0.055, z: z + oz * Math.cos(rot), w: 1.0, h: 0.055, d: 0.1, rot, uvScale: 1.4, tint: [0.6, 0.51, 0.4] });
      }
    }
  }
}

/** Street dumpster. */
export function dumpster(cb, x, y, z, rng, opts = {}) {
  const rot = opts.rot ?? 0;
  const w = 1.9, h = 1.15, d = 1.05;
  cb.m('paint').boxRot({ x, y: y + 0.14, z, w, h, d, rot, uvScale: 0.9, tint: [0.5, 0.55, 0.5], ao: 0.5 });
  // Sloped lid, part-open.
  cb.m('paint').boxRot({ x, y: y + 0.14 + h, z: z - 0.1, w: w * 0.98, h: 0.07, d: d * 0.62, rot, uvScale: 0.9, tint: [0.44, 0.49, 0.44] });
  if (rng.chance(0.5)) {
    cb.m('paint').boxRot({ x: x + 0.15, y: y + 0.14 + h + 0.24, z: z + 0.34, w: w * 0.9, h: 0.06, d: d * 0.5, rot: rot + 0.22, uvScale: 0.9, tint: [0.4, 0.45, 0.4] });
  }
  // Castors.
  for (const [ox, oz] of [[-0.78, -0.4], [0.78, -0.4], [-0.78, 0.4], [0.78, 0.4]]) {
    cb.m('dark').boxRot({
      x: x + ox * Math.cos(rot) - oz * Math.sin(rot), y, z: z + ox * Math.sin(rot) + oz * Math.cos(rot),
      w: 0.14, h: 0.16, d: 0.09, rot, uvScale: 2, tint: T.darksteel,
    });
  }
}

/** Locker / filing cabinet / shelving unit for interiors. */
export function locker(cb, x, y, z, rng, opts = {}) {
  const { rot = 0, h = 1.85, w = 0.9, open = rng.chance(0.4), fallen = false } = opts;
  if (fallen) {
    cb.m('paint').boxRot({ x, y, z, w, h: 0.42, d: h, rot, uvScale: 1.1, tint: [0.5, 0.52, 0.5], ao: 0.5 });
    return;
  }
  cb.m('paint').boxRot({ x, y, z, w, h, d: 0.46, rot, uvScale: 1.1, tint: [0.5, 0.52, 0.5], ao: 0.55 });
  const doors = Math.max(1, Math.round(w / 0.45));
  for (let i = 0; i < doors; i++) {
    const ox = (i - (doors - 1) / 2) * (w / doors);
    const swing = open && i === 0 ? 0.9 : 0;
    cb.m('paint').boxRot({
      x: x + ox * Math.cos(rot) - (0.24 + swing * 0.16) * Math.sin(rot),
      y: y + 0.05,
      z: z + ox * Math.sin(rot) + (0.24 + swing * 0.16) * Math.cos(rot),
      w: (w / doors) * 0.92, h: h - 0.1, d: 0.03, rot: rot + swing,
      uvScale: 1.2, tint: [0.44, 0.46, 0.45], ao: 0.4,
    });
  }
}

// ------------------------------------------------------------- structural --

/**
 * Fire escape: the single most important prop in Hollis. It is the safe route
 * above the smoke, so it needs to be legible from the street and climbable.
 */
export function fireEscape(cb, x, y, z, rot, floors, rng, opts = {}) {
  const { width = 1.5, floorH = 3.4, side = 1 } = opts;
  const b = cb.m('rust');
  const dark = cb.m('dark');
  const nodes = [];

  for (let f = 0; f < floors; f++) {
    const py = y + f * floorH;
    // Platform
    b.boxRot({ x, y: py, z, w: width, h: 0.07, d: 1.15, rot, uvScale: 1.4, tint: T.rust, ao: 0.3 });
    // Railings — three bars, not a solid panel; you should see through them.
    for (const hh of [0.42, 0.86]) {
      b.boxRot({ x, y: py + hh, z: z + side * 0.54 * Math.cos(rot), w: width, h: 0.045, d: 0.045, rot, uvScale: 2, tint: T.rust });
      b.boxRot({
        x: x - width * 0.48 * Math.cos(rot), y: py + hh, z: z - width * 0.48 * Math.sin(rot),
        w: 0.045, h: 0.045, d: 1.1, rot, uvScale: 2, tint: T.rust,
      });
      b.boxRot({
        x: x + width * 0.48 * Math.cos(rot), y: py + hh, z: z + width * 0.48 * Math.sin(rot),
        w: 0.045, h: 0.045, d: 1.1, rot, uvScale: 2, tint: T.rust,
      });
    }
    for (let i = 0; i <= 3; i++) {
      const ox = (i / 3 - 0.5) * width;
      b.boxRot({
        x: x + ox * Math.cos(rot) - side * 0.54 * Math.sin(rot),
        y: py, z: z + ox * Math.sin(rot) + side * 0.54 * Math.cos(rot),
        w: 0.045, h: 0.95, d: 0.045, rot, uvScale: 2, tint: T.rust,
      });
    }
    // Wall brackets
    for (const ox of [-width * 0.4, width * 0.4]) {
      dark.boxRot({
        x: x + ox * Math.cos(rot) + 0.5 * Math.sin(rot) * side,
        y: py - 0.42, z: z + ox * Math.sin(rot) - 0.5 * Math.cos(rot) * side,
        w: 0.07, h: 0.5, d: 0.07, rot: rot + 0.5, uvScale: 2, tint: T.darksteel,
      });
    }

    // Stair flight up to the next platform, alternating direction.
    if (f < floors - 1) {
      const dir = f % 2 === 0 ? 1 : -1;
      const steps = 9;
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps;
        const ox = dir * (t - 0.5) * width * 0.92;
        b.boxRot({
          x: x + ox * Math.cos(rot) - side * (0.1 + t * 0.42) * Math.sin(rot),
          y: py + 0.07 + t * (floorH - 0.07),
          z: z + ox * Math.sin(rot) + side * (0.1 + t * 0.42) * Math.cos(rot),
          w: width / steps * 1.05, h: 0.05, d: 0.5, rot, uvScale: 2, tint: T.rust,
        });
      }
      // Stringer
      b.boxRot({
        x: x - side * 0.32 * Math.sin(rot), y: py + 0.07,
        z: z + side * 0.32 * Math.cos(rot),
        w: width, h: floorH, d: 0.05, rot, uvScale: 1, tint: T.rust,
      });
    }
    nodes.push({ x, y: py + 0.07, z: z + side * 0.2 * Math.cos(rot), floor: f });
  }

  // Drop ladder at the bottom — the classic counterweighted kind, deployed.
  const rungs = Math.floor(y / 0.32);
  for (let i = 0; i < rungs; i++) {
    b.boxRot({ x, y: i * 0.32, z: z + side * 0.5 * Math.cos(rot), w: 0.44, h: 0.04, d: 0.04, rot, uvScale: 2, tint: T.rust });
  }
  for (const ox of [-0.24, 0.24]) {
    b.boxRot({
      x: x + ox * Math.cos(rot), y: 0, z: z + ox * Math.sin(rot) + side * 0.5 * Math.cos(rot),
      w: 0.05, h: y, d: 0.05, rot, uvScale: 1, tint: T.rust,
    });
  }
  return nodes;
}

/** Fixed vertical ladder (caged or bare). */
export function ladder(cb, x, y, z, rot, h, rng, opts = {}) {
  const b = cb.m('rust');
  const caged = opts.caged ?? h > 4;
  for (const ox of [-0.22, 0.22]) {
    b.boxRot({ x: x + ox * Math.cos(rot), y, z: z + ox * Math.sin(rot), w: 0.05, h, d: 0.05, rot, uvScale: 1, tint: T.rust, ao: 0.3 });
  }
  for (let i = 0; i * 0.31 < h; i++) {
    b.boxRot({ x, y: y + i * 0.31, z, w: 0.44, h: 0.035, d: 0.035, rot, uvScale: 2, tint: T.rust });
  }
  if (caged) {
    for (let i = 0; i * 0.62 < h - 2.2; i++) {
      const py = y + 2.2 + i * 0.62;
      for (let k = 0; k < 7; k++) {
        const t = (k / 6) * Math.PI;
        const cx = Math.cos(t) * 0.4, cz = -Math.sin(t) * 0.42;
        b.boxRot({
          x: x + cx * Math.cos(rot) - cz * Math.sin(rot), y: py,
          z: z + cx * Math.sin(rot) + cz * Math.cos(rot),
          w: 0.05, h: 0.05, d: 0.05, rot, uvScale: 3, tint: T.rust,
        });
      }
    }
  }
}

/** Scaffolding tower / walkway — a manufactured route across the smoke. */
export function scaffold(cb, x, y, z, rot, w, d, levels, rng) {
  const b = cb.m('metal');
  const boards = cb.m('wood');
  const lh = 2.0;
  for (const [ox, oz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) {
    b.boxRot({
      x: x + ox * Math.cos(rot) - oz * Math.sin(rot), y,
      z: z + ox * Math.sin(rot) + oz * Math.cos(rot),
      w: 0.09, h: levels * lh, d: 0.09, rot, uvScale: 1, tint: T.steel, ao: 0.3,
    });
  }
  for (let l = 1; l <= levels; l++) {
    const py = y + l * lh;
    // Deck boards
    const n = Math.max(2, Math.round(d / 0.34));
    for (let i = 0; i < n; i++) {
      const oz = (i / (n - 1) - 0.5) * d * 0.94;
      boards.boxRot({
        x: x - oz * Math.sin(rot), y: py, z: z + oz * Math.cos(rot),
        w, h: 0.05, d: d / n * 0.9, rot, uvScale: 1.4, tint: [0.62, 0.55, 0.44], ao: 0.3,
      });
    }
    // Ledgers + guard rail
    for (const hh of [0, 1.0]) {
      for (const oz of [-d / 2, d / 2]) {
        b.boxRot({ x: x - oz * Math.sin(rot), y: py + hh, z: z + oz * Math.cos(rot), w, h: 0.06, d: 0.06, rot, uvScale: 2, tint: T.steel });
      }
      for (const ox of [-w / 2, w / 2]) {
        b.boxRot({ x: x + ox * Math.cos(rot), y: py + hh, z: z + ox * Math.sin(rot), w: 0.06, h: 0.06, d, rot, uvScale: 2, tint: T.steel });
      }
    }
    // Diagonal brace — the detail that makes scaffolding read as scaffolding.
    b.boxRot({ x: x - (d / 2) * Math.sin(rot), y: py - lh, z: z + (d / 2) * Math.cos(rot), w: 0.055, h: Math.hypot(w, lh), d: 0.055, rot, uvScale: 2, tint: T.steel, rz: 0 });
  }
}

/** Chain-link fence run, with optional gap the player can slip through. */
export function fence(cb, x0, z0, x1, z1, h, rng, opts = {}) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const rot = Math.atan2(dz, dx);
  const posts = Math.max(2, Math.round(len / 2.4));
  const b = cb.m('metal');
  for (let i = 0; i <= posts; i++) {
    const t = i / posts;
    b.cylinder(x0 + dx * t, 0, z0 + dz * t, 0.045, h, 6, 1, T.steel, false, 0.3);
  }
  for (const hh of [h - 0.06, h * 0.5]) {
    b.boxRot({ x: (x0 + x1) / 2, y: hh, z: (z0 + z1) / 2, w: len, h: 0.05, d: 0.05, rot: -rot, uvScale: 1.5, tint: T.steel });
  }
  // The mesh itself is a single alpha-free "dark" plane with heavy vertex
  // darkening — at these distances a real alpha-tested mesh is not worth the
  // overdraw, and this reads correctly against the fog.
  if (!opts.noMesh) {
    cb.m('metal').boxRot({
      x: (x0 + x1) / 2, y: 0.05, z: (z0 + z1) / 2,
      w: len, h: h - 0.1, d: 0.02, rot: -rot, uvScale: 2.2, tint: [0.3, 0.3, 0.31], ao: 0.45,
    });
  }
}

/** Jersey barrier / concrete block. */
export function barrier(cb, x, y, z, rot, rng, opts = {}) {
  const len = opts.len ?? 2.0;
  cb.m('concrete').boxRot({ x, y, z, w: len, h: 0.24, d: 0.62, rot, uvScale: 0.9, tint: [0.78, 0.76, 0.72], ao: 0.4 });
  cb.m('concrete').boxRot({ x, y: y + 0.24, z, w: len, h: 0.58, d: 0.34, rot, uvScale: 0.9, tint: [0.8, 0.78, 0.74], ao: 0.2 });
  cb.m('concrete').boxRot({ x, y: y + 0.82, z, w: len, h: 0.12, d: 0.24, rot, uvScale: 0.9, tint: [0.82, 0.8, 0.76] });
}

/** Improvised barricade: the holdouts' work. Reads as hand-built. */
export function barricade(cb, x, z, rot, len, rng) {
  const n = Math.max(3, Math.round(len / 0.7));
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1) - 0.5) * len;
    const px = x + t * Math.cos(rot), pz = z + t * Math.sin(rot);
    const kind = rng.f();
    if (kind < 0.34) {
      // Sandbag stack
      const rows = rng.int(3, 5);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < 2; c++) {
          cb.m('fabric').boxRot({
            x: px + rng.sym(0.05), y: r * 0.19,
            z: pz + (c - 0.5) * 0.28 + rng.sym(0.04),
            w: 0.62, h: 0.19, d: 0.3, rot: rot + rng.sym(0.2),
            uvScale: 1.6, tint: [0.58, 0.55, 0.46], ao: 0.5,
          });
        }
      }
    } else if (kind < 0.66) {
      cb.m('corrugated').boxRot({ x: px, y: 0, z: pz, w: 0.8, h: rng.range(1.1, 1.6), d: 0.06, rot: rot + rng.sym(0.12), uvScale: 1.1, tint: [0.6, 0.6, 0.58], ao: 0.45 });
      cb.m('wood').boxRot({ x: px, y: 0, z: pz - 0.2, w: 0.09, h: 1.3, d: 0.09, rot: rot + 0.4, uvScale: 2, tint: T.wood });
    } else {
      const rows = rng.int(2, 4);
      for (let r = 0; r < rows; r++) {
        cb.m('wood').boxRot({ x: px, y: r * 0.16 + 0.02, z: pz, w: 0.75, h: 0.14, d: 0.32, rot: rot + rng.sym(0.14), uvScale: 1.6, tint: T.wood, ao: 0.45 });
      }
    }
  }
}

/** Rubble mound — collapsed masonry, walkable if low enough. */
export function rubblePile(cb, x, z, radius, height, rng) {
  const b = cb.m('rubble');
  const steps = 4;
  for (let s = 0; s < steps; s++) {
    const t = s / steps;
    const r = radius * (1 - t * 0.72);
    const pts = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const rr = r * (0.72 + rng.f() * 0.5);
      pts.push([x + Math.cos(a) * rr, z + Math.sin(a) * rr]);
    }
    b.prism(pts, 0, height * (t + 1 / steps), 0.6, [0.72 + t * 0.2, 0.7 + t * 0.2, 0.66 + t * 0.2], true, 0.5);
  }
  // Protruding slabs and rebar catch the light and break the silhouette.
  for (let i = 0; i < Math.round(radius * 2.2); i++) {
    const a = rng.f() * TAU, d = rng.f() * radius * 0.85;
    cb.m('concrete').boxRot({
      x: x + Math.cos(a) * d, y: rng.range(0.05, height * 0.7), z: z + Math.sin(a) * d,
      w: rng.range(0.5, 1.5), h: 0.13, d: rng.range(0.35, 0.9),
      rot: rng.f() * TAU, uvScale: 0.8, tint: [0.74, 0.72, 0.68], ao: 0.3,
    });
  }
  for (let i = 0; i < Math.round(radius); i++) {
    const a = rng.f() * TAU, d = rng.f() * radius * 0.7;
    cb.m('rust').boxRot({
      x: x + Math.cos(a) * d, y: height * 0.4, z: z + Math.sin(a) * d,
      w: 0.04, h: rng.range(0.5, 1.4), d: 0.04, rot: rng.f() * TAU, uvScale: 3, tint: T.rust,
    });
  }
}

// ---------------------------------------------------------------- vehicles --

/** Abandoned car. Burnt-out variants are common near the vents. */
export function car(cb, x, y, z, rot, rng, opts = {}) {
  const burnt = opts.burnt ?? rng.chance(0.35);
  const body = burnt ? 'rust' : 'paint';
  const tint = burnt ? [0.32, 0.3, 0.29] : [
    [0.42, 0.44, 0.48], [0.5, 0.46, 0.42], [0.34, 0.38, 0.4], [0.52, 0.5, 0.46], [0.4, 0.34, 0.32],
  ][rng.int(0, 4)];
  const L = 4.2, W = 1.78;
  // Lower body
  cb.m(body).boxRot({ x, y: y + 0.34, z, w: L, h: 0.62, d: W, rot, uvScale: 0.8, tint, ao: 0.5 });
  // Cabin, set back and narrower
  cb.m(body).boxRot({ x: x - 0.2 * Math.cos(rot), y: y + 0.96, z: z - 0.2 * Math.sin(rot), w: L * 0.5, h: 0.56, d: W * 0.88, rot, uvScale: 0.8, tint, ao: 0.15 });
  // Bonnet/boot lips
  cb.m(body).boxRot({ x: x + L * 0.34 * Math.cos(rot), y: y + 0.94, z: z + L * 0.34 * Math.sin(rot), w: L * 0.26, h: 0.05, d: W * 0.9, rot, uvScale: 0.8, tint });
  // Glass (or empty frames if burnt)
  if (!burnt) {
    cb.m('glass').boxRot({ x: x - 0.2 * Math.cos(rot), y: y + 0.98, z: z - 0.2 * Math.sin(rot), w: L * 0.48, h: 0.5, d: W * 0.9, rot, uvScale: 1.2, tint: [0.5, 0.55, 0.58] });
  }
  // Wheels
  for (const [ox, oz] of [[1.32, 0.86], [1.32, -0.86], [-1.36, 0.86], [-1.36, -0.86]]) {
    const flat = rng.chance(0.4);
    cb.m('dark').boxRot({
      x: x + ox * Math.cos(rot) - oz * Math.sin(rot), y: y + (flat ? 0.02 : 0.06),
      z: z + ox * Math.sin(rot) + oz * Math.cos(rot),
      w: 0.62, h: flat ? 0.34 : 0.56, d: 0.24, rot, uvScale: 1.6, tint: [0.22, 0.22, 0.23], ao: 0.5,
    });
  }
  if (burnt) {
    cb.m('dark').boxRot({ x, y: y + 1.5, z, w: L * 0.5, h: 0.04, d: W * 0.85, rot, uvScale: 1, tint: [0.16, 0.15, 0.14] });
  }
  // Ash and dust on horizontal surfaces
  cb.m('ash').boxRot({ x, y: y + 1.52, z, w: L * 0.52, h: 0.012, d: W * 0.8, rot, uvScale: 1.4, tint: [0.7, 0.68, 0.64] });
}

/** Wrecked delivery van / box truck. Larger landmark-scale vehicle. */
export function van(cb, x, y, z, rot, rng, opts = {}) {
  const tint = [0.46, 0.44, 0.4];
  cb.m('paint').boxRot({ x: x + 1.7 * Math.cos(rot), y: y + 0.42, z: z + 1.7 * Math.sin(rot), w: 2.0, h: 1.3, d: 2.0, rot, uvScale: 0.7, tint, ao: 0.5 });
  cb.m('corrugated').boxRot({ x: x - 1.3 * Math.cos(rot), y: y + 0.5, z: z - 1.3 * Math.sin(rot), w: 4.0, h: 2.3, d: 2.24, rot, uvScale: 0.55, tint: [0.6, 0.6, 0.58], ao: 0.4 });
  for (const [ox, oz] of [[2.2, 1.0], [2.2, -1.0], [-1.6, 1.0], [-1.6, -1.0], [-2.9, 1.0], [-2.9, -1.0]]) {
    cb.m('dark').boxRot({
      x: x + ox * Math.cos(rot) - oz * Math.sin(rot), y, z: z + ox * Math.sin(rot) + oz * Math.cos(rot),
      w: 0.74, h: 0.7, d: 0.28, rot, uvScale: 1.6, tint: [0.2, 0.2, 0.21], ao: 0.5,
    });
  }
}

/** Shopping trolley — small, cheap, and reads instantly as a scavenger's life. */
export function trolley(cb, x, y, z, rng) {
  const rot = rng.f() * TAU;
  const b = cb.m('metal');
  b.boxRot({ x, y: y + 0.42, z, w: 0.62, h: 0.5, d: 0.94, rot, uvScale: 2.2, tint: [0.55, 0.56, 0.57], ao: 0.4 });
  b.boxRot({ x, y: y + 0.36, z, w: 0.6, h: 0.05, d: 0.9, rot, uvScale: 2, tint: [0.5, 0.5, 0.52] });
  for (const [ox, oz] of [[-0.26, -0.4], [0.26, -0.4], [-0.26, 0.4], [0.26, 0.4]]) {
    b.boxRot({ x: x + ox * Math.cos(rot) - oz * Math.sin(rot), y, z: z + ox * Math.sin(rot) + oz * Math.cos(rot), w: 0.05, h: 0.36, d: 0.05, rot, uvScale: 3, tint: [0.5, 0.5, 0.52] });
  }
}

// ------------------------------------------------------------- street kit --

/** Street lamp. Returns a light marker if it still works. */
export function streetLamp(cb, x, z, rng, opts = {}) {
  const h = opts.h ?? 6.2;
  const lit = opts.lit ?? rng.chance(0.34);
  const rot = opts.rot ?? 0;
  cb.m('metal').cylinder(x, 0, z, 0.11, h, 8, 1, [0.4, 0.4, 0.42], false, 0.35);
  cb.m('metal').boxRot({ x: x + 0.62 * Math.cos(rot), y: h - 0.12, z: z + 0.62 * Math.sin(rot), w: 1.35, h: 0.11, d: 0.11, rot, uvScale: 1.6, tint: [0.4, 0.4, 0.42] });
  const hx = x + 1.24 * Math.cos(rot), hz = z + 1.24 * Math.sin(rot);
  cb.m('dark').boxRot({ x: hx, y: h - 0.32, z: hz, w: 0.56, h: 0.2, d: 0.3, rot, uvScale: 1.6, tint: [0.3, 0.3, 0.31] });
  if (lit) {
    cb.m('lampglow').boxRot({ x: hx, y: h - 0.35, z: hz, w: 0.44, h: 0.035, d: 0.22, rot, uvScale: 1, tint: T.white });
    return { light: { x: hx, y: h - 0.4, z: hz, kind: 'sodium' } };
  }
  // Dead lamps get a shattered lens; the contrast between lit and dead lamps
  // is how the player learns which blocks still have power.
  cb.m('dark').boxRot({ x: hx, y: h - 0.35, z: hz, w: 0.4, h: 0.03, d: 0.2, rot, uvScale: 1, tint: [0.14, 0.14, 0.15] });
  return null;
}

/** Work light on a tripod — the Authority's kit, and a strong wayfinding cue. */
export function workLight(cb, x, y, z, rng, opts = {}) {
  const rot = opts.rot ?? rng.f() * TAU;
  const h = 1.9;
  const b = cb.m('paint');
  for (let i = 0; i < 3; i++) {
    const a = rot + (i / 3) * TAU;
    b.boxRot({ x: x + Math.cos(a) * 0.34, y, z: z + Math.sin(a) * 0.34, w: 0.05, h, d: 0.05, rot: a, uvScale: 2, tint: [0.6, 0.52, 0.2] });
  }
  b.boxRot({ x, y: y + h, z, w: 0.5, h: 0.26, d: 0.2, rot, uvScale: 1.4, tint: [0.62, 0.54, 0.2], ao: 0.2 });
  cb.m('lampglow').boxRot({ x: x + 0.1 * Math.cos(rot), y: y + h + 0.04, z: z + 0.1 * Math.sin(rot), w: 0.4, h: 0.18, d: 0.02, rot, uvScale: 1, tint: T.white });
  return { light: { x, y: y + h + 0.1, z, kind: 'work', rot } };
}

/** Traffic cone. */
export function cone(cb, x, y, z, rng) {
  cb.m('paint').boxRot({ x, y, z, w: 0.34, h: 0.04, d: 0.34, rot: rng.f() * TAU, uvScale: 2, tint: [0.7, 0.36, 0.16] });
  cb.m('paint').cylinder(x, y + 0.04, z, 0.1, 0.5, 6, 2, [0.72, 0.38, 0.16], true, 0.2);
  cb.m('fabric').cylinder(x, y + 0.3, z, 0.105, 0.09, 6, 2, [0.8, 0.78, 0.74], false, 0);
}

/** Bench / bus shelter seating. */
export function bench(cb, x, y, z, rot, rng) {
  cb.m('wood').boxRot({ x, y: y + 0.42, z, w: 1.7, h: 0.07, d: 0.44, rot, uvScale: 1.4, tint: T.wood, ao: 0.3 });
  cb.m('wood').boxRot({ x: x - 0.2 * Math.sin(rot), y: y + 0.49, z: z + 0.2 * Math.cos(rot), w: 1.7, h: 0.4, d: 0.06, rot, uvScale: 1.4, tint: [0.62, 0.53, 0.4] });
  for (const ox of [-0.72, 0.72]) {
    cb.m('dark').boxRot({ x: x + ox * Math.cos(rot), y, z: z + ox * Math.sin(rot), w: 0.08, h: 0.42, d: 0.4, rot, uvScale: 2, tint: T.darksteel });
  }
}

/** Bin, tipped or upright. */
export function bin(cb, x, y, z, rng) {
  const tipped = rng.chance(0.4);
  const rot = rng.f() * TAU;
  if (tipped) {
    cb.m('metal').boxRot({ x, y, z, w: 0.56, h: 0.5, d: 0.8, rot, uvScale: 1.6, tint: [0.44, 0.44, 0.44], ao: 0.45 });
    for (let i = 0; i < 5; i++) {
      cb.m('fabric').boxRot({ x: x + rng.sym(0.7), y, z: z + rng.sym(0.7), w: rng.range(0.14, 0.3), h: rng.range(0.08, 0.2), d: rng.range(0.14, 0.3), rot: rng.f() * TAU, uvScale: 3, tint: [0.4, 0.4, 0.37] });
    }
  } else {
    cb.m('metal').cylinder(x, y, z, 0.3, 0.86, 8, 1.4, [0.44, 0.44, 0.44], true, 0.4);
  }
}

// --------------------------------------------------------------- services --

/** Rooftop air-handling unit. */
export function acUnit(cb, x, y, z, rot, rng, opts = {}) {
  const w = opts.w ?? 1.5, d = opts.d ?? 1.1, h = opts.h ?? 0.9;
  cb.m('metal').boxRot({ x, y, z, w, h, d, rot, uvScale: 0.9, tint: [0.55, 0.56, 0.55], ao: 0.4 });
  cb.m('dark').boxRot({ x, y: y + h, z, w: w * 0.62, h: 0.09, d: d * 0.62, rot, uvScale: 1.4, tint: [0.3, 0.3, 0.3] });
  cb.m('metal').cylinder(x, y + h + 0.09, z, Math.min(w, d) * 0.28, 0.06, 8, 1.5, [0.4, 0.4, 0.4], true, 0);
  // Ash settles on everything horizontal — a running motif.
  cb.m('ash').boxRot({ x, y: y + h + 0.002, z, w: w * 0.98, h: 0.008, d: d * 0.98, rot, uvScale: 1.2, tint: [0.72, 0.7, 0.66] });
}

/** Roof water tank on a steel frame. Reads as a landmark from street level. */
export function waterTank(cb, x, y, z, rng, opts = {}) {
  const legs = opts.legH ?? 2.2, r = opts.r ?? 1.5, h = opts.h ?? 2.6;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.78;
    cb.m('rust').boxRot({ x: x + Math.cos(a) * r * 0.72, y, z: z + Math.sin(a) * r * 0.72, w: 0.13, h: legs, d: 0.13, rot: a, uvScale: 1.4, tint: T.rust, ao: 0.4 });
  }
  cb.m('corrugated').cylinder(x, y + legs, z, r, h, 12, 0.7, [0.68, 0.66, 0.62], true, 0.35);
  cb.m('rust').cylinder(x, y + legs + h, z, r * 1.04, 0.12, 12, 1.2, T.rust, true, 0);
  cb.m('rust').cylinder(x, y + legs - 0.6, z, 0.09, 0.6, 6, 2, T.rust, false, 0);
}

/** Exposed pipe run along a wall or across a roof. */
export function pipeRun(cb, x0, y0, z0, x1, y1, z1, r, rng, opts = {}) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  const key = opts.key ?? (rng.chance(0.5) ? 'rust' : 'metal');
  const b = cb.m(key);
  // Approximate with short segments; cheap and reads correctly.
  const segs = Math.max(1, Math.round(len / 1.6));
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const ax = x0 + dx * t0, ay = y0 + dy * t0, az = z0 + dz * t0;
    const bx = x0 + dx * t1, by = y0 + dy * t1, bz = z0 + dz * t1;
    const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
    const l = Math.hypot(bx - ax, by - ay, bz - az);
    const horiz = Math.abs(by - ay) < Math.abs(l) * 0.5;
    if (horiz) {
      const rot = Math.atan2(bz - az, bx - ax);
      b.boxRot({ x: mx, y: my - r, z: mz, w: l + r, h: r * 2, d: r * 2, rot: -rot, uvScale: 1.6, tint: T.steel, ao: 0.35 });
    } else {
      b.cylinder(mx, Math.min(ay, by), mz, r, l, 6, 1.6, T.steel, false, 0.3);
    }
  }
  // Flanges and brackets at intervals.
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    cb.m('dark').cylinder(x0 + dx * t, y0 + dy * t - r * 1.2, z0 + dz * t, r * 1.35, r * 0.5, 6, 2, T.darksteel, false, 0);
  }
}

/**
 * A borehole vent head. These are the Authority's monitoring points, and where
 * the burn breathes. The most important environmental prop in the game.
 */
export function ventHead(cb, x, y, z, rng, opts = {}) {
  const hot = opts.hot ?? true;
  const h = opts.h ?? 1.1;
  cb.m('concrete').cylinder(x, y, z, 0.62, 0.22, 10, 1, [0.76, 0.74, 0.7], true, 0.4);
  cb.m('rust').cylinder(x, y + 0.22, z, 0.32, h, 10, 1.2, T.rust, false, 0.3);
  cb.m('dark').cylinder(x, y + 0.22 + h, z, 0.38, 0.1, 10, 1.4, T.darksteel, true, 0);
  // Grating across the mouth, glowing if the vent is active.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    cb.m('dark').boxRot({ x, y: y + 0.24 + h, z, w: 0.62, h: 0.03, d: 0.05, rot: a, uvScale: 2, tint: [0.2, 0.2, 0.2] });
  }
  if (hot) {
    cb.m('emberglow').cylinder(x, y + 0.2 + h, z, 0.29, 0.03, 10, 1, T.white, true, 0);
    return { light: { x, y: y + h + 0.4, z, kind: 'vent' }, fx: { x, y: y + h + 0.32, z, kind: 'vent' } };
  }
  return null;
}

/** Portable generator — power, noise, and a reason for people to gather. */
export function generator(cb, x, y, z, rot, rng) {
  cb.m('paint').boxRot({ x, y: y + 0.12, z, w: 1.2, h: 0.66, d: 0.7, rot, uvScale: 1.1, tint: [0.6, 0.52, 0.2], ao: 0.45 });
  cb.m('dark').boxRot({ x, y: y + 0.78, z, w: 1.1, h: 0.1, d: 0.6, rot, uvScale: 1.4, tint: [0.28, 0.28, 0.28] });
  cb.m('rust').cylinder(x + 0.42 * Math.cos(rot), y + 0.88, z + 0.42 * Math.sin(rot), 0.07, 0.5, 6, 2, T.rust, false, 0);
  for (const [ox, oz] of [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]]) {
    cb.m('dark').boxRot({ x: x + ox * Math.cos(rot) - oz * Math.sin(rot), y, z: z + ox * Math.sin(rot) + oz * Math.cos(rot), w: 0.1, h: 0.12, d: 0.1, rot, uvScale: 2, tint: T.darksteel });
  }
}

// ---------------------------------------------------------------- shelter --

/** Tarpaulin lean-to / tent. The holdouts live under these. */
export function tarpShelter(cb, x, y, z, rot, rng, opts = {}) {
  const w = opts.w ?? 2.4, d = opts.d ?? 2.0, h = opts.h ?? 1.7;
  // Frame
  for (const [ox, oz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
    cb.m('wood').boxRot({
      x: x + ox * Math.cos(rot) - oz * Math.sin(rot), y,
      z: z + ox * Math.sin(rot) + oz * Math.cos(rot),
      w: 0.07, h: oz < 0 ? h : h * 0.62, d: 0.07, rot, uvScale: 2, tint: T.wood, ao: 0.4,
    });
  }
  // Sloped tarp roof
  const c = Math.cos(rot), s = Math.sin(rot);
  const p = (ox, oy, oz) => [x + ox * c - oz * s, y + oy, z + ox * s + oz * c];
  cb.m('fabric').face4(
    p(-w / 2 - 0.15, h, -d / 2 - 0.15), p(w / 2 + 0.15, h, -d / 2 - 0.15),
    p(w / 2 + 0.15, h * 0.62, d / 2 + 0.15), p(-w / 2 - 0.15, h * 0.62, d / 2 + 0.15),
    [[0, 0], [w * 0.6, 0], [w * 0.6, d * 0.6], [0, d * 0.6]], T.canvas
  );
  // Back and one side wall
  cb.m('fabric').boxRot({ x: x + (d / 2) * s, y, z: z - (d / 2) * c, w, h: h * 0.95, d: 0.03, rot: rot + Math.PI / 2, uvScale: 1.2, tint: [0.55, 0.55, 0.5], ao: 0.5 });
  if (rng.chance(0.6)) {
    cb.m('fabric').boxRot({ x: x - (w / 2) * c, y, z: z - (w / 2) * s, w: d, h: h * 0.8, d: 0.03, rot, uvScale: 1.2, tint: [0.52, 0.52, 0.48], ao: 0.5 });
  }
  // Bedding inside
  cb.m('fabric').boxRot({ x, y, z, w: 1.7, h: 0.16, d: 0.72, rot: rot + rng.sym(0.3), uvScale: 1.6, tint: [0.46, 0.42, 0.4], ao: 0.5 });
}

/** Mattress on the floor / bed frame. */
export function mattress(cb, x, y, z, rot, rng) {
  cb.m('fabric').boxRot({ x, y, z, w: 1.9, h: 0.2, d: 0.86, rot, uvScale: 1.2, tint: [0.6, 0.57, 0.52], ao: 0.45 });
  if (rng.chance(0.5)) {
    cb.m('fabric').boxRot({ x: x - 0.6 * Math.cos(rot), y: y + 0.2, z: z - 0.6 * Math.sin(rot), w: 0.5, h: 0.11, d: 0.36, rot: rot + rng.sym(0.4), uvScale: 2, tint: [0.66, 0.63, 0.58] });
  }
  if (rng.chance(0.4)) {
    cb.m('fabric').boxRot({ x: x + rng.sym(0.4), y: y + 0.2, z, w: 1.5, h: 0.08, d: 0.9, rot: rot + rng.sym(0.25), uvScale: 1.2, tint: [0.4, 0.42, 0.4] });
  }
}

/** Washing line strung between two points — signals people still live here. */
export function washingLine(cb, x0, y0, z0, x1, y1, z1, rng) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const rot = Math.atan2(dz, dx);
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const t = (i + 0.5) / segs;
    // Catenary sag.
    const sag = Math.sin(t * Math.PI) * len * 0.05;
    cb.m('dark').boxRot({
      x: x0 + dx * t, y: y0 + dy * t - sag, z: z0 + dz * t,
      w: len / segs * 1.15, h: 0.02, d: 0.02, rot: -rot, uvScale: 4, tint: [0.3, 0.29, 0.27],
    });
    if (rng.chance(0.55)) {
      const cw = rng.range(0.3, 0.6);
      cb.m('fabric').boxRot({
        x: x0 + dx * t, y: y0 + dy * t - sag - cw, z: z0 + dz * t,
        w: rng.range(0.3, 0.55), h: cw, d: 0.02, rot: -rot,
        uvScale: 1.6, tint: [rng.range(0.4, 0.7), rng.range(0.4, 0.65), rng.range(0.38, 0.6)],
      });
    }
  }
}

/** Table + chairs, for interiors and street kitchens. */
export function table(cb, x, y, z, rot, rng, opts = {}) {
  const w = opts.w ?? 1.4, d = opts.d ?? 0.8, h = opts.h ?? 0.74;
  cb.m('wood').boxRot({ x, y: y + h, z, w, h: 0.05, d, rot, uvScale: 1.2, tint: T.wood, ao: 0.2 });
  for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    cb.m('wood').boxRot({
      x: x + ox * (w / 2 - 0.08) * Math.cos(rot) - oz * (d / 2 - 0.08) * Math.sin(rot), y,
      z: z + ox * (w / 2 - 0.08) * Math.sin(rot) + oz * (d / 2 - 0.08) * Math.cos(rot),
      w: 0.06, h, d: 0.06, rot, uvScale: 2, tint: [0.6, 0.5, 0.38], ao: 0.4,
    });
  }
}

export function chair(cb, x, y, z, rot, rng, opts = {}) {
  const fallen = opts.fallen ?? false;
  if (fallen) {
    cb.m('wood').boxRot({ x, y, z, w: 0.44, h: 0.44, d: 0.5, rot, uvScale: 1.6, tint: T.wood, ao: 0.45 });
    return;
  }
  cb.m('wood').boxRot({ x, y: y + 0.44, z, w: 0.44, h: 0.04, d: 0.44, rot, uvScale: 1.8, tint: T.wood, ao: 0.25 });
  cb.m('wood').boxRot({ x: x - 0.2 * Math.sin(rot), y: y + 0.48, z: z + 0.2 * Math.cos(rot), w: 0.42, h: 0.46, d: 0.04, rot, uvScale: 1.8, tint: T.wood });
  for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    cb.m('wood').boxRot({
      x: x + ox * 0.18 * Math.cos(rot) - oz * 0.18 * Math.sin(rot), y,
      z: z + ox * 0.18 * Math.sin(rot) + oz * 0.18 * Math.cos(rot),
      w: 0.04, h: 0.44, d: 0.04, rot, uvScale: 2.4, tint: [0.58, 0.48, 0.36], ao: 0.4,
    });
  }
}

/** Shelving unit with scattered contents. */
export function shelf(cb, x, y, z, rot, rng, opts = {}) {
  const w = opts.w ?? 1.6, h = opts.h ?? 1.9, d = opts.d ?? 0.42;
  cb.m('metal').boxRot({ x: x - (w / 2) * Math.cos(rot), y, z: z - (w / 2) * Math.sin(rot), w: 0.06, h, d, rot, uvScale: 1.6, tint: T.steel, ao: 0.5 });
  cb.m('metal').boxRot({ x: x + (w / 2) * Math.cos(rot), y, z: z + (w / 2) * Math.sin(rot), w: 0.06, h, d, rot, uvScale: 1.6, tint: T.steel, ao: 0.5 });
  const levels = 4;
  for (let i = 0; i < levels; i++) {
    const py = y + 0.28 + i * ((h - 0.3) / levels);
    cb.m('metal').boxRot({ x, y: py, z, w, h: 0.035, d, rot, uvScale: 1.2, tint: [0.5, 0.5, 0.5], ao: 0.3 });
    const items = rng.int(0, 4);
    for (let k = 0; k < items; k++) {
      const ox = rng.sym(w * 0.42);
      cb.m(rng.chance(0.5) ? 'wood' : 'paint').boxRot({
        x: x + ox * Math.cos(rot) + rng.sym(0.08) * Math.sin(rot), y: py + 0.035,
        z: z + ox * Math.sin(rot) - rng.sym(0.08) * Math.cos(rot),
        w: rng.range(0.14, 0.34), h: rng.range(0.12, 0.3), d: rng.range(0.14, 0.3),
        rot: rot + rng.sym(0.3), uvScale: 2.4, tint: [rng.range(0.4, 0.7), rng.range(0.4, 0.65), rng.range(0.35, 0.6)],
      });
    }
  }
}

/**
 * A covered body. Hollis killed people and the game does not pretend otherwise,
 * but it is shown with restraint: a sheet, a weighted hem, a pair of boots.
 */
export function covered(cb, x, y, z, rot, rng) {
  cb.m('fabric').boxRot({ x, y, z, w: 1.85, h: 0.3, d: 0.62, rot, uvScale: 1.2, tint: [0.68, 0.66, 0.62], ao: 0.4 });
  cb.m('fabric').boxRot({ x: x - 0.55 * Math.cos(rot), y, z: z - 0.55 * Math.sin(rot), w: 0.55, h: 0.42, d: 0.5, rot, uvScale: 1.4, tint: [0.7, 0.68, 0.64] });
  for (const oz of [-0.14, 0.14]) {
    cb.m('dark').boxRot({
      x: x + 0.95 * Math.cos(rot) - oz * Math.sin(rot), y,
      z: z + 0.95 * Math.sin(rot) + oz * Math.cos(rot),
      w: 0.24, h: 0.16, d: 0.11, rot, uvScale: 2.4, tint: [0.24, 0.22, 0.2],
    });
  }
  // Stones on the hem so the sheet is not carried off by the updraught.
  for (let i = 0; i < 4; i++) {
    cb.m('rubble').boxRot({
      x: x + rng.sym(0.9), y: 0.3, z: z + rng.sym(0.34),
      w: 0.14, h: 0.1, d: 0.13, rot: rng.f() * TAU, uvScale: 3, tint: [0.6, 0.58, 0.55],
    });
  }
}

/** Debris scatter — the connective tissue between the big props. */
export function debris(cb, x, z, radius, count, rng, y = 0) {
  for (let i = 0; i < count; i++) {
    const a = rng.f() * TAU, dd = Math.sqrt(rng.f()) * radius;
    const px = x + Math.cos(a) * dd, pz = z + Math.sin(a) * dd;
    const roll = rng.f();
    if (roll < 0.42) {
      cb.m('rubble').boxRot({ x: px, y, z: pz, w: rng.range(0.14, 0.6), h: rng.range(0.05, 0.22), d: rng.range(0.12, 0.5), rot: rng.f() * TAU, uvScale: 2, tint: [0.66, 0.64, 0.6], ao: 0.3 });
    } else if (roll < 0.62) {
      cb.m('wood').boxRot({ x: px, y, z: pz, w: rng.range(0.3, 1.3), h: 0.06, d: rng.range(0.08, 0.2), rot: rng.f() * TAU, uvScale: 2, tint: T.wood, ao: 0.3 });
    } else if (roll < 0.78) {
      cb.m('rust').boxRot({ x: px, y, z: pz, w: rng.range(0.2, 0.8), h: 0.04, d: rng.range(0.15, 0.6), rot: rng.f() * TAU, uvScale: 2, tint: T.rust, ao: 0.3 });
    } else if (roll < 0.9) {
      cb.m('fabric').boxRot({ x: px, y, z: pz, w: rng.range(0.2, 0.7), h: rng.range(0.03, 0.12), d: rng.range(0.2, 0.6), rot: rng.f() * TAU, uvScale: 2, tint: [0.5, 0.48, 0.44], ao: 0.3 });
    } else {
      cb.m('glass').boxRot({ x: px, y, z: pz, w: rng.range(0.1, 0.4), h: 0.015, d: rng.range(0.1, 0.35), rot: rng.f() * TAU, uvScale: 3, tint: [0.55, 0.6, 0.6] });
    }
  }
}

/** Paper scatter — near desks, noticeboards and anywhere the Authority worked. */
export function paperScatter(cb, x, z, radius, count, rng, y = 0.005) {
  for (let i = 0; i < count; i++) {
    const a = rng.f() * TAU, dd = Math.sqrt(rng.f()) * radius;
    cb.m('plaster').boxRot({
      x: x + Math.cos(a) * dd, y, z: z + Math.sin(a) * dd,
      w: 0.21, h: 0.004, d: 0.3, rot: rng.f() * TAU, uvScale: 3, tint: [0.86, 0.84, 0.78],
    });
  }
}
