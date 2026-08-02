#!/usr/bin/env node
/**
 * Static content validation.
 *
 * Runs in Node against the story and world data directly — no browser, no
 * build — and proves the things a playthrough cannot prove exhaustively:
 *
 *   · every dialogue `goto` resolves to a node that exists
 *   · every node is reachable from its conversation's entry
 *   · every effect names a real item, capability, quest or character
 *   · every condition names a flag that something, somewhere, actually sets
 *   · every quest step has a trigger that some system can deliver
 *   · every ending is reachable given the choices the game offers
 *   · every world interaction id referenced by a quest exists in the world
 *
 * A content bug that this catches costs a second. The same bug found by a
 * player costs the ending.
 *
 * On top of that it checks the *shape of the story*, against the ledger in
 * `docs/narrative-state.md`:
 *
 *   · every foreshadowing is paid off, and both ends still exist in the prose
 *   · no ending is reached by an unconditional tap
 *   · no arm of a multi-way choice collapses into another downstream
 *   · the world's numbers agree with each other and with the prose
 *   · trust feedback stays a minority of trust changes, and never surfaces a
 *     sentence the design comment forbids
 *
 * Every one of those rules carries a negative fixture and a positive fixture,
 * and **the battery runs on every invocation before the real content is
 * judged**. A rule that cannot be shown to fail is not allowed to pass
 * anything: this repository has already shipped a check that reported success
 * over thirty-one empty inputs. `--selftest` runs only that battery.
 * `--write-ledger` regenerates the generated table in the ledger.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { QUESTS, CONVERSATIONS, ENDINGS, EPILOGUE_BEATS, CAST, QUIET } from '../src/content/story.js';
import { buildHollisData } from '../src/content/world_data.js';
import { ITEMS, CAPABILITIES, CHARACTERS } from '../src/game/state.js';

const problems = [];
const warnings = [];
const fail = (m) => problems.push(m);
const warn = (m) => warnings.push(m);

// Everything the engine can deliver as a quest trigger.
const TRIGGER_KINDS = new Set(['reach', 'talk', 'interact', 'collect', 'kill', 'flag', 'custom']);

// ------------------------------------------------------ engine introspection --
//
// These three sets used to be hand-maintained literals. That is precisely how a
// quest step shipped with a trigger no code fired, and how two dozen flags
// shipped that nothing read: a whitelist drifts silently from the code it is
// supposed to describe, and a whitelist that has drifted validates nothing.
// They are now derived from the engine source, so they cannot lie.

const ENGINE_SRC = ['src/game/director.js', 'src/game/game.js', 'src/game/narrative.js',
  'src/game/state.js', 'src/main.js']
  .map((p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')).join('\n');

const scrape = (re, src = ENGINE_SRC) => {
  const out = new Set();
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
};

/** Custom trigger ids the director actually fires: notify('custom', { id: 'x' }). */
const CUSTOM_IDS = scrape(/notify\(\s*['"]custom['"]\s*,\s*\{\s*id:\s*['"]([\w.]+)['"]/g);

/** Hook names the director implements, from the object literal _hooks() returns. */
const HOOKS = (() => {
  const dir = readFileSync(new URL('../src/game/director.js', import.meta.url), 'utf8');
  const body = dir.slice(dir.indexOf('_hooks() {'), dir.indexOf('\n  _spawnRaid('));
  return scrape(/^ {6}(\w+):\s*\(\)\s*=>/gm, body);
})();

/** Flags and counters the engine itself sets, from state.set(...) / state.bump(...). */
const ENGINE_FLAGS = new Set([
  ...scrape(/(?:state|S)\.set\(\s*['"]([\w.]+)['"]/g),
  // Examine topics declare a flag they set when read; the set() call itself
  // takes a variable, so the declaration is what has to be scraped.
  ...scrape(/^\s*flag: '([\w.]+)',$/gm),
]);
// `crisis_${site}` sets one of two literal flags; record both explicitly.
if (ENGINE_SRC.includes('`crisis_${site}`')) { ENGINE_FLAGS.add('crisis_stacks'); ENGINE_FLAGS.add('crisis_south'); }

/** Conversation ids named by the director's NPC anchor table. */
const NPC_ANCHORS_FROM_SRC = (() => {
  const dir = readFileSync(new URL('../src/game/director.js', import.meta.url), 'utf8');
  const i = dir.indexOf('NPC_ANCHORS');
  const body = dir.slice(i, dir.indexOf('\n};', i));
  return [...scrape(/convo:\s*'(\w+)'/g, body)];
})();

/** Counters the engine itself increments. */
const ENGINE_BUMPS = new Set([
  ...scrape(/(?:state|S)\.bump\(\s*['"]([\w.]+)['"]/g),
  ...scrape(/counters\.set\(\s*['"]([\w.]+)['"]/g),
]);

/** Flags and counters the engine itself reads. */
const ENGINE_READS = new Set([
  ...scrape(/(?:state|S)\.has\(\s*['"]([\w.]+)['"]/g),
  ...scrape(/counters\.get\(\s*['"]([\w.]+)['"]/g),
  ...scrape(/(?:state|S)\.count\(\s*['"]([\w.]+)['"]/g),
  // Counters read through a local helper, e.g. `const n = (k) => S.count(k)`
  // followed by `n('crisis_rescued')`. Without this the check would push
  // authors toward writing the long form purely to satisfy the linter.
  ...scrape(/\bn\(\s*'([\w.]+)'\s*\)/g),
  ...scrape(/(?:state|S)\.chose\(\s*['"]([\w.]+)['"]/g),
]);

const world = buildHollisData();
const worldInteractionIds = new Set(world.interactions.map((i) => i.id));
for (const p of world.props) if (p.interact) worldInteractionIds.add(p.interact.id);
for (const it of world.interiors || []) {
  for (const i of it.interactions || []) worldInteractionIds.add(i.id);
  if (it.exit) worldInteractionIds.add(`exit_${it.id}`);
}
const worldSpawnIds = new Set(world.spawns.map((s) => s.id));
for (const it of world.interiors || []) for (const s of it.spawns || []) worldSpawnIds.add(s.id);

// ------------------------------------------------------- collect the graph --

/** Every flag the content ever sets. */
const setFlags = new Set();
/** Every flag the content ever reads. */
const readFlags = new Set();
const setChoices = new Map();     // choiceId -> Set(optionId)
const readChoices = new Map();
/** Counters bumped by content, and counters read by a condition. */
const setCounters = new Set();
const readCounters = new Set();

function walkEffects(effects, where) {
  if (!effects) return;
  const list = Array.isArray(effects) ? effects : [effects];
  for (const e of list) {
    if (!e || typeof e !== 'object') { fail(`${where}: malformed effect ${JSON.stringify(e)}`); continue; }
    if (e.flag) setFlags.add(e.flag);
    if (e.bump) setCounters.add(Array.isArray(e.bump) ? e.bump[0] : e.bump);
    if (e.unflag) { setFlags.add(e.unflag); readFlags.add(e.unflag); }
    if (e.give && !ITEMS[e.give[0]]) fail(`${where}: gives unknown item "${e.give[0]}"`);
    if (e.take && !ITEMS[e.take[0]]) fail(`${where}: takes unknown item "${e.take[0]}"`);
    if (e.cap && !CAPABILITIES[e.cap]) fail(`${where}: unlocks unknown capability "${e.cap}"`);
    if (e.trust && !CHARACTERS[e.trust[0]]) fail(`${where}: adjusts trust of unknown character "${e.trust[0]}"`);
    if (e.trust && typeof e.trust[1] !== 'number') fail(`${where}: trust delta is not a number`);
    if (e.quest && !QUESTS[e.quest]) fail(`${where}: starts unknown quest "${e.quest}"`);
    if (e.complete && !QUESTS[e.complete]) fail(`${where}: completes unknown quest "${e.complete}"`);
    if (e.fail && !QUESTS[e.fail]) fail(`${where}: fails unknown quest "${e.fail}"`);
    if (e.step && !QUESTS[e.step[0]]) fail(`${where}: steps unknown quest "${e.step[0]}"`);
    if (e.fn && !HOOKS.has(e.fn)) fail(`${where}: calls unknown hook "${e.fn}"`);
    if (e.choice) {
      if (!setChoices.has(e.choice[0])) setChoices.set(e.choice[0], new Set());
      setChoices.get(e.choice[0]).add(e.choice[1]);
      setFlags.add(`choice:${e.choice[0]}:${e.choice[1]}`);
    }
    if (e.journal && (!e.journal[0] || !e.journal[1] || !e.journal[2])) {
      fail(`${where}: journal entry is missing id, title or text`);
    }
  }
}

function walkCondition(cond, where) {
  if (!cond) return;
  if (Array.isArray(cond)) { cond.forEach((c) => walkCondition(c, where)); return; }
  if (cond.all) cond.all.forEach((c) => walkCondition(c, where));
  if (cond.any) cond.any.forEach((c) => walkCondition(c, where));
  if (cond.not) walkCondition(cond.not, where);
  if (cond.flag) readFlags.add(cond.flag);
  if (cond.counter) readCounters.add(cond.counter[0]);
  if (cond.notFlag) readFlags.add(cond.notFlag);
  if (cond.item && !ITEMS[cond.item]) fail(`${where}: requires unknown item "${cond.item}"`);
  if (cond.noItem && !ITEMS[cond.noItem]) fail(`${where}: requires absence of unknown item "${cond.noItem}"`);
  if (cond.cap && !CAPABILITIES[cond.cap]) fail(`${where}: requires unknown capability "${cond.cap}"`);
  if (cond.trust && !CHARACTERS[cond.trust[0]]) fail(`${where}: reads trust of unknown character "${cond.trust[0]}"`);
  if (cond.trustBelow && !CHARACTERS[cond.trustBelow[0]]) fail(`${where}: reads trust of unknown character "${cond.trustBelow[0]}"`);
  if (cond.quest && !QUESTS[cond.quest[0]]) fail(`${where}: reads unknown quest "${cond.quest[0]}"`);
  if (cond.step && !QUESTS[cond.step[0]]) fail(`${where}: reads step of unknown quest "${cond.step[0]}"`);
  if (cond.chose) {
    if (!readChoices.has(cond.chose[0])) readChoices.set(cond.chose[0], new Set());
    readChoices.get(cond.chose[0]).add(cond.chose[1]);
  }
  if (cond.notChose) {
    if (!readChoices.has(cond.notChose[0])) readChoices.set(cond.notChose[0], new Set());
    readChoices.get(cond.notChose[0]).add(cond.notChose[1]);
  }
}

// ------------------------------------------------------------- dialogue -----

let nodeCount = 0;
let wordCount = 0;

for (const cid in CONVERSATIONS) {
  const c = CONVERSATIONS[cid];
  const where = `conversation "${cid}"`;
  if (!c.nodes) { fail(`${where}: has no nodes`); continue; }

  const ids = new Set(Object.keys(c.nodes));
  const entryIds = [];
  if (Array.isArray(c.entry)) {
    for (const e of c.entry) {
      walkCondition(e.if, `${where} entry`);
      if (!ids.has(e.goto)) fail(`${where}: entry goes to missing node "${e.goto}"`);
      else entryIds.push(e.goto);
    }
  }
  const startId = c.start || 'start';
  if (ids.has(startId)) entryIds.push(startId);
  else if (!entryIds.length) fail(`${where}: no start node ("${startId}" not found)`);

  walkEffects(c.onStart, `${where}.onStart`);
  walkEffects(c.onEnd, `${where}.onEnd`);

  // Reference check and reachability.
  const reachable = new Set();
  const queue = [...entryIds];
  while (queue.length) {
    const id = queue.pop();
    if (reachable.has(id)) continue;
    reachable.add(id);
    const n = c.nodes[id];
    if (!n) continue;
    const push = (target, label) => {
      if (!target || target === 'end') return;
      if (!ids.has(target)) fail(`${where} node "${id}": ${label} -> missing node "${target}"`);
      else queue.push(target);
    };
    push(n.next, 'next');
    for (const b of n.branch || []) { walkCondition(b.if, `${where} node "${id}" branch`); push(b.goto, 'branch'); }
    for (const ch of n.choices || []) {
      walkCondition(ch.if, `${where} node "${id}" choice`);
      walkEffects(ch.effects, `${where} node "${id}" choice`);
      push(ch.goto, 'choice');
      if (!ch.text) fail(`${where} node "${id}": a choice has no text`);
      if (ch.if && !ch.showLocked && ch.goto === undefined) {
        warn(`${where} node "${id}": conditional choice with no goto`);
      }
    }
    walkEffects(n.effects, `${where} node "${id}"`);
    if (!n.text && !n.next && !n.branch && !n.choices) {
      fail(`${where} node "${id}": dead end with no text and no continuation`);
    }
    if (n.text) { nodeCount++; wordCount += n.text.split(/\s+/).filter(Boolean).length; }
    if (n.speaker && n.speaker !== 'system' && n.speaker !== 'ostrowski' && !CAST[n.speaker]) {
      warn(`${where} node "${id}": speaker "${n.speaker}" is not in the cast list`);
    }
  }
  for (const id of ids) {
    if (!reachable.has(id)) fail(`${where}: node "${id}" is unreachable`);
  }
}

// --------------------------------------------------------------- quests -----

let stepCount = 0;
for (const qid in QUESTS) {
  const q = QUESTS[qid];
  const where = `quest "${qid}"`;
  if (!q.title) fail(`${where}: no title`);
  if (!q.steps || !q.steps.length) { fail(`${where}: no steps`); continue; }
  walkEffects(q.onStart, `${where}.onStart`);
  walkEffects(q.onComplete, `${where}.onComplete`);
  walkEffects(q.onFail, `${where}.onFail`);

  q.steps.forEach((s, i) => {
    stepCount++;
    const w = `${where} step ${i}`;
    if (!s.objective) fail(`${w}: no objective text`);
    walkEffects(s.onEnter, `${w}.onEnter`);
    walkEffects(s.onDone, `${w}.onDone`);
    if (s.nextIf) {
      for (const b of s.nextIf) {
        walkCondition(b.if, `${w}.nextIf`);
        if (b.goto === undefined || b.goto < 0 || b.goto >= q.steps.length) {
          fail(`${w}: nextIf branches to step ${b.goto}, which is out of range`);
        }
      }
    }
    if (!s.trigger) {
      // Allowed, but only if it is not the last step — otherwise the quest
      // completes the instant it reaches this step, which is rarely intended.
      if (i === q.steps.length - 1) warn(`${w}: last step has no trigger; the quest self-completes`);
      return;
    }
    const t = s.trigger;
    if (!TRIGGER_KINDS.has(t.kind)) fail(`${w}: unknown trigger kind "${t.kind}"`);
    walkCondition(t.if, `${w}.trigger`);
    switch (t.kind) {
      case 'reach':
        if (!t.pos && !t.at) fail(`${w}: reach trigger has neither pos nor at`);
        if (t.pos && (t.pos.length !== 2 || t.pos.some((v) => typeof v !== 'number'))) {
          fail(`${w}: reach trigger pos must be [x, z]`);
        }
        break;
      case 'talk':
        if (!t.who) fail(`${w}: talk trigger has no who`);
        else if (!CAST[t.who] && t.who !== 'garage') warn(`${w}: talk trigger names "${t.who}", not in the cast`);
        if (t.convo && !CONVERSATIONS[t.convo]) fail(`${w}: talk trigger names unknown conversation "${t.convo}"`);
        break;
      case 'interact': {
        const ids = t.ids || (t.id ? [t.id] : null);
        if (!ids) { fail(`${w}: interact trigger has no id`); break; }
        for (const id of ids) {
          if (!worldInteractionIds.has(id)) fail(`${w}: interact trigger id "${id}" is not in the world`);
        }
        break;
      }
      case 'collect':
        if (!ITEMS[t.item]) fail(`${w}: collect trigger names unknown item "${t.item}"`);
        break;
      case 'custom':
        if (!CUSTOM_IDS.has(t.id)) fail(`${w}: custom trigger "${t.id}" is never fired by the director`);
        break;
      default: break;
    }
  });
}

// -------------------------------------------------------------- endings -----

for (const e of ENDINGS) {
  walkCondition(e.condition, `ending "${e.id}"`);
  if (!e.text) fail(`ending "${e.id}": no text`);
  for (const b of e.beats || []) {
    walkCondition(b.condition, `ending "${e.id}" beat`);
    if (!b.text) fail(`ending "${e.id}": a beat has no text`);
  }
  if (e.epilogue && (!e.epilogue.told || !e.epilogue.untold)) {
    fail(`ending "${e.id}": epilogue needs both told and untold variants`);
  }
}
for (const b of EPILOGUE_BEATS) {
  walkCondition(b.condition, `epilogue beat "${b.id}"`);
  if (!b.text) fail(`epilogue beat "${b.id}": no text`);
}
// The last ending must be unconditional, or a run can end with no ending at all.
const last = ENDINGS[ENDINGS.length - 1];
const lastCond = last.condition;
const isCatchAll = lastCond && lastCond.any && lastCond.any.some((c) => Object.keys(c).length === 0);
if (!isCatchAll) fail('the final ending must be an unconditional catch-all');

// ------------------------------------------------------------ cross-check ---

// Flags read but never set are the classic content bug: a branch that can
// never be taken.
for (const f of readFlags) {
  if (!setFlags.has(f) && !ENGINE_FLAGS.has(f)) {
    fail(`flag "${f}" is required somewhere but never set by content or engine`);
  }
}

// The mirror image, and the more insidious one: a flag the game writes and
// nothing ever consults. Every one of those is a piece of recorded player
// behaviour that the story promised to remember and then threw away. A choice
// whose outcome is never read is a false choice by definition.
for (const f of setFlags) {
  if (f.startsWith('choice:')) continue;             // choices are checked below
  if (readFlags.has(f) || ENGINE_READS.has(f)) continue;
  fail(`flag "${f}" is recorded but nothing ever reads it — dead consequence`);
}
for (const f of ENGINE_FLAGS) {
  if (readFlags.has(f) || ENGINE_READS.has(f) || setFlags.has(f)) continue;
  fail(`engine flag "${f}" is set but nothing ever reads it — dead consequence`);
}

for (const [cid, opts] of readChoices) {
  const set = setChoices.get(cid);
  if (!set) { fail(`choice "${cid}" is read but never recorded`); continue; }
  for (const o of opts) {
    if (!set.has(o)) fail(`choice "${cid}" is tested for option "${o}", which is never recorded`);
  }
}
for (const [cid, opts] of setChoices) {
  const read = readChoices.get(cid);
  if (!read && !ENGINE_READS.has(cid)) {
    fail(`choice "${cid}" is offered (${[...opts].join('/')}) but its outcome is never read — false choice`);
    continue;
  }
  // Per arm. A choice whose third option changes nothing is two choices and a
  // decoration, and that is exactly what "false choice" means.
  if (read && !ENGINE_READS.has(cid)) {
    for (const o of opts) {
      if (!read.has(o)) {
        fail(`choice "${cid}" records option "${o}", which nothing ever tests — dead arm`);
      }
    }
  }
}

// Counters, both directions. A counter read but never bumped is a branch that
// can never be taken; a counter bumped but never read is a dead consequence.
// Neither was visible until now, which is how an ending beat gated on
// `deflected >= 3` shipped when the maximum reachable value is 2.
for (const c of readCounters) {
  if (!setCounters.has(c) && !ENGINE_BUMPS.has(c)) {
    fail(`counter "${c}" is read but nothing ever increments it`);
  }
}
for (const c of setCounters) {
  if (!readCounters.has(c) && !ENGINE_READS.has(c)) {
    fail(`counter "${c}" is incremented but nothing ever reads it — dead consequence`);
  }
}
for (const c of ENGINE_BUMPS) {
  if (!readCounters.has(c) && !ENGINE_READS.has(c)) {
    fail(`engine counter "${c}" is incremented but nothing ever reads it — dead consequence`);
  }
}

// A counter threshold nothing can reach is the same bug one level down: the
// branch exists, the counter exists, and the arithmetic forbids it. Count the
// distinct nodes that can bump each counter — two arms of one node are one
// increment, not two.
{
  const perCounter = new Map();
  const addSite = (counter, site) => {
    if (!perCounter.has(counter)) perCounter.set(counter, new Set());
    perCounter.get(counter).add(site);
  };
  const scanBumps = (eff, site) => {
    for (const e of (Array.isArray(eff) ? eff : [eff]).filter(Boolean)) {
      if (e.bump) addSite(Array.isArray(e.bump) ? e.bump[0] : e.bump, site);
    }
  };
  for (const cid in CONVERSATIONS) {
    for (const nid in CONVERSATIONS[cid].nodes) {
      const n = CONVERSATIONS[cid].nodes[nid];
      scanBumps(n.effects, `${cid}:${nid}`);
      // Every choice on one node is one visit, so they share a site.
      for (const ch of n.choices || []) scanBumps(ch.effects, `${cid}:${nid}`);
    }
  }
  for (const qid in QUESTS) {
    const q = QUESTS[qid];
    scanBumps(q.onStart, `${qid}:start`); scanBumps(q.onComplete, `${qid}:done`);
    q.steps.forEach((st, i) => { scanBumps(st.onEnter, `${qid}:${i}`); scanBumps(st.onDone, `${qid}:${i}`); });
  }
  const need = new Map();
  const walkThresholds = (cond) => {
    if (!cond || typeof cond !== 'object') return;
    if (Array.isArray(cond)) { cond.forEach(walkThresholds); return; }
    for (const k of ['all', 'any']) if (cond[k]) cond[k].forEach(walkThresholds);
    if (cond.not) walkThresholds(cond.not);
    if (cond.counter) {
      const [id, n] = cond.counter;
      need.set(id, Math.max(need.get(id) || 0, n));
    }
  };
  for (const e of ENDINGS) { walkThresholds(e.condition); for (const b of e.beats || []) walkThresholds(b.condition); }
  for (const b of EPILOGUE_BEATS) walkThresholds(b.condition);
  for (const cid in CONVERSATIONS) {
    for (const nid in CONVERSATIONS[cid].nodes) {
      const n = CONVERSATIONS[cid].nodes[nid];
      for (const br of n.branch || []) walkThresholds(br.if);
      for (const ch of n.choices || []) walkThresholds(ch.if);
    }
  }
  for (const [id, n] of need) {
    if (ENGINE_BUMPS.has(id)) continue;       // the engine may bump repeatedly
    const sites = perCounter.get(id);
    const max = sites ? sites.size : 0;
    if (max < n) {
      fail(`counter "${id}" is tested at >= ${n} but at most ${max} distinct beat(s) can increment it`);
    }
  }
}

// Capabilities must both be grantable and mean something. The unlock side is
// content; the effect side is code, so we look for the id in the engine source.
const GRANTED_CAPS = new Set();
const capScan = (eff) => {
  for (const e of (Array.isArray(eff) ? eff : [eff]).filter(Boolean)) if (e.cap) GRANTED_CAPS.add(e.cap);
};
for (const qid in QUESTS) {
  const q = QUESTS[qid];
  capScan(q.onStart); capScan(q.onComplete);
  for (const s of q.steps) { capScan(s.onEnter); capScan(s.onDone); }
}
for (const cid in CONVERSATIONS) {
  const c = CONVERSATIONS[cid];
  capScan(c.onStart); capScan(c.onEnd);
  for (const id in c.nodes) {
    capScan(c.nodes[id].effects);
    for (const ch of c.nodes[id].choices || []) capScan(ch.effects);
  }
}
const ENGINE_UNLOCKS = scrape(/unlock\(\s*['"](\w+)['"]/g);
const GAMEPLAY_SRC = ['src/actors/actor.js', 'src/actors/player.js', 'src/game/combat.js',
  'src/game/ai.js', 'src/game/game.js', 'src/game/director.js', 'src/world/gas.js', 'src/ui/hud.js']
  .map((p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')).join('\n');
const USED_CAPS = scrape(/can\(\s*['"](\w+)['"]/g, GAMEPLAY_SRC);
for (const id in CAPABILITIES) {
  if (!GRANTED_CAPS.has(id) && !ENGINE_UNLOCKS.has(id)) {
    fail(`capability "${id}" (${CAPABILITIES[id].name}) can never be unlocked`);
  }
  if (!USED_CAPS.has(id)) {
    fail(`capability "${id}" (${CAPABILITIES[id].name}) is unlocked but no gameplay code reads it`);
  }
}

// Conversations must be reachable from somewhere. A whole scene can be written,
// validated internally, and never once opened — which is what happened to the
// Iris re-entry: ten nodes, a comment explaining why it exists, and no caller.
{
  const DIRECTOR_SRC = readFileSync(new URL('../src/game/director.js', import.meta.url), 'utf8');
  const reachableConvos = new Set([
    ...scrape(/CONVERSATIONS\.(\w+)/g, DIRECTOR_SRC),
    // Every string literal inside convoFor(), because a return can be a
    // ternary and a regex anchored on `return '` misses one silently.
    ...scrape(/'(\w+)'/g, (() => {
      const i = DIRECTOR_SRC.indexOf('convoFor(npcId)');
      if (i < 0) return '';
      const j = DIRECTOR_SRC.indexOf('\n  }', DIRECTOR_SRC.indexOf('switch (npcId)', i));
      return DIRECTOR_SRC.slice(i, j < 0 ? undefined : j);
    })()),
    ...scrape(/convo:\s*'(\w+)'/g, DIRECTOR_SRC),
  ]);
  for (const a of Object.values(NPC_ANCHORS_FROM_SRC)) reachableConvos.add(a);
  for (const qid in QUESTS) {
    for (const st of QUESTS[qid].steps) {
      if (st.trigger && st.trigger.convo) reachableConvos.add(st.trigger.convo);
    }
  }
  for (const cid in CONVERSATIONS) {
    if (!reachableConvos.has(cid)) {
      fail(`conversation "${cid}" exists but nothing can ever start it`);
    }
  }
}

// Quests must all be startable.
const startedQuests = new Set(['arrival', 'cellarRow']);   // started by main.js
// Interactions can start quests too (an examine that opens a side thread).
for (const i of world.interactions) if (i.startsQuest) startedQuests.add(i.startsQuest);
for (const qid in QUESTS) {
  const q = QUESTS[qid];
  const scan = (eff) => {
    for (const e of (Array.isArray(eff) ? eff : [eff]).filter(Boolean)) {
      if (e.quest) startedQuests.add(e.quest);
    }
  };
  scan(q.onStart); scan(q.onComplete);
  for (const s of q.steps) { scan(s.onEnter); scan(s.onDone); }
}
for (const cid in CONVERSATIONS) {
  const c = CONVERSATIONS[cid];
  const scan = (eff) => {
    for (const e of (Array.isArray(eff) ? eff : [eff]).filter(Boolean)) if (e.quest) startedQuests.add(e.quest);
  };
  scan(c.onStart); scan(c.onEnd);
  for (const id in c.nodes) {
    const n = c.nodes[id];
    scan(n.effects);
    for (const ch of n.choices || []) scan(ch.effects);
  }
}
for (const qid in QUESTS) {
  if (!startedQuests.has(qid)) fail(`quest "${qid}" is never started by anything`);
}

// World sanity.
if (!worldSpawnIds.has('start')) fail('world has no "start" spawn');
for (const it of world.interiors || []) {
  if (it.exit && !worldSpawnIds.has(it.exit.to)) fail(`interior "${it.id}" exits to missing spawn "${it.exit.to}"`);
}
for (const i of world.interactions) {
  if (i.kind === 'door' && i.target && !worldSpawnIds.has(i.target)) {
    fail(`door "${i.id}" targets missing spawn "${i.target}"`);
  }
}
// Buildings must not overlap the streets they front onto.
for (const s of world.streets) {
  for (const b of world.buildings) {
    if (b.style === 'works' && b.id === 'hutshell') continue;
    const dx = b.x - (s.x0 + s.x1) / 2, dz = b.z - (s.z0 + s.z1) / 2;
    if (Math.hypot(dx, dz) > 120) continue;
    // Point-to-segment distance from the building centre to the street line.
    const ax = s.x1 - s.x0, az = s.z1 - s.z0;
    const len2 = ax * ax + az * az || 1;
    const t = Math.max(0, Math.min(1, ((b.x - s.x0) * ax + (b.z - s.z0) * az) / len2));
    const px = s.x0 + ax * t, pz = s.z0 + az * t;
    const d = Math.hypot(b.x - px, b.z - pz);
    const halfSpan = Math.max(b.w, b.d) / 2;
    if (d < s.width / 2 - 0.5 && d < halfSpan) {
      fail(`building "${b.id}" sits in the carriageway of the street at ` +
           `(${s.x0},${s.z0})-(${s.x1},${s.z1})`);
    }
  }
}

// ======================================================= narrative shape ====
//
// Everything below judges the story rather than the graph. It is driven by
// `docs/narrative-state.md`, which `docs/directive.md` §6 requires and
// `docs/bible.md` IMP-14 recorded as missing.
//
// The organising rule here is the one this project keeps re-learning: a check
// that inspects nothing reports success. So every rule declares what it
// scanned, refuses to pass on an empty scan, and is run against a negative
// fixture *before* the real content is judged.

const ARGV = process.argv.slice(2);
const argOf = (name) => {
  const hit = ARGV.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const LEDGER_PATH = new URL('../docs/narrative-state.md', import.meta.url);
const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

// ------------------------------------------------------------ ledger I/O ---

/**
 * Markdown tables fenced by `<!-- ledger:NAME ... -->` … `<!-- /ledger -->`.
 * Rows come back as arrays of trimmed cells, header and separator dropped.
 */
function parseLedger(md) {
  const out = new Map();
  const re = /<!--\s*ledger:([\w-]+)[^>]*-->([\s\S]*?)<!--\s*\/ledger\s*-->/g;
  let m;
  while ((m = re.exec(md))) {
    const rows = [];
    for (const line of m[2].split('\n')) {
      const t = line.trim();
      if (!t.startsWith('|')) continue;
      const cells = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;   // separator
      rows.push(cells);
    }
    if (rows.length) rows.shift();                                // header
    out.set(m[1], rows);
  }
  return out;
}

let LEDGER_MD = '';
try {
  LEDGER_MD = readFileSync(LEDGER_PATH, 'utf8');
} catch {
  fail('docs/narrative-state.md is missing — directive §6 requires it and every narrative check reads it');
}
const LEDGER = parseLedger(LEDGER_MD);

// ------------------------------------------------------- the content model --
//
// Bundled so the fixture battery can hand each rule a mutated copy without
// touching the real content.

/** Everything under src/ that is engine rather than authored content. */
const ENGINE_FILES = readdirSync(new URL('../src/', import.meta.url), { recursive: true })
  .filter((p) => typeof p === 'string' && p.endsWith('.js') && !p.replace(/\\/g, '/').startsWith('content/'))
  .sort();
const ENGINE_BY_FILE = new Map(
  ENGINE_FILES.map((p) => [`src/${p.replace(/\\/g, '/')}`,
    readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')]),
);

const STORY_SRC = readFileSync(new URL('../src/content/story.js', import.meta.url), 'utf8');

const baseModel = {
  conversations: CONVERSATIONS,
  endings: ENDINGS,
  epilogueBeats: EPILOGUE_BEATS,
  cast: CAST,
  quests: QUESTS,
  engineByFile: ENGINE_BY_FILE,
  storySrc: STORY_SRC,
  ledger: LEDGER,
  ledgerMd: LEDGER_MD,
};

/** Shallow copy with named overrides — fixtures never mutate the real objects. */
const withModel = (over) => ({ ...baseModel, ...over });

/**
 * Every string an anchor points at, whitespace-normalised and concatenated.
 * Returns null when the anchor does not resolve, which is itself a failure —
 * never a quiet pass.
 */
function anchorText(model, anchor) {
  const p = String(anchor).split(':');
  const eff = (e) => (Array.isArray(e) ? e : [e]).filter(Boolean);
  if (p[0] === 'convo') {
    const c = model.conversations[p[1]];
    const n = c && c.nodes[p[2]];
    if (!n) return null;
    const parts = [n.text || ''];
    for (const ch of n.choices || []) {
      parts.push(ch.text || '', ch.why || '');
      for (const e of eff(ch.effects)) if (e.journal) parts.push(e.journal[1] || '', e.journal[2] || '');
    }
    for (const e of eff(n.effects)) if (e.journal) parts.push(e.journal[1] || '', e.journal[2] || '');
    return norm(parts.join('  '));
  }
  if (p[0] === 'ending') {
    const e = model.endings.find((x) => x.id === p[1]);
    if (!e) return null;
    const parts = [e.text || ''];
    for (const b of e.beats || []) parts.push(b.text || '');
    if (e.epilogue) parts.push(e.epilogue.told || '', e.epilogue.untold || '');
    return norm(parts.join('  '));
  }
  if (p[0] === 'epilogue') {
    const b = model.epilogueBeats.find((x) => x.id === p[1]);
    return b ? norm(b.text || '') : null;
  }
  if (p[0] === 'cast') {
    const c = model.cast[p[1]];
    return c ? norm(c.bio || '') : null;
  }
  if (p[0] === 'quest') {
    const q = model.quests[p[1]];
    const s = q && q.steps[Number(p[2])];
    return s ? norm(s.objective || '') : null;
  }
  return null;
}

/** Every `{ trust: [...] }` the content can fire, with its authored reason. */
function trustEffects(model) {
  const out = [];
  const eff = (e, where) => {
    for (const x of (Array.isArray(e) ? e : [e]).filter(Boolean)) {
      if (x.trust) out.push({ where, who: x.trust[0], delta: x.trust[1], reason: x.trust[2] });
    }
  };
  for (const cid in model.conversations) {
    const c = model.conversations[cid];
    eff(c.onStart, `convo:${cid}:onStart`); eff(c.onEnd, `convo:${cid}:onEnd`);
    for (const nid in c.nodes) {
      const n = c.nodes[nid];
      eff(n.effects, `convo:${cid}:${nid}`);
      for (const ch of n.choices || []) eff(ch.effects, `convo:${cid}:${nid}`);
    }
  }
  for (const qid in model.quests) {
    const q = model.quests[qid];
    eff(q.onStart, `quest:${qid}:start`); eff(q.onComplete, `quest:${qid}:done`);
    eff(q.onFail, `quest:${qid}:fail`);
    q.steps.forEach((s, i) => { eff(s.onEnter, `quest:${qid}:${i}`); eff(s.onDone, `quest:${qid}:${i}`); });
  }
  return out;
}

/**
 * Multi-arm choices, each arm carrying the flags set alongside it and whether
 * the option that records it is itself gated.
 */
function choiceGroups(model) {
  const groups = new Map();
  const armOf = (cid, opt) => {
    if (!groups.has(cid)) groups.set(cid, new Map());
    if (!groups.get(cid).has(opt)) groups.get(cid).set(opt, { opt, flags: new Set(), sites: [], gated: false });
    return groups.get(cid).get(opt);
  };
  const scan = (effects, where, guard) => {
    const list = (Array.isArray(effects) ? effects : [effects]).filter(Boolean);
    const choice = list.find((e) => e.choice);
    if (!choice) return;
    const arm = armOf(choice.choice[0], choice.choice[1]);
    arm.sites.push(where);
    if (guard) arm.gated = true;
    for (const e of list) if (e.flag) arm.flags.add(e.flag);
  };
  for (const cid in model.conversations) {
    const c = model.conversations[cid];
    for (const nid in c.nodes) {
      const n = c.nodes[nid];
      scan(n.effects, `convo:${cid}:${nid}`, false);
      for (const ch of n.choices || []) scan(ch.effects, `convo:${cid}:${nid}`, Boolean(ch.if));
    }
  }
  for (const qid in model.quests) {
    const q = model.quests[qid];
    q.steps.forEach((s, i) => { scan(s.onEnter, `quest:${qid}:${i}`, false); scan(s.onDone, `quest:${qid}:${i}`, false); });
  }
  return groups;
}

/** Flags an engine file reads, by `state.has` / `S.has` / `chose` / `count`. */
function engineReadsFlag(src, flag) {
  const q = flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`['"\`]${q}['"\`]`).test(src);
}

/** A class method body, from `\n  name(` to the next 2-space-indented brace. */
function sliceMethod(src, name) {
  const i = src.indexOf(`\n  ${name}(`);
  if (i < 0) return null;
  const j = src.indexOf('\n  }\n', i);
  return j < 0 ? src.slice(i) : src.slice(i, j + 4);
}

/** Every 2-space-indented method in a file, as {name, body}. */
function methodRegions(src) {
  const out = [];
  const re = /\n {2}(?:async )?([A-Za-z_$][\w$]*)\(/g;
  let m;
  while ((m = re.exec(src))) {
    const j = src.indexOf('\n  }\n', m.index);
    out.push({ name: m[1], body: j < 0 ? src.slice(m.index) : src.slice(m.index, j + 4) });
  }
  return out;
}

/** Flag set/read sites, for the generated table in the ledger. */
function flagSites(model) {
  const sets = new Map(); const reads = new Map();
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
  const eff = (e, site) => {
    for (const x of (Array.isArray(e) ? e : [e]).filter(Boolean)) {
      if (x.flag) add(sets, x.flag, site);
      if (x.unflag) { add(sets, x.unflag, site); add(reads, x.unflag, site); }
    }
  };
  const cond = (c, site) => {
    if (!c) return;
    if (Array.isArray(c)) { c.forEach((x) => cond(x, site)); return; }
    if (c.all) c.all.forEach((x) => cond(x, site));
    if (c.any) c.any.forEach((x) => cond(x, site));
    if (c.not) cond(c.not, site);
    if (c.flag) add(reads, c.flag, site);
    if (c.notFlag) add(reads, c.notFlag, site);
  };
  for (const cid in model.conversations) {
    const c = model.conversations[cid];
    eff(c.onStart, `convo:${cid}:onStart`); eff(c.onEnd, `convo:${cid}:onEnd`);
    for (const e of c.entry || []) cond(e.if, `convo:${cid}:entry`);
    for (const nid in c.nodes) {
      const n = c.nodes[nid]; const s = `convo:${cid}:${nid}`;
      eff(n.effects, s);
      for (const b of n.branch || []) cond(b.if, s);
      for (const ch of n.choices || []) { cond(ch.if, s); eff(ch.effects, s); }
    }
  }
  for (const qid in model.quests) {
    const q = model.quests[qid];
    eff(q.onStart, `quest:${qid}:start`); eff(q.onComplete, `quest:${qid}:done`);
    q.steps.forEach((st, i) => {
      eff(st.onEnter, `quest:${qid}:${i}`); eff(st.onDone, `quest:${qid}:${i}`);
      if (st.trigger) cond(st.trigger.if, `quest:${qid}:${i}`);
      for (const b of st.nextIf || []) cond(b.if, `quest:${qid}:${i}`);
    });
  }
  for (const e of model.endings) {
    cond(e.condition, `ending:${e.id}`);
    for (const b of e.beats || []) cond(b.condition, `ending:${e.id}:beat`);
  }
  for (const b of model.epilogueBeats) cond(b.condition, `epilogue:${b.id}`);
  for (const [file, src] of model.engineByFile) {
    for (const k of [...sets.keys(), ...reads.keys()]) {
      if (engineReadsFlag(src, k)) add(reads, k, `ENGINE ${file}`);
    }
    let m;
    const setRe = /(?:state|S|this\.state)\.set\(\s*['"]([\w.]+)['"]/g;
    while ((m = setRe.exec(src))) add(sets, m[1], `ENGINE ${file}`);
  }
  return { sets, reads };
}

function renderFlagTable(model) {
  const { sets, reads } = flagSites(model);
  const keys = [...new Set([...sets.keys(), ...reads.keys()])].sort();
  const cell = (s) => (s && s.size ? [...s].sort().join('<br>') : '—');
  const lines = ['| フラグ | 設定箇所 | 参照箇所 |', '|---|---|---|'];
  for (const k of keys) lines.push(`| \`${k}\` | ${cell(sets.get(k))} | ${cell(reads.get(k))} |`);
  return lines.join('\n');
}

// -------------------------------------------------------------- the rules --
//
// Each rule is a pure function of the model. `out.fail` records a finding,
// `out.scanned` records how much it actually looked at — a rule that scanned
// nothing fails rather than passes.

const num = (s) => {
  const v = Number(String(s).replace(/,/g, ''));
  return Number.isFinite(v) ? v : null;
};

function worldLedger(model) {
  const vals = new Map();
  for (const r of model.ledger.get('world') || []) {
    const v = num(r[1]);
    if (v !== null) vals.set(r[0], { value: v, unit: r[2], anchor: r[3], quote: r[4] });
  }
  const assume = new Map();
  for (const r of model.ledger.get('world-assumptions') || []) {
    const v = num(r[1]);
    if (v !== null) assume.set(r[0], v);
  }
  return { vals, assume };
}

const RULES = [];
const rule = (id, imp, title, run) => RULES.push({ id, imp, title, run });

rule('N-FORESHADOW-ANCHOR', 'IMP-14', '伏線台帳の各行が本文に実在する', (m, out) => {
  const rows = m.ledger.get('foreshadow') || [];
  out.scanned(rows.length * 2);
  for (const [id, pa, pq, ra, rq] of rows) {
    for (const [side, a, q] of [['提示', pa, pq], ['回収', ra, rq]]) {
      if (a === '—' || a === '') continue;
      const text = anchorText(m, a);
      if (text === null) { out.fail(`foreshadow "${id}": ${side}アンカー ${a} が本文に存在しない`); continue; }
      if (!text.includes(norm(q))) out.fail(`foreshadow "${id}": ${side}の語が ${a} に無い — 「${norm(q).slice(0, 48)}」`);
    }
  }
});

rule('N-FORESHADOW-PAYOFF', 'IMP-14', '提示された伏線がすべて回収される', (m, out) => {
  const rows = m.ledger.get('foreshadow') || [];
  out.scanned(rows.length);
  for (const [id, , , ra] of rows) {
    if (!ra || ra === '—') out.fail(`foreshadow "${id}": 提示されたが回収アンカーが無い — 未回収`);
  }
});

rule('N-ENDING-UNCONDITIONAL', 'IMP-01', '結末が無条件のタップ1回で確定しない', (m, out) => {
  const groups = choiceGroups(m);
  out.scanned(m.endings.length);
  for (const e of m.endings) {
    const terms = [];
    const walk = (c) => {
      if (!c || typeof c !== 'object') return;
      if (Array.isArray(c)) { c.forEach(walk); return; }
      if (c.all) { c.all.forEach(walk); return; }
      if (c.any) { c.any.forEach(walk); return; }
      terms.push(c);
    };
    walk(e.condition);
    const real = terms.filter((t) => Object.keys(t).length);
    if (!real.length) continue;                       // the catch-all, checked elsewhere
    const others = real.filter((t) => !t.chose);
    if (others.length) continue;                      // gated by accumulated state
    const gatedArms = real.filter((t) => {
      const arm = groups.get(t.chose[0]) && groups.get(t.chose[0]).get(t.chose[1]);
      if (!arm) { out.fail(`ending "${e.id}": condition names choice ${t.chose[0]}/${t.chose[1]}, which nothing records`); return true; }
      return arm.gated;
    });
    if (!gatedArms.length) {
      out.fail(`ending "${e.id}": 到達条件が無条件の最終選択のみ — 蓄積された状態を一切読まない`);
    }
  }
});

// A branch that consults some arms of a three-way choice and not the others
// has already decided what the missing arms mean: they become the else. This
// is site-level, not file-level — `director.js` reads all three vents flags
// somewhere, and still folds two of them together inside `_beginCrisis`.
rule('N-CHOICE-ARM-COLLAPSE', 'IMP-11', '分岐を読む地点が一部の分岐だけを見ていない', (m, out) => {
  const groups = choiceGroups(m);
  let scanned = 0;
  for (const [file, src] of m.engineByFile) {
    for (const region of methodRegions(src)) {
      for (const [cid, arms] of groups) {
        if (arms.size < 3) continue;
        if (![...arms.values()].some((a) => a.flags.size)) continue;
        scanned++;
        const read = [...arms].filter(([, a]) => [...a.flags].some((f) => engineReadsFlag(region.body, f)))
          .map(([opt]) => opt);
        if (read.length && read.length < arms.size) {
          const blind = [...arms.keys()].filter((o) => !read.includes(o));
          out.fail(`choice "${cid}": ${file}::${region.name} は ${read.join('/')} だけを読み ` +
                   `${blind.join('/')} を見ない — ${arms.size}択がここで ${read.length + 1}択に潰れる`);
        }
      }
    }
  }
  out.scanned(scanned);
});

rule('N-CHOICE-MAJOR-SITE', 'IMP-11', '宣言された主要帰結地点で全分岐が判別される', (m, out) => {
  const rows = m.ledger.get('choices') || [];
  const groups = choiceGroups(m);
  let scanned = 0;
  for (const [cid, , flagSpec, siteSpec] of rows) {
    const flags = String(flagSpec).split('/').map((s) => s.trim()).filter(Boolean);
    if (!groups.has(cid)) { out.fail(`choices ledger: 選択 "${cid}" が本文に存在しない`); continue; }
    const declared = new Set(flags);
    const actual = new Set([...groups.get(cid).values()].flatMap((a) => [...a.flags]));
    for (const f of declared) if (!actual.has(f)) out.fail(`choices ledger: "${cid}" の分岐フラグ ${f} を本文が設定しない`);
    for (const site of String(siteSpec).split(',').map((s) => s.trim()).filter(Boolean)) {
      const [file, method] = site.split('::');
      const src = m.engineByFile.get(file);
      if (!src) { out.fail(`choices ledger: 主要帰結地点のファイル ${file} が無い`); continue; }
      const body = method ? sliceMethod(src, method) : src;
      if (!body || body.length < 80) { out.fail(`choices ledger: ${site} の本体を取り出せない（計測器側の故障）`); continue; }
      for (const f of flags) {
        scanned++;
        if (!engineReadsFlag(body, f)) out.fail(`choice "${cid}": 分岐 ${f} が主要帰結地点 ${site} に現れない — そこで既定値に潰れている`);
      }
    }
  }
  out.scanned(scanned);
});

rule('W-ANCHOR', 'IMP-12/13/15/17', '数値台帳の典拠がすべて本文に実在する', (m, out) => {
  const { vals } = worldLedger(m);
  out.scanned(vals.size);
  for (const [k, v] of vals) {
    const text = anchorText(m, v.anchor);
    if (text === null) { out.fail(`world ledger "${k}": アンカー ${v.anchor} が本文に存在しない`); continue; }
    if (!text.includes(norm(v.quote))) out.fail(`world ledger "${k}": 典拠の語が ${v.anchor} に無い — 「${norm(v.quote).slice(0, 48)}」`);
  }
});

rule('W-HOUSEHOLD-SIZE', 'IMP-13', '移転世帯数が残存人口と両立する', (m, out) => {
  const { vals, assume } = worldLedger(m);
  const h = vals.get('westward_households'); const p = vals.get('population_remaining');
  const size = assume.get('household_size_min');
  if (!h || !p || size == null) { out.fail('W-HOUSEHOLD-SIZE: 必要な台帳の行が無い'); return; }
  out.scanned(3);
  const needed = h.value * size;
  out.metric('impliedPeopleForWestwardHouseholds', Number(needed.toFixed(1)));
  out.metric('peoplePerHouseholdImplied', Number((p.value / h.value).toFixed(3)));
  if (needed > p.value) {
    out.fail(`W-HOUSEHOLD-SIZE: ${h.value}世帯には最低 ${needed.toFixed(0)}人 要るが残存人口は ${p.value}人 ` +
             `（世帯あたり ${(p.value / h.value).toFixed(2)}人）`);
  }
});

rule('W-DURATION', 'IMP-13', '宣言された年数が本文の移転速度と一致する', (m, out) => {
  const { vals, assume } = worldLedger(m);
  const q3 = vals.get('westward_first_three_quarters');
  const h = vals.get('westward_households'); const y = vals.get('westward_years');
  const tol = assume.get('duration_tolerance');
  if (!q3 || !h || !y || tol == null) { out.fail('W-DURATION: 必要な台帳の行が無い'); return; }
  out.scanned(3);
  const perQuarter = q3.value / 3;
  const years = h.value / perQuarter / 4;
  out.metric('westwardImpliedYears', Number(years.toFixed(2)));
  if (Math.abs(years - y.value) / y.value > tol) {
    out.fail(`W-DURATION: 本文の速度（${perQuarter.toFixed(1)}世帯/四半期）では ${h.value}世帯に ` +
             `${years.toFixed(1)}年 しかかからないが、本文は ${y.value}年 と書く`);
  }
});

rule('W-EVAC-RATE', 'IMP-12', '退去の速度が世界の制約を無言で無効化しない', (m, out) => {
  const { vals, assume } = worldLedger(m);
  const p = vals.get('population_remaining'); const d = vals.get('evacuation_days');
  const r = vals.get('relocation_rate');
  const size = assume.get('household_size_min'); const qd = assume.get('quarter_days');
  const maxUp = assume.get('evacuation_speedup_max');
  if (!p || !d || !r || size == null || qd == null || maxUp == null) { out.fail('W-EVAC-RATE: 必要な台帳の行が無い'); return; }
  out.scanned(4);
  const evac = p.value / d.value;                 // people per day
  const canonical = (r.value * size) / qd;        // people per day
  const ratio = evac / canonical;
  out.metric('evacuationPeoplePerDay', Number(evac.toFixed(2)));
  out.metric('canonicalPeoplePerDay', Number(canonical.toFixed(3)));
  out.metric('evacuationSpeedup', Number(ratio.toFixed(1)));
  if (ratio > maxUp) {
    out.fail(`W-EVAC-RATE: 退去は ${evac.toFixed(1)}人/日 で、公式の移転 ${canonical.toFixed(2)}人/日 の ` +
             `${ratio.toFixed(0)}倍。許容は ${maxUp}倍で、本文に説明が無い`);
  }
});

rule('W-COLLISION', 'IMP-15', '同じ数字が別々の量に使われるなら本文が結ぶ', (m, out) => {
  const { vals, assume } = worldLedger(m);
  const floor = assume.get('collision_min_value');
  if (floor == null) { out.fail('W-COLLISION: 台帳に collision_min_value が無い'); return; }
  const byValue = new Map();
  for (const [k, v] of vals) {
    if (v.value < floor) continue;      // small numbers repeat by chance, not by method
    if (!byValue.has(v.value)) byValue.set(v.value, []);
    byValue.get(v.value).push({ k, ...v });
  }
  out.scanned(vals.size);
  out.metric('collisionCandidatePairs', [...byValue.values()].filter((l) => l.length > 1).length);
  for (const [value, list] of byValue) {
    const units = new Set(list.map((x) => x.unit));
    if (list.length < 2 || units.size < 2) continue;
    // A reconciliation is a single passage that carries both quotes.
    const joined = list.map((x) => anchorText(m, x.anchor));
    const everywhere = [
      ...Object.keys(m.conversations).flatMap((cid) => Object.keys(m.conversations[cid].nodes).map((nid) => `convo:${cid}:${nid}`)),
      ...m.endings.map((e) => `ending:${e.id}`),
      ...m.epilogueBeats.map((b) => `epilogue:${b.id}`),
    ];
    const reconciled = everywhere.some((a) => {
      const t = anchorText(m, a);
      return t && list.every((x) => t.includes(norm(x.quote)));
    });
    if (!reconciled && joined.every(Boolean)) {
      out.fail(`W-COLLISION: 値 ${value} が ${list.map((x) => `${x.k}(${x.unit})`).join(' と ')} の両方に使われ、` +
               `両者を結ぶ本文がどこにも無い`);
    }
  }
});

rule('W-CAREER', 'IMP-17', '経歴の算術が年齢と合う', (m, out) => {
  const { vals, assume } = worldLedger(m);
  const start = vals.get('ren_rescue_training_age'); const a = vals.get('ren_rescue_years');
  const b = vals.get('ren_survey_years'); const age = vals.get('ren_age');
  const left = vals.get('ren_left_months_ago'); const tol = assume.get('career_tolerance_years');
  if (!start || !a || !b || !age || !left || tol == null) { out.fail('W-CAREER: 必要な台帳の行が無い'); return; }
  out.scanned(5);
  const career = start.value + a.value + b.value;
  const atDeparture = age.value - left.value / 12;
  const gap = atDeparture - career;
  out.metric('renCareerEndsAtAge', career);
  out.metric('renAgeAtDeparture', Number(atDeparture.toFixed(2)));
  out.metric('renCareerGapYears', Number(gap.toFixed(2)));
  if (Math.abs(gap) > tol) {
    out.fail(`W-CAREER: 経歴の合計は ${career}歳 で終わるが、離脱は ${atDeparture.toFixed(1)}歳 — ` +
             `${gap.toFixed(1)}年 の空白`);
  }
});

rule('W-RULE-PARITY', 'IMP-12/13/15/17', '台帳の規則一覧と実装の規則idが一致する', (m, out) => {
  const rows = m.ledger.get('world-rules') || [];
  const documented = new Set(rows.map((r) => r[0]));
  const implemented = new Set(RULES.filter((r) => r.id.startsWith('W-') && r.id !== 'W-RULE-PARITY').map((r) => r.id));
  out.scanned(documented.size + implemented.size);
  for (const id of implemented) if (!documented.has(id)) out.fail(`規則 ${id} が実装されているのに docs/narrative-state.md §4c に無い`);
  for (const id of documented) if (!implemented.has(id)) out.fail(`規則 ${id} が台帳にあるのに実装が無い`);
});

rule('N-FEEDBACK-RATIO', 'IMP-02', '信頼変動の可視化が少数にとどまる', (m, out) => {
  const rows = m.ledger.get('feedback') || [];
  const row = rows.find((r) => r[0] === 'visible_trust_ratio');
  const max = row ? num(row[1]) : null;
  if (max == null) { out.fail('N-FEEDBACK-RATIO: 台帳に visible_trust_ratio の閾値が無い'); return; }
  const eff = trustEffects(m);
  out.scanned(eff.length);
  const visible = eff.filter((e) => e.reason && e.reason !== QUIET);
  const ratio = eff.length ? visible.length / eff.length : 0;
  out.metric('trustEffects', eff.length);
  out.metric('trustEffectsVisible', visible.length);
  out.metric('trustEffectsQuiet', eff.filter((e) => e.reason === QUIET).length);
  out.metric('visibleTrustRatio', Number(ratio.toFixed(3)));
  if (ratio > max) {
    out.fail(`N-FEEDBACK-RATIO: 信頼変動 ${eff.length}件中 ${visible.length}件が可視トースト ` +
             `（比 ${ratio.toFixed(3)} > 閾値 ${max}）`);
  }
});

rule('N-FEEDBACK-FORBIDDEN', 'IMP-02', '設計コメントが禁じた文字列が可視化されない', (m, out) => {
  const i = m.storySrc.indexOf('Reason sentinel for a trust change');
  const block = i < 0 ? '' : m.storySrc.slice(i, m.storySrc.indexOf('*/', i));
  const forbidden = [...block.matchAll(/"([^"]{8,})"/g)].map((x) => norm(x[1]));
  if (!forbidden.length) { out.fail('N-FEEDBACK-FORBIDDEN: QUIET の設計コメントから禁止文字列を1つも抽出できない（計測器側の故障）'); return; }
  const eff = trustEffects(m);
  out.scanned(eff.length * forbidden.length);
  out.metric('forbiddenPhrases', forbidden.length);
  for (const e of eff) {
    if (!e.reason || e.reason === QUIET) continue;
    for (const f of forbidden) {
      if (norm(e.reason).includes(f)) {
        out.fail(`N-FEEDBACK-FORBIDDEN: ${e.where} が「${f}」を QUIET なしで発火する — ` +
                 `同じファイルの設計コメントが名指しで禁じた文字列`);
      }
    }
  }
});

rule('N-FLAG-LEDGER', 'IMP-14', '自動生成のフラグ対応表が最新である', (m, out) => {
  const want = renderFlagTable(m);
  const re = /<!--\s*ledger:flags[^>]*-->([\s\S]*?)<!--\s*\/ledger\s*-->/;
  const hit = re.exec(m.ledgerMd);
  out.scanned(want.split('\n').length - 2);
  if (!hit) { out.fail('N-FLAG-LEDGER: docs/narrative-state.md に flags 表の枠が無い'); return; }
  if (norm(hit[1]) !== norm(want)) {
    out.fail('N-FLAG-LEDGER: フラグ対応表が本文とずれている — `node tools/validate.mjs --write-ledger` で再生成する');
  }
});

// ---------------------------------------------------------- the apparatus --
//
// Fixtures. Each rule must be shown to fire on a broken input and to stay
// silent on a repaired one, on every run, before anything real is judged.
// "Nothing found, therefore pass" is the failure mode this exists to stop.

function runRule(r, model) {
  const findings = []; const metrics = {}; let scanned = null;
  r.run(model, {
    fail: (m) => findings.push(m),
    scanned: (n) => { scanned = n; },
    metric: (k, v) => { metrics[k] = v; },
  });
  if (scanned === null) findings.push(`${r.id}: 何を検査したか申告していない（計測器側の故障）`);
  else if (scanned < 1) findings.push(`${r.id}: 検査対象が0件 — 空の入力に合格を出すことは許されない`);
  return { findings, metrics, scanned };
}

const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

/** Ledger copies are cheap: arrays of strings. */
function ledgerWith(model, name, rows) {
  const next = new Map(model.ledger);
  next.set(name, rows);
  return withModel({ ledger: next });
}
function ledgerEdit(model, name, fn) {
  const rows = clone(model.ledger.get(name) || []);
  return ledgerWith(model, name, fn(rows) || rows);
}

/** `_beginCrisis` as it would read if the three-way vents choice were honoured. */
function ventsRepaired(m) {
  const patched = new Map([...m.engineByFile].map(([f, s]) => [f, f === 'src/game/director.js'
    ? s.replace("const shut = this.state.has('vents_shut');",
      "const shut = this.state.has('vents_shut');\n    const half = this.state.has('vents_half');\n" +
      "    const left = this.state.has('vents_left');")
    : s]));
  if (patched.get('src/game/director.js') === m.engineByFile.get('src/game/director.js')) {
    // The line the fixture edits has moved. Say so rather than quietly
    // producing a "positive" that is just the unmodified defect.
    fail('apparatus: vents fixture no longer matches src/game/director.js — the positive control is not being applied');
  }
  return withModel({ engineByFile: patched });
}

const FIXTURES = {
  'N-FORESHADOW-ANCHOR': {
    negative: (m) => ledgerEdit(m, 'foreshadow', (r) => { r[0][2] = 'a sentence that is not in this game'; }),
    positive: (m) => m,
  },
  'N-FORESHADOW-PAYOFF': {
    negative: (m) => ledgerEdit(m, 'foreshadow', (r) => { r[0][3] = '—'; r[0][4] = '—'; }),
    positive: (m) => ledgerEdit(m, 'foreshadow', (r) => r.filter((row) => row[3] && row[3] !== '—')),
  },
  'N-ENDING-UNCONDITIONAL': {
    negative: (m) => {
      const endings = clone(m.endings);
      for (const e of endings) e.condition = { all: [{ chose: ['final', 'publish'] }] };
      return withModel({ endings });
    },
    positive: (m) => {
      const endings = clone(m.endings);
      for (const e of endings) e.condition = { all: [{ chose: ['final', 'publish'] }, { flag: 'krajcik_open' }] };
      return withModel({ endings });
    },
  },
  'N-CHOICE-ARM-COLLAPSE': { negative: (m) => m, positive: (m) => ventsRepaired(m) },
  'N-CHOICE-MAJOR-SITE': { negative: (m) => m, positive: (m) => ventsRepaired(m) },
  'W-ANCHOR': {
    negative: (m) => ledgerEdit(m, 'world', (r) => { r[0][4] = 'a quotation that appears nowhere'; }),
    positive: (m) => m,
  },
  'W-HOUSEHOLD-SIZE': {
    negative: (m) => m,
    positive: (m) => ledgerEdit(m, 'world', (r) => {
      for (const row of r) if (row[0] === 'westward_households') row[1] = '150';
    }),
  },
  'W-DURATION': {
    negative: (m) => m,
    positive: (m) => ledgerEdit(m, 'world', (r) => {
      for (const row of r) {
        if (row[0] === 'westward_households') row[1] = '150';
        if (row[0] === 'westward_first_three_quarters') row[1] = '10';
        if (row[0] === 'westward_years') row[1] = '11';
      }
    }),
  },
  'W-EVAC-RATE': {
    negative: (m) => m,
    positive: (m) => ledgerEdit(m, 'world', (r) => {
      for (const row of r) if (row[0] === 'evacuation_days') row[1] = '740';
    }),
  },
  'W-COLLISION': {
    negative: (m) => m,
    positive: (m) => ledgerEdit(m, 'world', (r) => {
      for (const row of r) if (row[0] === 'borehole_9_3_temperature') row[1] = '412';
    }),
  },
  'W-CAREER': {
    negative: (m) => m,
    positive: (m) => ledgerEdit(m, 'world', (r) => {
      for (const row of r) if (row[0] === 'ren_rescue_years') row[1] = '12.5';
    }),
  },
  'W-RULE-PARITY': {
    negative: (m) => ledgerEdit(m, 'world-rules', (r) => r.slice(1)),
    positive: (m) => m,
  },
  'N-FEEDBACK-RATIO': {
    negative: (m) => m,
    positive: (m) => {
      const conversations = clone(m.conversations);
      const q = (e) => { if (e && e.trust && e.trust[2] && e.trust[2] !== QUIET) e.trust[2] = QUIET; };
      for (const cid in conversations) for (const nid in conversations[cid].nodes) {
        const n = conversations[cid].nodes[nid];
        for (const e of (Array.isArray(n.effects) ? n.effects : [n.effects]).filter(Boolean)) q(e);
        for (const ch of n.choices || []) for (const e of (Array.isArray(ch.effects) ? ch.effects : [ch.effects]).filter(Boolean)) q(e);
      }
      return withModel({ conversations });
    },
  },
  'N-FEEDBACK-FORBIDDEN': {
    negative: (m) => m,
    positive: (m) => {
      const conversations = clone(m.conversations);
      for (const cid in conversations) for (const nid in conversations[cid].nodes) {
        for (const ch of conversations[cid].nodes[nid].choices || []) {
          for (const e of (Array.isArray(ch.effects) ? ch.effects : [ch.effects]).filter(Boolean)) {
            if (e.trust && e.trust[2] && norm(e.trust[2]).includes('She knows what you are now')) e.trust[2] = QUIET;
          }
        }
      }
      return withModel({ conversations });
    },
  },
  'N-FLAG-LEDGER': {
    negative: (m) => withModel({ ledgerMd: m.ledgerMd.replace(
      /(<!--\s*ledger:flags[^>]*-->)[\s\S]*?(<!--\s*\/ledger\s*-->)/,
      '$1\n\n| フラグ | 設定箇所 | 参照箇所 |\n|---|---|---|\n| `stale` | nowhere | nowhere |\n\n$2') }),
    positive: (m) => withModel({ ledgerMd: m.ledgerMd.replace(
      /(<!--\s*ledger:flags[^>]*-->)[\s\S]*?(<!--\s*\/ledger\s*-->)/,
      (_all, open, close) => `${open}\n\n${renderFlagTable(m)}\n\n${close}`) }),
  },
};

/**
 * The battery. Runs before the real judgement and gates it: if a rule cannot
 * be made to fail, nothing it says about the real content means anything.
 */
function runBattery() {
  const results = [];
  for (const r of RULES) {
    const f = FIXTURES[r.id];
    if (!f || (!f.negative && !f.positive)) { results.push({ id: r.id, skipped: true }); continue; }
    const neg = runRule(r, f.negative(baseModel));
    const pos = runRule(r, f.positive(baseModel));
    const ok = neg.findings.length > 0 && pos.findings.length === 0;
    results.push({
      id: r.id, imp: r.imp, ok,
      negativeFindings: neg.findings.length,
      positiveFindings: pos.findings.length,
      scanned: neg.scanned,
      positiveDetail: pos.findings.slice(0, 3),
    });
  }
  return results;
}

const battery = runBattery();
for (const b of battery) {
  if (b.skipped) continue;
  if (!b.ok) {
    fail(`apparatus: 規則 ${b.id} は負例で ${b.negativeFindings}件 / 良例で ${b.positiveFindings}件 — ` +
         `負例で落ちない、または良例で落ちる規則は判定に使えない` +
         (b.positiveDetail.length ? ` [${b.positiveDetail[0]}]` : ''));
  }
}

// ------------------------------------------------------ judge the content --

const narrative = [];
const narrativeMetrics = {};
let narrativeScanned = 0;
for (const r of RULES) {
  const res = runRule(r, baseModel);
  narrativeScanned += res.scanned || 0;
  Object.assign(narrativeMetrics, res.metrics);
  for (const f of res.findings) {
    narrative.push({ rule: r.id, imp: r.imp, message: f });
    fail(`[${r.id} / ${r.imp}] ${f}`);
  }
}

// ---------------------------------------------------------------- evidence --
//
// Numbers, verdicts and the conditions they were taken under, written where a
// third party can read them without running anything. R-19 / GB-VISUAL-EVIDENCE.

const evidencePath = argOf('evidence');
if (evidencePath) {
  const sha = (s) => createHash('sha256').update(s).digest('hex');
  const record = {
    schema_version: 1,
    artifact: 'GB-NARRATIVE-STRUCTURE',
    purpose: 'Machine-checked narrative-shape verdicts for docs/benchmarks.md BM-NAR-03 / BM-CNS-01 / BM-CNS-03 and docs/bible.md IMP-01/02/11/12/13/14/15/17.',
    generated_at: new Date().toISOString(),
    environment: {
      node: process.version,
      browser: null,
      real_device: false,
      device_claim: 'NONE. This is a static analysis of the story data in Node. It says nothing about how anything looks, feels or performs.',
      command: 'node tools/validate.mjs --evidence=AI_DEVELOPMENT/EVIDENCE/GB-NARRATIVE-STRUCTURE.json',
    },
    binding: {
      'src/content/story.js': sha(STORY_SRC),
      'docs/narrative-state.md': sha(LEDGER_MD),
      'tools/validate.mjs': sha(readFileSync(new URL(import.meta.url), 'utf8')),
      'src/game/director.js': sha(ENGINE_BY_FILE.get('src/game/director.js') || ''),
    },
    apparatus: {
      note: 'Every rule is run against a negative fixture and a positive fixture before the real content is judged. A rule that cannot be made to fail is reported as an apparatus fault and invalidates the run.',
      rules: battery.length,
      proven: battery.filter((b) => b.ok).length,
      results: battery,
    },
    scanned: narrativeScanned,
    metrics: narrativeMetrics,
    verdicts: RULES.map((r) => ({
      rule: r.id,
      imp: r.imp,
      title: r.title,
      pass: !narrative.some((n) => n.rule === r.id),
      findings: narrative.filter((n) => n.rule === r.id).map((n) => n.message),
    })),
    content_stats: null,          // filled in below, once the counters are final
    limitations: [
      'Static analysis only. No browser, no build, no play.',
      'The thresholds in docs/narrative-state.md §4b and §5 are declared policy, not measurements. Changing them changes the verdict and the change is visible in the diff.',
      'W-COLLISION only considers values at or above collision_min_value; small numbers repeat by chance.',
      'This says nothing about prose quality, voice, or whether a Japanese reader finds the text natural.',
    ],
  };
  globalThis.__cinderlineEvidence = { path: evidencePath, record };
}

if (ARGV.includes('--write-ledger')) {
  // Never regenerate from a broken instrument: a table written by an apparatus
  // that cannot fail would then become the thing everything else is checked
  // against.
  const broken = battery.filter((b) => !b.skipped && !b.ok);
  if (broken.length) {
    console.error(`refusing to regenerate: ${broken.length} rule(s) did not behave on their fixtures — ${broken.map((b) => b.id).join(', ')}`);
    process.exit(1);
  }
  const table = renderFlagTable(baseModel);
  const next = LEDGER_MD.replace(/(<!--\s*ledger:flags[^>]*-->)[\s\S]*?(<!--\s*\/ledger\s*-->)/,
    `$1\n\n${table}\n\n$2`);
  writeFileSync(LEDGER_PATH, next);
  console.log('docs/narrative-state.md: フラグ対応表を再生成した');
  process.exit(0);
}

if (ARGV.includes('--selftest')) {
  console.log('narrative rule battery');
  console.log('─'.repeat(58));
  let bad = 0;
  for (const b of battery) {
    if (b.skipped) { console.log(`  – ${b.id.padEnd(26)} fixture 無し（ファイル比較のため）`); continue; }
    if (!b.ok) bad++;
    console.log(`  ${b.ok ? '✓' : '✗'} ${b.id.padEnd(26)} 負例 ${String(b.negativeFindings).padStart(2)}件 / ` +
                `良例 ${String(b.positiveFindings).padStart(2)}件 / 走査 ${b.scanned}`);
  }
  console.log('─'.repeat(58));
  console.log(bad ? `\n${bad} 規則が負例で落ちない — BATTERY FAILED` : '\nBATTERY OK');
  process.exit(bad ? 1 : 0);
}

// ------------------------------------------------------------------ report --

const stats = {
  conversations: Object.keys(CONVERSATIONS).length,
  dialogueNodes: nodeCount,
  dialogueWords: wordCount,
  quests: Object.keys(QUESTS).length,
  questSteps: stepCount,
  endings: ENDINGS.length,
  epilogueBeats: EPILOGUE_BEATS.length,
  items: Object.keys(ITEMS).length,
  capabilities: Object.keys(CAPABILITIES).length,
  buildings: world.buildings.length,
  props: world.props.length,
  structures: world.structures.length,
  interiors: (world.interiors || []).length,
  interactions: worldInteractionIds.size,
  spawns: worldSpawnIds.size,
  flagsSet: setFlags.size,
  flagsRead: readFlags.size,
};

if (globalThis.__cinderlineEvidence) {
  const { path, record } = globalThis.__cinderlineEvidence;
  record.content_stats = stats;
  record.summary = {
    rulesTotal: RULES.length,
    rulesPassed: RULES.length - new Set(narrative.map((n) => n.rule)).size,
    rulesFailed: new Set(narrative.map((n) => n.rule)).size,
    findings: narrative.length,
    impIdsReproduced: [...new Set(narrative.flatMap((n) => n.imp.split('/')))].sort(),
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`evidence: ${path}`);
}

console.log('CINDERLINE content validation');
console.log('─'.repeat(58));
for (const k in stats) console.log(`  ${k.padEnd(18)} ${stats[k]}`);
console.log('─'.repeat(58));

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log('  ! ' + w);
}
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log('  ✗ ' + p);
  console.log('\nVALIDATION FAILED');
  process.exit(1);
}
console.log('\nVALIDATION OK');
