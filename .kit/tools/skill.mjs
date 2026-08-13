#!/usr/bin/env node
/**
 * skill.mjs — propose, evaluate, adopt, revert and promote a skill change.
 *
 *   node .kit/tools/skill.mjs screen   --candidate=AI_DEVELOPMENT/SKILLS/candidates/<id>
 *   node .kit/tools/skill.mjs eval     --candidate=<dir> --evaluated-by=<agent>
 *   node .kit/tools/skill.mjs adopt    --candidate=<dir> --round=<id> --product-units=<n>
 *   node .kit/tools/skill.mjs revert   --name=<skill>
 *   node .kit/tools/skill.mjs check
 *   node .kit/tools/skill.mjs promote  --candidate=<dir> --kit=<path-to-kit>
 *   node .kit/tools/skill.mjs selftest
 *
 * The stages are separate commands rather than one pipeline on purpose. `eval` must be able to
 * run from a context that did not write the candidate — the author does not judge the work —
 * and a single command that proposed, evaluated and adopted in one process would make that
 * impossible to tell from the outside.
 *
 * Exit codes: 0 pass, 1 refused with reasons, 2 misuse.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { screenLearning, evaluateAdoptionGate, adoptionGateScenarios } from '../lib/skill/policy.mjs';
import { evaluateCandidate, validateCaseSet } from '../lib/skill/evaluate.mjs';
import { adopt, revert, checkLedger, readLedger } from '../lib/skill/ledger.mjs';
import { checkPromotion } from '../lib/skill/leak.mjs';
import { reportGateSelfTests } from '../lib/state/selftest.mjs';

const argv = Object.fromEntries(process.argv.slice(3).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.join('=') || true];
}));
const command = process.argv[2];
const repo = resolve(String(argv.repo || '.'));
const at = (p) => (isAbsolute(p) ? p : join(repo, p));

const SKILLS_DIR = at(String(argv['skills-dir'] || 'AI_DEVELOPMENT/SKILLS'));
const LEDGER = join(SKILLS_DIR, 'LEDGER.json');
const HISTORY = join(SKILLS_DIR, 'history');

const die = (msg, code = 2) => { console.error(`FAIL ${msg}`); process.exit(code); };
const refuse = (title, reasons) => {
  console.error(`REFUSED ${title}`);
  for (const r of reasons) console.error(`  - ${r}`);
  process.exit(1);
};

function loadCandidate() {
  if (!argv.candidate) die('--candidate=<dir> is required');
  const dir = at(String(argv.candidate));
  const manifest = join(dir, 'CANDIDATE.json');
  if (!existsSync(manifest)) die(`no CANDIDATE.json in ${dir}`);
  const candidate = JSON.parse(readFileSync(manifest, 'utf8'));
  return { dir, candidate, bodyPath: join(dir, candidate.body || 'SKILL.md') };
}

/** Adopted skill texts, so the duplication screen has something real to compare against. */
function adoptedTexts() {
  const texts = {};
  for (const root of [at('.claude/skills'), join(SKILLS_DIR, 'OVERLAYS')]) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSafe(root)) {
      const file = join(root, entry, 'SKILL.md');
      if (existsSync(file)) texts[entry] = readFileSync(file, 'utf8');
      else if (entry.endsWith('.md')) texts[entry.replace(/\.md$/, '')] = readFileSync(join(root, entry), 'utf8');
    }
  }
  return texts;
}
function readdirSafe(p) {
  try { return readdirSync(p); } catch { return []; }
}

/**
 * The change set the adoption gate judges.
 *
 * It must include **the files this adoption is about to write**, not only the ones already
 * dirty. Reading the worktree alone was a real defect: `adopt` run on a clean checkout saw no
 * skill paths, the gate short-circuited on its "nothing to judge" branch, and G1 through G6
 * never ran — so an adoption with zero completed product units was accepted. It only ever
 * appeared to work because the candidate directory happened to be untracked at the time.
 *
 * That is the exact failure this repository keeps paying for: a gate that is silently inert
 * looks identical to a gate that passed. The self-tests did not catch it because they hand the
 * gate its input directly — they prove the function fires, not that the caller feeds it the
 * right thing. So the worktree is still read, for G6's benefit, but it is a union, never the
 * whole answer.
 */
