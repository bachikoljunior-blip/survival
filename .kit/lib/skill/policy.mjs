/**
 * policy.mjs — what may become a skill change, and what may be adopted.
 *
 * Three repositories carry the same prose module telling an agent to store reusable recipes
 * (`Gptgame/AI_DEVELOPMENT/MODULES/M8_VERIFIED_REUSABLE_RECIPE_MEMORY.md`, `Q`'s copy of the
 * same file, `survival/AI_DEVELOPMENT/MODULES/M8-reusable-recipes.md`). All three say "store
 * a recipe only after supporting verification exists" and "do not turn one-off solutions into
 * permanent abstractions without evidence of reuse value". Neither sentence is enforceable as
 * written, and the outcome is on record: after three copies of the instruction, `game2` has
 * one project-local workflow stored and `survival` has the line "No skill is registered yet".
 *
 * The instruction was not wrong. It had no predicate. This file is that predicate.
 *
 * The default answer is **no**. A round that learns nothing storable is the normal round, and
 * `screenLearning` is written so that saying nothing costs nothing while saying something
 * costs evidence.
 */

/** Cost units that count as a quantified consequence. Anything else is an opinion. */
const COST_UNITS = new Set(['tokens', 'rounds', 'minutes', 'gate_escapes', 'reverted_commits']);

/**
 * Identifiers that tie a sentence to the occasion it was learned on. A rule you cannot state
 * without naming the round it came from is a record, not a skill — `game2/AI_DEVELOPMENT/
 * FAILURES.md` F-013 ("hero p99.9 fell from 237 to exactly 235") is a perfectly good record
 * and would be a terrible skill.
 */
const OCCASION_MARKERS = [
  /\br\d+v\d+\b/i,                        // r13v2
  /\bRound\s+\d+\b/i,                     // Round 14
  /\b[0-9a-f]{7,40}\b/,                   // a commit sha
  /(?:^|\s)(?:\.{0,2}\/)?(?:src|tools|shots|docs)\/[\w./-]+/, // a concrete path
  /\(\s*\d{2,},\s*\d{2,}\s+\d+x\d+\s*\)/, // a fixed pixel box: (950,880 200x100)
];

/**
 * @typedef {object} LearningRecord
 * @property {string}  id
 * @property {string}  statement          The reusable rule, in its own words.
 * @property {Array<{repo: string, ref: string}>} occurrences
 * @property {{unit: string, value: number}} [cost]
 * @property {{should_fire: string[], should_not_fire: string[]}} trigger
 * @property {{kind: string, can_fail: boolean}} verification
 * @property {'measured'|'subjective'|'asserted'} evidence_kind
 * @property {string}  [covered_by]       Existing skill whose text may already say this.
 * @property {boolean} [has_predicate]    Ships an executable check over recorded cases.
 */

/**
 * Decide the layer a learning belongs on.
 *
 * @param {LearningRecord} record
 * @param {object} [options]
 * @param {Record<string,string>} [options.skillTexts] name -> adopted SKILL.md text
 * @returns {{layer: 'E'|'L', mode: 'record_only'|'improve'|'new', target: string|null,
 *            failures: string[], notes: string[]}}
 */
