/**
 * agreement.mjs — fold several independent first readings into findings, and throw away
 * everything only one reader said.
 *
 * One reader is a person. Several readers who were never allowed to talk to each other, all
 * stopping at the same passage for the same reason, are a property of the text. That is the
 * whole of the discrimination this module performs, and it is the reason the protocol insists
 * on independence: a second reader who has read the first one's notes is not a second sample,
 * they are an echo.
 *
 * What does **not** reach quorum is not discarded — it is recorded as individual variation and
 * kept. A single reader's confusion is real for that reader, and this tool has no basis for
 * calling it a defect.
 *
 * The findings emitted here carry `problem` and no `hypothesis`, and that is deliberate rather
 * than lazy. Across the measured rounds on these projects the critic's symptom calls were right
 * 6/6 and its mechanism guesses were wrong 4/4. A reader can observe that 380 households will
 * not fit inside 406 people; a reader cannot know whether that is a typo, a stale draft or a
 * deliberate unreliable narrator. Proposing the mechanism is a separate job for someone with
 * the source open, and the split is inherited from `lib/plan/findings.mjs` unchanged.
 */

import { renderSection } from './reading.mjs';
import { buildProtocol, sampleReport } from './protocol.mjs';

const EN_STOP = new Set(('a an the and or but if then than that this these those of to in on at by for with from as is are was were be been being it its he she they them his her their you your i me my we our not no do does did have has had will would could should can may might there here what which who whom when where why how all any some more most other into over under again about'
).split(/\s+/));

