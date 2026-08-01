# Benchmark index

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
| `../EVIDENCE/BENCH-BASELINE.json` | Measured current state, bound to the built bundle's sha256 |

## Commands

```
node tools/bench_measure.mjs      # measure the current build, rewrite BENCH-BASELINE.json
node tools/check_benchmarks.mjs   # structure, honesty, no-imitation scan, threshold lock
node tools/check_benchmarks.mjs --relock   # only after recording the change in §9
```

## Rules that this directory enforces

1. **No reference title has been run, measured, screenshotted or compared side by side.**
   Reference-side statements are generalised design principles, never measurements.
2. A criterion whose verification needs a physical device or a human cannot be marked
   `適合`. `tools/check_benchmarks.mjs` fails the run if it is.
3. `未計測` is unknown, not passed.
4. Changing a criterion or threshold inside one `benchmark_revision` fails the check.
   Changing it across revisions requires the criterion ID in the change log.
