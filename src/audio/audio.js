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

/**
 * Footstep surfaces. Seven materials the player actually walks on, each with a
 * different band, a different length, and — where the material has mass — a low
 * body component. Previously three entries existed and only one of them was
 * ever reachable, so ash, roof felt, tile, rubble and concrete all played the
 * identical 90 ms 1400 Hz ping.
 */
const STEP_SURFACES = {
  grit:     { freq: 1400, q: 1.4, dur: 0.09, level: 0.30, sweep: 0.40 },
  asphalt:  { freq: 900,  q: 1.1, dur: 0.10, level: 0.30, sweep: 0.34, body: 130 },
  concrete: { freq: 1750, q: 2.2, dur: 0.075, level: 0.30, sweep: 0.45, body: 190 },
  metal:    { freq: 900,  q: 5.0, dur: 0.14, level: 0.26, sweep: 0.40 },
  wood:     { freq: 520,  q: 3.0, dur: 0.11, level: 0.24, sweep: 0.40, body: 105 },
  felt:     { freq: 620,  q: 0.9, dur: 0.13, level: 0.22, sweep: 0.30, type: 'lowpass' },
  tile:     { freq: 2400, q: 6.0, dur: 0.07, level: 0.27, sweep: 0.55, body: 220 },
  rubble:   { freq: 1150, q: 1.0, dur: 0.16, level: 0.32, sweep: 0.28, body: 160 },
  ash:      { freq: 480,  q: 0.7, dur: 0.15, level: 0.18, sweep: 0.30, type: 'lowpass' },
};

/**
 * Per-sound [duration seconds, priority] for the voice budget.
 * Priority 3 = combat confirms and player-critical cues (may steal),
 * 2 = world events, 1 = ambient texture and footsteps (first to be stolen).
 */
