/**
 * Enemy AI.
 *
 * Five archetypes that want different things, because an encounter is only
 * interesting when the units in it disagree about how to fight:
 *
 *   SCAV     Opportunist. Closes, circles, chains two swings, breaks off when
 *            hurt. Unmasked — which means the air can kill it, and that is a
 *            weapon the player holds.
 *   BREAKER  Slow, armoured, enormous telegraphed swings that go through
 *            guards. You do not trade with a Breaker; you make it miss.
 *   SLINGER  Keeps its distance and throws. Punishes standing still, forces
 *            you to close, and dies fast when you do.
 *   WARDEN   Authority contractor on bottled air, so the gas is irrelevant to
 *            it. Disciplined: blocks, spaces, shoves you out of your guard,
 *            and calls the others in.
 *   DOG      Fast, circles wide, commits in straight lines. Dangerous in
 *            threes, trivial alone.
 *
 * Perception is deliberately degraded by the smoke — the same fog that hides
 * the city from you hides you from them. Sight range scales inversely with the
 * local gas density, which turns the low ground into cover as well as a hazard.
 */

import * as THREE from 'three';
import { Actor } from '../actors/actor.js';
import { LAYER } from '../world/collision.js';
import { ATTACKS } from './combat.js';
import { clamp01, lerp } from '../core/util.js';
import { Rng } from '../core/rng.js';

export const AI_STATE = {
  IDLE: 'idle', PATROL: 'patrol', SUSPICIOUS: 'suspicious',
  COMBAT: 'combat', SEARCH: 'search', FLEE: 'flee', RETURN: 'return', DEAD: 'dead',
};

/**
 * Archetype table. These numbers are the encounter design.
 */
export const ARCHETYPES = {
  scav: {
    costume: 'scav', weapon: 'pipe', maxHp: 62, poise: 26, guardHealth: 0,
    speedWalk: 1.9, speedRun: 4.0, speedSprint: 5.2, turnRate: 8,
    sight: 24, fov: 1.15, hearing: 15, radius: 0.33,
    preferred: 1.75, strafeBias: 0.55, aggression: 0.62, patience: [0.5, 1.4],
    attacks: ['scavSwing'], blockChance: 0, dodgeChance: 0.12,
    fleeBelow: 0.22, gasFear: 620,
    masked: false, detail: 1,
  },
  breaker: {
    costume: 'breaker', weapon: 'sledge', maxHp: 150, poise: 78, guardHealth: 0,
    speedWalk: 1.5, speedRun: 2.9, speedSprint: 3.4, turnRate: 4.2,
    sight: 21, fov: 1.0, hearing: 18, radius: 0.42, height: 1.84,
    preferred: 2.3, strafeBias: 0.14, aggression: 0.78, patience: [0.9, 2.0],
    attacks: ['breakerSmash', 'breakerOverhead'], blockChance: 0, dodgeChance: 0,
    fleeBelow: 0, gasFear: 950, damageMul: 1.0,
    masked: false, detail: 1, poiseResist: true,
  },
  slinger: {
    costume: 'scav', weapon: null, maxHp: 44, poise: 18, guardHealth: 0,
    speedWalk: 2.1, speedRun: 4.4, speedSprint: 5.6, turnRate: 9,
    sight: 30, fov: 1.3, hearing: 14, radius: 0.31,
    preferred: 9.5, strafeBias: 0.7, aggression: 0.4, patience: [1.1, 2.2],
    attacks: [], ranged: { cooldown: [2.0, 3.6], damage: 11, speed: 17, windup: 0.42 },
    blockChance: 0, dodgeChance: 0.22, fleeBelow: 0.3, gasFear: 520,
    masked: false, detail: 1, minRange: 4.5,
  },
  warden: {
    costume: 'warden', weapon: 'baton', offhand: 'shield',
    maxHp: 110, poise: 54, guardHealth: 95,
    speedWalk: 2.0, speedRun: 3.8, speedSprint: 4.8, turnRate: 7,
    sight: 30, fov: 1.25, hearing: 20, radius: 0.36, height: 1.8,
    preferred: 2.0, strafeBias: 0.45, aggression: 0.55, patience: [0.7, 1.5],
    attacks: ['wardenJab'], blockChance: 0.68, dodgeChance: 0.08,
    fleeBelow: 0, gasFear: 99999,
    masked: true, gasImmune: true, detail: 2, callsForHelp: true,
  },
  dog: {
    costume: 'dog', dog: true, weapon: null, maxHp: 34, poise: 12, guardHealth: 0,
    speedWalk: 2.6, speedRun: 6.2, speedSprint: 7.4, turnRate: 13,
    sight: 20, fov: 1.5, hearing: 26, radius: 0.3, height: 0.95,
    preferred: 1.35, strafeBias: 0.85, aggression: 0.85, patience: [0.35, 0.9],
    attacks: ['dogBite'], blockChance: 0, dodgeChance: 0.18,
    fleeBelow: 0.18, gasFear: 420,
    masked: false, detail: 0, pack: true,
  },
};

