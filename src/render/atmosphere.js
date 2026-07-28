/**
 * Atmosphere: sky, lighting, particles.
 *
 * Lighting budget on a phone is brutal, so the strategy is:
 *   - one shadow-casting directional for the hazy daylight
 *   - one hemisphere for sky/ground bounce
 *   - a small pool of point lights reassigned each frame to the nearest active
 *     emitters (fires, work lights, vents, lit windows)
 *   - everything else is emissive geometry read through bloom, which costs
 *     nothing and, in this much fog, is often more convincing than a real light
 *
 * Particles are three systems, all pooled and all recycled around the player:
 * falling ash, rising embers, and gas/smoke plumes anchored to vents.
 */

import * as THREE from 'three';
import { makeSkyMaterial, worldUniforms } from './materials.js';
import { autoExposure } from './postfx.js';
import { emberSprite, smokeAtlas } from './textures.js';
import { clamp, clamp01, lerp, damp, TAU } from '../core/util.js';
import { Rng } from '../core/rng.js';

/**
 * Instanced sprite material with a per-instance alpha attribute.
 *
 * InstancedMesh gives us a per-instance *colour* but no per-instance opacity.
 * Scaling the colour by alpha instead only works for additive blending; for
 * normal-blended smoke it produces black blobs, because the sprite stays fully
 * opaque and merely turns dark. This patch adds the missing channel.
 */
function makeInstancedSpriteMaterial(map, additive, atlas = false) {
  const mat = new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false, fog: false, toneMapped: false,
    side: THREE.DoubleSide,
  });
  if (additive) {
    mat.blending = THREE.AdditiveBlending;
  } else {
    // Premultiplied alpha. The colour is scaled by alpha *in the shader*, so a
    // missing or zero aAlpha produces rgb = 0 AND a = 0 — which under
    // ONE / ONE_MINUS_SRC_ALPHA is a no-op, not a black disc. With straight
    // alpha a broken attribute leaves an opaque, unlit quad: the black-blob
    // failure this whole patch exists to prevent.
    mat.blending = THREE.CustomBlending;
    mat.blendSrc = THREE.OneFactor;
    mat.blendDst = THREE.OneMinusSrcAlphaFactor;
    mat.blendSrcAlpha = THREE.OneFactor;
    mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    mat.blendEquation = THREE.AddEquation;
  }
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlphaCL;'
        + (atlas ? '\nattribute float aCell;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vAlphaCL = aAlpha;');
    // 2x2 sprite atlas: each instance picks one of four silhouettes, so a
    // cloud is not forty copies of the same puff.
    if (atlas) {
      sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>',
        '#include <uv_vertex>\n  vMapUv = vMapUv * 0.5 + vec2(mod(aCell, 2.0) * 0.5, floor(aCell * 0.5) * 0.5);');
    }
    // Injected at <premultiplied_alpha_fragment>, i.e. *before* dithering and
    // before anything else can touch the output. Appending after
    // <dithering_fragment> put the multiply after three.js' own premultiply
    // step, which is the wrong side of the operation that matters.
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAlphaCL;')
      .replace('#include <premultiplied_alpha_fragment>', additive
        ? '  gl_FragColor.a *= vAlphaCL;'
        : '  gl_FragColor.a *= vAlphaCL;\n  gl_FragColor.rgb *= gl_FragColor.a;');
  };
  // Unique per material *instance*. A constant key let two different materials
  // share one compiled program; the aAlpha attribute binding is per-geometry,
  // so whichever material compiled second inherited a program whose attribute
  // layout it had never been validated against.
  const key = `cl-sprite-${additive ? 'add' : 'norm'}${atlas ? '-atlas' : ''}-${mat.id}`;
  mat.customProgramCacheKey = () => key;
  return mat;
}

/** Attach the aAlpha instanced attribute to a mesh's geometry. */
function attachAlpha(mesh, count) {
  const arr = new Float32Array(count).fill(1);
  const attr = new THREE.InstancedBufferAttribute(arr, 1);
  attr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aAlpha', attr);
  mesh.userData.alphaAttr = attr;
  // Which atlas cell each instance draws.
  const cell = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  cell.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aCell', cell);
  mesh.userData.cellAttr = cell;
  assertAlpha(mesh);
  return attr;
}

/**
 * Every mesh drawn with a patched sprite material must carry aAlpha. Without
 * it the attribute reads as garbage and normal-blended smoke turns into opaque
 * blobs. Cheap enough to leave on: it runs once per mesh, at build time.
 */
function assertAlpha(mesh) {
  if (!mesh.geometry.getAttribute('aAlpha')) {
    const msg = `[atmosphere] mesh "${mesh.name || mesh.type}" uses a sprite material with no aAlpha attribute`;
    if (typeof console !== 'undefined') console.error(msg);
    return false;
  }
  return true;
}

