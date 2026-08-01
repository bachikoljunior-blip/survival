# M.1 Minimal infrastructure bootstrap

## Trigger

A missing capability directly blocks a real requirement, verification method,
recovery need, or recurring workflow.

## Content

Possible infrastructure includes bootstrap scripts, version locks, build
commands, test runners, schema checks, linting or type checks, fixtures,
deterministic seeds, virtual clocks, browser or engine harnesses, logging,
profiling, snapshots, rollback tools, CI, release automation, and migration
utilities.

Use the smallest reliable foundation.

Before infrastructure work, define:

- the capability it must provide;
- the requirement or risk it serves;
- a bounded effort or iteration budget;
- a smoke check;
- and a stop condition.

Do not allow infrastructure work to become an open-ended substitute for product
progress.

When the missing capability is the only way to satisfy F3, F6, or an F9 gate for
the active objective, treat building it as P3 rather than optional.

## Stop condition

Stop when the required capability exists and passes; or a simpler substitute is
sufficient; or marginal value falls below critical-path product work; or repeated
failure exposes a false assumption; or an external blocker prevents useful
continuation.
