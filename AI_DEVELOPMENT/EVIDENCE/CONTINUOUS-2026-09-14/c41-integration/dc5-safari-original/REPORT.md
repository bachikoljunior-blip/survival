# dc5 original Safari observations

Both accepted Safari jobs failed after successful preopen and product startup. The external dc565c0f0fda14b946d0c5e5c7b4eac43e3bdfd5 commit changed CLAUDE.md only; product root 8c, recording and harness inputs remain the C40 version. These are additional observations of the same product, not a repair trial or a replacement for the original C40 failures.

| Role | Run / Safari job | Checks | First recorded failure |
|---|---|---|---|
| source | 34898336642 / 104157904054 | 45 / 47 pass | street acquisition clock |
| PR | 34898351772 / 104157952955 | 43 / 47 pass | release observation transport deadline |

Both runs are completed/failure, attempt 1. Each completed Safari log was fetched exactly once. The full decoded responses total 150,334 bytes: source 72,520 B SHA256 82d2c8fad9a25b1cee02b9173b8952365e98f3293174ca8f9b1b34e2ad3972ed; PR 77,814 B SHA256 1f85c54d038fff280409544dc44fd72306701c8644b71b7ffc638541a45884fc. Saved bytes/SHA, final cleanup and untruncated report marker were checked.

Canonical source commit parent is C40 8058f8431b7885e9e929e6cb57bb415d26d9f5b1; tree 86900e1a6119c234ff8d03298483bac2ed38f268. The PR actually checked out c5526c35929af07c5e0bddd9c9bfdafd1fea7853. Its canonical parents are main5456371249f5769c25d18f1686a44349e4292d6f and dc5; its tree equals the source tree. Original recording provenance agrees with the checkout/run/attempt, prepared source/report, root/dist 8c5624ed…, recorder785541d3…, harness a278b87f…, inline helper e4f36959…, transfer55150670… and probe eabc3f8b…; complete hashes are in analysis.json.

Startup records show exactly one successful local preopen: source 8265 ms at loopback port49753, PR 11809 ms at port49880. Both actual URLs equal their bootstrap URL and both ready markers were verified. Product checks and three clips followed. Neither current failure is the old pre-game WDA launch failure. No original Appium bytes were exported in these gameplay-failure logs, so native internal command ordering was not directly inspected.

| Street clock | source | PR |
|---|---:|---:|
| Audio seconds | 8.064000 | 17.653333 |
| Engine seconds | 7.533333 | 15.950000 |
| Engine / audio | 0.934193122 | 0.903512085 |
| Audio minus engine | 0.530667 s | 1.703333 s |
| Existing tolerance | 0.403200 s | 0.882667 s |
| Excess | 0.127467 s | 0.820667 s |

The existing 5% / minimum0.1s guard rejects both streets. Gas and arcade clock guards pass. All six compact clips report complete finite ordered telemetry; their declared media bytes/SHA are preserved, but original MP4 and full report bytes were not recovered.

Source movement release passes after fixed-step progress in 11 ms with inactive stick/zero movement. PR release has an overall failed status: “release observation transport deadline exceeded.” Its preserved lateResult reports the page observation passed after 11 ms and a fixed-step update, with zero movement and inactive stick. The harness rejects the late response after its Node collection deadline of 2000 ms. The page result does not override that transport failure. A specific HTTP command duration or cause is not present here.

PR then fails the street clock and arcade finite-live-gameplay check. Although the latter failed check has empty detail, the adjacent clock-advance check preserves the same captured.after: wall178845ms, position[588,0,4.2], hp0, deadtrue, modeplay, audiorunning. The recorder condition is finite position and !dead; the dead flag explains this check failure. Gas ended at wall83482ms with hp116.529618 and deadfalse. From arcade's 6.260s capture duration, its start is derived as wall172585ms: a gap of 89.103s after gas ended. Source's analogous gap is 3.134s. This is endpoint arithmetic, not evidence assigning the gap to WebDriver, CPU, GPU or any particular damage source. HP-loss timing and the intervening commands remain unknown.

Both lifecycle preconditions reject the failed acquisition; no lifecycle boundary operations run. Their final generic capture errors follow the earlier failures. Frame-work environment is 0 and detailed profiles are absent. No inline command-omission or performance repair claim follows from the adopted helper pin.

Next evidence, if needed, is the fixed original dc5 PR report/Appium artifact. The upload log alone declares artifact10369768653, ZIP13,840,663 B, SHA256 1ab8b46e1c8e4dff8d464cf60a9faa0077c0dd144f9ad79ba78896b836a3b875; canonical artifact metadata and ZIP bytes have not been read for this run. The separately frozen C40 PR recovery candidate targets a different run and remains unchanged; it cannot by itself explain this dc5-specific gap and death.

Verification scripts pass on saved canonical responses and derived arithmetic. New CLAUDE V3 sections6–7 were accepted; stale SESSION automation-restoration language is not executed. Remote writes, new CI, reruns, automation, Library actions and new agents remain zero. No current product/guard/deadline/cap changes were made. All19 not measured, 71 criteria, 10 references, validblind0, units0, continuous; start2026-09-13T20:56:49+09:00 and deadline2026-09-20T20:56:49+09:00 stay fixed. The wider production task remains unfinished.
