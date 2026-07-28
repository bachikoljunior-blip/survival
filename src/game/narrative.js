/**
 * Narrative engine: conditions, effects, dialogue and quests.
 *
 * Dialogue and quests share one condition language and one effect language,
 * which means a line of dialogue and a quest step can gate on exactly the same
 * things, and the automated consistency test only has to understand one
 * grammar to prove that every branch is reachable and every requirement is
 * satisfiable.
 *
 * Conditions are plain objects:
 *   { flag: 'x' }            { notFlag: 'x' }
 *   { item: 'filter', n: 2 } { cap: 'rigVent' }
 *   { trust: ['sol', 20] }   { trustBelow: ['iris', -10] }
 *   { chose: ['cellar', 'told'] }
 *   { quest: ['q1', 'done'] }
 *   { chapter: 3 }           { counter: ['kills', 5] }
 *   { all: [...] } { any: [...] } { not: {...} }
 *
 * Effects are plain objects too:
 *   { flag: 'x' } { unflag: 'x' } { give: ['filter', 2] } { take: [...] }
 *   { trust: ['sol', 10, 'reason'] } { cap: 'shortRope' } { quest: 'q2' }
 *   { step: ['q2', 3] } { choice: ['cellar', 'told'] } { journal: [...] }
 *   { chapter: 4 } { bump: ['parries', 1] } { fn: 'someHook' }
 */

import { Emitter, clamp, clamp01 } from '../core/util.js';

// ---------------------------------------------------------------- evaluate --

export function testCondition(cond, S) {
  if (!cond) return true;
  if (Array.isArray(cond)) return cond.every((c) => testCondition(c, S));

  if (cond.all) return cond.all.every((c) => testCondition(c, S));
  if (cond.any) return cond.any.some((c) => testCondition(c, S));
  if (cond.not) return !testCondition(cond.not, S);

  if (cond.flag !== undefined && !S.has(cond.flag)) return false;
  if (cond.notFlag !== undefined && S.has(cond.notFlag)) return false;
  if (cond.item !== undefined && !S.hasItem(cond.item, cond.n ?? 1)) return false;
  if (cond.noItem !== undefined && S.hasItem(cond.noItem, 1)) return false;
  if (cond.cap !== undefined && !S.can(cond.cap)) return false;
  if (cond.noCap !== undefined && S.can(cond.noCap)) return false;
  if (cond.trust !== undefined && S.trustOf(cond.trust[0]) < cond.trust[1]) return false;
  if (cond.trustBelow !== undefined && S.trustOf(cond.trustBelow[0]) > cond.trustBelow[1]) return false;
  if (cond.chose !== undefined && !S.chose(cond.chose[0], cond.chose[1])) return false;
  if (cond.notChose !== undefined && S.chose(cond.notChose[0], cond.notChose[1])) return false;
  if (cond.chapter !== undefined && S.chapter < cond.chapter) return false;
  if (cond.chapterAt !== undefined && S.chapter !== cond.chapterAt) return false;
  if (cond.counter !== undefined && S.count(cond.counter[0]) < cond.counter[1]) return false;
  if (cond.quest !== undefined) {
    const q = S.quests.get(cond.quest[0]);
    const want = cond.quest[1];
    const state = q ? q.state : 'none';
    if (want === 'active' && state !== 'active') return false;
    if (want === 'done' && state !== 'done') return false;
    if (want === 'none' && state !== 'none') return false;
    if (want === 'notdone' && state === 'done') return false;
  }
  if (cond.step !== undefined) {
    const q = S.quests.get(cond.step[0]);
    if (!q || q.step < cond.step[1]) return false;
  }
  return true;
}

export function applyEffects(effects, S, ctx) {
  if (!effects) return;
  const list = Array.isArray(effects) ? effects : [effects];
  for (const e of list) {
    if (!e) continue;
    if (e.flag) S.set(e.flag, true);
    if (e.unflag) S.set(e.unflag, false);
    if (e.give) S.give(e.give[0], e.give[1] ?? 1);
    if (e.take) S.take(e.take[0], e.take[1] ?? 1);
    if (e.trust) S.adjustTrust(e.trust[0], e.trust[1], e.trust[2]);
    if (e.cap) S.unlock(e.cap);
    if (e.choice) S.record(e.choice[0], e.choice[1]);
    if (e.journal) S.addJournal(e.journal[0], e.journal[1], e.journal[2]);
    if (e.chapter !== undefined) { S.chapter = Math.max(S.chapter, e.chapter); S.emit('chapter', S.chapter); }
    if (e.bump) S.bump(e.bump[0], e.bump[1] ?? 1);
    if (e.discover) S.discover(e.discover);
    if (e.quest && ctx && ctx.quests) ctx.quests.start(e.quest);
    if (e.step && ctx && ctx.quests) ctx.quests.setStep(e.step[0], e.step[1]);
    if (e.complete && ctx && ctx.quests) ctx.quests.complete(e.complete);
    if (e.fail && ctx && ctx.quests) ctx.quests.fail(e.fail);
    if (e.fn && ctx && ctx.hooks && ctx.hooks[e.fn]) ctx.hooks[e.fn](S, ctx, e.arg);
    if (e.notice && ctx && ctx.game) ctx.game.hud.notice(e.notice[0], e.notice[1] || '');
    if (e.card && ctx && ctx.game) ctx.game.hud.showCard(e.card[0], e.card[1], e.card[2]);
  }
}

