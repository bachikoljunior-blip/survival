/**
 * Animation.
 *
 * A hybrid system, because the two halves of character motion want opposite
 * things:
 *
 *   LOCOMOTION is fully procedural. Walking, running, strafing, turning and
 *   the transitions between them are generated from speed and heading, so they
 *   blend continuously and never pop. There is no run/walk crossfade to tune
 *   because there are no two clips to cross.
 *
 *   ACTIONS are authored clips — swings, dodges, hit reactions, deaths. These
 *   need exact timing because combat windows are read off them, and exact poses
 *   because weight and intent live in the extremes.
 *
 * On top sit additive layers: breathing, look-at, lean into turns, recoil,
 * flinch, and the cough that carbon monoxide brings on. Those are what stop a
 * character from looking like a puppet standing still between commands.
 *
 * Poses are stored as per-bone Euler triples, which blend acceptably over the
 * angular ranges a humanoid actually uses and are far cheaper than slerping
 * twenty quaternions per layer per frame.
 */

import * as THREE from 'three';
import { BONE_INDEX, BONES } from './rig.js';
import { clamp, clamp01, lerp, damp, smoothstep, TAU, angleDelta } from '../core/util.js';

const NB = BONES.length;
const I = BONE_INDEX;

/** A pose is 3 floats (XYZ Euler, radians) per bone plus a root offset. */
export function makePose() {
  return { e: new Float32Array(NB * 3), rootY: 0, rootX: 0, rootZ: 0 };
}

function poseCopy(dst, src) {
  dst.e.set(src.e);
  dst.rootY = src.rootY; dst.rootX = src.rootX; dst.rootZ = src.rootZ;
}

function poseZero(p) {
  p.e.fill(0);
  p.rootY = p.rootX = p.rootZ = 0;
}

/** dst = lerp(dst, src, w), optionally restricted to a bone mask. */
function poseBlend(dst, src, w, mask) {
  if (w <= 0) return;
  if (w >= 1 && !mask) { poseCopy(dst, src); return; }
  for (let i = 0; i < NB; i++) {
    const m = mask ? mask[i] : 1;
    const k = w * m;
    if (k <= 0) continue;
    const o = i * 3;
    dst.e[o] += (src.e[o] - dst.e[o]) * k;
    dst.e[o + 1] += (src.e[o + 1] - dst.e[o + 1]) * k;
    dst.e[o + 2] += (src.e[o + 2] - dst.e[o + 2]) * k;
  }
  dst.rootY += (src.rootY - dst.rootY) * w;
  dst.rootX += (src.rootX - dst.rootX) * w;
  dst.rootZ += (src.rootZ - dst.rootZ) * w;
}

/** dst += src * w (additive layers). */
function poseAdd(dst, src, w, mask) {
  if (w <= 0) return;
  for (let i = 0; i < NB; i++) {
    const m = mask ? mask[i] : 1;
    const k = w * m;
    if (k <= 0) continue;
    const o = i * 3;
    dst.e[o] += src.e[o] * k;
    dst.e[o + 1] += src.e[o + 1] * k;
    dst.e[o + 2] += src.e[o + 2] * k;
  }
  dst.rootY += src.rootY * w;
  dst.rootX += src.rootX * w;
  dst.rootZ += src.rootZ * w;
}

/** Bone masks. */
function mask(names, value = 1, base = 0) {
  const m = new Float32Array(NB).fill(base);
  for (const n of names) {
    if (I[n] !== undefined) m[I[n]] = value;
  }
  return m;
}

export const MASK = {
  upper: mask(['spine', 'chest', 'neck', 'head', 'shoulderL', 'armL', 'forearmL', 'handL',
               'shoulderR', 'armR', 'forearmR', 'handR'], 1, 0),
  upperSoft: (() => {
    const m = mask(['chest', 'neck', 'head', 'shoulderL', 'armL', 'forearmL', 'handL',
                    'shoulderR', 'armR', 'forearmR', 'handR'], 1, 0);
    m[I.spine] = 0.7; m[I.hips] = 0.25;
    return m;
  })(),
  lower: mask(['hips', 'thighL', 'shinL', 'footL', 'toeL', 'thighR', 'shinR', 'footR', 'toeR'], 1, 0),
  armR: mask(['shoulderR', 'armR', 'forearmR', 'handR'], 1, 0),
  armL: mask(['shoulderL', 'armL', 'forearmL', 'handL'], 1, 0),
  head: mask(['neck', 'head'], 1, 0),
  full: new Float32Array(NB).fill(1),
};

// ---------------------------------------------------------------- clips -----

/**
 * Per-key interpolation modes.
 *
 * A key's mode governs the segment LEAVING it. Smootherstep everywhere means
 * zero derivative at both ends of every segment, so a swing decelerates to a
 * dead stop exactly at the moment of contact — the one frame where the motion
 * must be fastest. That is the difference between a hit that lands and a hit
 * that arrives.
 */
const EASE = {
  ease:   (u) => u * u * u * (u * (u * 6 - 15) + 10),   // in and out — rest poses
  linear: (u) => u,
  accel:  (u) => u * u,                                 // wind-up -> contact
  decel:  (u) => 1 - (1 - u) * (1 - u),                 // contact -> follow-through
  snap:   (u) => (u >= 1 ? 1 : 0),
};

/**
 * Clip authoring helper. `tracks` maps bone name -> array of
 * [time, rx, ry, rz, mode?] in radians. Times are normalised 0..1 of the clip.
 * `mode` is one of 'ease' (default) | 'linear' | 'accel' | 'decel' | 'snap'
 * and applies to the segment that leaves this key.
 *
 * `opts.strike` = [windupT, impactT] stamps the timing automatically across
 * every track: the key at the wind-up extreme accelerates into contact, and the
 * contact key decelerates out of it. Authoring it once per clip beats tagging
 * forty individual keys and getting one of them wrong.
 */
export function clip(name, dur, tracks, opts = {}) {
  const compiled = [];
  const stamp = (keys) => {
    if (!opts.strike) return keys;
    const [wu, hit] = opts.strike;
    for (const k of keys) {
      if (k[4]) continue;
      if (Math.abs(k[0] - wu) < 0.055) k[4] = 'accel';
      else if (Math.abs(k[0] - hit) < 0.055) k[4] = 'decel';
    }
    return keys;
  };
  for (const bone in tracks) {
    const bi = I[bone];
    if (bi === undefined) continue;
    const keys = stamp(tracks[bone].map((k) => k.slice()).sort((a, b) => a[0] - b[0]));
    compiled.push({ bi, keys });
  }
  if (opts.root) opts.root = stamp(opts.root.map((k) => k.slice()));
  return {
    name, dur,
    loop: !!opts.loop,
    mask: opts.mask || null,
    additive: !!opts.additive,
    root: opts.root || null,        // [time, y] pairs for root motion
    events: opts.events || [],      // [{ t, name }]
    tracks: compiled,
  };
}

/** Sample a clip into `out` at normalised time t (0..1). */
export function sampleClip(c, t, out) {
  poseZero(out);
  for (const tr of c.tracks) {
    const keys = tr.keys;
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1][0] < t) i++;
    const a = keys[i];
    const b = keys[Math.min(keys.length - 1, i + 1)];
    let u = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
    u = clamp01(u);
    // The key we are leaving owns the curve of this segment.
    u = (EASE[a[4]] || EASE.ease)(u);
    const o = tr.bi * 3;
    out.e[o] = a[1] + (b[1] - a[1]) * u;
    out.e[o + 1] = a[2] + (b[2] - a[2]) * u;
    out.e[o + 2] = a[3] + (b[3] - a[3]) * u;
  }
  if (c.root) {
    const keys = c.root;
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1][0] < t) i++;
    const a = keys[i], b = keys[Math.min(keys.length - 1, i + 1)];
    let u = b[0] === a[0] ? 0 : clamp01((t - a[0]) / (b[0] - a[0]));
    u = (EASE[a[4]] || EASE.ease)(u);
    out.rootY = a[1] + (b[1] - a[1]) * u;
    out.rootZ = (a[2] || 0) + ((b[2] || 0) - (a[2] || 0)) * u;
    out.rootX = (a[3] || 0) + ((b[3] || 0) - (a[3] || 0)) * u;
  }
}

