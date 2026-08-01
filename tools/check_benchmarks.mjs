#!/usr/bin/env node
/**
 * check_benchmarks.mjs — `docs/benchmarks.md` の自動検証。
 *
 * ユーザー指示（要素別の参考基準）が要求する4つの性質を機械で守らせる:
 *
 *   1. 構造 — 必要な要素すべてに参考作品と基準があり、基準に空欄が無い
 *   2. 誠実性 — 実機・人間にしか判定できない項目を「適合」にできない。
 *      判定済みの項目は証拠を持つ。未計測を合格として数えない
 *   3. 模倣禁止 — 参考作品の固有名詞が出荷されるソースに混入していない
 *   4. **基準を弱めない** — 各基準の (ID + 基準 + 閾値) の sha256 を
 *      `AI_DEVELOPMENT/BENCHMARKS/criteria.lock.json` に固定する。
 *      同一 revision 内での変更は失敗。revision を上げた変更は、
 *      §9 変更履歴に当該 ID が書かれていなければ失敗する
 *
 * 4 が本検査の中心である。実装が基準に届かないときに基準を下げる、という
 * 最も起きやすい失敗を、記録なしにはできなくする。
 *
 *   node tools/check_benchmarks.mjs
 *   node tools/check_benchmarks.mjs --relock   (§9 に記録したうえで lock を更新)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = join(ROOT, 'docs', 'benchmarks.md');
const LOCK = join(ROOT, 'AI_DEVELOPMENT', 'BENCHMARKS', 'criteria.lock.json');
const RELOCK = process.argv.includes('--relock');

/** ユーザーが名指しした要素。いずれかを担当する節が無ければ失敗する。 */
const REQUIRED_ELEMENTS = [
  '戦闘', '移動', 'カメラ', '探索', '世界設計', '物語', 'キャラクター', '選択と結果',
  'UI', 'タッチ操作', '映像', 'アニメーション', '音響', 'AI', '性能', '安定性',
];

const STATUSES = new Set(['適合', '未達', '部分', '未計測', '人間のみ']);
const ORIGINS = new Set(['directive', '本プロジェクト', '参考原則', 'bible']);
/** 判定済みとみなす状態。証拠を要求する。 */
const DECIDED = new Set(['適合', '未達']);

/**
 * 出荷されるソースに現れてはならない参考作品の固有名詞。
 *
 * 一般語（"inside" など）は入れない。変数名や英単語に当たって、実際には
 * 起きていない模倣を報告する検査は、検査として無価値だからである。
 */
const FORBIDDEN_TOKENS = [
  'dark souls', 'fromsoftware', 'from software',
  'dishonored', 'arkane',
  'alien: isolation', 'xenomorph', 'amanda ripley', 'creative assembly',
  'disco elysium', 'revachol', 'za/um',
  'new vegas', 'fallout', 'obsidian entertainment',
  'god of war', 'kratos', 'santa monica studio',
  'playdead',
  'naughty dog', 'last of us',
  'genshin', 'mihoyo', 'hoyoverse',
  'factorio', 'wube',
];
/** 出荷対象。docs/ は対象外 — 本文書自身が参考作品を名指しするため。 */
const SHIPPED = ['src', 'public', 'index.html', 'styles.css', 'cinderline.1.0.0.js'];
const SHIPPED_EXT = new Set(['.js', '.mjs', '.html', '.css', '.json', '.webmanifest', '.svg']);

const errors = [];
const warnings = [];

if (!existsSync(DOC)) {
  console.error('docs/benchmarks.md が存在しない。');
  process.exit(2);
}
const src = readFileSync(DOC, 'utf8');

// --- revision ---------------------------------------------------------------
const benchRev = (src.match(/<!--\s*benchmark_revision:\s*(.+?)\s*-->/) || [])[1];
const conceptRev = (src.match(/<!--\s*concept_revision:\s*(.+?)\s*-->/) || [])[1];
if (!benchRev) errors.push('benchmark_revision のコメントが無い');
if (!conceptRev) errors.push('concept_revision のコメントが無い（コンセプト変更を検出できない）');

