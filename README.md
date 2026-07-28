# CINDERLINE

A survival action RPG set in **Hollis** — a condemned industrial city sitting on an
underground fire that has been burning for thirty-one years.

Carbon monoxide and blackdamp pool in the low ground. Rooftops, fire escapes and
plank bridges are survivable; streets, cellars and the Slip are not. Every route
decision in the game is really a decision about air.

You are **Renata Vasko**, forty-one, mine-rescue trained and later a survey
assistant for the authority that was supposed to be putting the fire out.
Eighteen months ago you read a borehole sheet that did not support the boundary
about to be published, and you said nothing. Four months after that, nine people
died in their basements on a street the published line called safe.

You are back because somebody posted you a letter that one of them never sent.

---

## Running it

```bash
npm install
npm run build          # production build into dist/
npm run dev            # build + local server on http://localhost:8080
```

`dist/` is a completely static, self-contained directory. It uses only relative
paths, so it can be served from a domain root or from any subdirectory —
including a GitHub Pages project site at `https://<user>.github.io/<repo>/`.

```bash
npm run build
# then publish the contents of dist/ (a .nojekyll file is included)
```

There is no server component, no analytics, no telemetry, no external requests
of any kind, and no secrets. Open `dist/index.html` through any static host and
the whole game is there.

---

## Controls

### Touch (the primary control scheme)

| | |
|---|---|
| **Left ~42% of the screen** | Movement stick. Touch anywhere in the zone and the stick appears under your thumb — you never have to look for it. Push to full deflection to sprint. |
| **Right ~58% of the screen** | Drag to move the camera. |
| **Tap the right side** | Lock on to the nearest target. Tap again to switch target. Tap with nothing in range to release. |
| **HIT** | Light attack. Tap again during the swing to chain — the input is buffered, so a press during recovery still lands. |
| **HEAVY** | Slow, wide, goes through guards. |
| **ROLL** | Evade with invulnerability frames. Costs stamina. |
| **GUARD** | Hold. Blocking exactly as a blow lands is a parry. |
| **USE** | Fits a fresh filter if the air is bad, applies a dressing if you are hurt. |
| **TALK / TAKE / OPEN / READ / CLIMB** | The contextual button, labelled from what is actually in reach. It has its own slot; GUARD is never taken away from you. |
| **≡ ◈ ☀ ⌁** | Menu, map, headlamp, meter. |
| **The air gauge** | Tap it. That is Ren lifting the meter to read it, and it is the same action as the ⌁ button — placed where you are already looking when the number worries you. |

Left-handed layout, sprint-on-full-stick, hold-vs-toggle guard, camera
sensitivity and lock-on assist are all in Settings.

### Keyboard and mouse

`WASD` move · mouse look · `J` light · `K` heavy · `Space` dodge · `Q` guard ·
`E` interact · `F` use item · `G` read the meter · `R` lamp · `C` crouch ·
`Tab` lock on · `M` map · `Esc` menu

Gamepads are supported (standard mapping).

---

## What is in it

* **A hand-authored district** — the Stacks, Marrow Street, South Marrow, the Cut
  and Vent Field 9 — with five interiors, a nine-metre subsidence hole, roof
  routes, fire escapes, plank bridges, a trench excavation and a borehole field.
* **A carbon monoxide simulation** that diffuses from sources, drifts on a
  turning wind, stratifies with height and pools under cover. It is read through
  a meter in ppm and it governs the player, most enemies, the AI's routing, and
  how far anybody can see.
* **Five enemy archetypes** with genuinely different behaviour, four of which
  breathe — which means luring a crew into the low ground is a real tactic
  against a real opponent.
* **A five-chapter story** with six speaking characters, branching dialogue,
  tracked trust, consequences that arrive chapters after the choice that caused
  them, and five endings with variable epilogues.
* **Progression that changes what you can do**, not how big a number is: eight
  capabilities, each unlocked by a specific diegetic event.

### Everything is generated

There are no art, audio or model assets in this repository, because there are
none in the game. All of it is produced at runtime by code:

| | |
|---|---|
| **Textures** | Drawn on 2D canvases — asphalt, brick, concrete, corrugated steel, rust, plaster, tile, ash, rubble, glass, fabric, painted metal, cloth. Normals are Sobel-derived from generated height fields. All tile seamlessly via periodic value noise. |
| **Buildings** | Parametric, four styles, with punched window reveals, sills, lintels, shopfronts, balconies, cornices, parapets and roof clutter. |
| **Characters** | A twenty-bone skeleton with a skinned mesh lofted along it, and a separate quadruped bind pose for the dogs that shares the same bone names and the same animator. |
| **Animation** | Locomotion is fully procedural from speed and heading, so every intermediate speed has a correct cycle. Attacks, dodges, hit reactions and deaths are hand-authored keyframe clips layered on top, with additive breathing, look-at, lean and cough. |
| **Audio** | Every sound is synthesised in WebAudio. Impacts are filtered noise bursts with pitch envelopes, the ambience is layered pink noise driven by the region and the local gas reading, and the score is generative — a struck-bell voice, a detuned drone and a hammer pulse, crossfading between eleven states. |
| **Reverb** | A generated impulse response, not a loaded one. |

