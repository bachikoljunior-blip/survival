# The iPhone SE 3 round

Two tiers of automated phone testing, plus the comparison step that turns them into a round.

## What already existed, and what was added

| Tier | What it proves | Where it lives here | Status |
|---|---|---|---|
| 1 — Playwright WebKit, ubuntu | 667×375, DPR 2, touch, Mobile Safari UA, layout, interaction, persistence, no page errors, screenshot diff | `tools/test-iphone-webkit.mjs`, run by `.github/workflows/gates.yml` and `pages.yml` | already on `main` |
| 2 — iPhone SE 3 simulator + Appium, macOS | the same paths in real iOS Safari, with trusted multi-touch and real orientation changes | `tools/test-ios-safari.mjs`, run by `.github/workflows/pages.yml` | already on `main` |
| 3 — round comparison | that this round is not **worse** than the last one | `.kit/tools/compare-round.mjs` + `iphone-se3-round.config.json`, run by `.github/workflows/iphone-se3-round.yml` | added |

Tier 3 is the part that was missing. Tiers 1 and 2 judge the current run against fixed limits
— a frame-gap hang guard at 5000 ms, a screenshot diff ratio at 0.15, a triangle ceiling.
Those catch a build that broke. None of them catches a build that got worse: boot climbing
from 900 ms to 2.4 s and p95 frame gap from 18 ms to 39 ms passes every one, because every one
was set loose enough not to flake on a shared runner.

## Running one round

```bash
npm run round:iphone            # drive the phone surface, then judge it against the record
npm run round:iphone:selftest   # watch every refusal fire on a deliberately broken round
```

First time, there is nothing to compare against, and the comparison says so rather than
passing:

```bash
node .kit/tools/compare-round.mjs --config=iphone-se3-round.config.json --bootstrap
git add tests/baselines/iphone-se3-round.json
```

**Bootstrap on the apparatus that will judge later rounds** — CI, on WebKit. No baseline is
committed here yet for exactly that reason: the one recorded while verifying this layer was
measured under the Chromium surrogate, and the surrogate is not the same machine.
`.github/workflows/iphone-se3-round.yml` has a `bootstrap` input that records it on the runner
and uploads it as an artifact to commit. The comparison refuses a cross-browser or
cross-orientation comparison outright rather than producing a confident verdict about nothing,
and that refusal was watched firing on this repository's own two recorded rounds.

When a round is slower on purpose — a feature landed and its cost was reviewed and accepted —
that decision is recorded, not silenced:

```bash
node .kit/tools/compare-round.mjs --config=iphone-se3-round.config.json --accept
```

## What the comparison refuses to do

Each refusal is a failure already on record in these repositories, not a hypothetical:

- **Compare a round against itself.** This repository already shipped an equivalence battery
  that compared its validator against its own output and passed vacuously.
- **Treat a metric that vanished as a metric that passed.** A silently inert gate and a
  passing gate both print nothing and exit 0.
- **Accept byte-identical timings as a new measurement.** Two real runs do not reproduce
  milliseconds exactly; if every metric matches, the report was copied.
- **Score a failed run.** A harness that aborted at step three reports a very fast boot.
- **Return a pass when nothing was compared.** A config naming only metrics the harness does
  not emit would otherwise produce a green tick that means nothing.

## What none of this is evidence for

Playwright reproduces the viewport, DPR, touch emulation and user agent of an iPhone SE 3. It
runs on a datacentre CPU with a software rasteriser and reproduces none of the phone's
performance. Measured in this container, this repository's own harness under the SwiftShader
surrogate reported a **1333 ms median frame gap — 0.75 FPS**. The simulator tier is closer,
because it is real iOS and real Safari, but it is still a Mac.

So neither tier may be cited for: sustained 30 FPS on the device, thermal throttling, memory
pressure causing a Safari tab reload, GPU load, real-glass multi-touch, or audio latency.
Those need the physical phone. The comparison exists precisely because the absolute number is
unavailable and the relative one is not.
