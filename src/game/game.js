/**
 * Game — the orchestrator.
 *
 * Owns the world, the cast, the systems and the mode machine. Everything else
 * in the project is a module this composes; keeping the composition in one
 * readable file is what stops a project this size from turning into a web of
 * cross-imports.
 */

import * as THREE from 'three';
import { Engine, FIXED_DT } from '../core/engine.js';
import { Input } from '../core/input.js';
import { MaterialLibrary, updateWorldUniforms } from '../render/materials.js';
import { PostFX } from '../render/postfx.js';
import { Atmosphere, MOODS } from '../render/atmosphere.js';
import { City } from '../world/city.js';
import { buildHollisData } from '../content/world_data.js';
import { Player, ThirdPersonCamera } from '../actors/player.js';
import { Actor, STATE, separateActors } from '../actors/actor.js';
import { PPM } from '../world/gas.js';
import { CombatSystem } from './combat.js';
import { AISystem, Enemy } from './ai.js';
import { HUD } from '../ui/hud.js';
import { DialogueUI, Menus } from '../ui/screens.js';
import { Director } from './director.js';
import { Storage, DEFAULT_SETTINGS } from './state.js';
import { TIERS, isPortrait } from '../core/engine.js';
import { clamp, clamp01, lerp, damp, Emitter, angleDelta } from '../core/util.js';
import { Rng } from '../core/rng.js';

export const MODE = {
  BOOT: 'boot', TITLE: 'title', PLAY: 'play', DIALOGUE: 'dialogue',
  MENU: 'menu', DEAD: 'dead', CINEMATIC: 'cinematic', LOADING: 'loading',
};

export class Game extends Emitter {
  constructor(canvas) {
    super();
    this.engine = new Engine(canvas).init();
    this.input = new Input(canvas);
    this.mats = new MaterialLibrary(this.engine.tier);
    this.post = new PostFX(this.engine.renderer, this.engine.tier);
    this.post.setSize(this.engine.size.w, this.engine.size.h);
    this.scene = this.engine.scene;
    this.atmos = new Atmosphere(this.scene, this.engine.tier, this.engine.camera);

    this.mode = MODE.BOOT;
    this.actors = [];
    this.rng = new Rng('game');
    this.time = 0;
    this.playTime = 0;

    this.engine.on('resize', (s) => this.post.setSize(s.w, s.h));
    this.engine.on('tier', (t) => {
      this.post.setTier(t);
      this.post.setSize(this.engine.size.w, this.engine.size.h);
      this.atmos.setTier(t);
    });
    this.engine.on('pause', () => this.input.reset());

    this.zone = null;
    this.moodName = 'street';
    this.forcedMood = null;
    this.interiorPpm = null;
    this.settings = { ...DEFAULT_SETTINGS };
    this._interactCandidates = [];
    this._meterCooldown = 0;
  }

  // ------------------------------------------------------------------ boot

  async buildWorld(onProgress = () => {}) {
    onProgress('surveying hollis');
    await frame();
    const data = buildHollisData();
    this.city = new City(data, this.mats, this.engine.tier);
    this.city.build((stage) => onProgress(stage));
    this.scene.add(this.city.root);
    this.atmos.setMarkers(this.city.lightMarkers);
    this.atmos.setFx(this.city.fxMarkers);
    this.gas = this.city.gas;
    this.world = this.city.collision;
    this.nav = this.city.nav;

    // Compile every program now. Deferring this means a visible hitch the
    // first time the player sees a material they have not seen yet, which on a
    // phone is most of the first two minutes.
    onProgress('warming shaders');
    await frame();
    this._warmShaders();

    onProgress('ready');
    return this;
  }

  /**
   * Force compilation of every program the game will use, by putting one
   * throwaway instance of each material in front of the camera for one
   * off-screen render.
   */
  _warmShaders() {
    const r = this.engine.renderer;
    const cam = this.engine.camera;
    const saved = cam.position.clone();
    const savedQ = cam.quaternion.clone();
    try {
      r.compile(this.scene, cam);
    } catch (e) { /* compile is a hint, never a hard requirement */ }
    cam.position.copy(saved);
    cam.quaternion.copy(savedQ);
  }

