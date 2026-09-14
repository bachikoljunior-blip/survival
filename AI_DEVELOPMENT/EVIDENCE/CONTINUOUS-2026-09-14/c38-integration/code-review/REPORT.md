# C38 integrated code independent review

Result: blocking defects 0 after the writer fixed the new successful-log guard to use `check?.passed === true`. Before that fix, a valid JSON report with `checks: [null]` threw before ordinary startup diagnostics; the original reproduction is retained.

Canonical head bf743056ce143f09e4c6544ef1c7df4b73b232fd, AGENTS → CLAUDE v3 → SESSION were accepted through the normal GitHub App. Canonical baseline and fixture dependency bytes were checked. All seven final candidate files match the supplied manifest. The frozen transfer helper/adapter and phase probe match exactly; the transferred harness differs by only the post-preflight `not started` provenance initialization. Prior transfer 29 and phase 62 + 25 suites were not rerun.

## New bounded verification

51 checks passed: 15 integrated checks and 36 workflow checks. These are synthetic local fixtures, including the actual unchanged candidate harness talking to a fake Appium HTTP server; they are not Safari, actual recordings, CI, performance, listening, or blind quality measurements.

- Actual root/dist 1094 and original recorder pins passed. F3 and exporter reject missing/tampered transferHelperSha256; an exact-key synthetic F3 positive control passes. Nested frame-work provenance mismatch is also rejected before output.
- Fake POST /session rejection keeps exit 1, the original failure reason, checks/clips 0, audio `not started`, and unchanged WDA capabilities/240000 ms launch timeout. F3 rejects the failed report. The exporter returns exactly the original report bytes with `diagnosticStatus: failed`, `frameWorkPresent: false`, and matching SHA. Missing UDID still fails before provenance and cannot export.
- The real capture adapter replaces the initial evidence object in its existing finally block, attaches the same provenance, preserves a controlled capture failure, and retains cleanup results. Normal successful-capture assignment remains the identical existing statement; a full successful Safari capture was not simulated or claimed.
- The exact workflow Node blocks passed 26 before/after branch cases: success, empty/false/null/nonarray/missing checks, failures, session and later failures, invalid JSON and missing report, in ordinary and audio modes. The null regression is resolved; every non-success case retains the old behavior and original log bytes. The successful ordinary synthetic case reduced stdout from 735707 to 90 bytes with the same 540051 bytes of original input files. This measures fixture output size, not actual CI duration or artifact upload success.
- Eight actual expression fixtures select only the first marked source Floor audio call; PR, standalone push/dispatch, rerun, wrong ref and missing/old marker remain disabled. Required F3 and always-artifact steps are byte-identical to C37; the seven-path scope changes no gates.yml/F2/F5 requirement, product, clock, recorder or deadline.

## Final candidate hashes

| Path | SHA-256 |
|---|---|
| .github/workflows/mobile-simulator.yml | 880e72b0eea5eba07db193e0f9d83a1917de626cef17135eec54df84c2068594 |
| tools/export-ios-frame-work.mjs | 8f99e90d4a4321587120ca6e55bc750cef5060929bd1dcf840fcdaed1a308fe2 |
| tools/frame_work_probe.mjs | eabc3f8ba621e992902a63790b86f0787bb84998bd5b9fa239ab20414d661fe8 |
| tools/gates/f3_safari_audio.mjs | 3d997e59effb2ef4add31755ca480f38610f01e930d6ba782bf2c758546c0abe |
| tools/ios_audio_capture.mjs | c0965004ba7d1e389300ab6556431d67ea1e158f82832225389851e0c1314f2a |
| tools/ios_audio_transfer.mjs | 55150670ce3a89c24b9b3348110e29f315d9479ac14438faadf14389987eb41a |
| tools/test-ios-safari.mjs | 352330412d8ac248597bedbc34a4e2ac25c8252003447806adcd6b1761250e64 |

Candidate manifest SHA-256: `8eb4b74fb6f62ffa38ab6e9e3d5d869b6a8ebd45991ceaf8f969a31b295ed7e8`.

Decision: adoptable as this bounded integrated code candidate. Sole writer must perform any authorized normal save/CI and recover original results before claiming real Safari transfer, profile, startup or timing improvement. WDA capability edits remain 0. All 19 not measured, 71 criteria/10 references, valid blind 0, completed units 0, continuous, start 2026-09-13T20:56:49+09:00 and deadline 2026-09-20T20:56:49+09:00 are unchanged. Remote writes/CI starts/reruns/automation changes/candidate direct edits are 0. The attempted additional Ultra subreview spawn was not accepted due to the agent thread limit; no retry or lower-effort fallback was made.