const D = Math.PI / 180;

/**
 * The clip library.
 *
 * Poses are authored as extremes with deliberate anticipation and follow
 * through: every swing winds up away from the target first and overshoots past
 * it after, because that is where the weight is felt.
 */
export const CLIPS = {};

function reg(c) { CLIPS[c.name] = c; return c; }

// --- attacks -------------------------------------------------------------
// A three-beat chain. Each ends in a different guard so the next reads as a
// continuation rather than a reset.

reg(clip('atk1', 0.62, {
  // Diagonal downward swing, right to left. Wind-up is short; this is the
  // opener and it needs to come out fast.
  hips:    [[0, 0, 22 * D, 0], [0.2, 0, 34 * D, 0], [0.45, 0, -26 * D, 0], [1, 0, 0, 0]],
  spine:   [[0, 0, 16 * D, 0], [0.2, 0, 26 * D, 0], [0.45, 0, -20 * D, 0], [1, 0, 0, 0]],
  chest:   [[0, -6 * D, 18 * D, 0], [0.2, -14 * D, 30 * D, 0], [0.45, 10 * D, -24 * D, 0], [1, 0, 0, 0]],
  neck:    [[0, 6 * D, -10 * D, 0], [0.45, -4 * D, 14 * D, 0], [1, 0, 0, 0]],
  armR:    [[0, -50 * D, -20 * D, -30 * D], [0.2, -110 * D, -34 * D, -46 * D], [0.44, 26 * D, 22 * D, 44 * D], [0.62, -6 * D, 0, 16 * D], [1, -34 * D, 0, -12 * D]],
  forearmR:[[0, -46 * D, 0, 0], [0.2, -96 * D, 0, 0], [0.44, -14 * D, 0, 0], [1, -52 * D, 0, 0]],
  handR:   [[0, 0, 0, 0], [0.44, 16 * D, 0, 0], [1, 0, 0, 0]],
  armL:    [[0, -28 * D, 14 * D, 24 * D], [0.2, -14 * D, 22 * D, 34 * D], [0.44, -54 * D, 6 * D, 16 * D], [1, -30 * D, 0, 20 * D]],
  forearmL:[[0, -66 * D, 0, 0], [0.44, -40 * D, 0, 0], [1, -60 * D, 0, 0]],
  thighL:  [[0, 12 * D, 0, 0], [0.2, 4 * D, 0, 0], [0.45, 22 * D, 0, 0], [1, 0, 0, 0]],
  thighR:  [[0, -14 * D, 0, 0], [0.2, -4 * D, 0, 0], [0.45, -20 * D, 0, 0], [1, 0, 0, 0]],
  shinL:   [[0, -14 * D, 0, 0], [0.45, -24 * D, 0, 0], [1, -8 * D, 0, 0]],
  shinR:   [[0, -8 * D, 0, 0], [0.45, -14 * D, 0, 0], [1, -8 * D, 0, 0]],
}, {
  mask: MASK.full,
  // Root Z was positive at the strike: 160 mm toward the character's BACK at
  // the exact frame of contact. Every attack in the game lunged away from the
  // target. Negated; compare `vault`, whose root Z goes to -1.0 and which is
  // the one clip that was already correct.
  root: [[0, 0, 0], [0.2, -0.03, 0.02], [0.45, 0.01, -0.16], [1, 0, 0]],
  strike: [0.2, 0.44],
  events: [{ t: 0.30, name: 'windup' }, { t: 0.40, name: 'hit' }, { t: 0.56, name: 'recover' }],
}));

reg(clip('atk2', 0.66, {
  // Backhand return, left to right, lower line.
  hips:    [[0, 0, -20 * D, 0], [0.22, 0, -32 * D, 0], [0.48, 0, 28 * D, 0], [1, 0, 0, 0]],
  spine:   [[0, 0, -14 * D, 0], [0.22, 0, -24 * D, 0], [0.48, 0, 22 * D, 0], [1, 0, 0, 0]],
  chest:   [[0, 4 * D, -18 * D, 0], [0.22, 12 * D, -30 * D, 0], [0.48, -8 * D, 26 * D, 0], [1, 0, 0, 0]],
  neck:    [[0, -4 * D, 12 * D, 0], [0.48, 4 * D, -14 * D, 0], [1, 0, 0, 0]],
  armR:    [[0, -20 * D, 30 * D, 46 * D], [0.22, -6 * D, 52 * D, 70 * D], [0.47, -40 * D, -34 * D, -34 * D], [0.66, -24 * D, -6 * D, -6 * D], [1, -34 * D, 0, -12 * D]],
  forearmR:[[0, -30 * D, 0, 0], [0.22, -68 * D, 0, 0], [0.47, -20 * D, 0, 0], [1, -52 * D, 0, 0]],
  armL:    [[0, -34 * D, -6 * D, 16 * D], [0.22, -46 * D, -18 * D, 8 * D], [0.47, -18 * D, 18 * D, 34 * D], [1, -30 * D, 0, 20 * D]],
  forearmL:[[0, -50 * D, 0, 0], [0.47, -72 * D, 0, 0], [1, -60 * D, 0, 0]],
  thighL:  [[0, -8 * D, 0, 0], [0.48, -18 * D, 0, 0], [1, 0, 0, 0]],
  thighR:  [[0, 10 * D, 0, 0], [0.48, 24 * D, 0, 0], [1, 0, 0, 0]],
  shinR:   [[0, -12 * D, 0, 0], [0.48, -30 * D, 0, 0], [1, -8 * D, 0, 0]],
}, {
  mask: MASK.full,
  root: [[0, 0, 0], [0.22, -0.02, 0.02], [0.48, 0.0, -0.2], [1, 0, 0]],
  strike: [0.22, 0.47],
  events: [{ t: 0.32, name: 'windup' }, { t: 0.44, name: 'hit' }, { t: 0.6, name: 'recover' }],
}));

reg(clip('atk3', 0.9, {
  // Finisher: a two-handed overhead. Long wind-up, big commit, hard landing.
  hips:    [[0, 0, 10 * D, 0], [0.3, -18 * D, 16 * D, 0], [0.56, 26 * D, -8 * D, 0], [0.72, 12 * D, 0, 0], [1, 0, 0, 0]],
  spine:   [[0, 0, 8 * D, 0], [0.3, -30 * D, 12 * D, 0], [0.56, 34 * D, -6 * D, 0], [1, 0, 0, 0]],
  chest:   [[0, 0, 6 * D, 0], [0.3, -34 * D, 10 * D, 0], [0.56, 40 * D, -4 * D, 0], [1, 0, 0, 0]],
  neck:    [[0, 0, 0, 0], [0.3, 16 * D, 0, 0], [0.56, -20 * D, 0, 0], [1, 0, 0, 0]],
  // Wind-up clamped to -150: past about -155 the YXZ Euler blend runs into the
  // degenerate region on the middle-order axis and the additive look-at layer
  // adds Y on top of it, which flips the arm on the finisher. The reach the
  // clamp costs is taken back on the chest and spine below, which is where an
  // overhead should be coming from anyway.
  armR:    [[0, -40 * D, 0, -20 * D], [0.3, -150 * D, -16 * D, -26 * D], [0.55, 46 * D, 10 * D, 8 * D], [0.75, 4 * D, 0, 0], [1, -34 * D, 0, -12 * D]],
  forearmR:[[0, -40 * D, 0, 0], [0.3, -122 * D, 0, 0], [0.55, -6 * D, 0, 0], [1, -52 * D, 0, 0]],
  armL:    [[0, -40 * D, 0, 20 * D], [0.3, -148 * D, 16 * D, 26 * D], [0.55, 42 * D, -10 * D, -8 * D], [0.75, 4 * D, 0, 0], [1, -30 * D, 0, 20 * D]],
  forearmL:[[0, -44 * D, 0, 0], [0.3, -118 * D, 0, 0], [0.55, -6 * D, 0, 0], [1, -60 * D, 0, 0]],
  thighL:  [[0, 6 * D, 0, 0], [0.3, -14 * D, 0, 0], [0.56, 34 * D, 0, 0], [1, 0, 0, 0]],
  thighR:  [[0, -6 * D, 0, 0], [0.3, 10 * D, 0, 0], [0.56, -26 * D, 0, 0], [1, 0, 0, 0]],
  shinL:   [[0, -10 * D, 0, 0], [0.56, -46 * D, 0, 0], [1, -8 * D, 0, 0]],
  shinR:   [[0, -10 * D, 0, 0], [0.56, -20 * D, 0, 0], [1, -8 * D, 0, 0]],
}, {
  mask: MASK.full,
  root: [[0, 0, 0], [0.3, 0.06, 0.06], [0.56, -0.12, -0.30], [0.75, -0.04, -0.30], [1, 0, 0]],
  strike: [0.3, 0.55],
  events: [{ t: 0.42, name: 'windup' }, { t: 0.54, name: 'hit' }, { t: 0.78, name: 'recover' }],
}));