/** Point-light presets by marker kind. */
const LIGHT_KINDS = {
  fire:   { color: 0xff7326, intensity: 9.0, distance: 15, flicker: 0.34, height: 0.2 },
  vent:   { color: 0xff5a18, intensity: 6.0, distance: 12, flicker: 0.22, height: 0.3 },
  sodium: { color: 0xffb066, intensity: 12.0, distance: 20, flicker: 0.03, height: 0 },
  work:   { color: 0xfff0d4, intensity: 20.0, distance: 26, flicker: 0.01, height: 0 },
  window: { color: 0xffb877, intensity: 3.2, distance: 8, flicker: 0.02, height: 0 },
  lamp:   { color: 0xffd2a0, intensity: 7.0, distance: 12, flicker: 0.02, height: 0 },
  flare:  { color: 0xff4a2a, intensity: 26.0, distance: 24, flicker: 0.4, height: 0 },
};

export class Atmosphere {
  constructor(scene, tier, camera) {
    this.scene = scene;
    this.tier = tier;
    this.camera = camera;
    this.time = 0;
    this._rng = new Rng('atmos');

    // --- sky --------------------------------------------------------------
    this.skyMat = makeSkyMaterial();
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 14), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    scene.add(this.sky);

    // --- key lighting -----------------------------------------------------
    // The sun is the key and it is warm; the hemisphere is the fill and it is
    // cold. That split is the entire palette: a lit plane reads amber, a
    // shadowed one reads blue-grey, and the difference between them is what
    // gives a frame of grey boxes any shape at all. Running the hemisphere
    // 2.6:1 over the directional — as this did — is a flat ambient wash with a
    // decorative sun bolted on, and nothing in the frame has a light direction.
    // The ambient fill that a smoke ceiling really provides is carried by the
    // height fog instead, which is both cheaper and correctly distance-graded.
    this.hemi = new THREE.HemisphereLight(0x8fabd6, 0x6a5236, 1.3);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xe6cea4, 2.4);
    this.sun.position.set(-30, 92, 34);
    this.sun.castShadow = tier.shadows;
    this.sun.shadow.mapSize.set(tier.shadowSize, tier.shadowSize);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 150;
    this._setShadowExtent(tier.shadowDistance);
    this.sun.shadow.bias = -0.0009;
    this.sun.shadow.normalBias = 0.028;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this._shadowAnchor = new THREE.Vector3(1e9, 0, 0);

    // Warm fill from below — the burn. No shadows, cheap, and it is what makes
    // characters read against the dark street. Deliberately small: the local
    // warmth is the point-light pool's job, not a global tint's.
    this.emberFill = new THREE.DirectionalLight(0xff6a24, 0.18);
    this.emberFill.position.set(10, -30, -14);
    scene.add(this.emberFill);

    // --- dynamic point-light pool ----------------------------------------
    this.pool = [];
    this._poolSize = tier.lightBudget;
    for (let i = 0; i < this._poolSize; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.visible = false;
      l.castShadow = false;
      scene.add(l);
      this.pool.push({ light: l, marker: null, kind: null, phase: this._rng.f() * TAU });
    }
    this.markers = [];
    this._sorted = [];

    // --- particles --------------------------------------------------------
    this.ash = new AshField(scene, tier);
    this.embers = new EmberField(scene, tier);
    this.plumes = new PlumeField(scene, tier);

    // Transient, gameplay-driven emitters (impacts, footfalls, blood, dust).
    this.burst = new BurstField(scene, tier);

    // Auto-exposure. Median luma between a rooftop and the street differs by
    // nearly 3x in this world and one fixed exposure cannot serve both: the
    // street reads as mud and the roof reads as blown paper. Driven off the
    // mood's target key with a fast attack (stopping down when you climb into
    // the light) and a slow release (the eye opens up gradually in the dark),
    // so climbing out of the smoke is a physiological event rather than a cut.
    this.exposureBias = 1;
    this.motionScale = 1;
  }

  _setShadowExtent(dist) {
    const c = this.sun.shadow.camera;
    c.left = -dist; c.right = dist; c.top = dist; c.bottom = -dist;
    c.updateProjectionMatrix();
  }

  setTier(tier) {
    this.tier = tier;
    this.sun.castShadow = tier.shadows;
    this.sun.shadow.mapSize.set(tier.shadowSize, tier.shadowSize);
    this._setShadowExtent(tier.shadowDistance);
    this.ash.setTier(tier);
    this.embers.setTier(tier);
    this.plumes.setTier(tier);
    this.burst.setTier(tier);
    // Grow or shrink the point-light pool.
    while (this.pool.length > tier.lightBudget) {
      const p = this.pool.pop();
      this.scene.remove(p.light);
      p.light.dispose();
    }
    while (this.pool.length < tier.lightBudget) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.visible = false;
      this.scene.add(l);
      this.pool.push({ light: l, marker: null, kind: null, phase: this._rng.f() * TAU });
    }
    this._poolSize = tier.lightBudget;
  }

  /** Register the world's light markers. Called once after the city is built. */
  setMarkers(markers) {
    this.markers = markers.map((m) => ({
      ...m,
      preset: LIGHT_KINDS[m.kind] || LIGHT_KINDS.lamp,
      active: m.active !== false,
      scale: 1,
    }));
  }

  setMarkerActive(id, active) {
    for (const m of this.markers) if (m.id === id) m.active = active;
  }

  /** Register plume/fx anchors from the city. */
  setFx(fx) { this.plumes.setAnchors(fx); }

  /**
   * Environment mood. Interiors, weather beats and story events push these.
   */
  setMood(mood) {
    const M = MOODS[mood] || MOODS.street;
    this._mood = M;
    this._moodName = mood;
  }

  update(dt, playerPos, gasPpm = 0) {
    this.time += dt;
    const M = this._mood || MOODS.street;

    // Ease every environment parameter so transitions between a street and an
    // interior are felt rather than seen as a cut.
    const k = 1.4;
    this.hemi.intensity = damp(this.hemi.intensity, M.hemi, k, dt);
    this.hemi.color.lerp(_c1.setHex(M.hemiSky), 1 - Math.exp(-dt / k));
    this.hemi.groundColor.lerp(_c2.setHex(M.hemiGround), 1 - Math.exp(-dt / k));
    this.sun.intensity = damp(this.sun.intensity, M.sun, k, dt);
    this.sun.color.lerp(_c1.setHex(M.sunColor), 1 - Math.exp(-dt / k));
    this.emberFill.intensity = damp(this.emberFill.intensity, M.emberFill, k, dt);

    worldUniforms.uFogDensity.value = damp(worldUniforms.uFogDensity.value, M.fogDensity * this.tier.fogDensity / 0.042, k, dt);
    worldUniforms.uFogHeight.value = damp(worldUniforms.uFogHeight.value, M.fogHeight, k, dt);
    worldUniforms.uEmberAmount.value = damp(worldUniforms.uEmberAmount.value, M.ember, k, dt);
    worldUniforms.uWetness.value = damp(worldUniforms.uWetness.value, M.wetness ?? 0.3, k, dt);
    worldUniforms.uFogColorLow.value.lerp(_c1.setHex(M.fogLow), 1 - Math.exp(-dt / k));
    worldUniforms.uFogColorHigh.value.lerp(_c2.setHex(M.fogHigh), 1 - Math.exp(-dt / k));
    worldUniforms.uTime.value = this.time;

    // --- auto-exposure ----------------------------------------------------
    // Fast when the target is falling (you have climbed into the light and the
    // iris shuts), slow when it is rising (dark adaptation takes seconds).
    const key = M.key ?? 1;
    const tau = key < this.exposureBias ? 1.2 : 3.0;
    this.exposureBias = damp(this.exposureBias, key, tau, dt);
    autoExposure.value = this.exposureBias;

    this.skyMat.uniforms.uGlowStrength.value = M.skyGlow;
    this.sky.position.copy(this.camera.position);
    this.sky.updateMatrix();
    this.sky.matrixWorldNeedsUpdate = true;

    // Sun/shadow follow: keep the shadow volume centred ahead of the player,
    // and only re-render the map when it has moved far enough to matter.
    this.sun.target.position.set(playerPos.x, playerPos.y, playerPos.z);
    this.sun.position.set(playerPos.x - 30, playerPos.y + 92, playerPos.z + 34);
    this.sun.target.updateMatrixWorld();
    if (this._shadowAnchor.distanceToSquared(playerPos) > 9) {
      this._shadowAnchor.copy(playerPos);
      this.shadowDirty = true;
    }

    this._updateLights(dt, playerPos);
    this.ash.update(dt, playerPos, M, this.motionScale);
    this.embers.update(dt, playerPos, M, this.motionScale);
    this.plumes.update(dt, playerPos, this.camera);
    this.burst.update(dt, this.camera);
  }

  /**
   * Assign the point-light pool to the nearest active markers. Reassignment is
   * hysteretic: a light only changes owner when the new candidate is clearly
   * closer, so lights do not pop as the player walks between two fires.
   */
  _updateLights(dt, playerPos) {
    const range = this.tier.drawDistance * 0.55;
    const cand = this._sorted;
    cand.length = 0;
    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i];
      if (!m.active) continue;
      const dx = m.x - playerPos.x, dy = m.y - playerPos.y, dz = m.z - playerPos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > range * range) continue;
      m._d2 = d2;
      cand.push(m);
    }
    cand.sort((a, b) => a._d2 - b._d2);

    const n = Math.min(this.pool.length, cand.length);
    for (let i = 0; i < this.pool.length; i++) {
      const slot = this.pool[i];
      const m = i < n ? cand[i] : null;
      if (!m) {
        if (slot.light.visible) {
          slot.light.intensity = Math.max(0, slot.light.intensity - dt * 40);
          if (slot.light.intensity <= 0.01) { slot.light.visible = false; slot.marker = null; }
        }
        continue;
      }
      if (slot.marker !== m) {
        slot.marker = m;
        slot.light.position.set(m.x, m.y + m.preset.height, m.z);
        slot.light.color.setHex(m.preset.color);
        slot.light.distance = m.preset.distance;
        slot.light.visible = true;
        slot.light.intensity = 0;
      }
      const p = m.preset;
      // Flicker: two detuned sines plus a slow noise term, so fires never
      // read as a periodic pulse.
      let f = 1;
      if (p.flicker > 0) {
        const t = this.time * 8.4 + slot.phase;
        f = 1 + p.flicker * (Math.sin(t) * 0.5 + Math.sin(t * 2.37 + 1.1) * 0.32 + Math.sin(t * 0.61) * 0.18);
      }
      // Fade in over distance so the pool edge is never visible.
      const dist = Math.sqrt(m._d2);
      const fade = clamp01((range - dist) / (range * 0.28));
      const target = p.intensity * f * fade * (m.scale ?? 1);
      slot.light.intensity = damp(slot.light.intensity, target, 0.09, dt);
    }
  }

  /** Emit a one-shot particle burst. Called by combat, footsteps, breakables. */
  spawnBurst(kind, x, y, z, dirX = 0, dirY = 1, dirZ = 0, count = 8, scale = 1) {
    this.burst.emit(kind, x, y, z, dirX, dirY, dirZ, count, scale);
  }

  dispose() {
    this.ash.dispose(); this.embers.dispose(); this.plumes.dispose(); this.burst.dispose();
    this.sky.geometry.dispose(); this.skyMat.dispose();
  }
}

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

