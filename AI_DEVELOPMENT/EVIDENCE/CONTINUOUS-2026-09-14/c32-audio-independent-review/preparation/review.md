# Audio preparation helper and workflow — finite independent review

Disposition: **ready; no blocking finding in the reviewed scope.** This is authorization-path/code verification, not an actual audio build, CI run, adoption, browser result, recording, or listening claim.

Exact reviewed SHA256 pins:

- `prepare-audio-product.mjs`: `aca14e925d62a60226a7f318360d8958d4b97e3eabb240cc7e008a9f13db33e5`.
- `audio-interior-r1.js`: `22add12afa50de4632d43afb00d52789c7f473a0657affd70f3a855a5951d2b7`; prior title-regression closure remains in the parent review directory.
- Candidate `gates.yml`: `69f6e2bf43fc0489fd9baf72b0ff0777ac13d655dabb23b4096b3dd25ae8b21e`.
- Predecessor grain helper: `b5b9e7e5d070f8f4c7ec9d03cd39044695eb7eb5f392b31e7aa2fc2ffd7786ec`.

The `.github/workflows/gates.yml` baseline was independently read through formal GitHub `fetch_file` at `0abe4628947064fe811ed842face2018b87d5bf5`, blob `e1127bb7dbaa3201f91f48b1ea2fccfe07d9cfad`. Removing only `prepare-audio-product` from the parsed candidate yields exact equality with that whole baseline, including all 15 existing jobs. The new job requires push, attempt 1 and `[prepare-audio-product-r1]`, grants `contents: read`, uses checkout with credentials not persisted, and has no remote write/adoption step. Its artifact upload is `always()` with missing outputs treated as an error. No Safari transport edits are included.

The helper diff preserves the proven predecessor's input-set check, 47 input hashes, dependency version checks, baseline rebuild and root check, candidate build/export/validate sequence, after-build all-input check, exactly-two-changed-tracked-files check, generated dist/root equality, completion status, and `finally` report preservation. Only the adopted postfx baseline changes within the 47 hashes. The baseline bundle is the adopted `81c93f3...`; postfx is `b9a4f942...`; candidate audio is exact `22add12...`, with its original audio baseline still `b54ff04c...`. The candidate replacement rejects either source baseline drift or candidate hash drift. The source baseline and candidate/root identities are separately recorded; preparation does not update the production checkout outside this disposable job.

The seven supplied CPU checks were rerun from an isolated script copy with only import/input/output locations adjusted. All pass: exact source acceptance and both drift refusals, C31 bundle/postfx identity, 47 input pins, complete eight-file transport including an empty file and chunk boundaries, and rejection of last-file corruption before any export bytes.

Four narrowly targeted independent checks also pass: input verifier source equivalence to the original helper; correct Git blob NUL framing; an actual early `prepare()` failure on an isolated local Git fixture writes `preparation failed; no product commit`, zero commands/files, then refuses export; and a validly hashed final output over the 4 MiB cap is refused before the first export record. No product build command was executed in that failure fixture. Results are in `copied-verification.json`, `independent-preparation-results.json`, and `independent-workflow-review.json`; source diff is `helper-diff.patch`.

Baseline reproduction of the current `81c...` source/root pair and generation of the new audio root remain for the real authorized preparation job. A static/code/CPU review is not reported as that job having run. On failure, partial prepared files can remain in the disposable checkout/artifact, but the failed status cannot be exported as a completed build. The receiver must retain the existing complete-chunk, metadata/end, hash and commit checks.

Original candidates and upstream result files were read-only throughout. All new review/test artifacts are confined to `audio-candidate-independent-review-ultra/preparation-review/`. Remote operations, automation, PR/main, CI, and new agents: 0. All 19 elements remain `not measured`, references 10, criteria 71, valid blind comparisons 0, completed units 0, and deadline `2026-09-20T20:56:49+09:00` unchanged.
