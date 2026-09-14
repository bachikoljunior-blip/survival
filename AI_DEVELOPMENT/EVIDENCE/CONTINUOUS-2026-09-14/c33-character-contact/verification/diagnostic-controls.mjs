import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { inspectFrozenCharacterContact } from '../candidate/tools/mobile_character_ground_contact.mjs';
import { buildCharacter } from '../source-original/src/actors/rig.js';
import { CollisionWorld, Box, LAYER } from '../source-original/src/world/collision.js';

const started = performance.now(), results = [];
const report = JSON.parse(readFileSync(new URL('../../c31-product-capture/original/report.json', import.meta.url)));
const raw = report.shadowContact.views.find(v => v.name === 'arcade');
const view = report.visualViews.views.find(v => v.name === 'arcade');
const replay = JSON.parse(readFileSync(new URL('../evidence/current-pose-replay.json', import.meta.url)));
async function test(name, fn) { await fn(); results.push({ name, passed: true }); }
function fixture(mutate = () => {}) {
  const rig = buildCharacter('ren', 2, 1), mesh = new THREE.SkinnedMesh(rig.geometry, new THREE.MeshBasicMaterial());
  mesh.add(rig.root); mesh.bind(rig.skeleton);
  const group = new THREE.Group(); group.name = 'actor:Ren'; group.add(mesh);
  const apply = (o, row) => { o.position.fromArray(row[1]); o.quaternion.fromArray(row[2]); o.scale.fromArray(row[3]); };
  apply(group, raw.before.transforms[0]); apply(mesh, raw.before.transforms[1]);
  for (const b of rig.bones) apply(b, raw.before.transforms.find(r => r[0] === b.name));
  group.updateMatrixWorld(true); rig.skeleton.update();
  const world = new CollisionWorld();
  world.add(new Box(-104.5, -2, -6.5, 100, 2, 100, 0, LAYER.SOLID, 'ground'));
  world.add(new Box(-104.5, 0, -6.5, 10, .14, 10, 0, LAYER.PLATFORM, 'pavement'));
  const p = { rig, mesh, group, world, pos: new THREE.Vector3(...view.player.position), vel: new THREE.Vector3(),
    radius: .34, grounded: true, state: 'idle' };
  const camera = new THREE.PerspectiveCamera(view.camera.fov, view.camera.aspect, view.camera.near, view.camera.far);
  camera.position.fromArray(view.camera.position); camera.quaternion.fromArray(view.camera.quaternion); camera.updateMatrixWorld(true);
  const sun = new THREE.DirectionalLight(); sun.position.fromArray(raw.lightPosition); sun.target.position.fromArray(raw.lightTarget);
  sun.shadow.bias = raw.original.bias; sun.shadow.normalBias = raw.original.normalBias;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.near = 1; sun.shadow.camera.far = 150;
  const events = [];
  const C = { engine: { running: false, frame: view.frame, time: view.time, camera, renderer: {
    domElement: { width: view.native.width, height: view.native.height,
      // Explicit CPU tokens. These are never saved or counted as rendered PNGs.
      toDataURL: () => 'CPU_FIXTURE_NO_IMAGE' }, getContext: () => ({ finish() {} }) } },
    atmos: { sun, shadowDirty: false }, game: { player: p, shadowBatches: { enabled: true }, render(dt) {
      events.push({ bias: sun.shadow.bias, normalBias: sun.shadow.normalBias, dt }); mutate(C, events.length);
    } } };
  return { C, events };
}
function inspect(a, options) {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { CINDERLINE: a.C } });
  try { return inspectFrozenCharacterContact(options); }
  finally { if (old) Object.defineProperty(globalThis, 'window', old); else delete globalThis.window; }
}