const _v = new THREE.Vector3();

export class Enemy extends Actor {
  constructor(kind, opts) {
    const A = ARCHETYPES[kind] || ARCHETYPES.scav;
    super({
      ...A, ...opts,
      faction: opts.faction || 'hostile',
      name: opts.name || kind,
      costume: A.costume,
      detail: A.detail,
    });
    this.kind = kind;
    this.arch = A;
    this.rng = new Rng(`ai:${this.id}:${opts.seed ?? 0}`);

    this.aiState = AI_STATE.IDLE;
    this.aggro = false;
    this.target = null;
    this.awareness = 0;          // 0..1, fills while the player is perceived
    this.lastSeen = { x: 0, y: 0, z: 0, t: -99 };
    this.think = 0;              // countdown to the next decision
    this.strafeDir = this.rng.chance(0.5) ? 1 : -1;
    this.path = null;
    this.pathIndex = 0;
    this.pathTime = 0;
    this.attackCooldown = this.rng.range(...A.patience);
    this.rangedCooldown = A.ranged ? this.rng.range(...A.ranged.cooldown) : 0;
    this.homeX = opts.x; this.homeZ = opts.z; this.homeY = opts.y || 0;
    this.leash = opts.leash ?? 42;
    this.patrol = opts.patrol || null;
    this.patrolIndex = 0;
    this.damageMul = A.damageMul ?? 1;
    this.group = this.group;
    this.callCooldown = 0;
    this.stuckTimer = 0;
    this._lastPos = new THREE.Vector3().copy(this.pos);

    if (A.dog) {
      // A dog has no hands, so nothing is attached, and its stride is short.
      this.height = 0.72;
      this.radius = 0.3;
    }

    // Anything that can throw a telegraphed attack — including one reached
    // through a chain — needs its own material so the tell can be seen rather
    // than only heard.
    if (this._reachesTelegraph(A.attacks)) this.enableSelfLight();
  }

  _reachesTelegraph(names, depth = 0) {
    if (!names || depth > 4) return false;
    for (const n of names) {
      const A = ATTACKS[n];
      if (!A) continue;
      if (A.telegraph) return true;
      if (A.next && this._reachesTelegraph([A.next], depth + 1)) return true;
    }
    return false;
  }

  /** Effective sight range, cut down by whatever is hanging in the air. */
  sightRange(gas) {
    const base = this.arch.sight;
    if (!gas) return base;
    const ppm = gas.sample(this.pos.x, this.pos.y + 1.4, this.pos.z);
    // Heavy smoke halves how far anyone can see. It cuts both ways.
    return base * lerp(1, 0.42, clamp01(ppm / 1400));
  }

  canSee(target, world, gas) {
    const dx = target.pos.x - this.pos.x;
    const dz = target.pos.z - this.pos.z;
    const dy = target.pos.y - this.pos.y;
    const dist = Math.hypot(dx, dz);
    const range = this.sightRange(gas);
    if (dist > range) return false;
    if (Math.abs(dy) > 6) return false;

    // Field of view, widened once already aggroed (you are being watched).
    // `fov` is a HALF-angle: at 1.5x an aggroed warden saw 215 degrees, which
    // is not a field of view, it is a sphere with a small dent in it. Breaking
    // line of sight has to be possible or there is no disengaging.
    const fov = this.aggro ? this.arch.fov * 1.2 : this.arch.fov;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const dot = dist > 0.01 ? (dx / dist) * fx + (dz / dist) * fz : 1;
    if (dot < Math.cos(fov)) return false;

    return world.lineOfSight(
      this.pos.x, this.pos.y + this.height * 0.85, this.pos.z,
      target.pos.x, target.pos.y + target.height * 0.7, target.pos.z
    );
  }

