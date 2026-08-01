# Operating protocol

Protocol version **2.0.0** (canonical), installed 2026-08-01 by migration from the legacy
`PROJECT_OPERATING_PROTOCOL.md` (version 1.x). This file holds the durable, always-on rules.
It contains no project status: current state lives in `STATE.yaml`, work in `WORK_GRAPH.yaml`,
history in `LEDGER.jsonl`.

The boot loader is `START_HERE.md`. Read that first; read this when you need the rule behind a
step, and when a conflict has to be resolved.

Superseded record: `ARCHIVE/MIGRATION-2026-08-01/legacy/PROJECT_OPERATING_PROTOCOL.md`.
Nothing in that file governs the repository any more, but it remains readable because decisions
recorded elsewhere cite its section numbers.

---

## 1. Authority and conflict resolution

Conflicts resolve in this order, highest first:

1. The user's latest explicit instruction.
2. Active requirements, constraints and explicit project policies.
3. Verified repository, file, environment, runtime, deployment and test reality.
4. Accepted decisions that have not been superseded.
5. The active work graph and task contracts.
6. Proposals, hypotheses and assumptions.

An old prompt, a prior agent statement, a stale plan, a generated suggestion or a repeated
assumption never outranks verified reality or a newer user instruction. **Repeating an assumption
does not turn it into a fact.**

When instructions, records and reality disagree: inspect the evidence, follow the highest-authority
source, record the conflict and the statement it replaced, update the affected requirements,
criteria, decisions, tasks and risks, preserve still-valid completed work, and archive the obsolete
record instead of erasing it.

Do not silently broaden scope, silently weaken a requirement, or promote an implementation proposal
into a product requirement. Do not delete or rewrite user-authored work without a concrete project
reason.

### Epistemic status

Every significant record carries one of: `user_requirement`, `verified_fact`, `accepted_decision`,
`proposal`, `assumption`, `hypothesis`, `generated_suggestion`, `unverified_claim`.

This project has already been burned by the failure this vocabulary prevents. `README.md` claimed
the air gauge was tappable; the claim was copied into the design bible; the implementation
(`src/ui/hud.js:78-84`) explicitly refuses the tap. An independent audit caught it. Hence the
standing rule in `docs/STATE.md` section 6: **`README.md` is not admissible as design evidence.**

### Product authorities

The operating system does not own product truth. These files do:

| Subject | Authority |
|---|---|
| Product requirements and constraints | `docs/directive.md` |
| Approved design, product risk, implementation defects | `docs/bible.md` |
| Gate A–D completion wording | `docs/DONE.md` |
| Human-readable verified position | `docs/STATE.md` |
| Independent review findings | `docs/reviews/` |

`REQUIREMENTS.yaml` carries identifiers, epistemic status, verification method and traceability
that point *at* those files. It must never restate, summarise or weaken their authored text.

---

## 2. Distinct lifecycles

Five things are tracked separately, because collapsing any two of them loses information:

- **Project** — the whole body of work and its long-term state.
- **Logical session** — a user-controlled continuity boundary. It spans conversations, devices,
  context resets and runs.
- **Current objective** — the concrete outcome being pursued now. It can complete, pause or be
  superseded without ending the logical session.
- **Claude Code run** — one execution opportunity with a particular worktree, context, tools,
  permissions and GitHub state.
- **Iteration** — one bounded change-and-verification cycle.

**A logical session ends only when the user explicitly says it is finished.** It is not ended by a
new chat, an app closing, a device change, a context compression, a usage limit, a tool failure,
elapsed time, an objective completing, a short acknowledgement, a commit, a pull request, a merge,
a deployment, or a topic detour. `STATE.yaml.logical_session.end_declared_by_user` may only become
`true` on an explicit user declaration; the validator refuses an `active` session that sets it.

When an objective is satisfied, mark the objective complete and select or await the next one. Keep
the session active.

When the user does end a session: reconcile records against reality; record completed, partial,
blocked, deferred and rejected work; record changed artifacts, checks, evidence, risks, failures
and rollback points; record the exact recommended continuation point; archive the session under
`ARCHIVE/SESSIONS/`; mark only that session inactive.

