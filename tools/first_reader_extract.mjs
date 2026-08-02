#!/usr/bin/env node
/**
 * first_reader_extract.mjs — turn CINDERLINE into a first-reader reading.
 *
 * READ-ONLY with respect to the story: it imports `src/content/story.js` and writes a reading
 * to wherever you point it. It changes nothing.
 *
 *   node tools/first_reader_extract.mjs reading-en.json --lang=en
 *   node tools/first_reader_extract.mjs reading-ja.json --lang=ja
 *   node tools/first_reader_extract.mjs half.json --lang=en --choose=vent_decision:start=2
 *
 * It lives here rather than beside the measurement it produced, because the before-and-after
 * comparison the measurement exists for needs a **byte-identical** extractor on both sides, and
 * a copy sitting in a records folder is the wrong place for something the next round has to
 * run. The recorded run's copy is kept at
 * `kit/AI_DEVELOPMENT/MEASUREMENTS/first-reader/cinderline-pre-fix/extract-cinderline.mjs`;
 * if the two ever disagree, the two readings are not comparable and the comparison is void.
 *
 * This is the repository-side half of the seam the kit draws: the kit owns the reading
 * format, the protocol and the fold; the repository owns the extraction, because only the
 * repository knows what its player actually sees and in what order.
 *
 * Three decisions are made here and every one of them limits what the run can claim:
 *
 * 1. ORDER. The game is a world, not a book, so a canonical order has to be chosen. This one
 *    follows the chapter gates in `src/game/director.js` (`NPC_ANCHORS` chapters, `convoFor`
 *    and the quest `chapter` fields). A real player could meet Teo before Sol.
 *
 * 2. PATH. A branching conversation cannot be read as a whole without showing the reader the
 *    outcome of a choice they are about to be asked to weigh — which destroys the one
 *    measurement the choice checkpoint makes. So one path is walked, choosing at each branch
 *    the option that reaches the most text not yet seen. Coverage is reported, and passages
 *    no reader reaches are named, not quietly dropped.
 *
 * 3. FLAGS. Effects along the walked path are tracked so the ending and its conditional
 *    paragraphs are the ones this playthrough would really produce. Conditions this extractor
 *    cannot evaluate (counters) exclude their paragraph rather than guess it.
 */

import { writeFileSync } from 'node:fs';
import { QUESTS, CONVERSATIONS, ENDINGS, EPILOGUE_BEATS, CAST } from '../src/content/story.js';
import { JA } from '../src/content/locale/ja.js';

const SOURCE = 'src/content/story.js';

/**
 * `--lang=ja` renders the reading in the shipped Japanese, exactly as `src/content/i18n.js`
 * does it: look the key up, and fall back to the English source when there is no entry — which
 * is what a Japanese player is shown, so it is what the reading must contain.
 */
const LANG = (process.argv.find((a) => a.startsWith('--lang=')) || '--lang=en').slice(7);

/**
 * `--choose=<convo>:<node>=<n>` forces one branch instead of taking the greedy one, so a second
 * reading can be walked down a path the first did not reach. `n` indexes the options as the
 * player sees them, live ones only.
 *
 * The greedy walk maximises unread text, which is the right default and is also why one run
 * can leave a whole limb of the story unmeasured: the first CINDERLINE reading took the *shut*
 * vent branch, and the defect that lives on the *half-measure* branch was therefore not
 * something any reader could have found. Forcing the branch is how that gets measured; it is
 * recorded in the reading's provenance so the two runs are never mistaken for one.
 */
const FORCED = new Map(process.argv.filter((a) => a.startsWith('--choose='))
  .map((a) => a.slice(9).split('='))
  .map(([where, n]) => [where, Number(n)]));
const TABLE = LANG === 'ja' ? JA : null;
let fellBack = 0;
function tr(key, fallback) {
  if (!TABLE) return fallback;
  let node = TABLE;
  for (const part of key.split('.')) {
    if (node === undefined || node === null) break;
    node = node[part];
  }
  if (typeof node === 'string') return node;
  fellBack += 1;
  return fallback;
}

