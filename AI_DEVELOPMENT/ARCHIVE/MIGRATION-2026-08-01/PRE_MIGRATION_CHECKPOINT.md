# Pre-migration checkpoint — legacy protocol to canonical operating system

- Checkpoint id: `CP-MIG-2026-08-01-PRE`
- Captured: 2026-08-01
- Captured by: Claude Code run `RUN-2026-08-01-MIG-01`
- Purpose: immutable record of verified reality **before** any operating file was changed, so the
  migration is reversible and so no state is reconstructed from guesswork.

This file is immutable. Do not edit it to reflect later work.

---

## 1. Repository and Git state

| Field | Verified value |
|---|---|
| Git root | `/home/user/survival` |
| Worktree | clean — `git status --porcelain` produced no output |
| Branch | `claude/legacy-canonical-migration-jcuour` |
| HEAD | `193f408df049f068be57de7a1944089942720ad9` |
| `origin/main` | `193f408df049f068be57de7a1944089942720ad9` |
| `origin/claude/legacy-canonical-migration-jcuour` | `193f408df049f068be57de7a1944089942720ad9` |
| Remote | `origin` → `bachikoljunior-blip/survival` (proxied HTTP endpoint) |
| Tracked files | 143 |
| Concurrent user changes | none observed; the branch is identical to `main` |
| Local `main` ref | stale at `46d4746` ("Initial commit"), 49 behind `origin/main`; a local ref artifact only, not project state |

Open pull requests: **none**. PRs #1, #2, #3 and #4 are all merged and closed.

| PR | Title | Merged at | Merge commit |
|---|---|---|---|
| #1 | CINDERLINE — the game, and Japanese support | 2026-07-30T09:28:24Z | — |
| #2 | Verify CINDERLINE Gate B representative slice | 2026-07-31T20:15:56Z | `ceb34cc` |
| #3 | Publish CINDERLINE from the configured Pages root | 2026-07-31T20:24:26Z | `cc96f3a` |
| #4 | Record the verified GitHub Pages publication | 2026-07-31T20:32:39Z | `193f408` |

Deployed revision: GitHub Pages was verified for `cc96f3a`
(`AI_DEVELOPMENT/EVIDENCE/OPS-REMOTE-PUBLISH.md`). `193f408` changed **records only** — no
runtime release artifact changed between `cc96f3a` and `193f408`, so the deployed game remains the
verified one.

### SHA-256 of the legacy operating records at capture time

```
6ad016d399baaada41b82ece407c5c3a2e993aaeacd04e2dbd0e75675f20180e  PROJECT_OPERATING_PROTOCOL.md
854bc972415ab7be5eb74d574ef31a9c55c4d676968d9e4c04c1f692ffd630e2  AI_DEVELOPMENT/INDEX.md
f589001e6ea7109b30fec0a805e3a1ab88962c7b07b43d38dd4db07cd4c0c1f1  AI_DEVELOPMENT/PROJECT_STATE.json
958d4a588ea4cc370e6e38bbeb753ce7d48841308c85a640a34894c5defd07a7  AI_DEVELOPMENT/SESSION_STATE.json
a1346933e5caefe2e1041389d93899f7a5f557f0d01210c68cae8ee39e5ec8eb  AI_DEVELOPMENT/DECISIONS.md
f5bfee4a42eba8dfbd265623a2288f5e7293d9d72439fd7ac16e5ee00bb1ee6b  AI_DEVELOPMENT/FAILURES.md
```

---

## 2. Active logical session and objective

Source: `AI_DEVELOPMENT/SESSION_STATE.json` at `193f408`.

- Logical session: `SESSION-2026-07-31-01`
- Status: **active**; `opened_by_user: true`; `end_declared_by_user: false`
- Objective: *"Continue CINDERLINE from the published Gate B representative-slice checkpoint and
  implement the highest-priority verified frontier without overstating full Gate B coverage."*