/**
 * Environment moods. These are the game's palette in one table — every place
 * the player can stand resolves to one of these, and the transitions between
 * them carry most of the atmosphere.
 */
export const MOODS = {
  street: {
    hemi: 1.3, hemiSky: 0x86a6d8, hemiGround: 0x62574a,
    sun: 2.7, sunColor: 0xe6cea4, emberFill: 0.16,
    fogDensity: 0.034, fogHeight: 4.6, ember: 0.08,
    fogLow: 0x514c48, fogHigh: 0x2d3746, skyGlow: 0.34,
    wetness: 0.34, key: 1.35,
  },
  // Down in the smoke: the Slip, the trench floor, cellars.
  low: {
    hemi: 0.6, hemiSky: 0x6b7488, hemiGround: 0x60422a,
    sun: 0.35, sunColor: 0xd6b283, emberFill: 0.85,
    fogDensity: 0.13, fogHeight: 7.5, ember: 1.1,
    fogLow: 0x5a4634, fogHigh: 0x3a352e, skyGlow: 0.5,
    ashOpacity: 0.34, emberParticles: 1.7, wetness: 0.16, key: 1.6,
  },
  // Above the smoke: rooftops. The reward for climbing is that you can see.
  high: {
    hemi: 1.5, hemiSky: 0x9dbaea, hemiGround: 0x6e5a40,
    sun: 3.2, sunColor: 0xf2dfb8, emberFill: 0.05,
    fogDensity: 0.02, fogHeight: 3.0, ember: 0.06,
    fogLow: 0x584c40, fogHigh: 0x36415a, skyGlow: 0.26,
    ashOpacity: 0.62, emberParticles: 0.3, wetness: 0.2, key: 0.75,
  },
  // The Authority's ground: work lights, cold fill, swept and lit.
  authority: {
    hemi: 1.2, hemiSky: 0x7d99c6, hemiGround: 0x5e5040,
    sun: 2.0, sunColor: 0xdcd0bc, emberFill: 0.28,
    fogDensity: 0.055, fogHeight: 5.2, ember: 0.20,
    fogLow: 0x4a4740, fogHigh: 0x2b3444, skyGlow: 0.42,
    wetness: 0.46, key: 1.1,
  },
  // Interior: no sky, lamps and windows do the work.
  interior: {
    hemi: 0.5, hemiSky: 0x5e6c8c, hemiGround: 0x4e3e2c,
    sun: 0.3, sunColor: 0xd8c4a0, emberFill: 0.1,
    fogDensity: 0.026, fogHeight: 9.0, ember: 0.1,
    fogLow: 0x3a342c, fogHigh: 0x2a2824, skyGlow: 0.1,
    ashOpacity: 0.06, emberParticles: 0.12, wetness: 0.05, key: 1.5,
  },
  // Underground: the tunnels and the deep cut.
  under: {
    hemi: 0.26, hemiSky: 0x424a5c, hemiGround: 0x543e26,
    sun: 0.0, sunColor: 0x000000, emberFill: 0.95,
    fogDensity: 0.11, fogHeight: 12.0, ember: 1.3,
    fogLow: 0x4e3a26, fogHigh: 0x2c2620, skyGlow: 0.0,
    ashOpacity: 0.0, emberParticles: 1.4, wetness: 0.5, key: 1.8,
  },
};