reg(clip('heavy', 1.1, {
  // Charged horizontal sweep. Slow, wide, and it goes through guards.
  hips:    [[0, 0, 40 * D, 0], [0.42, 0, 62 * D, 0], [0.66, 0, -62 * D, 0], [0.84, 0, -34 * D, 0], [1, 0, 0, 0]],
  spine:   [[0, 0, 26 * D, 0], [0.42, 0, 44 * D, 0], [0.66, 0, -44 * D, 0], [1, 0, 0, 0]],
  chest:   [[0, -8 * D, 30 * D, 0], [0.42, -16 * D, 50 * D, 0], [0.66, 8 * D, -48 * D, 0], [1, 0, 0, 0]],
  neck:    [[0, 0, -18 * D, 0], [0.42, 0, -30 * D, 0], [0.66, 0, 26 * D, 0], [1, 0, 0, 0]],
  armR:    [[0, -30 * D, -46 * D, 10 * D], [0.42, -20 * D, -84 * D, 22 * D], [0.65, -26 * D, 74 * D, 30 * D], [0.85, -30 * D, 24 * D, 6 * D], [1, -34 * D, 0, -12 * D]],
  forearmR:[[0, -34 * D, 0, 0], [0.42, -56 * D, 0, 0], [0.65, -18 * D, 0, 0], [1, -52 * D, 0, 0]],
  armL:    [[0, -34 * D, -30 * D, 4 * D], [0.42, -26 * D, -58 * D, 0], [0.65, -30 * D, 50 * D, 26 * D], [1, -30 * D, 0, 20 * D]],
  forearmL:[[0, -50 * D, 0, 0], [0.42, -66 * D, 0, 0], [0.65, -30 * D, 0, 0], [1, -60 * D, 0, 0]],
  thighL:  [[0, 16 * D, 0, 0], [0.42, 24 * D, 0, 0], [0.66, -14 * D, 0, 0], [1, 0, 0, 0]],
  thighR:  [[0, -18 * D, 0, 0], [0.42, -26 * D, 0, 0], [0.66, 18 * D, 0, 0], [1, 0, 0, 0]],
  shinL:   [[0, -16 * D, 0, 0], [0.66, -26 * D, 0, 0], [1, -8 * D, 0, 0]],
  shinR:   [[0, -16 * D, 0, 0], [0.66, -22 * D, 0, 0], [1, -8 * D, 0, 0]],
}, {
  mask: MASK.full,
  root: [[0, 0, 0], [0.42, -0.06, 0.04], [0.66, 0.0, -0.34], [1, 0, 0]],
  strike: [0.42, 0.65],
  events: [{ t: 0.5, name: 'windup' }, { t: 0.62, name: 'hit' }, { t: 0.9, name: 'recover' }],
}));

// --- defence -------------------------------------------------------------

reg(clip('guard', 0.28, {
  hips:    [[0, 0, 12 * D, 0], [1, 0, 14 * D, 0]],
  spine:   [[0, 0, 8 * D, 0], [1, 6 * D, 10 * D, 0]],
  chest:   [[0, 0, 6 * D, 0], [1, 10 * D, 12 * D, 0]],
  neck:    [[0, 0, 0, 0], [1, -8 * D, -8 * D, 0]],
  armR:    [[0, -34 * D, 0, -12 * D], [1, -74 * D, -18 * D, -46 * D]],
  forearmR:[[0, -52 * D, 0, 0], [1, -104 * D, 0, 0]],
  armL:    [[0, -30 * D, 0, 20 * D], [1, -66 * D, 16 * D, 50 * D]],
  forearmL:[[0, -60 * D, 0, 0], [1, -110 * D, 0, 0]],
  thighL:  [[0, 0, 0, 0], [1, 14 * D, 0, 6 * D]],
  thighR:  [[0, 0, 0, 0], [1, -16 * D, 0, -6 * D]],
  shinL:   [[0, -8 * D, 0, 0], [1, -22 * D, 0, 0]],
  shinR:   [[0, -8 * D, 0, 0], [1, -24 * D, 0, 0]],
}, { mask: MASK.full }));

reg(clip('guardhit', 0.34, {
  chest:   [[0, 0, 0, 0], [0.18, 16 * D, 0, 0], [1, 0, 0, 0]],
  armR:    [[0, 0, 0, 0], [0.18, 22 * D, -14 * D, 0], [1, 0, 0, 0]],
  forearmR:[[0, 0, 0, 0], [0.18, 26 * D, 0, 0], [1, 0, 0, 0]],
  armL:    [[0, 0, 0, 0], [0.18, 20 * D, 12 * D, 0], [1, 0, 0, 0]],
  forearmL:[[0, 0, 0, 0], [0.18, 24 * D, 0, 0], [1, 0, 0, 0]],
  neck:    [[0, 0, 0, 0], [0.18, 10 * D, 0, 0], [1, 0, 0, 0]],
}, { additive: true, root: [[0, 0, 0], [0.18, 0, -0.1], [1, 0, 0]] }));

reg(clip('parry', 0.42, {
  hips:    [[0, 0, 14 * D, 0], [0.2, 0, -18 * D, 0], [1, 0, 12 * D, 0]],
  chest:   [[0, 0, 10 * D, 0], [0.2, -8 * D, -26 * D, 0], [1, 10 * D, 12 * D, 0]],
  armR:    [[0, -74 * D, -18 * D, -46 * D], [0.18, -96 * D, 44 * D, -66 * D], [1, -74 * D, -18 * D, -46 * D]],
  forearmR:[[0, -104 * D, 0, 0], [0.18, -62 * D, 0, 0], [1, -104 * D, 0, 0]],
  armL:    [[0, -66 * D, 16 * D, 50 * D], [0.18, -88 * D, 34 * D, 62 * D], [1, -66 * D, 16 * D, 50 * D]],
}, { mask: MASK.full, events: [{ t: 0.24, name: 'parrywindow' }] }));

// --- movement actions ----------------------------------------------------

reg(clip('dodge', 0.52, {
  // A shoulder-led evade, not a gymnastic roll. Ren is forty-one and wearing
  // eleven kilos of gear.
  hips:    [[0, 0, 0, 0], [0.16, 26 * D, 0, 0], [0.44, 12 * D, 0, 0], [1, 0, 0, 0]],
  spine:   [[0, 0, 0, 0], [0.16, 30 * D, 0, 0], [0.44, 8 * D, 0, 0], [1, 0, 0, 0]],
  chest:   [[0, 0, 0, 0], [0.16, 28 * D, 0, 0], [0.44, 6 * D, 0, 0], [1, 0, 0, 0]],
  neck:    [[0, 0, 0, 0], [0.16, 20 * D, 0, 0], [1, 0, 0, 0]],
  armR:    [[0, -34 * D, 0, -12 * D], [0.16, -88 * D, -20 * D, -34 * D], [1, -34 * D, 0, -12 * D]],
  forearmR:[[0, -52 * D, 0, 0], [0.16, -96 * D, 0, 0], [1, -52 * D, 0, 0]],
  armL:    [[0, -30 * D, 0, 20 * D], [0.16, -84 * D, 18 * D, 40 * D], [1, -30 * D, 0, 20 * D]],
  forearmL:[[0, -60 * D, 0, 0], [0.16, -100 * D, 0, 0], [1, -60 * D, 0, 0]],
  thighL:  [[0, 0, 0, 0], [0.16, 62 * D, 0, 0], [0.5, -24 * D, 0, 0], [1, 0, 0, 0]],
  thighR:  [[0, 0, 0, 0], [0.16, 44 * D, 0, 0], [0.5, -18 * D, 0, 0], [1, 0, 0, 0]],
  shinL:   [[0, -8 * D, 0, 0], [0.16, -96 * D, 0, 0], [0.5, -14 * D, 0, 0], [1, -8 * D, 0, 0]],
  shinR:   [[0, -8 * D, 0, 0], [0.16, -80 * D, 0, 0], [0.5, -10 * D, 0, 0], [1, -8 * D, 0, 0]],
}, {
  mask: MASK.full,
  root: [[0, 0, 0], [0.16, -0.28, 0], [0.44, -0.12, 0], [1, 0, 0]],
  events: [{ t: 0.05, name: 'iframeStart' }, { t: 0.42, name: 'iframeEnd' }],
}));

