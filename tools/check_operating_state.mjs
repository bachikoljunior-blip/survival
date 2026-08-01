#!/usr/bin/env node
/**
 * check_operating_state.mjs — this repository's operating-state gate.
 *
 * The generic half used to be hand-written here, and again in
 * `game2/tools/validate-project-state.mjs`, `Gptgame/scripts/verify-continuity.mjs` and
 * `Q/tools/validate-protocol.mjs` — four implementations of one job. Unique ids, referential
 * integrity, cycle detection, the exactly-one rule and evidence existence now come from
 * `.kit/lib/state/`. The cycle detector there is this file's own, generalised: it was the
 * only one in the four, and the kit carries it so the others gain it too.
 *
 * What stays here is what is genuinely this project's: the JSON state layout, the
 * `docs/STATE.md` revision marker, the authorities map, the A/B/C/D acceptance vocabulary,
 * and the session close conditions.
 *
 *   node tools/check_operating_state.mjs             # validate
 *   node tools/check_operating_state.mjs --selftest  # prove every check here can fail
 *
 * `--selftest` is the part this file never had. A silently inert gate and a passing gate are
 * indistinguishable from outside: both print nothing and exit 0.
 *
 * One deliberate gain beyond the swap: the state files are now scanned for credential-shaped
 * keys, which this validator never did.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { uniqueIds, checkRefs, detectCycles, exactlyOne, evidenceExists } from '../.kit/lib/state/graph.mjs';
import { scanSecretKeys } from '../.kit/lib/state/secrets.mjs';
import { reportGateSelfTests } from '../.kit/lib/state/selftest.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const argv = new Set(process.argv.slice(2));

const PROJECT_REL = 'AI_DEVELOPMENT/PROJECT_STATE.json';
const SESSION_REL = 'AI_DEVELOPMENT/SESSION_STATE.json';
const STATE_REL = 'docs/STATE.md';
const STATE_YAML_REL = 'AI_DEVELOPMENT/STATE.yaml';

/**
 * Resolve a dotted path to a scalar in `AI_DEVELOPMENT/STATE.yaml` by walking indentation.
 *
 * This is the protocol-2.2 reader, kept **verbatim** from the version that introduced the
 * STATE.yaml checks. It is deliberately not routed through `.kit/lib/state/yaml.mjs`, and
 * that is measured rather than assumed: the kit's parser is strict and refuses folded block
 * scalars (`>`), which `STATE.yaml` uses — it throws at line 22 on the real file. Swapping it
 * in would have replaced eleven working checks with a crash. If the kit ever grows folded
 * scalars, this is the function to delete.
 */