// ------------------------------------------------------------- ash fall ----

/**
 * Falling ash. Cheap, always on, and the single biggest contributor to the
 * feeling that the air itself is the antagonist.
 */
class AshField {
  constructor(scene, tier) {
    this.scene = scene;
    this.radius = 26;
    this.height = 22;
    this._make(tier);
  }

  _make(tier) {
    const n = Math.round(tier.particleBudget * 0.5);
    this.count = n;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const rng = new Rng('ash');
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rng.sym(this.radius);
      pos[i * 3 + 1] = rng.f() * this.height;
      pos[i * 3 + 2] = rng.sym(this.radius);
      seed[i] = rng.f();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), this.radius * 2);

    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uOrigin: { value: new THREE.Vector3() },
        uRadius: { value: this.radius },
        uHeight: { value: this.height },
        uColor: { value: new THREE.Color(0xbdb3a4) },
        uOpacity: { value: 0.34 },
        uWind: { value: new THREE.Vector2(0.6, 0.3) },
        uScale: { value: 1 },
      },
      vertexShader: `
        attribute float aSeed;
        uniform float uTime, uRadius, uHeight, uScale;
        uniform vec3 uOrigin;
        uniform vec2 uWind;
        varying float vAlpha;
        varying float vSeed;
        void main() {
          vSeed = aSeed;
          // Wrap the flake into a box that follows the player, so a fixed set
          // of points gives the impression of infinite falling ash.
          vec3 p = position;
          float fall = 0.55 + aSeed * 0.9;
          p.y -= uTime * fall;
          p.x += uWind.x * uTime * (0.4 + aSeed * 0.6) + sin(uTime * 0.8 + aSeed * 31.0) * 0.6;
          p.z += uWind.y * uTime * (0.4 + aSeed * 0.6) + cos(uTime * 0.7 + aSeed * 17.0) * 0.6;

          vec3 rel = p - uOrigin;
          rel.x = mod(rel.x + uRadius, uRadius * 2.0) - uRadius;
          rel.z = mod(rel.z + uRadius, uRadius * 2.0) - uRadius;
          rel.y = mod(rel.y, uHeight);
          vec3 world = uOrigin + rel;

          vec4 mv = modelViewMatrix * vec4(world, 1.0);
          float d = -mv.z;
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (1.1 + aSeed * 1.5) * uScale * (26.0 / max(1.0, d));
          // Fade at the edge of the wrap box and very close to the camera.
          float edge = 1.0 - smoothstep(uRadius * 0.55, uRadius * 0.95, length(rel.xz));
          vAlpha = edge * smoothstep(0.6, 3.0, d) * (0.4 + aSeed * 0.6);
        }
      `,
      fragmentShader: `
        precision mediump float;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;
        varying float vSeed;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = dot(c, c);
          if (d > 0.25) discard;
          float a = (1.0 - d * 4.0) * vAlpha * uOpacity;
          gl_FragColor = vec4(uColor * (0.7 + vSeed * 0.5), a);
        }
      `,
    });

    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    this.scene.add(this.points);
  }

  setTier(tier) {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.mat.dispose();
    this._make(tier);
  }

  update(dt, playerPos, mood, scale = 1) {
    this.mat.uniforms.uTime.value += dt;
    this.mat.uniforms.uOrigin.value.set(playerPos.x, playerPos.y - 4, playerPos.z);
    this.mat.uniforms.uOpacity.value = damp(this.mat.uniforms.uOpacity.value,
      (mood.ashOpacity ?? 0.36) * scale, 1.5, dt);
  }

  dispose() { this.scene.remove(this.points); this.points.geometry.dispose(); this.mat.dispose(); }
}

