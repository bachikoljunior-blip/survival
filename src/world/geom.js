/**
 * Geometry construction.
 *
 * The city is built by accumulating triangles into a small number of large
 * buffers, one per (material, chunk) pair. A district that would be six hundred
 * meshes becomes about fifty draw calls, which is the single biggest reason
 * this runs on a phone.
 *
 * Vertex colours carry baked ambient occlusion. Real-time AO is out of budget,
 * but corner darkening and a coarse occlusion probe get most of the way there
 * and cost nothing at runtime — it is what stops the world from looking like
 * flat-lit boxes.
 */

import * as THREE from 'three';
import { clamp01, lerp } from '../core/util.js';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

/** Face direction constants used by the box builder. */
export const FACE = { PX: 1, NX: 2, PY: 4, NY: 8, PZ: 16, NZ: 32, ALL: 63, SIDES: 51, NOBOTTOM: 55 };

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
    this.vertCount = 0;
  }

  get isEmpty() { return this.vertCount === 0; }

  /** Push one vertex; colour is [r,g,b] in 0..1. */
  vert(x, y, z, nx, ny, nz, u, v, r, g, b) {
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    this.col.push(r, g, b);
    return this.vertCount++;
  }

  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }

  /**
   * Axis-aligned box.
   * @param {object} o { x,y,z, w,h,d, faces, uvScale, tint, ao, uvOffset }
   *   x,y,z is the *centre* of the box footprint at its base (y = bottom).
   */
  box(o) {
    const {
      x = 0, y = 0, z = 0, w = 1, h = 1, d = 1,
      faces = FACE.ALL, uvScale = 0.5, tint = [1, 1, 1],
      ao = 0.0, aoTop = 0, uvOffset = [0, 0], flipUV = false,
    } = o;
    const x0 = x - w / 2, x1 = x + w / 2;
    const y0 = y, y1 = y + h;
    const z0 = z - d / 2, z1 = z + d / 2;
    const [tr, tg, tb] = tint;
    const [uo, vo] = uvOffset;

    // Vertical gradient AO: darker at the base where the ground occludes.
    const aoAt = (yy) => {
      const t = clamp01((yy - y0) / Math.max(0.001, h));
      return 1 - ao * (1 - t) * (1 - t);
    };

    // Faces are subdivided so that baked vertex AO has real spatial resolution.
    // A single quad across a twenty-metre wall smears one occlusion sample over
    // the whole elevation, which is what makes untessellated worlds look flat.
    const cell = o.aoCell ?? 3.2;
    const maxSeg = o.maxSeg ?? 8;

    const face = (nx, ny, nz, corners, uw, uh) => {
      const su = Math.max(1, Math.min(maxSeg, Math.round(uw / cell)));
      const sv = Math.max(1, Math.min(maxSeg, Math.round(uh / cell)));
      const [c0, c1, c2, c3] = corners;
      const base = this.vertCount;
      for (let j = 0; j <= sv; j++) {
        const tv = j / sv;
        for (let i = 0; i <= su; i++) {
          const tu = i / su;
          // Bilinear across the face corners (they are given in ring order:
          // c0 -> c1 along u at v=0, c3 -> c2 along u at v=1).
          const ax = c0[0] + (c1[0] - c0[0]) * tu, ay = c0[1] + (c1[1] - c0[1]) * tu, az = c0[2] + (c1[2] - c0[2]) * tu;
          const bx = c3[0] + (c2[0] - c3[0]) * tu, by = c3[1] + (c2[1] - c3[1]) * tu, bz = c3[2] + (c2[2] - c3[2]) * tu;
          const px = ax + (bx - ax) * tv, py = ay + (by - ay) * tv, pz = az + (bz - az) * tv;
          let k = ny > 0.5 ? 1 - aoTop : aoAt(py);
          this.vert(px, py, pz, nx, ny, nz,
            (flipUV ? tv : tu) * uw * uvScale + uo,
            (flipUV ? tu : tv) * uh * uvScale + vo,
            tr * k, tg * k, tb * k);
        }
      }
      const row = su + 1;
      for (let j = 0; j < sv; j++) {
        for (let i = 0; i < su; i++) {
          const a = base + j * row + i;
          this.quad(a, a + 1, a + row + 1, a + row);
        }
      }
    };

    if (faces & FACE.PZ) face(0, 0, 1, [
      [x0, y0, z1, 0, 0], [x1, y0, z1, 1, 0], [x1, y1, z1, 1, 1], [x0, y1, z1, 0, 1]], w, h);
    if (faces & FACE.NZ) face(0, 0, -1, [
      [x1, y0, z0, 0, 0], [x0, y0, z0, 1, 0], [x0, y1, z0, 1, 1], [x1, y1, z0, 0, 1]], w, h);
    if (faces & FACE.PX) face(1, 0, 0, [
      [x1, y0, z1, 0, 0], [x1, y0, z0, 1, 0], [x1, y1, z0, 1, 1], [x1, y1, z1, 0, 1]], d, h);
    if (faces & FACE.NX) face(-1, 0, 0, [
      [x0, y0, z0, 0, 0], [x0, y0, z1, 1, 0], [x0, y1, z1, 1, 1], [x0, y1, z0, 0, 1]], d, h);
    if (faces & FACE.PY) face(0, 1, 0, [
      [x0, y1, z1, 0, 0], [x1, y1, z1, 1, 0], [x1, y1, z0, 1, 1], [x0, y1, z0, 0, 1]], w, d);
    if (faces & FACE.NY) face(0, -1, 0, [
      [x0, y0, z0, 0, 0], [x1, y0, z0, 1, 0], [x1, y0, z1, 1, 1], [x0, y0, z1, 0, 1]], w, d);
    return this;
  }

  /** Box rotated about Y. Used for anything that is not on the street grid. */
  boxRot(o) {
    const { rot = 0, x = 0, z = 0 } = o;
    if (Math.abs(rot) < 1e-5) return this.box(o);
    const start = this.vertCount;
    this.box({ ...o, x: 0, z: 0 });
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let i = start; i < this.vertCount; i++) {
      const px = this.pos[i * 3], pz = this.pos[i * 3 + 2];
      this.pos[i * 3] = px * c - pz * s + x;
      this.pos[i * 3 + 2] = px * s + pz * c + z;
      const nx = this.nrm[i * 3], nz = this.nrm[i * 3 + 2];
      this.nrm[i * 3] = nx * c - nz * s;
      this.nrm[i * 3 + 2] = nx * s + nz * c;
    }
    return this;
  }

  /** Horizontal plane (floors, roads, ceilings when flipped), subdivided. */
  plane(x, y, z, w, d, uvScale = 0.5, tint = [1, 1, 1], up = true, cell = 3.2) {
    const base = this.vertCount;
    const x0 = x - w / 2, z0 = z - d / 2;
    const ny = up ? 1 : -1;
    const [tr, tg, tb] = tint;
    const sx = Math.max(1, Math.min(24, Math.round(w / cell)));
    const sz = Math.max(1, Math.min(24, Math.round(d / cell)));
    for (let j = 0; j <= sz; j++) {
      for (let i = 0; i <= sx; i++) {
        const px = x0 + (i / sx) * w, pz = z0 + (j / sz) * d;
        this.vert(px, y, pz, 0, ny, 0, (i / sx) * w * uvScale, (j / sz) * d * uvScale, tr, tg, tb);
      }
    }
    const row = sx + 1;
    for (let j = 0; j < sz; j++) {
      for (let i = 0; i < sx; i++) {
        const a = base + j * row + i;
        if (up) this.quad(a, a + row, a + row + 1, a + 1);
        else this.quad(a, a + 1, a + row + 1, a + row);
      }
    }
    return this;
  }

  /**
   * Extrude a closed 2D polygon (in XZ) vertically. Used for irregular
   * building footprints, rubble mounds and the trench walls.
   */
  prism(points, y0, y1, uvScale = 0.5, tint = [1, 1, 1], cap = true, ao = 0.35) {
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const [ax, az] = points[i];
      const [bx, bz] = points[(i + 1) % n];
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      const nx = dz / len, nz = -dx / len;
      const base = this.vertCount;
      const h = y1 - y0;
      const kb = 1 - ao, kt = 1;
      this.vert(ax, y0, az, nx, 0, nz, 0, 0, tint[0] * kb, tint[1] * kb, tint[2] * kb);
      this.vert(bx, y0, bz, nx, 0, nz, len * uvScale, 0, tint[0] * kb, tint[1] * kb, tint[2] * kb);
      this.vert(bx, y1, bz, nx, 0, nz, len * uvScale, h * uvScale, tint[0] * kt, tint[1] * kt, tint[2] * kt);
      this.vert(ax, y1, az, nx, 0, nz, 0, h * uvScale, tint[0] * kt, tint[1] * kt, tint[2] * kt);
      this.quad(base, base + 1, base + 2, base + 3);
    }
    if (cap) {
      // Fan triangulation — every footprint used here is convex or near-convex.
      const base = this.vertCount;
      for (const [px, pz] of points) {
        this.vert(px, y1, pz, 0, 1, 0, px * uvScale, pz * uvScale, tint[0], tint[1], tint[2]);
      }
      for (let i = 1; i < n - 1; i++) this.idx.push(base, base + i, base + i + 1);
    }
    return this;
  }

  /** Cylinder along +Y (pipes, poles, drums, boreholes). */
  cylinder(x, y, z, r, h, seg = 8, uvScale = 0.5, tint = [1, 1, 1], caps = true, ao = 0.25) {
    const base = this.vertCount;
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      const cx = Math.cos(t), cz = Math.sin(t);
      const u = (i / seg) * r * Math.PI * 2 * uvScale;
      this.vert(x + cx * r, y, z + cz * r, cx, 0, cz, u, 0, tint[0] * (1 - ao), tint[1] * (1 - ao), tint[2] * (1 - ao));
      this.vert(x + cx * r, y + h, z + cz * r, cx, 0, cz, u, h * uvScale, tint[0], tint[1], tint[2]);
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 2, a + 3, a, a + 3, a + 1);
    }
    if (caps) {
      for (const [yy, ny] of [[y + h, 1], [y, -1]]) {
        const c = this.vertCount;
        this.vert(x, yy, z, 0, ny, 0, 0, 0, tint[0], tint[1], tint[2]);
        for (let i = 0; i <= seg; i++) {
          const t = (i / seg) * Math.PI * 2;
          this.vert(x + Math.cos(t) * r, yy, z + Math.sin(t) * r, 0, ny, 0,
            Math.cos(t) * r * uvScale, Math.sin(t) * r * uvScale, tint[0], tint[1], tint[2]);
        }
        for (let i = 0; i < seg; i++) {
          if (ny > 0) this.idx.push(c, c + i + 1, c + i + 2);
          else this.idx.push(c, c + i + 2, c + i + 1);
        }
      }
    }
    return this;
  }

  /** A quad in an arbitrary plane, given four corner points. */
  face4(p0, p1, p2, p3, uv = [[0, 0], [1, 0], [1, 1], [0, 1]], tint = [1, 1, 1]) {
    const base = this.vertCount;
    _v.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    _n.set(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]);
    _v.cross(_n).normalize();
    for (let i = 0; i < 4; i++) {
      const p = [p0, p1, p2, p3][i];
      this.vert(p[0], p[1], p[2], _v.x, _v.y, _v.z, uv[i][0], uv[i][1], tint[0], tint[1], tint[2]);
    }
    this.quad(base, base + 1, base + 2, base + 3);
    return this;
  }

  /** Append another builder's contents, optionally translated. */
  append(other, dx = 0, dy = 0, dz = 0) {
    const off = this.vertCount;
    for (let i = 0; i < other.vertCount; i++) {
      this.pos.push(other.pos[i * 3] + dx, other.pos[i * 3 + 1] + dy, other.pos[i * 3 + 2] + dz);
      this.nrm.push(other.nrm[i * 3], other.nrm[i * 3 + 1], other.nrm[i * 3 + 2]);
      this.uv.push(other.uv[i * 2], other.uv[i * 2 + 1]);
      this.col.push(other.col[i * 3], other.col[i * 3 + 1], other.col[i * 3 + 2]);
    }
    for (const i of other.idx) this.idx.push(i + off);
    this.vertCount += other.vertCount;
    return this;
  }

  /**
   * Multiply vertex colours by an occlusion function of world position. Used
   * once per chunk after the geometry is complete, with a coarse voxel field
   * describing where the buildings are.
   */
  applyOcclusion(fn) {
    for (let i = 0; i < this.vertCount; i++) {
      const k = fn(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2],
        this.nrm[i * 3], this.nrm[i * 3 + 1], this.nrm[i * 3 + 2]);
      this.col[i * 3] *= k;
      this.col[i * 3 + 1] *= k;
      this.col[i * 3 + 2] *= k;
    }
    return this;
  }

  build(computeBounds = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    // uv1 mirrors uv so aoMap sampling is well-defined on every surface.
    g.setAttribute('uv1', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.vertCount > 65535
      ? new THREE.Uint32BufferAttribute(this.idx, 1)
      : new THREE.Uint16BufferAttribute(this.idx, 1));
    if (computeBounds) { g.computeBoundingSphere(); g.computeBoundingBox(); }
    return g;
  }

  get triangleCount() { return this.idx.length / 3; }
}

