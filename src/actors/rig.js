/**
 * Procedural character rig.
 *
 * Every person in Hollis is generated: a twenty-bone skeleton and a skinned
 * mesh swept along it. No downloaded models, no licensing, and a whole crowd
 * costs a few thousand triangles.
 *
 * Limbs are lofted N-gon tubes with per-ring radii, which is what gives them a
 * readable silhouette at 375 CSS pixels — the thing that actually matters on a
 * phone. Skin weights are assigned explicitly per ring rather than by a
 * distance heuristic, so elbows and knees bend cleanly instead of pinching.
 *
 * Costume is data. A scavenger, an Authority warden and Ren herself are the
 * same builder with different plates, straps, masks and proportions.
 */

import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { clamp, clamp01, lerp, TAU } from '../core/util.js';

/**
 * Bone table. Positions are in bind pose, metres, Y-up, character facing -Z.
 * `head` is the joint position; the bone extends toward its children.
 */
export const BONES = [
  //  name          parent        x      y      z
  ['root',       null,        0.000, 0.000,  0.000],
  ['hips',       'root',      0.000, 0.960,  0.000],
  ['spine',      'hips',      0.000, 1.100,  0.010],
  ['chest',      'spine',     0.000, 1.290, -0.005],
  ['neck',       'chest',     0.000, 1.480, -0.010],
  ['head',       'neck',      0.000, 1.585, -0.005],

  // Arm bind is INSIDE the chest ring (shoulder half-width 0.190), not outside
  // it. Hanging the humerus at 0.185 against a 0.176 chest left a visible air
  // gap between arm and torso — the gingerbread-man read. The wrist carries
  // about 6 degrees of valgus, which is what stops the arm looking like a
  // vertical stick bolted to a box.
  ['shoulderL',  'chest',     0.062, 1.430, -0.010],
  ['armL',       'shoulderL', 0.168, 1.410, -0.010],
  ['forearmL',   'armL',      0.168, 1.145, -0.008],
  ['handL',      'forearmL',  0.193, 0.905, -0.005],

  ['shoulderR',  'chest',    -0.062, 1.430, -0.010],
  ['armR',       'shoulderR',-0.168, 1.410, -0.010],
  ['forearmR',   'armR',     -0.168, 1.145, -0.008],
  ['handR',      'forearmR', -0.193, 0.905, -0.005],

  ['thighL',     'hips',      0.092, 0.930,  0.000],
  ['shinL',      'thighL',    0.096, 0.505,  0.004],
  ['footL',      'shinL',     0.098, 0.088,  0.010],
  ['toeL',       'footL',     0.098, 0.030, -0.115],

  ['thighR',     'hips',     -0.092, 0.930,  0.000],
  ['shinR',      'thighR',   -0.096, 0.505,  0.004],
  ['footR',      'shinR',    -0.098, 0.088,  0.010],
  ['toeR',       'footR',    -0.098, 0.030, -0.115],
];

export const BONE_INDEX = (() => {
  const m = {};
  BONES.forEach((b, i) => { m[b[0]] = i; });
  return m;
})();

/**
 * Quadruped bind pose, using the *same* bone names so one animator drives both.
 * The arms become the forelegs and the spine lies horizontal, which means the
 * procedural locomotion's alternating fore/aft limb swing is already a
 * plausible trot — no second animation system, no second clip library.
 */
export const QUAD_BONES = [
  ['root',       null,        0.000, 0.000,  0.000],
  ['hips',       'root',      0.000, 0.520,  0.300],
  ['spine',      'hips',      0.000, 0.545,  0.090],
  ['chest',      'spine',     0.000, 0.550, -0.150],
  ['neck',       'chest',     0.000, 0.560, -0.330],
  ['head',       'neck',      0.000, 0.545, -0.470],

  ['shoulderL',  'chest',     0.055, 0.530, -0.190],
  ['armL',       'shoulderL', 0.110, 0.500, -0.215],
  ['forearmL',   'armL',      0.112, 0.285, -0.215],
  ['handL',      'forearmL',  0.112, 0.075, -0.215],

  ['shoulderR',  'chest',    -0.055, 0.530, -0.190],
  ['armR',       'shoulderR',-0.110, 0.500, -0.215],
  ['forearmR',   'armR',     -0.112, 0.285, -0.215],
  ['handR',      'forearmR', -0.112, 0.075, -0.215],

  ['thighL',     'hips',      0.115, 0.500,  0.300],
  ['shinL',      'thighL',    0.118, 0.290,  0.320],
  ['footL',      'shinL',     0.118, 0.080,  0.290],
  ['toeL',       'footL',     0.118, 0.030,  0.210],

  ['thighR',     'hips',     -0.115, 0.500,  0.300],
  ['shinR',      'thighR',   -0.118, 0.290,  0.320],
  ['footR',      'shinR',    -0.118, 0.080,  0.290],
  ['toeR',       'footR',    -0.118, 0.030,  0.210],
];

