/**
 * Post-processing.
 *
 * A purpose-built chain rather than a generic composer, because on an SE-class
 * device every fullscreen pass is expensive and a generic stack spends most of
 * its budget on passes this art direction does not need.
 *
 *   scene (HDR) -> bright extract (1/4) -> blur H -> blur V -> [1/8 wide blur]
 *               -> composite: bloom + ACES + grade + vignette + grain + CA
 *
 * On the low tier the bloom chain is skipped entirely and the composite becomes
 * a single cheap grade+tonemap pass, which is still worth having: it is what
 * keeps the blacks warm instead of crushed.
 */

import * as THREE from 'three';

/**
 * Auto-exposure, written by Atmosphere.update() and read here.
 *
 * A plain shared cell rather than a wire through game.js, because game.js
 * already owns `grade.exposure` (the artistic stop) and this is the automatic
 * one on top of it. They multiply.
 */
export const autoExposure = { value: 1 };

const TRI_VS = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** Fullscreen triangle — one primitive, no wasted fragments at the corners. */
function fullscreenGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  return g;
}

export class PostFX {
  constructor(renderer, tier) {
    this.renderer = renderer;
    this.tier = tier;
    this.enabled = true;

    this.geo = fullscreenGeometry();
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(this.geo, null);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    // Half-float gives correct HDR bloom on the ember highlights. Not every
    // mobile GL context can render to it, so probe and degrade honestly.
    this.hdr = this._probeHalfFloat();

    this.grade = {
      exposure: 1.05,
      // Contrast now has real work to do: the lift no longer flattens the
      // bottom of the range, so the curve has somewhere to separate into.
      contrast: 1.26,
      pivot: 0.38,
      saturation: 1.06,
      // LINEAR-SPACE grade, applied BEFORE the tonemap.
      //
      // This used to be a display-space lerp — col = lift + col*(gain-lift) —
      // run after the sRGB encode. A lift of 0x161210 puts the black floor at
      // 0.086 of the display range and a contrast of 1.04 never gets it back,
      // which is how street frames ended up with an interquartile luma spread
      // of twelve levels out of 255. Expressed in linear and fed through ACES,
      // the same warmth costs about four display levels instead of twenty-two,
      // and the tonemap gets to do its job on a signal that still has a toe.
      offset: new THREE.Color(0.0040, 0.0028, 0.0018),
      gain: new THREE.Color(1.020, 1.000, 0.958),
      bloomStrength: 0.62,
      bloomThreshold: 0.78,
      bloomKnee: 0.42,
      vignette: 0.40,
      grain: 0.035,
      aberration: 0.0016,
      // Pushed by gameplay: rises when the player is saturating with CO.
      hypoxia: 0.0,
      // Pushed by combat: brief white/red flash on impact.
      flash: 0.0,
      flashColor: new THREE.Color(0xffffff),
    };

    this._makeTargets(2, 2);
    this._makeMaterials();
  }

  _probeHalfFloat() {
    const gl = this.renderer.getContext();
    const isWebGL2 = this.renderer.capabilities.isWebGL2;
    if (isWebGL2) {
      // EXT_color_buffer_half_float / EXT_color_buffer_float
      if (this.renderer.extensions.has('EXT_color_buffer_half_float') ||
          this.renderer.extensions.has('EXT_color_buffer_float')) return true;
      return false;
    }
    return this.renderer.extensions.has('OES_texture_half_float') &&
           this.renderer.extensions.has('EXT_color_buffer_half_float');
  }

  _makeTargets(w, h) {
    const type = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const opts = {
      type,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
      colorSpace: THREE.NoColorSpace,
    };
    this.sceneRT?.dispose();
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, opts);

