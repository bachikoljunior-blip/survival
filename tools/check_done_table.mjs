#!/usr/bin/env node
/**
 * check_done_table.mjs — docs/DONE.md の「検証スクリプトの実装状況」表の自己検査。
 *
 * この表は一度、実在する3ファイルを「未実装」「未作成」と記載したまま放置され、
 * 独立批評2件に同時に指摘された。DONE.md 冒頭の規定により、表が「未実装」と
 * 書いている限りその自動検証は通過の根拠にできない。**陳腐化した表は
 * ゲート判定の土台を侵す。**
 *
 * したがって両方向を検査する:
 *   - 「実装済み」と書いたファイルが存在しない  -> 失敗（嘘の主張）
 *   - 「未実装」と書いたファイルが存在する      -> 失敗（陳腐化）
 *
 * 後者を失敗にすることが肝で、前者だけの検査は今回の事故を捕捉できない。
 *
 *   node tools/check_done_table.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DONE = join(ROOT, 'docs', 'DONE.md');

if (!existsSync(DONE)) {
  console.error('docs/DONE.md が存在しない。');
  process.exit(1);
}

const src = readFileSync(DONE, 'utf8');
const secIdx = src.indexOf('検証スクリプトの実装状況');
if (secIdx < 0) {
  console.error('docs/DONE.md に「検証スクリプトの実装状況」の節が無い。');
  process.exit(1);
}

/**
 * 状況セルが「未実装」「未作成」を主張しているか。
 *
 * **太字**で書かれたものだけを行の判定とみなす。単純な部分一致にすると、
 * 「実装済み。ただし〜は未実装」のように補足で触れた行を未実装と誤判定する
 * （実際に `tools/perf.mjs` の行で誤検出した）。太字はこの表における
 * 「この行の結論」の印であり、補足の散文と区別できる。
 */
const claimsMissing = (s) => /\*\*(未実装|未作成)\*\*/.test(s);

const rows = [];
for (const line of src.slice(secIdx).split('\n')) {
  if (!line.trim().startsWith('|')) continue;
  const c = line.split('|').map((x) => x.trim());
  if (c.length < 5) continue;

  // 第1セルからバッククォート括りのパスを取り出す。無い行はヘッダ等。
  const m = c[1].match(/`([^`]+)`/);
  if (!m) continue;
  rows.push({ path: m[1], use: c[2], status: c[3] });
}

if (rows.length === 0) {
  console.error('表からパスを1件も読み取れなかった。書式が変わった可能性がある。');
  process.exit(1);
}

const errors = [];
console.log('DONE.md 実装状況表の検査');
console.log('─'.repeat(72));

for (const r of rows) {
  const exists = existsSync(join(ROOT, r.path));
  const missing = claimsMissing(r.status);

  let verdict;
  if (missing && exists) {
    verdict = 'NG 陳腐化';
    errors.push(
      `${r.path}: 表は「未実装/未作成」と書いているが、ファイルは存在する。` +
        `この記載のままでは、この検証をゲート通過の根拠にできない。`
    );
  } else if (!missing && !exists) {
    verdict = 'NG 虚偽';
    errors.push(`${r.path}: 表は実装済みとしているが、ファイルが存在しない。`);
  } else {
    verdict = ' ok ';
  }
  console.log(`  ${verdict}  ${r.path.padEnd(34)} ${missing ? '未実装と記載' : '実装済みと記載'}`);
}

console.log('─'.repeat(72));

if (errors.length) {
  console.log('');
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log('');
  console.log(`DONE.md 表の検査 失敗 — ${errors.length} 件`);
  process.exit(1);
}

console.log('');
console.log(`DONE.md 表の検査 OK — ${rows.length} 行すべてが実態と一致`);