  spawnPlayer(spawnId = 'start') {
    const s = this.city.spawns.get(spawnId) || { x: 0, y: 0, z: 0, rot: 0 };
    this.player = new Player({
      x: s.x, y: s.y + 0.1, z: s.z, rot: s.rot,
      world: this.world, gas: this.gas, mats: this.mats,
    });
    this.scene.add(this.player.group);
    this.actors.push(this.player);
    this.camera = new ThirdPersonCamera(this.engine.camera, this.world);
    this.camera.yaw = s.rot;

    const ui = document.getElementById('ui');
    this.combat = new CombatSystem(this);
    this.ai = new AISystem(this);
    this.hud = new HUD(this, ui);
    this.dialogueUI = new DialogueUI(this, ui);
    this.menus = new Menus(this, ui);
    this.director = new Director(this);
    this.systems = [this.combat, this.ai, this.director];

    // Pre-create every character/weapon material variant and compile them, so
    // meeting a Warden for the first time does not stall.
    this._warmActorMaterials();

    this._wireFeedback();
    this._wireUI();
    this.applySettings(Storage.loadSettings() || { ...DEFAULT_SETTINGS });
    return this.player;
  }

  _warmActorMaterials() {
    const m = this.mats;
    m.character(0xffffff, { roughness: 0.78, metalness: 0.03 });
    m.character(0x5a5c5e, { roughness: 0.55, metalness: 0.6, flat: true });
    m.character(0x24211d, { roughness: 0.9, flat: true });
    m.character(0x3c3830, { roughness: 0.95, flat: true });
    m.character(0x6b4a34, { roughness: 0.95, metalness: 0.2, flat: true });
    m.character(0x2c333b, { roughness: 0.6, metalness: 0.3, flat: true });
    m.character(0x33383c, { roughness: 0.7, flat: true });
    m.character(0x6a5a4c, { roughness: 0.95, textured: false, flat: true });
    m.glow(0xffd9a0, 3.4);
    m.glow(0x9fe06a, 1.7);
    this._warmShaders();
  }

  /** Connect gameplay events to their audiovisual consequences. */
  _wireFeedback() {
    this.on('damageNumber', (d) => {
      if (!this.settings.showDamageNumbers) return;
      if (d.target === this.player) this.hud.damageNumber(d.amount, d.x, d.y, d.z, 'self');
      else this.hud.damageNumber(d.amount, d.x, d.y, d.z, d.crit ? 'crit' : '');
    });
    // Haptics on player impact, where the device supports it.
    this.on('actor:hurt', (a, d) => {
      if (a !== this.player || !this.vibration || !navigator.vibrate) return;
      try { navigator.vibrate(d.blocked ? 12 : Math.min(60, 14 + d.amount)); } catch { /* ignore */ }
    });
    this.on('actor:footstep', (a, d) => this.emit('sfx', 'step', { x: a.pos.x, y: a.pos.y, z: a.pos.z, ...d }));
    this.on('actor:coughsound', (a, d) => this.emit('sfx', 'cough', { x: a.pos.x, y: a.pos.y + 1.5, z: a.pos.z, player: a === this.player, ...d }));
    this.on('actor:land', (a, d) => {
      this.emit('sfx', d.hard ? 'landHard' : 'land', { x: a.pos.x, y: a.pos.y, z: a.pos.z });
      if (a === this.player) {
        this.camera.addShake(d.hard ? 0.5 : 0.12);
        this.atmos.spawnBurst('step', a.pos.x, a.pos.y + 0.06, a.pos.z, 0, 1, 0, d.hard ? 10 : 4, d.hard ? 1.4 : 0.8);
      }
    });
    this.on('actor:death', (a, d) => {
      this.emit('sfx', 'death', { x: a.pos.x, y: a.pos.y + 1, z: a.pos.z, kind: a.kind });
      if (a !== this.player) {
        // Bodies persist but stop simulating and stop blocking.
        setTimeout(() => { if (a.group) a.group.matrixAutoUpdate = false; }, 4000);
      }
    });
    this.on('actor:telegraph', (a, d) => {
      // A heavy incoming attack gets an unmissable read.
      if (!this.camera || !this.player) return;
      const dist = Math.hypot(a.pos.x - this.player.pos.x, a.pos.z - this.player.pos.z);
      if (dist < 14) this.camera.addShake(0.10 * (1 - dist / 14) + (this.camera.lockTarget === a ? 0.04 : 0));
      this.emit('sfx', 'telegraph', { x: a.pos.x, y: a.pos.y + 1.5, z: a.pos.z });
    });
  }

