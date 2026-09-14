# C36 original profile: independent finite review

Owner: `/root/integration_recovery_ultra/safari_time_loss_ultra/raw_clock_refuter_ultra`.

**The recovered original and all 1491 export chunks are byte-identical. The new supported Safari run still fails the street acquisition clock guard: audio exceeds engine time by 1.092666667 seconds. The profile locates the longest observed callback delay inside the grouped renderer calls and exposes a further gap outside the callback, but it does not distinguish CPU execution, GPU/API blocking or scheduling. It cannot identify the cause of the older C34 failures retroactively.**

## Original identity and verified scope

The assigned branch head `789f2199bd3791a6dc6566eecaf3c1478c99afa6` was independently obtained through the GitHub App, followed in order by AGENTS → CLAUDE → SESSION. `ULTRA-CHILDREN-20260914-v3` was reaccepted. The original job is Safari `104080730225`, source Floor run `34875252891`, attempt `1`.

| Input | Bytes | SHA-256 |
|---|---:|---|
| Original report | 4472434 | `b2de6f0b9ce375082be62762ee2f880fd47ab0c2bfbcbb7f65923d44b1b2cbe8` |
| Final decoded job log | 6256481 | `b9a2d04ea04cb1f47dc0a5c109c7e79546aae8b2263886130b92cc8da6a7af50` |

The independent verifier reads the final log, requires exactly one meta record, 1491 ordered chunks and one identical end record, verifies each 3000-byte chunk except the final 2434 bytes, rejects duplicate/missing/reordered chunks, verifies canonical base64, total size and SHA, and compares the assembled in-memory bytes with the already recovered file. It does not use the recovery owner's extraction implementation or rewrite the original. The recovered manifest independently agrees on report bytes/SHA and source run; its smaller `transport/export.log` is a separate export-only view, while this review uses the final full decoded log above.

Run/commit/attempt and the following fingerprints match the metadata, original audio provenance, standalone profile provenance and frozen local source files:

| Source | SHA-256 |
|---|---|
| helper | `7c7356237d487786234e737fe959075c942e39844f638d1e1ea3f925b0bd5194` |
| harness | `fe15b0b8fc0143f826f45cc8642fac302e829c36e8242e1328e5498d8cf6b6ec` |
| frame probe | `2ce6e467d5f6ba45b18da2d644b3ad4463bbd036aaac9def3117056bd5ef08cf` |
| exporter | `5d17504681f038706d61828eba286d495f91b99f30f0c2cd20a27cefed717f43` |

The product bundle remains `514f671fa64b75dda7f835a430245e9b168f9aca38fbce0b8184b12938679a55`; the shared recorder remains Git blob `785541d3beaed0e35e8bcf042973eabb7bdb5d6c`. Complete export means the failed report was preserved, not that acquisition or quality passed.

The original target is iPhone SE (3rd generation), iOS Simulator, Mobile Safari, landscape. This independent review executes CPU arithmetic and reads original evidence. It starts no browser, recording, CI job, retry or automation and modifies only its independent directory.

## Actual acquisition results

| Completed clip in report | Wall seconds | Audio seconds | Engine seconds | Engine/audio | Audio minus engine | Original guard |
|---|---:|---:|---:|---:|---:|---|
| street-walk | 10.609000 | 10.576000 | 9.483333 | 0.896684317 | 1.092666667 s | fail; tolerance 0.528800 s |
| cut-gas-air | 10.465000 | 10.464000 | 10.433333 | 0.997069317 | 0.030666667 s | pass; tolerance 0.523200 s |

The unchanged guard is `max(0.1 seconds, 5% × audio duration)`. Street misses it by 0.563866667 seconds. There are two completed clip records. The third recording has profile rows, but no completed matching clip metadata in the recovered report, so its original capture guard cannot be calculated or declared passed.

Trusted native street movement is recorded. The initial after-gesture snapshot has `stickActive=false`, `moveMagnitude=0`. The revised observation passes at the first frame after fixed-step progress, 18 ms later, with input time advancing and movement remaining zero. This verifies the new observation in this run; the product bundle is unchanged, so it is not evidence of a new product input implementation.

