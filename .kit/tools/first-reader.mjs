#!/usr/bin/env node
/**
 * first-reader.mjs — hand a work to people who have never seen it, stop them while they are
 * still reading, and keep only what several of them independently agreed on.
 *
 *   node .kit/tools/first-reader.mjs check    --reading=reading.json
 *   node .kit/tools/first-reader.mjs plan     --reading=reading.json --out=first-read/
 *   node .kit/tools/first-reader.mjs fold     --reading=reading.json --reports=first-read/reports \
 *                                             --blind=@first-read/blind.txt --out=first-read/review.json
 *   node .kit/tools/first-reader.mjs prose    --reading=reading.json --voice-floor=0.05
 *   node .kit/tools/first-reader.mjs branches --variants=<dir> --at=<choice-id> --min-distinct-words=40
 *   node .kit/tools/first-reader.mjs selftest
 *
 * `plan` is the step the protocol depends on: it splits the reading into steps a reader is
 * given **one at a time**, and appends that step's questions to the end of each one. A reader
 * handed the whole text at once can answer "what happens next" from page ninety, and that
 * answer is hindsight wearing a prediction's clothes.
 *
 * Exit codes: 0 clean, 1 the gate fired (findings, leaks, a failed self-test), 2 refused.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderPassage, sampleReading, validateReading, leakCheck, renderReading } from '../lib/read/reading.mjs';
import {
  buildProtocol, validateTranscript, protocolSelfTestCases, unmeasured as protocolUnmeasured,
} from '../lib/read/protocol.mjs';
import { foldReports, agreementSelfTestCases } from '../lib/read/agreement.mjs';
import { proseReport, proseSelfTestCases } from '../lib/read/prose.mjs';
import { compareBranches, branchFindings, branchSelfTestCases } from '../lib/read/branches.mjs';
import { readingSelfTestCases } from '../lib/read/reading.mjs';
import { reportGateSelfTests } from '../lib/state/selftest.mjs';
import { validateFindings } from '../lib/plan/findings.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const argv = Object.fromEntries(process.argv.slice(3).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.join('=') || true];
}));
const command = process.argv[2];

const die = (message, code = 2) => { console.error(`FAIL ${message}`); process.exit(code); };
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const outLine = (s) => process.stdout.write(`${s}\n`);

/** `--blind=some text` or `--blind=@path/to/file`. */
function readBlind(value) {
  if (typeof value !== 'string') return null;
  return value.startsWith('@') ? readFileSync(value.slice(1), 'utf8').trim() : value;
}

function loadReading() {
  if (!argv.reading) die('--reading=<reading.json> is required');
  const path = resolve(String(argv.reading));
  if (!existsSync(path)) die(`${path} does not exist`);
  return readJson(path);
}

/**
 * Split a reading into the steps a reader is handed one at a time. A step ends at a choice
 * passage (so the labels are visible when the hesitation question is asked, and the outcome
 * is not) or at the end of a section.
 */
export function planSteps(reading, protocol) {
  const steps = [];
  let index = 0;
  for (const section of reading.sections || []) {
    let buffer = [];
    const flush = (endsAt) => {
      if (!buffer.length) return;
      const ids = new Set(buffer.map((p) => p.id));
      steps.push({
        step: steps.length + 1,
        section: section.id,
        sectionTitle: section.title,
        first: buffer[0].id,
        last: buffer[buffer.length - 1].id,
        afterPassages: index,
        text: `${steps.length === 0 || steps[steps.length - 1]?.section !== section.id ? `${section.title}\n\n` : ''}${buffer.map(renderPassage).join('\n\n')}`,
        checkpoints: protocol.checkpoints
          .filter((c) => (c.kind === 'hesitation' ? ids.has(c.anchor) : endsAt === 'section' && c.section === section.id))
          .map((c) => ({ id: c.id, kind: c.kind, prompt: c.prompt, afterPassages: c.afterPassages })),
      });
      buffer = [];
    };
    for (const passage of section.passages || []) {
      index += 1;
      buffer.push(passage);
      if (passage.kind === 'choice') flush('choice');
    }
    flush('section');
  }
  steps.push({
    step: steps.length + 1, section: null, sectionTitle: null, first: null, last: null,
    afterPassages: index,
    text: '[The text is withdrawn. Do not reopen any earlier step file from here on.]',
    checkpoints: protocol.checkpoints.filter((c) => c.kind.startsWith('recall'))
      .map((c) => ({ id: c.id, kind: c.kind, prompt: c.prompt, afterPassages: c.afterPassages })),
  });
  return steps;
}

