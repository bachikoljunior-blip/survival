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
| **USE** | Contextual: fits a fresh filter if the air is bad, applies a dressing if you are hurt. Becomes an interact button when something is in reach. |
| **≡ ◈ ☀** | Menu, map, headlamp. |

Left-handed layout, sprint-on-full-stick, hold-vs-toggle guard, camera
sensitivity and lock-on assist are all in Settings.

### Keyboard and mouse

`WASD` move · mouse look · `J` light · `K` heavy · `Space` dodge · `Q` guard ·
`E` interact · `F` use item · `R` lamp · `C` crouch · `Tab` lock on · `M` map ·
`Esc` menu

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
capability / quest / character, every flag that is read is set by something,
every quest step has a trigger the engine can deliver, every quest is startable,
every ending is reachable, and no building sits in a carriageway.

**`tools/playthrough.mjs`** boots the real build in a browser and plays five
complete games — one per ending — through the real quest triggers, the real
dialogue runner and the real condition evaluator. It never writes a flag
directly. If a beat cannot be reached by playing, the test fails.

**`tools/perf.mjs`** reports device-independent cost: draw calls, triangles,
shader programs, texture and geometry counts, world build time, simulation CPU
cost per fixed step, and heap growth in steady state.

---

## Performance

### Measured

Run `npm run test:perf` to regenerate everything below into `shots/perf.json`.
At a 667 × 375 CSS-pixel viewport, device pixel ratio 2, medium tier:

| | |
|---|---|
| World geometry | ~270 000 triangles total, in 57 spatial chunks |
| Drawn per frame | 22–160 draw calls depending on the vantage |
| Shader programs | 18 |
| Collision volumes | ~1 000 boxes in a uniform spatial hash |
| Shared materials | 18 |
| Characters | ~950 triangles each; a seven-enemy fight adds ~6 000 |
| Simulation step | measured with rendering excluded; see `shots/perf.json` |

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
