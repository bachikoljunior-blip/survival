# Exact grain candidate preparation through existing CI

Status: design only; no workflow/helper edits, CI dispatch, remote mutation, product adoption, or deployment performed. The r2 diagnosis and the single Ultra integration owner's decision remain prerequisites for product adoption. All 19 elements remain `not measured`; work remains `continuous`, completed units `0`, with the fixed 2026-09-13T20:56:49+09:00 start and 2026-09-20T20:56:49+09:00 deadline.

## Existing mechanism

The fixed a6d420f `Floor gates` workflow already has a read-only `prepare-reviewed-light` job using `actions/checkout@v4` with `persist-credentials: false`, Node 20, `npm ci`, a preparation helper, complete base64 log export, and `actions/upload-artifact@v4`. That helper only prepares an exact source/root pair. It does not commit, merge, deploy, or assess element satisfaction. Its old atmosphere and bundle guards target an older change, so invoking it unchanged cannot prepare this grain candidate.

`build.mjs` generates `dist/cinderline.1.0.0.js` and five static files when `CINDERLINE_BUILD_ID=1.0.0`. `tools/export_pages_root.mjs` mirrors those six files into the checkout root. Its `--check` mode checks byte equality of all six files and rejects extra obsolete root bundles. `npm run validate:pages-root` is exactly `node tools/export_pages_root.mjs --check`. The source/config pins and full text of these existing mechanisms are in `evidence/ci-source-reads.json`.

## Smallest isolated opt-in addition

Two implementation files would be sufficient: a new bounded `tools/prepare-grain-product.mjs` helper with an embedded exact build-input pin map, and a separate optional job appended to the existing workflow. Existing jobs and the existing light helper remain unchanged. Suggested job selection follows the existing pattern: push event, `github.run_attempt == 1`, and an explicit `[prepare-grain-product-r1]` commit marker. Use `contents: read`, checkout without persisted credentials, Node 20, locked `npm ci`, and a finite 15-minute job timeout. Do not install or start browsers for this preparation-only job.

This is a proposal for the integration owner; it has not been implemented or run. The latest production HEAD and concurrent workflow changes must be checked before preparing any such remote change. C29's runtime identity was reported unchanged by the integration owner; this package independently fixes and verifies a6d420f inputs.

## Required helper order

1. Record actual checkout commit, Node version, lock hash, source/build/public input hashes and the original root bundle hash. Require every one of the 47 build-input bytes to match the a6d420f manifest; require original postfx SHA256 `77009861becf2e298eba0f7f793c01e76ef50b62d4432857acb21326e937d6b3` and original root bundle SHA256 `6b887bc1cf6ebc0b7fae6c146e46c05d067ad5ba51544fd218d17e8483ea338b`. Require a clean tracked checkout before modifications. Capture the seven original files: postfx source, bundle, and five static root files.
2. Run `CINDERLINE_BUILD_ID=1.0.0 node build.mjs` on the unchanged source. Require the new `dist/cinderline.1.0.0.js` SHA256 to equal the original production hash above. Then run `node tools/export_pages_root.mjs --check` to establish exact source-to-root reproduction. Stop on any mismatch; do not apply grain changes or manufacture a replacement reference hash.
3. Require exactly one match each for `grain: 0.035,` at the grade default and `uGrain: { value: 0.035 },` at uniform initialization. Apply only the two pinned replacements in `candidate.patch`. Require complete changed-source SHA256 `b9a4f9422242d27c329b77e6502f251281fddf80a6a62880202adc2040ce1a5a`. Keep the low-tier gate unchanged.
4. Run `node --check src/render/postfx.js`, then `CINDERLINE_BUILD_ID=1.0.0 node build.mjs`, `node tools/export_pages_root.mjs`, `node tools/export_pages_root.mjs --check`, and the existing `node tools/validate.mjs`. These are finite source/build/content checks; they do not measure visual quality.
5. Require the tracked changes and the seven captured file comparisons to report only `src/render/postfx.js` and `cinderline.1.0.0.js` changed. Require all five static root files and every other build input unchanged. Record new runtime SHA256 and Git blob SHA, file byte lengths, full baseline/candidate verification results, and actual exit codes. Only then mark preparation successful.
6. Save the exact seven prepared files and a non-prose manifest under a dedicated `test-results/grain-product-build-r1/`. Export using the existing complete-byte metadata/chunk/end pattern (3000 raw bytes per base64 chunk, bounded file sizes); attach the same directory as an artifact. Export must rehash every file and refuse an incomplete or failed preparation report. Always preserve failure reports with their actual status.

## Exact-byte adoption boundary

After the root executor obtains official job logs/artifacts, reconstruct files only from their actual complete bytes. Validate matching metadata/end records, unique contiguous offsets without gaps, total lengths, SHA256 and Git blob SHA against the job manifest. Independently review the exact prepared source/bundle pair. The resulting source and runtime hashes can then be supplied to E16 acquisition and other consumers.

Product adoption remains a later, separate decision and commit by the existing sole remote executor. The two exact prepared changed files must be committed together with the authorized state/evidence updates and pass the ordinary protected PR/main workflow. Do not commit source alone with a stale root bundle, replace text inside a minified bundle, or treat the preparation job as deployment. Build preparation can be considered separately from adoption, but this document neither authorizes nor initiates it.

## Existing CI and measurement limits

The ordinary F3 WebKit step sets `CINDERLINE_REQUIRE_BASELINE=1`. At a6d420f, `tools/test-iphone-webkit.mjs` requires `tests/baselines/iphone-se3-webkit-gameplay.png` to exist, requires matching dimensions, uses pixelmatch threshold `0.25`, `includeAA: false`, and maximum changed-pixel ratio `0.15`. It also requires mean luminance between 5 and 248, luminance standard deviation above 11, and near-black ratio below 0.86. Its stable view uses camera `(-70, 11.3, -22, 180, -20)` and a paused gameplay screenshot. A grain change may change the actual regression ratio; passing is unmeasured. No snapshot or threshold change is proposed.

The r2 diagnosis covers medium-tier eight views only. High-tier appearance remains unmeasured. Low tier remains grain-disabled through `u.uGrain.value = this.tier.grain ? g.grain : 0`. Candidate browser, WebKit, iOS, visual-regression and element-comparison results are all unmeasured. C29 audio helper's old runtime pin must be updated by its owner before measuring an adopted new runtime; this package does not edit it.
