# GB-IMP06 independent source-aware review

Review task: `GB-IMP06-REVIEW`

Handoff: `HANDOFF-GB-IMP06-REVIEW-01`

Date: 2026-07-31
Reviewer role: independent code-and-test reviewer

## Scope

This review attempts to falsify only the Chapter 1 movement, breathing, combat, repeatability, and evidence-integrity claims in the handoff. It is source-aware. It is not a source-blind play-feel review, a real-device test, a performance test, a complete vertical-slice approval, or an opening-to-ending playthrough.

The declared inputs read in full were:

- `AI_DEVELOPMENT/HANDOFFS/GB-IMP06-REVIEW.json`
- `docs/DONE.md`
- `PROJECT_OPERATING_PROTOCOL.md`
- `AI_DEVELOPMENT/EVIDENCE/GB-IMP06-SLICE.json`
- `src/core/engine.js`
- `tools/gate_b_driver.js`
- `tools/gate_b_slice.mjs`
- `package.json`

To validate the direct runtime paths claimed by the driver, inspection was limited further to the relevant definitions/call sites in `src/core/input.js`, `src/game/game.js`, `src/actors/actor.js`, `src/world/gas.js`, `src/game/combat.js`, `src/game/ai.js`, and `src/game/director.js`. `README.md` and implementer prose were not read or used as evidence.

No product or test source was modified. Browser adversarial experiments were performed only in disposable copies of the current worktree. This file is the only review edit.

## Commands and results

### Required operating-state check

```text
$ npm run validate:ops
Operating-state validation OK
  revision       2026-07-31.3
  plan nodes      5
  tasks           11
  active task     GB-IMP06-REVIEW
  session status  active
```

Result: **PASS**, exit 0.

### Required Gate B rerun

The exact current worktree was copied to an isolated temporary directory before this command because the runner unconditionally writes `AI_DEVELOPMENT/EVIDENCE/GB-IMP06-SLICE.json` on success. This kept the reviewed repository unchanged while exercising the same source and dependencies.

```text
$ PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright npm run test:gate-b
[cinderline] built dev bundle -> dist/
ok    run 1  distance=311.1m air=857ppm/0.229 hits=8 kills=3 hp=86.4
ok    run 2  distance=311.1m air=857ppm/0.229 hits=8 kills=3 hp=86.4
GATE B REPRESENTATIVE SLICE OK (partial scope)
```

Result: **PASS**, exit 0. Both fresh 667x375 mobile-emulated contexts had empty driver-error and browser-error arrays.

The pre-review durable evidence was generated at `2026-07-31T13:30:23.585Z`; the isolated rerun report was generated at `2026-07-31T13:35:07.898Z`. A structured comparison returned:

```text
top_level_claims_equal  true
semantic_results_equal true
stable_counters_equal  true
prior errors            [[], []]
rerun errors            [[], []]
```

The compared stable counters were distance, maximum step delta, footsteps, meter reads, attack inputs/starts, player hits, damage dealt/taken, and kills. Full-precision gas samples, simulated duration, and final HP drifted slightly, so the supported repeatability claim is semantic rather than byte-for-byte deterministic.

### Source-path inspection

- `Engine.stepFixedForTest` refuses production builds, a running RAF, paused/context-lost state, and invalid step counts, then iterates the complete ordered `_updaters` list with `FIXED_DT` (`src/core/engine.js:296-324`).
- The driver waits for play mode and calls `G.engine.stop()` before any deterministic step (`tools/gate_b_driver.js:305-314`).
- The game updater consumes `Input`, maps movement/action intent, updates gas and actors, calls `moveActor` collision, and updates combat, AI, and Director systems (`src/game/game.js:398-448`, `456-512`; `src/actors/actor.js:310-340`, `363-453`).
- Movement enters through synthetic touch `PointerEvent`s accepted by the production floating-stick handlers (`tools/gate_b_driver.js:70-105`; `src/core/input.js:145-238`). Action inputs enter below the visual button surface through `tapVirtual`/`setVirtual`, then the same fixed-step button queue used by production input (`src/core/input.js:289-305`).
- Combat hit and kill telemetry comes from `CombatSystem._resolveArc` -> `_applyHit` -> actor `damage`, followed by the game's `damageNumber` and `kill` events (`src/game/combat.js:307-408`). The unmodified rerun recorded three player-attributed kills and zero remaining members of the three-actor authored courtyard raid.
- The fresh player was reported with gas assistance off, combat assistance zero, gas immunity false, and no filter. The unmodified rerun crossed the live `Lungs.critical` threshold and later recovered below saturation 0.06 with `survivedSaturation == 1`.

