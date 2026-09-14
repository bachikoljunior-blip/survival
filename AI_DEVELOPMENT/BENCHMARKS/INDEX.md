# Benchmark index

固定指示・完了・要素比較・継続・スマートフォン代替検証は `CLAUDE.md` の最新ユーザー全文を優先する。作業回数・初回開始・期限・続行地点の正本は `AI_DEVELOPMENT/SESSION_STATE.yaml`。その他の状態は `AI_DEVELOPMENT/STATE.yaml`。退役手順を必須に戻さない。既存の製品要件と過去の証拠は保持し、旧ビルドの記録を現行判定と混同しない。

Every number records the measured environment. Headless SwiftShader results are not physical-device results. No iPhone SE 3 performance result exists yet.

## Authority

The per-element reference benchmark — which real game is the quality standard for
each element, why it was chosen, the criteria derived from it, and the current gap —
lives in **`docs/benchmarks.md`**. Do not copy its content here (`AI_DEVELOPMENT/INDEX.md`
forbids duplicating product text into this directory).

| Artifact | Role |
|---|---|
| `docs/benchmarks.md` | Authority: concept in force, per-element reference works, selection rationale, criteria, current gap, change log |
| `criteria.lock.json` | sha256 of every criterion's (id + basis + threshold). Guards against silently lowering a standard so the current implementation passes |
| `../EVIDENCE/BENCH-BASELINE.json` | Historical measurements, applicable only to their recorded bundle sha256 |

## Commands

```
node tools/bench_measure.mjs      # measure the current build, rewrite BENCH-BASELINE.json
node tools/check_benchmarks.mjs   # structure, honesty, no-imitation scan, threshold lock
node tools/check_benchmarks.mjs --relock   # only after recording the change in §9
```

## Current interpretation

`CLAUDE.md` is the full authority for selection, source-blind comparison and smartphone alternatives. Current element judgments and their build/comparison links are in `elements.json`; the locked criteria and old baseline remain diagnostic evidence, not a substitute for comparison. The work reader validates the single work state, first-start deadline, completed comparison ledger, material and build hashes, and the three allowed verdicts. It cannot itself attest that an evaluator was actually blind. Historical physical-device or human-only exclusions do not apply.
