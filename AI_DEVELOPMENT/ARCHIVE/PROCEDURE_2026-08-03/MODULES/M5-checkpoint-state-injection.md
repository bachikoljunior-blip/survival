# M.5 Checkpoint and state-injection verification

## Trigger

Rare, late, long-running, branching, failure, permission, or environment states
would otherwise require expensive full replay.

## Content

Possible mechanisms include fixtures, save states, snapshots, progress setters,
virtual time, deterministic random seeds, simulated failures, offline modes,
network conditions, object spawning, and controlled environment states.

Test-only state controls must be isolated from production, deterministic,
documented where needed, protected from unauthorized access, and unreachable in
release behavior.

Verify important paths through representative normal flow as well as injection.

Do not use injection to conceal broken initialization, progression, transitions,
or save and load behavior.

## Stop condition

Deactivate when the target states are reachable in test and the normal flow has
also been exercised.

## Project note

`tools/fixtures/save-v1.json` is a real captured save used as a migration
fixture. Fixtures for a future format change must be captured **before** that
change lands (decision OD-006).