## Acceptance assessment

| Handoff criterion | Result | Exact supported claim |
|---|---|---|
| Full fixed-step updater chain with live RAF stopped | PASS | The development-only fixed-step chain ran; render/RAF behavior was intentionally not exercised. |
| Movement through production input and collision, not placement | PASS for the unmodified driver; guard integrity FAIL | The observed route used the production stick-to-collision path and had 311.1 m distance, 363 footsteps, and 0.276 m maximum per-step displacement. Finding GB06-R01 prevents treating the anti-shortcut control itself as proven. |
| Unmasked, nonimmune, unassisted critical exposure and recovery | PASS for the unmodified driver | Initial assist/filter invariants and the critical/recovery outcomes were reproduced. This is an internal scripted respiratory-path check, not user comprehension or real-device evidence. |
| Three authored raid actors die through player combat inputs and normal hit path | PASS for the unmodified driver; guard integrity FAIL | The clean run recorded eight normal player hits, 175 damage, three player-attributed kills, and zero remaining raid actors. Finding GB06-R01 shows the harness can silently precondition actor health and still pass. |
| Forbidden shortcuts rejected by executable source/runtime controls | **FAIL** | See GB06-R01. |
| Two fresh contexts have the same semantic result and no browser errors | PASS for the clean rerun; durable-currentness control FAIL | The clean rerun matched the prior semantic result with no errors. See GB06-R02 for stale durable evidence after failure. |
| Claims remain explicitly partial | PASS | Driver, runner, and evidence all exclude C1, D3, full playtime, and real-device claims. |

## Findings

### GB06-R01 — Anti-shortcut controls are bypassable while the official runner passes

- **Severity:** high
- **Affected criterion:** “Forbidden shortcuts are rejected by executable source checks and runtime sentinels”; confidence in the movement and combat-path criteria.
- **Evidence:** `tools/gate_b_slice.mjs:23-35` uses seven regular expressions over driver text. It does not reject direct HP writes, `Vector3.set`, bracket notation, aliases, or indirect calls. `tools/gate_b_driver.js:327-338` replaces only the two instance properties `P.placeAt` and `G.teleport`, while retaining their original functions in local variables. The driver header says actor health and position are not mutated, but that invariant is not executable.
- **Reproduction:** in a disposable copy, insert the following two lines into the driver, then run the official outer runner:

  ```js
  // After the placement/teleport replacements:
  originalActorPlacement.call(P, P.pos.x, P.pos.y, P.pos.z, P.yaw);

  // After asserting the authored raid has three actors:
  raid.group.forEach((enemy) => { enemy.hp = 30; });
  ```

  ```text
  $ PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright node tools/gate_b_slice.mjs
  ok    run 1  distance=289.8m air=857ppm/0.229 hits=5 kills=3 hp=62.4
  ok    run 2  distance=289.8m air=857ppm/0.229 hits=5 kills=3 hp=62.4
  GATE B REPRESENTATIVE SLICE OK (partial scope)
  ```

  Result: exit 0. The captured placement helper was invoked without incrementing the runtime sentinel, and all raid actors were preconditioned by a direct health write without triggering the source guard. The clean baseline needed eight hits; the altered run passed with five.