  /** Menu and screen wiring: one place that owns every mode transition. */
  _wireUI() {
    const m = this.menus;

    this.on('ui:menu', () => {
      if (this.mode === MODE.PLAY) { this.setMode(MODE.MENU); m.openPause('status'); }
      else if (this.mode === MODE.MENU) m.closePause();
    });
    this.on('ui:map', () => {
      if (this.mode === MODE.PLAY) { this.setMode(MODE.MENU); m.openPause('map'); }
    });
    this.on('ui:pauseclose', (fromTitle) => {
      if (fromTitle) { m.showTitle(Storage.hasSave(), __BUILD_ID__); this.setMode(MODE.TITLE); }
      else this.setMode(MODE.PLAY);
    });
    this.on('ui:save', () => {
      const ok = this.director.save(true);
      this.hud.notice(ok ? 'Saved.' : '<b>Not saved.</b> This browser is blocking storage.',
                      ok ? 'good' : 'bad', ok ? 2.4 : 5);
    });
    this.on('ui:useitem', (id) => { this.director.useItem(id); m.refreshInventory(); });
    this.on('ui:retry', () => this._guard(this.director.retry(), MODE.DEAD));
    this.on('ui:quit', () => this._guard(this.toTitle(), MODE.TITLE));

    m.onSettingsChanged = (s) => this.applySettings(s);

    // Orientation nag: the game is landscape, and saying so is kinder than
    // rendering a broken layout.
    const checkOrientation = () => m.setRotateVisible(isPortrait());
    window.addEventListener('resize', checkOrientation, { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(checkOrientation, 200), { passive: true });
    checkOrientation();

    // Engine-level pause (tab hidden, call incoming) opens the menu rather
    // than silently freezing.
    this.engine.on('pause', (reason) => {
      if (reason === 'hidden' || reason === 'blur') {
        if (this.mode === MODE.PLAY) { this.setMode(MODE.MENU); m.openPause('status'); }
      }
    });
  }

  applySettings(s) {
    // Computed first, because `s` may BE this.settings — the settings panel
    // writes into the live object, and replacing it here is what used to throw
    // away every change after the first.
    const merged = { ...DEFAULT_SETTINGS, ...s };
    if (!this.settings) this.settings = merged;
    else Object.assign(this.settings, merged);
    const S = this.settings;
    this.menus.settings = S;
    document.documentElement.style.setProperty('--uiscale', String(S.uiScale));
    this.input.lookSensitivity = S.lookSensitivity;
    this.input.invertY = S.invertY;
    this.input.leftHanded = S.leftHanded;
    document.body.classList.toggle('lefthanded', !!S.leftHanded);
    this.input.autoSprint = S.autoSprint;
    if (this.camera) this.camera.sensitivity = S.lookSensitivity;
    if (S.quality === 'auto') this.engine.tierLocked = false;
    else this.engine.setTier(S.quality, true);
    this.hud.setPerfVisible(S.showPerf);
    this.audio?.setVolumes(S.masterVolume, S.musicVolume, S.sfxVolume);
    // Accessibility that changes simulation, not only presentation.
    if (this.player) {
      this.player.lungs.tolerance = S.gasAssist ? 2.1 : 1;
      this.player.combatAssist = S.combatAssist;
    }
    if (this.combat) this.combat.maxAttackers = S.combatAssist >= 1 ? 1 : 2;

    // Interface contrast and motion.
    document.body.classList.toggle('hicontrast', !!S.highContrastHud);
    document.body.classList.toggle('reduced', !!S.reducedMotion);
    if (this.camera) {
      this.camera.shakeScale = S.screenShake * (S.reducedMotion ? 0.35 : 1);
      this.camera.autoFollow = S.reducedMotion ? 1.6 : 0.55;
    }
    // Reduced motion also thins the particle systems, which is the other half
    // of what makes a busy frame uncomfortable.
    this.atmos.motionScale = S.reducedMotion ? 0.35 : 1;
    if (this.hud) {
      this.hud.showDamageNumbers = S.showDamageNumbers;
      this.hud.subtitlesOn = S.subtitles;
    }
    this.vibration = S.vibration;

    Storage.saveSettings(S);
  }

  /**
   * Watchdog for async mode transitions fired from event handlers.
   *
   * Emitter wraps handlers in try/catch, which catches a synchronous throw and
   * does nothing at all about a rejected promise. Every one of these
   * transitions disables input and raises the fade before its first await, so
   * a throw after that point leaves the game opaque, inputless and with no
   * reachable control of any kind. On failure, put the player somewhere they
   * can act from and clear the fade.
   */
  _guard(promise, fallbackMode) {
    if (!promise || typeof promise.catch !== 'function') return promise;
    return promise.catch((err) => {
      if (__DEV__) console.error('mode transition failed', err);
      try { this.menus.fadeIn(); } catch { /* the fade is best-effort */ }
      this.hud.setVisible(fallbackMode === MODE.PLAY);
      this.setMode(fallbackMode);
    });
  }

  async toTitle() {
    await this.menus.fadeOut();
    this.menus.closePause();
    this.menus.hideDeath();
    this.menus.hideEnding();
    this.hud.setVisible(false);
    this.setMode(MODE.TITLE);
    this.menus.showTitle(Storage.hasSave(), __BUILD_ID__);
    // Park the camera somewhere that looks like a title card.
    this.setTitleCamera();
    await this.menus.fadeIn();
  }

  /**
   * Park the camera for the title card.
   *
   * The stylesheet's scrim is deliberately semi-opaque so the city shows
   * through, which only works if there is a composition behind it. Ren is
   * hidden — she is the thing the player is about to become, not part of the
   * mark — and the camera looks east down Marrow Street toward the burn glow
   * with a plume in the mid-ground.
   */
  setTitleCamera() {
    const s = this.city.spawns.get('marrow_west');
    if (!s || !this.player) return;
    this.player.pos.set(s.x, 0.2, s.z);
    this.player.vel.set(0, 0, 0);
    this.player.group.visible = false;
    this.camera.yaw = TITLE_YAW;
    this.camera.pitch = TITLE_PITCH;
    this.camera._init = false;
  }

  /** Spawn an enemy of the given archetype. */
  spawnEnemy(kind, x, z, opts = {}) {
    const g = this.world.groundUnder(x, z, 0.4, (opts.y ?? 0) + 6, 12);
    const e = new Enemy(kind, {
      x, z, y: g ? g.y + 0.05 : (opts.y ?? 0),
      world: this.world, gas: this.gas, mats: this.mats,
      seed: this.rng.int(1, 1e6), ...opts,
    });
    return this.addActor(e);
  }

  addActor(actor) {
    this.actors.push(actor);
    this.scene.add(actor.group);
    return actor;
  }

  removeActor(actor) {
    const i = this.actors.indexOf(actor);
    if (i >= 0) this.actors.splice(i, 1);
    this.scene.remove(actor.group);
    actor.dispose();
  }

  /** Move the player to a spawn point, e.g. after an interior transition. */
  teleport(spawnId) {
    const s = this.city.spawns.get(spawnId);
    if (!s) return false;
    this.player.pos.set(s.x, s.y + 0.1, s.z);
    this.player.vel.set(0, 0, 0);
    this.player.yaw = this.player.targetYaw = s.rot;
    this.camera.yaw = s.rot;
    this.camera._init = false;
    return true;
  }

  // ------------------------------------------------------------------ loop

  start() {
    this.engine.addUpdater((dt, t) => this.fixedUpdate(dt, t), 0);
    this.engine.on('render', (dt) => this.render(dt));
    this.engine.start();
  }

  fixedUpdate(dt) {
    this.time += dt;
    this.input.step(dt);
    if (this._meterCooldown > 0) this._meterCooldown -= dt;

    const playing = this.mode === MODE.PLAY;
    if (playing) this.playTime += dt;

    // The world keeps breathing during dialogue and menus; only simulation of
    // the cast pauses. A city that freezes when you open a menu feels like a
    // diorama.
    this.gas.update(playing || this.mode === MODE.DIALOGUE ? dt : dt * 0.25);

    if (playing) {
      this._playerInput(dt);
    } else if (this.player) {
      this.player.setMove(0, 0, 0);
      this.player.wantSprint = false;
      this.player.guarding = false;
    }

    if (this.player && this.interiorPpm !== null && this.interiorPpm !== undefined) {
      this.player.interiorPpm = this.interiorPpm;
    } else if (this.player) this.player.interiorPpm = null;

    const ctx = { time: this.time, game: this };
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      if (this.mode === MODE.MENU) continue;
      a.update(dt, ctx);
      this._drainEvents(a);
    }

    // Push overlapping actors apart. Without it a pack occupies one point, the
    // player walks through enemies, and a group encounter is one silhouette.
    if (this.mode !== MODE.MENU) separateActors(this.actors, dt, this.player);

    if (this.systems) {
      for (const s of this.systems) {
        if (s.update) s.update(dt, this);
      }
    }

    this._updateZone(dt);
  }