The second recorded failure is `Safari audio chunk transfer timed out`, with the stack pointing to the 120-second bounded transfer loop. `safariAudioTransferFinal` is null in this report; it supplies no retained page-side underlying recording-error text. The failure to preserve C35's original reason through an `error` property collision and this new transfer timeout are separate issues. This run does not recover C35's original hidden error or establish that it had the same cause.

## Profile coverage and boundaries

The original profile contains 1853 rows, three recorder identities, `dropped=0`, `errors=[]`, `restored=true`, `complete=true` and no recorded lifecycle event. Its completion predicate describes the bounded trace and restoration; it does not mean three clip acquisitions succeeded.

| Recorder identity | All profile rows | `recorderState=recording` | Inactive rows | Matched completed clip |
|---|---:|---:|---:|---|
| 1 | 540 | 536 | 4 | street-walk |
| 2 | 571 | 569 | 2 | cut-gas-air |
| 3 | 742 | 742 | 0 | none |

For the first two identities, the active rows cover the exact before/after engine-frame endpoints of the corresponding clip. Every non-setup render sample was independently matched to a profile row by engine frame and time and falls within that callback's measured entry/exit interval: 536 street samples and 569 gas samples. The initial manual clock sample is not mislabelled as a rAF callback. Street's final report endpoint is 21.333333 audio ms after its last render clock sample at the same engine time; full-endpoint loss includes this tail.

All 1847 active rows show running audio, running engine, no observed pause/context loss/throw and unit timeScale at entry and exit. Their `clockLast` values are continuous with the previous observed rAF timestamp within each recorder identity. The probe includes paused callbacks, improving on the render-only C34 evidence. This still does not identify work performed outside the observed callbacks or unobserved browser/OS state.

| Active callback coverage | Span, ms | Sum of callback elapsed, ms | Sum of between-callback intervals, ms |
|---|---:|---:|---:|
| street | 10539 | 1959 | 8580 |
| gas | 10445 | 1656 | 8789 |
| third identity | 14079 | 2040 | 12039 |

These sums telescope over each active callback range. They are elapsed-time accounting. The normal intervals between callbacks contain scheduled idle time, and cannot all be labelled stutter, CPU delay, WebDriver cost or browser overhead. The spans do not replace the clip's original acquisition endpoints.

## What the longest intervals establish

| Observed segment | Engine frames | Raw engine input | Callback elapsed | Measured phase totals | Following outside interval |
|---|---|---:|---:|---|---:|
| Long renderer segment | 1097 → 1098 | 17 ms | 447 ms | `renderer.render`: 446 ms across 2 calls; `game.render`/`emit:render`: 447 ms inclusive | 319 ms |
| Following catch-up | 1098 → 1099 | 766 ms | 9 ms | 4 updater calls, 66.666667 ms simulation advance | — |
| Earlier mixed segment | 925 → 926 | 94 ms | 263 ms | updater: 182 ms across 4 calls; renderer: 81 ms across 2 calls | 130 ms |
| Following catch-up | 926 → 927 | 393 ms | 3 ms | 4 updater calls, 66.666667 ms simulation advance | — |

For the longest segment, callback entry is wall 31385 ms and exit 31832 ms. The next entry is 32151 ms. The measured sequence therefore decomposes as **766 ms = 447 ms inside the preceding callback + 319 ms between callbacks**. The 447 ms did not retroactively become the same callback's input: that callback used 17 ms and advanced one fixed step. Its delay is reflected in the following rAF input. The earlier sequence likewise gives **393 ms = 263 ms + 130 ms**.

This directly confirms the distinction the C34 review required between raw engine input and render-listener timing. The longest two C36 render-clock gaps are approximately 461 and 328 ms; their audio-minus-engine deficits are 442 and 264 ms. Those are sampling-interval quantities, distinct from the 447 ms callback duration and the 766 ms following raw engine input.

`renderer.render=446` is a sum across two calls, not an individually timed 446 ms renderer call. `updater=182` is a sum across four fixed-step invocations, not an identified 182 ms leaf operation. `renderer.render`, `post.render`, `game.render` and `emit:render` overlap and cannot be added. The active street `audio.update` wrapper sums to about 5 ms, with a maximum of about 1 ms per row; this wrapper did not contain the observed long renderer span. It does not rule out audio-related work in other callbacks, other code paths or browser internals. The mostly whole-millisecond observations also mean a measured zero is not proof of zero cost.

