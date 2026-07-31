# GB-IMP06 fresh independent partial-slice re-review

Review task: `GB-IMP06-REVIEW`

Handoff: `HANDOFF-GB-IMP06-REREVIEW-02`

Date: 2026-07-31

Reviewer role: fresh independent code-and-test reviewer

## Scope and isolation

This re-review attempts to falsify only the repairs for the two high findings in `docs/reviews/gate-b-imp06-slice.md`. It is source-aware and limited to the handoff-authorized source and evidence. It does not approve B1, B2, C1, D3, performance, play feel, full Gate B, release, or a complete playthrough.

The shared worktree was dirty before review. All builds, browser runs, evidence writes, and adversarial mutations were performed in disposable copies. The primary unmodified copy was:

```text
/tmp/cinderline-gb06-rereview.wpOuIZ/survival
```

The copied baseline hashes matched the authoritative evidence at review start:

```text
c7a0cb1cbe9f8b6e9ea1a8fc4bf8a95146f8344bf568d28ea8455dc8cf214592  src/core/engine.js
60147238dca48d828d485e8830ed7fd05c1eec58633a9dc1f54db3f6205d9b98  tools/gate_b_driver.js
9c18c96f1273c21b36d4e272ed9c67a4e1bb76e627e73f78a4c2f3bdafeb02ae  tools/gate_b_slice.mjs
bb8b23b95dc24a67f4ec6bd350fff1c4b6c6c96c92c5449e037a6a3c8832a49b  dist/cinderline.1.0.0.js
```

The shared authoritative evidence advanced during the review because the integration owner ran a parallel clean/full suite. None of the commands below targeted the shared evidence. This file is the only shared-worktree edit made by this reviewer.

## Source assessment

- `Engine.stepFixedForTest` remains development-only, refuses a running RAF or paused/lost engine, and iterates the complete ordered updater list (`src/core/engine.js:296-324`). The outer runner starts a fresh game, stops the RAF, installs the audit, and only then evaluates the driver (`tools/gate_b_slice.mjs:448-465`).
- The repaired source policy lists position, HP, lung, progression, direct damage/kill/combat, and manufactured-event patterns and runs ten built-in negative fixtures (`tools/gate_b_slice.mjs:55-87`).
- The repaired runtime audit protects placement on both instance and prototype, protects player fields, verifies three full-health courtyard actors at first observation, and checks HP/death transitions between fixed-step boundary updaters (`tools/gate_b_slice.mjs:217-246`, `314-393`).
- The current courtyard geometry is three authored enemies at `[-100,-74]`, `[-96,-88]`, and `[-92,-82]`; the slinger no longer starts on the heat-plant pipe (`src/game/director.js:142-146`).
- Current-attempt evidence is atomically written as non-passing before browser work and the final report is atomically written on both pass and failure (`tools/gate_b_slice.mjs:116-130`, `533-535`).
- The provenance audit still treats any in-fixed-step `damageNumber` emitted while `P.attack` is truthy as a normal player hit and any same-step `kill` with attacker `P` as a proven death (`tools/gate_b_slice.mjs:292-312`, `365-385`). It does not prove that the transition originated in the production `_resolveArc` traversal or that the attack definition is the active authored attack. GB06-R03 exploits this gap.

## Required commands and results

Unless a different directory is shown, commands in this section ran with cwd `/tmp/cinderline-gb06-rereview.wpOuIZ/survival`.

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

Result: exit 0.

### Required clean `test:gate-b` sequence

```text
$ PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright npm run test:gate-b
[cinderline] built dev bundle -> dist/
ok    dynamic placement alias -> nonzero exit and current passed:false evidence
ok    pre-combat hostile HP write -> nonzero exit and current passed:false evidence
ok    failed-latest-run evidence invalidation -> nonzero exit and current passed:false evidence
GATE B ADVERSARIAL REGRESSIONS OK
ok    run 1  distance=302.6m air=857ppm/0.229 hits=10 kills=3 hp=97.4
ok    run 2  distance=302.6m air=857ppm/0.229 hits=10 kills=3 hp=97.4
GATE B REPRESENTATIVE SLICE OK (partial scope)
```

Result: exit 0. Inspection immediately afterward found `run_id=GB-IMP06-SLICE-1785507383170-421`, `status=passed`, `passed=true`, `repeatable=true`, no preflight/browser/driver/integrity errors, all ten source fixtures rejected, state revision `2026-07-31.5`, and the four baseline hashes above. Both contexts had 302.589 m distance, 0.276 m maximum step, 348 footsteps, critical exposure plus recovery, ten normal hits, 209 damage, three kills, zero remaining hostiles, three initially full-health raid actors, ten audited damage transitions, and three proven deaths.

