import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import * as THREE from 'three';
import { buildCharacter, BONE_INDEX } from '../source-original/src/actors/rig.js';
import { CollisionWorld, Box, LAYER } from '../source-original/src/world/collision.js';
import { ChunkBuilder, FACE } from '../source-original/src/world/geom.js';
import { Rng } from '../source-original/src/core/rng.js';
import { buildHollisData } from '../source-original/src/content/world_data.js';

const started = performance.now();
const sha = value => createHash('sha256').update(value).digest('hex');
const root = new URL('../', import.meta.url);
const original = new URL('../../c31-product-capture/original/', import.meta.url);
const bytes = readFileSync(new URL('report.json', original));
assert.equal(sha(bytes), 'c05495376603482ec67bd0fe3b6051288018abbd0f2529aabbad194c6fb8ac6e');
assert.equal(THREE.REVISION, '180');
const report = JSON.parse(bytes), names = ['south','cinder','arcade','marrow','stacks','plant','survey','ventfield'];
const images = names.map(name => {
  const row = report.visualViews.views.find(v => v.name === name);
  const b = readFileSync(new URL(`visual-${name}-frame.png`, original));
  assert.equal(sha(b), row.native.pngSha256);
  return { name, bytes: b.length, sha256: sha(b) };
});

// Actual current City method text and actual geometry/collision builders.
// Only ground and streets are built. Gas side effects/material shading are
// irrelevant to CPU support geometry and are explicitly substituted here.
const cityText = readFileSync(new URL('source-original/src/world/city.js', root), 'utf8');
const extract = (start, end) => {
  const i = cityText.indexOf(start), j = cityText.indexOf(end, i + start.length);
  assert(i >= 0 && j > i); return cityText.slice(i, j);
};
const methods = [
  extract('  _chunk(x, z) {', '  /** Add a solid'),
  extract('  solid(x, y0, z, w, h, d,', '  // ------------------------------------------------------------------ build'),
  extract('  _buildGround(rng) {', '  _buildStreets(rng) {'),
  extract('  _buildStreets(rng) {', '  // -------------------------------------------------------------- buildings'),
].join('\n');
const chunk = cityText.match(/^const CHUNK = \d+;$/m)[0];
const Ground = new Function('ChunkBuilder', 'Box', 'LAYER', 'FACE', `${chunk}\nreturn class Ground {${methods}}`)(ChunkBuilder, Box, LAYER, FACE);
const ground = new Ground();
Object.assign(ground, { data: buildHollisData(), collision: new CollisionWorld(6), _chunks: new Map(), _occ: null,
  fxMarkers: [], gas: { nx: 0, nz: 0, addSource() {} } });
