# C31 Safari transport candidate

Ready for independent review; one production file and one changed line. No remote write, CI run, retry, automation change, media change or comparison was performed.

`tools/ios_audio_capture.mjs` changes `CHUNK_CHARS` from 32768 to 131072. The 120000 ms operation deadline, 48 × 1024 × 1024 UTF-16-character capacity, identity/offset/length checks, polling/error handling, build pins, shared recorder, compressor/cap and original three-clock guards remain byte-for-byte unchanged. No diagnostic API or log-output change is added. The existing capture report's `transport.chunkChars` automatically reflects the new constant.

Base: `bachikoljunior-blip/survival@0abe4628947064fe811ed842face2018b87d5bf5`, branch `claude/repo-instructions-constraints-r0070m`. AGENTS → CLAUDE v3 → SESSION and helper were read through the connected canonical GitHub fetch; the helper matches blob `4e095e0206c4c5f93b48fec960f2f7ccefd72052`. Authority receipt: `evidence/canonical-read.json`. This accepted existing Ultra role is continued; private backend effective strength is not independently asserted. Original deadline/19 elements/71 criteria and all judgments are untouched.

## Actual evidence and hypothesis

The original PR log for run 34856486295 / job 104017277907 records trusted gesture/recording API success, then `Safari audio chunk transfer timed out` at original line 78 while the first `captureMobileAudio` response was being read; its final clip list is empty and acquisition remains failed. The unchanged raw JSON-string log SHA256 is `4c549b00b7fb82e41ae3b1f03c820ab079887a743be111d9a3b280266148d98c`. `evidence/observed-pr-failure.json` retains the relevant metadata and failure without copying media bodies. The existing source-push proof records three successful original clips with the same 81c runtime. That does not supersede the failed PR run.

Many small serial WebDriver responses can exhaust the deadline. This is a source-supported hypothesis: the failed run does not expose per-command elapsed time, completed chunk count or exact failed-response length. The candidate reduces required response count approximately fourfold for large results; actual Safari latency, response limits and reliability still require the next changed-head CI run.

## Local verification

- Node syntax and patch application check passed.
- CPU VM transport controls: **31/31**, measured host elapsed **1168.407671 ms**. The real adapter function and generated browser scripts execute in the VM; only WebDriver delivery and wall time are modeled.
- Original three full media files and their original telemetry were round-tripped separately and in an explicit aggregate stress envelope: **12,491,835 UTF-8 bytes**, 96 data requests, restored serialized SHA256 `91d994701ae2dd275760014ce95dee6e68d585a3b15dac9bb5994ae4ba70514f`. The aggregate is a CPU envelope, not an actual single Safari response. Individual original responses are 7,624,976 / 2,610,898 / 2,255,957 characters. All decoded original media byte hashes match; originals were only read and their ending hashes match their starting hashes.
- A separate **8,388,621-byte** fixture under an explicitly assumed **600 ms per command** model: old 32 Ki chunks fail at the unchanged 120000 ms deadline after 200 total / 198 data requests; new 128 Ki chunks restore the same input in 68 total / 65 data requests, **40800 modeled ms**. This assumption is illustrative, not calibrated to actual Safari. New chunks also time out under a slower 2000 ms/command model.
- Exact lengths around 128 Ki and 256 Ki, split surrogate pairs and Unicode/quote/backslash/newline/lone-surrogate escapes all reconstruct completely. Wrong offset/id, missing or truncated text, changed start/status identity, invalid lengths, actual over-48-Mi-character JSON, pending work, page errors and malformed JSON remain rejected.
- Existing CPU suite: **10/10**, copied into `verification/original-suite/` before execution. Only its two chunk-size/count expectations changed for the new width. Its output is isolated; the original script and results were not overwritten. The shared recorder still has pinned blob `86c1d9c9a0b0eeac3d947aad3d99d25272d3eeaa`, and original supplied clock-failure controls remain rejected.

The initial new VM test failed because `deepStrictEqual` compared different realm prototypes; the test apparatus now normalizes returned JSON to host prototypes. That initial failure is retained in `evidence/fixture-initial-failure.json` and is not counted as a passing run. Production code was not changed in response.

The original deadline is checked between commands; an in-flight command can overrun it by the existing bounded command timeout. This inherited scope is preserved, not represented as a strict wall-clock cancellation guarantee. Chunk size counts UTF-16 characters, not encoded HTTP bytes; escapes may expand wire replies. No throughput or Safari success is inferred from the CPU result.

## Frozen handoff

- Candidate SHA256: `56acb917913e27d3763ad99ae81d83788b503aebdd2210ae196c0e4f3cbfd4e4`
- Patch SHA256: `0726d423e02c6e0e9e203de091aa4e6fa21832f71d5cd62e0e7594cbb4c70540`
- Full file hashes, sizes and Git blobs: `MANIFEST.json`.
- Reproduction: copy this entire directory to a review fixture, then run `node --check candidate/tools/ios_audio_capture.mjs`, `node verification/transport-controls.mjs`, and `node verification/original-suite/verify-cpu.mjs`. Tests overwrite only their fixture outputs; preserve the frozen directory. The original-media relative paths in the test assume the copy stays one directory below the same workspace.

Recommended next operation: the sole integration writer independently reviews the one-line patch, then incorporates it into the next changed source head and runs its normal required PR checks. Keep the failed PR receipt, guard thresholds and complete source/PR results. Product-audio changes and their build pins are a separate integration decision.

Actual candidate Safari executions: **0**. Blind comparisons: **0**. All quality judgments remain **not measured**.
