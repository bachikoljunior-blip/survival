#!/usr/bin/env node
/**
 * Negative regression suite for GB06-R01 through GB06-R04.
 *
 * Every probe must make the authoritative Gate B evidence non-passing. The
 * clean runner is intentionally separate and must be run afterwards so a
 * successful current attempt, rather than this expected-failure suite, is the
 * final durable gate record.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RUNNER = join(ROOT, 'tools', 'gate_b_slice.mjs');
const EVIDENCE = join(ROOT, 'AI_DEVELOPMENT', 'EVIDENCE', 'GB-IMP06-SLICE.json');

const probes = [
  {
    name: 'dynamic placement alias',
    args: ['--adversarial=placement-alias'],
    evidenceProbe: 'placement-alias',
    requiredText: 'actor placement helper invoked after fresh spawn',
  },
  {
    name: 'pre-combat hostile HP write',
    args: ['--adversarial=precombat-hp'],
    evidenceProbe: 'precombat-hp',
    requiredText: 'courtyard raid was preconditioned before its first fixed step',
  },
  {
    name: 'computed combat-resolver alias',
    args: ['--adversarial=combat-resolver'],
    evidenceProbe: 'combat-resolver',
    requiredText: 'combat hit resolver invoked outside production arc traversal',
  },
  {
    name: 'attack-definition event reentry',
    args: ['--adversarial=attack-definition-reentry'],
    evidenceProbe: 'attack-definition-reentry',
    requiredText: 'authored attack definition field damage was assigned',
  },
  {
    name: 'attack-definition poise event reentry',
    args: ['--adversarial=attack-definition-poise-reentry'],
    evidenceProbe: 'attack-definition-poise-reentry',
    requiredText: 'authored attack definition field poise was assigned',
  },
  {
    name: 'attack-definition reach event reentry',
    args: ['--adversarial=attack-definition-reach-reentry'],
    evidenceProbe: 'attack-definition-reach-reentry',
    requiredText: 'authored attack definition field reach was assigned',
  },
  {
    name: 'attack-definition arc event reentry',
    args: ['--adversarial=attack-definition-arc-reentry'],
    evidenceProbe: 'attack-definition-arc-reentry',
    requiredText: 'authored attack definition field arc was assigned',
  },
  {
    name: 'active-attack timing event reentry',
    args: ['--adversarial=attack-state-reentry'],
    evidenceProbe: 'attack-state-reentry',
    requiredText: 'active attack field windup was assigned',
  },
  {
    name: 'active-attack active-window event reentry',
    args: ['--adversarial=attack-state-active-reentry'],
    evidenceProbe: 'attack-state-active-reentry',
    requiredText: 'active attack field active was assigned',
  },
  {
    name: 'attack hit-set event reentry',
    args: ['--adversarial=attack-hitset-reentry'],
    evidenceProbe: 'attack-hitset-reentry',
    requiredText: 'active attack hit set was mutated outside arc resolution',
  },
  {
    name: 'attack hit-set prototype event reentry',
    args: ['--adversarial=attack-hitset-prototype-reentry'],
    evidenceProbe: 'attack-hitset-prototype-reentry',
    requiredText: 'active attack hit set diverged from authenticated arc selection',
  },
  {
    name: 'damage-event HP reentry',
    args: ['--adversarial=combat-event-hp-reentry'],
    evidenceProbe: 'combat-event-hp-reentry',
    requiredText: 'hp changed without authenticated damage',
  },
  {
    name: 'nested damage-method event reentry',
    args: ['--adversarial=nested-damage-reentry'],
    evidenceProbe: 'nested-damage-reentry',
    requiredText: 'protected actor damage invoked without authenticated hit resolution',
  },
  {
    name: 'death-state event reentry',
    args: ['--adversarial=death-state-reentry'],
    evidenceProbe: 'death-state-reentry',
    requiredText: 'death state changed without authenticated damage',
  },
  {
    name: 'kill-event reentry',
    args: ['--adversarial=kill-event-reentry'],
    evidenceProbe: 'kill-event-reentry',
    requiredText: 'raid combat telemetry emitted without an authenticated hit resolution',
  },
  {
    name: 'post-audit updater registration',
    args: ['--adversarial=updater-registration'],
    evidenceProbe: 'updater-registration',
    requiredText: 'engine updater registered after integrity audit',
  },
  {
    name: 'direct updater-list mutation',
    args: ['--adversarial=updater-list-direct'],
    evidenceProbe: 'updater-list-direct',
    requiredText: 'engine updater list mutated after integrity audit',
  },
  {
    name: 'computed updater-list mutation',
    args: ['--adversarial=updater-list-computed'],
    evidenceProbe: 'updater-list-computed',
    requiredText: 'engine updater list mutated after integrity audit',
  },
  {
    name: 'failed-latest-run evidence invalidation',
    args: ['--force-failure'],
    evidenceProbe: null,
    requiredText: 'forced evidence-currentness failure',
    forceFailure: true,
  },
];

for (const probe of probes) {
  const child = spawnSync(process.execPath, [RUNNER, ...probe.args], {
    cwd: ROOT,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const report = JSON.parse(readFileSync(EVIDENCE, 'utf8'));
  const searchable = `${child.stdout || ''}\n${child.stderr || ''}\n${JSON.stringify(report)}`;
  const bindings = report.bindings?.sha256 || {};
  const problems = [];
  if (child.status === 0) problems.push('runner unexpectedly exited 0');
  if (report.status !== 'failed' || report.passed !== false) {
    problems.push(`authoritative evidence remained ${report.status}/${report.passed}`);
  }
  if (report.adversarial_probe !== probe.evidenceProbe) {
    problems.push(`evidence probe was ${report.adversarial_probe}, expected ${probe.evidenceProbe}`);
  }
  if (probe.forceFailure && report.forced_failure !== true) problems.push('forced_failure was not recorded');
  if (!searchable.includes(probe.requiredText)) problems.push(`missing rejection evidence: ${probe.requiredText}`);
  if (!report.run_id || !report.bindings?.state_revision ||
      !bindings.engine || !bindings.driver || !bindings.runner || !bindings.built_bundle) {
    problems.push('evidence is not fully revision/source/build bound');
  }
  if (problems.length) {
    console.error(`FAIL  ${probe.name}`);
    for (const problem of problems) console.error(`      ${problem}`);
    process.exit(1);
  }
  console.log(`ok    ${probe.name} -> nonzero exit and current passed:false evidence`);
}

console.log('GATE B ADVERSARIAL REGRESSIONS OK');