export function screenLearning(record, { skillTexts = {} } = {}) {
  const failures = [];
  const notes = [];
  const occurrences = record.occurrences || [];

  // R1 — recurrence, or one occurrence whose cost was actually counted.
  const distinct = new Set(occurrences.map((o) => `${o.repo}::${o.ref}`)).size;
  const costed = record.cost && COST_UNITS.has(record.cost.unit) && Number(record.cost.value) > 0;
  if (distinct < 2 && !costed) {
    failures.push(
      `R1 recurrence: ${distinct} distinct occurrence(s) and no quantified cost `
      + `(need 2 occurrences, or 1 with a cost in ${[...COST_UNITS].join('/')})`,
    );
  }

  // R2 — a trigger you can be wrong about. The should-not-fire half is the load-bearing one:
  // the realistic damage from a new skill is not that it fails, it is that it takes another
  // skill's trigger and quietly breaks a workflow that already worked.
  const fire = record.trigger?.should_fire || [];
  const quiet = record.trigger?.should_not_fire || [];
  if (!fire.length) failures.push('R2 trigger: no should_fire case');
  if (!quiet.length) failures.push('R2 trigger: no should_not_fire case');

  // R3 — a verification that is able to fail. A silently inert check and a passing check look
  // identical; `lib/state/selftest.mjs` exists because that already happened twice.
  if (!record.verification || record.verification.can_fail !== true) {
    failures.push('R3 verification: no verification that is demonstrably able to fail');
  }

  // R4 — subjective evidence never adopts anything. It is not discarded and it does not block:
  // it is recorded, permanently marked unverified by a human, and refused as grounds.
  if (record.evidence_kind !== 'measured') {
    failures.push(
      `R4 evidence: evidence_kind is '${record.evidence_kind}', not 'measured'`
      + (record.evidence_kind === 'subjective'
        ? " — appearance, feel, fun and reference comparison stay human_verified:false and are never grounds"
        : ''),
    );
  }

  // R5 — the statement must survive leaving its occasion behind.
  const marker = OCCASION_MARKERS.find((re) => re.test(record.statement || ''));
  if (marker) {
    failures.push(`R5 generality: the rule still names the occasion it was learned on (${marker})`);
  }

  // R6 — improving an existing skill beats adding one, and re-stating what a skill already
  // says is worse than both.
  let mode = 'new';
  let target = null;
  if (record.covered_by) {
    target = record.covered_by;
    const text = skillTexts[record.covered_by];
    if (text === undefined) {
      failures.push(`R6 duplication: covered_by names '${record.covered_by}', which is not an adopted skill`);
    } else if (alreadySays(text, record.statement)) {
      failures.push(`R6 duplication: '${record.covered_by}' already says this`);
    } else {
      mode = 'improve';
      notes.push(`improves '${record.covered_by}' rather than adding a skill`);
    }
  }

  // R7 — a rule with no predicate cannot be evaluated without a human, so it cannot be
  // adopted without one. It is still recorded. This is the rule that keeps the whole system
  // honest: everything that gets adopted can be re-checked mechanically, forever.
  if (record.has_predicate !== true) {
    failures.push('R7 predicate: no executable check over the recorded cases, so no automatic evaluation is possible');
  }

  return failures.length
    ? { layer: 'E', mode: 'record_only', target, failures, notes }
    : { layer: 'L', mode, target, failures, notes };
}

/**
 * Content-word overlap, deliberately crude. It is a duplication *screen*, not a semantic
 * judgement, and it errs toward flagging: a false "already covered" costs a candidate, a
 * false "new" costs a skill two paragraphs saying the same thing twice.
 */
export function alreadySays(skillText, statement, { threshold = 0.72 } = {}) {
  const words = (s) => new Set(
    String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
  );
  const want = words(statement);
  if (!want.size) return false;
  const have = words(skillText);
  let hit = 0;
  for (const w of want) if (have.has(w)) hit += 1;
  return hit / want.size >= threshold;
}

const STOPWORDS = new Set([
  'that', 'this', 'with', 'from', 'have', 'been', 'must', 'when', 'what', 'they', 'them',
  'than', 'then', 'into', 'only', 'does', 'each', 'were', 'will', 'your', 'more', 'over',
  'after', 'before', 'because', 'which', 'their', 'there', 'would', 'could', 'should',
]);

/**
 * The gate on the adoption commit itself.
 *
 * Same shape as `lib/state/floorGate.mjs`: a list of failures, empty when it passes, with the
 * accepted values configurable because these repositories have already proved they disagree
 * about vocabulary.
 *
 * @param {object} input
 * @param {string[]} input.changedFiles
 * @param {{round: string, product_units_completed: number}} input.roundRecord
 * @param {{candidate_id: string, verdict: string, regressions: unknown[], improvements: unknown[],
 *          evaluated_by: string, round: string}} [input.evaluation]
 * @param {{id: string, name: string, authored_by: string, round: string, prior_sha256: string|null}} input.candidate
 * @param {object} [options]
 * @returns {string[]}
 */