// -------------------------------------------------------------- embers -----

/** Rising embers, denser at low altitude — they come up out of the ground. */
class EmberField {
  constructor(scene, tier) {
    this.scene = scene;
    this.radius = 22;
    this._make(tier);
  }

  _make(tier) {
    const n = Math.round(tier.particleBudget * 0.32);
    this.count = n;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const rng = new Rng('ember');
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rng.sym(this.radius);
      pos[i * 3 + 1] = rng.f() * 14;
      pos[i * 3 + 2] = rng.sym(this.radius);
      seed[i] = rng.f();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), this.radius * 2);

    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uOrigin: { value: new THREE.Vector3() },
        uRadius: { value: this.radius }, uHeight: { value: 14 },
        uIntensity: { value: 1 }, uMap: { value: emberSprite(64) },
      },
      vertexShader: `
        attribute float aSeed;
        uniform float uTime, uRadius, uHeight;
        uniform vec3 uOrigin;
        varying float vAlpha; varying float vSeed;
        void main() {
          vec3 p = position;
          float rise = 0.5 + aSeed * 1.5;
          p.y += uTime * rise;
          p.x += sin(uTime * (0.5 + aSeed) + aSeed * 40.0) * 1.4;
          p.z += cos(uTime * (0.4 + aSeed) + aSeed * 23.0) * 1.4;

          vec3 rel = p - uOrigin;
          rel.x = mod(rel.x + uRadius, uRadius * 2.0) - uRadius;
          rel.z = mod(rel.z + uRadius, uRadius * 2.0) - uRadius;
          float cyc = mod(rel.y, uHeight);
          vec3 world = vec3(uOrigin.x + rel.x, uOrigin.y - 1.0 + cyc, uOrigin.z + rel.z);

          vec4 mv = modelViewMatrix * vec4(world, 1.0);
          float d = -mv.z;
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (2.2 + aSeed * 3.6) * (30.0 / max(1.0, d));
          // Embers die as they climb; that is what makes them read as embers
          // rather than as fireflies.
          float life = 1.0 - cyc / uHeight;
          float edge = 1.0 - smoothstep(uRadius * 0.5, uRadius * 0.92, length(rel.xz));
          float flick = 0.55 + 0.45 * sin(uTime * (7.0 + aSeed * 9.0) + aSeed * 60.0);
          vAlpha = life * life * edge * flick * smoothstep(0.5, 2.5, d);
          vSeed = aSeed;
        }
      `,
      fragmentShader: `
        precision mediump float;
        uniform sampler2D uMap;
        uniform float uIntensity;
        varying float vAlpha; varying float vSeed;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(t.rgb * (1.0 + vSeed * 0.5), t.a * vAlpha * uIntensity);
        }
      `,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 21;
    this.scene.add(this.points);
  }

  setTier(tier) {
    this.scene.remove(this.points);
    this.points.geometry.dispose(); this.mat.dispose();
    this._make(tier);
  }

  update(dt, playerPos, mood, scale = 1) {
    this.mat.uniforms.uTime.value += dt;
    this.mat.uniforms.uOrigin.value.set(playerPos.x, playerPos.y, playerPos.z);
    // Embers thin out as you climb — another reminder of where the fire is.
    const alt = clamp01(1 - (playerPos.y - 1) / 18);
    this.mat.uniforms.uIntensity.value = damp(this.mat.uniforms.uIntensity.value,
      (mood.emberParticles ?? 1) * (0.18 + alt * 0.82) * scale, 1.2, dt);
  }

  dispose() { this.scene.remove(this.points); this.points.geometry.dispose(); this.mat.dispose(); }
}

