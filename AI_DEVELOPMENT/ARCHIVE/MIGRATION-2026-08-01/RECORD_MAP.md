# Record map — legacy protocol → canonical operating system

Every persistent record that existed at `193f408`, and where it went. Records were mapped by
**meaning**, not by filename. Nothing was deleted; anything that moved has a byte-identical copy in
`legacy/`.

## 1. Operating records

| Legacy record | Disposition | Canonical target |
|---|---|---|
| `PROJECT_OPERATING_PROTOCOL.md` (root, 32 sections, Japanese) | moved to `legacy/` | `AI_DEVELOPMENT/PROTOCOL.md` (durable rules) + `START_HERE.md` (loader) + `CLAUDE.md` (boot block). Section 28's standing authorization became `POLICIES.yaml.permissions`. |
| `AI_DEVELOPMENT/INDEX.md` | moved to `legacy/` | `START_HERE.md`. Its authority table became `REQUIREMENTS.yaml.authorities`; its read order became the resume procedure; its session rule became `PROTOCOL.md` section 2. |
| `AI_DEVELOPMENT/PROJECT_STATE.json` | moved to `legacy/` | Split by lifecycle: `project` → `STATE.yaml.project`; `plan_nodes` + `tasks` → the single `WORK_GRAPH.yaml`; `acceptance_trace` → two-way traceability between `REQUIREMENTS.yaml.criteria[].work_node_refs` and `WORK_GRAPH.yaml.nodes[].acceptance_refs`; `authorities` → `REQUIREMENTS.yaml.authorities`; `remote_execution_authorization` → `POLICIES.yaml`. |
| `AI_DEVELOPMENT/SESSION_STATE.json` | moved to `legacy/` | `STATE.yaml.logical_session`, `.current_objective`, `.active_task`, `.derived_frontier`, `.last_verified_checkpoint`, `.rollback_point`, `.next_action`, `.pending_verification`. The frontier stopped being authored and became derived. |
| `AI_DEVELOPMENT/DECISIONS.md` (OD-001…OD-005) | **kept in place** | Remains the concise active decision record. Each decision is additionally a `decision` event in `LEDGER.jsonl`. |
| `AI_DEVELOPMENT/FAILURES.md` (OF-001…OF-006) | **kept in place** | Remains the concise active failure record with its reusable rules. Each failure is additionally a `failure` event in `LEDGER.jsonl`, preserving `repair under verification` for OF-003 and OF-004. |
| `AI_DEVELOPMENT/TEST_HISTORY/INDEX.md` | moved to `legacy/TEST_HISTORY.md` | Each table row became a `gate_result` ledger event carrying its exact status word and its limitation column. |
| `AI_DEVELOPMENT/EVIDENCE/` | **kept in place** | Still the canonical evidence directory. `INDEX.md`, `GB-IMP06-SLICE.json` and `OPS-REMOTE-PUBLISH.md` are unchanged; the two summaries also exist as `evidence` ledger events. |
| `AI_DEVELOPMENT/HANDOFFS/` | **kept in place** | Preserved unchanged. Now validated against `SCHEMAS/handoff.v1.schema.json`. No handoff is active — all four belong to the closed `GB-IMP06-REVIEW`. |
| `AI_DEVELOPMENT/SKILLS/INDEX.md` | renamed | `AI_DEVELOPMENT/RECIPES/README.md`. The directory was empty of actual skills, so nothing was promoted to `.claude/skills/` — there was nothing to promote. |
| `AI_DEVELOPMENT/SESSION_ARCHIVE/INDEX.md` | renamed | `AI_DEVELOPMENT/ARCHIVE/SESSIONS/README.md`. Still empty: no logical session has ever been closed. |
| `AI_DEVELOPMENT/BENCHMARKS/INDEX.md` | moved to `legacy/BENCHMARKS.md` | Empty placeholder. Its durable rule — headless SwiftShader results are not device results — is now `PROTOCOL.md` section 10.6, `CAPABILITIES.yaml`, and the required `limitations` field of `SCHEMAS/evidence-record.v1.schema.json`. |
| `AI_DEVELOPMENT/EXPERIMENTS/INDEX.md` | moved to `legacy/EXPERIMENTS.md` | Empty placeholder. Its record contract is now `PROTOCOL.md` section 10.7. |

## 2. Product authorities — untouched

`docs/directive.md`, `docs/bible.md`, `docs/DONE.md`, `docs/assets.md`,
`docs/device-test-checklist.md` and all eleven files in `docs/reviews/` keep their content and
their authority. Only stale pointers were corrected:

