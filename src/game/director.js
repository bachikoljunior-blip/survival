/**
 * Director — the layer that turns the story data into a game that happens.
 *
 * Spawns the cast, watches for the world events quests care about, resolves
 * interactions, runs the story hooks, drives objective markers, and picks the
 * ending. Everything narrative that touches the simulation goes through here,
 * so there is exactly one place to look when a beat does not fire.
 */

import * as THREE from 'three';
import { Actor, STATE } from '../actors/actor.js';
import { Enemy } from './ai.js';
import { GameState, Storage, ITEMS, CAPABILITIES } from './state.js';
import { QuestSystem, DialogueRunner, testCondition, applyEffects } from './narrative.js';
import { QUESTS, CONVERSATIONS, CAST, ENDINGS, EPILOGUE_BEATS } from '../content/story.js';
import { MODE } from './game.js';
import { clamp, clamp01, lerp, damp } from '../core/util.js';

/** Where each named character stands, and when they are there. */
const NPC_ANCHORS = {
  sol:     { spawn: 'stacks_yard', costume: 'sol', convo: 'sol_first', x: -106, z: -80, rot: 2.4 },
  nessa:   { spawn: null, costume: 'nessa', convo: 'nessa_first', x: -118, z: -88, rot: 0.6 },
  teo:     { spawn: 'npc_teo', costume: 'teo', convo: 'teo_first' },
  iris:    { spawn: null, costume: 'iris', convo: 'iris_first', x: 54, z: -33, rot: 1.2, chapter: 3 },
  krajcik: { spawn: 'npc_krajcik', costume: 'krajcik', convo: 'krajcik', chapter: 3, interior: 'survey' },
  garage:  { spawn: 'npc_garage', costume: 'civ', convo: 'garage', interior: 'bek', name: 'Ostrowski' },
};

export class Director {
  constructor(game) {
    this.game = game;
    this.state = new GameState();
    game.state = this.state;

    this.ctx = { game, hooks: this._hooks(), state: this.state };
    this.quests = new QuestSystem(this.state, QUESTS, this.ctx);
    game.quests = this.quests;
    this.dialogue = new DialogueRunner(this.state, this.ctx);

    this.npcs = new Map();
    this.encounters = new Map();
    this.currentInterior = null;
    this.pendingConvo = null;
    this._markerTargets = {};
    this._autosaveTimer = 0;
    this._raidActive = null;

    this._wire();
  }

  // ------------------------------------------------------------------ wire

  _wire() {
    const g = this.game;

    this.quests.on('objective', (id, index, step) => this._updateObjective(id, index, step));
    this.quests.on('start', (id, def) => {
      if (id === 'nessaRun') this._moveNessaDown();
      g.hud.notice(`<b>${def.title}</b>`, '', 4);
      g.emit('sfx', 'questStart');
    });
    this.quests.on('complete', (id, def) => {
      if (!def.side) g.hud.notice(`<b>${def.title}</b><br>complete`, 'good', 4);
      else g.hud.notice(`${def.title} — done`, 'good', 3);
      g.emit('sfx', 'questDone');
      this.save();
    });

    this.state.on('capability', (id, cap) => {
      g.hud.notice(`<b>${cap.name}</b><br>${cap.desc}`, 'good', 6);
      g.emit('sfx', 'unlock');
    });
    this.state.on('journal', (j) => g.hud.notice(`Note added — <b>${j.title}</b>`, '', 3));
    this.state.on('item', (id, n, delta) => {
      if (delta > 0 && ITEMS[id]) g.hud.notice(`${ITEMS[id].name} ×${delta}`, '', 2.4);
    });
    this.state.on('trust', (id, v, delta, reason) => {
      if (!reason) return;
      g.hud.notice(`<b>${CAST[id] ? CAST[id].name : id}</b><br>${reason}`, delta > 0 ? 'good' : 'bad', 3.4);
    });

    g.on('interact', (t) => this.interact(t));
    g.on('kill', ({ attacker, target }) => {
      if (attacker === g.player) {
        this.state.kills++;
        this.quests.notify('kill', { faction: target.faction, who: target.kind });
      }
      if (this._raidActive) this._checkRaid();
    });
    g.on('actor:parry', (a) => {
      if (a !== g.player) return;
      const n = this.state.bump('parries');
      if (n >= 5 && !this.state.can('hardHands')) this.state.unlock('hardHands');
    });
    g.on('actor:death', (a) => { if (a === g.player) this.onPlayerDeath(a); });

    // Reaching places is the single most common quest trigger, so it is polled
    // rather than event-driven — cheap, and it cannot be missed.
    this._reachTimer = 0;
  }

