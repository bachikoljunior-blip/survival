#!/usr/bin/env node
/**
 * Per-frame distribution for the vantage sweep.
 *
 * The sweep is **not** deterministic: two runs of the unmodified harness against one
 * byte-identical `dist/` differ on 11 of 18 frames. So a single before/after pair says
 * nothing, and the record already refuses to judge the `launchHeadless` swap without this
 * measurement first.
 *
 * What a frame-level "11 of 18 differ" hides is *which* numbers move. A frame is eleven
 * numbers — nine luma columns plus draws and triangles. If one column wobbles and the other
 * ten repeat exactly, ten cells still carry signal. This tool builds the distribution **per
 * cell**, so a later comparison can say which cells a change is allowed to be judged on and
 * which are already noise.
 *
 *   node tools/vantage_distribution.mjs --runs 4 --label base
 *   node tools/vantage_distribution.mjs --report                   # summarise what exists
 *   node tools/vantage_distribution.mjs --report --candidate swap  # judge a label vs base
 *   node tools/vantage_distribution.mjs --selftest                 # no browser, no ledger
 *
 * Samples append to `shots/vantage-distribution.jsonl` so an interrupted collection keeps
 * everything it already paid for. `shots/` is gitignored, so copy the JSONL out before
 * quoting a number from it.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'shots');
const LEDGER = join(OUT, 'vantage-distribution.jsonl');

const { lumaStats, COLUMNS } = await import(join(ROOT, 'tools/lumastats.mjs'));

/** Every numeric cell a frame contributes. draws/tris ride along because they drift too. */
export const CELLS = [...COLUMNS, 'draws', 'tris'];

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (k) => argv.includes('--' + k);

// --- collection -----------------------------------------------------------------------

/**
 * Content hash of `dist/`, so a build that lands mid-collection cannot be averaged into the
 * noise floor and reported as noise. Every sample records it and the report refuses to mix.
 */
function hashDist() {
  const files = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(path);
    }
  })(DIST);
  const h = createHash('sha256');
  for (const f of files) {
    h.update(f.slice(DIST.length));
    h.update(readFileSync(f));
  }
  return h.digest('hex').slice(0, 12);
}

