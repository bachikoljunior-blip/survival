# PROJECT-WIDE ADAPTIVE AUTONOMOUS DEVELOPMENT SYSTEM — Version 2.2

Adaptive Edition with Enforced Floor. Installed 2026-08-01 by migration from the
legacy PROJECT-WIDE PERSISTENT AUTONOMOUS DEVELOPMENT PROTOCOL, which is
retained at `PROJECT_OPERATING_PROTOCOL.md` as an immutable legacy copy and is
superseded **only where it conflicts with this document**. Every non-conflicting
legacy instruction remains in force.

This is not a product brief. It never authorizes inventing an objective, a
feature, a technology or a release target. The product authorities are
`docs/directive.md`, `docs/bible.md` and `docs/DONE.md`.

Layer map:

- **Layer 1** — the marked loader block in root `CLAUDE.md`. Short by design.
- **Layer 2** — `START_HERE.md` and `AI_DEVELOPMENT/STATE.yaml`, plus Section 0
  below. Read on every run.
- **Layer 3** — the rest of this document and `AI_DEVELOPMENT/MODULES/`. Loaded
  only when the active work reaches it.

Do not copy Layer 3 content into Layer 1 or 2. Reproducing a rule in two layers
creates a second authority.

======================================================================
## 0. MANDATORY FLOOR (NON-DISCRETIONARY CORE)
======================================================================

A deliberately small set of obligations that are never subject to your own cost,
value, effort or sufficiency judgment. Everything else in this document is
adaptive. This section is not.

### 0.1 Precedence

No other part of this instruction may reduce, defer, compress or waive a floor
obligation.

The following may never be used as a reason to skip a floor obligation:

- adaptive rigor selection (Section 2), including LIGHT;
- "the lowest sufficient level of process";
- "only when its value exceeds its maintenance cost";
- "do not mistake more process for better work";
- "do not perform a procedure merely because it appears in this instruction";
- efficiency, brevity, remaining context, remaining time, usage limits, or token cost;
- confidence that the change is obviously correct;
- the work being small, local, familiar, or easy.

Only the user's explicit instruction can waive a floor obligation. When one is
waived, record the waiver, its scope, and when it expires.

### 0.2 Trigger form

Each floor item is a trigger and an obligation. You do not decide whether the
obligation is worthwhile. You determine only whether the trigger fired, and that
determination must be answerable from verified reality rather than preference.

If it is unclear whether a trigger fired, treat it as fired. Uncertainty always
resolves toward performing the obligation, never toward skipping it.

Self-report is the weakest acceptable state of this floor, never the target
state. F9 exists because a run that skipped a floor item and reported it as
satisfied is otherwise indistinguishable from a run that performed it.

---

#### F1 — Continuity read

**TRIGGER.** A Claude Code run is about to inspect, change, verify, or deliver
anything in this project.

**OBLIGATION.** Before the first substantive action, read `START_HERE.md` and the
active portion of `STATE.yaml`, or the established project equivalent, and verify
the parts relevant to the intended next action against actual project reality.
If those files do not exist, perform the minimum durable installation in
Section 5 first.

**NOT SATISFIED BY.** Conversation history; a summary written earlier in this
chat; recall from a previous run; assuming the recorded state is still accurate
because nothing seemed to change.

---

#### F2 — Continuity write

**TRIGGER.** A Claude Code run materially changed the project, or is ending while
an objective remains incomplete.

**OBLIGATION.** Before the run ends, update the canonical state with: objective
status; last verified checkpoint; modified but unverified artifacts; blockers;
recovery information; remote or deployment state where relevant; and the exact
next action. Reserve capacity for this. When a run may end soon because of
context pressure, usage limits, or interruption risk, performing F2 takes
priority over starting additional implementation.

**NOT SATISFIED BY.** Describing the state only in chat; deciding the change was
"not meaningful" after files were actually edited; deferring on the assumption
that a later run will record it.

---

#### F3 — Execution verification

**TRIGGER.** A change was made to code, configuration, data, schema, assets, or
build and release settings, and the environment permits running, building,
loading, or otherwise exercising it.

**OBLIGATION.** Actually execute the relevant path and inspect the real result
before treating the change as complete.

**NOT SATISFIED BY.** Successful generation; reading the source; type-level or
logical plausibility; a build that was never run; a test that was written but not
executed; the user's approval of a diff.

**IF EXECUTION IS UNAVAILABLE.** Record the item as `prepared_not_executed`, keep
it open, and state the confidence limitation. Do not upgrade it to complete in a
later run without actually executing it.

---

#### F4 — Status honesty

**TRIGGER.** Any status is recorded in durable state or stated to the user.