reg(clip('vault', 0.66, {
  hips:    [[0, 0, 0, 0], [0.3, 34 * D, 0, 0], [0.6, 10 * D, 0, 0], [1, 0, 0, 0]],
  spine:   [[0, 0, 0, 0], [0.3, 26 * D, 0, 0], [1, 0, 0, 0]],
  chest:   [[0, 0, 0, 0], [0.3, 22 * D, 0, 0], [1, 0, 0, 0]],
  armR:    [[0, -34 * D, 0, -12 * D], [0.24, -140 * D, -10 * D, -20 * D], [0.6, -50 * D, 0, -20 * D], [1, -34 * D, 0, -12 * D]],
  forearmR:[[0, -52 * D, 0, 0], [0.24, -20 * D, 0, 0], [1, -52 * D, 0, 0]],
  armL:    [[0, -30 * D, 0, 20 * D], [0.24, -136 * D, 10 * D, 26 * D], [0.6, -46 * D, 0, 26 * D], [1, -30 * D, 0, 20 * D]],
  forearmL:[[0, -60 * D, 0, 0], [0.24, -24 * D, 0, 0], [1, -60 * D, 0, 0]],
  thighL:  [[0, 0, 0, 0], [0.34, 86 * D, 0, 0], [0.66, -20 * D, 0, 0], [1, 0, 0, 0]],
  thighR:  [[0, 0, 0, 0], [0.34, 62 * D, 0, 0], [0.66, -14 * D, 0, 0], [1, 0, 0, 0]],
  shinL:   [[0, -8 * D, 0, 0], [0.34, -104 * D, 0, 0], [1, -8 * D, 0, 0]],
  shinR:   [[0, -8 * D, 0, 0], [0.34, -92 * D, 0, 0], [1, -8 * D, 0, 0]],
}, { mask: MASK.full, root: [[0, 0, 0], [0.34, 0.34, -0.5], [0.7, 0.06, -0.9], [1, 0, -1.0]] }));

reg(clip('land', 0.44, {
  hips:    [[0, 0, 0, 0], [0.18, 22 * D, 0, 0], [1, 0, 0, 0]],
  spine:   [[0, 0, 0, 0], [0.18, 16 * D, 0, 0], [1, 0, 0, 0]],
  chest:   [[0, 0, 0, 0], [0.18, 12 * D, 0, 0], [1, 0, 0, 0]],
  thighL:  [[0, 0, 0, 0], [0.18, 52 * D, 0, 0], [1, 0, 0, 0]],
  thighR:  [[0, 0, 0, 0], [0.18, 48 * D, 0, 0], [1, 0, 0, 0]],
  shinL:   [[0, -8 * D, 0, 0], [0.18, -84 * D, 0, 0], [1, -8 * D, 0, 0]],
  shinR:   [[0, -8 * D, 0, 0], [0.18, -78 * D, 0, 0], [1, -8 * D, 0, 0]],
  armR:    [[0, 0, 0, 0], [0.18, -50 * D, 0, -26 * D], [1, 0, 0, 0]],
  armL:    [[0, 0, 0, 0], [0.18, -46 * D, 0, 26 * D], [1, 0, 0, 0]],
}, { mask: MASK.full, root: [[0, 0, 0], [0.18, -0.26, 0], [1, 0, 0]] }));

// --- reactions -----------------------------------------------------------

reg(clip('hitLight', 0.36, {
  hips:    [[0, 0, 0, 0], [0.15, -8 * D, 6 * D, 0], [1, 0, 0, 0]],
  spine:   [[0, 0, 0, 0], [0.15, -14 * D, 10 * D, 0], [1, 0, 0, 0]],
  chest:   [[0, 0, 0, 0], [0.15, -18 * D, 14 * D, 0], [1, 0, 0, 0]],
  neck:    [[0, 0, 0, 0], [0.15, -22 * D, 12 * D, 0], [1, 0, 0, 0]],
  armR:    [[0, 0, 0, 0], [0.15, 20 * D, 0, -20 * D], [1, 0, 0, 0]],
  armL:    [[0, 0, 0, 0], [0.15, 16 * D, 0, 20 * D], [1, 0, 0, 0]],
}, { additive: true, root: [[0, 0, 0], [0.15, 0, -0.14], [1, 0, 0]] }));

reg(clip('hitHeavy', 0.62, {
  hips:    [[0, 0, 0, 0], [0.2, -20 * D, 14 * D, 0], [0.5, -6 * D, 4 * D, 0], [1, 0, 0, 0]],
  spine:   [[0, 0, 0, 0], [0.2, -30 * D, 20 * D, 0], [1, 0, 0, 0]],
  chest:   [[0, 0, 0, 0], [0.2, -34 * D, 24 * D, 0], [1, 0, 0, 0]],
  neck:    [[0, 0, 0, 0], [0.2, -40 * D, 20 * D, 0], [1, 0, 0, 0]],
  armR:    [[0, 0, 0, 0], [0.2, 44 * D, -10 * D, -40 * D], [1, 0, 0, 0]],
  armL:    [[0, 0, 0, 0], [0.2, 40 * D, 10 * D, 40 * D], [1, 0, 0, 0]],
  thighL:  [[0, 0, 0, 0], [0.2, -22 * D, 0, 0], [1, 0, 0, 0]],
  thighR:  [[0, 0, 0, 0], [0.2, 12 * D, 0, 0], [1, 0, 0, 0]],
}, { additive: true, root: [[0, 0, 0], [0.2, -0.06, -0.44], [0.6, 0, -0.16], [1, 0, 0]] }));

reg(clip('stagger', 0.9, {
  hips:    [[0, 0, 0, 0], [0.2, -26 * D, 20 * D, 0], [0.5, -14 * D, -16 * D, 0], [0.75, -8 * D, 8 * D, 0], [1, 0, 0, 0]],
  spine:   [[0, 0, 0, 0], [0.2, -34 * D, 24 * D, 0], [0.5, -20 * D, -18 * D, 0], [1, 0, 0, 0]],
  chest:   [[0, 0, 0, 0], [0.2, -30 * D, 26 * D, 0], [0.5, -18 * D, -20 * D, 0], [1, 0, 0, 0]],
  neck:    [[0, 0, 0, 0], [0.2, -30 * D, 18 * D, 0], [0.5, -14 * D, -14 * D, 0], [1, 0, 0, 0]],
  armR:    [[0, -34 * D, 0, -12 * D], [0.2, 30 * D, -20 * D, -46 * D], [0.5, -10 * D, 16 * D, -30 * D], [1, -34 * D, 0, -12 * D]],
  armL:    [[0, -30 * D, 0, 20 * D], [0.2, 26 * D, 20 * D, 50 * D], [0.5, -14 * D, -14 * D, 34 * D], [1, -30 * D, 0, 20 * D]],
  thighL:  [[0, 0, 0, 0], [0.24, -34 * D, 0, 0], [0.52, 30 * D, 0, 0], [1, 0, 0, 0]],
  thighR:  [[0, 0, 0, 0], [0.24, 26 * D, 0, 0], [0.52, -28 * D, 0, 0], [1, 0, 0, 0]],
  shinL:   [[0, -8 * D, 0, 0], [0.24, -12 * D, 0, 0], [0.52, -54 * D, 0, 0], [1, -8 * D, 0, 0]],
  shinR:   [[0, -8 * D, 0, 0], [0.24, -46 * D, 0, 0], [1, -8 * D, 0, 0]],
}, { mask: MASK.full, root: [[0, 0, 0], [0.2, -0.1, -0.6], [0.55, -0.04, -0.34], [1, 0, 0]] }));

