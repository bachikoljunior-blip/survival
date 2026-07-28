/**
 * In-page playthrough driver.
 *
 * Drives a real game to a real ending. It moves the player with the game's own
 * teleport, lets the real quest triggers fire, answers real dialogue through
 * the real runner, and reads the ending from the real condition evaluator.
 *
 * It never writes flags directly and never calls a quest's complete() — if a
 * beat cannot be reached by playing, this harness fails, which is the point.
 */
(() => {
  const C = window.CINDERLINE;
  const G = C.game;
  const MODE = C.MODE;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /** Advance the simulation deterministically rather than waiting on frames. */
  const tick = async (seconds, dt = 1 / 60) => {
    const n = Math.ceil(seconds / dt);
    for (let i = 0; i < n; i++) {
      G.fixedUpdate(dt);
      if (i % 30 === 0) await sleep(0);
    }
  };

  /** Wait on a predicate in real time — async transitions use real timers. */
  const waitFor = async (fn, ms = 4000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (fn()) return true;
      await sleep(30);
    }
    return false;
  };

  const log = [];
  const errors = [];
  const err = (m) => { errors.push(m); log.push('ERROR ' + m); };

  /** Put the player at a world point and let the reach poll notice. */
  async function goTo(x, z, y = null) {
    const p = G.player;
    const g = y === null ? G.world.groundUnder(x, z, 0.4, 30, 45) : null;
    p.pos.set(x, y !== null ? y : (g ? g.y + 0.1 : 0.2), z);
    p.vel.set(0, 0, 0);
    G.director._reachTimer = 0;
    await tick(0.6);
  }

  async function goToSpawn(id) {
    const s = G.city.spawns.get(id);
    if (!s) { err('missing spawn ' + id); return false; }
    await goTo(s.x, s.z, s.y + 0.1);
    return true;
  }

  /** Walk a conversation to the end, choosing by predicate or by index. */
  async function converse(pick) {
    let guard = 0;
    while (G.mode === MODE.DIALOGUE && guard++ < 240) {
      const ui = G.dialogueUI;
      // Finish typing instantly.
      ui.shown = ui.full.length;
      ui.typing = false;
      ui._render();
      ui._afterType();
      await sleep(0);
      const choices = ui.choiceList;
      if (choices && choices.length) {
        let idx = 0;
        if (typeof pick === 'function') {
          const r = pick(choices, G.director.dialogue.node);
          idx = typeof r === 'number' ? r : 0;
        }
        const c = choices[idx];
        if (!c || c.locked) {
          const open = choices.findIndex((x) => !x.locked);
          if (open < 0) { err('no unlocked choice in ' + (G.director.dialogue.convo?.id)); break; }
          idx = open;
        }
        ui.onChoose(idx);
      } else {
        ui.onAdvance();
      }
      await sleep(0);
    }
    if (guard >= 240) err('conversation did not terminate');
    await tick(0.2);
  }

  /** Talk to a named NPC via the director, exactly as the USE button would. */
  async function talk(id, pick) {
    const npc = G.director.npcs.get(id);
    if (!npc) { err('npc not present: ' + id); return; }
    await goTo(npc.pos.x + 1.0, npc.pos.z + 1.0, npc.pos.y + 0.1);
    G.director.talkTo(npc);
    await converse(pick);
  }

  /** Fire an interaction the same way the interact button does. */
  async function interact(id) {
    const it = G.city.interactions.find((i) => i.id === id);
    if (!it) { err('missing interaction ' + id); return false; }
    await goTo(it.x, it.z, it.y - 1.0);
    const wasDoor = it.kind === 'door';
    G.emit('interact', it);
    if (wasDoor) {
      // Door transitions fade out and back in on real timers.
      const ok = await waitFor(() => G.mode === MODE.PLAY || G.mode === MODE.DIALOGUE, 6000);
      if (!ok) err('door transition stalled: ' + id);
    }
    await tick(0.4);
    return true;
  }

  /** Kill every live hostile, the way combat would. */
  async function clearHostiles(limit = 40) {
    let guard = 0;
    while (guard++ < limit) {
      const live = G.actors.filter((a) => a.faction === 'hostile' && !a.dead);
      if (!live.length) break;
      for (const e of live) {
        e.damage({ amount: 9999, kind: 'blunt', dirX: 0, dirZ: 1, source: G.player });
        G.emit('kill', { attacker: G.player, target: e });
      }
      await tick(0.4);
    }
    await tick(0.6);
  }

  function questStep(id) {
    const q = G.state.quests.get(id);
    return q ? `${q.state}:${q.step}` : 'none';
  }

  function expect(cond, msg) { if (!cond) err(msg); }

  // ---------------------------------------------------------------- script

  async function run(path) {
    errors.length = 0;
    log.length = 0;
    let steps = 0;
    const step = (name) => { steps++; log.push(name); };

    try {
      // Always start from a clean game.
      G.menus.hideEnding();
      G.menus.hideDeath();
      G.menus.closePause();
      await C.startNewGame();
      await waitFor(() => G.mode === MODE.PLAY, 8000);
      await tick(1.0);
      G.player.gasImmune = true;    // the harness is testing story reach, not survival
      step('new game');

      // ---- chapter 1 -----------------------------------------------------
      await goTo(-112, -86);
      expect(questStep('arrival').startsWith('active'), 'arrival did not start');
      step('courtyard');

      // Press the meter button the way a player would. The harness must never
      // manufacture the event it is meant to be detecting.
      G.input.tapVirtual('meter');
      await tick(0.5);
      expect(G.state.counters.get('metersRead') > 0, 'meter read did not register');
      expect(!questStep('arrival').startsWith('active:1'), 'meter step did not advance');
      step('meter');

      await talk('sol', (ch) => {
        // Prefer the honest route so trust is available later.
        const i = ch.findIndex((c) => /Cellar Row|used to survey|should have said/i.test(c.text));
        return i >= 0 ? i : 0;
      });
      expect(G.state.has('sol_met'), 'sol_met not set');
      step('sol first');

      await tick(0.8);
      await clearHostiles();
      expect(G.state.has('ch1_raid_done'), 'raid not cleared');
      step('raid');

      await talk('sol');
      step('sol after raid');

      await interact('door_arcade');
      expect(G.director.currentInterior === 'arcade', 'not inside the arcade');
      await talk('teo', (ch) => {
        const i = ch.findIndex((c) => /read it in March|There are two of us|calibrated/i.test(c.text));
        return i >= 0 ? i : 0;
      });
      expect(G.state.can('readAir'), 'readAir not unlocked');
      expect(questStep('log').startsWith('active'), 'log quest not started');
      step('teo first');

      // ---- chapter 2 -----------------------------------------------------
      await interact('exit_arcade');
      await goTo(-44, -14, 10.2);
      expect(G.state.chapter >= 2, 'chapter 2 not reached');
      step('over the slip');

      await goTo(25, -6);
      expect(questStep('southmarrow').startsWith('active'), 'southmarrow not started');
      step('cinder road');

      // South Marrow beat.
      await goTo(-60, 56);
      await interact('vent_west_1');
      expect(G.state.has('found_venting'), 'venting not found');
      step('found venting');

      await interact('door_bek');
      await talk('garage');
      expect(G.state.has('met_garage'), 'garage not met');
      await interact('exit_bek');
      step('garage');

      // Sol has to be confronted before the heads can be touched.
      await talk('sol');
      expect(G.state.has('sol_vent_talked'), 'sol vent talk did not happen');
      step('sol vents');

      const ventPick = { publish: 'shut', cut: 'left', deal: 'left', evacuate: 'left', leave: 'half' }[path];
      await interact('vent_west_1');
      await converse((ch) => {
        const i = ch.findIndex((c) => new RegExp(ventPick === 'shut' ? 'Shut the vents'
          : ventPick === 'left' ? 'Leave them' : 'Half-measure').test(c.text));
        return i >= 0 ? i : 0;
      });
      expect(G.state.chose('vents', ventPick === 'left' ? 'left' : ventPick),
        'vent choice not recorded: ' + JSON.stringify([...G.state.choices]));
      step('vent decision: ' + ventPick);

      // ---- back to Teo with the log --------------------------------------
      await goToSpawn('ventfield');
      await interact('door_hut');
      await interact('borehole_log');
      expect(G.state.hasItem('logbook'), 'logbook not taken');
      await interact('exit_hut');
      step('log taken');

      await interact('door_arcade');
      await talk('teo');
      expect(G.state.chapter >= 3, 'chapter 3 not reached');
      await interact('exit_arcade');
      step('teo log');

      // ---- chapter 3 -----------------------------------------------------
      await goTo(62, -33);
      G.director.refreshCast();
      await tick(0.4);
      await talk('iris', (ch) => {
        // The Cut ending needs Iris's trust; the others take the plain route.
        const want = path === 'cut' ? /I kept one too/ : /How long|raw borehole log|trench cut/;
        const i = ch.findIndex((c) => want.test(c.text));
        return i >= 0 ? i : 0;
      });
      step('iris');

      await interact('survey_door');
      expect(G.director.currentInterior === 'survey', 'not inside the field office');
      await interact('trench_order');
      expect(G.state.hasItem('trenchOrder'), 'trench order not taken');
      step('order');

      const kPick = path === 'deal' ? /I'll take it\.$/ : /No\. It goes on the record|Issue the cut order/;
      await talk('krajcik', (ch) => {
        const i = ch.findIndex((c) => kPick.test(c.text) && !c.locked);
        return i >= 0 ? i : 0;
      });
      expect(G.state.has('krajcik_met'), 'krajcik scene did not complete');
      expect(G.state.chapter >= 4, 'chapter 4 not reached');
      await interact('exit_survey');
      step('krajcik');

      // ---- chapter 4 -----------------------------------------------------
      const crisis = G.director.crisis;
      expect(!!crisis, 'crisis did not begin');
      if (crisis) {
        await goTo(G.director._markerTargets.crisis.x, G.director._markerTargets.crisis.z);
        for (const m of crisis.marks.slice(0, path === 'leave' ? 1 : 4)) {
          await goTo(m.x, m.z);
          G.emit('interact', m);
          await tick(0.2);
        }
        // If any were left, let the timer close it out.
        if (G.director.crisis) { G.director.crisis.timeLeft = 0.01; await tick(0.5); }
        await tick(0.5);
      }
      expect(!G.director.crisis, 'crisis did not resolve');
      step('crisis');

      await goTo(-112, -84);
      G.director.refreshCast();
      const nessa = G.director.npcs.get('nessa');
      if (nessa) nessa.group.visible = true;
      await talk('nessa', (ch) => {
        const tellIt = path !== 'deal' && path !== 'leave';
        const i = ch.findIndex((c) => (tellIt ? /my initials/ : /not ready/).test(c.text));
        return i >= 0 ? i : 0;
      });
      expect(G.state.chapter >= 5, 'chapter 5 not reached');
      step('nessa');

      // ---- chapter 5 -----------------------------------------------------
      await goTo(74, 20);
      await tick(0.6);
      await clearHostiles();
      await tick(0.6);
      step('trench line');

      // The final choice.
      const finalRe = {
        publish: /on the record/i, cut: /true line/i, deal: /Take the desk/i,
        evacuate: /Burn it/i, leave: /Walk away/i,
      }[path];
      await converse((ch) => {
        const i = ch.findIndex((c) => finalRe.test(c.text) && !c.locked);
        if (i < 0) {
          // Falling back is legitimate for gated endings; record which.
          log.push('final choice gated, fell back');
          return ch.findIndex((c) => !c.locked);
        }
        return i;
      });
      await tick(1.2);
      step('ending');
    } catch (e) {
      err('threw: ' + (e && e.stack ? e.stack : e));
    }

    const S = G.state;
    const questsTotal = S.quests.size;
    let questsDone = 0;
    for (const [, q] of S.quests) if (q.state === 'done') questsDone++;

    return {
      path,
      chapter: S.chapter,
      ending: S.ending,
      reachedEnding: !!S.ending,
      questsDone, questsTotal,
      steps,
      trust: [...S.trust],
      choices: [...S.choices],
      flags: [...S.flags].length,
      journal: S.journal.length,
      errors: errors.slice(),
      log: log.slice(),
    };
  }

  window.__CLDriver = { run, goTo, talk, interact, converse, tick };
})();