**OBLIGATION.** Use only these statuses, and use them accurately:
`complete_verified`, `complete_unverified`, `prepared_not_applied`,
`prepared_not_executed`, `blocked`, `inconclusive`, `failed`, `rejected`,
`rolled_back`, `superseded`.
Prose must not upgrade the recorded status. If a message says a feature works,
F3 evidence for that feature must already exist.

**NOT SATISFIED BY.** "Implemented", "done", "fixed", "should now work", or a
completion summary covering work whose status is `prepared_not_executed`,
`inconclusive`, or `blocked`.

---

#### F5 — Falsification before objective completion

**TRIGGER.** An objective is about to be marked complete, or a STRICT operation as
defined in Section 2.3 is about to proceed.

**OBLIGATION.** Perform at least a Level C deliberate falsification pass as
defined in Section 9.3, and record which independence level was actually used.
For STRICT work, use Level A or B when the environment supports it. When it does
not, use the strongest available substitute and record the limitation.
Choosing the level is adaptive. Performing no pass, or leaving the level
unrecorded, is not permitted.

**NOT SATISFIED BY.** The implementation pass itself; a test written by the
implementer with no attempt to break the result; calling a review independent
when it was not.

---

#### F6 — Real-surface verification of delivery

**TRIGGER.** A merge, release, deployment, or publication changed what a user
actually receives.

**OBLIGATION.** After the operation, verify through the real public or production
surface that the intended revision is the one actually being served, the primary
user journey works, and no blocking runtime error occurs. Record the verified
revision identifier.

**NOT SATISFIED BY.** A deployment job starting or reporting success; the URL
loading; a previously verified revision; a local build of the same commit; a
screenshot taken before the deployment completed.

---

#### F7 — Acceptance mapping at objective completion

**TRIGGER.** An objective is marked complete.

**OBLIGATION.** For each agreed acceptance criterion, record whether it is
satisfied and the specific evidence that shows it.

**NOT SATISFIED BY.** A general statement that the work looks finished, or a
summary of activity performed.

---

#### F8 — Skip accounting

**TRIGGER.** A floor trigger plausibly applied and you concluded it did not fire,
or a floor obligation could not be performed.

**OBLIGATION.** Record one line in durable state containing: which floor item,
which trigger, why it did not fire or why it was impossible, the supporting
evidence, and whether it must be revisited. One line is enough. Do not expand
this into a report.

---

#### F9 — Deterministic enforcement

**TRIGGER.** The environment exposes a mechanism that can fail, block, or revert
an operation independently of your judgment and your report — repository CI, a
required status check, branch protection, a deployment job, a post-deploy check,
or an equivalent — and the active objective involves repeated implementation or
delivery.

**OBLIGATION.** Install the smallest reliable mechanism for each of the following,
and record which are actually active:

- **F2 gate** — a check that fails when a commit changing product files carries
  no corresponding update to the canonical state file.
- **F3 gate** — build, startup, or test execution as a required status check, so
  that unexecuted or failing work cannot merge.
- **F5 gate** — a required record of the independence level and review outcome,
  enforced by branch protection or a required check, so that a merge without it
  fails.
- **F6 gate** — a post-deploy check that fetches the real public surface,
  compares the served revision identifier with the intended one, and fails the
  delivery when they do not match. Where the product can be reverted safely,
  wire that failure to an automatic revert to the last verified revision.

To make the F6 gate possible, ensure the build embeds a revision identifier that
is reachable from the public surface.

**NOT SATISFIED BY.** A rule written in a document; an instruction added to a
loader file; your own promise to check; a job that only reports and never fails;
a check that can be bypassed without the bypass being recorded.

**BOUNDED.** Use the smallest mechanism that fails correctly. Do not build an
elaborate pipeline, do not add gates beyond the four above on your own
initiative, and stop as soon as each required gate exists and has been observed
to fail at least once on a deliberately bad input. A gate never observed failing
is recorded as `prepared_not_executed`, not as active.

**IF ENFORCEMENT IS UNAVAILABLE.** Do not assume it is unavailable; a missing
capability must be demonstrated as required by Section 4. When it is genuinely
unavailable: record which floor items remain self-reported only; state the
limitation in the floor check line of every run; treat affected work as
`complete_unverified` rather than `complete_verified` wherever the missing gate
was the only independent evidence; and treat installing enforcement as P3 work
as soon as the capability appears.

### 0.3 End-of-run floor check

Before ending any run that touched the project, evaluate every floor item and
include one compact line in the final message, for example:

    Floor: F1 ok | F2 ok | F3 executed (browser) | F4 ok | F5 C | F6 n/a | F7 n/a | F8 1 skip (F5: objective still open) | F9 gates: F2,F3 active / F5,F6 absent

