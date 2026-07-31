#!/usr/bin/env node
/**
 * check_scope.mjs — docs/directive.md §5 / §16 Gate A6 の自動検証。
 *
 * バイブル (docs/bible.md) に「スコープ確定数値」が実際に**数値として**
 * 記載されていることを検証する。
 *
 * §5 が要求する6項目:
 *   エリア数 / クエスト数 / エンディング数 / 敵アーキタイプ数 /
 *   想定プレイ時間 / 対話ノード数の概算
 *
 * バイブル側の記法は「スコープ確定数値」という見出しの下に、
 *
 *     | 項目 | 数値 | 根拠 |
 *     |---|---|---|
 *     | エリア数 | 5 | … |
 *
 * という表を置くこと。数値列に数字が1つも含まれない行は「未記載」として
 * 失敗させる。「後で決める」「TBD」「〜程度」だけの行は通さない。
 *
 *   node tools/check_scope.mjs
 *   node tools/check_scope.mjs --against-content   (Gate C2: 実コンテンツと突合)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIBLE = join(ROOT, 'docs', 'bible.md');

const AGAINST_CONTENT = process.argv.includes('--against-content');

/** §5 が列挙する6項目。key は表の「項目」列にこの語を含むことを要求する。 */
const REQUIRED = [
  { key: 'エリア数', aliases: ['エリア数', 'エリア'] },
  { key: 'クエスト数', aliases: ['クエスト数', 'クエスト'] },
  { key: 'エンディング数', aliases: ['エンディング数', 'エンディング'] },
  { key: '敵アーキタイプ数', aliases: ['敵アーキタイプ数', '敵アーキタイプ'] },
  { key: '想定プレイ時間', aliases: ['想定プレイ時間', 'プレイ時間'] },
  { key: '対話ノード数', aliases: ['対話ノード数', '対話ノード'] },
];

/** 数値が入っていないことを示す語。これしか無い行は未記載扱い。 */
const NON_COMMITTAL = /^(TBD|未定|後で決める|検討中|—|-|N\/A)$/i;

const errors = [];
const found = new Map();

if (!existsSync(BIBLE)) {
  errors.push(`docs/bible.md が存在しない。Gate A6 は判定できない。`);
} else {
  const src = readFileSync(BIBLE, 'utf8');

  // 「スコープ確定数値」セクションを探す。見出しレベルは問わない。
  const secIdx = src.indexOf('スコープ確定数値');
  if (secIdx < 0) {
    errors.push(
      `docs/bible.md に「スコープ確定数値」の見出しが無い。` +
        `§5 は Gate C の判定がこれを参照すると定めている。`
    );
  }

  // 表の行をすべて拾い、項目名 -> 数値 のマップを作る。
  // セクション外にも同名の行がありうるので、セクション以降を優先して走査する。
  const scanFrom = secIdx >= 0 ? secIdx : 0;
  const rows = src.slice(scanFrom).split('\n').filter((l) => l.trim().startsWith('|'));

  for (const row of rows) {
    const cells = row.split('|').map((c) => c.trim());
    // 先頭と末尾は空文字になる
    if (cells.length < 4) continue;
    const label = cells[1];
    const value = cells[2];
    if (!label || /^-+$/.test(label)) continue;

    for (const req of REQUIRED) {
      if (found.has(req.key)) continue;
      if (!req.aliases.some((a) => label.includes(a))) continue;

      if (!value || NON_COMMITTAL.test(value)) {
        errors.push(`「${req.key}」の数値列が未記載 (値: "${value}")`);
        found.set(req.key, null);
      } else if (!/\d/.test(value)) {
        errors.push(`「${req.key}」の数値列に数字が無い (値: "${value}")`);
        found.set(req.key, null);
      } else {
        found.set(req.key, value);
      }
    }
  }

  for (const req of REQUIRED) {
    if (!found.has(req.key)) {
      errors.push(`「${req.key}」の行が「スコープ確定数値」の表に無い`);
    }
  }
}

console.log('スコープ確定数値の検証 (Gate A6)');
console.log('─'.repeat(58));
for (const req of REQUIRED) {
  const v = found.get(req.key);
  const mark = v ? '  ok ' : '  NG ';
  console.log(`${mark}${req.key.padEnd(20, '　')} ${v ?? '(未記載)'}`);
}
console.log('─'.repeat(58));

