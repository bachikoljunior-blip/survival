# Audio candidate independent review

Reviewer: `/root/integration_decisions_ultra_v2/audio_candidate_review_ultra`.
Canonical instructions and product-source reads: `0abe4628947064fe811ed842face2018b87d5bf5`, repository `bachikoljunior-blip/survival`, production branch `claude/repo-instructions-constraints-r0070m`. `AGENTS.md` → `CLAUDE.md` → `AI_DEVELOPMENT/SESSION_STATE.yaml` were formally fetched and accepted in order. All seven supplied source files match their pinned Git blobs and the same files formally fetched at this head.

**Final disposition:** the original candidate has one confirmed P2 title-routing regression. The integration owner's revised candidate closes that finding in 30 focused exact-method CPU checks. No remaining integration blocker was identified within this finite code-review scope. Production build, browser behavior, recording, listening, and comparative quality of the audio revision remain unmeasured.

## Exact inputs

| Input | SHA256 |
|---|---|
| Original candidate `audio.js` | `080696eb3ee7a831e4548cc1439a27afb628a36d72a68cd9f91e684ac790a2c4` |
| Original product patch | `d13444e5fc73d81e6e9792f0a5a3e733cdd645cb080538117e6a1b8f1d6eb08d` |
| Original Safari report, 828821 bytes | `507a4f82645e6ccc8cff34154f39a58ec1786c3ab4e09f385e86a8f5cf4471ed` |
| Revised candidate `audio.js` | `22add12afa50de4632d43afb00d52789c7f473a0657affd70f3a855a5951d2b7` |

All testing used copies under this directory. Neither upstream candidate, source, original report, nor original test-result file was changed by this review. The separate acquisition-label patch was not adopted or reviewed for execution here.

## Finding R1 — P2, closed only for revised SHA

**Original location:** candidate `src/audio/audio.js` line 742, with cache/selection at lines 743–749. The original new `_syncAmbience` prioritizes `director.currentInterior` in every mode.

The unchanged `Game.toTitle` at `src/game/game.js` line 334 calls `setTitleCamera` at line 356, which parks the player outdoors at `(-128, 0.2, 0)`. Neither clears `currentInterior`. The scene is explicitly an outdoor title camera. The candidate therefore retains the room's ambience and shared reverb on the title screen, whereas the original product selects street ambience. Because the effective region and interior ID remain unchanged, further updates do not correct it.

The exact unchanged `Game.toTitle`, `setTitleCamera`, `_updateZone`, `City.regionAt`, and both Audio implementations were executed with inert node/DOM ports. The observations are preserved in `independent-review-results.json`:

| Room left | Original product at title | Original candidate at title |
|---|---|---|
| Arcade | `street`, street reverb 0.20 | `interior`, interior reverb 0.13 |
| Cellar | `street`, street reverb 0.20 | `under`, tunnel reverb 0.30 |

These are AudioParam scheduling and state observations, not measured loudness or listening judgments. The retained visual `forcedMood` already existed before this patch; this finding concerns the newly extended audio routing, not a claim that the patch introduced the visual state issue.

The integration owner supplied a two-line selection change, independently hash-checked and copied to `revised/src/audio/audio.js`. It derives the cached effective interior ID from `mode === 'title' || menus.fromTitle`, so title state selects the outdoor region while ordinary gameplay menus retain their room. Production state and save data remain unchanged.

Closure used formally read `src/ui/screens.js` at the same head, Git blob `a01584311f7408a4c1b0c21feedd6e67b890ee8b`, alongside exact `Game._wireUI`, `Game.setMode`, `Game.toTitle`, `Screens.openPause`, and `Screens.closePause`. The 30 checks cover both rooms, ordinary pause and close, quit from pause to title, title settings and close, restoration of the same interior ID after title, later gameplay pause, and unlock after title/title-settings transitions. The current real `openPause(..., true)` leaves mode as title; a separately labeled injected `MENU + fromTitle` case verifies the additional guard without claiming the real UI performs that mode transition. Two controls confirm that the original candidate still reproduces both title defects.

Result: both revised title cases are `street`, street reverb 0.20, interior/tunnel reverb 0, with the original `currentInterior` retained. Ordinary game pause remains `interior`/`under`. See `title-regression-closure-results.json` and its recorded script/input hashes.

## Original candidate verification

- The copied author's test suite passes 86/86 and verifies 65 other Audio methods are byte-identical.
- Independently written tests pass 131 checks, including three mutation controls. These execute the real Audio constructor, event-installed unlock, `_create`, all authored doors' asynchronous `Director.enterDoor`, exits, same-null-region transitions, nine presets, gas bounds, relative depth scaling, and explicit zero targets.
- Mutations removing per-frame sync, retained targets, or the regional burn factor are detected. The unmodified candidate is accepted by the same retained-target and burn probes.
- The original report's 82 street samples, 61 `vent-air` samples, and 61 arcade samples match exact `City.regionAt` results. `vent-air` is actually `cut`; the arcade is correctly placed inside with null outdoor region and original street ambience.
- `Game.fixedUpdate` updates actors and systems, then `_updateZone` synchronously sets `game.zone` before emitting `zone`. `Game.render` calls Audio.update. During actual door-method execution, the interior ID is assigned after teleport and before awaiting fade-in; the candidate handles that state during loading. The per-frame hook covers transitions for which the outdoor region stays null and no zone event occurs.
- Source setup completes `buildWorld` and `spawnPlayer` before constructing Audio (`src/main.js` lines 45–51); the real normal initialization does not expose the helper to a half-built interior registry.

The first independent run used an outside-all-regions fixture and incorrectly expected an original zone-change event. It failed that fixture assertion. The fixture was corrected to the authored `start` spawn before the recorded successful run; no candidate code was changed.

The 131 checks and 86 copied checks apply to original candidate SHA `080696...`. The revised SHA received the focused 30-check closure requested by the integration owner; this report does not relabel the older full-suite output as a run on the revised SHA. The observed diff between the two candidates is solely the title/fromTitle selection change.

## Limits for integration

The fixtures replace WebAudio nodes and scheduling endpoints; they synthesize no PCM, draw no frame, and measure no real browser timing. AudioContext construction is exercised against inert substitutes, including an 8000 Hz fixture sample rate used only to keep buffer allocation small. This is not smartphone audio evidence.

The unchanged music/SFX/compressor methods are a source-scope statement. Indoor shared reverb selection also affects sounds sent to that bus; their audible output is not claimed unchanged. Retained burn presets intentionally alter relative mix levels. New exact-build Safari recordings, original clock/cap guards, indoor entry/exit, title/settings boundary behavior, and listening remain necessary before claiming those results.

No remote writes, automation operations, PR/main operations, CI execution, external model inference, or child spawning occurred. All 19 elements remain `not measured`; references 10, criteria 71, valid blind comparisons 0, completed work units 0. The continuous start `2026-09-13T20:56:49+09:00` and deadline `2026-09-20T20:56:49+09:00` are unchanged. This review's readiness does not mean the continuous production work is complete.