reg(clip('death', 1.5, {
  hips:    [[0, 0, 0, 0], [0.2, -22 * D, 16 * D, 0], [0.55, 46 * D, 22 * D, 0], [1, 86 * D, 24 * D, 0]],
  spine:   [[0, 0, 0, 0], [0.2, -18 * D, 12 * D, 0], [0.55, 30 * D, 10 * D, 0], [1, 20 * D, 8 * D, 0]],
  chest:   [[0, 0, 0, 0], [0.2, -14 * D, 10 * D, 0], [1, 16 * D, 6 * D, 0]],
  neck:    [[0, 0, 0, 0], [0.2, -20 * D, 0, 0], [1, 26 * D, 0, 0]],
  armR:    [[0, -34 * D, 0, -12 * D], [0.3, 30 * D, -20 * D, -50 * D], [1, 12 * D, -30 * D, -66 * D]],
  forearmR:[[0, -52 * D, 0, 0], [1, -14 * D, 0, 0]],
  armL:    [[0, -30 * D, 0, 20 * D], [0.3, 26 * D, 20 * D, 54 * D], [1, 8 * D, 30 * D, 70 * D]],
  forearmL:[[0, -60 * D, 0, 0], [1, -18 * D, 0, 0]],
  thighL:  [[0, 0, 0, 0], [0.4, -30 * D, 0, 0], [1, 24 * D, 0, 10 * D]],
  thighR:  [[0, 0, 0, 0], [0.4, 20 * D, 0, 0], [1, 40 * D, 0, -14 * D]],
  shinL:   [[0, -8 * D, 0, 0], [1, -70 * D, 0, 0]],
  shinR:   [[0, -8 * D, 0, 0], [1, -46 * D, 0, 0]],
}, { mask: MASK.full, root: [[0, 0, 0], [0.25, -0.12, -0.4], [0.6, -0.62, -0.62], [1, -0.86, -0.7]] }));

// --- non-combat ----------------------------------------------------------

reg(clip('interact', 0.9, {
  hips:    [[0, 0, 0, 0], [0.35, 16 * D, 0, 0], [0.7, 16 * D, 0, 0], [1, 0, 0, 0]],
  spine:   [[0, 0, 0, 0], [0.35, 22 * D, -8 * D, 0], [0.7, 22 * D, -8 * D, 0], [1, 0, 0, 0]],
  chest:   [[0, 0, 0, 0], [0.35, 16 * D, -10 * D, 0], [0.7, 16 * D, -10 * D, 0], [1, 0, 0, 0]],
  neck:    [[0, 0, 0, 0], [0.35, 18 * D, 0, 0], [0.7, 18 * D, 0, 0], [1, 0, 0, 0]],
  armR:    [[0, -34 * D, 0, -12 * D], [0.35, -104 * D, -14 * D, -22 * D], [0.7, -96 * D, -8 * D, -18 * D], [1, -34 * D, 0, -12 * D]],
  forearmR:[[0, -52 * D, 0, 0], [0.35, -40 * D, 0, 0], [0.7, -46 * D, 0, 0], [1, -52 * D, 0, 0]],
  thighL:  [[0, 0, 0, 0], [0.35, 22 * D, 0, 0], [0.7, 22 * D, 0, 0], [1, 0, 0, 0]],
  thighR:  [[0, 0, 0, 0], [0.35, 18 * D, 0, 0], [0.7, 18 * D, 0, 0], [1, 0, 0, 0]],
  shinL:   [[0, -8 * D, 0, 0], [0.35, -34 * D, 0, 0], [0.7, -34 * D, 0, 0], [1, -8 * D, 0, 0]],
  shinR:   [[0, -8 * D, 0, 0], [0.35, -30 * D, 0, 0], [0.7, -30 * D, 0, 0], [1, -8 * D, 0, 0]],
}, { mask: MASK.full, root: [[0, 0, 0], [0.35, -0.14, 0], [0.7, -0.14, 0], [1, 0, 0]], events: [{ t: 0.45, name: 'use' }] }));

reg(clip('readMeter', 1.2, {
  // Ren raises the meter and reads it. This is the animation that sells the
  // whole survival premise, so it is deliberate and slow.
  spine:   [[0, 0, 0, 0], [0.3, 4 * D, -12 * D, 0], [0.75, 4 * D, -12 * D, 0], [1, 0, 0, 0]],
  chest:   [[0, 0, 0, 0], [0.3, 8 * D, -18 * D, 0], [0.75, 8 * D, -18 * D, 0], [1, 0, 0, 0]],
  neck:    [[0, 0, 0, 0], [0.3, 20 * D, -10 * D, 0], [0.75, 20 * D, -10 * D, 0], [1, 0, 0, 0]],
  armL:    [[0, -30 * D, 0, 20 * D], [0.3, -84 * D, 26 * D, 46 * D], [0.75, -82 * D, 26 * D, 44 * D], [1, -30 * D, 0, 20 * D]],
  forearmL:[[0, -60 * D, 0, 0], [0.3, -96 * D, 0, 0], [0.75, -96 * D, 0, 0], [1, -60 * D, 0, 0]],
  handL:   [[0, 0, 0, 0], [0.3, 0, 0, -30 * D], [0.75, 0, 0, -30 * D], [1, 0, 0, 0]],
}, { mask: MASK.upperSoft, events: [{ t: 0.4, name: 'read' }] }));

reg(clip('cough', 1.4, {
  // Involuntary. Fires on its own when saturation climbs, and it is the game
  // telling the player something before the meter does.
  spine:   [[0, 0, 0, 0], [0.12, 22 * D, 0, 0], [0.24, 8 * D, 0, 0], [0.36, 26 * D, 0, 0], [0.52, 10 * D, 0, 0], [0.66, 20 * D, 0, 0], [1, 0, 0, 0]],
  chest:   [[0, 0, 0, 0], [0.12, 26 * D, 0, 0], [0.24, 10 * D, 0, 0], [0.36, 30 * D, 0, 0], [0.52, 12 * D, 0, 0], [0.66, 22 * D, 0, 0], [1, 0, 0, 0]],
  neck:    [[0, 0, 0, 0], [0.12, 26 * D, 0, 0], [0.36, 30 * D, 0, 0], [0.66, 24 * D, 0, 0], [1, 0, 0, 0]],
  armR:    [[0, 0, 0, 0], [0.12, -64 * D, -20 * D, -14 * D], [0.5, -70 * D, -22 * D, -14 * D], [1, 0, 0, 0]],
  forearmR:[[0, 0, 0, 0], [0.12, -60 * D, 0, 0], [0.5, -64 * D, 0, 0], [1, 0, 0, 0]],
  hips:    [[0, 0, 0, 0], [0.12, 8 * D, 0, 0], [0.36, 10 * D, 0, 0], [1, 0, 0, 0]],
}, { mask: MASK.upperSoft, root: [[0, 0, 0], [0.12, -0.05, 0], [0.36, -0.06, 0], [1, 0, 0]], events: [{ t: 0.1, name: 'cough' }, { t: 0.34, name: 'cough' }, { t: 0.64, name: 'cough' }] }));

reg(clip('talk', 2.6, {
  chest:   [[0, 0, 0, 0], [0.2, 2 * D, 5 * D, 0], [0.45, -2 * D, -4 * D, 0], [0.7, 3 * D, 3 * D, 0], [1, 0, 0, 0]],
  neck:    [[0, 0, 0, 0], [0.15, -5 * D, 7 * D, 0], [0.4, 4 * D, -6 * D, 0], [0.62, -3 * D, 4 * D, 0], [0.85, 3 * D, -3 * D, 0], [1, 0, 0, 0]],
  armR:    [[0, 0, 0, 0], [0.22, -22 * D, -10 * D, -12 * D], [0.5, -8 * D, 0, -4 * D], [0.78, -18 * D, -6 * D, -10 * D], [1, 0, 0, 0]],
  forearmR:[[0, 0, 0, 0], [0.22, -26 * D, 0, 0], [0.5, -10 * D, 0, 0], [0.78, -22 * D, 0, 0], [1, 0, 0, 0]],
  armL:    [[0, 0, 0, 0], [0.35, -14 * D, 8 * D, 12 * D], [0.7, -6 * D, 0, 4 * D], [1, 0, 0, 0]],
}, { additive: true, mask: MASK.upperSoft, loop: true }));

