/**
 * Translation completeness report.
 *
 * Enumerates every key the running game can ask `t()` for — by walking the
 * content the same way the engine does, not by grepping for strings — and diffs
 * that against a locale table. What comes out is the honest answer to "is this
 * translated", including the parts nobody would think to check: the fifth beat
 * of an ending only two flag combinations reach, the third bark of an enemy
 * that appears twice, the prompt on a door in an interior.
 *
 *   node tools/i18n_report.mjs ja            summary + first 40 missing keys
 *   node tools/i18n_report.mjs ja --all      every missing key
 *   node tools/i18n_report.mjs ja --extra    keys in the table nothing asks for
 *   node tools/i18n_report.mjs ja --shadowed keys one source file defines and
 *                                            a later one silently overrides
 *
 * Exit status is 0 whether or not keys are missing: a partial translation is a
 * legitimate state (it degrades to English), and this is a report, not a gate.
 */

import { readFileSync } from 'node:fs';
import { CAST, CONVERSATIONS, QUESTS, ENDINGS, EPILOGUE_BEATS } from '../src/content/story.js';
import { ITEMS, CAPABILITIES, CHARACTERS } from '../src/game/state.js';
import { buildHollisData } from '../src/content/world_data.js';

const code = process.argv[2] || 'ja';
const showAll = process.argv.includes('--all');
const showExtra = process.argv.includes('--extra');
const showShadowed = process.argv.includes('--shadowed');

const { JA } = await import(`../src/content/locale/${code}.js`);
const table = JA;

// ---------------------------------------------------------------- expected --

/** Every key, grouped, so the report can say WHERE the holes are. */
const groups = new Map();
const want = (group, key) => {
  if (!groups.has(group)) groups.set(group, new Set());
  groups.get(group).add(key);
};

// Dialogue. Choices are keyed on the AUTHORED index, which is exactly what the
// engine carries through its conditional filter.
for (const id in CONVERSATIONS) {
  const c = CONVERSATIONS[id];
  for (const nid in c.nodes) {
    const n = c.nodes[nid];
    if (n.text) want('dialogue', `c.${id}.${nid}.text`);
    (n.choices || []).forEach((ch, i) => {
      if (ch.text) want('dialogue', `c.${id}.${nid}.choices.${i}`);
      if (ch.why) want('dialogue', `c.${id}.${nid}.why.${i}`);
      if (ch.tag) want('dialogue', `c.${id}.${nid}.tag.${i}`);
    });
  }
}

// Quests.
for (const id in QUESTS) {
  const q = QUESTS[id];
  if (q.title) want('quests', `q.${id}.title`);
  if (q.summary) want('quests', `q.${id}.summary`);
  (q.steps || []).forEach((s, i) => {
    if (s.objective) want('quests', `q.${id}.steps.${i}.objective`);
    if (s.hint) want('quests', `q.${id}.steps.${i}.hint`);
  });
}

// Endings, their conditional beats and their epilogues.
for (const e of ENDINGS) {
  want('endings', `e.${e.id}.title`);
  want('endings', `e.${e.id}.text`);
  (e.beats || []).forEach((b, i) => want('endings', `e.${e.id}.beats.${i}`));
  if (e.epilogue) {
    want('endings', `e.${e.id}.epilogue.told`);
    want('endings', `e.${e.id}.epilogue.untold`);
  }
}
for (const b of EPILOGUE_BEATS) want('endings', `ep.${b.id}`);

// People, items, capabilities.
for (const id in CAST) {
  want('cast', `cast.${id}.name`);
  if (CAST[id].bio) want('cast', `cast.${id}.bio`);
}
for (const id in CHARACTERS) {
  want('cast', `cast.${id}.name`);
  if (CHARACTERS[id].role) want('cast', `cast.${id}.role`);
}
for (const id in ITEMS) {
  want('items', `item.${id}.name`);
  if (ITEMS[id].desc) want('items', `item.${id}.desc`);
}
for (const id in CAPABILITIES) {
  want('items', `cap.${id}.name`);
  if (CAPABILITIES[id].desc) want('items', `cap.${id}.desc`);
}

