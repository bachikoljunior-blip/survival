#!/usr/bin/env node
/**
 * Read-only validation for a diagnostic rollback request.
 *
 * Workflow-dispatch input is untrusted. This tool requires a full lowercase
 * SHA and compares it with the single canonical
 * `remote.verified_public_revision` value in STATE.yaml. It deliberately has
 * no record, branch, pull-request, deployment, or file-writing mode: R2-9
 * makes the recorded revision unsafe for saves written by current main.
 *
 *   node tools/gates/verified_revert_request.mjs --revision <40-hex-sha>
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownScalar, parseStrictStateYaml } from './strict_state_yaml.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const argv = process.argv.slice(2);
const arg = (name, fallback = '') => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const fail = (message) => {
  console.error(`Verified-rollback diagnostic FAILED: ${message}`);
  process.exit(1);
};

const statePath = arg('state', join(ROOT, 'AI_DEVELOPMENT/STATE.yaml'));
const requested = arg('revision');
if (!/^[0-9a-f]{40}$/.test(requested)) {
  fail('revision must be exactly 40 lowercase hexadecimal characters');
}

let state;
try {
  state = readFileSync(statePath, 'utf8');
} catch (error) {
  fail(`cannot read canonical state: ${error.message}`);
}

let parsedState;
try {
  parsedState = parseStrictStateYaml(state, statePath);
} catch (error) {
  fail(`canonical state is not structurally valid: ${error.message}`);
}
const canonical = ownScalar(ownScalar(parsedState, 'remote'), 'verified_public_revision');
if (!canonical || !/^[0-9a-f]{40}$/.test(canonical)) {
  fail('remote.verified_public_revision is missing, duplicated, or not a full lowercase commit SHA');
}
if (requested !== canonical) {
  fail(`requested revision does not match remote.verified_public_revision (${canonical})`);
}

console.log(`Verified-rollback diagnostic: ${requested} matches canonical public verification state.`);
