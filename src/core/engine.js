/**
 * Engine — renderer ownership, the frame loop, quality tiers and page lifecycle.
 *
 * Simulation runs on a fixed 60 Hz step with an accumulator so that combat
 * timing, stamina drain and AI reaction windows are identical regardless of
 * display refresh rate. Rendering happens once per animation frame at whatever
 * rate the device sustains.
 */

import * as THREE from 'three';
import { Emitter, clamp, damp } from './util.js';

export const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 4;

/**
 * Quality tiers. `scale` multiplies the CSS-pixel backing-store resolution;
 * everything else gates a specific cost centre. The engine starts at a tier
 * guessed from the device and then adapts based on measured frame time.
 */
export const TIERS = {
  low: {
    name: 'low',
    scale: 0.72, maxPixelRatio: 1.5,
    shadows: false, shadowSize: 512, shadowDistance: 22,
    bloom: false, grain: false, ssao: false,
    particleBudget: 190, decalBudget: 26,
    drawDistance: 78, fogDensity: 0.055,
    lightBudget: 5, anisotropy: 1, textureSize: 256,
    npcDetail: 0, reflections: false,
  },
  medium: {
    name: 'medium',
    scale: 0.86, maxPixelRatio: 2,
    shadows: true, shadowSize: 1024, shadowDistance: 48,
    bloom: true, grain: true, ssao: false,
    particleBudget: 420, decalBudget: 48,
    drawDistance: 104, fogDensity: 0.042,
    lightBudget: 8, anisotropy: 2, textureSize: 512,
    npcDetail: 1, reflections: true,
  },
  high: {
    name: 'high',
    scale: 1.0, maxPixelRatio: 2,
    shadows: true, shadowSize: 2048, shadowDistance: 65,
    bloom: true, grain: true, ssao: true,
    particleBudget: 800, decalBudget: 80,
    drawDistance: 145, fogDensity: 0.034,
    lightBudget: 12, anisotropy: 4, textureSize: 512,
    npcDetail: 2, reflections: true,
  },
};

export class Engine extends Emitter {
  constructor(canvas) {
    super();
    this.canvas = canvas;

    /** @type {THREE.WebGLRenderer} */
    this.renderer = null;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.12, 300);

    this.tier = TIERS.medium;
    this.tierLocked = false;

    this.running = false;
    this.paused = false;
    this.pauseReasons = new Set();

    // Timing
    this.clockLast = 0;
    this.accum = 0;
    this.time = 0;          // simulated seconds since boot
    this.frame = 0;
    this.dtRaw = 0;
    this.timeScale = 1;
    this._slowmoUntil = 0;
    this._slowmoScale = 1;

    // Perf telemetry
    this.fps = 60;
    this.frameMs = 16.7;
    this.frameMsSmooth = 16.7;
    this._samples = new Float32Array(120);
    this._sampleI = 0;
    this._adaptCooldown = 3;
    this._perfHistory = [];

    this.size = { w: 1, h: 1, dpr: 1 };
    this.lost = false;

