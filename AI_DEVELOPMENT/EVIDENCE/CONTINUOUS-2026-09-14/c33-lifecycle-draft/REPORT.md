# iOS audio lifecycle helper candidate

Status: **ready for the integration owner's independent review**. No product source/root, upstream helper, remote branch, CI job, automation, or recorder was modified. This task performed no actual browser execution, recording, sound synthesis, listening, or quality comparison.

Only proposed integration change: `candidate/tools/ios_audio_capture.mjs`.

- SHA256: `b6671760db08381a7d40f51a138a40f173bcf950adbee6dc1cbddc806ea5a0be`.
- Git blob: `99d02e87e1158fb812dadda78a22fd3c87e8360b`.
- Exact baseline SHA256: `56acb917913e27d3763ad99ae81d83788b503aebdd2210ae196c0e4f3cbfd4e4`, blob `48f3da9840e547514246ab344b02b35e91f9a542`, formally read at `b0f1dfb9860dbc00018c0c587d8f0934fadb6604`.
- Patch: `candidate-helper.patch`. Copied `mobile_audio_capture.mjs` is unchanged and is present only for local imports; it is not an additional proposed change.

The new exported `inspectIosAudioLifecycle` runs only after the shared recorder returns a successful, complete three-clip result. The wrapper tracks false recording checks even when the harness does not throw, observes increases in the existing outer report's failure list, requires `status === 'captured'`, exactly three clips, strictly true `timing.captureClockGuardPassed` and `timing.telemetryComplete` for every clip, and the final recorded `placed.interior === 'arcade'`. Missing or false fields cause failure before any lifecycle action. No new clip-name restriction was added.

The probe uses four production operations and five snapshots:

| Snapshot | Programmatic operation | Required mode / menu flags | Ambience |
|---|---|---|---|
| arcade | Read current state | play / no menu / not fromTitle | interior |
| game-pause | `g.emit('ui:menu')`, invoking the existing game-pause handler and Screens method | menu / open / not fromTitle | interior |
| title | `await g.toTitle()` | title / closed / not fromTitle | street |
| title-settings | `g.menus.openPause('settings', true)` | title / open / fromTitle | street |
| title-close | `g.menus.closePause()` | title / closed / not fromTitle | street |

The existing frame-wait port waits for two real engine frames after each operation. The helper never invokes Audio.update, steps a clock, selects an ambience directly, changes a mix/setting value, creates a context/source/recorder, or adds a clip. These are explicitly labeled programmatic Game/Screens operations, not native human gestures.

Each snapshot records context state, clocks, player position, region, currentInterior, mode/menu flags, ambienceState, all five retained `ambLayers[k].target` values, and actual reverb gain.value observations. The state checks require the actual running/unlocked context, no active recording, the expected mode/menu state and all authored preset targets. Interior expected targets are wind .08, burn .18, hiss .02, hum .25, room .9; street targets are .7, .5, .05, .15, 0. Reverb gain.value is not compared with scheduled targets or treated as a settled result. The existing Audio object does not expose separate reverb target fields, so no such measured fields are invented.

Snapshots and failure state are retained under `report.audioCapture.lifecycle` and included as small metadata in `iosAudioLogSummary`. Every mismatch stops later operations and calls the existing report check with false; execution/frame-wait errors also add a report failure. Exceptions flow through the existing outer finally, retaining recorded clips, releasing native actions, preserving transfer diagnostics, cleaning up any recording, and restoring original settings on failure. A failed original acquisition leaves lifecycle `not run`; a failed boundary probe leaves it `failed`. Successful checks do not imply listening or comparative quality.

## Verification

`node verify-lifecycle.mjs` passes **80 CPU checks**. Exact reviewed Game/Screens methods, Audio constructor/unlock, and Audio versions run against inert WebAudio/DOM ports:

- Revised audio `22add12...` passes all five states. Original product `b54ff04c...` is refused at arcade. Original candidate `080696...` is refused at title; title-settings and close are then not attempted.
- A wrong retained room target is rejected despite a correct ambienceState. Unsettled reverb values are preserved as observations and do not cause target-equality assertions.
- Script execution and frame-wait failures enter the report and stop later operations.
- Wrapper sequencing/cleanup tests use an explicitly stubbed shared-recorder import. Thrown capture, false nonthrowing recording checks, native/report failures, missing clips, wrong final room, false clock fields without a callback, and missing timing fields all block new lifecycle operations and restore original settings.
- The success wrapper accepts a `cut-gas-air` middle label, demonstrating no new vent label dependency. Recordings in this test are schema fixtures, not real media.
- `verifyIosAudioBuild`, `createSafariEvaluate`, and `safariAudioCapabilities` are unchanged. The 81c build pin, recorder pin, 131072-character chunks, 48 Mi-character cap, 120-second operation deadline, and the entire shared recorder/three-clock guard source remain unchanged.

Results: `verification.json`; source preservation: `preservation-check.json`; formal instruction/source receipts: `official-receipt.json`. During final fixture hash auditing, an extra trailing newline inherited from a copied Screens fixture was removed so its whole-file blob matches formal `a01584311f7408a4c1b0c21feedd6e67b890ee8b`. Exact methods were unchanged; the final 80-check run used that matching copy.

## Integration boundary

The helper deliberately retains the old 81c/recorder pins for the integration owner to update atomically with the chosen source/root and optional one-line recording-label correction. It is intended for the next adopted audio build, not standalone deployment onto the original 81c audio implementation, which correctly fails the new arcade assertion. This candidate does not claim that runtime `239007...` was run in a browser.

The formal `AGENTS.md` → `CLAUDE.md` v3 → `SESSION_STATE.yaml` read sequence at b0 was accepted before implementation. All writes are under `ios-audio-lifecycle-check-ultra/`. Remote/automation/CI/new agents are 0. All 19 elements remain not measured, references 10, criteria 71, valid blind comparisons 0, completed work units 0; start `2026-09-13T20:56:49+09:00` and deadline `2026-09-20T20:56:49+09:00` unchanged.
