# Operational decisions

## OD-001 — Thin operating layer

- Date: 2026-07-31
- Status: accepted
- Decision: Keep existing product authorities and add only machine-readable IDs, edges, session flags and operating rules under `AI_DEVELOPMENT/`.
- Reason: Duplicating requirements, acceptance criteria, product debt or human status would create conflicting sources of truth.
- Consequence: `docs/STATE.md` remains the human status authority; JSON must share its `state_revision`.

## OD-002 — JSON instead of YAML

- Date: 2026-07-31
- Status: accepted
- Decision: Use JSON for project and session state.
- Reason: The repository already runs Node; JSON can be parsed and validated without adding a dependency or licence obligation.

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

## OD-006 — The reference benchmark is an instrument, not a new gate

- Date: 2026-08-01
- Status: accepted
- Source: Latest explicit user instruction: select a high-quality reference work per element, convert it into concrete evidence-based criteria, and keep it as persistent project information.
- Decision: `docs/benchmarks.md` is the authority for per-element reference works, selection rationale, quality criteria and the current gap. It adds **no** completion condition — `docs/DONE.md` and its Gate A–D transcription remain untouched (`docs/directive.md` §18 forbids inventing new criteria). Every criterion names the directive clause or bible pillar it operationalises.
- Reason: The project already had requirements (§4–§13) and known defects (bible §17/§17b), but no statement of *what quality level* each element is aiming at, so "how far short is this?" had no answer. A reference work per element supplies the level; the criteria supply the measurement.
- Honesty boundary: No reference title has been run, measured, screenshotted or compared side by side in this environment, and no expert approval or blind evaluation has been performed. Reference-side statements are generalised design principles only. `tools/check_benchmarks.mjs` fails any criterion that is marked as met while its verification requires a physical device or a human.
- Anti-weakening: `AI_DEVELOPMENT/BENCHMARKS/criteria.lock.json` pins the sha256 of every criterion's (id + basis + threshold). Changing one inside a revision fails; changing one across revisions requires the criterion ID in the change log. This was verified by three rejected negative cases, not assumed.
- Consequence: Work items are judged against benchmark criterion IDs (GB-H1 → BM-STB-02, GB-H2 → BM-STB-03, GB-TOUCH-SMOKE → BM-TCH-01/03/04, BM-MENU-01). A concept change updates `docs/benchmarks.md` §1 and only re-selects reference works for the elements that stop fitting (§8 of that document).

## OD-005 — Keep the branch-source Pages mirror byte-identical to `dist/`

- Date: 2026-08-01
- Status: accepted while repository Pages source remains `main/(root)`.
- Decision: Generate and commit the root publication files with `npm run build:pages-root`; require `npm run validate:pages-root` in the Actions deployment.
- Reason: The repository had both Actions deployment and the legacy branch-source deployment enabled. The latter completed after the former and replaced the game with rendered `README.md`.
- Consequence: Root publication files are generated artifacts and must not be edited manually. If the Pages setting is later changed to GitHub Actions, remove the mirror only in a separately verified migration.

## OD-006 — A save carries its version on the envelope, and old saves are upgraded

- Date: 2026-08-01
- Status: accepted
- Decision: `SAVE_VERSION` is 2. The version is written on the save envelope as well as inside the state blob, and `migrateSave()` upgrades older saves one registered step at a time before anything is restored. Statuses that are not `ok` or `migrated` refuse the load, name the reason, and leave the stored bytes alone.
- Reason: v1 compared the stored version to the current constant and returned null on any mismatch. A version bump silently hid CONTINUE and the next autosave destroyed the player's progress. The fields around `state` — player transform, interior, interaction ids, gas sources, the chapter-four crisis timer — carried no version at all and so could never have been migrated.
- Consequence: a migrated save is **not** written back on load. The upgraded payload reaches the running game, but storage keeps the old bytes until the next real save, so a player who abandons the session can still open it with their previous build. `tools/save_migration.mjs` asserts this.
- Obligation: the next format change captures its own "old" fixture with `tools/fixtures/capture_legacy_save.mjs` **before** the change lands. A fixture captured afterwards is produced by the code under test and proves nothing.