This line is short and mandatory. It is a diagnostic signal you produce, not
proof that the obligation was performed. It exists so omission is visible, and
it does not substitute for F9.

### 0.4 Unattended operation

Unattended operation means any chain of runs that continues without the user
reading the output between them: a scheduled workflow, a self-restarting loop, a
routine, an automation, or a run triggered by another agent. Under unattended
operation the floor check line reaches no reader, so self-report provides no
protection at all. Therefore:

- Do not start, enable, extend, or continue unattended chaining for
  delivery-capable work while the four F9 gates are not active, unless the user
  explicitly waives this and the waiver is recorded with its scope and expiry.
- An unattended chain must have a stop mechanism that does not depend on your
  judgment: a bounded run count, and a file or flag whose presence halts the
  chain, checked before each run.
- An unattended run that cannot satisfy F2 must halt the chain rather than
  continue.
- Public release and production deployment inside an unattended chain require
  the F6 gate and a working automatic revert. Without both, prepare the release
  and stop, leaving the exact next action for a run the user will read.

**Project status:** `.github/workflows/autopilot.yml` is delivery-capable
unattended chaining and does **not** satisfy 0.4. It is dormant, was not in
flight at migration, and must not be dispatched until the four gates are active.
`docs/STOP` is its own designed brake and is armed on this branch.

### 0.5 Enforcement state

Recorded in the `floor.enforcement` block of `AI_DEVELOPMENT/STATE.yaml`:
`f2_state_update_check`, `f3_execution_check`, `f5_review_record_check`,
`f6_public_revision_check`, `revert_mechanism`, `last_observed_failing`,
`unenforced_items`, `unattended_allowed`.

Each field records the mechanism actually installed and verified, or the
accurate reason it is absent. Never record a gate as active on the basis of
having written it.

When an active gate and your own report disagree, **the gate result governs**.
Inspect the real mechanism, correct the record, and report the discrepancy
promptly as a serious defect.

### 0.6 Floor discipline

The floor is intentionally small. Do not expand it, do not add new mandatory
items on your own initiative, and do not generate extra files, roles, schemas,
dashboards or reports in the name of the floor. F9 is the single exception, and
it is bounded by its own BOUNDED clause. Everything above the floor remains
adaptive under Section 2.

======================================================================
## 1. CORE NON-NEGOTIABLE RULES
======================================================================

Section 0 and the principles in this section are universally mandatory. Every
other procedure, file, role, report, schema, test, checkpoint and module applies
only to the degree that it materially improves correctness, safety, continuity,
verification, recoverability, delivery, or progress toward the active objective.

Do not perform a procedure merely because it appears here. Do not mistake more
process for better work. **Neither sentence applies to Section 0.**

**1.1 Authority and truth.** Conflict order: the user's latest explicit
instruction; the floor; active requirements, constraints and policies; verified
repository, file, environment, runtime, deployment and test reality; accepted
decisions not superseded; the active plan or work graph; proposals, assumptions,
hypotheses and unverified claims.

Never let an older prompt, a previous agent statement, a stale plan, a repeated
assumption or a generated suggestion override verified reality or a newer user
instruction. Where confusion would cause an incorrect decision, distinguish
`user_requirement`, `verified_fact`, `accepted_decision`, `proposal`,
`assumption`, `hypothesis`, `generated_suggestion`, `unverified_claim`. Do not
label every trivial statement. Repeating an assumption does not make it a fact.

When recorded state conflicts with reality: inspect the evidence, follow the
higher authority, correct the active state, preserve valid completed work,
record the replaced statement when it matters, and update only the affected
items. Do not silently broaden scope, weaken a requirement, or convert an
implementation idea into a product requirement.

**1.2 Claim integrity.** Never claim to have edited, created, deleted, executed,
tested, opened, installed, captured, committed, pushed, merged, deployed,
published or verified anything unless the action actually completed and its
result was inspected. Always distinguish completed-and-verified, completed-not-
verified, prepared-unapplied, prepared-unexecuted, blocked, rejected, rolled
back and superseded. An unexecuted, incomplete, blocked or inconclusive test is
never recorded as passed. The F4 vocabulary is binding for records and messages
alike.

**1.3 Scope discipline.** Do not invent objectives, requirements, dependencies or
product scope. Do not rewrite functioning systems for preference or cleaner-
looking architecture. Do not replace user-authored work without a concrete
reason. Prefer the smallest change that completely advances a real requirement.
Preserve unrelated user work.

**1.4 Safety and confidentiality.** Never place passwords, API keys, tokens,
private keys, recovery information, private personal information or other
secrets in project files, source, prompts, logs, screenshots, evidence, reports,
commits, pull requests, releases or deployed artifacts. Do not perform paid,
destructive, irreversible, security-bypassing, ownership-changing or
visibility-changing external actions without explicit authorization.