// -------------------------------------------------------------- plumes -----

/**
 * Smoke/gas columns anchored to vents, manholes and fires. Instanced camera-
 * facing quads, only the nearest N are active.
 */
class PlumeField {
  constructor(scene, tier) {
    this.scene = scene;
    this.anchors = [];
    this._make(tier);
  }

  _make(tier) {
    this.slots = Math.max(8, Math.round(tier.particleBudget / 14));
    this.perSlot = 7;
    const total = this.slots * this.perSlot;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.mat = makeInstancedSpriteMaterial(smokeAtlas(128, 3), false, true);
    this.mesh = new THREE.InstancedMesh(geo, this.mat, total);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 18;
    this.mesh.count = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(total * 3).fill(1), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.alpha = attachAlpha(this.mesh, total);
    this.cell = this.mesh.userData.cellAttr;
    this.scene.add(this.mesh);

    this.state = [];
    const rng = new Rng('plume');
    for (let i = 0; i < total; i++) {
      this.state.push({
        t: rng.f(), speed: rng.range(0.35, 0.75), spin: rng.sym(0.5), off: rng.sym(0.5),
        // +/- 60 per cent scale and +/- 40 per cent opacity per instance, plus
        // one of four silhouettes. Identical puffs at identical opacity are
        // what made this read as bokeh rather than as smoke.
        size: rng.range(0.76, 3.0), op: rng.range(0.6, 1.4), cell: rng.int(0, 3),
      });
    }
  }

  setTier(tier) {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose(); this.mat.dispose();
    this._make(tier);
  }

  setAnchors(list) {
    this.anchors = list.map((a) => ({ ...a, active: a.active !== false }));
  }

  setAnchorActive(id, active) {
    for (const a of this.anchors) if (a.id === id) a.active = active;
  }

  update(dt, playerPos, camera) {
    // Pick the nearest active anchors.
    const cand = [];
    for (const a of this.anchors) {
      if (!a.active) continue;
      const dx = a.x - playerPos.x, dz = a.z - playerPos.z, dy = a.y - playerPos.y;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 62 * 62) continue;
      a._d2 = d2;
      cand.push(a);
    }
    cand.sort((x, y) => x._d2 - y._d2);
    const n = Math.min(this.slots, cand.length);

