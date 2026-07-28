/**
 * Localisation.
 *
 * The rule this file exists to enforce: the game's logic never sees a
 * translated string. Flags, node ids, quest ids, choice tags and conditions are
 * all English identifiers and stay that way, so a save made in Japanese loads
 * in English and the content validator keeps working on one graph rather than
 * two. Only the last step before something reaches a screen goes through `t()`.
 *
 * Keys mirror the shape of the content they translate, so a missing key is
 * findable by reading it:
 *
 *   ui.menu.newgame                 interface
 *   c.sol_first.start.text          a dialogue node
 *   c.sol_first.s_deal.choices.0    a choice on that node, by AUTHORED index
 *   q.arrival.steps.1.objective     a quest step
 *   e.record.beats.2                a conditional ending paragraph
 *   cap.readAir.desc                a capability
 *   topic.bek_letter.lines.3        an examine line
 *
 * Anything with no entry falls back to the English source, so a partial
 * translation degrades to mixed language rather than to blank text — which is
 * the correct failure for a player and the visible one for whoever is
 * translating.
 */

import { JA } from './locale/ja.js';

/** Languages offered in Settings, in the order they appear. */
export const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
];

const TABLES = { ja: JA };

let current = 'en';
let table = null;

/** Missing keys seen this session, so a translator can be handed a list. */
const missing = new Set();

/**
 * Pick a starting language from the browser, once, at boot.
 *
 * Only used when the player has never chosen: an explicit setting always wins,
 * including an explicit choice of English by somebody with a Japanese device.
 */
export function detectLocale() {
  const langs = (typeof navigator !== 'undefined' && navigator.languages)
    || [(typeof navigator !== 'undefined' && navigator.language) || 'en'];
  for (const l of langs) {
    const code = String(l || '').toLowerCase().split('-')[0];
    if (TABLES[code] || code === 'en') return code;
  }
  return 'en';
}

export function setLocale(code) {
  current = TABLES[code] ? code : 'en';
  table = TABLES[current] || null;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = current;
    // CJK needs different line breaking, a different minimum readable size and
    // no letter-spacing; the stylesheet keys all of that off this attribute.
    document.documentElement.setAttribute('data-lang', current);
  }
  return current;
}

export function locale() { return current; }
export function isCJK() { return current === 'ja'; }

/** Every key that was asked for and not found, for a translation pass. */
export function missingKeys() { return [...missing].sort(); }

/**
 * Translate `key`, falling back to the English original.
 *
 * `fallback` is the English string from the content itself rather than a
 * duplicated copy here — there is exactly one source of truth for the English
 * text and it is the content file.
 */
export function t(key, fallback = '') {
  if (!table) return fallback;
  const v = lookup(table, key);
  if (v === undefined || v === null) {
    if (fallback) missing.add(key);
    return fallback;
  }
  return v;
}

/** True when a translation exists, for cases that need to branch on it. */
export function has(key) {
  return !!table && lookup(table, key) !== undefined;
}

/**
 * Resolve a dotted key against a translation table.
 *
 * Three authoring shapes are accepted, because a translator writing a large
 * table will reach for all three and a key that silently resolves to nothing
 * is indistinguishable from a section nobody translated:
 *
 *   { ui: { set: { shake: '…' } } }        nested, the normal case
 *   { 'ui.set.shake': '…' }                flat, at any depth
 *   { ui: { set: { gas: { $: '…',          both a leaf and a branch —
 *                         sub: '…' } } } } `ui.set.gas` AND `ui.set.gas.sub`
 *
 * The third one is the reason this is not a three-line reduce: several settings
 * rows have a label and a sub-label, and the label's key is a prefix of the
 * sub-label's.
 */
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

// ---------------------------------------------------------------- content --

/**
 * Localise a dialogue node in place-ish: returns a shallow copy with `text`
 * and each choice's `text`/`why` swapped for their translations.
 *
 * Everything the engine acts on — `goto`, `effects`, `if`, `tag` — is left
 * exactly as authored.
 */
export function localiseNode(convoId, node, choices) {
  if (!table || !node) return { node, choices };
  const base = `c.${convoId}.${node.id}`;
  const out = { ...node, text: t(`${base}.text`, node.text) };
  let cs = choices;
  if (choices && choices.length) {
    // Keyed on the AUTHORED index (`ci`), not the position in the visible list
    // — a conditional choice that fails is filtered out, so positions shift
    // with game state and a translation keyed on them would attach to the
    // wrong line.
    cs = choices.map((c, i) => {
      const k = c.ci ?? i;
      return {
        ...c,
        text: t(`${base}.choices.${k}`, c.text),
        why: c.why ? t(`${base}.why.${k}`, c.why) : c.why,
        tag: c.tag ? t(`${base}.tag.${k}`, c.tag) : c.tag,
      };
    });
  }
  return { node: out, choices: cs };
}

/**
 * Short interface phrases keyed on their own English text.
 *
 * Interact prompts ("Read the board", "Climb", "Speak to Sol") are authored in
 * two dozen places across the world data and the director, most of them without
 * an id to key on, and many of them repeat. A glossary keyed on the English is
 * the right shape for that: it collapses the repeats to one entry and it cannot
 * drift out of sync with an id that was never there.
 *
 * The key drops '.' because the lookup path is dot-separated.
 */
export function phrase(text) {
  if (!text) return text;
  return t(`p.${String(text).replace(/\./g, '')}`, text);
}

/** A speaker's display name. */
export function castName(id, fallback) {
  return t(`cast.${id}.name`, fallback);
}

/** Quest title / summary / step objective and hint. */
export function questTitle(id, fallback) { return t(`q.${id}.title`, fallback); }
export function questSummary(id, fallback) { return t(`q.${id}.summary`, fallback); }
export function stepText(id, index, field, fallback) {
  return t(`q.${id}.steps.${index}.${field}`, fallback);
}