## Independent simulation-loss budget

For each active row, I checked the recorded updater invocation count against engine advance in units of `1/60`, verified the original cap of four, and independently calculated:

- Input clamp loss = raw engine input − accepted delta.
- Discarded backlog = accumulator before + accepted delta − engine advance − accumulator after, using the observed unit timeScale.
- Raw-input-minus-engine = clamp loss + discarded backlog + accumulator change.

Rows below four steps have no backlog discard within numerical tolerance; capped rows have their accumulator reset to zero. The active street budget is:

| Term | Seconds |
|---|---:|
| Sum of raw engine inputs | 10.600000000 |
| Engine advance | 9.483333333 |
| Input lost to 250 ms clamp | 0.659000000 |
| Backlog discarded after four steps | 0.458666667 |
| Final minus initial accumulator | −0.001000000 |
| Audio duration minus summed raw input | −0.024000000 |
| Reconstructed audio minus engine | **1.092666667** |

Thus `0.659 + 0.458666667 − 0.001 − 0.024` reproduces the original failed endpoint result. This is not an estimate from the render gaps: it uses the observed raw input, accepted delta, accumulators, updater call count and engine advance.

The 766 ms input loses 516 ms to the input clamp and 190.666667 ms from discarded backlog. The 393 ms input loses 143 ms to the clamp and 183.333333 ms from discarded backlog. These calculations locate the engine's loss mechanism in this run. The input spans themselves include both previous callback work and subsequent gaps; the mechanism does not turn either component into a measured CPU duration or identify the external wait.

The gas budget similarly closes: 0 clamp loss, 0.038333333 s discarded backlog, −0.004666667 s accumulator change and −0.003000000 s audio/input difference give its 0.030666667 s endpoint deficit. The third identity has a valid observed callback budget, but no matched completed clip, so that budget is not presented as a successful third acquisition.

## Causal conclusion and limits

The new evidence supports this bounded conclusion: the largest observed C36 callback elapsed interval is almost entirely inside the grouped renderer invocations; another substantial interval is inside the updater chain; measurable gaps also occur outside callbacks. Together, actual rAF input and the unchanged clamp/step-cap policy explain the recorded simulation time loss.

It does **not** establish that the 446 ms was CPU on-core work, GPU execution, shader compilation, GPU synchronization, garbage collection, preemption or a WebDriver/browser scheduling effect. It does not identify the work performed in the 319 ms gap. The updater aggregate does not identify an individual function. Instrumentation overhead and its effects on scheduling were not independently measured against a matched uninstrumented run.

The C34 source and PR reports used the same product bundle but lacked these phase and raw-input fields; their 249 ms and 894/581 ms render gaps remain unattributed. New C36 timings identify locations in **this run**, not the cause of those historical intervals. The new ratio 0.896684317 lying between C34's source and PR ratios is not a controlled improvement or a repair result. No unchanged retry, quality reduction or step-cap/guard relaxation is justified by this review.

A cause-directed next step should preserve all guards and distinguish individual renderer invocations and the costly updater's internal operations when that is needed for a concrete fix. An appropriate browser/OS trace would be needed to distinguish on-core execution from API wait/preemption and to identify activity in the outside-callback gaps. The third transfer failure requires its own transport evidence; it must not be diagnosed from the street render profile.

## Verification record

`verify_profile.py --log .../transport/job-final.log` completed successfully against the original report, and `analyze_clock_budget.py` completed independently against the same original SHA. The latter checks all 1847 active rows, the full budget identities, the callback/outside decomposition and 1105 actual render-sample matches. `independent-result.json`, `clock-budget.json` and `active-frame-budgets.csv` retain the computed details. The earlier ten transport controls were synthetic preparation checks, separate from this original-data verification.

The work remains continuous, with start `2026-09-13T20:56:49+09:00` and deadline `2026-09-20T20:56:49+09:00`. All 19 elements / 71 criteria remain fixed; all 19 elements remain `not measured`, valid blind comparisons 0, completed units 0. The guard, four-step cap, 48 Mi-character transfer bound, 128 Ki-character chunks and 120-second deadline remain unchanged. Physical-device CPU/GPU, thermal behavior, audio listening, reference quality and overall completion are not measured by this review. Source edits, remote writes, CI/retry starts and automation changes: **0**.
