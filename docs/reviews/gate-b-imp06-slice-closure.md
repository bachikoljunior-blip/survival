# GB-IMP06 partial-slice closure review

Review task: `GB-IMP06-REVIEW`

Handoff: `HANDOFF-GB-IMP06-REVIEW-06`

Date: 2026-08-01 (Asia/Tokyo)

Reviewer role: fresh independent source-aware closure reviewer

## Scope and isolation

This review decides only whether the packaged regressions and inspected controls
close GB06-R01 through GB06-R07 for the scripted Chapter 1 movement, breathing,
and combat representative slice. It does not approve B1, B2, B3, B4, C1, D3,
performance, play feel, full Gate B, full playtime, physical-device behavior,
release readiness, or release.

Before copying, every source hash listed by the handoff matched the shared file.
The exact baseline was then copied to:

```text
/tmp/cinderline-gb06-closure06.gl92PR/survival
```

All builds, browser runs, negative probes, and evidence writes occurred in that
disposable copy. No custom mutation was created or run under the final review
contract. Shared product, tests, operating state, evidence, handoffs, prior
reviews, and remote state were not changed. This review is the only shared edit.

## Reviewed hashes

The shared files before copying, the disposable snapshot, and the disposable
final evidence agreed on the following reviewed bindings:

```text
c7a0cb1cbe9f8b6e9ea1a8fc4bf8a95146f8344bf568d28ea8455dc8cf214592  src/core/engine.js
60147238dca48d828d485e8830ed7fd05c1eec58633a9dc1f54db3f6205d9b98  tools/gate_b_driver.js
cdfd13183c056be48b9493f9a57d7d9c7f6a489fb4e5237049e0ec95d3e81461  tools/gate_b_slice.mjs
fcd1936ba01719d34a9ffa82a0532a96bc9a7c1235d6c68702244fd566d6d636  tools/gate_b_adversarial.mjs
bb8b23b95dc24a67f4ec6bd350fff1c4b6c6c96c92c5449e037a6a3c8832a49b  dist/cinderline.1.0.0.js
```

The final evidence file had SHA-256
`ca94e58489bf8bc19a1b315f1db555d5e2aadee2d53cdcec59633a2eee4adf14`.
The evidence schema binds engine, driver, runner, and built bundle; the
adversarial-suite hash is recorded separately above.

## Standard commands and exact results

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

### Complete packaged partial-slice suite

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

Result: **PASS**, exit 0. npm also printed its unrelated configured-proxy
deprecation warning and a newer-npm notice; neither affected execution.

The actual package contains 19 expected-failure probes: 18 named adversarial
modes plus the forced-currentness failure. For each probe,
`gate_b_adversarial.mjs` requires a nonzero child exit, a probe-matching current
report with `status=failed` and `passed=false`, the expected rejection text, a
run ID, state revision, and engine/driver/runner/bundle bindings. Any missing
condition makes the package exit 1. Only after all 19 checks pass does the
package run the unchanged clean driver.

## Final clean evidence

The disposable final report recorded:

```text
run_id              GB-IMP06-SLICE-1785512552729-2501
generated_at         2026-07-31T15:42:55.441Z
status / passed      passed / true
repeatable           true
forced_failure       false
adversarial_probe    null
state_revision       2026-07-31.5
source_guard         passed; pinned driver hash matched
policy fixtures      13/13 rejected
preflight errors     none
browser errors       none
```

The bound engine, driver, runner, and bundle hashes exactly matched the reviewed
snapshot. Both fresh contexts used 667x375 mobile emulation and had empty
driver-error, page-error, console-error, browser-error, and integrity-violation
arrays.

Both contexts recorded:

- route distance `302.58912774279025 m`, maximum single-step displacement
  `0.2757940086742931 m`, and 348 footsteps;
- unassisted/unmasked/nonimmune critical exposure, recovery, and
  `survivedCounter=1`;
- three initially full-health authored actors: scavengers `6` and `7` at
  `62/62`, and slinger `8` at `44/44`;
- 20 attack inputs, 14 player attack starts, 10 normal hits, 209 reported
  damage, three kills, and zero remaining hostiles;
- 10 authenticated hit-resolver calls, 10 normal damage transitions, and proven
  deaths `[7, 6, 8]`;
- equal positive `engineFixedSteps=gameFixedUpdates=combatUpdates=9092`, with
  141 authenticated arc resolutions.

Full-precision gas samples and final HP differed slightly between contexts, but
the declared semantic result repeated. This supports semantic, not byte-exact,
repeatability.

At snapshot time the supplied evidence was already safely non-passing:
`status=running`, `passed=false`, `adversarial_probe=precombat-hp`, with current
source bindings. This is consistent with the interrupted-attempt invalidation
control rather than a stale green artifact. The isolated package then replaced
it probe by probe and only its final clean run restored `passed=true`.

## Control assessment

- **Pinned contract and source/build binding:** the runner hard-codes the
  reviewed driver SHA-256 and fails preflight if the evaluated driver differs.
  It records state revision plus engine, driver, runner, and built-bundle hashes
  and atomically writes non-passing evidence before browser work.
