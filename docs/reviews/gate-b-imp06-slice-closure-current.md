# GB-IMP06 current-baseline partial-slice closure review

Review task: `GB-IMP06-REVIEW`

Date: 2026-08-01 (Asia/Tokyo)

Reviewer role: independent source-aware code-and-test reviewer after the final
GB06-R06 provenance hardening

## Scope and isolation

This review verifies only the current Chapter 1 movement, breathing, and combat
representative-slice integrity baseline. It rechecks GB06-R04, GB06-R05, and
GB06-R06, including the newly checked-in death-state and kill-event regression
cases. It does not approve full Gate B, B1, B2, B3, B4, C1, D3, performance,
play feel, physical-device behavior, or release readiness.

The current shared tree was copied after the integration owner declared the
baseline fixed to:

```text
/tmp/cinderline-gb06-current.NXaMaY/survival
```

All builds, negative probes, browser contexts, and evidence writes used that
disposable copy. No shared product, test, operating-state, or evidence file was
changed by this reviewer. The prior `gate-b-imp06-slice-closure.md` records an
earlier `fd4d56d8...` runner and is stale for this current-baseline decision; it
was preserved unchanged. This file is the only shared-tree edit in this pass.

## Current hashes

The disposable snapshot, current shared files, disposable final evidence, and
shared final evidence agreed on these values:

```text
c7a0cb1cbe9f8b6e9ea1a8fc4bf8a95146f8344bf568d28ea8455dc8cf214592  src/core/engine.js
60147238dca48d828d485e8830ed7fd05c1eec58633a9dc1f54db3f6205d9b98  tools/gate_b_driver.js
cdfd13183c056be48b9493f9a57d7d9c7f6a489fb4e5237049e0ec95d3e81461  tools/gate_b_slice.mjs
fcd1936ba01719d34a9ffa82a0532a96bc9a7c1235d6c68702244fd566d6d636  tools/gate_b_adversarial.mjs
bb8b23b95dc24a67f4ec6bd350fff1c4b6c6c96c92c5449e037a6a3c8832a49b  dist/cinderline.1.0.0.js
```

The evidence schema binds engine, driver, runner, and built bundle. All four
bindings matched the copied and current shared files exactly.
`gate_b_adversarial.mjs` is not an evidence-schema binding, so its independently
calculated hash is listed above.

## Commands and results

### Operating-state validation

```text
$ npm run validate:ops
Operating-state validation OK
  revision       2026-07-31.5
  plan nodes      5
  tasks           12
  active task     GB-IMP06-SLICE
  session status  active
```

Result: **PASS**, exit 0.

### Complete current Gate B partial-slice suite

```text
$ PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright npm run test:gate-b
[cinderline] built dev bundle -> dist/
ok    dynamic placement alias -> nonzero exit and current passed:false evidence
ok    pre-combat hostile HP write -> nonzero exit and current passed:false evidence
ok    computed combat-resolver alias -> nonzero exit and current passed:false evidence
ok    attack-definition event reentry -> nonzero exit and current passed:false evidence
ok    attack-definition poise event reentry -> nonzero exit and current passed:false evidence
ok    attack-definition reach event reentry -> nonzero exit and current passed:false evidence
ok    attack-definition arc event reentry -> nonzero exit and current passed:false evidence
ok    active-attack timing event reentry -> nonzero exit and current passed:false evidence
ok    active-attack active-window event reentry -> nonzero exit and current passed:false evidence
ok    attack hit-set event reentry -> nonzero exit and current passed:false evidence
ok    attack hit-set prototype event reentry -> nonzero exit and current passed:false evidence
ok    damage-event HP reentry -> nonzero exit and current passed:false evidence
ok    nested damage-method event reentry -> nonzero exit and current passed:false evidence
ok    death-state event reentry -> nonzero exit and current passed:false evidence
ok    kill-event reentry -> nonzero exit and current passed:false evidence
ok    post-audit updater registration -> nonzero exit and current passed:false evidence
ok    direct updater-list mutation -> nonzero exit and current passed:false evidence
ok    computed updater-list mutation -> nonzero exit and current passed:false evidence
ok    failed-latest-run evidence invalidation -> nonzero exit and current passed:false evidence
GATE B ADVERSARIAL REGRESSIONS OK
ok    run 1  distance=302.6m air=857ppm/0.229 hits=10 kills=3 hp=97.4
ok    run 2  distance=302.6m air=857ppm/0.229 hits=10 kills=3 hp=97.4
GATE B REPRESENTATIVE SLICE OK (partial scope)
```

Result: **PASS**, exit 0.

All 19 checked-in negative probes produced the expected nonzero child exit and
current `status=failed`, `passed=false`, revision/source/build-bound evidence.
Only the unchanged final clean run restored `passed=true`.

## Final clean evidence

The disposable final report contained:

```text
run_id       GB-IMP06-SLICE-1785512510893-2513
status       passed
passed       true
repeatable   true
viewport     667x375 mobile emulation, two fresh contexts
errors       none (preflight, driver, integrity, browser)
```

Both fresh contexts independently recorded:

- three full-health authored raid actors: two scavengers at `62/62` and one
  slinger at `44/44`;
- 20 normal attack inputs, 14 player attack starts, 10 authenticated hit
  resolver calls, 10 normal HP transitions, 209 reported damage, three proven
  deaths (`[7, 6, 8]`), and zero remaining hostiles;
- `9092` engine fixed steps, `9092` game fixed updates, and `9092` combat
  updates;
- no integrity violations, driver errors, page errors, console errors, or
  browser errors.

The current shared final evidence was also inspected read-only:

```text
run_id       GB-IMP06-SLICE-1785512458232-2517
status       passed
passed       true
repeatable   true
runner       cdfd13183c056be48b9493f9a57d7d9c7f6a489fb4e5237049e0ec95d3e81461
```

It likewise had two clean 667x375 contexts, 10 authenticated hits and three
proven deaths per context, three initially full-health authored actors,
`9092=9092=9092` step counts, no errors or violations, and all four required
hash bindings matching the current shared files.

## Source assessment and findings

No new high-severity or other actionable finding was established within the
authorized checked-in-suite/source review.

The current runner:

- snapshots and seals every authored attack-definition field, seals attack
  identity/timing/state fields, and rechecks both shape and value at arc and hit
  resolution;
- restricts hit-set additions to authenticated arc selection and compares the
  resulting set against its expected IDs, including against direct
  `Set.prototype.add` access;
- gives each authenticated hit a target-bound `damageCalls=0` allowance,
  consumes it before entering the first actor `damage` call, captures that
  call's result, and requires exactly one call before `_applyHit` returns;
- protects both HP and `dead` state so neither can change outside authenticated
  damage;
- authenticates exactly one damage event when the damage result requires it,
  exactly one kill event only for a killed result, event amount, attacker,
  target HP/death state, and ordering; and freezes accepted telemetry payloads;
- retains permanent negative fixtures for attack definition/timing/hit-set,
  direct HP, nested computed damage, death-state mutation, manufactured kill
  telemetry, updater access, placement/HP preconditioning, direct resolver
  access, and stale evidence.

No additional mutation code was invented for this closure; the verdict relies
on the checked-in regression suite and the current runner source.

## Finding disposition

| Finding | Current disposition | Evidence |
|---|---|---|
| GB06-R04 — mutable authored attack definition/timing/hit set accepted | **RESOLVED in the checked-in regression scope** | Damage, poise, reach, arc, windup, active-window, hit-set instance, and hit-set prototype probes all exited nonzero with current `passed:false` evidence. |
| GB06-R05 — shared evidence not bound to reviewed source | **RESOLVED** | Shared evidence runner binding equals current runner hash `cdfd1318...`; engine, driver, and built-bundle bindings also match the current files. |
| GB06-R06 — nested damage accepted during authenticated event delivery | **RESOLVED for the checked-in reproduction and source-enforced invariants** | Computed nested damage, direct HP, death-state, and kill-event reentry probes all exited nonzero. Source requires one target-bound damage call and reconciles damage/kill telemetry to its captured result. |

No unresolved high finding remains in this current partial-slice closure scope.

## Limitations and explicit non-approvals

- This was source-aware scripted verification, not a source-blind assessment of
  fun, comprehension, usability, or play feel. B1 is not approved.
- The contexts used Playwright Chromium with SwiftShader mobile emulation, not
  a physical iPhone or other device. No real-device claim is made.
- Although the viewport was 667x375, action automation enters through the
  production input queue below rendered HUD hit targets. It does not establish
  physical touch target layout, simultaneous-thumb behavior, or B2.
- The live RAF is stopped for deterministic fixed steps. This is not visual,
  frame-rate, throttling, B3, B4, or performance evidence.
- This is a Chapter 1 partial route, not an opening-to-ending playthrough,
  clean-save completion, C1, or D3.
- Save/load, rotation, other viewport sizes, interruption/recovery,
  accessibility, long-run behavior, and full release readiness remain outside
  scope.
- Passing a bounded executable suite does not prove the absence of every
  possible JavaScript mutation. The disposition is limited to the checked-in
  cases and source invariants reviewed here.

## Verdict

**PASS — GB-IMP06 Chapter 1 movement/breathing/combat partial slice only.**

The current suite rejects all checked-in invalid state and combat-provenance
fixtures, including mutable authored definition/timing/hit-set paths, nested
same-target damage, forged death state, and forged kill telemetry. Its final
two fresh 667x375 contexts complete with three full-health authored opponents,
three normal-input/provenance-backed defeats, no errors, and evidence bound to
the copied engine, driver, runner, and bundle. Current shared passing evidence
binds the same hashes. This grants no broader Gate B or release approval.