| File | Change |
|---|---|
| `docs/STATE.md` | `state_revision` `2026-08-01.1` → `2026-08-01.2`; resume order now names `START_HERE.md`; frontier described as derived. Verified status, acceptance table, blockers and decision-change history unchanged. |
| `docs/DONE.md` | The traceability pointer now names `REQUIREMENTS.yaml` / `WORK_GRAPH.yaml`. **Gate A–D wording untouched.** |
| `docs/directive.md` | Section 0 and section 19 pointers updated to the canonical files; the resume-writing requirement now names `tools/resume_check.mjs` as its mechanical check. Requirements unchanged. |
| `README.md` | Operating-rules link updated; added the standing warning that the README is not design evidence. |
| `docs/reviews/*` | Untouched. They are immutable review history and their references to legacy paths are historically correct. |

## 3. Tooling

| Tool | Change |
|---|---|
| `tools/check_operating_state.mjs` | Rewritten for protocol 2.0.0. Keeps every version-1 invariant (revision agreement, id/parent/dependency integrity, cycle detection, single active task, frontier validity, acceptance references, evidence paths, session-close conditions) and adds schema validation, contract presence, derived-frontier recomputation, two-way traceability, ledger integrity, migration completeness, loader shape and a secret scan. |
| `tools/lib/yaml.mjs`, `tools/lib/schema.mjs` | New. Dependency-free YAML-subset parser and JSON-Schema-subset validator, so the boot records stay validatable from a clean checkout. |
| `tools/yaml_selftest.mjs` | New. 50 checks, half of them expected-failure fixtures — a validator that cannot fail proves nothing. |
| `tools/resume_check.mjs` | New. The dry resumption check, including migration fidelity against `RESUMPTION_EXPECTED.json`. |
| `tools/gate_b_slice.mjs` | One line: evidence binding now reads `state_revision` from `STATE.yaml` instead of `PROJECT_STATE.json`. Harness behavior, driver hash guard and adversarial fixtures untouched. |
| `tools/check_scope.mjs`, `check_reviews.mjs`, `check_done_table.mjs`, `validate.mjs`, `playthrough.mjs`, `perf.mjs`, `gate_b_adversarial.mjs`, `export_pages_root.mjs` | Untouched. They never referenced the legacy state files. |
| `package.json` | `validate:ops` now runs self-test → validator → resume check. `test` gains the same three at the front. No other script changed. |
| `.github/workflows/pages.yml` | Untouched. It calls `npm run validate:ops`, which still exists and now checks more. |
| `.github/workflows/autopilot.yml` | **Untouched, by standing instruction.** Its prompts reference `docs/directive.md` and `docs/STATE.md`, both of which still exist and still carry the same meaning, so the autopilot chain keeps working. |

## 4. What was deliberately not carried over

- **`OD-002` (JSON instead of YAML).** Superseded for the canonical records by the migration
  instruction, which names `.yaml` files. Its reasoning — no new dependency — was honoured rather
  than discarded: `tools/lib/yaml.mjs` is why the dependency count is still five. The decision
  stays in `DECISIONS.md` marked superseded, with the replacement recorded.
- **The legacy `acceptance_trace` array.** Replaced by two-way references that the validator checks
  in both directions. A one-way table could go stale silently; that is what it is being replaced for.
- **The separate `active_frontier` field.** Replaced by a derived view. This is the single largest
  behavioral change in the migration.

## 5. Path redirect table

Some records **must not be edited** — the review corpus and the handoff artifacts are append-only
history, and `docs/STATE.md` explicitly keeps the withdrawn Gate B passes as evidence of how the
verdict was reached. They still reference paths that moved. Resolve them here rather than rewriting
them:

| Referenced path | Now at |
|---|---|
| `PROJECT_OPERATING_PROTOCOL.md` | `AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/legacy/PROJECT_OPERATING_PROTOCOL.md` |
| `AI_DEVELOPMENT/INDEX.md` | `AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/legacy/INDEX.md` |
| `AI_DEVELOPMENT/PROJECT_STATE.json` | `AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/legacy/PROJECT_STATE.json` |
| `AI_DEVELOPMENT/SESSION_STATE.json` | `AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/legacy/SESSION_STATE.json` |
| `AI_DEVELOPMENT/TEST_HISTORY/INDEX.md` | `AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/legacy/TEST_HISTORY.md` |
| `AI_DEVELOPMENT/BENCHMARKS/INDEX.md` | `AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/legacy/BENCHMARKS.md` |
| `AI_DEVELOPMENT/EXPERIMENTS/INDEX.md` | `AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/legacy/EXPERIMENTS.md` |
| `AI_DEVELOPMENT/SESSION_ARCHIVE/INDEX.md` | `AI_DEVELOPMENT/ARCHIVE/SESSIONS/README.md` |
| `AI_DEVELOPMENT/SKILLS/INDEX.md` | `AI_DEVELOPMENT/RECIPES/README.md` |