### Required forced failure and evidence inspection

```text
$ PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright node tools/gate_b_slice.mjs --force-failure
FAIL  run 1  distance=302.6m air=857ppm/0.229 hits=10 kills=3 hp=97.4
      forced evidence-currentness failure
FAIL  run 2  distance=302.6m air=857ppm/0.229 hits=10 kills=3 hp=97.4
      forced evidence-currentness failure
GATE B REPRESENTATIVE SLICE FAILED
```

Result: exit 1. Immediate authoritative-evidence inspection found:

```text
run_id           GB-IMP06-SLICE-1785507457574-2
generated_at     2026-07-31T14:18:28.626Z
status/passed    failed / false
repeatable       true
forced_failure   true
results          2
result errors    forced evidence-currentness failure (both)
browser errors   none
state revision   2026-07-31.5
hash bindings    engine/driver/runner/built bundle all present and baseline-matching
```

Thus a failed latest attempt no longer leaves the authoritative path presenting an older pass.

### Required placement-alias probe and evidence inspection

```text
$ PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright node tools/gate_b_slice.mjs --adversarial=placement-alias
GATE B REPRESENTATIVE SLICE FAILED
The two fresh-context runs did not produce the same semantic outcome.
```

Result: exit 1. Immediate evidence inspection found `run_id=GB-IMP06-SLICE-1785507521680-2`, `status=failed`, `passed=false`, `repeatable=false`, `adversarial_probe=placement-alias`, zero completed results, and a runner error whose first cause was:

```text
Gate B integrity violation: actor placement helper invoked after fresh spawn
at Player.guardedGateBPrototypeMethod ...
```

The evidence retained the same state revision and all four baseline hashes.

### Required pre-combat HP probe and evidence inspection

```text
$ PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright node tools/gate_b_slice.mjs --adversarial=precombat-hp
FAIL  run 1  distance=269.4m air=857ppm/0.229 hits=0 kills=0 hp=119.4
      Error: Gate B integrity violation: courtyard raid was preconditioned before its first fixed step
      integrity audit: courtyard raid was preconditioned before its first fixed step
      integrity audit did not observe three full-health authored raid actors
      integrity audit did not prove normal player-combat provenance for all raid deaths
FAIL  run 2  distance=269.4m air=857ppm/0.229 hits=0 kills=0 hp=119.4
      Error: Gate B integrity violation: courtyard raid was preconditioned before its first fixed step
      integrity audit: courtyard raid was preconditioned before its first fixed step
      integrity audit did not observe three full-health authored raid actors
      integrity audit did not prove normal player-combat provenance for all raid deaths
GATE B REPRESENTATIVE SLICE FAILED
```

Result: exit 1. Immediate evidence inspection found `run_id=GB-IMP06-SLICE-1785507550303-2`, `status=failed`, `passed=false`, `repeatable=true`, `adversarial_probe=precombat-hp`, two results, and no browser errors. Both reports recorded the three actors at HP `30/62`, `30/62`, and `30/44`, `raidInitialFullHealth=false`, the named integrity violation, zero damage transitions, and zero proven deaths. Revision and all four hashes were present.

### Exact original GB06-R01 reproductions

The original retained-helper reproduction was applied in `/tmp/cinderline-gb06-original-retained`:

```js
const originalActorPlacement = P.placeAt;
// ...
originalActorPlacement.call(P, P.pos.x, P.pos.y, P.pos.z, P.yaw);
```

```text
$ PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright node tools/gate_b_slice.mjs
Gate B preflight failed: driver source rejected: placement-helper access
```

Result: exit 1. Evidence was a new `failed/passed:false` report with zero results, `source_guard.passed=false`, preflight error `driver source rejected: placement-helper access`, full revision/hash bindings, and mutated-driver hash `4b8cbbff3bc5b1e234794aaf7c3f8cf010d980eefe25c5510023f856debde923`.

The original direct-HP line was applied in `/tmp/cinderline-gb06-original-hp` exactly after the three-actor assertion:

```js
raid.group.forEach((enemy) => { enemy.hp = 30; });
```

```text
$ PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright node tools/gate_b_slice.mjs
Gate B preflight failed: driver source rejected: actor-health assignment
```