// ---------------------------------------------------------------- dialogue --

/**
 * Runs one conversation. Nodes are looked up by id in the conversation's
 * `nodes` map; a node either advances automatically (`next`) or waits on the
 * player choosing from `choices`.
 */
export class DialogueRunner extends Emitter {
  constructor(state, ctx) {
    super();
    this.S = state;
    this.ctx = ctx;
    this.convo = null;
    this.node = null;
    this.history = [];
    this.active = false;
  }

  start(convo, startId) {
    this.convo = convo;
    this.history = [];
    this.active = true;
    if (convo.onStart) applyEffects(convo.onStart, this.S, this.ctx);
    // Entry can branch on state — the same door produces a different scene
    // depending on what you did last time you were here.
    let id = startId || convo.start || 'start';
    if (Array.isArray(convo.entry)) {
      for (const e of convo.entry) {
        if (testCondition(e.if, this.S)) { id = e.goto; break; }
      }
    }
    this.goto(id);
    return this;
  }

  goto(id) {
    if (!id || id === 'end') return this.finish();
    const n = this.convo.nodes[id];
    if (!n) { console.warn('[dialogue] missing node', id, 'in', this.convo.id); return this.finish(); }
    this.node = { ...n, id };
    this.history.push(id);
    if (n.effects) applyEffects(n.effects, this.S, this.ctx);
    // A node with no text is a pure branch point.
    if (!n.text && (n.next || n.branch)) return this.advance();
    this.emit('node', this.node, this.choices());
    return this.node;
  }

  /** Visible choices, with locked ones surfaced rather than hidden. */
  choices() {
    const n = this.node;
    if (!n || !n.choices) return null;
    const out = [];
    for (const c of n.choices) {
      const ok = testCondition(c.if, this.S);
      if (!ok && !c.showLocked) continue;
      out.push({ ...c, locked: !ok });
    }
    return out.length ? out : null;
  }

  /** Take a choice by index into the array returned by choices(). */
  choose(index) {
    const list = this.choices();
    if (!list || !list[index]) return this.advance();
    const c = list[index];
    if (c.locked) return null;
    if (c.effects) applyEffects(c.effects, this.S, this.ctx);
    this.emit('chose', c);
    return this.goto(c.goto || 'end');
  }

  /** Continue past a node that has no choices. */
  advance() {
    const n = this.node;
    if (!n) return this.finish();
    if (n.branch) {
      for (const b of n.branch) {
        if (testCondition(b.if, this.S)) return this.goto(b.goto);
      }
      return this.goto(n.next || 'end');
    }
    return this.goto(n.next || 'end');
  }

  finish() {
    if (!this.active) return null;
    this.active = false;
    if (this.convo && this.convo.onEnd) applyEffects(this.convo.onEnd, this.S, this.ctx);
    const c = this.convo;
    this.convo = null;
    this.node = null;
    this.emit('end', c);
    return null;
  }
}

// ------------------------------------------------------------------ quests --

/**
 * Quest engine.
 *
 * A quest is an ordered list of steps. Each step declares an objective line,
 * a trigger that satisfies it, and effects that fire when it does. Steps may
 * branch: `nextIf` picks a different index depending on state, which is how a
 * choice made in chapter two changes what chapter four asks you to do.
 */
export class QuestSystem extends Emitter {
  constructor(state, defs, ctx) {
    super();
    this.S = state;
    this.defs = defs;
    this.ctx = ctx;
    ctx.quests = this;
    this.activeId = null;
  }

  def(id) { return this.defs[id]; }

  status(id) {
    const q = this.S.quests.get(id);
    return q ? q.state : 'none';
  }

  start(id) {
    if (!this.defs[id]) { console.warn('[quest] unknown', id); return false; }
    const cur = this.S.quests.get(id);
    if (cur && cur.state !== 'none') return false;
    const d = this.defs[id];
    this.S.quests.set(id, { state: 'active', step: 0, data: {} });
    if (d.onStart) applyEffects(d.onStart, this.S, this.ctx);
    if (!this.activeId || this.defs[this.activeId]?.side) this.activeId = id;
    this.emit('start', id, d);
    this._enterStep(id, 0);
    return true;
  }

  setStep(id, index) {
    const q = this.S.quests.get(id);
    if (!q || q.state !== 'active') return false;
    if (index <= q.step) return false;
    q.step = index;
    this._enterStep(id, index);
    return true;
  }

  _enterStep(id, index) {
    const d = this.defs[id];
    const step = d.steps[index];
    if (!step) return this.complete(id);
    if (step.onEnter) applyEffects(step.onEnter, this.S, this.ctx);
    this.emit('step', id, index, step);
    if (this.activeId === id) this.emit('objective', id, index, step);
    // A step with no trigger is a pure narrative beat; move on immediately.
    if (!step.trigger) this.advance(id);
    return true;
  }