  // ---------------------------------------------------------------- hooks

  _hooks() {
    const g = this.game;
    return {
      spawnCourtyardRaid: () => this._spawnRaid('courtyard', [
        ['scav', -100, -74], ['scav', -96, -88], ['slinger', -92, -80],
      ]),
      spawnTrenchLine: () => this._spawnRaid('trench', [
        ['warden', 70, 14], ['warden', 78, 16], ['scav', 74, 24],
      ]),
      shutVents: () => {
        for (let i = 1; i <= 3; i++) {
          g.gas.setSourceActive(`vent_west_${i}`, false);
          g.atmos.setMarkerActive(`vent_west_${i}`, false);
          g.atmos.plumes.setAnchorActive(`vent_west_${i}`, false);
        }
        g.gas.setSourceActive('yard_seep', true);
        g.hud.notice('The draw reverses. You can hear it change.', '', 5);
      },
      halfVents: () => {
        g.gas.setSourceActive('vent_west_2', false);
        g.atmos.setMarkerActive('vent_west_2', false);
        g.atmos.plumes.setAnchorActive('vent_west_2', false);
        g.gas.setIntensity(1.15);
        g.hud.notice('One head shut. Both places are worse than one could have been.', '', 5);
      },
      beginCrisis: () => this._beginCrisis(),
      openTrade: () => this.openTrade(),
    };
  }

  // ------------------------------------------------------------------ cast

  spawnNPC(id) {
    if (this.npcs.has(id)) return this.npcs.get(id);
    const a = NPC_ANCHORS[id];
    if (!a) return null;
    let x = a.x, z = a.z, y = 0, rot = a.rot || 0;
    if (a.spawn) {
      const sp = this.game.city.spawns.get(a.spawn);
      if (sp) { x = sp.x; z = sp.z; y = sp.y; rot = sp.rot; }
    }
    const ground = this.game.world.groundUnder(x, z, 0.4, y + 6, 12);
    const npc = new Actor({
      x, z, y: ground ? ground.y + 0.05 : y, rot,
      world: this.game.world, gas: this.game.gas, mats: this.game.mats,
      costume: a.costume, detail: 2, faction: 'neutral',
      name: a.name || (CAST[id] ? CAST[id].name : id),
      maxHp: 999, gasImmune: true,
      weapon: id === 'teo' ? 'lamp' : null,
    });
    npc.npcId = id;
    npc.convo = a.convo;
    npc.interiorId = a.interior || null;
    npc.animator.locomotion.alert = 0;
    this.npcs.set(id, npc);
    this.game.addActor(npc);
    return npc;
  }

  /**
   * Nessa's run went wrong on Fenn Street. Move her to where the player will
   * find her, and let the air down there do the rest of the storytelling.
   */
  _moveNessaDown() {
    const n = this.npcs.get('nessa') || this.spawnNPC('nessa');
    if (!n) return;
    const g = this.game.world.groundUnder(-92, 48, 0.4, 8, 14);
    n.pos.set(-92, g ? g.y + 0.05 : 0.1, 48);
    n.group.visible = true;
    n.yaw = n.targetYaw = 2.1;
    n.animator.locomotion.crouch = 1;
    n.crouch = 1;
    this._markerTargets.nessaRun = { x: -92, z: 48 };
  }

  /** Refresh who is present for the current chapter and interior. */
  refreshCast() {
    for (const id in NPC_ANCHORS) {
      const a = NPC_ANCHORS[id];
      const wanted = (!a.chapter || this.state.chapter >= a.chapter);
      if (wanted && !this.npcs.has(id)) this.spawnNPC(id);
    }
    // Nessa is in the courtyard from chapter 1, but only after the raid.
    const nessa = this.npcs.get('nessa');
    if (nessa) nessa.group.visible = this.state.has('ch1_raid_done') || this.state.chapter >= 2;
  }