// Journal entries reachable from dialogue and quest effects.
const walkEffects = (fx) => {
  for (const e of fx || []) {
    if (e.journal) want('journal', `journal.${e.journal[0]}.title`) || 0;
    if (e.journal) want('journal', `journal.${e.journal[0]}.text`);
  }
};
for (const id in CONVERSATIONS) {
  for (const nid in CONVERSATIONS[id].nodes) {
    const n = CONVERSATIONS[id].nodes[nid];
    walkEffects(n.effects);
    for (const ch of n.choices || []) walkEffects(ch.effects);
  }
}
for (const id in QUESTS) {
  const q = QUESTS[id];
  walkEffects(q.onStart); walkEffects(q.onComplete); walkEffects(q.onFail);
  for (const s of q.steps || []) { walkEffects(s.onEnter); walkEffects(s.onDone); }
}

// Examine topics, journals and prompts live in the director and the world data,
// which are not tables we can import cleanly — scrape them from the source, and
// scrape the engine's own literal `t()` calls at the same time.
// main.js is in here because the boot, the storage warnings and the save's own
// "we could not read this" messages are all authored there, and a player whose
// save just failed to load is exactly the reader who needs their own language.
const SRC = ['src/game/director.js', 'src/game/game.js', 'src/ui/hud.js',
             'src/ui/screens.js', 'src/game/narrative.js', 'src/game/ai.js',
             'src/main.js'];