/** Play order, from the chapter gates in src/game/director.js. */
const ORDER = [
  { chapter: 1, title: 'CHAPTER ONE · BAD AIR', items: [
    ['quest', 'arrival'], ['convo', 'sol_first'], ['quest', 'filters'], ['convo', 'teo_first'],
    ['convo', 'nessa_first'], ['convo', 'sol_after_raid'],
  ] },
  { chapter: 2, title: 'CHAPTER TWO · THE NUMBERS BEHIND THE LINE', items: [
    ['quest', 'log'], ['convo', 'teo_log'], ['quest', 'southmarrow'], ['quest', 'nessaRun'],
    ['convo', 'nessa_rescue'], ['quest', 'cellarRow'], ['convo', 'garage'],
  ] },
  { chapter: 3, title: 'CHAPTER THREE · FIELD OFFICE TWO', items: [
    ['quest', 'office'], ['convo', 'iris_first'], ['convo', 'krajcik'], ['convo', 'iris_after'],
  ] },
  { chapter: 4, title: 'CHAPTER FOUR · WHITEDAMP', items: [
    ['quest', 'whitedamp'], ['convo', 'nessa_truth'], ['convo', 'vent_decision'],
  ] },
  { chapter: 5, title: 'CHAPTER FIVE · THE CINDER LINE', items: [
    ['quest', 'cinderline'], ['convo', 'final'],
  ] },
];

const state = { flags: new Set(), items: new Set(), chose: new Map() };
const seenNodes = new Set();
const excluded = [];
const assumptions = [];
const forcedTaken = [];
let pid = 0;
const nextId = (tag) => `p${String(++pid).padStart(3, '0')}-${tag}`;

const clean = (s) => String(s).replace(/\s+/g, ' ').trim();

/* -------------------------------------------------------------- conditions */

function holds(cond) {
  if (cond === undefined || cond === null) return true;
  if (typeof cond !== 'object') return true;
  const keys = Object.keys(cond);
  if (keys.length === 0) return true;
  if (cond.all) return cond.all.every(holds);
  if (cond.any) return cond.any.some(holds);
  if (cond.not) return !holds(cond.not);
  if (cond.flag) return state.flags.has(cond.flag);
  if (cond.notFlag) return !state.flags.has(cond.notFlag);
  if (cond.chose) return state.chose.get(cond.chose[0]) === cond.chose[1];
  if (cond.item) return state.items.has(cond.item);
  if (cond.counter) return null;            // not evaluable here
  if (cond.chapter || cond.trust) return null;
  return null;
}

const definitelyHolds = (cond) => holds(cond) === true;

function applyEffects(effects = []) {
  for (const e of effects) {
    if (!e || typeof e !== 'object') continue;
    if (e.flag) state.flags.add(e.flag);
    if (e.item) state.items.add(e.item);
    if (e.choice) state.chose.set(e.choice[0], e.choice[1]);
  }
}

/* ------------------------------------------------------------------ quests */

function questPassages(id) {
  const q = QUESTS[id];
  const out = [];
  applyEffects(q.onStart);
  applyEffects(q.onComplete);
  for (const step of q.steps || []) { applyEffects(step.onDone); applyEffects(step.effects); }
  for (const step of q.onStart || []) {
    if (step.card) out.push({ id: nextId('card'), kind: 'card', source: SOURCE, text: clean(step.card.join(' · ')) });
  }
  if (q.summary) out.push({ id: nextId('obj'), kind: 'narration', source: SOURCE, text: clean(tr(`q.${id}.summary`, q.summary)) });
  (q.steps || []).forEach((step, si) => {
    if (step.objective) out.push({ id: nextId('obj'), kind: 'narration', source: SOURCE, text: clean(tr(`q.${id}.steps.${si}.objective`, step.objective)) });
    for (const done of step.onDone || []) {
      if (done.journal) out.push({ id: nextId('jrn'), kind: 'journal', source: SOURCE, text: clean(tr(`journal.${done.journal[0]}.text`, done.journal[2])) });
    }
  });
  return out;
}

/* ----------------------------------------------------------- conversations */

/** How many nodes this branch can still show us that we have not read. */
function newReach(convo, start) {
  const seen = new Set();
  const stack = [start];
  let fresh = 0;
  while (stack.length) {
    const key = stack.pop();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const node = convo.nodes[key];
    if (!node) continue;
    if (!seenNodes.has(`${convo.id}:${key}`)) fresh += 1;
    if (node.next) stack.push(node.next);
    for (const c of node.choices || []) if (c.goto) stack.push(c.goto);
    for (const b of node.branch || []) if (b.goto) stack.push(b.goto);
  }
  return fresh;
}

