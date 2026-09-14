# Grain scene guard candidate, r2

Base: `bachikoljunior-blip/survival@67a458d7af2af5efbe8a0ef73c6a2e15bb17f38c`, branch `claude/repo-instructions-constraints-r0070m`. Branch head was read through the connected GitHub fetch API before the ordered AGENTS → CLAUDE → SESSION reads. The pinned instruction contains `ULTRA-LIVE-20260914-v1`. The original start/deadline, 19 element verdicts and 71 criteria remain unchanged.

The deliverable is only `candidate/tools/mobile_grain_trial.mjs` and its CPU test `candidate/tools/mobile_grain_trial.test.mjs`; `candidate.patch` applies to the pinned source. The `candidate/src` and `candidate/node_modules` links are local CPU-fixture support, not files to integrate. No workflow, game source, shader, texture, geometry, default grain, view, screenshot resolution, criterion or verdict was changed.

Evidence and diagnosis:

- The C28 r1 report remains exactly 378163 bytes, SHA-256 `b95adf450aa714c0a9a7af05f75a5a8e5085d2b606ce6e01e001015b4fd519f2`; all eight `validControlledCapture` results remain false. It has only old scene hashes, so it cannot establish every changed field in those original runs.
- Pinned `Game.render(0)` calls `Atmosphere.update(0)`, which calls the plume and burst updates. Pinned atmosphere lines 782–785 and 922–929 set `needsUpdate = true` unconditionally for their alpha/cell/instance buffers. Three.js r180 treats this as a version increment even when dt=0 and data is unchanged.
- The CPU fixture executes the unmodified PlumeField/BurstField class method bodies extracted from that pinned atmosphere source on real Three.js r180 BufferAttributes, InstancedMeshes and math objects. It does not construct the full game or execute its renderer. The production-source path explains a guaranteed counter change; the r1 evidence does not prove the absence of any additional difference.
- Stable fixture data produces twelve version differences (1→2 in before/trial, 1→3 in before/restored), unequal legacy records and identical full data. The changed-data fixture changes `aAlpha[0]` from `0.28531694412231445` to `0.41031694412231445`, records the path and changed byte and fails the new guard. `cpu-evidence.json` contains exact comparisons and method/source hashes.

The new guard copies and byte-compares all geometry attributes and indices, morph data and instance matrices/colours, including off-screen and inactive capacity. Attribute metadata and scene transforms/visibility/identity/count/draw-range, material fields/uniforms/version and light values must match exactly. Material and texture/source upload versions remain strict. Unsupported array storage fails the capture. Buffer upload counters are separately recorded, and the old `sceneRecordsUnchanged` and legacy hashes remain visible. The r2 gate uses `sceneDataUnchanged`, which requires actual field equality and byte equality. Difference lists preserve counts and mark truncation; up to 96 field/buffer entries and eight byte/value samples per buffer are included, without loosening the comparison.

Validation: `node --test tools/mobile_grain_trial.test.mjs` passed all 14 CPU controls. This includes counter-only acceptance and actual buffer, index, instance, transform, visibility, material, light, instance-count and draw-range rejection, plus report plumbing with explicitly synthetic 1×1 PNG fixtures. The first test invocation failed before tests because its source URL went one directory too high; the path was corrected and the complete suite passed. Both files passed `node --check`; `candidate.patch` passed `git apply --check` against the pinned source. See `cpu-verification.log` and `provenance.json`.

Parent's next real CI action:

1. Recheck remote head and integrate only the two candidate tool files plus normal parent-owned state/evidence changes.
2. In the parent-owned grain job, replace the original `[grain-c26-r1]` trigger and `grain-c26-r1` output/artifact identifiers with a fresh marker such as `[grain-c28-r2]` and `grain-c28-r2`; retain `push` and `run_attempt == 1`. Do not rerun/retrigger r1. Add `node --test tools/mobile_grain_trial.test.mjs` before the unchanged capture command.
3. Run the same medium-tier eight-view `.035 → .012 → .035` capture on the unchanged production bundle. Preserve existing full-quality PNG export and 2 MiB per-file completeness cap. The report only gains hashes and bounded deltas; it does not embed full scene arrays.
4. Inspect both `sceneComparisons` per view, byte equality, counter deltas, descriptor and exact PNG restoration, the raw report/PNG bytes and hashes, and job status. CPU evidence is not a real r2 browser capture, image-quality verdict or proof of r1's sole cause. WebKit runtime/heap cost and actual report size remain unmeasured until r2. Any real field/buffer delta or capture/export failure remains failed.

No CI, push, PR, merge, publish, browser/server/CDP/process inspection, escalation, automation or additional agent was started by this child.
