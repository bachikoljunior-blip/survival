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
 * The baseline's tolerance band for one cell: the closed interval it was actually observed
 * in. A candidate value inside the band is indistinguishable from the rig's own drift.
 *
 * This replaced a stricter test that only judged cells whose baseline range was exactly
 * zero, and the reason is measured, not stylistic. Over four sweeps 118 of 198 cells had
 * range 0 — but the holdout control then showed 37 of the 155 cells that the first three
 * sweeps called pinned being contradicted by the fourth. "It repeated three times" is a weak
 * induction, and acting on it would have manufactured 37 differences that are pure drift.
 * A band degrades gracefully instead of discarding the 80 cells that move at all, and the
 * holdout below calibrates how often the band itself is wrong.
 */
const band = (values) => ({ lo: Math.min(...values), hi: Math.max(...values) });

/**
 * The null distributions. Without these a candidate's out-of-band count is a bare number
 * with nothing to be surprised against: the band is not tight enough to make "any deviation
 * is signal" true — measured, the rig puts a few cells outside their own leave-one-out band
 * on nearly every sweep. So the question is never "did any cell move" but "did more move,
 * or move more persistently, than the rig does to itself".
 *
 * NULL 1, per-sweep: hold each baseline sweep out, rebuild the band from the rest, and count
 * how many of its cells land outside. That is what noise alone produces per sweep.
 *
 * NULL 2, persistence: split the baseline in half, build the band from the first half, and
 * count cells outside in EVERY sweep of the second half. Independent noise rarely hits the
 * same cell every time, so this is the sensitive statistic — a real change moves the same
 * cells in the same direction on every run, and can be caught well below the per-sweep noise.
 */
/** Luma columns only. draws/tris are counts on a different scale and a different process. */
const LUMA = COLUMNS;

const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2; };

