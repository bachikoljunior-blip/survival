# C36 independent review: original street clock loss

Author: `/root/integration_recovery_ultra/safari_time_loss_ultra/raw_clock_refuter_ultra`.
Scope: finite independent analysis of the recovered C34 source/PR original reports. No candidate edits; no remote writes, CI invocation, automation changes, new recording, media download, decoding, listening, or blind comparison.

**The original clock failures are reproducible from the raw endpoints. PR's two adjacent sample intervals account for 1.377333 seconds, or 74.0502% of the total 1.860000-second audio-minus-engine deficit. These intervals do not identify the responsible CPU operation. In particular, 894 ms is a render-listener sample gap, not a measured engine rAF delta or CPU duration.**

## Authority and integrity

The canonical GitHub App GET of `git/ref/heads/claude/repo-instructions-constraints-r0070m` returned `d2c463b54d4ea12abc0a9444627db810440a59a7`. I independently read `AGENTS.md`, then `CLAUDE.md`, then `AI_DEVELOPMENT/SESSION_STATE.yaml` at that SHA and accepted `ULTRA-CHILDREN-20260914-v3`; I subsequently read `AI_DEVELOPMENT/STATE.yaml`. This review is source-known technical analysis, not an anonymous quality evaluation. There are no grandchildren.

Fixed conditions remain: 19 elements / 71 criteria; all 19 `not measured`; valid blind comparisons 0; completed work units 0; continuous work; start `2026-09-13T20:56:49+09:00`; deadline `2026-09-20T20:56:49+09:00`. The acquisition guard remains `max(0.1 seconds, audioSeconds × 0.05)`, and `MAX_SUBSTEPS = 4`, fixed step `1/60`, and incoming delta cap `0.25` seconds remain unchanged. No concept, quality, STATE, BENCHMARKS, or product file is modified by this reviewer. The only remote writer remains `/root/integration_recovery_ultra`.

| Original report | Original job | Bytes | SHA-256 |
|---|---:|---:|---|
| source | 104050403522 | 911052 | `ff17eb9a3951c386f0fdd8b3afcff97c20d2ec937addf8c21c16f625aff4f685` |
| PR | 104050442233 | 939375 | `abf62e88aa00183e035453e63e9ab136597a1de79e230148177318f66533cf8e` |

Both byte counts and hashes were independently recomputed and match the respective recovered manifest's `report.json` entry. The original recordings were not reread or reobtained. The raw report's recorded run commits are source `81de9354117a54397bf2c9e64e18a91c397dd06a`, PR `6eaddedf951047c41c735bad4b6dfcf8b9e8946f`; both record product bundle SHA-256 `514f671fa64b75dda7f835a430245e9b168f9aca38fbce0b8184b12938679a55`. Thus this is not a controlled product A/B comparison, and the larger PR error does not establish a code regression.

The local recorder's computed Git blob SHA-1 `785541d3beaed0e35e8bcf042973eabb7bdb5d6c`, capture helper SHA-256 `1b3bc6fd170473c5f4ee9276699c51d12852f1ae1bd132c80ec6b00824cdf819`, and harness SHA-256 `ca130ee34963cd1b17b02519b6f013f7c0f1851529bfcee5e4dd072c4fec4779` match the recorded provenance in both originals. Read-only GitHub App fetches of `src/core/engine.js` at both original run commits returned blob `0735cfcb3f6df68bf5bd51fa84a27d60c712391e`, matching the local file. Full source fingerprints are in `calculations.json`.

## Independent arithmetic

For each interval, define loss = `(audioTime_after − audioTime_before) − (engineTime_after − engineTime_before)`. This is a clock deficit; it is not the CPU time spent in a named operation. The program independently computes from raw `before.state`, `after`, and `telemetry.clockFrames`, then verifies agreement with the report's summaries. It does not import or call the production summary function.

| Original / clip | Wall seconds | Audio seconds | Engine seconds | Engine/audio | Audio minus engine | Original guard |
|---|---:|---:|---:|---:|---:|---|
| source street | 8.475000 | 8.480000 | 8.033333 | 0.947327044 | 0.446667 s | fail; tolerance 0.424000 s |
| PR street | 10.102000 | 10.026667 | 8.166667 | 0.814494681 | 1.860000 s | fail; tolerance 0.501333 s |
| source gas | 8.566000 | 8.565333 | 8.566667 | 1.000155666 | −0.001333 s | pass |
| PR gas | 9.944000 | 9.941333 | 9.916667 | 0.997518777 | 0.024667 s | pass |
| source room | 6.253000 | 6.250667 | 6.250000 | 0.999893345 | 0.000667 s | pass |
| PR room | 8.982000 | 8.981333 | 8.900000 | 0.990944181 | 0.081333 s | pass |