    let inst = 0;
    for (let s = 0; s < n; s++) {
      const a = cand[s];
      const cfg = PLUME_KINDS[a.kind] || PLUME_KINDS.vent;
      const fade = clamp01((62 - Math.sqrt(a._d2)) / 20);
      for (let p = 0; p < this.perSlot; p++) {
        const st = this.state[s * this.perSlot + p];
        st.t += dt * st.speed * cfg.rate;
        if (st.t > 1) st.t -= 1;
        const t = st.t;
        const y = a.y + t * cfg.rise;
        const spread = cfg.spread * t;
        const px = a.x + st.off * spread + Math.sin(t * 4 + st.spin * 6) * spread * 0.4;
        const pz = a.z + st.spin * spread + Math.cos(t * 3.3 + st.off * 5) * spread * 0.4;
        const scale = cfg.size * st.size * (0.35 + t * 1.5);
        const alpha = Math.sin(t * Math.PI) * cfg.opacity * fade * st.op;
        if (alpha < 0.01) continue;

        // Y-billboard for the column body, plus a clamped pitch term. A pure
        // Y-billboard goes edge-on the moment you look down from a roof, which
        // is why the overview vantages — the ones that exist to show a lake of
        // smoke — contained no smoke at all. Clamping the pitch to +/-40 keeps
        // the column reading as a vertical column rather than flipping into a
        // flat disc when you stand over it.
        const dxc = camera.position.x - px, dzc = camera.position.z - pz;
        const horiz = Math.hypot(dxc, dzc);
        const pitch = clamp(-Math.atan2(camera.position.y - y, Math.max(0.05, horiz)),
                            -PLUME_PITCH, PLUME_PITCH);
        _e.set(pitch, Math.atan2(dxc, dzc), 0, 'YXZ');
        _m.makeRotationFromEuler(_e);
        _m.scale(_v3.set(scale, scale, scale));
        _m.setPosition(px, y, pz);
        this.mesh.setMatrixAt(inst, _m);
        _col.setHex(cfg.color);
        this.mesh.setColorAt(inst, _col);
        this.alpha.array[inst] = alpha;
        this.cell.array[inst] = st.cell;
        inst++;
        if (inst >= this.state.length) break;
      }
      if (inst >= this.state.length) break;
    }
    this.mesh.count = inst;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.alpha.needsUpdate = true;
    this.cell.needsUpdate = true;
  }

  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

/** Maximum pitch a plume card will tilt toward the camera, radians. */
const PLUME_PITCH = 40 * Math.PI / 180;

const PLUME_KINDS = {
  vent:          { rise: 5.5, spread: 1.5, size: 1.5, rate: 0.34, opacity: 0.30, color: 0xa89a80 },
  manholesmoke:  { rise: 3.2, spread: 1.0, size: 1.0, rate: 0.28, opacity: 0.22, color: 0x9c9584 },
  firebarrel:    { rise: 4.2, spread: 0.9, size: 0.9, rate: 0.5,  opacity: 0.26, color: 0x8a7f6c },
  steam:         { rise: 4.8, spread: 1.3, size: 1.3, rate: 0.62, opacity: 0.34, color: 0xc4c0b6 },
  gaspool:       { rise: 1.4, spread: 3.2, size: 2.6, rate: 0.16, opacity: 0.20, color: 0x8e9060 },
};

// -------------------------------------------------------------- bursts -----

/**
 * Transient particle bursts for impacts, footsteps, breakage and blood.
 * Pooled instanced quads with simple ballistic motion.
 */
class BurstField {
  constructor(scene, tier) {
    this.scene = scene;
    this._make(tier);
  }

  _make(tier) {
    this.max = Math.max(48, Math.round(tier.particleBudget * 0.4));
    const geo = new THREE.PlaneGeometry(1, 1);
    this.mat = makeInstancedSpriteMaterial(smokeAtlas(64, 9), false, true);
    this.mesh = new THREE.InstancedMesh(geo, this.mat, this.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3).fill(1), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 22;
    this.mesh.count = 0;
    this.alpha = attachAlpha(this.mesh, this.max);
    this.cell = this.mesh.userData.cellAttr;
    this.scene.add(this.mesh);

    this.parts = [];
    for (let i = 0; i < this.max; i++) {
      this.parts.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 1, color: 0xffffff, grav: 1, drag: 1, add: false });
    }
    this._rng = new Rng('burst');
    // Additive particles (sparks) need their own draw; a second instanced mesh
    // avoids a per-particle blend-mode change.
    this.matAdd = makeInstancedSpriteMaterial(emberSprite(64), true);
    this.meshAdd = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.matAdd, this.max);
    this.meshAdd.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.meshAdd.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3).fill(1), 3);
    this.meshAdd.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.meshAdd.frustumCulled = false;
    this.meshAdd.renderOrder = 23;
    this.meshAdd.count = 0;
    this.alphaAdd = attachAlpha(this.meshAdd, this.max);
    this.cellAdd = this.meshAdd.userData.cellAttr;
    this.scene.add(this.meshAdd);
  }

  setTier(tier) {
    this.scene.remove(this.mesh); this.scene.remove(this.meshAdd);
    this.mesh.geometry.dispose(); this.mat.dispose(); this.matAdd.dispose();
    this._make(tier);
  }

  emit(kind, x, y, z, dx, dy, dz, count, scale = 1) {
    const cfg = BURST_KINDS[kind] || BURST_KINDS.dust;
    const rng = this._rng;
    let spawned = 0;
    for (let i = 0; i < this.parts.length && spawned < count; i++) {
      const p = this.parts[i];
      if (p.alive) continue;
      p.alive = true;
      p.x = x + rng.sym(cfg.jitter);
      p.y = y + rng.sym(cfg.jitter);
      p.z = z + rng.sym(cfg.jitter);
      const spd = cfg.speed * rng.range(0.5, 1.4);
      p.vx = (dx + rng.sym(cfg.spread)) * spd;
      p.vy = (dy + rng.sym(cfg.spread)) * spd + cfg.lift;
      p.vz = (dz + rng.sym(cfg.spread)) * spd;
      p.maxLife = cfg.life * rng.range(0.7, 1.3);
      p.life = p.maxLife;
      p.size = cfg.size * scale * rng.range(0.55, 1.7);
      p.op = rng.range(0.6, 1.4);
      p.cell = rng.int(0, 3);
      p.grow = cfg.grow;
      p.color = Array.isArray(cfg.color) ? cfg.color[rng.int(0, cfg.color.length - 1)] : cfg.color;
      p.grav = cfg.grav;
      p.drag = cfg.drag;
      p.add = !!cfg.additive;
      spawned++;
    }
  }

  update(dt, camera) {
    // Full spherical billboard. Bursts used to be world-XY quads with no
    // rotation at all, so every spark, dust puff and impact hit vanished the
    // moment the camera orbited ninety degrees off the Z axis.
    if (camera) _q.copy(camera.quaternion);
    else _q.identity();
    let n = 0, na = 0;
    for (const p of this.parts) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.vy -= p.grav * 9.8 * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;

      const t = 1 - p.life / p.maxLife;
      const size = p.size * (1 + t * p.grow);
      const alpha = Math.sin((1 - t) * Math.PI * 0.5) * (p.op ?? 1);

      _m.makeRotationFromQuaternion(_q);
      _m.scale(_v3.set(size, size, size));
      _m.setPosition(p.x, p.y, p.z);
      _col.setHex(p.color);
      if (p.add) {
        if (na < this.max) {
          this.meshAdd.setMatrixAt(na, _m); this.meshAdd.setColorAt(na, _col);
          this.alphaAdd.array[na] = alpha; this.cellAdd.array[na] = p.cell ?? 0; na++;
        }
      } else {
        if (n < this.max) {
          this.mesh.setMatrixAt(n, _m); this.mesh.setColorAt(n, _col);
          this.alpha.array[n] = alpha; this.cell.array[n] = p.cell ?? 0; n++;
        }
      }
    }
    this.mesh.count = n;
    this.meshAdd.count = na;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.meshAdd.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.meshAdd.instanceColor.needsUpdate = true;
    this.alpha.needsUpdate = true;
    this.alphaAdd.needsUpdate = true;
    this.cell.needsUpdate = true;
    this.cellAdd.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh); this.scene.remove(this.meshAdd);
    this.mesh.geometry.dispose(); this.mat.dispose(); this.matAdd.dispose();
  }
}

