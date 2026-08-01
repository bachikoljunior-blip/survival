# Closed logical sessions

No logical session has ever been closed. This directory is empty of entries and that is correct.

An entry may be added only when **the user explicitly declares a logical session finished**. A new
chat, a context reset, a device change, a usage limit, a completed objective, a commit, a pull
request, a merge, a deployment or a protocol migration are none of them a session boundary.

Migrated from the legacy `AI_DEVELOPMENT/SESSION_ARCHIVE/` on 2026-08-01.

## What an entry must contain

When a session is closed, archive it here as `SESSION-<id>.md` with:

- reconciliation of records against verified reality at close;
- completed, partial, blocked, deferred and rejected work;
- changed artifacts, checks run and their results, evidence, risks, failures, rollback points;
- the exact recommended continuation point;
- a final handoff conforming to `AI_DEVELOPMENT/SCHEMAS/handoff.v1.schema.json`, with
  `kind: "final"` and `end_declared_by_user: true`.

Then, and only then, set `STATE.yaml.logical_session.status` to `closed` and point
`final_handoff` and `archive_reference` at real files. `npm run validate:ops` rejects a closed
session that lacks either, and rejects an active session that claims the user ended it.

## Currently open

`SESSION-2026-07-31-01` — **active**. `end_declared_by_user: false`.
