#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PROJECT_PATH = join(ROOT, 'AI_DEVELOPMENT', 'PROJECT_STATE.json');
const SESSION_PATH = join(ROOT, 'AI_DEVELOPMENT', 'SESSION_STATE.json');
const STATE_PATH = join(ROOT, 'docs', 'STATE.md');
const errors = [];

const fail = (message) => errors.push(message);
const readJson = (path, name) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${name} is not valid JSON: ${error.message}`);
    return null;
  }
};

const project = readJson(PROJECT_PATH, 'PROJECT_STATE.json');
const sessionState = readJson(SESSION_PATH, 'SESSION_STATE.json');

if (!project || !sessionState) {
  console.error(errors.join('\n'));
  process.exit(1);
}

if (project.schema_version !== 1) fail(`unsupported project schema ${project.schema_version}`);
if (sessionState.schema_version !== 1) fail(`unsupported session schema ${sessionState.schema_version}`);

const stateText = readFileSync(STATE_PATH, 'utf8');
const revisionMatch = stateText.match(/<!--\s*state_revision:\s*([^\s]+)\s*-->/);
if (!revisionMatch) fail('docs/STATE.md has no state_revision marker');
const revisions = [project.state_revision, sessionState.state_revision, revisionMatch && revisionMatch[1]];
if (revisions.some((v) => typeof v !== 'string' || !v)) fail('all state revisions must be non-empty strings');
if (new Set(revisions).size !== 1) fail(`state revision mismatch: ${revisions.join(' / ')}`);

for (const [category, path] of Object.entries(project.authorities || {})) {
  if (typeof path !== 'string' || !existsSync(join(ROOT, path))) fail(`authority ${category} does not exist: ${path}`);
}

const planNodes = Array.isArray(project.plan_nodes) ? project.plan_nodes : [];
const tasks = Array.isArray(project.tasks) ? project.tasks : [];
if (!planNodes.length) fail('plan_nodes must not be empty');
if (!tasks.length) fail('tasks must not be empty');

const all = [...planNodes, ...tasks];
const ids = new Set();
for (const entry of all) {
  if (!entry || typeof entry.id !== 'string' || !entry.id) {
    fail('every plan node and task needs a non-empty id');
    continue;
  }
  if (ids.has(entry.id)) fail(`duplicate id ${entry.id}`);
  ids.add(entry.id);
}

for (const entry of all) {
  if (entry.parent !== null && entry.parent !== undefined && !ids.has(entry.parent)) {
    fail(`${entry.id} has missing parent ${entry.parent}`);
  }
}

const taskById = new Map(tasks.map((task) => [task.id, task]));
for (const task of tasks) {
  if (!Array.isArray(task.dependencies)) fail(`${task.id} dependencies must be an array`);
  for (const dependency of task.dependencies || []) {
    if (!taskById.has(dependency)) fail(`${task.id} has missing dependency ${dependency}`);
    if (dependency === task.id) fail(`${task.id} depends on itself`);
  }
  if (!Array.isArray(task.acceptance_refs)) fail(`${task.id} acceptance_refs must be an array`);
  if (!Array.isArray(task.evidence)) fail(`${task.id} evidence must be an array`);
  for (const path of task.evidence || []) {
    if (typeof path !== 'string' || !existsSync(join(ROOT, path))) fail(`${task.id} evidence path does not exist: ${path}`);
  }
}

const visiting = new Set();
const visited = new Set();
const visit = (id, trail = []) => {
  if (visiting.has(id)) {
    fail(`task dependency cycle: ${[...trail, id].join(' -> ')}`);
    return;
  }
  if (visited.has(id)) return;
  visiting.add(id);
  const task = taskById.get(id);
  for (const dependency of task?.dependencies || []) visit(dependency, [...trail, id]);
  visiting.delete(id);
  visited.add(id);
};
for (const task of tasks) visit(task.id);

const activeTasks = tasks.filter((task) => task.status === 'active');
if (activeTasks.length !== 1) fail(`exactly one task must be active; found ${activeTasks.length}`);

const session = sessionState.session || {};
if (!session.opened_by_user) fail('current logical session must have opened_by_user=true');
if (session.status === 'active' && session.end_declared_by_user) fail('active session cannot have end_declared_by_user=true');
if (session.status === 'closed') {
  if (!session.end_declared_by_user) fail('closed session requires end_declared_by_user=true');
  if (!session.final_handoff || !existsSync(join(ROOT, session.final_handoff))) fail('closed session requires an existing final_handoff');
  if (!session.archive_reference || !existsSync(join(ROOT, session.archive_reference))) fail('closed session requires an existing archive_reference');
}
if (!taskById.has(session.active_task)) fail(`session active_task does not exist: ${session.active_task}`);
if (activeTasks.length === 1 && session.active_task !== activeTasks[0].id) {
  fail(`session active_task ${session.active_task} does not match active task ${activeTasks[0].id}`);
}

const frontier = Array.isArray(session.active_frontier) ? session.active_frontier : [];
if (!frontier.length) fail('active_frontier must not be empty during an active session');
for (const id of frontier) {
  const task = taskById.get(id);
  if (!task) {
    fail(`frontier task does not exist: ${id}`);
    continue;
  }
  if (!['ready', 'active'].includes(task.status)) fail(`frontier task ${id} has non-actionable status ${task.status}`);
  for (const dependency of task.dependencies || []) {
    if (taskById.get(dependency)?.status !== 'verified') fail(`frontier task ${id} has unmet dependency ${dependency}`);
  }
}

const criterionMax = { A: 7, B: 6, C: 5, D: 11 };
const validCriterion = (ref) => {
  const match = /^([ABCD])(\d+)$/.exec(ref);
  return !!match && Number(match[2]) >= 1 && Number(match[2]) <= criterionMax[match[1]];
};
for (const task of tasks) {
  for (const ref of task.acceptance_refs || []) if (!validCriterion(ref)) fail(`${task.id} has invalid acceptance ref ${ref}`);
}
for (const trace of project.acceptance_trace || []) {
  if (!validCriterion(trace.criterion)) fail(`invalid trace criterion ${trace.criterion}`);
  if (!Array.isArray(trace.tasks) || !trace.tasks.length) fail(`trace ${trace.criterion} has no tasks`);
  for (const id of trace.tasks || []) if (!taskById.has(id)) fail(`trace ${trace.criterion} references missing task ${id}`);
}

if (errors.length) {
  console.error('Operating-state validation failed');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('Operating-state validation OK');
console.log(`  revision       ${project.state_revision}`);
console.log(`  plan nodes      ${planNodes.length}`);
console.log(`  tasks           ${tasks.length}`);
console.log(`  active task     ${session.active_task}`);
console.log(`  session status  ${session.status}`);