const rng = new Rng(ground.data.seed || 'hollis');
ground._buildGround(rng); ground._buildStreets(rng);
const surfaces = new THREE.Group();
for (const c of ground._chunks.values()) surfaces.add(c.build(key => {
  const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); m.name = key; return m;
}));
surfaces.updateMatrixWorld(true);
const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
function support(x, z, fromY) {
  const collision = ground.collision.groundUnder(x, z, 0, fromY, 3);
  ray.set(new THREE.Vector3(x, fromY, z), down);
  const hits = ray.intersectObject(surfaces, true).filter(h => h.face.normal.y > 0.9);
  return { collision: collision ? { y: collision.y, tag: collision.box.tag } : null,
    render: hits[0] ? { y: hits[0].point.y, mesh: hits[0].object.name } : null };
}
const makeRig = seed => {
  const rig = buildCharacter('ren', 2, seed);
  const mesh = new THREE.SkinnedMesh(rig.geometry, new THREE.MeshBasicMaterial());
  mesh.add(rig.root); mesh.bind(rig.skeleton);
  const group = new THREE.Group(); group.add(mesh);
  const indices = { L: [], R: [] }, pos = rig.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    for (const side of ['L', 'R']) {
      if (pos.getY(i) < -0.002 && rig.geometry.attributes.skinIndex.getX(i) === BONE_INDEX[`foot${side}`]
        && rig.geometry.attributes.skinWeight.getX(i) === 1) indices[side].push(i);
    }
  }
  assert.equal(indices.L.length, 12); assert.equal(indices.R.length, 12);
  return { rig, mesh, group, indices };
};
const applyTransform = (object, row) => {
  assert(row); object.position.fromArray(row[1]); object.quaternion.fromArray(row[2]); object.scale.fromArray(row[3]);
};
const actual = [];
for (const name of names) {
  const view = report.visualViews.views.find(v => v.name === name);
  const shadow = report.shadowContact.views.find(v => v.name === name);
  const center = support(view.player.position[0], view.player.position[2], view.player.position[1] + 0.4);
  if (!shadow) {
    actual.push({ name, player: view.player, camera: view.camera, centerSupportGroundStreetsOnly: center,
      exactFootReplay: 'not measured: this original view has no recorded bone transforms' });
    continue;
  }
  assert.deepEqual(shadow.before, shadow.after);
  assert.deepEqual(shadow.before.position, view.player.position);
  assert.equal(shadow.before.frame, view.frame);
  assert.equal(shadow.frames[0].rgbaSha256, view.native.rgbaSha256);
  assert.equal(shadow.frames[0].rgbaSha256, shadow.frames.find(f => f.variant === 'refreshed').rgbaSha256);
  assert.equal(shadow.frames[0].rgbaSha256, shadow.frames.find(f => f.variant === 'repeat').rgbaSha256);
  const { rig, mesh, group, indices } = makeRig(1);
  const transforms = shadow.before.transforms;
  assert.equal(transforms[0][0], 'actor:Ren'); assert.equal(transforms[1][0], '');
  applyTransform(group, transforms[0]); applyTransform(mesh, transforms[1]);
  for (const bone of rig.bones) {
    const rows = transforms.filter(row => row[0] === bone.name); assert.equal(rows.length, 1);
    applyTransform(bone, rows[0]);
  }
  group.updateMatrixWorld(true); rig.skeleton.update();
  const camera = new THREE.PerspectiveCamera(view.camera.fov, view.camera.aspect, view.camera.near, view.camera.far);
  camera.position.fromArray(view.camera.position); camera.quaternion.fromArray(view.camera.quaternion); camera.updateMatrixWorld(true);
  const feet = {};
  for (const side of ['L', 'R']) {
    const vertices = indices[side].map(index => {
      const p = mesh.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
      const q = p.clone().project(camera), floor = support(p.x, p.z, view.player.position[1] + 0.4);
      return { index, world: p.toArray(), screenPx: [(q.x + 1) * view.native.width / 2, (1 - q.y) * view.native.height / 2],
        supportGroundStreetsOnly: floor, gapToRender: floor.render ? p.y - floor.render.y : null,
        gapToCollision: floor.collision ? p.y - floor.collision.y : null };
    });
    feet[side] = { minWorldY: Math.min(...vertices.map(v => v.world[1])), maxWorldY: Math.max(...vertices.map(v => v.world[1])),
      minGapToRender: Math.min(...vertices.map(v => v.gapToRender)), maxGapToRender: Math.max(...vertices.map(v => v.gapToRender)), vertices };
  }
  const dir = new THREE.Vector3().fromArray(shadow.lightPosition).sub(new THREE.Vector3().fromArray(shadow.lightTarget)).normalize();
  const depthExemption = -shadow.original.bias * (shadow.shadowCamera.far - shadow.shadowCamera.near);
  const sameUvHeightThreshold = shadow.original.normalBias + depthExemption * dir.y;
  actual.push({ name, player: view.player, camera: view.camera, centerSupportGroundStreetsOnly: center,
    exactFootReplay: 'recorded current local bone/group/mesh transforms; actual current rig and Three getVertexPosition', feet,
    shadow: { original: shadow.original, lightDirection: dir.toArray(), nearFar: shadow.shadowCamera,
      mapSize: shadow.shadowMapSize, depthExemptionAlongLightRay: depthExemption,
      idealHorizontalReceiverHeightThreshold: sameUvHeightThreshold,
      analyticOnly: 'Ideal unfiltered same-UV comparison; not GPU sampling or attribution of the image symptom',
      cachedEqualsRefreshedEqualsRepeat: true,
      unbatchedEqualsCached: shadow.frames.find(f => f.variant === 'unbatched').rgbaSha256 === view.native.rgbaSha256 } });
}
const seed1 = makeRig(1), seed97 = makeRig(97);
for (const side of ['L','R']) for (const i of seed1.indices[side]) {
  const a = seed1.rig.geometry.attributes.position, b = seed97.rig.geometry.attributes.position;
  assert.equal(a.getX(i), b.getX(i)); assert.equal(a.getY(i), b.getY(i)); assert.equal(a.getZ(i), b.getZ(i));
}
const arcade = actual.find(v => v.name === 'arcade');
assert.equal(arcade.centerSupportGroundStreetsOnly.collision.y, 0.14);
assert(Math.abs(arcade.centerSupportGroundStreetsOnly.render.y - 0.14) < 1e-6);
assert(arcade.feet.L.minGapToRender < 0 && arcade.feet.R.minGapToRender < 0);
assert(arcade.shadow.unbatchedEqualsCached);
assert.equal(sha(readFileSync(new URL('report.json', original))), sha(bytes));
for (const im of images) assert.equal(sha(readFileSync(new URL(`visual-${im.name}-frame.png`, original))), im.sha256);
const result = { scope: 'Read-only original-image/source-known CPU reconstruction. No rendered correction or reference comparison.',
  sourceCommit: 'b0f1dfb9860dbc00018c0c587d8f0934fadb6604', runtimeSha256: '81c93f3bf6c45b14c25f0e742a78d19b8dc70dca665ebba897bb6e39bbc937b3',
  originalReportSha256: sha(bytes), images, imageBytesUnchanged: true, views: actual,
  cpuElapsedMs: performance.now() - started,
  limits: ['Only ground/streets render surfaces and colliders reconstructed; props/buildings/stairs omitted.',
    'Only four exterior views contain original bone transforms. South, marrow, survey and plant exact foot pose are unmeasured.',
    'Seed 1 and 97 give identical sole vertices; actual original seed is not recorded. Colour is irrelevant to this geometry replay.',
    'Three r180 local dependency identity is pinned separately. No GPU/browser/simulator was launched.'],
  productionChanges: 0, comparisons: 0 };
writeFileSync(new URL('evidence/current-pose-replay.json', root), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ cpuElapsedMs: result.cpuElapsedMs, views: actual.map(v => ({ name: v.name,
  exact: !!v.feet, support: v.centerSupportGroundStreetsOnly, feet: v.feet && Object.fromEntries(Object.entries(v.feet).map(([s,f]) => [s,{minGapToRender:f.minGapToRender,maxGapToRender:f.maxGapToRender}])),
  shadow: v.shadow })) }, null, 2));
