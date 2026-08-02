# GB-VISUAL-EVIDENCE — the ten criteria R-19 had stalled

`docs/benchmarks.md` §6 held ten criteria at 未計測 for a single reason: `shots/` is
gitignored, so no image evidence had ever been committed and no third party could check any
claim about how this game looks. That is R-19, and it is recorded there as the largest single
gap in the benchmark.

**The frames are still not committed, and that is the point.** A committed PNG is not
evidence a reviewer can argue with — it is a thing they have to look at and agree about.
What is committed is the number, the threshold it was measured against, the verdict, the
method, the per-frame digests, and the SHA-256 of the bundle the run was bound to. A later
session re-runs one command against the same bundle hash and gets the same numbers, or finds
out that something moved.

- Command: `node tools/vantage.mjs --evidence --prefix ev`
- Artifact: `AI_DEVELOPMENT/EVIDENCE/GB-VISUAL-EVIDENCE.json`
- Bundle: `cinderline.1.0.0.js`, 1,422,174 bytes, sha256 `8f877fd9e2098b323727cd9920c07405b377ca74dfd26a44ff3a2a3c696024e1`
- Environment: Playwright Chromium with SwiftShader (software rasteriser), 667x375 CSS px, deviceScaleFactor 2, isMobile, hasTouch, node v22.22.2
- Frames: 18 vantages, 0 page errors
- Generated: 2026-08-02T09:49:42.165Z

**This is not a device result.** NONE. Frame rate and frame time are not measured here. A software rasteriser is not a phone GPU.

---

## Apparatus, checked before the content

Every run checks the instrument first. This project's own history is the argument: a histogram
taken from a cleared canvas, a sweep that photographed the world through the title screen and
read the scrim as crushed shadow, and — in the sibling project — a key light whose telemetry
read healthy while it contributed nothing to a single pixel.

| check | result | detail |
|---|---|---|
| A1-canvas-not-cleared | ok | first frame mean luma 33.483, luma p1 0 p99 111.6, detail 6.2 |
| A2-ui-withheld | ok | #ui display=none area=0px² |
| A3-frames-distinct | ok | 18 distinct digests over 18 frames |
| A4-key-light-contributes | ok | 2 directional light(s); mean luma 75.856 -> 81.235 (sun DARKENS the frame — unexplained, see limitations) |
| A5-one-dominant-key | ok | 2 directional light(s), dominance ratio 17.48 |
| A6-penetration-probe-can-fire | ok | camera stepped to 0.05m in front of a surface that was 19.8m away: nearest hit 0.050m against a 0.12m near plane, back-face fraction 0.05. Closed solids found in 72 directions: 0 |
| A6b-no-closed-solids | ok | zero front/back face pairs in 72 directions: this world is built from single-sided surfaces, so "camera inside a solid" is not a state that exists here and the back-face half of the probe is inert. BM-CAM-01 rests on the near-plane half alone. |
| A7-landmark-probe-can-say-no | ok | camera pitched at the sky sees 0 of 5 landmarks |
| A0-production-bundle | ok | production bundle, 1422174 bytes |

**Three of these were failing when they were first written, and each failure was a real fault
in the instrument rather than in the game.**

1. `A6` first dropped the camera into the middle of the heat plant and reported no
   penetration. The building is a shell: six metres up inside it is open air. Then it stepped
   0.3 m past the first surface a forward ray found — which was a terrain chunk 19.8 m away,
   and 0.3 m past that is also open air. It now steps to 0.05 m *in front of* a real surface,
   inside the 0.12 m near plane, which is the condition the verdict actually rests on.
2. The landmark probe reported **0 of 5 landmarks visible from all 18 vantages**. It was
   aiming at a point inside each building and stopping the occlusion ray 3 m short — less
   than half the depth of every one of them, so every landmark occluded itself. Aimed above
   the roof and stopped short of the footprint, the same world gives 4 of 5 landmarks visible from 2 or more of 18 vantages.
3. The sky mask reported **zero sky cells in all eight frames**, which sent BM-VIS-02 to
   inconclusive. "Sky" is not "the ray hit nothing": the sky is a dome mesh at 300 m, so every
   ray hits something. The dome is now identified once by an upward ray and cells are matched
   against it.

A fourth is recorded rather than fixed: `A6b` found **zero front/back face pairs in 72
directions**, so this world has no closed solids and "camera inside a solid" is not a state
that can exist here. The back-face half of the penetration probe is inert, and BM-CAM-01 rests
on the near-plane distance alone. That is a limit on the verdict, not a defect in the world.

---

## Verdicts

