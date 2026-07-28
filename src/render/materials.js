/**
 * Material library.
 *
 * Two things make Hollis look like one place rather than a pile of meshes:
 *
 *  1. Every world material shares a single patched shader that replaces
 *     three.js' distance fog with *analytic height fog*. Smoke from the burn
 *     is heaviest at street level and thins as you climb, so the fog literally
 *     encodes the game's central rule — the low ground is the dangerous ground.
 *     Standing on a roof, you look down into a lake of smoke.
 *
 *  2. A small, fixed palette. Materials are created once and shared; meshes
 *     vary through UV scale, vertex colour and instance colour rather than
 *     through new materials, which keeps draw calls and shader programs low.
 */

import * as THREE from 'three';
import { surface, configureTextures } from './textures.js';

/** Shared uniforms mutated once per frame by the renderer. */
export const worldUniforms = {
  uFogColorLow:  { value: new THREE.Color(0x4a4038) },
  uFogColorHigh: { value: new THREE.Color(0x2a2e33) },
  uFogDensity:   { value: 0.042 },
  uFogHeight:    { value: 4.5 },     // 1/e falloff height in metres
  uFogBase:      { value: -2.0 },    // world Y where density is uFogDensity
  uEmberColor:   { value: new THREE.Color(0xff7a30) },
  uEmberAmount:  { value: 0.55 },    // warm bounce from the burn below
  uTime:         { value: 0 },
  uWindDir:      { value: new THREE.Vector2(0.7, 0.7) },
  uWetness:      { value: 0.0 },
};

const patched = new Set();

/**
 * Injects height fog + ember bounce into any standard/physical material.
 * Called on every world material exactly once.
 */
