import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { buildCpuCity, THREE } from './cpu-city-fixture-v2.mjs';
import { City } from './survival/src/world/city.js';

const root = '/workspace/scratch/0b7ad82bafe7';
const accepted = [], excluded = new Map();
let zone = null;
const originalScatter = City.prototype._scatter, originalSupport = City.prototype._roofScatterSupported;
City.prototype._roofScatterSupported = function (builder, baseY) {
  const supported = originalSupport.call(this, builder, baseY);
  if (supported) {
    const points = new Map();
    for (const b of builder.groups.values()) {
      for (let i = 0; i < b.pos.length; i += 3) points.set(`${b.pos[i]},${b.pos[i + 2]}`, [b.pos[i], b.pos[i + 2]]);
    }
    accepted.push({ zone, baseY, points: [...points.values()] });
  }
  return supported;
};
City.prototype._scatter = function (spec, rng) {
  zone = spec.id;
  const starts = new Map();
  if (spec.character === 'roof') for (const cb of this._chunks.values()) for (const [key, b] of cb.groups) starts.set(`${cb.name}:${key}`, b.idx.length / 3);
  originalScatter.call(this, spec, rng);
  if (spec.character === 'roof') for (const cb of this._chunks.values()) for (const [key, b] of cb.groups) {
    const name = `${cb.name}:${key}`, start = starts.get(name) ?? 0, end = b.idx.length / 3;
    if (end > start) {
      if (!excluded.has(name)) excluded.set(name, []);
      excluded.get(name).push([start, end]);
    }
  }
};
let fixture;
try { fixture = buildCpuCity(); }
finally { City.prototype._scatter = originalScatter; City.prototype._roofScatterSupported = originalSupport; }
fixture.meshes.forEach(m => {
  for (const material of Array.isArray(m.material) ? m.material : [m.material]) material.side = THREE.DoubleSide;
});
const ray = new THREE.Raycaster(); ray.far = .5;
const normalMatrix = new THREE.Matrix3(), normal = new THREE.Vector3();
const output = [];
for (const item of accepted) {
  const rows = [];
  for (const [x, z] of item.points) {
    ray.set(new THREE.Vector3(x, item.baseY + .2, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(fixture.meshes, false).find(h => {
      if ((excluded.get(h.object.name) ?? []).some(([start, end]) => h.faceIndex >= start && h.faceIndex < end)) return false;
      normalMatrix.getNormalMatrix(h.object.matrixWorld);
      normal.copy(h.face.normal).applyMatrix3(normalMatrix).normalize();
      return normal.y > .9;
    });
    rows.push({ x, z, support: hit && { mesh: hit.object.name, faceIndex: hit.faceIndex, y: hit.point.y, gap: item.baseY - hit.point.y } });
  }
  output.push({ zone: item.zone, baseY: item.baseY, points: rows.length, missing: rows.filter(r => !r.support), minGap: Math.min(...rows.filter(r => r.support).map(r => r.support.gap)), maxGap: Math.max(...rows.filter(r => r.support).map(r => r.support.gap)), supportMeshes: [...new Set(rows.filter(r => r.support).map(r => r.support.mesh))], rows });
}
const result = {
  checkedAt: new Date().toISOString(),
  sourceHashes: Object.fromEntries(['src/world/city.js', 'src/world/collision.js'].map(file => [file, createHash('sha256').update(fs.readFileSync(`${root}/survival/${file}`)).digest('hex')])),
  scope: 'Actual generated render triangles and world transforms, CPU rays, no browser/GPU. All roof-scatter output face ranges are excluded, including other accepted props. Hidden meshes included, DoubleSide material rays filtered to actual upward geometric face normals. All distinct projected vertices of each accepted item are sampled; footprint interior is not exhaustively covered.',
  acceptedItems: output.length,
  sampledPoints: output.reduce((n, item) => n + item.points, 0),
  missingSupportPoints: output.reduce((n, item) => n + item.missing.length, 0),
  excludedRoofScatterFaceRanges: Object.fromEntries(excluded),
  items: output,
};
const file = `${root}/roof-render-support-measurements.json`;
fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ file, acceptedItems: result.acceptedItems, sampledPoints: result.sampledPoints, missingSupportPoints: result.missingSupportPoints, items: output.map(({rows,missing,...item}) => ({...item,missing:missing.length})) }, null, 2));
