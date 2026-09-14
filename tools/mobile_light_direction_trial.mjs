/** A reversible lighting experiment on one already-frozen production view.
 * This is a source-known diagnosis, never a blind verdict or shipped change. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const TRIAL_OFFSET = [-56, 74, 43];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export async function captureLightDirectionTrial({ page, root, output, name, cachedFrame, check, report }) {
  report.lightDirectionTrial ||= {
    scope: 'Eight fixed exterior views. The engine remains stopped and every render uses dt=0. Only the main directional light offset changes, from [-30,92,34] to [-56,74,43]. Intensity, colour, fill, fog, post grade, camera, materials and geometry are not intentionally changed. Before/after restoration and state equality are tested; failure invalidates causal interpretation. This is an experimental rendering of the existing product, not a shipped build or a blind comparison.',
    productCommit: process.env.GITHUB_SHA || null,
    trialOffset: TRIAL_OFFSET,
    verdict: 'not measured',
    views: [],
  };
  const result = await page.evaluate(offset => {
    const C = window.CINDERLINE, A = C.atmos, r = C.engine.renderer;
    if (C.engine.running) throw new Error('lighting experiment requires the existing frozen view');
    const update = A.update;
    const originalUpdateDescriptor = Object.getOwnPropertyDescriptor(A, 'update');
    const originalPosition = A.sun.position.clone();
    const stableState = () => ({
      running: C.engine.running, frame: C.engine.frame, time: C.engine.time,
      atmosphereTime: A.time, exposureBias: A.exposureBias, mode: C.game.mode, mood: C.game.moodName,
      player: { position: C.game.player.pos.toArray(), yaw: C.game.player.yaw,
        hp: C.game.player.hp, state: C.game.player.state },
      camera: { position: C.engine.camera.position.toArray(), quaternion: C.engine.camera.quaternion.toArray(),
        fov: C.engine.camera.fov, near: C.engine.camera.near, far: C.engine.camera.far },
      settings: { ...C.game.settings },
      lighting: {
        sunTarget: A.sun.target.position.toArray(), sunIntensity: A.sun.intensity, sunColour: A.sun.color.getHex(),
        hemisphereIntensity: A.hemi.intensity, hemisphereSky: A.hemi.color.getHex(), hemisphereGround: A.hemi.groundColor.getHex(),
        ambientIntensity: A.ambient.intensity, ambientColour: A.ambient.color.getHex(),
        emberFillIntensity: A.emberFill.intensity, emberFillColour: A.emberFill.color.getHex(),
        shadowNear: A.sun.shadow.camera.near, shadowFar: A.sun.shadow.camera.far,
        shadowLeft: A.sun.shadow.camera.left, shadowRight: A.sun.shadow.camera.right,
        shadowTop: A.sun.shadow.camera.top, shadowBottom: A.sun.shadow.camera.bottom,
      },
      grade: JSON.parse(JSON.stringify(C.post.grade)),
    });
    const frame = () => {
      C.game.render(0);
      r.getContext().finish();
      return { png: r.domElement.toDataURL('image/png'), state: stableState(),
        sunPosition: A.sun.position.toArray(),
        sunOffset: A.sun.position.clone().sub(A.sun.target.position).toArray(),
        draws: r.info.render.calls, triangles: r.info.render.triangles };
    };
    let before, trial, restored, failure = null;
    try {
      before = frame();
      A.update = function (dt, playerPosition, gasPpm) {
        update.call(this, dt, playerPosition, gasPpm);
        this.sun.position.set(playerPosition.x + offset[0], playerPosition.y + offset[1], playerPosition.z + offset[2]);
        this.shadowDirty = true;
      };
      trial = frame();
    } catch (error) {
      failure = error.stack || error.message || String(error);
    } finally {
      if (originalUpdateDescriptor) Object.defineProperty(A, 'update', originalUpdateDescriptor);
      else delete A.update;
      A.sun.position.copy(originalPosition);
      A.shadowDirty = true;
      try { restored = frame(); }
      catch (error) { failure = (failure || '') + '\nrestoration render: ' + (error.stack || error.message); }
    }
    const restoredDescriptor = Object.getOwnPropertyDescriptor(A, 'update');
    const descriptorRestored = originalUpdateDescriptor ? !!restoredDescriptor &&
      ['value','get','set','writable','enumerable','configurable'].every(key => restoredDescriptor[key] === originalUpdateDescriptor[key]) :
      restoredDescriptor === undefined;
    return { before, trial, restored, failure, updateRestored: A.update === update && descriptorRestored, stillStopped: !C.engine.running };
  }, TRIAL_OFFSET);

  const cachedBytes = readFileSync(cachedFrame);
  const cached = PNG.sync.read(cachedBytes);
  const decoded = {};
  const row = { name, failure: result.failure, updateRestored: result.updateRestored, stillStopped: result.stillStopped };
  for (const label of ['before', 'trial', 'restored']) {
    const frame = result[label];
    if (!frame) continue;
    const bytes = Buffer.from(frame.png.split(',')[1], 'base64');
    const png = PNG.sync.read(bytes);
    decoded[label] = png;
    const sameCachedPixels = png.width === cached.width && png.height === cached.height && png.data.equals(cached.data);
    // Reuse only an exact original PNG byte match. Pixel equality alone never
    // substitutes for preserving different captured bytes or metadata.
    const reuseCached = label !== 'trial' && bytes.equals(cachedBytes);
    const path = reuseCached ? cachedFrame : join(output, 'light-direction-' + name + '-' + label + '.png');
    if (!reuseCached) writeFileSync(path, bytes);
    const storedBytes = reuseCached ? readFileSync(cachedFrame) : bytes;
    row[label] = { ...frame, png: undefined, path: path.slice(root.length + 1),
      width: png.width, height: png.height, pngSha256: digest(storedBytes),
      capturedPngSha256: digest(bytes), rgbaSha256: digest(png.data), reusedCached: reuseCached, sameCachedPixels };
  }
  row.stateUnchanged = !!result.before && !!result.trial && !!result.restored &&
    JSON.stringify(result.before.state) === JSON.stringify(result.trial.state) &&
    JSON.stringify(result.before.state) === JSON.stringify(result.restored.state);
  row.pixelsRestored = !!decoded.before && !!decoded.restored &&
    decoded.before.width === decoded.restored.width && decoded.before.height === decoded.restored.height &&
    decoded.before.data.equals(decoded.restored.data);
  const sameOffset = (actual, expected) => Array.isArray(actual) && actual.length === 3 &&
    actual.every((v, i) => Number.isFinite(v) && Math.abs(v - expected[i]) < 1e-9);
  row.offsetsVerified = sameOffset(result.before?.sunOffset, [-30, 92, 34]) &&
    sameOffset(result.trial?.sunOffset, TRIAL_OFFSET) && sameOffset(result.restored?.sunOffset, [-30, 92, 34]);
  row.validControlledCapture = !result.failure && result.updateRestored && result.stillStopped &&
    row.stateUnchanged && row.pixelsRestored && row.offsetsVerified &&
    ['before','trial','restored'].every(label => result[label]?.draws > 0 && result[label]?.triangles > 0);
  report.lightDirectionTrial.views.push(row);
  check(row.validControlledCapture, 'light direction ' + name + ': frozen state and restored pixels',
    JSON.stringify({ failure: row.failure, stateUnchanged: row.stateUnchanged, pixelsRestored: row.pixelsRestored,
      offsetsVerified: row.offsetsVerified, updateRestored: row.updateRestored, stillStopped: row.stillStopped }));
}
