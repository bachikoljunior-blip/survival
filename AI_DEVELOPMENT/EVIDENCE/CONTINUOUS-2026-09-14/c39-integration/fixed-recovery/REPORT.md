# C39 fixed C38 artifact recovery candidate

Adoptable candidate; independent blocking defects 0. This adds one helper and one source-only recovery job. It recovers the original C38 report and Appium log from the already saved, fixed artifact. No original artifact has been downloaded by this task; real member sizes, ZIP shape and compression fit remain unmeasured.

The original failure stays failed: C38 source 61e8/run34884725972/attempt1/job104112425709 reported 53/54 checks, 4096 profile rows and 844 dropped. Its original 8 MiB report-export capacity refusal remains recorded. The existing exporter, probe, recorder, clock tolerance, four-substep cap and production source/root are unchanged. Recovery-job success would mean only that the old failed evidence was recovered.

## Fixed input and bounds

Artifact 10364986195, name iphone-se3-mobile-safari-61e8f8c595bde13634fe709f979816011df165d0, ZIP 25,105,480 bytes, SHA256 661474f9320966960edf4794c0fdabe4d8f456ec6166efd1dbace592cef6d372. The normal run-artifacts metadata and original upload log agree. The ZIP digest is checked before reading members.

| Payload | New archive-recovery bound |
|---|---:|
| Fixed original ZIP | Exact 25,105,480 bytes; absolute 32 MiB |
| Original report.json | 32 MiB |
| Original appium.log | 8 MiB |
| Both selected raw files | 40 MiB total |
| Both gzip payloads | 8 MiB total |
| ZIP central-directory entries / declared total expansion | 64 / 96 MiB |

Only the two exact root text members are inflated. Media are neither extracted nor resent. Each selected member must pass its original length/CRC and UTF-8 checks; unsafe or duplicate normalized paths, NUL-truncated names, special entries, encryption and unsupported compression are rejected. Missing or over-bound files fail the job without emitting an incomplete recovery stream. The actual ZIP size is never used as the raw report or log size.

Original JSON bytes are preserved without reserialization, then compressed losslessly with mtime0. The strict report checks require the fixed failure, original 54/53 check counts, 4096/844 incomplete profile, source/run/attempt, four tool hashes and root/dist/recorder pins. Both files must validate, compress and pass the shared gzip bound before any original output is written/emitted. Two meta/chunk/end streams share the same complete member manifest and carry raw/gzip SHA256, member CRC, original artifact identity, recovery helper SHA and original failed diagnostic state. Chunk payloads are 3000 bytes. The 8 MiB bound covers binary gzip payload; base64/log framing adds overhead.

This is a separate bounded recovery format for historical evidence, explicitly requested after the original diagnostic export failed. It does not make a larger new diagnostic report pass the old exporter, fill dropped rows, alter acquisition guards or convert failed evidence into a performance result. Appium evidence may help distinguish WebDriver waiting from synchronous product work; no such cause is inferred before the original logs arrive.

## CI and verification

The source 61e8 gates file remains an exact byte prefix; only recover-ios-phase-c38 is appended. Its unique marker is `[recover-ios-phase-c38-r1]`, limited to the exact production branch, push and attempt1. The helper also checks repository/Floor workflow/event/ref/attempt/actual identity and the event marker. No old recovery or new phase marker is activated by the added job.

CI uses the already established official GitHub API route with the existing job-scoped actions:read token: fixed run-artifacts metadata, then fixed artifact /zip into a bounded stdin receiver. The receiver accepts only the exact archive length and digest; bash pipefail preserves producer failure. No local credential collection, refused public/file URL retry, new CI, rerun, remote or automation operation was performed. Checkout uses the current actual SHA and disables credential persistence. Required checks and all prior jobs remain unchanged.

45 author fixtures and 31 independent checks passed. They cover source constants, actual saved metadata, small and >8 MiB raw synthetic lossless ZIP/gzip controls, failure/provenance/JSON rejection, path/CRC/encryption/entry limits, individual and shared bounds, two complete streams, receive length/digest, and pipeline failure propagation. The independent second-member CRC failure test confirms no output directory or meta/chunks are produced. These are synthetic protocol tests, not the actual artifact, recording, Safari, compression rate or performance validation.

## Final candidate paths

| Repository path | SHA256 |
|---|---|
| .github/workflows/gates.yml | 737296093d9529e5aab8b2c4a8377cc082262eef0e6234caef54c5a0d3a8c660 |
| tools/recover-ios-phase-c38.py | efbf6600efb7c332ca21e2b07b6b879c748ed5a27227608178cfa7b74c35135f |

Use gates.yml.patch when combining with newer writer changes. The sole writer can include the helper and this isolated job in the next normal C39 source save with the recovery marker. After that existing CI job completes, recover both gzip streams and verify each raw/gzip SHA, shared manifest and bounded decompression before reading the original report/Appium timings. Any actual bound/shape rejection remains a failure requiring an explicit next decision; this helper does not relax itself.

All 19 not measured, fixed 71 criteria/10 references, valid blind 0, units 0, continuous. Start 2026-09-13T20:56:49+09:00 and deadline 2026-09-20T20:56:49+09:00 remain fixed. Product/performance/WDA-capability changes 0. Sole writer=/root/integration_recovery_ultra.
