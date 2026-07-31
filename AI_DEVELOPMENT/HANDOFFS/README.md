# Handoff schema

Every checkpoint or final handoff is a JSON or Markdown record containing:

- `schema_version`
- `handoff_id`, `kind` (`checkpoint` or `final`), `session_id`
- producer and intended consumer
- objective and task IDs
- verified baseline / rollback point
- input and output artifacts
- affected files and interfaces
- invariants, dependencies and assumptions
- acceptance criteria and tests required
- commands actually run and exact results
- evidence IDs and paths
- failures, findings, risks and unresolved questions
- completion status
- next ready tasks and exact resume instruction

A final handoff additionally requires `end_declared_by_user: true` and a valid `SESSION_ARCHIVE/` reference. A turn-ending checkpoint must never set those fields.

For `GB-IMP06`, a claim of real-route coverage is valid only when the evidence shows:

1. Player position changes through the game's movement/input and collision path; `placeAt`, raw position writes and teleport helpers are prohibited after route setup.
2. `player.gasImmune` remains false, gas exposure is sampled, and the route proves a survival consequence or recovery without state injection.
3. Hostile HP changes through a player attack action and the normal combat hit path; direct `damage()`, kill event emission and hostile removal are prohibited.
4. The test reports distance, simulated duration, exposure range, damage exchanged and exact covered route.
5. A complete opening-to-ending claim additionally uses real movement for every traversal. A representative slice must be labelled partial and cannot satisfy C1/D3.