  // ------------------------------------------------------------ encounters

  _spawnRaid(id, list) {
    const g = this.game;
    const group = [];
    for (const [kind, x, z] of list) {
      const e = g.spawnEnemy(kind, x, z);
      e.aggro = true;
      e.awareness = 1;
      e.target = g.player;
      e.aiState = 'combat';
      group.push(e);
    }
    this._raidActive = { id, group };
    g.hud.notice('<b>Ash crew</b><br>in the yard', 'bad', 4);
    g.emit('music', 'combat');
    return group;
  }

  _checkRaid() {
    if (!this._raidActive) return;
    const alive = this._raidActive.group.filter((e) => !e.dead);
    if (alive.length) return;
    const id = this._raidActive.id;
    this._raidActive = null;
    this.game.emit('music', 'explore');
    if (id === 'courtyard') {
      this.state.set('ch1_raid_done');
      this.quests.notify('custom', { id: 'raidCleared' });
      this.refreshCast();
    } else if (id === 'trench') {
      this.quests.notify('custom', { id: 'trenchCleared' });
      this._offerEnding();
    }
  }

  /**
   * Chapter 4 crisis. Which block floods depends on what the player did to
   * the borehole heads two chapters earlier — the consequence arrives late
   * and by name.
   */
  _beginCrisis() {
    const g = this.game;
    const shut = this.state.has('vents_shut');
    const site = shut ? 'stacks' : 'south';
    this.state.set(`crisis_${site}`);
    this.crisis = {
      site,
      survivors: 4,
      rescued: 0,
      lost: 0,
      timeLeft: 210,
      marks: [],
    };
    if (shut) {
      g.gas.setSourceActive('yard_seep', true);
      g.gas.setIntensity(1.9);
      this._markerTargets.crisis = { x: -112, z: -84 };
      g.hud.notice('<b>The courtyard is filling.</b><br>Pell House, ground floor.', 'bad', 7);
    } else {
      g.gas.setIntensity(1.7);
      this._markerTargets.crisis = { x: -60, z: 52 };
      g.hud.notice('<b>Fenn Street has gone.</b><br>Four people still down there.', 'bad', 7);
    }
    g.emit('music', 'crisis');

    // Place the people to reach. Each is an interaction; reaching one saves it.
    const base = shut ? [[-112, -76], [-118, -90], [-104, -92], [-124, -80]]
                      : [[-58, 50], [-70, 58], [-42, 54], [-88, 50]];
    base.forEach(([x, z], i) => {
      const it = {
        id: `crisis_${i}`, kind: 'rescue', x, y: 1.1, z, range: 2.4,
        label: 'Get them up', prompt: 'Get them to a first floor',
      };
      g.city.interactions.push(it);
      this.crisis.marks.push(it);
    });
    this.quests.notify('custom', { id: 'crisisArrive' });
  }

  _updateCrisis(dt) {
    const c = this.crisis;
    if (!c) return;
    c.timeLeft -= dt;
    const remaining = c.marks.filter((m) => !m.disabled);
    if (c.timeLeft <= 0 || !remaining.length) {
      c.lost = remaining.length;
      for (const m of remaining) m.disabled = true;
      this.state.counters.set('crisis_rescued', c.rescued);
      this.state.counters.set('crisis_lost', c.lost);
      if (c.rescued > 0) this.state.set('crisis_saved_some');
      if (c.lost === 0) this.state.set('crisis_saved_all');
      this.game.hud.notice(
        c.lost === 0 ? '<b>All four.</b>' : `<b>${c.rescued} out. ${c.lost} not.</b>`,
        c.lost === 0 ? 'good' : 'bad', 7);
      this.game.emit('music', 'explore');
      this.crisis = null;
      this._markerTargets.crisis = null;
      this.quests.notify('custom', { id: 'crisisResolved' });
      this._markerTargets.nessa = { x: -112, z: -84 };
      this.save();
    }
  }

  // ---------------------------------------------------------- interactions

