/**
 * Combat.
 *
 * The design rules, which everything below serves:
 *
 *   READABLE   Every attack has a visible wind-up whose length is the same
 *              every time. You lose because you misread it, not because it was
 *              invisible.
 *   FAIR       Only a limited number of enemies may commit at once. The rest
 *              circle, which reads as tactics and is really a fairness valve.
 *   COMMITTED  Once you swing you are swinging. Cancels exist only through the
 *              dodge, and the dodge costs stamina.
 *   PHYSICAL   Hit-stop, camera shake, sparks, a decal and a stagger. A hit
 *              that does not stop time for four frames does not feel like a hit.
 *
 * Hit detection is an arc test rather than swept geometry: for the duration of
 * the active window, anything inside the attacker's reach and arc that has not
 * already been hit by this swing takes the hit. This is exact, allocation-free,
 * and — crucially — matches what the player sees, because the arc is the same
 * shape as the animation.
 */

import { clamp01, lerp } from '../core/util.js';

/**
 * Attack table.
 *
 *   windup / active / recover  seconds; they sum to the animation length
 *   reach                      metres from the attacker's centre
 *   arc                        HALF-angle in radians — the test is
 *                              `dot < cos(arc)`, so 1.15 is a 132° sweep, and
 *                              anything past ~1.3 starts hitting people behind
 *                              you, which no animation in this game supports
 *   damage / poise             applied on hit
 *   stamina                    cost to start
 *   moveScale                  how much the attacker may steer while swinging
 *   rootMotion                 multiplier on the clip's forward push
 *
 * TIMING RULE. The clip is played at speed = clipDur / total, so the normalised
 * clip time equals t / total. The contact pose of each clip sits at a fixed
 * fraction of the clip: atk1 0.44, atk2 0.47, atk3 0.55, heavy 0.65. For the
 * hitbox to agree with what the player sees, `contact * total` must fall inside
 * [windup, windup + active]. Every row below satisfies that; if you retune one,
 * re-check it. Five enemy attacks used to damage you before the weapon had
 * arrived, which is indistinguishable from the game cheating.
 *
 * READABILITY RULE. No enemy wind-up is shorter than 0.40 s. Below that it is
 * under the sum of phone input latency and human reaction time, so it is not a
 * wind-up, it is a dice roll.
 */
