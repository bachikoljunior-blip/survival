/**
 * Procedural texture library.
 *
 * Every surface in Hollis is generated at runtime on a 2D canvas and uploaded
 * once. Nothing is downloaded, nothing is licensed, and the whole set weighs
 * a few megabytes of VRAM instead of tens of megabytes of transfer.
 *
 * Each generator writes an albedo canvas and a height canvas. Normals are
 * derived from height with a Sobel filter, which is what gives brick courses,
 * corrugation ribs and cracked asphalt their bite under the ember lighting.
 *
 * Textures are authored to tile seamlessly: all noise is wrapped modulo the
 * canvas size and every stamped detail is drawn again at the ±size offsets it
 * overlaps.
 */

import * as THREE from 'three';
import { Rng, Noise2 } from '../core/rng.js';
import { clamp, clamp01, lerp } from '../core/util.js';

const cache = new Map();
let RES = 512;
let ANISO = 4;

export function configureTextures(size, aniso) {
  RES = size;
  ANISO = aniso;
}

// ---------------------------------------------------------------- canvas ---

function canvas(size = RES) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function ctx2d(c) {
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingEnabled = true;
  return x;
}

/** Draw a callback nine times so anything crossing an edge wraps. */
function wrapDraw(ctx, size, fn) {
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      ctx.save();
      ctx.translate(ox * size, oy * size);
      fn(ctx);
      ctx.restore();
    }
  }
}

function rgb(r, g, b) { return `rgb(${r | 0},${g | 0},${b | 0})`; }
function rgba(r, g, b, a) { return `rgba(${r | 0},${g | 0},${b | 0},${a})`; }

/**
 * Sample a seamless fbm field across the whole tile.
 * @param {number} period integer lattice period — the tile wraps on it exactly
 * @returns {Float32Array} size*size values in [0,1]
 */
function noiseField(size, seed, period, octaves = 4) {
  const n = new Noise2(seed);
  const out = new Float32Array(size * size);
  const k = period / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out[y * size + x] = n.fbmTiled(x * k, y * k, period, period, octaves) * 0.5 + 0.5;
    }
  }
  return out;
}

/** Multiply-blend a seamless fbm field over the canvas as light/dark grime. */
function grime(ctx, size, seed, period, strength, tint = [0, 0, 0]) {
  const f = noiseField(size, seed, Math.max(1, Math.round(period)), 4);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let p = 0; p < size * size; p++) {
    const v = f[p];
    const k = 1 + (v - 0.5) * strength * 2;
    const i = p * 4;
    d[i] = clamp(d[i] * k + tint[0] * (1 - v), 0, 255);
    d[i + 1] = clamp(d[i + 1] * k + tint[1] * (1 - v), 0, 255);
    d[i + 2] = clamp(d[i + 2] * k + tint[2] * (1 - v), 0, 255);
  }
  ctx.putImageData(img, 0, 0);
}