reg(clip('sit', 0.6, {
  hips:    [[0, 0, 0, 0], [1, 6 * D, 0, 0]],
  spine:   [[0, 0, 0, 0], [1, 10 * D, 0, 0]],
  chest:   [[0, 0, 0, 0], [1, 6 * D, 0, 0]],
  thighL:  [[0, 0, 0, 0], [1, 84 * D, 0, 8 * D]],
  thighR:  [[0, 0, 0, 0], [1, 82 * D, 0, -8 * D]],
  shinL:   [[0, -8 * D, 0, 0], [1, -86 * D, 0, 0]],
  shinR:   [[0, -8 * D, 0, 0], [1, -84 * D, 0, 0]],
  armR:    [[0, -34 * D, 0, -12 * D], [1, -22 * D, 0, -16 * D]],
  armL:    [[0, -30 * D, 0, 20 * D], [1, -20 * D, 0, 22 * D]],
}, { mask: MASK.full, root: [[0, 0, 0], [1, -0.42, 0]] }));

reg(clip('climb', 1.4, {
  // Ladder cycle. Opposite hand and foot, weight held close to the rungs.
  hips:    [[0, 0, 0, 0], [0.5, 0, -6 * D, 0], [1, 0, 6 * D, 0]],
  spine:   [[0, -12 * D, 0, 0], [1, -12 * D, 0, 0]],
  chest:   [[0, -8 * D, 0, 0], [1, -8 * D, 0, 0]],
  neck:    [[0, 14 * D, 0, 0], [1, 14 * D, 0, 0]],
  armR:    [[0, -164 * D, 0, -16 * D], [0.5, -104 * D, 0, -14 * D], [1, -164 * D, 0, -16 * D]],
  forearmR:[[0, -18 * D, 0, 0], [0.5, -74 * D, 0, 0], [1, -18 * D, 0, 0]],
  armL:    [[0, -104 * D, 0, 14 * D], [0.5, -164 * D, 0, 16 * D], [1, -104 * D, 0, 14 * D]],
  forearmL:[[0, -74 * D, 0, 0], [0.5, -18 * D, 0, 0], [1, -74 * D, 0, 0]],
  thighL:  [[0, 66 * D, 0, 10 * D], [0.5, 14 * D, 0, 8 * D], [1, 66 * D, 0, 10 * D]],
  thighR:  [[0, 14 * D, 0, -8 * D], [0.5, 66 * D, 0, -10 * D], [1, 14 * D, 0, -8 * D]],
  shinL:   [[0, -74 * D, 0, 0], [0.5, -20 * D, 0, 0], [1, -74 * D, 0, 0]],
  shinR:   [[0, -20 * D, 0, 0], [0.5, -74 * D, 0, 0], [1, -20 * D, 0, 0]],
}, { mask: MASK.full, loop: true, events: [{ t: 0.02, name: 'rung' }, { t: 0.52, name: 'rung' }] }));

reg(clip('throw', 0.72, {
  hips:    [[0, 0, -14 * D, 0], [0.3, 0, -26 * D, 0], [0.52, 0, 22 * D, 0], [1, 0, 0, 0]],
  chest:   [[0, 0, -18 * D, 0], [0.3, -10 * D, -34 * D, 0], [0.52, 8 * D, 28 * D, 0], [1, 0, 0, 0]],
  armR:    [[0, -34 * D, 0, -12 * D], [0.3, -150 * D, -28 * D, -20 * D], [0.5, -30 * D, 30 * D, -6 * D], [0.7, 10 * D, 10 * D, -10 * D], [1, -34 * D, 0, -12 * D]],
  forearmR:[[0, -52 * D, 0, 0], [0.3, -110 * D, 0, 0], [0.5, -12 * D, 0, 0], [1, -52 * D, 0, 0]],
  armL:    [[0, -30 * D, 0, 20 * D], [0.3, -60 * D, 20 * D, 40 * D], [0.52, -20 * D, -10 * D, 12 * D], [1, -30 * D, 0, 20 * D]],
  thighL:  [[0, 0, 0, 0], [0.3, -14 * D, 0, 0], [0.52, 20 * D, 0, 0], [1, 0, 0, 0]],
  thighR:  [[0, 0, 0, 0], [0.3, 16 * D, 0, 0], [0.52, -18 * D, 0, 0], [1, 0, 0, 0]],
}, { mask: MASK.full, strike: [0.3, 0.5], events: [{ t: 0.44, name: 'release' }] }));

// ---------------------------------------------------------- procedural -----

/**
 * Procedural locomotion.
 *
 * Writes directly into a pose from (speed, strafe, turnRate, phase). Producing
 * this analytically rather than blending clips means every speed and every
 * heading has a correct, unique cycle — no foot sliding at intermediate speeds,
 * no crossfade mush when the player flicks the stick.
 */
