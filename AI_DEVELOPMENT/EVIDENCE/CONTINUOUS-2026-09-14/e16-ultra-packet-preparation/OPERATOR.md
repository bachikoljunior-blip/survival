# E16 anonymous Ultra packet candidate — operator only

This directory is preparation code, not an evaluation packet. The real selection
is pending. Evaluation count is **0**, all 19 element verdicts remain `not measured`.
Do not pass this document, the generator, source selection, tests, evidence,
source manifests, or this source-known review history to a blind evaluator.

## What is frozen

`prepare-ultra-packet.py` is offline: it does not fetch, invoke a subprocess,
start a model, spawn an agent, run CI, or change the repository. It imports only
the exact preserved conformance helper SHA256
`8becdc0644fc43339a0a6a23b4f82e80d2dab3800f32916b61ee7ec2cdce1d72`.
The helper keeps the exact 19 goal identities/concept mappings/references and
four canonical authority hashes covering all 71 criteria. Mutable evidence
records are audited separately. The four original E16 rows are copied verbatim
only to the generated operator record, with no additional full-document base64.

The neutral axes retain their scope: all eight views for light hierarchy,
foreground and every visible sky for palette, every visible solid and zero
visible breaks for grounding, and the whole set with zero visible scale breaks.
Neutral palette comparison cannot certify the original source-specific palette
or numerical color requirements. Those conditions and BM-VIS-04's measurement
command require separate operator conformance evidence. This code issues no
E16 pass, even after a structurally complete anonymous answer.

The historical r3 raw inventory is pinned in `operator/historical-records.lock.json`.
All 20 original files are read-only. The old helper candidate is unchanged.

## Prepare once after the integrating operator selects the adopted product build

The integrating operator first obtains all eight original, fully recovered PNGs
from the adopted changed product build, with its actual bundle and capture
provenance. The current 6b887 pre-grain bundle and old a840 bundle are forbidden.
Current workspace PNGs were inventoried only; they are not selected for review.

Complete `operator/source-selection.json` once:

- `state`: `frozen`; `authority_root`: the verified repository snapshot directory.
- Preserve `projection_helper`, `reference_directory`, `historical_records` and
  `supersedes_bundle_sha256` exactly.
- `candidate.commit`: the exact 40-character capture commit.
- `candidate.bundle` and `capture_provenance`: objects with absolute workspace
  `path`, exact `bytes`, and `sha256` of the original files.
- `candidate.directory`: the directory containing all eight original PNGs.
- `candidate.files`: eight objects containing `file`, `bytes`, `sha256`, `width`,
  `height`, in this existing order: south, cinder, arcade, marrow, stacks, plant,
  survey, ventfield, with names `visual-<name>-frame.png`.

The pinned capture JSON must bind `commit` and `bundle.sha256`, and contain
`recovered_webkit_originals` for each original `file`, `bytes`, `sha256`,
`original_commit`, `offsets_complete: true`, `meta_end_size_hash_match: true`.
If the authoritative acquisition format differs, the integrating operator must
retain and explicitly derive this binding from its originals; never invent a
capture attestation. Hash/schema matching does not independently prove capture
truth or that the grain change was adopted correctly.

Use the local Python commands below from this directory. They do not evaluate:

```sh
python prepare-ultra-packet.py validate --config operator/source-selection.json
python prepare-ultra-packet.py prepare --config operator/source-selection.json
python prepare-ultra-packet.py verify PACKET_ID
```

`prepare` randomly assigns the two whole sets to A/B before evaluation. CSV order
is exactly `A01.png,...,A08.png,B01.png,...,B08.png`. Each file is copied with
identical bytes; no pixels, dimensions, color chunks or metadata are changed.
Unexpected PNG chunks, including text/Exif, stop preparation. Do not strip them
to force acceptance. Historical images, the same bundle, and the same complete
image multiset under another bundle or label order cannot be prepared again.
Build/material reservations and preparation failures remain append-only; no
automatic reroll or cleanup makes the same comparison eligible again.

`packets/PACKET_ID/` contains only 16 neutral PNG names, `manifest.json`,
`images.csv`, `question.txt`, and `answer-format.json`. The sibling operator
record has all source paths, source-role mapping, complete input pins,
conformance, generator/template hashes, and output seals. Separation is logical
within a shared workspace, not an OS isolation claim. Recognition from pixels,
source leakage, prior source knowledge, or use of outside materials invalidates
the comparison.

## Exact future Ultra task and preservation

The exact message is `spawn-message.template.txt`. A successful future prepare
fills only its neutral directory, random packet ID and manifest hash, saving
the entire exact call object to `operator/records/PACKET_ID/spawn-arguments.json`.
The integrating operator may pass that object to the official
`collaboration.spawn_agent` only when comparison is authorized. Required fields
are `reasoning_effort: "ultra"` and `fork_turns: "none"`; `model` is omitted.
Do not prepend repository instructions, project/title/branch, source mapping,
operator opinions, old answers, or this review. Use a fresh independent task.

Before that spawn, establish how the original orchestration transcript will be
preserved. This candidate cannot export another agent's transcript, and no
transcript-export capability was established here. Save the actual accepted
spawn response and all original tool calls/results, image forwarding at original
detail, intermediate messages and final answer. A self-reported `viewed_images`
list does not prove all 16 views. If the real trace is unavailable, record the
answer as unverified; do not reconstruct or certify a transcript from narration.

After the single answer, retain its exact unedited text and a JSON wrapper:

```json
{
  "spawn_arguments": "replace this string with the exact actual call object",
  "accepted_agent_id": "the ID from the actual accepted response",
  "spawn_result": "replace this string with the full actual tool return object"
}
```

Store those raw files and the actual trace within the authorized workspace, then:

```sh
python prepare-ultra-packet.py record PACKET_ID --raw RESPONSE_FILE --receipt RECEIPT_FILE --trace TRACE_FILE
```

If no trace is available, omit `--trace`; raw preservation still works and the
assessment stays ineligible. A mismatched/tampered packet also preserves the
raw answer/receipt/trace before recording invalidity. The result cannot be
overwritten. A missing/truncated answer, missing target/axis, recognition
`yes`/`uncertain`, or invalid packet is not equality and not a successful result.

The code checks receipt structure and exact arguments, not authenticity or
actual backend reasoning strength. Independent source-known audit must verify
accepted official Ultra execution, every image/tool/forwarding event, no outside
source access or intervening recognition, and all complete answer contents.
Requested/accepted Ultra and independently verified effective Ultra remain
different claims. The original start/deadline are fixed, and every unresolved
condition remains `not measured`. No convenient retry of the unchanged build
or image set follows a failure.

## Validation completed here

`evidence/offline-controls.json` records 27 passing CPU controls. Real original
16 PNG byte/chunk inventory is `evidence/existing-16-input-inventory.json`.
The CPU fixtures use copies of a tiny control image with in-memory reference-pin
substitution; they are not product captures, reference images or observations.
No real packet, inference, blind comparison, CI or remote write was performed.
