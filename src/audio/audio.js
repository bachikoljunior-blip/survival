/**
 * Audio.
 *
 * Every sound in this game is synthesised in the browser at runtime. There are
 * no samples, no downloads and no licences: impacts are filtered noise bursts
 * with pitch envelopes, footsteps are short shaped noise, the ambience is
 * layered filtered noise driven by the region you are standing in, and the
 * score is a generative one built from detuned oscillators, a struck-metal
 * model and a low drone that follows the burn.
 *
 * The design brief for the score was one line: *it should sound like the
 * building is still standing but nobody is maintaining it.*
 *
 * Everything routes through a compressor into the master gain, and the whole
 * graph suspends when the page is hidden — an iOS tab that keeps an
 * AudioContext running in the background is a battery complaint waiting to
 * happen, and interrupting audio (a phone call) must not kill the game.
 */

import { clamp, clamp01, lerp } from '../core/util.js';
import { Rng } from '../core/rng.js';

const A4 = 440;
/** Semitone offset -> frequency, A4 = 0. */
const note = (n) => A4 * Math.pow(2, n / 12);

/**
 * Scale used throughout: D natural minor with a flattened second on the way
 * down. Sparse, modal, and it avoids the leading tone that would make any of
 * this sound heroic.
 */
const SCALE = [-7, -5, -4, -2, 0, 1, 3, 5, 8, 12];

export class Audio {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.ready = false;
    this.unlocked = false;
    this.master = 0.85;
    this.musicVol = 0.7;
    this.sfxVol = 1.0;
    this.rng = new Rng('audio');
    this.musicState = null;
    this.ambienceState = null;
    this._voices = 0;
    this._maxVoices = 24;
    this._lastPlay = new Map();

