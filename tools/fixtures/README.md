# tools/fixtures

Inputs for tests that need data this build did not write.

## `save-v1.json`

A save file in the format the **published** build writes, used by
`tools/save_migration.mjs` to prove that a real player's progress survives a
version change instead of being discarded.

It is not hand-authored. `node tools/make_save_v1_fixture.mjs` checks out
`src/game/state.js` and `src/core/util.js` at commit `cc96f3a` — the build live
on GitHub Pages — runs a playthrough's worth of state through that build's own
mutators, calls that build's own `Storage.save()`, and writes back the exact
string it put in `localStorage`. The generator refuses to write unless the old
build can read the result.

The blob is not byte-stable: `serialise()` stamps `Date.now()`. Everything else
is deterministic, and `node tools/make_save_v1_fixture.mjs --check` (part of
`npm run test:save`) compares everything else, so the fixture cannot drift
without someone deciding it should.

Regenerate it only when the published-build reference itself moves, and say so
in the commit message — a fixture that quietly follows the current code stops
being an old-version fixture.
