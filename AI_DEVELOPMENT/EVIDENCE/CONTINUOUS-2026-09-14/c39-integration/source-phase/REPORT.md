# C38 source phase recovery result

The existing source job completed with failure. One official job-log request recovered the full decoded log, but **the original full report was not exported or recovered**. This is a completed bounded recovery attempt with a preserved evidence gap, not a successful phase diagnosis.

Source head `61e8f8c595bde13634fe709f979816011df165d0`; Floor run `34884725972`, attempt `1`; Safari job `104112425709`. The run and job both completed with failure. AGENTS → identical CLAUDE v3 → current SESSION were accepted from the canonical GitHub App. Four actual tool hashes, root/dist1094 and recorder785541d3 in the log summary match the canonical source.

## Original evidence

- `transport/job-original.log`: 79,989 bytes, SHA256 `7708ce8065f490e8438631f6885e3535e56af97f418cf2b262bdc02d6484d054`. All decoded tool content, including BOM, was preserved and compared byte-for-byte; it is not the artifact ZIP.
- `original/log-summary.json`: 28,778 bytes, SHA256 `5cbb7d15a67d349d20c17edba62eb7114d6052cc414ef744ca06b12258f6cc12`. Exact JSON substring from original log line 477, not a recreated full report.
- Artifact `10364986195`: 25,105,480 bytes, SHA256 `661474f9320966960edf4794c0fdabe4d8f456ec6166efd1dbace592cef6d372`. The successful upload log and normal run-artifacts metadata agree on identity, size, digest and source/run. The ZIP was not downloaded or independently hashed.

## Observed result

54 checks: 53 passed. The only failed check says the phase diagnostic is incomplete: 4096 rows saved, 844 dropped, three recording identities, `complete:false`, `restored:true`, errors empty. Required F3 consequently fails. The reported capture status is `captured`, with three saved-file declarations and five post-recording lifecycle stages checked.

| Scene | Wall seconds | Engine/audio ratio | Reported original clock guard |
|---|---:|---:|---|
| street-walk | 92.01000 | 0.9584687718 | passed |
| cut-gas-air | 9.15900 | 0.9858847497 | passed |
| arcade-room | 7.32800 | 0.9984534207 | passed |

The declared duration arithmetic agrees with the unchanged 5%/minimum-0.1-second threshold. Full endpoints and passive telemetry are absent from this summary, so they were not independently recomputed. Input-release evidence reports the original immediate move magnitude 1, then magnitude 0 on the first frame after fixed-step progress, elapsed 110 ms, passed, cleanupErrors null. The full movement record was not exported.

The 92.01-second street recording reports 4025 engine frames, 98.27% of the global 4096-row capacity. Three clips report 4919 frames, while saved + dropped profile callbacks total 4940. This is consistent with the long street capture exhausting the diagnostic capacity. The 21-callback difference, drop allocation, and cause of the long street capture are unassigned without the original rows and command timing.

The exporter emits `Original diagnostic report exceeds bounded export capacity` at line 499, with **meta/chunk/end counts all zero**. Its unchanged guard covers either fewer than 1 byte or more than 8 MiB. Nonempty report serialization and the saturated profile strongly support over-capacity, but the raw file's actual size and SHA were not printed. Artifact ZIP size is not the raw report size. There is no partial stream presented as complete.

## Decision and continuation

No product performance patch is proposed: world/composite/fixed-phase durations, program counts, observer bookkeeping, inter-marker gaps, slow-call events and same-origin upload receipts are unavailable. The current three clips and aggregate clock passes do not establish repair of the original C34/C36/C37 failures. The new HTTP path's detailed bytes, elapsed receive time and SHA cannot be independently checked from this summary. CPU, GPU and host scheduling remain unseparated.

The exact continuation is the fixed artifact above and the preserved summary/log. The sole writer can choose an authorized way to obtain its original report and command evidence before cause analysis, or make a separately reviewed diagnostic method change. This task made no report/row/transport/clock limit change, no recording change, no product/capability candidate, and no new CI/rerun/remote/automation operation. `recover_report.py` refused the absent stream; `analyze_phase.py` remains prepared and was not run on fabricated rows.

An existing Ultra independently verified the original log/summary byte identity, provenance, declared clock arithmetic, release/lifecycle observations and export failure; see `independent/REPORT.md` and its receipt. No additional spawn or old fixture rerun was used.

All 19 not measured, fixed 71 criteria/10 references, valid blind 0, completed units 0, continuous. Start 2026-09-13T20:56:49+09:00 and deadline 2026-09-20T20:56:49+09:00 unchanged.