    this._installUnlock();
    this._wire();
  }

  // ------------------------------------------------------------------ boot

  _installUnlock() {
    const unlock = () => {
      if (this.unlocked) return;
      try {
        this._create();
        this.unlocked = true;
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchstart', unlock);
      } catch (e) {
        console.warn('[audio] unlock failed', e);
      }
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });

    // Audio interruption (a call, another app taking the session) leaves the
    // context suspended on iOS; resume it when we come back.
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    });
    window.addEventListener('focus', () => { this.ctx?.resume().catch(() => {}); });
  }

  _create() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;

    // master -> compressor -> destination
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.22;
    this.comp.connect(ctx.destination);

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.master;
    this.masterGain.connect(this.comp);

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.musicVol;
    this.musicGain.connect(this.masterGain);

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = this.sfxVol;
    this.sfxGain.connect(this.masterGain);

    this.ambGain = ctx.createGain();
    this.ambGain.gain.value = 0.0;
    this.ambGain.connect(this.masterGain);

    // A short convolution reverb, generated rather than loaded: a dead,
    // concrete-and-smoke tail that sits under everything outdoors.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._makeImpulse(1.8, 2.6);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.20;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.masterGain);

    this.noiseBuf = this._makeNoise(2.0);
    this.pinkBuf = this._makePink(3.0);

    this._startAmbience();
    this._startMusic();
    this.ready = true;

    if (this.musicState) this.setMusic(this.musicState, true);
    if (this.ambienceState) this.setAmbience(this.ambienceState, true);
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  _wire() {
    const g = this.game;
    g.on('sfx', (name, opts) => this.play(name, opts));
    g.on('music', (state) => this.setMusic(state));
    g.on('zone', (region) => {
      if (region && region.ambience) this.setAmbience(region.ambience);
      else this.setAmbience('street');
      if (region && region.music) this.setMusic(region.music);
    });
    g.on('mode', (m) => {
      if (m === 'title') this.setMusic('title');
    });
  }

  setVolumes(master, music, sfx) {
    this.master = master; this.musicVol = music; this.sfxVol = sfx;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(master, t, 0.05);
    this.musicGain.gain.setTargetAtTime(music, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(sfx, t, 0.05);
  }

  // ---------------------------------------------------------------- buffers

  _makeNoise(seconds) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    const r = new Rng('noise');
    for (let i = 0; i < n; i++) d[i] = r.f() * 2 - 1;
    return buf;
  }

  /** Pink-ish noise (Voss-McCartney, 5 rows). Ambience wants pink, not white. */
  _makePink(seconds) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    const r = new Rng('pink');
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = r.f() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    return buf;
  }

  /** Exponentially decaying noise impulse — a small, dead concrete room. */
  _makeImpulse(seconds, decay) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    const r = new Rng('impulse');
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        // Slight early-reflection cluster then a smooth tail.
        const early = (t < 0.06 && r.f() < 0.06) ? r.range(-1, 1) * 0.7 : 0;
        d[i] = ((r.f() * 2 - 1) * Math.pow(1 - t, decay) * 0.6 + early) * (1 - t);
      }
    }
    return buf;
  }

  // ------------------------------------------------------------------ nodes

  _now() { return this.ctx.currentTime; }

  _env(node, t, attack, decay, peak = 1, sustain = 0, release = 0) {
    const g = node.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + attack);
    if (sustain > 0 && release > 0) {
      g.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.5), t + attack + decay);
      g.setValueAtTime(Math.max(0.0001, peak * 0.5), t + attack + decay + sustain);
      g.exponentialRampToValueAtTime(0.0001, t + attack + decay + sustain + release);
    } else {
      g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    }
  }

  /** Positional gain and pan from the listener. Cheap 2D, not HRTF. */
  _spatial(opts) {
    if (!opts || opts.x === undefined) return { gain: 1, pan: 0 };
    const cam = this.game.engine.camera;
    const dx = opts.x - cam.position.x;
    const dy = (opts.y ?? 0) - cam.position.y;
    const dz = opts.z - cam.position.z;
    const d = Math.hypot(dx, dy, dz);
    const gain = clamp01(1 / (1 + d * d * 0.012));
    // Project onto the camera's right vector for pan.
    const e = cam.matrixWorld.elements;
    const rx = e[0], rz = e[2];
    const pan = clamp((dx * rx + dz * rz) / Math.max(1, d), -1, 1);
    return { gain, pan };
  }

  _chain(opts, extraGain = 1, sendReverb = 0.2) {
    const ctx = this.ctx;
    const sp = this._spatial(opts);
    const out = ctx.createGain();
    out.gain.value = sp.gain * extraGain;
    let node = out;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = sp.pan * 0.7;
      out.connect(p);
      node = p;
    }
    node.connect(this.sfxGain);
    if (sendReverb > 0 && this.reverb) {
      const s = ctx.createGain();
      s.gain.value = sendReverb * sp.gain;
      node.connect(s);
      s.connect(this.reverb);
    }
    return out;
  }

  _noiseSource(buffer, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer || this.noiseBuf;
    s.playbackRate.value = rate;
    s.loop = true;
    return s;
  }

  _budget() {
    if (this._voices >= this._maxVoices) return false;
    this._voices++;
    setTimeout(() => { this._voices--; }, 1400);
    return true;
  }

  /** Rate-limit repeated identical sounds (footsteps, brick hits). */
  _throttle(name, ms) {
    const t = performance.now();
    const last = this._lastPlay.get(name) || 0;
    if (t - last < ms) return false;
    this._lastPlay.set(name, t);
    return true;
  }

  // ------------------------------------------------------------------- sfx

  play(name, opts = {}) {
    if (!this.ready || !this.ctx) return;
    if (this.ctx.state === 'suspended') { this.ctx.resume().catch(() => {}); return; }
    const fn = this[`_sfx_${name}`];
    if (!fn) return;
    if (!this._budget()) return;
    try { fn.call(this, opts); } catch (e) { /* never let a sound break a frame */ }
  }

  /** Generic percussive impact: noise through a resonant band, pitch-swept. */
  _impact(opts, { freq = 220, q = 4, dur = 0.22, level = 0.9, type = 'bandpass', sweep = 0.35, rev = 0.25 }) {
    const ctx = this.ctx, t = this._now();
    const out = this._chain(opts, level, rev);
    const src = this._noiseSource(this.noiseBuf, this.rng.range(0.85, 1.2));
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this._env(g, t, 0.003, dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** Struck metal: a few inharmonic partials with fast decay. */
  _metal(opts, { base = 520, count = 5, dur = 0.5, level = 0.5, rev = 0.35 }) {
    const ctx = this.ctx, t = this._now();
    const out = this._chain(opts, level, rev);
    for (let i = 0; i < count; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      // Inharmonic ratios; a bar, not a string.
      o.frequency.value = base * (1 + i * 0.79 + this.rng.range(-0.05, 0.05)) * (1 + i * i * 0.04);
      const g = ctx.createGain();
      this._env(g, t, 0.002, dur * (1 - i * 0.13), 0.6 / (i + 1));
      o.connect(g); g.connect(out);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  /** Air movement: filtered noise with a slow swell. */
  _whoosh(opts, { dur = 0.3, level = 0.5, lo = 300, hi = 2400 }) {
    const ctx = this.ctx, t = this._now();
    const out = this._chain(opts, level, 0.18);
    const src = this._noiseSource(this.noiseBuf, 1);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(lo, t);
    f.frequency.exponentialRampToValueAtTime(hi, t + dur * 0.55);
    f.frequency.exponentialRampToValueAtTime(lo * 0.7, t + dur);
    const g = ctx.createGain();
    this._env(g, t, dur * 0.4, dur * 0.6);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t); src.stop(t + dur + 0.05);
  }

  // --- combat ------------------------------------------------------------
  _sfx_swing(o) { this._whoosh(o, { dur: 0.26, level: 0.42, lo: 380, hi: 2100 }); }
  _sfx_swingHeavy(o) { this._whoosh(o, { dur: 0.44, level: 0.6, lo: 200, hi: 1500 }); }
  _sfx_whiff(o) { this._whoosh(o, { dur: 0.2, level: 0.24, lo: 500, hi: 2600 }); }
  _sfx_hitBlunt(o) {
    this._impact(o, { freq: 260, q: 2.5, dur: 0.24, level: 1.0, sweep: 0.22 });
    this._impact(o, { freq: 90, q: 1.2, dur: 0.32, level: 0.7, sweep: 0.4, type: 'lowpass' });
  }
  _sfx_hitFlesh(o) {
    this._impact(o, { freq: 170, q: 1.4, dur: 0.16, level: 0.9, sweep: 0.3, type: 'lowpass' });
  }
  _sfx_block(o) {
    this._metal(o, { base: 760, count: 4, dur: 0.34, level: 0.5 });
    this._impact(o, { freq: 420, q: 3, dur: 0.12, level: 0.5 });
  }
  _sfx_parry(o) {
    this._metal(o, { base: 1180, count: 6, dur: 0.72, level: 0.72, rev: 0.5 });
    this._impact(o, { freq: 900, q: 6, dur: 0.1, level: 0.6 });
  }
  _sfx_shove(o) { this._impact(o, { freq: 140, q: 1, dur: 0.3, level: 0.8, type: 'lowpass' }); }
  _sfx_bite(o) { this._impact(o, { freq: 300, q: 3, dur: 0.12, level: 0.6, sweep: 0.2 }); }
  _sfx_dodge(o) { this._whoosh(o, { dur: 0.3, level: 0.3, lo: 240, hi: 1200 }); }
  _sfx_telegraph(o) {
    const ctx = this.ctx, t = this._now();
    const out = this._chain(o, 0.4, 0.4);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(note(-19), t);
    osc.frequency.exponentialRampToValueAtTime(note(-14), t + 0.3);
    const g = ctx.createGain();
    this._env(g, t, 0.02, 0.3, 0.5);
    osc.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + 0.4);
  }
  _sfx_throw(o) { this._whoosh(o, { dur: 0.22, level: 0.3, lo: 300, hi: 900 }); }
  _sfx_brickHit(o) {
    if (!this._throttle('brick', 60)) return;
    this._impact(o, { freq: 700, q: 3, dur: 0.15, level: 0.55, sweep: 0.25 });
  }

  // --- movement ----------------------------------------------------------
  _sfx_step(o) {
    if (!this._throttle('step', 90)) return;
    const surface = o.surface || 'grit';
    const cfg = {
      grit: { freq: 1400, q: 1.4, dur: 0.09, level: 0.30 },
      metal: { freq: 900, q: 5, dur: 0.14, level: 0.26 },
      wood: { freq: 520, q: 3, dur: 0.11, level: 0.24 },
    }[surface] || { freq: 1400, q: 1.4, dur: 0.09, level: 0.30 };
    this._impact(o, { ...cfg, level: cfg.level * (o.volume ?? 1), sweep: 0.4, rev: 0.15 });
  }
  _sfx_land(o) { this._impact(o, { freq: 220, q: 1.2, dur: 0.16, level: 0.5, type: 'lowpass' }); }
  _sfx_landHard(o) {
    this._impact(o, { freq: 130, q: 1.0, dur: 0.34, level: 0.95, type: 'lowpass' });
    this._impact(o, { freq: 900, q: 1.5, dur: 0.12, level: 0.4 });
  }

  // --- vitals ------------------------------------------------------------
  _sfx_cough(o) {
    const ctx = this.ctx, t = this._now();
    const out = this._chain(o, o.player ? 0.85 : 0.55, 0.3);
    const src = this._noiseSource(this.noiseBuf, this.rng.range(0.9, 1.1));
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2.2;
    // Two bursts — a cough is not one sound.
    f.frequency.setValueAtTime(760, t);
    f.frequency.exponentialRampToValueAtTime(280, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.8, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.13);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.19);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t); src.stop(t + 0.5);
  }
  _sfx_death(o) {
    this._impact(o, { freq: 160, q: 1, dur: 0.5, level: 0.7, type: 'lowpass', rev: 0.5 });
    this._metal(o, { base: 210, count: 3, dur: 0.9, level: 0.28, rev: 0.5 });
  }
  _sfx_exhausted(o) { this._whoosh(o, { dur: 0.34, level: 0.2, lo: 180, hi: 480 }); }
  _sfx_heal() { this._tone({ f: note(3), dur: 0.5, level: 0.24, type: 'sine', to: note(10) }); }
  _sfx_stim() { this._tone({ f: note(0), dur: 0.42, level: 0.26, type: 'triangle', to: note(12) }); }
  _sfx_filter() {
    this._impact({}, { freq: 480, q: 5, dur: 0.14, level: 0.5 });
    setTimeout(() => this._impact({}, { freq: 300, q: 6, dur: 0.2, level: 0.45 }), 110);
  }

  // --- interface ---------------------------------------------------------
  _tone({ f = 440, dur = 0.3, level = 0.3, type = 'sine', to = null, delay = 0 }) {
    const ctx = this.ctx, t = this._now() + delay;
    const out = this._chain({}, level, 0.25);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.8);
    const g = ctx.createGain();
    this._env(g, t, 0.01, dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.1);
  }
  _sfx_pickup() { this._tone({ f: note(3), dur: 0.16, level: 0.28, type: 'triangle' }); this._tone({ f: note(10), dur: 0.22, level: 0.2, type: 'sine', delay: 0.07 }); }
  _sfx_questStart() { this._tone({ f: note(-5), dur: 0.5, level: 0.24, type: 'sine' }); this._tone({ f: note(0), dur: 0.7, level: 0.2, type: 'sine', delay: 0.14 }); }
  _sfx_questDone() { this._tone({ f: note(0), dur: 0.4, level: 0.24 }); this._tone({ f: note(5), dur: 0.5, level: 0.22, delay: 0.12 }); this._tone({ f: note(12), dur: 0.8, level: 0.18, delay: 0.26 }); }
  _sfx_unlock() { this._metal({}, { base: 620, count: 5, dur: 1.1, level: 0.34, rev: 0.5 }); }
  _sfx_discover() { this._tone({ f: note(-12), dur: 1.2, level: 0.2, type: 'sine' }); }
  _sfx_lockon() { this._tone({ f: note(7), dur: 0.09, level: 0.22, type: 'square' }); }
  /** The meter settling: a switch, then two ticks as the needle finds its rest. */
  _sfx_meter() {
    this._impact({}, { freq: 1900, q: 9, dur: 0.035, level: 0.26 });
    this._tone({ f: 1480, dur: 0.045, level: 0.14, type: 'square', delay: 0.20 });
    this._tone({ f: 1620, dur: 0.05, level: 0.16, type: 'square', delay: 0.40 });
  }
  _sfx_door() { this._impact({}, { freq: 180, q: 2, dur: 0.4, level: 0.5, type: 'lowpass', rev: 0.4 }); }
  _sfx_locked() { this._impact({}, { freq: 420, q: 8, dur: 0.1, level: 0.4 }); }
  _sfx_rescue() { this._tone({ f: note(5), dur: 0.5, level: 0.3 }); this._tone({ f: note(12), dur: 0.7, level: 0.24, delay: 0.13 }); }
  _sfx_aggro(o) {
    // A shout, formant-ish: two filtered noise bands.
    const ctx = this.ctx, t = this._now();
    const out = this._chain(o, 0.55, 0.4);
    for (const [f0, q] of [[520, 6], [1180, 8]]) {
      const src = this._noiseSource(this.noiseBuf, 1);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = q;
      f.frequency.setValueAtTime(f0 * this.rng.range(0.85, 1.2), t);
      f.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + 0.4);
      const g = ctx.createGain();
      this._env(g, t, 0.03, 0.4, 0.6);
      src.connect(f); f.connect(g); g.connect(out);
      src.start(t); src.stop(t + 0.5);
    }
  }
  _sfx_panic(o) { this._sfx_aggro({ ...o }); }
  _sfx_voice(o) {
    // Dialogue tick: a soft, short formant blip per line, pitched by speaker.
    const pitch = { ren: -4, teo: -9, sol: -2, nessa: 3, iris: 1, krajcik: -7 }[o.who] ?? 0;
    this._tone({ f: note(pitch - 12), dur: 0.12, level: 0.12, type: 'sine' });
  }

  // -------------------------------------------------------------- ambience

  _startAmbience() {
    const ctx = this.ctx;
    this.ambLayers = {};
    const mk = (name, buf, filterType, freq, q, gain, rate = 1) => {
      const src = this._noiseSource(buf, rate);
      const f = ctx.createBiquadFilter();
      f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.ambGain);
      src.start();
      this.ambLayers[name] = { src, filter: f, gain: g, target: 0, base: gain };
      return this.ambLayers[name];
    };
    // wind through empty streets
    mk('wind', this.pinkBuf, 'bandpass', 420, 0.7, 0.30);
    // the burn, a long way under you
    mk('burn', this.pinkBuf, 'lowpass', 90, 0.9, 0.42, 0.6);
    // gas hiss from a nearby head
    mk('hiss', this.noiseBuf, 'highpass', 3200, 0.9, 0.10);
    // industrial hum from the plant and the generators
    mk('hum', this.pinkBuf, 'bandpass', 120, 8, 0.16, 0.5);
    // interior: close, dead, almost nothing
    mk('room', this.pinkBuf, 'lowpass', 320, 0.7, 0.10, 0.8);

    this.ambGain.gain.setTargetAtTime(0.5, ctx.currentTime, 1.0);

    // Occasional one-shots layered on top: settling metal, distant collapse.
    this._ambTimer = setInterval(() => this._ambientEvent(), 5200);
  }

  _ambientEvent() {
    if (!this.ready || document.hidden) return;
    if (this.rng.f() > 0.4) return;
    const g = this.game;
    const p = g.player ? g.player.pos : { x: 0, y: 0, z: 0 };
    const a = this.rng.f() * Math.PI * 2;
    const d = this.rng.range(16, 48);
    const o = { x: p.x + Math.cos(a) * d, y: p.y + this.rng.range(-2, 8), z: p.z + Math.sin(a) * d };
    const roll = this.rng.f();
    if (roll < 0.34) this._metal(o, { base: this.rng.range(180, 420), count: 3, dur: 1.6, level: 0.16, rev: 0.6 });
    else if (roll < 0.6) this._impact(o, { freq: 110, q: 1, dur: 1.2, level: 0.2, type: 'lowpass', rev: 0.7 });
    else if (roll < 0.82) this._whoosh(o, { dur: 1.8, level: 0.12, lo: 160, hi: 700 });
    else this._impact(o, { freq: 2200, q: 2, dur: 0.5, level: 0.1, sweep: 0.3 });
  }

  /** Ambience presets by region. */
  setAmbience(state, force = false) {
    if (state === this.ambienceState && !force) return;
    this.ambienceState = state;
    if (!this.ready) return;
    const P = {
      street: { wind: 0.7, burn: 0.5, hiss: 0.05, hum: 0.15, room: 0 },
      camp:   { wind: 0.4, burn: 0.4, hiss: 0.04, hum: 0.55, room: 0 },
      slip:   { wind: 0.5, burn: 1.0, hiss: 0.35, hum: 0.1, room: 0 },
      vents:  { wind: 0.3, burn: 0.9, hiss: 0.85, hum: 0.3, room: 0 },
      cut:    { wind: 0.5, burn: 0.6, hiss: 0.3, hum: 0.7, room: 0 },
      road:   { wind: 0.8, burn: 0.4, hiss: 0.1, hum: 0.3, room: 0 },
      empty:  { wind: 0.95, burn: 0.35, hiss: 0.06, hum: 0.02, room: 0 },
      interior: { wind: 0.08, burn: 0.18, hiss: 0.02, hum: 0.25, room: 0.9 },
      under:  { wind: 0.1, burn: 1.0, hiss: 0.5, hum: 0.2, room: 0.7 },
    }[state] || { wind: 0.7, burn: 0.5, hiss: 0.05, hum: 0.15, room: 0 };

    const t = this.ctx.currentTime;
    for (const k in this.ambLayers) {
      const L = this.ambLayers[k];
      L.gain.gain.setTargetAtTime(L.base * (P[k] ?? 0), t, 2.2);
    }
  }

  /** Per-frame ambience modulation from the actual air the player is in. */
  update(dt) {
    if (!this.ready) return;
    const p = this.game.player;
    if (!p) return;
    const t = this.ctx.currentTime;
    // The hiss layer tracks local gas concentration, so the air is audible
    // before the meter has caught up with it.
    const ppm = p.ambientPpm || 0;
    const hissAmt = clamp01((ppm - 200) / 2200);
    const L = this.ambLayers.hiss;
    if (L) L.gain.gain.setTargetAtTime(L.base * lerp(L.target || 0.05, 0.9, hissAmt), t, 0.6);
    // The burn gets louder as you descend.
    const B = this.ambLayers.burn;
    if (B) {
      const depth = clamp01(1 - (p.pos.y + 2) / 22);
      B.gain.gain.setTargetAtTime(B.base * lerp(0.25, 1.0, depth), t, 1.2);
    }
    this._musicTick();
  }

  // ----------------------------------------------------------------- music

  _startMusic() {
    const ctx = this.ctx;
    this.music = {
      drone: null, pad: null, pulse: null,
      nextNote: ctx.currentTime + 0.4,
      step: 0,
      intensity: 0,
      targetIntensity: 0,
      key: 0,
    };

    // Drone: two detuned saws through a low-pass, the floor of everything.
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 300; lp.Q.value = 1.2;
    lp.connect(droneGain);
    droneGain.connect(this.musicGain);
    const oscs = [];
    for (const d of [-0.12, 0.11, 0.004]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = note(-31) * (1 + d * 0.01);
      o.detune.value = d * 100;
      const g = ctx.createGain();
      g.gain.value = 0.22;
      o.connect(g); g.connect(lp);
      o.start();
      oscs.push(o);
    }
    this.music.drone = { gain: droneGain, filter: lp, oscs };

    // Pad: a slow, breathing noise band that reads as the city exhaling.
    const padGain = ctx.createGain();
    padGain.gain.value = 0;
    const padF = ctx.createBiquadFilter();
    padF.type = 'bandpass'; padF.frequency.value = 500; padF.Q.value = 2.4;
    const padSrc = this._noiseSource(this.pinkBuf, 0.7);
    padSrc.connect(padF); padF.connect(padGain);
    padGain.connect(this.musicGain);
    const rev = ctx.createGain();
    rev.gain.value = 0.5;
    padGain.connect(rev); rev.connect(this.reverb);
    padSrc.start();
    this.music.pad = { gain: padGain, filter: padF, src: padSrc };

    this._musicClock = setInterval(() => this._schedule(), 120);
  }

  setMusic(state, force = false) {
    if (state === this.musicState && !force) return;
    this.musicState = state;
    if (!this.ready) return;
    const P = MUSIC[state] || MUSIC.explore;
    this.music.targetIntensity = P.intensity;
    this.music.preset = P;
    const t = this.ctx.currentTime;
    this.music.drone.filter.frequency.setTargetAtTime(P.droneCut, t, 3.0);
    for (const o of this.music.drone.oscs) {
      o.frequency.setTargetAtTime(note(P.root - 31), t, 4.0);
    }
    this.music.pad.filter.frequency.setTargetAtTime(P.padFreq, t, 3.5);
  }

  _musicTick() {
    if (!this.music) return;
    const t = this.ctx.currentTime;
    const P = this.music.preset || MUSIC.explore;
    this.music.intensity += (this.music.targetIntensity - this.music.intensity) * 0.02;
    this.music.drone.gain.gain.setTargetAtTime(P.drone * 0.34, t, 2.0);
    this.music.pad.gain.gain.setTargetAtTime(P.pad * 0.12, t, 2.5);
  }

  /**
   * Note scheduler. Runs on a 120 ms interval with a lookahead, which is the
   * standard way to get stable musical timing out of a browser without
   * depending on setInterval being accurate.
   */
  _schedule() {
    if (!this.ready || document.hidden) return;
    const ctx = this.ctx;
    const P = this.music.preset || MUSIC.explore;
    const lookahead = 0.35;
    while (this.music.nextNote < ctx.currentTime + lookahead) {
      const t = this.music.nextNote;
      const step = this.music.step++;
      const beat = P.beat;

      if (P.bell > 0 && step % P.bellEvery === 0) {
        const deg = SCALE[(step * 3 + Math.floor(step / 5)) % SCALE.length];
        this._bell(note(deg + P.root - 12), t, P.bell * this.rng.range(0.7, 1.0));
      }
      if (P.pulse > 0 && step % P.pulseEvery === 0) {
        this._pulse(t, P.pulse);
      }
      if (P.low > 0 && step % (P.bellEvery * 4) === 0) {
        this._bell(note(P.root - 24), t, P.low, 4.5);
      }
      this.music.nextNote += beat;
    }
  }

  /** Struck-bell voice: sine partials with long decay through the reverb. */
  _bell(freq, t, level, decay = 2.4) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = level;
    out.connect(this.musicGain);
    const send = ctx.createGain();
    send.gain.value = 0.6;
    out.connect(send); send.connect(this.reverb);
    const partials = [1, 2.01, 3.02, 4.17];
    const amps = [1, 0.42, 0.22, 0.12];
    for (let i = 0; i < partials.length; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * partials[i];
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amps[i] * 0.35, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay * (1 - i * 0.16));
      o.connect(g); g.connect(out);
      o.start(t);
      o.stop(t + decay + 0.2);
    }
  }

  /** Combat pulse: a filtered noise hit on the beat. Not a drum — a hammer. */
  _pulse(t, level) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = level;
    out.connect(this.musicGain);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 1;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(90, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t); src.stop(t + 0.3);
  }

  dispose() {
    clearInterval(this._musicClock);
    clearInterval(this._ambTimer);
    this.ctx?.close().catch(() => {});
  }
}

