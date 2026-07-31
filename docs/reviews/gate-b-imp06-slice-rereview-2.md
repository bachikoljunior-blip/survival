# GB-IMP06 second fresh independent partial-slice re-review

Review task: `GB-IMP06-REVIEW`

Handoff: `HANDOFF-GB-IMP06-REREVIEW-03`

Date: 2026-07-31

Reviewer role: second fresh independent code-and-test reviewer

## Scope, baseline, and isolation

This review considered only the partial Chapter 1 representative-slice repairs described by the handoff. It does not approve B1, B2, B3, B4, C1, D3, performance, play feel, full Gate B, release, or a complete playthrough.

The handoff, both earlier review artifacts, and every handoff-authorized source/evidence file were read. `README.md` and implementer results were not treated as evidence. After an integration-owner interruption reported a newer runner, the review restarted from a new disposable copy:

```text
/tmp/cinderline-gb06-rereview2.R1onmk/survival
```

All builds, evidence writes, browser runs, and mutations occurred in disposable copies. No shared product, test, operating-state, evidence, remote state, or earlier review was changed. This document is the only shared-worktree edit.

Baseline hashes at the restart were:

```text
c7a0cb1cbe9f8b6e9ea1a8fc4bf8a95146f8344bf568d28ea8455dc8cf214592  src/core/engine.js
60147238dca48d828d485e8830ed7fd05c1eec58633a9dc1f54db3f6205d9b98  tools/gate_b_driver.js
e89266ffc1c1b36fe4b146f18121bf4add422c5f7cfadc5968d06f5a84470bc5  tools/gate_b_slice.mjs
5290b72a37786983e0a850ac70bcbaad3ebfe1bc48919fc93588ef90cfbce881  tools/gate_b_adversarial.mjs
82336d73714afc1b2eeb795e8967b75c21be12630df9d466c3303d61e57dd4b8  src/game/director.js
bb8b23b95dc24a67f4ec6bd350fff1c4b6c6c96c92c5449e037a6a3c8832a49b  dist/cinderline.1.0.0.js
```

The pre-review authoritative evidence was bound to the earlier runner hash `109135704e62e7652b610105bd40ff8a98dda3e8900e12de21c5d40df331c7da`, so it was not current for the restarted baseline. The completed clean package run below generated evidence bound to `e89266...`.

## Source assessment

The restarted runner seals the engine fixed step, game fixed update, combat update, arc resolution, and hit resolver at the live instances while replacing the corresponding prototype entries with rejecting wrappers. It checks nesting, the current actor attack and definition reference, and membership of the target in the attack hit set. It also compares engine, game, and combat fixed-step counts.

After installing its two boundary updaters, the runner exposes the updater list only through a guarded proxy and replaces both instance and prototype updater-registration methods. The one stated exception is the in-game slinger simulation timer, restricted to one registration during game fixed update at order 5.

These changes directly address the earlier computed combat-resolver updater reproduction and the constructor/clone prototype route reported at restart. Source inspection alone was not treated as proof; the completed probes below attempted the relevant access routes.

## Standard commands and results

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

### Required package suite

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

The final report from that command had SHA-256 `97a7cb866aa0e3670846da839ca3562c8388108b7580f3496e9e787fcade1e86` and recorded:

- `run_id=GB-IMP06-SLICE-1785509079153-566`
- `generated_at=2026-07-31T14:45:05.376Z`
- `status=passed`, `passed=true`, `repeatable=true`
- state revision `2026-07-31.5`
- engine, driver, runner, and bundle hashes matching the restarted baseline
- no preflight, browser, driver, or integrity errors
- all thirteen source-policy fixtures rejected
- three initially full-health actors: two `62/62` scavengers and one `44/44` slinger
- three proven deaths and zero remaining hostiles in both contexts
- equal positive `engineFixedSteps=gameFixedUpdates=combatUpdates=9092` in both contexts
- `arcResolutions=141`, `hitResolverCalls=10`, and `normalDamageTransitions=10` in both contexts
- 302.589 m route distance, 0.276 m maximum step, 348 footsteps, critical exposure plus recovery, ten hits, and 209 damage in both contexts

The gas sample and final player HP had small cross-context drift, but the declared semantic result was repeatable.

## Completed adversarial cases

No executable attack code is reproduced in this review. The following descriptions identify only the tested access class and result.

### Exact prior GB06-R03 updater reproduction

The exact updater mutation recorded in the first re-review was reapplied to a separate disposable driver. The runner rejected it during source preflight for dynamic game-property and engine-updater access. Result: **expected failure**, exit 1.

The resulting authoritative evidence had SHA-256 `7d534c31ec227846a4dafe54f16845a138c371e523ce1f0a0fa14674481648a0` and recorded `run_id=GB-IMP06-SLICE-1785509212590-7`, `status=failed`, `passed=false`, zero results, state revision `2026-07-31.5`, mutated driver hash `27c3a61c530b914264529be318277c7628086377fe0bddd0f654db857498ec57`, restarted runner hash `e89266...`, and the baseline engine/bundle hashes. This satisfies the exact prior-mutation rejection requirement in the tested copy.

### Hit-resolver access matrix completed before interruption

The following attempts all reached `GATE B REPRESENTATIVE SLICE FAILED` and exited 1:

- direct live-instance hit-resolver call
- computed live-instance hit-resolver call
- direct prototype hit-resolver call
- computed prototype hit-resolver call
- constructor-derived prototype hit-resolver call
- prototype-clone hit-resolver call
- newly constructed combat-instance hit-resolver call

