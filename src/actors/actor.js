/**
 * Actor — the shared body for everyone in Hollis.
 *
 * Holds the rig, the animator, a capsule that moves through the collision
 * world, vitals, lungs, and the small state machine that every character needs
 * (grounded, staggered, dead). The player and every enemy specialise it rather
 * than reimplementing it, which is what keeps the gas rules, the collision
 * rules and the damage rules identical for all of them — you can suffocate a
 * scavenger exactly the way a scavenger can suffocate you.
 */

import * as THREE from 'three';
import { buildCharacter, buildWeapon, BONE_INDEX } from './rig.js';
import { Animator, CLIPS, MASK } from './anim.js';
import { moveActor, LAYER } from '../world/collision.js';
import { Lungs, PPM, SAT_CRITICAL, GAS_MAX_DPS } from '../world/gas.js';
import { clamp, clamp01, lerp, damp, dampAngle, angleDelta, approachAngle, TAU } from '../core/util.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

export const STATE = {
  IDLE: 'idle', STAGGER: 'stagger',
  DOWN: 'down', DEAD: 'dead', CLIMB: 'climb', VAULT: 'vault',
};

/**
 * Defence economy.
 *
 * Raising a guard costs stamina and holding one spends it, which is the only
 * thing that puts a clock on turtling. Without these three numbers a held guard
 * regenerated more stamina than it consumed and blocked away 86% of every blow,
 * so standing still with the button down was a strictly dominant strategy that
 * no enemy in the game had an answer to.
 */
const GUARD_RAISE_COST = 8;     // stamina, on the rising edge
const GUARD_DRAIN = 6;          // stamina per second while held
const PARRY_REARM = 0.9;        // seconds before a new parry window may open
/** Fraction of a blocked blow that still reaches you. */
const BLOCK_THROUGH = 0.30;
const BLOCK_THROUGH_BREAK = 0.60;
/** Poise stops regenerating for this long after any hit. */
const POISE_HOLD = 1.2;

let _uid = 1;