const SFX_META = {
  _default:   [0.5, 2],
  step:       [0.18, 1],
  brickHit:   [0.2, 1],
  swing:      [0.3, 2],
  swingHeavy: [0.48, 2],
  whiff:      [0.24, 1],
  hitBlunt:   [0.36, 3],
  hitFlesh:   [0.2, 3],
  block:      [0.4, 3],
  parry:      [0.8, 3],
  bite:       [0.16, 3],
  telegraph:  [0.42, 3],
  land:       [0.2, 2],
  landHard:   [0.38, 2],
  cough:      [0.52, 2],
  death:      [1.0, 3],
  aggro:      [0.55, 3],
  panic:      [0.55, 3],
  voice:      [0.16, 2],
  unlock:     [1.2, 2],
  discover:   [1.3, 2],
  questDone:  [1.1, 2],
  meter:      [0.5, 3],
  heal:       [0.55, 3],
  stim:       [0.5, 3],
  filter:     [0.35, 3],
};

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
    /** Live voice slots: { end (ms), priority }. See _budget. */
    this._voiceList = [];
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

    // Three generated impulses, crossfaded by ambience. One 1.8 s tail served
    // open streets, cellars and tunnels identically — and 1.8 s is a large
    // hall, not the "small, dead concrete room" the code claimed. A room you
    // can hear the size of is most of what tells a player they went indoors.
    this.reverbBus = ctx.createGain();
    this.reverbs = {};
    for (const [k, sec, decay, pre] of [
      ['interior', 0.5, 4.2, 0.004],   // a stripped flat: close, dead
      ['street',   1.4, 2.6, 0.014],   // brick canyon
      ['tunnel',   2.6, 1.7, 0.052],   // the deep cut: long pre-delay, long tail
    ]) {
      const conv = ctx.createConvolver();
      conv.buffer = this._makeImpulse(sec, decay, pre);
      const g = ctx.createGain();
      g.gain.value = k === 'street' ? 0.20 : 0.0;
      this.reverbBus.connect(conv);
      conv.connect(g);
      g.connect(this.masterGain);
      this.reverbs[k] = { conv, gain: g };
    }
    // Everything sends here; the bus fans out to the three spaces.
    this.reverb = this.reverbBus;

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

  /**
   * Exponentially decaying noise impulse.
   * @param seconds  tail length
   * @param decay    tail curvature; higher = deader
   * @param preDelay seconds of near-silence before the first reflections. This
   *                 is the single strongest cue for room SIZE — a tunnel is a
   *                 tunnel because the walls answer late.
   */
  _makeImpulse(seconds, decay, preDelay = 0.01) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * seconds);
    const pre = Math.floor(ctx.sampleRate * preDelay);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    const r = new Rng(`impulse:${seconds}`);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) {
        if (i < pre) { d[i] = 0; continue; }
        const t = (i - pre) / Math.max(1, n - pre);
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

  /** Positional gain, pan and distance from the listener. Cheap 2D, not HRTF. */
  _spatial(opts) {
    if (!opts || opts.x === undefined) return { gain: 1, pan: 0, dist: 0 };
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
    return { gain, pan, dist: d };
  }

  /**
   * Build the output chain for one voice.
   *
   * Distance does two things here that level alone cannot:
   *
   *  - AIR ABSORPTION. A lowpass whose corner falls with range. Without it a
   *    40 m impact has an identical spectrum to a 1 m one and simply sounds
   *    quiet, which the ear reads as "small", not as "far away".
   *  - REVERB RATIO. The send is taken BEFORE the distance attenuation and
   *    ramped up with range, so distant sounds are proportionally WETTER. The
   *    old chain scaled the send by the same 1/(1+d^2) as the dry path, making
   *    far sounds drier than near ones — exactly backwards.
   */
  _chain(opts, extraGain = 1, sendReverb = 0.2) {
    const ctx = this.ctx;
    const sp = this._spatial(opts);

    const out = ctx.createGain();
    out.gain.value = 1;
    let src = out;
    if (sp.dist > 2.5) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = clamp(20000 * Math.exp(-sp.dist / 45), 300, 20000);
      lp.Q.value = 0.4;
      src.connect(lp);
      src = lp;
    }

    const dry = ctx.createGain();
    dry.gain.value = sp.gain * extraGain;
    src.connect(dry);
    let node = dry;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = sp.pan * 0.7;
      dry.connect(p);
      node = p;
    }
    node.connect(this.sfxGain);

    if (sendReverb > 0 && this.reverbBus) {
      const s = ctx.createGain();
      s.gain.value = sendReverb * extraGain *
        clamp(0.55 + sp.dist / 18, 0.55, 2.4) / (1 + sp.dist * 0.03);
      src.connect(s);
      s.connect(this.reverbBus);
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

  /**
   * Voice budget.
   *
   * A slot is held for the sound's REAL length, not a flat 1400 ms. Holding a
   * 90 ms footstep for 1.4 s meant three actors walking sat permanently at the
   * 24-voice cap and hit confirms were dropped mid-fight, silently.
   *
   * Priorities let combat steal: an impact will evict a footstep, a footstep
   * will never evict an impact.
   */
  _budget(dur = 0.5, priority = 1) {
    const now = performance.now();
    const v = this._voiceList;
    for (let i = v.length - 1; i >= 0; i--) if (v[i].end <= now) v.splice(i, 1);
    if (v.length >= this._maxVoices) {
      let worst = -1;
      for (let i = 0; i < v.length; i++) {
        if (v[i].priority >= priority) continue;
        if (worst < 0 || v[i].priority < v[worst].priority ||
            (v[i].priority === v[worst].priority && v[i].end < v[worst].end)) worst = i;
      }
      if (worst < 0) return false;
      v.splice(worst, 1);
    }
    v.push({ end: now + Math.max(60, dur * 1000 + 120), priority });
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
    const meta = SFX_META[name] || SFX_META._default;
    if (!this._budget(meta[0], meta[1])) return;
    try { fn.call(this, opts); } catch (e) { /* never let a sound break a frame */ }
  }

  /** Generic percussive impact: noise through a resonant band, pitch-swept. */
  _impact(opts, { freq = 220, q = 4, dur = 0.22, level = 0.9, type = 'bandpass', sweep = 0.35, rev = 0.25, at = 0 }) {
    const ctx = this.ctx, t = this._now() + at;
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
    // Per-ACTOR throttle. A global 'step' key meant that with three actors
    // moving, two of every three footsteps were silently discarded — the whole
    // crowd shared one 90 ms budget.
    const who = o.id ?? o.actor ?? `${Math.round(o.x ?? 0)},${Math.round(o.z ?? 0)}`;
    if (!this._throttle(`step:${who}`, 90)) return;
    const cfg = STEP_SURFACES[o.surface] || STEP_SURFACES.grit;
    // Randomise level and centre frequency per step. Without this every
    // footfall is the identical sample and the character types rather than
    // walks.
    const f = cfg.freq * this.rng.range(0.85, 1.15);
    const lv = cfg.level * (o.volume ?? 1) * this.rng.range(0.71, 1.41);   // +/- 3 dB
    this._impact(o, {
      freq: f, q: cfg.q, dur: cfg.dur * this.rng.range(0.88, 1.14),
      level: lv, type: cfg.type || 'bandpass', sweep: cfg.sweep ?? 0.4, rev: cfg.rev ?? 0.15,
    });
    // Surfaces with a body get a second, lower component: the sound of the
    // thing under the boot, not just the grit on top of it.
    if (cfg.body) {
      this._impact(o, {
        freq: cfg.body * this.rng.range(0.9, 1.1), q: 1.1, dur: cfg.dur * 1.6,
        level: lv * 0.55, type: 'lowpass', sweep: 0.5, rev: cfg.rev ?? 0.15,
      });
    }
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
    // Scheduled on the audio clock rather than with setTimeout: a timer is
    // sample-inaccurate and jitters by tens of milliseconds under frame load,
    // which on a two-hit sound is audible as sloppiness.
    this._impact({}, { freq: 300, q: 6, dur: 0.2, level: 0.45, at: 0.11 });
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
    this.voiceTick(o.who);
  }

  /**
   * One syllable of speech. Call this every 3-4 characters as a line types out
   * rather than once per line: a single blip per line means every speaker in
   * the game is one soft beep, which is not a voice, it is a notification.
   *
   * Public API — the typewriter in src/ui/screens.js should drive it.
   */
  voiceTick(who) {
    if (!this.ready || !this.ctx) return;
    if (!this._throttle(`voice:${who || ''}`, 42)) return;
    const pitch = VOICE_PITCH[who] ?? 0;
    // +/- 2 semitones of jitter, plus a slight formant shift, so a run of
    // syllables has contour instead of being a metronome.
    const semi = pitch - 12 + this.rng.range(-2, 2);
    const f = note(semi);
    const ctx = this.ctx, t = this._now();
    const out = this._chain({}, 0.16, 0.18);
    for (const [mul, amp, ty] of [[1, 1, 'sine'], [2.02, 0.34, 'triangle']]) {
      const o = ctx.createOscillator();
      o.type = ty;
      o.frequency.setValueAtTime(f * mul, t);
      o.frequency.linearRampToValueAtTime(f * mul * this.rng.range(0.93, 1.07), t + 0.07);
      const g = ctx.createGain();
      this._env(g, t, 0.008, 0.075, amp);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + 0.12);
    }
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
    // Poisson, not a metronome — see _armAmbientEvent.
    this._armAmbientEvent();
  }

  /**
   * Schedule the next ambient one-shot with an EXPONENTIAL inter-arrival time.
   *
   * A fixed 5200 ms tick with p=0.4 over four sounds is recognisable inside two
   * minutes: the ear locks onto the grid even when the events themselves are
   * random. Poisson arrivals have no grid to lock onto.
   */
  _armAmbientEvent() {
    clearTimeout(this._ambTimer);
    const mean = 11000;
    const wait = clamp(-Math.log(1 - this.rng.f()) * mean, 900, 46000);
    this._ambTimer = setTimeout(() => { this._ambientEvent(); this._armAmbientEvent(); }, wait);
  }

  _ambientEvent() {
    if (!this.ready || document.hidden) return;
    const g = this.game;
    const p = g.player ? g.player.pos : { x: 0, y: 0, z: 0 };
    const st = this.ambienceState || 'street';
    const A = AMBIENT_EVENTS[st] || AMBIENT_EVENTS.street;
    const a = this.rng.f() * Math.PI * 2;
    // Distance is biased by where you are: a tunnel has close walls, an empty
    // road has none.
    const d = this.rng.range(A.near, A.far);
    const o = { x: p.x + Math.cos(a) * d, y: p.y + this.rng.range(A.lowY, A.highY), z: p.z + Math.sin(a) * d };
    const kind = A.kinds[this.rng.int(0, A.kinds.length - 1)];
    switch (kind) {
      case 'settle':    this._metal(o, { base: this.rng.range(180, 420), count: 3, dur: 1.6, level: 0.16, rev: 0.6 }); break;
      case 'collapse':  this._impact(o, { freq: this.rng.range(80, 150), q: 1, dur: 1.4, level: 0.22, type: 'lowpass', rev: 0.8 }); break;
      case 'gust':      this._whoosh(o, { dur: this.rng.range(1.4, 2.6), level: 0.12, lo: 160, hi: 700 }); break;
      case 'tick':      this._impact(o, { freq: this.rng.range(1800, 2600), q: 2, dur: 0.5, level: 0.1, sweep: 0.3 }); break;
      case 'drip':      this._impact(o, { freq: this.rng.range(900, 1800), q: 12, dur: 0.14, level: 0.13, sweep: 0.5, rev: 0.7 }); break;
      case 'creak':     this._metal(o, { base: this.rng.range(90, 190), count: 2, dur: 2.4, level: 0.12, rev: 0.7 }); break;
      case 'glass':     this._impact(o, { freq: this.rng.range(2600, 4200), q: 5, dur: 0.4, level: 0.12, sweep: 0.25, rev: 0.5 }); break;
      case 'vent':      this._whoosh(o, { dur: this.rng.range(0.8, 1.6), level: 0.14, lo: 900, hi: 3400 }); break;
      case 'boom':      this._impact(o, { freq: 55, q: 0.8, dur: 2.2, level: 0.26, type: 'lowpass', rev: 0.9 }); break;
      case 'clang':     this._metal(o, { base: this.rng.range(420, 780), count: 4, dur: 1.1, level: 0.14, rev: 0.6 }); break;
      default: break;
    }
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

    // Crossfade the room. `interior` had a preset here and no matching reverb
    // change, so stepping inside changed the air but not the walls.
    const space = REVERB_SPACE[state] || 'street';
    for (const k in this.reverbs) {
      const target = k === space ? (space === 'tunnel' ? 0.30 : space === 'interior' ? 0.13 : 0.20) : 0;
      this.reverbs[k].gain.gain.setTargetAtTime(target, t, 1.4);
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
      cell: null,
      cellName: null,
      transpose: 0,
      pending: null,
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
    const t = this.ctx.currentTime;
    // Timbre glides immediately — these are multi-second filter and pitch
    // ramps and nobody hears a downbeat in them.
    this.music.drone.filter.frequency.setTargetAtTime(P.droneCut, t, 3.0);
    for (const o of this.music.drone.oscs) {
      o.frequency.setTargetAtTime(note(P.root - 31), t, 4.0);
    }
    this.music.pad.filter.frequency.setTargetAtTime(P.padFreq, t, 3.5);
    // TEMPO does not. Changing P.beat mid-phrase (explore 1.6 -> combat 0.42)
    // moved the pulse to an arbitrary point with no downbeat; the change now
    // lands on the next bar line and restarts the phrase there.
    if (!this.music.preset) { this.music.preset = P; this.music.step = 0; this.music.cell = null; }
    else this.music.pending = P;
  }

  _musicTick() {
    if (!this.music) return;
    const t = this.ctx.currentTime;
    const P = this.music.preset || MUSIC.explore;
    const m = this.music;
    m.intensity += (m.targetIntensity - m.intensity) * 0.02;
    // Intensity now actually does something. It used to be eased toward a
    // target and then thrown away: the layer gains were read straight off the
    // static preset, so the whole "crossfade" was a no-op.
    const inten = clamp01(m.intensity);
    m.drone.gain.gain.setTargetAtTime(P.drone * 0.34 * (0.45 + 0.62 * inten), t, 2.0);
    m.pad.gain.gain.setTargetAtTime(P.pad * 0.15 * (1.05 - 0.55 * inten), t, 2.5);
  }

  /** Pick a melodic cell for this state, avoiding an immediate repeat. */
  _pickCell(P) {
    const set = CELLS[P.cells] || CELLS.calm;
    let c = set[this.rng.int(0, set.length - 1)];
    if (set.length > 1 && c === this.music.cell) c = set[(set.indexOf(c) + 1) % set.length];
    return c;
  }

  /**
   * Note scheduler. Runs on a 120 ms interval with a lookahead, which is the
   * standard way to get stable musical timing out of a browser without
   * depending on setInterval being accurate.
   */
  _schedule() {
    if (!this.ready || document.hidden) return;
    const ctx = this.ctx;
    const m = this.music;
    const lookahead = 0.35;
    while (m.nextNote < ctx.currentTime + lookahead) {
      const t = m.nextNote;
      const step = m.step;
      const bar = step % BAR;
      const phrase = step % (BAR * BARS_PER_PHRASE);

      // State changes land on a bar line, and a new phrase restarts the count.
      if (bar === 0 && m.pending) {
        m.preset = m.pending;
        m.pending = null;
        m.step = 0;
        m.cell = null;
        continue;                       // re-enter at step 0 of the new preset
      }
      const P = m.preset || MUSIC.explore;

      if (phrase === 0) {
        // One four-bar melodic cell per phrase, occasionally transposed up a
        // fourth. The old line — SCALE[(step*3 + floor(step/5)) % len] — is a
        // maximally-even permutation of the scale: the least melodic ordering
        // available. No motif, no phrase, no cadence, no repetition.
        m.cell = this._pickCell(P);
        m.transpose = this.rng.chance(P.wander ?? 0.3) ? (this.rng.chance(0.5) ? 5 : -5) : 0;
      }

      if (P.bell > 0 && m.cell) {
        const deg = m.cell[phrase];
        if (deg !== null && deg !== undefined) {
          const semis = SCALE[((deg % SCALE.length) + SCALE.length) % SCALE.length] + m.transpose;
          // Downbeats are louder; the cell's own rhythm carries the rest.
          const accent = bar === 0 ? 1.0 : bar === 2 ? 0.82 : 0.66;
          this._bell(note(semis + P.root - 12), t, P.bell * accent * this.rng.range(0.86, 1.0));
        }
      }
      if (P.pulse > 0 && step % P.pulseEvery === 0) this._pulse(t, P.pulse);
      // Root every phrase: the cadence the drone resolves onto.
      if (P.low > 0 && phrase === 0) this._bell(note(P.root - 24), t, P.low, 4.5);

      m.step++;
      m.nextNote += P.beat;
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
    clearTimeout(this._ambTimer);
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
  title:     { intensity: 0.2, root: 0,  drone: 0.9, pad: 0.7, beat: 0.95, bell: 0.30, pulse: 0, pulseEvery: 4, low: 0.20, droneCut: 260, padFreq: 420, cells: 'calm', wander: 0.2 },
  explore:   { intensity: 0.2, root: 0,  drone: 0.7, pad: 0.5, beat: 0.80, bell: 0.16, pulse: 0, pulseEvery: 4, low: 0.14, droneCut: 240, padFreq: 460, cells: 'calm', wander: 0.35 },
  home:      { intensity: 0.15, root: 3, drone: 0.55, pad: 0.7, beat: 0.95, bell: 0.20, pulse: 0, pulseEvery: 4, low: 0.12, droneCut: 300, padFreq: 620, cells: 'calm', wander: 0.25 },
  lonely:    { intensity: 0.1, root: -2, drone: 0.6, pad: 0.85, beat: 1.20, bell: 0.13, pulse: 0, pulseEvery: 4, low: 0.16, droneCut: 190, padFreq: 340, cells: 'sparse', wander: 0.4 },
  liminal:   { intensity: 0.25, root: 1, drone: 0.75, pad: 0.4, beat: 0.75, bell: 0.10, pulse: 0, pulseEvery: 4, low: 0.10, droneCut: 280, padFreq: 720, cells: 'sparse', wander: 0.5 },
  tense:     { intensity: 0.5, root: -1, drone: 0.95, pad: 0.4, beat: 0.52, bell: 0.10, pulse: 0.10, pulseEvery: 8, low: 0.22, droneCut: 170, padFreq: 300, cells: 'tense', wander: 0.2 },
  dread:     { intensity: 0.6, root: -3, drone: 1.0, pad: 0.55, beat: 0.60, bell: 0.08, pulse: 0.08, pulseEvery: 6, low: 0.30, droneCut: 130, padFreq: 260, cells: 'tense', wander: 0.15 },
  authority: { intensity: 0.35, root: 2, drone: 0.7, pad: 0.35, beat: 0.62, bell: 0.11, pulse: 0.07, pulseEvery: 4, low: 0.14, droneCut: 340, padFreq: 900, cells: 'tense', wander: 0.1 },
  combat:    { intensity: 1.0, root: -5, drone: 1.0, pad: 0.25, beat: 0.42, bell: 0.09, pulse: 0.26, pulseEvery: 2, low: 0.24, droneCut: 220, padFreq: 380, cells: 'combat', wander: 0.1 },
  crisis:    { intensity: 0.9, root: -4, drone: 1.0, pad: 0.9, beat: 0.50, bell: 0.15, pulse: 0.16, pulseEvery: 4, low: 0.34, droneCut: 150, padFreq: 280, cells: 'combat', wander: 0.3 },
  ending:    { intensity: 0.1, root: 0,  drone: 0.6, pad: 0.8, beat: 1.40, bell: 0.24, pulse: 0, pulseEvery: 4, low: 0.22, droneCut: 300, padFreq: 500, cells: 'calm', wander: 0.2 },
};

/** Steps per bar, and bars per melodic cell. */
const BAR = 4;
const BARS_PER_PHRASE = 4;

/**
 * Melodic cells. Each is four bars of four steps; entries index SCALE, and
 * `null` is a REST — which is the half of composition the previous generator
 * did not have at all.
 *
 * These are motifs, not permutations: each one states a shape, answers it, and
 * comes back to the tonic (index 4 = 0 semitones) or its fifth. That is the
 * difference between music and a random walk through a scale.
 */
const CELLS = {
  // Falling fourth, answered a step lower. The main theme of the empty city.
  calm: [
    [4, null, null, null,   7, null, 5, null,   4, null, null, null,   2, null, null, null],
    [4, null, 5, null,      7, null, null, null, 5, null, 4, null,     null, null, 2, null],
    [8, null, null, 7,      5, null, null, null, 4, null, null, 5,     4, null, null, null],
    [2, null, 4, null,      5, null, null, null, 4, null, null, null,  null, null, null, null],
  ],
  // Long tones, wide gaps. Used where the player is meant to feel alone.
  sparse: [
    [4, null, null, null,   null, null, null, null, 7, null, null, null, null, null, null, null],
    [2, null, null, null,   null, null, 4, null,    null, null, null, null, 1, null, null, null],
    [8, null, null, null,   null, null, null, null, 5, null, null, null, 4, null, null, null],
  ],
  // A repeated pedal with a semitone neighbour above it — the flattened second.
  tense: [
    [4, null, 5, 4,         null, null, 4, null,   5, null, 4, null,   null, null, null, null],
    [4, 4, null, 5,         4, null, null, null,   3, null, 4, null,   null, null, null, null],
    [1, null, null, 4,      null, null, 5, 4,      null, null, null, null, 4, null, null, null],
  ],
  // Short, driven, low. Lands on the beat the pulse hits.
  combat: [
    [0, null, 1, null,      0, null, null, null,   3, null, 1, null,   0, null, null, null],
    [0, 0, null, 1,         null, 3, null, null,   0, null, null, 1,   0, null, null, null],
    [3, null, null, 1,      0, null, null, null,   1, null, 0, null,   null, null, 0, null],
  ],
};

/** Dialogue pitch centre per speaker, in semitones from A. */
const VOICE_PITCH = { ren: -4, teo: -9, sol: -2, nessa: 3, iris: 1, krajcik: -7 };

/** Which generated room each ambience preset plays in. */
const REVERB_SPACE = {
  street: 'street', camp: 'street', slip: 'street', road: 'street', empty: 'street',
  vents: 'street', cut: 'street',
  interior: 'interior',
  under: 'tunnel',
};

/**
 * Ambient one-shot vocabulary per ambience state. Ten event types spread over
 * the states, with distance ranges that match the space — a tunnel event is
 * close and wet, an empty road event is far and dry.
 */
const AMBIENT_EVENTS = {
  street:   { near: 14, far: 52, lowY: -2, highY: 9,  kinds: ['settle', 'collapse', 'gust', 'tick', 'creak', 'glass', 'clang'] },
  camp:     { near: 6,  far: 26, lowY: -1, highY: 4,  kinds: ['settle', 'tick', 'creak', 'clang', 'drip'] },
  slip:     { near: 10, far: 40, lowY: -6, highY: 6,  kinds: ['collapse', 'boom', 'vent', 'settle', 'drip'] },
  vents:    { near: 8,  far: 34, lowY: -3, highY: 5,  kinds: ['vent', 'tick', 'settle', 'boom', 'drip'] },
  cut:      { near: 12, far: 46, lowY: -4, highY: 8,  kinds: ['clang', 'settle', 'gust', 'collapse', 'tick'] },
  road:     { near: 18, far: 64, lowY: -2, highY: 10, kinds: ['gust', 'collapse', 'creak', 'glass'] },
  empty:    { near: 22, far: 72, lowY: -2, highY: 12, kinds: ['gust', 'creak', 'collapse', 'glass', 'tick'] },
  interior: { near: 2,  far: 10, lowY: -1, highY: 3,  kinds: ['creak', 'drip', 'tick', 'settle'] },
  under:    { near: 4,  far: 22, lowY: -3, highY: 3,  kinds: ['drip', 'boom', 'vent', 'creak', 'settle'] },
};