**1.5 Continuity.** Do not rely on conversation history as the only project
memory. Persist enough verified state for a later run to determine the current
objective, what is done, what is uncertain, what was last verified, what is
modified but unverified, what is blocked, how to recover, and the exact next
action. Persist only what aids continuation — but the F1/F2 minimum is never
ceremonial.

**1.6 Proportionate verification.** Verification must match risk, scope and user
impact. Small reversible changes may need only a focused check, but that check
must still be executed (F3). Integrated, stateful, public, security-sensitive or
hard-to-reverse changes need more. The goal is confidence supported by evidence,
not completion of a ritual.

**1.7 Progress over ceremony.** When safe execution is possible, do the work
rather than only planning it. Do not ask the user to decide routine reversible
details resolvable from requirements, conventions, verified facts, comparison,
tests or bounded experiments. When one branch is blocked, continue other useful
work.

**1.8 No fictional background work.** No work continues outside an active run
unless a real, supported, authorized scheduled process exists and has been
verified. Never promise automatic later continuation. Where such a process does
exist it is unattended operation and 0.4 governs it. At the end of an interrupted
run, preserve the exact continuation state instead (F2).

======================================================================
## 2. ADAPTIVE RIGOR
======================================================================

Adaptive rigor operates **above** the floor. It selects how much additional
process to add; it never selects less than Section 0.

**2.1 LIGHT** — narrow, local, easily reversible, low-risk, verifiable with a
focused check. Inspect current state; identify the intended result; change it;
run the smallest meaningful check, actually executed (F3); update durable state
(F2). No separate contract, evidence directory, role structure or formal
checkpoint unless it adds real value. LIGHT reduces documentation, decomposition
and review depth. It does not remove F1–F4.

**2.2 STANDARD** — multiple files, new functionality, integration, persistent
state, nontrivial migration, moderate uncertainty, meaningful regression risk,
several dependent steps, or a user-visible workflow. Bounded task description;
explicit completion conditions; dependencies and risks; a recoverable baseline
where needed; targeted checks; integration or user-flow verification;
a deliberate review or falsification pass; a meaningful persisted checkpoint.

**2.3 STRICT** — public release; production deployment; protected-branch merge;
security, authentication, authorization or privacy; schema or user-data
migration; destructive or hard-to-reverse operations; high-impact architectural
replacement; critical recovery behavior; legal, financial, ownership or account
consequences; secret handling; major compatibility risk; high uncertainty with
high consequence; or a blocking regression in a released system.

STRICT requires a written task contract; a verified baseline; a tested rollback;
linked acceptance criteria; broader gates; preserved evidence; appropriately
independent review; integration and recovery verification; exact release or
remote-state verification; and a coherent durable checkpoint. STRICT triggers
F5, and any delivery within it triggers F6.

**2.4 Selection.** Default to the lowest sufficient level, subject to Section 0.
Escalate on newly discovered risk. Reduce when evidence shows the work is safer
than expected. Never choose a level in order to avoid a floor obligation. If the
choice is genuinely unclear, choose the higher one. Judge by consequence,
coupling, uncertainty, reversibility and verification need — not word count, and
not how easy the implementation looks.

======================================================================
## 3. DISTINCT LIFECYCLES
======================================================================

Track separately: **project**; **logical session** (a user-controlled continuity
boundary spanning conversations, devices, context resets, runs and usage
interruptions); **current objective**; **Claude Code run**; **iteration**.

A logical session ends **only** when the user explicitly says so. Do not infer it
from a new chat, app closure, device change, context compression, elapsed time,
objective completion, a short acknowledgment, a tool failure, or a usage limit.

On objective completion: mark it complete only after F5 and F7; preserve the
verified result; select or await the next objective; keep the session active.

On explicit session end: reconcile state with reality; record completed, partial,
blocked, deferred, rejected and rolled-back work; record the last verified
checkpoint, important artifacts, checks, risks and unresolved uncertainty;
record the exact continuation point; mark only that session inactive.

Project completion is separate again, and is declared only by the user or by
objectively satisfying all agreed project-level criteria.

======================================================================
## 4. CAPABILITY-AWARE OPERATION
======================================================================

Determine the actual surface rather than assuming one. A GitHub connection is
not proof of write, pull-request, merge, release or deployment permission.

Do not assume a desktop, a terminal, a local filesystem, a particular OS, an
editor, browser automation, engine automation, persistent background execution,
external AI APIs, paid services, writable repositories, network access,
credentials, or unrestricted permissions.

Inspect the capabilities the current objective needs. Do not perform a full
inventory every run. Recheck when a new task requires them, when their state is
uncertain, when permissions may have changed, when a tool failed unexpectedly,
before a remote or deployment operation, or when the last record is unreliable.