Project completion is separate. Declare it only when the user does, or when every agreed
project-level completion condition is objectively satisfied. For this project those conditions are
the `ALL_DONE` list in `docs/DONE.md`, and writing `ALL_DONE` without satisfying all four is
treated as a fabrication violation.

Never claim work will continue after the current run unless a real, authorized, verified scheduled
process was actually created.

---

## 3. Run discipline and capabilities

Do not assume the current directory is the Git root, that the checkout is clean, that `origin` is
correct, that GitHub authentication permits writes, or that any permission exists because the
repository is connected.

At the start of every run, probe what actually exists — repository root, worktree, branch, status,
remotes, concurrent changes; loader and rules files; artifacts from earlier runs; package managers,
runtimes and installed dependencies; shell, file, network and browser access; subagents, skills,
hooks and scheduled processes that are genuinely enabled; GitHub authentication and each specific
permission; CI, branch protection, environments and deployment configuration.

Record the result in `CAPABILITIES.yaml` with the run id, observation time, evidence and
limitations. Re-probe every run. Within one run, do not repeatedly retry a capability already
confirmed unavailable unless new evidence shows it changed.

Use Claude Code-native mechanisms only where they earn their place: keep `CLAUDE.md` a short
loader; use `.claude/rules/` only for genuinely path-scoped rules; promote a procedure to
`.claude/skills/` only when native invocation helps; add `.claude/agents/` only for useful
specialist separation; use hooks only where a rule must be enforced mechanically. Never rely on
auto memory as the sole canonical state. Do not modify user-level or organization-level Claude Code
configuration.

**Never claim to have edited, executed, installed, opened, tested, captured, committed, pushed,
merged, deployed, published or verified anything unless the action completed and its result was
inspected.** When direct action is unavailable: continue every unblocked part of the objective,
prepare complete files, patches, commands and tests, label them accurately as
applied/unapplied and executed/unexecuted and verified/unverified, and preserve the exact
continuation point.

Never place secrets in project files, memory, logs, screenshots, prompts, reports, artifacts or
evidence.

---

## 4. Canonical records

| File | Holds |
|---|---|
| `CLAUDE.md` (repo root) | Short always-loaded boot instruction. Not the protocol. |
| `START_HERE.md` | Boot loader: protocol version, canonical files, minimal resume set, conflict order, resume procedure. |
| `AI_DEVELOPMENT/PROTOCOL.md` | This file. Durable invariants. |
| `AI_DEVELOPMENT/STATE.yaml` | Canonical current state, all five lifecycles kept distinct. |
| `AI_DEVELOPMENT/REQUIREMENTS.yaml` | Requirements and acceptance criteria with identifiers and traceability. |
| `AI_DEVELOPMENT/WORK_GRAPH.yaml` | The single hierarchy and dependency graph, with task contracts. |
| `AI_DEVELOPMENT/CAPABILITIES.yaml` | Per-run verified capabilities, limitations and confidence. |
| `AI_DEVELOPMENT/POLICIES.yaml` | Permissions and prohibitions for external action. |
| `AI_DEVELOPMENT/LEDGER.jsonl` | Append-only events: checkpoints, decisions, changes, failures, gates, evidence, repairs, releases, reviews, sessions. |
| `AI_DEVELOPMENT/SCHEMAS/` | Versioned schemas, applied by `npm run validate:ops`. |
| `AI_DEVELOPMENT/RECIPES/` | Verified reusable procedures with applicability tests and failure modes. |
| `AI_DEVELOPMENT/EVIDENCE/` | Task- and criterion-linked evidence artifacts. |
| `AI_DEVELOPMENT/ARCHIVE/` | Superseded records, closed sessions, historical detail. |
| `AI_DEVELOPMENT/DECISIONS.md` | Concise active operational decisions. Each also exists as a ledger event. |
| `AI_DEVELOPMENT/FAILURES.md` | Concise active failure records and their reusable rules. Each also exists as a ledger event. |

The **active frontier is derived**, not authored: it is the set of `ready`/`active` leaves whose
every dependency is `verified`. `STATE.yaml.derived_frontier` caches it for speed and the validator
recomputes and compares, so the cache can never quietly become a second authority.

Keep active records small enough to reload every run. Move history to `ARCHIVE/`.

Everything committed is treated as publicly readable. Continuity information that is not
appropriate for the repository is sanitized to a pointer; repository visibility is never changed to
solve that problem.

