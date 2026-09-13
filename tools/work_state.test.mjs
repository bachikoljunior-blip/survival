import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORK_FILE, ELEMENTS_FILE, continuation, inspectWork, currentBuildHash, comparisonPacketHash } from './work_state.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const START = '2026-09-13T20:56:49+09:00';
const DEADLINE = '2026-09-20T20:56:49+09:00';
const COMPLETED = '2026-09-13T20:57:49+09:00';
const NOW = new Date('2026-09-13T21:00:00+09:00');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
function yaml(value, depth = 0) {
  const pad = ' '.repeat(depth);
  if (Array.isArray(value)) return value.length ? value.map((item) => `${pad}-\n${yaml(item, depth + 2)}`).join('') : `${pad}[]\n`;
  if (value !== null && typeof value === 'object') return Object.entries(value).map(([key, item]) => {
    const complex = item !== null && typeof item === 'object';
    if (Array.isArray(item) && item.length === 0) return `${pad}${key}: []\n`;
    if (complex && !Array.isArray(item) && Object.keys(item).length === 0) return `${pad}${key}: {}\n`;
    return complex ? `${pad}${key}:\n${yaml(item, depth + 2)}` : `${pad}${key}: ${JSON.stringify(item)}\n`;
  }).join('');
  return `${pad}${JSON.stringify(value)}\n`;
}