/**
 * Groups geometry by material key and emits one mesh per key.
 * This is the interface every world-building routine writes through.
 */
export class ChunkBuilder {
  constructor(name = 'chunk') {
    this.name = name;
    this.groups = new Map();
  }
  /** Get (or create) the builder for a material key. */
  m(key) {
    let b = this.groups.get(key);
    if (!b) this.groups.set(key, (b = new MeshBuilder()));
    return b;
  }
  applyOcclusion(fn) {
    for (const b of this.groups.values()) b.applyOcclusion(fn);
    return this;
  }
  /**
   * @param {(key:string)=>THREE.Material} resolve
   * @returns {THREE.Object3D}
   */
  build(resolve, opts = {}) {
    const group = new THREE.Group();
    group.name = this.name;
    for (const [key, b] of this.groups) {
      if (b.isEmpty) continue;
      const mesh = new THREE.Mesh(b.build(), resolve(key));
      mesh.name = `${this.name}:${key}`;
      mesh.castShadow = opts.castShadow ?? true;
      mesh.receiveShadow = opts.receiveShadow ?? true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
    }
    return group;
  }
  get stats() {
    let tris = 0, verts = 0;
    for (const b of this.groups.values()) { tris += b.triangleCount; verts += b.vertCount; }
    return { meshes: this.groups.size, tris, verts };
  }
}