function readLedger() {
  if (!existsSync(LEDGER)) return [];
  return readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

/** One sweep, measured. Returns the sample rows; throws if `dist/` moved under it. */
function collectRun(label, run) {
  const before = hashDist();
  const prefix = `d-${label}-${run}`;

  execFileSync(process.execPath, [join(ROOT, 'tools/vantage.mjs'), '--prefix', prefix], {
    cwd: ROOT, stdio: 'inherit',
  });

  const after = hashDist();
  if (before !== after) {
    throw new Error(`dist/ changed during run ${label}#${run} (${before} -> ${after}). ` +
      'Never build while a sweep is in flight; this sample is void.');
  }

  const meta = JSON.parse(readFileSync(join(OUT, `${prefix}-vantages.json`), 'utf8'));
  const rows = [];
  for (const { name, draws, tris } of meta.results) {
    const png = join(OUT, `${prefix}-${name}.png`);
    rows.push({ label, run, dist: before, frame: name, ...lumaStats(png), draws, tris });
  }
  return rows;
}

// --- analysis (pure: no fs, no console, so --selftest can drive it) ---------------------

/** Group samples into `frame -> cell -> [values]`. */
function distribution(samples) {
  const byFrame = new Map();
  for (const s of samples) {
    if (!byFrame.has(s.frame)) byFrame.set(s.frame, new Map(CELLS.map((c) => [c, []])));
    for (const c of CELLS) byFrame.get(s.frame).get(c).push(s[c]);
  }
  return byFrame;
}

const pinned = (values) => values.length > 0 && Math.max(...values) === Math.min(...values);

/**
 * @returns {{refused?: string} | {
 *   runs: number, stable: number, unstable: number, moving: Array,
 *   holdout?: {k: number, pinned: number, violated: number, rows: Array},
 *   candidate?: {inside: number, outside: number, untestable: number, rows: Array},
 * }}
 */
export function analyse(samples, { baseLabel = 'base', candidateLabel = null, holdout } = {}) {
  if (!samples.length) return { refused: 'no samples yet — run with --runs N first' };

  const dists = new Set(samples.map((s) => s.dist));
  if (dists.size > 1) {
    return { refused: `samples span ${dists.size} different dist/ hashes (${[...dists].join(', ')}). ` +
      'A noise floor measured across two builds is not a noise floor. Re-collect.' };
  }

  const base = samples.filter((s) => s.label === baseLabel);
  const runs = new Set(base.map((s) => s.run)).size;
  if (runs < 2) return { refused: `baseline "${baseLabel}" has ${runs} run(s); a range needs at least 2` };

  const baseDist = distribution(base);
  const out = { runs, dist: [...dists][0], frames: baseDist.size, stable: 0, unstable: 0, moving: [] };

  for (const [frame, cells] of baseDist) {
    const moving = [];
    for (const c of CELLS) {
      const vals = cells.get(c);
      if (pinned(vals)) out.stable++;
      else { out.unstable++; moving.push({ cell: c, values: vals }); }
    }
    if (moving.length) out.moving.push({ frame, moving });
  }

  // --- the control on the control -------------------------------------------------------
  // "This cell repeated N times, so it is pinned" is an induction, and N is small. Pin the
  // set from the first K sweeps, then check the remaining base sweeps against it. Any
  // violation is the baseline failing its own test, which means N is too small and every
  // candidate difference below is unreadable. Without this a 2-sweep baseline would happily
  // declare 198 cells pinned and then blame the harness swap for its own drift.
  const k = Number(holdout ?? Math.max(2, runs - 1));
  if (runs > k) {
    const early = distribution(base.filter((s) => s.run <= k));
    const late = base.filter((s) => s.run > k);
    const h = { k, pinned: 0, violated: 0, rows: [] };
    for (const [frame, cells] of early) {
      for (const c of CELLS) {
        const v = cells.get(c);
        if (!pinned(v)) continue;
        h.pinned++;
        const off = late.filter((s) => s.frame === frame && s[c] !== v[0]);
        if (off.length) { h.violated++; h.rows.push({ frame, cell: c, expected: v[0], got: off.map((s) => s[c]) }); }
      }
    }
    out.holdout = h;
  }

  if (candidateLabel) {
    const cand = samples.filter((s) => s.label === candidateLabel);
    if (!cand.length) { out.candidate = { missing: candidateLabel }; return out; }
    const candDist = distribution(cand);
    const c0 = { runs: new Set(cand.map((s) => s.run)).size, inside: 0, outside: 0, untestable: 0, rows: [] };
    for (const [frame, cells] of candDist) {
      const baseCells = baseDist.get(frame);
      if (!baseCells) { c0.rows.push({ frame, cell: '*', note: 'absent from baseline' }); continue; }
      for (const c of CELLS) {
        const b = baseCells.get(c);
        const vals = cells.get(c);
        // A cell the rig could not hold still cannot judge anything. Counting it either way
        // would be the failure this whole tool exists to prevent.
        if (!pinned(b)) { c0.untestable++; continue; }
        const off = vals.filter((v) => v !== b[0]);
        if (off.length) { c0.outside++; c0.rows.push({ frame, cell: c, expected: b[0], got: vals }); }
        else c0.inside++;
      }
    }
    out.candidate = c0;
  }
  return out;
}

// --- formatting -------------------------------------------------------------------------

const fmtSet = (values) => {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] - b[0])
    .map(([v, n]) => (n > 1 ? `${v}x${n}` : `${v}`)).join(',');
};