- Active task: `GB-H1`
- Active frontier: `GB-H1`, `GB-H2`, `GB-TOUCH-SMOKE`
- Final handoff: none. Archive reference: none.

**The user has not declared this logical session finished.** The migration must not end, restart or
replace it.

---

## 3. Task states at capture time

Taken verbatim from `AI_DEVELOPMENT/PROJECT_STATE.json`.

| Id | Status | Title |
|---|---|---|
| `PROJECT-CINDERLINE` | active | CINDERLINE release |
| `GATE-A` | verified | Creative foundation |
| `GATE-B` | active | Representative vertical slice |
| `GATE-C` | pending | Content complete |
| `GATE-D` | pending | Release candidate |
| `OPS-001` | verified | Install persistent operating layer |
| `GB-IMP06` | **partial_verified** | Verify a real movement, breathing and combat route |
| `GB-IMP06-AC` | verified | Define honest acceptance and test boundaries |
| `GB-IMP06-SLICE` | verified | Implement a deterministic Chapter 1 real-verb vertical slice |
| `GB-IMP06-EVIDENCE` | verified | Repeat the Chapter 1 slice and record durable evidence |
| `GB-IMP06-REVIEW` | verified | Independent falsification review of the route |
| `GB-TOUCH-SMOKE` | ready | Drive the visible touch controls at 667×375 |
| `GB-H1` | **active** | Add save migration and regression tests |
| `GB-H2` | ready | Recover from runtime errors and rejected promises |
| `GB-IMP02` | ready | Correct trust feedback that grades player choices |
| `GC-IMP06-FULLRUN` | ready | Run one complete opening-to-ending route |
| `OPS-REMOTE-PUBLISH` | verified | Push, merge and publicly publish the verified checkpoint |

Verification-pending items (`SESSION_STATE.json.checkpoint.pending_verification`):
old-version save fixtures; multi-step migration; explicit migration failure behavior;
current-version save/load regression; user-surface recovery notice.

---

## 4. Last genuinely verified checkpoint

- Checkpoint id: `CP-2026-08-01-01`
- Baseline recorded by the legacy state: `cc96f3a6cd94e11d3c71342ed568816ed55a9e59`
- Last verified action: PRs #2 and #3 merged into `main`; both GitHub Pages deployment paths
  succeeded for `cc96f3a`; public HTML, JavaScript, CSS and manifest matched the verified
  production build byte-for-byte.
- Rollback point: `cc96f3a6cd94e11d3c71342ed568816ed55a9e59`
- Next action recorded: *"Implement GB-H1 as an isolated save-migration layer, then verify
  old-version fixtures, staged migrations, explicit failure recovery, current saves and normal
  save/load behavior before integration."*

Evidence referenced by that checkpoint:

- `AI_DEVELOPMENT/EVIDENCE/GB-IMP06-SLICE.json`
- `AI_DEVELOPMENT/EVIDENCE/OPS-REMOTE-PUBLISH.md`
- `docs/reviews/gate-b-imp06-slice-closure-current.md`

---

## 5. Baseline health check executed during this capture

Run at HEAD `193f408`, working tree clean, dependencies installed with
`NPM_CONFIG_CACHE` redirected to a writable path (see failure `OF-001`).

| Check | Command | Result |
|---|---|---|
| Operating state | `npm run validate:ops` | **passed** — revision `2026-08-01.1`, 5 plan nodes, 12 tasks, active `GB-H1`, session active |
| Content graph | `npm run validate` | **passed** — VALIDATION OK; 224 dialogue nodes, 9 quests, 5 endings, 66 flags set / 55 read |
| Scope vs content | `node tools/check_scope.mjs --against-content` | **passed with declared gaps** — all six figures match; playtime unmeasured; `breaker` and `dog` unplaced in the main story |
| Gate A reviews | `node tools/check_reviews.mjs --gate A` | **passed** — 0 unresolved blocking findings |
| Gate B reviews | `node tools/check_reviews.mjs --gate B` | **failed (expected)** — 2 unresolved `high`: `audit-incumbent.md` H1 (no save migration) and H2 (no post-startup error recovery) |
| DONE table | `node tools/check_done_table.mjs` | **passed** — all 11 rows match reality |
| Dependency install | `npm ci` | **passed** — 5 locked packages |

