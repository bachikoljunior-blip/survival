# GB-IMP06 final independent partial-slice review

Review task: `GB-IMP06-REVIEW`

Handoff: `HANDOFF-GB-IMP06-FINAL-REVIEW-03`

Date: 2026-07-31

Reviewer role: fresh independent code-and-test reviewer

## Scope and isolation

This review attempted to falsify the repairs for GB06-R01, GB06-R02, and
GB06-R03, and the integrity, repeatability, binding, and scope claims of the
Chapter 1 movement, breathing, and combat representative slice. It was
source-aware. It does not approve B1, B2, C1, D3, performance, play feel, full
Gate B, release readiness, or a complete playthrough.

The declared inputs were read in full:

- `AI_DEVELOPMENT/HANDOFFS/GB-IMP06-REVIEW.json`
- `docs/DONE.md`
- `PROJECT_OPERATING_PROTOCOL.md`
- `AI_DEVELOPMENT/EVIDENCE/GB-IMP06-SLICE.json`
- `docs/reviews/gate-b-imp06-slice.md`
- `docs/reviews/gate-b-imp06-slice-rereview.md`

Source inspection was restricted to the handoff-authorized files and the
directly necessary production combat and fixed-update call sites. `README.md`
and implementer summaries were not used as evidence.

The shared worktree was dirty before review. The current source was snapshotted
to `/tmp/cinderline-gb06-final.Ml2EPx/survival`. All builds, browser runs,
evidence writes, and adversarial mutations ran in disposable copies. Product
source, test source, and shared evidence were not changed. This review file was
the only shared-worktree edit by the reviewer.

## Baseline source and evidence bindings

The reviewed source snapshot had these hashes:

```text
c7a0cb1cbe9f8b6e9ea1a8fc4bf8a95146f8344bf568d28ea8455dc8cf214592  src/core/engine.js
60147238dca48d828d485e8830ed7fd05c1eec58633a9dc1f54db3f6205d9b98  tools/gate_b_driver.js
e89266ffc1c1b36fe4b146f18121bf4add422c5f7cfadc5968d06f5a84470bc5  tools/gate_b_slice.mjs
bb8b23b95dc24a67f4ec6bd350fff1c4b6c6c96c92c5449e037a6a3c8832a49b  dist/cinderline.1.0.0.js
```

The supplied shared evidence was generated at
`2026-07-31T14:40:34.319Z`. Its engine, driver, and built-bundle hashes matched,
but its runner binding was
`109135704e62e7652b610105bd40ff8a98dda3e8900e12de21c5d40df331c7da`,
not the current `e89266...` runner. Therefore that supplied `passed:true`
artifact does not bind the current runner. The independent clean rerun below
did produce a passing report with all four current hashes in the disposable
copy. See GB06-R05 for the remaining shared-artifact requirement.

## Required commands and results

Unless stated otherwise, commands in this section ran in
`/tmp/cinderline-gb06-final.Ml2EPx/survival`.

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

### Current full Gate B partial-slice suite

```text
$ PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright npm run test:gate-b
[cinderline] built dev bundle -> dist/
ok    dynamic placement alias -> nonzero exit and current passed:false evidence
ok    pre-combat hostile HP write -> nonzero exit and current passed:false evidence
ok    computed combat-resolver alias -> nonzero exit and current passed:false evidence
ok    failed-latest-run evidence invalidation -> nonzero exit and current passed:false evidence
GATE B ADVERSARIAL REGRESSIONS OK
ok    run 1  distance=302.6m air=857ppm/0.229 hits=10 kills=3 hp=97.4
ok    run 2  distance=302.6m air=857ppm/0.229 hits=10 kills=3 hp=97.4
GATE B REPRESENTATIVE SLICE OK (partial scope)
```

Result: **PASS**, exit 0.

The final clean report was generated at `2026-07-31T14:46:22.833Z` with
`run_id=GB-IMP06-SLICE-1785509163301-561`, `status=passed`, `passed=true`,
`repeatable=true`, no preflight, browser, driver, or integrity errors, and the
four current hashes above. Both fresh 667x375 contexts recorded 302.589 m,
0.276 m maximum displacement per step, 348 footsteps, critical exposure and
recovery, three full-health authored raid actors, ten authenticated hit-resolver
calls, ten damage transitions, three proven deaths, and no remaining hostile.
Full-precision gas samples and final HP varied slightly, so the supported
repeatability claim is semantic, not byte-identical.

### Exact prior computed combat-resolver reproduction

