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
import { QUESTS, CONVERSATIONS, CAST, ENDINGS, EPILOGUE_BEATS, QUIET } from '../content/story.js';
import { MODE } from './game.js';
import { clamp, clamp01, lerp, damp } from '../core/util.js';
import { PPM } from '../world/gas.js';
import { t, phrase, questTitle, questSummary, stepText, castName, isCJK }
  from '../content/i18n.js';

/**
 * The dose below which somebody left standing there does not die.
 *
 * Not PPM.ELEVATED: that is "headache within the hour", and the gas field's
 * own turbulence swings about twenty per cent around any sample, so a spot
 * chosen at 190 reads 230 by the time you have walked somebody to it. At 400
 * saturation never climbs to critical, which is the thing the sequence is
 * actually asking you to achieve.
 */
const SAFE_PPM = PPM.ELEVATED * 2;

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
      g.hud.notice(`<b>${questTitle(id, def.title)}</b>`, '', 4);
      g.emit('sfx', 'questStart');
    });
    this.quests.on('complete', (id, def) => {
      const qt = questTitle(id, def.title);
      if (!def.side) g.hud.notice(`<b>${qt}</b><br>${t('ui.quest.complete', 'complete')}`, 'good', 4);
      else g.hud.notice(`${qt} — ${t('ui.quest.done', 'done')}`, 'good', 3);
      g.emit('sfx', 'questDone');
      this.save();
    });

    this.state.on('capability', (id, cap) => {
      g.hud.notice(`<b>${t(`cap.${id}.name`, cap.name)}</b><br>${t(`cap.${id}.desc`, cap.desc)}`, 'good', 6);
      g.emit('sfx', 'unlock');
    });
    this.state.on('journal', (j) => g.hud.notice(
      `${t('ui.journal.added', 'Note added')} — <b>${t(`journal.${j.id}.title`, j.title)}</b>`, '', 3));
    this.state.on('item', (id, n, delta) => {
      if (delta > 0 && ITEMS[id]) g.hud.notice(`${t(`item.${id}.name`, ITEMS[id].name)} ×${delta}`, '', 2.4);
    });
    // Trust changes surface as a toast — except on the beats where Ren says
    // the hard true thing. Popping "Sol — She knows what you are now" in red
    // over a confession turns the centre of the story into a score.
    this.state.on('trust', (id, v, delta, reason) => {
      if (!reason || reason === QUIET) return;
      // The reason is an authored English sentence with no id of its own, so it
      // goes through the phrase glossary, which is keyed on the English.
      g.hud.notice(`<b>${castName(id, CAST[id] ? CAST[id].name : id)}</b><br>${phrase(reason)}`,
        delta > 0 ? 'good' : 'bad', 3.4);
    });

    g.on('interact', (t) => this.interact(t));
    g.on('meter:read', (r) => {
      this.state.bump('metersRead');
      this.quests.notify('custom', { id: 'meterRead' });
      // Ren notes the first genuinely bad reading she takes herself.
      if (r.ppm > PPM.DANGER && !this.state.has('saw_danger_air')) {
        this.state.set('saw_danger_air');
        this.state.addJournal('badair', 'What the meter says',
`Eight hundred parts per million and climbing, at chest height, in a street
where people are living. The published line puts this ground clear. I have been
holding a device that disagrees with a government document for about four
seconds and I already know which one I believe.`);
      }
    });
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
        // z=-80 is the 4.2 m heat-plant pipe. Spawning the slinger exactly on
        // it pre-damaged the unit in a fall before the player could engage.
        ['scav', -100, -74], ['scav', -96, -88], ['slinger', -92, -82],
      ]),
      spawnTrenchLine: () => {
        this._spawnRaid('trench', [
          ['warden', 70, 14], ['warden', 78, 16], ['scav', 74, 24],
        ]);
        // The line is a shift, not a crusade. There are three ways past it and
        // only one of them is the fight.
        this._addRuntimeInteraction({
          id: 'trench_talk', kind: 'examine', x: 74, y: 1.4, z: 18, range: 3.4,
          label: 'The Warden line', prompt: 'Show them the order', topic: 'trench_line',
          requiresItem: 'trenchOrder',
        });
        g.hud.notice(t('ui.hud.wardenline', '<b>Warden line</b><br>Three of them, on a shift.'), 'bad', 4.5);
      },
      shutVents: () => {
        for (let i = 1; i <= 3; i++) {
          g.gas.setSourceActive(`vent_west_${i}`, false);
          g.atmos.setMarkerActive(`vent_west_${i}`, false);
          g.atmos.plumes.setAnchorActive(`vent_west_${i}`, false);
        }
        g.gas.setSourceActive('yard_seep', true);
        g.hud.notice(t('ui.hud.drawreverses', 'The draw reverses. You can hear it change.'), '', 5);
      },
      halfVents: () => {
        g.gas.setSourceActive('vent_west_2', false);
        g.atmos.setMarkerActive('vent_west_2', false);
        g.atmos.plumes.setAnchorActive('vent_west_2', false);
        g.gas.setIntensity(1.15);
        g.hud.notice(t('ui.hud.halfvents',
          'One head shut. Both places are worse than one could have been.'), '', 5);
      },
      beginCrisis: () => this._beginCrisis(),
      raisePlant: () => this._raisePlant(),
      offerEnding: () => this._offerEnding(),
      // Deferred by a tick: the hook fires from inside DialogueRunner.choose(),
      // and starting a new conversation there swaps the runner's convo out from
      // under the caller, which then resolves its own `goto` against the wrong
      // graph. The shop opened and closed in the same tick and salvage had no
      // sink in the entire game.
      openTrade: () => {
        this.quests.notify('custom', { id: 'teoTrade' });
        this._pendingTrade = true;
      },
    };
  }

  /**
   * Reset the *world* to its authored state.
   *
   * GameState.reset() clears the story, but the world carries its own mutable
   * state — items already taken, doors already opened, borehole heads already
   * shut, rescue markers pushed in by a crisis, NPCs standing where the last
   * run left them. Without this, a second playthrough starts in a city that
   * still remembers the first one.
   */
  resetWorld() {
    const g = this.game;

    // Geometry a run raised: the chapter-five compound, and any survivors or
    // followers still standing about from a crisis.
    g.city.removeRuntimeProps('trenchplant');
    this._plantUp = false;
    this._endingOffered = false;
    g.atmos.setMarkers(g.city.lightMarkers);
    if (this.crisis) {
      for (const m of this.crisis.marks) if (m.actor) g.removeActor(m.actor);
    }

    // Interactions: restore taken/disabled, and drop anything a run injected.
    g.city.interactions = g.city.interactions.filter((i) => !i._runtime);
    for (const it of g.city.interactions) {
      it.taken = false;
      it.disabled = false;
    }

    // Gas: every source back to its authored active state, and the intensity
    // back to baseline.
    for (const s of g.gas.sources) {
      const authored = this._authoredGas ?? (this._authoredGas = new Map(
        g.city.data.gasSources.filter((x) => x.id).map((x) => [x.id, x.active !== false])));
      if (s.id) {
        const on = authored.has(s.id) ? authored.get(s.id) : true;
        s.active = on;
        g.atmos.setMarkerActive(s.id, on);
        g.atmos.plumes.setAnchorActive(s.id, on);
      }
    }
    // Props declare their own vents; those default to on.
    for (const p of g.city.data.props) {
      if (p.kind !== 'vent' || !p.id) continue;
      g.gas.setSourceActive(p.id, p.hot !== false);
      g.atmos.setMarkerActive(p.id, p.hot !== false);
      g.atmos.plumes.setAnchorActive(p.id, p.hot !== false);
    }
    g.gas.setIntensity(1);
    g.gas.globalScale = 1;
    g.gas.dirty = true;
    g.gas.bake();

    // Cast: put everyone back where they start, upright and idle.
    for (const [id, npc] of this.npcs) {
      const a = NPC_ANCHORS[id];
      if (!a) continue;
      let x = a.x, z = a.z, y = 0, rot = a.rot || 0;
      if (a.spawn) {
        const sp = g.city.spawns.get(a.spawn);
        if (sp) { x = sp.x; z = sp.z; y = sp.y; rot = sp.rot; }
      }
      const gr = g.world.groundUnder(x, z, 0.4, y + 6, 12);
      npc.pos.set(x, gr ? gr.y + 0.05 : y, z);
      npc.vel.set(0, 0, 0);
      npc.yaw = npc.targetYaw = rot;
      npc.crouch = 0;
      npc.animator.locomotion.crouch = 0;
      npc.animator.stopAction(0.01);
      npc.group.visible = true;
    }

    // Hostiles, projectiles, encounters, crisis.
    for (const a of [...g.actors]) if (a instanceof Enemy) g.removeActor(a);
    g.ai.clearProjectiles(g);
    this._raidActive = null;
    this.crisis = null;
    this._markerTargets = {};
    this.currentInterior = null;
    g.forcedMood = null;
    g.interiorPpm = null;
    this._autosaveTimer = 0;
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
    // She dropped the bag where she turned back; she is further west, pinned
    // in the low ground. Putting her a metre from her own bag meant the "find
    // her route" step completed on the frame it started.
    const g = this.game.world.groundUnder(-126, 62, 0.4, 1.4, 6);
    n.placeAt(-126, g ? g.y + 0.05 : 0.1, 62);
    n.group.visible = true;
    n.yaw = n.targetYaw = 2.1;
    n.animator.locomotion.crouch = 1;
    n.crouch = 1;
    n.downed = true;
    this._markerTargets.nessaRun = { x: -126, z: 62 };
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

  /**
   * The trench crews start on the published line at first light.
   *
   * Chapter five is premised on plant arriving, and the trench pit itself has
   * been in the world since the first frame — so what actually changes is the
   * compound around it: two excavators on the marker, a spoil heap, floodlights
   * on a generator, and the barrier the Wardens are standing behind. Ren's
   * monologue at the trench describes exactly this, and now it is there.
   */
  _raisePlant() {
    const g = this.game;
    if (this._plantUp) return;
    this._plantUp = true;
    g.city.addRuntimeProps('trenchplant', [
      { kind: 'excavator', x: 82, z: 10, rot: -1.9, boom: 0.8, id: 'exc_a' },
      { kind: 'excavator', x: 88, z: 22, rot: -2.5, boom: 0.35, id: 'exc_b' },
      { kind: 'generator', x: 76, z: 30, rot: 0.4 },
      { kind: 'worklight', x: 78, z: 12, id: 'plant_l1' },
      { kind: 'worklight', x: 86, z: 26, id: 'plant_l2' },
      { kind: 'worklight', x: 72, z: 22, id: 'plant_l3' },
      { kind: 'barrier', x: 70, z: 12, rot: 0.35, len: 3.0 },
      { kind: 'barrier', x: 70.6, z: 15.2, rot: 0.35, len: 3.0 },
      { kind: 'barrier', x: 71.2, z: 18.4, rot: 0.35, len: 3.0 },
      { kind: 'barrier', x: 71.8, z: 21.6, rot: 0.35, len: 3.0 },
      { kind: 'van', x: 66, z: 26, rot: 1.2 },
      { kind: 'drum', x: 80, z: 32 }, { kind: 'drum', x: 81.4, z: 33 },
      { kind: 'pallet', x: 84, z: 32, rot: 0.6 },
      { kind: 'crate', x: 85.2, z: 33.2 }, { kind: 'crate', x: 86, z: 32.4 },
      { kind: 'rubble', x: 90, z: 16, w: 16, d: 9, h: 2.6 },   // the spoil heap
    ], 'plant');
    g.atmos.setMarkers(g.city.lightMarkers);
    g.hud.notice(t('ui.hud.firstlight', '<b>They started at first light.</b>'), 'bad', 5);
    g.emit('music', 'crisis');
  }

  /** Push a runtime interaction that resetWorld and saves will clean up. */
  _addRuntimeInteraction(it) {
    const list = this.game.city.interactions;
    if (list.some((i) => i.id === it.id)) return;
    list.push({ ...it, _runtime: true });
  }

  _spawnRaid(id, list) {
    const g = this.game;
    // Idempotent: a load re-enters the active step, and a raid that is already
    // on the ground must not be doubled.
    if (this._raidActive && this._raidActive.id === id &&
        this._raidActive.group.some((e) => !e.dead)) return;
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
    g.hud.notice(t('ui.hud.ashcrew', '<b>Ash crew</b><br>in the yard'), 'bad', 4);
    g.emit('music', 'combat');
    return group;
  }

  /**
   * Chapter five's Warden line. Cleared by killing them, by getting over them
   * — the scaffold and the spoil heap are both climbable and both drop you
   * inside — or by putting Krajcik's own unissued cut order in a foreman's
   * hand, which is the thing Ren is actually good at.
   */
  _checkTrenchPassed() {
    if (this.state.has('trench_passed')) return;
    const g = this.game;
    const p = g.player;
    // Showing the foreman the order is a way through in its own right.
    if (this.state.has('trench_talked')) {
      this.state.set('trench_passed');
      this.state.set('trench_talked_through');
      g.hud.notice(t('ui.hud.stepsaside',
        '<b>He steps aside.</b><br>Neither of them decides to have been looking.'), 'good', 5);
      this.quests.notify('custom', { id: 'trenchPassed' });
      return;
    }
    // Past the line and inside the cut, however you got there.
    // Inside the cut, and ABOVE it: the way over is the spoil heap, which is a
    // real climb, not a walk along the gantry the approach already put you on.
    if (p.pos.x > 76 && p.pos.x < 96 && p.pos.z > 6 && p.pos.z < 26 && p.pos.y > 2.4) {
      this.state.set('trench_passed');
      if (this._raidActive && this._raidActive.group.some((e) => !e.dead)) {
        this.state.set('trench_slipped');
        g.hud.notice(t('ui.hud.pastthem', '<b>Past them.</b><br>Nobody looked up.'), 'good', 4);
      }
      this.quests.notify('custom', { id: 'trenchPassed' });
    }
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
      // Killing the line is one of the three ways past it; the ending is
      // offered from the step completing, not from the bodies.
      this.state.set('trench_fought');
      if (!this.state.has('trench_passed')) {
        this.state.set('trench_passed');
        this.quests.notify('custom', { id: 'trenchPassed' });
      }
    }
  }

  /**
   * Chapter 4 crisis. Which block floods depends on what the player did to
   * the borehole heads two chapters earlier — the consequence arrives late
   * and by name.
   */
  _beginCrisis() {
    const g = this.game;
    if (this.crisis && !this.crisis.done) return;   // idempotent across loads
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
      g.hud.notice(t('ui.hud.courtyard',
        '<b>The courtyard is filling.</b><br>Pell House, ground floor.'), 'bad', 7);
    } else {
      g.gas.setIntensity(1.7);
      this._markerTargets.crisis = { x: -60, z: 52 };
      g.hud.notice(t('ui.hud.fennstreet',
        '<b>Fenn Street has gone.</b><br>Four people still down there.'), 'bad', 7);
    }
    g.emit('music', 'crisis');

    // Four people, on the ground, in air that is killing them. They are actual
    // actors rather than proximity markers: reaching one gets them on their
    // feet and following, and they are only out when they are above the smoke.
    // The objective has always said "use the roofs"; now it means it.
    const base = shut ? [[-112, -76], [-118, -90], [-104, -92], [-124, -80]]
                      : [[-58, 50], [-70, 58], [-42, 54], [-88, 50]];
    base.forEach(([x, z], i) => this._spawnSurvivor(i, x, z));
    this.quests.notify('custom', { id: 'crisisArrive' });
  }

  /**
   * GOOD HABITS is not bought and it is not given. It is what twenty years
   * underground leaves behind, and the player earns it the same way Ren did:
   * by going over the line, coming back under it on her own legs, and then
   * doing it a second time rather than deciding once was enough.
   */
  _updateHabits() {
    const p = this.game.player;
    if (!p || p.dead || this.state.can('goodHabits')) return;
    if (p.lungs.critical) { this._satEvent = true; return; }
    if (!this._satEvent || p.lungs.sat > 0.06) return;
    this._satEvent = false;
    const n = this.state.bump('survivedSaturation');
    if (n < 2) return;
    this.state.unlock('goodHabits');
    this.state.addJournal('habits', 'What the body learns', `Second time this week I have come up out
of it on my own legs. The chest is doing the thing it used to do on rescue —
short at the top, long at the bottom, and do not fight it.

You do not get that back by wanting it. You get it back by doing it twice.`);
  }

  /**
   * Steer one follower toward the player, including up.
   *
   * Followers used to be straight-line `setMove` only, and the only vertical
   * geometry in Hollis is ladders and fire escapes, which are CLIMB volumes.
   * So a follower could physically never get above 2.6 m, which is the test
   * for being out — and the chapter-four rescue was unwinnable by playing. The
   * harness hid it by teleporting the survivor onto the roof.
   *
   * They climb the same volumes the player does: if the player is more than a
   * body-height above and there is something to climb within reach, take it.
   */
  _followStep(a, p, dt, want) {
    const dx = p.pos.x - a.pos.x, dz = p.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    const rise = p.pos.y - a.pos.y;

    if (a.state === STATE.CLIMB) {
      // On a ladder: go up while the player is above, step off when level.
      if (rise > 0.4) a.setMove(-Math.sin(a.yaw), -Math.cos(a.yaw), 1);
      else a.exitClimb();
      return d;
    }

    if (rise > 1.4 && d < 30) {
      const box = this.game.world.climbAt(a.pos.x, a.pos.y + 0.6, a.pos.z, 1.3);
      if (box) {
        a.enterClimb(box);
        a.setMove(-Math.sin(a.yaw), -Math.cos(a.yaw), 1);
        return d;
      }
      // Nothing within reach — walk to the nearest way up rather than standing
      // in the courtyard looking at somebody on a roof.
      const near = this.game.world.nearestClimb(a.pos.x, a.pos.y, a.pos.z, 34);
      if (near) {
        const ax = near.x - a.pos.x, az = near.z - a.pos.z;
        const ad = Math.hypot(ax, az) || 1;
        a.setMove(ax / ad, az / ad, 1.0);
        a.faceTowards(near.x, near.z);
        return d;
      }
    }

    if (d > want) a.setMove(dx / d, dz / d, clamp((d - want) / 3.0, 0, 1) * 0.9);
    else a.setMove(0, 0, 0);
    a.faceTowards(p.pos.x, p.pos.z);
    return d;
  }

  /**
   * Escort. Nessa can walk and cannot climb, so she follows on the flat and
   * the player has to find her a way up — which is the one time in the game
   * the roof network is load-bearing rather than a shortcut.
   *
   * She is out when she is above the smoke: three metres of elevation and air
   * she can actually breathe at head height. That is a condition about the
   * world rather than a trigger volume, so any route the player finds counts.
   */
  _updateEscort(dt) {
    const g = this.game;
    const n = this.npcs.get('nessa');
    if (!n || !n.following) return;
    const p = g.player;

    const d = this._followStep(n, p, dt, 2.1);

    // She is not a ghost: if the player climbs away and leaves her, she says so.
    this._escortNag = (this._escortNag || 0) - dt;
    if (d > 16 && this._escortNag <= 0) {
      this._escortNag = 9;
      g.hud.notice(t('ui.hud.nessanag', '<i>Nessa</i><br>"I can\'t follow you up that."'), 'bad', 3.4);
    }

    const ppm = g.gas.sample(n.pos.x, n.pos.y + 1.5, n.pos.z);
    n.safeFor = ppm < SAFE_PPM ? (n.safeFor || 0) + dt : 0;
    if (n.safeFor > 3.0) {
      n.following = false;
      this.state.set('nessa_rescued');
      this._markerTargets.nessaRun = null;
      this.quests.notify('custom', { id: 'nessaOut' });
      g.hud.notice(t('ui.hud.nessaout',
        '<b>Above it.</b><br>She sits down on the felt and does not get up for a while.'), 'good', 6);
      g.emit('sfx', 'rescue');
      this.save();
    }
  }

  /**
   * One of the four. A downed civilian with a rescue interaction on them, who
   * gets up and follows once the player reaches them.
   */
  _spawnSurvivor(i, x, z, state = null) {
    const g = this.game;
    // From street height, not from eight metres up: searching from y=8 landed
    // survivors on roof parapets, in clean air, already rescued.
    const ground = g.world.groundUnder(x, z, 0.4, 1.4, 6);
    const a = new Actor({
      x, z, y: ground ? ground.y + 0.05 : 0.1, rot: (i * 1.7) % (Math.PI * 2),
      world: g.world, gas: g.gas, mats: g.mats,
      costume: 'civ', detail: 1, faction: 'neutral',
      // Named people, not spawn slots. The name is shown on the rescue prompt
      // and again in the notice when they get up, so it goes through `t()`.
      name: t(`ui.survivor.${i}`,
        ['Ostrowski', 'A woman with a child', 'An older man', 'Someone in a coat'][i]
        || t('ui.survivor.4', 'Someone')),
      maxHp: 999, gasImmune: true,
    });
    a.crowdId = `crisis_${i}`;
    a.crouch = 1;
    a.animator.locomotion.crouch = 1;
    a.animator.locomotion.alert = 0;
    if (state === 'following') { a.following = true; a.crouch = 0; a.animator.locomotion.crouch = 0; }
    g.scene.add(a.group);
    g.actors.push(a);

    const it = {
      id: `crisis_${i}`, kind: 'rescue', x, y: 1.1, z, range: 2.4,
      label: a.name, prompt: 'Get them on their feet',
      _runtime: true, actor: a,
      disabled: state === 'out',
    };
    if (state === 'out') { a.group.visible = false; }
    g.city.interactions.push(it);
    this.crisis.marks.push(it);
    return it;
  }

  /**
   * Walk the survivors out. Same rule as Nessa: three metres of elevation and
   * air they can breathe at head height. A follower left behind in the gas is
   * a follower who does not come out, which is the whole of chapter four.
   */
  _updateCrisisEscort(dt) {
    const g = this.game;
    const c = this.crisis;
    if (!c) return;
    const p = g.player;
    // Anyone who is out walks off under their own steam, away from the site.
    const site = this._markerTargets.crisis;
    for (const m of c.marks) {
      const a = m.actor;
      if (a && a.leaving > 0) {
        a.leaving -= dt;
        const ax = a.pos.x - (site ? site.x : 0), az = a.pos.z - (site ? site.z : 0);
        const ad = Math.hypot(ax, az) || 1;
        a.setMove(ax / ad, az / ad, 1);
        a.faceTowards(a.pos.x + ax / ad, a.pos.z + az / ad);
        if (a.leaving <= 0) { a.group.visible = false; a.setMove(0, 0, 0); }
        continue;
      }
      if (!a || !a.following) continue;
      // Followers trail the player in a loose file so four of them do not
      // stack into one silhouette.
      const idx = c.marks.indexOf(m);
      const d = this._followStep(a, p, dt, 2.0 + idx * 0.7);

      // Out = breathing, and kept breathing. An altitude test looked right and
      // was unsatisfiable: a walking body cannot get above 0.40m anywhere near
      // either crisis site, so every survivor was always lost. Height still
      // helps — the gas stratifies, so up IS where the clean air is — but what
      // is measured is the air itself.
      const ppm = g.gas.sample(a.pos.x, a.pos.y + 1.5, a.pos.z);
      a.safeFor = ppm < SAFE_PPM ? (a.safeFor || 0) + dt : 0;
      if (a.safeFor > 3.0) {
        // Out means gone. Marking somebody rescued and leaving them standing
        // in the street is a lie the player can walk back and check.
        a.following = false;
        a.out = true;
        a.leaving = 7;
        m.disabled = true;
        c.rescued++;
        g.hud.notice(t('ui.hud.rescued', '<b>@n of 4</b> up.').replace('@n', String(c.rescued)), 'good', 3);
        g.emit('sfx', 'rescue');
      }
    }
  }

  /** Rebuild an in-flight chapter-four crisis from a save. */
  _restoreCrisis(c) {
    const g = this.game;
    this.crisis = { site: c.site, survivors: 4, rescued: c.rescued, lost: c.lost,
                    timeLeft: c.timeLeft, marks: [] };
    const shut = c.site === 'stacks';
    this._markerTargets.crisis = shut ? { x: -112, z: -84 } : { x: -60, z: 52 };
    const base = shut ? [[-112, -76], [-118, -90], [-104, -92], [-124, -80]]
                      : [[-58, 50], [-70, 58], [-42, 54], [-88, 50]];
    base.forEach(([x, z], i) =>
      this._spawnSurvivor(i, x, z, c.done && c.done[i] ? 'out' : null));
    g.emit('music', 'crisis');
  }

  _updateCrisis(dt) {
    const c = this.crisis;
    if (!c) return;
    c.timeLeft -= dt;
    const remaining = c.marks.filter((m) => !m.disabled);
    if (c.timeLeft <= 0 || !remaining.length) {
      c.lost = remaining.length;
      for (const m of remaining) {
        m.disabled = true;
        if (m.actor) m.actor.following = false;
      }
      this.state.counters.set('crisis_rescued', c.rescued);
      this.state.counters.set('crisis_lost', c.lost);
      if (c.rescued > 0) this.state.set('crisis_saved_some');
      if (c.lost === 0) this.state.set('crisis_saved_all');
      // Sol's post-crisis scene keys off the night itself, not off the chapter
      // closing — the player goes and stands in front of her before the
      // chapter is over, which is the whole point of the scene.
      this.state.set('crisis_done');
      this.game.hud.notice(
        c.lost === 0 ? t('ui.hud.allfour', '<b>All four.</b>')
          : t('ui.hud.someout', '<b>@a out. @b not.</b>')
            .replace('@a', String(c.rescued)).replace('@b', String(c.lost)),
        c.lost === 0 ? 'good' : 'bad', 7);
      this.game.emit('music', 'explore');
      // Everyone who got up walks off; everyone who did not is left where the
      // player left them, which is the part that should be looked at.
      for (const m of c.marks) {
        if (!m.actor) continue;
        if (m.actor.out) this.game.removeActor(m.actor);
        else { m.actor.setMove(0, 0, 0); m.actor.crouch = 1; m.actor.animator.locomotion.crouch = 1; }
      }
      this.game.city.interactions = this.game.city.interactions.filter((i) => !c.marks.includes(i));
      this.crisis = null;
      this._markerTargets.crisis = null;
      this.quests.notify('custom', { id: 'crisisResolved' });
      this._markerTargets.nessa = { x: -112, z: -84 };
      this.save();
    }
  }

  // ---------------------------------------------------------- interactions

  interact(it) {
    const g = this.game;
    if (!it) return;

    switch (it.kind) {
      case 'climb':
        g.player.tryClimb();
        return;

      case 'door': {
        if (it.locked && !testCondition(it.unlockIf, this.state)) {
          g.hud.notice(it.lockedPrompt ? phrase(it.lockedPrompt) : t('ui.hud.locked', 'Locked.'), 'bad', 2.6);
          g.emit('sfx', 'locked');
          return;
        }
        // Coming in off the north elevation means nobody ran a pass reader,
        // which Krajcik notices and mentions.
        if (it.id === 'survey_backdoor') this.state.set('entered_unlogged');
        this.game._guard(this.enterDoor(it), MODE.PLAY);
        return;
      }

      case 'take': {
        if (it.taken) return;
        it.taken = true;
        it.disabled = true;
        this.state.give(it.item, it.n ?? 1);
        g.emit('sfx', 'pickup');
        this.quests.notify('collect', { item: it.item });
        this.quests.notify('interact', { id: it.id });
        this.save();
        return;
      }

      case 'examine': {
        this._examine(it);
        this.quests.notify('interact', { id: it.id });
        return;
      }

      case 'vent': {
        this._ventInteract();
        return;
      }

      // A boarded shopfront or a shuttered cellar. Without the reground bar it
      // is scenery you are told to remember; with it, it is the reason to walk
      // down a street you had no errand on.
      case 'breach': {
        if (it.taken) return;
        if (!this.state.can('breach')) {
          g.hud.notice(t('ui.hud.boards',
            'The boards are nailed through into the frame. Not with this.'), '', 3);
          g.emit('sfx', 'locked');
          return;
        }
        it.taken = true;
        it.disabled = true;
        g.player.animator.play('interact', { fade: 0.1 });
        g.emit('sfx', 'breach');
        g.atmos.spawnBurst('dust', it.x, it.y, it.z, 0, 1, 0, 14, 1.2);
        const loot = it.loot || [['salvage', 2]];
        const names = [];
        for (const [item, n] of loot) {
          this.state.give(item, n);
          this.quests.notify('collect', { item });
          names.push(`${ITEMS[item] ? t(`item.${item}.name`, ITEMS[item].name) : item} ×${n}`);
        }
        this.quests.notify('interact', { id: it.id });
        g.hud.notice(`<b>${it.reveal ? phrase(it.reveal) : t('ui.hud.behindboards', 'Behind the boards')}</b>` +
          `<br>${names.join(', ')}`, 'good', 4.5);
        if (it.journal) this.state.addJournal(it.journal[0], it.journal[1], it.journal[2]);
        this.state.bump('breached');
        this.save();
        return;
      }

      case 'rescue': {
        if (it.id === 'nessa_down') {
          this.quests.notify('custom', { id: 'nessaFound' });
          return;
        }
        if (it.disabled || !it.actor || it.actor.following) return;
        it.actor.following = true;
        it.actor.crouch = 0;
        it.actor.animator.locomotion.crouch = 0;
        it.actor.animator.play('interact', { fade: 0.12 });
        g.emit('sfx', 'rescue');
        g.hud.notice(t('ui.hud.ontheirfeet', '<b>@n</b> is on their feet. Get them up somewhere.')
          .replace('@n', it.actor.name), '', 4);
        return;
      }

      case 'npc': {
        this.talkTo(it.npc);
        return;
      }

      default:
        if (it.npc) this.talkTo(it.npc);
    }
  }

  _examine(spec) {
    const TOPICS = {
      // The letter that brought her back. Teo paraphrases it in chapter two
      // and then argues it out of relevance; the player should have read it
      // themselves before he gets the chance.
      bek_letter: {
        title: "Ilya Bek — 2nd July, never posted",
        lines: [
          "Two sheets of lined paper, folded four times, in a hand that presses hard.",
          "\u201cTo the Reclamation Authority. I am not a surveyor and I will not pretend to be one. I am writing about the heat in my cellar.\u201d",
          "\u201cIn March the floor was cold. In April I could stand on it in socks. Last Tuesday I put my hand flat on the flags at the back wall and had to take it off again. I have written the dates down since March because I did not trust myself to remember them correctly.\u201d",
          "\u201cI am told the published line puts this street outside the burn. I would like to know what the line is measured from, and by whom, and when it was last done. That is the whole of what I am asking. I am not asking anybody to be blamed.\u201d",
          "\u201cThere are nine houses on this side. Four of them have children in. I have not told the others because I do not want to be the man who frightens a street over a warm floor, and because if I am wrong I will have to keep living here afterwards.\u201d",
          "\u201cIf I am not wrong, then somebody should have come and put their hand on my floor a year ago. Yours, I. Bek, 14 Cellar Row.\u201d",
          "He was right about all of it. He was polite about all of it. Neither made any difference at all.",
        ],
        journal: ['bek', "Bek's letter", `I have read it eleven times on the train and once more
tonight and it still lands the same way, which is: he was not accusing anybody.
He wanted somebody to come and put a hand on his floor.

I read the Q3 numbers nine weeks before he wrote it.`],
      },
      // The log is the whole of chapter two and it had no examine at all: a
      // key item the player fetches, carries for three chapters and never
      // reads. The numbers are the argument, so the player gets the numbers.
      the_log: {
        title: 'Borehole log — Vent Field 9',
        lines: [
          "A hardbacked field log, water-stained along the fore-edge, ruled in columns: HEAD / DATE / TEMP degC / CO ppm / SURVEYED BY / CHECKED BY.",
          "Head 9-3, week of 4th July: 291 degrees. Week of 11th July: 406. Week of 18th July: the column is blank, and so is every column after it.",
          "Cellar Row runs forty metres north of head 9-3.",
          "The published line for that quarter puts Cellar Row two hundred metres outside the burn.",
          "Every sheet from March to July carries the same two names in the signature block. Surveyed by T. Iles. Checked by R. Vasko.",
          "It is my handwriting. I remember the pen. I remember it was raining and I remember thinking that four hundred and six was going to be somebody's problem in the autumn.",
        ],
        journal: ['log', 'The log', `Four hundred and six degrees at head 9-3, week of the eleventh
of July, forty metres from Cellar Row, on a sheet I checked and initialled.

They stopped recording that head after the eleventh. Not falsified. Stopped.
Somebody looked at that number and decided the honest thing was to stop
looking.`],
      },
      the_order: {
        title: 'Cut order — firebreak, full alignment',
        lines: [
          "Three pages, costed to the metre. Nine point four million. Eleven months. A firebreak sixty metres wide on the TRUE alignment, not the published one.",
          "It is signed at the bottom by V. Krajcik and dated fourteen months ago.",
          "It was never issued. There is no reason on it and no annotation.",
          "Somebody in this building worked out exactly what would save Hollis, put a price on it, signed it, and put it in a drawer, and then went on managing the fire instead.",
        ],
        journal: ['order', 'The cut order', `He wrote it. He costed it. He signed it. He did not issue
it and he did not write down why, which means the why is something he did not
want on paper, which narrows it a great deal.`],
      },
      vasko_shop: {
        title: 'Vasko & Co',
        lines: [
          "Painted ironwork over a shuttered front. VASKO & CO — LAMPS, FITTINGS, REPAIRS.",
          "He did cap lamps. Forty years of them, and then eleven years of nothing, and then the shutter.",
          "The paint is going on the second O and nowhere else, because the second O is the only letter that catches the weather off Marrow Street, and he used to go up a ladder every spring and do that one letter.",
          "Nobody has done the second O in twelve years.",
        ],
        journal: ['vasko', 'The second O', `Walked past my father's shop for the fourth time today and
this time I stopped. The second O is going. He used to do that one letter every
spring off a ladder and complain the whole time.

I did not go in. The shutter is not even locked.`],
      },
      // The third way past the Warden line: Krajcik's own unissued cut order,
      // in a foreman's hand. It advertised itself in the objective and then did
      // nothing at all, because it named a topic that was never written.
      trench_line: {
        title: 'The Warden line',
        lines: [
          "Two Authority men and somebody's cousin in a hired jacket, standing across the haul road with the excavators idling behind them.",
          "\u201cRoad's shut. Come back Thursday.\u201d",
          "I hold up three pages costed to the metre with their own director's signature at the bottom, and I let the foreman read as much of it as he wants.",
          "He reads all of it. Then he reads the date.",
          "\u201cFourteen months.\u201d",
          "\u201cFourteen months.\u201d",
          "He does not move out of the way, exactly. He turns to the man beside him and says something about the spoil heap, and by the time either of them looks back I am past them and neither has decided to have been looking.",
        ],
        flag: 'trench_talked',
        journal: ['trenchline', 'The foreman', `He read the date and then he stopped reading. I have
seen that exact pause on four faces in this city now and it is always the same
pause: the moment somebody works out they have been on the wrong side of a
document for longer than they have been alive in it.`],
      },
      cellar_floor: {
        title: '14 Cellar Row — the back wall',
        lines: [
          "The flags at the back wall are warm through the boot. Not warm like a hearth. Warm like something under them is still going.",
          "I put my hand flat on them the way he wrote that he did, and I take it off again after about four seconds, which is also what he wrote.",
          "The meter at knee height reads sixteen hundred. At the top of the steps it reads two hundred.",
          "He was not a surveyor. He did not need to be. Anybody who stood in this room for a minute knew.",
          "Anybody who stood in this room.",
        ],
        journal: ['cellarfloor', 'Fourteen, Cellar Row', `Sixteen hundred at knee height, two hundred at
the top of the steps. That gradient is the whole of it. That gradient is what a
borehole log is FOR.

He put his hand on the floor and wrote it down and posted it to us and we drew
the line where the contract wanted it drawn.`],
      },
      bek_gauge: {
        title: "Bek's record",
        lines: [
          "A rain gauge on a bracket, and a school exercise book on a nail beside it, ruled by hand into four columns.",
          "Sixteen years of daily readings. Not one gap. There is a note at the front, in pencil: SITED 2.1M CLEAR OF WALL AND GUTTER, PER MET. OFFICE, BECAUSE THE OFFICIAL ONE IS NOT.",
          "The last page changes. From March, the columns are crossed out and replaced: DATE / FLOOR TEMP / HAND, HOW LONG.",
          "The last entry is the 2nd of July. HAND, HOW LONG: 4 sec.",
          "He wrote the letter the same day.",
        ],
        journal: ['gauge', 'Sixteen years, no gaps', `Ilya Bek kept a rain gauge because he did not
think the official one was sited properly. He was right and it changed nothing,
and he kept it for sixteen years anyway.

In March he stopped recording rain and started recording how long he could keep
his hand on his own floor. Four seconds, on the second of July.`],
      },
      iris_folder: {
        title: 'I. NADEAU — Q. DIFFERENCES',
        lines: [
          "A ring binder on the second desk, labelled in a small, level hand. Not hidden. Not locked. Second thing you would pick up.",
          "Eleven sheets. One per quarter. Each is a reduction she did herself, clipped to the line that was published against it, with the discrepancy written in the margin in metres.",
          "Q3, two years ago: 60m. The quarter after: 95m. Then 140. Then 200, which is the one with Cellar Row on it.",
          "Every margin note is a number. Not one of them is a sentence.",
          "There is nothing else in the folder. No memo, no draft letter, no copy of anything sent to anybody. She has been keeping a record of a thing she has never once reported, for eleven quarters, on her own desk, where anyone could open it.",
        ],
        flag: 'read_folder',
        journal: ['folder', "Nadeau's folder", `Eleven quarters of her own reductions clipped to the
lines that were published against them, discrepancy in the margin, in metres,
never in words.

It is not evidence. She has not collected evidence. She has been marking the
distance between what she knows and what she says, quarter after quarter, and
leaving it on her desk where anybody could open it, which I think is the closest
she has been able to get to telling somebody.`],
      },
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
    const topic = TOPICS[spec.topic];
    if (!topic) return;
    const g = this.game;
    g.setMode(MODE.DIALOGUE);
    g.hud.setVisible(false);
    let i = 0;
    const show = () => {
      if (i >= topic.lines.length) {
        g.dialogueUI.onAdvance = null;
        g.dialogueUI.onChoose = null;
        g.dialogueUI.hide();
        g.hud.setVisible(true);
        g.setMode(MODE.PLAY);
        return;
      }
      const n = i++;
      g.dialogueUI.show(
        { speaker: 'system', text: t(`topic.${spec.topic}.lines.${n}`, topic.lines[n]) }, null);
    };
    g.dialogueUI.onAdvance = show;
    show();
    // A hand-written journal entry where the topic has one; the raw line dump
    // is a fallback, and it reads like a fallback.
    //
    // What is stored is always the English, so a save written in Japanese and
    // reopened in English does not carry a Japanese page in its journal; the
    // journal panel translates on the way to the screen.
    if (topic.journal) this.state.addJournal(topic.journal[0], topic.journal[1], topic.journal[2]);
    else this.state.addJournal(`examine:${spec.topic}`, topic.title, topic.lines.join(' '));
    if (topic.flag) this.state.set(topic.flag);
    if (spec.startsQuest) this.quests.start(spec.startsQuest);
  }

  _ventInteract() {
    const S = this.state;
    if (!S.has('found_venting')) {
      S.set('found_venting');
      this.quests.notify('interact', { id: 'vent_west_1' });
      this.game.hud.notice(t('ui.hud.cracked',
        '<b>Cracked and wedged.</b><br>Somebody did this deliberately.'), '', 5);
      return;
    }
    if (S.has('vents_shut') || S.has('vents_left') || S.has('vents_half')) {
      this.game.hud.notice(t('ui.hud.nothingmore', 'Nothing more to do here.'), '', 2);
      return;
    }
    if (!S.can('rigVent') && !S.has('sol_vent_talked')) {
      this.game.hud.notice(t('ui.hud.talksolfirst',
        'Talk to Sol first. She will not thank you, but she will tell you.'), '', 4);
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
  /**
   * The conversation table, for probes.
   *
   * Exposed here rather than on the window handle so a test drives the same
   * object the director drives — a probe that reaches for its own copy of the
   * content is proving something about its copy.
   */
  get conversations() { return CONVERSATIONS; }

  convoFor(npcId) {
    const S = this.state;
    switch (npcId) {
      case 'sol':
        if (S.has('ch1_raid_done') && !S.has('sol_knows_name')) return 'sol_after_raid';
        return 'sol_first';
      case 'teo':
        if (S.hasItem('logbook') && !S.has('teo_log_done')) return 'teo_log';
        return 'teo_first';
      case 'iris':
        // She gates an ending and she had exactly one repeat line. Once the
        // office scene is done she has somewhere to go.
        return S.has('krajcik_met') ? 'iris_after' : 'iris_first';
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
          // She said the only way out is up and she cannot climb it. Making
          // that true is the point: she gets up when the player walks her up,
          // and she is on her feet and following from here.
          npc.following = true;
          npc.downed = false;
          npc.crouch = 0;
          npc.animator.locomotion.crouch = 0;
          this.game.hud.notice(t('ui.hud.nessawith',
            '<b>Nessa is with you.</b><br>Get her above the smoke.'), '', 5);
        }
      }
      if (onEnd) onEnd();
      this.save();
      // A conversation may have asked to open the shop; do it now that this
      // one has fully unwound.
      if (this._pendingTrade) setTimeout(() => this._flushPendingTrade(), 0);
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
    const title = questTitle(id, def.title);
    const objective = stepText(id, index, 'objective', step.objective);
    const hint = step.hint ? stepText(id, index, 'hint', step.hint) : '';
    // A template, not a word plus a number: Japanese wraps the numeral in
    // 第…章 and there is nowhere to put the counter word in "CHAPTER 1".
    const chapter = t('ui.chapter.fmt', 'CHAPTER @n').replace('@n', String(def.chapter));
    g.hud.setObjective(def.side ? title : `${chapter} · ${title}`,
      objective + (hint ? `<br><span style="opacity:.62;font-size:.86em">${hint}</span>` : ''));
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
      nessaRun: () => { const n = this.npcs.get('nessa'); return n && n.downed ? { x: n.pos.x, z: n.pos.z } : { x: -92, z: 48 }; },
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
    // Teo's shop is assembled at runtime, so it is translated here rather than
    // through the conversation table: the row label is the item's own name, and
    // the price line is a template because "4 salvage" does not put its number
    // in the same place in every language.
    const row = t('ui.trade.row', '@item — @n salvage');
    const nodes = { start: { speaker: 'teo',
      text: t('ui.trade.intro', 'Salvage on the left, goods on the right. No credit.'), choices: [] } };
    offers.forEach((o, i) => {
      const can = S.hasItem(o.give[0], o.give[1]);
      const name = ITEMS[o.get[0]] ? t(`item.${o.get[0]}.name`, ITEMS[o.get[0]].name) : o.label;
      nodes.start.choices.push({
        text: row.replace('@item', name).replace('@n', String(o.give[1])),
        if: can ? {} : { flag: '__never__' },
        showLocked: true,
        why: can ? null : t('ui.trade.poor', 'Not enough salvage.'),
        goto: `buy${i}`,
        effects: [{ take: o.give }, { give: o.get }],
      });
    });
    nodes.start.choices.push({ text: t('ui.trade.leave', 'Nothing.'), goto: 'end' });
    offers.forEach((o, i) => {
      nodes[`buy${i}`] = { speaker: 'teo', text: t('ui.trade.mm', 'Mm.'), next: 'start' };
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
    // Clear the board BEFORE restoring, because restoring re-arms whatever
    // encounter the active step owns. Doing it the other way round deletes the
    // enemies that were just respawned and strands the quest.
    for (const a of [...g.actors]) {
      if (a instanceof Enemy) g.removeActor(a);
    }
    this._raidActive = null;
    g.ai.clearProjectiles(g);

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
      this.quests.reenterActiveSteps();
    }
    g.hud.setVisible(true);
    await g.menus.fadeIn();
    g.setMode(MODE.PLAY);
  }

  // ------------------------------------------------------------------- save

  save(silent = false) {
    const g = this.game;
    this.state.playTime = g.playTime;
    this.state.lastSpawn = this.currentInterior ? `${this.currentInterior}_in` : this.state.lastSpawn;
    const ok = Storage.save(this.state, g.player, {
      interior: this.currentInterior,
      interiorPpm: g.interiorPpm ?? null,
      npcState: [...this.npcs.keys()],
      // NPC transforms, because two of them move during the story and one of
      // those moves is what makes her quest completable.
      npcPos: [...this.npcs.entries()].map(([id, n]) =>
        [id, n.pos.x, n.pos.y, n.pos.z, n.yaw, !!n.downed, !!n.crouch]),
      takenIds: g.city.interactions.filter((i) => i.taken).map((i) => i.id),
      disabledIds: g.city.interactions.filter((i) => i.disabled).map((i) => i.id),
      gasSources: g.gas.sources.filter((s) => s.id).map((s) => [s.id, s.active]),
      gasIntensity: g.gas._targetScale,
      // The chapter-four crisis is a 210-second timer holding four runtime
      // interactions. Autosave fires twice inside it, and without this a
      // reload dropped the timer, the marks and the only code path that
      // records the result — which stalled the chapter permanently.
      crisis: this.crisis ? {
        site: this.crisis.site, rescued: this.crisis.rescued,
        lost: this.crisis.lost, timeLeft: this.crisis.timeLeft,
        done: this.crisis.marks.map((m) => !!m.disabled),
      } : null,
    });
    if (ok && !silent) g.hud.showAutosave();
    return ok;
  }

  applySave(d) {
    const g = this.game;
    // Loading from the title into a session that has already been played
    // leaves the previous run's hostiles alive and aggroed, its crisis timer
    // ticking and its runtime markers on the map. Reset first, always.
    this.resetWorld();
    // Storage.load() only hands back a payload at the current version, so this
    // should not fail — but a half-applied save (world reset, progression not
    // restored, player transform restored) is worse than a refused one, so it
    // stops here and lets the caller say so.
    if (!this.state.deserialise(d.state)) {
      console.warn('[cinderline] refusing a save this build cannot deserialise');
      return false;
    }
    if (d.player) {
      const p = g.player;
      p.placeAt(d.player.x, d.player.y, d.player.z, d.player.rot);
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
    g.interiorPpm = d.interiorPpm ?? null;
    g.forcedMood = this.currentInterior ? 'interior' : null;
    this.refreshCast();

    // Put the cast back where the story left them.
    for (const [id, x, y, z, yaw, downed, crouch] of d.npcPos || []) {
      const n = this.npcs.get(id);
      if (!n) continue;
      n.pos.set(x, y, z);
      n.yaw = n.targetYaw = yaw;
      n.downed = downed;
      n.crouch = crouch ? 1 : 0;
      if (n.animator && n.animator.locomotion) n.animator.locomotion.crouch = n.crouch;
      if (id === 'nessa' && downed) this._markerTargets.nessaRun = { x, z };
    }

    // Restore the crisis in flight, marks and all.
    if (d.crisis) this._restoreCrisis(d.crisis);
    // ...and the chapter-five compound, which is geometry rather than state.
    if (this.state.chapter >= 5) this._raisePlant();
    // Re-arm any encounter the active step is responsible for. retry() has
    // just cleared the map of enemies; without this the raid steps become
    // permanent dead ends.
    this._raidActive = null;
    this.quests.reenterActiveSteps();
    this.quests.emitObjective();
    return true;
  }

  // --------------------------------------------------------------- endings

  /**
   * Present the final choice at the trench.
   *
   * Reached from the quest step rather than from the last body, because there
   * are three ways past the Warden line and only one of them is the fight.
   * Idempotent: a load re-enters the active step.
   */
  _offerEnding() {
    if (this._endingOffered) return;
    this._endingOffered = true;
    this.startConversation(CONVERSATIONS.final, null, () => {
      this.quests.notify('custom', { id: 'endingChosen' });
      this.game._guard(this.finish(), MODE.CINEMATIC);
    });
  }

  async finish() {
    const g = this.game;
    const S = this.state;
    const ending = ENDINGS.find((e) => testCondition(e.condition, S)) || ENDINGS[ENDINGS.length - 1];
    S.ending = ending.id;

    // The body first: the ending's own text, then whichever of its beats the
    // player earned. This is where accumulated action reaches the prose — two
    // players who both publish do not read the same ending.
    // Beats are WOVEN, not appended. An ending that puts its conditional
    // paragraphs after its closing line has a footnote, not a shape — and the
    // closing line of every one of these is the one that has to land last.
    // `@n` interpolates the number of people the player did not get out, so a
    // beat cannot say "two" to somebody who lost one.
    const lost = S.count('crisis_lost');
    const words = ['nobody', 'one', 'two', 'three', 'four'];
    const word = (i) => t(`ui.count.${i}`, words[i]);
    const fill = (s) => s.replace(/@n/g, word(Math.min(lost, 4))).replace(/@N/g, String(lost));

    const src = t(`e.${ending.id}.text`, ending.text);
    const paras0 = src.split('\n\n');
    const tail = paras0.length > 1 ? paras0.pop() : null;
    const body = paras0;
    (ending.beats || []).forEach((b, i) => {
      if (testCondition(b.condition, S)) body.push(fill(t(`e.${ending.id}.beats.${i}`, b.text)));
    });
    if (tail) body.push(tail);

    const paras = [];
    if (ending.epilogue) {
      // Nessa has three outcomes, not two. Telling her and handing her the log
      // are both her hearing it from Ren; withholding is not, and the untold
      // epilogue's "she found out on her own" is only true in that third case.
      const heardItFromYou = S.chose('nessa_truth', 'told') || S.chose('nessa_truth', 'gave');
      const which = heardItFromYou ? 'told' : 'untold';
      paras.push(t(`e.${ending.id}.epilogue.${which}`, ending.epilogue[which]));
    }
    for (const b of EPILOGUE_BEATS) {
      if (testCondition(b.condition, S)) paras.push(fill(t(`ep.${b.id}`, b.text)));
    }
    // The run's own record, in Ren's voice and in her units, rather than a
    // scoreboard. Every ending in the game used to finish on "Time in Hollis:
    // 12 minutes. Filters spent: 0." — a stats line is the wrong last thing to
    // read after any of these.
    const n = (k) => S.count(k);
    const plural = (v, one, many) => `${v} ${v === 1 ? one : many}`;
    const ledger = [];
    // Each line's English is already complete — English needs the count folded
    // into a singular/plural noun, so a "@n minutes" template would not have
    // held it. The translation is a template carrying `@n`, which is a no-op
    // against the English fallback because the fallback has no `@n` in it.
    const line = (key, v, en) => ledger.push(t(`ui.ledger.${key}`, en).replace(/@n/g, String(v)));
    const mins = Math.max(1, Math.floor(S.playTime / 60));
    line('minutes', mins, `${plural(mins, 'minute', 'minutes')} in Hollis.`);
    if (n('metersRead')) line('meters', n('metersRead'), `You lifted the meter ${plural(n('metersRead'), 'time', 'times')}.`);
    if (S.filtersUsed) line('filters', S.filtersUsed, `${plural(S.filtersUsed, 'cartridge', 'cartridges')}.`);
    if (n('crisis_rescued')) line('rescued', n('crisis_rescued'), `${plural(n('crisis_rescued'), 'person', 'people')} up a stairwell.`);
    if (n('breached')) line('breached', n('breached'), `${plural(n('breached'), 'shopfront', 'shopfronts')} opened.`);
    if (n('parries')) line('parries', n('parries'), `${plural(n('parries'), 'blow', 'blows')} turned.`);
    if (n('survivedSaturation')) line('survived', n('survivedSaturation'), `You came up out of it on your own legs ${plural(n('survivedSaturation'), 'time', 'times')}.`);
    if (S.deaths) line('deaths', S.deaths, `You went down ${plural(S.deaths, 'time', 'times')} and got back up.`);
    paras.push(ledger.join(isCJK() ? '' : ' '));

    g.setMode(MODE.CINEMATIC);
    g.hud.setVisible(false);
    g.emit('music', 'ending');
    await g.menus.fadeOut(true);
    g.menus.showEnding(
      { ...ending, title: t(`e.${ending.id}.title`, ending.title), text: body.join('\n\n') }, paras);
    Storage.save(S, g.player, { completed: true });
    await g.menus.fadeIn(true);
  }

  // ------------------------------------------------------------------ tick

  update(dt) {
    const g = this.game;
    if (g.mode !== MODE.PLAY && g.mode !== MODE.DIALOGUE) return;

    this._reachTimer -= dt;
    if (this._reachTimer <= 0) {
      this._reachTimer = 0.25;
      this._pollReach();
      if (this.state.quests.get('cinderline')?.step === 1) this._checkTrenchPassed();
    }

    this._updateCrisis(dt);
    this._updateCrisisEscort(dt);
    this._updateHabits();
    this._updateEscort(dt);

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
      g.hud.showCard('', t(`region.${r.id}.name`, r.name), '');
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
    const who = castName(best.npcId || '', best.name);
    return { kind: 'npc', npc: best, label: who,
      prompt: t('ui.speakto', 'Speak to @n').replace('@n', who),
      x: best.pos.x, y: best.pos.y + 1.2, z: best.pos.z };
  }

  /** Open Teo's exchange, once the conversation that asked for it has ended. */
  _flushPendingTrade() {
    if (!this._pendingTrade) return;
    this._pendingTrade = false;
    this.openTrade();
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
          g.hud.notice(t('ui.hud.filterstillgood', 'The one you have is still good.'), '', 2.2);
          return false;
        }
        S.take(id, 1);
        S.filtersUsed++;
        p.lungs.fitFilter(1);
        p.animator.play('interact', { fade: 0.1 });
        g.emit('sfx', 'filter');
        g.hud.notice(t('ui.hud.freshcartridge', 'Fresh cartridge.'), 'good', 2.4);
        return true;

      case 'heal': {
        if (p.hp >= p.maxHp - 1) { g.hud.notice(t('ui.hud.nothingtodress', 'Nothing to dress.'), '', 2); return false; }
        S.take(id, 1);
        p.heal(it.healAmount);
        p.animator.play('interact', { fade: 0.1 });
        g.atmos.spawnBurst('heal', p.pos.x, p.pos.y + 1, p.pos.z, 0, 1, 0, 10, 1);
        g.emit('sfx', 'heal');
        return true;
      }

      // Readable key items open their examine text rather than being consumed.
      case 'read':
        this._examine({ topic: it.topic, label: it.name });
        return true;

      case 'recharge':
        S.take(id, 1);
        p.lampBattery = 1;
        g.emit('sfx', 'pickup');
        g.hud.notice(t('ui.hud.lampcell', 'Lamp cell replaced.'), 'good', 2.4);
        return true;

      case 'stim':
        S.take(id, 1);
        p.stamina = p.maxStamina;
        p.lungs.sat = Math.max(0, p.lungs.sat - 0.07);
        g.emit('sfx', 'stim');
        g.hud.notice(t('ui.hud.stim', 'Your chest opens. It does not put oxygen in the air.'), '', 3.4);
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
    g.hud.notice(t('ui.hud.nothinguseful', 'Nothing useful to hand.'), '', 2);
    return false;
  }
}

const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