  interact(t) {
    const g = this.game;
    if (!t) return;

    switch (t.kind) {
      case 'climb':
        g.player.tryClimb();
        return;

      case 'door': {
        if (t.locked && !testCondition(t.unlockIf, this.state)) {
          g.hud.notice(t.lockedPrompt || 'Locked.', 'bad', 2.6);
          g.emit('sfx', 'locked');
          return;
        }
        this.enterDoor(t);
        return;
      }

      case 'take': {
        if (t.taken) return;
        t.taken = true;
        t.disabled = true;
        this.state.give(t.item, t.n ?? 1);
        g.emit('sfx', 'pickup');
        this.quests.notify('collect', { item: t.item });
        this.quests.notify('interact', { id: t.id });
        this.save();
        return;
      }

      case 'examine': {
        this._examine(t);
        this.quests.notify('interact', { id: t.id });
        return;
      }

      case 'vent': {
        this._ventInteract(t);
        return;
      }

      case 'rescue': {
        if (t.id === 'nessa_down') {
          this.quests.notify('custom', { id: 'nessaFound' });
          return;
        }
        if (t.disabled) return;
        t.disabled = true;
        if (this.crisis) {
          this.crisis.rescued++;
          g.hud.notice(`<b>${this.crisis.rescued} of 4</b> up.`, 'good', 3);
          g.emit('sfx', 'rescue');
        }
        return;
      }

      case 'npc': {
        this.talkTo(t.npc);
        return;
      }

      default:
        if (t.npc) this.talkTo(t.npc);
    }
  }

  _examine(t) {
    const TOPICS = {
      cellar_row: {
        title: 'Cellar Row',
        lines: [
          "Nine names, hand-painted, and someone has gone over them in a second colour where the first faded.",
          "BEK, I. is fourth.",
          "Under the last name, in a different hand: THEY WERE TOLD IT WAS SAFE.",
        ],
      },
      nessa_bag: {
        title: "Nessa's bag",
        lines: [
          "A canvas filter bag, dropped, still half full. Two spare cartridges and a torch with a dead cell.",
          "The strap is snapped where it was pulled off a shoulder, not put down.",
          "Whoever was carrying it went further in, and did not come back this way.",
        ],
      },
      published_line: {
        title: 'Q4 — Published',
        lines: [
          "The published line for the current quarter, pinned and initialled.",
          "It sits eighty metres west of where the reduction on the desk beneath it puts it.",
          "Both sheets are signed by the same person on the same day.",
        ],
      },
    };
    const topic = TOPICS[t.topic];
    if (!topic) return;
    this.game.setMode(MODE.DIALOGUE);
    let i = 0;
    const show = () => {
      if (i >= topic.lines.length) { this.game.setMode(MODE.PLAY); this.game.dialogueUI.hide(); return; }
      this.game.dialogueUI.show({ speaker: 'system', text: topic.lines[i++] }, null);
    };
    this.game.dialogueUI.onAdvance = show;
    show();
    this.state.addJournal(`examine:${t.topic}`, topic.title, topic.lines.join(' '));
    if (t.startsQuest) this.quests.start(t.startsQuest);
  }

  _ventInteract(t) {
    const S = this.state;
    if (!S.has('found_venting')) {
      S.set('found_venting');
      this.quests.notify('interact', { id: 'vent_west_1' });
      this.game.hud.notice('<b>Cracked and wedged.</b><br>Somebody did this deliberately.', '', 5);
      return;
    }
    if (S.has('vents_shut') || S.has('vents_left') || S.has('vents_half')) {
      this.game.hud.notice('Nothing more to do here.', '', 2);
      return;
    }
    if (!S.can('rigVent') && !S.has('sol_vent_talked')) {
      this.game.hud.notice('Talk to Sol first. She will not thank you, but she will tell you.', '', 4);
      return;
    }
    this.startConversation(CONVERSATIONS.vent_decision, null, () => {
      this.quests.notify('custom', { id: 'ventDecision' });
      this.save();
    });
  }

