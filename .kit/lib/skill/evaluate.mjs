/**
 * evaluate.mjs — run the adopted version and the candidate over the same cases and compare.
 *
 * The comparison is the entire point, and it is why a candidate never edits the adopted skill
 * in place: with the old version gone there is nothing to be no worse than. `game2` round 5
 * shipped a fix that round 6 measured as a no-op and reverted, and round 14 rejected two
 * plausible producer hypotheses only because the earlier numbers still existed to compare
 * against. Skill changes get the same treatment as pixels.
 *
 * A case is a recorded situation with an expected verdict:
 *
 *   { id, expect: 'fire' | 'quiet', kind: 'originating_failure' | 'regression' | 'collision',
 *     input: <whatever the predicate reads> }
 *
 * `collision` cases are another skill's should-fire prompts. The realistic damage a new skill
 * does is not failing at its own job — it is answering when a different skill was supposed to,
 * so a workflow that already worked quietly stops working. Nothing else in this repository
 * measures that, so it is a first-class case kind here.
 */

/**
 * @param {object} input
 * @param {(caseInput: unknown) => boolean|Promise<boolean>} input.candidate  fires?
 * @param {(caseInput: unknown) => boolean|Promise<boolean>} [input.adopted]
 *        The version in force. Omit for a brand-new rule: the honest baseline for "there was
 *        no rule" is a predicate that never fires, which is what `() => false` says.
 * @param {Array} input.cases
 * @param {object} [meta] Recorded verbatim into the result (candidate_id, evaluated_by, round).
 * @returns {Promise<object>} the evaluation record `evaluateAdoptionGate` consumes
 */
export async function evaluateCandidate({ candidate, adopted = () => false, cases }, meta = {}) {
  if (typeof candidate !== 'function') throw new TypeError('candidate predicate is required');
  if (!Array.isArray(cases) || !cases.length) throw new TypeError('at least one case is required');

  const results = [];
  for (const c of cases) {
    const want = c.expect === 'fire';
    const [a, b] = await Promise.all([safe(adopted, c.input), safe(candidate, c.input)]);
    results.push({
      id: c.id,
      kind: c.kind || 'regression',
      expect: c.expect,
      adopted: a.value,
      candidate: b.value,
      adopted_ok: a.value === want,
      candidate_ok: b.value === want,
      error: a.error || b.error || null,
    });
  }

  // A regression is narrower than "the candidate is wrong here": it is the candidate being
  // wrong where the adopted version was right. Cases both versions fail were already broken
  // and are reported separately, so a candidate is not blamed for a pre-existing hole.
  const regressions = results.filter((r) => r.adopted_ok && !r.candidate_ok);
  const improvements = results.filter((r) => !r.adopted_ok && r.candidate_ok);
  const stillWrong = results.filter((r) => !r.adopted_ok && !r.candidate_ok);
  const collisions = results.filter((r) => r.kind === 'collision' && !r.candidate_ok);

  const reasons = [];
  if (regressions.length) reasons.push(`${regressions.length} regression(s): ${regressions.map((r) => r.id).join(', ')}`);
  if (collisions.length) reasons.push(`${collisions.length} trigger collision(s): ${collisions.map((r) => r.id).join(', ')}`);
  if (!improvements.length) reasons.push('no case improved, so nothing was measurably gained');
  if (results.some((r) => r.error)) reasons.push('a predicate threw; an evaluation that errored is not an evaluation');

  const verdict = reasons.length ? 'reject' : 'adopt';
  if (verdict === 'adopt') {
    reasons.push(
      `${improvements.length}/${results.length} case(s) improved, 0 regressions, `
      + `${stillWrong.length} case(s) still unhandled by both versions`,
    );
  }

  return {
    ...meta,
    verdict,
    reasons,
    results,
    regressions: regressions.map((r) => ({ id: r.id, kind: r.kind })),
    improvements: improvements.map((r) => ({ id: r.id, kind: r.kind })),
    still_wrong: stillWrong.map((r) => ({ id: r.id, kind: r.kind })),
    // Named plainly so nothing downstream can read this as more than it is. Cases are recorded
    // situations; passing them is evidence the rule discriminates, not evidence a future round
    // goes better. That claim needs rounds, and `live` is where it would be recorded.
    evidence_level: 'replay',
  };
}

async function safe(fn, input) {
  try {
    return { value: Boolean(await fn(input)), error: null };
  } catch (error) {
    return { value: false, error: error.message };
  }
}

/**
 * Refuse a case set that cannot decide anything.
 *
 * A candidate that supplies only the failure it came from will pass its own evaluation every
 * time — the same shape as `game2` F-006, where a scan returned 31 null rows and still
 * satisfied its limits because nothing required it to have detected anything.
 *
 * @returns {string[]} failures, empty when the case set can decide
 */
export function validateCaseSet(cases, { requireCollision = true } = {}) {
  const failures = [];
  if (!Array.isArray(cases) || !cases.length) return ['no cases'];

  const ids = cases.map((c) => c.id);
  if (new Set(ids).size !== ids.length) failures.push('duplicate case ids');
  for (const c of cases) {
    if (!c.id) failures.push('a case has no id');
    if (c.expect !== 'fire' && c.expect !== 'quiet') failures.push(`case ${c.id}: expect must be fire|quiet`);
    if (!('input' in c)) failures.push(`case ${c.id}: no input`);
  }
  if (!cases.some((c) => c.expect === 'fire')) failures.push('no case expects the rule to fire');
  if (!cases.some((c) => c.expect === 'quiet')) failures.push('no case expects the rule to stay quiet');
  if (!cases.some((c) => c.kind === 'originating_failure')) {
    failures.push('no originating_failure case: the situation the rule was learned from is not represented');
  }
  if (requireCollision && !cases.some((c) => c.kind === 'collision')) {
    failures.push('no collision case: nothing checks that this does not answer for another skill');
  }
  return failures;
}