/** The blank transcript a reader fills in — one entry per checkpoint, so none can be skipped. */
export function answerTemplate(protocol, reader) {
  return {
    reader,
    priorKnowledge: null,
    checkpoints: protocol.checkpoints.map((c) => ({
      id: c.id, kind: c.kind, answered: null,
      ...(c.kind === 'hesitation' ? { hesitated: null, chose: null } : {}),
      ...(c.kind.startsWith('recall') ? { sawTextAgain: false, items: [] } : {}),
      ...(c.kind === 'recall_cued' ? { bySection: {} } : {}),
      ...(c.kind.startsWith('recall') ? {} : { afterPassages: c.afterPassages }),
      text: '',
    })),
    confusions: [],
  };
}

/* ------------------------------------------------------------------------- check */

function cmdCheck() {
  const reading = loadReading();
  const result = validateReading(reading, {
    minSections: Number(argv['min-sections'] ?? 2),
    minChoices: Number(argv['min-choices'] ?? 1),
    minEndings: Number(argv['min-endings'] ?? 1),
    ignoreLeaks: argv['ignore-leaks'] ? String(argv['ignore-leaks']).split(',') : [],
  });
  outLine(`reading  ${reading.work} (${reading.language})`);
  outLine(`counts   ${JSON.stringify(result.counts)}`);
  for (const w of result.warnings.slice(0, 20)) outLine(`warn     ${w}`);
  if (result.warnings.length > 20) outLine(`warn     … ${result.warnings.length - 20} more`);
  for (const f of result.failures) outLine(`FAIL     ${f}`);
  outLine(result.ok ? 'ok       nothing but the rendered text reached the reader' : `FAILED   ${result.failures.length} problems`);
  process.exit(result.ok ? 0 : 1);
}

/* -------------------------------------------------------------------------- plan */

function cmdPlan() {
  const reading = loadReading();
  const validation = validateReading(reading, {
    ignoreLeaks: argv['ignore-leaks'] ? String(argv['ignore-leaks']).split(',') : [],
  });
  if (!validation.ok) {
    for (const f of validation.failures) console.error(`FAIL ${f}`);
    die(`the reading is not fit to hand to a reader (${validation.failures.length} problems)`);
  }
  if (!argv.out) die('--out=<dir> is required');
  const out = resolve(String(argv.out));
  const readers = Number(argv.readers ?? 3);
  if (readers < 2) die('at least two independent readers, or there is nothing to agree with');

  const protocol = buildProtocol(reading);
  const steps = planSteps(reading, protocol);

  mkdirSync(join(out, 'steps'), { recursive: true });
  mkdirSync(join(out, 'reports'), { recursive: true });

  writeFileSync(join(out, 'brief.txt'), `${protocol.readerBrief}\n\nYou will be given ${steps.length} step files, named in order. Open exactly one at a time,\nin order, and never reopen an earlier one. The questions for a step are at the end of that\nstep's file. Answer them before you open the next file.\n`);
  writeFileSync(join(out, 'protocol.json'), `${JSON.stringify(protocol, null, 2)}\n`);
  writeFileSync(join(out, 'steps.json'), `${JSON.stringify(steps.map(({ text, ...rest }) => rest), null, 2)}\n`);

  for (const step of steps) {
    const questions = step.checkpoints.length
      ? `\n\n${'-'.repeat(70)}\nSTOP. Answer these before opening the next step file.\n\n${step.checkpoints.map((c) => `[${c.id}] ${c.prompt}`).join('\n\n')}\n`
      : '';
    writeFileSync(join(out, 'steps', `step-${String(step.step).padStart(2, '0')}.txt`), `${step.text}${questions}`);
  }
  for (let i = 1; i <= readers; i += 1) {
    writeFileSync(join(out, 'reports', `reader-${i}.template.json`), `${JSON.stringify(answerTemplate(protocol, `reader-${i}`), null, 2)}\n`);
  }
  writeFileSync(join(out, 'UNMEASURED.txt'), `${protocolUnmeasured().join('\n')}\n`);

  outLine(`plan     ${steps.length} steps, ${protocol.checkpoints.length} checkpoints, ${readers} independent readers`);
  outLine(`         ${validation.counts.words} words, ${validation.counts.choices} choices, ${validation.counts.sections} sections`);
  outLine(`wrote    ${out}`);
  process.exit(0);
}

/* -------------------------------------------------------------------------- fold */