/** `frame|cell -> median` over the given rows, luma columns only. */
function medians(rows) {
  const m = new Map();
  for (const s of rows) for (const c of LUMA) {
    const k = `${s.frame}|${c}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(s[c]);
  }
  const out = new Map();
  for (const [k, v] of m) out.set(k, median(v));
  return out;
}

/**
 * Sign test: how many cells' medians moved down versus up.
 *
 * This exists because the band tests are not sensitive to a small uniform shift. A change
 * that darkens every frame by less than the rig's own per-cell jitter puts no single cell
 * persistently outside its band, and both band statistics report "indistinguishable" — but
 * the DIRECTION of the movement is not noise, and 31 cells down against 11 up is not what a
 * symmetric jitter produces. Measured: this is the only statistic here that separated the
 * launchHeadless arm from the baseline, and both band tests missed it.
 */
/** Net movement of every cell median, summed. Direction and size, where signTest is only direction. */
function shiftSum(aRows, bRows) {
  const a = medians(aRows), b = medians(bRows);
  let sum = 0;
  for (const [k, av] of a) if (b.has(k)) sum += b.get(k) - av;
  return sum;
}

function signTest(aRows, bRows) {
  const a = medians(aRows), b = medians(bRows);
  let down = 0, up = 0, same = 0;
  for (const [k, av] of a) {
    if (!b.has(k)) continue;
    const d = b.get(k) - av;
    if (d < 0) down++; else if (d > 0) up++; else same++;
  }
  return { down, up, same, asym: Math.abs(down - up) };
}

/** Lexicographic k-subsets of `arr`, capped so a large baseline cannot explode. */
function subsets(arr, k, cap = 400) {
  const out = [];
  const rec = (start, acc) => {
    if (out.length >= cap) return;
    if (acc.length === k) { out.push([...acc]); return; }
    for (let i = start; i < arr.length; i++) { acc.push(arr[i]); rec(i + 1, acc); acc.pop(); if (out.length >= cap) return; }
  };
  rec(0, []);
  return out;
}

function nullDistributions(base) {
  const runs = [...new Set(base.map((s) => s.run))].sort((a, b) => a - b);
  const bandsOf = (rows) => {
    const d = distribution(rows), out = new Map();
    for (const [frame, cells] of d) for (const c of CELLS) out.set(`${frame}|${c}`, band(cells.get(c)));
    return out;
  };
  const outside = (bands, rows) => {
    const per = new Map();
    for (const s of rows) for (const c of CELLS) {
      const b = bands.get(`${s.frame}|${c}`);
      if (b && (s[c] < b.lo || s[c] > b.hi)) per.set(`${s.frame}|${c}`, (per.get(`${s.frame}|${c}`) || 0) + 1);
    }
    return per;
  };

  const perSweep = runs.map((held) => {
    const rest = base.filter((s) => s.run !== held);
    if (!rest.length) return 0;
    let n = 0;
    for (const [, v] of outside(bandsOf(rest), base.filter((s) => s.run === held))) n += v;
    return n;
  });

  const half = Math.floor(runs.length / 2);
  let persistent = null;
  if (half >= 2) {
    const first = base.filter((s) => runs.indexOf(s.run) < half);
    const second = base.filter((s) => runs.indexOf(s.run) >= half);
    const nSecond = new Set(second.map((s) => s.run)).size;
    const per = outside(bandsOf(first), second);
    persistent = { splitAt: half, of: nSecond, count: [...per.values()].filter((n) => n === nSecond).length,
      cells: [...per.entries()].filter(([, n]) => n === nSecond).map(([k]) => k) };
  }
  return { perSweep, lo: Math.min(...perSweep), hi: Math.max(...perSweep), persistent, runs };
}

/**
 * The null for the sign test and for the unique-cells-outside count, both computed the way
 * the candidate is computed: split the baseline into a group the size of the candidate arm
 * and its complement, and run the same comparison. Matching the unit matters — an earlier
 * pass compared the candidate's unique-cells-over-4-sweeps against a PER-SWEEP null and made
 * the candidate look ordinary by dividing by four.
 */
function splitNull(base, m) {
  const runs = [...new Set(base.map((s) => s.run))].sort((a, b) => a - b);
  if (runs.length < m + 2) return null;
  const asym = [], uniq = [];
  for (const A of subsets(runs, m)) {
    const B = runs.filter((r) => !A.includes(r));
    if (!B.length) continue;
    const aRows = base.filter((s) => B.includes(s.run));   // the "baseline" side
    const bRows = base.filter((s) => A.includes(s.run));   // the "candidate" side
    asym.push(signTest(aRows, bRows).asym);

    const d = distribution(aRows), bands = new Map();
    for (const [frame, cells] of d) for (const c of CELLS) bands.set(`${frame}|${c}`, band(cells.get(c)));
    const set = new Set();
    for (const s of bRows) for (const c of CELLS) {
      const bb = bands.get(`${s.frame}|${c}`);
      if (bb && (s[c] < bb.lo || s[c] > bb.hi)) set.add(`${s.frame}|${c}`);
    }
    uniq.push(set.size);
  }
  const q = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
  return {
    splits: asym.length, m,
    asym: { min: Math.min(...asym), med: q(asym, 0.5), p90: q(asym, 0.9), max: Math.max(...asym), all: asym },
    uniq: { min: Math.min(...uniq), med: q(uniq, 0.5), p90: q(uniq, 0.9), max: Math.max(...uniq), all: uniq },
  };
}

/**
 * @returns {{refused?: string} | {
 *   runs: number, stable: number, unstable: number, moving: Array,
 *   holdout?: {k: number, pinned: number, violated: number, rows: Array},
 *   candidate?: {inside: number, outside: number, untestable: number, rows: Array},
 * }}
 */
export function analyse(samples, { baseLabel = 'base', candidateLabel = null, controlLabel = null, holdout } = {}) {
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
  out.nulls = nullDistributions(base);

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
    const h = { k, pinned: 0, pinnedViolated: 0, cells: 0, violated: 0, rows: [] };
    for (const [frame, cells] of early) {
      for (const c of CELLS) {
        const v = cells.get(c);
        const b = band(v);
        const lateVals = late.filter((s) => s.frame === frame).map((s) => s[c]);
        if (!lateVals.length) continue;

        // The strict test, kept only as a diagnostic: how unreliable is "range 0 means pinned"?
        if (pinned(v)) { h.pinned++; if (lateVals.some((x) => x !== v[0])) h.pinnedViolated++; }

        // The test that actually gates a verdict: does a held-out BASELINE run fall outside
        // the band built from earlier baseline runs? Every one of those is a false positive
        // the band would have reported against an innocent candidate.
        h.cells++;
        const off = lateVals.filter((x) => x < b.lo || x > b.hi);
        if (off.length) {
          h.violated++;
          const worst = off.reduce((a, x) => Math.max(a, x < b.lo ? b.lo - x : x - b.hi), 0);
          h.rows.push({ frame, cell: c, band: b, got: off, by: worst });
        }
      }
    }
    out.holdout = h;
  }

  if (candidateLabel) {
    const cand = samples.filter((s) => s.label === candidateLabel);
    if (!cand.length) { out.candidate = { missing: candidateLabel }; return out; }
    const candDist = distribution(cand);
    const c0 = { runs: new Set(cand.map((s) => s.run)).size, inside: 0, outside: 0, persistent: 0, rows: [] };
    for (const [frame, cells] of candDist) {
      const baseCells = baseDist.get(frame);
      if (!baseCells) { c0.rows.push({ frame, cell: '*', note: 'absent from baseline' }); continue; }
      for (const c of CELLS) {
        const b = band(baseCells.get(c));
        const vals = cells.get(c);
        const off = vals.filter((v) => v < b.lo || v > b.hi);
        if (off.length) {
          c0.outside++;
          const worst = off.reduce((a, v) => Math.max(a, v < b.lo ? b.lo - v : v - b.hi), 0);
          const every = off.length === vals.length;
          if (every) c0.persistent++;
          c0.rows.push({ frame, cell: c, band: b, got: vals, by: worst, every });
        } else c0.inside++;
      }
    }
    // The two statistics that actually decide, both matched to how the candidate is measured.
    c0.uniqueOutside = new Set(c0.rows.filter((r) => r.cell !== '*').map((r) => `${r.frame}|${r.cell}`)).size;
    c0.sign = signTest(base, cand);
    c0.null = splitNull(base, c0.runs);
    c0.shiftSum = shiftSum(base, cand);
    if (controlLabel) {
      const ctl = samples.filter((s) => s.label === controlLabel);
      if (ctl.length) {
        const cs = signTest(base, ctl);
        c0.control = { label: controlLabel, sum: shiftSum(base, ctl), down: cs.down, up: cs.up, asym: cs.asym };
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
    L.push(`\n  holdout control — build from the first ${h.k} sweeps, test on the remaining ${r.runs - h.k}:`);
    L.push(`    strict "range 0 == pinned" cells        : ${h.pinned}, of which later sweeps contradicted ${h.pinnedViolated}` +
      (h.pinnedViolated ? '  <-- why the verdict uses a band, not this' : ''));
    L.push(`    band cells tested                       : ${h.cells}`);
    L.push(`    band FALSE POSITIVES (a held-out BASELINE run outside its own band) : ${h.violated}` +
      (h.violated ? '  <-- the band is not yet trustworthy; collect more sweeps' : '  (the band held — a difference below is readable)'));
    for (const row of h.rows) {
      L.push(`      ${row.frame.padEnd(14)} ${row.cell.padEnd(6)} band [${row.band.lo},${row.band.hi}] got ${fmtSet(row.got)} (out by ${row.by})`);
    }
  }

  if (r.candidate) {
    const c = r.candidate;
    if (c.missing) { L.push(`\nno samples for candidate "${c.missing}"`); return L.join('\n'); }
    L.push(`\ncandidate "${candidateLabel}": ${c.runs} sweeps\n`);
    const n = r.nulls;
    L.push(`  cells inside the baseline's observed band  : ${c.inside}`);
    L.push(`  cells OUTSIDE it                           : ${c.outside}`);
    L.push(`  of those, outside on EVERY candidate sweep : ${c.persistent}`);
    L.push('');
    L.push(`  null 1 — the rig's own per-sweep out-of-band count, leave-one-out over ${r.runs} baseline sweeps:`);
    L.push(`      {${n.perSweep.join(', ')}}  range ${n.lo}-${n.hi}, mean ${(n.perSweep.reduce((a, b) => a + b, 0) / n.perSweep.length).toFixed(1)}`);
    L.push(`      candidate averages ${(c.outside / c.runs).toFixed(1)} per sweep`);
    if (n.persistent) {
      L.push(`  null 2 — cells the rig itself puts outside on ALL ${n.persistent.of} sweeps of a split-half baseline: ${n.persistent.count}` +
        (n.persistent.cells.length ? `  (${n.persistent.cells.join(', ')})` : ''));
    }
    L.push('');
    // The verdict has to be read against the nulls, not against zero. Saying "3 cells moved,
    // therefore the swap moves pixels" would be the same error the holdout already caught,
    // one level up: treating the rig's own drift as the candidate's doing.
    // A control arm outranks every computed null. It is the same configuration as the
    // baseline collected as a separate later batch, so whatever it shows against the
    // baseline is what "no change at all" produces on this rig right now. Measured here:
    // the control darkened by 17.4 with an asymmetry of 10, MORE than the real swap did.
    // Every arm verdict was batch drift. Nulls built by splitting one baseline cannot catch
    // this, because 68 of their 70 splits interleave the batches and cancel exactly the
    // effect being looked for.
    if (c.control) {
      const k = c.control;
      L.push(`  CONTROL "${k.label}" — same configuration as the baseline, separate later batch:`);
      L.push(`      control  total shift ${k.sum.toFixed(1)}, ${k.down} down / ${k.up} up, asymmetry ${k.asym}`);
      L.push(`      candidate total shift ${c.shiftSum.toFixed(1)}, ${c.sign.down} down / ${c.sign.up} up, asymmetry ${c.sign.asym}`);
      L.push('');
      if (Math.abs(c.shiftSum) <= Math.abs(k.sum) && c.sign.asym <= k.asym) {
        L.push('  VERDICT: the control moves at least as much as the candidate. Changing NOTHING');
        L.push('           reproduces the difference, so this rig cannot attribute it to the change.');
        return L.join('\n');
      }
      L.push('  VERDICT: candidate exceeds the control on at least one measure — see below, and');
      L.push('           replicate before naming a cause.');
    }
    if (c.null) {
      const pct = (arr, v) => (100 * arr.filter((x) => x < v).length / arr.length).toFixed(0);
      L.push(`  null 3 — matched: the same two statistics over ${c.null.splits} ${c.null.m}/${r.runs - c.null.m} splits of the baseline itself`);
      L.push(`      unique cells outside : candidate ${c.uniqueOutside}  vs null min ${c.null.uniq.min} med ${c.null.uniq.med} p90 ${c.null.uniq.p90} max ${c.null.uniq.max}` +
        `  -> ${pct(c.null.uniq.all, c.uniqueOutside)}th pct`);
      L.push(`      sign-test asymmetry  : candidate ${c.sign.asym} (${c.sign.down} down, ${c.sign.up} up, ${c.sign.same} identical)` +
        `  vs null min ${c.null.asym.min} med ${c.null.asym.med} p90 ${c.null.asym.p90} max ${c.null.asym.max}` +
        `  -> ${pct(c.null.asym.all, c.sign.asym)}th pct`);
      L.push('');
      if (c.sign.asym > c.null.asym.max) {
        L.push(`  VERDICT: DIRECTIONAL SHIFT. ${c.sign.down} luma cells moved down against ${c.sign.up} up; the`);
        L.push(`           asymmetry ${c.sign.asym} exceeds every one of the ${c.null.splits} baseline splits (max ${c.null.asym.max}).`);
        L.push('           A uniform shift smaller than the per-cell jitter puts nothing persistently outside');
        L.push('           its band, so the band tests above CANNOT see this. Bisect the arms before naming');
        L.push('           a cause — the flags and the browser binary are both capable of it.');
        return L.join('\n');
      }
    }
    const persistNull = n.persistent ? n.persistent.count : 0;
    if (c.persistent > persistNull) {
      L.push(`  VERDICT: ${c.persistent} cell(s) outside on every candidate sweep, against a null of ${persistNull}.`);
      L.push('           That is more persistent than the rig is to itself — treat as signal and bisect');
      L.push('           (binary vs flags) before naming a cause.');
    } else if (c.outside / c.runs > n.hi) {
      L.push(`  VERDICT: no persistent cell, but ${(c.outside / c.runs).toFixed(1)} per sweep exceeds the null's worst sweep (${n.hi}).`);
      L.push('           Weak evidence of a difference; collect more candidate sweeps before acting.');
    } else {
      L.push('  VERDICT: indistinguishable from the rig\'s own drift on this evidence.');
      L.push(`           Persistence ${c.persistent} <= null ${persistNull}, and ${(c.outside / c.runs).toFixed(1)} per sweep is inside the null range ${n.lo}-${n.hi}.`);
      L.push('           This does NOT prove the frames are identical — it proves this rig cannot tell them apart.');
    }
    if (c.outside) {
      L.push('\n  outside the range the rig ever reached on its own — read against the false-positive count above:');
      for (const row of c.rows) {
        L.push(`    ${row.frame.padEnd(14)} ${String(row.cell).padEnd(6)} band [${row.band?.lo},${row.band?.hi}] candidate {${fmtSet(row.got)}} (out by ${row.by})` +
          (row.every ? '  EVERY SWEEP' : ''));
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
  check('and it names frame+cell+band+values', () => rb.candidate.rows[0].frame === 'alpha' &&
    rb.candidate.rows[0].cell === 'p95' && rb.candidate.rows[0].band.lo === 100 &&
    rb.candidate.rows[0].band.hi === 100 && rb.candidate.rows[0].got[0] === 7);

  // THE CONTROL THAT MUST NOT FIRE. beta.p50 was observed at 100 and 101 in the baseline,
  // so a candidate landing anywhere in [100,101] is indistinguishable from the rig's own
  // drift. A tool that flags that is as useless as one that flags nothing — it would have
  // blamed the harness swap for noise the baseline itself produced.
  const candDrift = [S('cand', 1, 'alpha'), S('cand', 1, 'beta', { p50: 101 })];
  const rd = analyse([...base, ...candDrift], { candidateLabel: 'cand', holdout: 3 });
  check('CONTROL: a value inside the baseline band is NOT reported', () => rd.candidate.outside === 0);

  // ...but one unit outside that band is signal, and must be, or a real regression that
  // happens to land next to a noisy cell would be waved through.
  const candEdge = [S('cand', 1, 'alpha'), S('cand', 1, 'beta', { p50: 102 })];
  const re = analyse([...base, ...candEdge], { candidateLabel: 'cand', holdout: 3 });
  check('one unit outside the band IS reported', () => re.candidate.outside === 1);
  check('and the distance outside the band is reported', () => re.candidate.rows[0].by === 1);

  // The band must be two-sided. An earlier draft compared against the max only, which would
  // have passed every darkening regression in the set.
  const candLow = [S('cand', 1, 'alpha', { p05: 3 }), S('cand', 1, 'beta')];
  const rl = analyse([...base, ...candLow], { candidateLabel: 'cand', holdout: 3 });
  check('a value BELOW the band is reported too', () => rl.candidate.outside === 1 && rl.candidate.rows[0].by === 97);

  // The band holdout must count a held-out baseline run falling outside its own band, since
  // that is exactly the false positive the verdict has to be read against.
  const rbh = analyse(base, { holdout: 1 });
  check('band holdout counts a baseline run outside its own band', () => rbh.holdout.violated === 1);
  check('and the strict pin diagnostic fires there too', () => rbh.holdout.pinnedViolated === 1);
  const rbh2 = analyse(base, { holdout: 2 });
  check('CONTROL: band holdout is clean once the band covers the drift', () => rbh2.holdout.violated === 0);

  // Holdout naming.
  const rh = analyse(base, { holdout: 1 });
  check('holdout names the contradicted cell', () => rh.holdout.rows[0].frame === 'beta' && rh.holdout.rows[0].cell === 'p50');

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
  check('formatter runs on a full report', () => formatReport(rb, 'base', 'cand').includes('cells OUTSIDE it                           : 1'));

  // --- the nulls and the verdict --------------------------------------------------------
  // A four-sweep baseline where `beta.p50` alternates 100/101 and everything else repeats.
  const B4 = [
    S('base', 1, 'alpha'), S('base', 2, 'alpha'), S('base', 3, 'alpha'), S('base', 4, 'alpha'),
    S('base', 1, 'beta'), S('base', 2, 'beta', { p50: 101 }), S('base', 3, 'beta'), S('base', 4, 'beta', { p50: 101 }),
  ];
  const rn = analyse(B4, { holdout: 3 });
  check('null 1 is computed per baseline sweep', () => rn.nulls.perSweep.length === 4);
  // An ALTERNATING cell is invisible to leave-one-out on purpose: hold out either value and
  // the remaining sweeps still span both, so the band covers it. That is correct behaviour,
  // and worth pinning down — it is why null 1 alone understates the noise and why null 2
  // exists. What leave-one-out does catch is a one-off excursion no other sweep reaches.
  check('CONTROL: an alternating cell is inside its own leave-one-out band', () => rn.nulls.hi === 0);
  const B4x = [
    S('base', 1, 'alpha'), S('base', 2, 'alpha'), S('base', 3, 'alpha'), S('base', 4, 'alpha', { p50: 105 }),
  ];
  check('null 1 catches a one-off excursion', () => analyse(B4x, { holdout: 3 }).nulls.hi === 1);
  check('null 2 (split-half persistence) is computed', () => rn.nulls.persistent && rn.nulls.persistent.of === 2);

  // A candidate outside the band on EVERY sweep must be called signal...
  const candPersist = [
    S('cand', 1, 'alpha', { p50: 500 }), S('cand', 2, 'alpha', { p50: 500 }),
    S('cand', 1, 'beta'), S('cand', 2, 'beta'),
  ];
  const rp = analyse([...B4, ...candPersist], { candidateLabel: 'cand', holdout: 3 });
  check('persistent candidate deviation is counted', () => rp.candidate.persistent === 1);
  check('and the row is marked EVERY SWEEP', () => rp.candidate.rows.some((x) => x.every));
  check('VERDICT names it signal', () => formatReport(rp, 'base', 'cand').includes('treat as signal'));

  // ...but a candidate outside on only ONE of its sweeps must NOT be, because that is what
  // the rig does to itself. This is the control that keeps the verdict from firing on drift.
  const candOnce = [
    S('cand', 1, 'alpha', { p50: 500 }), S('cand', 2, 'alpha'),
    S('cand', 1, 'beta'), S('cand', 2, 'beta'),
  ];
  const ro = analyse([...B4, ...candOnce], { candidateLabel: 'cand', holdout: 3 });
  check('CONTROL: a one-sweep deviation is not persistent', () => ro.candidate.persistent === 0);

  // And a candidate that never leaves the band must read as indistinguishable.
  const candClean = [
    S('cand', 1, 'alpha'), S('cand', 2, 'alpha'),
    S('cand', 1, 'beta'), S('cand', 2, 'beta', { p50: 101 }),
  ];
  const rc = analyse([...B4, ...candClean], { candidateLabel: 'cand', holdout: 3 });
  check('CONTROL: a clean candidate reads as indistinguishable', () => rc.candidate.outside === 0 &&
    formatReport(rc, 'base', 'cand').includes('indistinguishable'));
  check('and the report refuses to call that proof of identity', () => formatReport(rc, 'base', 'cand')
    .includes('does NOT prove the frames are identical'));

  // --- the sign test, which is the statistic that caught the real effect ------------------
  // Four frames so the sign test has cells to count, four baseline sweeps with symmetric
  // jitter, and a two-sweep candidate.
  const FR = ['f1', 'f2', 'f3', 'f4'];
  const jitter = (run, i) => ((run + i) % 2 ? 1 : 0);   // deterministic, symmetric, no RNG
  const baseN = [];
  for (const run of [1, 2, 3, 4]) FR.forEach((f, i) => baseN.push(S('base', run, f, { p50: 100 + jitter(run, i) })));

  // A candidate shifted DOWN on every frame, by less than nothing else moves.
  const down = [];
  for (const run of [1, 2]) FR.forEach((f) => down.push(S('cand', run, f, { p50: 98 })));
  const rs = analyse([...baseN, ...down], { candidateLabel: 'cand' });
  check('sign test counts the direction of the shift', () => rs.candidate.sign.down === 4 && rs.candidate.sign.up === 0);
  check('matched null is computed over baseline splits', () => rs.candidate.null && rs.candidate.null.splits > 0);
  check('VERDICT reports a directional shift', () => formatReport(rs, 'base', 'cand').includes('DIRECTIONAL SHIFT'));

  // CONTROL: a candidate that moves cells in BOTH directions equally is not a shift, however
  // many cells moved. Without this the sign test would fire on ordinary noise.
  const mixed = [];
  for (const run of [1, 2]) FR.forEach((f, i) => mixed.push(S('cand', run, f, { p50: i < 2 ? 98 : 103 })));
  const rmix = analyse([...baseN, ...mixed], { candidateLabel: 'cand' });
  check('CONTROL: a symmetric move is not called a directional shift', () => rmix.candidate.sign.asym === 0 &&
    !formatReport(rmix, 'base', 'cand').includes('DIRECTIONAL SHIFT'));

  // CONTROL: the unique-cells count must be counted per cell, not per sweep-occurrence. The
  // first version of this comparison divided a 4-sweep total by 4 and compared it against a
  // per-sweep null, which made a real effect look ordinary.
  check('unique-outside counts cells, not occurrences', () => rs.candidate.uniqueOutside <= rs.candidate.outside);

  // --- the control arm, which is what actually settled the real question ------------------
  // A control is the SAME configuration as the baseline, collected as a separate later
  // batch. It measures what "no change at all" produces right now. Measured on the real rig
  // the control moved MORE than the swap did, so every arm verdict was batch drift.
  const ctl = [];
  for (const run of [1, 2]) FR.forEach((f) => ctl.push(S('ctl', run, f, { p50: 97 })));
  const rctl = analyse([...baseN, ...down, ...ctl], { candidateLabel: 'cand', controlLabel: 'ctl' });
  check('control arm is measured against the baseline', () => rctl.candidate.control &&
    rctl.candidate.control.label === 'ctl');
  check('a control that moves MORE than the candidate voids the verdict', () =>
    formatReport(rctl, 'base', 'cand').includes('Changing NOTHING'));
  check('and that verdict outranks the computed null', () =>
    !formatReport(rctl, 'base', 'cand').includes('DIRECTIONAL SHIFT'));

  // CONTROL ON THE CONTROL: a quiet control must NOT suppress a real candidate difference,
  // or adding a control would become a way to make any finding disappear.
  const ctlQuiet = [];
  for (const run of [1, 2]) FR.forEach((f, i) => ctlQuiet.push(S('ctl', run, f, { p50: 100 + jitter(run, i) })));
  const rq = analyse([...baseN, ...down, ...ctlQuiet], { candidateLabel: 'cand', controlLabel: 'ctl' });
  check('CONTROL: a quiet control does not suppress a real candidate shift', () =>
    !formatReport(rq, 'base', 'cand').includes('Changing NOTHING'));

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
  const r = analyse(readLedger(), { baseLabel, candidateLabel, controlLabel: arg('control', null), holdout: holdoutArg ? Number(holdoutArg) : undefined });
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