    const b = { ...opts, depthBuffer: false };
    const w4 = Math.max(2, w >> 2), h4 = Math.max(2, h >> 2);
    const w8 = Math.max(2, w >> 3), h8 = Math.max(2, h >> 3);
    for (const k of ['bloomA', 'bloomB', 'bloomC', 'bloomD']) this[k]?.dispose();
    this.bloomA = new THREE.WebGLRenderTarget(w4, h4, b);
    this.bloomB = new THREE.WebGLRenderTarget(w4, h4, b);
    this.bloomC = new THREE.WebGLRenderTarget(w8, h8, b);
    this.bloomD = new THREE.WebGLRenderTarget(w8, h8, b);
    this._size = { w, h };
  }

  setSize(w, h) {
    if (this._size && this._size.w === w && this._size.h === h) return;
    this._makeTargets(w, h);
    if (this.matComposite) {
      this.matComposite.uniforms.uTexel.value.set(1 / w, 1 / h);
      this.matComposite.uniforms.uRes.value.set(w, h);
    }
    if (this.matBlur) this.matBlur.uniforms.uTexel.value.set(1 / (w >> 2), 1 / (h >> 2));
  }

  _makeMaterials() {
    this.matBright = new THREE.RawShaderMaterial({
      glslVersion: null,
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: 0.8 },
        uKnee: { value: 0.4 },
      },
      vertexShader: `
        attribute vec3 position; attribute vec2 uv;
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform float uThreshold, uKnee;
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float l = max(c.r, max(c.g, c.b));
          // Soft knee so bright areas ramp in rather than popping.
          float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
          soft = soft * soft / (4.0 * uKnee + 1e-4);
          float w = max(soft, l - uThreshold) / max(l, 1e-4);
          gl_FragColor = vec4(c * w, 1.0);
        }
      `,
      depthTest: false, depthWrite: false,
    });

    this.matBlur = new THREE.RawShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uTexel: { value: new THREE.Vector2(1 / 256, 1 / 256) },
        uDir: { value: new THREE.Vector2(1, 0) },
      },
      vertexShader: `
        attribute vec3 position; attribute vec2 uv;
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform vec2 uTexel, uDir;
        void main() {
          // 9-tap gaussian collapsed to 5 bilinear fetches.
          vec2 o1 = uDir * uTexel * 1.3846153846;
          vec2 o2 = uDir * uTexel * 3.2307692308;
          vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
          c += texture2D(tDiffuse, vUv + o1).rgb * 0.3162162162;
          c += texture2D(tDiffuse, vUv - o1).rgb * 0.3162162162;
          c += texture2D(tDiffuse, vUv + o2).rgb * 0.0702702703;
          c += texture2D(tDiffuse, vUv - o2).rgb * 0.0702702703;
          gl_FragColor = vec4(c, 1.0);
        }
      `,
      depthTest: false, depthWrite: false,
    });

    this.matDown = new THREE.RawShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: `
        attribute vec3 position; attribute vec2 uv;
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform vec2 uTexel;
        void main() {
          vec3 c = texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
          c += texture2D(tDiffuse, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
          c += texture2D(tDiffuse, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
          c += texture2D(tDiffuse, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
          gl_FragColor = vec4(c * 0.25, 1.0);
        }
      `,
      depthTest: false, depthWrite: false,
    });

    this.matComposite = new THREE.RawShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tBloom: { value: null },
        tBloomWide: { value: null },
        uBloom: { value: 0.6 },
        uExposure: { value: 1.0 },
        uContrast: { value: 1.18 },
        uPivot: { value: 0.38 },
        uSaturation: { value: 1.0 },
        uOffset: { value: new THREE.Color(0.004, 0.0028, 0.0018) },
        uGain: { value: new THREE.Color(1.02, 1.0, 0.958) },
        uVignette: { value: 0.45 },
        uGrain: { value: 0.035 },
        uAberration: { value: 0.0016 },
        uHypoxia: { value: 0.0 },
        uFlash: { value: 0.0 },
        uFlashColor: { value: new THREE.Color(0xffffff) },
        uTime: { value: 0 },
        uTexel: { value: new THREE.Vector2() },
        uRes: { value: new THREE.Vector2() },
        uHasBloom: { value: 1 },
      },
      vertexShader: `
        attribute vec3 position; attribute vec2 uv;
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse, tBloom, tBloomWide;
        uniform float uBloom, uExposure, uContrast, uPivot, uSaturation, uVignette,
                      uGrain, uAberration, uHypoxia, uFlash, uTime, uHasBloom;
        uniform vec3 uOffset, uGain, uFlashColor;
        uniform vec2 uTexel, uRes;

        // ACES filmic approximation (Narkowicz). Cheap and holds the warm
        // highlights without turning embers into white blobs. Output is
        // display-referred but still LINEAR — the OETF below is not optional.
        vec3 aces(vec3 x) {
          const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
          return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
        }

        // Linear -> sRGB. The scene renders to a linear HDR target and this
        // pass owns the whole display transform, so the encode happens here.
        vec3 encodeSRGB(vec3 c) {
          c = max(c, vec3(0.0));
          vec3 lo = c * 12.92;
          vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
          return mix(lo, hi, step(vec3(0.0031308), c));
        }

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

        void main() {
          vec2 uv = vUv;
          vec2 fromCenter = uv - 0.5;
          float r2 = dot(fromCenter, fromCenter);

          // Lateral chromatic aberration, strictly radial, strongest at the
          // corners. Small enough to read as lens character, not as a filter.
          vec3 col;
          if (uAberration > 0.0) {
            vec2 off = fromCenter * uAberration * (0.35 + r2 * 2.2);
            col.r = texture2D(tDiffuse, uv + off).r;
            col.g = texture2D(tDiffuse, uv).g;
            col.b = texture2D(tDiffuse, uv - off).b;
          } else {
            col = texture2D(tDiffuse, uv).rgb;
          }

          if (uHasBloom > 0.5) {
            vec3 b1 = texture2D(tBloom, uv).rgb;
            vec3 b2 = texture2D(tBloomWide, uv).rgb;
            col += (b1 * 0.62 + b2 * 0.38) * uBloom;
          }

          // ---- LINEAR grade, before the tonemap --------------------------
          // Exposure, then a gain (a warm white balance with unit luma, so it
          // tints without brightening) and a very small linear offset. Doing
          // this here means ACES compresses the result rather than being handed
          // an already-flattened signal.
          col *= uExposure;
          col = col * uGain + uOffset;

          col = aces(col);
          col = encodeSRGB(col);

          // ---- display-space contrast ------------------------------------
          // Pivot below mid-grey; Hollis is a dark game and pivoting at 0.5
          // crushes too much.
          col = clamp((col - uPivot) * uContrast + uPivot, 0.0, 1.0);

          float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(luma), col, uSaturation);

          // Hypoxia: carbon monoxide desaturates the periphery and pulls the
          // edges of vision toward a sick yellow-grey before it takes you.
          if (uHypoxia > 0.001) {
            float edge = smoothstep(0.04, 0.24, r2) * uHypoxia;
            vec3 sick = mix(vec3(luma), vec3(luma * 0.9 + 0.06, luma * 0.88 + 0.05, luma * 0.6), 0.75);
            col = mix(col, sick, edge);
            // Slow pulse, tied to a heartbeat that is working too hard.
            col *= 1.0 - uHypoxia * 0.16 * (0.5 + 0.5 * sin(uTime * 5.4));
          }

          // Vignette
          col *= 1.0 - uVignette * smoothstep(0.06, 0.62, r2);

          if (uFlash > 0.001) col = mix(col, uFlashColor, uFlash);

          // Film grain, scaled down in bright areas the way real grain behaves.
          if (uGrain > 0.0) {
            float g = hash(gl_FragCoord.xy + fract(uTime) * 431.0) - 0.5;
            col += g * uGrain * (1.25 - luma);
          }

          // Ordered dither to stop banding across the fog gradients.
          float d = hash(gl_FragCoord.xy * 0.31) - 0.5;
          col += d * (1.0 / 255.0);

          gl_FragColor = vec4(max(vec3(0.0), col), 1.0);
        }
      `,
      depthTest: false, depthWrite: false,
    });
  }

  /**
   * Render the scene through the chain to the default framebuffer.
   */
  render(scene, camera, time) {
    const r = this.renderer;
    const g = this.grade;

    if (!this.enabled) {
      r.setRenderTarget(null);
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.render(scene, camera);
      return;
    }

    // Scene renders linear (no tonemap, no sRGB encode) into the HDR target;
    // the composite pass owns tonemapping and encoding.
    const prevTone = r.toneMapping;
    const prevCS = r.outputColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.outputColorSpace = THREE.LinearSRGBColorSpace;

    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);

    const doBloom = this.tier.bloom && this.hdr;
    if (doBloom) {
      // bright -> A
      this._blit(this.matBright, this.sceneRT.texture, this.bloomA, {
        uThreshold: g.bloomThreshold, uKnee: g.bloomKnee,
      });
      // blur A -> B (H), B -> A (V)
      const t4 = new THREE.Vector2(1 / this.bloomA.width, 1 / this.bloomA.height);
      this.matBlur.uniforms.uTexel.value.copy(t4);
      this.matBlur.uniforms.uDir.value.set(1, 0);
      this._blit(this.matBlur, this.bloomA.texture, this.bloomB);
      this.matBlur.uniforms.uDir.value.set(0, 1);
      this._blit(this.matBlur, this.bloomB.texture, this.bloomA);

      // downsample to 1/8 and blur again for the wide, soft halo
      this.matDown.uniforms.uTexel.value.copy(t4);
      this._blit(this.matDown, this.bloomA.texture, this.bloomC);
      const t8 = new THREE.Vector2(1 / this.bloomC.width, 1 / this.bloomC.height);
      this.matBlur.uniforms.uTexel.value.copy(t8);
      this.matBlur.uniforms.uDir.value.set(1, 0);
      this._blit(this.matBlur, this.bloomC.texture, this.bloomD);
      this.matBlur.uniforms.uDir.value.set(0, 1);
      this._blit(this.matBlur, this.bloomD.texture, this.bloomC);
    }

    const u = this.matComposite.uniforms;
    u.tDiffuse.value = this.sceneRT.texture;
    u.tBloom.value = doBloom ? this.bloomA.texture : null;
    u.tBloomWide.value = doBloom ? this.bloomC.texture : null;
    u.uHasBloom.value = doBloom ? 1 : 0;
    u.uBloom.value = g.bloomStrength;
    u.uExposure.value = g.exposure * autoExposure.value;
    u.uContrast.value = g.contrast;
    u.uPivot.value = g.pivot;
    u.uSaturation.value = g.saturation;
    u.uOffset.value.copy(g.offset);
    u.uGain.value.copy(g.gain);
    u.uVignette.value = g.vignette;
    u.uGrain.value = this.tier.grain ? g.grain : 0;
    u.uAberration.value = this.tier.bloom ? g.aberration : 0;
    u.uHypoxia.value = g.hypoxia;
    u.uFlash.value = g.flash;
    u.uFlashColor.value.copy(g.flashColor);
    u.uTime.value = time;

    r.setRenderTarget(null);
    this.quad.material = this.matComposite;
    r.render(this.quadScene, this.quadCam);

    r.toneMapping = prevTone;
    r.outputColorSpace = prevCS;
  }

  _blit(mat, srcTex, dst, uniforms) {
    mat.uniforms.tDiffuse.value = srcTex;
    if (uniforms) for (const k in uniforms) mat.uniforms[k].value = uniforms[k];
    this.quad.material = mat;
    this.renderer.setRenderTarget(dst);
    this.renderer.clear();
    this.renderer.render(this.quadScene, this.quadCam);
  }

  setTier(tier) { this.tier = tier; }

  dispose() {
    for (const k of ['sceneRT', 'bloomA', 'bloomB', 'bloomC', 'bloomD']) this[k]?.dispose();
    for (const k of ['matBright', 'matBlur', 'matDown', 'matComposite']) this[k]?.dispose();
    this.geo.dispose();
  }
}
