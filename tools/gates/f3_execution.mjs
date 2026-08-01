#!/usr/bin/env node
/**
 * F3 gate — the change must actually have been executed, not merely written.
 *
 * Generation is not verification. A build that was never run, a test that was
 * written but not executed, and a diff that was approved are all indistinguish-
 * able from working code until something runs it. This runs it.
 *
 * The set below is deliberately the fast one: it builds the real bundle,
 * validates the operating state and the story graph, and drives the save
 * migration gate in a real browser. The slow adversarial and full-playthrough
 * suites stay in `npm test` for integration boundaries; a required check that
 * takes twenty minutes gets bypassed, and a bypassed gate is not a gate.
 *
 *   node tools/gates/f3_execution.mjs
 *
 * Exit 0 only when every step actually ran and succeeded.
 */
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const STEPS = [
  ['operating state', ['node', 'tools/check_operating_state.mjs']],
  ['production build', ['node', 'build.mjs']],
  ['pages root mirror', ['node', 'tools/export_pages_root.mjs', '--check']],
  ['dev build', ['node', 'build.mjs', '--dev']],
  ['story and world content', ['node', 'tools/validate.mjs']],
  ['save migration', ['node', 'tools/save_migration.mjs']],
];

const failed = [];
for (const [name, cmd] of STEPS) {
  process.stdout.write(`F3 gate: ${name} ... `);
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd: ROOT, encoding: 'utf8' });
  if (r.status === 0) {
    console.log('ok');
  } else {
    console.log(`FAILED (exit ${r.status})`);
    failed.push({ name, status: r.status, out: (r.stdout || '') + (r.stderr || '') });
  }
}

if (failed.length) {
  console.error('\nF3 gate FAILED — work that has not been executed successfully may not merge.\n');
  for (const f of failed) {
    console.error(`--- ${f.name} (exit ${f.status}) ---`);
    console.error(f.out.split('\n').slice(-25).join('\n'));
  }
  process.exit(1);
}

console.log(`\nF3 gate: ok — ${STEPS.length} steps actually executed and succeeded.`);
process.exit(0);
