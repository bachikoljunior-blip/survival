/**
 * ledger.mjs — the registry of adopted skills, and the reason a revert is always possible.
 *
 * `.kit/INSTALLED.json` already proved the shape works: a file's expected sha256 written at
 * install time is what makes `bootstrap.mjs --check` able to say "edited in place" and "lost"
 * about a vendored copy that has no upstream to compare against. This is the same idea applied
 * to a mutable thing, so it has to keep one more column — the bytes it replaced.
 *
 * Reverting through git would be shorter and is not enough: these sessions run in disposable
 * containers, adoption and revert can land in the same session before anything is pushed, and
 * a revert that depends on a remote is a revert that can fail when it is needed. The previous
 * body is copied into `history/` and the restore is verified by hash.
 *
 * Paths are stored **relative to the repository root** for the same reason the kit is vendored
 * at all: the next session gets a fresh container and a different absolute path, and a ledger
 * full of `/home/<somebody>/...` describes a machine that no longer exists.
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
export const hashFile = (path) => sha256(readFileSync(path));

const EMPTY = { version: 1, skills: {} };

export function readLedger(path) {
  if (!existsSync(path)) return structuredClone(EMPTY);
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return { ...structuredClone(EMPTY), ...parsed, skills: parsed.skills || {} };
}

export function writeLedger(path, ledger) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`);
}

/**
 * Record an adoption and stash the bytes it replaced.
 *
 * @param {object} input
 * @param {string} input.ledgerPath
 * @param {string} input.name              Skill name.
 * @param {'local'|'shared'} input.tier    `local` never leaves this repository.
 * @param {string} input.livePath          Where the adopted SKILL.md lives.
 * @param {string} input.candidatePath     The candidate body to install.
 * @param {string} input.historyDir
 * @param {object} input.provenance        candidate id, round, author, evaluator, evidence ids.
 * @returns {{ledger: object, revision: number, prior_sha256: string|null}}
 */
export function adopt({ ledgerPath, name, tier, livePath, candidatePath, historyDir, provenance, root = '.' }) {
  const rel = (p) => (isAbsolute(p) ? relative(root, p) : p);
  const ledger = readLedger(ledgerPath);
  const entry = ledger.skills[name];
  const revisionNumber = (entry?.revision || 0) + 1;
  const priorHash = existsSync(livePath) ? hashFile(livePath) : null;

  if (priorHash) {
    const stash = join(historyDir, `${name}@${revisionNumber - 1}`, 'SKILL.md');
    mkdirSync(dirname(stash), { recursive: true });
    copyFileSync(livePath, stash);
    if (hashFile(stash) !== priorHash) throw new Error(`history copy of ${name} does not match the file it copied`);
  }

  mkdirSync(dirname(livePath), { recursive: true });
  copyFileSync(candidatePath, livePath);

  ledger.skills[name] = {
    tier,
    revision: revisionNumber,
    sha256: hashFile(livePath),
    prior_sha256: priorHash,
    live_path: rel(livePath),
    history: priorHash ? rel(join(historyDir, `${name}@${revisionNumber - 1}`, 'SKILL.md')) : null,
    provenance,
    // Everything a live A/B would need is absent by construction at adoption time: this record
    // says the rule discriminates on recorded cases, and nothing about a future round.
    live_effect: 'unmeasured',
    human_verified: false,
  };
  writeLedger(ledgerPath, ledger);
  return { ledger, revision: revisionNumber, prior_sha256: priorHash };
}

/**
 * Put back the bytes the last adoption replaced, and verify it landed.
 *
 * @returns {{restored: boolean, from: string|null, sha256: string|null, reason?: string}}
 */
export function revert({ ledgerPath, name, root = '.' }) {
  const abs = (p) => (p && !isAbsolute(p) ? join(root, p) : p);
  const ledger = readLedger(ledgerPath);
  const entry = ledger.skills[name];
  if (!entry) return { restored: false, from: null, sha256: null, reason: `${name} is not in the ledger` };
  if (!entry.history || !entry.prior_sha256) {
    return { restored: false, from: null, sha256: null, reason: `${name} r${entry.revision} was a first adoption; remove the file to undo it` };
  }
  if (!existsSync(abs(entry.history))) {
    return { restored: false, from: entry.history, sha256: null, reason: 'the stashed previous body is missing' };
  }
  copyFileSync(abs(entry.history), abs(entry.live_path));
  const after = hashFile(abs(entry.live_path));
  if (after !== entry.prior_sha256) {
    return { restored: false, from: entry.history, sha256: after, reason: 'restored bytes do not match the recorded prior hash' };
  }
  entry.revision -= 1;
  entry.sha256 = after;
  entry.prior_sha256 = null;
  entry.history = null;
  entry.reverted = true;
  writeLedger(ledgerPath, ledger);
  return { restored: true, from: entry.history, sha256: after };
}

/**
 * Has anything been edited in place since it was adopted?
 *
 * The failure this catches is the quiet one: a session improves a skill by editing it directly,
 * the ledger still describes the version before, and the next comparison is against a baseline
 * that no longer exists.
 *
 * @returns {string[]} drift descriptions, empty when the ledger describes what is on disk
 */
export function checkLedger(ledgerPath, { root = '.' } = {}) {
  const abs = (p) => (p && !isAbsolute(p) ? join(root, p) : p);
  const ledger = readLedger(ledgerPath);
  const drift = [];
  for (const [name, entry] of Object.entries(ledger.skills)) {
    if (/^([a-zA-Z]:)?[\\/]/.test(entry.live_path)) {
      drift.push(`${name}: live_path is absolute (${entry.live_path}); this ledger cannot survive a fresh container`);
      continue;
    }
    if (!existsSync(abs(entry.live_path))) { drift.push(`${name}: adopted file is missing (${entry.live_path})`); continue; }
    const actual = hashFile(abs(entry.live_path));
    if (actual !== entry.sha256) drift.push(`${name}: edited in place since r${entry.revision} (${entry.sha256.slice(0, 12)} -> ${actual.slice(0, 12)})`);
    if (entry.history && !existsSync(abs(entry.history))) drift.push(`${name}: cannot be reverted, stashed previous body is missing`);
  }
  return drift;
}
