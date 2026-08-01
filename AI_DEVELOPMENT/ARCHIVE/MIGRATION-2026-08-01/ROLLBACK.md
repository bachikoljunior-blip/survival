# Rollback — canonical operating system back to the legacy protocol

Migration commit baseline: `193f408df049f068be57de7a1944089942720ad9` (`origin/main` at migration
time, identical to the migration branch's starting point).

Nothing in the product changed during the migration. Rolling it back restores the operating
records and their validator; it does not touch `src/`, `public/`, the build, or the published
GitHub Pages artifacts.

---

## Option 1 — discard the migration entirely

The migration is a single commit on `claude/legacy-canonical-migration-jcuour`. If it has not been
merged:

```sh
git checkout claude/legacy-canonical-migration-jcuour
git reset --hard 193f408df049f068be57de7a1944089942720ad9
npm run validate:ops    # runs the restored version-1 checker
```

If it has been merged into `main`, revert the merge instead of rewriting shared history:

```sh
git revert -m 1 <merge-commit>
npm run validate:ops
```

Never force-push protected history to undo this.

---

## Option 2 — selective restore, keeping later product work

Restore only the operating layer:

```sh
BASE=193f408df049f068be57de7a1944089942720ad9

# 1. bring back the legacy records at their original paths
git checkout "$BASE" -- \
  PROJECT_OPERATING_PROTOCOL.md \
  AI_DEVELOPMENT/INDEX.md \
  AI_DEVELOPMENT/PROJECT_STATE.json \
  AI_DEVELOPMENT/SESSION_STATE.json \
  AI_DEVELOPMENT/TEST_HISTORY/INDEX.md \
  AI_DEVELOPMENT/BENCHMARKS/INDEX.md \
  AI_DEVELOPMENT/EXPERIMENTS/INDEX.md \
  AI_DEVELOPMENT/SESSION_ARCHIVE/INDEX.md \
  AI_DEVELOPMENT/SKILLS/INDEX.md

# 2. bring back the version-1 validator and the scripts and references that used it
git checkout "$BASE" -- \
  tools/check_operating_state.mjs \
  tools/gate_b_slice.mjs \
  package.json \
  README.md \
  docs/STATE.md \
  docs/DONE.md \
  docs/directive.md

# 3. remove the canonical layer
rm -f CLAUDE.md START_HERE.md
rm -f AI_DEVELOPMENT/PROTOCOL.md \
      AI_DEVELOPMENT/STATE.yaml \
      AI_DEVELOPMENT/REQUIREMENTS.yaml \
      AI_DEVELOPMENT/WORK_GRAPH.yaml \
      AI_DEVELOPMENT/CAPABILITIES.yaml \
      AI_DEVELOPMENT/POLICIES.yaml \
      AI_DEVELOPMENT/LEDGER.jsonl
rm -rf AI_DEVELOPMENT/SCHEMAS AI_DEVELOPMENT/RECIPES
rm -f tools/resume_check.mjs tools/yaml_selftest.mjs
rm -rf tools/lib
rm -rf AI_DEVELOPMENT/ARCHIVE/SESSIONS

# 4. confirm the legacy system is healthy again
npm run validate:ops
npm run validate
node tools/check_done_table.mjs
```

`AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/` may be kept as history; the version-1 validator
ignores it.

---

## Option 3 — restore from the archived copies without Git

The archive holds byte-identical copies of every legacy record. Verify before restoring:

```sh
cd AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/legacy
sha256sum PROJECT_OPERATING_PROTOCOL.md INDEX.md PROJECT_STATE.json SESSION_STATE.json
```

Expected, as captured before any file was changed:

```
6ad016d399baaada41b82ece407c5c3a2e993aaeacd04e2dbd0e75675f20180e  PROJECT_OPERATING_PROTOCOL.md
854bc972415ab7be5eb74d574ef31a9c55c4d676968d9e4c04c1f692ffd630e2  INDEX.md
f589001e6ea7109b30fec0a805e3a1ab88962c7b07b43d38dd4db07cd4c0c1f1  PROJECT_STATE.json
958d4a588ea4cc370e6e38bbeb753ce7d48841308c85a640a34894c5defd07a7  SESSION_STATE.json
```

Then copy them back to `PROJECT_OPERATING_PROTOCOL.md`, `AI_DEVELOPMENT/INDEX.md`,
`AI_DEVELOPMENT/PROJECT_STATE.json` and `AI_DEVELOPMENT/SESSION_STATE.json`, and follow steps 2–4
of option 2.

---

## What a rollback costs

The canonical layer holds information the legacy records had no field for. Rolling back loses:

- the epistemic status on every requirement and criterion;
- the task contracts (allowed scope, prohibited changes, rollback method, completion conditions);
- two-way requirement traceability and its check;
- the append-only ledger, and the six-value gate vocabulary that keeps an unexecuted check from
  being recorded as a pass;
- the derived-frontier check, which is what prevents a cached frontier becoming a second authority;
- `tools/resume_check.mjs`, which is what proves a fresh run can actually resume.

The legacy records remain a complete and accurate description of the project as of
`193f408`. They are simply less able to catch the specific failure modes this project has already
experienced.

---

## Do not

- Do not delete `AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/legacy/`. It is the rollback source
  and the proof that no legacy record was rewritten during the migration.
- Do not edit the archived copies. If a legacy record was wrong, record the correction as a new
  ledger event; do not retouch history.
- Do not roll back by force-pushing over a shared branch.
