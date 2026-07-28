/**
 * Proper-noun consistency report.
 *
 * A large translation split across several hands drifts on names before it
 * drifts on anything else, and the drift is invisible in review because each
 * file is internally consistent. This finds it: for every English string the
 * game can show, if it names something on the fixed list, the translation of
 * that same key is checked for the agreed rendering.
 *
 *   node tools/i18n_glossary.mjs ja
 *   node tools/i18n_glossary.mjs ja --all
 *
 * A miss is not automatically a fault — Japanese often restructures a sentence
 * and drops a subject the English repeats — so this prints what to look at and
 * exits 0. What it is really for is the case where the same name comes out two
 * different ways, which is always a fault.
 */

import { readFileSync } from 'node:fs';

const code = process.argv[2] || 'ja';
const showAll = process.argv.includes('--all');
const { JA } = await import(`../src/content/locale/${code}.js`);

/**
 * English proper noun -> the one agreed rendering, then any variant that has
 * been seen and rejected. A rejected variant appearing anywhere is an error;
 * a missing agreed rendering is a thing to look at.
 */
const GLOSSARY = [
  ['Ash crew', '灰の組', ['灰漁り', 'アッシュ組', '灰処理']],
  ['Warden', 'ウォーデン', ['ワーデン']],
  ['Hollis', 'ホリス', []],
  ['Cellar Row', 'セラー通り', []],
  ['Marrow Street', 'マロウ通り', []],
  ['Marrow Arcade', 'マロウ・アーケード', []],
  ['South Marrow', 'サウス・マロウ', ['南マロウ']],
  ['Cinder Road', 'シンダー通り', ['シンダー街道']],
  ['Cinderline', 'シンダーライン', []],
  ['The Stacks', 'スタックス', []],
  ['Fenn Street', 'フェン通り', []],
  ['Pell House', 'ペル館', ['ペル・ハウス']],
  ['Vent Field 9', 'ヴェント第9区画', []],
  ['Nadeau', 'ナドー', ['ナデュー', 'ナドウ']],
  ['Vasko', 'ヴァスコ', ['バスコ']],
  ['Ostrowski', 'オストロフスキ', []],
  ['Krajcik', 'クライチク', []],
  ['Kell', 'ケル', []],
  ['Nessa', 'ネッサ', []],
  ['Iris', 'アイリス', []],
];

// Every translated leaf, with the key that reaches it.
const pairs = [];
(function walk(o, prefix) {
  for (const k in o) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof o[k] === 'string') pairs.push([k === '$' ? prefix : key, o[k]]);
    else if (o[k] && typeof o[k] === 'object') walk(o[k], key);
  }
}(JA, ''));

// Rejected variants anywhere in the table are unambiguous errors.
const errors = [];
for (const [en, agreed, bad] of GLOSSARY) {
  for (const v of bad) {
    for (const [key, ja] of pairs) {
      if (ja.includes(v)) errors.push({ key, en, found: v, expected: agreed });
    }
  }
}

// English sources, so a key's English can be compared with its Japanese.
const ENGLISH = new Map();
{
  const { CONVERSATIONS, QUESTS, ENDINGS, EPILOGUE_BEATS, CAST } =
    await import('../src/content/story.js');
  for (const id in CONVERSATIONS) {
    for (const nid in CONVERSATIONS[id].nodes) {
      const n = CONVERSATIONS[id].nodes[nid];
      if (n.text) ENGLISH.set(`c.${id}.${nid}.text`, n.text);
      (n.choices || []).forEach((c, i) => {
        if (c.text) ENGLISH.set(`c.${id}.${nid}.choices.${i}`, c.text);
      });
    }
  }
  for (const id in QUESTS) {
    const q = QUESTS[id];
    if (q.title) ENGLISH.set(`q.${id}.title`, q.title);
    if (q.summary) ENGLISH.set(`q.${id}.summary`, q.summary);
    (q.steps || []).forEach((s, i) => {
      if (s.objective) ENGLISH.set(`q.${id}.steps.${i}.objective`, s.objective);
    });
  }
  for (const e of ENDINGS) {
    ENGLISH.set(`e.${e.id}.title`, e.title);
    ENGLISH.set(`e.${e.id}.text`, e.text);
    (e.beats || []).forEach((b, i) => ENGLISH.set(`e.${e.id}.beats.${i}`, b.text));
  }
  for (const b of EPILOGUE_BEATS) ENGLISH.set(`ep.${b.id}`, b.text);
  for (const id in CAST) if (CAST[id].bio) ENGLISH.set(`cast.${id}.bio`, CAST[id].bio);
}

const look = [];
for (const [key, ja] of pairs) {
  const en = ENGLISH.get(key);
  if (!en) continue;
  for (const [term, agreed] of GLOSSARY) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(en) && !ja.includes(agreed)) look.push({ key, term, agreed });
  }
}

console.log(`\n  proper-noun report — ${code}\n`);
console.log(`  glossary terms: ${GLOSSARY.length}   translated strings: ${pairs.length}\n`);

if (errors.length) {
  console.log(`  REJECTED VARIANTS (${errors.length}) — these are always faults:`);
  for (const e of errors) console.log(`    ${e.key}\n      found ${e.found}, expected ${e.expected}`);
  console.log('');
} else {
  console.log('  rejected variants: none\n');
}

if (look.length) {
  console.log(`  English names the term, translation does not carry it (${look.length}) —`);
  console.log('  usually a legitimate restructuring; worth a glance:');
  for (const l of (showAll ? look : look.slice(0, 20))) {
    console.log(`    ${l.key}  (${l.term} -> ${l.agreed})`);
  }
  if (!showAll && look.length > 20) console.log(`    … and ${look.length - 20} more (--all)`);
  console.log('');
}

process.exit(errors.length ? 1 : 0);