function cmdFold() {
  const reading = loadReading();
  const protocol = argv.protocol ? readJson(resolve(String(argv.protocol))) : buildProtocol(reading);
  if (!argv.reports) die('--reports=<dir> is required');
  const dir = resolve(String(argv.reports));
  if (!existsSync(dir)) die(`${dir} does not exist`);

  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.includes('.template.')).sort();
  const reports = files.map((f) => readJson(join(dir, f)));

  const bad = [];
  reports.forEach((report, i) => {
    const v = validateTranscript(protocol, report);
    if (!v.ok) bad.push(`${files[i]}: ${v.failures.join('; ')}`);
  });
  if (bad.length) {
    for (const b of bad) console.error(`FAIL ${b}`);
    die(`${bad.length} of ${reports.length} transcripts break the protocol. A reader who was never asked and a reader who had no answer are not the same measurement, so the fold is refused rather than run on the rest.`);
  }

  const result = foldReports({
    reading,
    protocol,
    reports,
    quorum: argv.quorum ? Number(argv.quorum) : undefined,
    blindComparison: readBlind(argv.blind),
    baseline: argv.baseline ? readJson(resolve(String(argv.baseline))) : null,
    round: argv.round ? Number(argv.round) : null,
    acknowledgedPriorKnowledge: argv.acknowledge
      ? readBlind(argv.acknowledge).split('\n').map((l) => l.trim()).filter(Boolean)
      : [],
  });

  if (!result.ok) {
    for (const r of result.refusals) console.error(`FAIL ${r}`);
    process.exit(2);
  }

  const check = validateFindings(result.review, { strict: false });
  for (const f of check.failures) console.error(`FAIL findings: ${f}`);
  if (!check.ok) process.exit(2);

  const payload = {
    ...result.review,
    signals: result.signals,
    individualVariation: result.individualVariation,
    unmeasured: protocolUnmeasured(),
  };
  if (argv.out) {
    mkdirSync(dirname(resolve(String(argv.out))), { recursive: true });
    writeFileSync(resolve(String(argv.out)), `${JSON.stringify(payload, null, 2)}\n`);
    outLine(`wrote    ${resolve(String(argv.out))}`);
  }

  outLine(`readers  ${result.signals.readers}, quorum ${result.signals.quorum}`);
  for (const d of result.review.declaredPriorKnowledge || []) outLine(`declared ${d.reader}: ${d.disclosed}`);
  outLine(`findings ${result.review.findings.length} agreed (${result.review.findings.filter((f) => f.severity === 'blocker').length} blocker, ${result.review.findings.filter((f) => f.severity === 'major').length} major, ${result.review.findings.filter((f) => f.severity === 'minor').length} minor)`);
  outLine(`variation ${result.individualVariation.length} reported by too few readers to file`);
  for (const f of result.review.findings) outLine(`  ${f.severity.padEnd(7)} ${f.category} @ ${f.shot}`);
  outLine('note     the verdict above is about this run, never about the work.');
  process.exit(result.review.findings.length ? 1 : 0);
}

/* ------------------------------------------------------------------------- prose */

function cmdProse() {
  const reading = loadReading();
  const report = proseReport(reading, {
    voiceFloor: argv['voice-floor'] === undefined ? null : Number(argv['voice-floor']),
    shingle: Number(argv.shingle ?? 6),
  });
  if (argv.out) {
    mkdirSync(dirname(resolve(String(argv.out))), { recursive: true });
    writeFileSync(resolve(String(argv.out)), `${JSON.stringify(report, null, 2)}\n`);
    outLine(`wrote    ${resolve(String(argv.out))}`);
  }
  const s = report.sentenceLengths;
  outLine(`sentences  n=${s.n} mean=${s.mean} sd=${s.sd} cv=${s.cv} range=${s.min}-${s.max}`);
  outLine(`voice      ${Object.keys(report.voice.speakers).length} speakers measured, ${report.voice.unmeasurable.length} with too few lines`);
  if (report.voice.closest) outLine(`           closest pair: ${report.voice.closest.a} / ${report.voice.closest.b} at ${report.voice.closest.divergence}`);
  if (report.voice.declaredFloor !== null) outLine(`           declared floor ${report.voice.declaredFloor}: ${report.voice.belowFloor.length} pairs under it`);
  outLine(`translationese ${report.translationese.total} hits, ${report.translationese.per1000Words} per 1000 words`);
  outLine(`repetition ${report.repetition.distinctRepeated} repeated ${report.repetition.shingleSize}-grams, rate ${report.repetition.repeatRate}`);
  outLine(`explained  ${report.overExplanation.total} narration hits (${report.overExplanation.afterDialogue} directly after dialogue), ${report.overExplanation.per1000NarrationWords} per 1000 narration words`);
  outLine('note       these are distributions. No floor is applied unless you declared one, and');
  outLine('           none of them says whether the writing is good. See UNMEASURED in the output.');
  process.exit(0);
}