  /**
   * Hearing. Sound is attenuated by walls — a dog with 26 m of hearing heard a
   * sprinting player at 36 m THROUGH SOLID BUILDINGS, which made the whole city
   * one room and sprinting anywhere a city-wide announcement.
   */
  hears(target, gas, world) {
    const d = Math.hypot(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
    let loud = 0.35;
    if (target.wantSprint) loud = 1.4;
    else if (target.moveInput.mag > 0.6) loud = 0.8;
    else if (target.crouch > 0.5) loud = 0.12;
    if (target.isAttacking) loud = Math.max(loud, 1.2);
    const range = this.arch.hearing * loud;
    if (d >= range) return false;
    if (!world) return true;
    // Through a wall you hear roughly a third as far. Not nothing — a Breaker
    // still hears you smash a door on the other side of a shopfront.
    const clear = world.lineOfSight(
      this.pos.x, this.pos.y + this.height * 0.8, this.pos.z,
      target.pos.x, target.pos.y + target.height * 0.6, target.pos.z, LAYER.SOLID);
    return clear || d < range * 0.36;
  }

  /** Distance from where this enemy started. Bounds the pursuit. */
  distFromHome() {
    return Math.hypot(this.pos.x - (this.homeX ?? this.pos.x),
                      this.pos.z - (this.homeZ ?? this.pos.z));
  }

  /** Ambient air here, used for the flee-the-gas behaviour. */
  localPpm(gas) {
    return gas ? gas.sample(this.pos.x, this.pos.y + this.height * 0.8, this.pos.z) : 0;
  }
}

// ------------------------------------------------------------------ system --

export class AISystem {
  constructor(game) {
    this.game = game;
    this.time = 0;
    this.projectiles = [];
    this._projGeo = null;
  }

  update(dt, game) {
    this.time += dt;
    const player = game.player;
    if (!player) return;

    for (const a of game.actors) {
      if (!(a instanceof Enemy) || a.dead) continue;
      this._updateEnemy(a, dt, game, player);
    }
    this._updateProjectiles(dt, game);
  }