export function patchWorldMaterial(mat) {
  if (patched.has(mat) || mat.userData.__patched) return mat;
  mat.userData.__patched = true;
  patched.add(mat);

  mat.fog = false;   // we replace it entirely

  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    if (prev) prev(shader);
    Object.assign(shader.uniforms, worldUniforms);
    mat.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWorldPosCL;
      `)
      .replace('#include <fog_vertex>', `
        vWorldPosCL = (modelMatrix * vec4(transformed, 1.0)).xyz;
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWorldPosCL;
        uniform vec3  uFogColorLow;
        uniform vec3  uFogColorHigh;
        uniform float uFogDensity;
        uniform float uFogHeight;
        uniform float uFogBase;
        uniform vec3  uEmberColor;
        uniform float uEmberAmount;
        uniform float uTime;

        // Analytic integral of an exponential height-density field along a ray.
        // Gives correct, stable fog with no per-step marching.
        float heightFog(vec3 camPos, vec3 worldPos) {
          vec3  d  = worldPos - camPos;
          float L  = length(d);
          if (L < 0.0001) return 0.0;
          float k  = 1.0 / max(0.05, uFogHeight);
          float y0 = camPos.y - uFogBase;
          float y1 = worldPos.y - uFogBase;
          float dy = y1 - y0;
          float f;
          if (abs(dy) < 0.02) {
            f = uFogDensity * L * exp(-k * y0);
          } else {
            f = uFogDensity * L * (exp(-k * y0) - exp(-k * y1)) / (k * dy);
          }
          return 1.0 - exp(-max(0.0, f));
        }
      `)
      .replace('#include <fog_fragment>', `
        {
          // Ember bounce: the burn under the streets throws warm light up onto
          // everything low. Modulated by the surface's own albedo and by how
          // much of the surface faces downward, so it behaves like real bounce
          // light instead of a red wash over the whole frame.
          float bounce = uEmberAmount * exp(-max(0.0, vWorldPosCL.y - uFogBase) * 0.17);
          float facing = 0.42 - 0.38 * clamp(normal.y, -1.0, 1.0);
          gl_FragColor.rgb += uEmberColor * diffuseColor.rgb * bounce * facing;

          float fogAmt = heightFog(cameraPosition, vWorldPosCL);

          // Fog is warm and dirty near the ground, cold and blue up high.
          float hMix = clamp((vWorldPosCL.y - uFogBase) / 30.0, 0.0, 1.0);
          vec3 fogCol = mix(uFogColorLow, uFogColorHigh, hMix * hMix);
          // The smoke itself is lit by the burn, so the low fog carries a warm
          // core. This is what makes street level glow rather than just grey out.
          fogCol += uEmberColor * uEmberAmount * 0.16 * (1.0 - hMix);

          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, fogAmt);
        }
      `);
  };
  mat.customProgramCacheKey = () => 'cl-worldfog';
  return mat;
}

/**
 * Skybox / distant-smoke shader. Renders the smoke dome, the diffuse glow of
 * fires beyond the district edge, and the dim daylight fighting through.
 */
export function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: worldUniforms.uTime,
      uHorizon: { value: new THREE.Color(0x9a8a72) },
      uZenith: { value: new THREE.Color(0x39414a) },
      uGlow: { value: new THREE.Color(0xff8a3a) },
      uGlowDir: { value: new THREE.Vector3(0.4, -0.05, -0.9).normalize() },
      uGlowStrength: { value: 0.34 },
      uSunDir: { value: new THREE.Vector3(-0.3, 0.42, 0.6).normalize() },
      uSunColor: { value: new THREE.Color(0xd8bc90) },
      uSunStrength: { value: 0.42 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w;   // always at the far plane
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform float uTime;
      uniform vec3 uHorizon, uZenith, uGlow, uGlowDir, uSunDir, uSunColor;
      uniform float uGlowStrength, uSunStrength;

      // Cheap hash noise for smoke banding.
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){
        vec2 i = floor(p), f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y);
      }
      float fbm(vec2 p){
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { s += n2(p) * a; p *= 2.03; a *= 0.5; }
        return s;
      }

      void main() {
        vec3 d = normalize(vDir);
        float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);

        // Base gradient, biased so the horizon band is thick and hazy.
        float t = pow(clamp(d.y * 1.35 + 0.16, 0.0, 1.0), 0.62);
        vec3 col = mix(uHorizon, uZenith, t);

        // Rolling smoke layers, slower and larger the higher you look.
        vec2 uv = vec2(atan(d.z, d.x) * 1.35, d.y * 2.6);
        float smoke = fbm(uv * 1.6 + vec2(uTime * 0.011, uTime * 0.004));
        float smoke2 = fbm(uv * 3.4 - vec2(uTime * 0.019, 0.0));
        float band = smoothstep(0.32, 0.95, smoke * 0.66 + smoke2 * 0.34);
        col = mix(col, uHorizon * 1.22, band * (1.0 - t) * 0.85);
        col *= 0.86 + 0.28 * smoke2;

        // The burn: a tight, soft glow low on one side of the sky. This is the
        // single strongest read of "something enormous is on fire over there".
        // Kept narrow and localised — a whole red sky would look like a filter,
        // a bright wound on one horizon looks like a place.
        float g = max(0.0, dot(d, normalize(uGlowDir)));
        float glow = pow(g, 9.0) * uGlowStrength;
        // Confine it to the low sky; the column does not reach the zenith.
        glow *= smoothstep(0.30, -0.10, d.y);
        glow *= 0.84 + 0.16 * sin(uTime * 0.31 + smoke * 6.0);   // slow breathing
        // Warm-white core, orange falloff — a real fire glow is not monochrome.
        col += mix(uGlow, vec3(1.0, 0.86, 0.66), pow(g, 26.0)) * glow;

        // Sun disc, heavily attenuated by particulate. Never a clean disc.
        float s = max(0.0, dot(d, normalize(uSunDir)));
        col += uSunColor * pow(s, 220.0) * uSunStrength * 1.6;
        col += uSunColor * pow(s, 7.0) * uSunStrength * 0.28;

        // Dither to kill banding in the large smooth gradients.
        float dith = (h(gl_FragCoord.xy * 0.7) - 0.5) * (1.5 / 255.0);
        gl_FragColor = vec4(max(vec3(0.0), col + dith), 1.0);
      }
    `,
  });
}

// --------------------------------------------------------------- library ---

export class MaterialLibrary {
  constructor(tier) {
    this.tier = tier;
    this.mats = new Map();
    configureTextures(tier.textureSize, tier.anisotropy);
  }

  /**
   * Get a shared world material.
   * @param {string} kind surface generator name
   * @param {object} opts { seed, repeat:[u,v], rough, metal, color, seedVariant }
   */
  get(kind, opts = {}) {
    const {
      seed = 1, repeat = [1, 1], roughness = 1, metalness = 0,
      color = 0xffffff, normalScale = 1, side = THREE.FrontSide,
      transparent = false, opacity = 1, vertexColors = true, emissive = 0x000000,
      emissiveIntensity = 0,
    } = opts;
    const key = `${kind}|${seed}|${repeat}|${roughness}|${metalness}|${color}|${normalScale}|${side}|${transparent}|${opacity}|${vertexColors}|${emissive}`;
    if (this.mats.has(key)) return this.mats.get(key);

    const s = surface(kind, seed);
    // Textures are shared across repeats via clones (cheap: same GPU image).
    const map = s.map.clone(); map.needsUpdate = false;
    const nrm = s.normalMap.clone(); nrm.needsUpdate = false;
    const orm = s.ormMap.clone(); orm.needsUpdate = false;
    for (const t of [map, nrm, orm]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
    }

    const mat = new THREE.MeshStandardMaterial({
      map, normalMap: nrm,
      roughnessMap: orm, aoMap: orm,
      color, roughness, metalness,
      normalScale: new THREE.Vector2(normalScale, normalScale),
      side, transparent, opacity,
      vertexColors,
      emissive, emissiveIntensity,
      dithering: true,
    });
    patchWorldMaterial(mat);
    this.mats.set(key, mat);
    return mat;
  }