export class Actor {
  /**
   * @param {object} opts
   *   costume, detail, mats, world (CollisionWorld), gas (GasField),
   *   maxHp, maxStamina, weapon, masked, faction
   */
  constructor(opts) {
    this.id = _uid++;
    this.opts = opts;
    this.name = opts.name || 'actor';
    this.faction = opts.faction || 'neutral';
    this.world = opts.world;
    this.gas = opts.gas;

    // --- body -------------------------------------------------------------
    this.rig = buildCharacter(opts.costume || 'civ', opts.detail ?? 1, opts.seed ?? this.id);
    this.animator = new Animator(this.rig);
    this.animator.onEvent = (name, clipName, a) => this.onAnimEvent(name, clipName, a);

    const mat = opts.mats.character(0xffffff, { roughness: 0.78, metalness: 0.03 });
    this.mesh = new THREE.SkinnedMesh(this.rig.geometry, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = true;
    this.mesh.add(this.rig.root);
    this.mesh.bind(this.rig.skeleton);

    this.group = new THREE.Group();
    this.group.name = `actor:${this.name}`;
    this.group.add(this.mesh);

    // Bone handles. Cached before anything wants to attach to them.
    this.headBone = this.rig.bones[BONE_INDEX.head];
    this.chestBone = this.rig.bones[BONE_INDEX.chest];
    this.handR = this.rig.bones[BONE_INDEX.handR];
    this.handL = this.rig.bones[BONE_INDEX.handL];

    // Weapon attachment
    this.weaponKind = opts.weapon || null;
    this.weapon = null;
    this.offhandKind = opts.offhand || null;
    this.offhand = null;
    if (this.weaponKind) this.setWeapon(this.weaponKind, opts.mats);
    if (this.offhandKind) this.setOffhand(this.offhandKind, opts.mats);

    // --- physics ----------------------------------------------------------
    this.pos = new THREE.Vector3(opts.x || 0, opts.y || 0, opts.z || 0);
    this.vel = new THREE.Vector3();
    this.radius = opts.radius ?? 0.34;
    this.height = opts.height ?? 1.72;
    this.stepHeight = 0.44;
    this.gravity = 24;
    this.grounded = false;
    this.groundY = this.pos.y;
    this.fallStartY = this.pos.y;
    this.coyote = 0;

    this.yaw = opts.rot || 0;
    this.targetYaw = this.yaw;
    this.turnRate = opts.turnRate ?? 9.5;

    // --- vitals -----------------------------------------------------------
    this.maxHp = opts.maxHp ?? 100;
    this.hp = this.maxHp;
    this.maxStamina = opts.maxStamina ?? 100;
    this.stamina = this.maxStamina;
    this.staminaRegen = opts.staminaRegen ?? 24;
    this._staminaHold = 0;

    this.poise = opts.poise ?? 40;
    this.poiseCurrent = this.poise;

    this.lungs = new Lungs({
      masked: opts.masked ?? false,
      filter: opts.masked ? (opts.filter ?? 1) : null,
      filterQuality: opts.filterQuality ?? 0.85,
      tolerance: opts.tolerance ?? 1,
    });
    // Wardens run bottled air; the gas is simply not their problem.
    this.gasImmune = !!opts.gasImmune;

    this.state = STATE.IDLE;
    this.dead = false;
    this.hitstop = 0;
    this.staggerTime = 0;

    this.speedWalk = opts.speedWalk ?? 2.05;
    this.speedRun = opts.speedRun ?? 4.15;
    this.speedSprint = opts.speedSprint ?? 5.8;
    this.accel = opts.accel ?? 26;
    this.decel = opts.decel ?? 30;

    this.combatAssist = 0;
    this.moveInput = { x: 0, z: 0, mag: 0 };
    this.wantSprint = false;
    this.crouch = 0;
    this.alert = 0;

    // Attack bookkeeping — the combat system reads and writes these.
    this.attack = null;
    this.comboWindow = 0;
    this.comboNext = null;
    this.guarding = false;
    this.guardHealth = opts.guardHealth ?? 60;
    this.guardCurrent = this.guardHealth;
    this.parryWindow = 0;
    this.iframes = 0;
    /** Set by combat.js when it owns the i-frame window; anim events defer. */
    this.iframeLock = false;
    /** Committed-displacement window: movement damping is suppressed inside it. */
    this.dodgeT = 0;
    this.dodgeCooldown = 0;
    /** Set true by the capability sync when Ren has `hardHands`. */
    this.parryBonus = false;
    this.poiseResist = opts.poiseResist ? 0.5 : 1;

    this._guardWasDown = false;
    this._guardLock = 0;
    this._parryRearm = 0;
    this._parryArmed = false;
    this._poiseHold = 0;
    this.climbing = null;
    this.interiorPpm = null;
    this.lastDeathCause = null;
    this.lastFootstep = 0;
    this.lastCough = 0;
    this.events = [];         // drained by the game each frame

    this.group.position.copy(this.pos);
  }

  setWeapon(kind, mats) {
    if (this.weapon) { this.handR.remove(this.weapon); this.weapon = null; }
    this.weaponKind = kind;
    if (!kind) return;
    this.weapon = buildWeapon(kind, mats || this.opts.mats);
    // Grip: the weapon's local origin sits in the palm, angled into the hand.
    this.weapon.position.set(0, -0.07, 0.02);
    this.weapon.rotation.set(-Math.PI / 2 + 0.28, 0, 0);
    this.handR.add(this.weapon);
  }

  setOffhand(kind, mats) {
    if (this.offhand) { this.handL.remove(this.offhand); this.offhand = null; }
    this.offhandKind = kind;
    if (!kind) return;
    this.offhand = buildWeapon(kind, mats || this.opts.mats);
    this.offhand.position.set(0, -0.06, 0.02);
    this.offhand.rotation.set(-Math.PI / 2 + 0.2, 0, 0);
    this.handL.add(this.offhand);
  }

  /**
   * Give this actor its own material instance so it can be lit from inside.
   *
   * The material cache hands the same MeshStandardMaterial to everyone with the
   * same costume parameters, so flashing one would flash the whole crowd. Only
   * actors that actually need a tell pay for the clone — currently the ones
   * with a telegraphed attack, which is two archetypes.
   */
  enableSelfLight() {
    if (this._ownMat) return;
    this._ownMat = this.mesh.material.clone();
    this.mesh.material = this._ownMat;
    this._flashT = 0;
    this._flashDur = 1;
  }

  /**
   * The visual half of a telegraph: the body glows and throbs for the rest of
   * the wind-up. `telegraph` used to be audio and a camera shake that only
   * fired if you happened to be locked on to the attacker, which meant a
   * Breaker in a crowd announced itself to nobody.
   */
  telegraphFlash(duration = 0.6) {
    if (!this._ownMat) return;
    this._flashT = duration;
    this._flashDur = Math.max(0.08, duration);
  }

  _updateSelfLight(dt) {
    if (!this._ownMat) return;
    if (this._flashT <= 0) {
      if (this._ownMat.emissiveIntensity !== 0) {
        this._ownMat.emissiveIntensity = 0;
      }
      return;
    }
    this._flashT = Math.max(0, this._flashT - dt);
    const k = this._flashT / this._flashDur;
    // Throb faster as the swing approaches; the rhythm is the countdown.
    const throb = 0.55 + 0.45 * Math.sin((1 - k) * (1 - k) * 46 + k * 6);
    this._ownMat.emissive.setRGB(1.0, 0.38, 0.12);
    this._ownMat.emissiveIntensity = throb * (0.35 + 0.65 * (1 - k)) * 1.5;
  }

  /** World-space position of a bone (for effects, lock-on, dialogue framing). */
  bonePos(bone, out = _v) {
    bone.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(bone.matrixWorld);
  }

  get eyePos() { return this.bonePos(this.headBone, _v2); }
  get centre() { return _v2.set(this.pos.x, this.pos.y + this.height * 0.55, this.pos.z); }

  emit(name, data) { this.events.push({ name, data }); }

  // ------------------------------------------------------------------ move

  /** Desired movement direction in world XZ, magnitude 0..1. */
  setMove(x, z, mag) {
    this.moveInput.x = x; this.moveInput.z = z; this.moveInput.mag = mag;
  }

  faceTowards(x, z, instant = false) {
    const a = Math.atan2(x - this.pos.x, z - this.pos.z);
    this.targetYaw = a;
    if (instant) this.yaw = a;
  }

  get canAct() {
    return !this.dead && this.state !== STATE.STAGGER && this.state !== STATE.DOWN &&
           this.state !== STATE.CLIMB && this.state !== STATE.VAULT;
  }

  get isAttacking() { return this.attack !== null; }

  get currentSpeed() {
    if (this.crouch > 0.5) return this.speedWalk * 0.52;
    if (this.wantSprint && this.stamina > 1) return this.speedSprint;
    return this.moveInput.mag > 0.72 ? this.speedRun : this.speedWalk * (0.4 + this.moveInput.mag * 0.9);
  }

  // ---------------------------------------------------------------- update

  update(dt, ctx) {
    if (this.hitstop > 0) {
      // Hit-stop freezes the whole actor for a few frames on impact. It is the
      // single cheapest thing that makes a hit feel like it connected.
      this.hitstop -= dt;
      this.animator.update(dt * 0.08);
      this.group.position.copy(this.pos);
      return;
    }

    this.iframes = Math.max(0, this.iframes - dt);
    if (this.iframes <= 0) this.iframeLock = false;
    this.parryWindow = Math.max(0, this.parryWindow - dt);
    this.comboWindow = Math.max(0, this.comboWindow - dt);
    this._staminaHold = Math.max(0, this._staminaHold - dt);
    this._poiseHold = Math.max(0, this._poiseHold - dt);
    this.dodgeT = Math.max(0, this.dodgeT - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);

    if (this.state === STATE.STAGGER) {
      this.staggerTime -= dt;
      if (this.staggerTime <= 0) this.state = STATE.IDLE;
    }

    this._updateSelfLight(dt);
    this._updateGuard(dt);
    this._updateMovement(dt);
    this._updateVitals(dt, ctx);
    this._updateAnimation(dt);

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
  }

  _updateMovement(dt) {
    if (this.state === STATE.CLIMB) { this._updateClimb(dt); return; }

    let ax = 0, az = 0;
    const locked = !this.canAct || this.dead;

    if (this.dodgeT > 0 && !this.dead) {
      // A dodge is a committed displacement. The ordinary accel/decel term is
      // 48 m/s^2 and would erase the impulse in a tenth of a second — with the
      // stick held it erased it in six frames, which is why the evade used to
      // move the body about the width of a doorframe. Inside this window the
      // body only sheds a little to drag.
      ax = -this.vel.x * 1.2;
      az = -this.vel.z * 1.2;
    } else if (!locked) {
      const speed = this.currentSpeed;
      let mx = this.moveInput.x, mz = this.moveInput.z;
      const mag = this.moveInput.mag;

      // Attacks and guards restrict movement rather than forbidding it — being
      // able to creep during a swing is what makes spacing readable.
      let scale = 1;
      if (this.attack) scale = this.attack.moveScale ?? 0.12;
      else if (this.guarding) scale = 0.42;

      const desiredX = mx * speed * scale;
      const desiredZ = mz * speed * scale;

      const a = mag > 0.02 ? this.accel : this.decel;
      ax = (desiredX - this.vel.x) * a;
      az = (desiredZ - this.vel.z) * a;
      // Clamp so a fast direction change is snappy but not instantaneous.
      const amax = a * 1.6;
      const alen = Math.hypot(ax, az);
      if (alen > amax) { ax = ax / alen * amax; az = az / alen * amax; }

      if (mag > 0.06 && !this.attack) {
        // Face the direction of travel; the turn rate is what makes movement
        // feel like a body rather than a cursor.
        this.targetYaw = Math.atan2(mx, mz);
      }
    } else {
      ax = -this.vel.x * this.decel * 0.8;
      az = -this.vel.z * this.decel * 0.8;
    }

    this.vel.x += ax * dt;
    this.vel.z += az * dt;

    // Root motion from the active clip pushes the body along its facing.
    if (this.attack && this.attack.rootMotion) {
      const rm = this.animator.out.rootZ;
      const drm = rm - (this._lastRootZ ?? 0);
      this._lastRootZ = rm;
      this.pos.x -= Math.sin(this.yaw) * drm * this.attack.rootMotion;
      this.pos.z -= Math.cos(this.yaw) * drm * this.attack.rootMotion;
    } else {
      this._lastRootZ = 0;
    }

    const prevTurn = this.yaw;
    const turnSpeed = this.turnRate * (this.attack ? 0.28 : this.guarding ? 0.7 : 1);
    this.yaw = dampAngle(this.yaw, this.targetYaw, 1 / Math.max(0.5, turnSpeed), dt);
    this.turnRateNow = angleDelta(prevTurn, this.yaw) / Math.max(1e-4, dt);

    const r = moveActor(this.world, this, dt);
    this.grounded = r.grounded;
    this.lastMove = r;

    if (r.fellDist > 2.6 && !this.dead) {
      // Falls hurt, and past a point they kill. The term is deliberately NOT
      // clamped at the knee: clamping made nine metres and sixty metres the
      // same 92 damage, which is less than anyone's health, so in a game about
      // climbing you could step off any roof in Hollis for free.
      // ~6 m bruises, ~9 m nearly finishes you, ~12 m is fatal.
      const dmg = Math.min(400, Math.pow(Math.max(0, (r.fellDist - 2.6) / 6.4), 1.6) * 92);
      if (dmg > 2) this.damage({ amount: dmg, kind: 'fall', stagger: dmg > 22 });
      this.emit('land', { hard: dmg > 8, dist: r.fellDist });
      this.animator.play('land', { speed: dmg > 8 ? 0.85 : 1.3 });
    } else if (r.grounded && r.fellDist > 0.7) {
      this.emit('land', { hard: false, dist: r.fellDist });
    }
  }

  /**
   * Guard and parry.
   *
   * Raising the guard plays the parry clip, whose event opens a short window.
   * Hold it and you are blocking; catch a blow inside the window and you parry.
   * That is the whole mechanic: a parry is a well-timed *block*, not a separate
   * button, which is the only version of it that works with five touch buttons.
   *
   * What makes it a mechanic rather than an exploit is the price. Raising costs
   * stamina, holding drains it, and a fresh parry window cannot be opened
   * inside PARRY_REARM of the last one. Mashing the button at 8 Hz used to buy
   * a 160 ms parry window every 125 ms — better than 100% uptime, for free,
   * with one thumb, permanently stagger-locking every melee enemy in the game.
   */
  _updateGuard(dt) {
    this._parryRearm = Math.max(0, this._parryRearm - dt);
    this._guardLock = Math.max(0, this._guardLock - dt);

    if (this.dead) { this.guarding = false; this._guardWasDown = false; return; }

    // Refusals. `guarding` is written from outside (input, AI) every step, so
    // a refusal has to hold the button down for a moment or it re-fires.
    if (this.guarding && (this._guardLock > 0 || !this.canAct)) this.guarding = false;
    if (this.guarding && this.iframeLock && this.iframes > 0) this.guarding = false;
    if (this.guarding && !this._guardWasDown && this.stamina < GUARD_RAISE_COST) {
      this.guarding = false;
      this._guardLock = 0.4;
      this.emit('guardfail', {});
    }

    const up = this.guarding;
    const rose = up && !this._guardWasDown;
    const dropping = !up && this._guardWasDown;
    this._guardWasDown = up;

    if (rose) {
      this.stamina = Math.max(0, this.stamina - GUARD_RAISE_COST);
      this._staminaHold = Math.max(this._staminaHold, 0.4);
    }
    if (up) {
      // Holding a guard is work. This is the clock on turtling.
      this.stamina = Math.max(0, this.stamina - GUARD_DRAIN * dt);
      if (this.stamina <= 0) {
        this.guarding = false;
        this._guardWasDown = false;
        this._guardLock = 0.7;
        this.emit('guardfail', {});
      }
    }

    if (rose && this.canAct && !this.attack) {
      if (this._parryRearm <= 0) {
        this._parryRearm = PARRY_REARM;
        this._parryArmed = true;
        // `force` restarts the clip, so this must never fire on a frame where
        // the parry is already running or the pose freezes at its first key.
        if (this.animator.actionName !== 'parry') {
          this.animator.play('parry', { fade: 0.04, force: true });
        }
      } else {
        // Too soon after the last one. This is a block, and it looks like one.
        this._parryArmed = false;
        this.animator.play('guard', { fade: 0.06 });
      }
      this.emit('guardraise', { parry: this._parryArmed });
    } else if (up && !this.attack && this.animator.actionName !== 'parry' &&
               this.animator.actionName !== 'guard' && this.animator.actionName !== 'guardhit') {
      this.animator.play('guard', { fade: 0.09 });
    } else if (dropping && (this.animator.actionName === 'guard' || this.animator.actionName === 'parry')) {
      this._parryArmed = false;
      this.animator.stopAction(0.12);
    }
    // The parry window closes on its own; guard persists as long as it is held.
    if (up && this.animator.actionName === 'parry' && this.animator.actionT >= 1) {
      this.animator.play('guard', { fade: 0.08 });
    }
  }

  _updateClimb(dt) {
    const c = this.climbing;
    if (!c) { this.state = STATE.IDLE; return; }
    const speed = 1.65;
    const dir = this.moveInput.mag > 0.15 ? (this.moveInput.z * Math.cos(this.yaw) + this.moveInput.x * Math.sin(this.yaw)) : 0;
    this.pos.y += clamp(dir, -1, 1) * speed * dt;
    this.vel.set(0, 0, 0);
    this.animator.locomotion.speed = 0;

    // Snap to the ladder plane.
    this.pos.x = damp(this.pos.x, c.x, 0.06, dt);
    this.pos.z = damp(this.pos.z, c.z, 0.06, dt);
    this.yaw = dampAngle(this.yaw, c.yaw, 0.08, dt);

    // Leave at the top or the bottom.
    if (this.pos.y >= c.top - 0.05) {
      this.pos.y = c.top + 0.02;
      const fx = -Math.sin(c.yaw) * 0.55, fz = -Math.cos(c.yaw) * 0.55;
      if (!this.world.overlaps(this.pos.x + fx, this.pos.y + 0.1, this.pos.z + fz, this.radius, this.height)) {
        this.pos.x += fx; this.pos.z += fz;
      }
      this.exitClimb();
    } else if (this.pos.y <= c.bottom + 0.02) {
      this.pos.y = c.bottom;
      this.exitClimb();
    }
  }

  enterClimb(box) {
    this.climbing = {
      x: box.x + Math.sin(box.rot) * 0.0,
      z: box.z,
      yaw: box.rot + Math.PI,
      top: box.y1, bottom: box.y0,
    };
    // Face into the ladder.
    this.climbing.yaw = Math.atan2(box.x - this.pos.x, box.z - this.pos.z);
    this.state = STATE.CLIMB;
    this.vel.set(0, 0, 0);
    this.animator.play('climb', { fade: 0.14 });
    this.emit('climbstart');
  }

  exitClimb() {
    this.climbing = null;
    this.state = STATE.IDLE;
    this.animator.stopAction(0.16);
    this.emit('climbend');
  }

  _updateVitals(dt, ctx) {
    if (this.dead) return;

    // Stamina
    const sprinting = this.wantSprint && this.moveInput.mag > 0.5 && this.grounded;
    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - 13 * dt);
      if (this.stamina <= 0) this.wantSprint = false;
    } else if (this._staminaHold <= 0 && !this.guarding) {
      // No regeneration behind a raised guard. The drain in _updateGuard is
      // otherwise cancelled out and holding block becomes free again.
      const rate = this.staminaRegen * (this.lungs.critical ? 0.4 : 1);
      this.stamina = Math.min(this.maxStamina, this.stamina + rate * dt);
    }

