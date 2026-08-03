# CINDERLINE

<!-- ELEMENT-COMPARISON-RULES v1 — set by user instruction, 2026-08-02. -->
## Elements, references, and blind comparison

**These rules are the goal. Everything else about how you work is yours.** The user's latest
explicit instruction outranks them, including this file. A stated concept replaces the
recorded one; it is not merged with it.

### The goal

**Every element reads `satisfied`** — for each part of the concept, a judge shown this build
and its reference work unlabelled does not pick the reference.

Verdicts use three words and no others: `satisfied`, `not satisfied`, `not measured`. Never a
word stronger than the evidence. `not measured` is respectable, and not the end.

### What counts as an element

**An element is one part of the concept, cut so it can be compared against a reference work.**

1. **Take the parts from the concept.** Not from the genre, and not from the build — what
   exists in the build is evidence of what was made, not of what the concept asks for.
2. **Take the largest grouping that can still be compared** — this build and a reference set
   side by side on it, as images, video or text.
3. **Check the finished list against the concept as a whole.** Every part of the concept must
   be covered by some element.

**Too few is a defect. Too many is fine.**

**Where nothing compares an element yet, work out a way to compare it.** That is the job, not
a reason to leave it.

### Selecting a reference work for each element

Every element gets its own reference: the shipped work that sets the bar for **that element
alone**. Four axes, and a replacement must be at least as strong on all four.

1. **The quality of that element in that work** — judged on the element by itself. A
   celebrated game with an ordinary version of this element does not qualify on its fame.
2. **Expert and player reception** — what critics and players actually said, from published
   reviews and aggregates. Reading an aggregate is not playing the game, and the record says
   so wherever that distinction matters.
3. **Long-term reputation** — still held up as the bar years later, rather than praised in its
   launch window and since overtaken.
4. **Fit to this concept** — that element in that work is solving the same problem this
   concept has. A brilliant solution to a different problem is not our bar.

**Device class and production scale are deliberately not axes.** The bar is what the element
should be, not what is convenient to reach here. A reference out of reach at this scale is a
recorded shortfall, never a reason to pick a weaker reference.

Change a reference only when it stops fitting the concept — never because another title became
interesting. Record the reason.

### Blind comparison is how an element is judged

- **Material.** The real reference work and the build under development, as **images, video
  and text**. Not recollection, not an official description, not a review score, not a pixel
  metric standing in for a comparison. Fetching reference material for this is allowed, and it
  may be stored in this public repository.
- **Blind.** The judge is in a state where **which side is which cannot be worked out at
  all.**
- **The question.** Shown these unlabelled, which is stronger on this element alone.
- **The verdict.** **The judge picking the reference is the only failing answer.** Ours, or a
  tie, and the element is `satisfied`.

A comparison that could not be run is `not measured`, and the job is then to work out a way to
compare it.

**Never build a reference work's content into the game.** Its art, models, audio, text,
levels, layout, icons, HUD or fiction may not be copied or near-copied into what ships, and no
reference is named there. **Holding that material and comparing against it is fine** — that is
what it is for.

### When the work is finished

**An element that is not `satisfied` keeps the work open.** Nothing finishes while any element
is unmet — not when the round feels done, not when the findings get smaller, and not when the
ones left over look hard. **How you get from there to `satisfied` is yours.**

### What runs once, and not every time

**Deriving the elements and choosing their references is not part of ordinary quality work.**
It runs once, the first time these rules are applied here, and again only when the concept
changes. Re-opening the element list or swapping a reference because a comparison went badly
moves the target instead of the build.

**When the concept changes:** re-derive the elements; an element that left the concept is
retired, and retiring is not weakening; re-check each surviving reference under the four axes;
re-derive the affected criteria. Making a criterion stricter is free. Weakening one needs proof
it is unreachable as written, stored as evidence — never to reach a pass.

### One unit of work

**A unit starts on the user's instruction and ends when a blind comparison you launched
completes.** Everything in between is yours: what to repair, in what order, and when to launch
the comparison. How many units — a number or continuously — is `work.units_requested` in
`AI_DEVELOPMENT/STATE.yaml`. Nothing recorded means one.

### Real hardware is out; the phone gates stand in for it

Playwright WebKit and iOS Simulator Mobile Safari are the phone surface. **What they measure is
judged normally.** What they cannot measure but can be reasoned from what they do **is
reasoned, and the reasoning has to satisfy the criterion. It is written as reasoning, never as
a measurement.** **Nothing is ruled permanently out of reach.**
<!-- /ELEMENT-COMPARISON-RULES -->

A survival action RPG for mobile web, in a city built over a coal-seam fire that
will not go out. Everything — textures, audio, models, animation — is generated
at runtime from the code in this repository. There are no external assets and no
network requests.

<!-- BEGIN PROJECT OPERATING PROTOCOL (v2.2) — managed block, do not delete -->

At the start of every Claude Code run for this repository, read `START_HERE.md`,
load the minimum relevant durable state, verify it against the actual working
tree, GitHub state, runtime, deployment, and test evidence, and resume from the
last verified checkpoint. Apply the mandatory floor in full, and the lowest
sufficient level of rigor above it. Load protocol detail and module files only
when the active work reaches them. End the run with the floor check line.

- Canonical state: `AI_DEVELOPMENT/STATE.yaml`
- Full protocol and the floor in full: `AI_DEVELOPMENT/PROTOCOL.md`
- On-demand modules: `AI_DEVELOPMENT/MODULES/` (load only when a trigger fires)

Uncertain whether a floor trigger fired? It fired. Perform the obligation.

<!-- END PROJECT OPERATING PROTOCOL (v2.2) -->

## Working rules that predate the protocol and still hold

- Investigate the existing repository before editing. Preserve unrelated work.
- Do not stop at a plan, a design document, a mock-up or a menu.
- Do not substitute prose about what a feature would do for the feature.
- Do not hide an unfinished thing behind "future work".
- **Never fabricate an asset, test, measurement, screenshot, comparison or
  completion claim.**
- Keep the game runnable throughout. `main` must always work.
- Integrate in small steps and verify in small steps.
- Evidence outranks self-assessment.
- `README.md` is not a design authority. It is an implementer's self-report and
  has been found to contradict the implementation.