export function locomotionPose(out, p) {
  poseZero(out);
  const {
    phase = 0, speed = 0, strafe = 0, forward = 1, crouch = 0,
    turn = 0, alert = 0, injured = 0, load = 0, airborne = 0, fallVel = 0,
    quadruped = false,
  } = p;

  const s = clamp01(speed / 5.6);                 // 0 idle .. 1 sprint
  const walkAmt = smoothstep(clamp01(speed / 1.4));
  const runAmt = smoothstep(clamp01((speed - 1.6) / 3.4));

  const ph = phase * TAU;
  const sin1 = Math.sin(ph), cos1 = Math.cos(ph);
  const sin2 = Math.sin(ph * 2), cos2 = Math.cos(ph * 2);

  // --- legs --------------------------------------------------------------
  // Swing amplitude grows with speed; knee lift grows faster so a run reads as
  // a run rather than a fast walk.
  const swing = (14 + runAmt * 30) * D * walkAmt;
  const lift = (18 + runAmt * 46) * D * walkAmt;

  const legPhase = (side) => {
    const q = side > 0 ? ph : ph + Math.PI;
    const sw = Math.sin(q);
    const cw = Math.cos(q);
    // Thigh: sinusoid biased forward (contact happens ahead of the hip).
    const thigh = sw * swing + walkAmt * 4 * D;
    // Knee: bends hard through the swing half, straight through stance.
    const swingHalf = clamp01(-cw);
    const knee = -(lift * (0.35 + swingHalf * 1.0)) - 8 * D;
    // Ankle: toe-off then dorsiflex.
    const ankle = -sw * 12 * D * walkAmt + cw * 8 * D * runAmt;
    // Toe: extends hard through push-off, relaxes and lifts through the swing.
    // toeL/toeR were in BONES and in MASK.lower but nothing on earth ever wrote
    // them, so the feet were rigid blocks and every skinning upload carried two
    // dead matrices.
    const toe = (Math.max(0, -sw) * 30 * D - Math.max(0, cw) * 9 * D) * walkAmt;
    return { thigh, knee, ankle, toe };
  };

  const L = legPhase(1), R = legPhase(-1);
  const set = (bone, x, y, z) => {
    const o = I[bone] * 3;
    out.e[o] = x; out.e[o + 1] = y; out.e[o + 2] = z;
  };

  set('thighL', L.thigh - crouch * 34 * D, 0, strafe * -7 * D + 2 * D);
  set('thighR', R.thigh - crouch * 34 * D, 0, strafe * -7 * D - 2 * D);
  set('shinL', L.knee - crouch * 52 * D, 0, 0);
  set('shinR', R.knee - crouch * 52 * D, 0, 0);
  set('footL', L.ankle + crouch * 22 * D, 0, 0);
  set('footR', R.ankle + crouch * 22 * D, 0, 0);
  set('toeL', L.toe, 0, 0);
  set('toeR', R.toe, 0, 0);

  // --- pelvis / spine ----------------------------------------------------
  // Vertical bob at 2x stride, lateral sway at 1x, and a hip roll that drops
  // the swinging side. Small numbers, but their absence is what makes cheap
  // character animation feel weightless.
  const bob = -Math.abs(sin2) * (0.022 + runAmt * 0.05) * walkAmt;
  const sway = cos1 * (0.012 + runAmt * 0.022) * walkAmt;
  out.rootY = bob - crouch * 0.34;
  out.rootX = sway;

  const lean = clamp(speed * 0.055 + runAmt * 0.12, 0, 0.34) - crouch * 0.12;
  const turnLean = clamp(turn * 0.28, -0.3, 0.3);

  if (quadruped) {
    // A dog's spine is HORIZONTAL. `lean` is a forward pitch authored for a
    // vertical one, and writing it onto chest and neck drove the muzzle into
    // the floor and folded the head through the chest — which is exactly what
    // the dog in the encounter frame was doing. On a horizontal spine the
    // forward-drive equivalent is a small pitch about the same axis, an order
    // of magnitude smaller, plus the natural bob of a trot.
    const drive = clamp(speed * 0.02, 0, 0.09);
    set('hips', -cos2 * 2 * D * walkAmt, sin1 * 2 * D * walkAmt, cos1 * 2 * D * walkAmt - turnLean * 0.4);
    set('spine', sin2 * 2.5 * D * walkAmt - drive * 0.3, -sin1 * 2 * D * walkAmt, -turnLean * 0.35);
    set('chest', sin2 * 2 * D * walkAmt - drive * 0.2, -sin1 * 2.5 * D * walkAmt, -turnLean * 0.3);
    // The head leads the trot and stays level with the ground, not with a
    // notional upright torso.
    set('neck', -cos2 * 2.5 * D * walkAmt + drive * 0.5, sin1 * 2 * D * walkAmt, turnLean * 0.5);
  } else {
    set('hips', -cos2 * 3 * D * walkAmt, sin1 * (4 + runAmt * 5) * D * walkAmt - strafe * 8 * D,
        cos1 * (3 + runAmt * 4) * D * walkAmt - turnLean * 0.6);
    set('spine', lean * 0.42 + crouch * 16 * D, -sin1 * 3 * D * walkAmt + strafe * 5 * D, -turnLean * 0.5);
    set('chest', lean * 0.5 + injured * 10 * D + crouch * 14 * D,
        -sin1 * (5 + runAmt * 6) * D * walkAmt + strafe * 6 * D, -turnLean * 0.4);
    // The head stabilises: it counter-rotates the torso and stays level. Real
    // people hold their gaze steady while their body oscillates under it.
    set('neck', -lean * 0.55 + cos2 * 2 * D * walkAmt - crouch * 6 * D, sin1 * 2 * D * walkAmt, turnLean * 0.7);
  }

  // --- arms --------------------------------------------------------------
  // Counter-swing to the legs. At alert the arms come up and stop swinging.
  const armSwing = (18 + runAmt * 34) * D * walkAmt * (1 - alert * 0.72);
  const armBase = -(10 + runAmt * 16) * D * walkAmt;
  const guardX = alert * -40 * D;
  const guardZ = alert * 16 * D;

  if (quadruped) {
    // Forelegs, not arms. The human abduction term put a 14-degree sideways
    // splay on each foreleg, which on a quadruped is a collapse; and the elbow
    // fold is half a human's because a dog's carpus barely closes at a trot.
    set('shoulderL', 0, 0, 0);
    set('shoulderR', 0, 0, 0);
    set('armL', -sin1 * armSwing + armBase, 0, 0);
    set('armR', sin1 * armSwing + armBase, 0, 0);
    set('forearmL', -(14 + runAmt * 13) * D - Math.max(0, -sin1) * 11 * D * walkAmt, 0, 0);
    set('forearmR', -(12 + runAmt * 13) * D - Math.max(0, sin1) * 11 * D * walkAmt, 0, 0);
    set('handL', 0, 0, 0);
    set('handR', 0, 0, 0);
  } else {
    set('shoulderL', 0, 0, sin1 * 3 * D * walkAmt);
    set('shoulderR', 0, 0, -sin1 * 3 * D * walkAmt);
    set('armL', -sin1 * armSwing + armBase + guardX - crouch * 12 * D, 0,
        (14 + load * 4) * D + guardZ);
    set('armR', sin1 * armSwing + armBase + guardX - crouch * 12 * D, 0,
        -(14 + load * 4) * D - guardZ);
    // Elbows stay bent; a straight-armed run looks like a scarecrow.
    set('forearmL', -(28 + runAmt * 26) * D - alert * 52 * D - Math.max(0, -sin1) * 22 * D * walkAmt, 0, 0);
    set('forearmR', -(24 + runAmt * 26) * D - alert * 46 * D - Math.max(0, sin1) * 22 * D * walkAmt, 0, 0);
    set('handL', 0, 0, 8 * D);
    set('handR', 0, 0, -8 * D);
  }

  // --- turn in place -----------------------------------------------------
  // On a hard stick flick with no translation the character used to rotate like
  // a turret. This blends in a pivot: the pelvis counter-rotates, the outside
  // leg crosses over and the torso leads the turn.
  if (!quadruped) {
    const still = 1 - smoothstep(clamp01(speed / 0.9));
    const tip = clamp01(Math.abs(turn) * 1.6) * still;
    if (tip > 0.01) {
      const s = Math.sign(turn) || 1;
      const add = (bone, x, yy, z) => {
        const o = I[bone] * 3;
        out.e[o] += x * tip; out.e[o + 1] += yy * tip; out.e[o + 2] += z * tip;
      };
      add('hips', 0, -s * 16 * D, 0);
      add('spine', 0, s * 7 * D, 0);
      add('chest', 0, s * 11 * D, 0);
      // The trailing leg lifts and crosses; the planted one takes the weight.
      add('thighL', (s > 0 ? 20 : 6) * D, -s * 14 * D, s * 8 * D);
      add('thighR', (s > 0 ? 6 : 20) * D, -s * 14 * D, s * 8 * D);
      add('shinL', -(s > 0 ? 30 : 10) * D, 0, 0);
      add('shinR', -(s > 0 ? 10 : 30) * D, 0, 0);
      add('toeL', (s > 0 ? 14 : 4) * D, 0, 0);
      add('toeR', (s > 0 ? 4 : 14) * D, 0, 0);
      out.rootY -= 0.018 * tip;
    }
  }

  // --- airborne override -------------------------------------------------
  if (airborne > 0) {
    const a = clamp01(airborne);
    const rising = clamp01(fallVel / 6);
    const falling = clamp01(-fallVel / 9);
    const blend = (bone, x, y, z) => {
      const o = I[bone] * 3;
      out.e[o] += (x - out.e[o]) * a;
      out.e[o + 1] += (y - out.e[o + 1]) * a;
      out.e[o + 2] += (z - out.e[o + 2]) * a;
    };
    blend('thighL', (20 + falling * 34) * D, 0, 6 * D);
    blend('thighR', (6 + rising * 34) * D, 0, -6 * D);
    blend('shinL', -(40 + rising * 50) * D, 0, 0);
    blend('shinR', -(16 + falling * 30) * D, 0, 0);
    blend('armL', -(50 + falling * 46) * D, 0, (26 + falling * 22) * D);
    blend('armR', -(46 + falling * 44) * D, 0, -(26 + falling * 22) * D);
    blend('forearmL', -(44 + falling * 20) * D, 0, 0);
    blend('forearmR', -(40 + falling * 20) * D, 0, 0);
    blend('spine', (falling * 12 - rising * 8) * D, 0, 0);
    blend('chest', (falling * 10 - rising * 6) * D, 0, 0);
    out.rootY *= (1 - a);
  }

  return out;
}

/** Idle: breathing, weight shift, small settle. Additive over locomotion. */
export function idlePose(out, t, opts = {}) {
  poseZero(out);
  const { breath = 1, alert = 0, exhaust = 0, cold = 0 } = opts;
  const b = Math.sin(t * (1.1 + exhaust * 1.5)) * (0.5 + exhaust * 0.9) * breath;
  const b2 = Math.sin(t * 0.37);
  const b3 = Math.sin(t * 0.23 + 1.1);
  const set = (bone, x, y, z) => {
    const o = I[bone] * 3;
    out.e[o] += x; out.e[o + 1] += y; out.e[o + 2] += z;
  };
  set('chest', b * 2.2 * D, b2 * 1.6 * D, b3 * 1.0 * D);
  set('spine', b * 1.0 * D, b2 * 1.2 * D, b3 * 0.8 * D);
  set('neck', -b * 1.4 * D, b3 * 3.0 * D, -b2 * 1.4 * D);
  set('hips', 0, b2 * 1.4 * D, b3 * 1.6 * D);
  set('armL', b * 1.4 * D, 0, b3 * 1.6 * D);
  set('armR', b * 1.4 * D, 0, -b3 * 1.6 * D);
  // Cold makes the shoulders come up and the arms come in.
  if (cold > 0) {
    set('shoulderL', 0, 0, -cold * 6 * D);
    set('shoulderR', 0, 0, cold * 6 * D);
    set('armL', 0, 0, -cold * 8 * D);
    set('armR', 0, 0, cold * 8 * D);
  }
  out.rootY += b * 0.006;
  return out;
}