Known referrers, deliberately left untouched: `docs/reviews/gate-b-imp06-slice.md:18`,
`docs/reviews/gate-b-imp06-slice-final-review.md:23`,
`AI_DEVELOPMENT/HANDOFFS/GB-IMP06-REVIEW.json:12`, `GB-IMP06-REREVIEW.json:14`,
`GB-IMP06-CLOSURE-REVIEW.json:11`. Their line numbers still resolve, because every archived file was
moved byte-identically.

Also note: `npm run validate:ops` no longer resolves to the version-1 validator. Where a review or
handoff records `npm run validate:ops` as passing, that pass was produced by the 153-line legacy
checker against the legacy JSON pair. The same command now runs the parser self-test, the protocol
2.0.0 validator and the resumption check.

## 6. Defects found while reconciling, and what was done

The migration is a reconciliation, so it surfaced things neither system had caught. Everything here
is recorded rather than quietly fixed or quietly ignored.

| Finding | Disposition |
|---|---|
| `docs/DONE.md`'s implementation-status table omitted rows for **B2, C5 and D7**, all declared 自動検証 可 with no script. `check_done_table.mjs` walks only rows that exist, so it could not see the omission — a shorter table reads as "less missing". | Three rows added, marked 未実装. The table now has 14 rows and still validates. |
| The legacy graph's `acceptance_refs` and `acceptance_trace` disagreed: `GB-IMP06-AC` claimed B1 and B5 but appeared in neither trace row; `GB-IMP06-EVIDENCE` claimed B5 and was absent from it; `GB-IMP06-SLICE` claimed both but appeared only under B1. | Traceability is now generated from one table in both directions, so the two cannot disagree. The union was taken. Noted on criterion B1. |
| `GATE-C` and `GATE-D` carried status `pending`, a word in neither the legacy nor the canonical vocabulary. | Mapped to `accepted` — agreed, transcribed, not startable. Never `ready`, which would declare them actionable. |
| `D11` had been extracted as `refuted`. No source says D11 fails; it has never been evaluated. | Corrected to `not_verified`. Over-claiming a negative is fabrication too. |
| `C1`, `C3`, `D3`, `D4` had `tool_status: partially_implemented`, but `docs/DONE.md` marks those tools 実装済み with a *scope* caveat. | Corrected to `implemented`, with the scope limit kept in `limitations`. |
| `A7`'s limitation claimed 10 unresolved highs. Re-running `check_reviews --gate A` gives 3 unresolved highs (N-03, N-04, N-06 → IMP-12, IMP-13, IMP-14), which do not block Gate A. | Corrected, and the three named. |
| `REQ-ENG-06` (documentation and commit messages in Japanese) was recorded `satisfied` on in-game-text evidence alone. The operating layer is English. | Corrected to `partially_satisfied` and recorded as decision `OD-008`, so the user can overrule it. |
| `REQ-OPS-01` (no two agents edit one file) was `satisfied` because the ownership map existed — but `src/main.js`, the target of the next task, had no owner. | Corrected to `partially_satisfied`; the map was completed. |
| `.github/workflows/autopilot.yml` uses `claude-code-action`, which auto-loads `CLAUDE.md`. Adding a loader silently changes every autopilot round, and the workflow is a protected path that cannot be edited to reconcile them. | The `CLAUDE.md` managed block now names the autopilot case explicitly: the workflow prompt still bounds scope, read only `START_HERE.md` + `STATE.yaml`, skip `PROTOCOL.md`, keep the revision marker. |
| `check_done_table.mjs`, `check_scope.mjs` and `check_reviews.mjs` run from no npm script and no workflow. | Recorded as proposed node `OPS-GATE-WIRING` (`OD-007`). Not wired in: `check_reviews --gate B` fails by design, and wiring it blindly would break the build and the autopilot chain with it. |

## 7. What was explicitly preserved unchanged

- Logical session `SESSION-2026-07-31-01` remains **active**. `end_declared_by_user` remains
  `false`. The user has not declared it finished, and a migration is not a session boundary.
- The objective, the active task `GB-H1`, and the exact next action are carried over verbatim.
- `GB-IMP06` remains `partial_verified` — not `verified`.
- `OF-003` and `OF-004` remain `repair under verification` — not recovered.
- Acceptance row 6 (trust does not appear in the UI) remains **refuted**. Rows 11, 13, 14 and 15
  remain unverified, unmet or unmeasured. Row 2 remains verified only in a limited scope.
- Blockers `B1` (no physical device) and `B2` (no native Japanese reader) remain open.
- The standing remote-delivery authorization remains in force.
- `check_reviews --gate B` still fails on `H1` and `H2`. That failure was not hidden, worked
  around, or reclassified: it is the reason `GB-H1` is the active task.
