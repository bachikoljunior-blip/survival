#!/usr/bin/env node
/**
 * F5 gate — a change may not merge without a recorded independence level and
 * review outcome.
 *
 * The floor requires a deliberate falsification pass before an objective is
 * completed or a STRICT operation proceeds, and requires the independence level
 * actually used to be recorded. A level nobody wrote down is indistinguishable
 * from a pass nobody performed, so this check demands the record and fails
 * without it.
 *
 * Two things must be true:
 *   1. AI_DEVELOPMENT/STATE.yaml carries floor.independence_level_used with a
 *      real level (A, B, C or D).
 *   2. The delivery carries a review trailer naming the level and the outcome:
 *
 *        Floor-Review: C / pass
 *        Floor-Review: A / fail
 *
 *      Read from the pull-request body via F5_REVIEW_BODY, or from --body.
 *      Level D alone never completes an objective, so D is refused when the
 *      outcome claims completion.
 *
 * Exit 0 when satisfied, 1 otherwise. This is a gate, not a report.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BODY = arg('body', process.env.F5_REVIEW_BODY || '');

const fail = (msg) => { console.error(`F5 gate FAILED: ${msg}`); process.exit(1); };

let state;
try {
  state = readFileSync(join(ROOT, 'AI_DEVELOPMENT/STATE.yaml'), 'utf8');
} catch {
  fail('AI_DEVELOPMENT/STATE.yaml is missing. The floor has no canonical state to record a review level in.');
}

const recorded = /^\s*independence_level_used:\s*"?([ABCD])"?\s*$/m.exec(state);
if (!recorded) {
  fail('AI_DEVELOPMENT/STATE.yaml has no floor.independence_level_used with a level of A, B, C or D.');
}

const trailer = /^\s*Floor-Review:\s*([ABCD])\s*\/\s*(pass|fail|blocked|inconclusive)\s*$/mi.exec(BODY);
if (!trailer) {
  fail(
    'no review trailer found. The delivery description must contain a line of the form\n' +
    '        Floor-Review: <A|B|C|D> / <pass|fail|blocked|inconclusive>\n' +
    '      naming the independence level actually used and what the review concluded.\n' +
    `      (searched ${BODY.length} characters of review body)`);
}

const level = trailer[1].toUpperCase();
const outcome = trailer[2].toLowerCase();

if (outcome !== 'pass') {
  fail(`the recorded review outcome is "${outcome}". A change may not merge on a review that did not pass.`);
}
if (level === 'D') {
  fail('level D is "prepared only" — review material written but never executed. It never completes an objective.');
}
if (level !== recorded[1].toUpperCase()) {
  fail(`the review trailer claims level ${level} but STATE.yaml records ${recorded[1].toUpperCase()}. They must agree.`);
}

console.log(`F5 gate: ok — independence level ${level}, outcome ${outcome}, and STATE.yaml agrees.`);
process.exit(0);
