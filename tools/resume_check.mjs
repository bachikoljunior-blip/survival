#!/usr/bin/env node
/**
 * Dry resumption check.
 *
 * Simulates what a fresh Claude Code run with no memory can actually recover. It reads only the
 * minimal resume set that START_HERE.md declares — START_HERE.md, STATE.yaml, the active node in
 * WORK_GRAPH.yaml, that node's criteria in REQUIREMENTS.yaml, and POLICIES.yaml — and answers the
 * six questions a resuming run has to answer before it may touch anything:
 *
 *   1. What is the active objective?
 *   2. What is the active task, and what is its contract?
 *   3. What was the last genuinely verified checkpoint?
 *   4. What is blocking, and can an agent clear it?
 *   5. Where does a rollback go?
 *   6. What is the exact next action?
 *
 * It then compares those answers against the migration fidelity fixture, which recorded what the
 * *legacy* system answered before it was replaced. That comparison is what makes this a migration
 * check rather than a self-consistency check: the new records must resume to the same place the
 * old ones did. The fixture is pinned to the migration revision, so later real work does not have
 * to fight a frozen expectation — past that revision the fidelity section reports not_applicable
 * and the structural checks still run.
 *
 * Usage: node tools/resume_check.mjs [--verbose]
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseYaml } from './lib/yaml.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const AID = join(ROOT, 'AI_DEVELOPMENT');
const FIXTURE = join(AID, 'ARCHIVE', 'MIGRATION-2026-08-01', 'RESUMPTION_EXPECTED.json');
const VERBOSE = process.argv.includes('--verbose');

const problems = [];
const fail = (message) => problems.push(message);

/**
 * Read a canonical record, or fail with a diagnostic. A resuming agent runs this when it is least
 * able to interpret a raw stack trace, so a missing or malformed record has to say which file and
 * what to do about it.
 */
const readYaml = (name) => {
  const path = join(AID, name);
  if (!existsSync(path)) {
    console.error(`Dry resumption check FAILED`);
    console.error(`  - AI_DEVELOPMENT/${name} does not exist.`);
    console.error(`    A fresh run cannot resume without it. Restore it from git, or follow`);
    console.error(`    AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/ROLLBACK.md.`);
    process.exit(1);
  }
  try {
    return parseYaml(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`Dry resumption check FAILED`);
    console.error(`  - AI_DEVELOPMENT/${name} is not parseable: ${error.message}`);
    process.exit(1);
  }
};

// -- step 1: the loader must exist and must name the minimal resume set ------

const startHerePath = join(ROOT, 'START_HERE.md');
if (!existsSync(startHerePath)) {
  console.error('resume check FAILED: START_HERE.md is missing — a fresh run has no entry point');
  process.exit(1);
}
const startHere = readFileSync(startHerePath, 'utf8');
for (const required of [
  'AI_DEVELOPMENT/STATE.yaml',
  'AI_DEVELOPMENT/WORK_GRAPH.yaml',
  'AI_DEVELOPMENT/REQUIREMENTS.yaml',
  'AI_DEVELOPMENT/POLICIES.yaml',
  'AI_DEVELOPMENT/PROTOCOL.md',
]) {
  if (!startHere.includes(required)) fail(`START_HERE.md does not name ${required}`);
}

// -- step 2: recover the answers from the minimal set ------------------------

const state = readYaml('STATE.yaml');
const graph = readYaml('WORK_GRAPH.yaml');
const requirements = readYaml('REQUIREMENTS.yaml');
const policies = readYaml('POLICIES.yaml');

const byId = new Map((graph.nodes || []).map((node) => [node.id, node]));
const activeNode = state.active_task ? byId.get(state.active_task) : null;
const criteriaById = new Map((requirements.criteria || []).map((entry) => [entry.id, entry]));