for (const f of SRC) {
  const s = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  for (const m of s.matchAll(/\bt\(\s*'([a-z][A-Za-z0-9_.]*)'/g)) want('interface', m[1]);
  for (const m of s.matchAll(/\bt\(\s*"([a-z][A-Za-z0-9_.]*)"/g)) want('interface', m[1]);
}

// Examine topics: ids, line counts and titles, read off the director's table.
{
  const s = readFileSync(new URL('../src/game/director.js', import.meta.url), 'utf8');
  const a = s.indexOf('const TOPICS = {');
  const seg = s.slice(a, s.indexOf('\n    };', a));
  const re = /^      ([a-z0-9_]+): \{/gm;
  let m;
  const starts = [];
  while ((m = re.exec(seg))) starts.push([m[1], m.index]);
  starts.forEach(([id, at], i) => {
    const body = seg.slice(at, i + 1 < starts.length ? starts[i + 1][1] : seg.length);
    want('topics', `topic.${id}.title`);
    const lines = body.slice(body.indexOf('lines: ['), body.indexOf(']', body.indexOf('lines: [')));
    // One key per authored line. Counting quote-openers at line starts is exact
    // here because every line in the table is its own array element.
    const n = (lines.match(/^\s+["'`]/gm) || []).length;
    for (let k = 0; k < n; k++) want('topics', `topic.${id}.lines.${k}`);
    const j = /journal: \['([a-z0-9_]+)'/.exec(body);
    if (j) {
      want('journal', `journal.${j[1]}.title`);
      want('journal', `journal.${j[1]}.text`);
    } else {
      want('journal', `journal.examine:${id}.title`);
      want('journal', `journal.examine:${id}.text`);
    }
  });
}

// Regions, and the interact-prompt glossary.
//
// Prompts are scraped from the SOURCE of the world data and the director rather
// than walked in the built object: several are attached to interactions the
// director pushes at runtime, which do not exist until the chapter that creates
// them, and one of them is the way past the Warden line.
{
  const data = buildHollisData();
  for (const r of data.regions || []) want('places', `region.${r.id}.name`);
  const phrases = new Set(['Interact', 'Climb']);
  for (const f of ['src/content/world_data.js', 'src/game/director.js']) {
    let src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    // Teo's offer table carries a `label` per row that is never shown: the row
    // is drawn from the item's own translated name. Scraping it would report
    // four keys as missing that nothing will ever ask for.
    const shop = src.indexOf('const offers = [');
    if (shop >= 0) src = src.slice(0, shop) + src.slice(src.indexOf('];', shop));
    const re = /\b(?:prompt|label|lockedPrompt|reveal):\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
    let m;
    while ((m = re.exec(src))) {
      const v = (m[1] ?? m[2]).replace(/\\'/g, "'").replace(/\\"/g, '"');
      // Skip the template-literal and computed cases, which are not glossary
      // entries — they are assembled from something already translated.
      if (v) phrases.add(v);
    }
  }
  for (const p of phrases) want('prompts', `p.${p.replace(/\./g, '')}`);
}

// Chapter cards, the four chapter-four survivors, the settings values that are
// words rather than numbers, and the trust-change toasts — all authored in
// places that carry no id, all reachable in a normal playthrough.
{
  const story = readFileSync(new URL('../src/content/story.js', import.meta.url), 'utf8');
  for (const m of story.matchAll(/card: \['CHAPTER ([A-Z]+)'/g)) {
    const n = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[m[1]];
    for (const f of ['kicker', 'title', 'sub']) want('interface', `ui.card.${n}.${f}`);
  }
  for (let i = 0; i <= 4; i++) want('interface', `ui.survivor.${i}`);
  for (const q of ['auto', 'low', 'medium', 'high']) want('interface', `ui.quality.${q}`);
  // The toast body: one entry per distinct authored reason.
  const reasons = new Set();
  for (const m of story.matchAll(/trust: \['[a-z]+', *-?\d+, *(?:'([^']*)'|"([^"]*)")\]/g)) {
    reasons.add((m[1] ?? m[2]));
  }
  for (const r of reasons) want('prompts', `p.${r.replace(/\./g, '')}`);
}

// Enemy barks, by kind and index.
{
  const s = readFileSync(new URL('../src/game/ai.js', import.meta.url), 'utf8');
  const seg = s.slice(s.indexOf('const BARKS = {'), s.indexOf('};', s.indexOf('const BARKS = {')));
  for (const m of seg.matchAll(/^\s{2}([a-z]+): \[(.*)\],$/gm)) {
    const n = m[2].split(/',\s*'|",\s*"|',\s*"|",\s*'/).length;
    for (let k = 0; k < n; k++) want('barks', `bark.${m[1]}.${k}`);
  }
}

// ----------------------------------------------------------------- resolve --

/** Same resolution rules as i18n.js, so the report cannot disagree with it. */
function lookup(obj, key) {
  if (typeof obj[key] === 'string') return obj[key];
  const parts = key.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length; i++) {
    if (cur === null || typeof cur !== 'object') return undefined;
    const rest = i ? parts.slice(i).join('.') : key;
    if (typeof cur[rest] === 'string') return cur[rest];
    cur = cur[parts[i]];
  }
  if (typeof cur === 'string') return cur;
  if (cur && typeof cur.$ === 'string') return cur.$;
  return undefined;
}

const missing = [];
let total = 0, have = 0;
const rows = [];
for (const [g, keys] of [...groups].sort()) {
  let n = 0;
  for (const k of [...keys].sort()) {
    total++;
    if (lookup(table, k) !== undefined) { have++; n++; } else missing.push(k);
  }
  rows.push([g, n, keys.size]);
}

const pad = (s, w) => String(s).padEnd(w);
console.log(`\n  translation report — ${code}\n`);
console.log('  ' + '─'.repeat(46));
for (const [g, n, all] of rows) {
  const pct = all ? Math.round((n / all) * 100) : 100;
  const bar = '█'.repeat(Math.round(pct / 5)).padEnd(20, '·');
  console.log(`  ${pad(g, 11)} ${bar} ${String(pct).padStart(3)}%  ${n}/${all}`);
}
console.log('  ' + '─'.repeat(46));
console.log(`  ${pad('TOTAL', 11)} ${' '.repeat(20)} ${String(Math.round((have / total) * 100)).padStart(3)}%  ${have}/${total}\n`);

if (missing.length) {
  console.log(`  missing (${missing.length}):`);
  for (const k of (showAll ? missing : missing.slice(0, 40))) console.log('    ' + k);
  if (!showAll && missing.length > 40) console.log(`    … and ${missing.length - 40} more (--all)`);
  console.log('');
}

// Interpolation markers. A translation that drops one renders the sentence with
// a hole where the number goes — "4人中人を上へ" — and every other check in this
// file passes, because the key exists and the value is a non-empty string.
{
  // key -> the markers the ENGINE substitutes into it.
  const MARKERS = {
    'ui.trade.row': ['@item', '@n'],
    'ui.speakto': ['@n'],
    'ui.chapter.fmt': ['@n'],
    'ui.hud.rescued': ['@n'],
    'ui.hud.someout': ['@a', '@b'],
    'ui.hud.ontheirfeet': ['@n'],
  };
  for (const k of ['minutes', 'meters', 'filters', 'rescued', 'breached', 'parries',
                   'survived', 'deaths']) MARKERS[`ui.ledger.${k}`] = ['@n'];

  const dropped = [];
  for (const key in MARKERS) {
    const v = lookup(table, key);
    // Absent is fine — it falls back to English. Present-but-mangled is not.
    if (v === undefined) continue;
    for (const m of MARKERS[key]) if (!v.includes(m)) dropped.push({ key, marker: m, value: v });
  }
  // Ending beats are the other direction: the ENGLISH decides which markers a
  // beat carries, and the translation has to carry the same ones.
  for (const e of ENDINGS) {
    (e.beats || []).forEach((b, i) => {
      const key = `e.${e.id}.beats.${i}`;
      const v = lookup(table, key);
      if (v === undefined) return;
      for (const m of (b.text.match(/@[nN]/g) || [])) {
        // @n and @N are interchangeable at the author's discretion — one is the
        // word, one is the numeral — so either satisfies the other.
        if (!/@[nN]/.test(v)) dropped.push({ key, marker: m, value: v.slice(0, 60) });
      }
    });
  }

  if (dropped.length) {
    console.log(`  DROPPED INTERPOLATION MARKERS (${dropped.length}) — always a fault:`);
    for (const d of dropped) console.log(`    ${d.key}  missing ${d.marker}\n      ${d.value}`);
    console.log('');
    process.exitCode = 1;
  } else {
    console.log('  interpolation markers: all present\n');
  }
}

// Shadowing between the source files that make up a locale.
//
// The table is merged from several files so several hands can work at once, and
// a later file wins a key the earlier one also defined. That is the intended
// rule, but it is silent: a whole file's worth of translation can be overridden
// and still read as live text in review. It happened here — 185 keys, 94 of
// them with different wording — so it gets an instrument.
if (showShadowed && code === 'ja') {
  const mods = [
    ['engine.js', (await import('../src/content/locale/ja/engine.js')).ENGINE_JA],
    ['ui.js', { ui: (await import('../src/content/locale/ja/ui.js')).UI_JA }],
    ['story.js', (await import('../src/content/locale/ja/story.js')).STORY_JA],
    ['story2.js', (await import('../src/content/locale/ja/story2.js')).STORY2_JA],
    ['content.js', (await import('../src/content/locale/ja/content.js')).CONTENT_JA],
  ];
  const flat = (o, p = '', out = {}) => {
    for (const k in o) {
      const key = p ? `${p}.${k}` : k;
      if (typeof o[k] === 'string') out[key] = o[k];
      else if (o[k] && typeof o[k] === 'object') flat(o[k], key, out);
    }
    return out;
  };
  const flats = mods.map(([name, t]) => [name, flat(t)]);
  const hits = [];
  for (let i = 0; i < flats.length; i++) {
    for (let j = i + 1; j < flats.length; j++) {
      for (const k in flats[i][1]) {
        if (k in flats[j][1]) {
          hits.push({ key: k, loser: flats[i][0], winner: flats[j][0],
            same: flats[i][1][k] === flats[j][1][k] });
        }
      }
    }
  }
  console.log(`  shadowed keys: ${hits.length}` +
    (hits.length ? ` (${hits.filter((h) => !h.same).length} with different wording)` : ''));
  for (const h of hits.slice(0, showAll ? hits.length : 30)) {
    console.log(`    ${h.key}\n      ${h.loser} loses to ${h.winner}${h.same ? ' (identical)' : ' — DIFFERENT TEXT'}`);
  }
  console.log('');
}

if (showExtra) {
  const wanted = new Set([...groups.values()].flatMap((s) => [...s]));
  const extra = [];
  const walk = (o, prefix) => {
    for (const k in o) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (k === '$') { if (!wanted.has(prefix)) extra.push(prefix); continue; }
      if (typeof o[k] === 'string') { if (!wanted.has(key)) extra.push(key); }
      else if (o[k] && typeof o[k] === 'object') walk(o[k], key);
    }
  };
  walk(table, '');
  console.log(`  in the table but never asked for (${extra.length}):`);
  for (const k of extra.slice(0, showAll ? extra.length : 40)) console.log('    ' + k);
  console.log('');
}