  _drainEvents(a) {
    if (!a.events.length) return;
    for (const e of a.events) this.emit('actor:' + e.name, a, e.data);
    a.events.length = 0;
  }

  /** Map raw input to player intent. */
  _playerInput(dt) {
    const p = this.player;
    const inp = this.input;
    if (!p || p.dead) return;

    // Camera look
    const look = inp.takeLook();
    if (look.x || look.y) this.camera.look(look.x, look.y);

    // Movement, camera-relative.
    const f = this.camera.forwardXZ(_vA);
    const r = this.camera.rightXZ(_vB);
    const mx = r.x * inp.move.x + f.x * -inp.move.y;
    const mz = r.z * inp.move.x + f.z * -inp.move.y;
    const mag = inp.move.mag;

    if (p.state === STATE.CLIMB) {
      p.setMove(mx, mz, mag);
      if (inp.pressed('dodge') || inp.pressed('interact')) p.exitClimb();
      return;
    }

    p.setMove(mag > 0.001 ? mx / Math.max(1e-4, Math.hypot(mx, mz)) * mag : 0,
              mag > 0.001 ? mz / Math.max(1e-4, Math.hypot(mx, mz)) * mag : 0, mag);
    p.wantSprint = p.sprintGate(inp.down('sprint') && mag > 0.5);
    p.crouch = inp.down('crouch') ? 1 : 0;

    // Combat inputs are handed to the combat system through the buffer so that
    // presses during recovery frames are honoured.
    if (inp.pressed('attack')) p.bufferAction('attack');
    if (inp.pressed('heavy')) p.bufferAction('heavy');
    if (inp.pressed('dodge')) p.bufferAction('dodge');
    if (inp.pressed('use')) this.director.quickUse();
    if (inp.pressed('menu')) this.emit('ui:menu');
    if (inp.pressed('map')) this.emit('ui:map');
    p.guarding = inp.down('guard') && p.canAct && !p.isAttacking && p.stamina > 1;

    if (inp.pressed('lamp')) {
      p.lampOn = !p.lampOn;
      this.emit('lamp', p.lampOn);
    }

    if (inp.pressed('meter')) this.readMeter();

    if (inp.pressed('interact')) {
      if (!this._tryInteract()) p.tryClimb();
    }

    // Drain the action buffer into the combat system. Trying every step (not
    // only on press) is what makes a tap during recovery still land.
    const queued = p.peekBuffered();
    if (queued && this.combat.handlePlayerAction(p, queued, this)) p.takeBuffered();

    this._updateLockOn(inp);
    this._updateInteractTarget();
  }