/** Costume presets. These are the whole cast's visual identity. */
export const COSTUMES = {
  /** Ren: mine-rescue surplus. Heavy canvas coat, harness, lamp, hip respirator. */
  ren: {
    scale: 1.0, build: 0.96, shoulders: 1.0,
    skin: 0x8c6b52, hair: 0x2a211c, hairStyle: 'tied',
    coat: 0x4a4136, coatTrim: 0x6b3d1f, sleeve: 0x413a30,
    trouser: 0x33302a, boot: 0x241f1b, glove: 0x3a2f26,
    gear: { harness: true, lamp: true, hipRespirator: true, backpack: 'small', kneepads: true, hiVis: 0x9a6a22 },
    coatLength: 0.30, hood: false,
  },
  /** Scavenger: layered, mismatched, no mask — which is why the gas matters. */
  scav: {
    scale: 0.98, build: 0.94, shoulders: 0.96,
    skin: 0x7d6350, hair: 0x22201d, hairStyle: 'crop',
    coat: 0x40453c, coatTrim: 0x2e3128, sleeve: 0x35392f,
    trouser: 0x2c2a26, boot: 0x201d1a, glove: 0x33302a,
    gear: { harness: false, lamp: false, ragMask: true, backpack: 'bindle', hood: true },
    coatLength: 0.36, hood: true,
  },
  /** Breaker: the ash crew's heavy. Padded, wider, slower. */
  breaker: {
    scale: 1.08, build: 1.26, shoulders: 1.2,
    skin: 0x775d4a, hair: 0x1d1b19, hairStyle: 'none',
    coat: 0x4b3f33, coatTrim: 0x6a2f1c, sleeve: 0x3c3229,
    trouser: 0x2f2b26, boot: 0x231f1c, glove: 0x2e2721,
    gear: { harness: true, pads: true, ragMask: true, backpack: null },
    coatLength: 0.26, hood: false,
  },
  /** Warden: Authority contract security. Masked, therefore gas-proof. */
  warden: {
    scale: 1.02, build: 1.06, shoulders: 1.08,
    skin: 0x8a6d55, hair: 0x2a2622, hairStyle: 'none',
    coat: 0x2b323a, coatTrim: 0x53707e, sleeve: 0x262c33,
    trouser: 0x232830, boot: 0x1b1e22, glove: 0x1f2429,
    gear: { harness: true, fullMask: true, lamp: true, pads: true, backpack: 'canister', hiVis: 0x5f8ea4 },
    coatLength: 0.22, hood: false,
  },
  /** Civilian holdout. */
  civ: {
    scale: 0.97, build: 0.92, shoulders: 0.94,
    skin: 0x93705a, hair: 0x3a2c22, hairStyle: 'crop',
    coat: 0x5a4c3e, coatTrim: 0x3f382f, sleeve: 0x4a4034,
    trouser: 0x393530, boot: 0x2a2622, glove: 0x494036,
    gear: { ragMask: true, backpack: null },
    coatLength: 0.32, hood: false,
  },
  /** Sol: the Stacks' leader — paramedic jacket, hi-vis stripe, no mask indoors. */
  sol: {
    scale: 0.99, build: 0.98, shoulders: 1.0,
    skin: 0x6d4f3c, hair: 0x1c1917, hairStyle: 'tied',
    coat: 0x2f4038, coatTrim: 0xa8c04a, sleeve: 0x2a3830,
    trouser: 0x2c2f2b, boot: 0x201d1a, glove: 0x333b33,
    gear: { harness: true, lamp: true, backpack: 'medkit', hiVis: 0xa8c04a },
    coatLength: 0.30, hood: false,
  },
  /** Teo: old pit deputy, waistcoat and a lamp he has carried for forty years. */
  teo: {
    scale: 0.96, build: 1.08, shoulders: 1.02,
    skin: 0x9a7860, hair: 0x8e8880, hairStyle: 'crop',
    coat: 0x4b433a, coatTrim: 0x7a5a2e, sleeve: 0x3d372f,
    trouser: 0x35322c, boot: 0x272320, glove: 0x413a31,
    gear: { lamp: true, harness: false, backpack: null },
    coatLength: 0.40, hood: false,
  },
  /** Iris: Authority survey engineer. Clean coat, clipboard-shaped posture. */
  iris: {
    scale: 0.97, build: 0.9, shoulders: 0.94,
    skin: 0xb18a6c, hair: 0x4a3526, hairStyle: 'tied',
    coat: 0x39424c, coatTrim: 0x7fa2b4, sleeve: 0x323a43,
    trouser: 0x2c3138, boot: 0x22262b, glove: 0x2e343b,
    gear: { hipRespirator: true, backpack: 'small', hiVis: 0x7fa2b4 },
    coatLength: 0.34, hood: false,
  },
  /** Krajcik: site director. Long coat, no protective gear at all. */
  krajcik: {
    scale: 1.03, build: 1.02, shoulders: 1.04,
    skin: 0xa08066, hair: 0x6a625a, hairStyle: 'crop',
    coat: 0x22262c, coatTrim: 0x3c444d, sleeve: 0x1e2228,
    trouser: 0x25282d, boot: 0x1a1c1f, glove: 0x24282e,
    gear: { backpack: null },
    coatLength: 0.52, hood: false,
  },
  /**
   * Feral dog. Hollis had a lot of pets and no one could take them. They run
   * the empty streets in threes and they are not hostile because they are
   * monsters; they are hostile because they are starving.
   */
  dog: {
    quadruped: true, scale: 1.0, build: 1.0,
    coat: 0x4a4038, coatTrim: 0x2e2822, skin: 0x3a332c,
    boot: 0x241f1b, hair: 0x2a241e,
    gear: {},
  },
  /** Nessa: nineteen, too thin for the coat she is wearing. */
  nessa: {
    scale: 0.94, build: 0.86, shoulders: 0.9,
    skin: 0x8a6a52, hair: 0x241d18, hairStyle: 'tied',
    coat: 0x554a3c, coatTrim: 0x8a5a2a, sleeve: 0x453c31,
    trouser: 0x2f2c28, boot: 0x231f1c, glove: 0x3d352c,
    gear: { ragMask: true, backpack: 'small' },
    coatLength: 0.38, hood: true,
  },
};

// ------------------------------------------------------------------ mesh ---

/**
 * Accumulates a skinned mesh. Each `tube` call lofts a closed N-gon along a
 * path of rings, assigning each ring's skin weights explicitly.
 */
class SkinBuilder {
  constructor() {
    this.pos = []; this.nrm = []; this.uv = []; this.col = [];
    this.skinIndex = []; this.skinWeight = [];
    this.idx = [];
    this.n = 0;
  }

