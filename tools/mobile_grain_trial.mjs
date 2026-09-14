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
    scope: 'Eight existing medium-tier exterior views, with the engine stopped and dt=0. Only post.grade.grain changes from 0.035 to 0.012 and is then restored. Frame time, camera, lighting, non-grain grade and scene identity, transforms, visibility, material/light values and every geometry/instance buffer byte must agree; attribute upload-version differences are recorded separately; original pixels and the property descriptor must restore exactly. This is a source-known hypothesis diagnostic, not an adopted product change or a blind/quality verdict.',
    sourceBaselineCommit: '97ab074e7a35137b53ab72a400d4beeab5f0ca52',
    captureCommit: process.env.GITHUB_SHA || null,
    runtimeBundleSha256: digest(readFileSync(join(root, 'dist/cinderline.1.0.0.js'))),
    sceneGuardSchemaVersion: 2, beforeGrain: BEFORE_GRAIN, trialGrain: TRIAL_GRAIN, verdict: 'not measured', views: [],
  };
  if (process.env.CINDERLINE_LIGHT_DIRECTION_TRIAL === '1') throw new Error('grain diagnosis requires its separate capture run');
  const result = await page.evaluate(captureFrozenGrainFrames, { beforeGrain: BEFORE_GRAIN, trialGrain: TRIAL_GRAIN });

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
    row[label] = { ...frame, png: undefined, sceneRecord: undefined, sceneInvariantRecord: undefined,
      sceneInvariantSha256: digest(frame.sceneInvariantRecord), sceneRecordSha256: digest(frame.sceneRecord),
      path: path.slice(root.length + 1), width: png.width, height: png.height, pngSha256: digest(storedBytes),
      capturedPngSha256: digest(bytes), rgbaSha256: digest(png.data), reusedCached: reuseCached, sameCachedPixels };
  }
  row.stateUnchanged = !!result.before && !!result.trial && !!result.restored &&
    JSON.stringify(result.before.state) === JSON.stringify(result.trial.state) &&
    JSON.stringify(result.before.state) === JSON.stringify(result.restored.state);
  row.sceneRecordsUnchanged = !!result.before && !!result.trial && !!result.restored &&
    result.before.sceneRecord === result.trial.sceneRecord && result.before.sceneRecord === result.restored.sceneRecord;
  row.sceneComparisons = result.sceneComparisons;
  row.sceneDataUnchanged = !!result.sceneComparisons?.beforeTrial.unchanged && !!result.sceneComparisons?.beforeRestored.unchanged;
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
    row.before?.sameCachedPixels && row.stateUnchanged && row.sceneDataUnchanged && row.pixelsRestored &&
    row.pngBytesRestored && row.trialChangesPixels && row.grainValuesVerified && row.renderCountsUnchanged;
  report.grainTrial.views.push(row);
  check(row.validControlledCapture, 'grain ' + name + ': active single-variable trial and exact restoration',
    JSON.stringify({ failure: row.failure, descriptorRestored: row.descriptorRestored, gradeObjectRestored: row.gradeObjectRestored,
      stillStopped: row.stillStopped, baselineMatchesCached: row.before?.sameCachedPixels, stateUnchanged: row.stateUnchanged,
      sceneRecordsUnchanged: row.sceneRecordsUnchanged, sceneDataUnchanged: row.sceneDataUnchanged,
      sceneComparisons: row.sceneComparisons, pixelsRestored: row.pixelsRestored, pngBytesRestored: row.pngBytesRestored,
      trialChangesPixels: row.trialChangesPixels, grainValuesVerified: row.grainValuesVerified, renderCountsUnchanged: row.renderCountsUnchanged }));
}