  /** Flat coloured material (painted steel, plastics, cloth blocks). */
  flat(color, opts = {}) {
    const { roughness = 0.82, metalness = 0.0, vertexColors = true, side = THREE.FrontSide,
            transparent = false, opacity = 1, emissive = 0x000000, emissiveIntensity = 0 } = opts;
    const key = `flat|${color}|${roughness}|${metalness}|${vertexColors}|${side}|${transparent}|${opacity}|${emissive}|${emissiveIntensity}`;
    if (this.mats.has(key)) return this.mats.get(key);
    const mat = new THREE.MeshStandardMaterial({
      color, roughness, metalness, vertexColors, side, transparent, opacity,
      emissive, emissiveIntensity, dithering: true,
    });
    patchWorldMaterial(mat);
    this.mats.set(key, mat);
    return mat;
  }

  /**
   * Self-lit material for lamps, screens, hot metal and ember cracks. These do
   * not receive fog tinting the same way — they punch through it, which is what
   * makes a distant work-light read as a landmark.
   */
  glow(color, intensity = 2.4, opts = {}) {
    const key = `glow|${color}|${intensity}|${JSON.stringify(opts)}`;
    if (this.mats.has(key)) return this.mats.get(key);
    const mat = new THREE.MeshBasicMaterial({
      color,
      toneMapped: false,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
      depthWrite: opts.depthWrite ?? true,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: false,
    });
    mat.color.multiplyScalar(intensity);
    this.mats.set(key, mat);
    return mat;
  }

  /** Unlit, additive card for light shafts, gas plumes and heat shimmer. */
  volumetric(color, opacity = 0.14) {
    const key = `vol|${color}|${opacity}`;
    if (this.mats.has(key)) return this.mats.get(key);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
    });
    this.mats.set(key, mat);
    return mat;
  }

  /**
   * Character skin / cloth / gear, tuned for the low-key ember lighting.
   * Cloth grain comes from a shared high-repeat texture; colour comes from
   * vertex attributes, so the entire cast shares one material and one program.
   */
  character(color, opts = {}) {
    const {
      roughness = 0.86, metalness = 0.02, emissive = 0x000000,
      emissiveIntensity = 0, textured = true, repeat = 5,
    } = opts;
    const key = `char|${color}|${roughness}|${metalness}|${emissive}|${emissiveIntensity}|${textured}|${repeat}|${!!opts.flat}`;
    if (this.mats.has(key)) return this.mats.get(key);

    let map = null, nrm = null, orm = null;
    if (textured) {
      const s = surface('charcloth', 2, Math.min(256, this.tier.textureSize));
      map = s.map.clone(); nrm = s.normalMap.clone(); orm = s.ormMap.clone();
      for (const t of [map, nrm, orm]) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeat, repeat * 1.6);
        t.needsUpdate = false;
      }
    }

    const mat = new THREE.MeshStandardMaterial({
      color, roughness, metalness,
      map, normalMap: nrm, roughnessMap: orm,
      normalScale: new THREE.Vector2(0.55, 0.55),
      emissive, emissiveIntensity,
      vertexColors: true,
      dithering: true,
      flatShading: !!opts.flat,
    });
    patchWorldMaterial(mat);
    this.mats.set(key, mat);
    return mat;
  }

  dispose() {
    for (const m of this.mats.values()) {
      if (m.map) m.map.dispose();
      if (m.normalMap) m.normalMap.dispose();
      if (m.roughnessMap) m.roughnessMap.dispose();
      m.dispose();
    }
    this.mats.clear();
    patched.clear();
  }

  get count() { return this.mats.size; }
}

/** Update per-frame shared uniforms. */
export function updateWorldUniforms(t, opts = {}) {
  worldUniforms.uTime.value = t;
  if (opts.fogDensity !== undefined) worldUniforms.uFogDensity.value = opts.fogDensity;
  if (opts.fogHeight !== undefined) worldUniforms.uFogHeight.value = opts.fogHeight;
  if (opts.fogBase !== undefined) worldUniforms.uFogBase.value = opts.fogBase;
  if (opts.emberAmount !== undefined) worldUniforms.uEmberAmount.value = opts.emberAmount;
  if (opts.fogLow) worldUniforms.uFogColorLow.value.copy(opts.fogLow);
  if (opts.fogHigh) worldUniforms.uFogColorHigh.value.copy(opts.fogHigh);
}