In a second disposable copy, the exact updater and computed property mutation
from `gate-b-imp06-slice-rereview.md` was added to the driver unchanged, then
the current runner was executed:

```text
$ PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright node tools/gate_b_slice.mjs
Gate B preflight failed: driver source rejected: dynamic game-property access, engine-updater access
```

Result: **PASS for the repair**, exit 1. The newly written authoritative report
had `status=failed`, `passed=false`, `source_guard.passed=false`, current engine,
runner, and bundle hashes, and mutated driver hash
`27c3a61c530b914264529be318277c7628086377fe0bddd0f654db857498ec57`.

The built-in `combat-resolver` probe also bypasses text scanning by installing
the computed resolver updater inside the runner before updater registration is
sealed. It still exited nonzero with `combat hit resolver invoked outside
production arc traversal`. This independently demonstrates that the runtime
call-path repair, rather than source spelling alone, rejects the prior direct
resolver attack.

## Source assessment

- `stepFixedForTest` remains development-only, requires the live RAF to be
  stopped, and advances every registered updater at the fixed step.
- The runner seals instance and prototype entries for engine stepping,
  `Game.fixedUpdate`, `CombatSystem.update`, `_resolveArc`, and `_applyHit`.
  It requires nesting through engine -> game -> combat -> arc -> hit, the
  current attack object, its current definition object, and a target already
  selected by the attack hit set.
- Instance/prototype placement helpers and post-audit updater registration are
  blocked. The current negative suite proves the original placement, HP,
  direct-resolver, and stale-evidence reproductions no longer pass.
- The call-path audit authenticates object identity, but not the immutable
  authored values of `attack.def`. Production `CombatSystem.start` stores the
  shared mutable attack-table object directly as `actor.attack.def`. The game
  drains `actor:attackstart` during `Game.fixedUpdate`, before
  `CombatSystem.update` resolves the arc. An evaluated driver may register an
  event callback and mutate the current definition while every call-chain flag
  is legitimate.

## Findings

### GB06-R04 — Fixed-step event reentrancy can mutate the current attack definition and pass as authored combat

- **Severity:** high
- **Affected criteria:** the exact current authored attack must be authenticated;
  forbidden combat shortcuts must be rejected; all three raid deaths must be
  proven to result from normal authored player combat.
- **Evidence:** `src/game/combat.js` assigns the mutable `ATTACKS[attackName]`
  object directly to `actor.attack.def`. The runner's arc and hit guards compare
  only `attack === attacker.attack` and `attack.def === attacker.attack.def`.
  The source policy does not reject computed writes to attack-definition
  fields, and event callbacks are allowed to execute during the authenticated
  fixed update.
- **Reproduction:** in a disposable current-source copy, add this second
  listener beside the driver's telemetry listeners:

  ```js
  G.on('actor:attackstart', (actor) => {
    if (actor !== P || !actor.attack) return;
    const damageKey = ['dam', 'age'].join('');
    actor.attack.def[damageKey] = 200;
    actor.attack.def.poise = 200;
  });
  ```

  Then run:

  ```text
  $ PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright node tools/gate_b_slice.mjs
  ok    run 1  distance=296.0m air=857ppm/0.229 hits=3 kills=3 hp=108.4
  ok    run 2  distance=296.0m air=857ppm/0.229 hits=3 kills=3 hp=108.4
  GATE B REPRESENTATIVE SLICE OK (partial scope)
  ```

  Result: **exit 0**, which falsifies the mandatory anti-shortcut criterion.
  The report had `status=passed`, `passed=true`, `repeatable=true`,
  `source_guard.passed=true`, no errors or violations, and mutated driver hash
  `d0cb62ee0f9d6c783aa794aae1ba57533bfa2b1dc1d0822fe4829725f1ba809b`.
  Each context recorded three input attacks, three 200-damage hits, 600 reported
  damage, three kills, three normal damage transitions, three proven deaths,
  and three authenticated hit-resolver calls. The clean source required ten
  hits and reported 209 damage.
- **Likely cause:** identity of a mutable object is treated as proof of its
  authored contents. The audit also exposes privileged fixed-step timing to
  arbitrary listeners registered by the evaluated driver.
- **Required repair direction:** bind each player attack to an immutable
  authored-definition snapshot captured before evaluated callbacks can run,
  and compare every combat-relevant field at arc and hit resolution. Freeze or
  otherwise protect both the active attack definition and its authoritative
  source values. Detect or prohibit evaluated-driver mutation through event
  reentrancy; a text rule alone is insufficient.