  async enterDoor(t) {
    const g = this.game;
    g.setMode(MODE.LOADING);
    await g.menus.fadeOut();
    g.teleport(t.target);
    if (t.interiorId) {
      this.currentInterior = t.interiorId;
      const def = g.city.interiors.get(t.interiorId);
      g.forcedMood = def ? (def.mood || 'interior') : 'interior';
      if (def && def.ppm !== undefined) g.interiorPpm = def.ppm;
      const name = def && def.id ? def.id : '';
      this.state.discover(name);
    } else {
      this.currentInterior = null;
      g.forcedMood = null;
      g.interiorPpm = null;
    }
    this.refreshCast();
    g.emit('sfx', 'door');
    await g.menus.fadeIn();
    g.setMode(MODE.PLAY);
    this.quests.notify('interact', { id: t.id });
    this._pollReach(true);
  }

  // ------------------------------------------------------------- dialogue

  /**
   * Which conversation this person has right now.
   *
   * People do not have one script. What Sol says depends on whether the ash
   * crew has been in the yard yet; what Teo says depends on whether you are
   * carrying the log. Resolving it here keeps that logic in one readable place
   * instead of scattered through the dialogue data.
   */
  convoFor(npcId) {
    const S = this.state;
    switch (npcId) {
      case 'sol':
        if (S.has('ch1_raid_done') && !S.has('sol_knows_name')) return 'sol_after_raid';
        return 'sol_first';
      case 'teo':
        if (S.hasItem('logbook') && !S.has('teo_log_done')) return 'teo_log';
        return 'teo_first';
      case 'nessa': {
        if (S.chapter >= 4 && !S.has('nessa_scene_done')) return 'nessa_truth';
        const run = S.quests.get('nessaRun');
        if (run && run.state === 'active' && !S.has('nessa_rescued')) return 'nessa_rescue';
        return 'nessa_first';
      }
      default:
        return null;
    }
  }

  talkTo(npc) {
    const id = this.convoFor(npc.npcId);
    const convo = CONVERSATIONS[id] || CONVERSATIONS[npc.convo];
    if (!convo) return;
    this.startConversation(convo, npc);
  }

  startConversation(convo, npc, onEnd) {
    const g = this.game;
    g.setMode(MODE.DIALOGUE);
    g.hud.setVisible(false);
    if (npc) {
      npc.faceTowards(g.player.pos.x, g.player.pos.z);
      npc.animator.play('talk', { fade: 0.3 });
      g.player.faceTowards(npc.pos.x, npc.pos.z);
      g.camera.lockTarget = null;
      this._talkNpc = npc;
    }

    const ui = g.dialogueUI;
    const runner = this.dialogue;

    runner.clear();
    runner.on('node', (node, choices) => {
      ui.show(node, choices);
      if (node.speaker && node.speaker !== 'ren' && node.speaker !== 'system') {
        g.emit('sfx', 'voice', { who: node.speaker });
      }
    });
    runner.on('end', () => {
      ui.hide();
      g.hud.setVisible(true);
      g.setMode(MODE.PLAY);
      if (this._talkNpc) {
        this._talkNpc.animator.stopAction(0.3);
        this._talkNpc = null;
      }
      if (npc) {
        this.state.set(`${npc.npcId}_met`);
        this.quests.notify('talk', { who: npc.npcId, convo: convo.id });
        if (npc.npcId === 'nessa' && this.state.has('nessa_rescue_started') && !this.state.has('nessa_rescued')) {
          // She walks out on her own once she has air. Put her back in the yard.
          const a = NPC_ANCHORS.nessa;
          const gr = this.game.world.groundUnder(a.x, a.z, 0.4, 8, 14);
          npc.pos.set(a.x, gr ? gr.y + 0.05 : 0.1, a.z);
          npc.crouch = 0;
          npc.animator.locomotion.crouch = 0;
          this.state.set('nessa_rescued');
          this._markerTargets.nessaRun = null;
        }
      }
      if (onEnd) onEnd();
      this.save();
    });

    ui.onAdvance = () => runner.advance();
    ui.onChoose = (i) => runner.choose(i);
    runner.start(convo);
  }

  // ------------------------------------------------------------- objectives

  _updateObjective(id, index, step) {
    const g = this.game;
    if (!id || !step) { g.hud.setObjective('', ''); g.hud.setMarker(null); return; }
    const def = QUESTS[id];
    g.hud.setObjective(def.side ? def.title : `CHAPTER ${def.chapter} · ${def.title}`,
      step.objective + (step.hint ? `<br><span style="opacity:.62;font-size:.86em">${step.hint}</span>` : ''));
    const m = this._resolveMarker(step);
    g.hud.setMarker(m);
  }