Source misses the unchanged street tolerance by 22.666667 ms; PR misses it by 1358.666667 ms. Source wall-minus-engine is 441.666667 ms, while PR wall-minus-engine is 1935.333333 ms. Keep the wall and audio denominators distinct.

| Original / engine frames | Sample indices | Wall samples, ms | Wall gap, ms | Audio gap, ms | Engine advance, ms | Steps | Audio minus engine, ms |
|---|---|---|---:|---:|---:|---:|---:|
| PR 1438 → 1439 | 147 → 148 | 42975 → 43869 | 894 | 896.000000 | 33.333333 | 2 | 862.666667 |
| PR 1439 → 1440 | 148 → 149 | 43869 → 44450 | 581 | 581.333333 | 66.666667 | 4 | 514.666667 |
| source 1380 → 1381 | 187 → 188 | 33012 → 33261 | 249 | 253.333333 | 16.666667 | 1 | 236.666667 |
| source 1206 → 1207 | 13 → 14 | 29882 → 30046 | 164 | 160.000000 | 66.666667 | 4 | 93.333333 |
| source 1382 → 1383 | 189 → 190 | 33360 → 33503 | 143 | 138.666667 | 66.666667 | 4 | 72.000000 |

The two adjacent PR intervals total wall 1.475000 s, audio 1.477333 s, engine 0.100000 s: loss 1.377333 s. They comprise 74.0502% of the full-endpoint deficit, or 74.4773% of the first-to-last-clock-sample deficit. Source's two largest losses total 0.330000 s, 73.8806% of its full-endpoint deficit. All interval rows, including negative loss from catch-up/sampling phase, are retained in the CSV files; a sum of only positive errors is not the full net deficit.

Endpoint reconciliation is exact within floating-point tolerance:

| Original | First-to-last clock-sample loss | Last sample to `after` loss | Full loss |
|---|---:|---:|---:|
| source | 0.425333333 s | 0.021333333 s | 0.446666667 s |
| PR | 1.849333333 s | 0.010666667 s | 1.860000000 s |

For both street recordings, the first clock sample equals the before-state clock values. The final `after` has the same engine frame/time as the last render sample, but is 15 wall ms / 21.333333 audio ms later for source and 9 wall ms / 10.666667 audio ms later for PR. These tails explain the difference between interval sums and report-level totals; they must not be silently dropped to make the failure smaller. Removing a problematic interval is not a valid acquisition pass or repair.

Source has 464 clock samples / 463 consecutive engine-frame intervals. PR has 351 / 350. The inferred fixed-step histograms are source `{0:8, 1:439, 2:10, 3:1, 4:5}`, PR `{0:16, 1:218, 2:90, 3:12, 4:14}`. Steps are inferred from engine-time changes, not a directly recorded loop counter. All samples report `play`, `paused=false`, audio `running`, tier `low`; original telemetry buffer-drop counters and errors are zero.

## Why the cause is not identified

1. `clockFrames.wallMs` is assigned by `performance.now()` inside `sampleFrame`, which is registered on the engine's `render` event. The first sample is a direct setup-time `sampleFrame()` call, outside the render callback. Engine `_frame(now)` computes its input from the rAF argument `now − clockLast`, executes fixed-step updaters, increments `frame`, then emits `prerender` and `render`. The emitter synchronously invokes handlers in the stored order. Thus the report's sample point follows the engine update and can follow other work; it does not directly record engine entry, exit, or raw rAF input.

2. Let `p_i` be the recorded render-listener clock and `r_i` the unrecorded rAF argument. Let `o_i = p_i − r_i`. Then `Δp_i = Δr_i + (o_i − o_(i−1))`. A large sample gap can include increased dispatch/sample offset, and work after the preceding sample can contribute to the next gap. It is invalid to label `Δp_i` as a renderer duration, total callback CPU duration, or the exact delta the fixed-step loop consumed.

3. A falsifying conditional calculation is available. Assuming timeScale 1, no pause/clock reset, and an initial accumulator in `[0,1/60)`, feeding 894 ms into the unchanged engine rules necessarily gives 4 steps after the 250 ms clamp, while the observed interval has 2 steps. Feeding source's 249 ms likewise gives 4, while the observed interval has 1. This disproves the naive substitution of these render sample gaps for engine input deltas under those assumptions. With exactly 2 steps under these assumptions, the PR rAF delta lies strictly between 16.666667 and 50 ms, so its sample-minus-rAF offset must increase by more than 844 ms. That is a conditional timing-offset bound, not an observed CPU duration. `timeScale`, accumulator, pauses between renders, and `clockLast` resets were not recorded, so the report cannot independently verify all assumptions.

