# START HERE

Boot loader for every Claude Code run in this repository. Protocol version
**2.2 (Adaptive Edition with Enforced Floor)**.

## Canonical files

| What | Where |
|---|---|
| Active machine state (authority for continuation) | `AI_DEVELOPMENT/STATE.yaml` |
| Full protocol, including the floor in full | `AI_DEVELOPMENT/PROTOCOL.md` |
| Work graph: task ids, dependencies, acceptance trace | `AI_DEVELOPMENT/PROJECT_STATE.json` |
| Human-readable product state | `docs/STATE.md` |
| Product requirements | `docs/directive.md` |
| Approved design, product risk, implementation defects | `docs/bible.md` |
| Gate A–D completion conditions | `docs/DONE.md` |
| Independent reviews | `docs/reviews/` |
| Decisions / failures / evidence | `AI_DEVELOPMENT/DECISIONS.md`, `FAILURES.md`, `EVIDENCE/` |
| On-demand modules (Layer 3 — load only when a trigger fires) | `AI_DEVELOPMENT/MODULES/` |

## Authority order

1. The user's latest explicit instruction
2. The mandatory floor (Section 0 of `PROTOCOL.md`)
3. Active requirements, constraints and project policies
4. Verified repository, file, runtime, deployment and test reality
5. Accepted decisions not yet superseded
6. The active plan / work graph
7. Proposals, assumptions, hypotheses, unverified claims

Repeating an assumption never makes it a fact. `README.md` is not evidence of
design — it is an implementer's self-report and has been wrong before.

## The floor — triggers, compressed

Uncertain whether a trigger fired? It fired. Perform the obligation.

- **F1 continuity read** — about to inspect, change, verify or deliver anything → read this file and the active part of `STATE.yaml`, then verify the parts relevant to the next action against real project state. Not satisfied by chat history or memory of a previous run.
- **F2 continuity write** — the run changed the project, or is ending with the objective open → update `STATE.yaml`: objective status, last verified checkpoint, modified-but-unverified, blockers, recovery, remote state, exact next action. Reserve capacity for this; it outranks starting more implementation.
- **F3 execution verification** — code, config, data, schema, assets or build settings changed and execution is possible → actually run it and inspect the real result. Generation, reading the source, or an unrun test is not verification. If execution is impossible, record `prepared_not_executed` and keep it open.
- **F4 status honesty** — any status recorded or stated → use only: `complete_verified`, `complete_unverified`, `prepared_not_applied`, `prepared_not_executed`, `blocked`, `inconclusive`, `failed`, `rejected`, `rolled_back`, `superseded`. Prose must never upgrade the recorded status.
- **F5 falsification** — about to mark an objective complete, or doing STRICT work → run at least a Level C deliberate falsification pass and record the level used. Level A/B for STRICT when the environment allows. Level D alone never completes an objective.
- **F6 real-surface verification** — a merge, release, deployment or publication changed what a user receives → afterwards, verify on the real public surface that the intended revision is served, the primary journey works, and nothing blocks at runtime. Record the verified revision. A green deploy job is not evidence.
- **F7 acceptance mapping** — marking an objective complete → record, per acceptance criterion, whether it is satisfied and the specific evidence.
- **F8 skip accounting** — a trigger plausibly applied and you judged it did not fire, or an obligation was impossible → one line in `STATE.yaml` under `floor.skips`.
- **F9 deterministic enforcement** — the environment can fail or block an operation independently of your report, and the objective involves repeated implementation or delivery → install the smallest mechanism that actually fails for F2, F3, F5 and F6, and record which are truly active. A gate never observed failing is `prepared_not_executed`, not active.

End every run that touched the project with the one-line floor check, e.g.

    Floor: F1 ok | F2 ok | F3 executed (node+chromium) | F4 ok | F5 C | F6 n/a | F7 n/a | F8 1 skip | F9 gates: none active

## Enforcement status

**No F9 gate is active yet.** F2, F3, F5 and F6 are self-reported only, so work
whose only independent evidence would have been a gate is `complete_unverified`.
The live status is the `floor.enforcement` block in `STATE.yaml` — read it there
rather than trusting this line.

`unattended_allowed: false`. `.github/workflows/autopilot.yml` is a
self-restarting chain that merges its own pull request to `main` and triggers a
public deploy. It is dormant and must not be dispatched until the four gates are
active. `docs/STOP` is its own designed brake.

## Resume procedure

1. Read this file and the active part of `AI_DEVELOPMENT/STATE.yaml`.
2. Load only the protocol detail, module files and records the next action needs.
3. Inspect the real files, git state, runtime and remote state that action touches.
4. Compare the record against reality and correct any material discrepancy.
5. Health-check proportionate to the selected rigor.
6. Resume from `execution.exact_next_action`.

Do not re-read the whole archive, module library or evidence history every run.
Do not repeat verified work, and do not retry a rejected approach without
recording what changed.

When `floor.enforcement` claims a gate is active, confirm the mechanism still
exists before relying on it. A deleted or never-merged gate is absent.