export const ATTACKS = {
  // --- Ren, prying bar ---------------------------------------------------
  light1: {
    clip: 'atk1', windup: 0.19, active: 0.11, recover: 0.32,
    reach: 2.05, arc: 1.15, damage: 17, poise: 16, stamina: 11,
    moveScale: 0.16, rootMotion: 1.0, next: 'light2', comboWindow: 0.42,
    hitstop: 0.06, shake: 0.16, sound: 'swing', impact: 'blunt',
  },
  light2: {
    clip: 'atk2', windup: 0.21, active: 0.11, recover: 0.34,
    reach: 2.1, arc: 1.25, damage: 20, poise: 19, stamina: 12,
    moveScale: 0.16, rootMotion: 1.0, next: 'light3', comboWindow: 0.42,
    hitstop: 0.065, shake: 0.18, sound: 'swing', impact: 'blunt',
  },
  light3: {
    clip: 'atk3', windup: 0.38, active: 0.14, recover: 0.38,
    reach: 2.3, arc: 0.95, damage: 32, poise: 40, stamina: 20,
    moveScale: 0.1, rootMotion: 1.0, next: null, comboWindow: 0,
    hitstop: 0.11, shake: 0.4, sound: 'swingHeavy', impact: 'blunt', stagger: true,
  },
  heavy: {
    clip: 'heavy', windup: 0.55, active: 0.17, recover: 0.38,
    reach: 2.5, arc: 1.15, damage: 38, poise: 58, stamina: 26,
    moveScale: 0.08, rootMotion: 1.0, next: null, comboWindow: 0,
    hitstop: 0.13, shake: 0.5, sound: 'swingHeavy', impact: 'blunt',
    guardBreak: true, stagger: true,
  },

  // --- enemy attacks -----------------------------------------------------
  scavSwing: {
    clip: 'atk1', windup: 0.42, active: 0.11, recover: 0.44,
    reach: 1.95, arc: 1.0, damage: 20, poise: 20, stamina: 0,
    moveScale: 0.12, rootMotion: 0.9, next: 'scavSwing2', comboWindow: 0.34,
    hitstop: 0.05, shake: 0.1, sound: 'swing', impact: 'blunt',
  },
  scavSwing2: {
    clip: 'atk2', windup: 0.42, active: 0.1, recover: 0.5,
    reach: 1.95, arc: 1.05, damage: 21, poise: 21, stamina: 0,
    moveScale: 0.12, rootMotion: 0.9, next: null, comboWindow: 0,
    hitstop: 0.05, shake: 0.11, sound: 'swing', impact: 'blunt',
  },
  breakerSmash: {
    clip: 'heavy', windup: 1.0, active: 0.2, recover: 0.62,
    reach: 2.6, arc: 1.05, damage: 30, poise: 70, stamina: 0,
    moveScale: 0.06, rootMotion: 1.1, next: null, comboWindow: 0,
    hitstop: 0.14, shake: 0.6, sound: 'swingHeavy', impact: 'blunt',
    guardBreak: true, stagger: true, telegraph: 'heavy',
  },
  breakerOverhead: {
    clip: 'atk3', windup: 0.92, active: 0.16, recover: 0.7,
    reach: 2.3, arc: 0.8, damage: 36, poise: 90, stamina: 0,
    moveScale: 0.04, rootMotion: 1.2, next: null, comboWindow: 0,
    hitstop: 0.16, shake: 0.75, sound: 'swingHeavy', impact: 'blunt',
    guardBreak: true, stagger: true, telegraph: 'heavy',
  },
  wardenJab: {
    clip: 'atk1', windup: 0.4, active: 0.09, recover: 0.52,
    reach: 1.85, arc: 0.8, damage: 19, poise: 21, stamina: 0,
    moveScale: 0.2, rootMotion: 0.8, next: 'wardenJab2', comboWindow: 0.34,
    hitstop: 0.05, shake: 0.1, sound: 'swing', impact: 'blunt',
  },
  wardenJab2: {
    clip: 'atk2', windup: 0.4, active: 0.09, recover: 0.4,
    reach: 1.85, arc: 0.85, damage: 20, poise: 22, stamina: 0,
    moveScale: 0.2, rootMotion: 0.8, next: 'wardenShove', comboWindow: 0.32,
    hitstop: 0.05, shake: 0.11, sound: 'swing', impact: 'blunt',
  },
  wardenShove: {
    clip: 'heavy', windup: 0.66, active: 0.14, recover: 0.42,
    reach: 1.7, arc: 1.05, damage: 14, poise: 62, stamina: 0,
    moveScale: 0.1, rootMotion: 1.3, next: null, comboWindow: 0,
    hitstop: 0.09, shake: 0.32, sound: 'shove', impact: 'blunt',
    guardBreak: true, stagger: true, telegraph: 'shove',
  },
  dogBite: {
    clip: 'atk1', windup: 0.4, active: 0.1, recover: 0.5,
    reach: 1.5, arc: 0.7, damage: 14, poise: 16, stamina: 0,
    moveScale: 0.3, rootMotion: 1.6, next: null, comboWindow: 0,
    hitstop: 0.04, shake: 0.1, sound: 'bite', impact: 'flesh',
  },
};

/** Impact presets for particles and decals. */
const IMPACT = {
  blunt: { particles: 'impact', count: 9, sparks: 4, decal: null },
  flesh: { particles: 'blood', count: 10, sparks: 0, decal: 'blood' },
};

/** Contact fraction of each action clip — see the TIMING RULE above. */
export const CLIP_CONTACT = { atk1: 0.44, atk2: 0.47, atk3: 0.55, heavy: 0.65 };

/**
 * Below this fraction of maximum stamina Ren is winded: the light chain comes
 * out slower and the heavy will not come out at all.
 */
