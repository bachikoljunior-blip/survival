# M.4 Independent user-surface testing

## Trigger

The project has an interactive surface and user behavior is material to
acceptance.

## Content

Test through actual interaction whenever possible.

Cover only the cases relevant to the product and risk, which may include normal
use, invalid use, edge states, interruption, recovery, repeated input, rapid
input, simultaneous input, long duration, small screens, touch, orientation
changes, offline operation, degraded conditions, loading, and failure states.

For material findings, record enough to reproduce: starting state, actions,
expected result, observed result, environment, severity, and required retest.

After repair, repeat the relevant failing case.

If execution is unavailable, prepare the cases and harness but record them as
`prepared_not_executed`.

## Stop condition

Deactivate when the relevant surfaces have been exercised and failing cases have
been repaired and retested.

## Project note

The product is mobile web at 667x375. `tools/` already contains Playwright
harnesses; `tools/save_migration.mjs` drives real touch taps at real on-screen
coordinates. Blocker B1 stands: SwiftShader Chromium is not a physical device.