/** Fine per-pixel grain — the difference between "flat colour" and "material". */
function speckle(ctx, size, seed, amount, contrast = 1) {
  const r = new Rng(seed);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (r.f() - 0.5) * amount * 255 * contrast;
    d[i] = clamp(d[i] + v, 0, 255);
    d[i + 1] = clamp(d[i + 1] + v, 0, 255);
    d[i + 2] = clamp(d[i + 2] + v, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
}

/** Vertical drip/streak stains, the signature of a weathered building. */
function streaks(ctx, size, seed, count, opacity, colour = [12, 10, 8]) {
  const r = new Rng(seed);
  for (let i = 0; i < count; i++) {
    const x = r.f() * size;
    const y0 = r.f() * size;
    const len = r.range(size * 0.12, size * 0.62);
    const w = r.range(1.2, 5.5);
    const a = r.range(0.25, 1) * opacity;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
    g.addColorStop(0, rgba(colour[0], colour[1], colour[2], a));
    g.addColorStop(1, rgba(colour[0], colour[1], colour[2], 0));
    wrapDraw(ctx, size, (c) => {
      c.fillStyle = g;
      c.fillRect(x, y0, w, len);
    });
  }
}

/** Sobel a height canvas into a tangent-space normal map. */
function normalFromHeight(hcanvas, strength = 2.0) {
  const size = hcanvas.width;
  const hc = ctx2d(hcanvas).getImageData(0, 0, size, size).data;
  const out = new Uint8Array(size * size * 4);
  const H = (x, y) => {
    x = (x + size) % size; y = (y + size) % size;
    return hc[(y * size + x) * 4] / 255;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = H(x - 1, y - 1), t = H(x, y - 1), tr = H(x + 1, y - 1);
      const l = H(x - 1, y), rr = H(x + 1, y);
      const bl = H(x - 1, y + 1), b = H(x, y + 1), br = H(x + 1, y + 1);
      const dx = (tr + 2 * rr + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      out[i] = (nx * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * 0.5 + 0.5) * 255;
      out[i + 2] = (nz * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(out, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = ANISO;
  return tex;
}

/** Pack roughness into G and (optionally) AO into R — three.js reads them per-channel. */
function packRoughAO(roughCanvas, aoCanvas) {
  const size = roughCanvas.width;
  const rd = ctx2d(roughCanvas).getImageData(0, 0, size, size).data;
  const ad = aoCanvas ? ctx2d(aoCanvas).getImageData(0, 0, size, size).data : null;
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    out[i * 4] = ad ? ad[i * 4] : 255;      // R = AO
    out[i * 4 + 1] = rd[i * 4];             // G = roughness
    out[i * 4 + 2] = 0;                     // B = metalness (unused; set per-material)
    out[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(out, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function toTexture(c, srgb = true) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = ANISO;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

// ------------------------------------------------------------ generators ---
// Each returns { albedo: canvas, height: canvas, rough: canvas }.

const GEN = {};

GEN.asphalt = (size, seed) => {
  const a = canvas(size), h = canvas(size), r = canvas(size);
  const ca = ctx2d(a), ch = ctx2d(h), cr = ctx2d(r);
  const rng = new Rng(seed);

  // Weathered, sun-bleached asphalt. Fresh blacktop is near-black, but a road
  // that has not been resurfaced in a decade sits around 0.09 albedo — and a
  // road that reads as pure black on screen reads as a hole, not a road.
  ca.fillStyle = rgb(66, 63, 59); ca.fillRect(0, 0, size, size);
  ch.fillStyle = rgb(128, 128, 128); ch.fillRect(0, 0, size, size);

  // Aggregate: thousands of tiny stones in the binder.
  for (let i = 0; i < size * 5; i++) {
    const x = rng.f() * size, y = rng.f() * size;
    const rad = rng.range(0.5, 2.4);
    const v = rng.range(78, 128);
    ca.fillStyle = rgba(v, v * 0.97, v * 0.92, rng.range(0.25, 0.7));
    ca.beginPath(); ca.arc(x, y, rad, 0, 6.283); ca.fill();
    const hv = 128 + rng.range(6, 30);
    ch.fillStyle = rgb(hv, hv, hv);
    ch.beginPath(); ch.arc(x, y, rad, 0, 6.283); ch.fill();
  }

  // Patched repairs — darker rectangles with soft edges.
  for (let i = 0; i < 5; i++) {
    const x = rng.f() * size, y = rng.f() * size;
    const w = rng.range(size * 0.12, size * 0.4), hh = rng.range(size * 0.1, size * 0.34);
    wrapDraw(ca, size, (c) => {
      c.globalAlpha = rng.range(0.14, 0.3);
      c.fillStyle = rgb(20, 19, 18);
      c.fillRect(x, y, w, hh);
      c.globalAlpha = 1;
    });
  }

  // Cracks: recursive branching polylines, drawn dark in albedo and deep in height.
  const crack = (x, y, ang, len, depth) => {
    if (depth > 4 || len < 4) return;
    const steps = Math.max(2, len / 6 | 0);
    let px = x, py = y;
    const pts = [[px, py]];
    for (let i = 0; i < steps; i++) {
      ang += rng.sym(0.45);
      px += Math.cos(ang) * (len / steps);
      py += Math.sin(ang) * (len / steps);
      pts.push([px, py]);
    }
    const stroke = (c, w, style) => {
      c.strokeStyle = style; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
      c.stroke();
    };
    const w = Math.max(0.4, 1.5 - depth * 0.32);
    wrapDraw(ca, size, (c) => stroke(c, w, rgba(30, 28, 26, 0.5)));
    wrapDraw(ch, size, (c) => stroke(c, w * 1.4, rgb(74, 74, 74)));
    if (rng.chance(0.45)) crack(px, py, ang + rng.sym(1.1), len * rng.range(0.35, 0.6), depth + 1);
    if (rng.chance(0.2)) crack(pts[(steps / 2) | 0][0], pts[(steps / 2) | 0][1], ang + rng.sym(1.4), len * 0.4, depth + 1);
  };
  for (let i = 0; i < 4; i++) crack(rng.f() * size, rng.f() * size, rng.f() * 6.283, rng.range(size * 0.14, size * 0.44), 0);

  grime(ca, size, seed + 7, 3.2, 0.16, [4, 3, 2]);
  speckle(ca, size, seed + 11, 0.055);

  // Roughness: wet-look sheen in the low, cracked areas; dry and rough elsewhere.
  cr.fillStyle = rgb(215, 215, 215); cr.fillRect(0, 0, size, size);
  grime(cr, size, seed + 23, 2.4, 0.22);
  return { albedo: a, height: h, rough: r };
};

GEN.concrete = (size, seed) => {
  const a = canvas(size), h = canvas(size), r = canvas(size);
  const ca = ctx2d(a), ch = ctx2d(h), cr = ctx2d(r);
  const rng = new Rng(seed);

  ca.fillStyle = rgb(118, 113, 104); ca.fillRect(0, 0, size, size);
  ch.fillStyle = rgb(140, 140, 140); ch.fillRect(0, 0, size, size);

  // Form-board lines from the pour, plus tie-rod holes.
  const boardH = size / 4;
  for (let i = 0; i <= 4; i++) {
    const y = i * boardH;
    ca.fillStyle = rgba(78, 74, 68, 0.6); ca.fillRect(0, y - 1, size, 2);
    ch.fillStyle = rgb(112, 112, 112); ch.fillRect(0, y - 1.5, size, 3);
    for (let j = 0; j < 3; j++) {
      const x = (j + 0.5) * (size / 3) + rng.sym(8);
      const yy = y + boardH * 0.5;
      ca.fillStyle = rgba(66, 62, 56, 0.85);
      ca.beginPath(); ca.arc(x, yy, 3.4, 0, 6.283); ca.fill();
      ch.fillStyle = rgb(100, 100, 100);
      ch.beginPath(); ch.arc(x, yy, 3.8, 0, 6.283); ch.fill();
    }
  }

  // Air-void pitting.
  for (let i = 0; i < size * 1.6; i++) {
    const x = rng.f() * size, y = rng.f() * size, rad = rng.range(0.7, 3.2);
    ca.fillStyle = rgba(72, 68, 62, rng.range(0.2, 0.65));
    ca.beginPath(); ca.arc(x, y, rad, 0, 6.283); ca.fill();
    ch.fillStyle = rgb(118, 118, 118);
    ch.beginPath(); ch.arc(x, y, rad, 0, 6.283); ch.fill();
  }

  // Spalling — where the face has broken away and exposed aggregate.
  for (let i = 0; i < 4; i++) {
    const x = rng.f() * size, y = rng.f() * size, rad = rng.range(8, 26);
    wrapDraw(ca, size, (c) => {
      c.fillStyle = rgba(96, 88, 78, 0.8);
      c.beginPath();
      for (let k = 0; k <= 12; k++) {
        const t = (k / 12) * 6.283;
        const rr = rad * (0.65 + Math.abs(Math.sin(k * 2.3 + seed)) * 0.5);
        const px = x + Math.cos(t) * rr, py = y + Math.sin(t) * rr;
        k === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
      }
      c.closePath(); c.fill();
    });
    wrapDraw(ch, size, (c) => {
      c.fillStyle = rgb(108, 108, 108);
      c.beginPath(); c.arc(x, y, rad * 0.85, 0, 6.283); c.fill();
    });
  }

  streaks(ca, size, seed + 3, 22, 0.32, [40, 34, 26]);
  // Rust bleed from corroding rebar — the strongest storytelling detail on
  // exposed concrete.
  streaks(ca, size, seed + 5, 6, 0.36, [104, 52, 20]);
  grime(ca, size, seed + 9, 2.6, 0.19, [8, 7, 5]);
  speckle(ca, size, seed + 13, 0.05);

  cr.fillStyle = rgb(228, 228, 228); cr.fillRect(0, 0, size, size);
  grime(cr, size, seed + 31, 3.0, 0.14);
  return { albedo: a, height: h, rough: r };
};

GEN.brick = (size, seed) => {
  const a = canvas(size), h = canvas(size), r = canvas(size);
  const ca = ctx2d(a), ch = ctx2d(h), cr = ctx2d(r);
  const rng = new Rng(seed);

  const rows = 12;
  const bh = size / rows;
  const bw = bh * 2.35;

  ca.fillStyle = rgb(108, 102, 92); ca.fillRect(0, 0, size, size);   // mortar
  ch.fillStyle = rgb(96, 96, 96); ch.fillRect(0, 0, size, size);

  // Fired clay, not terracotta paint. Muted, with enough spread between bricks
  // that a wall reads as thousands of individual units at distance.
  const palette = [
    [116, 78, 62], [104, 70, 56], [126, 88, 70], [94, 64, 52],
    [110, 76, 64], [98, 68, 56], [130, 94, 74], [88, 60, 50],
  ];

  for (let row = 0; row < rows; row++) {
    const y = row * bh;
    const offset = (row % 2) * bw * 0.5;
    for (let x = -bw; x < size + bw; x += bw) {
      const bx = x + offset + 1.2;
      const by = y + 1.2;
      const w = bw - 2.4, hh = bh - 2.4;
      const c = palette[rng.int(0, palette.length - 1)];
      const j = rng.sym(9);
      wrapDraw(ca, size, (cc) => {
        cc.fillStyle = rgb(c[0] + j, c[1] + j * 0.8, c[2] + j * 0.7);
        cc.fillRect(bx, by, w, hh);
        // Per-brick shading so courses read at distance.
        const g = cc.createLinearGradient(bx, by, bx, by + hh);
        g.addColorStop(0, 'rgba(255,255,255,0.07)');
        g.addColorStop(1, 'rgba(0,0,0,0.16)');
        cc.fillStyle = g; cc.fillRect(bx, by, w, hh);
      });
      wrapDraw(ch, size, (cc) => {
        const hv = 168 + rng.sym(10);
        cc.fillStyle = rgb(hv, hv, hv);
        cc.fillRect(bx, by, w, hh);
      });
      // Occasional missing / heavily spalled brick.
      if (rng.chance(0.03)) {
        wrapDraw(ca, size, (cc) => { cc.fillStyle = rgba(52, 44, 38, 0.92); cc.fillRect(bx, by, w, hh); });
        wrapDraw(ch, size, (cc) => { cc.fillStyle = rgb(72, 72, 72); cc.fillRect(bx, by, w, hh); });
      }
    }
  }

  // Soot: Hollis brick is never clean. Heavier toward the bottom of the tile.
  const g = ca.createLinearGradient(0, size * 0.35, 0, size);
  g.addColorStop(0, 'rgba(16,13,10,0)');
  g.addColorStop(1, 'rgba(16,13,10,0.42)');
  ca.fillStyle = g; ca.fillRect(0, 0, size, size);

  streaks(ca, size, seed + 17, 16, 0.3, [22, 18, 14]);
  grime(ca, size, seed + 19, 2.2, 0.2, [10, 8, 6]);
  speckle(ca, size, seed + 21, 0.045);

  cr.fillStyle = rgb(232, 232, 232); cr.fillRect(0, 0, size, size);
  return { albedo: a, height: h, rough: r };
};

GEN.plaster = (size, seed) => {
  const a = canvas(size), h = canvas(size), r = canvas(size);
  const ca = ctx2d(a), ch = ctx2d(h), cr = ctx2d(r);
  const rng = new Rng(seed);

  // Institutional two-tone: a pale wall over a darker dado band.
  ca.fillStyle = rgb(168, 160, 143); ca.fillRect(0, 0, size, size);
  ch.fillStyle = rgb(150, 150, 150); ch.fillRect(0, 0, size, size);

  // Peeling paint: irregular patches revealing grey plaster beneath.
  for (let i = 0; i < 14; i++) {
    const x = rng.f() * size, y = rng.f() * size;
    const rad = rng.range(6, 40);
    wrapDraw(ca, size, (c) => {
      c.fillStyle = rgba(122, 114, 102, rng.range(0.5, 0.95));
      c.beginPath();
      const n = 14;
      for (let k = 0; k <= n; k++) {
        const t = (k / n) * 6.283;
        const rr = rad * (0.55 + Math.abs(Math.sin(k * 1.7 + i)) * 0.7);
        const px = x + Math.cos(t) * rr, py = y + Math.sin(t) * rr * 0.8;
        k === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
      }
      c.closePath(); c.fill();
    });
    wrapDraw(ch, size, (c) => {
      c.fillStyle = rgb(132, 132, 132);
      c.beginPath(); c.ellipse(x, y, rad * 0.8, rad * 0.64, 0, 0, 6.283); c.fill();
    });
  }

  // Water damage from the roof down.
  streaks(ca, size, seed + 4, 12, 0.34, [84, 70, 44]);
  grime(ca, size, seed + 8, 1.8, 0.22, [16, 14, 10]);
  speckle(ca, size, seed + 12, 0.035);

  cr.fillStyle = rgb(238, 238, 238); cr.fillRect(0, 0, size, size);
  return { albedo: a, height: h, rough: r };
};

GEN.rustmetal = (size, seed) => {
  const a = canvas(size), h = canvas(size), r = canvas(size);
  const ca = ctx2d(a), ch = ctx2d(h), cr = ctx2d(r);
  const rng = new Rng(seed);

  ca.fillStyle = rgb(84, 82, 80); ca.fillRect(0, 0, size, size);
  ch.fillStyle = rgb(160, 160, 160); ch.fillRect(0, 0, size, size);
  cr.fillStyle = rgb(90, 90, 90); cr.fillRect(0, 0, size, size);   // metal starts glossy

  // Rust blooms: layered brown fields with pitted cores. Real corrosion in low
  // light is a muted, chalky brown — saturated orange reads as lava, not steel.
  const f = noiseField(size, seed + 2, 4, 5);
  const img = ca.getImageData(0, 0, size, size);
  const d = img.data;
  const rimg = cr.getImageData(0, 0, size, size);
  const rd = rimg.data;
  const himg = ch.getImageData(0, 0, size, size);
  const hd = himg.data;
  for (let p = 0; p < size * size; p++) {
    const rust = clamp01((f[p] - 0.44) * 3.0);
    const i = p * 4;
    d[i] = lerp(d[i], lerp(78, 132, rust), rust);
    d[i + 1] = lerp(d[i + 1], lerp(58, 92, rust), rust);
    d[i + 2] = lerp(d[i + 2], lerp(46, 68, rust), rust);
    rd[i] = rd[i + 1] = rd[i + 2] = lerp(90, 240, rust);   // rust is very rough
    hd[i] = hd[i + 1] = hd[i + 2] = 160 - rust * 42;
  }
  ca.putImageData(img, 0, 0);
  cr.putImageData(rimg, 0, 0);
  ch.putImageData(himg, 0, 0);

  // Rivet lines along the plate edges.
  for (const [ax, ay, dx, dy] of [[6, 0, 0, 1], [size - 6, 0, 0, 1], [0, 6, 1, 0], [0, size - 6, 1, 0]]) {
    for (let t = 8; t < size; t += 22) {
      const x = ax + dx * t, y = ay + dy * t;
      ca.fillStyle = rgba(148, 132, 112, 0.5);
      ca.beginPath(); ca.arc(x, y, 2.6, 0, 6.283); ca.fill();
      ch.fillStyle = rgb(200, 200, 200);
      ch.beginPath(); ch.arc(x, y, 2.8, 0, 6.283); ch.fill();
    }
  }

  speckle(ca, size, seed + 6, 0.06);
  return { albedo: a, height: h, rough: r };
};

GEN.corrugated = (size, seed) => {
  const a = canvas(size), h = canvas(size), r = canvas(size);
  const ca = ctx2d(a), ch = ctx2d(h), cr = ctx2d(r);
  const rng = new Rng(seed);

  const ribs = 8;
  const w = size / ribs;
  for (let i = 0; i < ribs; i++) {
    const x = i * w;
    const g = ca.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0.0, rgb(56, 60, 58));
    g.addColorStop(0.34, rgb(112, 116, 112));
    g.addColorStop(0.5, rgb(126, 130, 126));
    g.addColorStop(0.68, rgb(96, 100, 97));
    g.addColorStop(1.0, rgb(48, 52, 50));
    ca.fillStyle = g; ca.fillRect(x, 0, w, size);

    const gh = ch.createLinearGradient(x, 0, x + w, 0);
    gh.addColorStop(0, rgb(60, 60, 60));
    gh.addColorStop(0.5, rgb(220, 220, 220));
    gh.addColorStop(1, rgb(60, 60, 60));
    ch.fillStyle = gh; ch.fillRect(x, 0, w, size);
  }

  cr.fillStyle = rgb(120, 120, 120); cr.fillRect(0, 0, size, size);

  // Rust creeping up from the bottom edge where water sits.
  const f = noiseField(size, seed + 9, 3, 3);
  const img = ca.getImageData(0, 0, size, size);
  const d = img.data;
  const rimg = cr.getImageData(0, 0, size, size);
  const rd = rimg.data;
  for (let y = 0; y < size; y++) {
    const base = clamp01((y / size - 0.42) * 1.6);
    for (let x = 0; x < size; x++) {
      const p = y * size + x;
      const rust = clamp01(base * 1.4 + (f[p] - 0.62) * 1.3) * clamp01(base * 2.0);
      const i = p * 4;
      d[i] = lerp(d[i], 124, rust);
      d[i + 1] = lerp(d[i + 1], 88, rust);
      d[i + 2] = lerp(d[i + 2], 66, rust);
      rd[i] = rd[i + 1] = rd[i + 2] = lerp(120, 240, rust);
    }
  }
  ca.putImageData(img, 0, 0);
  cr.putImageData(rimg, 0, 0);

  // Fixing screws on the rib crowns.
  for (let i = 0; i < ribs; i++) {
    for (let t = 12; t < size; t += size / 4) {
      const x = i * w + w * 0.5, y = t;
      ca.fillStyle = rgba(30, 28, 26, 0.7);
      ca.beginPath(); ca.arc(x, y, 2.2, 0, 6.283); ca.fill();
    }
  }
  speckle(ca, size, seed + 15, 0.04);
  return { albedo: a, height: h, rough: r };
};

GEN.wood = (size, seed) => {
  const a = canvas(size), h = canvas(size), r = canvas(size);
  const ca = ctx2d(a), ch = ctx2d(h), cr = ctx2d(r);
  const rng = new Rng(seed);

  const planks = 6;
  const ph = size / planks;
  for (let i = 0; i < planks; i++) {
    const y = i * ph;
    const base = rng.range(64, 96);
    ca.fillStyle = rgb(base, base * 0.78, base * 0.56);
    ca.fillRect(0, y, size, ph);
    ch.fillStyle = rgb(150 + rng.sym(16), 150, 150);
    ch.fillRect(0, y + 1, size, ph - 2);

    // Grain: long horizontal fibres with occasional knots.
    for (let k = 0; k < 90; k++) {
      const gy = y + rng.f() * ph;
      const amp = rng.range(0.4, 2.2);
      ca.strokeStyle = rgba(base * 0.6, base * 0.44, base * 0.3, rng.range(0.1, 0.42));
      ca.lineWidth = rng.range(0.5, 1.8);
      ca.beginPath();
      ca.moveTo(0, gy);
      for (let x = 0; x <= size; x += 12) {
        ca.lineTo(x, gy + Math.sin(x * 0.05 + k) * amp);
      }
      ca.stroke();
    }
    if (rng.chance(0.6)) {
      const kx = rng.f() * size, ky = y + ph * 0.5 + rng.sym(ph * 0.25);
      for (let ring = 6; ring > 0; ring--) {
        ca.strokeStyle = rgba(base * 0.44, base * 0.3, base * 0.2, 0.5);
        ca.lineWidth = 1.4;
        ca.beginPath(); ca.ellipse(kx, ky, ring * 1.8, ring * 1.15, 0, 0, 6.283); ca.stroke();
      }
    }
    // Plank gap
    ca.fillStyle = rgba(16, 12, 9, 0.9); ca.fillRect(0, y, size, 1.6);
    ch.fillStyle = rgb(64, 64, 64); ch.fillRect(0, y - 1, size, 3);
  }

  grime(ca, size, seed + 3, 2.2, 0.2, [12, 9, 6]);
  speckle(ca, size, seed + 5, 0.05);
  cr.fillStyle = rgb(224, 224, 224); cr.fillRect(0, 0, size, size);
  return { albedo: a, height: h, rough: r };
};

GEN.tile = (size, seed) => {
  const a = canvas(size), h = canvas(size), r = canvas(size);
  const ca = ctx2d(a), ch = ctx2d(h), cr = ctx2d(r);
  const rng = new Rng(seed);

  const n = 8;
  const t = size / n;
  ca.fillStyle = rgb(52, 50, 46); ca.fillRect(0, 0, size, size);
  ch.fillStyle = rgb(80, 80, 80); ch.fillRect(0, 0, size, size);

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const missing = rng.chance(0.07);
      if (missing) continue;
      const v = rng.range(104, 138);
      const warm = rng.chance(0.3);
      ca.fillStyle = rgb(v, v * (warm ? 0.94 : 0.99), v * (warm ? 0.84 : 0.96));
      ca.fillRect(x * t + 1, y * t + 1, t - 2, t - 2);
      ch.fillStyle = rgb(196, 196, 196);
      ch.fillRect(x * t + 1.4, y * t + 1.4, t - 2.8, t - 2.8);
      // Chipped corners.
      if (rng.chance(0.22)) {
        const cx = x * t + (rng.chance(0.5) ? 2 : t - 6);
        const cy = y * t + (rng.chance(0.5) ? 2 : t - 6);
        ca.fillStyle = rgb(66, 62, 56);
        ca.beginPath(); ca.moveTo(cx, cy); ca.lineTo(cx + 6, cy); ca.lineTo(cx, cy + 6); ca.fill();
      }
    }
  }

  grime(ca, size, seed + 6, 2.8, 0.24, [14, 12, 9]);
  streaks(ca, size, seed + 8, 8, 0.22, [30, 26, 18]);
  speckle(ca, size, seed + 10, 0.03);
  cr.fillStyle = rgb(150, 150, 150); cr.fillRect(0, 0, size, size);
  grime(cr, size, seed + 12, 2.4, 0.3);
  return { albedo: a, height: h, rough: r };
};

GEN.ash = (size, seed) => {
  const a = canvas(size), h = canvas(size), r = canvas(size);
  const ca = ctx2d(a), ch = ctx2d(h), cr = ctx2d(r);
  const rng = new Rng(seed);

  ca.fillStyle = rgb(88, 83, 76); ca.fillRect(0, 0, size, size);
  ch.fillStyle = rgb(128, 128, 128); ch.fillRect(0, 0, size, size);

  // Drifted ash: pale, soft, slightly warm.
  grime(ca, size, seed, 2, 0.3, [-6, -6, -8]);
  const f = noiseField(size, seed + 4, 3, 4);
  const img = ca.getImageData(0, 0, size, size);
  const d = img.data;
  const himg = ch.getImageData(0, 0, size, size);
  const hd = himg.data;
  for (let p = 0; p < size * size; p++) {
    const ashAmt = clamp01((f[p] - 0.44) * 2.6);
    const i = p * 4;
    d[i] = lerp(d[i], 122, ashAmt * 0.8);
    d[i + 1] = lerp(d[i + 1], 118, ashAmt * 0.8);
    d[i + 2] = lerp(d[i + 2], 110, ashAmt * 0.78);
    hd[i] = hd[i + 1] = hd[i + 2] = 128 + ashAmt * 26;
  }
  ca.putImageData(img, 0, 0);
  ch.putImageData(himg, 0, 0);

  // Grit, gravel, small char fragments.
  for (let i = 0; i < size * 3; i++) {
    const x = rng.f() * size, y = rng.f() * size, rad = rng.range(0.6, 2.6);
    const dark = rng.chance(0.55);
    ca.fillStyle = dark ? rgba(38, 34, 30, rng.range(0.3, 0.8)) : rgba(162, 155, 142, rng.range(0.2, 0.5));
    ca.beginPath(); ca.arc(x, y, rad, 0, 6.283); ca.fill();
    ch.fillStyle = rgb(128 + (dark ? -14 : 22), 128, 128);
    ch.beginPath(); ch.arc(x, y, rad, 0, 6.283); ch.fill();
  }

  speckle(ca, size, seed + 8, 0.07);
  cr.fillStyle = rgb(246, 246, 246); cr.fillRect(0, 0, size, size);
  return { albedo: a, height: h, rough: r };
};

GEN.rubble = (size, seed) => {
  const a = canvas(size), h = canvas(size), r = canvas(size);
  const ca = ctx2d(a), ch = ctx2d(h), cr = ctx2d(r);
  const rng = new Rng(seed);

  ca.fillStyle = rgb(84, 79, 73); ca.fillRect(0, 0, size, size);
  ch.fillStyle = rgb(100, 100, 100); ch.fillRect(0, 0, size, size);

  // Broken concrete chunks: angular polygons at several scales.
  for (let pass = 0; pass < 3; pass++) {
    const count = [26, 70, 190][pass];
    const rMin = [12, 6, 2.4][pass], rMax = [30, 14, 6][pass];
    for (let i = 0; i < count; i++) {
      const x = rng.f() * size, y = rng.f() * size;
      const rad = rng.range(rMin, rMax);
      const v = rng.range(78, 132);
      const sides = rng.int(4, 7);
      const rot = rng.f() * 6.283;
      const poly = (c) => {
        c.beginPath();
        for (let k = 0; k < sides; k++) {
          const t = rot + (k / sides) * 6.283;
          const rr = rad * rng.range(0.6, 1.0);
          const px = x + Math.cos(t) * rr, py = y + Math.sin(t) * rr;
          k === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
        }
        c.closePath(); c.fill();
      };
      wrapDraw(ca, size, (c) => { c.fillStyle = rgb(v, v * 0.96, v * 0.9); poly(c); });
      wrapDraw(ca, size, (c) => {
        // Shade the lower-right of each chunk to fake self-occlusion.
        c.fillStyle = 'rgba(0,0,0,0.22)';
        c.translate(rad * 0.16, rad * 0.2); poly(c);
      });
      wrapDraw(ch, size, (c) => { c.fillStyle = rgb(120 + rad * 2.2, 128, 128); poly(c); });
      // Occasional exposed rebar.
      if (pass === 0 && rng.chance(0.28)) {
        wrapDraw(ca, size, (c) => {
          c.strokeStyle = rgba(126, 62, 30, 0.8);
          c.lineWidth = rng.range(1.4, 2.6);
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x + rng.sym(rad * 2), y + rng.sym(rad * 2));
          c.stroke();
        });
      }
    }
  }

  grime(ca, size, seed + 3, 2.4, 0.2, [10, 8, 6]);
  speckle(ca, size, seed + 5, 0.06);
  cr.fillStyle = rgb(240, 240, 240); cr.fillRect(0, 0, size, size);
  return { albedo: a, height: h, rough: r };
};

GEN.roadline = (size, seed) => {
  // Retained for wide aprons where a painted line is baked in rather than
  // placed; the street builder uses explicit marking geometry instead.
  const base = GEN.asphalt(size, seed);
  const ca = ctx2d(base.albedo);
  const rng = new Rng(seed + 100);
  const y = size * 0.5;
  for (let x = 0; x < size; x += size / 3) {
    const w = size / 6;
    ca.save();
    ca.globalAlpha = 0.62;
    ca.fillStyle = rgb(196, 184, 140);
    ca.fillRect(x, y - 5, w, 10);
    ca.restore();
    // Wear: scrub the paint away in patches.
    for (let i = 0; i < 26; i++) {
      ca.globalAlpha = rng.range(0.3, 0.9);
      ca.fillStyle = rgb(38, 36, 34);
      ca.beginPath();
      ca.arc(x + rng.f() * w, y + rng.sym(5), rng.range(0.8, 3.2), 0, 6.283);
      ca.fill();
    }
    ca.globalAlpha = 1;
  }
  return base;
};

GEN.glass = (size, seed) => {
  const a = canvas(size), h = canvas(size), r = canvas(size);
  const ca = ctx2d(a), ch = ctx2d(h), cr = ctx2d(r);
  const rng = new Rng(seed);
  ca.fillStyle = rgb(26, 30, 32); ca.fillRect(0, 0, size, size);
  ch.fillStyle = rgb(160, 160, 160); ch.fillRect(0, 0, size, size);
  cr.fillStyle = rgb(24, 24, 24); cr.fillRect(0, 0, size, size);

  // Dirt film, heavier at the edges.
  const g = ca.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.72);
  g.addColorStop(0, 'rgba(120,116,100,0.05)');
  g.addColorStop(1, 'rgba(120,116,100,0.36)');
  ca.fillStyle = g; ca.fillRect(0, 0, size, size);
  streaks(ca, size, seed + 2, 20, 0.24, [130, 124, 106]);

  // Cracks radiating from an impact point, with the roughness spiking along them.
  const cx = rng.f() * size, cy = rng.f() * size;
  for (let i = 0; i < 11; i++) {
    const ang = (i / 11) * 6.283 + rng.sym(0.3);
    let x = cx, y = cy;
    ca.strokeStyle = rgba(214, 220, 224, 0.5);
    cr.strokeStyle = rgb(220, 220, 220);
    ca.lineWidth = 1.1; cr.lineWidth = 2.2;
    ca.beginPath(); ca.moveTo(x, y);
    cr.beginPath(); cr.moveTo(x, y);
    let a2 = ang;
    for (let s = 0; s < 7; s++) {
      a2 += rng.sym(0.4);
      x += Math.cos(a2) * rng.range(8, 26);
      y += Math.sin(a2) * rng.range(8, 26);
      ca.lineTo(x, y); cr.lineTo(x, y);
    }
    ca.stroke(); cr.stroke();
  }
  for (let ring = 1; ring <= 3; ring++) {
    ca.strokeStyle = rgba(200, 208, 214, 0.28);
    ca.lineWidth = 0.9;
    ca.beginPath(); ca.arc(cx, cy, ring * rng.range(12, 22), 0, 6.283); ca.stroke();
  }
  speckle(ca, size, seed + 4, 0.02);
  return { albedo: a, height: h, rough: r };
};

GEN.fabric = (size, seed) => {
  // Tarpaulins, tent sheeting, bedding — a lot of Hollis is draped in this.
  const a = canvas(size), h = canvas(size), r = canvas(size);
  const ca = ctx2d(a), ch = ctx2d(h), cr = ctx2d(r);
  const rng = new Rng(seed);
  ca.fillStyle = rgb(72, 78, 70); ca.fillRect(0, 0, size, size);
  ch.fillStyle = rgb(128, 128, 128); ch.fillRect(0, 0, size, size);

  // Woven thread pattern.
  const step = 3;
  for (let y = 0; y < size; y += step) {
    ca.fillStyle = rgba(0, 0, 0, 0.09); ca.fillRect(0, y, size, 1);
    ch.fillStyle = rgb(148, 148, 148); ch.fillRect(0, y, size, 1);
  }
  for (let x = 0; x < size; x += step) {
    ca.fillStyle = rgba(255, 255, 255, 0.05); ca.fillRect(x, 0, 1, size);
    ch.fillStyle = rgb(112, 112, 112); ch.fillRect(x, 0, 1, size);
  }
  grime(ca, size, seed + 2, 2.0, 0.26, [14, 12, 8]);
  // Patched tears.
  for (let i = 0; i < 5; i++) {
    const x = rng.f() * size, y = rng.f() * size;
    wrapDraw(ca, size, (c) => {
      c.strokeStyle = rgba(30, 28, 22, 0.7); c.lineWidth = 2;
      c.strokeRect(x, y, rng.range(14, 40), rng.range(12, 34));
    });
  }
  speckle(ca, size, seed + 6, 0.05);
  cr.fillStyle = rgb(250, 250, 250); cr.fillRect(0, 0, size, size);
  return { albedo: a, height: h, rough: r };
};

/**
 * Character surface: worn canvas/webbing with a fine weave and stitch lines.
 * Applied at a high UV repeat so it reads as cloth grain rather than pattern,
 * and it is what stops characters looking like untextured plastic.
 */
GEN.charcloth = (size, seed) => {
  const a = canvas(size), h = canvas(size), r = canvas(size);
  const ca = ctx2d(a), ch = ctx2d(h), cr = ctx2d(r);
  const rng = new Rng(seed);

  ca.fillStyle = rgb(188, 185, 180); ca.fillRect(0, 0, size, size);
  ch.fillStyle = rgb(128, 128, 128); ch.fillRect(0, 0, size, size);

  // Weave: alternating warp and weft at 2px, so it survives mipping into a
  // soft grain rather than aliasing into moiré.
  const step = 4;
  for (let y = 0; y < size; y += step) {
    ca.fillStyle = 'rgba(0,0,0,0.055)'; ca.fillRect(0, y, size, step / 2);
    ch.fillStyle = rgb(150, 150, 150); ch.fillRect(0, y, size, step / 2);
  }
  for (let x = 0; x < size; x += step) {
    ca.fillStyle = 'rgba(255,255,255,0.05)'; ca.fillRect(x, 0, step / 2, size);
    ch.fillStyle = rgb(108, 108, 108); ch.fillRect(x, 0, step / 2, size);
  }
  // Seams and stitch runs.
  for (let i = 0; i < 5; i++) {
    const x = rng.f() * size;
    ca.fillStyle = 'rgba(0,0,0,0.16)'; ca.fillRect(x, 0, 2, size);
    ch.fillStyle = rgb(96, 96, 96); ch.fillRect(x, 0, 3, size);
    for (let y = 2; y < size; y += 9) {
      ca.fillStyle = 'rgba(255,255,255,0.14)';
      ca.fillRect(x - 2, y, 4, 2);
      ch.fillStyle = rgb(176, 176, 176); ch.fillRect(x - 2, y, 4, 2);
    }
  }
  // Wear: pale abrasion on edges, dark grime in the folds.
  grime(ca, size, seed + 3, 3, 0.13, [10, 9, 7]);
  speckle(ca, size, seed + 5, 0.035);

  cr.fillStyle = rgb(238, 238, 238); cr.fillRect(0, 0, size, size);
  grime(cr, size, seed + 7, 4, 0.16);
  return { albedo: a, height: h, rough: r };
};

GEN.paintedmetal = (size, seed) => {
  // Painted plant equipment: safety yellow / industrial green over steel.
  const a = canvas(size), h = canvas(size), r = canvas(size);
  const ca = ctx2d(a), ch = ctx2d(h), cr = ctx2d(r);
  const rng = new Rng(seed);
  // Neutral primer. Actual colour comes from the vertex tint, so one texture
  // serves every painted object in the city — vehicles, plant, lockers, signs.
  ca.fillStyle = rgb(176, 173, 168); ca.fillRect(0, 0, size, size);
  ch.fillStyle = rgb(170, 170, 170); ch.fillRect(0, 0, size, size);
  cr.fillStyle = rgb(140, 140, 140); cr.fillRect(0, 0, size, size);

  // Chipped paint revealing rust.
  const rimg = cr.getImageData(0, 0, size, size); const rd = rimg.data;
  for (let i = 0; i < 200; i++) {
    const x = rng.f() * size, y = rng.f() * size, rad = rng.range(1.2, 9);
    wrapDraw(ca, size, (c) => {
      c.fillStyle = rgba(112, 58, 30, rng.range(0.4, 0.95));
      c.beginPath(); c.arc(x, y, rad, 0, 6.283); c.fill();
    });
    wrapDraw(ch, size, (c) => {
      c.fillStyle = rgb(150, 150, 150);
      c.beginPath(); c.arc(x, y, rad, 0, 6.283); c.fill();
    });
  }
  cr.putImageData(rimg, 0, 0);
  grime(ca, size, seed + 3, 2.6, 0.2, [12, 10, 6]);
  speckle(ca, size, seed + 5, 0.045);
  return { albedo: a, height: h, rough: r };
};

// -------------------------------------------------------------- public API --

/**
 * Build (or fetch from cache) a full material texture set.
 * @param {string} kind key of GEN
 * @param {number} seed variation seed — same kind, different seed, different tile
 * @param {number} size override resolution
 */
export function surface(kind, seed = 1, size = RES) {
  const key = `${kind}:${seed}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const gen = GEN[kind];
  if (!gen) throw new Error(`unknown surface "${kind}"`);
  const parts = gen(size, seed);
  const set = {
    map: toTexture(parts.albedo, true),
    normalMap: normalFromHeight(parts.height, kind === 'corrugated' ? 3.2 : 2.0),
    ormMap: packRoughAO(parts.rough, null),
  };
  cache.set(key, set);
  return set;
}

export function listSurfaces() { return Object.keys(GEN); }

// ------------------------------------------------------------ sprite atlas --

/** Soft radial sprite for smoke/dust puffs. */
export function smokeSprite(size = 128, seed = 1) {
  const key = `smoke:${size}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(size), x = ctx2d(c);
  const rng = new Rng(seed);
  x.clearRect(0, 0, size, size);
  // Build a puff from overlapping soft blobs so the silhouette is not a circle.
  for (let i = 0; i < 22; i++) {
    const px = size / 2 + rng.sym(size * 0.19);
    const py = size / 2 + rng.sym(size * 0.19);
    const r = rng.range(size * 0.12, size * 0.3);
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,0.16)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.07)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(px, py, r, 0, 6.283); x.fill();
  }
  // Fade hard at the sprite border so quads never show a seam.
  const vign = x.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.5);
  vign.addColorStop(0, 'rgba(0,0,0,0)');
  vign.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out';
  x.fillStyle = vign; x.fillRect(0, 0, size, size);
  x.globalCompositeOperation = 'source-over';

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  cache.set(key, t);
  return t;
}

