#!/usr/bin/env node
/**
 * Validate the canonical operating records under AI_DEVELOPMENT/.
 *
 * Protocol 2.0.0. This replaces the version-1 checker that validated
 * PROJECT_STATE.json and SESSION_STATE.json; those records now live, immutable, in
 * AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/legacy/.
 *
 * What it enforces, beyond schema conformance:
 *   - one state revision across every canonical record and docs/STATE.md
 *   - one work graph: unique ids, real parents, real dependencies, no cycles
 *   - a task contract on every selectable leaf
 *   - exactly one active leaf, and STATE.yaml agreeing with it
 *   - the derived frontier really is derived — it is recomputed and compared
 *   - two-way requirement traceability, so a criterion cannot lose its coverage silently
 *   - an append-only ledger with contiguous sequence numbers and validated payloads
 *   - every referenced evidence, archive and authority path exists
 *   - the legacy operating system is not active alongside this one
 *   - no secret-shaped strings in the committed operating records
 *
 * Usage: node tools/check_operating_state.mjs [--verbose]
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseYaml, parseJsonl, YamlError } from './lib/yaml.mjs';
import { validate } from './lib/schema.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const AID = join(ROOT, 'AI_DEVELOPMENT');
const VERBOSE = process.argv.includes('--verbose');

const errors = [];
const warnings = [];
const fail = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

const rel = (path) => relative(ROOT, path).split('\\').join('/');
const exists = (path) => typeof path === 'string' && path !== '' && existsSync(join(ROOT, path));

function loadYaml(name) {
  const path = join(AID, name);
  if (!existsSync(path)) {
    fail(`missing canonical record AI_DEVELOPMENT/${name}`);
    return null;
  }
  try {
    return parseYaml(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`AI_DEVELOPMENT/${name}: ${error instanceof YamlError ? error.message : error}`);
    return null;
  }
}

function loadSchema(name) {
  const path = join(AID, 'SCHEMAS', name);
  if (!existsSync(path)) {
    fail(`missing schema AI_DEVELOPMENT/SCHEMAS/${name}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`AI_DEVELOPMENT/SCHEMAS/${name} is not valid JSON: ${error.message}`);
    return null;
  }
}

function applySchema(label, value, schema) {
  if (!schema || value === null || value === undefined) return;
  for (const problem of validate(value, schema, label)) fail(problem);
}

// ---------------------------------------------------------------- load

const state = loadYaml('STATE.yaml');
const graph = loadYaml('WORK_GRAPH.yaml');
const requirements = loadYaml('REQUIREMENTS.yaml');
const capabilities = loadYaml('CAPABILITIES.yaml');
const policies = loadYaml('POLICIES.yaml');

const schemas = {
  state: loadSchema('state.v1.schema.json'),
  graph: loadSchema('work-graph.v1.schema.json'),
  requirements: loadSchema('requirements.v1.schema.json'),
  capabilities: loadSchema('capabilities.v1.schema.json'),
  policies: loadSchema('policies.v1.schema.json'),
  ledgerEvent: loadSchema('ledger-event.v1.schema.json'),
  gateResult: loadSchema('gate-result.v1.schema.json'),
  evidenceRecord: loadSchema('evidence-record.v1.schema.json'),
  checkpoint: loadSchema('checkpoint.v1.schema.json'),
  handoff: loadSchema('handoff.v1.schema.json'),
};

if (errors.length) report();

applySchema('STATE.yaml', state, schemas.state);
applySchema('WORK_GRAPH.yaml', graph, schemas.graph);
applySchema('REQUIREMENTS.yaml', requirements, schemas.requirements);
applySchema('CAPABILITIES.yaml', capabilities, schemas.capabilities);
applySchema('POLICIES.yaml', policies, schemas.policies);

if (errors.length) report();

// ---------------------------------------------------------------- revision

const stateMdPath = join(ROOT, 'docs', 'STATE.md');
let humanRevision = null;
if (!existsSync(stateMdPath)) {
  fail('docs/STATE.md is missing');
} else {
  const match = readFileSync(stateMdPath, 'utf8').match(/<!--\s*state_revision:\s*(\S+)\s*-->/);
  if (!match) fail('docs/STATE.md has no state_revision marker');
  else humanRevision = match[1];
}

const revisions = {
  'STATE.yaml': state.state_revision,
  'WORK_GRAPH.yaml': graph.state_revision,
  'REQUIREMENTS.yaml': requirements.state_revision,
  'CAPABILITIES.yaml': capabilities.state_revision,
  'POLICIES.yaml': policies.state_revision,
  'docs/STATE.md': humanRevision,
};
const distinct = new Set(Object.values(revisions).filter((value) => value !== null));
if (distinct.size > 1) {
  fail(`state revision mismatch: ${Object.entries(revisions).map(([k, v]) => `${k}=${v}`).join(', ')}`);
}

// ---------------------------------------------------------------- work graph

const nodes = graph.nodes || [];
const byId = new Map();
for (const node of nodes) {
  if (byId.has(node.id)) fail(`WORK_GRAPH.yaml: duplicate node id ${node.id}`);
  byId.set(node.id, node);
}

const roots = nodes.filter((node) => node.parent === null);
if (roots.length !== 1) fail(`WORK_GRAPH.yaml: exactly one root node must have parent null; found ${roots.length}`);

const childrenOf = new Map();
for (const node of nodes) {
  if (node.parent === null) continue;
  if (!byId.has(node.parent)) {
    fail(`WORK_GRAPH.yaml: ${node.id} has missing parent ${node.parent}`);
    continue;
  }
  if (!childrenOf.has(node.parent)) childrenOf.set(node.parent, []);
  childrenOf.get(node.parent).push(node.id);
}

// parent chains must terminate at the root
for (const node of nodes) {
  const seen = new Set([node.id]);
  let cursor = node.parent;
  while (cursor !== null && cursor !== undefined) {
    if (seen.has(cursor)) {
      fail(`WORK_GRAPH.yaml: parent cycle at ${node.id}`);
      break;
    }
    seen.add(cursor);
    const parent = byId.get(cursor);
    if (!parent) break;
    cursor = parent.parent;
  }
}

for (const node of nodes) {
  for (const dependency of node.dependencies || []) {
    if (dependency === node.id) fail(`WORK_GRAPH.yaml: ${node.id} depends on itself`);
    else if (!byId.has(dependency)) fail(`WORK_GRAPH.yaml: ${node.id} has missing dependency ${dependency}`);
  }
  for (const path of node.evidence || []) {
    if (!exists(path)) fail(`WORK_GRAPH.yaml: ${node.id} evidence path does not exist: ${path}`);
  }
  for (const path of node.archive_refs || []) {
    if (!exists(path)) fail(`WORK_GRAPH.yaml: ${node.id} archive ref does not exist: ${path}`);
  }
}

// dependency cycles
{
  const visiting = new Set();
  const done = new Set();
  const visit = (id, trail) => {
    if (visiting.has(id)) {
      fail(`WORK_GRAPH.yaml: dependency cycle ${[...trail, id].join(' -> ')}`);
      return;
    }
    if (done.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependencies || []) visit(dependency, [...trail, id]);
    visiting.delete(id);
    done.add(id);
  };
  for (const node of nodes) visit(node.id, []);
}

const isLeaf = (id) => !(childrenOf.get(id) || []).length;
const SELECTABLE = new Set(['active', 'ready', 'blocked']);

for (const node of nodes) {
  const leaf = isLeaf(node.id);
  if (leaf && SELECTABLE.has(node.status)) {
    if (!node.contract) fail(`WORK_GRAPH.yaml: selectable leaf ${node.id} (${node.status}) has no contract`);
    if (!node.priority_class) fail(`WORK_GRAPH.yaml: selectable leaf ${node.id} has no priority_class`);
  }
  if (!leaf && node.contract) {
    warn(`WORK_GRAPH.yaml: ${node.id} has children and a contract; contracts belong on leaves`);
  }
  if (node.status === 'blocked' && !node.status_note) {
    fail(`WORK_GRAPH.yaml: blocked node ${node.id} must record why in status_note`);
  }
}

const activeLeaves = nodes.filter((node) => node.status === 'active' && isLeaf(node.id));
if (activeLeaves.length !== 1) {
  fail(`WORK_GRAPH.yaml: exactly one leaf must be active; found ${activeLeaves.length} (${activeLeaves.map((n) => n.id).join(', ') || 'none'})`);
}

// ---------------------------------------------------------------- derived frontier

const eligible = nodes
  .filter((node) => isLeaf(node.id))
  .filter((node) => node.status === 'ready' || node.status === 'active')
  .filter((node) => (node.dependencies || []).every((id) => byId.get(id)?.status === 'verified'))
  .map((node) => node.id);

const cached = state.derived_frontier?.task_ids || [];
const missing = eligible.filter((id) => !cached.includes(id));
const extra = cached.filter((id) => !eligible.includes(id));
if (missing.length) {
  fail(`STATE.yaml derived_frontier is stale: eligible but not listed: ${missing.join(', ')}`);
}
for (const id of extra) {
  const node = byId.get(id);
  if (!node) fail(`STATE.yaml derived_frontier references unknown node ${id}`);
  else if (!isLeaf(id)) fail(`STATE.yaml derived_frontier lists non-leaf ${id}`);
  else if (!['ready', 'active'].includes(node.status)) fail(`STATE.yaml derived_frontier lists ${id} with non-actionable status ${node.status}`);
  else {
    const unmet = (node.dependencies || []).filter((dep) => byId.get(dep)?.status !== 'verified');
    fail(`STATE.yaml derived_frontier lists ${id} with unmet dependencies: ${unmet.join(', ')}`);
  }
}

// the frontier must be ordered by priority class
const rank = (id) => Number((byId.get(id)?.priority_class || 'P9').slice(1));
for (let i = 1; i < cached.length; i += 1) {
  if (rank(cached[i]) < rank(cached[i - 1])) {
    fail(`STATE.yaml derived_frontier is not ordered by priority class: ${cached[i - 1]} (${byId.get(cached[i - 1])?.priority_class}) precedes ${cached[i]} (${byId.get(cached[i])?.priority_class})`);
  }
}

// ---------------------------------------------------------------- state coherence

if (state.active_task !== null) {
  const node = byId.get(state.active_task);
  if (!node) fail(`STATE.yaml active_task does not exist in the work graph: ${state.active_task}`);
  else {
    if (node.status !== 'active') fail(`STATE.yaml active_task ${state.active_task} has status ${node.status}, expected active`);
    if (!isLeaf(state.active_task)) fail(`STATE.yaml active_task ${state.active_task} is not a leaf`);
  }
  if (activeLeaves.length === 1 && activeLeaves[0].id !== state.active_task) {
    fail(`STATE.yaml active_task ${state.active_task} does not match the active leaf ${activeLeaves[0].id}`);
  }
} else if (activeLeaves.length) {
  fail(`STATE.yaml active_task is null but ${activeLeaves[0].id} is active in the work graph`);
}

const session = state.logical_session;
if (!session.opened_by_user) fail('STATE.yaml logical_session.opened_by_user must be true');
if (session.status === 'active' && session.end_declared_by_user) {
  fail('STATE.yaml: an active logical session cannot have end_declared_by_user=true');
}
if (session.status === 'closed') {
  if (!session.end_declared_by_user) fail('STATE.yaml: a closed session requires end_declared_by_user=true');
  if (!exists(session.final_handoff)) fail('STATE.yaml: a closed session requires an existing final_handoff');
  if (!exists(session.archive_reference)) fail('STATE.yaml: a closed session requires an existing archive_reference');
}

if (state.current_objective.status === 'awaiting_user_input' && state.active_task !== null) {
  fail('STATE.yaml: an objective awaiting user input cannot have an active task');
}
for (const path of state.last_verified_checkpoint.evidence_refs || []) {
  if (!exists(path)) fail(`STATE.yaml last_verified_checkpoint evidence does not exist: ${path}`);
}
for (const path of state.archive_references || []) {
  if (!exists(path)) fail(`STATE.yaml archive reference does not exist: ${path}`);
}
if (!exists(state.current_run.capability_record)) {
  fail(`STATE.yaml current_run.capability_record does not exist: ${state.current_run.capability_record}`);
}
if (capabilities.run_id !== state.current_run.id) {
  fail(`CAPABILITIES.yaml run_id ${capabilities.run_id} does not match STATE.yaml current_run.id ${state.current_run.id}`);
}
for (const objectiveNode of state.current_objective.work_node_refs || []) {
  if (!byId.has(objectiveNode)) fail(`STATE.yaml current_objective references unknown work node ${objectiveNode}`);
}

// ---------------------------------------------------------------- requirements

const criteria = new Map((requirements.criteria || []).map((entry) => [entry.id, entry]));
const requirementIds = new Set((requirements.requirements || []).map((entry) => entry.id));

for (const [name, path] of Object.entries(requirements.authorities || {})) {
  if (!exists(path)) fail(`REQUIREMENTS.yaml authority ${name} does not exist: ${path}`);
}
for (const requirement of requirements.requirements || []) {
  for (const ref of requirement.criteria_refs || []) {
    if (!criteria.has(ref)) fail(`REQUIREMENTS.yaml ${requirement.id} references unknown criterion ${ref}`);
  }
  for (const ref of requirement.work_node_refs || []) {
    if (!byId.has(ref)) fail(`REQUIREMENTS.yaml ${requirement.id} references unknown work node ${ref}`);
  }
}
for (const criterion of requirements.criteria || []) {
  if (!criterion.id.startsWith(criterion.gate)) {
    fail(`REQUIREMENTS.yaml criterion ${criterion.id} does not belong to gate ${criterion.gate}`);
  }
  for (const ref of criterion.work_node_refs || []) {
    if (!byId.has(ref)) fail(`REQUIREMENTS.yaml criterion ${criterion.id} references unknown work node ${ref}`);
  }
  for (const path of criterion.evidence_refs || []) {
    if (!exists(path)) fail(`REQUIREMENTS.yaml criterion ${criterion.id} evidence does not exist: ${path}`);
  }
  if (criterion.status === 'verified' && !(criterion.evidence_refs || []).length) {
    fail(`REQUIREMENTS.yaml criterion ${criterion.id} is verified but cites no evidence`);
  }
  if (criterion.automatable === 'yes' && criterion.tool_status === 'not_implemented' && criterion.status === 'verified') {
    fail(`REQUIREMENTS.yaml criterion ${criterion.id} claims verified while its automatic check is not implemented`);
  }
}
for (const ref of state.current_objective.requirement_refs || []) {
  if (!requirementIds.has(ref)) fail(`STATE.yaml current_objective references unknown requirement ${ref}`);
}

// two-way traceability
const declaredUncovered = new Map((requirements.uncovered_criteria || []).map((entry) => [entry.id, entry.reason]));
for (const node of nodes) {
  for (const ref of node.acceptance_refs || []) {
    const criterion = criteria.get(ref);
    if (!criterion) {
      fail(`WORK_GRAPH.yaml ${node.id} references unknown acceptance criterion ${ref}`);
      continue;
    }
    if (!(criterion.work_node_refs || []).includes(node.id)) {
      fail(`traceability: ${node.id} claims criterion ${ref}, but ${ref}.work_node_refs omits ${node.id}`);
    }
  }
  for (const ref of node.requirement_refs || []) {
    if (!requirementIds.has(ref)) fail(`WORK_GRAPH.yaml ${node.id} references unknown requirement ${ref}`);
  }
}
for (const criterion of requirements.criteria || []) {
  const covered = (criterion.work_node_refs || []).length > 0;
  if (!covered && !declaredUncovered.has(criterion.id)) {
    fail(`traceability: criterion ${criterion.id} has no work node and is not declared in uncovered_criteria`);
  }
  if (covered && declaredUncovered.has(criterion.id)) {
    fail(`traceability: criterion ${criterion.id} is both covered and declared uncovered`);
  }
  for (const ref of criterion.work_node_refs || []) {
    if (byId.has(ref) && !(byId.get(ref).acceptance_refs || []).includes(criterion.id)) {
      fail(`traceability: criterion ${criterion.id} claims node ${ref}, but ${ref}.acceptance_refs omits ${criterion.id}`);
    }
  }
}
for (const id of declaredUncovered.keys()) {
  if (!criteria.has(id)) fail(`REQUIREMENTS.yaml uncovered_criteria lists unknown criterion ${id}`);
}

// ---------------------------------------------------------------- ledger

const ledgerPath = join(AID, 'LEDGER.jsonl');
let ledger = [];
if (!existsSync(ledgerPath)) {
  fail('missing AI_DEVELOPMENT/LEDGER.jsonl');
} else {
  try {
    ledger = parseJsonl(readFileSync(ledgerPath, 'utf8'));
  } catch (error) {
    fail(`AI_DEVELOPMENT/LEDGER.jsonl: ${error.message}`);
  }
}

const eventIds = new Set();
const checkpointIds = new Set();
ledger.forEach(({ value: event, line }, index) => {
  const label = `LEDGER.jsonl:${line}`;
  applySchema(label, event, schemas.ledgerEvent);
  if (event.seq !== index + 1) {
    fail(`${label}: seq must be contiguous from 1; expected ${index + 1}, got ${event.seq}`);
  }
  if (eventIds.has(event.event_id)) fail(`${label}: duplicate event_id ${event.event_id}`);
  eventIds.add(event.event_id);

  if (event.gate) applySchema(`${label}.gate`, event.gate, schemas.gateResult);
  if (event.evidence) applySchema(`${label}.evidence`, event.evidence, schemas.evidenceRecord);
  if (event.checkpoint) {
    applySchema(`${label}.checkpoint`, event.checkpoint, schemas.checkpoint);
    checkpointIds.add(event.checkpoint.checkpoint_id);
  }
  if (event.type === 'gate_result' && !event.gate) fail(`${label}: a gate_result event needs a gate payload`);
  if (event.type === 'checkpoint' && !event.checkpoint) fail(`${label}: a checkpoint event needs a checkpoint payload`);
  if (event.type === 'evidence' && !event.evidence) fail(`${label}: an evidence event needs an evidence payload`);

  for (const ref of event.task_refs || []) {
    if (!byId.has(ref)) fail(`${label}: references unknown work node ${ref}`);
  }
  for (const ref of event.criteria_refs || []) {
    if (!criteria.has(ref)) fail(`${label}: references unknown criterion ${ref}`);
  }
  for (const path of event.evidence_refs || []) {
    if (!exists(path)) fail(`${label}: evidence path does not exist: ${path}`);
  }
  for (const path of event.archive_refs || []) {
    if (!exists(path)) fail(`${label}: archive path does not exist: ${path}`);
  }
});

for (const { value: event, line } of ledger) {
  if (event.corrects && !eventIds.has(event.corrects)) {
    fail(`LEDGER.jsonl:${line}: corrects unknown event ${event.corrects}`);
  }
}

if (checkpointIds.size && !checkpointIds.has(state.last_verified_checkpoint.id)) {
  fail(`STATE.yaml last_verified_checkpoint ${state.last_verified_checkpoint.id} has no matching checkpoint event in the ledger`);
}

// ---------------------------------------------------------------- policies

for (const entry of policies.protected_paths || []) {
  if (!exists(entry.path)) fail(`POLICIES.yaml protected path does not exist: ${entry.path}`);
}

// ---------------------------------------------------------------- handoffs

const handoffDir = join(AID, 'HANDOFFS');
if (existsSync(handoffDir)) {
  for (const name of readdirSync(handoffDir).filter((file) => file.endsWith('.json')).sort()) {
    const label = `HANDOFFS/${name}`;
    let record = null;
    try {
      record = JSON.parse(readFileSync(join(handoffDir, name), 'utf8'));
    } catch (error) {
      fail(`${label} is not valid JSON: ${error.message}`);
      continue;
    }
    applySchema(label, record, schemas.handoff);
    if (record.task_id && !byId.has(record.task_id)) {
      fail(`${label}: references unknown work node ${record.task_id}`);
    }
    if (record.end_declared_by_user === true && session.status !== 'closed') {
      fail(`${label}: sets end_declared_by_user while the logical session is ${session.status}`);
    }
    if (record.kind === 'final' && session.status !== 'closed') {
      fail(`${label}: a final handoff exists while the logical session is ${session.status}`);
    }
  }
}

// ---------------------------------------------------------------- migration completeness

const mustNotBeActive = [
  'AI_DEVELOPMENT/PROJECT_STATE.json',
  'AI_DEVELOPMENT/SESSION_STATE.json',
  'AI_DEVELOPMENT/INDEX.md',
];
for (const path of mustNotBeActive) {
  if (exists(path)) {
    fail(`legacy record ${path} is still active; two operating systems must not run at once (see ARCHIVE/MIGRATION-2026-08-01/)`);
  }
}
const mustBeArchived = [
  'AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/PRE_MIGRATION_CHECKPOINT.md',
  'AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/ROLLBACK.md',
  'AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/RECORD_MAP.md',
  'AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/legacy/PROJECT_OPERATING_PROTOCOL.md',
  'AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/legacy/PROJECT_STATE.json',
  'AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/legacy/SESSION_STATE.json',
  'AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/legacy/INDEX.md',
];
for (const path of mustBeArchived) {
  if (!exists(path)) fail(`migration archive is incomplete: ${path} is missing`);
}

const claudeMd = join(ROOT, 'CLAUDE.md');
if (!existsSync(claudeMd)) {
  fail('CLAUDE.md is missing; the repository loader must exist');
} else {
  const text = readFileSync(claudeMd, 'utf8');
  if (!text.includes('BEGIN PERSISTENT-DEVELOPMENT LOADER') || !text.includes('END PERSISTENT-DEVELOPMENT LOADER')) {
    fail('CLAUDE.md has no marked persistent-development loader block');
  }
  if (!text.includes('START_HERE.md')) fail('CLAUDE.md loader must point at START_HERE.md');
  if (text.length > 4000) {
    fail(`CLAUDE.md is ${text.length} bytes; the always-loaded loader must stay small (<= 4000)`);
  }
}
if (!existsSync(join(ROOT, 'START_HERE.md'))) fail('START_HERE.md is missing');

// ---------------------------------------------------------------- secret scan

const SECRET_PATTERNS = [
  [/\bghp_[A-Za-z0-9]{20,}/, 'GitHub personal access token'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/, 'GitHub fine-grained token'],
  [/\bsk-[A-Za-z0-9]{20,}/, 'API secret key'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
];

function scanForSecrets(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      scanForSecrets(full);
      continue;
    }
    if (!/\.(ya?ml|jsonl?|md)$/.test(entry)) continue;
    const text = readFileSync(full, 'utf8');
    for (const [pattern, description] of SECRET_PATTERNS) {
      if (pattern.test(text)) fail(`possible ${description} committed in ${rel(full)}`);
    }
  }
}
scanForSecrets(AID);

// ---------------------------------------------------------------- report

function report() {
  if (errors.length) {
    console.error('Operating-state validation FAILED');
    for (const error of errors) console.error(`  - ${error}`);
    for (const warning of warnings) console.error(`  ! ${warning}`);
    process.exit(1);
  }
  for (const warning of warnings) console.warn(`  ! ${warning}`);
  console.log('Operating-state validation OK');
  console.log(`  protocol        ${state.protocol_version}`);
  console.log(`  revision        ${state.state_revision}`);
  console.log(`  work nodes      ${nodes.length} (${nodes.filter((n) => isLeaf(n.id)).length} leaves)`);
  console.log(`  requirements    ${(requirements.requirements || []).length}`);
  console.log(`  criteria        ${(requirements.criteria || []).length}`);
  console.log(`  ledger events   ${ledger.length}`);
  console.log(`  session         ${session.id} (${session.status})`);
  console.log(`  objective       ${state.current_objective.id} (${state.current_objective.status})`);
  console.log(`  active task     ${state.active_task}`);
  console.log(`  frontier        ${cached.join(', ') || '(empty)'}`);
  if (VERBOSE) {
    console.log(`  checkpoint      ${state.last_verified_checkpoint.id} @ ${state.last_verified_checkpoint.revision}`);
    console.log(`  rollback        ${state.rollback_point}`);
    console.log(`  next action     ${state.next_action}`);
  }
  process.exit(0);
}

report();