const yamlScalarIn = (yaml) => (path) => {
  const parts = path.split('.');
  const lines = yaml.split('\n');
  let depth = 0, from = 0, to = lines.length;
  for (let p = 0; p < parts.length; p++) {
    const re = new RegExp(`^(\\s*)${parts[p]}:\\s*(.*)$`);
    let found = -1, indent = -1;
    for (let i = from; i < to; i++) {
      const m = re.exec(lines[i]);
      if (m && m[1].length === depth) { found = i; indent = m[1].length;
        if (p === parts.length - 1) {
          const v = m[2].trim();
          return v.replace(/^["']|["']$/g, '');
        }
        break;
      }
    }
    if (found < 0) return null;
    from = found + 1; depth = indent + 2;
    to = lines.length;
    for (let i = from; i < lines.length; i++) {
      if (lines[i].trim() && !/^\s*#/.test(lines[i]) && (lines[i].match(/^\s*/)[0].length <= indent)) { to = i; break; }
    }
  }
  return null;
};

/** The acceptance vocabulary: criterion refs are A1..A7, B1..B6, C1..C5, D1..D11. */
const CRITERION_MAX = { A: 7, B: 6, C: 5, D: 11 };

const validCriterion = (ref) => {
  const match = /^([ABCD])(\d+)$/.exec(String(ref));
  return !!match && Number(match[2]) >= 1 && Number(match[2]) <= CRITERION_MAX[match[1]];
};

/**
 * @param {object} [options]
 * @param {string} [options.root]
 * @param {(relative: string) => string} [options.readText] Injectable so the self-test can
 *   run the real checks against fabricated state without writing to disk.
 * @param {(relative: string) => boolean} [options.exists]
 * @returns {{errors: string[], project: object|null, session: object|null}}
 */
export function validate({ root = ROOT, readText, exists } = {}) {
  const errors = [];
  const read = readText || ((relative) => readFileSync(join(root, relative), 'utf8'));
  const onDisk = exists || ((relative) => existsSync(join(root, relative)));
  const fail = (message) => errors.push(message);

  const readJson = (relative, name) => {
    try {
      return JSON.parse(read(relative));
    } catch (error) {
      fail(`${name} is not valid JSON: ${error.message}`);
      return null;
    }
  };

  const project = readJson(PROJECT_REL, 'PROJECT_STATE.json');
  const sessionState = readJson(SESSION_REL, 'SESSION_STATE.json');
  if (!project || !sessionState) return { errors, project: null, session: null };

  if (project.schema_version !== 1) fail(`unsupported project schema ${project.schema_version}`);
  if (sessionState.schema_version !== 1) fail(`unsupported session schema ${sessionState.schema_version}`);

  // Two complementary scans the old file did not have: a credential-shaped key in either
  // state document. Neither of these files should ever hold one.
  errors.push(...scanSecretKeys(project, 'PROJECT_STATE.json'));
  errors.push(...scanSecretKeys(sessionState, 'SESSION_STATE.json'));

  // A half-applied edit — one file saved, the other not — reads exactly like a consistent
  // state, so the revision is echoed in three places and cross-checked.
  let stateText = '';
  try {
    stateText = read(STATE_REL);
  } catch (error) {
    fail(`${STATE_REL} could not be read: ${error.message}`);
  }
  const revisionMatch = stateText.match(/<!--\s*state_revision:\s*([^\s]+)\s*-->/);
  if (!revisionMatch) fail('docs/STATE.md has no state_revision marker');
  const revisions = [project.state_revision, sessionState.state_revision, revisionMatch && revisionMatch[1]];
  if (revisions.some((v) => typeof v !== 'string' || !v)) fail('all state revisions must be non-empty strings');
  if (new Set(revisions).size !== 1) fail(`state revision mismatch: ${revisions.join(' / ')}`);

  for (const [category, path] of Object.entries(project.authorities || {})) {
    if (typeof path !== 'string' || !onDisk(path)) fail(`authority ${category} does not exist: ${path}`);
  }

  const planNodes = Array.isArray(project.plan_nodes) ? project.plan_nodes : [];
  const tasks = Array.isArray(project.tasks) ? project.tasks : [];
  if (!planNodes.length) fail('plan_nodes must not be empty');
  if (!tasks.length) fail('tasks must not be empty');

  const all = [...planNodes, ...tasks];
  const { failures: idFailures, ids } = uniqueIds(all, 'plan node or task');
  errors.push(...idFailures);
  errors.push(...checkRefs(all, 'parent', ids, { label: 'plan node or task' }));

  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const taskIds = new Set(taskById.keys());
  for (const task of tasks) {
    if (!Array.isArray(task.dependencies)) fail(`${task.id} dependencies must be an array`);
    if (!Array.isArray(task.acceptance_refs)) fail(`${task.id} acceptance_refs must be an array`);
    if (!Array.isArray(task.evidence)) fail(`${task.id} evidence must be an array`);
  }
  errors.push(...checkRefs(tasks, 'dependencies', taskIds, { label: 'task' }));
  errors.push(...detectCycles(tasks, 'dependencies'));
  // Evidence that is not on disk is not evidence.
  errors.push(...evidenceExists(tasks, 'evidence', onDisk));

  const activeTasks = tasks.filter((task) => task.status === 'active');
  errors.push(...exactlyOne(tasks, (task) => task.status === 'active', 'active task'));

  const session = sessionState.session || {};
  if (!session.opened_by_user) fail('current logical session must have opened_by_user=true');
  if (session.status === 'active' && session.end_declared_by_user) fail('active session cannot have end_declared_by_user=true');
  if (session.status === 'closed') {
    if (!session.end_declared_by_user) fail('closed session requires end_declared_by_user=true');
    if (!session.final_handoff || !onDisk(session.final_handoff)) fail('closed session requires an existing final_handoff');
    if (!session.archive_reference || !onDisk(session.archive_reference)) fail('closed session requires an existing archive_reference');
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

  for (const task of tasks) {
    for (const ref of task.acceptance_refs || []) {
      if (!validCriterion(ref)) fail(`${task.id} has invalid acceptance ref ${ref}`);
    }
  }
  for (const trace of project.acceptance_trace || []) {
    if (!validCriterion(trace.criterion)) fail(`invalid trace criterion ${trace.criterion}`);
    if (!Array.isArray(trace.tasks) || !trace.tasks.length) fail(`trace ${trace.criterion} has no tasks`);
    for (const id of trace.tasks || []) if (!taskById.has(id)) fail(`trace ${trace.criterion} references missing task ${id}`);
  }

  // ---------------------------------------------------------------- STATE.yaml
  //
  // Protocol v2.2 makes AI_DEVELOPMENT/STATE.yaml the canonical active state.
  // SESSION_STATE.json is retained only as a derived projection of it, because
  // this validator and the Pages workflow already read it. Two records that can
  // disagree are two authorities, so the overlapping fields are checked here and
  // a mismatch fails rather than being silently tolerated.
  if (!onDisk(STATE_YAML_REL)) {
    fail('AI_DEVELOPMENT/STATE.yaml is missing; the floor has no canonical state to read or write');
  } else {
    let yaml = '';
    try {
      yaml = read(STATE_YAML_REL);
    } catch (error) {
      fail(`${STATE_YAML_REL} could not be read: ${error.message}`);
    }
    const yamlScalar = yamlScalarIn(yaml);

    const version = yamlScalar('protocol_version');
    if (version !== '2.2') fail(`STATE.yaml protocol_version is ${version || 'missing'}, expected 2.2`);

    // The floor block and its enforcement subfields are retained whenever the
    // project has an active objective. Their absence is the failure, not a gap.
    for (const field of ['f2_state_update_check', 'f3_execution_check', 'f5_review_record_check',
                         'f6_public_revision_check', 'revert_mechanism', 'unattended_allowed']) {
      if (yamlScalar(`floor.enforcement.${field}`) === null) {
        fail(`STATE.yaml floor.enforcement.${field} is missing`);
      }
    }
    const level = yamlScalar('floor.independence_level_used');
    if (!['A', 'B', 'C', 'D'].includes(level)) {
      fail(`STATE.yaml floor.independence_level_used is ${level || 'missing'}, expected A, B, C or D`);
    }
    if (!yamlScalar('execution.exact_next_action')) fail('STATE.yaml execution.exact_next_action is missing');

    // The projection must agree with the authority.
    const yamlSession = yamlScalar('logical_session.id');
    if (yamlSession && session.id && yamlSession !== session.id) {
      fail(`STATE.yaml logical_session.id ${yamlSession} does not match SESSION_STATE.json ${session.id}`);
    }
    const yamlStatus = yamlScalar('logical_session.status');
    if (yamlStatus && session.status && yamlStatus !== session.status) {
      fail(`STATE.yaml logical_session.status ${yamlStatus} does not match SESSION_STATE.json ${session.status}`);
    }
    const yamlTask = yamlScalar('execution.active_work.id');
    if (yamlTask && session.active_task && yamlTask !== session.active_task) {
      fail(`STATE.yaml active work ${yamlTask} does not match SESSION_STATE.json active_task ${session.active_task}`);
    }

    // An unattended chain may not be allowed while any gate is unenforced.
    const unattended = yamlScalar('floor.enforcement.unattended_allowed');
    const gatesActive = ['f2_state_update_check', 'f3_execution_check', 'f5_review_record_check',
                         'f6_public_revision_check'].every((f) => yamlScalar(`floor.enforcement.${f}`) === 'active');
    if (unattended === 'true' && !gatesActive) {
      fail('STATE.yaml allows unattended operation while at least one F9 gate is not active (protocol 0.4)');
    }
  }

  return { errors, project, session };
}

/* ------------------------------------------------------------------------- self-test */

export function selfTestCases({ root = ROOT } = {}) {
  const real = (relative) => readFileSync(join(root, relative), 'utf8');
  /** Edit one parsed state document and leave every other file untouched. */
  const patch = (target, mutate) => ({
    root,
    readText: (relative) => {
      if (relative !== target) return real(relative);
      const doc = JSON.parse(real(relative));
      mutate(doc);
      return JSON.stringify(doc, null, 2);
    },
  });
  const withText = (target, edit) => ({
    root,
    readText: (relative) => (relative === target ? edit(real(relative)) : real(relative)),
  });
  const run = (options) => validate(options).errors;

  return [
    { name: 'control: this repository\'s own state passes', shouldFire: false, evaluate: () => run({ root }) },
    {
      name: 'the two state files disagreeing on state_revision',
      evaluate: () => run(patch(SESSION_REL, (d) => { d.state_revision = '9999-99-99.9'; })),
    },
    {
      name: 'docs/STATE.md losing its revision marker',
      evaluate: () => run(withText(STATE_REL, (t) => t.replace(/<!--\s*state_revision:[^>]*-->/, ''))),
    },
    {
      name: 'a duplicate task id',
      evaluate: () => run(patch(PROJECT_REL, (d) => { d.tasks.push({ ...d.tasks[0] }); })),
    },
    {
      name: 'a task depending on an id that does not exist',
      evaluate: () => run(patch(PROJECT_REL, (d) => { d.tasks[0].dependencies = ['TASK-NOT-REAL']; })),
    },
    {
      name: 'a task dependency cycle',
      evaluate: () => run(patch(PROJECT_REL, (d) => {
        const [a, b] = d.tasks;
        a.dependencies = [b.id];
        b.dependencies = [a.id];
      })),
    },
    {
      name: 'a plan node whose parent does not exist',
      evaluate: () => run(patch(PROJECT_REL, (d) => { d.plan_nodes[d.plan_nodes.length - 1].parent = 'NODE-NOT-REAL'; })),
    },
    {
      name: 'evidence naming a path that is not on disk',
      evaluate: () => run(patch(PROJECT_REL, (d) => { d.tasks[0].evidence = ['AI_DEVELOPMENT/EVIDENCE/not-real.json']; })),
    },
    {
      name: 'an authority pointing at a document that was deleted',
      evaluate: () => run(patch(PROJECT_REL, (d) => {
        const key = Object.keys(d.authorities)[0];
        d.authorities[key] = 'docs/not-real.md';
      })),
    },
    {
      name: 'two tasks active at once',
      evaluate: () => run(patch(PROJECT_REL, (d) => {
        const other = d.tasks.find((t) => t.status !== 'active');
        if (!other) throw new Error('self-test fixture needs a non-active task');
        other.status = 'active';
      })),
    },
    {
      name: 'a session closed without the user declaring it',
      evaluate: () => run(patch(SESSION_REL, (d) => {
        d.session.status = 'closed';
        d.session.end_declared_by_user = false;
      })),
    },
    {
      name: 'the session pointing at a task that does not exist',
      evaluate: () => run(patch(SESSION_REL, (d) => { d.session.active_task = 'TASK-NOT-REAL'; })),
    },
    {
      name: 'an empty active_frontier leaves the next run nothing to pick up',
      evaluate: () => run(patch(SESSION_REL, (d) => { d.session.active_frontier = []; })),
    },
    {
      name: 'an acceptance ref outside the A/B/C/D vocabulary',
      evaluate: () => run(patch(PROJECT_REL, (d) => { d.tasks[0].acceptance_refs = ['E1']; })),
    },
    {
      name: 'an acceptance ref numbered past the end of its criterion set',
      evaluate: () => run(patch(PROJECT_REL, (d) => { d.tasks[0].acceptance_refs = ['A99']; })),
    },
    {
      name: 'a credential-shaped field pasted into the project state',
      evaluate: () => run(patch(PROJECT_REL, (d) => { d.access_token = 'x'; })),
    },
    {
      name: 'an unsupported schema version',
      evaluate: () => run(patch(PROJECT_REL, (d) => { d.schema_version = 2; })),
    },

    /* The protocol-2.2 STATE.yaml checks. These arrived on `main` while this validator was
     * being rewritten elsewhere, and they had never had a self-test — which is how a gate
     * gets to be inert without anyone noticing. Each one is driven here by editing the real
     * file's text in memory. */
    {
      name: 'STATE.yaml missing entirely',
      evaluate: () => run({
        root,
        readText: real,
        exists: (relative) => (relative === STATE_YAML_REL ? false : existsSync(join(root, relative))),
      }),
    },
    {
      name: 'STATE.yaml declaring a protocol version other than 2.2',
      evaluate: () => run(withText(STATE_YAML_REL, (t) => t.replace(/^protocol_version:.*$/m, 'protocol_version: "2.1"'))),
    },
    {
      name: 'a floor enforcement field deleted from STATE.yaml',
      evaluate: () => run(withText(STATE_YAML_REL, (t) => t.replace(/^\s*f3_execution_check:.*$\n/m, ''))),
    },
    {
      name: 'an independence level outside A/B/C/D',
      evaluate: () => run(withText(STATE_YAML_REL, (t) => t.replace(/^(\s*)independence_level_used:.*$/m, '$1independence_level_used: Z'))),
    },
    {
      name: 'STATE.yaml and SESSION_STATE.json disagreeing on the logical session id',
      evaluate: () => run(withText(STATE_YAML_REL, (t) => t.replace(/^(\s*)id: SESSION-.*$/m, '$1id: SESSION-NOT-REAL'))),
    },
    {
      name: 'unattended operation allowed while an F9 gate is not active',
      evaluate: () => run(withText(STATE_YAML_REL, (t) => t.replace(/^(\s*)unattended_allowed:.*$/m, '$1unattended_allowed: true'))),
    },
  ];
}

/* ------------------------------------------------------------------------------- cli */

if (import.meta.url === `file://${process.argv[1]}`) {
  if (argv.has('--selftest')) {
    const ok = await reportGateSelfTests(selfTestCases(), { label: 'operating-state' });
    process.exit(ok ? 0 : 1);
  }

  const { errors, project, session } = validate();
  if (errors.length) {
    console.error('Operating-state validation failed');
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  console.log('Operating-state validation OK');
  console.log(`  revision       ${project.state_revision}`);
  console.log(`  plan nodes      ${project.plan_nodes.length}`);
  console.log(`  tasks           ${project.tasks.length}`);
  console.log(`  active task     ${session.active_task}`);
  console.log(`  session status  ${session.status}`);
  console.log('  STATE.yaml      canonical, checked against the SESSION_STATE.json projection');
}
