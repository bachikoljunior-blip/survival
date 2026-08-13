#!/usr/bin/env node
/**
 * F5 gate — a change may not merge without a recorded independence level and
 * review outcome.
 *
 * Two things must be true:
 *   1. AI_DEVELOPMENT/STATE.yaml carries exactly one top-level
 *      floor.independence_level_used scalar with level A, B, C or D.
 *   2. The delivery description begins with exactly one canonical record as
 *      its first non-empty line:
 *
 *        Floor-Review: C / pass
 *
 *      The body comes from F5_REVIEW_BODY, --body, or
 *      --body-file/F5_REVIEW_BODY_FILE for local tests.
 *      Level D is prepared-only and cannot complete an objective.
 *
 * Exit 0 when satisfied, 1 otherwise. This is a gate, not a report.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownScalar, parseStrictStateYaml } from './strict_state_yaml.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const arg = (name, fallback = '') => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const fail = (message) => {
  console.error(`F5 gate FAILED: ${message}`);
  process.exit(1);
};

function reviewRecord(state, body) {
  let parsedState;
  try {
    parsedState = parseStrictStateYaml(state, 'AI_DEVELOPMENT/STATE.yaml');
  } catch (error) {
    throw new Error(`STATE.yaml is not structurally valid: ${error.message}`);
  }
  const floor = ownScalar(parsedState, 'floor');
  const recordedLevel = ownScalar(floor, 'independence_level_used');
  if (!/^[ABCD]$/.test(recordedLevel || '')) {
    throw new Error('STATE.yaml must contain exactly one top-level floor.independence_level_used scalar with level A, B, C or D');
  }

  const bodyLines = body.replace(/\r\n/g, '\n').split('\n');
  const trailerPattern = /^Floor-Review: ([ABCD]) \/ (pass|fail|blocked|inconclusive)$/;
  const trailers = bodyLines
    .map((line, index) => {
      const match = trailerPattern.exec(line);
      return match ? { index, match } : null;
    })
    .filter(Boolean);
  if (trailers.length !== 1) {
    throw new Error(
      `found ${trailers.length} canonical review trailers; exactly one is required. `
      + 'The delivery must begin with Floor-Review: <A|B|C|D> / '
      + '<pass|fail|blocked|inconclusive>. Examples and superseded outcomes '
      + 'must not use the canonical trailer syntax',
    );
  }

  const firstNonEmptyIndex = bodyLines.findIndex((line) => line.trim());
  if (trailers[0].index !== firstNonEmptyIndex) {
    throw new Error('the single canonical Floor-Review record must be the first non-empty line of the delivery description');
  }

  const level = trailers[0].match[1];
  const outcome = trailers[0].match[2];
  if (outcome !== 'pass') {
    throw new Error(`the recorded review outcome is "${outcome}"; a change may not merge without a pass`);
  }
  if (level === 'D') {
    throw new Error('level D is prepared-only and never completes an objective');
  }
  if (level !== recordedLevel) {
    throw new Error(`the trailer claims level ${level} but STATE.yaml records ${recordedLevel}`);
  }
  return { level, outcome };
}

function selfTest() {
  const state = (level = 'B') => `version: 1\nfloor:\n  independence_level_used: ${level}\nremote:\n  status: test\n`;
  const invalid = [
    ['missing trailer', state(), 'review pending'],
    ['duplicated trailer', state(), 'Floor-Review: B / pass\nFloor-Review: B / pass'],
    ['superseded pass before blocked', state(), 'Floor-Review: B / pass\nFloor-Review: B / blocked'],
    ['fenced pass before blocked', state(), '```text\nFloor-Review: B / pass\n```\nFloor-Review: B / blocked'],
    ['single trailer in unclosed backtick fence', state(), 'Review\n```text\nFloor-Review: B / pass'],
    ['single trailer in unclosed tilde fence', state(), 'Review\n~~~~ text\nFloor-Review: B / pass'],
    ['single trailer in tilde fence with backtick info', state(), 'Review\n~~~`example`\nFloor-Review: B / pass'],
    ['single trailer in raw HTML pre block', state(), '<pre>\nFloor-Review: B / pass'],
    ['single trailer in unclosed HTML comment', state(), 'Review pending.\n\n<!--\nFloor-Review: B / pass'],
    ['record is not first', state(), 'Review summary\nFloor-Review: B / pass'],
    ['blocked outcome', state(), 'Floor-Review: B / blocked'],
    ['level mismatch', state(), 'Floor-Review: C / pass'],
    ['prepared-only level', state('D'), 'Floor-Review: D / pass'],
    ['out-of-section scalar only', 'independence_level_used: B\nremote:\n  status: test\n', 'Floor-Review: B / pass'],
    ['duplicated floor scalar', 'floor:\n  independence_level_used: B\n  independence_level_used: B\n', 'Floor-Review: B / pass'],
    ['quoted duplicate floor key', 'floor:\n  independence_level_used: B\n"floor":\n  independence_level_used: D\n', 'Floor-Review: B / pass'],
    ['commented duplicate floor key', 'floor:\n  independence_level_used: B\nfloor: # duplicate\n  independence_level_used: D\n', 'Floor-Review: B / pass'],
    ['quoted duplicate child key', 'floor:\n  independence_level_used: B\n  "independence_level_used": D\n', 'Floor-Review: B / pass'],
    ['hex-escaped duplicate floor key', 'floor:\n  independence_level_used: B\n"f\\x6coor":\n  independence_level_used: D\n', 'Floor-Review: B / pass'],
    ['long-unicode-escaped duplicate child key', 'floor:\n  independence_level_used: B\n  "independence_level_\\U00000075sed": D\n', 'Floor-Review: B / pass'],
    ['tagged duplicate floor key', 'floor:\n  independence_level_used: B\n!!str floor:\n  independence_level_used: D\n', 'Floor-Review: B / pass'],
    ['anchored duplicate floor key', 'floor:\n  independence_level_used: B\n&x floor:\n  independence_level_used: D\n', 'Floor-Review: B / pass'],
    ['top-level prototype injection', '__proto__:\n  floor:\n    independence_level_used: B\n', 'Floor-Review: B / pass'],
    ['nested prototype injection', 'floor:\n  __proto__:\n    independence_level_used: B\n', 'Floor-Review: B / pass'],
  ];

  let passed = 0;
  try {
    const valid = reviewRecord(
      `independence_level_used: A\n${state('B')}`,
      '\nFloor-Review: B / pass\n\nReview complete.\n',
    );
    if (valid.level !== 'B') throw new Error(`valid control returned ${valid.level}`);
    console.log('ok  exact floor scalar + one first-line record passes');
    passed += 1;
  } catch (error) {
    console.error(`FAIL valid control — ${error.message}`);
  }

  for (const [name, yaml, body] of invalid) {
    try {
      reviewRecord(yaml, body);
      console.error(`FAIL ${name} — unexpectedly passed`);
    } catch {
      console.log(`ok  ${name} rejected`);
      passed += 1;
    }
  }
  const total = invalid.length + 1;
  if (passed !== total) {
    console.error(`F5 self-test FAILED — ${passed}/${total}`);
    process.exit(1);
  }
  console.log(`F5 self-test OK — ${passed}/${total}`);
  process.exit(0);
}

if (has('self-test')) selfTest();

const bodyFile = arg('body-file', process.env.F5_REVIEW_BODY_FILE || '');
let body = arg('body', process.env.F5_REVIEW_BODY || '');
if (bodyFile) {
  try {
    body = readFileSync(bodyFile, 'utf8');
  } catch (error) {
    fail(`could not read the authoritative pull-request body file: ${error.message}`);
  }
}

let canonicalState;
try {
  canonicalState = readFileSync(join(ROOT, 'AI_DEVELOPMENT/STATE.yaml'), 'utf8');
} catch {
  fail('AI_DEVELOPMENT/STATE.yaml is missing; there is no canonical review level');
}

let record;
try {
  record = reviewRecord(canonicalState, body);
} catch (error) {
  fail(`${error.message} (searched ${body.length} characters of review body)`);
}

console.log(`F5 gate: ok — independence level ${record.level}, outcome ${record.outcome}, and STATE.yaml agrees.`);
