#!/usr/bin/env node
/**
 * F2 gate — a commit that changes the product must also update the canonical
 * state file.
 *
 * The floor obligation is that a run which materially changed the project
 * records objective status, last verified checkpoint, unverified artifacts,
 * blockers, recovery, remote state and the exact next action before it ends.
 * Nothing in a document can force that. This can: if product files moved and
 * AI_DEVELOPMENT/STATE.yaml did not, the check fails and the merge is blocked.
 *
 *   node tools/gates/f2_state_update.mjs                 compare against origin/main
 *   node tools/gates/f2_state_update.mjs --base <ref>    compare against <ref>
 *
 * Exit 0 when satisfied or not applicable, 1 when the state file is missing its
 * update. This is a gate, not a report.
 */
import { execSync } from 'node:child_process';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BASE = arg('base', process.env.F2_BASE || 'origin/main');
const STATE = 'AI_DEVELOPMENT/STATE.yaml';

// Files whose change means the product itself moved. Operating documents,
// evidence and archives are deliberately excluded: recording what happened is
// not the same as changing what the project does.
const PRODUCT = [
  /^src\//, /^public\//, /^tools\//, /^build\.mjs$/, /^package\.json$/,
  /^package-lock\.json$/, /^index\.html$/, /^styles\.css$/,
  /^manifest\.webmanifest$/, /^cinderline\.[^/]+\.js$/, /^\.github\/workflows\//,
];

let changed;
try {
  changed = execSync(`git diff --name-only ${BASE}...HEAD`, { encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean);
} catch (e) {
  console.error(`F2 gate: cannot diff against ${BASE} — ${e.message}`);
  console.error('F2 gate: refusing to pass a check it could not perform.');
  process.exit(1);
}

const product = changed.filter((f) => PRODUCT.some((re) => re.test(f)));
if (!product.length) {
  console.log(`F2 gate: not applicable — no product files changed against ${BASE}.`);
  process.exit(0);
}

if (!changed.includes(STATE)) {
  console.error(`F2 gate FAILED: ${product.length} product file(s) changed but ${STATE} was not updated.`);
  for (const f of product.slice(0, 20)) console.error(`  - ${f}`);
  if (product.length > 20) console.error(`  ... and ${product.length - 20} more`);
  console.error('');
  console.error('The floor requires the canonical state to carry objective status, last');
  console.error('verified checkpoint, modified-but-unverified artifacts, blockers, recovery,');
  console.error('remote state and the exact next action. Update it and push again.');
  process.exit(1);
}

console.log(`F2 gate: ok — ${product.length} product file(s) changed and ${STATE} was updated.`);
process.exit(0);
