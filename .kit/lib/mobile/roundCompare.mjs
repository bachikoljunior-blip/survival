/**
 * roundCompare.mjs — the round-over-round comparison step for the phone gate.
 *
 * Why this exists, and why it is not another absolute threshold.
 *
 * Every phone harness in these repositories judges the current run against fixed limits: a
 * frame-gap hang guard, a screenshot diff ratio, a triangle ceiling. Those catch a build that
 * broke. None of them catches a build that got *worse* — boot climbing from 900 ms to 2.4 s
 * and p95 frame gap from 18 ms to 39 ms passes every one of them, because every one of them
 * was set loose enough not to flake on a shared CI runner.
 *
 * An emulator cannot answer "does this hold 30 FPS on an iPhone SE 3". It runs on a
 * datacentre CPU with a software rasteriser, and the number it produces is not the phone's
 * number. What it *can* answer, and what this module asks, is "is this round worse than the
 * last one on the same apparatus". That question is answerable with the free tooling, and it
 * is the question a review round actually needs.
 *
 * The absolute claim still requires the physical device. Nothing here may be reported as
 * evidence about real-phone frame rate, thermals, memory pressure or audio latency.
 *
 * Four refusals, each from a failure already on record in these repositories:
 *
 *   1. A report cannot be compared against itself. `survival` shipped an equivalence battery
 *      that compared its validator against its own output and passed vacuously; the fix was
 *      to pin the base. Same trap, same fix.
 *   2. A metric that vanished is not a metric that passed. A silently inert gate and a
 *      passing gate both print nothing and exit 0.
 *   3. Byte-identical timings across a whole round mean the report was copied, not
 *      re-measured. `lib/image/measure.mjs` says this about pixels; it is just as true of
 *      milliseconds, which no two real runs reproduce exactly.
 *   4. A failed run's numbers are not a measurement. A harness that aborted at step three
 *      reports a very fast boot.
 */

/** Loose by design: shared CI runners are noisy, and a gate that flakes gets switched off. */
export const DEFAULT_TOLERANCE = { relative: 0.25, absolute: 0 };

/**
 * The metrics every phone round should carry, as a starting point for a repo's config.
 *
 * The paths are the union of what the existing harnesses already emit, so a repo adopting
 * this does not have to change its harness to be compared — it declares where its numbers
 * already live. `required: false` means "compare it when it is there"; a metric the repo
 * genuinely does not measure is declared absent rather than silently defaulted to zero.
 */
export const SUGGESTED_METRICS = [
  { key: 'bootMs', path: 'timings.bootMs', direction: 'lower-is-better', required: false },
  { key: 'p95FrameGapMs', path: 'soak.p95FrameGapMs', direction: 'lower-is-better', required: false },
  { key: 'medianFrameGapMs', path: 'soak.medianFrameGapMs', direction: 'lower-is-better', required: false },
  { key: 'visualDiffRatio', path: 'visualRegression.diffRatio', direction: 'lower-is-better', required: false, tolerance: { relative: 0.5, absolute: 0.01 } },
  { key: 'soakSamples', path: 'soak.samples', direction: 'higher-is-better', required: false },
];

/** Read a dotted path without inventing a value for a missing one. */
export function readMetric(source, path) {
  let node = source;
  for (const part of String(path).split('.')) {
    if (node === null || typeof node !== 'object' || !(part in node)) return { present: false, value: null };
    node = node[part];
  }
  if (typeof node !== 'number' || !Number.isFinite(node)) {
    return { present: false, value: node, detail: `not a finite number: ${JSON.stringify(node)}` };
  }
  return { present: true, value: node };
}

function toleranceFor(metric) {
  return { ...DEFAULT_TOLERANCE, ...(metric.tolerance || {}) };
}

/**
 * Compare one metric. Returns a row; never throws.
 *
 * `unchanged` covers "moved, but inside tolerance" as well as "identical" — the distinction
 * that matters to a round is regressed / not regressed, and the raw delta is in the row for
 * anyone who wants to look closer.
 */
