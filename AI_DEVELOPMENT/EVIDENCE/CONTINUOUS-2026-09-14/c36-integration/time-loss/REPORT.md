# C36 Safari time-loss diagnosis and bounded timing candidate

The original C34 street recordings fail the unchanged acquisition clock guard. Their telemetry localizes the loss but does not identify a responsible CPU function, GPU workload, recorder operation, or runner scheduling event. The candidate adds a single-run optional diagnostic and fixes a separate loss of error-message detail. It is not a product performance repair and does not establish that C34's failure has been corrected.

## Authority and unchanged scope

This Ultra child personally read the latest branch head `d2c463b54d4ea12abc0a9444627db810440a59a7`, then canonical AGENTS → CLAUDE `ULTRA-CHILDREN-20260914-v3` → SESSION through the connected GitHub App. Source snapshots and their canonical blob identities are in `authority-receipt.json`. Parent `/root/integration_recovery_ultra` is the sole remote writer. This task changed no remote, CI, automation, product source, production bundle, shared recorder, quality criterion, benchmark, or existing input-release candidate.

Work remains continuous: 19 elements not measured, 71 fixed criteria, valid blind comparisons 0, completed units 0. Start `2026-09-13T20:56:49+09:00` and deadline `2026-09-20T20:56:49+09:00` are unchanged. Evidence remains insufficient to promise all elements satisfied by the deadline. This is a method change to obtain missing causal measurements, not completion.

## Original observations and arithmetic

The independent Ultra child `raw_clock_refuter_ultra` verified both original report byte counts and SHA-256 values against the recovered manifests, recomputed every interval, and fetched the engine at both actual run commits. Both use engine blob `0735cfcb3f6df68bf5bd51fa84a27d60c712391e`.

| C34 original street | source | PR |
|---|---:|---:|
| Original job | 104050403522 | 104050442233 |
| Report bytes | 911052 | 939375 |
| Audio seconds | 8.480000 | 10.026667 |
| Engine seconds | 8.033333 | 8.166667 |
| Engine / audio | 0.947327044 | 0.814494681 |
| Audio minus engine seconds | 0.446667 | 1.860000 |
| Original 5% / minimum 100 ms guard | fail | fail |

Source report SHA-256: `ff17eb9a3951c386f0fdd8b3afcff97c20d2ec937addf8c21c16f625aff4f685`.
PR report SHA-256: `abf62e88aa00183e035453e63e9ab136597a1de79e230148177318f66533cf8e`.

The PR intervals 1438→1439 and 1439→1440 have render-sample wall differences 894 and 581 ms, audio differences 896 and 581.333 ms, and engine advances 33.333 and 66.667 ms. Their audio-minus-engine loss totals **1.377333 seconds, 74.0502%** of the whole street clip's 1.86 seconds.

The 894 ms interval advanced **two** fixed steps. Substituting 894 ms as the engine's rAF input would advance four steps under ordinary scale/no-reset assumptions, contradicting the observation. The original `wallMs` is `performance.now()` read inside a render listener; engine time uses the rAF callback argument minus `clockLast`. Their difference can change. Neither the 894 ms interval nor the conditional offset bound is a measured CPU duration.

All retained C34 street clock samples say play / not paused / audio running. However, the original listener is attached only to `render`, not `renderpaused`, so it does not prove there was no paused interval. Its initial sample is a manual setup call, not a completed render. Buffer `dropped=0` establishes that the buffer did not overflow; it does not prove every engine callback was sampled. The cap of four steps and backlog discard explain how engine time can be lost on long engine-input intervals; the original data does not assign the largest intervals to a specific cost centre.

Full independent arithmetic, interval CSVs, exact-source observations, limitations, and acceptance are under `independent/`. No original clip was reacquired or replaced, and no media was decoded/listened to for this task.

## Two-file candidate

1. `tools/frame_work_probe.mjs` installs reversible tool-side wrappers around the engine's actually scheduled `_boundFrame`, registered fixed updaters, relevant emitted render phases, and the audio/camera/atmosphere/HUD/city/post/renderer calls. It retains rAF argument, callback entry/exit clocks, actual `clockLast` input, accumulator, stored and accepted dt, time scale, pause/loss/running state, recorder identity/state and lifecycle events. `priorClockLastMs` is intentionally not called a preceding rAF timestamp: lifecycle code can reset it to `performance.now()`. Paused/stopped callbacks expose `acceptedDtSeconds=null`, even if `dtRawStored` retains the preceding frame's value.
2. `tools/ios_audio_capture.mjs` enables this only for `CINDERLINE_IOS_FRAME_WORK_CAPTURE=1`, after actual existing recording capabilities pass. Normal unset/other values do not install the probe. The report stores complete frame data separately as `safariFrameWork`; the log summary contains counts/completeness only. Rows are capped at 4096 and overflow prevents diagnostic completeness. Wrappers preserve call arguments, receiver, return/throw behavior and prior own-property descriptors. Cleanup attempts restoration before transporting large results, including failure paths. Changed external methods are reported and not overwritten.