  _resolveMarker(step) {
    const M = {
      sol: () => this.npcs.get('sol')?.pos,
      teo: () => ({ x: -104.5, z: -8.4 }),
      arcade: () => ({ x: -104.5, z: -8.4 }),
      nessa: () => this.npcs.get('nessa')?.pos,
      iris: () => this.npcs.get('iris')?.pos,
      survey: () => ({ x: 62, z: -34 }),
      trench: () => ({ x: 74, z: 20 }),
      ventfield: () => ({ x: 96, z: -57 }),
      cinderroad: () => ({ x: 25, z: -6 }),
      southmarrow: () => ({ x: -60, z: 54 }),
      ventWest: () => ({ x: -118, z: 26 }),
      bek: () => ({ x: -34, z: 44.6 }),
      slipEscape: () => ({ x: -74, z: -11.5 }),
      nessaRun: () => ({ x: -92, z: 48 }),
      crisis: () => this._markerTargets.crisis,
    };
    if (step.marker && M[step.marker]) {
      const p = M[step.marker]();
      if (p) return { x: p.x, z: p.z, color: '#ff7a2f' };
    }
    if (step.trigger && step.trigger.pos) {
      return { x: step.trigger.pos[0], z: step.trigger.pos[1], color: '#ff7a2f' };
    }
    return null;
  }

  // ------------------------------------------------------------------ trade

  openTrade() {
    const g = this.game;
    const S = this.state;
    const offers = [
      { give: ['salvage', 4], get: ['filter', 1], label: 'Filter cartridge' },
      { give: ['salvage', 3], get: ['bandage', 1], label: 'Field dressing' },
      { give: ['salvage', 3], get: ['cell', 1], label: 'Lamp cell' },
      { give: ['salvage', 5], get: ['stim', 1], label: 'Ephedrine tab' },
    ];
    const nodes = { start: { speaker: 'teo', text: 'Salvage on the left, goods on the right. No credit.', choices: [] } };
    offers.forEach((o, i) => {
      const can = S.hasItem(o.give[0], o.give[1]);
      nodes.start.choices.push({
        text: `${o.label} — ${o.give[1]} salvage`,
        if: can ? {} : { flag: '__never__' },
        showLocked: true,
        why: can ? null : 'Not enough salvage.',
        goto: `buy${i}`,
        effects: [{ take: o.give }, { give: o.get }],
      });
    });
    nodes.start.choices.push({ text: 'Nothing.', goto: 'end' });
    offers.forEach((o, i) => {
      nodes[`buy${i}`] = { speaker: 'teo', text: 'Mm.', next: 'start' };
    });
    this.startConversation({ id: 'trade', nodes, start: 'start' }, this.npcs.get('teo'));
  }

  // ------------------------------------------------------------------ death

  onPlayerDeath(p) {
    const g = this.game;
    this.state.deaths++;
    g.setMode(MODE.DEAD);
    g.hud.setVisible(false);
    setTimeout(() => g.menus.showDeath(p.lastDeathCause || 'blunt'), 1400);
  }

  async retry() {
    const g = this.game;
    g.menus.hideDeath();
    await g.menus.fadeOut();
    // Restore from the last autosave if there is one; otherwise just pick her
    // up where she fell, with the encounter reset.
    const save = Storage.load();
    if (save) this.applySave(save);
    else {
      const p = g.player;
      p.hp = p.maxHp * 0.6;
      p.dead = false;
      p.state = STATE.IDLE;
      p.lungs.sat = 0;
      p.animator.stopAction(0.05);
      g.teleport(this.state.lastSpawn || 'start');
    }
    for (const a of [...g.actors]) {
      if (a instanceof Enemy) g.removeActor(a);
    }
    this._raidActive = null;
    g.ai.clearProjectiles(g);
    g.hud.setVisible(true);
    await g.menus.fadeIn();
    g.setMode(MODE.PLAY);
  }

  // ------------------------------------------------------------------- save