  _updateEnemy(e, dt, game, player) {
    const gas = game.gas;
    e.think -= dt;
    e.attackCooldown -= dt;
    e.rangedCooldown -= dt;
    e.callCooldown -= dt;

    // --- perception -------------------------------------------------------
    const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    const sees = !player.dead && e.canSee(player, game.world, gas);
    const hears = !player.dead && e.hears(player, gas, game.world);

    if (sees) {
      // Awareness fills faster the closer and the more lit the target is.
      const rate = lerp(0.7, 3.4, clamp01(1 - dist / Math.max(1, e.sightRange(gas))));
      e.awareness = clamp01(e.awareness + rate * dt * (player.lampOn ? 1.5 : 1));
      e.lastSeen.x = player.pos.x; e.lastSeen.y = player.pos.y; e.lastSeen.z = player.pos.z;
      e.lastSeen.t = this.time;
    } else if (hears) {
      e.awareness = clamp01(e.awareness + 0.85 * dt);
      if (e.awareness > 0.4) {
        e.lastSeen.x = player.pos.x; e.lastSeen.z = player.pos.z; e.lastSeen.y = player.pos.y;
        e.lastSeen.t = this.time;
      }
    } else {
      e.awareness = Math.max(0, e.awareness - 0.28 * dt);
    }

    if (!e.aggro && e.awareness >= 1) {
      e.aggro = true;
      e.target = player;
      e.aiState = AI_STATE.COMBAT;
      e.emit('aggro', {});
      game.emit('sfx', 'aggro', { x: e.pos.x, y: e.pos.y + 1.5, z: e.pos.z, kind: e.kind });
      // Wardens shout, which pulls in everyone in earshot.
      if (e.arch.callsForHelp && e.callCooldown <= 0) {
        e.callCooldown = 8;
        this._alertNearby(game, e, 26);
      }
    } else if (!e.aggro && e.awareness > 0.25) {
      e.aiState = AI_STATE.SUSPICIOUS;
    }

    // --- gas panic --------------------------------------------------------
    // An unmasked enemy standing in bad air will break off and climb or run
    // for cleaner ground. This is what makes the player's use of the low
    // streets an actual tactic rather than a scripted trick.
    const ppm = e.localPpm(gas);
    if (ppm > e.arch.gasFear || e.lungs.sat > 0.13) {
      if (e.aiState !== AI_STATE.FLEE) {
        e.aiState = AI_STATE.FLEE;
        e.emit('gaspanic', { ppm });
        game.emit('sfx', 'panic', { x: e.pos.x, y: e.pos.y + 1.5, z: e.pos.z });
      }
    } else if (e.aiState === AI_STATE.FLEE && ppm < e.arch.gasFear * 0.55 && e.lungs.sat < 0.07) {
      e.aiState = e.aggro ? AI_STATE.COMBAT : AI_STATE.IDLE;
    }

    // --- health flee ------------------------------------------------------
    if (e.arch.fleeBelow > 0 && e.hp / e.maxHp < e.arch.fleeBelow && e.aiState === AI_STATE.COMBAT) {
      if (e.rng.chance(0.7)) {
        e.aiState = AI_STATE.FLEE;
        e.fleeUntil = this.time + e.rng.range(3, 6);
        e.emit('flee', {});
      }
    }

    // --- leash ------------------------------------------------------------
    // `leash`, `homeX` and `homeZ` were assigned by the constructor and read
    // nowhere, so nothing in Hollis ever gave up on you. An enemy dragged far
    // enough from its ground breaks off and goes back; running is a tactic.
    if ((e.aiState === AI_STATE.COMBAT || e.aiState === AI_STATE.SEARCH) &&
        e.distFromHome() > e.leash) {
      e.aggro = false;
      e.awareness = 0;
      e.target = null;
      e.aiState = AI_STATE.RETURN;
      e.emit('disengage', {});
    }

    switch (e.aiState) {
      case AI_STATE.IDLE: this._idle(e, dt, game); break;
      case AI_STATE.PATROL: this._patrol(e, dt, game); break;
      case AI_STATE.SUSPICIOUS: this._suspicious(e, dt, game); break;
      case AI_STATE.COMBAT: this._combat(e, dt, game, player, dist, sees); break;
      case AI_STATE.SEARCH: this._search(e, dt, game); break;
      case AI_STATE.RETURN: this._return(e, dt, game); break;
      case AI_STATE.FLEE: this._flee(e, dt, game, gas); break;
      default: break;
    }

    // Unstick: if an enemy has barely moved while trying to, repath.
    const moved = e.pos.distanceToSquared(e._lastPos);
    e._lastPos.copy(e.pos);
    if (e.moveInput.mag > 0.3 && moved < 0.0004) {
      e.stuckTimer += dt;
      if (e.stuckTimer > 0.7) {
        e.stuckTimer = 0;
        e.path = null;
        e.strafeDir *= -1;
        // Sidestep to break the deadlock.
        e.setMove(Math.cos(e.yaw) * e.strafeDir, -Math.sin(e.yaw) * e.strafeDir, 0.8);
      }
    } else e.stuckTimer = 0;
  }

  _alertNearby(game, source, radius) {
    for (const a of game.actors) {
      if (!(a instanceof Enemy) || a === source || a.dead || a.aggro) continue;
      if (Math.hypot(a.pos.x - source.pos.x, a.pos.z - source.pos.z) > radius) continue;
      a.awareness = 1;
      a.aggro = true;
      a.target = game.player;
      a.aiState = AI_STATE.COMBAT;
      a.lastSeen.x = source.lastSeen.x;
      a.lastSeen.z = source.lastSeen.z;
      a.lastSeen.y = source.lastSeen.y;
      a.lastSeen.t = this.time;
    }
  }

  _idle(e, dt, game) {
    e.setMove(0, 0, 0);
    e.alert = 0;
    if (e.patrol && e.patrol.length > 1) { e.aiState = AI_STATE.PATROL; return; }
    if (e.think <= 0) {
      e.think = e.rng.range(2.4, 5.5);
      // Look around. Idle enemies that never move read as props.
      e.targetYaw = e.yaw + e.rng.sym(1.5);
    }
  }

  _patrol(e, dt, game) {
    const p = e.patrol[e.patrolIndex];
    const d = Math.hypot(p.x - e.pos.x, p.z - e.pos.z);
    if (d < 1.4) {
      e.patrolIndex = (e.patrolIndex + 1) % e.patrol.length;
      e.think = e.rng.range(1.0, 3.0);
      e.setMove(0, 0, 0);
      return;
    }
    if (e.think > 0) { e.setMove(0, 0, 0); return; }
    this._moveTowards(e, p.x, p.z, game, 0.42);
    e.alert = 0.15;
  }