4. Even if the raw rAF delta were known, at least two classes of execution can share the reported clocks: expensive work inside the engine callback before the sample, or delay before engine entry with the sample occurring soon after entry. Within a callback, updater work, other event handlers, rendering/API waits, audio scheduling, and collection can also share the same endpoint clocks. No per-stage entry/exit, queue latency, CPU profile, renderer call duration, Web Audio scheduling duration, or recorder event duration exists in these reports. Naming one of these as the cause is unsupported.

5. All sampled `paused=false` values do not prove continuous nonpause: paused engine callbacks emit `renderpaused` and return before `frame++`/`render`, so this recording would omit those callbacks. Consecutive `engineFrame` values do not close that hole. Likewise `dropped=0` means the telemetry arrays did not overflow; it is not a log of every callback, every pause transition, or every audio state transition. All observed audio clocks being running is evidence about those samples, not a continuous state trace.

6. PR's movement-after snapshot is at wall 44351 ms, inside the second large interval, with engineFrame 1439, `stickActive=false`, and `moveMagnitude=1`. The next render sample is 44450 ms / frame 1440. Pointer records contain event types and trust data but no timestamps or handler durations. Therefore a post-gesture stale derived movement value is observed, but neither its CPU cause nor exact pointerup-to-next-update ordering/duration is recoverable. The 2 large gaps overlap the movement period; temporal overlap alone does not establish that the gesture, audio, canvas capture, or recorder caused them.

7. Source and PR record the same product bundle and recorder/helper/harness fingerprints, but different run timing and endpoints. Gas/room passing limits the observed failure to these particular recordings/conditions; it does not isolate a causal subsystem, show that moving is inherently broken, or establish that an unchanged retry would repair the product.

## Minimum useful next measurement

Preserve the original acquisition guard, caps, product quality, three original recordings, and source-known/quality distinction. A bounded diagnostic in the actual supported iOS Simulator Mobile Safari acquisition should add:

- Per rAF invocation: sequence id, raw rAF argument, `performance.now()` at callback entry and exit, `clockLast` before/after, unmodified raw and clamped delta, timeScale, accumulator before/after, executed steps, discarded backlog, engine frame/time, and branch outcome including paused/context-lost returns. Record setup/manual samples separately.
- Low-overhead elapsed timings for the complete updater chain and its named update functions, `prerender`, render dispatch and actual renderer calls, `_adapt`, and the telemetry callback. Where an aggregate first exposes cost, finer phase boundaries should identify the operation. Elapsed durations must be labelled as elapsed, not CPU on-core time; GPU waits and descheduling require separate evidence.
- Timestamped pause/focus/visibility/context events and `clockLast` resets; audio context state transitions. Record event boundaries rather than inferring continuous states from render samples.
- Timestamped pointerdown/move/up/cancel and handler entry/exit, the input update that consumes/releases movement, plus WebDriver movement/snapshot command boundaries. This separates the observed stale movement snapshot from actual lingering input.
- Timestamped recorder `dataavailable`/start/stop/error callbacks with byte counts and handler durations; bounded audio preparation/scheduling and render/capture API timing where relevant. No unmeasured subsystem should receive a causal label from nearby SFX timestamps alone.
- Instrumentation capacity/drop/error/cleanup accounting and measured observer cost, provenance of the diagnostic bundle/harness, full unsummarized trace export, and unchanged failure recording. A browser/OS trace is needed if callback elapsed time still leaves CPU versus scheduling/API wait unresolved. One successful instrumented run alone is not a fixed-product or blind-quality pass.

The purpose is to locate rAF-input loss versus callback-entry delay versus work before/after the current render sample, then identify the costly stage. No repeat recording or CI run was initiated by this reviewer.

## Reproduction and scope

`python /workspace/scratch/0b7ad82bafe7/c36-safari-time-loss-ultra/independent/recompute.py` ran successfully on the original local bytes, asserting manifest equality, all six clip summaries, exact interval telescoping, consecutive observed engine frames, fixed-step consistency, and recorder/helper/harness provenance equality. It writes `calculations.json` and the two interval CSVs. The conditional engine calculation is an explicitly simplified CPU calculation, not a real Safari trace or a reproduction of the unobserved rAF timestamps.

The original reports identify iPhone SE (3rd generation), iOS Simulator, Mobile Safari (reported iOS/Safari 18.5), landscape. Those are existing execution observations. This review newly performs only CPU-side arithmetic and source inspection. Physical-device CPU/GPU, thermal behavior, memory pressure, audio listening, visual quality, reference comparison, and quality completion remain unmeasured. All 19 element states and completed comparison/work counts remain unchanged.
