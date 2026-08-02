/**
 * branches.mjs — does picking differently produce a different story?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT A READER'S JOB
 *
 * The first-reader protocol asks, at each choice, whether the decision was hard. That measures
 * the choice from inside: with the labels visible and the outcomes hidden, was there anything
 * to weigh. It is the right question and it cannot answer this one.
 *
 * A three-way choice whose second and third options lead to the same downstream text is a
 * two-way choice wearing three labels. Every reader hesitates over it honestly, every reader
 * reports it as live, and every reader is right about their own experience — because a reader
 * sees exactly one branch. The defect is a *relation between branches*, and no observation from
 * inside one of them contains it.
 *
 * This was measured rather than reasoned: a work with a known collapsed three-way choice was
 * read by five independent readers, and none of them could have found it. Forcing a second
 * reading down the branch that collapses does not help either — that reader also sees one
 * branch. Only comparing the branches finds it, so comparing the branches is a tool.
 *
 * The seam with the reading protocol, stated so the two are not confused in six months:
 * **if it asks what one reader experienced, it is the protocol; if it compares what two
 * different picks produce, it is this.** Neither substitutes for the other. A choice can be
 * distinct here and dead to every reader, and it can be alive to every reader and identical
 * here.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { renderPassage } from './reading.mjs';

/** Passage kinds that carry a *consequence* rather than an acknowledgement of the pick. */
const CONSEQUENCE = new Set(['ending', 'epilogue']);

/** Every passage of a reading, flattened, as the rendered strings a reader would receive. */
function rendered(reading) {
  const out = [];
  for (const section of reading.sections || []) {
    for (const p of section.passages || []) {
      out.push({ id: p.id, section: section.id, kind: p.kind, text: renderPassage(p) });
    }
  }
  return out;
}

const words = (list) => list.reduce((s, p) => s + p.text.split(/\s+/).filter(Boolean).length, 0);

/**
 * The text one variant has that another does not, in both directions.
 * Compared on the rendered string rather than the passage id, because two branches often reach
 * the same paragraph through different ids and that is not a difference a reader could see.
 */
export function divergence(a, b) {
  const A = rendered(a);
  const B = rendered(b);
  const setA = new Set(A.map((p) => p.text));
  const setB = new Set(B.map((p) => p.text));
  const onlyA = A.filter((p) => !setB.has(p.text));
  const onlyB = B.filter((p) => !setA.has(p.text));
  const shared = A.filter((p) => setB.has(p.text)).length;
  const total = new Set([...setA, ...setB]).size;
  return {
    onlyA, onlyB, shared,
    distinctWords: words(onlyA.concat(onlyB)),
    similarity: total ? Number((shared / total).toFixed(4)) : 1,
  };
}

/**
 * Compare the variants of one choice.
 *
 * @param {object} args
 * @param {string} args.at            the choice passage id, for the report
 * @param {Array<{option: string, reading: object}>} args.variants  one reading per option,
 *   each produced by forcing that option and changing nothing else
 * @param {object} [options]
 * @param {number} [options.minDistinctWords] a *declared* floor: below this many words of
 *   text unique to an option, the option is reported as not distinguishable. Declared by the
 *   caller and echoed back — this module invents no threshold of its own.
 * @returns {{at: string, options: string[], pairs: Array, collapsed: Array, declaredFloor: number}}
 */
export function compareBranches({ at, variants }, { minDistinctWords = 1 } = {}) {
  const pairs = [];
  for (let i = 0; i < variants.length; i += 1) {
    for (let j = i + 1; j < variants.length; j += 1) {
      const d = divergence(variants[i].reading, variants[j].reading);
      pairs.push({
        a: variants[i].option,
        b: variants[j].option,
        similarity: d.similarity,
        distinctWords: d.distinctWords,
        onlyA: d.onlyA.map((p) => ({ id: p.id, text: p.text })),
        onlyB: d.onlyB.map((p) => ({ id: p.id, text: p.text })),
      });
    }
  }
  const collapsed = pairs.filter((p) => p.distinctWords < minDistinctWords);

  /*
   * Domination, which is a different question from similarity and from distinctness.
   *
   * The first version of this counted, per option, the ending text no *other* option delivered.
   * It was checked against a real work and gave a number that did not survive being looked at:
   * an option that adds a paragraph of its own scored zero, because a fourth option — which
   * switches to an entirely different ending — happens to carry the same paragraph. "Unique
   * across all variants" is the wrong relation.
   *
   * The right one is domination. Option X is dominated when some other option Y delivers
   * everything X delivers **and more**. That is precisely what a collapsed option looks like:
   * picking it gets you a subset of what picking something else would have got you, so nothing
   * about the ending is yours. It also states itself in one sentence, which the previous
   * measure could not.
   *
   * Reported per option with the dominating option named, so the claim can be checked by
   * reading two paragraphs rather than by trusting a count.
   */
  const endingSets = variants.map((v) => new Set(rendered(v.reading).filter((p) => CONSEQUENCE.has(p.kind)).map((p) => p.text)));
  const subset = (a, b) => [...a].every((x) => b.has(x));

  const consequence = variants.map((v, i) => {
    const mine = rendered(v.reading).filter((p) => CONSEQUENCE.has(p.kind));
    const dominators = variants
      .map((o, j) => ({ o, j }))
      .filter(({ j }) => j !== i && subset(endingSets[i], endingSets[j]) && endingSets[j].size > endingSets[i].size)
      .map(({ o, j }) => ({
        option: o.option,
        extraWords: words(rendered(o.reading).filter((p) => CONSEQUENCE.has(p.kind) && !endingSets[i].has(p.text))),
      }));
    const others = new Set(variants.flatMap((o, j) => (i === j ? [] : [...endingSets[j]])));
    return {
      option: v.option,
      consequenceWords: words(mine),
      ownWords: words(mine.filter((p) => !others.has(p.text))),
      dominatedBy: dominators,
    };
  });

  // Every option delivering exactly the same endings: nothing to single out, and also what a
  // choice with no ending downstream of it at all looks like. Normal mid-chapter; reported
  // separately so it is never filed against every option in the work.
  const allEqual = endingSets.every((set) => endingSets.every((other) => set.size === other.size && subset(set, other)));
  const withoutConsequence = allEqual ? [] : consequence.filter((c) => c.dominatedBy.length);
  const noOptionHasConsequence = allEqual;

  return {
    at,
    options: variants.map((v) => v.option),
    pairs: pairs.sort((x, y) => x.distinctWords - y.distinctWords),
    collapsed,
    consequence,
    withoutConsequence,
    noOptionHasConsequence,
    declaredFloor: minDistinctWords,
  };
}

