/** Source-known frozen-pose diagnosis only; never a quality/comparison pass. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Self-contained browser function. The caller already stopped simulation at a
// normal visual-capture point. No actor, camera, game clock or geometry is set.
export function inspectFrozenCharacterContact({ controlBias = false } = {}) {
  const C = window.CINDERLINE, p = C.game.player, r = C.engine.renderer, s = C.atmos.sun.shadow;
  if (C.engine.running) throw new Error('character contact requires the existing frozen visual capture');
  const original = { bias: s.bias, normalBias: s.normalBias, batching: C.game.shadowBatches.enabled };
  const pose = () => {
    const transforms = [];
    p.group.traverse(o => transforms.push([o.name, o.position.toArray(), o.quaternion.toArray(), o.scale.toArray()]));
    return { frame: C.engine.frame, time: C.engine.time, running: C.engine.running,
      position: p.pos.toArray(), velocity: p.vel.toArray(), grounded: p.grounded, state: p.state,
      transforms, camera: { position: C.engine.camera.position.toArray(), quaternion: C.engine.camera.quaternion.toArray(),
        fov: C.engine.camera.fov, projection: C.engine.camera.projectionMatrix.toArray() },
      light: [C.atmos.sun.position.toArray(), C.atmos.sun.target.position.toArray()] };
  };
  const feet = () => {
    const a = p.mesh.geometry.attributes, rows = {};
    for (const side of ['L', 'R']) {
      const index = p.rig.bones.findIndex(b => b.name === `foot${side}`);
      if (index < 0) throw new Error('missing production foot bone');
      const indices = [];
      for (let i = 0; i < a.position.count; i++) {
        if (a.position.getY(i) < -0.002 && a.skinIndex.getX(i) === index && a.skinWeight.getX(i) === 1) indices.push(i);
      }
      if (indices.length !== 12) throw new Error('unexpected production Ren sole topology');
      rows[side] = indices.map(i => {
        const v = p.mesh.getVertexPosition(i, p.pos.clone()).applyMatrix4(p.mesh.matrixWorld);
        const q = v.clone().project(C.engine.camera);
        // Point support and the actual body-radius support are distinct near
        // steps/edges. Record both; neither is replaced by an invented plane.
        const point = p.world.groundUnder(v.x, v.z, 0, p.pos.y + 0.4, 3);
        const body = p.world.groundUnder(v.x, v.z, p.radius, p.pos.y + 0.4, 3);
        const summary = g => g ? { y: g.y, tag: g.box.tag, layer: g.box.layer,
          x: g.box.x, z: g.box.z, y0: g.box.y0, y1: g.box.y1, rot: g.box.rot } : null;
        return { index: i, world: v.toArray(), screenPx: [(q.x + 1) * r.domElement.width / 2, (1 - q.y) * r.domElement.height / 2],
          pointSupport: summary(point), bodyRadiusSupport: summary(body),
          gapToPointCollision: point ? v.y - point.y : null };
      });
    }
    return rows;
  };
  const before = pose(), footBefore = feet(), frames = [];
  let failure = null, cleanupFailure = null;
  try {
    if (controlBias) {
      // Zero values are causal controls, not proposed product settings. Keep
      // normal bias fixed for depth-only and depth bias fixed for normal-only.
      for (const [variant, bias, normalBias] of [
        ['original', original.bias, original.normalBias],
        ['depth-zero', 0, original.normalBias],
        ['normal-zero', original.bias, 0],
        ['both-zero', 0, 0],
        ['repeat', original.bias, original.normalBias],
      ]) {
        s.bias = bias; s.normalBias = normalBias;
        C.atmos.shadowDirty = true; C.game.render(0);
        const png = r.domElement.toDataURL('image/png'); r.getContext().finish();
        frames.push({ variant, bias, normalBias, png, pose: pose(), feet: feet() });
      }
    }
  } catch (error) { failure = String(error.message || error); }
  finally {
    s.bias = original.bias; s.normalBias = original.normalBias;
    if (controlBias) {
      try { C.atmos.shadowDirty = true; C.game.render(0); }
      catch (error) { cleanupFailure = String(error.message || error); }
    }
  }
  const after = pose(), footAfter = feet();
  const unchanged = JSON.stringify(before) === JSON.stringify(after)
    && JSON.stringify(footBefore) === JSON.stringify(footAfter)
    && frames.every(f => JSON.stringify(f.pose) === JSON.stringify(before) && JSON.stringify(f.feet) === JSON.stringify(footBefore));
  const restored = s.bias === original.bias && s.normalBias === original.normalBias
    && C.game.shadowBatches.enabled === original.batching;
  return { original, controlBias, before, after, feet: footBefore, frames, failure, cleanupFailure,
    unchanged, restored, validDiagnostic: !failure && !cleanupFailure && unchanged && restored,
    shadow: { mapSize: s.mapSize.toArray(), near: s.camera.near, far: s.camera.far,
      matrix: s.matrix.toArray(), light: C.atmos.sun.position.toArray(), target: C.atmos.sun.target.position.toArray() },
    supportScope: 'Actual collision query only. Rendered surface height, normal-map sampling and shadow texels are not directly measured here.',
    comparison: 'not measured' };
}

export async function captureCharacterGroundContact({ page, root, output, name, cachedFrame, controlBias = false, check, report }) {
  const result = await page.evaluate(inspectFrozenCharacterContact, { controlBias });
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const original = readFileSync(cachedFrame);
  result.cachedFrame = { path: cachedFrame.slice(root.length + 1), bytes: original.length, sha256: digest(original) };
  for (const frame of result.frames) {
    if (!frame.png.startsWith('data:image/png;base64,')) throw new Error('contact diagnostic returned no original PNG');
    const bytes = Buffer.from(frame.png.slice('data:image/png;base64,'.length), 'base64');
    const path = join(output, `contact-${name}-${frame.variant}.png`);
    writeFileSync(path, bytes); delete frame.png;
    Object.assign(frame, { path: path.slice(root.length + 1), bytes: bytes.length, sha256: digest(bytes) });
  }
  result.originalMatchesCached = !controlBias || result.frames.find(f => f.variant === 'original')?.sha256 === result.cachedFrame.sha256;
  result.originalMatchesRepeat = !controlBias || result.frames.find(f => f.variant === 'original')?.sha256 === result.frames.find(f => f.variant === 'repeat')?.sha256;
  report.characterGroundContact ??= { scope: 'Source-known contact diagnosis: all eight existing frozen exterior poses; depth/normal-bias controls only at arcade and south. Complete native PNG bytes are saved without edits. No product settings or quality criteria change.', views: [] };
  report.characterGroundContact.views.push({ name, ...result });
  const valid = result.validDiagnostic && result.originalMatchesCached && result.originalMatchesRepeat;
  check(valid, `contact ${name}: exact frozen pose and original rendering restored`,
    JSON.stringify({ unchanged: result.unchanged, restored: result.restored, originalMatchesCached: result.originalMatchesCached,
      originalMatchesRepeat: result.originalMatchesRepeat, failure: result.failure, cleanupFailure: result.cleanupFailure }));
  if (!valid) throw new Error(`invalid character contact diagnostic: ${name}`);
}
