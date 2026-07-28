/**
 * The player, and the camera that watches her.
 *
 * Movement is camera-relative with a turn rate, not a rotate-in-place tank
 * scheme: the stick points where Ren goes and she turns to match. Actions are
 * buffered for a short window so a tap during the last frames of a swing still
 * lands, which is the difference between a combat system that feels responsive
 * and one that feels like it is ignoring you.
 */

import * as THREE from 'three';
import { Actor, STATE } from './actor.js';
import { LAYER } from '../world/collision.js';
import { clamp, clamp01, lerp, damp, dampAngle, angleDelta, smoothstep, TAU } from '../core/util.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

/** How long an unfulfilled action press stays queued. */
const BUFFER = 0.26;

export class Player extends Actor {
  constructor(opts) {
    super({
      costume: 'ren', detail: 2, faction: 'player', name: 'Ren',
      maxHp: 120, maxStamina: 100, poise: 52, guardHealth: 74,
      speedWalk: 2.1, speedRun: 4.3, speedSprint: 6.0,
      weapon: 'prybar', offhand: 'meter',
      turnRate: 11, ...opts,
    });

    this.buffer = { name: null, t: 0 };
    this.lockTarget = null;
    this.lockCandidates = [];
    this.interactTarget = null;
    this.lampOn = false;

    // The headlamp. Also the only light source in a cellar, which is why the
    // battery is a resource and not a cosmetic.
    this.lamp = new THREE.SpotLight(0xffe0b4, 0, 22, 0.62, 0.45, 1.4);
    this.lamp.castShadow = false;
    this.lampTarget = new THREE.Object3D();
    this.lamp.target = this.lampTarget;
    this.group.add(this.lamp);
    this.group.add(this.lampTarget);
    this.lampBattery = 1;

    this.vaultCooldown = 0;
    this.autoVault = true;
  }

  /** Queue an action if it cannot be performed right now. */
  bufferAction(name) {
    this.buffer.name = name;
    this.buffer.t = BUFFER;
  }

  takeBuffered() {
    if (this.buffer.t <= 0) return null;
    const n = this.buffer.name;
    this.buffer.name = null;
    this.buffer.t = 0;
    return n;
  }

  peekBuffered() { return this.buffer.t > 0 ? this.buffer.name : null; }

  update(dt, ctx) {
    this.buffer.t = Math.max(0, this.buffer.t - dt);
    this.vaultCooldown = Math.max(0, this.vaultCooldown - dt);

    // Headlamp
    const wantLamp = this.lampOn && this.lampBattery > 0;
    this.lamp.intensity = damp(this.lamp.intensity, wantLamp ? 22 : 0, 0.12, dt);
    if (wantLamp) this.lampBattery = Math.max(0, this.lampBattery - dt / 900);
    this.lamp.position.set(0, this.height * 0.94, 0);
    this.lampTarget.position.set(-Math.sin(this.yaw) * 6, this.height * 0.72, -Math.cos(this.yaw) * 6);

    super.update(dt, ctx);
  }

  /**
   * Try to vault a low obstacle directly ahead. Called when the player runs
   * into something waist-high; there is no vault button, because there is no
   * thumb left for one.
   */
  tryVault() {
    if (this.vaultCooldown > 0 || !this.grounded || this.state !== STATE.IDLE && this.state !== STATE.MOVE) return false;
    if (this.moveInput.mag < 0.5) return false;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const ox = this.pos.x + fx * (this.radius + 0.22);
    const oz = this.pos.z + fz * (this.radius + 0.22);

    // Something to climb over at knee-to-waist height...
    const obstacle = this.world.overlaps(ox, this.pos.y + 0.1, oz, 0.24, 0.5);
    if (!obstacle) return false;
    const top = obstacle.y1;
    const rise = top - this.pos.y;
    if (rise < 0.45 || rise > 1.25) return false;

    // ...and somewhere to land on the far side.
    const lx = this.pos.x + fx * (this.radius + 1.15);
    const lz = this.pos.z + fz * (this.radius + 1.15);
    const land = this.world.groundUnder(lx, lz, this.radius * 0.8, top + 0.4, 2.4);
    if (!land) return false;
    if (this.world.overlaps(lx, land.y + 0.15, lz, this.radius * 0.85, this.height - 0.3)) return false;

    this.state = STATE.VAULT;
    this.vaultCooldown = 0.6;
    this.stamina = Math.max(0, this.stamina - 8);
    const startX = this.pos.x, startZ = this.pos.z, startY = this.pos.y;
    const endX = lx, endZ = lz, endY = land.y;
    const dur = 0.52;
    let t = 0;
    this.animator.play('vault', { speed: 0.66 / dur, fade: 0.05 });
    this.emit('vault', {});

    this._vault = (d) => {
      t += d / dur;
      const k = clamp01(t);
      const arc = Math.sin(k * Math.PI) * (rise * 0.45 + 0.24);
      this.pos.x = lerp(startX, endX, k);
      this.pos.z = lerp(startZ, endZ, k);
      this.pos.y = lerp(startY, endY, smoothstep(k)) + arc;
      this.vel.set(0, 0, 0);
      if (k >= 1) {
        this.pos.y = endY;
        this.state = STATE.IDLE;
        this._vault = null;
      }
    };
    return true;
  }