---

## Testing

```bash
npm run validate     # static content validation, no browser needed
npm run test:play    # drive five full playthroughs to five different endings
npm run test:perf    # draw calls, triangles, programs, CPU step cost
npm test             # all of the above
npm run shots        # screenshot sweep of every district
```

**`tools/validate.mjs`** walks the story graph in Node and proves every dialogue
`goto` resolves, every node is reachable, every effect names a real item /
capability / quest / character, every quest step has a trigger the engine can
deliver, every quest is startable, every ending is reachable, and no building
sits in a carriageway.

It checks flags in **both** directions, which is the part that earns its keep. A
flag that is *read* but never set is an unreachable branch. A flag that is *set*
and never read is a dead consequence: a piece of recorded player behaviour the
story promised to remember and then threw away. A choice whose outcome is never
tested is a false choice by definition, and a capability that cannot be unlocked
— or that no gameplay code reads — is an advertised ability that does nothing.
All four fail the build.

The sets of engine-set flags, director hooks and custom trigger ids are
**scraped from the engine source**, not hand-maintained. They used to be
literals, and that is exactly how a quest step shipped with a trigger nothing
fired, and how twenty-six flags shipped that nothing read: a whitelist drifts
silently from the code it describes, and a whitelist that has drifted validates
nothing.

**`tools/playthrough.mjs`** boots the real build in a browser and plays five
complete games — one per ending — through the real quest triggers, the real
dialogue runner and the real condition evaluator. It never writes a flag
directly. If a beat cannot be reached by playing, the test fails.

**`tools/perf.mjs`** reports device-independent cost: draw calls, triangles,
shader programs, texture and geometry counts, world build time, simulation CPU
cost per fixed step, and heap growth in steady state.

**`tools/vantage.mjs`** sweeps eighteen fixed camera positions and writes a PNG
of each with the interface hidden — these are the frames the art critics work
from. **`tools/lumastats.mjs`** measures value distribution and warm/cool
balance on those PNGs, so claims about the image are made against the image.
**`tools/probe_*.mjs`** are single-purpose in-page probes (fire-escape geometry,
the chapter-four escort, rooftop clearance, dark-region ray-picking) run through
`tools/shot.mjs --script`; each exists because a specific defect was easier to
measure than to argue about.

---

## Performance

### Measured

Run `npm run test:perf` to regenerate everything below into `shots/perf.json`.
At a 667 × 375 CSS-pixel viewport, device pixel ratio 2, medium tier:

| | |
|---|---|
| Production build | 1.19 MB JavaScript, 42 KB CSS, 1.2 MB total. No images, no fonts, no audio files, no network requests after load. |
| World geometry | 244 346 triangles in 43 spatial chunks |
| Collision volumes | 1 067 boxes in a uniform spatial hash |
| Simulation step, 8 actors | mean 0.334 ms, p50 0.100, p90 1.000, p99 3.900 (rendering excluded) |
| Heap over 4 s / 27 000 steps | 141.1 MB → 141.1 MB, 0 KB/s — no steady-state growth |
| Characters | ~950 triangles each; a seven-enemy fight adds ~6 000 |

Draw calls and triangles per frame, across eight representative vantages and
all three quality tiers:

| tier | draw calls | triangles | programs |
|---|---|---|---|
| low | 45–133 | 29 000–152 000 | 38–68 |
| medium | 126–309 | 60 000–327 000 | 45–66 |
| high | 157–367 | 80 000–241 000 | 58–60 |

Medium is where the tier heuristic starts; it steps down automatically on the
90th-percentile frame time. The draw-call count on medium is higher than is
comfortable and is the first thing to attack if a real device turns out to
struggle — the honest position is that nobody knows yet, because see below.

Detail is culled per chunk at `drawDistance` (78 / 104 / 145 m by tier) while
the far plane sits at the horizon (380 / 520 / 680 m), so the backdrop massing
is visible from a roof without the city behind you being submitted.

Image measurements, from `tools/lumastats.mjs` over the vantage sweep — these
are read off real captured frames, not inferred from the code:

| | |
|---|---|
| Interquartile luma range | 11–135 across all eighteen vantages, median 49. A flat image measures near zero; the street frames measured 12–19 before the art pass. |
| Pure black | 0% in eleven of eighteen frames; the worst is 9.1%, in a courtyard at night under a smoke ceiling. |
| Cool pixels | 0–37%. Zero only where no sky is in frame — an enclosed courtyard, a corridor-like street, the works — which is correct; every frame with sky in it is 6–37% cool. |

