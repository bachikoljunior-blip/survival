# C41 bounded program identity candidate

Recommendation: retain this one-file candidate for independent review and a later authorized diagnostic cycle. It can associate a newly observed renderer program object with the saved callback boundary where its count increase was observed. It does not establish compile, CPU, GPU or material causation, and it does not repair product performance. The running C40 capture was not changed or cancelled.

Final candidate: `tools/frame_work_probe.mjs`, 16,893 bytes, SHA256 `33dfcc32bdc7a2b3de52c0295f822dd4f8eff112bb74fbf3d6e45926e23ac618`. Canonical base: 11,229 bytes, SHA256 `eabc3f8ba621e992902a63790b86f0787bb84998bd5b9fa239ab20414d661fe8`, independently fetched at `8058f8431b7885e9e929e6cb57bb415d26d9f5b1`. Exact change is `candidate.patch` (8,771 bytes, SHA256 `d145e5955f6fb0b339f09b61449b6dddb257a44827556479d87f07bd817dd4fd`). No other production path is a candidate.

## Observation and meaning

The auxiliary `programIdentity` object records the installation inventory and scans again only when the existing saved callback entry/exit count is greater than the previous observed count. A decrease updates the comparison baseline; it does not trigger an inventory. Previously seen objects are skipped using a WeakSet. An entry contains only its first event index, array index and bounded own-data `id`, `name`, `cacheKey` values. Entry and exit events reuse the existing row timestamps; installation has no recording timestamp. No renderer phase, compile duration, material ownership or stable cross-run identity is inferred.

A numeric id must be a safe integer. String fields record their original UTF-16 length. Long names and keys retain only a bounded prefix and suffix; they do not receive a full-key digest. Missing properties, inaccessible descriptors, accessors, unsupported types, truncation and capacity are explicit. Property accessors are not invoked. No GL query, context access, shader read, compile call, warmup, material creation or quality change is added. The library property names are optional observations; real program property availability has not yet been measured.

| Boundary | Fixed value |
| --- | ---: |
| First-observed program entries | 64 |
| Inventory events | 16 |
| Array entries inspected per event | 128 |
| Name text, full or prefix + suffix | 96 UTF-16 code units |
| Cache key text, full or prefix + suffix | 256 UTF-16 code units |
| Retained serialized event/entry records | 60,000 UTF-8 bytes |
| Declared complete inventory JSON bound | 65,536 UTF-8 bytes |

Records are encoded only when retained. The fixed envelope and bounded post-retention event counters fit the reserved 5,536 bytes; the conservative fixture calculation gives 61,049 bytes for the entire inventory. The maximum-escaping fixture retained 26 entries and occupied 59,945 bytes before recording the capacity condition. These are synthetic capacity checks, not measurements of actual Safari metadata or report compression. The existing report/export/transport limits remain unchanged; adding even bounded metadata may still cause an already-near-limit report to fail its existing export check.

Steady frames perform two cheap count comparisons but do not copy program properties or keys. At most 16 bounded inventory scans and 64 retained program records occur. No new performance.now call is added. Installation inventory is outside row timing. Later identity reads are inside the existing observer setup/tail intervals; the exit inventory is after the row.after marker. Timing values are not corrected or normalized. The added CPU cost and Safari scheduling effect are unmeasured.

## Coverage and retained failure

Same-count replacement, temporary creation/removal between observed boundaries, earlier queued original callbacks and all callbacks after the 4096-row cap are unobserved. First-observed object properties are not refreshed. A truncated key may not distinguish two variants with the same retained prefix/suffix and length. If installation or an inventory read is unavailable, that auxiliary observation stops with an explicit incomplete state. These boundaries are not a full program lifetime history.

`programIdentity.boundedReadsComplete` concerns the selected identity reads only. Existing `complete` and `detailComplete` still describe the original timing capture and are not extended into a claim about all program identities. Missing auxiliary identity can coexist with successful original timing coverage; consumers must inspect both fields. The natural three-recording fixture still retains exactly 4096 rows, three dropped rows and complete=false; an identity added after the row cap is absent as stated. Original 4096-row/256-slow-call/8ms thresholds, timing functions, lifecycle, recorder, engine four-substep cap, 5% clock guard, 8MiB export and 48Mi-character/128Ki-character transport bounds are not relaxed.

The prior C38 observation remains a single world call of 847 ms with program count 43→44, followed by the original 1305 ms engine interval and 1.239 s clamp/discard loss. It contains no program identity. This candidate cannot retroactively identify that program or establish the CPU/GPU/compiler cause. Existing warmup, lights or post-render settings are possible source relationships to investigate only after a new observation supports them; no such product setting was changed here.

## Verification and authority

Syntax passed. Existing 62 assertions using the actual canonical Engine._frame passed. The additional 50 CPU/VM assertions passed: initial/increment-only collection, entry/exit association, deliberate same-count omission, decrease then growth, getter/GL exclusion, long and Unicode strings, exact byte/count/scan/event caps, missing/inaccessible fields, source exception propagation, installation rollback, all saved function descriptors, program object/array identity, idempotent cleanup, serialized-page execution, natural three-recording row-cap failure, unchanged fake-clock timing rows and synthetic observer-cost placement. Renderer programs and phase costs in these tests are fixtures. Actual Safari, actual programs, compile/GPU behavior and real observer overhead are unmeasured.

Reproduce from `/workspace/scratch/0b7ad82bafe7`:

- `node --check c41-program-identity-probe-ultra/candidate/tools/frame_work_probe.mjs`
- `node c41-program-identity-probe-ultra/verification/verify-frame-work.mjs`
- `node c41-program-identity-probe-ultra/verification/verify-program-identity.mjs`

The canonical head, AGENTS, CLAUDE and SESSION were read and accepted in that order via the GitHub App. The probe base was fetched successfully. Engine/util/lock fixture bytes come from the previously pinned unchanged C40 baseline accepted by the writer; the repeat engine fetch returned RemoteProtocolError, with no retry. A primary-source web read for Three internals returned DisabledError and was not retried through another route; it supplies no factual evidence. Source, tool and authority pins are retained separately with that distinction.

ULTRA-CHILDREN-20260914-v3; sole writer `/root/integration_recovery_ultra`. All writes were confined to `c41-program-identity-probe-ultra/`. Remote/CI/rerun/Safari/new-agent/Library/automation actions: zero. Fixed 19 not measured / 71 criteria / 10 references / valid blind 0 / units 0 / continuous work remain unchanged. Start 2026-09-13T20:56:49+09:00; deadline 2026-09-20T20:56:49+09:00. Public candidates and supporting artifacts are restricted by `public-allowlist.json`; raw authority responses and unrelated original evidence are excluded.