await test('recorded exact arcade feet match independent CPU reconstruction', () => {
  const a = fixture(), out = inspect(a), expected = replay.views.find(v => v.name === 'arcade');
  assert.equal(out.validDiagnostic, true); assert.equal(a.events.length, 0); assert.equal(out.frames.length, 0);
  for (const side of ['L', 'R']) {
    assert.equal(out.feet[side].length, 12);
    out.feet[side].forEach((v, i) => {
      assert.deepEqual(v.world, expected.feet[side].vertices[i].world);
      assert.deepEqual(v.screenPx, expected.feet[side].vertices[i].screenPx);
      assert.equal(v.pointSupport.y, .14);
    });
  }
});
await test('isolated bias controls keep normal/depth counterpart fixed and restore all original settings', () => {
  const a = fixture(), out = inspect(a, { controlBias: true });
  assert.equal(out.validDiagnostic, true);
  assert.deepEqual(a.events.map(e => [e.bias, e.normalBias, e.dt]), [
    [-.0009,.028,0],[0,.028,0],[-.0009,0,0],[0,0,0],[-.0009,.028,0],[-.0009,.028,0],
  ]);
  assert.deepEqual(out.before, out.after); assert(out.restored); assert(out.unchanged);
  assert.equal(out.comparison, 'not measured');
});
await test('render failure is retained and bias settings are restored', () => {
  const a = fixture((_C, count) => { if (count === 2) throw new Error('fixture render failed'); });
  const out = inspect(a, { controlBias: true });
  assert.match(out.failure, /fixture render failed/); assert.equal(out.validDiagnostic, false);
  assert.equal(out.restored, true); assert.equal(out.cleanupFailure, null);
  assert.deepEqual(a.events.at(-1), { bias: -.0009, normalBias: .028, dt: 0 });
});
await test('cleanup render failure stays invalid while original parameters still restore', () => {
  const a = fixture((_C, count) => { if (count === 6) throw new Error('fixture restore render failed'); });
  const out = inspect(a, { controlBias: true });
  assert.match(out.cleanupFailure, /fixture restore render failed/); assert.equal(out.validDiagnostic, false); assert(out.restored);
});
await test('simulation/camera drift during control makes the diagnostic invalid', () => {
  const a = fixture(C => { C.engine.frame++; C.engine.camera.position.x += .01; });
  const out = inspect(a, { controlBias: true });
  assert.equal(out.unchanged, false); assert.equal(out.validDiagnostic, false); assert(out.restored);
});
await test('bone drift during render is not hidden by a restored shadow setting', () => {
  const a = fixture(C => {
    C.game.player.rig.bones[1].position.y += .01;
    C.game.player.group.updateMatrixWorld(true); C.game.player.rig.skeleton.update();
  });
  const out = inspect(a, { controlBias: true }); assert.equal(out.unchanged, false); assert.equal(out.validDiagnostic, false);
});
await test('live simulation is rejected before rendering or parameter changes', () => {
  const a = fixture(); a.C.engine.running = true;
  assert.throws(() => inspect(a, { controlBias: true }), /frozen visual capture/); assert.equal(a.events.length, 0);
});
await test('unexpected sole topology is rejected before rendering', () => {
  const a = fixture(); a.C.game.player.rig.bones.find(b => b.name === 'footL').name = 'unexpected';
  assert.throws(() => inspect(a, { controlBias: true }), /missing production foot bone/); assert.equal(a.events.length, 0);
});
await test('step/edge point support and body-radius support remain separate measurements', () => {
  const a = fixture(), p = a.C.game.player;
  p.world = new CollisionWorld();
  p.world.add(new Box(-104.5, -2, -6.5, 100, 2, 100, 0, LAYER.SOLID, 'ground'));
  p.world.add(new Box(-104.5 + .4, 0, -6.5, .2, .4, 2, 0, LAYER.PLATFORM, 'step'));
  const out = inspect(a);
  assert(Object.values(out.feet).flat().some(v => v.pointSupport.y === 0 && v.bodyRadiusSupport.y === .4));
  assert.equal(out.validDiagnostic, true);
});
await test('unsupported feet return null support without grounding or moving the player', () => {
  const a = fixture(); a.C.game.player.world = new CollisionWorld(); a.C.game.player.grounded = false;
  const out = inspect(a); assert.equal(out.before.grounded, false); assert.equal(out.after.grounded, false);
  assert(Object.values(out.feet).flat().every(v => v.pointSupport === null && v.gapToPointCollision === null));
  assert.equal(out.validDiagnostic, true);
});
await test('integration preserves default route and selects diagnostics explicitly; original shadow checks remain', () => {
  const before = readFileSync(new URL('../source-original/tools/mobile_visual_capture.mjs', import.meta.url), 'utf8');
  let after = readFileSync(new URL('../candidate/tools/mobile_visual_capture.mjs', import.meta.url), 'utf8');
  after = after.replace("import { captureCharacterGroundContact } from './mobile_character_ground_contact.mjs';\n", '');
  after = after.replace("        if(process.env.CINDERLINE_CHARACTER_CONTACT==='1' && name!=='marrow_roof') {\n          await captureCharacterGroundContact({page,root,output,name,cachedFrame:native,\n            controlBias:['arcade','south'].includes(name),check,report});\n        }\n", '');
  assert.equal(after, before);
});
const result = { scope: 'CPU diagnostic-control tests only. Rendering is explicitly stubbed with CPU tokens; no image or browser success is claimed.',
  passed: results.length, failed: 0, results, elapsedMs: performance.now() - started, browserRuns: 0, renderedDiagnosticPNGs: 0, comparisons: 0 };
writeFileSync(new URL('../evidence/diagnostic-controls.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
