/** Reversible grain-strength diagnosis on the existing frozen production views.
 * No source/default setting is changed and no quality or blind verdict is issued. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const BEFORE_GRAIN = 0.035;
const TRIAL_GRAIN = 0.012;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export async function captureGrainTrial({ page, root, output, name, cachedFrame, check, report }) {
  report.grainTrial ||= {
    scope: 'Eight existing medium-tier exterior views, with the engine stopped and dt=0. Only post.grade.grain changes from 0.035 to 0.012 and is then restored. Frame time, camera, lighting, non-grain grade and scene identity/transform/version records must agree; original pixels and the property descriptor must restore exactly. This is a source-known hypothesis diagnostic, not an adopted product change or a blind/quality verdict.',
    sourceBaselineCommit: '97ab074e7a35137b53ab72a400d4beeab5f0ca52',
    captureCommit: process.env.GITHUB_SHA || null,
    runtimeBundleSha256: digest(readFileSync(join(root, 'dist/cinderline.1.0.0.js'))),
    beforeGrain: BEFORE_GRAIN, trialGrain: TRIAL_GRAIN, verdict: 'not measured', views: [],
  };
  if (process.env.CINDERLINE_LIGHT_DIRECTION_TRIAL === '1') throw new Error('grain diagnosis requires its separate capture run');
  const result = await page.evaluate(({ beforeGrain, trialGrain }) => {
    const C = window.CINDERLINE, P = C.post, A = C.atmos, r = C.engine.renderer;
    const grade = P.grade, originalGrain = grade.grain;
    const originalDescriptor = Object.getOwnPropertyDescriptor(grade, 'grain');
    if (C.engine.running || C.engine.tier.name !== 'medium' || !C.engine.tierLocked ||
        C.game.settings.quality !== 'medium' || !P.enabled || !P.tier.grain ||
        !originalDescriptor?.writable || originalGrain !== beforeGrain ||
        P.matComposite.uniforms.uGrain.value !== beforeGrain) {
      throw new Error('grain diagnosis requires a frozen medium view with active original grain');
    }
    const stableState = () => {
      const { grain, ...otherGrade } = P.grade;
      return {
        running: C.engine.running, frame: C.engine.frame, time: C.engine.time, gameTime: C.game.time,
        atmosphereTime: A.time, exposureBias: A.exposureBias, mode: C.game.mode, mood: C.game.moodName,
        tier: C.engine.tier.name, tierLocked: C.engine.tierLocked, postEnabled: P.enabled, tierGrain: P.tier.grain,
        player: { position: C.game.player.pos.toArray(), yaw: C.game.player.yaw,
          hp: C.game.player.hp, state: C.game.player.state },
        camera: { position: C.engine.camera.position.toArray(), quaternion: C.engine.camera.quaternion.toArray(),
          fov: C.engine.camera.fov, aspect: C.engine.camera.aspect, near: C.engine.camera.near, far: C.engine.camera.far },
        settings: { ...C.game.settings },
        lighting: {
          sunPosition: A.sun.position.toArray(), sunTarget: A.sun.target.position.toArray(),
          sunIntensity: A.sun.intensity, sunColour: A.sun.color.getHex(),
          hemisphereIntensity: A.hemi.intensity, hemisphereSky: A.hemi.color.getHex(), hemisphereGround: A.hemi.groundColor.getHex(),
          ambientIntensity: A.ambient.intensity, ambientColour: A.ambient.color.getHex(),
          emberFillIntensity: A.emberFill.intensity, emberFillColour: A.emberFill.color.getHex(),
        },
        fog: C.scene.fog ? { colour: C.scene.fog.color.toArray(), density: C.scene.fog.density,
          near: C.scene.fog.near, far: C.scene.fog.far } : null,
        grade: JSON.parse(JSON.stringify(otherGrade)),
        postTime: P.matComposite.uniforms.uTime.value,
        effectiveExposure: P.matComposite.uniforms.uExposure.value,
        size: [r.domElement.width, r.domElement.height],
      };
    };
    // Compact hashes are emitted by Node; the scene records stay comparison inputs only.
    const sceneRecord = () => {
      const nodes = [];
      C.scene.traverse(object => {
        const geometry = object.geometry;
        const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
        nodes.push([object.uuid, object.visible, object.matrixWorld.toArray(),
          geometry ? [geometry.uuid, geometry.index?.version ?? null,
            Object.entries(geometry.attributes).map(([key, attribute]) => [key, attribute.count, attribute.version])] : null,
          materials.map(material => [material.uuid, material.version]),
          object.isLight ? [object.intensity, object.color.toArray(), object.distance ?? null,
            object.decay ?? null, object.angle ?? null, object.penumbra ?? null] : null]);
      });
      return JSON.stringify(nodes);
    };
    const frame = () => {
      C.game.render(0);
      r.getContext().finish();
      return { png: r.domElement.toDataURL('image/png'), state: stableState(), sceneRecord: sceneRecord(),
        gradeGrain: P.grade.grain, uniformGrain: P.matComposite.uniforms.uGrain.value,
        draws: r.info.render.calls, triangles: r.info.render.triangles };
    };
    let before, trial, restored, failure = null;
    try {
      before = frame();
      if (before.uniformGrain !== beforeGrain) throw new Error('original grain is not reaching the shader');
      grade.grain = trialGrain;
      trial = frame();
    } catch (error) {
      failure = error.stack || error.message || String(error);
    } finally {
      Object.defineProperty(grade, 'grain', originalDescriptor);
      try { restored = frame(); }
      catch (error) { failure = (failure || '') + '\nrestoration render: ' + (error.stack || error.message); }
    }
    const restoredDescriptor = Object.getOwnPropertyDescriptor(grade, 'grain');
    const descriptorRestored = !!restoredDescriptor &&
      ['value','get','set','writable','enumerable','configurable'].every(key => restoredDescriptor[key] === originalDescriptor[key]);
    return { before, trial, restored, failure, descriptorRestored,
      gradeObjectRestored: P.grade === grade, stillStopped: !C.engine.running };
  }, { beforeGrain: BEFORE_GRAIN, trialGrain: TRIAL_GRAIN });

  const cachedBytes = readFileSync(cachedFrame), cached = PNG.sync.read(cachedBytes);
  const decoded = {}, capturedBytes = {};
  const row = { name, failure: result.failure, descriptorRestored: result.descriptorRestored,
    gradeObjectRestored: result.gradeObjectRestored, stillStopped: result.stillStopped };
  for (const label of ['before', 'trial', 'restored']) {
    const frame = result[label];
    if (!frame) continue;
    const bytes = Buffer.from(frame.png.split(',')[1], 'base64'), png = PNG.sync.read(bytes);
    decoded[label] = png; capturedBytes[label] = bytes;
    const sameCachedPixels = png.width === cached.width && png.height === cached.height && png.data.equals(cached.data);
    const reuseCached = label !== 'trial' && bytes.equals(cachedBytes);
    const path = reuseCached ? cachedFrame : join(output, 'grain-' + name + '-' + label + '.png');
    if (!reuseCached) writeFileSync(path, bytes);
    const storedBytes = reuseCached ? readFileSync(cachedFrame) : bytes;
    row[label] = { ...frame, png: undefined, sceneRecord: undefined, sceneRecordSha256: digest(frame.sceneRecord),
      path: path.slice(root.length + 1), width: png.width, height: png.height, pngSha256: digest(storedBytes),
      capturedPngSha256: digest(bytes), rgbaSha256: digest(png.data), reusedCached: reuseCached, sameCachedPixels };
  }
  row.stateUnchanged = !!result.before && !!result.trial && !!result.restored &&
    JSON.stringify(result.before.state) === JSON.stringify(result.trial.state) &&
    JSON.stringify(result.before.state) === JSON.stringify(result.restored.state);
  row.sceneRecordsUnchanged = !!result.before && !!result.trial && !!result.restored &&
    result.before.sceneRecord === result.trial.sceneRecord && result.before.sceneRecord === result.restored.sceneRecord;
  const samePixels = (a, b) => !!a && !!b && a.width === b.width && a.height === b.height && a.data.equals(b.data);
  row.pixelsRestored = samePixels(decoded.before, decoded.restored);
  row.pngBytesRestored = !!capturedBytes.before && !!capturedBytes.restored && capturedBytes.before.equals(capturedBytes.restored);
  row.trialChangesPixels = !!decoded.before && !!decoded.trial && !samePixels(decoded.before, decoded.trial);
  row.grainValuesVerified = ['before','trial','restored'].every(label => {
    const expected = label === 'trial' ? TRIAL_GRAIN : BEFORE_GRAIN;
    return result[label]?.gradeGrain === expected && result[label]?.uniformGrain === expected;
  });
  row.renderCountsUnchanged = ['before','trial','restored'].every(label =>
    result[label]?.draws > 0 && result[label]?.triangles > 0 &&
    result[label]?.draws === result.before?.draws && result[label]?.triangles === result.before?.triangles);
  row.validControlledCapture = !result.failure && row.descriptorRestored && row.gradeObjectRestored && row.stillStopped &&
    row.before?.sameCachedPixels && row.stateUnchanged && row.sceneRecordsUnchanged && row.pixelsRestored &&
    row.pngBytesRestored && row.trialChangesPixels && row.grainValuesVerified && row.renderCountsUnchanged;
  report.grainTrial.views.push(row);
  check(row.validControlledCapture, 'grain ' + name + ': active single-variable trial and exact restoration',
    JSON.stringify({ failure: row.failure, descriptorRestored: row.descriptorRestored, gradeObjectRestored: row.gradeObjectRestored,
      stillStopped: row.stillStopped, baselineMatchesCached: row.before?.sameCachedPixels, stateUnchanged: row.stateUnchanged,
      sceneRecordsUnchanged: row.sceneRecordsUnchanged, pixelsRestored: row.pixelsRestored, pngBytesRestored: row.pngBytesRestored,
      trialChangesPixels: row.trialChangesPixels, grainValuesVerified: row.grainValuesVerified, renderCountsUnchanged: row.renderCountsUnchanged }));
}
