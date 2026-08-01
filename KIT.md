# Kit rollout

The single record for the shared-kit rollout, including what remains and the traps, is
`KIT_ROLLOUT.md` in the `game2` repository. Do not start a second one here.

This repository carries the kit at `.kit/`; `npm run check:kit` verifies it against the
install ledger written at install time. The nine skills in `.claude/skills/` are loaded
automatically by a session opened here.

Still outstanding for this repository: the four duplicated static servers in
`tools/{shot,perf,playthrough,vantage}.mjs` and `tools/lumastats.mjs` have not been replaced.
That step needs a real before/after capture, not an inspection.
