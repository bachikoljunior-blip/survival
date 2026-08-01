# Kit rollout

The single record for the shared-kit rollout, including what remains and the traps, is
`KIT_ROLLOUT.md` in the `game2` repository. Do not start a second one here.

This repository carries the kit at `.kit/`; `npm run check:kit` verifies it against the
install ledger written at install time. The nine skills in `.claude/skills/` are loaded
automatically by a session opened here.

The harness now uses the kit: `tools/{shot,perf,playthrough,vantage}.mjs` share
`.kit/lib/browser/serve.mjs` instead of carrying four copies of the same static server, and
`tools/lumastats.mjs` decodes through `.kit/lib/image/png.mjs` rather than booting Chromium
to borrow a 2D canvas. The measurement behind that is in `KIT_ROLLOUT.md`.

Two things it measured that anyone touching this rig needs first:

- **The vantage sweep is not deterministic.** Two runs of the *same* code against one
  byte-identical `dist/` differ on 11 of 18 frames. A single before/after pair proves
  nothing — run the old code twice and require old-vs-new to be smaller than old-vs-old.
- **`v-cinder_line` renders 100% black in roughly two runs out of three**, and drops from
  105 draws to 73 when it does. It predates the kit swap. Do not read that frame as evidence
  of anything until it is fixed.
