# Schemas

Versioned, machine-checkable contracts for the canonical operating records. They are plain JSON
Schema documents restricted to the subset implemented by `tools/lib/schema.mjs`, so that
`npm run validate:ops` runs from a clean checkout with no dependency beyond Node.

| Schema | Validates | Applied by |
|---|---|---|
| `state.v1.schema.json` | `AI_DEVELOPMENT/STATE.yaml` | `tools/check_operating_state.mjs` |
| `requirements.v1.schema.json` | `AI_DEVELOPMENT/REQUIREMENTS.yaml` (requirements + acceptance criteria) | `tools/check_operating_state.mjs` |
| `work-graph.v1.schema.json` | `AI_DEVELOPMENT/WORK_GRAPH.yaml`, including the embedded task contract of every active leaf | `tools/check_operating_state.mjs` |
| `capabilities.v1.schema.json` | `AI_DEVELOPMENT/CAPABILITIES.yaml` | `tools/check_operating_state.mjs` |
| `policies.v1.schema.json` | `AI_DEVELOPMENT/POLICIES.yaml` | `tools/check_operating_state.mjs` |
| `ledger-event.v1.schema.json` | every line of `AI_DEVELOPMENT/LEDGER.jsonl` | `tools/check_operating_state.mjs` |
| `gate-result.v1.schema.json` | the `gate` payload of a `gate_result` ledger event | `tools/check_operating_state.mjs` |
| `evidence-record.v1.schema.json` | the `evidence` payload of an `evidence` ledger event | `tools/check_operating_state.mjs` |
| `checkpoint.v1.schema.json` | the `checkpoint` payload of a `checkpoint` ledger event | `tools/check_operating_state.mjs` |
| `handoff.v1.schema.json` | `AI_DEVELOPMENT/HANDOFFS/*.json` | `tools/check_operating_state.mjs` |

## Versioning

A schema file name carries its major version. Records declare the version they were written
against (`schema_version`, or `schema_versions` for the multi-part canonical files). A breaking
change means a new `*.vN.schema.json` file plus a migration of the records that use it; the old
file stays so archived records remain checkable.

## Deliberate looseness

`handoff.v1.schema.json` allows additional properties. The four preserved `GB-IMP06` handoffs each
carry different optional sections (`allowed_scope` vs `input_artifacts`, `invariants`,
`known_results_to_distrust_and_reproduce`, …). Requiring a fixed field set would have meant either
rejecting real history or editing evidence to fit a schema written after the fact. The required
core is the part every handoff must have to be actionable.

## Status vocabularies

Two vocabularies are fixed across schemas and must not be widened casually.

- Work-node status: `proposed`, `accepted`, `ready`, `active`, `blocked`, `awaiting_verification`,
  `under_review`, `verified`, `partial_verified`, `rejected`, `deferred`, `superseded`, `archived`.
- Gate status: `passed`, `failed`, `blocked`, `not_applicable`, `prepared_not_executed`,
  `inconclusive`. There is no seventh value, and in particular there is no value that lets an
  unexecuted check count as a pass.

Epistemic status is a third fixed vocabulary: `user_requirement`, `verified_fact`,
`accepted_decision`, `proposal`, `assumption`, `hypothesis`, `generated_suggestion`,
`unverified_claim`.