export function compareMetric(metric, baselineReport, currentReport) {
  const tolerance = toleranceFor(metric);
  const before = readMetric(baselineReport, metric.path);
  const after = readMetric(currentReport, metric.path);
  const row = {
    key: metric.key,
    path: metric.path,
    direction: metric.direction,
    tolerance,
    baseline: before.present ? before.value : null,
    current: after.present ? after.value : null,
    delta: null,
    relative: null,
    verdict: 'unchanged',
    detail: '',
  };

  if (!before.present && !after.present) {
    row.verdict = 'absent';
    row.detail = `neither round measured ${metric.path}`;
    return row;
  }
  if (!before.present) {
    // New metric, or the first round that measured it. Not a regression — but it is not a
    // comparison either, and saying so is the point.
    row.verdict = 'unrecorded';
    row.detail = `the baseline round does not carry ${metric.path}; it will be recorded on accept`;
    return row;
  }
  if (!after.present) {
    // The dangerous direction: a number the baseline has and this round does not. Either the
    // harness stopped measuring it or the run never reached that step.
    row.verdict = 'lost';
    row.detail = `the baseline measured ${metric.path} (${before.value}) and this round did not${after.detail ? ` — ${after.detail}` : ''}`;
    return row;
  }

  row.delta = +(after.value - before.value).toFixed(6);
  row.relative = before.value === 0 ? null : +((after.value - before.value) / Math.abs(before.value)).toFixed(6);

  const slack = Math.abs(before.value) * tolerance.relative + tolerance.absolute;
  if (metric.direction === 'higher-is-better') {
    if (after.value < before.value - slack) row.verdict = 'regressed';
    else if (after.value > before.value + slack) row.verdict = 'improved';
  } else if (metric.direction === 'lower-is-better') {
    if (after.value > before.value + slack) row.verdict = 'regressed';
    else if (after.value < before.value - slack) row.verdict = 'improved';
  } else {
    row.verdict = 'absent';
    row.detail = `unknown direction "${metric.direction}" — expected lower-is-better or higher-is-better`;
    return row;
  }

  row.detail = `${before.value} -> ${after.value} (tolerance ±${+slack.toFixed(6)})`;
  return row;
}

/**
 * Is this current report the same measurement as the baseline it is being compared against?
 *
 * Checked on the two fields a copied report cannot help but reproduce. Deliberately not a
 * digest of the whole report: two genuinely separate runs differ somewhere, so a whole-report
 * digest would never catch the case where someone re-recorded the baseline from the run being
 * judged, which is the actual mistake.
 */
export function isSelfComparison(baselineRound, currentReport) {
  const recorded = baselineRound?.source || {};
  if (recorded.checkedAt && currentReport?.checkedAt && recorded.checkedAt === currentReport.checkedAt) {
    return `the baseline was recorded from a run with the same checkedAt (${recorded.checkedAt}) — this round is being compared against itself`;
  }
  return '';
}

/**
 * @param {object} options
 * @param {object|null} options.baseline  the recorded baseline round (see `acceptRound`), or null
 * @param {object} options.current        a phone-harness report.json
 * @param {Array} options.metrics         metric declarations
 * @returns {{verdict: string, comparable: boolean, reasons: string[], metrics: object[], regressions: object[], summary: string}}
 */
