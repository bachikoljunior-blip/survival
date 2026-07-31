/**
 * In-page driver for the Gate B Chapter 1 representative slice.
 *
 * Traversal enters through the production touch-stick event path. Meter,
 * interaction, guard, dodge and attack enter through Input's production
 * virtual-button path. The driver may plan with the live nav grid, but it does
 * not mutate progression, actor health, actor position or breathing state.
 */
(() => {
  const C = window.CINDERLINE;
  const G = C.game;
  const MODE = C.MODE;
  const P = G.player;
  const DT = 1 / 60;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const report = {
    scope: 'Gate B partial representative slice; not C1, D3 or a playtime measurement',
    errors: [],
    viewport: { width: window.innerWidth, height: window.innerHeight },
    build: C.build,
    assists: {},
    route: { segments: [], distance: 0, maxStep: 0, footsteps: 0, simulatedSeconds: 0 },
    exposure: { target: null, meterReads: 0, peakPpm: 0, peakSaturation: 0,
      criticalCrossed: false, recovered: false, survivedCounter: 0 },
    combat: { authoredGroup: 0, inputAttacks: 0, inputDodges: 0, guardRaises: 0,
      attackStarts: 0, playerHits: 0, damageDealt: 0, damageTaken: 0, kills: 0,
      remainingHostiles: 0, playerHp: 0 },
    quest: { arrivalStep: -1, raidDone: false, solMet: false },
  };

  const expect = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  let yieldedAt = 0;
  const stepOne = async () => {
    const bx = P.pos.x;
    const by = P.pos.y;
    const bz = P.pos.z;
    G.engine.stepFixedForTest(1);
    const moved = Math.hypot(P.pos.x - bx, P.pos.y - by, P.pos.z - bz);
    report.route.distance += moved;
    report.route.maxStep = Math.max(report.route.maxStep, moved);
    report.exposure.peakPpm = Math.max(report.exposure.peakPpm, P.ambientPpm || 0);
    report.exposure.peakSaturation = Math.max(report.exposure.peakSaturation, P.lungs.sat);
    expect(P.gasImmune === false, 'player gas immunity changed during the slice');
    expect(!P.dead && G.mode !== MODE.DEAD, `player died with ${P.hp.toFixed(1)} hp`);
    yieldedAt++;
    if (yieldedAt >= 120) {
      yieldedAt = 0;
      await sleep(0);
    }
  };

  const stepMany = async (steps) => {
    for (let i = 0; i < steps; i++) await stepOne();
  };

  const stick = {
    active: false,
    pointerId: 71,
    x: 82,
    y: Math.round(window.innerHeight * 0.56),
    start() {
      if (this.active) return;
      G.engine.canvas.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, pointerId: this.pointerId,
        pointerType: 'touch', isPrimary: true, buttons: 1,
        clientX: this.x, clientY: this.y,
      }));
      expect(G.input._stick.active, 'touch stick did not accept pointerdown');
      this.active = true;
    },
    set(mx, my, magnitude = 1) {
      this.start();
      const length = Math.hypot(mx, my) || 1;
      const radius = G.input._stick.radius * Math.min(0.98, Math.max(0, magnitude));
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, cancelable: true, pointerId: this.pointerId,
        pointerType: 'touch', isPrimary: true, buttons: 1,
        clientX: this.x + mx / length * radius,
        clientY: this.y + my / length * radius,
      }));
    },
    release() {
      if (!this.active) return;
      window.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, pointerId: this.pointerId,
        pointerType: 'touch', isPrimary: true, buttons: 0,
        clientX: this.x, clientY: this.y,
      }));
      this.active = false;
    },
  };

  const inputForDirection = (dx, dz) => {
    const length = Math.hypot(dx, dz) || 1;
    const x = dx / length;
    const z = dz / length;
    const yaw = G.camera.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    return { x: x * rx + z * rz, y: -(x * fx + z * fz) };
  };

  const plannedPath = (x, y, z) => G.nav.findPath(
    P.pos.x, P.pos.y, P.pos.z, x, y, z, 6000);

  const walkTo = async (name, x, y, z, tolerance = 1.0) => {
    const path = plannedPath(x, y, z);
    expect(path && path.length, `no live navigation path for ${name}`);
    const beforeDistance = report.route.distance;
    const beforeTime = G.time;
    const from = { x: P.pos.x, y: P.pos.y, z: P.pos.z };

    for (const waypoint of path) {
      let best = Infinity;
      let stalled = 0;
      let guard = 0;
      while (guard++ < 2400) {
        const dx = waypoint.x - P.pos.x;
        const dz = waypoint.z - P.pos.z;
        const distance = Math.hypot(dx, dz);
        if (distance <= tolerance) break;
        const input = inputForDirection(dx, dz);
        const magnitude = distance > 3.2 ? 0.78 : Math.max(0.34, distance / 3.4);
        stick.set(input.x, input.y, magnitude);
        await stepOne();
        if (distance < best - 0.025) { best = distance; stalled = 0; }
        else stalled++;
        expect(stalled < 240, `${name} movement stalled ${distance.toFixed(2)}m from a waypoint`);
      }
      expect(guard < 2400, `${name} exceeded movement step budget`);
    }

    stick.release();
    await stepMany(5);
    const remaining = Math.hypot(x - P.pos.x, z - P.pos.z);
    expect(remaining <= tolerance + 0.85, `${name} ended ${remaining.toFixed(2)}m from target`);
    report.route.segments.push({
      name,
      from,
      to: { x: P.pos.x, y: P.pos.y, z: P.pos.z },
      plannedTarget: { x, y, z },
      distance: report.route.distance - beforeDistance,
      simulatedSeconds: G.time - beforeTime,
    });
  };

  const chooseAirTarget = (minPpm, maxPpm) => {
    const nav = G.nav;
    const here = nav.nearest(P.pos.x, P.pos.z, P.pos.y);
    expect(here >= 0, 'player is not on the live navigation grid');
    const region = nav.region[here];
    const candidates = [];
    for (let i = 0; i < nav.height.length; i++) {
      if (nav.region[i] !== region || Number.isNaN(nav.height[i])) continue;
      const ix = i % nav.nx;
      const iz = (i / nav.nx) | 0;
      const x = nav.xOf(ix);
      const z = nav.zOf(iz);
      const y = nav.height[i];
      const ppm = G.gas.sample(x, y + 1.5, z);
      if (ppm < minPpm || ppm > maxPpm) continue;
      candidates.push({ x, y, z, ppm, distance: Math.hypot(x - P.pos.x, z - P.pos.z) });
    }
    candidates.sort((a, b) => a.distance - b.distance || a.ppm - b.ppm);
    for (const candidate of candidates.slice(0, 240)) {
      const path = plannedPath(candidate.x, candidate.y, candidate.z);
      if (path && path.length) return candidate;
    }
    return null;
  };

  const approachNpc = (npc) => {
    const nav = G.nav;
    const here = nav.nearest(P.pos.x, P.pos.z, P.pos.y);
    const region = here >= 0 ? nav.region[here] : -1;
    const candidates = [];
    for (let i = 0; i < nav.height.length; i++) {
      if (nav.region[i] !== region || Number.isNaN(nav.height[i])) continue;
      const ix = i % nav.nx;
      const iz = (i / nav.nx) | 0;
      const x = nav.xOf(ix);
      const z = nav.zOf(iz);
      const distanceToNpc = Math.hypot(x - npc.pos.x, z - npc.pos.z);
      if (distanceToNpc < 1.25 || distanceToNpc > 2.35) continue;
      candidates.push({ x, y: nav.height[i], z,
        distance: Math.hypot(x - P.pos.x, z - P.pos.z) });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates.find((candidate) => {
      const path = plannedPath(candidate.x, candidate.y, candidate.z);
      return path && path.length;
    }) || null;
  };

  const converse = async () => {
    let guard = 0;
    while (G.mode === MODE.DIALOGUE && guard++ < 240) {
      const runner = G.director.dialogue;
      const choices = runner.choices();
      if (choices && choices.length) {
        const open = choices.findIndex((choice) => !choice.locked);
        expect(open >= 0, `no unlocked choice in ${runner.convo?.id || 'dialogue'}`);
        G.dialogueUI.onChoose(open);
      } else {
        G.dialogueUI.onAdvance();
      }
      await sleep(0);
    }
    expect(guard < 240, 'dialogue did not terminate');
    expect(G.mode === MODE.PLAY, 'dialogue did not restore play mode');
    await stepMany(5);
  };

  const talkTo = async (npc, label) => {
    const approach = approachNpc(npc);
    expect(approach, `no walkable approach to ${label}`);
    await walkTo(`approach ${label}`, approach.x, approach.y, approach.z, 0.85);
    await stepMany(3);
    expect(P.interactTarget && P.interactTarget.kind === 'npc' && P.interactTarget.npc === npc,
      `${label} was not the production interaction target`);
    G.input.tapVirtual('interact');
    await stepOne();
    expect(G.mode === MODE.DIALOGUE, `${label} interaction did not open dialogue`);
    await converse();
  };

  const fightCourtyardRaid = async () => {
    const raid = G.director._raidActive;
    expect(raid && raid.id === 'courtyard', 'authored courtyard raid did not spawn');
    report.combat.authoredGroup = raid.group.length;
    expect(raid.group.length === 3, `authored courtyard raid had ${raid.group.length} actors`);

    let attackWait = 0;
    let guardHeld = false;
    let combatSteps = 0;
    while (combatSteps++ < 7200) {
      const live = raid.group.filter((enemy) => !enemy.dead);
      if (!live.length) break;
      const target = live.reduce((best, enemy) => {
        const distance = Math.hypot(enemy.pos.x - P.pos.x, enemy.pos.z - P.pos.z);
        return !best || distance < best.distance ? { enemy, distance } : best;
      }, null);
      const dx = target.enemy.pos.x - P.pos.x;
      const dz = target.enemy.pos.z - P.pos.z;
      const input = inputForDirection(dx, dz);
      const threatening = live.some((enemy) => {
        if (!enemy.attack) return false;
        const d = Math.hypot(enemy.pos.x - P.pos.x, enemy.pos.z - P.pos.z);
        return d < 2.85 && enemy.attack.t < enemy.attack.windup + enemy.attack.active;
      });

      if (threatening && P.stamina > 34 && P.dodgeCooldown <= 0 && !P.attack) {
        if (guardHeld) { G.input.setVirtual('guard', false); guardHeld = false; }
        stick.set(-input.y, input.x, 0.82);
        G.input.tapVirtual('dodge');
        report.combat.inputDodges++;
        attackWait = Math.max(attackWait, 20);
      } else {
        const shouldGuard = threatening && P.stamina > 18 && !P.attack;
        if (shouldGuard !== guardHeld) {
          G.input.setVirtual('guard', shouldGuard);
          guardHeld = shouldGuard;
          if (guardHeld) report.combat.guardRaises++;
        }
        if (target.distance > 1.65) {
          stick.set(input.x, input.y, P.stamina < 24 ? 0.48 : 0.72);
        } else {
          stick.set(input.x, input.y, 0.28);
          if (!guardHeld && attackWait <= 0 && P.stamina >= 7) {
            G.input.tapVirtual('attack');
            report.combat.inputAttacks++;
            attackWait = 22;
          }
        }
      }

      await stepOne();
      attackWait--;
    }

    stick.release();
    if (guardHeld) G.input.setVirtual('guard', false);
    await stepMany(45);
    report.combat.remainingHostiles = raid.group.filter((enemy) => !enemy.dead).length;
    expect(combatSteps < 7200, 'courtyard combat exceeded the simulated-time budget');
    expect(report.combat.remainingHostiles === 0, 'courtyard combat left authored hostiles alive');
  };

  const run = async () => {
    const startedAt = G.time;
    try {
      expect(report.viewport.width === 667 && report.viewport.height === 375,
        `unexpected viewport ${report.viewport.width}x${report.viewport.height}`);
      expect(G.mode === MODE.PLAY, 'outer runner did not establish a fresh playable game');
      expect(!G.engine.running && !G.engine.isPaused && !G.engine.lost,
        'engine was not ready for deterministic stepping');

      report.assists = {
        gasAssist: G.settings.gasAssist,
        combatAssist: G.settings.combatAssist,
        gasImmune: P.gasImmune,
        filter: P.lungs.filter,
      };
      expect(G.settings.gasAssist === false, 'gas assistance must be disabled');
      expect(G.settings.combatAssist === 0, 'combat assistance must be disabled');
      expect(P.gasImmune === false, 'fresh player must not be gas immune');
      expect(P.lungs.filter === null, 'fresh player must be unmasked');

      G.on('actor:footstep', (actor) => { if (actor === P) report.route.footsteps++; });
      G.on('meter:read', () => { report.exposure.meterReads++; });
      G.on('actor:attackstart', (actor) => {
        if (actor === P) report.combat.attackStarts++;
      });
      G.on('damageNumber', ({ target, amount }) => {
        if (target === P) report.combat.damageTaken += amount;
        else if (target && target.faction === 'hostile') {
          report.combat.playerHits++;
          report.combat.damageDealt += amount;
        }
      });
      G.on('kill', ({ attacker, target }) => {
        if (attacker === P && target && target.faction === 'hostile') report.combat.kills++;
      });

      await stepMany(12);
      const arrival = () => G.state.quests.get('arrival');
      expect(arrival() && arrival().state === 'active' && arrival().step >= 1,
        'fresh spawn did not enter the authored meter step');

      const cleanStart = { x: P.pos.x, y: P.pos.y, z: P.pos.z };
      let danger = chooseAirTarget(900, 1500) || chooseAirTarget(800, 1800);
      expect(danger, 'no reachable dangerous-air cell exists on the starting surface');
      report.exposure.target = { x: danger.x, y: danger.y, z: danger.z, plannedPpm: danger.ppm };
      await walkTo('dangerous air', danger.x, danger.y, danger.z, 0.9);
      await stepMany(20);
      if ((P.ambientPpm || 0) < 800) {
        danger = chooseAirTarget(900, 1800) || chooseAirTarget(800, 2200);
        expect(danger, 'wind shift left no reachable dangerous-air cell');
        report.exposure.target = { x: danger.x, y: danger.y, z: danger.z, plannedPpm: danger.ppm };
        await walkTo('dangerous air correction', danger.x, danger.y, danger.z, 0.9);
        await stepMany(20);
      }
      expect((P.ambientPpm || 0) >= 800,
        `danger route produced only ${Math.round(P.ambientPpm || 0)} ppm`);

      G.input.tapVirtual('meter');
      await stepMany(3);
      expect(report.exposure.meterReads === 1, 'meter input did not produce exactly one reading');
      expect(arrival().step >= 2, 'meter input did not advance the arrival quest');

      let exposureSteps = 0;
      while (!P.lungs.critical && exposureSteps++ < 3600) await stepOne();
      report.exposure.criticalCrossed = P.lungs.critical;
      expect(report.exposure.criticalCrossed, 'dangerous air never crossed the critical threshold');

      await walkTo('clean-air return', cleanStart.x, cleanStart.y, cleanStart.z, 1.0);
      let recoverySteps = 0;
      while (P.lungs.sat > 0.06 && recoverySteps++ < 3600) await stepOne();
      report.exposure.recovered = P.lungs.sat <= 0.06;
      report.exposure.survivedCounter = G.state.count('survivedSaturation');
      expect(report.exposure.recovered, 'saturation did not recover below 0.06');
      expect(report.exposure.survivedCounter === 1,
        `survival counter was ${report.exposure.survivedCounter}, expected 1`);

      const sol = G.director.npcs.get('sol');
      expect(sol, 'Marisol was not present in Chapter 1');
      await talkTo(sol, 'Marisol first conversation');
      expect(G.state.has('sol_met'), 'first Marisol conversation did not set sol_met');

      await fightCourtyardRaid();
      expect(G.state.has('ch1_raid_done'), 'normal combat did not set ch1_raid_done');
      expect(G.state.kills === 3, `normal state recorded ${G.state.kills} kills, expected 3`);
      expect(report.combat.attackStarts > 0, 'player attack input never started an authored attack');
      expect(report.combat.playerHits > 0 && report.combat.damageDealt > 0,
        'player attacks never dealt combat-system damage');
      expect(report.combat.kills === 3, `kill telemetry recorded ${report.combat.kills}, expected 3`);

      await talkTo(sol, 'Marisol post-raid conversation');
      report.quest.arrivalStep = arrival()?.step ?? -1;
      report.quest.raidDone = G.state.has('ch1_raid_done');
      report.quest.solMet = G.state.has('sol_met');
      expect(report.quest.arrivalStep >= 5,
        `post-raid conversation left arrival at step ${report.quest.arrivalStep}`);

      report.combat.playerHp = P.hp;
      expect(report.route.distance > 150, `route distance ${report.route.distance.toFixed(1)}m was not substantive`);
      expect(report.route.footsteps > 10, `only ${report.route.footsteps} player footsteps were emitted`);
      expect(report.route.maxStep < 0.75,
        `maximum position delta ${report.route.maxStep.toFixed(3)}m indicates a discontinuity`);
    } catch (error) {
      report.errors.push(String(error && error.stack || error));
    } finally {
      stick.release();
      G.input.setVirtual('guard', false);
      report.route.simulatedSeconds = G.time - startedAt;
      report.combat.playerHp = P.hp;
      report.combat.remainingHostiles = G.director._raidActive
        ? G.director._raidActive.group.filter((enemy) => !enemy.dead).length : 0;
    }
    return report;
  };

  window.__CLGateB = { run };
})();