---

## 5. Record contracts

Validate before use. Repair or reject a malformed, incomplete, contradictory or stale record rather
than silently compensating for it. The schemas in `SCHEMAS/` are the enforced form of this section;
`npm run validate:ops` is the enforcement.

A material change to an acceptance criterion needs the user's approval and must preserve the
original, the proposed replacement, the reason and the impact. **A criterion is never weakened
because it is hard to implement or hard to test.**

Every active leaf carries a contract: objective, allowed scope, prohibited changes, affected
systems, inputs and outputs, assumptions and risks, acceptance criteria, mandatory gates, evidence
requirements, active conditional modules with their activation reason and exit condition, owner,
rollback method, and completion conditions.

Work-node status vocabulary: `proposed`, `accepted`, `ready`, `active`, `blocked`,
`awaiting_verification`, `under_review`, `verified`, `partial_verified`, `rejected`, `deferred`,
`superseded`, `archived`.

Gate status vocabulary: `passed`, `failed`, `blocked`, `not_applicable`, `prepared_not_executed`,
`inconclusive`. **There is no value that records an unexecuted check as a pass.**

Independence levels, which must be named accurately and never inflated:

- **A** — source-blind: separate context or tester, runnable surface, no source access.
- **B** — source-restricted: fresh or isolated context given only the minimum relevant evidence.
- **C** — separate pass: same agent, deliberate falsification pass, shared prior context.
- **D** — prepared only: review or test artifacts exist but were not executed.

C and D are never described as source-blind or fully independent.

---

## 6. Boot, resume, reconcile

1. Read `START_HERE.md`, then this file when a rule is needed.
2. Read `STATE.yaml`, the active objective and its criteria, `POLICIES.yaml`, and the derived
   frontier.
3. Load only the decisions, failures, recipes, schemas and evidence relevant to the active
   objective or to a discrepancy.
4. Inspect the real files, repository state, runtime state and capabilities.
5. Compare recorded state against verified reality, including changes made by another actor —
   the autopilot workflow and the user both commit to this repository.
6. Resolve discrepancies in favour of the higher-authority verified source.
7. Correct the records, marking anything reconstructed and its confidence.
8. Run a proportionate health check.
9. Resume from the last verified checkpoint without repeating verified work.

Do not reread the whole archive every run. A full audit is for migration, discrepancy
investigation, corruption, a major release, or records that turn out to be insufficient.

Do not retry a rejected approach unless the user asks, constraints changed, new evidence justifies
it, or the rejection rested on a false assumption — and record what changed first.

If records are missing or damaged, reconstruct from repository state, artifacts and evidence, and
mark every reconstructed claim with its confidence.

---

## 7. The controller

Every meaningful iteration runs this loop:

1. **RECONCILE** — load minimal active state, verify against reality.
2. **SELECT** — take the highest-value eligible leaf from the graph.
3. **CONTRACT** — confirm bounded scope, testable criteria, dependencies, rollback, evidence,
   module activation.
4. **PREPARE** — establish a baseline and a recoverable checkpoint before risky work. Build only
   infrastructure that is immediately justified.
5. **EXECUTE** — the smallest complete, isolated, reviewable change.
6. **VERIFY** — run the applicable deterministic gates.
7. **REVIEW** — an appropriately independent attempt to falsify the result; interact with the real
   user surface where one applies and is reachable.
8. **REPAIR OR ROLLBACK** — repair project-controlled failures and retest; roll back regressions or
   unsafe incomplete changes when repair cannot be completed safely.
9. **CHECKPOINT** — persist evidence, ledger event, graph status, state, next action and rollback
   information as one coherent unit.
10. **DELIVER** — when the objective requires it, policy authorizes it, capability exists and
    mandatory gates pass, execute remote delivery (section 12).
11. **CONTINUE** — next eligible task, or an unblocked branch, or report a genuine external blocker.

Checkpoint discipline is transactional: stage the result and evidence, run the required gates,
create a checkpoint record with a unique id, append the immutable ledger event, update
`WORK_GRAPH.yaml` and `STATE.yaml` to reference that checkpoint, replace files atomically where
supported. On interruption, recover from the last internally consistent checkpoint.