/**
 * Turn collapsed pairs into findings on the shared structure.
 *
 * `problem` states the measurement and nothing else; no `hypothesis` is offered, for the same
 * reason the reading fold offers none — a tool can see that two options produce the same text,
 * and cannot know whether that is an unwritten branch, a condition that never fires, or a
 * deliberate joke.
 */
export function branchFindings(result, { owner = 'unknown', choiceLabel = null } = {}) {
  const consequenceFindings = result.withoutConsequence.length
    ? result.withoutConsequence.map((c) => ({
      severity: 'major',
      shot: result.at,
      category: 'branch:option-without-consequence',
      problem: `At ${result.at}${choiceLabel ? ` (${choiceLabel})` : ''}, option "${c.option}" is dominated: `
        + c.dominatedBy.map((d) => `choosing "${d.option}" instead delivers every ending and epilogue paragraph this option delivers, and ${d.extraWords} words more`).join('; ')
        + `. The pick is acknowledged in the scene and gets the reader a subset of another option's outcome.`,
      why: 'A reader hesitates over this option honestly and reports it as live, because a reader sees one branch. The absence of a consequence is a relation between branches and cannot be observed from inside any of them.',
      owner,
      fix: `Give "${c.option}" at least one ending or epilogue paragraph no other option produces, or reduce the choice to the number of distinct outcomes it has, and re-run: node .kit/tools/first-reader.mjs branches --variants=<dir> --at=${result.at}`,
    }))
    : [];

  return consequenceFindings.concat(result.collapsed.map((p) => ({
    severity: 'major',
    shot: result.at,
    category: 'branch:collapsed-option',
    problem: `At ${result.at}${choiceLabel ? ` (${choiceLabel})` : ''}, choosing "${p.a}" and choosing "${p.b}" produce ${p.distinctWords === 0 ? 'byte-identical' : `${p.distinctWords} words of`} downstream text — below the declared floor of ${result.declaredFloor} distinct words. The choice offers ${result.options.length} options and delivers ${result.options.length - result.collapsed.length} outcomes.`,
    why: 'Two options that lead to the same text are one option with two labels. No reader can detect this from inside a single playthrough, so nothing but this comparison will report it.',
    owner,
    fix: `Give "${p.a}" and "${p.b}" downstream text that differs by at least ${result.declaredFloor} words, or reduce the choice to the number of outcomes it actually has, and re-run: node .kit/tools/first-reader.mjs branches --variants=<dir> --at=${result.at}`,
  })));
}