  /**
   * Lock-on. A tap on the camera surface (or the lock button) grabs the best
   * target; tapping again while locked switches to the next one; tapping with
   * nothing in range releases.
   */
  _updateLockOn(inp) {
    const p = this.player;
    if (!this._lockTapHooked) {
      this._lockTapHooked = true;
      this.input.on('camtap', () => this._cycleLock());
    }
    if (inp.pressed('lockon')) this._cycleLock();

    const t = this.camera.lockTarget;
    if (t && (t.dead || Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z) > 22)) {
      this.camera.lockTarget = null;
      p.animator.lookAt = null;
    }
    if (this.camera.lockTarget) {
      const q = this.camera.lockTarget;
      p.animator.lookAt = _vA.set(q.pos.x - p.pos.x, (q.pos.y + 1.3) - (p.pos.y + 1.5), q.pos.z - p.pos.z)
        .applyAxisAngle(_up, -p.yaw);
      // While locked and not steering, keep facing the target.
      if (p.moveInput.mag < 0.15 && !p.attack) p.faceTowards(q.pos.x, q.pos.z);
    } else {
      p.animator.lookAt = null;
    }
  }

  _cycleLock() {
    const p = this.player;
    const cur = this.camera.lockTarget;
    const cands = [];
    for (const a of this.actors) {
      if (a === p || a.dead) continue;
      if (a.faction === 'player' || a.faction === 'neutral') continue;
      const d = Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z);
      if (d > 20) continue;
      if (Math.abs(a.pos.y - p.pos.y) > 4) continue;
      // Score by how close to the camera's forward it is, then by distance.
      const ang = Math.abs(angleDelta(this.camera.yaw + Math.PI,
        Math.atan2(a.pos.x - p.pos.x, a.pos.z - p.pos.z)));
      if (ang > 1.45) continue;
      cands.push({ a, score: ang * 5 + d * 0.6 });
    }
    if (!cands.length) { this.camera.lockTarget = null; return; }
    cands.sort((x, y) => x.score - y.score);
    if (!cur) { this.camera.lockTarget = cands[0].a; this.emit('sfx', 'lockon'); return; }
    const i = cands.findIndex((c) => c.a === cur);
    if (i < 0) { this.camera.lockTarget = cands[0].a; return; }
    if (cands.length === 1) { this.camera.lockTarget = null; return; }
    this.camera.lockTarget = cands[(i + 1) % cands.length].a;
    this.emit('sfx', 'lockon');
  }

  /** Find the best thing in front of the player to interact with. */
  _updateInteractTarget() {
    const p = this.player;
    let best = null, bestScore = Infinity;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const inInterior = this.director ? this.director.currentInterior : null;
    for (const it of this.city.interactions) {
      if (it.disabled) continue;
      if ((it.interior || null) !== inInterior) continue;
      const dx = it.x - p.pos.x, dz = it.z - p.pos.z;
      const dy = (it.y ?? 1) - p.pos.y;
      const d = Math.hypot(dx, dz);
      const range = it.range ?? 2.6;
      if (d > range || Math.abs(dy) > 2.4) continue;
      const dot = d > 0.05 ? (dx / d) * fx + (dz / d) * fz : 1;
      if (dot < 0.25) continue;
      const score = d - dot * 1.2;
      if (score < bestScore) { bestScore = score; best = it; }
    }
    // People take priority over scenery when both are in reach.
    const npcT = this.director ? this.director.npcInteractTarget() : null;
    if (npcT) best = npcT;

    // Ladders are an interaction too, and they need a prompt.
    if (!best) {
      const box = this.world.climbAt(p.pos.x + fx * 0.5, p.pos.y, p.pos.z + fz * 0.5, 0.6);
      if (box && p.state !== STATE.CLIMB) best = { kind: 'climb', label: 'Climb', prompt: 'Climb' };
    }
    p.interactTarget = best;
    this.hud.setPrompt(best ? (best.prompt || best.label || 'Interact') : '', best && best.kind);
  }

  /**
   * Read the meter. Ren lifts it, waits for it to settle, and says what it
   * says. Without READ THE AIR that is a single number in one place; with it
   * she also knows which way the ground is getting better, which is the
   * difference between guessing and navigating.
   */
  readMeter() {
    const p = this.player;
    if (!p || p.dead || !p.canAct || p.isAttacking) return false;
    if (this._meterCooldown > 0) return false;
    this._meterCooldown = 1.1;

    p.animator.play('readMeter', { fade: 0.11 });
    this.audio?.play('meter');

    const ppm = p.ambientPpm || 0;
    const verdict =
      ppm > PPM.LETHAL ? 'LETHAL. Leave now.'
      : ppm > PPM.DANGER ? 'Dangerous. Minutes, not hours.'
      : ppm > PPM.ELEVATED ? 'Elevated. Headache within the hour.'
      : ppm > PPM.CLEAR ? 'Working air. Not clean air.'
      : 'Clear. As clear as Hollis gets.';

    const r = { ppm, text: verdict, trend: null };

    if (this.director?.state?.can('readAir')) {
      // Sample a ring at head height and report the best bearing relative to
      // where Ren is facing, so the answer is usable without a map.
      const g = this.city.gas;
      const here = g.sample(p.pos.x, p.pos.y + 1.4, p.pos.z);
      let bestA = 0, bestV = here, worstV = here;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const v = g.sample(p.pos.x + Math.sin(a) * 9, p.pos.y + 1.4, p.pos.z + Math.cos(a) * 9);
        if (v < bestV) { bestV = v; bestA = a; }
        if (v > worstV) worstV = v;
      }
      const spread = worstV - bestV;
      if (spread < Math.max(20, here * 0.12)) {
        r.trend = 'FLAT';
        r.text += '  ·  No better anywhere within ten metres.';
      } else {
        const rel = angleDelta(bestA, p.yaw);
        const dir = Math.abs(rel) < 0.45 ? 'AHEAD'
          : Math.abs(rel) > Math.PI - 0.45 ? 'BEHIND'
          : rel > 0 ? 'LEFT' : 'RIGHT';
        r.trend = `↓ ${dir}`;
        r.text += `  ·  Air improves ${dir.toLowerCase()} (${Math.round(bestV)} ppm).`;
      }
      // Height matters more than distance and the manual says so.
      if (here > PPM.ELEVATED) r.text += ' Get higher.';
    }

    this.hud.showMeterReading(r);
    this.emit('meter:read', r);
    return true;
  }

  _tryInteract() {
    const t = this.player.interactTarget;
    if (!t) return false;
    this.emit('interact', t);
    return true;
  }

  /** Region, mood and ambience follow the player. */
  _updateZone(dt) {
    if (!this.player) return;
    const p = this.player.pos;
    const region = this.city.regionAt(p.x, p.z);
    if (region !== this.zone) {
      this.zone = region;
      this.emit('zone', region);
    }

    // Mood is chosen from altitude relative to the local ground, which is the
    // rule the whole game runs on. Interiors override it explicitly.
    let mood = this.forcedMood;
    if (!mood) {
      const groundY = this.gas.groundAt(p.x, p.z);
      const above = p.y - groundY;
      if (p.y < -1.5) mood = 'low';
      else if (above > 7.5) mood = 'high';
      else if (region && region.id === 'cut') mood = 'authority';
      else if (region && region.id === 'ventfield') mood = 'authority';
      else mood = 'street';
    }
    if (mood !== this.moodName) {
      this.moodName = mood;
      this.atmos.setMood(mood);
    }
  }

  // ---------------------------------------------------------------- render

  render(dt) {
    const p = this.player;
    if (p && this.camera) {
      const moving = Math.hypot(p.vel.x, p.vel.z) / p.speedRun;
      this.camera.update(dt, p, {
        moving, sprinting: p.wantSprint && moving > 0.6,
        indoors: this.moodName === 'interior' || this.moodName === 'under',
      });
    }

    const camPos = this.engine.camera.position;
    this.atmos.update(dt, p ? p.pos : camPos, p ? p.ambientPpm : 0);

    // Post grade responds to the player's state: hypoxia at the edges,
    // exposure lifting slightly in the dark so interiors stay readable.
    if (p) {
      const g = this.post.grade;
      g.hypoxia = damp(g.hypoxia, p.lungs.severity * 0.9, 0.4, dt);
      g.flash = damp(g.flash, 0, 0.06, dt);
      const target = this.moodName === 'under' ? 1.25 : this.moodName === 'interior' ? 1.15 : 1.05;
      g.exposure = damp(g.exposure, target, 0.7, dt);
      g.vignette = damp(g.vignette, 0.42 + p.lungs.severity * 0.24 + clamp01(1 - p.hp / p.maxHp) * 0.12, 0.5, dt);
    }

    if (this.audio) this.audio.update(dt);
    if (this.hud) { this.hud.update(dt); this.hud.updatePerf(); }
    if (this.dialogueUI) this.dialogueUI.update(dt);

    updateWorldUniforms(this.engine.time);
    if (this.atmos.shadowDirty) {
      this.engine.renderer.shadowMap.needsUpdate = true;
      this.atmos.shadowDirty = false;
    }
    this.engine.renderer.info.reset();
    this.post.render(this.scene, this.engine.camera, this.engine.time);
  }

  /** Screen flash — impacts, explosions, revelations. */
  flash(color, amount = 0.5) {
    this.post.grade.flashColor.setHex(color);
    this.post.grade.flash = amount;
  }

  setMode(m) {
    if (this.mode === m) return;
    const prev = this.mode;
    this.mode = m;
    this.input.setEnabled(m === MODE.PLAY);
    this.emit('mode', m, prev);
  }
}

/** Title-card framing. Swept with tools/shot.mjs; see README. */
export const TITLE_YAW = 2.10;
export const TITLE_PITCH = -0.02;

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
