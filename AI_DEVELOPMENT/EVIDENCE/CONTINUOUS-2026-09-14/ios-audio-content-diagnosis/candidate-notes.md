# Isolated audio candidate — pending integration review

The frozen original diagnosis precedes these changes. The production candidate changes only `src/audio/audio.js`; the acquisition-label candidate is a separate optional one-line patch. Neither candidate was remotely saved, built into a product bundle, run in a browser, recorded, listened to, or used for a blind comparison.

## Product behavior

- `_syncAmbience` resolves the authored current interior (`under` for the cellar, `interior` for other rooms) or the outdoor region's ambience. It runs on zone events and on audio updates, but only changes the selection when the region or interior ID changes. This handles entering/leaving rooms even when both positions have the same null outdoor region. Visual mood, city region precedence and music selection are untouched.
- `setAmbience` now retains all five authored layer targets. Hiss uses its retained target rather than a falsy fallback, so an intentional zero remains zero. Gas concentration still modulates it toward the existing 0.9 maximum.
- Burn multiplies its authored regional target by the existing depth factor instead of replacing the regional target. The existing depth factor remains 0.25–1.0. At y=0, clean air and the interior preset, the scheduled burn gain changes from 0.391364 to 0.070445 and hiss from 0.005 to 0.002; those changes restore the existing interior preset balance. They are CPU-derived scheduling values, not measured audio loudness or a hearing result.

CPU verification executes the original and candidate methods with AudioParam substitutes and records their scheduled values and exponential settling. It covers the original reproduced inconsistency, enter/leave, same-null-zone transitions, cellar/tunnel, missing interior definitions, all nine existing presets, preset changes, zero targets, gas bounds, depth scaling, stable-context fade progression and unlock replay. Result: 86/86 checks pass. The other 65 Audio methods are byte-identical, including compressor construction, spatial chains, voice budgeting, SFX synthesis, ambience source generation and music methods. No clock guard, recorder cap, playback rate, source pose, simulation step or other product file changes.

## Acquisition correction

`acquisition-label-candidate.patch` changes future `vent-air` output labels to `cut-gas-air`; the authored `ventfield` spawn and all capture behavior remain unchanged. The original recovered filenames/report are immutable and retain their old names. This corrects the known region-label mismatch without relocating the player or changing `City.regionAt`.

This one-line change alters `tools/mobile_audio_capture.mjs` from Git blob `86c1d9c9a0b0eeac3d947aad3d99d25272d3eeaa` to `785541d3beaed0e35e8bcf042973eabb7bdb5d6c`. The current iOS wrapper explicitly checks `IOS_AUDIO_PIN.recorderBlob`, so the acquisition candidate is not independently executable under the old pin. Its owner must review/rebase the label change onto the latest C31 acquisition work and update the exact pin for the new build. This package does not edit that wrapper, its guards, workflows, or historical recovery expectations.

## Remaining limits and next concrete verification

The integration owner must independently review the exact patch, rebase it against current product source, build a matching source/root pair through the authorized path, and record the new runtime hash. Capture actual Safari indoor entry/exit and the same cut-gas position on that runtime, preserving master/music/SFX settings, real clocks, recorder limits and original media. Confirm recorded ambience transitions and actual layer behavior in addition to existing transport guards.

Music selection remains as before: a null outdoor region does not choose a new musical preset. The arcade capture's authority music and player cough events are retained observations; this patch does not establish that either is perceptually wrong. Continuous ambience remains mono, spatial voice parameters remain fixed at voice start, the existing stereo-pan capability is not newly measured, and there is no new occlusion/HRTF implementation. These three clips still do not cover a lateral enemy, a rotating listener or a source moving behind an obstruction.

No formal environmental-audio listening capability was confirmed. New mix quality, masking, timbre, spatial perception, perceived room size and reference comparison remain unmeasured. All 19 elements remain `not measured`; the 10 references and 71 criteria are unchanged, valid blind comparisons 0 and completed work units 0. The work remains continuous with the fixed start and deadline.
