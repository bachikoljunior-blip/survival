# Pre-migration checkpoint — legacy protocol to Adaptive 2.2

Captured 2026-08-01, before any operating file was changed by the Version 2.2
migration. This exists so the migration can be reversed and so nothing verified
before it is lost.

## Rollback

    git checkout 012009b264f9838f67548586d8eadc292475a266 -- \
      PROJECT_OPERATING_PROTOCOL.md AI_DEVELOPMENT/ docs/STATE.md package.json

Operating-file rollback point: `012009b264f9838f67548586d8eadc292475a266`
(branch `claude/one-round-execution-changes-psdid4`).
Last commit on `main`: `193f408df049f068be57de7a1944089942720ad9`.
Product rollback point for a bad release: `cc96f3a6cd94e11d3c71342ed568816ed55a9e59`
(the last revision verified live on GitHub Pages).

## Active logical session and objective

- Logical session `SESSION-2026-07-31-01`, status active, never declared
  finished by the user. It stays active across this migration.
- Objective: continue CINDERLINE from the published Gate B representative-slice
  checkpoint and implement the highest-priority verified frontier without
  overstating Gate B coverage.
- Active task at capture time: `GB-H1-REVIEW` — the independent falsification
  review of the save migration layer delivered in `012009b`.

## Work status at capture time

- complete_verified: OPS-001, GB-IMP06-AC, GB-IMP06-SLICE, GB-IMP06-EVIDENCE,
  GB-IMP06-REVIEW, OPS-REMOTE-PUBLISH.
- partial: GB-IMP06 (representative slice only; not C1/D3, not a full run,
  not real-device).
- complete_unverified: GB-H1. Implemented, gated by `tools/save_migration.mjs`
  (57 checks) and 9 of 9 negative controls, but no independent review has been
  run, so it is `under_review` and audit finding H1 stays open.
- ready: GB-H2, GB-TOUCH-SMOKE, GB-IMP02, GC-IMP06-FULLRUN.

## Modified but unverified at capture time

`AI_DEVELOPMENT/EVIDENCE/GB-IMP06-SLICE.json` was being rewritten by a running
`npm test`; the file settles to the final clean run and must be checked rather
than assumed.

## Blockers carried forward

- B1: no physical device has ever run this build. No real-device performance
  claim is permitted.
- B2: the Japanese text has never been read by a native speaker.
- Audit H1 and H2 remain open in `docs/reviews/audit-incumbent.md`.

## Remote and deployment state

- Repository `bachikoljunior-blip/survival`, default branch `main`.
- Working branch `claude/one-round-execution-changes-psdid4`, pushed.
- No open pull request opened by this session.
- Deployed revision `cc96f3a`, verified byte-identical on the public Pages
  surface (`AI_DEVELOPMENT/EVIDENCE/OPS-REMOTE-PUBLISH.md`). `193f408` and
  `012009b` have not been verified on the public surface.

## Existing automation at capture time

- `.github/workflows/pages.yml` — builds and deploys to GitHub Pages on every
  push to `main`. Runs `validate:ops`, `validate`, `build`, `validate:pages-root`.
  It has no post-deploy verification and no revert.
- `.github/workflows/autopilot.yml` — a self-restarting unattended chain:
  three Claude Code rounds, opens a pull request, squash-merges it to the
  default branch using `AUTOPILOT_PAT` (chosen specifically so the Pages deploy
  fires), then re-dispatches itself up to chain 20. Trigger is
  `workflow_dispatch` only; there is no `schedule`.
  Stop conditions: `docs/STOP` on the default branch, `ALL_DONE` in
  `docs/STATE.md`, chain >= 20, and no chaining unless the merge succeeded.
- Verified at capture time: 5 autopilot runs exist, all completed
  (last 2026-07-30T09:17Z). **No chain was in flight during this migration.**

## Legacy operating records mapped by this migration

| Legacy | Disposition |
|---|---|
| `PROJECT_OPERATING_PROTOCOL.md` | superseded where it conflicts; kept as the immutable legacy copy |
| `AI_DEVELOPMENT/INDEX.md` | superseded by `START_HERE.md`; kept as an archive reference |
| `AI_DEVELOPMENT/SESSION_STATE.json` | migrated into `AI_DEVELOPMENT/STATE.yaml`; retained only as a derived projection |
| `AI_DEVELOPMENT/PROJECT_STATE.json` | retained as the work graph (task ids, dependencies, acceptance trace) |
| `docs/STATE.md` | retained as the human-readable product state; no longer the machine authority |
| `docs/directive.md`, `docs/bible.md`, `docs/DONE.md` | unchanged product authorities |
| `AI_DEVELOPMENT/DECISIONS.md`, `FAILURES.md`, `EVIDENCE/`, `HANDOFFS/`, `SKILLS/` | preserved as-is |
| standing push/merge/publish authorization (2026-07-31) | preserved under Section 14 |

Nothing in this table converts planned, prepared, blocked, or unverified work
into complete or passed.
