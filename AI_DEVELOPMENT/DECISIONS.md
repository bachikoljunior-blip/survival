# Operational decisions

## OD-001 — Thin operating layer

- Date: 2026-07-31
- Status: accepted
- Decision: Keep existing product authorities and add only machine-readable IDs, edges, session flags and operating rules under `AI_DEVELOPMENT/`.
- Reason: Duplicating requirements, acceptance criteria, product debt or human status would create conflicting sources of truth.
- Consequence: `docs/STATE.md` remains the human status authority; JSON must share its `state_revision`.

## OD-002 — JSON instead of YAML

- Date: 2026-07-31
- Status: **superseded** by OD-006 (2026-08-01), for the canonical operating records only.
- Decision: Use JSON for project and session state.
- Reason: The repository already runs Node; JSON can be parsed and validated without adding a dependency or licence obligation.
- Supersession: The canonical records are YAML by protocol. The *reason* was honoured rather than discarded — `tools/lib/yaml.mjs` and `tools/lib/schema.mjs` are dependency-free, so the count is still five locked packages and `npm run validate:ops` still runs from a clean checkout with nothing but Node. `LEDGER.jsonl`, the handoff records and the schema files remain JSON.

## OD-003 — Current logical session remains active

- Date: 2026-07-31
- Status: accepted
- Decision: This turn, any task completion, context compaction, commit or PR is a checkpoint only.
- Reason: The user has not explicitly declared the logical session finished.

## OD-004 — Persistent authorization for remote integration and publication

- Date: 2026-07-31
- Status: accepted
- Source: Latest explicit user instruction: perform remote push, merge and publication even after session changes.
- Replaces: The per-operation authorization requirement in `PROJECT_OPERATING_PROTOCOL.md` §§23 and 28, only for remote push, merge and public publication/deployment.
- Decision: Treat push, merge and publication as normal completion steps for verified CINDERLINE checkpoints across future chat, Work and logical-session boundaries until the user changes or revokes this instruction.
- Safety boundary: Inspect the exact repository, branch, diff, mandatory gates and remote result; do not publish a known failing checkpoint or secrets. This does not authorize payment, account or credential changes, private-data exposure, destructive production data/cloud actions, irreversible migrations or disabling security controls.

## OD-005 — Keep the branch-source Pages mirror byte-identical to `dist/`

- Date: 2026-08-01
- Status: accepted while repository Pages source remains `main/(root)`.
- Decision: Generate and commit the root publication files with `npm run build:pages-root`; require `npm run validate:pages-root` in the Actions deployment.
- Reason: The repository had both Actions deployment and the legacy branch-source deployment enabled. The latter completed after the former and replaced the game with rendered `README.md`.
- Consequence: Root publication files are generated artifacts and must not be edited manually. If the Pages setting is later changed to GitHub Actions, remove the mirror only in a separately verified migration.

## OD-006 — Migrate the operating layer to the canonical protocol 2.0.0

- Date: 2026-08-01
- Status: accepted
- Source: Explicit user instruction — legacy-to-canonical migration installer.
- Supersedes: `PROJECT_OPERATING_PROTOCOL.md` in full; `AI_DEVELOPMENT/INDEX.md`; the
  `PROJECT_STATE.json` / `SESSION_STATE.json` pair; and OD-002 for the canonical records.
- Decision: Replace the version-1 operating layer with the canonical system — `CLAUDE.md` loader,
  `START_HERE.md`, `AI_DEVELOPMENT/PROTOCOL.md`, one `STATE.yaml`, one `WORK_GRAPH.yaml`,
  `REQUIREMENTS.yaml`, `CAPABILITIES.yaml`, `POLICIES.yaml`, append-only `LEDGER.jsonl`, versioned
  `SCHEMAS/`, `RECIPES/`, and a dated migration `ARCHIVE/`.
- Reason: The legacy design let three plan records disagree and had no field for epistemic status,
  task contracts, two-way traceability or a derived frontier. It had already drifted in ways its own
  validator could not see: a stale verified baseline, a stale rollback point, a working branch that
  did not match the checkout, and a frontier missing two eligible tasks.
- Consequence:
  - The frontier is **derived**, not authored. `npm run validate:ops` recomputes and compares it.
  - Traceability is two-way and enforced in both directions.
  - Gate results use a six-value vocabulary with no way to record an unexecuted check as a pass.
  - `validate:ops` now runs the parser self-test and the dry resumption check as well.
  - Legacy records are immutable under `ARCHIVE/MIGRATION-2026-08-01/legacy/`; rollback is
    `ARCHIVE/MIGRATION-2026-08-01/ROLLBACK.md`.
- Explicitly not changed: the logical session stays active, the objective and active task `GB-H1`
  are carried over verbatim, no epistemic status was upgraded, no product behavior changed, and
  nothing was republished.

## OD-007 — Record the four missing gate scripts as proposed, not as accepted work

- Date: 2026-08-01
- Status: accepted
- Decision: `tools/check_placeholders.mjs` (C4), `check_console.mjs` (D6), `check_honesty.mjs` (D8)
  and `check_licenses.mjs` (D9) enter the work graph as `TOOL-CHECK-*` nodes with status
  `proposed`. Likewise `OPS-GATE-WIRING`, for the finding that `check_done_table.mjs`,
  `check_scope.mjs` and `check_reviews.mjs` run from no npm script and no workflow.
- Reason: `docs/DONE.md` proves these gates need them, so leaving them invisible would hide a real
  gap. But adding work the user has not selected would silently broaden scope, and
  `check_reviews --gate B` currently fails by design — wiring it into CI without deciding what to do
  about `H1` and `H2` would break the build and the autopilot chain with it.
- Consequence: They appear in `WORK_GRAPH.yaml`, are excluded from the derived frontier because
  `proposed` is not actionable, and wait for the user to accept them.

## OD-008 — The operating layer is written in English; product documents stay Japanese

- Date: 2026-08-01
- Status: accepted, and flagged for the user to overrule.
- Decision: `CLAUDE.md`, `START_HERE.md` and everything under `AI_DEVELOPMENT/` are written in
  English. `docs/directive.md`, `docs/bible.md`, `docs/DONE.md`, `docs/STATE.md`,
  `docs/assets.md`, `docs/device-test-checklist.md` and **all in-game text** stay Japanese.
- Reason: `docs/directive.md` §0 says documentation, commit messages and in-game text are Japanese.
  The operating records have been English since the layer was installed on 2026-07-31
  (`DECISIONS.md`, `FAILURES.md`, `EVIDENCE/`, `HANDOFFS/`), and the 2026-08-01 migration continued
  that rather than translating a working system mid-migration. The English half was a real,
  unrecorded deviation, unlike the Vite deviation (`R-15`) which was recorded when it was made.
- Consequence: `REQ-ENG-06` moves from `satisfied` to `partially_satisfied`. Only the in-game half
  is verified — `npm run i18n`, 882/882 strings, 0 rejected glossary variants. **This is recorded so
  it can be reversed, not to justify itself.** If the user wants the operating layer in Japanese,
  translating it is a bounded, mechanical task; say so and it will be done.
- Not covered by this decision: commit message language, which has drifted to English without any
  decision at all. Left as-is and flagged here rather than changed unilaterally.