  /**
   * @param {Array} rings  [{ y, r, rz, x, z, bone, bone2, w2, tint }]
   *   y      height along the local axis
   *   r      radius in X, rz radius in Z (ellipse cross-section)
   *   x, z   lateral offset of the ring centre
   *   bone   primary bone index; bone2/w2 optional blend partner
   * @param {number} sides
   * @param {boolean} capStart @param {boolean} capEnd
   */
  tube(rings, sides = 8, capStart = true, capEnd = true, twist = 0) {
    const start = this.n;
    for (let ri = 0; ri < rings.length; ri++) {
      const R = rings[ri];
      const v = ri / (rings.length - 1);
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * TAU + twist;
        const cx = Math.cos(a), cz = Math.sin(a);
        const px = (R.x || 0) + cx * R.r;
        const pz = (R.z || 0) + cz * (R.rz ?? R.r);
        // Normal from the ellipse gradient, flattened toward the sweep normal.
        let nx = cx / Math.max(0.01, R.r), nz = cz / Math.max(0.01, R.rz ?? R.r);
        const nl = Math.hypot(nx, nz) || 1;
        this.pos.push(px, R.y, pz);
        this.nrm.push(nx / nl, 0, nz / nl);
        this.uv.push(s / sides, v);
        const t = R.tint || [1, 1, 1];
        this.col.push(t[0], t[1], t[2]);
        const b1 = R.bone, b2 = R.bone2 ?? R.bone;
        const w2 = R.bone2 !== undefined ? clamp01(R.w2 ?? 0) : 0;
        this.skinIndex.push(b1, b2, 0, 0);
        this.skinWeight.push(1 - w2, w2, 0, 0);
        this.n++;
      }
    }
    const row = sides + 1;
    for (let ri = 0; ri < rings.length - 1; ri++) {
      for (let s = 0; s < sides; s++) {
        const a = start + ri * row + s;
        this.idx.push(a, a + row, a + row + 1, a, a + row + 1, a + 1);
      }
    }
    if (capStart) this._cap(rings[0], sides, -1, twist);
    if (capEnd) this._cap(rings[rings.length - 1], sides, 1, twist);
    return this;
  }

  _cap(R, sides, dir, twist) {
    const c = this.n;
    const t = R.tint || [1, 1, 1];
    const b1 = R.bone, b2 = R.bone2 ?? R.bone;
    const w2 = R.bone2 !== undefined ? clamp01(R.w2 ?? 0) : 0;
    this.pos.push(R.x || 0, R.y, R.z || 0);
    this.nrm.push(0, dir, 0);
    this.uv.push(0.5, 0.5);
    this.col.push(t[0], t[1], t[2]);
    this.skinIndex.push(b1, b2, 0, 0);
    this.skinWeight.push(1 - w2, w2, 0, 0);
    this.n++;
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * TAU + twist;
      this.pos.push((R.x || 0) + Math.cos(a) * R.r, R.y, (R.z || 0) + Math.sin(a) * (R.rz ?? R.r));
      this.nrm.push(0, dir, 0);
      this.uv.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
      this.col.push(t[0], t[1], t[2]);
      this.skinIndex.push(b1, b2, 0, 0);
      this.skinWeight.push(1 - w2, w2, 0, 0);
      this.n++;
    }
    for (let s = 0; s < sides; s++) {
      if (dir > 0) this.idx.push(c, c + s + 1, c + s + 2);
      else this.idx.push(c, c + s + 2, c + s + 1);
    }
  }

  /** A rigid box rigidly bound to one bone — packs, plates, straps, lamps. */
  box(cx, cy, cz, w, h, d, bone, tint, rot = 0) {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const c = Math.cos(rot), s = Math.sin(rot);
    const V = [
      [-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd],
      [-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd],
    ];
    const F = [
      [0, 1, 2, 3, 0, 0, 1], [5, 4, 7, 6, 0, 0, -1], [1, 5, 6, 2, 1, 0, 0],
      [4, 0, 3, 7, -1, 0, 0], [3, 2, 6, 7, 0, 1, 0], [4, 5, 1, 0, 0, -1, 0],
    ];
    for (const f of F) {
      const base = this.n;
      for (let i = 0; i < 4; i++) {
        const v = V[f[i]];
        const px = v[0] * c - v[2] * s, pz = v[0] * s + v[2] * c;
        this.pos.push(cx + px, cy + v[1], cz + pz);
        const nx = f[4] * c - f[6] * s, nz = f[4] * s + f[6] * c;
        this.nrm.push(nx, f[5], nz);
        this.uv.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0);
        this.col.push(tint[0], tint[1], tint[2]);
        this.skinIndex.push(bone, bone, 0, 0);
        this.skinWeight.push(1, 0, 0, 0);
        this.n++;
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.skinWeight, 4));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    // Generous bounds: the skinned pose can exceed the bind pose.
    g.boundingSphere.radius *= 1.5;
    return g;
  }
}

/**
 * sRGB -> linear.
 *
 * Vertex colours are consumed by three.js as WORKING-SPACE (linear) values,
 * but every costume constant in this file is an sRGB hex. Feeding 0x4a4038
 * straight through as linear (0.29, 0.25, 0.22) produces a mid grey-brown on
 * screen — which is why the dog, whose coat is 0x4a4038, rendered as a pale
 * cream animal instead of a dark one, and why the whole cast read washed out.
 */