/** Self-test cases in the shape `runGateSelfTests` consumes. */
export function branchSelfTestCases() {
  const reading = (tail) => ({
    work: 'Fixture', language: 'en',
    sections: [{
      id: 's1', title: 'ONE',
      passages: [
        { id: 'p1', kind: 'narration', text: 'She stood at the head of the shaft with the wheel in both hands.' },
        { id: 'p2', kind: 'choice', options: [{ label: 'Shut it' }, { label: 'Leave it' }, { label: 'Shut one' }] },
        { id: 'p3', kind: 'narration', text: tail },
        { id: 'p4', kind: 'ending', text: 'By spring the street was empty either way.' },
      ],
    }],
  });
  const shut = { option: 'shut', reading: reading('The yard filled by morning and they moved the generator upstairs.') };
  const leave = { option: 'leave', reading: reading('The courtyard held through the winter and nobody thanked her for it.') };
  const half = { option: 'half', reading: reading('The courtyard held through the winter and nobody thanked her for it.') };
  const halfReal = { option: 'half', reading: reading('One head, the middle one, and for a fortnight it was not clear which way it had gone.') };

  const fired = (r) => r.collapsed.map((p) => `${p.a}/${p.b} ${p.distinctWords}w`);
  const firedConsequence = (r) => r.withoutConsequence.map((c) => `${c.option} 0w`);

  /*
   * The subset case, transcribed from the real one rather than invented: three options, each
   * with its own acknowledgement line, where the third's endings are a strict subset of the
   * second's. No pair is identical, so the pairwise check is quiet and must be.
   */
  const subset = (ack, endings) => ({
    work: 'Fixture', language: 'en',
    sections: [{
      id: 's1', title: 'ONE',
      passages: [
        { id: 'p1', kind: 'narration', text: 'She stood at the head of the shaft with the wheel in both hands.' },
        { id: 'p2', kind: 'choice', options: [{ label: 'Shut it' }, { label: 'Leave it' }, { label: 'Shut one' }] },
        { id: 'p3', kind: 'narration', text: ack },
        ...endings.map((t, i) => ({ id: `e${i}`, kind: 'ending', text: t })),
      ],
    }],
  });
  const HELD = 'The courtyard held through the winter and nobody thanked her for it.';
  const LOST = 'They lost the courtyard in a fortnight and moved the generator upstairs.';
  const GARAGE = 'The Ostrowskis did not all get out, and there was nobody downstairs to hear it.';
  const sShut = { option: 'shut', reading: subset('I shut them.', [LOST]) };
  const sLeave = { option: 'leave', reading: subset('I left them.', [HELD, GARAGE]) };
  const sHalf = { option: 'half', reading: subset('One head. The middle one.', [HELD]) };
  const sHalfReal = { option: 'half', reading: subset('One head. The middle one.', [HELD, 'For a fortnight it was not clear which way it had gone.']) };

  return [
    {
      name: 'two options that deliver the same downstream text are reported as one option',
      evaluate: () => fired(compareBranches({ at: 'p2', variants: [shut, leave, half] }, { minDistinctWords: 1 })),
    },
    {
      name: 'the finding says how many outcomes the choice actually has',
      evaluate: () => {
        const r = compareBranches({ at: 'p2', variants: [shut, leave, half] }, { minDistinctWords: 1 });
        const f = branchFindings(r, { owner: 'src/story.js' });
        return f.length && /delivers 2 outcomes/.test(f[0].problem) ? [f[0].problem.slice(0, 60)] : [];
      },
    },
    {
      name: 'a declared floor catches a branch that differs by only a few words',
      evaluate: () => fired(compareBranches({
        at: 'p2',
        variants: [shut, leave, { option: 'half', reading: reading('The courtyard held through the winter and nobody thanked her at all.') }],
      }, { minDistinctWords: 40 })),
    },
    {
      name: 'an option acknowledged in the scene and then delivering no consequence of its own is reported',
      evaluate: () => firedConsequence(compareBranches({ at: 'p2', variants: [sShut, sLeave, sHalf] })),
    },
    {
      name: 'and the pairwise check stays quiet on it, because the branches are not similar — one is a subset',
      shouldFire: false,
      evaluate: () => fired(compareBranches({ at: 'p2', variants: [sShut, sLeave, sHalf] }, { minDistinctWords: 1 })),
    },
    {
      name: 'CONTROL: an option with one ending paragraph of its own is not reported',
      shouldFire: false,
      evaluate: () => firedConsequence(compareBranches({ at: 'p2', variants: [sShut, sLeave, sHalfReal] })),
    },
    {
      name: 'CONTROL: a choice where no option has any consequence at all is not singled out',
      shouldFire: false,
      evaluate: () => firedConsequence(compareBranches({
        at: 'p2',
        variants: [
          { option: 'a', reading: subset('I shut them.', []) },
          { option: 'b', reading: subset('I left them.', []) },
        ],
      })),
    },
    {
      name: 'CONTROL: three genuinely different outcomes are not reported',
      shouldFire: false,
      evaluate: () => fired(compareBranches({ at: 'p2', variants: [shut, leave, halfReal] }, { minDistinctWords: 1 })),
    },
    {
      name: 'CONTROL: no floor is invented — the same set passes at a floor of one word',
      shouldFire: false,
      evaluate: () => {
        const r = compareBranches({ at: 'p2', variants: [shut, leave, halfReal] }, { minDistinctWords: 1 });
        return r.declaredFloor === 1 && r.collapsed.length === 0 ? [] : ['a floor was applied that the caller did not declare'];
      },
    },
    {
      name: 'CONTROL: a reading compared with itself is identical, and that is not a finding about a choice',
      shouldFire: false,
      evaluate: () => {
        const d = divergence(shut.reading, shut.reading);
        return d.similarity === 1 && d.onlyA.length === 0 ? [] : ['self-comparison is not the identity'];
      },
    },
  ];
}