Two vantages are still weak and are named rather than smoothed over: `survey`
(IQR 11) is a camera pointed at one flat wall, and `slip_bottom` (IQR 16) is
the bottom of a pit where the fog legitimately owns most of the frame but the
result is duller than it should be.

### Not measured

**This project has never been run on an iPhone SE (3rd generation), or on any
other physical device.** No such hardware was available in the environment it
was built in. Every frame-rate figure obtainable here comes from SwiftShader — a
software rasteriser — and would be worthless as a prediction of phone
performance, so no fps number is quoted anywhere in this repository. The perf
harness deliberately refuses to print one.

What *has* been done is to hold the device-independent costs inside budgets an
A15-class GPU handles comfortably: draw calls under ~160, triangles under
~160 k per frame, 18 shader programs, three quality tiers with automatic
adaptation driven by the 90th-percentile frame time, a bloom chain skipped
entirely on the low tier, and a render-scale multiplier of 0.72–1.0 on top of a
device-pixel-ratio clamp.

**The 30 fps target on an iPhone SE 3 is a design target, not a measurement.** It
should be verified on the device before any claim is made about it.

---

## Compatibility

* iOS Safari 15+ and Android Chrome 90+, landscape.
* Renders through WebGL 2 where available and WebGL 1 otherwise. HDR bloom needs
  a half-float render target; where that is unavailable the chain degrades to an
  8-bit path automatically rather than failing.
* Handles: safe-area insets, simultaneous touches, focus loss, tab visibility,
  orientation change, WebGL context loss and restore, audio interruption, and
  private-browsing storage failure (the game continues and reports it rather
  than dying).
* Saves to `localStorage`. Progress is written on every quest completion, every
  conversation, every item taken, and on a 90-second autosave; it restores
  position, vitals, filter state, world state and the full story graph.

---

## Known limitations

* **No physical-device testing.** See above. This is the single most significant
  gap in the project.
* **The escort routes are not proven end to end by an automated test.** Chapter
  four requires walking four people up out of the smoke, and chapter two
  requires walking Nessa up. The harness verifies the completion condition
  against real geometry and real gas sampling, and the fire-escape probe proves
  every platform reaches the next from street to roof — but no test proves a
  climbable route exists from each specific survivor to breathable air. A human
  has to check that, and it is called out in `tools/driver.js` rather than
  papered over.
* **Some measurements here were wrong before they were right.** Three harness
  faults were poisoning the visual numbers: the vantage sweep photographed the
  world with the title screen up, so an interface scrim was being read as
  crushed shadows, and *two* of the vantages were pointed at a wall a few
  metres away. Three separate lighting changes were made against one of those
  frames before a ray-pick established there was nothing wrong with the
  lighting. The sweep hides the interface now and both vantages are placed by a
  clearance probe, but it is worth knowing that the instrument can be the thing
  that is broken.
* **Melee combat did not work at all until very late in the project**, and the
  five-path playthrough suite passed the entire time it did not — because the
  driver killed enemies by calling `damage()` directly and never once pressed
  attack. The lesson generalises: a test that never performs the verb cannot
  notice that the verb does nothing. `tools/probe_combat.mjs` exists to stop
  that particular hole reopening, but there are certainly others.
* **Getting all four survivors out of the chapter-four crisis is hard and is
  not guaranteed by the tests.** The harness asserts the escort works and the
  chapter resolves; how many people you save is a skill outcome, and the story
  reads every value of it.
* Interiors are reached through a fade-and-teleport rather than being seamlessly
  attached to their exteriors. They are real geometry in the same scene, built
  in a reserved strip of world space, which keeps them dense and correctly lit —
  but you do see a fade at the door.
* Dogs share the humanoid animator through a quadruped bind pose. It reads
  correctly in motion, but a dedicated gait would be better.
* Enemies do not use ladders or fire escapes. This is deliberate — the rooftops
  are meant to be the player's advantage — but it means a determined player can
  disengage from any fight by climbing.
* The city is one contiguous district, not a metropolis. Breadth was traded for
  density on purpose.

---

## Licences

The game's own content — code, all generated art and audio, the story, the
characters and their dialogue — is original work created for this project.

Third-party dependencies are build- and test-time only; **none of them ships any
asset into the game**. Their licences are reproduced in
[`THIRD-PARTY.md`](THIRD-PARTY.md):

| Package | Licence | Used for |
|---|---|---|
| [three.js](https://threejs.org) | MIT | Rendering (the only runtime dependency) |
| [esbuild](https://esbuild.github.io) | MIT | Bundling |
| [Playwright](https://playwright.dev) | Apache-2.0 | Automated test harness (dev only) |

No fonts are downloaded; the interface uses the platform's own system stack.
