# C39 small-result capture transport: independent frozen review

Final verdict: no remaining blocker in the reviewed candidate. The initial wire-bound defect was reproduced independently, corrected by the candidate owner, and the corrected bytes passed all 22 bounded independent checks. This is a capture-transport candidate; real Safari latency and product clock improvement remain unmeasured.

Candidate `tools/ios_audio_capture.mjs`: 25,571 bytes, SHA256 `e4f36959ec83f4d4112bda7be27e081ba0e721ee27784705a21a59c4c31d0262`.

Canonical base at `dff2d683d0a9821c79d84848bf93cb45b8920494`: 24,880 bytes, SHA256 `084829ec335d8969e21406da1e5311e7c71134c73eb4e56a29d8dc7c0f4042b6`, Git blob `c02c06122512036cdeb6b50e9e5dceb7f7b66083`. Independently fetched App content equals the local base. The supplied patch exactly equals the independently reconstructed base-to-candidate diff. The executable review copy equals the final candidate.

The diff adds a 4096 UTF-16-code-unit inline JSON result to the existing ready-status poll. It checks the actual page string type and length before returning it, then checks its declared length on the host. Tiny results remove exactly one subsequent WebDriver chunk command; start, ready poll and cleanup remain. Larger replies retain their prior chunk or same-origin upload route.

## Independent evidence

`verify_inline.mjs` executed the actual initial, final and canonical helper functions in isolated Node VM page contexts with JSON-serialized WebDriver replies. The large-result test executed the actual serialized upload function and cryptographic digest calculation with synthetic same-origin fetch acknowledgements. It did not use Safari, external HTTP, CI, or actual elapsed latency.

- The initial malformed ready object (`chars=4`, actual JSON string length 200000) returned a 200,061-byte response before rejecting. The final guard suppressed that payload: the response was 45 bytes and the missing/truncated-inline error followed. This concrete blocker is resolved.
- JSON lengths 2, 4095 and 4096 took three commands and zero chunk reads; 4097 and 131072 used one chunk read, and 131073 used two. A small result matched the canonical result and cleanup while removing exactly one command.
- Astral Unicode, CJK, control escapes, quotes, backslashes and lone surrogates round-tripped at the 4096-code-unit boundary. Largest simulated wire reply among these cases: 12,350 bytes, below 131,072. Code units are not UTF-8 bytes; actual serialized responses were counted.
- Wrong identity, missing/non-string/truncated inline values, zero/fractional/oversize lengths, invalid JSON, and existing overall capacity were rejected. Successful data named `error` remained data; page failure retained its original reason. Prior pending audio state and an independent diagnostic slot were preserved.
- A 300,002-byte serialized large result retained three bounded upload POSTs with digest/ack validation and no WebDriver chunk reads. A 4097-character result retained its one WebDriver chunk even when upload was available.
- With a controlled clock, the remaining 120-second operation budget and 90-second per-command cap still applied: the near-deadline calls received 90000, 1 and 1 ms limits. Expiry after the ready poll rejected before another command. Invalid JSON still followed the existing cleanup order.

## Interpretation and limits

The recovered original C38 Appium evidence identified id7/offset0's small-result chunk read as HTTP success with a reported 59,329 ms command duration. This candidate removes that command for eligible results. Other WebDriver calls can still wait; neither a specific Safari latency saving nor correction of the original 92-second recording has been demonstrated.

The original C38 result remains failed (53/54; profile 4096 saved rows and 844 dropped). Existing 48 Mi-character transfer capacity, 128 Ki-character chunk route, 120-second overall deadline, 90-second command cap, recorder, clock, MAX_SUBSTEPS=4 and 5% guard are unchanged by this diff. No claim is made about CPU/GPU cause or recovery of dropped profile rows.

Canonical head, AGENTS, CLAUDE and SESSION were independently accepted in order through the GitHub App. ULTRA-CHILDREN-20260914-v3 and the fixed 19 elements/71 criteria/10 references, all not measured, valid blind 0, units 0, continuous work, start 2026-09-13T20:56:49+09:00 and deadline 2026-09-20T20:56:49+09:00 remain in force. This review changed only `candidate-independent/`; candidate, frozen original analysis, remote, CI, reruns, automation and new agents were untouched.

Reproduce from `/workspace/scratch/0b7ad82bafe7` with `node c39-c38-original-phase-result-ultra/candidate-independent/verify_inline.mjs`. Exact inputs, authority receipts and output hashes are in `manifest.json`.
