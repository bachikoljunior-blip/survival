# Original Safari audio diagnosis — frozen before candidate edits

Current inspected source: `68cf2d4d303684e6f6a62f0aec4120169e0945bc`. The recorded C29 source `f735a3ab6d230835ce06542281e2f53e3ad94737` and current `src/audio/audio.js` are byte-identical: Git blob `d9462e07a7533393a16c05dee313af5dd207759f`, SHA256 `b54ff04c92c5b533fb99ab063498424a4a9fbfaf1951b4529e34bef72ccd6b49`. Original recording runtime is `6b887bc1cf6ebc0b7fae6c146e46c05d067ad5ba51544fd218d17e8483ea338b`.

## Observed original data

The unchanged original report is 828821 bytes, SHA256 `507a4f82645e6ccc8cff34154f39a58ec1786c3ab4e09f385e86a8f5cf4471ed`. Original MP4 and decoded PCM hashes were rechecked against the recovery records. The PCM remains unchanged. All three recordings are AAC 48 kHz stereo and their original wall/audio/engine clock guards passed.

| Clip label | Decoded duration | Recorded region / ambience | Emitted SFX | Engine/audio ratio |
|---|---:|---|---|---:|
| street-walk | 8.981333 s | stacks / camp | six grit footsteps | 0.966995 |
| vent-air | 6.378667 s | cut / cut | three player coughs | 0.995995 |
| arcade-room | 6.336000 s | null / street | three player coughs | 1.000106 |

The street clip includes a recorded 3.746693 m native-input displacement. No threats were present in any recorded trajectory sample. The stationary vent clip has 1177.96–1251.06 ppm telemetry; arcade has 40 ppm but still records player cough events. These events describe game emission, not isolated proof of audible synthesized voices. The ambient scheduler and musical voices directly invoke synthesis and are not included in `sfxEvents`; absence from that list is not evidence of silence.

Overall L/R correlations are 0.999880, 0.999754 and 0.999684. Side/mid RMS ratios are -42.21, -39.10 and -38.01 dB. Active 100 ms windows have L/R level differences spanning approximately -0.15 to +0.37 dB. Mono-mid spectral power below 200 Hz accounts for 88.99%, 78.82% and 84.27%. These are signal descriptions, not perceptual quality thresholds. A mono voice panned with different gains can still have correlation 1, so high correlation alone cannot diagnose broken spatial sound.

## Reproduced source behavior

1. The vent-field spawn `(82,-60)` belongs to both authored `cut` and `ventfield` rectangles. The exact `City.regionAt` method returns the earlier `cut` entry; all 61 vent clip trajectory samples agree. Treat this as a capture-condition naming error. Do not change city region precedence merely to satisfy a clip label.
2. The arcade clip correctly records `viaDoor=door_arcade`, `interior=arcade`, and position `(588,0,4.2)`. `Director.enterDoor` sets `currentInterior` and visual `forcedMood`, while `Game._updateZone` queries outdoor rectangles only. Its null zone event makes `Audio._wire` select street ambience/reverb and preserve prior authority music. Executing the exact source methods against captured parameter fixtures reproduced visual mood `interior` with audio `street`, street reverb 0.20 and interior reverb 0.00. This is a concrete room-routing inconsistency.
3. `setAmbience` schedules preset layer levels but never sets each layer's initialized `target=0`. Every `update` then schedules hiss from `L.target || 0.05`; at 40 ppm every preset becomes gain 0.005. Burn is overwritten with the same altitude-only target, gain 0.391364 at y=0, despite distinct room/region presets. Exact original methods reproduced this for camp, cut, vents, interior and under. The authored preset differences are not maintained through frame updates.

## Spatial coverage and possible next work

The current sound graph already has positional attenuation, camera-right pan, distance lowpass and three generated stereo reverbs. Continuous ambience layers and the main drone are mono sources without positional panners; random ambient events are positioned around the player, rather than at authored physical emitters. `_chain` computes spatial parameters once at voice creation; it does not track subsequent source/listener motion during a long sound. There is no obstruction query or HRTF path in the inspected code. These are implementation limits, not a demonstrated listening failure.

For the emitted events in these clips, the exact `_spatial` calculation predicts final pan values only from -0.054 to -0.108, since all captured SFX originate near the player and behind the third-person camera. These clips do not cover an enemy crossing left/right, a camera turn around an active source, or a wall interrupting a source. A future acquisition should exercise actual spatial sources and capture their identities/poses, without altering the production mix. Before designing a larger spatial change, correct the reproduced room/preset routing and obtain new exact-build recordings.

## Validation and limits

`code-audit.json` contains 18 passing checks of actual source methods with parameter-capture fixtures; it does not instantiate WebAudio or render sound. The initial audit-script attempt had a fixture bookkeeping error (deleting a shared function property), which was corrected before the recorded successful run. `pcm-content-audit.json` contains complete hashes, 100 ms measurements and event-relative windows. No clipping samples reached full scale.

No confirmed formal audio-perception capability was available for environmental-sound listening. No audio forwarding was used as listening evidence, and no voice summarizer or external LLM substituted for listening. Timbre, perceived distance, masking, pleasantness, intelligibility, event recognition and comparative quality remain unmeasured. All 19 elements remain `not measured`; 10 references, 71 criteria, valid blind comparisons 0, completed units 0 and continuous work are unchanged. Start `2026-09-13T20:56:49+09:00`, deadline `2026-09-20T20:56:49+09:00` are unchanged.
