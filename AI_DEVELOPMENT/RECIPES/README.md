# Recipes

Verified, reusable procedures. Migrated from the legacy `AI_DEVELOPMENT/SKILLS/` directory, which
held only this index and no registered entries.

A recipe is stored **only after it has supporting verification**, and executable scripts are
preferred to prose. Each entry records:

- name, purpose, version;
- applicability and non-applicability conditions;
- inputs, outputs, dependencies, interfaces;
- exact usage;
- verification test and evidence;
- limitations and known failure modes;
- an example;
- the project revision at which it was last verified.

Before reuse, confirm applicability, dependencies, interfaces and verification. Adapt rather than
copy blindly. When a recipe stops working, deprecate it here rather than leaving it to be
rediscovered.

Failed, misleading or dangerous patterns are **not** recipes. They belong in
`AI_DEVELOPMENT/FAILURES.md` with the conditions that would justify reconsidering them.

Nothing here is a Claude Code skill. `.claude/skills/` is for procedures that benefit from native
invocation; none of these do, so the directory does not exist.

| Recipe | Purpose | Last verified |
|---|---|---|
| `npm-writable-cache.md` | Install locked dependencies where the default npm cache path is not writable | 2026-08-01, `193f408` |
| `headless-webgl-probe.md` | Decide whether browser gates can run, before spending a full suite finding out | 2026-08-01, `193f408` |