const answers = {
  state_revision: state.state_revision,
  session_id: state.logical_session?.id ?? null,
  session_status: state.logical_session?.status ?? null,
  objective_id: state.current_objective?.id ?? null,
  objective_statement: state.current_objective?.statement ?? null,
  objective_status: state.current_objective?.status ?? null,
  active_task: state.active_task,
  active_task_title: activeNode?.title ?? null,
  active_task_criteria: (activeNode?.acceptance_refs ?? []).slice().sort(),
  last_verified_checkpoint: state.last_verified_checkpoint?.id ?? null,
  last_verified_revision: state.last_verified_checkpoint?.revision ?? null,
  rollback_point: state.rollback_point,
  next_action: state.next_action,
  standing_blocker_ids: (state.standing_blockers ?? []).map((entry) => entry.id).sort(),
  remote_delivery_policy: policies.permissions?.remote_delivery?.value ?? null,
};

// -- step 3: every answer must be recoverable and coherent -------------------

for (const [key, value] of Object.entries(answers)) {
  const empty = value === null || value === undefined || value === ''
    || (Array.isArray(value) && key !== 'active_task_criteria' && value.length === 0);
  if (empty) fail(`a fresh run cannot recover "${key}" from the minimal resume set`);
}

if (state.active_task && !activeNode) {
  fail(`active_task ${state.active_task} is not present in WORK_GRAPH.yaml`);
} else if (activeNode) {
  if (!activeNode.contract) fail(`active task ${activeNode.id} has no contract; a resuming run would have to invent the scope`);
  else {
    if (!(activeNode.contract.allowed_scope || []).length) fail(`active task ${activeNode.id} has an empty allowed_scope`);
    if (!(activeNode.contract.verification || []).length) fail(`active task ${activeNode.id} declares no verification`);
    if (!activeNode.contract.rollback) fail(`active task ${activeNode.id} declares no rollback`);
  }
  for (const ref of activeNode.acceptance_refs || []) {
    const criterion = criteriaById.get(ref);
    if (!criterion) fail(`active task ${activeNode.id} cites criterion ${ref}, which REQUIREMENTS.yaml does not define`);
    else if (!criterion.verification_method) fail(`criterion ${ref} has no verification method, so "done" is not decidable`);
  }
}

if (state.logical_session?.status === 'active' && state.logical_session?.end_declared_by_user) {
  fail('the session is active but claims the user declared it ended');
}
if (!/^[0-9a-f]{40}$/.test(String(state.rollback_point)) && !String(state.rollback_point).includes('/')) {
  fail(`rollback_point ${state.rollback_point} is neither a commit sha nor a path`);
}

// -- step 4: migration fidelity ---------------------------------------------

let fidelity = 'not_applicable';
let fidelityNote = '';
if (!existsSync(FIXTURE)) {
  fail(`missing migration fidelity fixture ${FIXTURE.replace(`${ROOT}/`, '')}`);
} else {
  const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  if (fixture.applies_to_state_revision !== state.state_revision) {
    fidelityNote = `fixture pinned to ${fixture.applies_to_state_revision}, state is ${state.state_revision} — later work has moved on, comparison skipped`;
  } else {
    fidelity = 'passed';
    for (const [key, expected] of Object.entries(fixture.expected)) {
      const actual = answers[key];
      const same = JSON.stringify(actual) === JSON.stringify(expected);
      if (!same) {
        fidelity = 'failed';
        fail(`resumption fidelity: "${key}"\n      legacy answered ${JSON.stringify(expected)}\n      canonical answers ${JSON.stringify(actual)}`);
      }
    }
  }
}

// -- report ------------------------------------------------------------------

if (problems.length) {
  console.error('Dry resumption check FAILED');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log('Dry resumption check OK — a fresh run can resume from the records alone');
console.log(`  objective            ${answers.objective_id} (${answers.objective_status})`);
console.log(`  logical session      ${answers.session_id} (${answers.session_status})`);
console.log(`  active task          ${answers.active_task} — ${answers.active_task_title}`);
console.log(`  criteria             ${answers.active_task_criteria.join(', ') || '(none)'}`);
console.log(`  last verified        ${answers.last_verified_checkpoint} @ ${answers.last_verified_revision}`);
console.log(`  rollback point       ${answers.rollback_point}`);
console.log(`  standing blockers    ${answers.standing_blocker_ids.join(', ') || '(none)'}`);
console.log(`  remote delivery      ${answers.remote_delivery_policy}`);
console.log(`  migration fidelity   ${fidelity}${fidelityNote ? ` (${fidelityNote})` : ''}`);
if (VERBOSE) console.log(`  next action          ${answers.next_action}`);