export function compareRounds({ baseline, current, metrics = SUGGESTED_METRICS } = {}) {
  const reasons = [];
  const result = {
    verdict: 'incomparable',
    comparable: false,
    reasons,
    metrics: [],
    regressions: [],
    summary: '',
  };

  if (!current || typeof current !== 'object') {
    reasons.push('no current round report was supplied');
    result.summary = reasons[0];
    return result;
  }

  // Refusal 4: a run that failed its own checks did not necessarily reach the steps whose
  // timings it reports.
  if (current.status && current.status !== 'passed') {
    reasons.push(`the current round reports status="${current.status}" — its numbers are not a measurement of a working build`);
  }

  if (!baseline) {
    reasons.push('no baseline round is recorded yet — run with --accept on a round you trust to establish one');
    result.metrics = metrics.map((m) => compareMetric(m, {}, current));
    result.summary = reasons[reasons.length - 1];
    return result;
  }

  // Refusal 1.
  const self = isSelfComparison(baseline, current);
  if (self) reasons.push(self);

  // Refusal 5: the apparatus changed underneath the comparison.
  //
  // Not hypothetical. These harnesses accept a `chromium` surrogate when WebKit is
  // unavailable, and the two are nowhere near each other: the same build, same machine, same
  // scene measured a 1333 ms median frame gap under headless Chromium's software rasteriser.
  // A baseline recorded on one browser and judged on the other produces a confident verdict
  // about nothing. The same applies to portrait/landscape, which is what `target` carries.
  for (const [field, label] of [['browser', 'browser'], ['target', 'device surface']]) {
    const before = baseline?.source?.[field];
    const after = current?.[field];
    if (before && after && before !== after) {
      reasons.push(`the ${label} changed since the baseline was recorded (${before} -> ${after}) — these are not the same apparatus, so the numbers are not comparable`);
    }
  }

  const baselineReport = baseline.metrics ? unflatten(baseline.metrics) : baseline.report || {};
  result.metrics = metrics.map((m) => compareMetric(m, baselineReport, current));

  // Refusal 2.
  const lost = result.metrics.filter((row) => row.verdict === 'lost');
  for (const row of lost) reasons.push(`metric ${row.key} disappeared: ${row.detail}`);

  const missingRequired = result.metrics.filter((row) => {
    const declared = metrics.find((m) => m.key === row.key);
    return declared?.required && (row.verdict === 'absent' || row.current === null);
  });
  for (const row of missingRequired) reasons.push(`required metric ${row.key} (${row.path}) is absent from this round`);

  // Refusal 2b: a comparison in which nothing was compared. A repo whose harness emits no
  // numbers at all reaches this with every metric `absent`, no regressions, and — without
  // this — a clean pass. That is the vacuous verdict this whole module exists to refuse.
  const compared = result.metrics.filter((row) => row.baseline !== null && row.current !== null);
  if (compared.length === 0) {
    reasons.push(
      `not one of the ${metrics.length} declared metric(s) could be compared — the harness emits no `
      + 'number this config names, so a pass here would mean nothing',
    );
  }

  // Refusal 3.
  if (compared.length >= 2 && compared.every((row) => row.delta === 0)) {
    reasons.push(
      `all ${compared.length} compared metrics are byte-identical to the baseline — two real runs do not `
      + 'reproduce timings exactly, so this is a copied report rather than a new measurement',
    );
  }

  result.regressions = result.metrics.filter((row) => row.verdict === 'regressed');

  if (reasons.length) {
    result.verdict = 'incomparable';
    result.summary = `INCOMPARABLE: ${reasons.length} reason(s); ${compared.length} metric(s) had a baseline to compare against`;
    return result;
  }

  result.comparable = true;
  result.verdict = result.regressions.length ? 'regressed' : 'pass';
  const improved = result.metrics.filter((row) => row.verdict === 'improved').length;
  result.summary = result.regressions.length
    ? `REGRESSED: ${result.regressions.map((row) => `${row.key} ${row.detail}`).join('; ')}`
    : `PASS: ${compared.length} metric(s) compared, ${improved} improved, none worse than the recorded round`;
  return result;
}

/** `{'timings.bootMs': 900}` -> `{timings: {bootMs: 900}}`, so a recorded round reads like a report. */
function unflatten(flat) {
  const out = {};
  for (const [path, value] of Object.entries(flat || {})) {
    const parts = path.split('.');
    let node = out;
    for (const part of parts.slice(0, -1)) {
      if (typeof node[part] !== 'object' || node[part] === null) node[part] = {};
      node = node[part];
    }
    node[parts.at(-1)] = value;
  }
  return out;
}

/**
 * Turn a report into the baseline record to write to disk.
 *
 * Flat metric paths rather than the whole report: a baseline file is a record of the numbers
 * a future round is judged against, and carrying the entire report invites someone to diff
 * fields nobody declared as a criterion. `source` is the provenance that makes refusal 1
 * possible.
 *
 * @throws if the report did not pass — a broken round must not become the bar.
 */
export function acceptRound(current, { metrics = SUGGESTED_METRICS, provenance = {} } = {}) {
  if (!current || typeof current !== 'object') throw new Error('cannot accept an empty report as a baseline round');
  if (current.status && current.status !== 'passed') {
    throw new Error(`refusing to record a baseline from a round with status="${current.status}" — fix the round first`);
  }
  const recorded = {};
  const skipped = [];
  for (const metric of metrics) {
    const read = readMetric(current, metric.path);
    if (read.present) recorded[metric.path] = read.value;
    else skipped.push(metric.path);
  }
  if (Object.keys(recorded).length === 0) {
    throw new Error(`refusing to record an empty baseline round — none of ${metrics.length} declared metric path(s) was present in the report`);
  }
  return {
    schemaVersion: 1,
    source: {
      checkedAt: current.checkedAt || null,
      target: current.target || null,
      browser: current.browser || null,
      status: current.status || null,
      ...provenance,
    },
    // Named out loud rather than omitted: a path that is silently absent from the baseline is
    // a comparison nobody will notice is not happening.
    notMeasured: skipped,
    metrics: recorded,
  };
}