// ---------------------------------------------------------- animator -------

/**
 * Drives one character's skeleton.
 */
export class Animator {
  constructor(rig) {
    this.rig = rig;
    this.bones = rig.bones;

    this.base = makePose();
    this.action = makePose();
    this.additive = makePose();
    this.tmp = makePose();
    this.out = makePose();

    this.phase = 0;
    this.time = 0;

    /** Current full-body/upper-body action. */
    this.act = null;         // { clip, t, speed, weight, target, fired:Set }
    this.actFade = 0;

    /** One-shot additive reactions (hit flinch, guard impact). */
    this.reactions = [];

    this.locomotion = {
      speed: 0, strafe: 0, turn: 0, crouch: 0, alert: 0,
      airborne: 0, fallVel: 0, injured: 0, load: 0,
    };
    this.idleOpts = { breath: 1, alert: 0, exhaust: 0, cold: 0 };

    this.lookAt = null;       // THREE.Vector3 in local space, or null
    this._lookYaw = 0; this._lookPitch = 0;
    this.rootOffset = new THREE.Vector3();

    this.onEvent = null;      // (name, clipName) => void
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
  }

  /** Start (or restart) an action clip. */
  play(name, opts = {}) {
    const c = CLIPS[name];
    if (!c) return null;
    const { speed = 1, fade = 0.09, force = false } = opts;
    if (this.act && this.act.clip === c && !force && c.loop) return this.act;
    this.act = {
      clip: c, t: 0, speed, weight: 0, fade,
      mask: opts.mask || c.mask || MASK.full,
      fired: new Set(),
      onDone: opts.onDone || null,
    };
    return this.act;
  }

  stopAction(fade = 0.12) {
    if (this.act) this.act.stopping = fade;
  }

  get actionName() { return this.act ? this.act.clip.name : null; }
  /** Normalised progress of the current action, 0..1. */
  get actionT() { return this.act ? this.act.t : 0; }

  /** Fire a short additive reaction on top of everything else. */
  react(name, scale = 1) {
    const c = CLIPS[name];
    if (!c) return;
    this.reactions.push({ clip: c, t: 0, scale, fired: new Set() });
    if (this.reactions.length > 4) this.reactions.shift();
  }

  update(dt) {
    this.time += dt;
    const L = this.locomotion;

    // Stride phase advances with distance travelled, not with time, so the
    // feet stay planted at every speed.
    const strideLen = lerp(1.35, 2.35, clamp01((L.speed - 1.2) / 4.2));
    if (L.airborne < 0.5) {
      this.phase += (L.speed / Math.max(0.4, strideLen)) * dt;
      // Idle still ticks the phase slowly so a stop lands on a natural pose.
      if (L.speed < 0.12) this.phase += dt * 0.12;
    }
    this.phase %= 1;

    // --- base layer -------------------------------------------------------
    locomotionPose(this.base, {
      phase: this.phase, speed: L.speed, strafe: L.strafe, turn: L.turn,
      crouch: L.crouch, alert: L.alert, airborne: L.airborne, fallVel: L.fallVel,
      injured: L.injured, load: L.load, quadruped: !!this.rig.quadruped,
    });
    idlePose(this.tmp, this.time, this.idleOpts);
    const idleW = 1 - smoothstep(clamp01(L.speed / 1.1));
    poseAdd(this.base, this.tmp, 0.35 + idleW * 0.65);

    poseCopy(this.out, this.base);

    // --- action layer -----------------------------------------------------
    if (this.act) {
      const a = this.act;
      const c = a.clip;
      a.t += (dt * a.speed) / c.dur;

      for (const ev of c.events) {
        if (a.t >= ev.t && !a.fired.has(ev)) {
          a.fired.add(ev);
          if (this.onEvent) this.onEvent(ev.name, c.name, a);
        }
      }

      if (a.t >= 1) {
        if (c.loop) { a.t %= 1; a.fired.clear(); }
        else {
          a.stopping = a.stopping ?? a.fade;
        }
      }

      const targetW = a.stopping !== undefined ? 0 : 1;
      const rate = a.stopping !== undefined ? Math.max(0.02, a.stopping) : Math.max(0.02, a.fade);
      a.weight = damp(a.weight, targetW, rate * 0.5, dt);

      if (a.weight < 0.01 && targetW === 0) {
        if (a.onDone) a.onDone();
        this.act = null;
      } else {
        sampleClip(c, clamp01(a.t), this.action);
        if (c.additive) poseAdd(this.out, this.action, a.weight, a.mask);
        else poseBlend(this.out, this.action, a.weight, a.mask);
      }
    }

    // --- reactions --------------------------------------------------------
    for (let i = this.reactions.length - 1; i >= 0; i--) {
      const r = this.reactions[i];
      r.t += dt / r.clip.dur;
      for (const ev of r.clip.events) {
        if (r.t >= ev.t && !r.fired.has(ev)) {
          r.fired.add(ev);
          if (this.onEvent) this.onEvent(ev.name, r.clip.name, r);
        }
      }
      if (r.t >= 1) { this.reactions.splice(i, 1); continue; }
      sampleClip(r.clip, r.t, this.action);
      // Envelope so a reaction eases in AND out. The old form evaluated to 0.4
      // at t=0, so every hit reaction snapped to 40 per cent of full pose on
      // its first frame instead of arriving.
      const env = smoothstep(clamp01(r.t / 0.12)) * (1 - smoothstep(clamp01((r.t - 0.6) / 0.4)));
      poseAdd(this.out, this.action, r.scale * clamp01(env), r.clip.mask || null);
    }

    // --- look-at ----------------------------------------------------------
    if (this.lookAt) {
      const yaw = Math.atan2(-this.lookAt.x, -this.lookAt.z);
      const pitch = Math.atan2(this.lookAt.y, Math.hypot(this.lookAt.x, this.lookAt.z));
      this._lookYaw = damp(this._lookYaw, clamp(yaw, -1.15, 1.15), 0.11, dt);
      this._lookPitch = damp(this._lookPitch, clamp(pitch, -0.5, 0.62), 0.11, dt);
    } else {
      this._lookYaw = damp(this._lookYaw, 0, 0.2, dt);
      this._lookPitch = damp(this._lookPitch, 0, 0.2, dt);
    }
    // Split the turn between neck and chest so the whole body participates.
    this.out.e[I.neck * 3] += -this._lookPitch * 0.62;
    this.out.e[I.neck * 3 + 1] += this._lookYaw * 0.6;
    this.out.e[I.chest * 3] += -this._lookPitch * 0.22;
    this.out.e[I.chest * 3 + 1] += this._lookYaw * 0.26;
    this.out.e[I.spine * 3 + 1] += this._lookYaw * 0.12;

    this._apply();
  }

  _apply() {
    const bones = this.bones;
    const e = this.out.e;
    for (let i = 0; i < bones.length; i++) {
      const o = i * 3;
      this._e.set(e[o], e[o + 1], e[o + 2], 'YXZ');
      bones[i].quaternion.setFromEuler(this._e);
    }
    // Root translation: applied to the hips bone, in the character's local space.
    const hips = bones[I.hips];
    const bind = hips.userData.bind;
    const parentBind = bones[I.root].userData.bind;
    hips.position.set(
      bind.x - parentBind.x + this.out.rootX,
      bind.y - parentBind.y + this.out.rootY,
      bind.z - parentBind.z + this.out.rootZ
    );
    this.rootOffset.set(this.out.rootX, this.out.rootY, this.out.rootZ);
  }
}