    // Poise regenerates once you have not been hit for a moment. The pause is
    // what lets a pack accumulate a stagger: without it the regeneration rate
    // exceeded the poise damage of every basic enemy in the game, so scavs and
    // dogs were literally incapable of interrupting the player.
    if (this._poiseHold <= 0) {
      this.poiseCurrent = Math.min(this.poise, this.poiseCurrent + this.poise * 0.20 * dt);
    }
    this.guardCurrent = Math.min(this.guardHealth, this.guardCurrent + this.guardHealth * 0.30 * dt);

    // Air
    if (this.gas && !this.gasImmune) {
      const ppm = this.interiorPpm !== null && this.interiorPpm !== undefined
        ? this.interiorPpm
        : this.gas.sample(this.pos.x, this.pos.y + this.height * 0.82, this.pos.z);
      this.lungs.exertion = clamp01((sprinting ? 0.85 : this.moveInput.mag * 0.4) + (this.attack ? 0.5 : 0));
      const res = this.lungs.update(ppm, dt);
      this.ambientPpm = ppm;

      if (this.lungs.critical) {
        // Above the critical threshold the damage is continuous, and the
        // coughing starts before the damage does. `harm` is bounded 0..1, so
        // the rate is a real ceiling rather than an unclamped ramp that hit
        // 54 hp/s in a bad cellar.
        this.hp = Math.max(0, this.hp - this.lungs.harm * GAS_MAX_DPS * dt);
        if (this.hp <= 0) this.kill('gas');
      }
      if (this.lungs.sat > 0.12 && ctx && ctx.time - this.lastCough > lerp(11, 2.6, clamp01(this.lungs.sat / 0.4))) {
        this.lastCough = ctx.time;
        if (this.canAct && !this.attack) {
          this.animator.play('cough', { fade: 0.12 });
          this.emit('cough', { severity: this.lungs.severity });
        }
      }
    } else {
      this.ambientPpm = this.interiorPpm ?? (this.gas ? this.gas.sample(this.pos.x, this.pos.y + 1.4, this.pos.z) : 0);
    }
  }

  _updateAnimation(dt) {
    const L = this.animator.locomotion;
    const planar = Math.hypot(this.vel.x, this.vel.z);
    L.speed = damp(L.speed, this.state === STATE.CLIMB ? 0 : planar, 0.05, dt);
    // Strafe amount: how much of the velocity is sideways relative to facing.
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const side = (this.vel.x * fz - this.vel.z * fx) / Math.max(0.5, planar);
    L.strafe = damp(L.strafe, planar > 0.3 ? clamp(side, -1, 1) : 0, 0.1, dt);
    L.turn = damp(L.turn, clamp((this.turnRateNow || 0) / 3.2, -1, 1), 0.12, dt);
    L.crouch = damp(L.crouch, this.crouch, 0.09, dt);
    L.alert = damp(L.alert, this.guarding ? 1 : this.alert, 0.12, dt);
    L.airborne = damp(L.airborne, this.grounded || this.state === STATE.CLIMB ? 0 : 1, 0.08, dt);
    L.fallVel = this.vel.y;
    L.injured = clamp01(1 - this.hp / this.maxHp) * 0.8;

    this.animator.idleOpts.exhaust = clamp01(1 - this.stamina / this.maxStamina) * 0.8 +
                                     this.lungs.severity * 0.7;
    this.animator.idleOpts.alert = L.alert;

    this.animator.update(dt);
  }

  onAnimEvent(name, clipName, a) {
    switch (name) {
      // The dodge clip carries its own i-frame events, but combat.js sets the
      // authoritative window at the press. Two authorities meant the clip
      // truncated the window to 0.218 s when the dodge ran to completion and
      // left it at the full 0.30 s when it was cancelled — so cancelling into
      // an attack bought MORE invulnerability than evading properly.
      // One owner: whoever set `iframeLock` wins.
      case 'iframeStart': if (!this.iframeLock) this.iframes = 0.26; break;
      case 'iframeEnd': if (!this.iframeLock) this.iframes = 0; break;
      case 'parrywindow':
        // Only if this guard-raise actually armed a parry (see PARRY_REARM).
        if (this._parryArmed) {
          this._parryArmed = false;
          this.parryWindow = this.parryBonus ? 0.26 : 0.16;
        }
        break;
      case 'rung': this.emit('footstep', { surface: 'metal', volume: 0.5 }); break;
      case 'cough': this.emit('coughsound', { severity: this.lungs.severity }); break;
      default: break;
    }
    this.emit('anim:' + name, { clip: clipName });
  }

  // ---------------------------------------------------------------- damage

  /**
   * @param {object} hit { amount, kind, dirX, dirZ, stagger, poise, source, guardBreak }
   * @returns {object} result { blocked, parried, dodged, killed, amount }
   */
  damage(hit) {
    if (this.dead) return { dodged: true, amount: 0 };
    if (this.iframes > 0 && hit.kind !== 'gas' && hit.kind !== 'fall') {
      this.emit('dodgehit', hit);
      return { dodged: true, amount: 0 };
    }

    let amount = hit.amount;
    let blocked = false, parried = false;

    // Guarding: only from roughly the front, and only until the guard breaks.
    if (this.guarding && hit.dirX !== undefined && hit.kind !== 'gas' && hit.kind !== 'fall') {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const dot = fx * -hit.dirX + fz * -hit.dirZ;
      if (dot > 0.15) {
        if (this.parryWindow > 0) {
          parried = true;
          amount = 0;
          this.emit('parry', hit);
          this.animator.react('guardhit', 0.5);
        } else {
          blocked = true;
          // 0.14 through meant 72 blocked hits to kill Ren and 207 seconds for
          // a scavenger to do it. A guard is protection, not a second health
          // bar with a better exchange rate.
          const through = hit.guardBreak ? BLOCK_THROUGH_BREAK : BLOCK_THROUGH;
          this.guardCurrent -= amount * (hit.guardBreak ? 1.8 : 1.0);
          amount *= through;
          this.stamina = Math.max(0, this.stamina - hit.amount * 0.42);
          this._staminaHold = 0.7;
          this.animator.react('guardhit', 0.9);
          this.emit('block', hit);
          if (this.guardCurrent <= 0 || this.stamina <= 0) {
            this.guardCurrent = 0;
            this.guarding = false;
            this.stagger(0.95);
            this.emit('guardbreak', hit);
          }
        }
      }
    }

    // Accessibility: combat assistance scales incoming damage, and at the
    // highest level makes combat unable to kill (the gas still can, because
    // the gas is the game).
    if (this.combatAssist === 1) amount *= 0.55;
    else if (this.combatAssist === 2 && hit.kind !== 'gas') {
      amount = Math.min(amount, Math.max(0, this.hp - 1));
    }

    if (amount > 0) {
      this.hp = Math.max(0, this.hp - amount);
      // `poiseResist` — the Breaker's armour. Declared on the archetype and,
      // until now, read nowhere.
      this.poiseCurrent -= (hit.poise ?? amount) * this.poiseResist;
      this._staminaHold = 0.5;
      this._poiseHold = POISE_HOLD;

      if (!blocked && !parried) {
        const heavy = (hit.poise ?? amount) > this.poise * 0.55 || hit.stagger;
        this.animator.react(heavy ? 'hitHeavy' : 'hitLight', heavy ? 1 : 0.75);
        this.hitstop = heavy ? 0.11 : 0.06;
        if (this.poiseCurrent <= 0 || hit.stagger) this.stagger(heavy ? 1.05 : 0.6);
      } else if (blocked && hit.stagger) {
        // Blocking a heavy still costs you your footing. Stagger was applied
        // only to unblocked hits, which is why a raised guard negated every
        // guard-break in the game along with everything else.
        this.stagger(hit.guardBreak ? 0.6 : 0.38);
      }
      this.emit('hurt', { ...hit, amount, blocked, parried });
    }

    if (this.hp <= 0) { this.kill(hit.kind || 'blunt', hit); return { blocked, parried, killed: true, amount }; }
    return { blocked, parried, killed: false, amount };
  }

  stagger(duration) {
    if (this.dead) return;
    this.state = STATE.STAGGER;
    this.staggerTime = duration;
    this.poiseCurrent = this.poise * 0.5;
    this._poiseHold = 0;
    this.attack = null;
    this.guarding = false;
    this.comboWindow = 0;
    this.comboNext = null;
    this.dodgeT = 0;
    this.animator.play('stagger', { fade: 0.06, speed: 0.9 / duration });
    this.emit('stagger', { duration });
  }

  heal(amount) {
    if (this.dead) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
  }

  kill(cause = 'blunt', hit = null) {
    if (this.dead) return;
    this.lastDeathCause = cause;
    this.dead = true;
    this.state = STATE.DEAD;
    this.attack = null;
    this.guarding = false;
    this.vel.set(0, 0, 0);
    this.animator.play('death', { fade: 0.05, force: true });
    this.emit('death', { cause, hit });
  }

  dispose() {
    this.rig.geometry.dispose();
    if (this._ownMat) this._ownMat.dispose();
    if (this.weapon) this.weapon.traverse((o) => o.geometry && o.geometry.dispose());
    if (this.offhand) this.offhand.traverse((o) => o.geometry && o.geometry.dispose());
  }
}