An investigation, a rejected experiment or a rollback can be a successful iteration if it produces
verified knowledge, reduces uncertainty and leaves a safe recoverable state. Not every iteration
must improve every quality dimension.

**A task is not `verified` before its required evidence exists.**

---

## 8. The work graph and what to do next

Derive the graph only from real objectives, user requirements, verified materials, constraints,
accepted decisions and acceptance criteria. Decompose active work until a leaf can be assigned
clearly, completed in a bounded iteration, verified independently where practical, integrated
safely, and rolled back.

Before activating a leaf, confirm: dependencies and inputs exist; criteria are testable; scope is
small enough; concurrent work does not overlap unsafely; it advances a real requirement; its
verification and rollback are feasible.

When the user changes a branch of the plan, that change is authoritative: identify affected
descendants, dependencies, criteria and handoffs; preserve valid completed work; reclassify,
supersede, archive, split, merge or reopen the affected nodes; recompute frontier, priorities and
risks; continue without an unnecessary restart.

Priority classes, in order:

1. **P0** — safety and integrity: active data loss, secret exposure, security defect, corrupt
   release, public outage.
2. **P1** — blocking correctness: broken build, critical regression, unrecoverable state, a
   dependency blocking mandatory work.
3. **P2** — critical-path requirement: the smallest task that satisfies or unlocks a required
   acceptance criterion.
4. **P3** — enabling foundation: infrastructure or measurement that directly unlocks mandatory
   implementation or verification.
5. **P4** — quality: maintainability, accessibility, compatibility, performance, resilience,
   meaningful polish.
6. **P5** — exploration: optional improvements and experiments.

Within the highest applicable class, compare on objective contribution and user-visible value,
dependencies unblocked, risk and uncertainty reduced, criteria and regression protection gained,
evidence produced, implementation and verification cost, reversibility, urgency and maintenance
impact. **Choose the smallest independently verifiable task with the highest defensible value.**

Do not repeatedly pick easy cosmetic work while structural risk remains. Do not rewrite a working
system without evidence of material value.

Parallelize only genuinely independent work, with non-overlapping write scopes, isolated shared
state and one named integration owner. This project already assigns subsystem ownership in
`docs/STATE.md` section 6; respect it. Otherwise work sequentially.

---

## 9. Acceptance, evidence, review, completion

Translate vague words — good, polished, intuitive, realistic, fun, professional, optimized,
stable — into observable behavior, measurable thresholds, repeatable comparisons, supported-environment
checks, or an explicit expert-review standard.

Maintain the trace:

```
requirement → criterion → work node → decision → changed artifact → test/checkpoint → evidence → result
```

Gate layers, used where practical: schema and configuration validation; formatting and linting;
static analysis; type checking or compilation; unit; integration; checkpoint and state-injection;
end-to-end user flows; source-restricted user-surface tests; exploratory; performance and stress;
clean setup, clean build and release verification.

Run fast targeted checks during implementation; run broader gates at integration and release
boundaries. A successful generation, compilation, build, startup, screenshot, prototype or single
passing test is **not** feature completion.

A failed mandatory gate blocks acceptance. Repair the implementation unless reproducible evidence
shows the gate itself is wrong. **Never weaken a valid gate to make defective work pass.**

Implementation does not approve itself. Use the strongest available independence and record its
level honestly (section 5). A reviewer looks for false assumptions, unhandled states, regressions,
lifecycle errors, races, corruption, data loss, migration problems, interface mismatches,
accessibility, security, performance, maintainability, misleading tests, hidden coupling and
incomplete recovery. Each finding carries severity, affected requirement, evidence, reproduction,
likely cause, repair direction and required retest. Unresolved blocking or high-severity findings
prevent completion — which is exactly why `node tools/check_reviews.mjs --gate B` currently fails
and why `GB-H1` and `GB-H2` are the frontier.

A task is complete only when its criteria, mandatory gates, integration, applicable user-surface
behavior, recovery behavior, documentation, state and evidence are all verified. An objective is
complete only when all its criteria are verified and no blocking finding remains. A release
additionally requires clean setup and build, release configuration, the primary journey, supported
environments, performance, stability, licensing, absence of development-only controls, verification
of the deployed revision, and rollback information.

State remaining uncertainty in proportion to the evidence.

---