export function formatReport(r, baseLabel = 'base', candidateLabel = null) {
  if (r.refused) return `REFUSING: ${r.refused}`;
  const L = [];
  L.push(`\nbaseline "${baseLabel}": ${r.runs} sweeps, one dist/ (${r.dist}), ` +
    `${r.frames} frames x ${CELLS.length} cells = ${r.frames * CELLS.length} cells\n`);
  L.push(`  cells identical across all ${r.runs} sweeps : ${r.stable}`);
  L.push(`  cells that move on their own            : ${r.unstable}`);
  L.push('\n  where the rig moves by itself — these cells cannot judge any change:');
  if (!r.moving.length) L.push('    (none — every cell repeated exactly)');
  for (const { frame, moving } of r.moving) {
    L.push(`    ${frame.padEnd(14)} ${moving.map((m) => `${m.cell}={${fmtSet(m.values)}}`).join('  ')}`);
  }

  if (r.holdout) {
    const h = r.holdout;
    L.push(`\n  holdout control — pin from the first ${h.k} sweeps, test on the remaining ${r.runs - h.k}:`);
    L.push(`    cells the first ${h.k} called pinned      : ${h.pinned}`);
    L.push(`    of those, later sweeps contradicted : ${h.violated}` +
      (h.violated ? '  <-- the baseline fails its own test; N is too small' : '  (the pinned set held)'));
    for (const row of h.rows) {
      L.push(`      ${row.frame.padEnd(14)} ${row.cell.padEnd(6)} first ${h.k} said ${row.expected}, later ${fmtSet(row.got)}`);
    }
  }

  if (r.candidate) {
    const c = r.candidate;
    if (c.missing) { L.push(`\nno samples for candidate "${c.missing}"`); return L.join('\n'); }
    L.push(`\ncandidate "${candidateLabel}": ${c.runs} sweeps\n`);
    L.push(`  cells the baseline pinned, candidate agrees   : ${c.inside}`);
    L.push(`  cells the baseline pinned, candidate DIFFERS  : ${c.outside}`);
    L.push(`  cells the baseline could not pin (untestable) : ${c.untestable}`);
    if (c.outside) {
      L.push('\n  differences on cells the rig holds still — this is signal, not drift:');
      for (const row of c.rows) {
        L.push(`    ${row.frame.padEnd(14)} ${String(row.cell).padEnd(6)} base=${row.expected} candidate={${fmtSet(row.got)}}`);
      }
    }
  }
  return L.join('\n');
}

// --- self-test ---------------------------------------------------------------------------
// Every validator in this repository has one, and the reason is in the record: three real
// defects here were found by a control and none by reading the code. A reporter that has
// never been watched producing a verdict is indistinguishable from an inert one.