  _suspicious(e, dt, game) {
    e.alert = 0.55;
    const d = Math.hypot(e.lastSeen.x - e.pos.x, e.lastSeen.z - e.pos.z);
    if (d > 3) this._moveTowards(e, e.lastSeen.x, e.lastSeen.z, game, 0.5);
    else {
      e.setMove(0, 0, 0);
      e.faceTowards(e.lastSeen.x, e.lastSeen.z);
    }
    if (e.awareness <= 0.05) e.aiState = e.patrol ? AI_STATE.PATROL : AI_STATE.IDLE;
  }

  _search(e, dt, game) {
    e.alert = 0.8;
    if (this.time - e.lastSeen.t > 12) {
      e.aggro = false;
      e.aiState = e.patrol ? AI_STATE.PATROL : AI_STATE.IDLE;
      e.awareness = 0;
      return;
    }
    const d = Math.hypot(e.lastSeen.x - e.pos.x, e.lastSeen.z - e.pos.z);
    if (d > 2) this._moveTowards(e, e.lastSeen.x, e.lastSeen.z, game, 0.62);
    else {
      e.setMove(0, 0, 0);
      if (e.think <= 0) {
        e.think = e.rng.range(0.8, 1.8);
        e.targetYaw = e.yaw + e.rng.sym(2.2);
      }
    }
  }

  /** Walk back to where this one started, and stop caring on the way. */
  _return(e, dt, game) {
    e.alert = 0.3;
    e.guarding = false;
    e.wantSprint = false;
    const d = e.distFromHome();
    if (d < 2.2) {
      e.aiState = e.patrol ? AI_STATE.PATROL : AI_STATE.IDLE;
      e.awareness = 0;
      return;
    }
    this._moveTowards(e, e.homeX, e.homeZ, game, 0.6);
  }