/**
 * Music presets. Each region and each dramatic state selects one; the change
 * is a slow crossfade of layer gains and a re-tuning of the drone, never a
 * hard cut, because a hard music cut in an open world tells the player they
 * crossed an invisible line.
 */
const MUSIC = {
  title:     { intensity: 0.2, root: 0,  drone: 0.9, pad: 0.7, beat: 1.9, bell: 0.30, bellEvery: 2, pulse: 0, pulseEvery: 4, low: 0.20, droneCut: 260, padFreq: 420 },
  explore:   { intensity: 0.2, root: 0,  drone: 0.7, pad: 0.5, beat: 1.6, bell: 0.16, bellEvery: 4, pulse: 0, pulseEvery: 4, low: 0.14, droneCut: 240, padFreq: 460 },
  home:      { intensity: 0.15, root: 3, drone: 0.55, pad: 0.7, beat: 1.9, bell: 0.20, bellEvery: 3, pulse: 0, pulseEvery: 4, low: 0.12, droneCut: 300, padFreq: 620 },
  lonely:    { intensity: 0.1, root: -2, drone: 0.6, pad: 0.85, beat: 2.4, bell: 0.13, bellEvery: 5, pulse: 0, pulseEvery: 4, low: 0.16, droneCut: 190, padFreq: 340 },
  liminal:   { intensity: 0.25, root: 1, drone: 0.75, pad: 0.4, beat: 1.5, bell: 0.10, bellEvery: 6, pulse: 0, pulseEvery: 4, low: 0.10, droneCut: 280, padFreq: 720 },
  tense:     { intensity: 0.5, root: -1, drone: 0.95, pad: 0.4, beat: 1.05, bell: 0.10, bellEvery: 4, pulse: 0.10, pulseEvery: 8, low: 0.22, droneCut: 170, padFreq: 300 },
  dread:     { intensity: 0.6, root: -3, drone: 1.0, pad: 0.55, beat: 1.2, bell: 0.08, bellEvery: 6, pulse: 0.08, pulseEvery: 6, low: 0.30, droneCut: 130, padFreq: 260 },
  authority: { intensity: 0.35, root: 2, drone: 0.7, pad: 0.35, beat: 1.25, bell: 0.11, bellEvery: 4, pulse: 0.07, pulseEvery: 4, low: 0.14, droneCut: 340, padFreq: 900 },
  combat:    { intensity: 1.0, root: -5, drone: 1.0, pad: 0.25, beat: 0.42, bell: 0.07, bellEvery: 8, pulse: 0.26, pulseEvery: 2, low: 0.24, droneCut: 220, padFreq: 380 },
  crisis:    { intensity: 0.9, root: -4, drone: 1.0, pad: 0.9, beat: 0.62, bell: 0.15, bellEvery: 3, pulse: 0.16, pulseEvery: 4, low: 0.34, droneCut: 150, padFreq: 280 },
  ending:    { intensity: 0.1, root: 0,  drone: 0.6, pad: 0.8, beat: 2.8, bell: 0.24, bellEvery: 2, pulse: 0, pulseEvery: 4, low: 0.22, droneCut: 300, padFreq: 500 },
};