function selftest() {
  let pass = 0, fail = 0;
  // Thunks, not values, and every one caught. An assertion that dereferences a field the
  // previous failure just emptied would otherwise throw and take the rest of the suite with
  // it — and a suite that dies partway reports fewer failures than it found, which is how a
  // review round in this repository lost two of its three lenses.
  const check = (name, fn) => {
    let ok;
    try { ok = !!fn(); } catch (e) { ok = false; name += `  (threw: ${e.message})`; }
    if (ok) { pass++; console.log(`  ok    ${name}`); } else { fail++; console.log(`  FAIL  ${name}`); }
  };

  /** A sample with every cell pinned at a known value, overridable per call. */
  const S = (label, run, frame, over = {}) => ({
    label, run, dist: 'aaaaaaaaaaaa', frame,
    ...Object.fromEntries(CELLS.map((c) => [c, 100])), ...over,
  });

  // Baseline: two frames. `alpha` is pinned everywhere. `beta` has one column that wobbles.
  const base = [
    S('base', 1, 'alpha'), S('base', 2, 'alpha'), S('base', 3, 'alpha'),
    S('base', 1, 'beta'), S('base', 2, 'beta', { p50: 101 }), S('base', 3, 'beta'),
  ];

  const r = analyse(base, { holdout: 3 });
  check('pinned cells counted', () => r.stable === CELLS.length * 2 - 1);
  check('the one wobbling cell is counted as moving', () => r.unstable === 1);
  check('the moving cell is named', () => r.moving.length === 1 && r.moving[0].frame === 'beta' && r.moving[0].moving[0].cell === 'p50');

  // A candidate that differs on a cell the baseline PINNED must be reported.
  const candBad = [S('cand', 1, 'alpha', { p95: 7 }), S('cand', 1, 'beta')];
  const rb = analyse([...base, ...candBad], { candidateLabel: 'cand', holdout: 3 });
  check('difference on a pinned cell is reported', () => rb.candidate.outside === 1);
  check('and it names frame+cell+values', () => rb.candidate.rows[0].frame === 'alpha' &&
    rb.candidate.rows[0].cell === 'p95' && rb.candidate.rows[0].expected === 100 && rb.candidate.rows[0].got[0] === 7);

  // THE CONTROL THAT MUST NOT FIRE. A candidate differing only on the cell the rig itself
  // could not hold still is drift, not signal. A tool that flags this is as useless as one
  // that flags nothing — it would have blamed the harness swap for the rig's own noise.
  const candDrift = [S('cand', 1, 'alpha'), S('cand', 1, 'beta', { p50: 999 })];
  const rd = analyse([...base, ...candDrift], { candidateLabel: 'cand', holdout: 3 });
  check('CONTROL: difference on an unpinned cell is NOT reported', () => rd.candidate.outside === 0);
  check('CONTROL: and it is counted as untestable instead', () => rd.candidate.untestable === 1);

  // Holdout: pin from run 1 only, then let run 2 contradict it.
  const rh = analyse(base, { holdout: 1 });
  check('holdout catches a pin that later sweeps contradict', () => rh.holdout.violated === 1);
  check('holdout names the contradicted cell', () => rh.holdout.rows[0].frame === 'beta' && rh.holdout.rows[0].cell === 'p50');
  const rh2 = analyse(base, { holdout: 2 });
  check('CONTROL: holdout does not fire when the pinned set holds', () => rh2.holdout.violated === 0);

  // Refusals.
  check('refuses a single-run baseline', () => !!analyse([S('base', 1, 'alpha')]).refused);
  check('refuses samples spanning two dist hashes',
    () => !!analyse([S('base', 1, 'alpha'), { ...S('base', 2, 'alpha'), dist: 'bbbbbbbbbbbb' }]).refused);
  check('refuses an empty ledger', () => !!analyse([]).refused);

  // A candidate label with no samples must say so rather than print a perfect score.
  const rm = analyse(base, { candidateLabel: 'nothing', holdout: 3 });
  check('missing candidate is reported, not scored', () => rm.candidate.missing === 'nothing');

  // The formatter must survive every shape above.
  check('formatter runs on a refusal', () => formatReport(analyse([])).startsWith('REFUSING'));
  check('formatter runs on a full report', () => formatReport(rb, 'base', 'cand').includes('candidate DIFFERS  : 1'));

  console.log(`\n  ${pass} passed, ${fail} failed`);
  return fail ? 1 : 0;
}

// --- CLI ----------------------------------------------------------------------------------
if (has('selftest')) {
  console.log('vantage_distribution --selftest');
  process.exit(selftest());
}

if (has('report')) {
  const baseLabel = arg('base', 'base');
  const candidateLabel = arg('candidate', null);
  const holdoutArg = arg('holdout', null);
  const r = analyse(readLedger(), { baseLabel, candidateLabel, holdout: holdoutArg ? Number(holdoutArg) : undefined });
  console.log(formatReport(r, baseLabel, candidateLabel));
  process.exit(r.refused || r.candidate?.outside || r.holdout?.violated ? 1 : 0);
}

const runs = Number(arg('runs', 0));
if (!runs) {
  console.log('usage: --runs N [--label base] | --report [--candidate LABEL] [--base LABEL] [--holdout K] | --selftest');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const label = arg('label', 'base');
const existing = readLedger().filter((s) => s.label === label);
let next = existing.length ? Math.max(...existing.map((s) => s.run)) + 1 : 1;

for (let i = 0; i < runs; i++, next++) {
  console.log(`\n=== ${label} sweep #${next} (${i + 1} of ${runs}) ===`);
  const rows = collectRun(label, next);
  appendFileSync(LEDGER, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`  recorded ${rows.length} frames`);
}
console.log(`\nappended to ${LEDGER}. Run --report to summarise.`);