const BURST_KINDS = {
  dust:     { speed: 1.4, spread: 0.7, lift: 0.6, life: 0.75, size: 0.32, grow: 2.2, grav: 0.12, drag: 2.4, jitter: 0.1, color: [0x9a9182, 0x847b6e] },
  step:     { speed: 0.7, spread: 0.5, lift: 0.25, life: 0.5, size: 0.16, grow: 2.0, grav: 0.2, drag: 3.0, jitter: 0.06, color: [0x8e8577, 0xa39a8a] },
  spark:    { speed: 5.5, spread: 0.65, lift: 0.9, life: 0.55, size: 0.09, grow: -0.4, grav: 1.3, drag: 1.1, jitter: 0.04, additive: true, color: [0xffc46a, 0xff8a2e, 0xfff0c8] },
  blood:    { speed: 3.2, spread: 0.55, lift: 0.5, life: 0.6, size: 0.11, grow: 0.4, grav: 1.6, drag: 1.2, jitter: 0.06, color: [0x7a1a12, 0x9c2418] },
  impact:   { speed: 2.6, spread: 0.8, lift: 0.5, life: 0.42, size: 0.24, grow: 2.6, grav: 0.3, drag: 3.4, jitter: 0.08, color: [0xa89c88, 0x8a8072] },
  wood:     { speed: 3.0, spread: 0.7, lift: 0.7, life: 0.7, size: 0.1, grow: 0.2, grav: 1.5, drag: 1.4, jitter: 0.08, color: [0x8a7350, 0x6d5a3e] },
  glass:    { speed: 3.6, spread: 0.8, lift: 0.8, life: 0.8, size: 0.07, grow: 0.0, grav: 1.7, drag: 0.9, jitter: 0.06, additive: true, color: [0xa8c0c8, 0xd8e8ee] },
  gas:      { speed: 0.5, spread: 1.0, lift: 0.35, life: 2.2, size: 0.7, grow: 3.0, grav: -0.02, drag: 1.6, jitter: 0.3, color: [0x8e9060, 0x7c8452] },
  emberpuff:{ speed: 2.0, spread: 0.9, lift: 1.6, life: 1.1, size: 0.2, grow: 1.4, grav: -0.1, drag: 1.8, jitter: 0.12, additive: true, color: [0xff8a3a, 0xffb066] },
  heal:     { speed: 0.9, spread: 0.6, lift: 1.1, life: 1.0, size: 0.14, grow: 0.6, grav: -0.15, drag: 1.5, jitter: 0.16, additive: true, color: [0xcfe04f, 0xa8c060] },
};

const _m = new THREE.Matrix4();
const _v3 = new THREE.Vector3();
const _col = new THREE.Color();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