  save(silent = false) {
    this.state.playTime = this.game.playTime;
    this.state.lastSpawn = this.currentInterior ? `${this.currentInterior}_in` : this.state.lastSpawn;
    const ok = Storage.save(this.state, this.game.player, {
      interior: this.currentInterior,
      npcState: [...this.npcs.keys()],
      takenIds: this.game.city.interactions.filter((i) => i.taken).map((i) => i.id),
      disabledIds: this.game.city.interactions.filter((i) => i.disabled).map((i) => i.id),
      gasSources: this.game.gas.sources.filter((s) => s.id).map((s) => [s.id, s.active]),
      gasIntensity: this.game.gas._targetScale,
    });
    if (ok && !silent) this.game.hud.showAutosave();
    return ok;
  }

  applySave(d) {
    const g = this.game;
    this.state.deserialise(d.state);
    if (d.player) {
      const p = g.player;
      p.pos.set(d.player.x, d.player.y, d.player.z);
      p.vel.set(0, 0, 0);
      p.yaw = p.targetYaw = d.player.rot;
      p.hp = d.player.hp;
      p.stamina = d.player.stamina;
      p.lungs.sat = d.player.sat || 0;
      p.lungs.filter = d.player.filter ?? null;
      p.lungs.masked = !!d.player.masked;
      p.lampOn = !!d.player.lampOn;
      p.lampBattery = d.player.lampBattery ?? 1;
      p.dead = false;
      p.state = STATE.IDLE;
      p.animator.stopAction(0.05);
      g.camera.yaw = d.player.rot;
      g.camera._init = false;
    }
    for (const it of g.city.interactions) {
      it.taken = (d.takenIds || []).includes(it.id);
      it.disabled = (d.disabledIds || []).includes(it.id);
    }
    for (const [id, active] of d.gasSources || []) {
      g.gas.setSourceActive(id, active);
      g.atmos.setMarkerActive(id, active);
      g.atmos.plumes.setAnchorActive(id, active);
    }
    if (d.gasIntensity !== undefined) g.gas.setIntensity(d.gasIntensity);
    this.currentInterior = d.interior || null;
    g.forcedMood = this.currentInterior ? 'interior' : null;
    this.refreshCast();
    this.quests.emitObjective();
    return true;
  }

  // --------------------------------------------------------------- endings

  /** Present the final choice at the trench. */
  _offerEnding() {
    this.startConversation(CONVERSATIONS.final, null, () => {
      this.quests.notify('custom', { id: 'endingChosen' });
      this.finish();
    });
  }

  async finish() {
    const g = this.game;
    const S = this.state;
    const ending = ENDINGS.find((e) => testCondition(e.condition, S)) || ENDINGS[ENDINGS.length - 1];
    S.ending = ending.id;

    const paras = [];
    if (ending.epilogue) {
      paras.push(S.has('nessa_told_truth') && S.chose('nessa_truth', 'told')
        ? ending.epilogue.told : ending.epilogue.untold);
    }
    for (const b of EPILOGUE_BEATS) {
      if (testCondition(b.condition, S)) paras.push(b.text);
    }
    paras.push(
      `Time in Hollis: ${Math.floor(S.playTime / 60)} minutes. ` +
      `Filters spent: ${S.filtersUsed}. ` +
      `You went down ${S.deaths} time${S.deaths === 1 ? '' : 's'}.`);

    g.setMode(MODE.CINEMATIC);
    g.hud.setVisible(false);
    g.emit('music', 'ending');
    await g.menus.fadeOut(true);
    g.menus.showEnding(ending, paras);
    Storage.save(S, g.player, { completed: true });
  }

  // ------------------------------------------------------------------ tick

  update(dt) {
    const g = this.game;
    if (g.mode !== MODE.PLAY && g.mode !== MODE.DIALOGUE) return;

    this._reachTimer -= dt;
    if (this._reachTimer <= 0) { this._reachTimer = 0.25; this._pollReach(); }

    this._updateCrisis(dt);

    this._autosaveTimer -= dt;
    if (this._autosaveTimer <= 0) {
      this._autosaveTimer = 90;
      if (g.mode === MODE.PLAY && !this._raidActive) this.save();
    }

    // NPCs look at Ren when she is close. Small, and it is the difference
    // between people and furniture.
    for (const npc of this.npcs.values()) {
      const d = Math.hypot(npc.pos.x - g.player.pos.x, npc.pos.z - g.player.pos.z);
      if (d < 7) {
        npc.animator.lookAt = _v.set(
          g.player.pos.x - npc.pos.x,
          (g.player.pos.y + 1.5) - (npc.pos.y + 1.5),
          g.player.pos.z - npc.pos.z
        ).applyAxisAngle(_up, -npc.yaw);
      } else npc.animator.lookAt = null;
    }
  }

