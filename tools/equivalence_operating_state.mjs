#!/usr/bin/env node
/**
 * Differential battery: survival's rebuilt operating-state validator vs the one currently on
 * `main`. Both are run as subprocesses against a mutated copy of the real tree, because
 * `main`'s version has no CLI guard and runs its checks on import — importing it to compare
 * would run the real gate instead of the fabricated one.
 *
 * A mutation counts as agreeing when both versions reach the same verdict (exit 0 vs exit 1).
 * Healthy state is included only as a control; it proves nothing on its own.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO = '/home/user/survival';
const OLD = '/tmp/main_cos.mjs';               // tools/check_operating_state.mjs at origin/main
const NEW = join(REPO, 'tools/check_operating_state.mjs');

const PROJECT = 'AI_DEVELOPMENT/PROJECT_STATE.json';
const SESSION = 'AI_DEVELOPMENT/SESSION_STATE.json';
const YAML = 'AI_DEVELOPMENT/STATE.yaml';
const STATEMD = 'docs/STATE.md';

const json = (p, f) => (t) => { const d = JSON.parse(t); f(d); return JSON.stringify(d, null, 2); };

/** [name, file, transform(text) -> text] */
const MUTATIONS = [
  ['control: untouched state', null, null],

  // --- generic graph / reference checks -------------------------------------------------
  ['duplicate task id', PROJECT, json(0, (d) => d.tasks.push({ ...d.tasks[0] }))],
  ['duplicate plan node id', PROJECT, json(0, (d) => d.plan_nodes.push({ ...d.plan_nodes[0] }))],
  ['task dependency on a missing id', PROJECT, json(0, (d) => { d.tasks[0].dependencies = ['NOPE']; })],
  ['plan node parent missing', PROJECT, json(0, (d) => { d.plan_nodes[d.plan_nodes.length - 1].parent = 'NOPE'; })],
  ['evidence path not on disk', PROJECT, json(0, (d) => { d.tasks[0].evidence = ['AI_DEVELOPMENT/EVIDENCE/nope.json']; })],
  ['authority path deleted', PROJECT, json(0, (d) => { d.authorities[Object.keys(d.authorities)[0]] = 'docs/nope.md'; })],
  ['two tasks active', PROJECT, json(0, (d) => { d.tasks.find((t) => t.status !== 'active').status = 'active'; })],
  ['no task active', PROJECT, json(0, (d) => { for (const t of d.tasks) if (t.status === 'active') t.status = 'ready'; })],
  ['dependencies not an array', PROJECT, json(0, (d) => { d.tasks[0].dependencies = 'x'; })],
  ['acceptance_refs not an array', PROJECT, json(0, (d) => { d.tasks[0].acceptance_refs = 'x'; })],
  ['evidence not an array', PROJECT, json(0, (d) => { d.tasks[0].evidence = 'x'; })],
  ['empty plan_nodes', PROJECT, json(0, (d) => { d.plan_nodes = []; })],
  ['empty tasks', PROJECT, json(0, (d) => { d.tasks = []; })],
  ['acceptance ref outside vocabulary', PROJECT, json(0, (d) => { d.tasks[0].acceptance_refs = ['E1']; })],
  ['acceptance ref past the set end', PROJECT, json(0, (d) => { d.tasks[0].acceptance_refs = ['A99']; })],
  ['acceptance ref at the boundary (valid)', PROJECT, json(0, (d) => { d.tasks[0].acceptance_refs = ['D11']; })],
  ['trace criterion invalid', PROJECT, json(0, (d) => { if (d.acceptance_trace?.[0]) d.acceptance_trace[0].criterion = 'Z9'; })],
  ['trace with no tasks', PROJECT, json(0, (d) => { if (d.acceptance_trace?.[0]) d.acceptance_trace[0].tasks = []; })],
  ['trace referencing a missing task', PROJECT, json(0, (d) => { if (d.acceptance_trace?.[0]) d.acceptance_trace[0].tasks = ['NOPE']; })],
  ['project schema version bumped', PROJECT, json(0, (d) => { d.schema_version = 2; })],
  ['session schema version bumped', SESSION, json(0, (d) => { d.schema_version = 2; })],
  ['state_revision mismatch', SESSION, json(0, (d) => { d.state_revision = '9999-99-99.9'; })],
  ['state_revision empty', SESSION, json(0, (d) => { d.state_revision = ''; })],
  ['docs/STATE.md loses its marker', STATEMD, (t) => t.replace(/<!--\s*state_revision:[^>]*-->/, '')],
  ['session active_task missing', SESSION, json(0, (d) => { d.session.active_task = 'NOPE'; })],
  ['session closed without user declaration', SESSION, json(0, (d) => { d.session.status = 'closed'; d.session.end_declared_by_user = false; })],
  ['active session with end_declared_by_user', SESSION, json(0, (d) => { d.session.end_declared_by_user = true; })],
  ['opened_by_user false', SESSION, json(0, (d) => { d.session.opened_by_user = false; })],
  ['empty active_frontier', SESSION, json(0, (d) => { d.session.active_frontier = []; })],
  ['frontier task that does not exist', SESSION, json(0, (d) => { d.session.active_frontier = ['NOPE']; })],
  ['project state is not valid JSON', PROJECT, () => '{ broken'],
  ['session state is not valid JSON', SESSION, () => '{ broken'],

  // --- protocol 2.2 STATE.yaml checks, added on main ------------------------------------
  ['STATE.yaml protocol_version wrong', YAML, (t) => t.replace(/^protocol_version:.*$/m, 'protocol_version: "2.1"')],
  ['STATE.yaml f2 gate field deleted', YAML, (t) => t.replace(/^\s*f2_state_update_check:.*$\n/m, '')],
  ['STATE.yaml f3 gate field deleted', YAML, (t) => t.replace(/^\s*f3_execution_check:.*$\n/m, '')],
  ['STATE.yaml f5 gate field deleted', YAML, (t) => t.replace(/^\s*f5_review_record_check:.*$\n/m, '')],
  ['STATE.yaml f6 gate field deleted', YAML, (t) => t.replace(/^\s*f6_public_revision_check:.*$\n/m, '')],
  ['STATE.yaml revert_mechanism deleted', YAML, (t) => t.replace(/^\s*revert_mechanism:.*$\n/m, '')],
  ['STATE.yaml unattended_allowed deleted', YAML, (t) => t.replace(/^\s*unattended_allowed:.*$\n/m, '')],
  ['STATE.yaml independence level invalid', YAML, (t) => t.replace(/^(\s*)independence_level_used:.*$/m, '$1independence_level_used: Z')],
  ['STATE.yaml independence level A (valid)', YAML, (t) => t.replace(/^(\s*)independence_level_used:.*$/m, '$1independence_level_used: A')],
  ['STATE.yaml exact_next_action removed', YAML, (t) => t.replace(/^(\s*)exact_next_action:.*$/m, '$1exact_next_action:')],
  ['STATE.yaml session id disagrees', YAML, (t) => t.replace(/^(\s*)id: SESSION-.*$/m, '$1id: SESSION-NOT-REAL')],
  // Target the status *inside* the logical_session block. A bare /^\s*status: active$/ hits
  // project.status first and mutates a field neither validator reads — the battery then
  // reports agreement on a check it never exercised.
  ['STATE.yaml session status disagrees', YAML,
    (t) => t.replace(/(^logical_session:\n(?:[ \t]+.*\n)*?[ \t]+status: )active$/m, '$1closed')],
  ['STATE.yaml unattended allowed with a gate inactive', YAML, (t) => t.replace(/^(\s*)unattended_allowed:.*$/m, '$1unattended_allowed: true')],
];