/**
 * Must-fail scenarios plus a must-pass control, for `lib/state/selftest.mjs`.
 *
 * The control is not decoration. Every refusal above widens the set of inputs this gate
 * rejects, and a gate that rejects a healthy round is switched off within a week.
 */
export function selfTestCases() {
  const good = {
    status: 'passed',
    checkedAt: '2026-08-02T00:00:00.000Z',
    browser: 'webkit',
    target: 'iPhone SE (3rd gen) landscape',
    timings: { bootMs: 900 },
    soak: { p95FrameGapMs: 18, samples: 120 },
  };
  const baseline = acceptRound(good, { provenance: { revision: 'baseline' } });
  const metrics = SUGGESTED_METRICS;
  const fired = (result) => (result.verdict === 'pass' ? [] : [result.summary]);

  return [
    {
      name: 'a slower boot beyond tolerance is reported as a regression',
      evaluate: () => fired(compareRounds({
        baseline,
        current: { ...good, checkedAt: '2026-08-02T01:00:00.000Z', timings: { bootMs: 2400 } },
        metrics,
      })),
    },
    {
      name: 'a worse p95 frame gap beyond tolerance is reported as a regression',
      evaluate: () => fired(compareRounds({
        baseline,
        current: { ...good, checkedAt: '2026-08-02T01:00:00.000Z', soak: { p95FrameGapMs: 39, samples: 120 } },
        metrics,
      })),
    },
    {
      name: 'a metric the baseline has and this round lost is refused, not passed',
      evaluate: () => fired(compareRounds({
        baseline,
        current: { status: 'passed', checkedAt: '2026-08-02T01:00:00.000Z', soak: { p95FrameGapMs: 18, samples: 120 } },
        metrics,
      })),
    },
    {
      name: 'a round compared against itself is refused',
      evaluate: () => fired(compareRounds({ baseline, current: good, metrics })),
    },
    {
      name: 'a round whose every metric is byte-identical is refused as a copied report',
      evaluate: () => fired(compareRounds({
        baseline,
        current: { ...good, checkedAt: '2026-08-02T02:00:00.000Z' },
        metrics,
      })),
    },
    {
      name: 'a failed round is not compared',
      evaluate: () => fired(compareRounds({
        baseline,
        current: { ...good, status: 'failed', checkedAt: '2026-08-02T01:00:00.000Z', timings: { bootMs: 950 } },
        metrics,
      })),
    },
    {
      name: 'a failed round is refused as a baseline',
      evaluate: () => {
        try {
          acceptRound({ ...good, status: 'failed' });
          return ['acceptRound accepted a failed round'];
        } catch { return ['refused']; }
      },
    },
    {
      name: 'a round measured on a different browser than the baseline is refused',
      evaluate: () => fired(compareRounds({
        baseline,
        current: { ...good, checkedAt: '2026-08-02T01:00:00.000Z', browser: 'chromium', timings: { bootMs: 11854 } },
        metrics,
      })),
    },
    {
      name: 'a round measured on a different device surface than the baseline is refused',
      evaluate: () => fired(compareRounds({
        baseline,
        current: { ...good, checkedAt: '2026-08-02T01:00:00.000Z', target: 'iPhone SE (3rd gen) portrait', timings: { bootMs: 950 } },
        metrics,
      })),
    },
    {
      name: 'a round in which nothing could be compared is refused, not passed',
      evaluate: () => fired(compareRounds({
        baseline,
        current: { status: 'passed', checkedAt: '2026-08-02T01:00:00.000Z' },
        // A config naming only metrics this harness does not emit — the vacuous-pass shape.
        metrics: [{ key: 'unmeasured', path: 'nothing.here', direction: 'lower-is-better', required: false }],
      })),
    },
    {
      // The control. Movement inside tolerance, in both directions, on a real second run.
      name: 'a healthy round that moved slightly is not reported as a regression',
      shouldFire: false,
      evaluate: () => fired(compareRounds({
        baseline,
        current: {
          status: 'passed',
          checkedAt: '2026-08-02T01:00:00.000Z',
          timings: { bootMs: 964 },
          soak: { p95FrameGapMs: 17.2, samples: 118 },
        },
        metrics,
      })),
    },
  ];
}
