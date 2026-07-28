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
import { Lungs, PPM } from '../world/gas.js';
import { clamp, clamp01, lerp, damp, dampAngle, angleDelta, approachAngle, TAU } from '../core/util.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

export const STATE = {
  IDLE: 'idle', MOVE: 'move', ACTION: 'action', STAGGER: 'stagger',
  DOWN: 'down', DEAD: 'dead', CLIMB: 'climb', VAULT: 'vault', TALK: 'talk',
};

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
    this.invulnUntil = -1;
    this.hitstop = 0;
    this.staggerTime = 0;

    this.speedWalk = opts.speedWalk ?? 2.05;
    this.speedRun = opts.speedRun ?? 4.15;
    this.speedSprint = opts.speedSprint ?? 5.8;
    this.accel = opts.accel ?? 26;
    this.decel = opts.decel ?? 30;

    this.moveInput = { x: 0, z: 0, mag: 0 };
    this.wantSprint = false;
    this.crouch = 0;
    this.alert = 0;

    // Attack bookkeeping — the combat system reads and writes these.
    this.attack = null;
    this.comboIndex = 0;
    this.comboWindow = 0;
    this.guarding = false;
    this.guardHealth = opts.guardHealth ?? 60;
    this.guardCurrent = this.guardHealth;
    this.parryWindow = 0;
    this.iframes = 0;

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
    this.parryWindow = Math.max(0, this.parryWindow - dt);
    this.comboWindow = Math.max(0, this.comboWindow - dt);
    this._staminaHold = Math.max(0, this._staminaHold - dt);

    if (this.state === STATE.STAGGER) {
      this.staggerTime -= dt;
      if (this.staggerTime <= 0) this.state = STATE.IDLE;
    }

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

    if (!locked) {
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
      // Falls hurt. Above about four metres they hurt a great deal, which is
      // what makes the rooftop route a real decision rather than free safety.
      const dmg = Math.pow(clamp01((r.fellDist - 2.6) / 6.4), 1.6) * 92;
      if (dmg > 2) this.damage({ amount: dmg, kind: 'fall', stagger: dmg > 22 });
      this.emit('land', { hard: dmg > 8, dist: r.fellDist });
      this.animator.play('land', { speed: dmg > 8 ? 0.85 : 1.3 });
    } else if (r.grounded && r.fellDist > 0.7) {
      this.emit('land', { hard: false, dist: r.fellDist });
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
    } else if (this._staminaHold <= 0) {
      const rate = this.staminaRegen * (this.guarding ? 0.28 : 1) * (this.lungs.critical ? 0.4 : 1);
      this.stamina = Math.min(this.maxStamina, this.stamina + rate * dt);
    }

    // Poise regenerates once you have not been hit for a moment.
    this.poiseCurrent = Math.min(this.poise, this.poiseCurrent + this.poise * 0.42 * dt);
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
        // coughing starts before the damage does.
        const sev = (this.lungs.sat - 0.34) / 0.16;
        this.hp = Math.max(0, this.hp - sev * 13 * dt);
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
      case 'iframeStart': this.iframes = 0.26; break;
      case 'iframeEnd': this.iframes = 0; break;
      case 'parrywindow': this.parryWindow = 0.16; break;
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
          const through = hit.guardBreak ? 0.45 : 0.14;
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

    if (amount > 0) {
      this.hp = Math.max(0, this.hp - amount);
      this.poiseCurrent -= hit.poise ?? amount;
      this._staminaHold = 0.5;

      if (!blocked && !parried) {
        const heavy = (hit.poise ?? amount) > this.poise * 0.55 || hit.stagger;
        this.animator.react(heavy ? 'hitHeavy' : 'hitLight', heavy ? 1 : 0.75);
        this.hitstop = heavy ? 0.11 : 0.06;
        if (this.poiseCurrent <= 0 || hit.stagger) this.stagger(heavy ? 1.05 : 0.6);
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
    this.attack = null;
    this.guarding = false;
    this.comboIndex = 0;
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
    if (this.weapon) this.weapon.traverse((o) => o.geometry && o.geometry.dispose());
    if (this.offhand) this.offhand.traverse((o) => o.geometry && o.geometry.dispose());
  }
}
