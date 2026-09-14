# C34 original failed acquisition recovery candidate

Ready for independent integration review. No original C34 full report or MP4 has been recovered locally by this task; no CI, browser, recording, decoding, playback or comparison was run.

Base: `81de9354117a54397bf2c9e64e18a91c397dd06a`, repository `bachikoljunior-blip/survival`. Official GitHub reads accepted in order: AGENTS → CLAUDE v3 → SESSION. Then the original C29 recovery helper, current gates and current iOS helper were read at that same SHA. Exact receipts and source copies are retained here. Sole integration/remote writer remains `/root/integration_decisions_ultra_v2`; all local writes are confined to this task directory.

## Frozen candidate

| Repository path | Bytes | SHA-256 |
| --- | ---: | --- |
| tools/recover-ios-audio-c34.mjs | 7218 | 7a910eeca46854659c410a35d778e3f407c3ab7098bbe453d3b4597b17d70d12 |
| tools/candidates/c34-ios-source-summary.json | 24783 | 43ca3a6ba708c6ae7284b9142b33ef633e78fbe08ed0f0fc1f566b84fcc7ac5f |
| .github/workflows/gates.yml | 23092 | de1f126694df1b99db20439d5307992bba292d6bd0f8a939d660a7abba380ce5 |

`candidate.patch` SHA-256: `309e78cb63084cb421d6dba6a1b0554f681e390385bda4e0579df4d924068581`. `recovery-helper-minimal.diff` shows the finite derivation from the official C29 helper separately from adding the new file.

## Original identity and failure preservation

Parent-supplied formally confirmed artifact: ID `10357143198`, run `34866156884`, source Safari job `104050403522`; name `iphone-se3-mobile-safari-81de9354117a54397bf2c9e64e18a91c397dd06a`; 13,304,946 archive bytes; digest `sha256:e5a88dfd8818a3d79092683043343e851d7d71c56e5ec61fb983ceb49e90fdb3`; expired false. The future job independently rechecks every field, source head and run before the official download action. This candidate does not fetch the artifact itself.

The preserved summary matches the sole `[ios-safari-report]` JSON in the source log. The JSON storage file is 70,883 bytes, SHA-256 `374f1f85e2a2af233b6187d7a4f10bcdd31af3f4c1557d6965537fd8f9c9d549`. Its JSON-decoded original UTF-8 log is 66,004 bytes, SHA-256 `3ef4d5b6618268741f78ebfe0bc26fe617f45079b4a73c0b2d8cbebcad1d03d4`.

The report must project to the exact saved summary, using the byte-identical `iosAudioLogSummary` function from helper SHA-256 `1b3bc6fd170473c5f4ee9276699c51d12852f1ae1bd132c80ec6b00824cdf819`. JSON normalization only mirrors omission of undefined object properties in the original JSON log. No original report bytes are reserialized for export. All checks, all three failures, capabilities, complete provenance, comparison, lifecycle and all projected clip fields must agree. The expected summary file itself is SHA pinned.

Original status remains `failed`, capture remains `acquisition failed`, street engine/audio ratio remains `0.9473270440251034` with its existing 5% clock guard false; gas/room guards remain true; lifecycle remains `not run`. Transport success does not promote acquisition success. No codec, warmup or other cause is inferred before original telemetry recovery.

| Clip | Original bytes | SHA-256 |
| --- | ---: | --- |
| street-walk | 5358430 | 0d8de149dcbda05affacbd61d71939ac3e916247c83651b23094ce7655834607 |
| cut-gas-air | 2911713 | ddc4dbc677da7c51f5eedafa8b04133af0722d39e233a40b1fd52c1c0342ce67 |
| arcade-room | 1328121 | 92ba5564206d976a6f9d689a8b5656e18544ac7d681373fc34697798f4a5d586 |

## Transport and validation

The new optional job is selected only by push, run attempt 1 and `[recover-ios-audio-c34-r1]`. It has contents/actions read permissions and checkout credentials disabled. Metadata verification precedes `actions/download-artifact@v4`; report projection and all three media byte counts/hashes precede copying or export. Existing 17 jobs and all remaining parsed workflow fields are unchanged.

The original 16 MiB per-file / 32 MiB total bounds and 3000-byte base64 chunks remain. Export requires five complete groups: raw `report.json`, three original MP4 files and the generated `recovery-report.json`. Metadata is additionally preserved in the workflow artifact. A receiver must accept all five complete groups with contiguous offsets, matching meta/end, lengths and hashes; a partial log is not a recovered set. The full report's previously unknown raw byte hash is first recorded during this verified recovery; only its preserved projection is known before retrieval.

`node verify-candidate.mjs`: 19 CPU checks passed. Exact failure projection is accepted without mutation; success promotion, missing/rewritten failures or checks, changed provenance, lifecycle promotion, street guard relaxation, clip changes and expected-summary tampering are rejected. Metadata failure occurs before a missing report is read. The unchanged production candidate rejects synthetic media before emitting anything.

A separately repinned CPU transport fixture uses clearly labeled synthetic byte arrays and a reconstructed projection object; it is neither original media nor the unseen original full report. Its unchanged function bodies reconstructed all five exact byte groups, preserved unusual raw report whitespace/unprojected fields, rejected last-file corruption before any new export, and rejected an oversized report. This fixture does not validate codecs or actual GitHub transport. Workflow structure checks passed; syntax check passed.

19 elements remain `not measured`; 10 references / 71 criteria remain fixed. Valid blind comparisons: 0. Work completed: 0. Continuous start `2026-09-13T20:56:49+09:00`; deadline `2026-09-20T20:56:49+09:00`, unchanged.