const EXHAUSTED = 0.15;
/** Committed dodge window: displacement is not damped away inside it. */
const DODGE_DRIVE = 0.22;
/** Dodge impulse, m/s. With DODGE_DRIVE this is about 2.9 m of travel. */
const DODGE_SPEED = 12.0;
/** Minimum gap between dodges, from the press. */
const DODGE_COOLDOWN = 0.35;
/** How long an enemy must wait after finishing a swing before it may re-queue. */
const TOKEN_LOCKOUT = 0.55;
/** A token holder that never converts it into a swing loses it this fast. */
const TOKEN_GRACE = 0.6;

export class CombatSystem {
  constructor(game) {
    this.game = game;
    this.hits = [];
    /**
     * Attack tokens. At most this many enemies may be in an attack at once,
     * regardless of how many are engaged. Everything else about the encounter
     * design depends on this number being small.
     */
    this.maxAttackers = 2;
    /** id -> simulation time the token was granted. */
    this.attackTokens = new Map();
    this.time = 0;
    /**
     * 0..1. Rises with every landed blow and bleeds off. Read by the AI, which
     * presses harder while a fight is hot — an encounter that has already drawn
     * blood should not feel the same as one that has not started.
     */
    this.combatHeat = 0;
    this.lastHitTime = -99;
  }

  /** Why an attack refused to start. Read by handlePlayerAction for feedback. */
  get lastRefusal() { return this._refusal; }

  /**
   * Begin an attack. Returns true if it started.
   */
  start(actor, attackName, opts = {}) {
    this._refusal = null;
    const A = ATTACKS[attackName];
    if (!A || !actor.canAct || actor.dead) return false;
    if (actor.attack && !opts.chain) return false;
    // A dodge's invulnerability is not an attack buff. You cannot swing out of
    // it; the i-frames belong to the evade, and they end when it does.
    if (actor.iframeLock && actor.iframes > 0) { this._refusal = 'iframes'; return false; }

    if (A.stamina > 0) {
      // Full price. Half price meant stamina never actually stopped you.
      if (actor.stamina < A.stamina) { this._refusal = 'stamina'; return false; }
      // Winded: the heavy is off the table entirely.
      if (actor.stamina < actor.maxStamina * EXHAUSTED && A.stamina >= 20) {
        this._refusal = 'stamina';
        return false;
      }
    }

    actor.stamina = Math.max(0, actor.stamina - A.stamina);
    actor._staminaHold = 0.9;
    actor.guarding = false;
    actor.iframes = 0;
    actor.iframeLock = false;

    // Winded swings are slower — the penalty is legibility, not a hidden number.
    const winded = A.stamina > 0 && actor.stamina < actor.maxStamina * EXHAUSTED;
    const total = (A.windup + A.active + A.recover) * (winded ? 1.22 : 1);
    actor.attack = {
      def: A, name: attackName, t: 0, total,
      windup: A.windup * (winded ? 1.22 : 1),
      active: A.active * (winded ? 1.22 : 1),
      moveScale: A.moveScale, rootMotion: A.rootMotion,
      hitSet: new Set(), landed: false,
    };
    const dur = A.clip === 'atk1' ? 0.62 : A.clip === 'atk2' ? 0.66 : A.clip === 'atk3' ? 0.9 : 1.1;
    actor.animator.play(A.clip, { speed: dur / total, fade: 0.05, force: true });
    actor.emit('attackstart', { name: attackName, def: A });
    return true;
  }