export function evaluateAdoptionGate({ changedFiles = [], roundRecord, evaluation, candidate }, {
  skillPathPattern = /(?:^|\/)(?:\.claude\/skills\/|AI_DEVELOPMENT\/SKILLS\/)/,
  productPattern = /^(?:src\/|lib\/|tools\/|tests?\/|index\.html|package(?:-lock)?\.json)/,
  metaSkillName = 'adaptive-skill-evolution',
  independenceLevels = ['A', 'B', 'C'],
} = {}) {
  const failures = [];
  const skillChanges = changedFiles.filter((f) => skillPathPattern.test(f));
  if (!skillChanges.length) return failures;

  // G1 — skill work is subordinate to product work and may not stand in for it. A round that
  // completed no product unit does not get to report a skill improvement as its output.
  if (!roundRecord || Number(roundRecord.product_units_completed) < 1) {
    failures.push('G1: a skill change requires at least one completed product unit in the same round');
  }

  // G2 — an evaluation that actually ran, on this candidate, with the verdict it claims.
  if (!evaluation) {
    failures.push('G2: no evaluation record');
  } else {
    if (evaluation.candidate_id !== candidate?.id) {
      failures.push(`G2: evaluation is for '${evaluation.candidate_id}', not '${candidate?.id}'`);
    }
    if (evaluation.verdict !== 'adopt') {
      failures.push(`G2: evaluation verdict is '${evaluation.verdict}'`);
    }
    if ((evaluation.regressions || []).length) {
      failures.push(`G2: ${evaluation.regressions.length} regression(s) recorded`);
    }
    if (!(evaluation.improvements || []).length) {
      failures.push('G2: no measurable improvement recorded');
    }
    // G3 — the author does not judge the work. `.claude/skills/critic/SKILL.md` calls this
    // non-negotiable for product review; there is no reason it is weaker for skills.
    if (evaluation.evaluated_by && candidate?.authored_by
        && evaluation.evaluated_by === candidate.authored_by) {
      failures.push(`G3: evaluated by its own author (${evaluation.evaluated_by})`);
    }
    // G3b — and say how independent it actually was. Two different names are cheap to write
    // from one session, and this gate cannot tell. `PROJECT_OPERATING_PROTOCOL.md` §9 already
    // answers that for product review: record the level that was really used, because an
    // honest C is worth more than a claimed A. Refusing an undeclared level is the only part
    // of that a machine can enforce; the honesty of the letter is not checkable here, and
    // pretending otherwise would be the same mistake as trusting a name.
    if (!independenceLevels.includes(evaluation.independence_level)) {
      failures.push(
        `G3b: independence_level must be declared as one of ${independenceLevels.join('/')} `
        + `(found ${evaluation.independence_level || 'none'})`,
      );
    }
  }

  // G4 — the mechanism may not improve itself inside the round it is running.
  if (candidate?.name === metaSkillName && evaluation && candidate.round === evaluation.round) {
    failures.push(`G4: '${metaSkillName}' may not be evaluated in the round that proposed it`);
  }

  // G5 — reversible, or it does not go in.
  if (!candidate || candidate.prior_sha256 === undefined) {
    failures.push('G5: no prior content hash recorded, so the change cannot be reverted');
  }

  // G6 — one commit, one kind of change. `git add -A` has already swept three owners' work
  // into a commit whose message named one system.
  const productChanges = changedFiles.filter((f) => productPattern.test(f) && !skillPathPattern.test(f));
  if (productChanges.length) {
    failures.push(`G6: adoption commit also changes product files (${productChanges.join(', ')})`);
  }
  return failures;
}

/** Canned inputs that must be refused. Fed to `runGateSelfTests` so the gate is seen to fire. */
export function adoptionGateScenarios() {
  const ok = {
    changedFiles: ['.claude/skills/probe/SKILL.md'],
    roundRecord: { round: 'r1', product_units_completed: 1 },
    evaluation: {
      candidate_id: 'c1', verdict: 'adopt', regressions: [], improvements: [{ case: 'x' }],
      evaluated_by: 'agent-b', round: 'r1', independence_level: 'B',
    },
    candidate: { id: 'c1', name: 'probe', authored_by: 'agent-a', round: 'r1', prior_sha256: 'abc' },
  };
  const clone = (patch) => JSON.parse(JSON.stringify({ ...ok, ...patch }));
  return {
    G1: { why: 'no product unit completed in the round', input: clone({ roundRecord: { round: 'r1', product_units_completed: 0 } }) },
    G2_VERDICT: { why: 'the evaluation did not say adopt', input: clone({ evaluation: { ...ok.evaluation, verdict: 'reject' } }) },
    G2_REGRESSION: { why: 'a regression was recorded', input: clone({ evaluation: { ...ok.evaluation, regressions: [{ case: 'y' }] } }) },
    G2_NO_GAIN: { why: 'nothing measurably improved', input: clone({ evaluation: { ...ok.evaluation, improvements: [] } }) },
    G3: { why: 'the candidate judged itself', input: clone({ evaluation: { ...ok.evaluation, evaluated_by: 'agent-a' } }) },
    G3B: { why: 'the evaluation did not say how independent it was', input: clone({ evaluation: { ...ok.evaluation, independence_level: null } }) },
    G4: { why: 'the meta-skill was evaluated in the round that proposed it', input: clone({ candidate: { ...ok.candidate, name: 'adaptive-skill-evolution' } }) },
    G6: { why: 'the adoption commit also touched product files', input: clone({ changedFiles: ['.claude/skills/probe/SKILL.md', 'src/main.js'] }) },
    CONTROL: { why: 'a compliant adoption must not fire', shouldFire: false, input: ok },
  };
}