const verdict = (dir, script) => {
  try {
    execFileSync('node', [script], { cwd: dir, stdio: 'pipe' });
    return 'pass';
  } catch (error) {
    return error.status === 1 ? 'fail' : `error(${error.status})`;
  }
};

const base = mkdtempSync(join(tmpdir(), 'survival-equiv-'));
cpSync(REPO, base, {
  recursive: true,
  filter: (src) => !/(\/\.git$|\/\.git\/|\/node_modules$|\/node_modules\/|\/dist$)/.test(src),
});
cpSync(OLD, join(base, 'tools', 'check_operating_state_old.mjs'));

const originals = Object.fromEntries(
  [PROJECT, SESSION, YAML, STATEMD].map((p) => [p, readFileSync(join(base, p), 'utf8')]),
);

let agree = 0;
const rows = [];
for (const [name, file, transform] of MUTATIONS) {
  for (const [p, text] of Object.entries(originals)) writeFileSync(join(base, p), text);
  if (file) writeFileSync(join(base, file), transform(originals[file]));

  const oldVerdict = verdict(base, 'tools/check_operating_state_old.mjs');
  const newVerdict = verdict(base, 'tools/check_operating_state.mjs');
  const same = oldVerdict === newVerdict;
  if (same) agree++;
  rows.push([same ? 'ok  ' : 'DIFF', name, oldVerdict, newVerdict]);
}

for (const [mark, name, o, n] of rows) {
  console.log(`${mark} ${name.padEnd(46)} old=${o.padEnd(6)} new=${n}`);
}
console.log(`\n${agree}/${MUTATIONS.length} mutations reach the same verdict in both validators`);

const fired = rows.filter((r) => r[2] === 'fail').length;
console.log(`${fired}/${MUTATIONS.length - 1} deliberate breakages actually fired in the old validator`);

rmSync(base, { recursive: true, force: true });
process.exit(agree === MUTATIONS.length ? 0 : 1);
