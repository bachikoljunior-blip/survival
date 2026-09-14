# Retired procedure documents — 2026-08-03

Removed from force by user instruction. Kept as the origin record for decisions made
under them; **not** in force, and finding a rule here is not grounds to reinstate it.

| File | What it was |
|---|---|
| `AI_DEVELOPMENT/PROTOCOL.md` | 860 lines: the nine-item mandatory floor, adaptive rigor, lifecycles, planning, review, gates, completion |
| `PROJECT_OPERATING_PROTOCOL.md` | the legacy 32-section protocol it superseded |
| `START_HERE.md` | boot loader: reading order, compressed floor, resume procedure |
| `MODULES/` | on-demand procedure modules |

What governs now is the block at the head of `CLAUDE.md`: the goal, how elements and their
references are derived, how a blind comparison decides an element, and what a unit of work is.
**Everything else about method is the worker's own.**

Two things did **not** go with them.

- The working rules in `CLAUDE.md` that predate the protocol — investigate before editing,
  do not stop at a plan, never fabricate an asset or a completion claim, keep the game
  runnable, evidence outranks self-assessment. Those came from what went wrong here.
- The gates. `tools/gates/` and `.github/workflows/gates.yml` are machine checks, not
  procedure, and `STATE.yaml`'s `floor.enforcement` block still records which are active.