## 10. Conditional modules

Always active: the controller, the truth rules, persistent state, the work graph, acceptance
criteria, checkpointing and evidence discipline.

Everything below is conditional. Activate a module only when its trigger is met by the actual
project, and record in the task contract the activation reason, entry condition, expected value,
budget, exit condition and evidence. Deactivate when its purpose is satisfied. **Do not build
machinery merely because a module exists.**

**10.1 Minimal infrastructure bootstrap** — when a missing tool, harness, schema, test system,
state controller, recovery mechanism or measurement directly blocks a real requirement or its
verification. Every infrastructure item must cite a concrete requirement, criterion, recurring
workflow, risk, recovery need or known failure mode. Prefer the smallest reliable foundation, and
validate the infrastructure itself including its failure detection — a check that cannot fail
proves nothing. Define a budget and stop condition before starting; stop when the capability exists
and passes its smoke check, a simpler substitute suffices, marginal value drops below the next
critical-path task, repeated failure reveals a false assumption, or an external blocker prevents
progress.

**10.2 Specialist organization and typed handoffs** — when separation of expertise, context, tools,
permissions, implementation ownership, review independence or parallelism materially improves the
outcome. Use the fewest useful roles, each with a validated contract and structured handoff.
Specialists may not invent requirements. A defective upstream contract goes back upstream; a
downstream role never silently invents the missing part. Where true separation is unavailable, use
separate artifacts, restricted review packages or explicit sequential passes — and record the
reduced independence rather than claiming equivalence.

**10.3 Tool, engine, scene and asset automation** — when the verified stack requires automated
source, editor, engine, scene, build or asset integration. Detect actual versions before designing
adapters; use real documentation, installed types or isolated execution rather than inventing APIs.
Maintain an asset manifest where external assets exist — this project currently has **zero**
external assets, and `docs/assets.md` is the ledger that says so. Generated code is not integrated
until the real project builds, loads, runs and behaves correctly.

**10.4 Independent user-surface testing** — when the product has an interactive surface, which this
one does. Validate through actual user-visible interaction using the same surface and controls the
user has. A source-blind tester receives only the runnable artifact, the controls, the objective
and the observable criteria — never source, internal design or the implementer's explanation. Test
normal use, invalid use, edge cases, interruption, recovery, repetition, rapid and simultaneous
input, long duration, small screens, touch, orientation, degraded conditions, and loading and
failure states. Record initial state, exact actions, expected and observed results, environment,
timestamps, evidence, reproducibility and severity; repeat the same test after repair and keep both
sides of the comparison. **Static screenshot review is not interaction testing.** If execution is
impossible, prepare the harness and record `prepared_not_executed` at independence level D.

**10.5 Checkpoint and state-injection verification** — when late-stage, long-running, branching,
failure, permission, environment or rare states would otherwise need expensive full replay. Define
starting state, injected state and its reachability, required actions, expected visible and
internal results, cleanup and evidence. State controls must be isolated to development and test
builds, deterministic, tested, and unreachable in production. Verify important checkpoints both by
injection and through representative normal flow, so injection cannot hide broken initialization,
progression, transitions or save/load. This project has a live instance of the risk: the legacy
`tools/playthrough.mjs` teleports the player, makes them gas-immune and applies damage directly, so
it proves narrative-graph reachability and nothing about traversal, survival or combat — recorded
as `IMP-06` and as the limitation on acceptance row 2.

**10.6 Telemetry-driven repair and balancing** — when behavior, reliability, performance, usability
or balance can be measured and a real criterion benefits from data. Local and privacy-preserving
only; no remote analytics and no user-data transmission without explicit approval. Each experiment
records baseline and environment, target and hypothesis, one changed variable or a small related
group, enough controlled trials to beat noise, primary and secondary effects, keep-or-roll-back, and
the result. Do not overfit to one tester, seed, scenario or metric.

**10.7 Quality-diverse exploration** — when an important unresolved problem has several plausible
solutions, no clearly superior verified answer, and exploration value that justifies its cost.
Define real diversity dimensions, build materially different candidates in isolation, record each
candidate's lineage, changed variables, hypothesis, trade-offs, cost, result and retain/reject
reason, and keep a diverse shortlist rather than only an aggregate winner. Simulator success is not
proof of visual quality, interaction feel, integration or device performance. Stop at the budget,
at a sufficiently superior candidate, when all candidates fail, or when further exploration is worth
less than critical-path work.