    this._updaters = [];
    this._raf = 0;
    this._boundFrame = this._frame.bind(this);
  }

  // ------------------------------------------------------------------ setup

  init() {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,           // resolved via render scale + post AA instead
        alpha: false,
        depth: true,
        stencil: false,
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: false,
        preserveDrawingBuffer: false,
      });
    } catch (e) {
      throw new Error('WebGL is unavailable on this device or browser.');
    }
    this.renderer = renderer;
    renderer.autoClear = true;
    renderer.setClearColor(0x05_04_03, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;   // driven manually; see requestShadowUpdate
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.info.autoReset = false;

    this.caps = {
      maxTextureSize: renderer.capabilities.maxTextureSize,
      maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
      isWebGL2: renderer.capabilities.isWebGL2,
      floatTextures: renderer.extensions.has('OES_texture_float_linear'),
    };

    this.tier = TIERS[guessTier()];
    this._applyTier();

    // Context loss is common on mobile when the tab is backgrounded under
    // memory pressure. Recover rather than dying.
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      this.addPause('context-lost');
      this.emit('contextlost');
    }, false);
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this._applyTier();
      // shadowMap.autoUpdate is false, so nothing would ever repaint the
      // shadow atlas again after a restore without this.
      if (this.renderer) this.renderer.shadowMap.needsUpdate = true;
      this.emit('contextrestored');
      this.removePause('context-lost');
    }, false);

    this._installLifecycle();
    this.resize();
    return this;
  }

  _applyTier() {
    const t = this.tier;
    const r = this.renderer;
    if (!r) return;
    r.shadowMap.enabled = t.shadows;
    this.camera.far = t.drawDistance;
    this.camera.updateProjectionMatrix();
    this.resize(true);
    this.emit('tier', t);
  }

  setTier(name, lock = true) {
    const t = TIERS[name];
    if (!t || t === this.tier) { if (t) this.tierLocked = lock; return; }
    this.tier = t;
    this.tierLocked = lock;
    this._adaptCooldown = 5;
    this._applyTier();
  }

  // ----------------------------------------------------------------- resize

  resize(force = false) {
    const dprCap = this.tier.maxPixelRatio;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    // visualViewport is the only reliable source on iOS when the URL bar is in
    // a transitional state.
    const vv = window.visualViewport;
    const cssW = Math.max(1, Math.round(vv ? vv.width : window.innerWidth));
    const cssH = Math.max(1, Math.round(vv ? vv.height : window.innerHeight));

    const w = Math.max(2, Math.round(cssW * dpr * this.tier.scale));
    const h = Math.max(2, Math.round(cssH * dpr * this.tier.scale));

    if (!force && w === this.size.w && h === this.size.h && cssW === this.size.cssW) return;

    this.size = { w, h, dpr, cssW, cssH };
    this.renderer.setPixelRatio(1);       // we do the scaling ourselves
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    // The interface overlay has to agree with the canvas about how big the
    // screen is, or every projected reticle is offset by the URL-bar delta.
    const ui = document.getElementById('ui');
    if (ui) { ui.style.width = cssW + 'px'; ui.style.height = cssH + 'px'; }

    this.camera.aspect = cssW / cssH;
    // Widen the vertical FOV on very wide/short viewports so the character and
    // the ground ahead both stay framed.
    const a = this.camera.aspect;
    this.camera.fov = a > 2.0 ? 52 : a > 1.7 ? 55 : 62;
    this.camera.updateProjectionMatrix();

    this.emit('resize', this.size);
  }

  // -------------------------------------------------------------- lifecycle

  _installLifecycle() {
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', () => {
      // iOS reports stale dimensions immediately after the event.
      setTimeout(onResize, 60);
      setTimeout(onResize, 320);
    }, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onResize, { passive: true });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // iOS discards backgrounded tabs aggressively, and `pagehide` is not
        // guaranteed to arrive first. Anything that must be persisted gets its
        // chance here, before the pause.
        this.emit('background', 'hidden');
        this.addPause('hidden');
      } else { this.clockLast = performance.now(); this.removePause('hidden'); }
    });
    window.addEventListener('blur', () => this.addPause('blur'));
    window.addEventListener('focus', () => { this.clockLast = performance.now(); this.removePause('blur'); });
    window.addEventListener('pagehide', () => {
      this.addPause('hidden');
      this.emit('background', 'pagehide');
      this.emit('pagehide');
    });
  }

  addPause(reason) {
    const was = this.pauseReasons.size > 0;
    this.pauseReasons.add(reason);
    if (!was) { this.paused = true; this.emit('pause', reason); }
  }

  removePause(reason) {
    if (!this.pauseReasons.delete(reason)) return;
    if (this.pauseReasons.size === 0) {
      this.paused = false;
      this.clockLast = performance.now();
      this.accum = 0;
      this.emit('resume', reason);
    }
  }

  get isPaused() { return this.pauseReasons.size > 0; }

  // -------------------------------------------------------------- main loop

  /** Register a per-fixed-step updater. Lower `order` runs first. */
  addUpdater(fn, order = 0) {
    this._updaters.push({ fn, order });
    this._updaters.sort((a, b) => a.order - b.order);
    return () => { this._updaters = this._updaters.filter((u) => u.fn !== fn); };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clockLast = performance.now();
    this._raf = requestAnimationFrame(this._boundFrame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  /** Brief global slow-motion — used for finishing blows and near-death. */
  slowmo(scale, seconds) {
    this._slowmoScale = scale;
    this._slowmoUntil = this.time + seconds;
  }

  _frame(now) {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._boundFrame);

    const wall = now - this.clockLast;
    this.clockLast = now;

    // Telemetry uses wall time even while paused so the perf overlay is honest.
    this.frameMs = wall;
    this.frameMsSmooth = damp(this.frameMsSmooth, wall, 0.25, Math.min(0.05, wall / 1000));
    this._samples[this._sampleI++ % this._samples.length] = wall;
    this.fps = 1000 / Math.max(1, this.frameMsSmooth);

    if (this.isPaused || this.lost) { this.emit('renderpaused'); return; }

    // Clamp catch-up so a hitch cannot produce a burst of simulation.
    let dt = Math.min(wall / 1000, 0.25);
    this.dtRaw = dt;

    if (this.time < this._slowmoUntil) this.timeScale = this._slowmoScale;
    else this.timeScale = 1;

    this.accum += dt * this.timeScale;

    let steps = 0;
    while (this.accum >= FIXED_DT && steps < MAX_SUBSTEPS) {
      this.accum -= FIXED_DT;
      this.time += FIXED_DT;
      steps++;
      for (let i = 0; i < this._updaters.length; i++) this._updaters[i].fn(FIXED_DT, this.time);
    }
    if (steps === MAX_SUBSTEPS) this.accum = 0;   // drop the backlog

    // Interpolation factor for smooth rendering between fixed steps.
    this.alpha = this.accum / FIXED_DT;

    this.frame++;
    this.emit('prerender', dt);
    this.emit('render', dt);

    this._adapt(dt);
  }

  /**
   * Adaptive quality. Uses the 90th-percentile frame time over the last ~2
   * seconds rather than the mean, because judder is what players feel.
   */
  _adapt(dt) {
    this._adaptCooldown -= dt;
    if (this.tierLocked || this._adaptCooldown > 0) return;
    if (this._sampleI < this._samples.length) return;

    const s = Array.from(this._samples).sort((a, b) => a - b);
    const p90 = s[Math.floor(s.length * 0.9)];
    const p50 = s[Math.floor(s.length * 0.5)];
    this._perfHistory.push({ t: this.time, p50, p90, tier: this.tier.name });
    if (this._perfHistory.length > 240) this._perfHistory.shift();

    const order = ['low', 'medium', 'high'];
    const idx = order.indexOf(this.tier.name);

    if (p90 > 38 && idx > 0) {
      // Sustained below ~26 fps at the 90th percentile: step down.
      this.tier = TIERS[order[idx - 1]];
      this._adaptCooldown = 6;
      this._applyTier();
      this.emit('autotier', this.tier.name, 'down');
    } else if (p90 < 15 && p50 < 13 && idx < order.length - 1) {
      // Comfortably above 66 fps: try a step up, but be slow to do it.
      this.tier = TIERS[order[idx + 1]];
      this._adaptCooldown = 12;
      this._applyTier();
      this.emit('autotier', this.tier.name, 'up');
    } else {
      this._adaptCooldown = 2.5;
    }
  }

  /** Percentile frame times over the sample window, for the perf report. */
  perfSnapshot() {
    const s = Array.from(this._samples).filter((v) => v > 0).sort((a, b) => a - b);
    if (!s.length) return null;
    const at = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
    return {
      tier: this.tier.name,
      p50: at(0.5), p90: at(0.9), p99: at(0.99),
      fps50: 1000 / at(0.5), fps90: 1000 / at(0.9),
      draws: this.renderer.info.render.calls,
      tris: this.renderer.info.render.triangles,
      programs: this.renderer.info.programs ? this.renderer.info.programs.length : 0,
      textures: this.renderer.info.memory.textures,
      geometries: this.renderer.info.memory.geometries,
      res: `${this.size.w}x${this.size.h}`,
      css: `${this.size.cssW}x${this.size.cssH}`,
      dpr: this.size.dpr,
    };
  }

  dispose() {
    this.stop();
    this.renderer?.dispose();
  }
}

/**
 * Initial tier guess. Deliberately conservative: it is far better to start at
 * medium and adapt up after two seconds than to start at high and stutter
 * through the opening scene, which is the player's first impression.
 */
export function guessTier() {
  const mem = navigator.deviceMemory || 0;
  const cores = navigator.hardwareConcurrency || 0;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const mobile = isIOS || isAndroid || /Mobi/.test(ua);

  if (!mobile) {
    // Desktop: cores is a reasonable proxy and the display is larger.
    return cores >= 8 ? 'high' : 'medium';
  }
  // Small-viewport phones do less work per frame; a 375pt-wide device at
  // medium is comfortably cheaper than a tablet at medium.
  const shortSide = Math.min(window.innerWidth, window.innerHeight);
  if (mem && mem <= 3) return 'low';
  if (cores && cores <= 4 && shortSide > 400) return 'low';
  return 'medium';
}

/** True when the viewport is portrait enough that the game should nag. */
export function isPortrait() {
  const vv = window.visualViewport;
  const w = vv ? vv.width : window.innerWidth;
  const h = vv ? vv.height : window.innerHeight;
  return h > w * 1.02;
}

export { THREE };