  /**
   * Re-fire the onEnter effects of every active step.
   *
   * Loading is the only path that needs this, and it needs it badly: an
   * encounter step spawns its enemies from onEnter, and a retry wipes every
   * enemy off the map. Without re-entering, the player respawns onto a step
   * whose trigger — "all of them are dead" — can never fire again, and the
   * story is over. Hooks reached this way must be idempotent.
   */
  reenterActiveSteps() {
    for (const [id, q] of this.S.quests) {
      if (q.state !== 'active') continue;
      const step = this.defs[id]?.steps?.[q.step];
      if (step && step.onEnter) applyEffects(step.onEnter, this.S, this.ctx);
    }
  }

  /** Complete the current step and move to the next (respecting branches). */
  advance(id) {
    const q = this.S.quests.get(id);
    if (!q || q.state !== 'active') return false;
    const d = this.defs[id];
    const step = d.steps[q.step];
    if (step && step.onDone) applyEffects(step.onDone, this.S, this.ctx);

    let next = q.step + 1;
    if (step && step.nextIf) {
      for (const b of step.nextIf) {
        if (testCondition(b.if, this.S)) { next = b.goto; break; }
      }
    }
    if (next >= d.steps.length) return this.complete(id);
    q.step = next;
    return this._enterStep(id, next);
  }

  complete(id) {
    const q = this.S.quests.get(id);
    if (!q) return false;
    q.state = 'done';
    const d = this.defs[id];
    if (d.onComplete) applyEffects(d.onComplete, this.S, this.ctx);
    this.emit('complete', id, d);
    if (this.activeId === id) {
      this.activeId = null;
      this._pickActive();
    }
    return true;
  }

  fail(id) {
    const q = this.S.quests.get(id);
    if (!q) return false;
    q.state = 'failed';
    const d = this.defs[id];
    if (d.onFail) applyEffects(d.onFail, this.S, this.ctx);
    this.emit('fail', id, d);
    if (this.activeId === id) { this.activeId = null; this._pickActive(); }
    return true;
  }

  _pickActive() {
    // Prefer the main line; fall back to any active side quest.
    for (const [id, q] of this.S.quests) {
      if (q.state !== 'active') continue;
      if (!this.defs[id]?.side) { this.activeId = id; this.emitObjective(); return; }
    }
    for (const [id, q] of this.S.quests) {
      if (q.state === 'active') { this.activeId = id; this.emitObjective(); return; }
    }
    this.activeId = null;
    this.emit('objective', null, 0, null);
  }

  setActive(id) {
    if (this.status(id) !== 'active') return false;
    this.activeId = id;
    this.emitObjective();
    return true;
  }

  emitObjective() {
    const id = this.activeId;
    if (!id) { this.emit('objective', null, 0, null); return; }
    const q = this.S.quests.get(id);
    this.emit('objective', id, q.step, this.defs[id].steps[q.step]);
  }

  currentStep(id = this.activeId) {
    if (!id) return null;
    const q = this.S.quests.get(id);
    if (!q || q.state !== 'active') return null;
    return { quest: this.defs[id], id, index: q.step, step: this.defs[id].steps[q.step], data: q.data };
  }

  /**
   * Feed a world event to every active quest. Steps whose trigger matches
   * advance. This is the only coupling between gameplay and the story graph.
   */
  notify(kind, payload = {}) {
    for (const [id, q] of this.S.quests) {
      if (q.state !== 'active') continue;
      const d = this.defs[id];
      const step = d.steps[q.step];
      if (!step || !step.trigger) continue;
      const t = step.trigger;
      if (t.kind !== kind) continue;
      if (t.if && !testCondition(t.if, this.S)) continue;

      let match = true;
      switch (kind) {
        case 'reach':
          match = t.at === payload.at ||
            (t.pos && Math.hypot(payload.x - t.pos[0], payload.z - t.pos[1]) < (t.radius ?? 4) &&
             (t.y === undefined || Math.abs(payload.y - t.y) < (t.yTolerance ?? 3)));
          break;
        case 'talk': match = t.who === payload.who && (!t.convo || t.convo === payload.convo); break;
        case 'interact': match = t.ids ? t.ids.includes(payload.id) : t.id === payload.id; break;
        case 'collect': match = t.item === payload.item && this.S.hasItem(t.item, t.n ?? 1); break;
        case 'kill': match = (!t.faction || t.faction === payload.faction) &&
                             (!t.who || t.who === payload.who) &&
                             (!t.count || (q.data.kills = (q.data.kills || 0) + 1) >= t.count); break;
        case 'flag': match = t.flag === payload.flag; break;
        case 'custom': match = t.id === payload.id; break;
        default: match = false;
      }
      if (match) this.advance(id);
    }
  }

  /** All active quests, for the journal. */
  list() {
    const out = [];
    for (const [id, q] of this.S.quests) {
      const d = this.defs[id];
      if (!d) continue;
      out.push({ id, def: d, state: q.state, step: q.step, current: d.steps[q.step] });
    }
    return out;
  }
}
