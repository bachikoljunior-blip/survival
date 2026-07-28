/**
 * City assembly.
 *
 * Takes the authored district description (world_data.js) and produces:
 *   - merged, chunked render geometry (a few dozen draw calls for the district)
 *   - the collision world
 *   - the gas field's sources, cover map and ground heights
 *   - the navigation grid
 *   - interaction points, door transitions, spawn anchors and light markers
 *
 * Chunking is spatial: geometry is bucketed into 40 m cells so frustum culling
 * has something to work with. Within a cell, geometry is merged per material.
 */

import * as THREE from 'three';
import { ChunkBuilder, OcclusionGrid, FACE } from './geom.js';
import { CollisionWorld, Box, LAYER } from './collision.js';
import { GasField } from './gas.js';
import { NavGrid } from './nav.js';
import { building } from './buildings.js';
import * as P from './props.js';
import { Rng } from '../core/rng.js';
import { clamp, clamp01, lerp, TAU } from '../core/util.js';
import { signTexture } from '../render/textures.js';

const CHUNK = 40;

export class City {
  constructor(data, mats, tier) {
    this.data = data;
    this.mats = mats;
    this.tier = tier;
    this.root = new THREE.Group();
    this.root.name = 'city';

    this.collision = new CollisionWorld(6);
    this.gas = null;
    this.nav = null;
    this.lightMarkers = [];
    this.fxMarkers = [];
    this.doors = [];
    this.interactions = [];
    this.spawns = new Map();
    this.regions = [];
    this.signs = [];
    this.stats = {};
    this._chunks = new Map();
    this._occ = null;
  }

  /** Resolve a material key to a shared material. */
  _mat(key) {
    const m = this.mats;
    switch (key) {
      case 'asphalt': return m.get('asphalt', { seed: 3, repeat: [1, 1] });
      case 'roadline': return m.get('roadline', { seed: 4, repeat: [1, 1] });
      case 'concrete': return m.get('concrete', { seed: 5, repeat: [1, 1] });
      case 'brick': return m.get('brick', { seed: 6, repeat: [1, 1] });
      case 'plaster': return m.get('plaster', { seed: 7, repeat: [1, 1] });
      case 'rubble': return m.get('rubble', { seed: 8, repeat: [1, 1] });
      case 'ash': return m.get('ash', { seed: 9, repeat: [1, 1] });
      case 'tile': return m.get('tile', { seed: 10, repeat: [1, 1] });
      case 'wood': return m.get('wood', { seed: 11, repeat: [1, 1] });
      case 'metal': return m.get('rustmetal', { seed: 12, repeat: [1, 1], roughness: 0.72, metalness: 0.55 });
      case 'rust': return m.get('rustmetal', { seed: 13, repeat: [1, 1], roughness: 0.95, metalness: 0.28 });
      case 'corrugated': return m.get('corrugated', { seed: 14, repeat: [1, 1], roughness: 0.8, metalness: 0.4 });
      case 'paint': return m.get('paintedmetal', { seed: 15, repeat: [1, 1], roughness: 0.7, metalness: 0.22 });
      case 'fabric': return m.get('fabric', { seed: 16, repeat: [1, 1] });
      case 'glass': return m.get('glass', { seed: 17, repeat: [1, 1], roughness: 0.18, metalness: 0.1 });
      case 'dark': return m.flat(0x14120f, { roughness: 0.95, metalness: 0.0 });
      case 'emberglow': return m.glow(0xff7a26, 3.6);
      case 'lampglow': return m.glow(0xffc98a, 3.0);
      case 'screenglow': return m.glow(0xffb46a, 1.5);
      case 'toxicglow': return m.glow(0xc8e04a, 2.0);
      default: return m.flat(0x808080);
    }
  }

  _chunk(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const key = `${cx},${cz}`;
    let c = this._chunks.get(key);
    if (!c) {
      c = new ChunkBuilder(`chunk_${key}`);
      c.cx = cx; c.cz = cz;
      this._chunks.set(key, c);
    }
    return c;
  }

  /** Add a solid to both the collision world and the occlusion grid. */
  solid(x, y0, z, w, h, d, rot = 0, layer = LAYER.SOLID, tag = null) {
    const b = this.collision.add(new Box(x, y0, z, w, h, d, rot, layer, tag));
    if (this._occ && layer === LAYER.SOLID) {
      // Conservative AABB of the rotated box.
      const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
      const ew = (w / 2) * c + (d / 2) * s;
      const ed = (w / 2) * s + (d / 2) * c;
      this._occ.fillBox(x - ew, y0, z - ed, x + ew, y0 + h, z + ed);
    }
    return b;
  }

  // ------------------------------------------------------------------ build

  build(onProgress = () => {}) {
    const d = this.data;
    const rng = new Rng(d.seed || 'hollis');
    const B = d.bounds;

    this._occ = new OcclusionGrid(B.minX, B.minZ, B.maxX, B.maxZ, 2.4, 46);
    this.gas = new GasField(B.minX, B.minZ, B.maxX, B.maxZ, 4);

    onProgress('ground');
    this._buildGround(rng);

    onProgress('streets');
    this._buildStreets(rng);

    onProgress('buildings');
    this._buildBuildings(rng);

    onProgress('structures');
    this._buildStructures(rng);

    onProgress('dressing');
    this._buildDressing(rng);

    onProgress('interiors');
    this._buildInteriors(rng.fork('interiors'));

    onProgress('skyline');
    this._buildBackdrop(rng.fork('backdrop'));

    onProgress('air');
    this._buildGas();

    onProgress('lighting');
    this._finalise(rng);

    onProgress('navigation');
    this.nav = new NavGrid(this.collision, B, 1.15).bake(14, 0.44, 1.72);
    this.nav.applyGasCost(this.gas);

    return this;
  }

  // ----------------------------------------------------------------- ground

  _buildGround(rng) {
    const B = this.data.bounds;
    // Base plate: ash and dirt. Streets are laid over it.
    const step = 20;
    for (let z = B.minZ; z < B.maxZ; z += step) {
      for (let x = B.minX; x < B.maxX; x += step) {
        const c = this._chunk(x + step / 2, z + step / 2);
        c.m('ash').plane(x + step / 2, 0, z + step / 2, step, step, 0.34, [1, 1, 1], true, 2.6);
      }
    }
    // The ground plane itself is one big collision box; everything else stacks.
    this.collision.add(new Box((B.minX + B.maxX) / 2, -2, (B.minZ + B.maxZ) / 2,
      B.maxX - B.minX + 40, 2, B.maxZ - B.minZ + 40, 0, LAYER.SOLID, 'ground'));

    for (let iz = 0; iz < this.gas.nz; iz++) {
      for (let ix = 0; ix < this.gas.nx; ix++) this.gas.groundY[this.gas.idx(ix, iz)] = 0;
    }
  }