/** Content tokens for overlap. Character bigrams for Japanese, stopword-stripped words otherwise. */
export function tokens(text, language = 'en') {
  const s = String(text || '').toLowerCase();
  if (language === 'ja') {
    const stripped = s.replace(/[\s、。「」『』（）()・…—\-,.!?]/g, '');
    const out = new Set();
    for (let i = 0; i + 2 <= stripped.length; i += 1) out.add(stripped.slice(i, i + 2));
    return out;
  }
  return new Set(s.split(/[^a-z0-9']+/).filter((w) => w.length > 2 && !EN_STOP.has(w)));
}

/** Jaccard overlap of two token sets. */
export function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / (a.size + b.size - shared);
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/**
 * Attribute a freely recalled item to the section it most likely came from.
 * Best-effort and reported as such: an item that matches nothing is left unattributed rather
 * than assigned to the nearest section.
 */
export function attributeRecall(item, reading) {
  const t = tokens(item, reading.language);
  let best = null;
  let bestScore = 0;
  for (const section of reading.sections || []) {
    const score = overlap(t, tokens(renderSection(section), reading.language));
    if (score > bestScore) { bestScore = score; best = section.id; }
  }
  return bestScore > 0 ? { section: best, score: Number(bestScore.toFixed(4)) } : { section: null, score: 0 };
}

/** Language the comparison words below are written for. English-only on purpose — see the gate. */
const COMPARATIVE = /\b(better|worse|improved|improvement|regressed|regression|more than before|less than before|compared with the previous|since the fix|after the fix)\b/i;

/**
 * Fold reader reports into a findings review.
 *
 * @param {object} args
 * @param {object} args.reading
 * @param {{checkpoints: Array}} args.protocol
 * @param {Array} args.reports              validated transcripts, one per independent reader
 * @param {number} [args.quorum]            default: a majority, never fewer than two
 * @param {string} args.blindComparison     what a stranger would pick, and why — or, on a
 *                                          first run, the honest statement that there was
 *                                          nothing to compare against
 * @param {object|null} [args.baseline]     an earlier fold of the same reading, if there is one
 * @param {number} [args.round]
 * @param {(source: string) => string} [args.ownerFor]  passage source -> owning file
 * @returns {{ok: boolean, refusals: string[], review: object|null, signals: object|null,
 *            individualVariation: Array}}
 */
export function foldReports({
  reading, protocol, reports, quorum, blindComparison, baseline = null, round = null, ownerFor = (s) => s,
  acknowledgedPriorKnowledge = [],
}) {
  const refusals = [];

  if (!Array.isArray(reports) || reports.length < 2) {
    refusals.push(`agreement needs at least two independent readers, got ${Array.isArray(reports) ? reports.length : 0}`);
  }
  const declared = [];
  const seen = new Set();
  for (const r of reports || []) {
    if (seen.has(r?.reader)) refusals.push(`reader ${r.reader} appears twice; that is one sample, not two`);
    seen.add(r?.reader);
    if (!r?.priorKnowledge) continue;
    // A reader is rarely a perfect blank. When the run is driven by agents the harness's own
    // project context can already describe the work — a title, a genre, a one-line premise —
    // and no instruction un-knows it. The escape hatch is deliberately narrow: each accepted
    // disclosure has to be written out in advance and matched, so the compromise ends up
    // stamped on the review instead of quietly absent from it. Anything not on the list still
    // refuses, which is what keeps this from becoming a way to wave a reader through.
    const text = String(r.priorKnowledge);
    const matched = acknowledgedPriorKnowledge.find((a) => text.toLowerCase().includes(String(a).toLowerCase()));
    if (matched) declared.push({ reader: r.reader, disclosed: text, acknowledged: matched });
    else refusals.push(`reader ${r.reader} declared prior knowledge (${JSON.stringify(r.priorKnowledge)}) that was not acknowledged in advance, and is not a first reader`);
  }
  if (typeof blindComparison !== 'string' || blindComparison.trim().length < 40) {
    refusals.push('blindComparison is required and must say what was compared, or that nothing was');
  } else if (!baseline && COMPARATIVE.test(blindComparison)) {
    refusals.push('blindComparison makes a comparative claim with no baseline fold to compare against');
  }
  if (refusals.length) return { ok: false, refusals, review: null, signals: null, individualVariation: [] };

  const n = reports.length;
  const q = quorum ?? Math.max(2, Math.ceil(n / 2));
  const passageIndex = new Map();
  for (const section of reading.sections || []) {
    for (const p of section.passages || []) passageIndex.set(p.id, { ...p, section: section.id });
  }
  const entry = (report, id) => (report.checkpoints || []).find((c) => c.id === id);
  const ownerOf = (anchor) => {
    const p = passageIndex.get(anchor);
    return p?.source ? ownerFor(p.source) : ownerFor(reading.sourceOfRecord || 'unknown');
  };

  const findings = [];

  /* ---------------------------------------------------------------- confusions */

  // Anchors first. A reader reading a step file has no passage ids in front of them, so what
  // they can give is a quote. Resolving the quote to the passage that contains it is what
  // lets two readers who noticed the same sentence land in the same cluster — anchoring on
  // whatever coarse label they happened to type merges unrelated things and splits related
  // ones, and both of those are worse than an unresolved anchor.
  const anchorOf = (c) => {
    if (!c.quote || typeof c.quote !== 'string' || c.quote.trim().length < 8) return c.at;
    const needle = c.quote.trim().toLowerCase().replace(/\s+/g, ' ');
    const hits = [];
    for (const [id, p] of passageIndex) {
      const hay = (p.kind === 'choice' ? (p.options || []).map((o) => o.label).join(' ') : String(p.text || ''))
        .toLowerCase().replace(/\s+/g, ' ');
      if (hay.includes(needle)) hits.push(id);
    }
    return hits.length === 1 ? hits[0] : c.at;   // ambiguous or absent: keep what the reader said
  };

  const clusters = new Map();
  for (const report of reports) {
    for (const c of report.confusions || []) {
      const at = anchorOf(c);
      const key = `${c.kind}|${at}`;
      if (!clusters.has(key)) clusters.set(key, { kind: c.kind, at, entries: [] });
      clusters.get(key).entries.push({
        reader: report.reader, statement: c.statement, hypothesis: c.hypothesis,
        ...(c.quote ? { quote: c.quote } : {}), ...(at === c.at ? {} : { readerSaid: c.at }),
      });
    }
  }

  /*
   * Two passes, and the second one exists because the first was measured missing things.
   *
   * Clustering on (kind, anchor) is the stronger claim: readers who agreed on the place *and*
   * on what sort of problem it was. But the kind is the reader's after-the-fact label — the
   * brief asks them to describe the confusion in their own words first and pick a label second
   * — and on a real run four of five readers stopped at the same passage and labelled it
   * `unplaceable`, `unearned` and `contradiction` between them. Nothing reached quorum on any
   * single kind, so a passage four readers out of five could not get past was filed as nothing.
   *
   * So agreement is decided on the **anchor**, and the kind is reported as a distribution over
   * it. Where the kind is also unanimous the finding says so and keeps full weight; where it is
   * not, it is filed as `anchor_mixed_kind` and the labels are listed rather than reconciled.
   */
  const byAnchor = new Map();
  for (const cluster of clusters.values()) {
    if (!byAnchor.has(cluster.at)) byAnchor.set(cluster.at, []);
    byAnchor.get(cluster.at).push(cluster);
  }
  const filedAnchors = new Set();

  const individualVariation = [];
  for (const cluster of clusters.values()) {
    const readers = [...new Set(cluster.entries.map((e) => e.reader))];
    const sets = cluster.entries.map((e) => tokens(e.statement, reading.language));
    const pairs = [];
    for (let i = 0; i < sets.length; i += 1) for (let j = i + 1; j < sets.length; j += 1) pairs.push(overlap(sets[i], sets[j]));
    const cohesion = Number(mean(pairs).toFixed(4));

    if (readers.length < q) {
      individualVariation.push({
        kind: cluster.kind, at: cluster.at, readers, cohesion,
        statements: cluster.entries.map((e) => e.statement),
        note: `${readers.length} of ${n} readers; quorum is ${q}. Recorded, not filed: one reader's confusion is real for that reader and is not evidence about the text.`,
      });
      continue;
    }

    const anchorOnly = cohesion < 0.2;
    const unanimous = readers.length === n;
    const severity = anchorOnly ? 'minor'
      : (unanimous && (cluster.kind === 'contradiction' || cluster.kind === 'dead_choice')) ? 'blocker'
        : 'major';

    filedAnchors.add(cluster.at);
    findings.push({
      severity,
      shot: cluster.at,
      category: `first-reader:${cluster.kind}`,
      problem: `${readers.length} of ${n} independent first readers reported ${cluster.kind} at ${cluster.at}. `
        + `Statement overlap between them is ${cohesion}${anchorOnly ? ' — they agree on the place and not demonstrably on the reason, so this is filed as anchor-only agreement' : ''}. `
        + `Verbatim: ${cluster.entries.map((e) => `[${e.reader}] ${e.statement}`).join(' ')}`,
      why: `Confusion reported independently by ${readers.length} readers at one anchor is a property of the text rather than of a reader.`,
      owner: ownerOf(cluster.at),
      fix: `Re-run this protocol over the same reading and require fewer than ${q} of ${n} readers to report ${cluster.kind} at ${cluster.at} (now ${readers.length}): node .kit/tools/first-reader.mjs fold --reading=<reading.json> --reports=<dir>`,
      ...(cluster.entries.some((e) => e.hypothesis)
        ? { hypothesis: `Reader-proposed, unverified: ${cluster.entries.filter((e) => e.hypothesis).map((e) => e.hypothesis).join(' | ')}` }
        : {}),
      readers,
      agreement: anchorOnly ? 'anchor_only' : 'statement',
    });
  }

  // Second pass: an anchor a quorum of readers stopped at, which no single kind carried.
  for (const [anchor, group] of byAnchor) {
    if (filedAnchors.has(anchor)) continue;
    const entries = group.flatMap((c) => c.entries.map((e) => ({ ...e, kind: c.kind })));
    const readers = [...new Set(entries.map((e) => e.reader))];
    if (readers.length < q) continue;

    const sets = entries.map((e) => tokens(e.statement, reading.language));
    const pairs = [];
    for (let i = 0; i < sets.length; i += 1) for (let j = i + 1; j < sets.length; j += 1) pairs.push(overlap(sets[i], sets[j]));
    const cohesion = Number(mean(pairs).toFixed(4));
    const kinds = [...new Set(entries.map((e) => e.kind))].sort();

    // Drop it back to individual variation rather than file it when the readers share only the
    // anchor and nothing else — otherwise a passage several people happened to annotate for
    // unrelated reasons becomes a finding.
    if (cohesion < 0.08) {
      individualVariation.push({
        kind: `mixed(${kinds.join('/')})`, at: anchor, readers, cohesion,
        statements: entries.map((e) => e.statement),
        note: `${readers.length} of ${n} readers stopped here, but their statements share almost nothing (${cohesion}). Recorded, not filed: same place is not the same problem.`,
      });
      continue;
    }

    findings.push({
      severity: 'major',
      shot: anchor,
      category: `first-reader:mixed-kind`,
      problem: `${readers.length} of ${n} independent first readers stopped at ${anchor}, labelling it ${kinds.length} different ways (${kinds.join(', ')}) — so no single kind reached quorum while the passage itself did. Statement overlap ${cohesion}. `
        + `Verbatim: ${entries.map((e) => `[${e.reader}/${e.kind}] ${e.statement}`).join(' ')}`,
      why: `The kind is a label the reader picks after describing what happened; the anchor is where they stopped. ${readers.length} of ${n} readers could not get past this passage cleanly.`,
      owner: ownerOf(anchor),
      fix: `Re-run this protocol over the same reading and require fewer than ${q} of ${n} readers to report any confusion at ${anchor} (now ${readers.length}): node .kit/tools/first-reader.mjs fold --reading=<reading.json> --reports=<dir>`,
      readers,
      agreement: 'anchor_mixed_kind',
      kinds,
    });
  }

  /* ---------------------------------------------------------------- checkpoints */

  const signals = { readers: n, quorum: q, sections: {}, choices: {}, recall: {} };

  for (const section of reading.sections || []) {
    // A postscript is never asked these. Reporting `answered: 5` for a question nobody put is
    // a number that reads as a result and is not one.
    if (section.postscript) { signals.sections[section.id] = { notAsked: true, reason: 'postscript' }; continue; }
    const per = {};
    for (const kind of ['expectation', 'allegiance', 'stakes']) {
      const id = `${section.id}:${kind}`;
      const answers = reports.map((r) => ({ reader: r.reader, e: entry(r, id) }));
      const blank = answers.filter((a) => a.e && a.e.answered === false);
      per[kind] = { answered: n - blank.length, blank: blank.map((a) => a.reader) };
      if (blank.length >= q) {
        findings.push({
          severity: kind === 'allegiance' ? 'minor' : 'major',
          shot: section.id,
          category: `first-reader:no-${kind}`,
          problem: `At the end of ${section.title} (${section.id}), ${blank.length} of ${n} independent first readers could not answer "${kind}" at all — asked before they were allowed to read on, with the answer not yet available anywhere in the text.`,
          why: kind === 'expectation'
            ? 'A section that leaves no expectation has nothing for the next section to pay off; a payoff with no preceding expectation reads as an event rather than a turn.'
            : kind === 'stakes'
              ? 'Nothing the reader is afraid of losing means nothing is at risk, and a later loss lands on a reader who was not braced for it.'
              : 'No allegiance means no one to be betrayed by or vindicated in.',
          owner: ownerOf(section.passages?.[section.passages.length - 1]?.id),
          fix: `Re-run this protocol over the same reading and require at least ${n - q + 1} of ${n} readers to answer ${kind} at ${section.id} (now ${n - blank.length}): node .kit/tools/first-reader.mjs fold --reading=<reading.json> --reports=<dir>`,
        });
      }
    }
    signals.sections[section.id] = per;
  }

  for (const cp of protocol.checkpoints.filter((c) => c.kind === 'hesitation')) {
    const answers = reports.map((r) => ({ reader: r.reader, e: entry(r, cp.id) }));
    const instant = answers.filter((a) => a.e && a.e.answered === true && a.e.hesitated === false);
    const picks = answers.map((a) => a.e?.chose).filter((x) => x !== undefined);
    const distinct = new Set(picks).size;
    signals.choices[cp.anchor] = {
      hesitated: n - instant.length, instant: instant.map((a) => a.reader), distinctPicks: distinct, picks,
    };
    if (instant.length >= q) {
      findings.push({
        severity: 'major',
        shot: cp.anchor,
        category: 'first-reader:dead-choice',
        problem: `${instant.length} of ${n} independent first readers answered the choice at ${cp.anchor} instantly, with no stated difficulty, asked with the option labels visible and the consequences hidden. ${distinct === 1 ? `All ${picks.length} who named a pick named the same one.` : `${distinct} distinct picks between them.`}`,
        why: 'A choice nobody hesitates over is decoration: it costs the reader nothing to make and therefore costs them nothing to have made.',
        owner: ownerOf(cp.anchor),
        fix: `Re-run this protocol over the same reading and require fewer than ${q} of ${n} readers to answer instantly at ${cp.anchor} (now ${instant.length}): node .kit/tools/first-reader.mjs fold --reading=<reading.json> --reports=<dir>`,
      });
    }
  }

  /* ---------------------------------------------------------------- recall */

  const recalled = {};
  for (const section of reading.sections || []) recalled[section.id] = { free: [], cued: [] };
  const unattributed = [];

  for (const report of reports) {
    const free = entry(report, 'recall_free');
    for (const item of (free?.items || [])) {
      const { section } = attributeRecall(item, reading);
      if (section) recalled[section].free.push({ reader: report.reader, item });
      else unattributed.push({ reader: report.reader, item });
    }
    const cued = entry(report, 'recall_cued');
    for (const [sectionId, items] of Object.entries(cued?.bySection || {})) {
      // A reader asked "what do you remember from each chapter" answers in prose about as
      // often as in a list, and an earlier version accepted only the list — so five readers'
      // cued recall was dropped and every section reported zero. A measurement that silently
      // reads zero is indistinguishable from a real zero, which is the failure this whole kit
      // is built around. Normalise here, and refuse an uncountable shape in the validator.
      const list = Array.isArray(items) ? items : (typeof items === 'string' && items.trim() ? [items] : []);
      if (recalled[sectionId] && list.length) recalled[sectionId].cued.push({ reader: report.reader, items: list });
    }
  }

  for (const section of reading.sections || []) {
    const free = new Set(recalled[section.id].free.map((r) => r.reader));
    const cued = new Set(recalled[section.id].cued.map((r) => r.reader));
    const blank = reports.filter((r) => !free.has(r.reader) && !cued.has(r.reader)).map((r) => r.reader);
    signals.recall[section.id] = { freeReaders: free.size, cuedReaders: cued.size, blank };
    if (blank.length >= q) {
      findings.push({
        severity: 'major',
        shot: section.id,
        category: 'first-reader:no-recall',
        problem: `${blank.length} of ${n} independent first readers remembered nothing from ${section.title} (${section.id}) — measured after the read with the text withdrawn, free recall first and chapter titles as the only cue afterwards.`,
        why: 'A section that leaves no trace once the page is gone cannot be carrying anything later in the work.',
        owner: ownerOf(section.passages?.[0]?.id),
        fix: `Re-run this protocol over the same reading and require at least ${n - q + 1} of ${n} readers to recall something from ${section.id} with the text withdrawn (now ${n - blank.length}): node .kit/tools/first-reader.mjs fold --reading=<reading.json> --reports=<dir>`,
      });
    }
  }
  signals.recall.unattributed = unattributed;

  const order = { blocker: 0, major: 1, minor: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  const review = {
    ...(round === null ? {} : { round }),
    profile: 'first-reader',
    tier: `${n} independent readers, quorum ${q}`
      + (declared.length ? `, ${declared.length} carrying acknowledged prior knowledge` : ''),
    ...(declared.length ? { declaredPriorKnowledge: declared } : {}),
    verdict: refusals.length === 0 && findings.length === 0 ? 'PASS' : 'FAIL',
    score: Math.max(0, 100 - findings.reduce((s, f) => s + ({ blocker: 25, major: 10, minor: 3 })[f.severity], 0)),
    blindComparison,
    findings,
  };

  return { ok: true, refusals, review, signals, individualVariation };
}

/**
 * Self-test cases for the fold, in the shape `runGateSelfTests` consumes.
 *
 * The two that matter most are the pair at the top: an agreed confusion must become a
 * finding, and a confusion only one reader had must not. A tool that files everything is as
 * useless as one that files nothing, and it is the easier of the two to build by accident.
 */
export function agreementSelfTestCases(reading) {
  const protocol = buildProtocol(reading);
  const choiceAnchor = protocol.checkpoints.find((c) => c.kind === 'hesitation').anchor;
  const blind = 'Nothing was shown beside this reading; three first readers read it blind and this run records only what they agreed on.';

  const readers = (n, decorate = () => {}) => Array.from({ length: n }, (_, i) => {
    const r = sampleReport(reading, protocol, { reader: `reader-${i + 1}` });
    decorate(r, i);
    return r;
  });
  const fold = (reports, extra = {}) => foldReports({ reading, protocol, reports, blindComparison: blind, ...extra });
  const problems = (result) => (result.ok ? result.review.findings.map((f) => `${f.severity} ${f.category} ${f.shot}`) : result.refusals);

  const sameConfusion = (r, i) => {
    if (i < 2) r.confusions = [{ at: 'p4', kind: 'contradiction', statement: 'the number of households given here is larger than the number of people said to be left' }];
  };
  const differentConfusions = (r, i) => {
    r.confusions = [{ at: `p${i + 1}`, kind: 'unplaceable', statement: `reader ${i} could not place a name that arrived here without introduction` }];
  };

  return [
    {
      name: 'a confusion two of three readers reached independently becomes a finding',
      evaluate: () => problems(fold(readers(3, sameConfusion))),
    },
    {
      name: 'a choice every reader answered instantly is filed as a dead choice',
      evaluate: () => problems(fold(readers(3, (r) => {
        for (const c of r.checkpoints) if (c.kind === 'hesitation') { c.hesitated = false; c.text = 'Instant. The second option was not a real option.'; }
      }))).filter((p) => p.includes('dead-choice')),
    },
    {
      name: 'a section that left no expectation in any reader is filed',
      evaluate: () => problems(fold(readers(3, (r) => {
        for (const c of r.checkpoints) if (c.kind === 'expectation') { c.answered = false; delete c.text; }
      }))).filter((p) => p.includes('no-expectation')),
    },
    {
      name: 'cued recall written as prose rather than a list is counted, not dropped',
      shouldFire: false,
      evaluate: () => {
        const result = fold(readers(3, (r) => {
          for (const c of r.checkpoints) {
            if (c.kind === 'recall_free') c.items = [];
            if (c.kind === 'recall_cued') {
              c.items = [];
              c.bySection = Object.fromEntries((reading.sections || []).map((s) => [s.id, `I remember the ${s.title} part clearly enough to describe it`]));
            }
          }
        }));
        if (!result.ok) return result.refusals;
        return result.review.findings.filter((f) => f.category.includes('no-recall')).map((f) => f.shot);
      },
    },
    {
      name: 'a section nobody remembered with the text withdrawn is filed',
      evaluate: () => problems(fold(readers(3, (r) => {
        for (const c of r.checkpoints) {
          if (c.kind === 'recall_free') c.items = [];
          if (c.kind === 'recall_cued') c.bySection = {};
        }
      }))).filter((p) => p.includes('no-recall')),
    },
    {
      name: 'one reader is refused: there is nothing to agree with',
      evaluate: () => problems(fold(readers(1))),
    },
    {
      name: 'the same reader counted twice is refused as one sample, not two',
      evaluate: () => problems(fold(readers(2, (r) => { r.reader = 'reader-1'; }))),
    },
    {
      name: 'a reader who already knew the work is refused',
      evaluate: () => problems(fold(readers(3, (r, i) => { if (i === 0) r.priorKnowledge = 'read an earlier draft'; }))),
    },
    {
      name: 'a disclosure that was not acknowledged in advance is still refused',
      evaluate: () => problems(fold(
        readers(3, (r, i) => { if (i === 0) r.priorKnowledge = 'read an earlier draft'; }),
        { acknowledgedPriorKnowledge: ['the one-line premise was in my environment context'] },
      )),
    },
    {
      name: 'CONTROL: an acknowledged disclosure folds, and is stamped on the review',
      shouldFire: false,
      evaluate: () => {
        const result = fold(
          readers(3, (r, i) => { if (i === 0) r.priorKnowledge = 'the one-line premise was in my environment context, nothing else'; }),
          { acknowledgedPriorKnowledge: ['the one-line premise was in my environment context'] },
        );
        if (!result.ok) return result.refusals;
        if (!result.review.declaredPriorKnowledge?.length) return ['the disclosure did not reach the review'];
        return [];
      },
    },
    {
      name: 'a comparative blindComparison with no baseline to compare against is refused',
      evaluate: () => problems(fold(readers(3), { blindComparison: 'The chapter four dilemma is much better than it was before the fix, and a stranger would now pick ours.' })),
    },
    {
      name: 'an anchor a quorum stopped at is filed even when they labelled it differently',
      evaluate: () => problems(fold(readers(3, (r, i) => {
        const kinds = ['unplaceable', 'unearned', 'contradiction'];
        r.confusions = [{ at: 'p4', kind: kinds[i], statement: 'the ending cites a promise about the vents that nobody in this story ever made to her' }];
      }))).filter((p) => p.includes('mixed-kind')),
    },
    {
      name: 'CONTROL: an anchor several readers annotated for unrelated reasons is not filed',
      shouldFire: false,
      evaluate: () => {
        const result = fold(readers(3, (r, i) => {
          const kinds = ['unplaceable', 'unearned', 'contradiction'];
          const said = [
            'who exactly is this person nobody introduced',
            'the reward arrived although nothing whatsoever paid for it',
            'seventeen against ninety, and both numbers were stated flatly',
          ];
          r.confusions = [{ at: 'p4', kind: kinds[i], statement: said[i] }];
        }));
        if (!result.ok) return result.refusals;
        return result.review.findings.filter((f) => f.category.includes('mixed-kind')).map((f) => f.shot);
      },
    },
    {
      name: 'CONTROL: confusions no two readers shared are recorded as individual variation and filed as nothing',
      shouldFire: false,
      evaluate: () => {
        const result = fold(readers(3, differentConfusions));
        if (!result.ok) return result.refusals;
        if (result.individualVariation.length !== 3) return [`expected three recorded variations, got ${result.individualVariation.length}`];
        return result.review.findings.map((f) => `${f.category} ${f.shot}`);
      },
    },
    {
      name: 'CONTROL: three compliant readers who agreed on nothing produce no findings',
      shouldFire: false,
      evaluate: () => problems(fold(readers(3))),
    },
    {
      name: 'CONTROL: the choice anchor exists, so the dead-choice check is not vacuous',
      shouldFire: false,
      evaluate: () => (choiceAnchor ? [] : ['the fixture reading has no choice passage']),
    },
  ];
}

/**
 * What the verdict above is, and is not.
 *
 * `lib/plan/findings.schema.json` already says a PASS "closes the review workstream only,
 * never the product criteria", and that is doubly true here. This verdict says whether this
 * run of this protocol produced agreed findings. It is not an acceptance criterion for the
 * work, it does not become one, and a run that produces no findings has established that
 * several readers agreed on nothing — not that the writing is good.
 */
export const VERDICT_MEANS = 'whether this run produced findings that reached quorum. Never a judgement of the work.';