- **Placement and state:** instance and prototype placement helpers are blocked;
  player position, HP, saturation, immunity, and filter fields are guarded; the
  three raid actors must first appear alive at full health; protected raid HP
  and `dead` state accept writes only under authenticated damage.
- **Sealed call chain:** live instance methods and matching prototype routes are
  sealed for deterministic engine step, game fixed update, combat start/update,
  AI/projectile update, arc resolution, and hit resolution. Nesting and current
  attack/target selection are checked at each privileged boundary.
- **Immutable combat provenance:** attack definitions and active attack identity,
  timing, movement, and hit-set fields are captured at production combat start,
  made non-extensible, and rechecked. Hit-set additions are allowed only inside
  authenticated arc resolution and are reconciled with the expected-ID set,
  including against `Set.prototype.add` bypass.
- **Single-use damage and telemetry:** each authenticated hit starts with a
  target-bound zero-call allowance; exactly one protected-actor damage call is
  accepted and captured. Damage and kill telemetry each have expected counts,
  amount/result checks, target/attacker checks, and frozen payloads. Nested
  damage, direct HP, direct `dead`, and computed kill-event reentry fail closed.
- **Projectile/vitals separation:** AI and projectile update entry points are
  sealed and nested; player projectile damage is authorized only inside that
  production path, while player vitals use their own fixed-step authorization.
- **Updater integrity:** the audit boundary updaters are installed before the
  updater list becomes a guarded proxy. Existing entries are frozen; direct,
  computed, replacement, deletion, definition, prototype-registration, and
  unauthorized late-registration paths reject. The only late registration is
  the single order-5 simulation timer under its game-update predicate.

These controls answer the concrete bypass causes documented in GB06-R01 through
GB06-R07. No new high-severity or contradictory finding was established in the
authorized fixed-driver, packaged-command review.

## Finding disposition

| Finding | Closure disposition | Basis |
|---|---|---|
| GB06-R01 — anti-shortcut controls bypassable | **RESOLVED in this partial-slice contract** | Placement and precombat-HP probes fail closed; player/raid state is runtime-guarded; the exact evaluated driver is pinned. |
| GB06-R02 — failed current run leaves stale passing evidence | **RESOLVED** | Evidence is atomically invalidated before preflight/browser work. All 19 expected failures required current bound `passed:false` evidence, and only the final clean run restored a pass. |
| GB06-R03 — computed direct resolver accepted as normal provenance | **RESOLVED** | The computed resolver probe exits nonzero; sealed engine/game/combat/arc/hit instance and prototype paths enforce production nesting and target selection. |
| GB06-R04 — mutable attack definition/timing/hit set accepted | **RESOLVED** | Damage, poise, reach, arc, windup, active-window, direct hit-set, and `Set.prototype` hit-set probes all exit nonzero; snapshots and rejecting setters enforce the invariant. |
| GB06-R05 — passing evidence not bound to reviewed runner | **RESOLVED** | The snapshot evidence and final isolated evidence bind runner `cdfd1318...`; final engine, driver, runner, and bundle bindings match the reviewed files exactly. |
| GB06-R06 — nested damage method accepted during authenticated event delivery | **RESOLVED** | The permanent nested-damage probe exits nonzero; the target-bound allowance is consumed on the first damage call and the resolver requires exactly one. |
| GB06-R07 — death-state/kill-event reentry accepted | **RESOLVED** | The permanent computed `dead`-state and kill-event probes both exit nonzero; protected death state and result-bound single-use kill telemetry reject both routes. |

No unresolved high finding remains within this closure scope.

## Limitations and explicit non-approvals

- This is source-aware scripted verification, not a source-blind usability,
  comprehension, fun, or play-feel evaluation. B1 is not approved.
- The 667x375 contexts are Playwright Chromium mobile emulation with
  SwiftShader, not a physical iPhone or other real device. No real-device claim
  is made.
- Action automation uses the production input queue below rendered HUD hit
  targets. Physical touch layout, target sizing, occlusion, simultaneous-thumb
  behavior, and B2 are not established.
- The live RAF is stopped for deterministic fixed steps. This is not a visual,
  frame-rate, throttling, B3, B4, or performance result.
- This is a Chapter 1 partial representative slice, not an opening-to-ending
  route, clean-save completion, C1, or D3.
- Save/load, rotation, other viewports, interruption/recovery, accessibility,
  long-run behavior, full Gate B, release readiness, and release remain outside
  scope.
- The PASS is bounded to the hash-pinned driver, packaged negative cases, and
  inspected runtime invariants. It is not proof against arbitrary changes to
  the runner or product source.

## Verdict

**PASS — GB-IMP06 scripted Chapter 1 movement/breathing/combat partial slice
only.**

Both required commands completed, all 19 packaged expected failures failed
closed with current bound evidence, and the final two fresh clean contexts
completed with three full-health authored opponents, three authenticated
deaths, equal positive engine/game/combat step counts, and no errors. The prior
R01-R07 causes are covered by the inspected controls and packaged regressions.
This verdict grants no broader Gate B, release, B1/B2/B3/B4/C1/D3,
performance, play-feel, full-playtime, or real-device approval.
