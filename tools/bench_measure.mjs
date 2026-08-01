#!/usr/bin/env node
/**
 * bench_measure.mjs — `docs/benchmarks.md` の「現状」列に入れる証拠を実測する。
 *
 * この道具は**現状の CINDERLINE だけ**を測る。参考作品は測らない。参考作品側の
 * 数値を測る手段はこの実行環境に存在せず、`docs/benchmarks.md` の参考作品側の
 * 記述は一般化された設計原則であって計測値ではない。両者を混ぜないこと。
 *
 * 測るもの（いずれも既存の道具が測っていなかったもの）:
 *
 *   1. 可視タッチ対象の実寸 — uiScale 0.8 / 1.0 / 1.5 における `.hit` 要素の
 *      CSS px 寸法、44px 未達の要素、対象同士の重なり (§11)
 *   2. シーン監査 — 影キャスタ数、スキンドメッシュ数、テクスチャ最大辺と
 *      推定テクスチャメモリ (§13 の予算のうち誰も測っていなかった3項目)
 *   3. 本番バンドルの実バイト数と sha256 (§13 初期ペイロード)
 *   4. `tools/perf.mjs` が同一環境で書いた `shots/perf.json` の要約の転記
 *      — `shots/` は .gitignore されており、証拠がリポジトリに残らない
 *        (docs/bible.md R-19)。ここで転記して永続化する
 *
 * 測らないもの、および主張してはならないもの:
 *
 *   · fps とフレーム時間。SwiftShader のソフトウェアラスタライザで走るため、
 *     いかなる fps もどの端末も代表しない (`tools/perf.mjs` と同じ理由)
 *   · 実機の挙動。この環境に iPhone SE 第3世代は存在しない (§13)
 *
 * 出力: AI_DEVELOPMENT/EVIDENCE/BENCH-BASELINE.json
 *
 *   node tools/bench_measure.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'AI_DEVELOPMENT', 'EVIDENCE');
mkdirSync(OUT, { recursive: true });

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/ が無い。先に `npm run build` を実行すること。');
  process.exit(2);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
};
const BASE = '/cinderline-bench';
const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (!p.startsWith(BASE)) { res.writeHead(404); res.end(); return; }
  p = p.slice(BASE.length) || '/';
  if (p.endsWith('/')) p += 'index.html';
  try {
    const body = readFileSync(join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, '')));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const bundleName = readFileSync(join(DIST, 'index.html'), 'utf8').match(/src="([^"]+\.js)"/)[1];
const bundleBuf = readFileSync(join(DIST, bundleName));

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
         '--no-sandbox', '--disable-gpu-sandbox', '--ignore-gpu-blocklist'],
});
// §1 の基準端末 iPhone SE 第3世代の横向き CSS 解像度。**エミュレーションである。**
const ctx = await browser.newContext({
  viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String((e && e.stack) || e)));

await page.goto(`http://127.0.0.1:${port}${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready === true', null, { timeout: 120000 });

// タイトルを抜けて実際の HUD を出す。測るのは「画面に出ている対象」であって
// スタイルシートの宣言値ではない。
await page.evaluate(() => {
  const C = window.CINDERLINE;
  C.game.menus.hideTitle();
  C.game.setMode(C.MODE.PLAY);
  C.game.hud.setVisible(true);
});
await page.waitForTimeout(900);

// --- 1. 可視タッチ対象 ------------------------------------------------------
const MIN_TOUCH_CSS_PX = 44; // §11: タッチターゲット 44 CSS px 以上
const touchTargets = {};
for (const scale of [0.8, 1.0, 1.5]) {
  await page.evaluate((v) => {
    const g = window.CINDERLINE.game;
    g.applySettings({ ...g.settings, uiScale: v });
  }, scale);
  await page.waitForTimeout(260);

  touchTargets[scale.toFixed(2)] = await page.evaluate((min) => {
    const seen = [];
    for (const el of document.querySelectorAll('.hit')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 0.5 || r.height < 0.5) continue;
      seen.push({
        label: (el.className || '').toString().trim() + (el.textContent ? ` "${el.textContent.trim().slice(0, 10)}"` : ''),
        w: +r.width.toFixed(1), h: +r.height.toFixed(1),
        x: +r.x.toFixed(1), y: +r.y.toFixed(1),
      });
    }
    const overlaps = [];
    for (let i = 0; i < seen.length; i++) {
      for (let j = i + 1; j < seen.length; j++) {
        const a = seen[i], b = seen[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 0.5 && oy > 0.5) {
          overlaps.push({ a: a.label, b: b.label, overlapPx: +(ox * oy).toFixed(1) });
        }
      }
    }
    const below = seen.filter((t) => Math.min(t.w, t.h) < min);
    return {
      visibleCount: seen.length,
      minSidePx: seen.length ? +Math.min(...seen.map((t) => Math.min(t.w, t.h))).toFixed(1) : null,
      belowMinimum: below.map((t) => ({ label: t.label, w: t.w, h: t.h })),
      overlappingPairs: overlaps,
      targets: seen,
    };
  }, MIN_TOUCH_CSS_PX);
}
// 既定値へ戻す。
await page.evaluate(() => {
  const g = window.CINDERLINE.game;
  g.applySettings({ ...g.settings, uiScale: 1.0 });
});

// --- 2. シーン監査 ----------------------------------------------------------
// 「画面内」ではなく**シーン全体**を数える。フラスタム内訳はこの道具では出せない
// ため、§13 の「画面内」予算に対する**上界**として読むこと。
const sceneAudit = await page.evaluate(() => {
  const C = window.CINDERLINE;
  let shadowCasters = 0, skinned = 0, meshes = 0;
  const texSeen = new Set();
  let maxEdge = 0, estBytes = 0;
  const noteTex = (t) => {
    if (!t || !t.image || texSeen.has(t.uuid)) return;
    texSeen.add(t.uuid);
    const w = t.image.width || 0, h = t.image.height || 0;
    maxEdge = Math.max(maxEdge, w, h);
    // RGBA8 + mipmap の概算 (4 bytes/px * 4/3)。圧縮テクスチャは使っていない。
    estBytes += w * h * 4 * (t.generateMipmaps === false ? 1 : 4 / 3);
  };
  C.scene.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    meshes++;
    if (o.isSkinnedMesh) skinned++;
    if (o.castShadow && o.visible) shadowCasters++;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']) {
        noteTex(m[k]);
      }
    }
  });
  return {
    note: 'scene-wide counts, not per-frame frustum counts; an upper bound on the §13 on-screen budgets',
    meshes, shadowCastersVisible: shadowCasters, skinnedMeshes: skinned,
    textureCount: texSeen.size, maxTextureEdgePx: maxEdge,
    estimatedTextureMemoryMB: +(estBytes / 1048576).toFixed(1),
    rendererTextures: C.engine.renderer.info.memory.textures,
    rendererGeometries: C.engine.renderer.info.memory.geometries,
  };
});

// --- 3. 音声アンロック状態 (§10) -------------------------------------------
// 起動直後、ユーザー操作前は unlocked=false でなければならない。
const audio = await page.evaluate(() => {
  const a = window.CINDERLINE.game.audio;
  return { exists: !!a, unlockedBeforeGesture: a ? !!a.unlocked : null, ctxState: a && a.ctx ? a.ctx.state : null };
});

// --- 4. tools/perf.mjs の同環境結果の転記 -----------------------------------
let perfSummary = null;
const perfPath = join(ROOT, 'shots', 'perf.json');
if (existsSync(perfPath)) {
  const p = JSON.parse(readFileSync(perfPath, 'utf8'));
  const per = (rows) => ({
    maxDraws: Math.max(...rows.map((r) => r.draws)),
    maxTrisPerFrame: Math.max(...rows.map((r) => r.tris)),
    maxPrograms: Math.max(...rows.map((r) => r.programs)),
    backingResolution: rows[0].res,
  });
  perfSummary = {
    source: 'tools/perf.mjs -> shots/perf.json (gitignored; summarised here so the evidence survives)',
    tiers: Object.fromEntries(Object.entries(p.tiers).map(([k, v]) => [k, per(v)])),
    simulationStepMs: p.sim ? { mean: +p.sim.meanMs.toFixed(3), p50: p.sim.p50, p90: p.sim.p90, p99: p.sim.p99, max: p.sim.max, actors: p.sim.actors, note: 'fixedUpdate only; render(), scene traversal, culling and post are NOT included' } : null,
    heap: p.memory && p.memory.supported ? { beforeMB: +p.memory.beforeMB.toFixed(1), afterMB: +p.memory.afterMB.toFixed(1), growthKBPerSecond: +p.memory.growthKBPerSecond.toFixed(1), steps: p.memory.steps, note: 'fixedUpdate loop only' } : null,
    build: p.build || null,
  };
}

const out = {
  schema_version: 1,
  artifact: 'BENCH-BASELINE',
  purpose: 'Current-state evidence for the per-element reference benchmark in docs/benchmarks.md.',
  generated_at: new Date().toISOString(),
  environment: {
    browser: 'Playwright Chromium with SwiftShader (software rasteriser)',
    viewport: '667x375 CSS px, deviceScaleFactor 2, isMobile, hasTouch',
    real_device: false,
    device_claim: 'NONE. No physical iPhone SE 3 result exists. Frame rate and frame time are deliberately not measured here.',
    node: process.version,
  },
  binding: {
    bundle: bundleName,
    bundleBytes: bundleBuf.length,
    bundleSha256: createHash('sha256').update(bundleBuf).digest('hex'),
  },
  reference_works_measured: false,
  reference_works_note: 'No reference title was run, measured, or compared side by side in this environment. Reference-side statements in docs/benchmarks.md are generalised design principles, not measurements.',
  touchTargets,
  sceneAudit,
  audio,
  perfSummary,
  pageErrors: errors,
};

const outPath = join(OUT, 'BENCH-BASELINE.json');
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');

// --- 報告 -------------------------------------------------------------------
console.log('CINDERLINE ベンチマーク基準計測');
console.log('─'.repeat(64));
console.log(`  環境                Chromium + SwiftShader / 667x375 / 実機ではない`);
console.log(`  バンドル            ${(bundleBuf.length / 1024).toFixed(0)} KB  ${out.binding.bundleSha256.slice(0, 12)}…`);
console.log('');
console.log('  可視タッチ対象 (§11: 44 CSS px 以上)');
for (const [scale, r] of Object.entries(touchTargets)) {
  const flag = r.belowMinimum.length ? '✗' : '✓';
  console.log(`    uiScale ${scale}  ${flag} 対象 ${String(r.visibleCount).padStart(2)} 件 / ` +
              `最小辺 ${String(r.minSidePx).padStart(5)} px / 44px未満 ${r.belowMinimum.length} 件 / 重なり ${r.overlappingPairs.length} 組`);
}
console.log('');
console.log('  シーン監査 (シーン全体。画面内予算に対する上界)');
console.log(`    影キャスタ          ${sceneAudit.shadowCastersVisible}   (§13 画面内 2 以下)`);
console.log(`    スキンドメッシュ    ${sceneAudit.skinnedMeshes}   (§13 画面内 8 以下)`);
console.log(`    テクスチャ最大辺    ${sceneAudit.maxTextureEdgePx} px   (§13 最大辺 2048)`);
console.log(`    推定テクスチャ mem  ${sceneAudit.estimatedTextureMemoryMB} MB   (§13 200MB 以下)`);
console.log('');
console.log(`  音声アンロック        操作前 unlocked=${audio.unlockedBeforeGesture} / ctx=${audio.ctxState}   (§10)`);
if (perfSummary) {
  console.log('');
  console.log('  tools/perf.mjs の転記 (ドローコール §13 通常150/最悪250、三角形 30万)');
  for (const [t, v] of Object.entries(perfSummary.tiers)) {
    console.log(`    ${t.padEnd(7)} 最大draws ${String(v.maxDraws).padStart(4)} / 最大tris ${String(v.maxTrisPerFrame).padStart(8)} / ${v.backingResolution}`);
  }
}
console.log('');
console.log(`  ページエラー          ${errors.length} 件`);
console.log('─'.repeat(64));
console.log(`書き出し: AI_DEVELOPMENT/EVIDENCE/BENCH-BASELINE.json`);
if (errors.length) { console.log('\n--- errors ---'); console.log(errors.join('\n')); }

await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