// --- セル整形 ---------------------------------------------------------------
const clean = (s) => s.replace(/\*\*/g, '').replace(/`/g, '').trim();
/** 「適合（範囲限定）」の形を許し、括弧より前だけを状態語として判定する。 */
const word = (s) => clean(s).split(/[（(]/)[0].trim();
/** 「directive §8」の形を許し、最初の語だけを出所として判定する。 */
const firstWord = (s) => clean(s).split(/[\s（(]/)[0].trim();
const normalise = (s) => clean(s).replace(/\s+/g, ' ');

const splitRow = (line) => line.split(/(?<!\\)\|/).map((x) => x.replace(/\\\|/g, '|').trim());

// --- 作品ロスター (§3) ------------------------------------------------------
const works = new Map();
for (const line of src.split('\n')) {
  if (!line.trim().startsWith('|')) continue;
  const c = splitRow(line);
  if (c.length < 7) continue;
  if (!/^W\d+$/.test(clean(c[1]))) continue;
  works.set(clean(c[1]), { title: clean(c[2]), dev: clean(c[3]), year: clean(c[4]), elements: clean(c[5]) });
}
if (works.size === 0) errors.push('§3 の参考作品ロスター表が読めない');

// 各作品に「取らないもの」の宣言があること (§2.3)
for (const [id, w] of works) {
  const sec = src.split(new RegExp(`^### ${id} —`, 'm'))[1];
  if (!sec) { errors.push(`${id} (${w.title}): §4 に節が無い`); continue; }
  const body = sec.split(/^### /m)[0];
  if (!body.includes('取らないもの')) {
    errors.push(`${id} (${w.title}): 「取らないもの」の宣言が無い（§2.3 模倣禁止）`);
  }
  for (const axis of ['軸1', '軸4', '軸5']) {
    if (!body.includes(axis)) errors.push(`${id} (${w.title}): 選定軸 ${axis} の説明が無い（§2.1）`);
  }
}

// --- 要素節 -----------------------------------------------------------------
const elements = [];
// 見出しの区切りは全角ダッシュ。前後の空白の有無に依存させない — 依存させた
// 初版は「UI（HUD・情報設計）— W3 …」を要素として認識できず、その節の基準を
// 直前の要素に紐づけて黙って通していた。
for (const m of src.matchAll(/^### (E-\d+)\s+(.+?)\s*—\s*(W\d+)\s+(.+)$/gm)) {
  elements.push({ id: m[1], name: m[2].trim(), work: m[3], workTitle: m[4].trim(), index: m.index });
}
if (!elements.length) errors.push('要素節（### E-NN 名 — Wn 作品）が1つも無い');

for (const e of elements) {
  if (!works.has(e.work)) errors.push(`${e.id} ${e.name}: 参考作品 ${e.work} が §3 のロスターに無い`);
}
for (const need of REQUIRED_ELEMENTS) {
  if (!elements.some((e) => e.name.includes(need))) {
    errors.push(`ユーザーが名指しした要素「${need}」を担当する節が無い`);
  }
}

// --- 基準表 -----------------------------------------------------------------
const criteria = [];
{
  const lines = src.split('\n');
  const offsets = [];
  let pos = 0;
  for (const l of lines) { offsets.push(pos); pos += l.length + 1; }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) continue;
    const c = splitRow(line);
    if (c.length < 9) continue;
    const [, id, basis, threshold, origin, verify, status, evidence] = c;
    if (!/^BM-[A-Z]+-\d+$/.test(clean(id))) continue;

    // この行がどの要素節に属するか
    let owner = null;
    for (const e of elements) if (e.index <= offsets[i]) owner = e;

    criteria.push({
      id: clean(id), basis: normalise(basis), threshold: normalise(threshold),
      origin: firstWord(origin), verify: clean(verify), status: word(status),
      evidence: clean(evidence), element: owner ? owner.id : null,
      work: owner ? owner.work : null, line: i + 1,
    });
  }
}

if (!criteria.length) errors.push('基準行（BM-…）が1つも無い');

const seen = new Set();
for (const c of criteria) {
  if (seen.has(c.id)) errors.push(`${c.id}: ID が重複している`);
  seen.add(c.id);

  if (!c.element) errors.push(`${c.id}: どの要素節にも属していない`);
  if (!c.basis) errors.push(`${c.id}: 基準が空`);
  if (!c.threshold) errors.push(`${c.id}: 閾値が空`);
  if (!c.verify) errors.push(`${c.id}: 検証方法が空（未計測なら「どう測るか」を書くこと）`);

  if (!ORIGINS.has(c.origin)) {
    errors.push(`${c.id}: 閾値の出所 "${c.origin}" が不正。${[...ORIGINS].join(' / ')} のいずれか`);
  }
  if (!STATUSES.has(c.status)) {
    errors.push(`${c.id}: 状態 "${c.status}" が不正。${[...STATUSES].join(' / ')} のいずれか`);
  }

  // 誠実性 1: 判定済みには証拠が要る
  if (DECIDED.has(c.status) && (!c.evidence || c.evidence === '—' || c.evidence === '-')) {
    errors.push(`${c.id}: 状態 "${c.status}" だが証拠が空。証拠の無い判定はしない`);
  }
  // 誠実性 2: 実機・人間が要る検証を機械の合否にしない
  if (/実機|人間/.test(c.verify) && c.status !== '人間のみ') {
    errors.push(
      `${c.id}: 検証が実機または人間を要求している（"${c.verify}"）のに状態が "${c.status}"。` +
        `この環境に実機は無く、ブラインド評価も専門家承認も実施していない`
    );
  }
  // 誠実性 3: 実機の主張を証拠欄に書かない
  if (c.status !== '人間のみ' && /実機で(計測|確認|検証)|実機測定済|on device/i.test(c.evidence)) {
    errors.push(`${c.id}: 証拠が実機での計測を主張している。実機は存在しない`);
  }
}