  _updateMovement(dt) {
    if (this._vault) {
      this._vault(dt);
      this.group.position.copy(this.pos);
      return;
    }
    super._updateMovement(dt);

    // Auto-vault when the player is pressing into something low.
    if (this.autoVault && this.lastMove && this.lastMove.hitWall && this.moveInput.mag > 0.6 && !this.attack) {
      this.tryVault();
    }
  }

  /** Look for a ladder in front and attach to it. */
  tryClimb() {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const box = this.world.climbAt(this.pos.x + fx * 0.4, this.pos.y, this.pos.z + fz * 0.4, 0.6)
             || this.world.climbAt(this.pos.x, this.pos.y, this.pos.z, 0.55);
    if (!box) return false;
    this.enterClimb(box);
    return true;
  }
}

// -------------------------------------------------------------- camera -----

/**
 * Third-person camera.
 *
 * Design rules, in priority order:
 *   1. Never put geometry between the camera and Ren.
 *   2. Never move without the player either asking for it or needing it.
 *   3. Frame the fight, not the character, when a target is locked.
 *
 * Auto-follow is deliberately weak and only engages while moving forward, so a
 * player who has aimed the camera somewhere keeps it there.
 */
export class ThirdPersonCamera {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;

    this.yaw = 0;
    this.pitch = -0.10;
    this.distance = 3.5;
    this.targetDistance = 3.5;
    this.height = 1.42;
    this.shoulder = 0.42;

    this.pivot = new THREE.Vector3();
    this.smoothPivot = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.actual = new THREE.Vector3();
    this._init = false;

    this.minPitch = -0.95;
    this.maxPitch = 0.72;

    this.shake = 0;
    this.shakeDecay = 4.5;
    this._shakeSeed = Math.random() * 1000;

    this.fovBase = 58;
    this.fovTarget = 58;

    this.autoFollow = 0.55;
    this.lockTarget = null;
    this._lockBlend = 0;

