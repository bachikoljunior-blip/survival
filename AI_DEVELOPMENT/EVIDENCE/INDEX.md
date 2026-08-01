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

## OPS-REMOTE-PUBLISH — Remote integration and GitHub Pages

- Status: verified on `main` at `cc96f3a6cd94e11d3c71342ed568816ed55a9e59`.
- Artifact: `AI_DEVELOPMENT/EVIDENCE/OPS-REMOTE-PUBLISH.md`.
- Result: PRs #2 and #3 merged; both Pages deployment paths succeeded; the public HTML, JavaScript, CSS and manifest matched the local production build by SHA-256.
- Limitation: the cloud browser loaded the deployed bundle but has WebGL disabled. Runtime behavior remains supported by the earlier SwiftShader tests, not by this public cloud-browser smoke check; no physical-device claim is made.

## GB-H1-SAVE-MIGRATION — Save migration and save-loss regression

- Status: under review. Implemented and machine-verified; not independently reviewed, and not a browser or device result.
- Command: `npm run test:save` (`node tools/make_save_v1_fixture.mjs --check && node tools/save_migration.mjs`)
- Artifact: `AI_DEVELOPMENT/EVIDENCE/GB-H1-SAVE-MIGRATION.json`
- Input: `tools/fixtures/save-v1.json` — a real save written by the published v1 build's own `Storage.save()` at `cc96f3a`, regenerable and drift-checked by `tools/make_save_v1_fixture.mjs`.
- Observed result: 73 checks; a published v1 save loads with flags, inventory, capabilities, quests, journal, chapter, play time and world envelope intact and is relocated to the current key; unreadable, newer-version and shapeless saves are kept byte-for-byte in `cinderline.save.rescued` and survive the autosave that follows; four injected broken migration steps are reported rather than obeyed; five negative controls — including the exact pre-fix loader — are each rejected by at least one check.
- Limitation: the migration chain has one production step (v1 → v2), so a two-or-more-step chain is unexercised. Runs on an in-memory `localStorage`, not a browser and not iOS storage eviction.

## GB-H2-FAULT-RECOVERY — Post-boot uncaught errors and rejections

- Status: under review. Implemented and machine-verified; not independently reviewed; not a device result.
- Command: `npm run test:faults` (`node build.mjs && node tools/fault_recovery.mjs`)
- Artifact: `AI_DEVELOPMENT/EVIDENCE/GB-H2-FAULT-RECOVERY.json`
- Observed result: 30 checks in a production build at 667x375. A clean boot shows nothing; a single sync throw and a rejected promise are caught, saved and surfaced without a wall; a fault during play writes a current-version save; a repeating fault and a fixed-step updater that throws every frame — the real silent freeze, frame counter provably stopped — both reach the recovery panel, whose RELOAD control recovers; the panel and notice are in Japanese on a Japanese device; with the bundle blocked, a pre-boot rejection reaches the loading plate.
- Limitation: SwiftShader Chromium is not iOS Safari and not a physical device. No claim is made about any specific real-world crash.

## GB-TOUCH-SMOKE — Visible touch controls at 667x375

- Status: under review. Machine-verified; not independently reviewed; not a device result.
- Command: `npm run test:touch` (`node build.mjs && node tools/touch_smoke.mjs`)
- Artifact: `AI_DEVELOPMENT/EVIDENCE/GB-TOUCH-SMOKE.json`
- Observed result: 118 checks driven by `Input.dispatchTouchEvent` at coordinates read off the rendered elements. Nine visible controls measure 54x54 (attack) and 44x44 (the rest), all on screen, none overlapping, none dead, with the action frame itself transparent to touch; a left-zone touch plants the stick under the finger and walks 0.71m; a right-zone drag turns the camera; an attack tap reaches `actor:attackstart`; dead space between the circles presses nothing; two fingers move and strike together and one may leave without the other; dialogue answers are 44px, are not committed by a drag and are committed by a tap; portrait raises the barrier, stops the world and blocks touches to the controls behind it, and landscape restores working 44px targets.
- Limitation: emulated touch in mobile-emulated Chromium is not a thumb on glass (blocker B1), and this says nothing about iOS Safari gesture behaviour, the map screen or the absent tutorial screen (audit M8).
