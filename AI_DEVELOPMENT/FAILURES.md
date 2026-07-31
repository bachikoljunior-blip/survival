# Execution and approach failures

Product defects belong in `docs/bible.md` §17/§17b and review findings belong in `docs/reviews/`. This file records failed commands, invalid instruments and recovery steps.

## OF-001 — Dependency install used an unwritable default cache

- Date: 2026-07-31
- Task: OPS-001
- Status: recovered
- Symptom: `npm ci` failed while trying to create `/root/.npm`, leaving a partial `node_modules` tree.
- Cause: The Work filesystem does not permit that default cache path.
- Recovery: Moved the partial dependency tree to `/tmp/survival-node_modules-failed-20260731-1` and reran with `NPM_CONFIG_CACHE=/tmp/survival-npm-cache` and `NPM_CONFIG_LOGS_DIR=/tmp/survival-npm-logs`.
- Result: five locked packages installed successfully.
- Reusable rule: In this Work environment, use a project-specific writable npm cache; do not reinterpret this environment failure as a repository defect.

## OF-002 — First Playwright browser download endpoint returned empty archives

- Date: 2026-07-31
- Task: OPS-001
- Status: recovered
- Symptom: the primary CDN returned a 0 MiB non-ZIP for Chromium, ffmpeg and headless shell.
- Recovery: Playwright's configured Microsoft fallback downloaded the complete artifacts to `/tmp/survival-playwright`.
- Result: Chromium, ffmpeg and headless shell installed; browser gates can run with `PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright`.

## OF-003 — Baseline full-suite run reported a door transition stall

- Date: 2026-07-31
- Task: GB-IMP06
- Status: repair under verification
- Baseline observation: `npm test` reported `door transition stalled: door_arcade` on `publish`, although that route still reached `record`; the other four routes passed. The full suite correctly exited non-zero.
- Isolated reproduction 1: a fresh `--path publish` run passed.
- Isolated reproduction 2: a fresh `--path publish` run failed at a different door, `exit_arcade`, then cascaded into unrelated missing Iris/office/chapter/final assertions.
- Classification: reachability-harness timing defect, not yet evidence of a deterministic product door defect. The changing door plus one clean isolated run contradict a fixed content/target failure. The driver accelerated fixed-step simulation under SwiftShader but allowed only 6000 ms for a production fade driven by real timers.
- Repair: preserve the real interaction event and production transition, allow up to 30000 ms for logical completion, and log harness delays above 5000 ms. Transition responsiveness remains a separate user-surface/performance criterion and is not waived.
- Required next step: two fresh isolated `publish` runs and then the complete suite. Until they pass, the repair is not verified and a quarantine cannot count as passing.

## OF-004 — Door-delay diagnostic called the playthrough log array as a function

- Date: 2026-07-31
- Task: GB-IMP06
- Status: repair under verification
- Symptom: The first complete-suite retry stopped the `publish` path at the first door with `TypeError: log is not a function`; the run was intentionally interrupted after the common cause was identified.
- Cause: OF-003's new delayed-transition diagnostic used `log(...)`, but the existing driver declares `log` as an array and appends with `log.push(...)` everywhere else.
- Repair: Change only the diagnostic append to `log.push(...)`.
- Required next step: Run the isolated `publish` route, then restart the complete suite from its first gate. Do not count the interrupted run as a pass.

## OF-005 — Gate B combat evidence accepted progressively stronger invalid operations

- Date: 2026-07-31
- Task: GB-IMP06-REVIEW
- Status: recovered and independently closed for the partial-slice scope
- Symptoms: successive independent reviews demonstrated accepted placement/HP preconditioning, stale green evidence after failure, direct computed resolver use, mutable authored attack definitions, and nested same-target damage during event delivery.
- Common cause: event identity and broad fixed-step timing were initially treated as authority without authenticating the complete production call chain, immutable authored values, exact state transitions and one-hit/one-damage/event cardinality.
- Recovery: atomically invalidate evidence at run start; bind it to state/source/build hashes; seal engine/game/combat/AI instance and prototype call paths; snapshot and protect attack definitions/state/hit sets; reconcile HP/death and damage/kill telemetry to exactly one authenticated hit; retain every reproduction as an executable expected-failure fixture.
- Final evidence: `AI_DEVELOPMENT/EVIDENCE/GB-IMP06-SLICE.json` and `docs/reviews/gate-b-imp06-slice-closure-current.md`.
- Reusable rule: object identity, event names and “inside update” flags are not provenance. Bind exact values, ordering, cardinality and resulting state, and require each previously successful invalid operation to remain a nonzero regression test.