    this.enabled = true;
    this.sensitivity = 1;
  }

  /** Apply raw look delta from the input layer. */
  look(dx, dy) {
    this.yaw -= dx * 0.0055 * this.sensitivity;
    this.pitch = clamp(this.pitch - dy * 0.0048 * this.sensitivity, this.minPitch, this.maxPitch);
    this._manualT = 0.9;
  }

  addShake(amount) { this.shake = Math.min(1.4, this.shake + amount); }

  /** Forward vector on the XZ plane — what "up on the stick" means. */
  forwardXZ(out = _v) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  rightXZ(out = _v2) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  update(dt, player, opts = {}) {
    if (!this.enabled) return;
    const { moving = 0, sprinting = false, aiming = false, indoors = false } = opts;
    this._manualT = Math.max(0, (this._manualT ?? 0) - dt);

    // --- pivot ------------------------------------------------------------
    const crouchDrop = player.animator.locomotion.crouch * 0.36;
    this.pivot.set(
      player.pos.x,
      player.pos.y + this.height - crouchDrop + (player.state === STATE.CLIMB ? 0.3 : 0),
      player.pos.z
    );
    if (!this._init) { this.smoothPivot.copy(this.pivot); this._init = true; }
    // Vertical smoothing is slower than horizontal so stairs and kerbs do not
    // bounce the frame.
    this.smoothPivot.x = damp(this.smoothPivot.x, this.pivot.x, 0.055, dt);
    this.smoothPivot.z = damp(this.smoothPivot.z, this.pivot.z, 0.055, dt);
    this.smoothPivot.y = damp(this.smoothPivot.y, this.pivot.y, player.grounded ? 0.13 : 0.05, dt);

    // --- lock-on ----------------------------------------------------------
    const wantLock = this.lockTarget && !this.lockTarget.dead;
    this._lockBlend = damp(this._lockBlend, wantLock ? 1 : 0, 0.12, dt);
    if (wantLock) {
      const t = this.lockTarget;
      // Frame the midpoint, biased toward the player, and pitch to include both.
      const mx = lerp(player.pos.x, t.pos.x, 0.34);
      const mz = lerp(player.pos.z, t.pos.z, 0.34);
      const desiredYaw = Math.atan2(player.pos.x - mx - (t.pos.x - player.pos.x) * 0.0,
                                    player.pos.z - mz);
      const toT = Math.atan2(t.pos.x - player.pos.x, t.pos.z - player.pos.z);
      const lockYaw = toT + Math.PI;
      this.yaw = dampAngle(this.yaw, lockYaw, this._manualT > 0 ? 0.9 : 0.16, dt);
      const dist = Math.hypot(t.pos.x - player.pos.x, t.pos.z - player.pos.z);
      const lockPitch = clamp(-0.1 - (0.18 - dist * 0.012), -0.5, 0.1);
      this.pitch = damp(this.pitch, lockPitch, this._manualT > 0 ? 0.9 : 0.35, dt);
      this.targetDistance = clamp(3.3 + dist * 0.14, 3.2, 5.0);
    } else {
      // --- auto-follow ----------------------------------------------------
      // Only while genuinely moving forward, and never against a recent manual
      // input. A camera that fights the player is worse than no auto-follow.
      if (moving > 0.55 && this._manualT <= 0 && player.grounded) {
        const travel = Math.atan2(player.vel.x, player.vel.z);
        const behind = travel + Math.PI;
        const diff = Math.abs(angleDelta(this.yaw, behind));
        if (diff > 0.25) {
          const rate = lerp(1.6, 0.55, clamp01(moving)) / this.autoFollow;
          this.yaw = dampAngle(this.yaw, behind, rate, dt);
        }
      }
      this.targetDistance = indoors ? 2.7 : sprinting ? 4.3 : 3.6;
    }

    this.distance = damp(this.distance, this.targetDistance, 0.28, dt);

    // --- FOV --------------------------------------------------------------
    this.fovTarget = this.fovBase + (sprinting ? 7 : 0) + (wantLock ? -2 : 0);
    if (this.camera.aspect > 2.0) this.fovTarget -= 5;
    else if (this.camera.aspect < 1.7) this.fovTarget += 5;
    this.camera.fov = damp(this.camera.fov, this.fovTarget, 0.3, dt);
    this.camera.updateProjectionMatrix();

    // --- placement --------------------------------------------------------
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dirX = Math.sin(this.yaw) * cp;
    const dirY = -sp;
    const dirZ = Math.cos(this.yaw) * cp;

    // Over-the-shoulder offset, reduced when locked so the target stays centred.
    const shoulder = this.shoulder * (1 - this._lockBlend * 0.55);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const px = this.smoothPivot.x + rx * shoulder;
    const py = this.smoothPivot.y;
    const pz = this.smoothPivot.z + rz * shoulder;

    // Collision: pull in along the boom, and keep a margin off the surface.
    const maxD = this.distance;
    const hit = this.world.sphereCast(px, py, pz, dirX, dirY, dirZ, maxD + 0.35, 0.26);
    const d = Math.max(0.55, Math.min(maxD, hit - 0.3));
    // Pull in fast, push out slow: snapping outward reveals geometry pops.
    this._curD = this._curD === undefined ? d : (d < this._curD ? d : damp(this._curD, d, 0.35, dt));

    this.desired.set(px + dirX * this._curD, py + dirY * this._curD, pz + dirZ * this._curD);

    // Near the ground the camera would clip through; lift it instead.
    const floor = this.world.groundUnder(this.desired.x, this.desired.z, 0.3, this.desired.y + 0.4, 3.0);
    if (floor && this.desired.y < floor.y + 0.34) this.desired.y = floor.y + 0.34;

    this.camera.position.copy(this.desired);

    // --- shake ------------------------------------------------------------
    if (this.shake > 0.001) {
      this.shake = Math.max(0, this.shake - this.shakeDecay * dt * (0.4 + this.shake));
      const t = performance.now() * 0.001;
      const s = this.shake * this.shake * 0.34;
      const n = (a, b) => Math.sin(t * a + this._shakeSeed * b) * Math.sin(t * b * 3.1 + a);
      this.camera.position.x += n(37, 1.3) * s;
      this.camera.position.y += n(41, 2.1) * s;
      this.camera.position.z += n(29, 1.7) * s;
    }

    // --- orientation ------------------------------------------------------
    _e.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(_e);
    if (this.shake > 0.001) {
      const t = performance.now() * 0.001;
      this.camera.rotateZ(Math.sin(t * 33 + this._shakeSeed) * this.shake * this.shake * 0.045);
    }
  }
}