Result: exit 1. Evidence was a new `failed/passed:false` report with zero results, `source_guard.passed=false`, preflight error `driver source rejected: actor-health assignment`, full revision/hash bindings, and mutated-driver hash `5262d56a7c9a2f1a1997affea1dc6fbc4addc8cd664c187401284650e0440817`.

The two exact original reproductions therefore cannot make the repaired official runner exit 0.

### New computed-combat-alias falsification

The mutation in `/tmp/cinderline-gb06-combat-bypass` added the following updater after the driver's telemetry listeners. The property names are computed only to test whether runtime provenance, rather than literal text matching, is authoritative:

```js
let adversarialHitInjected = false;
G.engine.addUpdater(() => {
  const raid = G.director._raidActive;
  if (adversarialHitInjected || !raid || raid.id !== 'courtyard' || !P.attack) return;
  const system = G[['com', 'bat'].join('')];
  for (const enemy of raid.group) {
    if (enemy.dead) continue;
    const forgedAttack = {
      def: {
        damage: enemy.maxHp + 100,
        poise: enemy.maxHp + 100,
        impact: 'flesh',
        stagger: true,
        guardBreak: false,
        hitstop: 0,
        shake: 0,
      },
      landed: false,
    };
    system[['_apply', 'Hit'].join('')](P, enemy, forgedAttack, G, 0, 1);
  }
  adversarialHitInjected = true;
}, 9000);
```

```text
$ PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright node tools/gate_b_slice.mjs
ok    run 1  distance=295.7m air=857ppm/0.229 hits=6 kills=3 hp=108.4
ok    run 2  distance=295.7m air=857ppm/0.229 hits=6 kills=3 hp=108.4
GATE B REPRESENTATIVE SLICE OK (partial scope)
```

Result: **exit 0**, falsifying the repaired anti-shortcut control. Immediate evidence inspection found:

```text
run_id             GB-IMP06-SLICE-1785507747195-2
generated_at       2026-07-31T14:23:13.956Z
status/passed      passed / true
repeatable         true
source_guard       passed; every built-in fixture rejected
preflight/errors   none
driver hash        27c3a61c530b914264529be318277c7628086377fe0bddd0f654db857498ec57
baseline hashes    engine, runner and bundle unchanged
run 1 / run 2      hits=6, damageDealt=377, kills=3, remainingHostiles=0
integrity          violations=[], raidInitialFullHealth=true,
                   normalDamageTransitions=6, provenDeaths=[7,8,6]
```

The clean baseline needed ten hits and dealt 209 damage. The altered run manufactured three lethal combat-resolver calls with forged per-hit definitions, yet the runtime audit accepted the resulting ordinary combat telemetry as proof.

### Required final clean rerun and evidence inspection

Back in the unmodified primary disposable copy:

```text
$ PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright node tools/gate_b_slice.mjs
ok    run 1  distance=302.6m air=857ppm/0.229 hits=10 kills=3 hp=97.4
ok    run 2  distance=302.6m air=857ppm/0.229 hits=10 kills=3 hp=97.4
GATE B REPRESENTATIVE SLICE OK (partial scope)
```

Result: exit 0. Immediate evidence inspection found `run_id=GB-IMP06-SLICE-1785507872193-2`, `generated_at=2026-07-31T14:25:03.478Z`, `status=passed`, `passed=true`, `repeatable=true`, `forced_failure=false`, no adversarial probe, no preflight/browser/driver/integrity errors, every built-in fixture rejected, and the original four baseline bindings. Both results were identical at full recorded precision in this run: 302.589 m, 0.276 m maximum step, 348 footsteps, 857.316 ppm / 0.228815 peak saturation, critical crossed, recovered, survival count 1, 14 attack starts, ten hits, 209 damage, three kills, zero remaining hostiles, and three proven deaths from three initially full-health actors.

## Original finding disposition

| Finding | Re-review disposition | Evidence |
|---|---|---|
| GB06-R01 — anti-shortcut controls bypassable | **RETAINED, high** | The exact retained-placement and direct-HP reproductions are repaired, and the supplied placement/HP probes fail correctly. However, GB06-R03 makes the official runner exit 0 through a different direct combat-system alias while preserving every audited provenance field. The broader mandatory anti-shortcut criterion remains false. |
| GB06-R02 — failed run leaves stale passing evidence | **RESOLVED for this partial-slice re-review** | Forced failure, placement failure, HP failure, and both source-preflight failures each produced new authoritative `passed:false` evidence with current run ID, revision, and engine/driver/runner/bundle hashes. A final clean rerun alone restored a new current `passed:true` report. |