**A capability limitation must be demonstrated, not assumed.** Do not record a
floor obligation as impossible under F8, and do not record enforcement as
unavailable under F9, without an actual attempt or clear evidence of absence.

If direct action is unavailable: continue every unblocked part; prepare complete
files, patches, commands, tests or handoffs; label them accurately as unapplied
or unexecuted; preserve the exact continuation point; state the confidence
limitation; use the closest reliable substitute without presenting simulation as
reality.

Keep root `CLAUDE.md` concise and use it as a loader. Use `.claude/` rules,
skills, agents and hooks only when their verified value exceeds their cost.
Never rely on auto memory or chat history as the sole canonical state, and do not
modify user-level or organization-level configuration unless asked.

For F9, prefer repository-native mechanisms that run on the remote: a workflow in
the repository, required status checks, branch protection, and a post-deploy
verification job. A local hook is skipped by any run that does not execute it, so
it may supplement a remote check but never substitute for one.

======================================================================
## 5. DURABLE INSTALLATION
======================================================================

**5.0 Layer map.** As stated at the top of this file. Section 0 is always in
Layers 1 and 2 and is never demoted. Appendix M module texts are always Layer 3.

**5.1 Canonical files (installed).**

- `START_HERE.md` — boot loader; floor triggers compressed; enforcement status;
  resume procedure.
- `AI_DEVELOPMENT/PROTOCOL.md` — this file, Section 0 in full.
- `AI_DEVELOPMENT/STATE.yaml` — canonical active state including the floor block
  and its enforcement subfields.

Repository visibility note: this repository is public-facing through GitHub
Pages. Committed state must stay secret-free and publication-safe. Never change
repository visibility to solve a storage problem.

**5.2 Optional files in use here.**

- `AI_DEVELOPMENT/PROJECT_STATE.json` — the work graph (task ids, dependencies,
  acceptance trace). Validated by `tools/check_operating_state.mjs`.
- `AI_DEVELOPMENT/EVIDENCE/` — durable evidence per task.
- `AI_DEVELOPMENT/DECISIONS.md`, `FAILURES.md`, `HANDOFFS/`, `SKILLS/`,
  `ARCHIVE/` — preserved from the legacy protocol.
- `AI_DEVELOPMENT/MODULES/` — Layer 3 module texts, none activated by default.

`AI_DEVELOPMENT/SESSION_STATE.json` is a **derived projection** of `STATE.yaml`,
retained because `tools/check_operating_state.mjs` and the Pages workflow read
it. `STATE.yaml` is authoritative; the validator enforces that they agree.

**5.3 Source-of-truth rule.** One authority per kind of active information.
Derived views may exist but must not become competing records, and must be
regenerated when their inputs change.

**5.4 Loader.** The marked block in root `CLAUDE.md`. Keep it concise; do not
import this file into it.

======================================================================
## 6. BOOT, RESUME, RECONCILIATION
======================================================================

Each run: read `START_HERE.md`; read the active parts of this file and
`STATE.yaml`; load only what the next action needs; inspect the real files,
repository, runtime, remote state and capabilities that action touches; compare
record against reality; correct material discrepancies; health-check
proportionately; resume from the last verified checkpoint. Steps 1, 2, 4 and 5
are F1 and are mandatory.

Do not re-read the whole archive, module library or evidence history every run.
Broader audits are for migration, suspected corruption, conflicting records,
unexplained repository changes, a major release, a serious regression, a security
concern, or insufficient active state.

Do not repeat verified work unless the implementation or environment changed, the
evidence became unreliable, a regression is suspected, or the user asks. Do not
retry a rejected approach without recording what changed.

When `floor.enforcement` claims a gate is active, confirm the mechanism still
exists before relying on it. A deleted, disabled or never-merged gate is absent.

======================================================================
## 7. PLANNING AND NEXT-WORK SELECTION
======================================================================

Use only real objectives, requirements, materials, constraints, accepted
decisions and verified evidence.

Planning depth matches objective complexity. Decompose only until a leaf can be
assigned, completed in a bounded iteration, verified, integrated safely and
rolled back. Task definition for LIGHT work may be one sentence; for STANDARD and
STRICT record enough to prevent mistakes, and leave irrelevant fields out.

Priority classes: **P0** safety and integrity; **P1** blocking correctness;
**P2** critical-path requirement; **P3** enabling foundation (including
installing enforcement); **P4** quality; **P5** exploration. Within the highest
applicable class compare user-visible value, objective contribution, dependencies
unblocked, risk and uncertainty reduced, evidence gained, implementation and
verification cost, reversibility, urgency and maintenance impact. Choose the
smallest independently verifiable task with the highest defensible value. Do not
keep choosing easy cosmetic work while structural blockers remain.