  /** Advance every actor's active attack and resolve hits. */
  update(dt, game) {
    this.time += dt;
    this.combatHeat = Math.max(0, this.combatHeat - dt * 0.18);
    this._syncCapabilities(game);

    const actors = game.actors;
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      if (!a.attack) continue;
      if (a.hitstop > 0) continue;
      const atk = a.attack;
      const prev = atk.t;
      atk.t += dt;
      const A = atk.def;

      const activeStart = atk.windup;
      const activeEnd = atk.windup + atk.active;

      // Telegraph at the TOP of the wind-up, not a seventh of a second before
      // impact. A tell that arrives inside human reaction time is not a tell.
      // `coldRead` moves it to the very first frame of the swing.
      if (A.telegraph && !atk.told) {
        const at = this._coldRead ? 0.02 : Math.min(activeStart * 0.32, 0.22);
        if (atk.t >= at) {
          atk.told = true;
          // The tell lasts until contact, so it is a countdown, not a blink.
          a.telegraphFlash(Math.max(0.18, activeStart - atk.t));
          a.emit('telegraph', { kind: A.telegraph, early: !!this._coldRead, lead: activeStart - atk.t });
        }
      }

      if (atk.t >= activeStart && prev < activeEnd && atk.t <= activeEnd + dt) {
        this._resolveArc(a, atk, game);
      }

      if (atk.t >= atk.total) {
        a.attack = null;
        a.comboWindow = A.comboWindow;
        a.comboNext = A.next;
        a.emit('attackend', { name: atk.name, landed: atk.landed });
        // The token is held through a live combo window — a chain is one
        // commitment, not two — and surrendered the moment the chain lapses.
        if (!(A.next && A.comboWindow > 0)) this._surrenderToken(a);
      } else if (atk.t >= activeEnd && A.next && a.comboWindow <= 0) {
        // The combo window opens as recovery begins, not when it ends: pressing
        // early should chain, not be swallowed. See handlePlayerAction.
        a.comboWindow = A.comboWindow;
        a.comboNext = A.next;
      }
    }

