# Evidence index

Evidence records are append-only and identify task ID, acceptance references, baseline, exact environment, command/manual procedure, result, artifact paths and limitations.

## GB-IMP06-SLICE — Chapter 1 representative slice

- Status: verified for the explicitly partial slice; not B1/B2/C1/D3, full playtime, performance or real-device evidence.
- Command: `PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright npm run test:gate-b`
- Current artifact: `AI_DEVELOPMENT/EVIDENCE/GB-IMP06-SLICE.json`
- Independent closure: `docs/reviews/gate-b-imp06-slice-closure-current.md`
- Required sequence: every checked-in negative fixture exits nonzero and writes current `passed:false`; only the final unchanged two-context run may restore `passed:true`.
- Observed clean result: 667x375 fresh contexts twice, 302.6m production-input movement, 857ppm / saturation 0.229 exposure and recovery, 10 authenticated hits, three full-health authored opponents defeated, 9092 equal engine/game/combat steps, zero browser or integrity errors.
- Limitation: Playwright Chromium with SwiftShader is not a physical device, live RAF performance test, rendered touch-target test or opening-to-ending run.

## BM-REF — Reference-benchmark baseline

- Status: verified as a current-state measurement of CINDERLINE only.
- Commands: `npm run build`, `node tools/perf.mjs`, `node tools/bench_measure.mjs`, `node tools/check_benchmarks.mjs`
- Artifact: `AI_DEVELOPMENT/EVIDENCE/BENCH-BASELINE.json`, bound to the built bundle's SHA-256.
- Standard it measures against: `docs/benchmarks.md` (10 reference works, 19 elements, 71 criteria).
- Observed: draw calls low 132 / medium 310 / high 414; 752,493–1,076,067 triangles submitted per frame against a 300,000 budget; 417 scene-wide shadow casters; max texture edge 512px and ~78.7MB estimated texture memory; 1,412,013-byte production bundle; touch targets 44.0px at uiScale 1.0/1.5 but 35.2px for five of nine at 0.80; zero overlapping touch targets at every scale; audio locked before the first gesture; zero page errors across two runs.
- Guard verification: the threshold lock, the honesty rule and the no-imitation scan were each shown to reject a negative case (weakening a threshold inside one revision; marking a device-only criterion as met; a reference title appearing in shipped source).
- Limitation: **No reference work was run, measured, screenshotted or compared side by side.** Playwright Chromium with SwiftShader at 667x375 is not a physical device; frame rate and frame time were deliberately not measured. Scene-wide counts are an upper bound on the per-frame on-screen budgets, not a frustum breakdown.

## OPS-REMOTE-PUBLISH — Remote integration and GitHub Pages

- Status: verified on `main` at `cc96f3a6cd94e11d3c71342ed568816ed55a9e59`.
- Artifact: `AI_DEVELOPMENT/EVIDENCE/OPS-REMOTE-PUBLISH.md`.
- Result: PRs #2 and #3 merged; both Pages deployment paths succeeded; the public HTML, JavaScript, CSS and manifest matched the local production build by SHA-256.
- Limitation: the cloud browser loaded the deployed bundle but has WebGL disabled. Runtime behavior remains supported by the earlier SwiftShader tests, not by this public cloud-browser smoke check; no physical-device claim is made.