- **Likely cause/direction:** text regexes recognize only a few spellings, and the runtime checks guard helper properties rather than state transitions/invariants. Remove retained bypass references; enforce initial raid health and respiratory invariants at the point of use; correlate each authored raid actor's HP changes and death with a player-input-started combat attack and normal hit telemetry. Add executable negative fixtures for alias calls, `.pos.set`, direct HP/lung/progression writes, bracket notation, and aliased damage/kill/event calls. An AST/token check can supplement, but not replace, runtime provenance assertions.
- **Required retest:** the clean two-context command must still pass. Each adversarial fixture above must be rejected with nonzero exit, including the exact indirect placement and HP-preconditioning reproduction. Reconfirm the production touch-stick/collision route and all three authored actor identities through the normal combat provenance path.

### GB06-R02 — A failed current run leaves stale durable `passed:true` evidence

- **Severity:** high
- **Affected criterion:** durable evidence integrity and the “two fresh contexts produce the same semantic result with no browser errors” claim.
- **Evidence:** `tools/gate_b_slice.mjs:139-144` always writes the latest report only to `shots/gate-b-slice-latest.json`, but writes `AI_DEVELOPMENT/EVIDENCE/GB-IMP06-SLICE.json` only when `failed` is false. The durable report also contains no operating revision or source/build hashes; `results[].build` is only package version `1.0.0`.
- **Reproduction:** in a disposable copy containing a prior passing evidence file, insert `expect(false, 'adversarial forced failure')` after the engine-stop assertion and run the outer runner.

  ```text
  $ PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright node tools/gate_b_slice.mjs
  FAIL  run 1 ... Error: adversarial forced failure
  FAIL  run 2 ... Error: adversarial forced failure
  GATE B REPRESENTATIVE SLICE FAILED
  ```

  Result: exit 1. Afterwards:

  ```text
  AI_DEVELOPMENT/EVIDENCE/GB-IMP06-SLICE.json
    generated_at  2026-07-31T13:35:07.898Z
    passed        true
    errors        [[], []]

  shots/gate-b-slice-latest.json
    generated_at  2026-07-31T13:44:57.079Z
    passed        false
    errors        [[forced failure], [forced failure]]
  ```

  Thus a consumer of the designated durable evidence alone sees a pass after the current test failed.
- **Likely cause/direction:** the file is functioning as an unlabeled “last successful run” artifact, while its path and schema present it as current evidence. Always publish the latest authoritative attempt atomically, including failures, and bind it to the operating revision plus hashes of the engine, driver, runner, and built artifact. If retaining the last pass is useful, store it under an explicitly historical name and never use it as current gate evidence.
- **Required retest:** force a two-context failure and verify that the authoritative durable evidence is current, revision-bound, and `passed:false` (or explicitly invalidated), then restore the clean driver and verify an exit-0 run publishes a current `passed:true` report whose semantic result matches both contexts.

## Limitations and non-approvals

- **B1 is not approved.** Dialogue is advanced through internal runner/UI callbacks, and no source-blind player evaluated comprehension or fun.
- **B2 is not approved.** The 667x375 emulation demonstrates the canvas floating-stick event path and downstream virtual-button queue only. Attack, dodge, guard, meter, and interact do not click or touch their rendered HUD controls, so control layout, hit targets, occlusion, simultaneous thumbs, and device behavior remain untested.
- **B3/B4 are not approved.** The live RAF is stopped; this review includes no visual sweep, rendered-frame measurement, throttling result, or real-device result.
- **C1 and D3 are not approved.** The run is a Chapter 1 partial slice, not an opening-to-ending or clean-save completion.
- This review does not establish save/load, interruption/recovery, rotation, other viewport sizes, accessibility, long-run stability, or source-blind surface behavior.
- SwiftShader mobile emulation is not an iPhone or other physical device. Full-precision results are not deterministic even though the selected semantic outcome repeated.

## Verdict

**FAIL — GB-IMP06-REVIEW must not be marked verified yet.**

The unmodified representative slice itself reruns successfully in two fresh contexts, and the prior evidence matches the rerun's semantic outcome and stable counters. However, GB06-R01 directly falsifies the mandatory anti-shortcut criterion, and GB06-R02 permits stale passing evidence after a current failure. Both high-severity findings require fixes and the stated clean plus adversarial retests. This verdict grants no Gate B pass and no B1, B2, C1, or D3 approval.