function changedFiles({ willWrite = [] } = {}) {
  const set = new Set(willWrite.filter(Boolean));
  if (argv.changed) {
    for (const f of String(argv.changed).split(',').filter(Boolean)) set.add(f);
    return [...set];
  }
  try {
    const out = execFileSync('git', ['-C', repo, 'status', '--porcelain'], { encoding: 'utf8' });
    for (const line of out.split('\n').filter(Boolean)) {
      const f = line.slice(3).trim();
      if (f) set.add(f);
    }
  } catch {
    if (!set.size) die('could not read changed files; pass --changed=a,b');
  }
  return [...set];
}

switch (command) {
  case 'screen': {
    const { candidate } = loadCandidate();
    const verdict = screenLearning(candidate.record, { skillTexts: adoptedTexts() });
    console.log(`layer ${verdict.layer}  mode ${verdict.mode}${verdict.target ? `  target ${verdict.target}` : ''}`);
    for (const n of verdict.notes) console.log(`  note: ${n}`);
    if (verdict.layer === 'E') {
      console.log('  record it in the failure/evidence record and change no skill:');
      for (const f of verdict.failures) console.log(`  - ${f}`);
      process.exit(1);
    }
    console.log('  eligible for a candidate version');
    break;
  }

  case 'eval': {
    const { dir, candidate } = loadCandidate();
    const checkPath = join(dir, 'check.mjs');
    if (!existsSync(checkPath)) refuse('evaluation', ['no check.mjs: a rule with no executable check cannot be evaluated without a human']);
    const mod = await import(pathToFileURL(checkPath).href);
    const caseFailures = validateCaseSet(mod.cases, { requireCollision: argv['no-collision'] !== true });
    if (caseFailures.length) refuse('case set', caseFailures);

    const evaluation = await evaluateCandidate(
      { candidate: mod.candidate, adopted: mod.adopted, cases: mod.cases },
      {
        candidate_id: candidate.id,
        round: String(argv.round || candidate.round),
        evaluated_by: String(argv['evaluated-by'] || 'unspecified'),
        independence_level: argv.independence ? String(argv.independence).toUpperCase() : null,
      },
    );
    if (evaluation.evaluated_by === candidate.authored_by) {
      refuse('evaluation', [`--evaluated-by must differ from the candidate's author (${candidate.authored_by})`]);
    }
    writeFileSync(join(dir, 'RESULT.json'), `${JSON.stringify(evaluation, null, 2)}\n`);
    for (const r of evaluation.results) {
      console.log(`  ${r.candidate_ok ? 'ok  ' : 'BAD '}${r.id} [${r.kind}] expect ${r.expect}: adopted ${r.adopted ? 'fired' : 'quiet'}, candidate ${r.candidate ? 'fired' : 'quiet'}`);
    }
    if (!evaluation.independence_level) {
      console.log('  note: --independence=A|B|C was not declared; the adoption gate will refuse this');
    }
    console.log(`verdict ${evaluation.verdict} (evidence level: ${evaluation.evidence_level}, independence: ${evaluation.independence_level || 'undeclared'})`);
    for (const r of evaluation.reasons) console.log(`  - ${r}`);
    process.exit(evaluation.verdict === 'adopt' ? 0 : 1);
  }

  case 'adopt': {
    const { dir, candidate, bodyPath } = loadCandidate();
    const resultPath = join(dir, 'RESULT.json');
    if (!existsSync(resultPath)) refuse('adoption', ['no RESULT.json: nothing evaluated this candidate']);
    const evaluation = JSON.parse(readFileSync(resultPath, 'utf8'));
    const livePath = at(candidate.live_path);
    const ledger = readLedger(LEDGER);

    const failures = evaluateAdoptionGate({
      changedFiles: changedFiles({ willWrite: [candidate.live_path, relative(repo, LEDGER)] }),
      roundRecord: { round: String(argv.round || ''), product_units_completed: Number(argv['product-units'] ?? -1) },
      evaluation,
      candidate: { ...candidate, prior_sha256: ledger.skills[candidate.name]?.sha256 ?? null },
    });
    if (failures.length) refuse('adoption', failures);

    const { revision } = adopt({
      ledgerPath: LEDGER,
      name: candidate.name,
      tier: candidate.tier,
      livePath,
      candidatePath: bodyPath,
      historyDir: HISTORY,
      root: repo,
      provenance: {
        candidate_id: candidate.id,
        round: String(argv.round),
        authored_by: candidate.authored_by,
        evaluated_by: evaluation.evaluated_by,
        evidence: candidate.record?.occurrences || [],
        improvements: evaluation.improvements,
        evidence_level: evaluation.evidence_level,
        independence_level: evaluation.independence_level,
      },
    });
    console.log(`adopted ${candidate.name} r${revision} (tier ${candidate.tier}) -> ${candidate.live_path}`);
    console.log(`revert with: node .kit/tools/skill.mjs revert --name=${candidate.name}`);
    break;
  }

  case 'revert': {
    if (!argv.name) die('--name=<skill> is required');
    const out = revert({ ledgerPath: LEDGER, name: String(argv.name), root: repo });
    if (!out.restored) refuse('revert', [out.reason]);
    console.log(`reverted ${argv.name} to ${out.sha256.slice(0, 12)}`);
    break;
  }

  case 'check': {
    const drift = checkLedger(LEDGER, { root: repo });
    if (drift.length) refuse('ledger check', drift);
    const n = Object.keys(readLedger(LEDGER).skills).length;
    console.log(`ok ${n} adopted skill(s) match the ledger`);
    break;
  }

  case 'promote': {
    const { candidate, bodyPath } = loadCandidate();
    const failures = checkPromotion({
      text: readFileSync(bodyPath, 'utf8'),
      evidence: candidate.record?.occurrences || [],
      evaluation: existsSync(join(dirname(bodyPath), 'RESULT.json'))
        ? JSON.parse(readFileSync(join(dirname(bodyPath), 'RESULT.json'), 'utf8')) : null,
      evaluatedIn: candidate.evaluated_in || [],
    }, { allow: candidate.promotion_allow || [] });
    if (failures.length) refuse('promotion to the shared kit', failures);
    console.log(`${candidate.name} may be promoted; copy it into the kit and re-bootstrap every target`);
    break;
  }

  case 'selftest': {
    const scenarios = adoptionGateScenarios();
    const cases = Object.entries(scenarios).map(([name, s]) => ({
      name: `${name} — ${s.why}`,
      shouldFire: s.shouldFire !== false,
      evaluate: () => evaluateAdoptionGate(s.input),
    }));
    // The screen has to be seen refusing too, or "no candidate passed" is indistinguishable
    // from "the screen is inert".
    cases.push({
      name: 'screen — subjective evidence is refused',
      evaluate: () => screenLearning({
        statement: 'the lighting reads better', occurrences: [{ repo: 'a', ref: '1' }, { repo: 'b', ref: '2' }],
        trigger: { should_fire: ['x'], should_not_fire: ['y'] }, verification: { can_fail: true },
        evidence_kind: 'subjective', has_predicate: true,
      }).failures,
    });
    cases.push({
      name: 'screen — a compliant learning is not refused',
      shouldFire: false,
      evaluate: () => screenLearning({
        statement: 'a fixed image region must name the pose and subject it samples',
        occurrences: [{ repo: 'a', ref: '1' }, { repo: 'b', ref: '2' }],
        trigger: { should_fire: ['x'], should_not_fire: ['y'] }, verification: { can_fail: true },
        evidence_kind: 'measured', has_predicate: true,
      }).failures,
    });
    const ok = await reportGateSelfTests(cases, { label: 'skill-evolution gates' });
    process.exit(ok ? 0 : 1);
  }

  default:
    die(`unknown command '${command || ''}'; expected screen|eval|adopt|revert|check|promote|selftest`);
}