**10.8 Verified reusable recipe memory** — when a successful implementation, test, migration,
diagnosis, repair, optimization or recovery method is likely to recur. Store a recipe only after it
has supporting verification; prefer executable scripts to prose. Each carries name, purpose,
version, applicability and non-applicability, inputs and outputs, dependencies, exact usage,
verification test and evidence, limitations and failure modes, an example, and the last verified
revision. Confirm applicability before reuse. Record failed, misleading, obsolete or dangerous
patterns separately, with the conditions that would justify reconsidering them, and deprecate
invalid recipes so they are not rediscovered.

**10.9 Local autonomous-entity behavior** — only when the product genuinely requires persistent
autonomous characters or agents. Default shipped behavior is local and deterministic: state
machines, behavior trees, utility systems, planning, schedules, influence maps, weighted rules,
dialogue graphs, deterministic templates. A deterministic authority layer protects canon, mandatory
events, secrets and disclosure conditions, progression, role and location restrictions, impossible
actions and resource limits. External or local language models may be used only when practical,
licensed, explicitly allowed, within performance limits, and optional or backed by a deterministic
fallback. Persist entity state through the real save system; support deterministic seeds; test
memory persistence and decay, relationships, conflicting goals, interrupted plans, save/reload,
replay, invalid-action prevention, protected facts, long simulation and the maximum expected entity
count.

---

## 11. Local-first product policy

The shipped product does not depend on an additional external AI API, paid inference service,
hosted agent or third-party cloud service without the user's explicit authorization. Prefer, in
order: existing project capabilities; deterministic local or bundled code; compatible open-source
libraries; rule-based or algorithmic systems; practical local models; explicitly authorized external
services.

Core functionality stays usable when optional services are unavailable. Do not request an API key
merely because it would make implementation easier.

This is already the shipped reality and must not regress: one runtime dependency (`three@0.180.0`),
zero external assets, zero network requests. Before adding any dependency, verify source, license,
version, attribution, compatibility, maintenance and security, and record it in `docs/assets.md`
and `THIRD-PARTY.md`. If installation is unavailable, prepare the integration but do not claim it
was installed.

---

## 12. Controlled change, testing, recovery and remote delivery

Prefer small, isolated, reviewable changes. Before changing an existing interface, identify
consumers, invariants, migration needs, tests, failure behavior and rollback. For a risky
replacement: establish a verified baseline; implement in isolation; compare old and new behavior;
migrate data if required; run regression checks; remove obsolete code only after verification;
update documentation and records. Do not leave duplicate systems active indefinitely.

A specialist result is not complete until an integration owner verifies interfaces, dependencies,
state flow, failure behavior, performance, configuration, regressions and the separation between
test and release behavior.

Use deterministic tests and isolated state. Cover success, failure, invalid input, boundaries,
interruption, recovery, repeated use, migration, compatibility and long-running behavior. Avoid
dependence on external networks, mutable third-party services, unstable timing, unordered behavior
and shared test state. A flaky test may be quarantined only temporarily, with cause, owner, removal
condition and confidence impact recorded — **a quarantined test does not count as passing.**

Before a risky change, preserve a recoverable checkpoint. After a significant failure: preserve logs
and useful failing state; record reproduction and affected criteria; identify the last verified
state; restore a safe working state when necessary; isolate the cause and revalidate assumptions;
change strategy before repeating a failed pattern; retest the repair or verify the rollback;
checkpoint the exact continuation point. Do not hide failed experiments by deleting their history,
and do not leave the project broken because an attempt is incomplete.

### Remote delivery

Governed by `POLICIES.yaml`. Remote delivery is `standing_authorized` here; public release is
authorized when the active objective requires it. Do not re-ask for each routine step, and do not
stop at a local patch or an open pull request when delivery is required, authorized, available and
verified safe.

Before delivering: inspect the real remote, target branch, protections, required checks, release
configuration and deployment mechanism; fetch and reconcile concurrent changes; preserve unrelated
user work; confirm mandatory local gates and the rollback point; ensure release artifacts exclude
secrets, private data, development-only controls, unauthorized assets and inappropriate source maps.