The Gate B review failure is **not a migration regression**. It is the pre-existing, correctly
recorded reason that `GB-H1` and `GB-H2` are the active and ready frontier tasks: acceptance
criterion `B5` requires those two `high` findings to be resolved.

Not executed during this capture, and therefore claimed for nothing:
`npm test` (full suite), `npm run test:gate-b`, `npm run build`, `npm run perf`, any physical-device
test, any public-surface re-verification.

---

## 6. Modified but unverified artifacts

None. The working tree was clean at capture time and the migration had not yet written any file.

---

## 7. Known failures carried into the migration

From `AI_DEVELOPMENT/FAILURES.md`:

| Id | Status at capture |
|---|---|
| `OF-001` npm default cache unwritable | recovered |
| `OF-002` Playwright primary CDN returned empty archives | recovered |
| `OF-003` baseline full-suite door transition stall | **repair under verification** — not closed |
| `OF-004` door-delay diagnostic called the log array as a function | **repair under verification** — not closed |
| `OF-005` Gate B combat evidence accepted invalid operations | recovered, independently closed for the partial-slice scope only |
| `OF-006` legacy Pages deployment overwrote the Actions deployment | recovered |

`OF-003` and `OF-004` require two fresh isolated `publish` runs followed by the complete suite
before their repairs may be called verified. That has not happened. The migration must not
represent them as closed.

---

## 8. Standing blockers (human-only, non-blocking for other work)

- **B1** — no physical device exists. iPhone SE 3rd generation verification has never been
  performed. No real-device performance or FPS claim may be made.
- **B2** — the Japanese text has not been read by a native speaker.

---

## 9. Remote-delivery state

Standing authorization is active, sourced from the user's explicit instruction of 2026-07-31 and
recorded as decision `OD-004`: remote push, merge and public publication/deployment of verified
checkpoints are authorized across chat, Work and logical-session boundaries until the user changes
it. It does **not** authorize payment, credential or account operations, private-data exposure,
destructive production/cloud operations, irreversible migrations, or disabling security controls.

---

## 10. Rollback

To restore the pre-migration operating system exactly:

```sh
git checkout 193f408df049f068be57de7a1944089942720ad9 -- \
  PROJECT_OPERATING_PROTOCOL.md \
  AI_DEVELOPMENT/INDEX.md \
  AI_DEVELOPMENT/PROJECT_STATE.json \
  AI_DEVELOPMENT/SESSION_STATE.json \
  tools/check_operating_state.mjs \
  package.json
rm -f CLAUDE.md START_HERE.md
rm -rf AI_DEVELOPMENT/SCHEMAS AI_DEVELOPMENT/RECIPES
rm -f AI_DEVELOPMENT/PROTOCOL.md AI_DEVELOPMENT/STATE.yaml \
      AI_DEVELOPMENT/REQUIREMENTS.yaml AI_DEVELOPMENT/WORK_GRAPH.yaml \
      AI_DEVELOPMENT/CAPABILITIES.yaml AI_DEVELOPMENT/POLICIES.yaml \
      AI_DEVELOPMENT/LEDGER.jsonl
npm run validate:ops
```

Or, to discard the migration entirely: `git reset --hard 193f408`.

The full rollback procedure, including the archived immutable copies, is
`AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/ROLLBACK.md`.

---

## 11. Exact next action after the migration completes

Resume the pre-migration objective and active task **unchanged**:

> Implement `GB-H1` as an isolated save-migration layer in `src/game/state.js`, then verify
> old-version fixtures, staged migrations, explicit failure recovery, current-version saves and
> normal save/load behavior before integration.

The migration must not replace this objective, mark it complete, or select different product work.
