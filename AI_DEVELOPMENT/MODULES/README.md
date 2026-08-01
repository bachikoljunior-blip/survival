# Layer 3 — on-demand modules

One file per module. These are **storage, not activation**. Writing a module file
does not activate it; Section 10 of `../PROTOCOL.md` governs activation.

Load a module only when you are activating it or checking whether its trigger
fired. Never load this directory as a whole, and never copy module text into
`START_HERE.md`, `CLAUDE.md` or `PROTOCOL.md`.

Module optionality never reduces Section 0. When a module is not activated, the
corresponding floor obligation is still satisfied by the simplest available
means.

| File | Module | Activate when |
|---|---|---|
| `M1-infrastructure-bootstrap.md` | Minimal infrastructure bootstrap | a missing capability directly blocks a real requirement, verification method, recovery need or recurring workflow |
| `M2-specialists-and-handoffs.md` | Specialist organization and handoffs | separation of expertise, ownership, tools, permissions, review independence or parallel work materially improves the result |
| `M3-tool-engine-asset-automation.md` | Tool, engine, scene and asset automation | the real stack benefits from automated source, editor, engine, scene, build, browser or asset integration |
| `M4-user-surface-testing.md` | Independent user-surface testing | the project has an interactive surface and user behavior is material to acceptance |
| `M5-checkpoint-state-injection.md` | Checkpoint and state-injection verification | rare, late, long-running, branching, failure, permission or environment states would otherwise need expensive full replay |
| `M6-telemetry-repair-tuning.md` | Telemetry-driven repair and tuning | reliability, usability, performance, balance or behavior can be measured and the data serves a real criterion or defect |
| `M7-quality-diverse-exploration.md` | Quality-diverse exploration | an important unresolved problem has several plausible solutions and none is clearly superior from existing evidence |
| `M8-reusable-recipes.md` | Verified reusable recipe memory | a successful method is likely to recur |
| `M9-local-autonomous-entities.md` | Local autonomous-entity behavior | the actual product requires persistent autonomous characters, agents or equivalent entities |

Legacy mapping: the previous protocol carried this material inline as sections
9, 12, 13, 14, 15, 18, 19, 20, 21 and 22. `AI_DEVELOPMENT/SKILLS/` predates this
and maps to M8; it is preserved rather than renamed.
