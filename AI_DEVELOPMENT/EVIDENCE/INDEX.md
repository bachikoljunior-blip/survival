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

## GB-H1-SAVE-MIGRATION — Save format migration

- Status: implemented and gated; **not independently reviewed**, so GB-H1 is `under_review`, not `verified`.
- Command: `node tools/save_migration.mjs` (also `npm run test:save`; part of `npm test`)
- Artifact: `AI_DEVELOPMENT/EVIDENCE/GB-H1-SAVE-MIGRATION.json`, report `shots/save-migration.json`, screenshots `shots/save-migration-loaded.png` and `shots/save-migration-future.png`
- Fixture: `tools/fixtures/save-v1.json` — a real v1 save written by the real game at `193f408`, captured **before** the format changed, by `tools/fixtures/capture_legacy_save.mjs`
- Observed clean result: 57 checks pass. A v1 save loads and its flags, capabilities, inventory, quests and journal are present in the running game; the player is told; the stored bytes are untouched until the next real save. A newer-build save and a truncated save are both refused with an on-screen reason and left byte-for-byte alone. A current save still round-trips identically.
- Negative controls: 9 of 9 source mutations rejected by the gate. One (removing the final version stamp) was missed on the first pass and a check was added for it.
- Limitation: the shipped chain has one step, so the staged 1→2→3 walk is proved against an injected registry, not two real migrations. SwiftShader Chromium is not a physical device; blocker B1 is unchanged.