The direct and computed live-instance cases were individually inspected before later attempts overwrote the disposable evidence. Both had zero completed results, `status=failed`, `passed=false`, state revision `2026-07-31.5`, baseline engine/driver/bundle hashes, mutation-runner hash `3cb85d5d8d780052d9540bb97550dac6cfe545af21fc3d8d1e2506c3afff1c9c`, and the rejection `combat hit resolver invoked outside production arc traversal`.

The prototype, constructor, clone, and newly constructed-instance cases produced the runner's failure output and exit 1, but their per-attempt evidence snapshots were overwritten by the continuing disposable matrix before they were independently recorded. They are therefore useful negative observations, not sufficient evidence for final acceptance.

### Updater-registration access matrix completed before interruption

Direct and computed live-instance updater registration, direct and computed prototype registration, constructor-derived prototype registration, and clone-based registration each produced `GATE B REPRESENTATIVE SLICE FAILED` and exited 1. As with the later resolver variants, their per-attempt evidence snapshots were not preserved before the next disposable attempt began. No successful updater registration was observed.

## Interrupted and unexecuted contract cases

The integration owner explicitly interrupted further mutations and required a report using only already completed results. The active direct updater-list mutation was stopped while its disposable evidence still said `status=running`, `passed=false`, zero results, `adversarial_probe=updaters-list-direct`, state revision `2026-07-31.5`, and the full engine/driver/mutation-runner/bundle hash binding. It is not a completed result.

The following mandatory closure work therefore remains unexecuted or incomplete:

- a completed direct updater-list mutation with final failed evidence
- the computed updater-list mutation
- independent preservation and inspection of final evidence for every prototype, constructor, clone, and updater-registration variant
- deeper attempts to falsify the authored-definition and target-selection portions of the authenticated production call chain
- the required final unmodified two-context run after all adversarial attempts
- final full-evidence inspection after that last clean run

The package suite did complete placement-alias, precombat-HP, runtime combat-resolver, and forced-failure probes and then a clean run. However, because additional adversarial work occurred afterward and the required last clean run was not permitted, the handoff's full sequencing criterion was not met by this second re-review.

## Finding disposition

| Finding | Second re-review disposition | Basis |
|---|---|---|
| GB06-R01 — anti-shortcut controls bypassable | **UNRESOLVED for this re-review** | The supplied placement/HP probes and all completed combat/updater access attempts failed closed, but updater-list mutations and deeper provenance falsification were not completed, and no final clean closure run followed the attempted matrix. |
| GB06-R02 — stale passing evidence after failure | **RESOLVED in completed tested cases only** | The package forced failure and all package adversarial probes reported new current `passed:false` evidence; the exact prior GB06-R03 mutation also produced new revision/hash-bound `passed:false` evidence. The package's clean run alone produced the inspected current `passed:true` report. This does not substitute for the unexecuted final sequencing check after all later probes. |
| GB06-R03 — direct hit-resolver calls accepted as provenance | **PROVISIONALLY REPAIRED, NOT CLOSED** | The exact previously passing mutation now exits 1 with current failed evidence. Built-in runtime reproduction, direct/computed instance calls, and observed prototype/constructor/clone routes all failed. Missing preserved evidence for several variants, incomplete updater-list testing, and absence of a final clean run prevent closure. |

## New findings

No new bypass was established in the completed results. This is not evidence that none exists: the review was stopped before the mandatory falsification matrix and final clean closure were complete.

## Acceptance assessment

| Handoff requirement | Result |
|---|---|
| `npm run validate:ops` | PASS |
| Full `npm run test:gate-b` package sequence | PASS |
| Exact previously passing GB06-R03 updater mutation exits nonzero with current failed evidence | PASS |
| Direct/computed instance hit-resolver attempts | PASS for tested rejection |
| Direct/computed prototype and constructor/clone hit-resolver attempts | Observed rejection, but evidence preservation incomplete |
| Post-audit updater-registration attempts | Observed rejection, but evidence preservation incomplete |
| Direct/computed updater-list mutation | **INCOMPLETE** |
| Placement alias, precombat HP, and forced failure | PASS within package suite |
| Every failed attempt has independently inspected revision/hash-bound final evidence | **INCOMPLETE** |
| Final unmodified clean two-context run after all mutations | **NOT RUN** |
| Final full evidence/provenance inspection | **NOT RUN** |

## Limitations and explicit non-approvals

- This is a source-aware scripted partial-slice review, not a source-blind usability, comprehension, fun, or play-feel result.
- B1 and B2 are not approved. Dialogue uses callbacks, and the run does not validate physical-device HUD hit targets or simultaneous-thumb behavior.
- B3, B4, and performance are not approved. The live RAF/render cadence is stopped, and SwiftShader mobile emulation is not a physical device.
- C1 and D3 are not approved. This is neither opening-to-ending nor clean-save completion evidence.
- Full Gate B, release readiness, save/load, other viewports, accessibility, long-run stability, and real-device behavior remain outside scope.
- A successful package baseline cannot compensate for unexecuted mandatory adversarial and final-clean cases.

## Verdict

**INCONCLUSIVE — partial-slice second re-review only.**

The latest runner rejected every completed mutation, including the exact previously passing GB06-R03 reproduction, and the clean package suite produced strong revision/hash-bound evidence with equal authenticated step counts and three proven deaths. No bypass was found in completed work. Nevertheless, the direct/computed updater-list checks, complete evidence capture for every variant, deeper provenance falsification, and the final post-mutation clean two-context run were not completed after the explicit interruption. GB06-R01 and GB06-R03 therefore cannot be closed by this review. This verdict grants no broader Gate B or release approval.