  _buildStreets(rng) {
    for (const s of this.data.streets) {
      const dx = s.x1 - s.x0, dz = s.z1 - s.z0;
      const len = Math.hypot(dx, dz);
      const rot = Math.atan2(dz, dx);
      const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
      const key = 'asphalt';
      const w = s.width;

      // Segment the carriageway so it lands in the right spatial chunks (for
      // frustum culling) and so baked AO has resolution along the street.
      const segLen = 12;
      const segs = Math.max(1, Math.round(len / segLen));
      for (let i = 0; i < segs; i++) {
        const t = (i + 0.5) / segs;
        const px = s.x0 + dx * t, pz = s.z0 + dz * t;
        const c = this._chunk(px, pz);
        c.m(key).boxRot({
          x: px, y: 0.005, z: pz, w: len / segs + 0.02, h: 0.02, d: w, rot: -rot,
          uvScale: 0.34, tint: [1, 1, 1], faces: FACE.PY, aoCell: 2.6,
          uvOffset: [(i * len / segs) * 0.34, 0],
        });
        if (s.pavement !== false) {
          for (const side of [-1, 1]) {
            const ox = -Math.sin(rot) * side * (w / 2 + 1.1);
            const oz = Math.cos(rot) * side * (w / 2 + 1.1);
            c.m('concrete').boxRot({
              x: px + ox, y: 0, z: pz + oz, w: len / segs + 0.02, h: 0.14, d: 2.2, rot: -rot,
              uvScale: 0.5, tint: [0.84, 0.82, 0.79], ao: 0.15, aoCell: 2.2,
              uvOffset: [(i * len / segs) * 0.5, 0],
            });
          }
        }
      }
      if (s.pavement !== false) {
        for (const side of [-1, 1]) {
          const ox = -Math.sin(rot) * side * (w / 2 + 1.1);
          const oz = Math.cos(rot) * side * (w / 2 + 1.1);
          this.solid(cx + ox, 0, cz + oz, len, 0.14, 2.2, -rot, LAYER.PLATFORM, 'pavement');
        }
      }

      // Centre-line markings as explicit geometry rather than baked into the
      // road texture — a tiled painted line multiplies itself across the
      // carriageway and reads as a car park, not a street.
      if (s.kind === 'arterial') {
        const dash = 2.4, gapLen = 3.2;
        const n = Math.floor(len / (dash + gapLen));
        for (let i = 0; i < n; i++) {
          const t = (i * (dash + gapLen) + dash / 2) / len;
          const px = s.x0 + dx * t, pz = s.z0 + dz * t;
          this._chunk(px, pz).m('paint').boxRot({
            x: px, y: 0.026, z: pz, w: dash, h: 0.004, d: 0.16, rot: -rot,
            uvScale: 2.2, tint: [1.55, 1.5, 1.16], faces: FACE.PY, aoCell: 99,
          });
        }
      } else if (s.width >= 9) {
        // Unclassified roads get worn edge lines instead.
        for (const side of [-1, 1]) {
          const ox = -Math.sin(rot) * side * (w / 2 - 0.8);
          const oz = Math.cos(rot) * side * (w / 2 - 0.8);
          const segsL = Math.max(1, Math.round(len / 14));
          for (let i = 0; i < segsL; i++) {
            const t = (i + 0.5) / segsL;
            const px = s.x0 + dx * t + ox, pz = s.z0 + dz * t + oz;
            this._chunk(px, pz).m('paint').boxRot({
              x: px, y: 0.026, z: pz, w: len / segsL * 0.86, h: 0.004, d: 0.12, rot: -rot,
              uvScale: 1.4, tint: [1.3, 1.26, 1.0], faces: FACE.PY, aoCell: 99,
            });
          }
        }
      }
      const c = this._chunk(cx, cz);
      // Drain covers and manholes at intervals — small, but they are the kind
      // of detail that makes a street read as a street.
      const n = Math.max(1, Math.floor(len / 22));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const px = s.x0 + dx * t, pz = s.z0 + dz * t;
        const off = (rng.chance(0.5) ? 1 : -1) * (w / 2 - 0.7);
        const mx = px - Math.sin(rot) * off, mz = pz + Math.cos(rot) * off;
        c.m('dark').cylinder(mx, 0.022, mz, 0.36, 0.025, 8, 1.6, [0.3, 0.29, 0.28], true, 0);
        // Some manholes breathe. These are the visual tells for where the gas is.
        if (rng.chance(0.28)) {
          c.m('emberglow').cylinder(mx, 0.02, mz, 0.28, 0.01, 8, 1, [1, 1, 1], true, 0);
          this.fxMarkers.push({ x: mx, y: 0.06, z: mz, kind: 'manholesmoke' });
          this.gas.addSource(mx, mz, 260, 11, null, true);
        }
      }
    }
  }

  // -------------------------------------------------------------- buildings

  _buildBuildings(rng) {
    for (const b of this.data.buildings) {
      const cb = this._chunk(b.x, b.z);
      const brng = rng.fork(`b:${b.id || `${b.x},${b.z}`}`);
      const out = building(cb, b, brng);

      // Collision: one box for the mass, plus the parapet if it has one.
      const h = out.aabbs[0] ? out.aabbs[0].y1 : (b.h || 10);
      this.solid(b.x, 0, b.z, b.w, h, b.d, b.rot || 0, LAYER.SOLID, b.id || 'building');
      if (out.roof) {
        const r = out.roof;
        // Roof deck is a platform you can stand on.
        this.solid(r.x, r.y - 0.1, r.z, b.w + 0.1, 0.1, b.d + 0.1, b.rot || 0, LAYER.PLATFORM, 'roof');
        // Parapet keeps you from walking off without meaning to.
        const pw = b.w + 0.3, pd = b.d + 0.3, ph = 0.95;
        const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
        for (const [ox, oz, ww, dd] of [
          [0, pd / 2 - 0.15, pw, 0.3], [0, -pd / 2 + 0.15, pw, 0.3],
          [pw / 2 - 0.15, 0, 0.3, pd], [-pw / 2 + 0.15, 0, 0.3, pd],
        ]) {
          this.solid(b.x + ox * c - oz * s, r.y, b.z + ox * s + oz * c, ww, ph, dd, b.rot || 0, LAYER.SOLID, 'parapet');
        }
        b._roofY = r.y;
      }

      for (const l of out.lights) this.lightMarkers.push(l);
      for (const f of out.fx) this.fxMarkers.push(f);
      for (const s of out.signs) this._placeSign(cb, s, b);
      for (const dr of out.doors) {
        if (dr.id) {
          this.doors.push({ ...dr, target: dr.id, building: b.id, label: dr.label || b.name });
        }
      }
      // Buildings block gas diffusion and are strong shadow casters.
      this._blockGas(b);
    }
  }

  _blockGas(b) {
    const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
    const step = this.gas.cell * 0.7;
    for (let oz = -b.d / 2; oz <= b.d / 2; oz += step) {
      for (let ox = -b.w / 2; ox <= b.w / 2; ox += step) {
        this.gas.setBlocked(b.x + ox * c - oz * s, b.z + ox * s + oz * c);
      }
    }
  }

  _placeSign(cb, s, b) {
    const tex = signTexture(Array.isArray(s.text) ? s.text : [s.text], {
      w: 512, h: 128, seed: (s.text || '').length * 31 + 7,
      bg: '#1a1613', fg: '#d9cfba', accent: '#ff7a2f', weathered: 0.6,
    });
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false });
    const geo = new THREE.PlaneGeometry(s.w, s.h);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(s.x, s.y, s.z);
    mesh.rotation.y = -s.rot + Math.PI / 2;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.root.add(mesh);
    this.signs.push(mesh);
  }

  // ------------------------------------------------------------- structures

  /** Fire escapes, footbridges, scaffolds, ladders — the vertical network. */
  _buildStructures(rng) {
    for (const st of this.data.structures || []) {
      const cb = this._chunk(st.x ?? st.x0 ?? 0, st.z ?? st.z0 ?? 0);
      const srng = rng.fork(`s:${st.kind}:${st.x},${st.z}`);
      switch (st.kind) {
        case 'fireescape': {
          const nodes = P.fireEscape(cb, st.x, st.y ?? 3.4, st.z, st.rot || 0, st.floors || 3, srng, { floorH: st.floorH || 3.4, side: st.side ?? 1 });
          // Platforms and the ladder are climbable/standable.
          for (const n of nodes) {
            this.solid(n.x, n.y - 0.07, n.z, st.width || 1.5, 0.08, 1.15, st.rot || 0, LAYER.PLATFORM, 'escape');
          }
          // The stair flights: a ramp approximated by a stack of thin platforms.
          const fh = st.floorH || 3.4;
          for (let f = 0; f < (st.floors || 3) - 1; f++) {
            const dir = f % 2 === 0 ? 1 : -1;
            for (let s2 = 0; s2 < 9; s2++) {
              const t = (s2 + 0.5) / 9;
              const ox = dir * (t - 0.5) * (st.width || 1.5) * 0.92;
              const rot = st.rot || 0;
              const side = st.side ?? 1;
              this.solid(
                st.x + ox * Math.cos(rot) - side * (0.1 + t * 0.42) * Math.sin(rot),
                (st.y ?? 3.4) + f * fh + t * fh - 0.06,
                st.z + ox * Math.sin(rot) + side * (0.1 + t * 0.42) * Math.cos(rot),
                (st.width || 1.5) / 9 * 1.1, 0.08, 0.55, rot, LAYER.PLATFORM, 'stair');
            }
          }
          // Drop ladder volume.
          this.collision.add(new Box(st.x, 0, st.z + (st.side ?? 1) * 0.5 * Math.cos(st.rot || 0),
            0.9, st.y ?? 3.4, 0.7, st.rot || 0, LAYER.CLIMB, 'ladder'));
          break;
        }
        case 'ladder': {
          P.ladder(cb, st.x, st.y || 0, st.z, st.rot || 0, st.h, srng, { caged: st.caged });
          this.collision.add(new Box(st.x, st.y || 0, st.z, 0.9, st.h, 0.8, st.rot || 0, LAYER.CLIMB, 'ladder'));
          break;
        }
        case 'scaffold': {
          P.scaffold(cb, st.x, st.y || 0, st.z, st.rot || 0, st.w, st.d, st.levels, srng);
          for (let l = 1; l <= st.levels; l++) {
            this.solid(st.x, (st.y || 0) + l * 2.0 - 0.05, st.z, st.w, 0.1, st.d, st.rot || 0, LAYER.PLATFORM, 'scaffold');
          }
          this.collision.add(new Box(st.x + (st.w / 2 - 0.2) * Math.cos(st.rot || 0), st.y || 0,
            st.z + (st.w / 2 - 0.2) * Math.sin(st.rot || 0), 0.9, st.levels * 2.0, 0.9, st.rot || 0, LAYER.CLIMB, 'ladder'));
          break;
        }
        case 'bridge': {
          // A plank or scaffold-board crossing between roofs. The single most
          // important traversal object in the game after the fire escape.
          this._bridge(cb, st, srng);
          break;
        }
        case 'ramp': {
          this._ramp(cb, st, srng);
          break;
        }
        case 'pipe':
          P.pipeRun(cb, st.x0, st.y0, st.z0, st.x1, st.y1, st.z1, st.r || 0.16, srng, { key: st.mat });
          if (st.solid) {
            const mx = (st.x0 + st.x1) / 2, mz = (st.z0 + st.z1) / 2;
            const len = Math.hypot(st.x1 - st.x0, st.z1 - st.z0);
            this.solid(mx, Math.min(st.y0, st.y1) - (st.r || 0.16), mz, len, (st.r || 0.16) * 2, (st.r || 0.16) * 2,
              -Math.atan2(st.z1 - st.z0, st.x1 - st.x0), LAYER.PLATFORM, 'pipe');
          }
          break;
        case 'fence':
          P.fence(cb, st.x0, st.z0, st.x1, st.z1, st.h || 2.2, srng, st);
          this.solid((st.x0 + st.x1) / 2, 0, (st.z0 + st.z1) / 2,
            Math.hypot(st.x1 - st.x0, st.z1 - st.z0), st.h || 2.2, 0.14,
            -Math.atan2(st.z1 - st.z0, st.x1 - st.x0), LAYER.SOLID, 'fence');
          break;
        case 'wall':
          cb.m(st.mat || 'concrete').boxRot({ x: st.x, y: st.y || 0, z: st.z, w: st.w, h: st.h, d: st.d, rot: st.rot || 0, uvScale: 0.5, tint: [1, 1, 1], ao: 0.5 });
          this.solid(st.x, st.y || 0, st.z, st.w, st.h, st.d, st.rot || 0, LAYER.SOLID, st.tag || 'wall');
          break;
        case 'platform':
          cb.m(st.mat || 'metal').boxRot({ x: st.x, y: st.y, z: st.z, w: st.w, h: st.h || 0.2, d: st.d, rot: st.rot || 0, uvScale: 0.7, tint: [1, 1, 1], ao: 0.3 });
          this.solid(st.x, st.y, st.z, st.w, st.h || 0.2, st.d, st.rot || 0, LAYER.PLATFORM, 'platform');
          break;
        case 'pit':
          this._pit(cb, st, srng);
          break;
        case 'rubble':
          P.rubblePile(cb, st.x, st.z, st.r, st.h, srng);
          // Walkable mound: a stack of shrinking platforms.
          for (let i = 0; i < 4; i++) {
            const t = i / 4;
            this.solid(st.x, st.h * (t + 0.25) - 0.1, st.z, st.r * 2 * (1 - t * 0.72), 0.2, st.r * 2 * (1 - t * 0.72), 0, LAYER.PLATFORM, 'rubble');
          }
          break;
      }
    }
  }

  _bridge(cb, st, rng) {
    const dx = st.x1 - st.x0, dz = st.z1 - st.z0;
    const len = Math.hypot(dx, dz);
    const rot = Math.atan2(dz, dx);
    const cx = (st.x0 + st.x1) / 2, cz = (st.z0 + st.z1) / 2;
    const y = st.y;
    const w = st.w || 1.1;

    if (st.style === 'plank') {
      // Two scaffold boards laid across a gap, with a rope handline. It should
      // look like someone's bad idea, because it is.
      const boards = 2;
      for (let i = 0; i < boards; i++) {
        const off = (i - (boards - 1) / 2) * 0.45;
        cb.m('wood').boxRot({
          x: cx - off * Math.sin(rot), y, z: cz + off * Math.cos(rot),
          w: len, h: 0.06, d: 0.4, rot: -rot, uvScale: 1.1, tint: [0.62, 0.54, 0.42], ao: 0.2,
        });
      }
      for (const side of [-1, 1]) {
        const segs = 6;
        for (let i = 0; i < segs; i++) {
          const t = (i + 0.5) / segs;
          const sag = Math.sin(t * Math.PI) * 0.16;
          cb.m('dark').boxRot({
            x: st.x0 + dx * t - side * 0.6 * Math.sin(rot), y: y + 0.95 - sag,
            z: st.z0 + dz * t + side * 0.6 * Math.cos(rot),
            w: len / segs * 1.1, h: 0.03, d: 0.03, rot: -rot, uvScale: 4, tint: [0.32, 0.3, 0.26],
          });
        }
      }
    } else {
      cb.m('metal').boxRot({ x: cx, y, z: cz, w: len, h: 0.12, d: w, rot: -rot, uvScale: 0.9, tint: [0.6, 0.6, 0.6], ao: 0.2 });
      for (const side of [-1, 1]) {
        for (const hh of [0.5, 1.0]) {
          cb.m('rust').boxRot({
            x: cx - side * (w / 2) * Math.sin(rot), y: y + hh, z: cz + side * (w / 2) * Math.cos(rot),
            w: len, h: 0.05, d: 0.05, rot: -rot, uvScale: 2, tint: [0.62, 0.5, 0.42],
          });
        }
        const posts = Math.max(2, Math.round(len / 1.6));
        for (let i = 0; i <= posts; i++) {
          const t = i / posts;
          cb.m('rust').boxRot({
            x: st.x0 + dx * t - side * (w / 2) * Math.sin(rot), y,
            z: st.z0 + dz * t + side * (w / 2) * Math.cos(rot),
            w: 0.05, h: 1.05, d: 0.05, rot: -rot, uvScale: 3, tint: [0.62, 0.5, 0.42],
          });
        }
      }
    }
    this.solid(cx, y - 0.06, cz, len, 0.12, w, -rot, LAYER.PLATFORM, st.tag || 'bridge');
  }

  _ramp(cb, st, rng) {
    // Approximated as a staircase of shallow boxes; the controller's step-up
    // makes it feel like a continuous slope.
    const dx = st.x1 - st.x0, dz = st.z1 - st.z0, dy = st.y1 - st.y0;
    const len = Math.hypot(dx, dz);
    const rot = Math.atan2(dz, dx);
    const steps = Math.max(3, Math.ceil(Math.abs(dy) / 0.28));
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const px = st.x0 + dx * t, pz = st.z0 + dz * t;
      const py = st.y0 + dy * ((i + 1) / steps);
      cb.m(st.mat || 'concrete').boxRot({
        x: px, y: py - 0.22, z: pz, w: len / steps * 1.02, h: 0.22, d: st.w || 2.2,
        rot: -rot, uvScale: 0.7, tint: [1, 1, 1], ao: 0.3,
      });
      this.solid(px, py - 0.22, pz, len / steps * 1.02, 0.22, st.w || 2.2, -rot, LAYER.PLATFORM, 'ramp');
    }
  }

  /** An excavation: sloped sides, a floor below grade, and very bad air. */
  _pit(cb, st, rng) {
    const { x, z, w, d, depth, rot = 0 } = st;
    const c = Math.cos(rot), s = Math.sin(rot);
    // Floor
    cb.m('rubble').boxRot({ x, y: -depth, z, w, h: 0.2, d, rot, uvScale: 0.4, tint: [0.8, 0.78, 0.74] });
    this.solid(x, -depth, z, w, 0.2, d, rot, LAYER.PLATFORM, 'pitfloor');
    // Walls (four inward faces)
    const wallSpecs = [
      [0, d / 2 + 0.6, w + 2.4, 1.2], [0, -d / 2 - 0.6, w + 2.4, 1.2],
      [w / 2 + 0.6, 0, 1.2, d + 2.4], [-w / 2 - 0.6, 0, 1.2, d + 2.4],
    ];
    for (const [ox, oz, ww, dd] of wallSpecs) {
      const px = x + ox * c - oz * s, pz = z + ox * s + oz * c;
      cb.m('rubble').boxRot({ x: px, y: -depth, z: pz, w: ww, h: depth, d: dd, rot, uvScale: 0.45, tint: [0.78, 0.76, 0.72], ao: 0.6 });
      this.solid(px, -depth, pz, ww, depth + 0.9, dd, rot, LAYER.SOLID, 'pitwall');
    }
    // Shoring and a work ramp down.
    for (let i = 0; i < 8; i++) {
      const ox = (i / 7 - 0.5) * w;
      cb.m('rust').boxRot({ x: x + ox * c - (d / 2) * s, y: -depth, z: z + ox * s + (d / 2) * c, w: 0.22, h: depth, d: 0.22, rot, uvScale: 1, tint: [0.6, 0.5, 0.42], ao: 0.4 });
    }
    // Local ground elevation for the gas field: the pit is a sink.
    const step = this.gas.cell * 0.6;
    for (let oz = -d / 2; oz <= d / 2; oz += step) {
      for (let ox = -w / 2; ox <= w / 2; ox += step) {
        this.gas.setGroundY(x + ox * c - oz * s, z + ox * s + oz * c, -depth);
        this.gas.setCovered(x + ox * c - oz * s, z + ox * s + oz * c, 0.35);
      }
    }
    if (st.gas !== false) this.gas.addSource(x, z, st.gasStrength ?? 1500, Math.max(w, d) * 0.75, st.gasId || null, true);
  }

  // --------------------------------------------------------------- dressing

  _buildDressing(rng) {
    // Hand-placed props first: these are the authored, story-bearing objects.
    for (const p of this.data.props || []) {
      const cb = this._chunk(p.x, p.z);
      const prng = rng.fork(`p:${p.kind}:${p.x},${p.z}`);
      this._prop(cb, p, prng);
    }

    // Then per-block procedural scatter with an authored character.
    for (const zone of this.data.scatter || []) {
      const zrng = rng.fork(`z:${zone.id}`);
      this._scatter(zone, zrng);
    }
  }

  _prop(cb, p, rng) {
    const y = p.y || 0;
    let r = null;
    switch (p.kind) {
      case 'drum': r = P.drum(cb, p.x, y, p.z, rng, p); break;
      case 'crate': P.crate(cb, p.x, y, p.z, rng, p); this.solid(p.x, y, p.z, 0.7, 0.62, 0.7, p.rot || 0, LAYER.SOLID, 'prop'); break;
      case 'pallet': P.pallet(cb, p.x, y, p.z, rng, p); break;
      case 'dumpster': P.dumpster(cb, p.x, y, p.z, rng, p); this.solid(p.x, y, p.z, 1.9, 1.3, 1.05, p.rot || 0, LAYER.SOLID, 'prop'); break;
      case 'car': P.car(cb, p.x, y, p.z, p.rot || 0, rng, p); this.solid(p.x, y, p.z, 4.2, 1.5, 1.8, p.rot || 0, LAYER.SOLID, 'car'); break;
      case 'van': P.van(cb, p.x, y, p.z, p.rot || 0, rng, p); this.solid(p.x, y, p.z, 6.4, 2.8, 2.3, p.rot || 0, LAYER.SOLID, 'car'); break;
      case 'lamp': r = P.streetLamp(cb, p.x, p.z, rng, p); this.solid(p.x, 0, p.z, 0.3, 6, 0.3, 0, LAYER.SOLID, 'prop'); break;
      case 'worklight': r = P.workLight(cb, p.x, y, p.z, rng, p); break;
      case 'vent': r = P.ventHead(cb, p.x, y, p.z, rng, p);
        this.solid(p.x, y, p.z, 1.3, 1.4, 1.3, 0, LAYER.SOLID, 'prop');
        this.gas.addSource(p.x, p.z, p.gasStrength ?? 2400, p.gasRadius ?? 20, p.gasId || null, p.hot !== false);
        break;
      case 'generator': P.generator(cb, p.x, y, p.z, p.rot || 0, rng); this.solid(p.x, y, p.z, 1.3, 0.9, 0.8, p.rot || 0, LAYER.SOLID, 'prop'); break;
      case 'tarp': P.tarpShelter(cb, p.x, y, p.z, p.rot || 0, rng, p);
        this.gas.setCovered(p.x, p.z, 0.4);
        break;
      case 'mattress': P.mattress(cb, p.x, y, p.z, p.rot || 0, rng); break;
      case 'table': P.table(cb, p.x, y, p.z, p.rot || 0, rng, p); this.solid(p.x, y + 0.6, p.z, p.w || 1.4, 0.2, p.d || 0.8, p.rot || 0, LAYER.PLATFORM, 'prop'); break;
      case 'chair': P.chair(cb, p.x, y, p.z, p.rot || 0, rng, p); break;
      case 'shelf': P.shelf(cb, p.x, y, p.z, p.rot || 0, rng, p); this.solid(p.x, y, p.z, p.w || 1.6, 1.9, 0.42, p.rot || 0, LAYER.SOLID, 'prop'); break;
      case 'locker': P.locker(cb, p.x, y, p.z, rng, p); if (!p.fallen) this.solid(p.x, y, p.z, p.w || 0.9, p.h || 1.85, 0.46, p.rot || 0, LAYER.SOLID, 'prop'); break;
      case 'barrier': P.barrier(cb, p.x, y, p.z, p.rot || 0, rng, p); this.solid(p.x, y, p.z, p.len || 2.0, 0.95, 0.62, p.rot || 0, LAYER.SOLID, 'prop'); break;
      case 'barricade': P.barricade(cb, p.x, p.z, p.rot || 0, p.len || 4, rng);
        this.solid(p.x, 0, p.z, p.len || 4, 1.3, 0.8, p.rot || 0, LAYER.SOLID, 'barricade');
        break;
      case 'covered': P.covered(cb, p.x, y, p.z, p.rot || 0, rng); break;
      case 'trolley': P.trolley(cb, p.x, y, p.z, rng); break;
      case 'bench': P.bench(cb, p.x, y, p.z, p.rot || 0, rng); this.solid(p.x, y, p.z, 1.7, 0.5, 0.44, p.rot || 0, LAYER.SOLID, 'prop'); break;
      case 'bin': P.bin(cb, p.x, y, p.z, rng); break;
      case 'cone': P.cone(cb, p.x, y, p.z, rng); break;
      case 'ac': P.acUnit(cb, p.x, y, p.z, p.rot || 0, rng, p); this.solid(p.x, y, p.z, p.w || 1.5, p.h || 0.9, p.d || 1.1, p.rot || 0, LAYER.SOLID, 'prop'); break;
      case 'tank': P.waterTank(cb, p.x, y, p.z, rng, p); break;
      case 'washing': P.washingLine(cb, p.x0, p.y0, p.z0, p.x1, p.y1, p.z1, rng); break;
      case 'debris': P.debris(cb, p.x, p.z, p.r || 3, p.n || 14, rng, y); break;
      case 'paper': P.paperScatter(cb, p.x, p.z, p.r || 2, p.n || 12, rng, y + 0.005); break;
      case 'sign': this._standaloneSign(p); break;
    }
    if (r && r.light) this.lightMarkers.push({ ...r.light, id: p.id });
    if (r && r.fx) this.fxMarkers.push({ ...r.fx, id: p.id });
    if (p.interact) {
      this.interactions.push({ ...p.interact, x: p.x, y: y + (p.interact.dy ?? 1.0), z: p.z });
    }
  }

  /**
   * Freestanding signage — street names, hazard placards, and the survey
   * markings that put the Cinder Line physically in the world.
   */
  _standaloneSign(p) {
    const tex = signTexture(p.text, {
      w: p.tw || 512, h: p.th || 256, seed: p.text.join('').length * 17 + 3,
      bg: p.bg || '#16130f', fg: p.fg || '#ddd3bf', accent: p.accent || '#ff7a2f',
      weathered: p.weathered ?? 0.55, border: p.border !== false,
    });
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(p.w || 1.6, p.h || 0.8), mat);
    mesh.position.set(p.x, (p.y || 0) + (p.h || 0.8) / 2 + (p.lift || 1.2), p.z);
    mesh.rotation.y = p.rot || 0;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.root.add(mesh);
    this.signs.push(mesh);

    if (p.post !== false) {
      const cb = this._chunk(p.x, p.z);
      cb.m('metal').cylinder(p.x, 0, p.z, 0.055, (p.lift || 1.2) + 0.2, 6, 1.4, [0.42, 0.42, 0.44], false, 0.3);
    }
  }

  /**
   * Procedural scatter across a region. Each zone declares a *character* —
   * what happened here — and the scatter reflects it. That is what makes
   * generated dressing read as authored.
   */
  _scatter(zone, rng) {
    const { x, z, w, d, character = 'street', density = 1, y = 0 } = zone;
    const area = w * d;
    const n = Math.round((area / 60) * density);

    const inside = (px, pz) => {
      // Skip anything intersecting a building or existing solid.
      return !this.collision.overlaps(px, y + 0.2, pz, 0.55, 1.4);
    };

    for (let i = 0; i < n; i++) {
      const px = x + rng.sym(w / 2), pz = z + rng.sym(d / 2);
      if (!inside(px, pz)) continue;
      const cb = this._chunk(px, pz);
      const roll = rng.f();

      switch (character) {
        case 'street':
          if (roll < 0.2) P.debris(cb, px, pz, 2.2, rng.int(5, 14), rng, y);
          else if (roll < 0.34) P.bin(cb, px, y, pz, rng);
          else if (roll < 0.44) { P.crate(cb, px, y, pz, rng); this.solid(px, y, pz, 0.7, 0.62, 0.7, 0, LAYER.SOLID, 'prop'); }
          else if (roll < 0.54) P.drum(cb, px, y, pz, rng, { tipped: rng.chance(0.5) });
          else if (roll < 0.6) P.cone(cb, px, y, pz, rng);
          else if (roll < 0.66) P.trolley(cb, px, y, pz, rng);
          else if (roll < 0.72) P.pallet(cb, px, y, pz, rng, { lean: rng.chance(0.4) });
          else P.debris(cb, px, pz, 3.0, rng.int(3, 9), rng, y);
          break;

        case 'evacuated':
          // People left in a hurry: suitcases, spilled belongings, abandoned cars.
          if (roll < 0.22) {
            P.crate(cb, px, y, pz, rng, { size: rng.range(0.35, 0.55) });
          } else if (roll < 0.38) {
            cb.m('fabric').boxRot({ x: px, y, z: pz, w: rng.range(0.5, 0.8), h: rng.range(0.25, 0.4), d: rng.range(0.3, 0.5), rot: rng.f() * TAU, uvScale: 1.6, tint: [0.5, 0.46, 0.42], ao: 0.4 });
          } else if (roll < 0.52) {
            P.debris(cb, px, pz, 2.4, rng.int(6, 16), rng, y);
          } else if (roll < 0.64) {
            P.paperScatter(cb, px, pz, 2.2, rng.int(6, 15), rng, y + 0.005);
          } else if (roll < 0.74) {
            P.bin(cb, px, y, pz, rng);
          } else if (roll < 0.82) {
            P.mattress(cb, px, y, pz, rng.f() * TAU, rng);
          } else {
            P.trolley(cb, px, y, pz, rng);
          }
          break;

        case 'camp':
          // People still live here. Cooking, drying, storing, mending.
          if (roll < 0.18) { P.tarpShelter(cb, px, y, pz, rng.f() * TAU, rng, {}); this.gas.setCovered(px, pz, 0.35); this.solid(px, y, pz, 2.4, 1.7, 2.0, 0, LAYER.SOLID, 'shelter'); }
          else if (roll < 0.3) { const rr = P.drum(cb, px, y, pz, rng, { burning: rng.chance(0.5) }); if (rr) { this.lightMarkers.push(rr.light); this.fxMarkers.push(rr.fx); } this.solid(px, y, pz, 0.6, 0.9, 0.6, 0, LAYER.SOLID, 'prop'); }
          else if (roll < 0.42) { P.crate(cb, px, y, pz, rng); this.solid(px, y, pz, 0.7, 0.62, 0.7, 0, LAYER.SOLID, 'prop'); }
          else if (roll < 0.54) P.chair(cb, px, y, pz, rng.f() * TAU, rng, { fallen: rng.chance(0.3) });
          else if (roll < 0.64) { P.table(cb, px, y, pz, rng.f() * TAU, rng, {}); this.solid(px, y + 0.6, pz, 1.4, 0.2, 0.8, 0, LAYER.PLATFORM, 'prop'); }
          else if (roll < 0.74) P.mattress(cb, px, y, pz, rng.f() * TAU, rng);
          else if (roll < 0.84) { P.shelf(cb, px, y, pz, rng.f() * TAU, rng, {}); this.solid(px, y, pz, 1.6, 1.9, 0.42, 0, LAYER.SOLID, 'prop'); }
          else P.debris(cb, px, pz, 2, rng.int(3, 8), rng, y);
          break;

        case 'industrial':
          if (roll < 0.24) { P.drum(cb, px, y, pz, rng, {}); this.solid(px, y, pz, 0.6, 0.9, 0.6, 0, LAYER.SOLID, 'prop'); }
          else if (roll < 0.4) { P.crate(cb, px, y, pz, rng, { size: rng.range(0.7, 1.1) }); this.solid(px, y, pz, 1.0, 0.85, 0.95, 0, LAYER.SOLID, 'prop'); }
          else if (roll < 0.52) P.pallet(cb, px, y, pz, rng, {});
          else if (roll < 0.62) P.cone(cb, px, y, pz, rng);
          else if (roll < 0.72) { P.barrier(cb, px, y, pz, rng.f() * TAU, rng, {}); this.solid(px, y, pz, 2, 0.95, 0.62, 0, LAYER.SOLID, 'prop'); }
          else if (roll < 0.84) {
            cb.m('rust').cylinder(px, y, pz, rng.range(0.2, 0.4), rng.range(0.9, 2.2), 8, 1.2, [0.6, 0.5, 0.42], true, 0.3);
            this.solid(px, y, pz, 0.8, 2.0, 0.8, 0, LAYER.SOLID, 'prop');
          }
          else P.debris(cb, px, pz, 2.6, rng.int(5, 12), rng, y);
          break;

        case 'rubble':
          if (roll < 0.4) P.rubblePile(cb, px, pz, rng.range(1.2, 3.0), rng.range(0.5, 1.6), rng);
          else if (roll < 0.7) P.debris(cb, px, pz, 3.2, rng.int(10, 24), rng, y);
          else {
            cb.m('concrete').boxRot({ x: px, y, z: pz, w: rng.range(1, 2.6), h: rng.range(0.2, 0.5), d: rng.range(0.8, 2.0), rot: rng.f() * TAU, uvScale: 0.6, tint: [0.76, 0.74, 0.7], ao: 0.4 });
            this.solid(px, y, pz, 2, 0.4, 1.6, 0, LAYER.PLATFORM, 'rubble');
          }
          break;

        case 'roof':
          if (roll < 0.3) P.acUnit(cb, px, y, pz, rng.f() * TAU, rng, {});
          else if (roll < 0.46) { P.crate(cb, px, y, pz, rng); this.solid(px, y, pz, 0.7, 0.62, 0.7, 0, LAYER.SOLID, 'prop'); }
          else if (roll < 0.6) P.drum(cb, px, y, pz, rng, { tipped: rng.chance(0.5) });
          else if (roll < 0.72) P.pallet(cb, px, y, pz, rng, {});
          else P.debris(cb, px, pz, 2, rng.int(4, 10), rng, y);
          break;
      }
    }
  }

  /**
   * Interiors.
   *
   * Built as real geometry in a reserved strip of world space well east of
   * Hollis, and reached by a fade-and-teleport through a door. That is
   * deliberate: it keeps interiors dense and correctly lit without a scene
   * loader, without unloading the city behind the player, and without paying
   * for indoor geometry while she is outdoors — the chunks simply fall outside
   * the view frustum.
   */
  _buildInteriors(rng) {
    for (const it of this.data.interiors || []) {
      const irng = rng.fork('int:' + it.id);
      const ox = it.ox, oz = it.oz;   // origin in the reserved strip
      const h = it.h ?? 3.1;

      // Shell: floor, ceiling, four walls with door gaps punched by segments.
      const cb = this._chunk(ox, oz);
      cb.m(it.floorMat || 'tile').plane(ox, 0, oz, it.w, it.d, 0.5, [1, 1, 1], true, 2.4);
      this.solid(ox, -0.4, oz, it.w + 2, 0.4, it.d + 2, 0, LAYER.PLATFORM, 'floor');
      cb.m(it.ceilMat || 'plaster').plane(ox, h, oz, it.w, it.d, 0.4, [0.7, 0.7, 0.7], false, 2.4);
      this.solid(ox, h, oz, it.w + 2, 0.4, it.d + 2, 0, LAYER.SOLID, 'ceiling');

      const wallMat = it.wallMat || 'plaster';
      const walls = [
        [0, it.d / 2 + 0.15, it.w + 0.6, 0.3],
        [0, -it.d / 2 - 0.15, it.w + 0.6, 0.3],
        [it.w / 2 + 0.15, 0, 0.3, it.d + 0.6],
        [-it.w / 2 - 0.15, 0, 0.3, it.d + 0.6],
      ];
      for (const [wx, wz, ww, wd] of walls) {
        cb.m(wallMat).boxRot({
          x: ox + wx, y: 0, z: oz + wz, w: ww, h, d: wd, rot: 0,
          uvScale: 0.55, tint: [1, 1, 1], ao: 0.45, aoTop: 0.35, aoCell: 2.4,
        });
        this.solid(ox + wx, 0, oz + wz, ww, h + 0.5, wd, 0, LAYER.SOLID, 'wall');
      }

      // Skirting and a picture rail — cheap, and they are what make a room
      // read as a room rather than a box.
      for (const [wx, wz, ww, wd] of walls) {
        cb.m('wood').boxRot({ x: ox + wx, y: 0, z: oz + wz, w: ww * 0.99, h: 0.14, d: wd * 1.12, rot: 0, uvScale: 1.4, tint: [0.55, 0.47, 0.36] });
      }

      // Internal partitions.
      for (const p of it.walls || []) {
        cb.m(p.mat || wallMat).boxRot({
          x: ox + p.x, y: 0, z: oz + p.z, w: p.w, h: p.h ?? h, d: p.d, rot: p.rot || 0,
          uvScale: 0.55, tint: [1, 1, 1], ao: 0.45, aoTop: 0.35, aoCell: 2.4,
        });
        this.solid(ox + p.x, 0, oz + p.z, p.w, p.h ?? h, p.d, p.rot || 0, LAYER.SOLID, 'wall');
      }

      // Contents.
      for (const pr of it.props || []) {
        this._prop(this._chunk(ox + pr.x, oz + pr.z), { ...pr, x: ox + pr.x, z: oz + pr.z }, irng);
      }
      for (const l of it.lights || []) {
        const lx = ox + l.x, lz = oz + l.z, ly = l.y ?? h - 0.35;
        cb.m(l.kind === 'screen' ? 'screenglow' : 'lampglow').boxRot({
          x: lx, y: ly, z: lz, w: l.w ?? 0.5, h: 0.05, d: l.d ?? 0.3, rot: l.rot || 0,
          uvScale: 1, tint: [1, 1, 1],
        });
        // A shallow shade above it so the light source has a body.
        cb.m('metal').boxRot({ x: lx, y: ly + 0.05, z: lz, w: (l.w ?? 0.5) + 0.1, h: 0.08, d: (l.d ?? 0.3) + 0.1, rot: l.rot || 0, uvScale: 1.4, tint: [0.4, 0.4, 0.42] });
        this.lightMarkers.push({ x: lx, y: ly - 0.1, z: lz, kind: l.kind === 'work' ? 'work' : 'lamp', id: l.id });
      }
      for (const s of it.scatter || []) {
        this._scatter({ ...s, x: ox + s.x, z: oz + s.z }, irng);
      }
      for (const sg of it.signs || []) {
        this._standaloneSign({ ...sg, x: ox + sg.x, z: oz + sg.z });
      }
      for (const inter of it.interactions || []) {
        this.interactions.push({ ...inter, x: ox + inter.x, z: oz + inter.z, y: inter.y ?? 1.1, interior: it.id });
      }

      // Spawn anchors inside.
      for (const sp of it.spawns || []) {
        this.spawns.set(sp.id, { id: sp.id, x: ox + sp.x, z: oz + sp.z, y: sp.y ?? 0, rot: sp.rot ?? 0 });
      }

      // The exit. Always a real doorway you can see from inside.
      if (it.exit) {
        const ex = ox + it.exit.x, ez = oz + it.exit.z;
        cb.m('dark').boxRot({ x: ex, y: 0, z: ez, w: 1.3, h: 2.3, d: 0.4, rot: it.exit.rot || 0, uvScale: 1, tint: [0.06, 0.06, 0.07], aoTop: 0.6 });
        cb.m('concrete').boxRot({ x: ex, y: 2.3, z: ez, w: 1.7, h: 0.18, d: 0.5, rot: it.exit.rot || 0, uvScale: 1.6, tint: [0.8, 0.78, 0.74] });
        this.interactions.push({
          id: `exit_${it.id}`, kind: 'door', x: ex, y: 1.1, z: ez,
          label: 'Outside', prompt: it.exit.prompt || 'Step outside',
          target: it.exit.to, range: 2.4, interior: it.id,
        });
      }

      // Air: interiors are sealed unless the data says otherwise.
      if (it.ppm !== undefined) this.interiorAir = this.interiorAir || new Map();
      if (it.ppm !== undefined) this.interiorAir.set(it.id, it.ppm);
      this.interiors = this.interiors || new Map();
      this.interiors.set(it.id, { ...it, ox, oz, h });
    }
  }

  /**
   * Distant skyline.
   *
   * Hollis does not end at the playable boundary — it just stops being
   * somewhere you can go. A band of unlit silhouettes beyond the edge, plus the
   * works chimneys that are the reason the city exists, keeps every sightline
   * closing on a city rather than on empty sky. All of it is a single merged
   * mesh with no collision, no shadows and no facade detail.
   */
  _buildBackdrop(rng) {
    const B = this.data.bounds;
    const cx = (B.minX + B.maxX) / 2, cz = (B.minZ + B.maxZ) / 2;
    const inner = Math.max(B.maxX - B.minX, B.maxZ - B.minZ) * 0.56;
    const cb = new ChunkBuilder('backdrop');

    for (let ring = 0; ring < 4; ring++) {
      const r0 = inner + ring * 62;
      const count = 34 + ring * 12;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU + rng.sym(0.05);
        const d = r0 + rng.range(-22, 34);
        const x = cx + Math.cos(a) * d;
        const z = cz + Math.sin(a) * d * 0.86;
        // Nearer rings are lower; a couple of tall stacks anchor the horizon.
        const h = rng.range(9, 22) + ring * 3 + (rng.chance(0.06) ? rng.range(22, 46) : 0);
        const w = rng.range(14, 44), dd = rng.range(14, 40);
        const key = rng.weighted(['brick', 'concrete', 'corrugated'], [4, 5, 2]);
        cb.m(key).boxRot({
          x, y: 0, z, w, h, d: dd, rot: rng.f() * TAU,
          uvScale: 0.28, tint: [1, 1, 1], ao: 0.35, aoTop: 0.1,
          faces: FACE.SIDES | FACE.PY, aoCell: 12, maxSeg: 2,
        });
        // Parapet lip catches the sky and stops the silhouette reading as a bar.
        if (rng.chance(0.5)) {
          cb.m('concrete').boxRot({
            x, y: h, z, w: w + 0.6, h: rng.range(0.5, 1.4), d: dd + 0.6, rot: 0,
            uvScale: 0.4, tint: [0.9, 0.89, 0.86], faces: FACE.SIDES | FACE.PY, aoCell: 12, maxSeg: 2,
          });
        }
      }
    }

    // The works chimneys. Two of them, and they are still smoking, because the
    // plant on the far side of the valley never stopped.
    for (const [ox, oz, ht, rad] of [[240, -190, 96, 5.2], [286, -168, 78, 4.4], [-268, 132, 64, 4.0]]) {
      const x = cx + ox, z = cz + oz;
      cb.m('brick').cylinder(x, 0, z, rad, ht, 10, 0.24, [0.86, 0.84, 0.8], false, 0.4);
      cb.m('concrete').cylinder(x, ht, z, rad * 1.16, 2.2, 10, 0.5, [0.9, 0.88, 0.85], false, 0.1);
      // Hazard banding near the top.
      for (let i = 0; i < 3; i++) {
        cb.m('paint').cylinder(x, ht - 12 - i * 9, z, rad * 1.02, 3.2, 10, 0.6,
          i % 2 ? [1.1, 1.05, 0.95] : [1.3, 0.6, 0.35], false, 0.2);
      }
      this.fxMarkers.push({ x, y: ht + 2.4, z, kind: 'steam' });
    }

    const group = cb.build((k) => this._mat(k), { castShadow: false, receiveShadow: false });
    group.name = 'backdrop';
    // Never culled by the shadow pass, never picked, never collided with.
    group.traverse((o) => { if (o.isMesh) { o.frustumCulled = true; o.renderOrder = -10; } });
    this.root.add(group);
    this._backdropTris = cb.stats.tris;
  }

  // -------------------------------------------------------------------- gas

  _buildGas() {
    for (const g of this.data.gasSources || []) {
      this.gas.addSource(g.x, g.z, g.strength, g.radius, g.id || null, g.active !== false);
    }
    // Interiors and covered areas.
    for (const c of this.data.covered || []) {
      const step = this.gas.cell * 0.6;
      for (let z = c.z - c.d / 2; z <= c.z + c.d / 2; z += step) {
        for (let x = c.x - c.w / 2; x <= c.x + c.w / 2; x += step) {
          this.gas.setCovered(x, z, c.amount ?? 0.8);
          if (c.groundY !== undefined) this.gas.setGroundY(x, z, c.groundY);
        }
      }
    }
    this.gas.bake();
  }

  // --------------------------------------------------------------- finalise

  _finalise(rng) {
    // Bake vertex AO into every chunk from the occlusion grid.
    const occ = this._occ;
    const fn = (x, y, z, nx, ny, nz) => occ.occlusion(x, y, z, nx, ny, nz);
    let tris = 0;
    for (const c of this._chunks.values()) {
      c.applyOcclusion(fn);
      const g = c.build((k) => this._mat(k));
      // Chunk-level bounding sphere makes frustum culling meaningful.
      this.root.add(g);
      tris += c.stats.tris;
    }

    // Spawn anchors and regions from the data.
    for (const s of this.data.spawns || []) this.spawns.set(s.id, s);
    this.regions = this.data.regions || [];
    for (const i of this.data.interactions || []) this.interactions.push(i);
    for (const d of this.data.doors || []) this.doors.push(d);

    this.stats = {
      chunks: this._chunks.size,
      tris,
      collision: this.collision.stats,
      lights: this.lightMarkers.length,
      fx: this.fxMarkers.length,
      materials: this.mats.count,
    };
  }

  /** Which authored region contains this point? Drives music and ambience. */
  regionAt(x, z) {
    for (const r of this.regions) {
      if (x >= r.x - r.w / 2 && x <= r.x + r.w / 2 && z >= r.z - r.d / 2 && z <= r.z + r.d / 2) return r;
    }
    return null;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.collision.clear();
  }
}