## New finding

### GB06-R03 — In-step direct combat-resolver calls are accepted as normal player-combat provenance

- **Severity:** high
- **Affected criterion/invariant:** forbidden direct combat shortcuts must be rejected; all raid HP/death transitions must come from production player combat; confidence in the three-authored-kills claim.
- **Evidence:** `tools/gate_b_slice.mjs:65` rejects only the literal spelling `G.combat`. Runtime method guards at lines 239-246 reject direct actor damage/kill or manufactured kill events only outside a fixed step. Lines 292-299 label a damage event normal solely because it occurred in a fixed step while `P.attack` was truthy; lines 370-385 accept matching damage/kill telemetry without binding it to the production `_resolveArc` call or the active attack definition. The exact mutation, exit-0 output, evidence fields, and driver hash are recorded above.
- **Reproduction:** apply the exact updater above to `tools/gate_b_driver.js` in a disposable copy and run `PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright node tools/gate_b_slice.mjs`. The official runner passed both contexts with forged damage and three purportedly proven deaths.
- **Cause:** source regexes are spelling-dependent. The runtime audit trusts public combat telemetry plus the broad facts “inside any fixed-step updater” and “some player attack exists.” Calling the combat system's hit resolver directly from another updater therefore performs real HP/death mutation and emits the same telemetry the audit is trying to authenticate.
- **Required repair direction:** make provenance unforgeable by the evaluated driver. At minimum, instrument and guard the combat resolver before driver evaluation so an `_applyHit` on a raid actor is accepted only while nested inside the production `_resolveArc` traversal for the exact current `P.attack`, its authored definition, and its hit-set/geometry decision. Guard both instance and prototype access and computed aliases; do not use event presence alone as authority. Since the clean driver does not register engine updaters, blocking post-audit updater registration is useful defense in depth but is not a substitute for resolver provenance. Add this exact computed-name mutation as an executable negative regression.
- **Required retest:** the exact mutation must make the official runner exit nonzero and leave new revision/hash-bound `passed:false` evidence. Then rerun every built-in fixture, placement alias, precombat HP, forced failure, exact original retained-helper/direct-HP reproduction, and a final clean two-context run. Confirm three full-health actor identities, every HP transition and death bound to actual production arc resolution, no errors, and only the final clean report `passed:true`.

No other new finding was established in the authorized scope.

## Acceptance assessment

| Re-review acceptance criterion | Result |
|---|---|
| Clean two-context run exits 0 with matching semantic outcomes and no browser/runtime integrity errors | PASS |
| Built-in source fixtures reject aliases, brackets, position/HP/lung/progression writes, aliased damage/kill, and manufactured kill events | PASS |
| Placement-alias probe exits nonzero and leaves current `passed:false` evidence | PASS |
| Precombat-HP probe exits nonzero and leaves current `passed:false` evidence | PASS |
| Forced two-context failure exits nonzero and leaves current revision/hash-bound `passed:false` evidence | PASS |
| Final clean rerun restores only a new current `passed:true` report | PASS |
| Exact original retained-helper and direct-HP reproductions cannot make the runner exit 0 | PASS |
| Driver cannot invoke a direct combat shortcut or forge accepted HP/death provenance | **FAIL — GB06-R03** |

## Limitations and explicit non-approvals

- This is a source-aware scripted partial-slice review. It is not a source-blind usability, comprehension, fun, or play-feel result.
- B1 and B2 are not approved. Dialogue uses callbacks; action input does not establish rendered HUD hit targets or physical-device simultaneous-thumb behavior.
- B3, B4, and performance are not approved. The live RAF/render cadence is intentionally stopped, and SwiftShader mobile emulation is not a physical device.
- C1 and D3 are not approved. The run is not opening-to-ending and not a clean-save completion.
- Full Gate B, release readiness, save/load, other viewports, long-run stability, accessibility, and real-device behavior are outside this re-review.
- Text scanning remains defense in depth, not semantic proof. The successful computed-name mutation demonstrates that limitation directly.

## Verdict

**FAIL — partial-slice re-review only.**

GB06-R02 is resolved in the tested scope, and the repairs reject the exact original GB06-R01 retained-helper and direct-HP reproductions. GB06-R01 nevertheless remains high because GB06-R03 proves that the official runner can still pass a driver that invokes a direct combat shortcut and forges accepted HP/death provenance. This verdict grants no broader Gate B or release approval.