function convoPassages(id) {
  const convo = CONVERSATIONS[id];
  if (!convo) { excluded.push({ what: `conversation ${id}`, why: 'not present in the story module' }); return []; }
  const out = [];

  // A first reader is always meeting these people for the first time, so the entry branch is
  // the unconditional one — the `sol_met` / `teo_met` repeat lines are a second visit.
  let at = convo.entry
    ? (convo.entry.find((e) => Object.keys(e.if || {}).length === 0) || convo.entry[0]).goto
    : Object.keys(convo.nodes)[0];

  const guard = new Set();
  while (at && convo.nodes[at]) {
    if (guard.has(at)) { excluded.push({ what: `${id}:${at}`, why: 'loop in the walked path; stopped here' }); break; }
    guard.add(at);
    seenNodes.add(`${convo.id}:${at}`);
    const node = convo.nodes[at];

    if (node.text) {
      const speaker = node.speaker && node.speaker !== 'system'
        ? tr(`cast.${node.speaker}.name`, CAST[node.speaker]?.name || node.speaker) : null;
      out.push({
        id: nextId(node.speaker === 'ren' ? 'ren' : 'say'),
        kind: speaker ? 'dialogue' : 'narration',
        ...(speaker ? { speaker } : {}),
        source: SOURCE,
        text: clean(tr(`c.${id}.${at}.text`, node.text)),
      });
    }
    if (node.effects) applyEffects(node.effects);

    if (node.choices) {
      // src/game/narrative.js `visibleChoices`: an option whose condition fails is dropped
      // unless it carries `showLocked`, in which case the player sees it greyed out with its
      // reason. Both of those are on the screen, so both are in the reading — and an option
      // that is on the screen and cannot be taken is exactly the kind of thing a first reader
      // should be able to notice without being told.
      const shown = [];
      node.choices.forEach((c, ci) => { c.__ci = ci; });
      for (const c of node.choices) {
        const ok = holds(c.if);
        if (ok === true) shown.push({ c, locked: false });
        else if (c.showLocked) shown.push({ c, locked: true });
        else excluded.push({ what: `${id}:${at}`, why: `option "${clean(c.text).slice(0, 40)}" is hidden by a condition this walk does not hold` });
      }
      const live = shown.filter((s) => !s.locked);
      if (shown.length >= 2) {
        out.push({
          // `node` is the address this choice lives at, kept for the branch sweep and never
          // rendered — a reader must not see a node id.
          id: nextId('choice'), kind: 'choice', source: SOURCE, node: `${id}:${at}`,
          options: shown.map(({ c, locked }) => {
            const label = clean(tr(`c.${id}.${at}.choices.${c.__ci}`, c.text));
            return { label: locked ? `${label} [locked — ${clean(c.why || 'no reason given')}]` : label };
          }),
        });
      } else if (shown.length === 1) {
        excluded.push({ what: `${id}:${at}`, why: 'only one option on screen; rendered as a line, not a choice' });
      }
      const forced = FORCED.get(`${id}:${at}`);
      const scored = live.map(({ c }, i) => ({ c, i, reach: c.goto ? newReach(convo, c.goto) : 0 }));
      scored.sort((a, b) => b.reach - a.reach || a.i - b.i);
      const taken = forced === undefined ? scored[0]?.c : live[forced]?.c;
      if (forced !== undefined) {
        if (!live[forced]) { excluded.push({ what: `${id}:${at}`, why: `--choose asked for option ${forced}, which is not live here` }); }
        else forcedTaken.push({ at: `${id}:${at}`, option: forced, label: clean(live[forced].c.text) });
      }
      if (!taken) break;
      applyEffects(taken.effects);
      at = taken.goto;
      continue;
    }

    if (node.branch) {
      let hit = node.branch.find((b) => holds(b.if) === true);
      if (!hit) {
        // Nothing resolved. Rather than stop — which silently shortens the reading and would
        // read back as "chapter four is thin" — take the branch that shows the most unread
        // text among those not ruled out, and record it as an assumption this walk made.
        const open = node.branch.filter((b) => holds(b.if) !== false);
        hit = open.map((b) => ({ b, reach: b.goto ? newReach(convo, b.goto) : 0 }))
          .sort((x, y) => y.reach - x.reach)[0]?.b;
        if (hit) assumptions.push({ what: `${id}:${at}`, why: `no branch condition resolved; walked ${hit.goto} as the branch showing the most unread text` });
      }
      for (const b of node.branch) if (b !== hit) excluded.push({ what: `${id}:${at}`, why: `branch to ${b.goto} not taken` });
      if (!hit) { excluded.push({ what: `${id}:${at}`, why: 'no branch condition resolved and none was open; walk stopped' }); break; }
      at = hit.goto;
      continue;
    }

    at = node.next;
  }

  for (const key of Object.keys(convo.nodes)) {
    if (!seenNodes.has(`${convo.id}:${key}`)) excluded.push({ what: `${id}:${key}`, why: 'branch not taken on this path' });
  }
  return out;
}