When the user changes an objective, branch, criterion or priority, treat it as
authoritative, preserve valid completed work, adjust only affected items, and
continue without an unnecessary restart.

Parallelize only when tasks are genuinely independent, write scopes do not
overlap unsafely, shared state is controlled, integration ownership is clear and
the environment supports it.

======================================================================
## 8. EXECUTION CONTROLLER
======================================================================

A conceptual loop, not a reporting template: **reconcile** (F1) → **select** →
**define** → **prepare** → **execute** → **verify** (F3) → **review** (F5 at
objective completion or STRICT) → **repair or rollback** → **checkpoint** (F2 at
run end) → **deliver** (F6 when delivery occurred) → **continue**.

A LIGHT change may pass through the whole loop in one compact operation, but the
verify and checkpoint stages can never be empty.

**8.1 Meaningful checkpoints.** Create one when a feature or task is verified, a
risky change is about to begin, a release boundary is reached, a migration
completes, a serious failure is diagnosed, a rollback occurs, a handoff must
survive a context change, the run may end, or the verified continuation state
materially changes. Not for every trivial edit.

For STRICT work use transaction-like discipline: stage the result; run mandatory
gates; preserve evidence; create a unique checkpoint; update active state
coherently; replace atomically where practical; recover from the last internally
consistent state after interruption.

An investigation, rejected experiment or rollback is still a successful iteration
when it produces verified knowledge and leaves the project safe.

======================================================================
## 9. ACCEPTANCE, EVIDENCE, REVIEW, COMPLETION
======================================================================

**9.1** Translate vague qualities into observable behavior, measurable
thresholds, repeatable comparisons or explicit review standards where that
materially improves verification. Do not invent numerical thresholds merely to
look objective. For complex work keep traceability from requirement through
criterion, work item, artifact, check, evidence and result; for small work,
concise traceability suffices, but F7 still requires an evidence link at
objective completion.

**9.2** Run only the gates relevant to the change, environment, risk and active
criteria: fast targeted checks during implementation, broader gates at
integration, migration, merge, release and deployment boundaries. A successful
generation, build, startup, screenshot or single passing test does not prove
feature completion. A failed mandatory gate blocks acceptance; repair the
implementation unless the gate itself is demonstrably invalid. Never weaken a
valid criterion to make defective work pass. **Removing, disabling or narrowing
an F9 gate to make work pass is prohibited (14.5).** Gate results:
`passed`, `failed`, `blocked`, `not_applicable`, `prepared_not_executed`,
`inconclusive` — and anything other than passed or not_applicable is never
summarized as success.

**9.3 Independence levels.**
**A** independent or source-blind — a separate context evaluates the runnable
result without implementation source or implementer explanation.
**B** source-restricted — a fresh context receives only minimum artifacts and
evidence.
**C** separate falsification pass — the same agent, deliberately separated from
implementation, retaining prior context.
**D** prepared only — material written but not executed.

Never describe C or D as source-blind or fully independent. LIGHT work may use a
focused falsification check. STRICT should use A or B when supported; otherwise
the strongest substitute, with the limitation recorded. F5 records the level
actually used. **Level D alone never completes an objective.**

Review hunts false assumptions, missing states, regressions, data loss, migration
errors, lifecycle defects, interface mismatches, recovery failures, accessibility
and security problems, performance problems, hidden coupling, misleading tests,
release-only defects and incomplete integration.

**9.4** When the product has an interactive surface and interaction is available,
verify through that surface with the same controls a user has. Static screenshot
inspection is not interaction testing.

**9.5 Completion.** A task is complete when its completion conditions and
mandatory checks for its rigor level pass, including F3. An objective is complete
when its acceptance criteria are satisfied and mapped to evidence (F7), a
falsification pass has been performed with its level recorded (F5), required
integration is done, no blocking finding remains, durable state reflects reality,
and any required delivery is verified (F6).

A public release additionally requires valid release configuration, clean build
or setup, the primary user journey, supported-environment checks, runtime
stability, licensing compliance, absence of development-only controls,
verification of the actually deployed revision, and rollback information.

State remaining uncertainty in proportion to the evidence.

**9.6 Permanently excluded obligations.** An obligation that **cannot be
performed in this execution context at all** — not "not done yet", not "expensive",
but impossible without a party or a device this project does not have — is removed
from the open-issue lists rather than carried in them forever. Carrying it there is
not honesty: an unresolvable line in a blocker table trains every reader to skim
the table, and the items beside it that *are* actionable get skimmed with it.

Removal is permitted only with all four of:

1. the reason it cannot be performed, in one sentence, naming the missing party,
   device or authority;
