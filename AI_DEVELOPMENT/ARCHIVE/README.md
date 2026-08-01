# Archive

Superseded records, closed sessions and historical detail. Kept out of the boot path so the active
records stay small enough to reload every run, and kept in the repository so history is never lost
to make a record look tidier.

**Do not read the archive to start work.** The resume path is `START_HERE.md`. Read here only when
migrating the system, investigating a discrepancy, tracing why a decision was made, or preparing a
major release.

| Path | Contents |
|---|---|
| `MIGRATION-2026-08-01/` | The legacy-protocol migration: pre-migration checkpoint, record map, rollback procedure, resumption fidelity fixture, and byte-identical copies of every legacy operating record. |
| `SESSIONS/` | Closed logical sessions. Empty — none has been closed. |

## Rules

- Archived copies are **immutable**. If an archived record was wrong, record the correction as a
  new `LEDGER.jsonl` event that references it. Do not retouch history.
- A record is archived, not deleted, when it is superseded.
- Nothing in the archive governs the repository. `AI_DEVELOPMENT/PROTOCOL.md` does.
