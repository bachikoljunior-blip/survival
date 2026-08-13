# Project-local skills index

The method — screen, candidate, evaluate, adopt, revert, promote — lives in the
`adaptive-skill-evolution` skill and the commands in `.kit/tools/skill.mjs`. It replaces the
prose bar in `MODULES/M8-reusable-recipes.md`, which asked for the same discipline without a
predicate anything could fail. M8 remains the trigger; this is the check.

```
LEDGER.json            adopted skills: tier, revision, sha256, prior sha256, provenance
candidates/<id>/       CANDIDATE.json · SKILL.md · check.mjs · RESULT.json
history/<name>@<n>/    the bytes each adoption replaced
OVERLAYS/<skill>.md    a project-local addition to a shared skill, read by that skill
```

Nothing is registered here yet, and that is the expected state for most rounds.

Two of this repository's records are already carrying a shared skill: `F-006`-style vacuous
passes and the 2026-08-01 dead-reviewer record together produced `probe` r1 in the kit — a
scan's null result counts only when the scan has shown it can detect the thing, across every
layer its verdict speaks for. The mutation harness that ran `--unit` only, while its verdict
spoke for the UI layer too, is the case that half of it rests on.