2. the substitute obligation that stays in force — what the project does instead,
   and what that substitute demonstrably does *not* cover;
3. an explicit prohibition on claiming the excluded thing was verified. Exclusion
   removes the task, never the limitation;
4. the entry recorded in the permanent-exclusion list in
   `AI_DEVELOPMENT/STATE.yaml`, so removal leaves a trace instead of a gap.

An excluded obligation returns to the open lists the moment the missing party,
device or authority becomes available. Exclusion is never a way to close a
blocker that a machine could have cleared.

======================================================================
## 10. MODULE ACTIVATION
======================================================================

Module texts live in `AI_DEVELOPMENT/MODULES/` and are Layer 3. Activate one only
when its trigger is satisfied by the actual project and its expected value
exceeds its cost. Load a module file only when activating it or checking whether
its trigger fired; never load the library as a whole. Record activation briefly
when it affects scope, cost, risk or continuation. Deactivate when its purpose is
satisfied.

**Writing a module file is storage, not activation.** Module optionality never
reduces Section 0; when a module is not activated, the corresponding floor
obligation is still satisfied by the simplest available means.

======================================================================
## 11. LOCAL-FIRST PRODUCT AND DEPENDENCY POLICY
======================================================================

The shipped product must not depend on an additional external AI API, paid
inference service, hosted agent or third-party cloud service without explicit
authorization. Prefer, in order: existing project capabilities; deterministic
local or bundled code; compatible open-source libraries; rule-based or
algorithmic systems; practical local models; authorized external services last.
Core functionality must survive an optional service being unavailable. Do not
request an API key merely to simplify implementation.

Before adding a dependency, asset, model or reference implementation, verify
source, license, version, attribution, compatibility, maintenance state,
security implications, runtime cost and replacement risk. Do not copy
license-incompatible code or assets. When installation is unavailable, prepare
the integration without claiming it was installed. Do not purchase anything
without explicit authorization.

**Project status:** the only runtime dependency is `three`. There are no external
assets and no network requests. Keep it that way unless the user says otherwise.

======================================================================
## 12. CONTROLLED CHANGE, TESTING, RECOVERY
======================================================================

Prefer small, isolated, reviewable changes. Before changing an interface,
identify consumers, invariants, migration needs, failure behavior, tests,
compatibility and rollback.

Risky replacement: verified baseline → recoverable state → isolated
implementation → behavior comparison → data migration → regression checks →
remove obsolete code only after verification → update docs and durable state. Do
not leave duplicate authoritative systems active indefinitely.

A specialist result is not integrated merely because it was generated.
Integration verifies interfaces, dependencies, state flow, configuration, failure
behavior, performance, regression impact and the separation between development
and release behavior.

Use deterministic tests and isolated state. Cover success, failure, invalid
input, boundaries, interruption, recovery, repeated use, migration, compatibility
and long-running behavior where applicable. Avoid dependence on external
networks, mutable third-party services, unstable timing, unordered behavior and
shared test state. **A quarantined flaky test does not count as passing.**

On significant failure: preserve logs and failing state; identify affected
requirements; determine the last verified state; restore safety when necessary;
revalidate assumptions; do not blindly repeat; change strategy when justified;
retest the repair or verify the rollback; preserve the exact continuation point.

On repeated failure: stop repeating; compare the failures; find the common cause;
challenge the underlying assumption; preserve valid partial work; record the
failed pattern; switch to a materially different strategy. Do not hide failed
experiments by deleting history, and do not leave the project broken because an
attempt is incomplete.

======================================================================
## 13. QUESTIONS, EFFICIENCY, REPORTING
======================================================================

Optimize for reliable progress and final quality, not visible complexity. **The
efficiency rules here apply above the floor only.** Never cite conciseness, cost,
remaining context, remaining time or avoiding ceremony as a reason to skip a
Section 0 obligation.

Do not create unnecessary agents, roles, dashboards, schemas, files,
abstractions, reports, plans, tests, tools or infrastructure. Use deterministic
tools before model judgment when they answer reliably. Cache safe reusable
results. Load context lazily by leaving Layer 3 unloaded — never by skipping
Layer 1 or 2.

Ask the user only when the missing decision blocks all valuable progress,
materially changes the requested product, creates an irreversible consequence, or
requires credentials, payment, private information, legal acceptance or authority
not already granted. Otherwise choose a conservative reversible assumption,
record it if it may matter, continue, and revise on better evidence.

Progress updates state what changed, what was actually verified, what failed or
remains uncertain, what is blocked, and the next highest-value action. Do not
narrate every command. Report promptly on a serious defect, changed assumptions,
material scope impact, security or privacy risk, data-loss risk, major
architectural conflict, **a disabled, deleted or bypassed enforcement gate**, or
a release blocker.

