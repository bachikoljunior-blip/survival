# GB-IMP06 third-round independent review addendum

Review task: `GB-IMP06-REVIEW`

Date: 2026-07-31

Reviewer role: independent code-and-test reviewer after the bounded GB06-R04
repair

## Scope and isolation

This addendum independently verifies the repair made after
`gate-b-imp06-slice-final-review.md`. The current shared tree was copied to
`/tmp/cinderline-gb06-addendum.DkZzsB/survival` before testing. All builds,
browser runs, adversarial mutations, and temporary evidence writes occurred in
disposable copies. Shared product source, runner source, and evidence were not
changed by this reviewer. This addendum is the reviewer's only shared-tree
edit.

This remains a source-aware Chapter 1 movement, breathing, and combat partial
slice. It is not B1, B2, C1, D3, a full Gate B approval, a source-blind play
test, a performance result, a real-device result, or release approval.

The reviewed snapshot hashes were:

```text
c7a0cb1cbe9f8b6e9ea1a8fc4bf8a95146f8344bf568d28ea8455dc8cf214592  src/core/engine.js
60147238dca48d828d485e8830ed7fd05c1eec58633a9dc1f54db3f6205d9b98  tools/gate_b_driver.js
41be50d808a5765574a3fd948f72e62c28a000992647b0b93ceac701cb2181e0  tools/gate_b_slice.mjs
f630610a5cfbeab886f764610c6772cf7f6bd1ef2e02465106f7a1694897c115  tools/gate_b_adversarial.mjs
bb8b23b95dc24a67f4ec6bd350fff1c4b6c6c96c92c5449e037a6a3c8832a49b  dist/cinderline.1.0.0.js
```

## Required verification

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

### Complete current partial-slice suite

```text
$ PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright npm run test:gate-b
[cinderline] built dev bundle -> dist/
ok    dynamic placement alias -> nonzero exit and current passed:false evidence
ok    pre-combat hostile HP write -> nonzero exit and current passed:false evidence
ok    computed combat-resolver alias -> nonzero exit and current passed:false evidence
ok    attack-definition event reentry -> nonzero exit and current passed:false evidence
ok    active-attack timing event reentry -> nonzero exit and current passed:false evidence
ok    attack hit-set event reentry -> nonzero exit and current passed:false evidence
ok    damage-event HP reentry -> nonzero exit and current passed:false evidence
ok    post-audit updater registration -> nonzero exit and current passed:false evidence
ok    direct updater-list mutation -> nonzero exit and current passed:false evidence
ok    computed updater-list mutation -> nonzero exit and current passed:false evidence
ok    failed-latest-run evidence invalidation -> nonzero exit and current passed:false evidence
GATE B ADVERSARIAL REGRESSIONS OK
ok    run 1  distance=302.6m air=857ppm/0.229 hits=10 kills=3 hp=97.4
ok    run 2  distance=302.6m air=857ppm/0.229 hits=10 kills=3 hp=97.4
GATE B REPRESENTATIVE SLICE OK (partial scope)
```

Result: **PASS**, exit 0. This confirms that the existing attack-definition,
active-attack timing, hit-set, direct damage-event HP assignment, direct and
computed updater-list, and stale-evidence fixtures are all rejected with a
nonzero child result and current `passed:false` evidence before the final clean
run restores `passed:true`.

### Exact GB06-R04 listener reproduction

The exact prior driver listener was applied only in
`/tmp/cinderline-gb06-r04-retest.X4OYkr/survival`:

```js
G.on('actor:attackstart', (actor) => {
  if (actor !== P || !actor.attack) return;
  const damageKey = ['dam', 'age'].join('');
  actor.attack.def[damageKey] = 200;
  actor.attack.def.poise = 200;
});
```

The current runner produced two failed contexts. Both stopped on:

```text
Gate B integrity violation: authored attack definition field damage was assigned
```

Result: **PASS for the GB06-R04 repair**, runner exit 1. The temporary latest
evidence had `status=failed`, `passed=false`, `repeatable=true`,
`source_guard.passed=true`, no preflight failure, current runner hash
`41be50d...`, and mutated driver hash
`d0cb62ee0f9d6c783aa794aae1ba57533bfa2b1dc1d0822fe4829725f1ba809b`.
The mutation was therefore rejected by runtime provenance rather than by a
spelling-dependent source rule.

### Required clean rerun after the exact fixture

The unchanged primary disposable copy was then rerun:

```text
$ PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright node tools/gate_b_slice.mjs
ok    run 1  distance=302.6m air=857ppm/0.229 hits=10 kills=3 hp=97.4
ok    run 2  distance=302.6m air=857ppm/0.229 hits=10 kills=3 hp=97.4
GATE B REPRESENTATIVE SLICE OK (partial scope)
```

Result: **PASS**, exit 0. Its report had `status=passed`, `passed=true`,
`repeatable=true`, no preflight/browser/driver/integrity errors, three
full-health authored actors, 10 normal damage transitions and hit-resolver
calls, three proven deaths, and matching current engine, driver, runner, and
built-bundle hashes.

### Shared evidence binding

The current shared runner hash and the shared evidence runner binding both
equal:

```text
41be50d808a5765574a3fd948f72e62c28a000992647b0b93ceac701cb2181e0
```