// Self-contained Playwright callback; exported for CPU controls without a browser.
export async function captureFrozenGrainFrames({ beforeGrain, trialGrain }) {
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
    // Attribute upload versions are diagnostic counters, not vertex values.
    // Copy every backing array, including instancing and morph data, before
    // hashing. Every byte is compared; version-only uploads may agree, while
    // changed arrays fail even when their version was never incremented.
    const identities = new WeakMap();
    let nextIdentity = 1;
    const identity = value => {
      if (!identities.has(value)) identities.set(value, nextIdentity++);
      return identities.get(value);
    };
    const sceneSnapshot = async () => {
      const buffers = {}, counters = {}, pending = [], seen = new WeakMap();
      const copyArray = (array, path) => {
        if (!ArrayBuffer.isView(array) || array instanceof DataView) {
          throw new Error('scene guard cannot inspect array at ' + path);
        }
        const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength).slice();
        const values = new array.constructor(bytes.buffer);
        const record = { type: array.constructor.name, length: array.length, byteLength: bytes.length, sha256: null };
        buffers[path] = { bytes, values, record };
        pending.push(crypto.subtle.digest('SHA-256', bytes).then(hash => {
          record.sha256 = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
        }));
        return record;
      };
      const valueRecord = (value, path) => {
        if (typeof value === 'number') return Number.isFinite(value) ? (Object.is(value, -0) ? '-0' : value) : String(value);
        if (value === undefined) return { undefined: true };
        if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
        if (typeof value === 'function') return { functionId: identity(value), source: String(value) };
        if (ArrayBuffer.isView(value)) return copyArray(value, path);
        if (seen.has(value)) return { reference: seen.get(value) };
        seen.set(value, path);
        if (Array.isArray(value)) return value.map((entry, i) => valueRecord(entry, path + '[' + i + ']'));
        if (value.isTexture) {
          // Keep texture/source upload versions strict. Canvas/image contents
          // cannot affect an uploaded texture without a corresponding upload.
          const texture = {};
          for (const key of Object.keys(value).sort()) {
            if (key === '_listeners' || key === 'source') continue;
            texture[key] = valueRecord(value[key], path + '.' + key);
          }
          const data = value.source?.data;
          texture.source = { uuid: value.source?.uuid ?? null, version: value.source?.version ?? null,
            width: data?.width ?? null, height: data?.height ?? null,
            data: data?.data ? valueRecord(data.data, path + '.source.data') : null };
          return texture;
        }
        const record = {};
        for (const key of Object.keys(value).sort()) {
          if (key === '_listeners') continue;
          record[key] = valueRecord(value[key], path + '.' + key);
        }
        return record;
      };
      const attributeRecord = (attribute, path) => {
        if (!attribute) return null;
        const data = attribute.isInterleavedBufferAttribute ? attribute.data : attribute;
        counters[path + '.version'] = data.version;
        return { count: attribute.count, itemSize: attribute.itemSize, normalized: attribute.normalized,
          usage: data.usage, gpuType: attribute.gpuType ?? null, offset: attribute.offset ?? null,
          stride: data.stride ?? null, meshPerAttribute: attribute.meshPerAttribute ?? data.meshPerAttribute ?? null,
          array: copyArray(data.array, path + '.array') };
      };
      const record = { nodes: {}, geometries: {}, materials: {} };
      C.scene.traverse(object => {
        const path = 'nodes.' + object.uuid;
        const geometry = object.geometry;
        if (geometry && !record.geometries[geometry.uuid]) {
          const geometryPath = 'geometries.' + geometry.uuid;
          const attributes = {}, morphAttributes = {};
          for (const key of Object.keys(geometry.attributes).sort()) {
            attributes[key] = attributeRecord(geometry.attributes[key], geometryPath + '.attributes.' + key);
          }
          for (const key of Object.keys(geometry.morphAttributes || {}).sort()) {
            morphAttributes[key] = geometry.morphAttributes[key].map((attribute, i) =>
              attributeRecord(attribute, geometryPath + '.morphAttributes.' + key + '[' + i + ']'));
          }
          record.geometries[geometry.uuid] = { index: attributeRecord(geometry.index, geometryPath + '.index'),
            attributes, morphAttributes, morphTargetsRelative: geometry.morphTargetsRelative,
            drawRange: { ...geometry.drawRange }, groups: valueRecord(geometry.groups, geometryPath + '.groups') };
        }
        const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
        for (const material of materials) {
          if (!record.materials[material.uuid]) record.materials[material.uuid] = valueRecord(material, 'materials.' + material.uuid);
        }
        record.nodes[object.uuid] = { type: object.type, name: object.name, parent: object.parent?.uuid ?? null,
          children: object.children.map(child => child.uuid), visible: object.visible, layers: object.layers.mask,
          matrixWorld: object.matrixWorld.toArray(), renderOrder: object.renderOrder,
          frustumCulled: object.frustumCulled, castShadow: object.castShadow, receiveShadow: object.receiveShadow,
          geometry: geometry?.uuid ?? null, materials: materials.map(material => material.uuid),
          count: object.count ?? null, instanceMatrix: attributeRecord(object.instanceMatrix, path + '.instanceMatrix'),
          instanceColor: attributeRecord(object.instanceColor, path + '.instanceColor'),
          morphTargetInfluences: valueRecord(object.morphTargetInfluences, path + '.morphTargetInfluences'),
          boneMatrices: object.skeleton ? valueRecord(object.skeleton.boneMatrices, path + '.boneMatrices') : null,
          light: object.isLight ? { intensity: object.intensity, color: object.color.toArray(),
            groundColor: object.groundColor?.toArray() ?? null, distance: object.distance ?? null,
            decay: object.decay ?? null, angle: object.angle ?? null, penumbra: object.penumbra ?? null,
            target: object.target?.matrixWorld.toArray() ?? null } : null };
      });
      await Promise.all(pending);
      return { record, counters, buffers };
    };
    const compareScenes = (before, after) => {
      const differences = [], counterDifferences = [], bufferDifferences = [];
      let differenceCount = 0, counterDifferenceCount = 0;
      const show = value => value === undefined ? { missing: true } :
        typeof value === 'number' && !Number.isFinite(value) ? String(value) : Object.is(value, -0) ? '-0' : value;
      const note = (path, a, b, counter) => {
        if (counter) counterDifferenceCount++; else differenceCount++;
        const target = counter ? counterDifferences : differences;
        if (target.length < 96) target.push({ path, before: show(a), after: show(b) });
      };
      const walk = (a, b, path, counter = false) => {
        if (Object.is(a, b)) return;
        if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
          for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[key], b[key], path + '.' + key, counter);
        } else note(path, a, b, counter);
      };
      walk(before.record, after.record, 'scene');
      walk(before.counters, after.counters, 'uploadVersions', true);
      let changedBufferCount = 0;
      for (const path of new Set([...Object.keys(before.buffers), ...Object.keys(after.buffers)])) {
        const a = before.buffers[path], b = after.buffers[path];
        let changedBytes = 0;
        const samples = [];
        for (let i = 0; i < Math.max(a?.bytes.length || 0, b?.bytes.length || 0); i++) {
          if (a?.bytes[i] === b?.bytes[i]) continue;
          changedBytes++;
          if (samples.length < 8) samples.push({ byteOffset: i, beforeByte: a?.bytes[i] ?? null,
            afterByte: b?.bytes[i] ?? null, beforeElement: a ? Math.floor(i / a.values.BYTES_PER_ELEMENT) : null,
            afterElement: b ? Math.floor(i / b.values.BYTES_PER_ELEMENT) : null,
            beforeValue: a ? String(a.values[Math.floor(i / a.values.BYTES_PER_ELEMENT)]) : null,
            afterValue: b ? String(b.values[Math.floor(i / b.values.BYTES_PER_ELEMENT)]) : null });
        }
        if (!a || !b || changedBytes) {
          changedBufferCount++;
          if (bufferDifferences.length < 96) bufferDifferences.push({ path, changedBytes, samples,
            beforeSha256: a?.record.sha256 ?? null, afterSha256: b?.record.sha256 ?? null });
        }
      }
      return { unchanged: differenceCount === 0 && changedBufferCount === 0,
        differenceCount, differences, differencesTruncated: differenceCount > differences.length,
        changedBufferCount, bufferDifferences, bufferDifferencesTruncated: changedBufferCount > bufferDifferences.length,
        counterDifferenceCount, counterDifferences, counterDifferencesTruncated: counterDifferenceCount > counterDifferences.length };
    };

    // Preserve the original version-bearing record and diagnose its differences.
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
    const frame = async () => {
      C.game.render(0);
      r.getContext().finish();
      return { png: r.domElement.toDataURL('image/png'), state: stableState(), sceneRecord: sceneRecord(), sceneSnapshot: await sceneSnapshot(),
        gradeGrain: P.grade.grain, uniformGrain: P.matComposite.uniforms.uGrain.value,
        draws: r.info.render.calls, triangles: r.info.render.triangles };
    };
    let before, trial, restored, failure = null;
    try {
      before = await frame();
      if (before.uniformGrain !== beforeGrain) throw new Error('original grain is not reaching the shader');
      grade.grain = trialGrain;
      trial = await frame();
    } catch (error) {
      failure = error.stack || error.message || String(error);
    } finally {
      Object.defineProperty(grade, 'grain', originalDescriptor);
      try { restored = await frame(); }
      catch (error) { failure = (failure || '') + '\nrestoration render: ' + (error.stack || error.message); }
    }
    const restoredDescriptor = Object.getOwnPropertyDescriptor(grade, 'grain');
    const descriptorRestored = !!restoredDescriptor &&
      ['value','get','set','writable','enumerable','configurable'].every(key => restoredDescriptor[key] === originalDescriptor[key]);
    const sceneComparisons = before?.sceneSnapshot && trial?.sceneSnapshot && restored?.sceneSnapshot ? {
      beforeTrial: compareScenes(before.sceneSnapshot, trial.sceneSnapshot),
      beforeRestored: compareScenes(before.sceneSnapshot, restored.sceneSnapshot),
    } : null;
    for (const captured of [before, trial, restored]) {
      if (!captured?.sceneSnapshot) continue;
      captured.sceneInvariantRecord = JSON.stringify(captured.sceneSnapshot.record, (_key, value) =>
        typeof value === 'number' && !Number.isFinite(value) ? String(value) : Object.is(value, -0) ? '-0' : value);
      delete captured.sceneSnapshot;
    }
    return { before, trial, restored, sceneComparisons, failure, descriptorRestored,
      gradeObjectRestored: P.grade === grade, stillStopped: !C.engine.running };
}