/**
 * Coarse voxel occupancy used to bake ambient occlusion and to answer
 * "is this point indoors / under cover" for the gas simulation.
 */
export class OcclusionGrid {
  constructor(minX, minZ, maxX, maxZ, cell = 2, maxY = 40) {
    this.cell = cell;
    this.minX = minX; this.minZ = minZ;
    this.nx = Math.ceil((maxX - minX) / cell);
    this.nz = Math.ceil((maxZ - minZ) / cell);
    this.ny = Math.ceil(maxY / cell);
    this.data = new Uint8Array(this.nx * this.ny * this.nz);
    // Height of solid coverage above each column, for the "under cover" test.
    this.cover = new Float32Array(this.nx * this.nz).fill(-1);
  }
  _i(ix, iy, iz) { return (iy * this.nz + iz) * this.nx + ix; }
  inBounds(ix, iy, iz) { return ix >= 0 && iz >= 0 && iy >= 0 && ix < this.nx && iz < this.nz && iy < this.ny; }

  /** Mark a solid AABB. */
  fillBox(x0, y0, z0, x1, y1, z1) {
    const c = this.cell;
    const ix0 = Math.max(0, Math.floor((x0 - this.minX) / c));
    const ix1 = Math.min(this.nx - 1, Math.floor((x1 - this.minX) / c));
    const iz0 = Math.max(0, Math.floor((z0 - this.minZ) / c));
    const iz1 = Math.min(this.nz - 1, Math.floor((z1 - this.minZ) / c));
    const iy0 = Math.max(0, Math.floor(y0 / c));
    const iy1 = Math.min(this.ny - 1, Math.floor(y1 / c));
    for (let iy = iy0; iy <= iy1; iy++)
      for (let iz = iz0; iz <= iz1; iz++)
        for (let ix = ix0; ix <= ix1; ix++) this.data[this._i(ix, iy, iz)] = 1;
    for (let iz = iz0; iz <= iz1; iz++)
      for (let ix = ix0; ix <= ix1; ix++) {
        const k = iz * this.nx + ix;
        if (y1 > this.cover[k]) this.cover[k] = y1;
      }
  }