  _pollReach(force = false) {
    const g = this.game;
    const p = g.player;
    this.quests.notify('reach', { x: p.pos.x, y: p.pos.y, z: p.pos.z });

    // Region discovery and location cards.
    const r = g.zone;
    if (r && this.state.discover(r.id)) {
      g.hud.showCard('', r.name, '');
      g.emit('sfx', 'discover');
    }
  }

  /** Candidate NPC interaction, merged into the player's interact target. */
  npcInteractTarget() {
    const g = this.game;
    const p = g.player;
    let best = null, bestD = 3.0;
    for (const npc of this.npcs.values()) {
      if (!npc.group.visible) continue;
      if (npc.interiorId && npc.interiorId !== this.currentInterior) continue;
      const d = Math.hypot(npc.pos.x - p.pos.x, npc.pos.z - p.pos.z);
      if (d > bestD) continue;
      bestD = d;
      best = npc;
    }
    if (!best) return null;
    return { kind: 'npc', npc: best, label: best.name, prompt: `Speak to ${best.name}`,
      x: best.pos.x, y: best.pos.y + 1.2, z: best.pos.z };
  }

  /** Item use, routed from the inventory screen or the USE button. */
  useItem(id) {
    const g = this.game;
    const S = this.state;
    const it = ITEMS[id];
    if (!it || !it.use || !S.hasItem(id)) return false;
    const p = g.player;

    switch (it.use) {
      case 'fitFilter':
        if (p.lungs.filter !== null && p.lungs.filter > 0.75) {
          g.hud.notice('The one you have is still good.', '', 2.2);
          return false;
        }
        S.take(id, 1);
        S.filtersUsed++;
        p.lungs.fitFilter(1);
        p.animator.play('interact', { fade: 0.1 });
        g.emit('sfx', 'filter');
        g.hud.notice('Fresh cartridge.', 'good', 2.4);
        return true;

      case 'heal': {
        if (p.hp >= p.maxHp - 1) { g.hud.notice('Nothing to dress.', '', 2); return false; }
        S.take(id, 1);
        p.heal(it.healAmount);
        p.animator.play('interact', { fade: 0.1 });
        g.atmos.spawnBurst('heal', p.pos.x, p.pos.y + 1, p.pos.z, 0, 1, 0, 10, 1);
        g.emit('sfx', 'heal');
        return true;
      }

      case 'recharge':
        S.take(id, 1);
        p.lampBattery = 1;
        g.emit('sfx', 'pickup');
        g.hud.notice('Lamp cell replaced.', 'good', 2.4);
        return true;

      case 'stim':
        S.take(id, 1);
        p.stamina = p.maxStamina;
        p.lungs.sat = Math.max(0, p.lungs.sat - 0.07);
        g.emit('sfx', 'stim');
        g.hud.notice('Your chest opens. It does not put oxygen in the air.', '', 3.4);
        return true;

      default: return false;
    }
  }

  /** The USE button: filter first if the air is bad, dressing if hurt. */
  quickUse() {
    const g = this.game;
    const p = g.player;
    const S = this.state;
    const badAir = (p.ambientPpm || 0) > 260 || p.lungs.sat > 0.1;
    const hurt = p.hp < p.maxHp * 0.7;
    const filterSpent = p.lungs.filter === null || p.lungs.filter < 0.2;

    if (badAir && filterSpent && S.hasItem('filter')) return this.useItem('filter');
    if (hurt && S.hasItem('bandage')) return this.useItem('bandage');
    if (S.hasItem('filter') && filterSpent) return this.useItem('filter');
    if (S.hasItem('bandage') && p.hp < p.maxHp) return this.useItem('bandage');
    g.hud.notice('Nothing useful to hand.', '', 2);
    return false;
  }
}

const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