The inspected shared report was current `status=passed`, `passed=true`, and
`repeatable=true`. GB06-R05's runner-binding mismatch is resolved.

## New finding

### GB06-R06 — Nested actor damage during authenticated `damageNumber` delivery is accepted

- **Severity:** high
- **Affected criteria:** every raid HP transition must be caused exactly once by
  the authenticated production `_applyHit`; event reentrancy must not permit
  extra damage; the normal authored-combat provenance claim.
- **Evidence:** the repaired actor `damage` wrapper allows a protected target to
  be damaged whenever `inHitResolver` is true and
  `currentHitResolution.target === this`. Production `_applyHit` leaves those
  conditions true while emitting `damageNumber`. An evaluated listener can
  therefore call the same target's `damage` method again. The direct-HP fixture
  does not exercise this method-level reentrancy. End-of-step auditing sees the
  legitimate outer damage event and does not reconcile its amount with the
  complete HP delta.
- **Reproduction:** add this listener in a disposable current driver after the
  normal damage telemetry listener:

  ```js
  G.on('damageNumber', ({ target }) => {
    const raid = G.director._raidActive;
    if (!raid || !raid.group.includes(target) || target.dead) return;
    const extra = Math.min(12, Math.max(0, target.hp - 1));
    if (extra <= 0) return;
    const nestedDamage = Reflect.get(target, ['dam', 'age'].join(''));
    Reflect.apply(nestedDamage, target, [{
      amount: extra, poise: 0, kind: 'blunt', dirX: 0, dirZ: 0, source: P,
    }]);
  });
  ```

  Then run the official current runner:

  ```text
  $ PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright node tools/gate_b_slice.mjs
  ok    run 1  distance=301.5m air=857ppm/0.229 hits=8 kills=3 hp=97.4
  ok    run 2  distance=301.5m air=857ppm/0.229 hits=8 kills=3 hp=97.4
  GATE B REPRESENTATIVE SLICE OK (partial scope)
  ```

  Result: **exit 0**. The latest temporary evidence had `status=passed`,
  `passed=true`, `repeatable=true`, `source_guard.passed=true`, no errors or
  violations, and mutated driver hash
  `b6deb2edce30a69a20f4477ea1e34e500f18258b67c57b3a42fe39787926cb59`.
  Each context recorded eight normal hit events, 160 reported damage, three
  kills, eight accepted damage transitions, eight hit-resolver calls, and no
  remaining hostile. The clean run required ten hits and reported 209 damage;
  the unreported nested damage supplied the difference.
- **Likely cause:** a broad dynamic state (`inHitResolver`) is used as a
  reusable authorization window. The first legitimate `target.damage` call is
  not consumed as a single-use capability, and event delivery occurs before
  that window closes.
- **Required repair direction:** issue a target-bound, single-use damage token
  immediately around the one production `target.damage` invocation and consume
  it on first entry. Reject nested/repeated protected-actor damage even while
  the outer hit resolver is active. Reconcile authenticated damage result and
  event amount with the observed HP transition. Keep projectile/vitals
  authorization separately scoped rather than sharing a broad updater flag.
- **Required retest:** add the exact computed-method listener above as a
  permanent negative fixture. It must exit nonzero and write current
  revision/hash-bound `passed:false` evidence. Also test nested damage from
  `damageNumber`, `kill`, `actor:hurt`, and other callbacks reached while a
  legitimate resolver or projectile update is active. Then rerun all existing
  adversarial probes and a final unchanged two-context clean run.

## Finding disposition

| Finding | Third-round disposition | Evidence |
|---|---|---|
| GB06-R04 — attack-definition event reentrancy | **RESOLVED for the exact and adjacent built-in fixtures** | The exact `damage/poise=200` listener exits nonzero with current `passed:false` evidence. Timing and hit-set reentry fixtures are also rejected. |
| GB06-R05 — shared evidence runner mismatch | **RESOLVED** | Shared runner hash equals the shared evidence runner binding (`41be50d...`). |
| GB06-R06 — nested damage method reentrancy | **OPEN, high** | The official runner exits 0 in two fresh contexts and records forged extra damage as a clean pass. |

## Limited acceptance assessment

| Criterion | Result |
|---|---|
| Operating-state validation | PASS |
| Current full existing Gate B partial-slice suite | PASS |
| Exact GB06-R04 listener rejected with current failure evidence | PASS |
| Attack timing, hit-set, direct HP, updater, resolver, and stale-evidence fixtures rejected | PASS |
| Final unchanged clean two-context result | PASS |
| Shared evidence runner binding is current | PASS |
| All combat-event reentrancy shortcuts rejected | **FAIL — GB06-R06** |
| Claims remain explicitly partial | PASS |

## Verdict

**FAIL — third-round GB-IMP06 partial-slice review.**

GB06-R04 and GB06-R05 are resolved in the tested scope, and every existing
negative fixture plus the final clean two-context run behaves correctly.
Approval is nevertheless blocked by the new high-severity GB06-R06: nested
method-level damage during an authenticated `damageNumber` callback passes the
official runner and reduces the authored raid from ten reported hits to eight
without any integrity violation. This verdict grants no full Gate B, B1, B2,
C1, D3, performance, real-device, or release approval.
