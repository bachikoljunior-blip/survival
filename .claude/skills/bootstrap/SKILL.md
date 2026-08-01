---
name: bootstrap
description: Install or update the shared development kit inside a repository — the measurement harness, release verification, state gates, and the skills that use them. Also checks whether an already-installed copy has drifted from the kit. Use when setting up a new repository, when a repo should gain the shared tooling or skills, or when asked whether a repo's vendored kit is current. 新しいリポジトリの初期設定・キットの導入と更新・ドリフト確認にも使う。
---

# Install the kit into a repository

Sessions here run in disposable containers: `~/.claude/` is rebuilt every time and nothing
outside git survives. So the tooling has to travel **in the repository**, and this is how it
gets there.

```bash
node tools/bootstrap.mjs --target=/path/to/repo            # install or update
node tools/bootstrap.mjs --target=/path/to/repo --check    # is it current?
node tools/bootstrap.mjs --target=/path/to/repo --skills=probe,publish   # a subset
```

What lands:

```
.kit/lib/…              vendored modules (browser, image, release, state, plan)
.kit/tools/…            check-ownership, bootstrap itself
.kit/KIT_VERSION        the version stamp --check compares against
.claude/skills/…        the skills, loaded by Claude Code automatically
```

Vendored on purpose rather than a submodule or a registry dependency: whatever is committed
is everything the next session gets, and a fetch that can fail is a session that starts
broken. The cost is drift, which is what `KIT_VERSION` and `--check` exist to make loud.

## After installing

1. **Run `--check`.** It must pass immediately. Then run it twice — the second install must
   report `idempotent: nothing changed`. An installer that is not idempotent cannot be put in
   CI.
2. **Wire `--check` into CI**, next to the other gates. A vendored copy nobody verifies is a
   fork nobody declared.
3. **Do not edit anything under `.kit/` in place.** Change it in the kit and re-install;
   `--check` reports an in-place edit as `stale`, and an orphaned file the kit no longer
   ships as `orphaned`.

## Adding a repository that has no protocol yet

Three of the eight repositories have no operating protocol, no state files and no CI at all.
Installing the kit gives them the tooling but not the discipline. If the repo should also
gain the protocol scaffolding, take `template/` as well — and read its divergence table
first, because the existing repositories genuinely disagree on fifteen points and the
template settles each one deliberately. The sharpest: `review_outcome` must be
`complete_verified`, because the alternative value in use is not in the ten-value status
vocabulary both protocols define, and the two repositories' gates therefore cannot both pass
as written.

## Before you report success

Say which files changed, whether `--check` passes, and whether the second run was clean.
"Installed" means `--check` exited 0 and you saw it.
