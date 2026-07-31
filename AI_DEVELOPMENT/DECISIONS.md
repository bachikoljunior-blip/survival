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
