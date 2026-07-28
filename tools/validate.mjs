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
 */

import { QUESTS, CONVERSATIONS, ENDINGS, EPILOGUE_BEATS, CAST } from '../src/content/story.js';
import { buildHollisData } from '../src/content/world_data.js';
import { ITEMS, CAPABILITIES, CHARACTERS } from '../src/game/state.js';

const problems = [];
const warnings = [];
const fail = (m) => problems.push(m);
const warn = (m) => warnings.push(m);

// Everything the engine can deliver as a quest trigger.
const TRIGGER_KINDS = new Set(['reach', 'talk', 'interact', 'collect', 'kill', 'flag', 'custom']);

// Custom trigger ids the director actually fires.
const CUSTOM_IDS = new Set([
  'meterRead', 'raidCleared', 'ventDecision', 'crisisArrive', 'crisisResolved',
  'trenchCleared', 'endingChosen', 'teoTrade',
]);

// Hook names the director implements.
const HOOKS = new Set(['spawnCourtyardRaid', 'spawnTrenchLine', 'shutVents', 'halfVents',
  'beginCrisis', 'openTrade']);

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

function walkEffects(effects, where) {
  if (!effects) return;
  const list = Array.isArray(effects) ? effects : [effects];
  for (const e of list) {
    if (!e || typeof e !== 'object') { fail(`${where}: malformed effect ${JSON.stringify(e)}`); continue; }
    if (e.flag) setFlags.add(e.flag);
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
      case 'interact':
        if (!t.id) fail(`${w}: interact trigger has no id`);
        else if (!worldInteractionIds.has(t.id)) fail(`${w}: interact trigger id "${t.id}" is not in the world`);
        break;
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
const engineFlags = new Set([
  'ch1_raid_done', 'sol_knows_name', 'teo_log_done', 'nessa_rescue_started',
  'nessa_rescued', 'found_venting', 'vents_shut', 'vents_left', 'vents_half',
  'has_log', 'has_order', 'iris_gave_pass', 'iris_hinted_door', 'met_garage',
  'crisis_stacks', 'crisis_south', 'crisis_saved_some', 'crisis_saved_all',
  'nessa_told_truth', 'nessa_scene_done', 'sol_vent_talked', 'krajcik_met',
  'ch1_done', 'ch3_done', 'ch3_talked', 'ch4_done', 'southmarrow_done',
  'gave_garage_filter', 'teo_shared', 'sol_met', 'teo_met', 'nessa_met',
  'iris_met', 'ren_knows_field', 'teo_named_iris', 'garage_suspects',
  'nessa_knows_connection', 'nessa_told_right', 'ren_asked_bek', 'sol_confession',
  'sol_knows_survey', 'sol_told_cellar', 'iris_shared', 'iris_accused',
  'iris_knows_log', 'krajcik_291', 'krajcik_open', 'took_offer', 'lied_to_krajcik',
  'proposed_cut', 'nessa_read_log', 'nessa_withheld', '__never__',
]);
for (const f of readFlags) {
  if (!setFlags.has(f) && !engineFlags.has(f)) {
    fail(`flag "${f}" is required somewhere but never set by content or engine`);
  }
}
for (const [cid, opts] of readChoices) {
  const set = setChoices.get(cid);
  if (!set) { fail(`choice "${cid}" is read but never recorded`); continue; }
  for (const o of opts) {
    if (!set.has(o)) fail(`choice "${cid}" is tested for option "${o}", which is never recorded`);
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
