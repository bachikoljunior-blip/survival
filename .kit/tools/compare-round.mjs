#!/usr/bin/env node
/**
 * compare-round.mjs — the comparison step of a phone review round.
 *
 * One round is: run the repo's own iPhone SE 3 harness, then run this against the report it
 * wrote. The harness answers "is it broken"; this answers "is it worse than last time".
 *
 *   node .kit/tools/compare-round.mjs --config=iphone-se3-round.config.json
 *   node .kit/tools/compare-round.mjs --config=... --accept        # record this round as the bar
 *   node .kit/tools/compare-round.mjs --config=... --bootstrap     # first round: record, do not judge
 *   node .kit/tools/compare-round.mjs --config=... --selftest      # prove the gate can fail
 *
 * Exit codes: 0 pass, 1 regressed or incomparable, 2 usage error.
 *
 * "Incomparable" is deliberately a failure and not a skip. Every refusal in
 * `lib/mobile/roundCompare.mjs` exists because the alternative — a comparison that quietly
 * did not happen — is indistinguishable from one that passed.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { acceptRound, compareRounds, selfTestCases, SUGGESTED_METRICS } from '../lib/mobile/roundCompare.mjs';
import { reportGateSelfTests } from '../lib/state/selftest.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.join('=') || true];
}));

function die(message) {
  console.error(`FAIL ${message}`);
  process.exit(2);
}

function readJson(path, what) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    die(`could not read ${what} at ${path}: ${error.message}`);
  }
}

/* ---------------------------------------------------------------- selftest */

if (argv.selftest) {
  const ok = await reportGateSelfTests(selfTestCases(), { label: 'iphone-se3 round comparison' });
  process.exit(ok ? 0 : 1);
}

/* ------------------------------------------------------------------ config */

// Relative paths in the config are relative to the repository, not to whatever directory the
// command was run from. In a target repo this file lives at `.kit/tools/`, so the root is two
// levels up; run straight out of the kit checkout there is no target, so the cwd is the root.
const kitRoot = resolve(HERE, '..');
const repoRoot = basename(kitRoot) === '.kit' ? resolve(kitRoot, '..') : process.cwd();

/** Repo-relative when it is inside the repo, absolute when it is not — never a sliced stump. */
const show = (path) => {
  const rel = relative(repoRoot, path);
  return rel && !rel.startsWith('..') ? rel : path;
};
const abs = (p) => (isAbsolute(p) ? p : join(repoRoot, p));

const configPath = abs(String(argv.config || 'iphone-se3-round.config.json'));
if (!existsSync(configPath)) {
  die(`no round config at ${configPath}. Create one (see .kit/lib/mobile/roundCompare.mjs for the metric shape) or pass --config=<path>.`);
}
const config = readJson(configPath, 'round config');

const currentPath = abs(String(argv.current || config.current || ''));
const baselinePath = abs(String(argv.baseline || config.baseline || ''));
const metrics = Array.isArray(config.metrics) && config.metrics.length ? config.metrics : SUGGESTED_METRICS;
const outPath = abs(String(argv.out || config.out || join(dirname(currentPath), 'round-comparison.json')));

if (!config.current && !argv.current) die(`the config at ${configPath} declares no "current" report path`);
if (!config.baseline && !argv.baseline) die(`the config at ${configPath} declares no "baseline" round path`);

if (!existsSync(currentPath)) {
  die(`no harness report at ${currentPath} — run this repository's iPhone SE 3 WebKit harness first.`);
}
const current = readJson(currentPath, 'harness report');
const baseline = existsSync(baselinePath) ? readJson(baselinePath, 'baseline round') : null;

/* ------------------------------------------------------------- provenance */

// Recorded so a future round can say which build the bar came from. Read from the
// environment rather than by shelling out to git: this also runs on a runner whose checkout
// may be shallow, and a wrong sha is worse than an absent one.
const provenance = {
  revision: process.env.GITHUB_SHA || process.env.ROUND_REVISION || null,
  runUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null,
  note: String(argv.note || config.note || 'emulator round-over-round comparison; not evidence about a physical iPhone SE 3'),
};

/* ------------------------------------------------------------- bootstrap */

if (argv.bootstrap && !baseline) {
  let record;
  try {
    record = acceptRound(current, { metrics, provenance });
  } catch (error) {
    console.error(`FAIL ${error.message}`);
    process.exit(1);
  }
  mkdirSync(dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`[round] BOOTSTRAPPED: recorded ${Object.keys(record.metrics).length} metric(s) as the first baseline at ${baselinePath}`);
  if (record.notMeasured.length) {
    console.log(`[round] not measured by this round, so not in the bar: ${record.notMeasured.join(', ')}`);
  }
  console.log('[round] no comparison was performed — a first round has nothing to be compared against.');
  process.exit(0);
}

/* --------------------------------------------------------------- compare */

const result = compareRounds({ baseline, current, metrics });
const record = {
  schemaVersion: 1,
  comparedAt: new Date().toISOString(),
  config: show(configPath),
  currentReport: show(currentPath),
  baselineRound: existsSync(baselinePath) ? show(baselinePath) : null,
  provenance,
  ...result,
};
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);

for (const row of result.metrics) {
  const mark = { pass: 'ok  ', improved: 'up  ', unchanged: 'ok  ', regressed: 'WORSE', lost: 'LOST', unrecorded: 'new ', absent: '--  ' }[row.verdict] || '?';
  console.log(`  ${mark} ${row.key.padEnd(20)} ${row.detail}`);
}
for (const reason of result.reasons) console.error(`  ! ${reason}`);
console.log(`[round] ${result.summary}`);
console.log(`[round] written to ${show(outPath)}`);

/* ---------------------------------------------------------------- accept */

if (argv.accept) {
  // Accepting a regressed round is a decision someone can legitimately make — the round got
  // slower on purpose and the new number is the new bar. Accepting an *incomparable* one is
  // not: there is nothing to have decided about.
  if (!result.comparable && result.verdict !== 'pass') {
    console.error('[round] refusing --accept: this round was incomparable, so nothing was judged. Fix the reasons above first.');
    process.exit(1);
  }
  let next;
  try {
    next = acceptRound(current, { metrics, provenance });
  } catch (error) {
    console.error(`FAIL ${error.message}`);
    process.exit(1);
  }
  mkdirSync(dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`[round] recorded this round as the new bar at ${show(baselinePath)}`);
}

process.exit(result.verdict === 'pass' ? 0 : 1);