    this._updateTokens(game);
  }

  /**
   * Push the capability state onto the player once per step. The actor layer
   * has no route to the director, and these are all things the combat rules
   * need to read every frame, so they are mirrored here rather than queried.
   */
  _syncCapabilities(game) {
    const S = game.director && game.director.state;
    const p = game.player;
    this._coldRead = !!(S && S.can('coldRead'));
    if (!p || !S) return;
    // hardHands: a wider parry window, and a guard that does not fold on the
    // first heavy swing. Previously read at actor.js and never assigned.
    const hard = S.can('hardHands');
    p.parryBonus = hard;
    const baseGuard = p.opts.guardHealth ?? 74;
    const wantGuard = hard ? baseGuard * 1.45 : baseGuard;
    if (p.guardHealth !== wantGuard) {
      const frac = p.guardHealth > 0 ? p.guardCurrent / p.guardHealth : 1;
      p.guardHealth = wantGuard;
      p.guardCurrent = wantGuard * frac;
    }
    p.lungs.goodHabits = S.can('goodHabits');
    p.shortRope = S.can('shortRope');
  }

  /** Anyone inside the arc who has not been hit by this swing takes it. */
  _resolveArc(attacker, atk, game) {
    const A = atk.def;
    const fx = -Math.sin(attacker.yaw), fz = -Math.cos(attacker.yaw);
    const ax = attacker.pos.x, az = attacker.pos.z;
    const ay = attacker.pos.y;
    const reach = A.reach;

    for (const target of game.actors) {
      if (target === attacker || target.dead) continue;
      if (!this._hostile(attacker, target)) continue;
      if (atk.hitSet.has(target.id)) continue;

      const dx = target.pos.x - ax, dz = target.pos.z - az;
      const dist = Math.hypot(dx, dz);
      if (dist > reach + target.radius) continue;
      // Vertical band: you cannot hit someone on the roof above you.
      if (Math.abs(target.pos.y - ay) > 1.5) continue;
      if (dist > 0.01) {
        const dot = (dx / dist) * fx + (dz / dist) * fz;
        if (dot < Math.cos(A.arc)) continue;
      }

      atk.hitSet.add(target.id);
      this._applyHit(attacker, target, atk, game, dx / (dist || 1), dz / (dist || 1));
    }
  }

  _hostile(a, b) {
    if (a.faction === b.faction) return false;
    if (b.faction === 'neutral' || a.faction === 'neutral') return false;
    return true;
  }

  _applyHit(attacker, target, atk, game, dirX, dirZ) {
    const A = atk.def;
    const dmg = A.damage * (attacker.damageMul ?? 1);

    const res = target.damage({
      amount: dmg,
      poise: A.poise,
      kind: A.impact === 'flesh' ? 'flesh' : 'blunt',
      dirX, dirZ,
      stagger: A.stagger,
      guardBreak: A.guardBreak,
      source: attacker,
    });

    atk.landed = true;
    this.lastHitTime = this.time;
    this.combatHeat = Math.min(1, this.combatHeat + 0.35);

    // --- feedback ---------------------------------------------------------
    const px = lerp(attacker.pos.x, target.pos.x, 0.62);
    const pz = lerp(attacker.pos.z, target.pos.z, 0.62);
    const py = target.pos.y + target.height * (res.blocked ? 0.68 : 0.58);

    const isPlayerAttacker = attacker === game.player;
    const isPlayerTarget = target === game.player;

    if (res.parried) {
      game.atmos.spawnBurst('spark', px, py, pz, -dirX, 0.4, -dirZ, 16, 1.1);
      attacker.hitstop = 0.2;
      target.hitstop = 0.1;
      if (isPlayerTarget || isPlayerAttacker) game.camera.addShake(0.45);
      // A parry staggers the attacker; it is the reward for exact timing.
      attacker.stagger(0.85);
      game.emit('sfx', 'parry', { x: px, y: py, z: pz });
      game.flash(0xfff0d0, 0.18);
    } else if (res.blocked) {
      game.atmos.spawnBurst('spark', px, py, pz, -dirX, 0.3, -dirZ, 9, 0.9);
      attacker.hitstop = 0.09;
      target.hitstop = 0.07;
      if (isPlayerTarget || isPlayerAttacker) game.camera.addShake(A.shake * 0.55);
      game.emit('sfx', 'block', { x: px, y: py, z: pz });
    } else if (res.dodged) {
      game.emit('sfx', 'whiff', { x: px, y: py, z: pz });
    } else {
      const imp = IMPACT[A.impact] || IMPACT.blunt;
      game.atmos.spawnBurst(imp.particles, px, py, pz, dirX * 0.4, 0.7, dirZ * 0.4, imp.count, 1);
      if (imp.sparks) game.atmos.spawnBurst('spark', px, py, pz, dirX * 0.5, 0.6, dirZ * 0.5, imp.sparks, 0.8);
      attacker.hitstop = A.hitstop * (isPlayerAttacker ? 1 : 0.7);
      target.hitstop = A.hitstop * 0.8;
      if (isPlayerTarget) {
        game.camera.addShake(A.shake * 1.5);
        game.flash(0x8c1a10, clamp01(res.amount / 60) * 0.4);
      } else if (isPlayerAttacker) {
        game.camera.addShake(A.shake);
      }
      game.emit('sfx', A.impact === 'flesh' ? 'hitFlesh' : 'hitBlunt', { x: px, y: py, z: pz });
      game.emit('damageNumber', { target, amount: Math.round(res.amount), crit: A.stagger, x: px, y: py, z: pz });

      if (res.killed) {
        game.emit('kill', { attacker, target });
        // A finishing blow on the last enemy gets a beat of slow motion. Used
        // sparingly: it means "that was the end of it", not "you hit something".
        if (isPlayerAttacker && this._lastEnemyStanding(game, target)) {
          game.engine.slowmo(0.35, 0.7);
        }
      }
    }
  }

  _lastEnemyStanding(game, justKilled) {
    for (const a of game.actors) {
      if (a === justKilled || a.dead) continue;
      if (a.faction !== 'player' && a.faction !== 'neutral' && a.aggro) return false;
    }
    return true;
  }

  /**
   * Hand out attack tokens. Enemies without a token will not commit, so the
   * player is never surrounded by four simultaneous swings.
   *
   * A token is held for the whole commitment — wind-up, active frames, recovery
   * and any chain — and released here (or by `update` when the swing ends). It
   * used to be taken and given back in the same statement, which made the cap
   * decorative and let eight enemies swing at once.
   */
  _updateTokens(game) {
    if (this.attackTokens.size === 0) return;
    for (const [id, granted] of this.attackTokens) {
      const a = game.actors.find((x) => x.id === id);
      if (!a || a.dead || !a.canAct) { this.attackTokens.delete(id); continue; }
      if (a.attack) continue;
      if (a.comboWindow > 0 && a.comboNext) continue;
      if (this.time - granted > TOKEN_GRACE) this._surrenderToken(a);
    }
  }

  _surrenderToken(actor) {
    this.attackTokens.delete(actor.id);
    // A short lockout so the same enemy cannot immediately re-take the token it
    // just gave up; without it one aggressive unit monopolises the cap.
    actor.tokenLockout = this.time + TOKEN_LOCKOUT;
  }

  requestToken(actor) {
    if (this.attackTokens.has(actor.id)) return true;
    if ((actor.tokenLockout ?? 0) > this.time) return false;
    if (this.attackTokens.size >= this.maxAttackers) return false;
    this.attackTokens.set(actor.id, this.time);
    return true;
  }

  releaseToken(actor) { this.attackTokens.delete(actor.id); }

  /**
   * A press that cannot be paid for is still a press. Answer it once — one
   * cue, one bar pulse — and swallow the buffered input, rather than silently
   * retrying it sixteen times over the buffer's lifetime.
   *
   * Returns true so the caller consumes the buffer.
   */
  _refuseForStamina(player, game) {
    if (this.time - (player._exhaustCue ?? -99) > 0.55) {
      player._exhaustCue = this.time;
      game.emit('sfx', 'exhausted');
      // HUD hook: pulse the stamina bar red. Harmless if nothing listens.
      game.emit('staminaEmpty', { actor: player });
    }
    return true;
  }

  /**
   * Player input resolution. Called by the game each step with the buffered
   * action, if any. Returning true consumes the buffered press.
   */
  handlePlayerAction(player, action, game) {
    if (!action) return false;

    switch (action) {
      case 'attack': {
        if (player.attack) {
          const a = player.attack;
          // Recovery is cancellable into the chain. The comment on the combo
          // window promised this; it was never implemented, so every press in
          // the first tenth of a recovery was silently dropped.
          if (a.t >= a.windup + a.active && a.def.next) {
            const n = a.def.next;
            player.attack = null;
            player.comboWindow = 0;
            player.comboNext = null;
            if (this.start(player, n, { chain: true })) return true;
            return this._refusal === 'stamina' ? this._refuseForStamina(player, game) : false;
          }
          return false;
        }
        if (player.comboWindow > 0 && player.comboNext) {
          const n = player.comboNext;
          player.comboWindow = 0;
          player.comboNext = null;
          if (this.start(player, n, { chain: true })) return true;
          return this._refusal === 'stamina' ? this._refuseForStamina(player, game) : false;
        }
        if (this.start(player, 'light1')) return true;
        return this._refusal === 'stamina' ? this._refuseForStamina(player, game) : false;
      }
      case 'heavy':
        if (player.attack) return false;
        if (this.start(player, 'heavy')) return true;
        return this._refusal === 'stamina' ? this._refuseForStamina(player, game) : false;
      case 'dodge': {
        if (!player.canAct) return false;
        if ((player.dodgeCooldown ?? 0) > 0) return false;
        if (player.stamina < 16) return this._refuseForStamina(player, game);
        // The dodge cancels an attack's recovery but not its active frames.
        if (player.attack && player.attack.t < player.attack.windup + player.attack.active) return false;
        player.attack = null;
        player.stamina -= 16;
        player._staminaHold = 0.85;
        player.guarding = false;
        player.dodgeCooldown = DODGE_COOLDOWN;
        // Dodge in the stick direction; with no input, dodge backward.
        const m = player.moveInput;
        if (m.mag > 0.2) player.targetYaw = Math.atan2(m.x, m.z);
        else player.targetYaw = player.yaw + Math.PI;
        player.yaw = player.targetYaw;
        player.animator.play('dodge', { fade: 0.04, force: true });
        // Bodily displacement is applied as velocity so it collides properly —
        // and `dodgeT` exempts it from the movement damping for its duration,
        // without which the whole impulse was erased inside six frames and the
        // dodge travelled less than a metre.
        const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
        player.vel.x = fx * DODGE_SPEED;
        player.vel.z = fz * DODGE_SPEED;
        player.dodgeT = DODGE_DRIVE;
        // combat.js owns the i-frame window; the clip's iframeStart/iframeEnd
        // events defer to `iframeLock` so cancelling the dodge cannot leave the
        // player invulnerable for longer than completing it.
        player.iframes = 0.30;
        player.iframeLock = true;
        game.emit('sfx', 'dodge');
        game.atmos.spawnBurst('step', player.pos.x, player.pos.y + 0.1, player.pos.z, 0, 1, 0, 6, 1.2);
        return true;
      }
      default:
        return false;
    }
  }
}
