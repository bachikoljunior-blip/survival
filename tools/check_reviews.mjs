#!/usr/bin/env node
/**
 * check_reviews.mjs — docs/directive.md §15 / §16 の批評記録の自動検証。
 *
 * 検証すること:
 *   1. 指定ゲートの批評記録が docs/reviews/ に存在する
 *   2. 各記録が「独立性メタデータ」を持つ (ゲート / 対象 / 批評者 / 入力)
 *   3. 各指摘が §15 の要求する全列を持つ
 *      (severity / 対象箇所 / 証拠・再現手順 / 推奨対応 / 状態)
 *   4. 指定ゲートに未解決の critical (Gate B 以降は high も) が無い
 *
 * §15 は「良い」「問題なさそう」だけの批評を無効と定めている。
 * 証拠列または推奨対応列が空の指摘は、記録として無効とみなし失敗させる。
 *
 * 批評記録の書式 (docs/reviews/*.md):
 *
 *     # <タイトル>
 *
 *     - **ゲート**: A
 *     - **対象**: docs/bible.md
 *     - **批評者**: 独立批評エージェント（物語・世界整合性）
 *     - **入力**: docs/bible.md, docs/reviews/gate-a-concepts.md
 *
 *     ## 指摘
 *
 *     | ID | severity | 指摘 | 対象箇所 | 証拠・再現手順 | 推奨対応 | 状態 |
 *     |---|---|---|---|---|---|---|
 *     | N-01 | critical | … | docs/bible.md §3 | … | … | 解決済 |
 *
 *   node tools/check_reviews.mjs --gate A
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REVIEWS = join(ROOT, 'docs', 'reviews');

const gateArg = process.argv.indexOf('--gate');
const GATE = gateArg >= 0 ? (process.argv[gateArg + 1] || '').toUpperCase() : '';
if (!/^[ABCD]$/.test(GATE)) {
  console.error('使い方: node tools/check_reviews.mjs --gate <A|B|C|D>');
  process.exit(2);
}

/** Gate A は critical のみ、Gate B 以降は high も通過阻害要因。§16 より。 */
const BLOCKING = GATE === 'A'
  ? new Set(['blocker', 'critical'])
  : new Set(['blocker', 'critical', 'high']);

const SEVERITIES = new Set(['blocker', 'critical', 'high', 'medium', 'low']);
const RESOLVED = new Set(['解決済', '対応不要', '却下']);
const UNRESOLVED = new Set(['未解決', '対応中']);

/**
 * 状態列は「解決済 — どう解決したかの説明」の形を許す。
 *
 * 説明は残したいが、状態は機械的に判定できなければならない。そこで区切り
 * (— または -) より前だけを状態語として扱い、そこは列挙値との完全一致を
 * 要求する。「たぶん直った」のような自由記述は通らない。
 */
function statusWord(cell) {
  return cell.split(/\s+[—–-]\s+/)[0].trim();
}

const errors = [];
const findings = [];
let reviewCount = 0;

if (!existsSync(REVIEWS)) {
  errors.push('docs/reviews/ が存在しない。批評記録なしにゲートは通過できない (§15)。');
} else {
  const files = readdirSync(REVIEWS).filter((f) => f.endsWith('.md')).sort();

  for (const file of files) {
    const src = readFileSync(join(REVIEWS, file), 'utf8');

    const meta = {};
    for (const m of src.matchAll(/^\s*-\s*\*\*(.+?)\*\*\s*[:：]\s*(.+?)\s*$/gm)) {
      if (!(m[1] in meta)) meta[m[1]] = m[2];
    }

    if (!meta['ゲート']) continue; // ゲートに紐づかない記録は対象外
    const fileGate = meta['ゲート'].trim().toUpperCase();
    if (fileGate !== GATE) continue;

    reviewCount++;

    for (const field of ['対象', '批評者', '入力']) {
      if (!meta[field]) {
        errors.push(`${file}: メタデータ「${field}」が無い (§14 批評者の独立性)`);
      }
    }

    // §14: 批評エージェントは実装エージェントの報告や要約を入力にできない。
    if (meta['入力'] && /報告|要約|サマリ|summary/i.test(meta['入力'])) {
      errors.push(
        `${file}: 入力に実装側の報告・要約が含まれている疑い ("${meta['入力']}")。` +
          `§14 は成果物・実ビルド・DONE.md のみを入力と定める。`
      );
    }

    for (const line of src.split('\n')) {
      if (!line.trim().startsWith('|')) continue;
      const c = line.split('|').map((x) => x.trim());
      if (c.length < 9) continue; // ID..状態 の7列 + 前後の空 = 9
      const [, id, sev, desc, where, evidence, action, status] = c;
      if (!SEVERITIES.has(sev.toLowerCase())) continue; // ヘッダ行・区切り行

      const f = {
        file, id, sev: sev.toLowerCase(), desc, where, evidence, action,
        status: statusWord(status), statusFull: status,
      };
      findings.push(f);

      if (!id) errors.push(`${file}: ID の無い指摘がある`);
      if (!desc) errors.push(`${file} ${id}: 指摘内容が空`);
      if (!where) errors.push(`${file} ${id}: 対象箇所が空 (§15)`);
      if (!evidence) errors.push(`${file} ${id}: 証拠・再現手順が空 (§15 — 根拠なき批評は無効)`);
      if (!action) errors.push(`${file} ${id}: 推奨対応が空 (§15)`);
      if (!RESOLVED.has(f.status) && !UNRESOLVED.has(f.status)) {
        errors.push(
          `${file} ${id}: 状態 "${f.status}" が不正。` +
            `${[...RESOLVED, ...UNRESOLVED].join(' / ')} のいずれかにすること` +
            `（「解決済 — 説明」の形は可）`
        );
      }
    }
  }
}

if (reviewCount === 0 && errors.length === 0) {
  errors.push(`Gate ${GATE} に紐づく批評記録が docs/reviews/ に1件も無い (§15)。`);
}

const unresolvedBlocking = findings.filter(
  (f) => BLOCKING.has(f.sev) && UNRESOLVED.has(f.status)
);

const bySev = {};
for (const f of findings) bySev[f.sev] = (bySev[f.sev] || 0) + 1;

console.log(`批評記録の検証 (Gate ${GATE})`);
console.log('─'.repeat(58));
console.log(`  対象記録            ${reviewCount} 件`);
console.log(`  指摘総数            ${findings.length} 件`);
for (const s of ['blocker', 'critical', 'high', 'medium', 'low']) {
  if (bySev[s]) {
    const open = findings.filter((f) => f.sev === s && UNRESOLVED.has(f.status)).length;
    console.log(`    ${s.padEnd(18)}${bySev[s]} 件 (未解決 ${open})`);
  }
}
console.log(`  通過阻害 severity   ${[...BLOCKING].join(', ')}`);
console.log('─'.repeat(58));

if (unresolvedBlocking.length) {
  console.log('');
  console.log('未解決の通過阻害指摘:');
  for (const f of unresolvedBlocking) {
    console.log(`  ✗ [${f.sev}] ${f.file} ${f.id} — ${f.desc}`);
  }
}

if (errors.length) {
  console.log('');
  console.log('記録の不備:');
  for (const e of errors) console.log(`  ✗ ${e}`);
}

if (errors.length || unresolvedBlocking.length) {
  console.log('');
  console.log(
    `Gate ${GATE} 批評検証 失敗 — ` +
      `未解決 ${unresolvedBlocking.length} 件 / 記録不備 ${errors.length} 件`
  );
  process.exit(1);
}

console.log('');
console.log(`Gate ${GATE} 批評検証 OK`);