- **Required retest:** add the exact listener above as an executable negative
  fixture. It must make the official runner exit nonzero and write a new,
  revision/hash-bound `passed:false` report. Also test computed writes to damage,
  poise, reach, arc, windup/active timing, and the hit set. Then rerun the prior
  resolver, updater, placement, HP, and forced-failure probes plus a final clean
  two-context run.

### GB06-R05 — Supplied shared passing evidence is not bound to the reviewed runner

- **Severity:** medium
- **Affected criterion:** evidence integrity and source/hash traceability.
- **Evidence:** the shared report bound runner hash `109135704...`; the reviewed
  runner hash was `e89266f...`. Engine, driver, and built bundle matched.
- **Reproduction:** hash `tools/gate_b_slice.mjs` and compare it with
  `AI_DEVELOPMENT/EVIDENCE/GB-IMP06-SLICE.json.bindings.sha256.runner`.
- **Likely cause:** the runner repair was written after the last shared clean
  evidence run. The mismatch is detectable and did not survive as falsely
  current evidence in the disposable rerun, so this does not reopen GB06-R02's
  stale-after-failure mechanism.
- **Required repair/retest:** after all source repairs, run the complete current
  suite in the integration workspace and verify the shared final report's
  state revision and all four hashes against the exact files being reviewed.
  Only that final clean run may restore shared `passed:true` evidence.

## Prior-finding disposition

| Finding | Disposition | Evidence |
|---|---|---|
| GB06-R01 — anti-shortcut controls bypassable | **RETAINED, high** | The exact placement and direct-HP attacks are repaired, but GB06-R04 is a new executable shortcut that the official runner accepts. The broader mandatory criterion remains false. |
| GB06-R02 — failed run leaves stale passing evidence | **RESOLVED in the tested mechanism** | Every negative probe in `test:gate-b`, including forced failure, wrote current `passed:false` evidence; only the final clean run restored `passed:true`. GB06-R05 is a separate integration-currentness issue caused by a source edit after the last shared run. |
| GB06-R03 — direct computed combat-resolver calls accepted | **RESOLVED for the exact attack and direct resolver provenance** | The exact prior mutation is rejected at preflight, and the built-in runtime probe is rejected by the sealed arc/hit call path. GB06-R04 shows that mutable authored-definition contents remain unauthenticated. |

## Acceptance assessment

| Handoff criterion | Result |
|---|---|
| Complete fixed-step updater chain with live RAF stopped | PASS in the clean partial-slice run |
| Movement through production input/collision without placement writes | PASS in the clean run; original placement bypass rejected |
| Unmasked, nonimmune, unassisted critical exposure plus recovery | PASS in the clean run |
| Three full-health authored actors die through the normal hit call path | PASS for the clean driver, but authored attack-value provenance **FAILS via GB06-R04** |
| Forbidden shortcuts rejected by source and runtime sentinels | **FAIL — GB06-R04** |
| Exact prior computed resolver mutation rejected | PASS |
| Two fresh contexts produce the same semantic result with no browser errors | PASS for clean and adversarial-R04 runs |
| Current shared evidence bound to current source/build | **FAIL — GB06-R05** |
| Claims remain explicitly partial | PASS |

## Limitations and explicit non-approvals

- This is a source-aware scripted partial-slice review, not a source-blind
  usability, comprehension, fun, or play-feel test.
- B1 and B2 are not approved. Dialogue uses callbacks, and action input does
  not establish rendered HUD hit targets or physical-device simultaneous-thumb
  behavior.
- B3, B4, and performance are not approved. The live RAF/render cadence is
  stopped. SwiftShader mobile emulation is not a physical device.
- C1 and D3 are not approved. This is not an opening-to-ending or clean-save
  completion.
- Full Gate B, release readiness, save/load, other viewport sizes, rotation,
  interruption/recovery, accessibility, long-run stability, and real-device
  behavior are outside this review.
- Source scanning remains defense in depth, not semantic authority. The R04
  computed-name mutation passed every source fixture.

## Verdict

**FAIL — GB-IMP06 final partial-slice re-review.**

The clean current suite passes, GB06-R02's stale-failure behavior is repaired,
and the exact GB06-R03 resolver attack is blocked. Approval is nevertheless
blocked by GB06-R04: the official runner accepts a driver that changes the
current attack's authored damage through fixed-step event reentrancy and then
reports the resulting three one-hit kills as fully authenticated production
combat. The supplied shared evidence is also not current for the reviewed
runner. This verdict grants no full Gate B, B1, B2, C1, D3, performance,
real-device, or release approval.
