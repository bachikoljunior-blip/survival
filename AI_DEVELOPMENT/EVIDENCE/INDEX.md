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

## GB-H1-SAVE-MIGRATION — Save format migration

- Status: implemented, reviewed by three mutually blind lenses, HIGH findings fixed. Not a device result.
- Command: `npm run test:save` (`node build.mjs --dev && node tools/save_migration.mjs`; also `--unit` for the no-browser layers; part of `npm test`)
- Artifacts: `AI_DEVELOPMENT/EVIDENCE/GB-H1-SAVE-MIGRATION.json`, report `shots/save-migration.json`, review `docs/reviews/gate-b-round-h1-h2-touch.md`
- Fixture: `tools/fixtures/save-v1.json` — a real v1 save written by the real game at `193f408`, captured **before** the format changed by `tools/fixtures/capture_legacy_save.mjs`. The suite verifies that revision really shipped `SAVE_VERSION = 1` by asking git, rather than trusting the fixture's note about itself.
- Observed clean result: 129 checks. Three layers — the migration engine (including a staged 1→2→3 walk through an injected registry), the real `Storage` loader over an in-memory localStorage, and the real build in Chromium where the old save is seeded, CONTINUE is pressed and the progress is found in the running game. A save this build cannot read is refused, explained on the title screen, left byte-for-byte alone, and copied into a rescue list that the new game which follows cannot overwrite. The storage address is asserted as a literal, so moving the key fails the gate.
- Negative controls: six, each bound to the specific check that must catch it — a control that only makes "something" fail no longer counts.
- Limitations: the shipped chain has one step, so multi-version migration is proved against an injected registry and not against two real formats. The browser layer has no automated negative control; its ability to fail was observed by hand. A rolled-back release cannot read a migrated save — the pre-upgrade bytes are kept, but nothing offers them back (open finding R2-9). SwiftShader Chromium is not a physical device; blocker B1 is unchanged.

## GB-H2-FAULT-RECOVERY — Post-boot uncaught errors and rejections

- Status: implemented, reviewed with the round, HIGH findings fixed. Not a device result.
- Command: `npm run test:faults` (`node build.mjs && node tools/fault_recovery.mjs`; `--force-failure` proves it can fail)
- Artifact: `AI_DEVELOPMENT/EVIDENCE/GB-H2-FAULT-RECOVERY.json`
- Observed result: 31 checks in a production build at 667x375. A clean boot shows nothing; a single sync throw and a rejected promise are caught, saved and surfaced without a wall; a fault during play writes a current-version save; a repeating fault and a fixed-step updater that throws every frame — the real silent freeze, frame counter provably stopped — both reach the recovery panel, whose RELOAD control recovers; the panel and notice are in Japanese on a Japanese device; with the bundle blocked, a pre-boot rejection reaches the loading plate.
- The runner reports and writes its evidence even when Playwright throws: a crashed run records `passed: false` with the stack, rather than leaving the previous run's passing artifact on disk.
- Limitation: SwiftShader Chromium is not iOS Safari and not a physical device. No claim is made about any specific real-world crash.

## GB-TOUCH-SMOKE — Visible touch controls at 667x375

- Status: machine-verified and reviewed with the round; the review's two critical findings were about this runner's blind spots and are fixed. Not a device result.
- Command: `npm run test:touch` (`node build.mjs && node tools/touch_smoke.mjs`; `--force-failure` proves it can fail)
- Artifact: `AI_DEVELOPMENT/EVIDENCE/GB-TOUCH-SMOKE.json`
- Observed result: 136 checks. The nine controls are named in the runner, so one going missing fails instead of shrinking the run; driven by `Input.dispatchTouchEvent` at coordinates read off the rendered elements. Nine visible controls measure 54x54 (attack) and 44x44 (the rest), all on screen, none overlapping, none dead, with the action frame itself transparent to touch; a left-zone touch plants the stick under the finger and walks (asserted per frame); a right-zone drag turns the camera; an attack tap reaches `actor:attackstart`; dead space between the circles presses nothing; two fingers move and strike together and one may leave without the other; dialogue answers are 44px, are not committed by a drag and are committed by a tap; portrait raises the barrier, stops the world and blocks touches to the controls behind it, and landscape restores working 44px targets.
- Movement is asserted per simulated frame rather than per wall-clock second, so a loaded host cannot fail a working build (it did).
- Limitation: emulated touch in mobile-emulated Chromium is not a thumb on glass (blocker B1), and this says nothing about iOS Safari gesture behaviour, the map screen or the absent tutorial screen (audit M8).