The restore command returns only small metadata. The snapshot uses the existing `createSafariEvaluate` 131072-character chunks, 48 Mi-character capacity and 120-second operation budget through a separate `__cinderlineIosFrameWorkTransfer` slot. It does not overwrite an original pending/failed audio operation. The original audio slot and diagnostic slot are cleaned in the existing fallback cleanup. Shared recorder blob `785541d3beaed0e35e8bcf042973eabb7bdb5d6c`, product bundle `514f671f…`, cap four, original clock tolerances and playback speed stay unchanged.

The wrapper records **synchronous elapsed time**, including blocking/preemption and some measurement overhead, not CPU utilization or GPU duration. Nested phase times overlap and must not be summed. A costly `renderer.render` call does not, by itself, identify GPU execution as the cause. Frames between the clip's original endpoint clocks must be selected for clip comparisons; recorder-present timing can also observe recorder stopping before cleanup. One original callback may already be queued when installation occurs. Original endpoint clocks remain authoritative. Diagnostic changes can alter scheduling, and any later green run alone does not establish a repair of the original product failure.

## Separate C35 error-detail defect

The parent-provided C35 source summary has 31 successful core checks and then `WebDriver … /execute/sync: HTTP 200`; this is a different run/stage from C34's measured street-clock failure. The unchanged canonical `requestWebDriver` rejects any truthy `payload.value.error`, even on HTTP 200. The old page-side operation poll and final diagnostic returned a normal object `{…,error:j.error}`; an actual page operation rejection was therefore misclassified by the wrapper and its message hidden when `value.message` was absent.

The candidate preserves the original page-side `job.error` and merely names its transport field `operationError`. Node propagates that original reason. The final diagnostic uses the same alias. Global WebDriver response semantics are unchanged. This fixes **reason loss**, not the underlying C35 recording failure; the original underlying reason remains unknown.

## Finite verification and adoption

- `verification/verify-frame-work.mjs`: **35/35** CPU controls with the canonical actual `Engine._frame` and mocked rAF/performance and phase bodies. Observed engine state/call results match the uninstrumented replay; injected 850 ms rendering stays distinct from that callback's 20 ms engine input; cap four remains; pause callbacks, lifecycle evidence, bounded overflow, restoration, queued-callback cleanup, external replacement, partial setup failure and original throws are covered. This is not a Safari performance measurement.
- `verification/verify-operation-error.mjs`: **17/17**, using a real local HTTP server and unchanged canonical `requestWebDriver`. Reproduces the old HTTP 200 message loss, verifies exact failure reason propagation, unchanged normal result and genuine W3C error behavior, and transfers 300000 characters in at most 131072-character chunks while preserving a separate pending original audio job and its error. Capacity failure is still rejected. The injected recording error is synthetic and is not claimed as C35's original reason.
- Final syntax and frozen-source/guard checks are recorded in `verification/final-checks.json`. Independent source/arithmetic and candidate reviews are under `independent/`; their reviewed hashes and scope are retained explicitly.

Recommend adopting these two tool files for the next authorized single-run diagnostic alongside the separately reviewed input-release candidate. The sole writer's accepted workflow condition is `inputs.capture_audio && push && attempt1 && github.ref == 'refs/heads/claude/repo-instructions-constraints-r0070m' && contains(head_commit.message, '[ios-frame-work-c36-r1]')`, setting `CINDERLINE_IOS_FRAME_WORK_CAPTURE` to `1` only for the existing source Floor reusable job. Standalone capture default false and PR keep probe off. This child has not edited a workflow or started CI.

The profile's `provenance` contains the new probe's actual file SHA-256 (`frameWorkProbeSha256`), helper/harness SHA, run commit/id/attempt and unchanged product/recorder pins. Minimal later export: preserve the whole original `test-results/ios-safari/report.json` with the existing `always()` artifact upload; record its bytes/SHA and exact artifact/run/build identities. A single authorized fixed-artifact recovery can export all original report bytes in bounded base64 chunks with offsets/counts and an original bytes/SHA manifest, then require exact reconstruction. Do not replace the full report with summaries, round/rewrite its numeric data, or reacquire a new clip as the original. MP4 identities remain in the original recording report and existing artifacts. The current diagnostic does not require MP4 redownload.

At the next actual Safari result, first retain failing as well as passing full reports and original clips, then align rows to each clip's unmodified endpoint clocks. Compare `engineWallMs` with callback elapsed and stage elapsed, inspect lifecycle/recorder states, and separate work inside callbacks from unexplained intervals outside them. Only a measured processing cause justifies a targeted product change. Missing or failed diagnostic data stays unmeasured; clocks must not be normalized, guards loosened or unchanged retries selected for a pass. Normal required CI, merge and public verification remain the integrating owner's subsequent work.
