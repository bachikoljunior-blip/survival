# CINDERLINE

A survival action RPG for mobile web, in a city built over a coal-seam fire that will not go out.
Static build, relative paths, one runtime dependency (`three`), zero external assets, zero network
requests.

```sh
npm ci            # five locked packages
npm run dev       # build and serve
npm run validate  # story and world graph
npm test          # full gate suite
```

<!-- BEGIN PERSISTENT-DEVELOPMENT LOADER — managed block, protocol 2.0.0 -->

## Persistent development

Before substantial work in this repository, read `START_HERE.md`, reconcile its canonical state
with the actual working tree, GitHub state and test evidence, then resume from the last verified
checkpoint before selecting new work. Load archive and conditional modules only when relevant.
Latest explicit user instructions and verified reality take precedence.

The full protocol is `AI_DEVELOPMENT/PROTOCOL.md`. Do not inline it here, and do not read it in
full unless you need the rule behind a specific step.

**If you were started by `.github/workflows/autopilot.yml`**, that workflow's prompt is your
instruction and it still bounds your scope: do only the 次の3アクション in `docs/STATE.md`, on the
`autopilot/run-*` branch, and stop. This file is loaded automatically and does not widen that.
Read `START_HERE.md` and `AI_DEVELOPMENT/STATE.yaml` — together about 10 KB — to learn where the
last run stopped, then work. Skip `PROTOCOL.md` unless a rule is genuinely in question; the round
is capped at 25 turns and reading it costs more than it returns. Update `docs/STATE.md` before you
finish, keeping its `state_revision` comment intact, and bump that revision in
`AI_DEVELOPMENT/STATE.yaml`, `WORK_GRAPH.yaml`, `REQUIREMENTS.yaml`, `CAPABILITIES.yaml` and
`POLICIES.yaml` together if you change state — `npm run validate:ops` requires all six to match and
the Pages deploy fails if they do not.

<!-- END PERSISTENT-DEVELOPMENT LOADER -->
