#!/usr/bin/env node
// Every file in .github/workflows must be one GitHub can actually load.
//
// This exists because of a measured failure, not a hypothetical one.
// `revert-to-verified.yml` shipped with a `git commit -m "..."` whose second
// paragraph started at column 1, which ends the enclosing `run: |` block
// scalar. The file was never valid YAML. GitHub does not report that as a
// broken workflow in any obvious way: it creates a run named after the file
// path, fails it in under a second with ZERO jobs, and moves on. It did that 48
// times. Meanwhile AI_DEVELOPMENT/STATE.yaml recorded the revert mechanism as
// `prepared_not_executed` — present but never exercised — when the truth was
// that it could not be dispatched at all, because there was nothing to
// dispatch. Nothing in the repository looked at these files, so nothing knew.
//
// A workflow is the one kind of code here that never runs locally. That makes
// it exactly the kind of code that needs a local check.
//
//   node tools/check_workflows.mjs            check .github/workflows/*.yml
//   node tools/check_workflows.mjs --selftest prove the check can fail
//
// The selftest matters as much as the check. Section 0 F9 is explicit that a
// gate never observed failing is `prepared_not_executed`, not active — so this
// carries the bad inputs it must reject, including the real defect above.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { load as loadYaml } from 'js-yaml';

const WORKFLOW_DIR = '.github/workflows';

// GitHub parses `on:` as YAML 1.1, where the bare word `on` is the boolean
// true. js-yaml does the same, so the trigger block arrives under the key
// `true` unless it was quoted. Both spellings are legitimate and both must be
// accepted, or this check would fail every workflow in the repository.
const triggerOf = (doc) => (doc?.on !== undefined ? doc.on : doc?.[true]);

function structuralFaults(doc) {
  const faults = [];
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return ['the file does not describe a workflow (top level is not a mapping)'];
  }
  if (triggerOf(doc) === undefined) faults.push('no `on:` trigger, so the workflow can never start');

  const jobs = doc.jobs;
  if (jobs === undefined) {
    faults.push('no `jobs:` block, so the workflow has nothing to run');
    return faults;
  }
  if (typeof jobs !== 'object' || Array.isArray(jobs)) {
    faults.push('`jobs:` is not a mapping of job id to job');
    return faults;
  }

  for (const [id, job] of Object.entries(jobs)) {
    if (typeof job !== 'object' || job === null || Array.isArray(job)) {
      faults.push(`job \`${id}\` is not a mapping`);
      continue;
    }
    // A job either runs steps somewhere, or calls a reusable workflow.
    if (job.uses === undefined && job['runs-on'] === undefined) {
      faults.push(`job \`${id}\` has neither \`runs-on:\` nor \`uses:\``);
    }
    if (job.uses === undefined && job.steps === undefined) {
      faults.push(`job \`${id}\` has no \`steps:\``);
    }
    // `needs` pointing at a job id that does not exist is accepted by the YAML
    // parser and then silently strands the job forever.
    const needs = job.needs === undefined ? [] : [].concat(job.needs);
    for (const need of needs) {
      if (!Object.prototype.hasOwnProperty.call(jobs, need)) {
        faults.push(`job \`${id}\` needs \`${need}\`, which is not a job in this file`);
      }
    }
  }
  return faults;
}

// Returns a list of human-readable problems. Empty means the file is loadable
// and structurally sound.
export function inspectWorkflow(source) {
  let doc;
  try {
    doc = loadYaml(source);
  } catch (error) {
    // js-yaml reports the line; keep it, because "somewhere in this file" is
    // not enough to act on.
    const where = error?.mark?.line !== undefined ? ` (line ${error.mark.line + 1})` : '';
    return [`GitHub cannot load this file — it is not valid YAML${where}: ${error.reason || error.message}`];
  }
  return structuralFaults(doc);
}

function checkDirectory() {
  if (!existsSync(WORKFLOW_DIR)) {
    console.log(`no ${WORKFLOW_DIR}/ — nothing to check`);
    return 0;
  }
  const files = readdirSync(WORKFLOW_DIR)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort();

  if (files.length === 0) {
    console.log(`no workflow files in ${WORKFLOW_DIR}/ — nothing to check`);
    return 0;
  }

  let broken = 0;
  for (const name of files) {
    const path = join(WORKFLOW_DIR, name);
    const faults = inspectWorkflow(readFileSync(path, 'utf8'));
    if (faults.length === 0) {
      console.log(`  ok  ${path}`);
      continue;
    }
    broken += 1;
    console.log(`  FAIL ${path}`);
    for (const fault of faults) console.log(`       - ${fault}`);
  }

  if (broken > 0) {
    console.log(`\nworkflow check FAILED: ${broken} of ${files.length} file(s) GitHub would not run.`);
    console.log('A workflow that does not load is not a workflow that is merely failing.');
    console.log('It produces a run with zero jobs, so anything depending on it silently does not exist.');
    return 1;
  }
  console.log(`\nworkflow check passed: ${files.length} file(s) load and are structurally sound.`);
  return 0;
}