| criterion | verdict | measured | threshold |
|---|---|---|---|
| BM-CAM-01 | **pass** | 0 of 18 vantages put geometry inside the near plane (0.12m) or sat inside a solid | 0 penetrations over the sweep |
| BM-WLD-02 | **pass** | 4 of 5 landmarks visible from 2 or more of 18 vantages | 3 or more landmarks from 2 or more points |
| BM-WLD-03 | partial | shutting the three west heads moved the simulated gas by 633.7 ppm across two sample points (Fenn 44.8->45.7, yard 14->646.8) and the frame mean luma by 4.910 | at least 3 major decisions produce a visible change |
| BM-VIS-01 | partial | luma spread p99-p1 over the 8 main vantages: min 70.9, median 153.9, max 162.8; 0 frame(s) below a spread of 20. Key-light ablation moved the mean by -5.379 (sun DARKENS the frame — unexplained, see limitations). Directional lights in the scene graph with castShadow: 0 of 2 | a light/shadow hierarchy in all 8 main vantages |
| BM-VIS-02 | **fail** | 3 of 8 main vantages see sky in 6 or more of 144 ray-tested cells. Sky R-B over those cells: stacks_yard 0.161, stacks_roof 0.201, stacks_gate 0.077. 3 of 3 have a warm sky. Ground band R-B is warm in 8 of 8 | a cool sky in every frame that contains sky, against a warm ground |
| BM-VIS-03 | not measured | — | no contact-shadow or AO breakage |
| BM-VIS-04 | **fail** | texels per metre over 411 textured meshes: p10 8.2, median 17.2, p90 222.6; p90/p10 ratio 27.14 | p90/p10 ratio below 10 — less than an order of magnitude across the world |
| BM-ANM-02 | not measured | — | force direction and strength legible on every hit |
| BM-ANM-03 | not measured | — | no foot slide or pose pop across transitions |
| BM-HAZ-01 | partial | with the HUD withheld, a 0.15 -> 2.6 gas intensity sweep moved the frame mean luma by 4.539 (77.191 -> 72.652) at the ventfield framing, while the gas field itself moved 44.6 -> 51.4 ppm at the Fenn sample point | 3 or more non-UI cues readable on the real screen |

**2 pass, 2 fail, 3 partial, 0 inconclusive, 3 not measured**, over 10.

`not measured` is not a pass and must never be counted as one. What changed for those three
is not their status but their blocker: they were stalled on "no evidence can be committed at
all", and they are now stalled on a specific, named, buildable piece of apparatus.

---

## Two observations recorded without a mechanism

The critic's symptom calls hold up; its mechanism guesses have not. These are symptoms.
**Do not act on either before testing a cause.**

1. **No directional light in the scene graph has `castShadow` set.** The traversal found
   2 directional lights,
   0 of them casting. `docs/benchmarks.md`
   BM-PRF-05 separately records 417 scene-wide shadow casters. Those two statements are not
   obviously compatible and nobody has reconciled them.
2. **Zeroing every directional light makes the frame brighter.** Mean luma
   75.856 →
   81.235, a delta of
   -5.379. The ablation's job — proving the key light
   reaches the pixels — is satisfied either way. The sign is not explained here.

---

## What each verdict may not be used to claim

- **BM-CAM-01** — Free-flown inspection vantages, not the follow camera under player control in a corridor, and BM-CAM-01 also asks about interiors and tight spots the sweep does not visit. See A6b: the back-face half of the probe is inert in this world, so this verdict rests on the near-plane distance alone.
  - method: 26-ray probe from the real camera transform against the real scene graph; back-face-first hits mean the camera is inside a solid
- **BM-WLD-02** — Visibility is geometric. It does not say the landmark is legible, or that a player would use it to place themselves.
  - method: the five tallest authored buildings, projected into the real camera frustum and ray-tested for occlusion against the real scene
- **BM-WLD-03** — ONE decision measured, not three. The other two (the half-measure and the chapter-4 crisis siting) are not driven here, so this criterion is not yet met — it is now measurable rather than unmeasured.
  - method: the director's own shutVents calls, then the gas field sampled at two fixed points and the same framing re-photographed
- **BM-VIS-01** — Spread is a proxy for hierarchy, not a reading of direction. A frame can have range and still have no dominant direction; nobody has looked at these frames beside a reference. TWO OBSERVATIONS ARE RECORDED WITHOUT A MECHANISM: no directional light in the scene graph has castShadow set, while docs/benchmarks.md BM-PRF-05 records 417 scene-wide shadow casters; and zeroing every directional light makes the frame BRIGHTER, not darker. Both are symptoms. Neither is explained here, and neither should be acted on before it is.
  - method: per-frame luma percentiles from the committed PNGs plus a key-light ablation that proves the sun is the thing making the hierarchy
- **BM-VIS-02** — Cool/warm is mean R minus mean B. It does not judge whether the palette reads as controlled — only that the two halves sit on opposite sides of neutral.
  - method: sky cells identified by casting a ray through each cell of a 24x14 grid and keeping the ones that hit nothing within 900m; colour read from the committed PNG at those cells only
- **BM-VIS-03** — Not attempted. Adding the toggle is the work, and it is a render-side change this run did not make.
  - method: would need an AO/contact-shadow ablation pair; no toggle for either exists in src/render/
- **BM-VIS-04** — Bounding-box span is not UV area. This detects an order-of-magnitude mismatch, not a subtle one, and says nothing about how it reads.
  - method: texture width divided by the largest world-space dimension of each textured mesh
- **BM-ANM-02** — Not attempted this run. The rig exposes named bones and combat is drivable, so the gap is work, not capability.
  - method: would need per-frame victim root and chest-bone sampling across a driven light/heavy hit pair (tools/probe_combat.mjs already drives the hits)
- **BM-ANM-03** — Not attempted this run. Same apparatus as BM-ANM-02.
  - method: would need planted-foot bone world position sampled per fixed step through walk/stop/turn transitions
- **BM-HAZ-01** — A whole-frame luma delta proves the picture responds. It does not separate plume, shimmer and soot into three cues, and it is not a legibility test — no one was asked to read it.
  - method: the same framing photographed at two gas intensities with #ui hidden, compared by whole-frame luma

---

## Limitations of the whole run

- SwiftShader in a container is not a phone. Nothing here is a device result.
- No reference title was run, measured or compared. Every threshold is measured on our own build.
- Every criterion below is a proxy measurement. A number moving is not the same as a frame reading well, and no human has judged these frames beside a reference.
- not-measured means exactly that. It is not a pass and it must not be counted as one.