/* ---------------------------------------------------------------- endings */

function endingPassages() {
  const out = [];
  const ending = ENDINGS.find((e) => definitelyHolds(e.condition));
  if (!ending) { excluded.push({ what: 'ending', why: 'no ending condition resolved on this path' }); return out; }
  for (const other of ENDINGS) if (other !== ending) excluded.push({ what: `ending ${other.id}`, why: 'not the ending this path reaches' });

  out.push({ id: nextId('card'), kind: 'card', source: SOURCE, text: clean(tr(`e.${ending.id}.title`, ending.title)) });
  out.push({ id: nextId('end'), kind: 'ending', source: SOURCE, text: clean(tr(`e.${ending.id}.text`, ending.text)) });
  (ending.beats || []).forEach((beat, bi) => {
    if (definitelyHolds(beat.condition)) out.push({ id: nextId('end'), kind: 'ending', source: SOURCE, text: clean(tr(`e.${ending.id}.beats.${bi}`, beat.text)) });
    else excluded.push({ what: `ending ${ending.id} beat`, why: 'condition does not hold on this path, or is a counter this extractor cannot evaluate' });
  });
  if (ending.epilogue) {
    // `told` / `untold` are two versions of the same closing paragraph, chosen by whether Ren
    // told Nessa. Emitting both would hand the reader a flat contradiction this extractor
    // manufactured, which is precisely the kind of finding a measurement must not invent.
    const keys = Object.keys(ending.epilogue).sort().join(',');
    if (keys === 'told,untold') {
      const told = ['told', 'gave'].includes(state.chose.get('nessa_truth'));
      const variant = told ? 'told' : 'untold';
      out.push({ id: nextId('epi'), kind: 'epilogue', source: SOURCE, text: clean(tr(`e.${ending.id}.epilogue.${variant}`, ending.epilogue[variant])) });
      excluded.push({ what: `ending ${ending.id} epilogue`, why: `the ${told ? 'untold' : 'told'} variant is not this path's` });
    } else {
      excluded.push({ what: `ending ${ending.id} epilogue`, why: `unrecognised variant keys (${keys}); not emitted rather than guessed` });
    }
  }
  for (const beat of EPILOGUE_BEATS) {
    if (definitelyHolds(beat.condition)) out.push({ id: nextId('epi'), kind: 'epilogue', source: SOURCE, text: clean(tr(`ep.${beat.id}`, beat.text)) });
    else excluded.push({ what: `epilogue beat ${beat.id}`, why: 'condition does not hold on this path' });
  }
  return out;
}

/* -------------------------------------------------------------------- run */

const sections = [];
for (const chapter of ORDER) {
  const passages = [];
  // Ren's biography is on the character screen (src/ui/screens.js:459), so it is text the
  // player reads, and it goes in front of chapter one where the screen is first reachable.
  if (chapter.chapter === 1) {
    passages.push({ id: nextId('bio'), kind: 'narration', source: SOURCE, text: `${tr('cast.ren.name', 'Renata Vasko')}. ${clean(tr('cast.ren.bio', CAST.ren.bio))}` });
  }
  for (const [kind, id] of chapter.items) {
    passages.push(...(kind === 'quest' ? questPassages(id) : convoPassages(id)));
  }
  sections.push({ id: `ch${chapter.chapter}`, title: chapter.title, passages });
}
sections[sections.length - 1].passages.push(...endingPassages());