if (AGAINST_CONTENT) {
  // Gate C2: バイブルの数値と実コンテンツの実測を突き合わせる。
  //
  // 数字が書いてあるかだけの検査は、書いてある数字が間違っていることを
  // 捕捉できない。実際、エリア数は「15（屋外9）」と誤記され、根拠として
  // region を一切出力しない validate.mjs が挙げられていた。人手で気づく
  // までそのままだった。
  //
  // 敵アーキタイプは **定義された数ではなく本編で spawn される数** も
  // 数える。定義だけ数えると「5種あるが2種は本編に出ない」を見逃す。
  const { readFileSync } = await import('node:fs');
  const story = await import('../src/content/story.js');
  const wd = await import('../src/content/world_data.js');

  const buildWorld = wd.buildWorldData || wd.default ||
    Object.values(wd).find((v) => typeof v === 'function');
  const world = buildWorld();

  const aiSrc = readFileSync(join(ROOT, 'src', 'game', 'ai.js'), 'utf8');
  const dirSrc = readFileSync(join(ROOT, 'src', 'game', 'director.js'), 'utf8');

  // ARCHETYPES の定義キー
  const archBlock = aiSrc.slice(aiSrc.indexOf('ARCHETYPES'));
  const defined = new Set(
    [...archBlock.slice(0, archBlock.indexOf('\n};')).matchAll(/^\s{2}(\w+):\s*\{/gm)]
      .map((m) => m[1])
  );

  // _spawnRaid(..., [['kind', x, z], ...]) から本編配置を数える
  const placed = new Map();
  for (const m of dirSrc.matchAll(/\[\s*'(\w+)'\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\]/g)) {
    if (defined.has(m[1])) placed.set(m[1], (placed.get(m[1]) || 0) + 1);
  }

  const nodes = Object.values(story.CONVERSATIONS)
    .reduce((n, c) => n + Object.keys(c.nodes || {}).length, 0);
  const steps = Object.values(story.QUESTS)
    .reduce((n, q) => n + (q.steps || []).length, 0);

  const actual = {
    'エリア数': [
      world.regions.length + world.interiors.length,
      world.regions.length,
      world.interiors.length,
    ],
    'クエスト数': [Object.keys(story.QUESTS).length, steps],
    'エンディング数': [
      Object.keys(story.ENDINGS).length,
      (story.EPILOGUE_BEATS || []).length,
    ],
    '敵アーキタイプ数': [defined.size, placed.size],
    // 総語数は validate.mjs が別のアルゴリズムで数えるので、ここでは
    // ノード数と会話数だけを突き合わせる（記載側の3つ目は比較しない）。
    '対話ノード数': [nodes, Object.keys(story.CONVERSATIONS).length],
  };

  console.log('');
  console.log('実コンテンツとの突合 (Gate C2)');
  console.log('─'.repeat(58));

  const mismatches = [];
  for (const [key, want] of Object.entries(actual)) {
    if (!want) continue;
    const cell = found.get(key);
    if (!cell) { mismatches.push(`${key}: バイブルに行が無い`); continue; }
    const got = [...cell.matchAll(/\d+/g)].map((m) => Number(m[0]));
    const cmp = want.map((w, i) => (got[i] === w ? 'ok' : 'NG'));
    const bad = cmp.includes('NG');
    console.log(`  ${bad ? 'NG' : 'ok'}  ${key.padEnd(18, '　')} 記載 [${got.join(', ')}] / 実測 [${want.join(', ')}]`);
    if (bad) mismatches.push(`${key}: 記載 [${got.join(', ')}] ≠ 実測 [${want.join(', ')}]`);
  }

  console.log(`  --  想定プレイ時間　　　 未計測のため突合できない`);
  console.log('─'.repeat(58));
  console.log(`  敵アーキタイプ 定義: ${[...defined].join(', ')}`);
  console.log(`  敵アーキタイプ 本編配置: ${[...placed].map(([k, v]) => `${k}×${v}`).join(', ')}`);
  const unplaced = [...defined].filter((d) => !placed.has(d));
  if (unplaced.length) {
    console.log(`  **本編に配置されていないアーキタイプ: ${unplaced.join(', ')}**`);
  }

  if (mismatches.length || errors.length) {
    console.log('');
    for (const e of errors) console.log(`  ✗ ${e}`);
    for (const m of mismatches) console.log(`  ✗ ${m}`);
    console.log('');
    console.log('実コンテンツ突合 失敗');
    process.exit(1);
  }
  console.log('');
  console.log('実コンテンツ突合 OK');
  process.exit(0);
}

if (errors.length) {
  console.log('');
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log('');
  console.log(`スコープ検証 失敗 — ${errors.length} 件`);
  process.exit(1);
}

console.log('');
console.log('スコープ検証 OK');
