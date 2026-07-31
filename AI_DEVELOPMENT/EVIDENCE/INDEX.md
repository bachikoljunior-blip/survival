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