// --- 模倣禁止スキャン -------------------------------------------------------
const walk = (p, out = []) => {
  const st = statSync(p);
  if (st.isDirectory()) { for (const f of readdirSync(p)) walk(join(p, f), out); }
  else if (SHIPPED_EXT.has(extname(p))) out.push(p);
  return out;
};
const scanned = [];
for (const target of SHIPPED) {
  const p = join(ROOT, target);
  if (existsSync(p)) walk(p, scanned);
}
let hits = 0;
for (const file of scanned) {
  const lower = readFileSync(file, 'utf8').toLowerCase();
  for (const tok of FORBIDDEN_TOKENS) {
    if (lower.includes(tok)) {
      hits++;
      errors.push(`模倣禁止違反の疑い: ${file.slice(ROOT.length + 1)} に "${tok}" が含まれる（§2.3）`);
    }
  }
}

// --- 閾値 lock --------------------------------------------------------------
const digestOf = (c) => createHash('sha256').update(`${c.id} ${c.basis} ${c.threshold}`).digest('hex');
const current = {};
for (const c of criteria) current[c.id] = digestOf(c);

// §9 変更履歴のうち、現 revision の行
let changelogRow = '';
for (const line of src.split('\n')) {
  if (!line.trim().startsWith('|')) continue;
  const c = splitRow(line);
  if (c.length >= 6 && benchRev && clean(c[1]) === benchRev) changelogRow = clean(c[3] || '') + ' ' + clean(c[4] || '');
}
if (benchRev && !changelogRow) errors.push(`§9 変更履歴に revision ${benchRev} の行が無い`);

let lock = null;
if (existsSync(LOCK)) lock = JSON.parse(readFileSync(LOCK, 'utf8'));

if (!lock) {
  if (!RELOCK) {
    errors.push('criteria.lock.json が無い。初回は `node tools/check_benchmarks.mjs --relock` で作成すること');
  }
} else {
  const added = Object.keys(current).filter((k) => !(k in lock.digests));
  const removed = Object.keys(lock.digests).filter((k) => !(k in current));
  const changed = Object.keys(current).filter((k) => k in lock.digests && lock.digests[k] !== current[k]);
  const touched = [...added, ...removed, ...changed];

  if (touched.length) {
    if (lock.benchmark_revision === benchRev) {
      errors.push(
        `同一 revision (${benchRev}) 内で基準が変更されている: ${touched.join(', ')}。` +
          `基準を変えるなら revision を上げ、§9 に ID と理由を記録すること（§2.4 基準を弱めない）`
      );
    } else {
      for (const id of touched) {
        if (!changelogRow.includes(id)) {
          errors.push(
            `${id} の基準または閾値が変更されているが、§9 の revision ${benchRev} の行に ID が無い（§2.4）`
          );
        }
      }
      if (!RELOCK) {
        warnings.push(`lock が古い（${lock.benchmark_revision} → ${benchRev}）。記録後に --relock で更新すること`);
      }
    }
  }
}

if (RELOCK && !errors.length) {
  writeFileSync(LOCK, JSON.stringify({
    schema_version: 1,
    note: 'sha256 of (id + basis + threshold) per criterion. Guards against silently lowering a standard so the current implementation passes.',
    benchmark_revision: benchRev,
    generated_at: new Date().toISOString(),
    digests: current,
  }, null, 2) + '\n');
}

// --- 報告 -------------------------------------------------------------------
const tally = {};
for (const c of criteria) tally[c.status] = (tally[c.status] || 0) + 1;
const byWork = {};
for (const e of elements) byWork[e.work] = (byWork[e.work] || 0) + 1;

console.log('参考基準の検証 (docs/benchmarks.md)');
console.log('─'.repeat(64));
console.log(`  benchmark_revision  ${benchRev || '(無し)'}`);
console.log(`  concept_revision    ${conceptRev || '(無し)'}`);
console.log(`  参考作品            ${works.size} 件`);
console.log(`  要素                ${elements.length} 件`);
console.log(`  基準                ${criteria.length} 件`);
for (const s of ['適合', '部分', '未達', '未計測', '人間のみ']) {
  if (tally[s]) console.log(`    ${s.padEnd(8)}        ${String(tally[s]).padStart(3)} 件`);
}
console.log(`  1作品あたり要素     ${Object.entries(byWork).map(([w, n]) => `${w}:${n}`).join(' ')}`);
console.log(`  模倣スキャン        ${scanned.length} ファイル / 検出 ${hits} 件`);
console.log(`  閾値 lock           ${lock ? `${Object.keys(lock.digests).length} 件 (${lock.benchmark_revision})` : '未作成'}` +
            `${RELOCK ? ' → 更新' : ''}`);
console.log('─'.repeat(64));

if (warnings.length) {
  console.log('');
  console.log('警告:');
  for (const w of warnings) console.log(`  ! ${w}`);
}
if (errors.length) {
  console.log('');
  console.log('不備:');
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log('');
  console.log(`参考基準の検証 失敗 — ${errors.length} 件`);
  process.exit(1);
}

console.log('');
console.log('参考基準の検証 OK');
console.log('（本検査は CINDERLINE 側の記述だけを検査する。参考作品を計測した事実は無い）');