/* ---------------------------------------------------------------------- branches */

function cmdBranches() {
  if (!argv.variants) die('--variants=<dir> of readings, one per option, is required');
  if (!argv.at) die('--at=<choice passage id> is required');
  const dir = resolve(String(argv.variants));
  if (!existsSync(dir)) die(`${dir} does not exist`);

  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  if (files.length < 2) die('at least two variants, or there is nothing to compare');
  const variants = files.map((f) => ({ option: f.replace(/\.json$/, ''), reading: readJson(join(dir, f)) }));

  // Every variant must be a reading of the same work, differing only in the forced branch.
  // Comparing two different works would report the whole story as distinct and pass silently.
  const works = new Set(variants.map((v) => v.reading.work));
  if (works.size !== 1) die(`the variants are readings of ${works.size} different works (${[...works].join(', ')})`);

  const result = compareBranches({ at: String(argv.at), variants }, {
    minDistinctWords: Number(argv['min-distinct-words'] ?? 1),
  });

  outLine(`choice   ${result.at}: ${result.options.length} options — ${result.options.join(', ')}`);
  outLine(`floor    ${result.declaredFloor} distinct words, declared by this run`);
  for (const p of result.pairs) {
    outLine(`  ${p.a} / ${p.b}`.padEnd(28) + `${String(p.distinctWords).padStart(5)} distinct words, similarity ${p.similarity}`);
  }
  outLine(result.collapsed.length
    ? `COLLAPSED ${result.collapsed.length} pair(s): the choice offers ${result.options.length} options and delivers ${result.options.length - result.collapsed.length}`
    : `ok       no two options produce the same text, at the declared floor`);
  for (const c of result.consequence) {
    outLine(`  ${c.option.padEnd(12)} ${String(c.consequenceWords).padStart(5)} words of ending/epilogue, ${String(c.ownWords).padStart(5)} of them its own`
      + (c.dominatedBy.length ? `  DOMINATED by ${c.dominatedBy.map((d) => `${d.option} (+${d.extraWords}w)`).join(', ')}` : ''));
  }
  if (result.noOptionHasConsequence) outLine('note     no option reaches an ending or epilogue from here, so consequence is not measurable at this choice');
  else if (result.withoutConsequence.length) outLine(`DOMINATED ${result.withoutConsequence.map((c) => c.option).join(', ')} — another option delivers everything these deliver and more`);
  outLine('note     this says nothing about whether the choice felt hard. That is the reading protocol.');

  if (argv.out) {
    const payload = { ...result, findings: branchFindings(result, { owner: String(argv.owner || 'unknown') }) };
    mkdirSync(dirname(resolve(String(argv.out))), { recursive: true });
    writeFileSync(resolve(String(argv.out)), `${JSON.stringify(payload, null, 2)}\n`);
    outLine(`wrote    ${resolve(String(argv.out))}`);
  }
  process.exit(result.collapsed.length || result.withoutConsequence.length ? 1 : 0);
}

/* ---------------------------------------------------------------------- selftest */

async function cmdSelfTest() {
  const reading = sampleReading();
  const groups = [
    ['reading', readingSelfTestCases()],
    ['protocol', protocolSelfTestCases(reading)],
    ['agreement', agreementSelfTestCases(reading)],
    ['prose', proseSelfTestCases()],
    ['branches', branchSelfTestCases()],
  ];
  let ok = true;
  for (const [label, cases] of groups) {
    const passed = await reportGateSelfTests(cases, { label: `first-reader / ${label}` });
    ok = ok && passed;
  }
  // A control on the control: the leak gate must be quiet on the very text it will be run on.
  const clean = leakCheck(renderReading(reading));
  if (!clean.ok) { console.error('BAD  the fixture reading itself trips the leak gate'); ok = false; }
  process.exit(ok ? 0 : 1);
}

/* -------------------------------------------------------------------------- main */

switch (command) {
  case 'check': cmdCheck(); break;
  case 'plan': cmdPlan(); break;
  case 'fold': cmdFold(); break;
  case 'prose': cmdProse(); break;
  case 'branches': cmdBranches(); break;
  case 'selftest': await cmdSelfTest(); break;
  default:
    console.error(`usage: node ${argv._ || 'first-reader.mjs'} <check|plan|fold|prose|branches|selftest> [--reading=…]`);
    console.error(readFileSync(join(HERE, 'first-reader.mjs'), 'utf8').split('\n').slice(2, 18).map((l) => l.replace(/^ \* ?/, '')).join('\n'));
    process.exit(2);
}