/** Hot point sprite for embers and sparks. */
export function emberSprite(size = 64) {
  const key = `ember:${size}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(size), x = ctx2d(c);
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,248,230,1)');
  g.addColorStop(0.18, 'rgba(255,196,110,0.92)');
  g.addColorStop(0.42, 'rgba(255,116,36,0.45)');
  g.addColorStop(0.75, 'rgba(180,52,10,0.12)');
  g.addColorStop(1.0, 'rgba(120,20,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/** Scorch / blood / oil decal stamps. */
export function decalSprite(kind, seed = 1, size = 128) {
  const key = `decal:${kind}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(size), x = ctx2d(c);
  const rng = new Rng(seed * 977 + kind.length);
  x.clearRect(0, 0, size, size);

  const cols = {
    scorch: [16, 13, 11],
    blood: [96, 16, 12],
    oil: [18, 16, 20],
    ash: [140, 134, 124],
  }[kind] || [20, 20, 20];

  const blobs = kind === 'blood' ? 9 : 16;
  for (let i = 0; i < blobs; i++) {
    const px = size / 2 + rng.sym(size * 0.22);
    const py = size / 2 + rng.sym(size * 0.22);
    const r = rng.range(size * 0.1, size * 0.32);
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    const a = rng.range(0.35, 0.85);
    g.addColorStop(0, rgba(cols[0], cols[1], cols[2], a));
    g.addColorStop(0.6, rgba(cols[0], cols[1], cols[2], a * 0.45));
    g.addColorStop(1, rgba(cols[0], cols[1], cols[2], 0));
    x.fillStyle = g;
    x.beginPath(); x.arc(px, py, r, 0, 6.283); x.fill();
  }
  if (kind === 'blood') {
    // Spatter droplets outside the main pool read as motion.
    for (let i = 0; i < 34; i++) {
      const ang = rng.f() * 6.283;
      const d = rng.range(size * 0.2, size * 0.46);
      const px = size / 2 + Math.cos(ang) * d;
      const py = size / 2 + Math.sin(ang) * d;
      x.fillStyle = rgba(cols[0], cols[1], cols[2], rng.range(0.25, 0.7));
      x.beginPath(); x.ellipse(px, py, rng.range(1, 4), rng.range(1, 3), ang, 0, 6.283); x.fill();
    }
  }
  const vign = x.createRadialGradient(size / 2, size / 2, size * 0.34, size / 2, size / 2, size * 0.5);
  vign.addColorStop(0, 'rgba(0,0,0,0)');
  vign.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out';
  x.fillStyle = vign; x.fillRect(0, 0, size, size);
  x.globalCompositeOperation = 'source-over';

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/**
 * Signage and stencilled text, drawn once per unique string. Used for street
 * signs, unit numbers, hazard placards and the survey markings that give the
 * Cinder Line its physical presence in the world.
 */
export function signTexture(lines, opts = {}) {
  const {
    w = 256, h = 128, bg = '#1b1a17', fg = '#d8cfbc', accent = '#ff7a2f',
    weathered = 0.55, font = 'bold', letterSpacing = 2, seed = 1, border = true,
    align = 'center',
  } = opts;
  const key = `sign:${lines.join('|')}:${w}x${h}:${bg}:${fg}:${accent}:${seed}`;
  if (cache.has(key)) return cache.get(key);

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = ctx2d(c);
  const rng = new Rng(seed);

  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  if (border) {
    x.strokeStyle = accent; x.lineWidth = Math.max(2, h * 0.035);
    x.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1);
  }

  const n = lines.length;
  const fs = Math.min(h / (n + 0.9), w / (Math.max(...lines.map((l) => l.length)) * 0.62 + 1));
  x.textBaseline = 'middle';
  x.textAlign = align;
  const tx = align === 'center' ? w / 2 : h * 0.16;
  lines.forEach((line, i) => {
    x.font = `${font} ${fs}px ui-monospace, "SF Mono", Menlo, monospace`;
    x.fillStyle = i === 0 && n > 1 ? accent : fg;
    // Manual letter spacing (canvas letterSpacing is not universally supported).
    const chars = [...line];
    const widths = chars.map((ch) => x.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + letterSpacing * (chars.length - 1);
    let cx = align === 'center' ? tx - total / 2 : tx;
    const cy = h * (0.5 + (i - (n - 1) / 2) * (fs * 1.22) / h);
    x.textAlign = 'left';
    for (let k = 0; k < chars.length; k++) {
      x.fillText(chars[k], cx, cy);
      cx += widths[k] + letterSpacing;
    }
  });

  // Weathering: scrape the paint, add rust freckles, dim the whole thing.
  if (weathered > 0) {
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 260 * weathered; i++) {
      x.fillStyle = `rgba(0,0,0,${rng.range(0.1, 0.8)})`;
      x.beginPath();
      x.arc(rng.f() * w, rng.f() * h, rng.range(0.6, 3.4), 0, 6.283);
      x.fill();
    }
    x.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 90 * weathered; i++) {
      x.fillStyle = `rgba(${110 + rng.f() * 50 | 0},${50 + rng.f() * 30 | 0},20,${rng.range(0.1, 0.5)})`;
      x.beginPath();
      x.arc(rng.f() * w, rng.f() * h, rng.range(0.8, 3.8), 0, 6.283);
      x.fill();
    }
    x.fillStyle = `rgba(10,8,6,${0.18 * weathered})`;
    x.fillRect(0, 0, w, h);
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  cache.set(key, t);
  return t;
}

/** Free every cached GPU texture. Called on teardown. */
export function disposeTextures() {
  for (const v of cache.values()) {
    if (v && v.isTexture) v.dispose();
    else if (v && v.map) { v.map.dispose(); v.normalMap.dispose(); v.ormMap.dispose(); }
  }
  cache.clear();
}

export function textureMemoryEstimateMB() {
  let bytes = 0;
  for (const v of cache.values()) {
    const count = (t) => {
      if (!t || !t.image) return 0;
      const w = t.image.width || 0, h = t.image.height || 0;
      return w * h * 4 * 1.34;   // 1.34x for the mip chain
    };
    if (v.isTexture) bytes += count(v);
    else bytes += count(v.map) + count(v.normalMap) + count(v.ormMap);
  }
  return bytes / (1024 * 1024);
}
