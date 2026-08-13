---
name: adaptive-skill-evolution
description: Turn what a finished development round actually proved into a versioned, reversible skill change — screen the learning against an evidence bar, build a candidate version beside the adopted one, evaluate both over the same recorded cases, and adopt only on a measurable gain with no regression. Use at the end of a round, when a lesson looks reusable, when a skill seems wrong or too narrow, or when deciding whether something should be shared across repositories. ラウンド終了後の学びの抽出・スキル改善・候補版の評価・採用と復元・横断共有の判断にも使う。
---

# The default answer is: change nothing

Most rounds teach nothing storable, and that is the normal outcome. This skill exists to make
saying nothing cost nothing, and saying something cost evidence.

Three of these repositories already carry a prose module instructing an agent to store verified
reusable recipes. After three copies of that instruction, one repository has a single stored
workflow and another still reads "No skill is registered yet." The instruction was not wrong —
it had no predicate, so nothing ever met it and nothing ever failed it. Everything below is that
missing predicate.

**Skill work is subordinate to product work.** It runs after the round's product unit is
complete and verified, never instead of it, and a round that completed no product unit adopts
nothing. That is a gate (G1), not an intention.

## The ladder

| Layer | Where | To leave it |
|---|---|---|
| **E — recorded only** | the project's failure/evidence record | the default, and where most learnings stay |
| **L — project-local skill** | `.claude/skills/<name>/`, or `AI_DEVELOPMENT/SKILLS/OVERLAYS/<name>.md` for a local addition to a shared skill | pass the screen, then an adopting evaluation |
| **S — shared** | the kit, redistributed by `bootstrap.mjs` | two repositories, two mechanisms, no project leak |

**Staying at L forever is a correct ending.** The presence of other repositories is not a
reason to generalise anything. One of these projects has a skill that names its game, its two
reference titles and its own round document; it is a good skill and it must never be promoted.

## Screen before you write anything

`node .kit/tools/skill.mjs screen --candidate=<dir>` refuses on any of:

- **R1 recurrence** — fewer than two independent occurrences and no cost counted in tokens,
  rounds, minutes, gate escapes or reverted commits. "This worked today" is not evidence.
- **R2 trigger** — no should-fire case, or no **should-not-fire** case. The second is the
  load-bearing one.
- **R3 verification** — no check that is demonstrably able to fail.
- **R4 evidence** — anything not `measured`. Appearance, feel, fun and comparison to a
  reference title stay `human_verified: false` permanently, are recorded in full, and are
  never grounds for adopting anything. They do not block anything either; they are simply not
  evidence.
- **R5 generality** — the rule still names the round, commit, path or pixel box it was learned
  on. A sentence that cannot leave its occasion is a record, not a skill.
- **R6 duplication** — an adopted skill already says it. **Improving an existing skill always
  beats adding one**, and the screen routes a covered learning to `improve` rather than `new`.
- **R7 predicate** — no executable check over the recorded cases. This is the rule that keeps
  the system self-checking: if you cannot express the rule as a predicate, it is not yet a
  skill change, and it stays at layer E where it is still useful.

## Never edit the adopted version

Write the candidate beside it, so there is still something to be no worse than:

```
AI_DEVELOPMENT/SKILLS/
  LEDGER.json                    adopted skills: tier, revision, sha256, prior sha256, provenance
  candidates/<id>/
    CANDIDATE.json               id, name, tier, mode, target, authored_by, round, record, live_path
    SKILL.md                     the candidate body
    check.mjs                    exports { candidate, adopted?, cases }
    RESULT.json                  written by `eval`, read by `adopt`
  history/<name>@<n>/SKILL.md    the bytes each adoption replaced
  OVERLAYS/<name>.md             a project-local addition to a shared skill
```

Candidates live **outside** `.claude/skills/` so an unevaluated one cannot fire while it is
being judged.

An overlay is how a shared skill gains a project-only rule without editing a vendored file:
edit `.kit/` in place and the next `bootstrap.mjs --check` correctly reports drift, and the
baseline the next comparison needs is gone.

## Evaluate both versions over the same cases

```bash
node .kit/tools/skill.mjs eval --candidate=<dir> --evaluated-by=<agent>
```

Four case kinds, and the set is refused without the first and the last:

- `originating_failure` — the situation the rule came from. Expect `fire`.
- `regression` — situations that already went right. Expect `quiet` (or `fire`, correctly).
- `collision` — **another skill's should-fire prompts.** Expect `quiet`. The realistic damage a
  skill change does is not failing at its own job, it is answering when a different skill was
  supposed to, so a workflow that already worked quietly stops working.
- `boundary` — the near miss the rule must not claim.

For a brand-new rule the adopted baseline is a predicate that never fires. That is the honest
baseline for "there was no rule", and it means a new skill still has to earn its cases.

**Adopt only when** no case the adopted version got right became wrong, at least one case the
adopted version got wrong became right, every collision case stayed quiet, and no predicate
threw. Anything else is `reject`, and the rejection is kept — it is what stops the same idea
being proposed again next round.

`--evaluated-by` must differ from the candidate's author. The author does not judge the work;
that is as true here as it is for product review.

## Adoption is one commit, and it can be undone

```bash
node .kit/tools/skill.mjs adopt --candidate=<dir> --round=<id> --product-units=<n>
node .kit/tools/skill.mjs revert --name=<skill>
node .kit/tools/skill.mjs check      # anything edited in place since it was adopted?
```

The gate refuses (G1) no completed product unit, (G2) a missing, mismatched, regressing or
gainless evaluation, (G3) an author who judged themselves, (G4) the meta-skill judged in the
round that proposed it, (G5) no prior hash to restore, (G6) product files in the same commit.
`node .kit/tools/skill.mjs selftest` proves each of those fires, with a compliant control that
must stay quiet — a gate nobody has seen fail is indistinguishable from one that is inert.

## This skill is not exempt

Changes to `adaptive-skill-evolution` itself — and to the screen, the evaluator, the ledger and
the promotion check — go through the same ladder, with three extra restrictions:

- **It may not approve itself.** A candidate for this skill is evaluated by a context running
  the *adopted* version.
- **No recursion inside a round.** A round proposes at most one change to this mechanism, and
  that change is evaluated in a later round (G4).
- **It may not be the round's output.** A skill improvement never substitutes for a completed
  product unit (G1).

## Sharing is optional and comes last

```bash
node .kit/tools/skill.mjs promote --candidate=<dir>
```

Refused unless the evidence spans two repositories **with two different mechanisms** — the same
mechanism twice is one case observed twice — the case set was re-run in the second repository,
and nothing project-specific would travel: a project name, an absolute or repository path, a
commit sha, a round id, a host URL, a fixed pixel box. A measured constant that is true of one
camera in one game becomes, inside a shared skill, a wrong number carrying a verified kit's
authority. That is worse than having no skill.

Promotion copies into the kit and re-bootstraps every target. Never hand-copy a skill into a
vendored `.kit/` — the install ledger is what makes drift visible, and a hand copy blinds it.

## What none of this measures

Every adopted entry carries `live_effect: unmeasured` and `evidence_level: replay`. Passing a
recorded case set is evidence that a rule discriminates. It is **not** evidence that a future
round goes better, and this skill must never report it as such. That claim needs several rounds
of round-level numbers — tokens, findings, reverted fixes, gate escapes caught before commit —
and until those exist the honest statement is that the effect is unmeasured.