  _combat(e, dt, game, player, dist, sees) {
    e.alert = 1;
    e.target = player;

    if (player.dead) { e.aggro = false; e.aiState = AI_STATE.IDLE; return; }

    if (!sees && this.time - e.lastSeen.t > 3.2) {
      e.aiState = AI_STATE.SEARCH;
      return;
    }

    e.animator.lookAt = _v.set(
      (player.pos.x - e.pos.x), (player.pos.y + 1.4) - (e.pos.y + 1.5), (player.pos.z - e.pos.z)
    ).applyAxisAngle(UP, -e.yaw);

    // COMMIT. The facing guard has to come BEFORE faceTowards, not after: a
    // swing that keeps steering toward you through its own wind-up cannot be
    // sidestepped, and a scav closed half the angle to the player during every
    // one. An attack now points where it pointed when it started.
    if (e.isAttacking) { e.setMove(0, 0, 0); return; }
    if (!e.canAct) return;

    e.faceTowards(player.pos.x, player.pos.z);

    const A = e.arch;

    // --- ranged archetypes ------------------------------------------------
    if (A.ranged) {
      if (dist < A.minRange) {
        // Back off, keeping the player in view.
        const away = Math.atan2(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
        e.setMove(Math.sin(away), Math.cos(away), 0.9);
      } else if (dist > A.preferred * 1.4) {
        this._moveTowards(e, player.pos.x, player.pos.z, game, 0.7);
      } else {
        // Strafe for a clear line.
        const t = Math.atan2(player.pos.x - e.pos.x, player.pos.z - e.pos.z);
        const s = t + Math.PI / 2 * e.strafeDir;
        e.setMove(Math.sin(s), Math.cos(s), 0.55);
        if (e.think <= 0) { e.think = e.rng.range(1.2, 2.6); e.strafeDir *= -1; }
      }
      if (e.rangedCooldown <= 0 && sees && dist > A.minRange * 0.9 && dist < A.sight) {
        e.rangedCooldown = e.rng.range(...A.ranged.cooldown);
        this._throw(e, player, game);
      }
      return;
    }

    // --- melee ------------------------------------------------------------
    const combat = game.combat;
    // `pack` — dogs. Alone a dog is trivial; the archetype comment promised
    // "dangerous in threes". Packmates nearby spread out to surround rather
    // than stacking on one line, and press harder together.
    let pref = A.preferred;
    let aggression = A.aggression;
    if (A.pack) {
      const mates = this._packmates(game, e, 9);
      if (mates > 0) {
        pref += mates * 0.5;
        aggression = clamp01(aggression + mates * 0.07);
      }
    }
    // A fight that has already drawn blood is fought harder. `combatHeat` was
    // written on every hit and read by nothing.
    aggression = clamp01(aggression * (1 + combat.combatHeat * 0.25));

    // --- evade ------------------------------------------------------------
    // `dodgeChance` was declared on all five archetypes and read nowhere, so
    // no enemy in the game ever moved out of the way. Rolled once per player
    // swing, at the moment the player commits, so it reads as a reaction.
    if (A.dodgeChance > 0 && player.attack && player.attack !== e._sawSwing) {
      e._sawSwing = player.attack;
      if (dist < player.attack.def.reach + 1.0 && e.rng.f() < A.dodgeChance) {
        const away = Math.atan2(e.pos.x - player.pos.x, e.pos.z - player.pos.z) +
                     e.rng.sym(0.7);
        e.yaw = e.targetYaw = away;
        e.vel.x = Math.sin(away) * 8.5;
        e.vel.z = Math.cos(away) * 8.5;
        e.dodgeT = 0.2;
        e.iframes = 0.16;
        e.iframeLock = true;
        e.animator.play('dodge', { fade: 0.05, force: true });
        e.attackCooldown = Math.max(e.attackCooldown, 0.45);
        e.emit('evade', {});
        return;
      }
    }

    if (dist > pref + 0.6) {
      // Close. Sprint the last stretch if the archetype has it in them.
      const urgency = clamp01((dist - pref) / 8);
      this._moveTowards(e, player.pos.x, player.pos.z, game, lerp(0.55, 1.0, urgency));
      e.wantSprint = dist > 7 && A.speedSprint > A.speedRun * 1.1;
    } else if (dist < pref - 0.75) {
      const away = Math.atan2(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      e.setMove(Math.sin(away), Math.cos(away), 0.6);
      e.wantSprint = false;
    } else {
      // In range: circle, and wait for a token before committing.
      e.wantSprint = false;
      const t = Math.atan2(player.pos.x - e.pos.x, player.pos.z - e.pos.z);
      const s = t + Math.PI / 2 * e.strafeDir;
      e.setMove(Math.sin(s), Math.cos(s), A.strafeBias);
      if (e.think <= 0) {
        e.think = e.rng.range(0.7, 1.9);
        if (e.rng.chance(0.4)) e.strafeDir *= -1;
      }

      // --- chain ----------------------------------------------------------
      // CombatSystem sets comboWindow/comboNext on every actor and nothing here
      // ever read them, so every archetype was a one-attack unit and three of
      // the eight enemy attacks — scavSwing2, wardenJab2, wardenShove — could
      // never execute at all. The Warden's guard-break, its whole reason to
      // exist, was unreachable content.
      if (e.comboWindow > 0 && e.comboNext && e.rng.f() < aggression) {
        const nxt = e.comboNext;
        e.comboWindow = 0;
        e.comboNext = null;
        if (combat.requestToken(e) && combat.start(e, nxt, { chain: true })) {
          e.attackCooldown = e.rng.range(...A.patience);
          return;
        }
      }

      if (e.attackCooldown <= 0) {
        const wants = e.rng.f() < aggression;
        if (wants && combat.requestToken(e)) {
          const name = A.attacks[e.rng.int(0, A.attacks.length - 1)];
          // The token is NOT released here. It is surrendered by CombatSystem
          // when the swing (and any chain off it) finishes. Taking and giving
          // it back in the same statement made `maxAttackers` decorative: the
          // set was empty again before the next enemy in the loop was asked.
          if (combat.start(e, name)) {
            // No `+ windup`: the wind-up is already inside the attack's own
            // duration, so adding it again made the Breaker a third less
            // aggressive than its patience range says.
            e.attackCooldown = e.rng.range(...A.patience);
          }
        } else {
          e.attackCooldown = e.rng.range(0.25, 0.7);
        }
      }
    }

    // --- guard ------------------------------------------------------------
    // Wardens raise the shield between commitments, and specifically when the
    // player commits. This used to be re-rolled EVERY FIXED STEP: whether your
    // swing was blocked was a coin flip taken on the single frame the arc
    // resolved, and `play('parry', force)` restarted eleven times a second, so
    // the Warden's upper body sat frozen on the parry's first key, visibly
    // buzzing. One roll per player swing, one roll per idle interval.
    if (A.blockChance > 0) {
      e._guardTimer = (e._guardTimer ?? 0) - dt;
      const pAtk = player.attack;
      if (pAtk && pAtk !== e._sawPlayerAttack) {
        e._sawPlayerAttack = pAtk;
        e._guardWant = e.rng.f() < A.blockChance;
        e._guardTimer = 0.9;
      } else if (!pAtk && e._guardTimer <= 0) {
        e._guardTimer = e.rng.range(0.45, 1.1);
        e._guardWant = e.rng.f() < A.blockChance * 0.4;
      }
      e.guarding = !!e._guardWant && !e.isAttacking && dist < pref + 2.2 && e.stamina > 12;
    }
  }

  /** Live, aggroed packmates of the same kind within `radius`. */
  _packmates(game, e, radius) {
    let n = 0;
    for (const a of game.actors) {
      if (a === e || a.dead || !(a instanceof Enemy)) continue;
      if (a.kind !== e.kind || !a.aggro) continue;
      if (Math.hypot(a.pos.x - e.pos.x, a.pos.z - e.pos.z) < radius) n++;
    }
    return n;
  }

  _flee(e, dt, game, gas) {
    e.alert = 0.7;
    e.wantSprint = true;
    e.guarding = false;

    // Head for better air, or away from the player if this is a health flee.
    if (gas && e.localPpm(gas) > e.arch.gasFear * 0.5) {
      const g = { x: 0, z: 0 };
      gas.gradient(e.pos.x, e.pos.y + 1.4, e.pos.z, g);
      const len = Math.hypot(g.x, g.z) || 1;
      // Move down the gradient (toward less gas), with a bias uphill/outward.
      e.setMove(-g.x / len, -g.z / len, 1);
      e.targetYaw = Math.atan2(-g.x / len, -g.z / len);
    } else if (game.player) {
      const away = Math.atan2(e.pos.x - game.player.pos.x, e.pos.z - game.player.pos.z);
      e.setMove(Math.sin(away), Math.cos(away), 1);
    }

    if (e.fleeUntil && this.time > e.fleeUntil && e.lungs.sat < 0.12) {
      e.fleeUntil = 0;
      e.aiState = e.aggro ? AI_STATE.SEARCH : AI_STATE.IDLE;
    }
  }

  /**
   * Path or steer toward a point. Short hops steer directly; longer ones use
   * the nav grid, repathing on a timer rather than every frame.
   */
  _moveTowards(e, tx, tz, game, speedScale) {
    const dx = tx - e.pos.x, dz = tz - e.pos.z;
    const d = Math.hypot(dx, dz);

    const direct = d < 6 && game.world.lineOfSight(
      e.pos.x, e.pos.y + 0.9, e.pos.z, tx, e.pos.y + 0.9, tz, LAYER.SOLID);

    if (direct || !game.nav) {
      e.setMove(dx / (d || 1), dz / (d || 1), speedScale);
      e.path = null;
      return;
    }

    e.pathTime -= 1 / 60;
    const needPath = !e.path || e.pathTime <= 0 ||
      Math.hypot(e.pathGoal.x - tx, e.pathGoal.z - tz) > 3.5;
    if (needPath) {
      e.pathTime = 0.6;
      e.pathGoal = { x: tx, z: tz };
      e.path = game.nav.findPath(e.pos.x, e.pos.y, e.pos.z, tx, e.pos.y, tz, 700);
      e.pathIndex = 0;
    }

    if (!e.path || e.pathIndex >= e.path.length) {
      e.setMove(dx / (d || 1), dz / (d || 1), speedScale * 0.8);
      return;
    }
    const wp = e.path[e.pathIndex];
    const wd = Math.hypot(wp.x - e.pos.x, wp.z - e.pos.z);
    if (wd < 1.0) { e.pathIndex++; return; }
    e.setMove((wp.x - e.pos.x) / wd, (wp.z - e.pos.z) / wd, speedScale);
  }

  /** Slinger projectile: a half brick, with real travel time. */
  _throw(e, target, game) {
    e.animator.play('throw', { fade: 0.06, force: true });
    const A = e.arch.ranged;
    const delay = A.windup;
    setTimeoutSim(game, delay, () => {
      if (e.dead) return;
      const ox = e.pos.x, oy = e.pos.y + 1.35, oz = e.pos.z;
      const tx = target.pos.x, ty = target.pos.y + 0.9, tz = target.pos.z;
      const d = Math.hypot(tx - ox, tz - oz);
      const flight = d / A.speed;
      // Lead the target; a thrown brick that always misses a moving player is
      // a decoration, and one that always hits is unfair.
      const lead = 0.55;
      const px = tx + target.vel.x * flight * lead;
      const pz = tz + target.vel.z * flight * lead;
      const vy = (ty - oy) / flight + 0.5 * 9.8 * flight;
      const dxn = (px - ox) / flight, dzn = (pz - oz) / flight;
      this.projectiles.push({
        x: ox, y: oy, z: oz, vx: dxn, vy, vz: dzn,
        life: 4, damage: A.damage, owner: e, mesh: this._projMesh(game),
      });
      game.emit('sfx', 'throw', { x: ox, y: oy, z: oz });
    });
  }

  _projMesh(game) {
    if (!this._projGeo) {
      this._projGeo = new THREE.BoxGeometry(0.16, 0.09, 0.09);
      this._projMat = game.mats.character(0x6a5a4c, { roughness: 0.95, textured: false, flat: true });
    }
    const m = new THREE.Mesh(this._projGeo, this._projMat);
    m.castShadow = false;
    game.scene.add(m);
    return m;
  }

  _updateProjectiles(dt, game) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.vy -= 9.8 * dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;

      let hit = null;
      // Actors first.
      for (const a of game.actors) {
        if (a === p.owner || a.dead) continue;
        if (a.faction === p.owner.faction) continue;
        const d = Math.hypot(a.pos.x - nx, a.pos.z - nz);
        if (d < a.radius + 0.28 && ny > a.pos.y && ny < a.pos.y + a.height) { hit = a; break; }
      }
      const ray = game.world.raycast(p.x, p.y, p.z, p.vx, p.vy, p.vz,
        Math.hypot(p.vx, p.vy, p.vz) * dt + 0.05);

      if (hit || ray || p.life <= 0) {
        const hx = hit ? hit.pos.x : (ray ? ray.x : nx);
        const hy = hit ? ny : (ray ? ray.y : ny);
        const hz = hit ? hit.pos.z : (ray ? ray.z : nz);
        if (hit) {
          const dd = Math.hypot(hit.pos.x - p.x, hit.pos.z - p.z) || 1;
          hit.damage({
            amount: p.damage, poise: 14, kind: 'blunt',
            dirX: (hit.pos.x - p.x) / dd, dirZ: (hit.pos.z - p.z) / dd,
            source: p.owner,
          });
          if (hit === game.player) {
            game.camera.addShake(0.3);
            game.flash(0x8c1a10, 0.25);
          }
          game.emit('sfx', 'hitBlunt', { x: hx, y: hy, z: hz });
          game.atmos.spawnBurst('impact', hx, hy, hz, 0, 0.6, 0, 6, 0.8);
        } else {
          game.emit('sfx', 'brickHit', { x: hx, y: hy, z: hz });
          game.atmos.spawnBurst('impact', hx, hy, hz, 0, 0.7, 0, 8, 0.9);
        }
        game.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }

      p.x = nx; p.y = ny; p.z = nz;
      p.mesh.position.set(nx, ny, nz);
      p.mesh.rotation.x += dt * 12;
      p.mesh.rotation.z += dt * 9;
    }
  }

  clearProjectiles(game) {
    for (const p of this.projectiles) game.scene.remove(p.mesh);
    this.projectiles.length = 0;
  }
}

const UP = new THREE.Vector3(0, 1, 0);

/** Simulation-time timeout; survives pauses correctly. */
const _timers = [];
function setTimeoutSim(game, delay, fn) {
  _timers.push({ t: delay, fn });
  if (!game._simTimerHook) {
    game._simTimerHook = true;
    game.engine.addUpdater((dt) => {
      for (let i = _timers.length - 1; i >= 0; i--) {
        _timers[i].t -= dt;
        if (_timers[i].t <= 0) { const f = _timers[i].fn; _timers.splice(i, 1); try { f(); } catch (e) { console.error(e); } }
      }
    }, 5);
  }
}