End every run that materially changed the project with the Section 0.3 floor
check line. Never claim future automatic continuation.

======================================================================
## 14. REMOTE DELIVERY AND PUBLICATION POLICY
======================================================================

Active project policies:

    remote_delivery: standing_authorized
    public_release: authorized_when_required_by_active_objective
    routine_connected_credentials: authorized_without_secret_disclosure
    paid_actions: prohibited
    repository_visibility_change: prohibited
    destructive_external_actions: prohibited
    security_control_bypass: prohibited
    private_information_exposure: prohibited

This continues the standing authorization the user gave on 2026-07-31 and
remains active across conversations, devices, context resets, logical sessions
and runs until the user revokes, replaces or restricts it. It covers branch
creation, commits, pushes, pull-request creation and updates, remote checks,
permitted review operations, merges, releases, deployments, publication and
public verification, when required by the active objective. Do not ask for
separate confirmation for each routine step.

It remains subject to later user instruction, actual capabilities, repository
permissions, branch protection, required human approval, system safety
requirements, **the unattended-operation constraints in 0.4**, and valid
mandatory gates.

Public release, production deployment and protected-branch merge are STRICT,
which triggers F5 before and F6 after.

**Session constraint in force:** the user has designated
`claude/one-round-execution-changes-psdid4` as the development branch and
instructed that no other branch be pushed to without explicit permission, and
that no pull request be opened unless explicitly requested. That instruction is
higher authority than the standing delivery authorization and narrows it.

**14.1 Before delivery** inspect remote repository, target branch, current remote
revision, concurrent changes, protections, required checks, existing branches and
pull requests, release configuration, deployment mechanism, public target and
rollback method. Preserve unrelated work. Do not duplicate branches, pull
requests, releases or deployments. Confirm release artifacts expose no secrets,
private data, internal credentials, development-only controls, unauthorized
assets, inappropriate source maps or internal files.

**14.2 Flow** (only the relevant steps): reconcile with remote; create or reuse
the branch; commit task-scoped verified changes; push and confirm the revision;
create or update the pull request with objective, changes, checks, risks,
deployment impact and rollback; inspect remote checks; repair failures rather
than bypassing them; review at the required level; merge per repository
convention after mandatory conditions pass; remove obsolete branches when safe;
trigger or perform the release; **verify the deployed revision on the real public
surface (F6)**; record final remote and deployment state including the verified
public revision.

Do not bypass branch protections. Record pending checks as pending. Enable
auto-merge only when supported, appropriate, authorized and otherwise satisfied.
Do not claim a merge completed until verified. When auto-merge later completes a
deployment outside your observation, **F6 is still owed at the next run** before
that delivery may be recorded `complete_verified`.

When human approval is required: do not bypass it; complete all safe work; push
the ready state; update the pull request; enable permissible auto-merge; record
the exact approval blocker; continue other unblocked work.

**14.3 Deployment verification.** A deployment starting is not proof of success.
An existing public URL is not proof the intended revision is active. Verify the
intended revision or identifying change, loading, asset paths, navigation, the
primary journey, runtime errors, supported mobile behavior, refresh and direct
links, persistence, orientation, loading and failure states, and rollback
availability. On a blocking regression: stop expanding, repair or revert, return
to the last verified release if needed, redeploy, verify recovery.

**14.4 Remote failures.** Inspect the real failure; preserve evidence; repair
project-controlled causes; update the existing branch or pull request; rerun
gates; retry the safe step; verify the result. If blocked by an unavailable or
prohibited action: complete every safe step, preserve the ready state, record the
exact blocker, and do not claim delivery succeeded.

**14.5 Prohibited without separate explicit authorization.** Force-pushing
protected history; bypassing branch protection; suppressing valid mandatory
checks; **disabling, deleting, narrowing or making advisory any F9 enforcement
gate**; falsifying results; exposing secrets; changing repository visibility;
purchasing anything; changing subscriptions; transferring ownership; deleting
repositories; deleting production user data; destructive production database or
cloud operations; disabling security controls; accepting legal terms for the
user; unrelated irreversible migrations.

At the start of later runs, inspect the existing remote branch, pull request,
checks, merge, deployment and public revision before creating replacements or
repeating delivery operations.

======================================================================
## 15. GOVERNING RULE
======================================================================

Always satisfy the floor in Section 0, and prefer a mechanism that enforces it
over a promise that reports it. Above the floor, protect truth, safety,
continuity, verification and the active objective with the least necessary
process. Increase rigor when consequence, coupling, uncertainty or
irreversibility demands it. Reduce rigor when additional procedure would not
materially improve the result. **When it is unclear whether a floor obligation
applies, perform it.**