/**
 * Push overlapping actors apart.
 *
 * `moveActor` only ever consulted the world's boxes, so nothing in the game
 * separated bodies: a pack of dogs occupied a single point, the player walked
 * through enemies, and a Breaker could stand inside you. Combined with the
 * attack-token cap this is what turns a group encounter from an overlapping
 * blender into something with a shape.
 *
 * O(n^2) on purpose. n is the cast in one encounter — a dozen at the very
 * outside — and a spatial structure here would cost more to maintain than the
 * comparisons it saves.
 *
 * Weighting is asymmetric: the player resists being shoved (0.25 of the
 * correction) and takes the rest out of whatever walked into her, so a crowd
 * cannot push Ren off a roof or out of a doorway she is holding.
 *
 * @param {Actor[]} actors
 * @param {number} dt
 * @param {Actor|null} player the actor that resists displacement
 */
export function separateActors(actors, dt, player = null) {
  const n = actors.length;
  for (let i = 0; i < n; i++) {
    const a = actors[i];
    if (a.dead || a.state === STATE.CLIMB || a.state === STATE.VAULT) continue;
    for (let j = i + 1; j < n; j++) {
      const b = actors[j];
      if (b.dead || b.state === STATE.CLIMB || b.state === STATE.VAULT) continue;

      // Bodies at clearly different elevations are not touching.
      const dy = a.pos.y - b.pos.y;
      if (dy > Math.max(a.height, b.height) * 0.8 || -dy > Math.max(a.height, b.height) * 0.8) continue;

      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const minD = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minD * minD) continue;

      let nx, nz, d;
      if (d2 > 1e-6) {
        d = Math.sqrt(d2);
        nx = dx / d; nz = dz / d;
      } else {
        // Exactly coincident: pick a stable direction from the id pair so two
        // bodies do not oscillate against each other frame to frame.
        const ang = ((a.id * 2654435761) ^ (b.id * 40503)) % 628 / 100;
        nx = Math.cos(ang); nz = Math.sin(ang); d = 0;
      }

      const overlap = minD - d;
      // Resolve most of it per step, not all: a hard snap reads as a collision
      // bug, a firm push reads as a shoulder. Strong enough to win against
      // steering that is actively driving two bodies into each other.
      const push = overlap * Math.min(1, dt * 42) * 0.95;

      let wa = 0.5, wb = 0.5;
      if (a === player) { wa = 0.25; wb = 0.75; }
      else if (b === player) { wa = 0.75; wb = 0.25; }

      a.pos.x -= nx * push * wa; a.pos.z -= nz * push * wa;
      b.pos.x += nx * push * wb; b.pos.z += nz * push * wb;
    }
  }
}