const s2l = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
/** Convert an authored 0..1 sRGB triple. Values above 1 are emissive intent and pass through. */
const lin = (a) => [a[0] > 1 ? a[0] : s2l(a[0]), a[1] > 1 ? a[1] : s2l(a[1]), a[2] > 1 ? a[2] : s2l(a[2])];
const hex = (h) => lin([((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]);

/**
 * Build a skinned character.
 * @param {string|object} costume key into COSTUMES, or a costume object
 * @param {number} detail 0 = low (6-sided limbs), 1 = medium, 2 = high
 * @returns {{ skeleton, geometry, bones, height }}
 */
export function buildCharacter(costume, detail = 1, seed = 1) {
  const C = typeof costume === 'string' ? (COSTUMES[costume] || COSTUMES.civ) : costume;
  const rng = new Rng(`char:${seed}`);
  const sides = detail === 0 ? 6 : detail === 1 ? 8 : 10;
  const S = C.scale ?? 1;
  const B = C.build ?? 1;
  const SH = C.shoulders ?? 1;

  if (C.quadruped) return buildQuadruped(C, sides, S, rng);

  // --- skeleton ----------------------------------------------------------
  const bones = BONES.map(([name, parent, x, y, z]) => {
    const b = new THREE.Bone();
    b.name = name;
    b.userData.parentName = parent;
    // Widen shoulders and hips per build.
    const sx = /shoulder|arm|hand|forearm/.test(name) ? SH : /thigh|shin|foot|toe/.test(name) ? B : 1;
    b.userData.bind = new THREE.Vector3(x * sx * S, y * S, z * S);
    return b;
  });
  for (let i = 0; i < bones.length; i++) {
    const p = BONES[i][1];
    if (p === null) continue;
    const parent = bones[BONE_INDEX[p]];
    parent.add(bones[i]);
    const bp = parent.userData.bind;
    const me = bones[i].userData.bind;
    bones[i].position.set(me.x - bp.x, me.y - bp.y, me.z - bp.z);
  }
  bones[0].position.copy(bones[0].userData.bind);

  const I = BONE_INDEX;
  const sb = new SkinBuilder();

  const skin = hex(C.skin), coat = hex(C.coat), sleeve = hex(C.sleeve);
  const trouser = hex(C.trouser), boot = hex(C.boot), glove = hex(C.glove);
  const trim = hex(C.coatTrim), hair = hex(C.hair);

  // Slight per-character tonal jitter so a crowd is not clones.
  const j = () => 1 + rng.sym(0.045);
  const tint = (c) => [c[0] * j(), c[1] * j(), c[2] * j()];
  const coatT = tint(coat), sleeveT = tint(sleeve), trouserT = tint(trouser);

  const y = (v) => v * S;

  // --- torso -------------------------------------------------------------
  // One lofted tube from hips to neck, with the coat flaring below the waist.
  // The old profile ran 0.172 at the hem and 0.176 at the shoulder — the same
  // width top and bottom, i.e. a rectangle with a head on it. The waist is now
  // pulled in to 0.140 and the shoulder pushed out to 0.190, and the coat hem
  // is narrower than the shoulder line so the flare reads as a coat rather than
  // as the widest point of the body.
  const coatLen = C.coatLength ?? 0.3;
  sb.tube([
    { y: y(0.960 - coatLen), r: 0.158 * B, rz: 0.104 * B, bone: I.hips, tint: coatT },
    { y: y(0.960 - coatLen * 0.45), r: 0.150 * B, rz: 0.099 * B, bone: I.hips, tint: coatT },
    { y: y(0.985), r: 0.146 * B, rz: 0.096 * B, bone: I.hips, tint: coatT },
    { y: y(1.100), r: 0.140 * B, rz: 0.088 * B, bone: I.spine, bone2: I.hips, w2: 0.35, tint: coatT },
    { y: y(1.215), r: 0.150 * B, rz: 0.094 * B, bone: I.spine, tint: coatT },
    { y: y(1.300), r: 0.176 * B * SH, rz: 0.104 * B, bone: I.chest, bone2: I.spine, w2: 0.3, tint: coatT },
    { y: y(1.400), r: 0.190 * B * SH, rz: 0.110 * B, bone: I.chest, tint: coatT },
    { y: y(1.452), r: 0.140 * B, rz: 0.094 * B, bone: I.chest, tint: coatT },
  ], sides, true, true);

  // Collar. Kept clear of the neck tube (r 0.052 -> 0.048) so about 20 mm of
  // throat is visible; at r 0.086 the collar swallowed the neck entirely and
  // the head appeared to sit straight on the shoulders.
  sb.tube([
    { y: y(1.442), r: 0.082 * B, rz: 0.070 * B, bone: I.chest, tint: trim },
    { y: y(1.512), r: 0.070 * B, rz: 0.062 * B, bone: I.chest, bone2: I.neck, w2: 0.5, tint: trim },
  ], sides, false, false);

  // Neck
  sb.tube([
    { y: y(1.455), r: 0.052, rz: 0.048, bone: I.neck, bone2: I.chest, w2: 0.4, tint: tint(skin) },
    { y: y(1.560), r: 0.048, rz: 0.045, bone: I.neck, tint: tint(skin) },
  ], sides, false, false);

  // --- head --------------------------------------------------------------
  const headT = tint(skin);
  sb.tube([
    { y: y(1.545), r: 0.062, rz: 0.062, bone: I.head, bone2: I.neck, w2: 0.3, tint: headT },
    { y: y(1.600), r: 0.085, rz: 0.092, bone: I.head, tint: headT },
    { y: y(1.665), r: 0.090, rz: 0.098, bone: I.head, tint: headT },
    { y: y(1.720), r: 0.082, rz: 0.088, bone: I.head, tint: headT },
    { y: y(1.756), r: 0.052, rz: 0.056, bone: I.head, tint: headT },
  ], sides, true, true);
  // --- face --------------------------------------------------------------
  // At the distance the third-person camera actually holds — the head is about
  // 30 CSS pixels tall — features are not the point. A VALUE BREAK where the
  // eyes are is the point: a brow that catches light with a recess under it
  // that does not. That single dark band is what makes a head read as a face
  // rather than as a smooth ovoid. The nose, mouth and jaw plane exist to break
  // the silhouette and to give the light something to fall across.
  const shade = (k) => [headT[0] * k, headT[1] * k, headT[2] * k];
  // Brow ridge, proud of the skull and catching the sky.
  sb.box(0, y(1.664), y(-0.090), 0.132, 0.026, 0.030, I.head, shade(1.06));
  // Eye-socket recess: the dark band. Deliberately the strongest value in the
  // face and the only one that survives to 30 pixels.
  sb.box(0, y(1.643), y(-0.084), 0.118, 0.021, 0.026, I.head, shade(0.42));
  // Eyes, set into the recess.
  for (const s of [1, -1]) {
    sb.box(y(0.030 * s), y(1.642), y(-0.093), 0.026, 0.015, 0.012, I.head, lin([0.10, 0.09, 0.09]));
  }
  // Nose: a wedge, not a feature. It is here for the shadow it throws.
  sb.box(0, y(1.620), y(-0.096), 0.024, 0.038, 0.026, I.head, shade(1.02));
  // Mouth line.
  sb.box(0, y(1.594), y(-0.088), 0.042, 0.009, 0.014, I.head, shade(0.5));
  // Jaw plane — flattens the lower skull so the chin has an edge.
  sb.box(0, y(1.576), y(-0.058), 0.106, 0.046, 0.074, I.head, shade(0.94));

  if (C.hairStyle === 'crop' || C.hairStyle === 'tied') {
    // The cap used to start at y 1.680 while the skull tube starts at 1.545,
    // leaving 135 mm of bare scalp across the occiput — precisely the part of
    // the head a third-person camera looks at for the entire game. It now runs
    // down to the nape. Lower rings are pushed back in Z so the hair covers the
    // back of the skull and buries itself inside the face rather than over it.
    sb.tube([
      { y: y(1.560), r: 0.058, rz: 0.058, z: y(0.026), bone: I.head, bone2: I.neck, w2: 0.25, tint: tint(hair) },
      { y: y(1.600), r: 0.088, rz: 0.094, z: y(0.020), bone: I.head, tint: tint(hair) },
      { y: y(1.648), r: 0.094, rz: 0.101, z: y(0.014), bone: I.head, tint: tint(hair) },
      { y: y(1.690), r: 0.095, rz: 0.103, z: y(0.008), bone: I.head, tint: tint(hair) },
      { y: y(1.726), r: 0.088, rz: 0.094, z: y(0.004), bone: I.head, tint: tint(hair) },
      { y: y(1.762), r: 0.050, rz: 0.054, bone: I.head, tint: tint(hair) },
    ], sides, false, true);
    if (C.hairStyle === 'tied') {
      sb.tube([
        { y: y(1.700), r: 0.040, rz: 0.040, z: y(0.092), bone: I.head, tint: tint(hair) },
        { y: y(1.640), r: 0.046, rz: 0.046, z: y(0.106), bone: I.head, tint: tint(hair) },
        { y: y(1.575), r: 0.030, rz: 0.030, z: y(0.100), bone: I.head, tint: tint(hair) },
      ], 6, true, true);
    }
  }

  // Masks. The single clearest read of which faction someone belongs to.
  const gear = C.gear || {};
  if (gear.fullMask) {
    sb.tube([
      { y: y(1.596), r: 0.090, rz: 0.096, bone: I.head, tint: lin([0.14, 0.15, 0.17]) },
      { y: y(1.636), r: 0.096, rz: 0.104, bone: I.head, tint: lin([0.16, 0.17, 0.19]) },
      { y: y(1.672), r: 0.092, rz: 0.098, bone: I.head, tint: lin([0.14, 0.15, 0.17]) },
    ], sides, true, false);
    // Filter canister off the cheek, and the lens band.
    sb.box(y(0.062), y(1.618), y(-0.078), 0.062, 0.062, 0.062, I.head, lin([0.2, 0.21, 0.23]));
    sb.box(0, y(1.652), y(-0.094), 0.148, 0.036, 0.014, I.head, lin([0.45, 0.62, 0.7]));
  } else if (gear.ragMask) {
    sb.tube([
      { y: y(1.588), r: 0.086, rz: 0.092, bone: I.head, tint: lin([0.5, 0.48, 0.43]) },
      { y: y(1.632), r: 0.092, rz: 0.098, bone: I.head, tint: lin([0.54, 0.52, 0.46]) },
    ], sides, true, false);
  }
  if (C.hood) {
    sb.tube([
      { y: y(1.612), r: 0.112, rz: 0.118, bone: I.head, tint: coatT },
      { y: y(1.700), r: 0.116, rz: 0.124, bone: I.head, tint: coatT },
      { y: y(1.772), r: 0.078, rz: 0.086, bone: I.head, tint: coatT },
    ], sides, false, true);
  }
  if (gear.lamp) {
    // Headlamp on a band. It is also the player's actual light source.
    // Pushed forward clear of the hair cap, which now reaches the hairline.
    sb.box(0, y(1.692), y(-0.106), 0.062, 0.044, 0.03, I.head, lin([0.22, 0.23, 0.24]));
    sb.box(0, y(1.692), y(-0.121), 0.042, 0.03, 0.012, I.head, lin([3.0, 2.4, 1.6]));
  }

  // --- arms --------------------------------------------------------------
  for (const side of [1, -1]) {
    const L = side > 0 ? 'L' : 'R';
    const sx = side * SH;
    // Sleeve follows the new bind: tucked under the shoulder line at the top,
    // drifting out to the wrist along the carrying angle.
    sb.tube([
      { y: y(1.418), x: y(0.148 * sx), r: 0.062 * B, rz: 0.062 * B, bone: I['armL'.replace('L', L)], bone2: I.chest, w2: 0.35, tint: sleeveT },
      { y: y(1.330), x: y(0.162 * sx), r: 0.055 * B, rz: 0.055 * B, bone: I['armL'.replace('L', L)], tint: sleeveT },
      { y: y(1.180), x: y(0.167 * sx), r: 0.048 * B, rz: 0.048 * B, bone: I['armL'.replace('L', L)], tint: sleeveT },
      { y: y(1.148), x: y(0.168 * sx), r: 0.047 * B, rz: 0.047 * B, bone: I['forearmL'.replace('L', L)], bone2: I['armL'.replace('L', L)], w2: 0.5, tint: sleeveT },
      { y: y(1.020), x: y(0.181 * sx), r: 0.044 * B, rz: 0.044 * B, bone: I['forearmL'.replace('L', L)], tint: sleeveT },
      { y: y(0.930), x: y(0.190 * sx), r: 0.038 * B, rz: 0.038 * B, bone: I['forearmL'.replace('L', L)], tint: tint(trim) },
    ], sides, true, false);
    // Hand: a mitt, plus a thumb block. At this scale fingers are noise.
    sb.tube([
      { y: y(0.930), x: y(0.191 * sx), r: 0.042, rz: 0.034, bone: I['handL'.replace('L', L)], bone2: I['forearmL'.replace('L', L)], w2: 0.35, tint: tint(glove) },
      { y: y(0.862), x: y(0.193 * sx), r: 0.044, rz: 0.036, bone: I['handL'.replace('L', L)], tint: tint(glove) },
      { y: y(0.812), x: y(0.193 * sx), r: 0.030, rz: 0.026, bone: I['handL'.replace('L', L)], tint: tint(glove) },
    ], 6, false, true);
    sb.box(y(0.162 * sx), y(0.886), 0, 0.028, 0.05, 0.03, I['handL'.replace('L', L)], glove);

    // Shoulder cap — the detail that makes a coat read as a coat. Widened to
    // meet the new 0.190 shoulder ring so the deltoid is the widest point of
    // the silhouette.
    sb.tube([
      { y: y(1.452), x: y(0.110 * sx), r: 0.084 * B, rz: 0.078 * B, bone: I.chest, tint: coatT },
      { y: y(1.396), x: y(0.152 * sx), r: 0.076 * B, rz: 0.070 * B, bone: I.chest, tint: coatT },
      { y: y(1.340), x: y(0.164 * sx), r: 0.058 * B, rz: 0.056 * B, bone: I['armL'.replace('L', L)], bone2: I.chest, w2: 0.5, tint: coatT },
    ], sides, true, false);

    if (gear.pads) {
      sb.box(y(0.176 * sx), y(1.070), 0, 0.02, 0.13, 0.098, I['forearmL'.replace('L', L)], lin([0.19, 0.2, 0.21]), 0);
    }
  }

  // --- legs --------------------------------------------------------------
  for (const side of [1, -1]) {
    const L = side > 0 ? 'L' : 'R';
    const sx = side * B;
    sb.tube([
      { y: y(0.965), x: y(0.088 * sx), r: 0.086 * B, rz: 0.088 * B, bone: I['thighL'.replace('L', L)], bone2: I.hips, w2: 0.45, tint: trouserT },
      { y: y(0.820), x: y(0.093 * sx), r: 0.079 * B, rz: 0.082 * B, bone: I['thighL'.replace('L', L)], tint: trouserT },
      { y: y(0.600), x: y(0.096 * sx), r: 0.068 * B, rz: 0.070 * B, bone: I['thighL'.replace('L', L)], tint: trouserT },
      { y: y(0.520), x: y(0.096 * sx), r: 0.064 * B, rz: 0.066 * B, bone: I['shinL'.replace('L', L)], bone2: I['thighL'.replace('L', L)], w2: 0.5, tint: trouserT },
      { y: y(0.330), x: y(0.098 * sx), r: 0.058 * B, rz: 0.060 * B, bone: I['shinL'.replace('L', L)], tint: trouserT },
      { y: y(0.215), x: y(0.098 * sx), r: 0.056 * B, rz: 0.058 * B, bone: I['shinL'.replace('L', L)], tint: tint(boot) },
    ], sides, true, false);
    // Boot: shaft, then a foot block that reads at distance.
    sb.tube([
      { y: y(0.215), x: y(0.098 * sx), r: 0.060, rz: 0.062, bone: I['footL'.replace('L', L)], bone2: I['shinL'.replace('L', L)], w2: 0.5, tint: tint(boot) },
      { y: y(0.088), x: y(0.098 * sx), r: 0.058, rz: 0.062, bone: I['footL'.replace('L', L)], tint: tint(boot) },
    ], sides, false, false);
    sb.box(y(0.098 * sx), y(0.044), y(-0.036), 0.104, 0.088, 0.238, I['footL'.replace('L', L)], boot);
    sb.box(y(0.098 * sx), y(0.010), y(-0.036), 0.112, 0.026, 0.252, I['footL'.replace('L', L)], [boot[0] * 0.7, boot[1] * 0.7, boot[2] * 0.7]);

    if (gear.kneepads) {
      sb.box(y(0.098 * sx), y(0.492), y(-0.056), 0.096, 0.11, 0.03, I['shinL'.replace('L', L)], lin([0.17, 0.16, 0.15]));
    }
  }

  // --- gear --------------------------------------------------------------
  if (gear.harness) {
    // Straps sit PROUD of the torso ring (rz 0.104 at chest height). At the old
    // z of 0.098 with 16 mm of depth they were a couple of millimetres inside
    // the coat and z-fought with it from every angle.
    for (const side of [1, -1]) {
      sb.box(y(0.072 * side), y(1.310), y(-0.112), 0.044, 0.26, 0.018, I.chest, trim);
      sb.box(y(0.072 * side), y(1.310), y(0.112), 0.044, 0.26, 0.018, I.chest, [trim[0] * 0.8, trim[1] * 0.8, trim[2] * 0.8]);
    }
    sb.box(0, y(1.186), 0, 0.30 * B, 0.052, 0.222 * B, I.spine, lin([0.16, 0.15, 0.14]));
    sb.box(0, y(1.186), y(-0.112), 0.056, 0.06, 0.028, I.spine, lin([0.5, 0.5, 0.52]));
  }
  if (gear.hipRespirator) {
    sb.box(y(0.148 * B), y(0.928), y(0.048), 0.086, 0.11, 0.078, I.hips, lin([0.2, 0.21, 0.22]));
    sb.box(y(0.148 * B), y(0.99), y(0.048), 0.05, 0.04, 0.05, I.hips, lin([0.42, 0.42, 0.44]));
  }
  // Packs first, then the hi-vis band on top of whatever the back ends up
  // being. The band used to be emitted at z 0.104 — wholly inside the 'small'
  // pack volume (z 0.087..0.217) — so on ren, warden, sol and iris, every
  // costume that has both, the single most legible identifying mark in the game
  // was invisible.
  let backZ = 0.118 * B;      // bare coat back
  if (gear.backpack === 'small') {
    sb.box(0, y(1.245), y(0.150), 0.24 * B, 0.30, 0.13, I.chest, [coatT[0] * 0.8, coatT[1] * 0.8, coatT[2] * 0.8]);
    backZ = 0.221;
  } else if (gear.backpack === 'bindle') {
    sb.box(0, y(1.270), y(0.166), 0.27 * B, 0.26, 0.19, I.chest, lin([0.42, 0.40, 0.35]));
    sb.box(y(0.06), y(1.36), y(0.15), 0.03, 0.2, 0.03, I.chest, lin([0.3, 0.28, 0.24]));
    backZ = 0.267;
  } else if (gear.backpack === 'canister') {
    sb.tube([
      { y: y(1.10), z: y(0.164), r: 0.072, rz: 0.072, bone: I.chest, tint: lin([0.28, 0.32, 0.36]) },
      { y: y(1.40), z: y(0.164), r: 0.076, rz: 0.076, bone: I.chest, tint: lin([0.32, 0.36, 0.40]) },
    ], 8, true, true);
    sb.box(0, y(1.44), y(0.164), 0.09, 0.05, 0.09, I.chest, lin([0.5, 0.52, 0.54]));
    backZ = 0.246;
  } else if (gear.backpack === 'medkit') {
    sb.box(0, y(1.24), y(0.150), 0.25 * B, 0.28, 0.12, I.chest, lin([0.22, 0.28, 0.24]));
    sb.box(0, y(1.24), y(0.213), 0.09, 0.03, 0.006, I.chest, lin([1.6, 1.6, 1.5]));
    sb.box(0, y(1.24), y(0.213), 0.03, 0.09, 0.006, I.chest, lin([1.6, 1.6, 1.5]));
    backZ = 0.216;
  }

  if (gear.hiVis) {
    const hv = hex(gear.hiVis);
    const bright = [hv[0] * 1.8, hv[1] * 1.8, hv[2] * 1.8];
    // Reflective band across the back — the thing you see first in the smoke,
    // and the reason you can tell a Warden from a scavenger at 30 m. Placed on
    // the outermost back surface, whatever that turns out to be.
    sb.box(0, y(1.352), y(backZ), 0.30 * B, 0.05, 0.012, I.chest, bright);
    sb.box(0, y(1.352), y(-0.118 * B), 0.24 * B, 0.05, 0.012, I.chest, bright);
  }

  const geometry = sb.build();
  const skeleton = new THREE.Skeleton(bones);

  return {
    skeleton, geometry, bones,
    root: bones[0],
    height: 1.78 * S,
    boneIndex: I,
    triangles: sb.idx.length / 3,
  };
}

/** Build a quadruped on the shared bone names. */
function buildQuadruped(C, sides, S, rng) {
  const bones = QUAD_BONES.map(([name, parent, x, y, z]) => {
    const b = new THREE.Bone();
    b.name = name;
    b.userData.parentName = parent;
    b.userData.bind = new THREE.Vector3(x * S, y * S, z * S);
    return b;
  });
  for (let i = 0; i < bones.length; i++) {
    const p = QUAD_BONES[i][1];
    if (p === null) continue;
    const parent = bones[BONE_INDEX[p]];
    parent.add(bones[i]);
    const bp = parent.userData.bind, me = bones[i].userData.bind;
    bones[i].position.set(me.x - bp.x, me.y - bp.y, me.z - bp.z);
  }
  bones[0].position.copy(bones[0].userData.bind);

  const I = BONE_INDEX;
  const sb = new SkinBuilder();
  const coat = hex(C.coat), belly = hex(C.coatTrim), dark = hex(C.boot);
  const j = () => 1 + rng.sym(0.06);
  const t = (c) => [c[0] * j(), c[1] * j(), c[2] * j()];
  const y = (v) => v * S;

  // Body: a horizontal loft from haunch to shoulder. Built as a vertical tube
  // then re-mapped — the SkinBuilder sweeps along Y, so the "y" of each ring is
  // used as Z here and the ring is placed by its x/z offsets.
  const body = [
    { z: 0.42, r: 0.095, ry: 0.10, bone: I.hips },
    { z: 0.30, r: 0.135, ry: 0.145, bone: I.hips },
    { z: 0.14, r: 0.140, ry: 0.150, bone: I.spine, bone2: I.hips, w2: 0.4 },
    { z: -0.02, r: 0.132, ry: 0.146, bone: I.spine },
    { z: -0.16, r: 0.140, ry: 0.152, bone: I.chest, bone2: I.spine, w2: 0.4 },
    { z: -0.28, r: 0.122, ry: 0.132, bone: I.chest },
  ];
  // Emit the body by hand so the sweep axis is Z.
  const emitTube = (rings, bone2Default, tint, segs) => {
    const start = sb.n;
    for (let ri = 0; ri < rings.length; ri++) {
      const R = rings[ri];
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * TAU;
        const cx = Math.cos(a), cy = Math.sin(a);
        sb.pos.push((R.x || 0) + cx * R.r, y((R.yc ?? 0.52) + cy * R.ry), y(R.z));
        const nl = Math.hypot(cx, cy) || 1;
        sb.nrm.push(cx / nl, cy / nl, 0);
        sb.uv.push(s / segs, ri / (rings.length - 1));
        sb.col.push(tint[0], tint[1], tint[2]);
        const w2 = R.bone2 !== undefined ? (R.w2 ?? 0) : 0;
        sb.skinIndex.push(R.bone, R.bone2 ?? R.bone, 0, 0);
        sb.skinWeight.push(1 - w2, w2, 0, 0);
        sb.n++;
      }
    }
    const row = segs + 1;
    for (let ri = 0; ri < rings.length - 1; ri++) {
      for (let s = 0; s < segs; s++) {
        const a = start + ri * row + s;
        sb.idx.push(a, a + row, a + row + 1, a, a + row + 1, a + 1);
      }
    }
  };
  emitTube(body.map((r) => ({ ...r, x: 0, yc: 0.52 })), null, t(coat), sides);

  // Head and muzzle.
  sb.box(0, y(0.552), y(-0.40), 0.135, 0.135, 0.14, I.head, t(coat));
  sb.box(0, y(0.528), y(-0.505), 0.085, 0.078, 0.10, I.head, t(coat));
  sb.box(0, y(0.512), y(-0.556), 0.062, 0.05, 0.032, I.head, dark);
  // Ears — the read that says "dog" at forty metres.
  for (const side of [1, -1]) {
    sb.box(y(0.052 * side), y(0.628), y(-0.352), 0.045, 0.09, 0.028, I.head, t(coat), 0.24 * side);
  }
  // Neck
  sb.box(0, y(0.556), y(-0.30), 0.115, 0.115, 0.13, I.neck, t(coat));

  // Legs. Front pair drives off arm/forearm, rear off thigh/shin, which is
  // exactly what the locomotion layer already animates in opposition.
  const leg = (upperBone, lowerBone, footBone, px, pz, upperY, lowerY) => {
    sb.box(y(px), y(upperY), y(pz), 0.066, 0.20, 0.078, upperBone, t(coat));
    sb.box(y(px), y(lowerY), y(pz), 0.05, 0.20, 0.058, lowerBone, t(coat));
    sb.box(y(px), y(0.045), y(pz - 0.02), 0.058, 0.05, 0.10, footBone, dark);
  };
  for (const side of [1, -1]) {
    const L = side > 0 ? 'L' : 'R';
    leg(I['armL'.replace('L', L)], I['forearmL'.replace('L', L)], I['handL'.replace('L', L)],
        0.112 * side, -0.215, 0.400, 0.185);
    leg(I['thighL'.replace('L', L)], I['shinL'.replace('L', L)], I['footL'.replace('L', L)],
        0.115 * side, 0.300, 0.400, 0.185);
  }

  // Underside, lighter — a real animal is not one flat colour.
  sb.box(0, y(0.440), y(0.06), 0.20, 0.05, 0.5, I.spine, t(belly));
  // Tail
  sb.box(0, y(0.520), y(0.50), 0.05, 0.05, 0.20, I.hips, t(coat));
  sb.box(0, y(0.500), y(0.62), 0.038, 0.038, 0.14, I.hips, t(coat));

  const geometry = sb.build();
  const skeleton = new THREE.Skeleton(bones);
  return {
    skeleton, geometry, bones, root: bones[0],
    height: 0.72 * S, boneIndex: I, triangles: sb.idx.length / 3, quadruped: true,
  };
}

/**
 * Held-weapon meshes. Small, rigid, parented to a hand bone at runtime.
 */
export function buildWeapon(kind, mats) {
  const g = new THREE.Group();
  g.name = `weapon:${kind}`;
  const steel = mats.character(0x5a5c5e, { roughness: 0.55, metalness: 0.6, flat: true });
  const dark = mats.character(0x24211d, { roughness: 0.9, flat: true });
  const tape = mats.character(0x3c3830, { roughness: 0.95, flat: true });
  const rust = mats.character(0x6b4a34, { roughness: 0.95, metalness: 0.2, flat: true });

  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    g.add(m);
    return m;
  };

  switch (kind) {
    case 'prybar': {
      // Ren's tool. A rescue bar: flat, heavy, and the first thing she reaches for.
      add(new THREE.BoxGeometry(0.028, 0.86, 0.034), steel, 0, 0.30, 0);
      add(new THREE.BoxGeometry(0.026, 0.16, 0.062), steel, 0, 0.74, -0.02, 0.5);
      add(new THREE.BoxGeometry(0.03, 0.20, 0.038), tape, 0, -0.04, 0);
      add(new THREE.BoxGeometry(0.034, 0.05, 0.09), steel, 0, -0.14, -0.02, -0.35);
      break;
    }
    case 'pipe': {
      add(new THREE.CylinderGeometry(0.022, 0.024, 0.82, 7), rust, 0, 0.30, 0);
      add(new THREE.CylinderGeometry(0.032, 0.032, 0.07, 7), rust, 0, 0.70, 0);
      add(new THREE.CylinderGeometry(0.028, 0.028, 0.18, 7), tape, 0, -0.04, 0);
      break;
    }
    case 'axe': {
      add(new THREE.BoxGeometry(0.032, 0.78, 0.042), dark, 0, 0.28, 0);
      add(new THREE.BoxGeometry(0.03, 0.20, 0.16), steel, 0, 0.66, -0.06);
      add(new THREE.BoxGeometry(0.014, 0.24, 0.05), steel, 0, 0.66, -0.16);
      add(new THREE.BoxGeometry(0.036, 0.16, 0.046), tape, 0, -0.02, 0);
      break;
    }
    case 'sledge': {
      add(new THREE.CylinderGeometry(0.026, 0.03, 1.02, 7), dark, 0, 0.34, 0);
      add(new THREE.BoxGeometry(0.10, 0.12, 0.30), steel, 0, 0.84, 0);
      add(new THREE.CylinderGeometry(0.032, 0.032, 0.2, 7), tape, 0, -0.10, 0);
      break;
    }
    case 'baton': {
      add(new THREE.CylinderGeometry(0.018, 0.022, 0.56, 7), dark, 0, 0.20, 0);
      add(new THREE.CylinderGeometry(0.026, 0.026, 0.14, 7), tape, 0, -0.08, 0);
      add(new THREE.SphereGeometry(0.026, 7, 5), steel, 0, 0.48, 0);
      break;
    }
    case 'shield': {
      // Warden riot shield: a scavenged sign panel on a frame.
      add(new THREE.BoxGeometry(0.5, 0.82, 0.04), mats.character(0x2c333b, { roughness: 0.6, metalness: 0.3, flat: true }), 0, 0.16, -0.06);
      add(new THREE.BoxGeometry(0.52, 0.06, 0.05), steel, 0, 0.55, -0.06);
      add(new THREE.BoxGeometry(0.06, 0.20, 0.06), dark, 0, 0.14, 0.0);
      break;
    }
    case 'lamp': {
      add(new THREE.CylinderGeometry(0.045, 0.05, 0.16, 8), steel, 0, 0.08, 0);
      add(new THREE.CylinderGeometry(0.042, 0.042, 0.02, 8), mats.glow(0xffd9a0, 3.4), 0, 0.17, 0);
      break;
    }
    case 'meter': {
      // The gas meter Ren carries. Reading it is a verb in this game.
      add(new THREE.BoxGeometry(0.09, 0.13, 0.04), mats.character(0x33383c, { roughness: 0.7, flat: true }), 0, 0.06, 0);
      add(new THREE.BoxGeometry(0.062, 0.05, 0.006), mats.glow(0x9fe06a, 1.7), 0, 0.09, -0.022);
      add(new THREE.BoxGeometry(0.03, 0.02, 0.03), steel, 0, 0.13, 0);
      break;
    }
    default:
      add(new THREE.BoxGeometry(0.04, 0.5, 0.04), steel, 0, 0.2, 0);
  }
  return g;
}
