import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { buildCpuCity, worldTriangle } from './cpu-city-fixture-v2.mjs';
import { City as CurrentCity } from './survival/src/world/city.js';
import { ChunkBuilder } from './survival/src/world/geom.js';
import { CollisionWorld, Box, LAYER } from './survival/src/world/collision.js';

const root = '/workspace/scratch/0b7ad82bafe7';
const repo = `${root}/survival`;
const baseline = '2220b65b805f54e8d51e0ecc96807dad3d61b594';
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const sourceFile = `${repo}/src/world/city.js`;
const currentSourceHash = hash(fs.readFileSync(sourceFile, 'utf8'));
const collisionSourceHash = hash(fs.readFileSync(`${repo}/src/world/collision.js`, 'utf8'));
const oldSource = execFileSync('git', ['show', `${baseline}:src/world/city.js`], { cwd: repo, encoding: 'utf8' });
const importedOldSource = oldSource.replace(/from\s+(['"])([^'"]+)\1/g, (full, quote, spec) => {
  const url = spec === 'three' ? pathToFileURL(`${repo}/node_modules/three/build/three.module.js`).href
    : new URL(spec, pathToFileURL(sourceFile)).href;
  return `from ${JSON.stringify(url)}`;
});
const { City: PreviousCity } = await import(`data:text/javascript;base64,${Buffer.from(importedOldSource).toString('base64')}`);

function snapshot(city) {
  const out = new Map();
  for (const [chunk, cb] of city._chunks) for (const [key, b] of cb.groups) {
    out.set(`${chunk}:${key}`, { vertices: b.vertCount, indices: b.idx.length });
  }
  return out;
}
function additions(city, before = new Map()) {
  const rows = [];
  for (const [chunk, cb] of city._chunks) for (const [key, b] of cb.groups) {
    const name = `${chunk}:${key}`, start = before.get(name) ?? { vertices: 0, indices: 0 };
    if (b.idx.length === start.indices) continue;
    rows.push({ name, pos: b.pos.slice(start.vertices * 3), nrm: b.nrm.slice(start.vertices * 3), uv: b.uv.slice(start.vertices * 2), col: b.col.slice(start.vertices * 3), idx: b.idx.slice(start.indices).map(i => i - start.vertices) });
  }
  return { hash: hash(rows), triangles: rows.reduce((n, x) => n + x.idx.length / 3, 0) };
}
function inspectBuild(Klass) {
  const zones = [], candidates = [];
  let buildingGeometry;
  const scatter = Klass.prototype._scatter, buildings = Klass.prototype._buildBuildings;
  const support = Klass.prototype._roofScatterSupported;
  let currentZone;
  Klass.prototype._scatter = function (zone, rng) {
    const before = snapshot(this), boxStart = this.collision.boxes.length; currentZone = zone.id;
    scatter.call(this, zone, rng);
    const colliders = this.collision.boxes.slice(boxStart).map(b => ({ x: b.x, z: b.z, y0: b.y0, y1: b.y1, w: b.hw * 2, d: b.hd * 2, rot: b.rot, tag: b.tag, layer: b.layer }));
    zones.push({ id: zone.id, character: zone.character, ...additions(this, before), colliders });
  };
  Klass.prototype._buildBuildings = function (rng) {
    const before = snapshot(this); buildings.call(this, rng);
    buildingGeometry = additions(this, before);
  };
  if (support) Klass.prototype._roofScatterSupported = function (builder, baseY) {
    const accepted = support.call(this, builder, baseY);
    const all = [...builder.groups.values()].flatMap(b => b.pos);
    const xs = all.filter((_, i) => i % 3 === 0), zs = all.filter((_, i) => i % 3 === 2);
    let topSurfaceOnly = all.length > 0, firstFailure = null;
    for (let i = 0; i < all.length; i += 3) {
      const hit = this.collision.raycast(all[i], baseY + .15, all[i + 2], 0, -1, 0, .3, LAYER.SOLID | LAYER.PLATFORM);
      if (!hit || Math.abs(hit.y - baseY) > .15 || Math.abs(hit.y - hit.box.y1) > 1e-6) {
        topSurfaceOnly = false;
        firstFailure = { pointXZ: [all[i], all[i + 2]], hit: hit && { y: hit.y, ny: hit.ny, top: hit.box.y1, tag: hit.box.tag } };
        break;
      }
    }
    candidates.push({ zone: currentZone, accepted, topSurfaceOnlyDiagnostic: topSurfaceOnly, firstFailure, baseY, xBounds: [Math.min(...xs), Math.max(...xs)], zBounds: [Math.min(...zs), Math.max(...zs)], vertices: all.length / 3, triangles: [...builder.groups.values()].reduce((n, b) => n + b.triangleCount, 0) });
    return accepted;
  };
  try {
    const f = buildCpuCity({ CityConstructor: Klass });
    const geometryHash = createHash('sha256');
    for (const mesh of f.meshes) {
      geometryHash.update(mesh.name);
      geometryHash.update(Buffer.from(mesh.geometry.attributes.position.array.buffer));
      if (mesh.geometry.index) geometryHash.update(Buffer.from(mesh.geometry.index.array.buffer));
    }
    const targets = JSON.parse(fs.readFileSync(`${root}/arcade-support-refutation.json`, 'utf8')).targets;
    const targetStrings = targets.map(t => JSON.stringify(t.triangle));
    const targetMatches = targets.map(t => ({ originalPixel: t.pixel, matchingWorldTriangles: 0 }));
    for (const m of f.meshes) {
      if (!targets.some(t => t.mesh === m.name)) continue;
      const n = (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3;
      for (let i = 0; i < n; i++) {
        const index = targetStrings.indexOf(JSON.stringify(worldTriangle(m, i)));
        if (index >= 0) targetMatches[index].matchingWorldTriangles++;
      }
    }
    return { meshes: f.meshes.length, geometryNamesPositionsIndicesSha256: geometryHash.digest('hex'), triangles: f.meshes.reduce((n, m) => n + (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3, 0), buildingGeometry, zones, candidates, targetMatches, roofHeights: [...new Set(f.data.buildings.map(b => b._roofY).filter(x => x !== undefined))].sort((a, b) => a - b) };
  } finally {
    Klass.prototype._scatter = scatter; Klass.prototype._buildBuildings = buildings;
    if (support) Klass.prototype._roofScatterSupported = support;
  }
}

const previous = inspectBuild(PreviousCity);
const current = inspectBuild(CurrentCity);
const controls = [];
for (const name of ['none', 'full', 'half', 'two-edge-strips']) {
  const collision = new CollisionWorld(6);
  if (name === 'full') collision.add(new Box(0, 9, 0, 10, 1, 10, 0, LAYER.PLATFORM, 'roof'));
  if (name === 'half') collision.add(new Box(-.5, 9, 0, 1, 1, 10, 0, LAYER.PLATFORM, 'roof'));
  if (name === 'two-edge-strips') for (const x of [-.5, .5]) collision.add(new Box(x, 9, 0, .05, 1, 10, 0, LAYER.PLATFORM, 'roof'));
  const cb = new ChunkBuilder(name); cb.m('metal').box({ x: 0, y: 10, z: 0, w: 1, h: 1, d: 1 });
  const center = collision.raycast(0, 10.15, 0, 0, -1, 0, .3, LAYER.SOLID | LAYER.PLATFORM);
  controls.push({ name, accepted: CurrentCity.prototype._roofScatterSupported.call({ collision }, cb, 10), centerHit: center && { y: center.y, ny: center.ny, top: center.box.y1 } });
}
const nonRoofDelta = current.zones.filter(z => z.character !== 'roof').map(z => ({ id: z.id, identical: z.hash === previous.zones.find(o => o.id === z.id)?.hash, collidersIdentical: hash(z.colliders) === hash(previous.zones.find(o => o.id === z.id)?.colliders) }));
const result = { checkedAt: new Date().toISOString(), baselineCommit: baseline, baselineCitySha256: hash(oldSource), currentCitySha256: currentSourceHash, collisionSourceSha256: collisionSourceHash, fixture: 'cpu-city-fixture-v2.mjs', scope: 'Node full production City geometry with stubbed appearance; no render or image-quality conclusion. Zone/building hashes compare generated attributes before occlusion bake.', previous, current, controls, nonRoofDelta, buildingGeometryIdentical: current.buildingGeometry.hash === previous.buildingGeometry.hash };
const output = process.argv[2] ?? `${root}/roof-scatter-cpu-measurements.json`;
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output, currentCitySha256: currentSourceHash, controls, roofZones: { previous: previous.zones.filter(z => z.character === 'roof'), current: current.zones.filter(z => z.character === 'roof') }, candidates: current.candidates.length, accepted: current.candidates.filter(c => c.accepted).length, topSurfaceOnlyDiagnostic: current.candidates.filter(c => c.topSurfaceOnlyDiagnostic).length, nonRoofMismatches: nonRoofDelta.filter(x => !x.identical), buildingGeometryIdentical: result.buildingGeometryIdentical, targetMatches: current.targetMatches }, null, 2));