/*
 * The other endings.
 *
 * Three of the eight known defects live in endings this playthrough does not reach, and a
 * measurement that cannot see them would be reported as the tool finding nothing. A player
 * who replays reads these, so they are text the work shows — but they arrive after the story
 * has ended, so the section is marked `postscript` and the protocol stops asking what happens
 * next. Paragraphs carrying an interpolation token this walk cannot resolve are left out
 * rather than shown to a reader with an `@N` in them.
 */
const reachedEnding = ENDINGS.find((e) => definitelyHolds(e.condition));
const others = [];
for (const ending of ENDINGS) {
  if (ending === reachedEnding) continue;
  others.push({ id: nextId('card'), kind: 'card', source: SOURCE, text: clean(tr(`e.${ending.id}.title`, ending.title)) });
  others.push({ id: nextId('end'), kind: 'ending', source: SOURCE, text: clean(tr(`e.${ending.id}.text`, ending.text)) });
  (ending.beats || []).forEach((beat, bi) => {
    // Tested on the string that is actually emitted, not on the English source it came from.
    // Checking the source passed the English reading and let an `@N` through in the Japanese
    // one, where a different beat carries the token — caught by the leak gate, which is what
    // it is for.
    const text = clean(tr(`e.${ending.id}.beats.${bi}`, beat.text));
    if (/@[A-Z]\b/.test(text)) {
      excluded.push({ what: `ending ${ending.id} beat ${bi}`, why: 'carries an unresolved interpolation token; not shown to a reader' });
      return;
    }
    others.push({ id: nextId('end'), kind: 'ending', source: SOURCE, text });
  });
}
sections.push({
  id: 'other-endings',
  title: 'THE OTHER ENDINGS · what this story does if you choose differently',
  postscript: true,
  passages: others,
});

/*
 * Final sweep: a passage whose *rendered* text still carries an interpolation token the game
 * substitutes at runtime is the extractor's artefact, not the work's, and it must not reach a
 * reader. Done here rather than at each emission point because the token can arrive through
 * the English source or through a translation, and only the rendered string knows.
 */
for (const section of sections) {
  const kept = [];
  for (const p of section.passages) {
    const text = p.kind === 'choice' ? p.options.map((o) => o.label).join(' ') : String(p.text || '');
    if (/@[A-Za-z]\b|\{\{\s*\w+\s*\}\}/.test(text)) {
      excluded.push({ what: `${section.id}:${p.id}`, why: 'rendered text still carries an interpolation token the game substitutes at runtime; not shown to a reader' });
      continue;
    }
    kept.push(p);
  }
  section.passages = kept;
}

const reading = {
  work: 'CINDERLINE',
  language: LANG,
  sourceOfRecord: SOURCE,
  provenance: {
    extractedBy: 'extract-cinderline.mjs',
    order: 'chapter gates in src/game/director.js',
    path: forcedTaken.length
      ? 'greedy, except where --choose forced a branch'
      : 'greedy: at each branch, the option reaching the most unread text',
    forcedChoices: forcedTaken,
    language: LANG,
    untranslatedFallbacks: fellBack,
    flagsAtEnd: [...state.flags].sort(),
    itemsAtEnd: [...state.items].sort(),
    choicesAtEnd: Object.fromEntries([...state.chose].sort()),
  },
  sections,
};

const totalNodes = Object.values(CONVERSATIONS).reduce((s, c) => s + Object.keys(c.nodes).length, 0);
const coverage = {
  conversationNodes: totalNodes,
  conversationNodesRead: seenNodes.size,
  fraction: Number((seenNodes.size / totalNodes).toFixed(4)),
  passages: sections.reduce((s, x) => s + x.passages.length, 0),
  excluded,
  assumptions,
};

const out = process.argv.find((a) => a.endsWith('.json')) || '/tmp/reading.json';
writeFileSync(out, `${JSON.stringify(reading, null, 2)}\n`);
writeFileSync(out.replace(/\.json$/, '.coverage.json'), `${JSON.stringify(coverage, null, 2)}\n`);
console.log(`wrote ${out}`);
console.log(`sections ${sections.length}  passages ${coverage.passages}  choices ${sections.flatMap((s) => s.passages).filter((p) => p.kind === 'choice').length}`);
if (TABLE) console.log(`language ${LANG}, ${fellBack} strings with no translation fell back to the English source (which is what a player sees)`);
console.log(`conversation nodes read ${seenNodes.size}/${totalNodes} (${(coverage.fraction * 100).toFixed(1)}%)  excluded entries ${excluded.length}`);