Then: use or create a suitable working branch; commit only verified task-scoped changes plus the
required state records; push and confirm the remote branch and commit; create or update the pull
request with objective, requirements, changes, tests, results, risks, deployment impact and
rollback; inspect remote checks and repair failures rather than bypassing them; obtain the required
independent review; merge by repository convention only after mandatory checks, reviews, criteria
and integration pass; trigger the established deployment when publication is required; verify the
deployed revision through the real public surface; and record repository, branches, commits, pull
request, checks, merge result, deployment, public URL, verification environment and time, evidence
and rollback.

Report pending checks as pending. Auto-merge may be enabled where supported and appropriate, but
the merge is not claimed until verified. Where human approval is required, do not bypass protection:
complete and push all safe work, update the pull request, record the exact approval blocker, and
continue other unblocked tasks.

**A deployment starting is not a successful deployment, and an existing URL is not proof that the
intended revision is live.** Verify loading, assets, paths, navigation, the primary journey, runtime
errors, required mobile behavior, refresh and direct links, persistence, and rollback. Failure
`OF-006` is the recorded instance of exactly this mistake.

At the start of a later run, inspect the existing remote branch, pull request, checks, merge,
deployment and public revision before creating duplicates or repeating operations.

---

## 13. Efficiency, questions, reporting

Optimize for reliable progress and final quality, not performative complexity. Do not create
unnecessary agents, roles, tools, dashboards, schemas, files, tests, abstractions, infrastructure
or reports. Use deterministic tools before model judgement when they answer reliably. Cache safe
reusable results, load context lazily, run targeted tests during iteration, reserve broad gates for
boundaries.

When an approach fails repeatedly: stop repeating it, compare the failures, identify the common
cause, revalidate the assumptions, record the failed pattern, preserve valid partial work, and pick
a materially different strategy. `OF-005` is the model here — five successive review failures
shared one root cause, and naming it was what actually fixed the suite.

Do not ask the user to decide routine, reversible implementation details that requirements, project
conventions, objective comparison, tests or bounded experiments can settle. Ask only when a missing
decision genuinely blocks all valuable progress, materially changes the requested product, creates
an irreversible consequence, requires new credentials, payment, private information, legal
acceptance or authority not already granted, or cannot be inferred safely. Otherwise record a
conservative reversible assumption and continue; when one branch is blocked, work another.

Report concisely: what changed, what was actually verified, what failed or stays uncertain, what is
being repaired or blocked, and the next highest-value action. Do not narrate every command. Report
serious defects, changed assumptions, material scope effects, security or data risks and major
architectural findings promptly.

Always distinguish: completed and verified · completed but unverified · prepared but unapplied ·
blocked · rejected · rolled back.

---

## 14. Project-specific standing rules

Carried forward from the legacy protocol and `docs/STATE.md` section 9, still in force:

- Investigate the existing repository before editing. Preserve unrelated work.
- Do not stop at a plan, design document, mock-up, menu or vertical slice.
- Do not substitute prose about what a feature would do for the missing implementation.
- Do not hide an incomplete feature as a "future extension".
- **Do not fabricate assets, tests, measurements, screenshots, comparisons or completion claims.**
- Keep the game runnable throughout. `main` must always work.
- Integrate small, verify small.
- Prefer evidence over self-assessment.
- **Never modify `.github/workflows/autopilot.yml`.**
- **Never move or rename `docs/STATE.md`, and never drop its `state_revision` HTML comment.** The
  autopilot workflow reads that exact path to decide whether to stop (`git show "$REF:docs/STATE.md"
  | grep -q 'ALL_DONE'`). If the path changes, `git show` prints nothing, `grep` matches nothing,
  and the completion stop condition **fails open** — the chain runs to its limit of 20 accepting no
  work. The same fail-open applies to the `docs/STOP` emergency brake. Dropping the revision marker
  fails `validate:ops`, which fails the Pages build job, which leaves the public site silently
  serving a stale deployment.
- Never treat `README.md` as design evidence.
- Never make a physical-device performance claim: no device exists, and blocker `B1` says so.
- The GitHub Pages root mirror is generated. Regenerate it with `npm run build:pages-root`; never
  hand-edit it (`OD-005`, `OF-006`).