// --- negative controls -----------------------------------------------------
// Each case must be REJECTED. If any is accepted, this checker is decorative
// and says so by exiting non-zero.

const BAD_INPUTS = [
  {
    name: 'the real defect: a heredoc paragraph escaping a `run: |` block scalar',
    // This is revert-to-verified.yml's shape, reduced. The blank line then a
    // column-1 paragraph terminates the block scalar and YAML tries to read
    // prose as a mapping key.
    source: [
      'name: Revert',
      'on:',
      '  workflow_dispatch:',
      'jobs:',
      '  revert:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: |',
      '          git commit -m "Revert the published build',
      '',
      'The public surface was not serving the intended revision."',
      '',
    ].join('\n'),
  },
  {
    name: 'a tab used for indentation',
    source: 'name: T\non:\n  push:\njobs:\n\tj:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n',
  },
  {
    name: 'an unterminated quoted string',
    source: 'name: "unclosed\non:\n  push:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n',
  },
  {
    name: 'a duplicated key',
    source: 'name: T\non:\n  push:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    runs-on: macos-15\n    steps:\n      - run: echo hi\n',
  },
  {
    name: 'no trigger at all',
    source: 'name: T\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n',
  },
  {
    name: 'a job with no runner',
    source: 'name: T\non:\n  push:\njobs:\n  j:\n    steps:\n      - run: echo hi\n',
  },
  {
    name: 'a job with no steps',
    source: 'name: T\non:\n  push:\njobs:\n  j:\n    runs-on: ubuntu-latest\n',
  },
  {
    name: '`needs` naming a job that does not exist',
    source: [
      'name: T',
      'on:',
      '  push:',
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: echo build',
      '  deploy:',
      '    needs: [build, ios-safari]',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: echo deploy',
      '',
    ].join('\n'),
  },
];

// Each of these must be ACCEPTED. A checker that rejects legitimate workflows
// is worse than none: the next session works around it instead of trusting it.
const GOOD_INPUTS = [
  {
    name: 'the YAML 1.1 `on` / boolean-true trigger key',
    source: 'name: T\non:\n  push:\n    branches: [main]\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n',
  },
  {
    name: 'a quoted "on" key',
    source: 'name: T\n"on":\n  push:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n',
  },
  {
    name: 'a folded block scalar, which the kit state parser rejects but GitHub accepts',
    source: 'name: T\non:\n  push:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - name: >-\n          a folded\n          name\n        run: echo hi\n',
  },
  {
    name: 'an inline mapping and a reusable-workflow job',
    source: 'name: T\non:\n  push:\njobs:\n  j:\n    uses: ./.github/workflows/other.yml\n    with: {value: 1}\n',
  },
  {
    name: 'a blank line inside a `run: |` block scalar, correctly indented',
    source: 'name: T\non:\n  push:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: |\n          echo one\n\n          echo two\n',
  },
];

function selftest() {
  let failures = 0;

  console.log('bad inputs — each must be rejected:');
  for (const { name, source } of BAD_INPUTS) {
    const faults = inspectWorkflow(source);
    if (faults.length > 0) {
      console.log(`  rejected  ${name}`);
      console.log(`            -> ${faults[0]}`);
    } else {
      console.log(`  ACCEPTED  ${name}  <- the check did not fire`);
      failures += 1;
    }
  }

  console.log('\ngood inputs — each must be accepted:');
  for (const { name, source } of GOOD_INPUTS) {
    const faults = inspectWorkflow(source);
    if (faults.length === 0) {
      console.log(`  accepted  ${name}`);
    } else {
      console.log(`  REJECTED  ${name}  <- false positive: ${faults[0]}`);
      failures += 1;
    }
  }

  const total = BAD_INPUTS.length + GOOD_INPUTS.length;
  if (failures > 0) {
    console.log(`\nselftest FAILED: ${failures} of ${total} case(s) went the wrong way.`);
    return 1;
  }
  console.log(`\nselftest passed: ${BAD_INPUTS.length} bad inputs rejected, ${GOOD_INPUTS.length} good inputs accepted.`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes('--selftest') ? selftest() : checkDirectory());
}