function fixture(t, { commit = true } = {}) {
  const root = mkdtempSync(join(dirname(ROOT), 'work-state-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
  const state = {
    schema_version: 1,
    work: { units_requested: 'continuous', units_completed: 0, started_at: START, deadline_at: DEADLINE,
      timezone: 'Asia/Tokyo', deadline_missed: false, status: 'active', units: [] },
  };
  const catalog = {
    concept_revision: '2026-08-01.1', coverage: { 'the complete inherited concept': [] },
    elements: Array.from({ length: 19 }, (_, i) => ({ id: `E-${String(i + 1).padStart(2, '0')}`,
      name: `Element ${i + 1}`, reference_id: 'W1', reference_work: 'Released reference', comparison_method: 'Synthetic fixture only; not product evidence', status: 'not measured', build: null, comparison: null })),
  };
  catalog.coverage['the complete inherited concept'] = catalog.elements.map((element) => element.id);
  const save = () => { write(WORK_FILE, yaml(state)); write(ELEMENTS_FILE, json(catalog)); };
  save();
  write('AI_DEVELOPMENT/STATE.yaml', 'protocol_version: "2.2"\n');
  write('docs/benchmarks.md', '<!-- concept_revision: 2026-08-01.1 -->\n' + catalog.elements.map((element, i) =>
    `### ${element.id} ${element.name} — ${element.reference_id} ${element.reference_work}\n| BM-TST-${String(i + 1).padStart(2, '0')} | basis | threshold |\n`).join(''));
  write('AI_DEVELOPMENT/BENCHMARKS/criteria.lock.json', json({ digests: Object.fromEntries(catalog.elements.map((_, i) => [`BM-TST-${String(i + 1).padStart(2, '0')}`, 'locked'])) }));
  write('src/main.js', 'export const example = 1;\n');
  write('build.mjs', '// fixture build inputs\n');
  write('package.json', '{"name":"fixture","version":"1.0.0"}\n');
  write('package-lock.json', '{"lockfileVersion":3}\n');
  for (const [name, text] of Object.entries({ 'index.html': '<script src="cinderline.1.0.0.js"></script>', 'styles.css': 'body{}',
    'manifest.webmanifest': '{}', 'icon.svg': '<svg/>', '.nojekyll': '' })) {
    write(`public/${name}`, text); write(`dist/${name}`, text); write(name, text);
  }
  write('dist/cinderline.1.0.0.js', 'globalThis.fixture=1;');
  write('cinderline.1.0.0.js', 'globalThis.fixture=1;');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--initial-branch=work-state-test');
  if (commit) {
    git('add', WORK_FILE);
    git('-c', 'user.name=Test fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Record the original execution clock');
  }
  function compare(id = 'E-01', selected = 'A') {
    const materials = ['A', 'B'].map((label) => {
      const path = `comparisons/${id}-${label}.txt`;
      const bytes = `${id}: ${label} actual fixture material`;
      write(path, bytes); return { label, path, sha256: digest(bytes) };
    });
    const evaluator = { independent: true, source_identity_known: false, source_identity_disclosed: false };
    const record = { element: id, completed_at: COMPLETED, valid: true, evaluator, development_label: 'A', selected,
      build_sha256: currentBuildHash({ root }), packet_sha256: comparisonPacketHash(materials), materials,
      evaluation_path: `comparisons/${id}-evaluation.json` };
    const path = `comparisons/${id}-comparison.json`;
    write(record.evaluation_path, json({ element: id, completed_at: COMPLETED, selected, packet_sha256: record.packet_sha256, evaluator }));
    write(path, json(record));
    Object.assign(catalog.elements.find((element) => element.id === id), {
      status: selected === 'B' ? 'not satisfied' : 'satisfied', build: record.build_sha256, comparison: path,
    });
    state.work.units.push({ completed_at: COMPLETED, comparison: path });
    state.work.units_completed = state.work.units.length;
    save();
    return { path, record };
  }
  return { root, write, readJson, state, catalog, save, git, compare, inspect: () => inspectWork({ root, now: NOW }) };
}

test('continuous continues with both unmet and unmeasured elements', () => {
  const decision = continuation({ units_requested: 'continuous', units_completed: 150 }, [{ id: 'E-01', status: 'not satisfied' }, { id: 'E-02', status: 'not measured' }], NOW);
  assert.equal(decision.continue, true); assert.equal(decision.complete, false); assert.deepEqual(decision.remaining, ['E-01', 'E-02']);
});

test('an absent requested count defaults to one without claiming completion', () => {
  const decision = continuation({}, [{ id: 'E-01', status: 'not measured' }], NOW);
  assert.equal(decision.units_requested, 1); assert.equal(decision.continue, true); assert.equal(decision.complete, false);
});

test('a finite exhausted budget is not a completed objective', () => {
  const decision = continuation({ units_requested: 1, units_completed: 1 }, [{ id: 'E-01', status: 'not measured' }], NOW);
  assert.equal(decision.continue, false); assert.equal(decision.complete, false);
});

test('the deadline does not stop continuous unfinished work', () => {
  const decision = continuation({ units_requested: 'continuous', units_completed: 1, deadline_at: DEADLINE }, [{ id: 'E-01', status: 'not measured' }], new Date('2026-09-21T00:00:00+09:00'));
  assert.equal(decision.deadline_reached, true); assert.equal(decision.continue, true); assert.equal(decision.complete, false);
});

test('the actual reader keeps all 19 inherited elements open and reads the first commit anchor', (t) => {
  const f = fixture(t); const result = f.inspect();
  assert.deepEqual(result.errors, []); assert.equal(result.decision.continue, true); assert.equal(result.decision.remaining.length, 19);
  assert.equal(result.initial_execution_commit, f.git('rev-parse', 'HEAD'));
});

test('only all 19 current evaluated records can complete the objective', (t) => {
  const f = fixture(t);
  for (const element of f.catalog.elements) f.compare(element.id, element.id === 'E-19' ? 'equal' : 'A');
  const result = f.inspect(); assert.deepEqual(result.errors, []); assert.equal(result.decision.complete, true);
  assert.equal(result.decision.continue, false); assert.equal(result.decision.units_completed, 19);
});

test('unsupported budgets and unsupported verdicts fail closed', (t) => {
  const f = fixture(t);
  for (const count of [0, -1, 1.5, 'forever', null, true]) {
    f.state.work.units_requested = count; f.save(); assert.equal(f.inspect().decision, null);
    assert.throws(() => continuation({units_requested: count}, [{id:'E-01',status:'not measured'}]));
  }
  f.state.work.units_requested = 'continuous'; f.catalog.elements[0].status = 'partial'; f.save();
  assert.match(f.inspect().errors.join('\n'), /unsupported verdict/);
  assert.throws(() => continuation({}, [{id:'E-01',status:'partial'}]));
});

test('a second work authority in legacy STATE.yaml is refused', (t) => {
  const f = fixture(t); f.write('AI_DEVELOPMENT/STATE.yaml', 'work:\n  units_requested: 1\n');
  assert.match(f.inspect().errors.join('\n'), /duplicate authority/);
});

test('moving both dates by 168 hours cannot reset the original execution clock', (t) => {
  const f = fixture(t); f.state.work.started_at = DEADLINE; f.state.work.deadline_at = '2026-09-27T20:56:49+09:00'; f.save();
  const result = f.inspect(); assert.equal(result.decision, null); assert.match(result.errors.join('\n'), /first execution anchor/);
});

test('uncommitted and shallow histories cannot establish an original clock', (t) => {
  const f = fixture(t, { commit: false }); assert.match(f.inspect().errors.join('\n'), /initial execution anchor unavailable/);
  assert.equal(f.inspect().decision, null);
  f.git('add', WORK_FILE); f.git('-c', 'user.name=Test fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'anchor');
  f.write('.git/shallow', f.git('rev-parse', 'HEAD') + '\n');
  assert.match(f.inspect().errors.join('\n'), /shallow history/);
});

test('deleting E-01 and its coverage cannot shrink the inherited objective', (t) => {
  const f = fixture(t); f.catalog.elements.shift(); f.catalog.coverage['the complete inherited concept'].shift(); f.save();
  const result = f.inspect(); assert.equal(result.decision, null); assert.match(result.errors.join('\n'), /catalogue omits E-01/);
});

test('an arbitrary existing JSON file does not count as a completed comparison', (t) => {
  const f = fixture(t); f.state.work.units = [{ completed_at: COMPLETED, comparison: 'package.json' }]; f.state.work.units_completed = 1; f.save();
  const result = f.inspect(); assert.equal(result.decision, null); assert.match(result.errors.join('\n'), /comparison is not valid/);
});

test('missing ledger records, duplicate units, and unchanged repeated packets are refused', (t) => {
  const f = fixture(t); const { path, record } = f.compare();
  f.state.work.units = []; f.state.work.units_completed = 0; f.save();
  assert.match(f.inspect().errors.join('\n'), /absent from the work unit ledger/);
  f.state.work.units = [{ completed_at: COMPLETED, comparison: path }, { completed_at: COMPLETED, comparison: path }]; f.state.work.units_completed = 2; f.save();
  assert.match(f.inspect().errors.join('\n'), /duplicate work unit/);
  const duplicate = 'comparisons/repeated-comparison.json'; f.write(duplicate, json(record));
  f.state.work.units[1].comparison = duplicate; f.save();
  assert.match(f.inspect().errors.join('\n'), /unchanged comparison packet was evaluated again/);
});

test('a primary evaluator selecting reference B cannot be rewritten as development A', (t) => {
  const f = fixture(t); const { path, record } = f.compare(); const evaluation = f.readJson(record.evaluation_path);
  evaluation.selected = 'B'; f.write(record.evaluation_path, json(evaluation));
  const result = f.inspect(); assert.equal(result.decision, null); assert.match(result.errors.join('\n'), /evaluator result disagrees on selected/);
  record.evaluation_path = path; f.write(path, json(record));
  assert.match(f.inspect().errors.join('\n'), /not a separate evaluator result/);
});

test('an evaluator who recognized the source cannot supply a valid blind result', (t) => {
  const f = fixture(t); const { record } = f.compare(); const evaluation = f.readJson(record.evaluation_path);
  evaluation.evaluator.source_identity_known = true; f.write(record.evaluation_path, json(evaluation));
  const result = f.inspect(); assert.equal(result.decision, null); assert.match(result.errors.join('\n'), /source blindness/);
});

test('material tampering and a fabricated packet digest are detected', (t) => {
  const f = fixture(t); const { path, record } = f.compare(); const material = record.materials[0];
  const original = readFileSync(join(f.root, material.path)); f.write(material.path, 'different material');
  assert.match(f.inspect().errors.join('\n'), /material bytes differ/);
  f.write(material.path, original); record.packet_sha256 = '0'.repeat(64); f.write(path, json(record));
  const evaluation = f.readJson(record.evaluation_path); evaluation.packet_sha256 = record.packet_sha256; f.write(record.evaluation_path, json(evaluation));
  assert.match(f.inspect().errors.join('\n'), /packet digest does not match its materials/);
});

test('a comparison can contain several unchanged scenes for each side, but not duplicate material paths', t => {
  const f = fixture(t); const {path, record} = f.compare();
  for (const label of ['A', 'B']) {
    const materialPath = `comparisons/E-01-${label}-second.txt`;
    const contents = `Synthetic second scene ${label}; not product evidence`;
    f.write(materialPath, contents);
    record.materials.push({label, path: materialPath, sha256: digest(contents)});
  }
  record.packet_sha256 = comparisonPacketHash(record.materials);
  const evaluation = f.readJson(record.evaluation_path);
  evaluation.packet_sha256 = record.packet_sha256;
  f.write(record.evaluation_path, json(evaluation)); f.write(path, json(record));
  assert.deepEqual(f.inspect().errors, []);
  record.materials[2] = {...record.materials[0]};
  record.packet_sha256 = comparisonPacketHash(record.materials);
  evaluation.packet_sha256 = record.packet_sha256;
  f.write(record.evaluation_path, json(evaluation)); f.write(path, json(record));
  assert.match(f.inspect().errors.join('\n'), /duplicate comparison material path/);
});

test('source changes invalidate a prior verdict even before a new bundle is built', (t) => {
  const f = fixture(t); f.compare(); f.write('src/main.js', 'export const example = 2;\n');
  const result = f.inspect(); assert.equal(result.decision, null); assert.match(result.errors.join('\n'), /current build/);
});

test('the root mirror hashes as dist and distributable changes invalidate verdicts', (t) => {
  const f = fixture(t); const first = currentBuildHash({ root: f.root });
  rmSync(join(f.root, 'dist'), { recursive: true }); assert.equal(currentBuildHash({ root: f.root }), first);
  cpSync(join(f.root, 'public'), join(f.root, 'dist'), { recursive: true }); f.write('dist/cinderline.1.0.0.js', 'globalThis.fixture=1;');
  f.compare(); f.write('dist/cinderline.1.0.0.js', 'globalThis.fixture=2;');
  assert.match(f.inspect().errors.join('\n'), /current build/);
});

test('resetting an affected verdict preserves completed historical units and continues', (t) => {
  const f = fixture(t); f.compare('E-01', 'B');
  assert.deepEqual(f.inspect().errors, []);
  Object.assign(f.catalog.elements[0], { status: 'not measured', build: null, comparison: null });
  f.write('src/main.js', 'export const example = 2;\n'); f.save();
  const result = f.inspect(); assert.deepEqual(result.errors, []); assert.equal(result.decision.units_completed, 1);
  assert.equal(result.decision.remaining.length, 19); assert.equal(result.decision.continue, true);
});
