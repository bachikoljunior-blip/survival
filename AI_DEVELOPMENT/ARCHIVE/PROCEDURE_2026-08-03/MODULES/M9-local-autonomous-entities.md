# M.9 Local autonomous-entity behavior

## Trigger

The actual product requires persistent autonomous characters, agents, creatures,
organizations, simulated users, or equivalent entities.

**Do not add autonomous entities merely because this module exists.**

## Content

The default shipped behavior should be local, testable, and deterministic where
practical.

Represent relevant state structurally: identity, goals, needs, beliefs, known and
unknown facts, relationships, recent events, important memories, plans,
schedules, allowed actions, prohibited actions, location, and resources.

Use locally executable systems such as finite-state machines, behavior trees,
utility systems, planning, schedules, influence maps, weighted rules, dialogue
graphs, and deterministic templates.

Protect canon, mandatory events, secrets, progression, impossible actions,
resource limits, role restrictions, and location restrictions through a
deterministic authority layer.

Language models may be used only when practical, licensed, explicitly allowed,
within performance and cost limits, and optional or backed by a deterministic
fallback. **Core shipped behavior must not require an external AI provider unless
the user explicitly authorizes it.**

Persist entity state through the real save system where applicable.

Test relevant behavior such as memory persistence and decay, relationships,
conflicting goals, interrupted plans, save and reload, deterministic replay,
invalid-action prevention, protected facts, long simulation, and maximum expected
entity count.

Measure CPU, memory, storage, and update cost where relevant.

## Stop condition

Deactivate when the entities behave within their authority layer and their state
survives save, reload and deterministic replay.

## Project note

CINDERLINE's NPCs and enemies are already deterministic and local
(`src/game/ai.js`, `src/game/director.js`). Entity state persists through the
real save system, which is now versioned and migrated. No external provider is
involved and none may be added.