  solidAt(x, y, z) {
    const ix = Math.floor((x - this.minX) / this.cell);
    const iz = Math.floor((z - this.minZ) / this.cell);
    const iy = Math.floor(y / this.cell);
    if (!this.inBounds(ix, iy, iz)) return 0;
    return this.data[this._i(ix, iy, iz)];
  }

  /** Height of the lowest solid above (x,z), or -1 if open sky. */
  coverAt(x, z) {
    const ix = Math.floor((x - this.minX) / this.cell);
    const iz = Math.floor((z - this.minZ) / this.cell);
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return -1;
    return this.cover[iz * this.nx + ix];
  }

  /**
   * Hemispherical occlusion estimate at a surface point, sampled over a fixed
   * set of directions biased toward the normal. Cheap because it runs once at
   * build time over a coarse grid.
   */
  occlusion(x, y, z, nx, ny, nz) {
    const DIRS = OcclusionGrid.DIRS;
    let hits = 0, total = 0;
    for (let i = 0; i < DIRS.length; i += 3) {
      const dx = DIRS[i], dy = DIRS[i + 1], dz = DIRS[i + 2];
      const dot = dx * nx + dy * ny + dz * nz;
      if (dot <= 0.05) continue;
      total += dot;
      // March outward; nearer occluders count for more.
      for (let s = 1; s <= 5; s++) {
        const t = s * 2.2;
        if (this.solidAt(x + dx * t + nx * 0.3, y + dy * t + ny * 0.3, z + dz * t + nz * 0.3)) {
          hits += dot * (1 - (s - 1) / 6);
          break;
        }
      }
    }
    if (total <= 0) return 1;
    return 1 - clamp01(hits / total) * 0.55;
  }
}

// A fixed 26-direction sampling set (cube faces, edges and corners, normalised).
OcclusionGrid.DIRS = (() => {
  const d = [];
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        if (!x && !y && !z) continue;
        if (y < 0) continue;          // occlusion from below is handled by the base AO ramp
        const l = Math.hypot(x, y, z);
        d.push(x / l, y / l, z / l);
      }
  return new Float32Array(d);
})();

/** Convenience: a merged instanced mesh for repeated props. */
export function makeInstanced(geometry, material, transforms, colors) {
  const inst = new THREE.InstancedMesh(geometry, material, transforms.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  for (let i = 0; i < transforms.length; i++) {
    const t = transforms[i];
    m.compose(
      _v.set(t.x, t.y, t.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(t.rx || 0, t.ry || 0, t.rz || 0)),
      new THREE.Vector3(t.s || 1, t.sy || t.s || 1, t.s || 1)
    );
    inst.setMatrixAt(i, m);
    if (colors) { c.setHex(colors[i] ?? 0xffffff); inst.setColorAt(i, c); }
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.castShadow = true;
  inst.receiveShadow = true;
  inst.frustumCulled = true;
  return inst;
}
