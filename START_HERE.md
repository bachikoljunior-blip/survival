# START HERE

Boot loader for the CINDERLINE persistent development system. Protocol version **2.0.0**.
Read this first, every run. It is deliberately short enough to reload every time.

## 1. Canonical files

| File | What it is |
|---|---|
| `AI_DEVELOPMENT/STATE.yaml` | **Current state.** Project, logical session, objective, run, active task, last verified checkpoint, blocker, rollback point, exact next action. |
| `AI_DEVELOPMENT/WORK_GRAPH.yaml` | The single work hierarchy, dependencies and task contracts. |
| `AI_DEVELOPMENT/REQUIREMENTS.yaml` | Requirement and acceptance-criterion identifiers, status, verification method, traceability. |
| `AI_DEVELOPMENT/POLICIES.yaml` | What may and may not be done outside the repository. |
| `AI_DEVELOPMENT/CAPABILITIES.yaml` | What the previous run actually observed. Re-probe; do not trust it. |
| `AI_DEVELOPMENT/PROTOCOL.md` | The durable rules. Read when you need the rule behind a step. |
| `AI_DEVELOPMENT/LEDGER.jsonl` | Append-only history. Query it; do not read it end to end. |
| `AI_DEVELOPMENT/SCHEMAS/` | Versioned schemas, enforced by `npm run validate:ops`. |
| `AI_DEVELOPMENT/DECISIONS.md` · `FAILURES.md` | Concise active decisions and failures, with their reusable rules. |
| `AI_DEVELOPMENT/EVIDENCE/` · `HANDOFFS/` · `RECIPES/` · `ARCHIVE/` | Evidence, handoffs, verified procedures, history. |

**Product truth is not in this system.** It lives in `docs/directive.md` (requirements),
`docs/bible.md` (approved design and defects), `docs/DONE.md` (Gate A–D wording),
`docs/STATE.md` (human-readable position) and `docs/reviews/` (independent findings).
`README.md` is **not** admissible as design evidence — it has been wrong before.

## 2. Minimal resume set

To resume, read only these five things:

1. This file.
2. `AI_DEVELOPMENT/STATE.yaml`.
3. The `WORK_GRAPH.yaml` node named by `STATE.yaml.active_task`, and its contract.
4. The criteria in `REQUIREMENTS.yaml` referenced by that node.
5. `AI_DEVELOPMENT/POLICIES.yaml`.

Everything else is loaded on demand. Do not read the archive to start work.

## 3. Resume procedure

```sh
npm ci                  # first run in a fresh container; see RECIPES/npm-writable-cache.md if it fails
npm run validate:ops    # self-test → record/schema/graph/frontier/ledger validation → resume check
git status --porcelain && git log --oneline -5
```

`validate:ops` runs three things in order, and each is meant to fail loudly:
`tools/yaml_selftest.mjs` (the validator's own 50 tests, half of them expected-failure fixtures),
`tools/check_operating_state.mjs`, then `tools/resume_check.mjs`.

Then:

1. Compare `STATE.yaml` against the real worktree, branch, HEAD, remote and open pull requests.
   Another actor commits here — the user, and `.github/workflows/autopilot.yml`.
2. Resolve any discrepancy in favour of verified reality, and record the correction.
3. Re-probe capabilities and rewrite `CAPABILITIES.yaml` for this run.
4. Run a proportionate health check for the active task.
5. Resume from `STATE.yaml.last_verified_checkpoint`. Do not repeat verified work.
6. Follow the controller in `PROTOCOL.md` section 7.

## 4. Conflict order

1. The user's latest explicit instruction.
2. Active requirements, constraints and policies.
3. Verified repository, runtime and test reality.
4. Accepted decisions not yet superseded.
5. The work graph and task contracts.
6. Proposals, hypotheses and assumptions.

Verified reality beats any record. A record beats any recollection.

## 5. Rules that are violated most often

- **The logical session ends only when the user says so.** Not on a new chat, a context reset, a
  commit, a merge, a deployment or a completed objective.
- **An unexecuted check is never recorded as passed.** The statuses are `passed`, `failed`,
  `blocked`, `not_applicable`, `prepared_not_executed`, `inconclusive`.
- **Never claim an action you did not perform and inspect.**
- **No physical-device performance claim.** No device exists (blocker `B1`).
- **Never modify `.github/workflows/autopilot.yml`.**
- **The Pages root mirror is generated** — `npm run build:pages-root`, never hand-edited.
- The frontier in `STATE.yaml` is a cache derived from `WORK_GRAPH.yaml`, not a second authority.

## 6. If the records look wrong

Missing or damaged records are reconstructed from repository state, artifacts and evidence, and
every reconstructed claim is marked with its confidence. If `npm run validate:ops` fails, fix the
records before doing product work — a validator that is failing for a known reason stops protecting
anything.

Rollback for the operating system itself:
`AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/ROLLBACK.md`.
