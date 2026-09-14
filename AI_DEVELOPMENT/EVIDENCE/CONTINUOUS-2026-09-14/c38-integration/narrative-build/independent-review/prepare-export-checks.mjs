import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { INPUTS, CANDIDATES, SOURCES, FILES, hash, gitBlob, changedSources, exportPrepared, prepare } from '../candidate/tools/prepare-narrative-product.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const workspace = join(root, '../..');
const originalRoot = join(root, '../baseline');
const candidateRoot = join(root, '../candidate');
const checks = [];
function check(name, fn) { fn(); checks.push({ name, passed: true }); }
const originals = new Map(SOURCES.map(path => [path, readFileSync(join(originalRoot, path))]));
const candidates = new Map(SOURCES.map(path => [path, readFileSync(join(candidateRoot, CANDIDATES[path].file))]));
check('all three exact frozen sources accepted without transformation', () => {
  const result = changedSources(originals, candidates);
  for (const path of SOURCES) assert.equal(result.get(path), candidates.get(path));
  assert.equal(Object.keys(INPUTS).length, 47);
});
for (const path of SOURCES) {
  check('reject baseline drift: ' + path, () => {
    const changed = new Map(originals); changed.set(path, Buffer.concat([originals.get(path), Buffer.from(' ')]));
    assert.throws(() => changedSources(changed, candidates), /Unreviewed source baseline/);
  });
  check('reject candidate drift: ' + path, () => {
    const changed = new Map(candidates); changed.set(path, Buffer.concat([candidates.get(path), Buffer.from(' ')]));
    assert.throws(() => changedSources(originals, changed), /Unreviewed candidate source/);
  });
}
check('reject missing and additional candidate paths', () => {
  const missing = new Map(candidates); missing.delete(SOURCES[2]);
  const extra = new Map(candidates); extra.set('src/extra.js', Buffer.alloc(0));
  assert.throws(() => changedSources(originals, missing), /Unexpected candidate source set/);
  assert.throws(() => changedSources(originals, extra), /Unexpected candidate source set/);
});
check('Git blob uses the actual NUL framing', () => assert.equal(gitBlob(Buffer.alloc(0)), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'));
const fixture = join(root, 'transport-fixture');
const output = join(fixture, 'test-results/narrative-product-build-r2');
mkdirSync(output, { recursive: true });
const expected = new Map(FILES.map((path, i) => [path, Buffer.alloc(path === '.nojekyll' ? 0 : 3000 * (i % 3) + 1, 65 + i)]));
function reportFor() {
  return {
    status: 'prepared and content/root verified', sourceCommit: 'a'.repeat(40),
    files: FILES.map(path => {
      const bytes = expected.get(path); return { path, output: path.replaceAll('/', '__'), bytes: bytes.length, sha256: hash(bytes), gitBlob: gitBlob(bytes) };
    })
  };
}
function reset(report = reportFor()) {
  for (const [path, bytes] of expected) writeFileSync(join(output, path.replaceAll('/', '__')), bytes);
  writeFileSync(join(output, 'report.json'), JSON.stringify(report) + '\n');
}
function refusesBeforeEmission(pattern) {
  const lines = [];
  assert.throws(() => exportPrepared(fixture, line => lines.push(line)), pattern);
  assert.equal(lines.length, 0);
}
check('complete ten-file transport round-trip including zero bytes and chunk boundaries', () => {
  reset(); const lines = []; exportPrepared(fixture, line => lines.push(line));
  const expectAll = new Map(expected); expectAll.set('report.json', readFileSync(join(output, 'report.json')));
  let active = null; const done = [];
  for (const line of lines) {
    const match = /^\[prepared-narrative-(meta|chunk|end)\] (.*)$/.exec(line); assert.ok(match);
    const item = JSON.parse(match[2]);
    if (match[1] === 'meta') { assert.equal(active, null); active = { meta: item, chunks: [], offset: 0 }; }
    else if (match[1] === 'chunk') { assert.ok(active); assert.equal(item.file, active.meta.file); assert.equal(item.offset, active.offset); const bytes = Buffer.from(item.base64, 'base64'); active.chunks.push(bytes); active.offset += bytes.length; }
    else { assert.deepEqual(item, active.meta); const bytes = Buffer.concat(active.chunks); assert.deepEqual(bytes, expectAll.get(item.file)); assert.equal(item.bytes, bytes.length); assert.equal(item.sha256, hash(bytes)); assert.equal(item.gitBlob, gitBlob(bytes)); assert.equal(item.commit, 'a'.repeat(40)); assert.equal(item.complete, true); done.push(item.file); active = null; }
  }
  assert.equal(active, null); assert.deepEqual(done, [...FILES, 'report.json']);
});
check('last file byte corruption refuses before first export record', () => { reset(); writeFileSync(join(output, '.nojekyll'), 'corrupt'); refusesBeforeEmission(/Prepared file changed/); });
check('output path traversal refuses before first export record', () => { const report = reportFor(); report.files.at(-1).output = '../../outside'; reset(report); refusesBeforeEmission(/Unexpected prepared output path/); });
check('reordered file set refuses before first export record', () => { const report = reportFor(); report.files.reverse(); reset(report); refusesBeforeEmission(/Unexpected prepared file set/); });
check('failed status refuses before first export record', () => { const report = reportFor(); report.status = 'preparation failed; no product commit'; reset(report); refusesBeforeEmission(/No completed build/); });
check('accurately hashed final file above 4 MiB refuses before first export record', () => {
  const report = reportFor(), bytes = Buffer.alloc(4 * 1024 * 1024 + 1); reset();
  Object.assign(report.files.at(-1), { bytes: bytes.length, sha256: hash(bytes), gitBlob: gitBlob(bytes) });
  writeFileSync(join(output, '.nojekyll'), bytes); writeFileSync(join(output, 'report.json'), JSON.stringify(report)); refusesBeforeEmission(/Bounded export size exceeded/);
});
check('report above 4 MiB refuses before first export record', () => { const report = reportFor(); report.padding = 'x'.repeat(4 * 1024 * 1024); reset(report); refusesBeforeEmission(/Bounded export size exceeded/); });
const failure = join(root, 'failure-fixture'); mkdirSync(failure, { recursive: true });
execFileSync('git', ['init', '-q'], { cwd: failure });
execFileSync('git', ['-c', 'user.name=Independent CPU fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'isolated preparation rejection'], { cwd: failure });
check('wrong input-set failure preserves report before any build command or source write', () => {
  assert.throws(() => prepare(failure), /Unexpected build-input file set/);
  const report = JSON.parse(readFileSync(join(failure, 'test-results/narrative-product-build-r2/report.json')));
  assert.equal(report.status, 'preparation failed; no product commit'); assert.deepEqual(report.files, []); assert.deepEqual(report.commands, []);
  const emitted = []; assert.throws(() => exportPrepared(failure, x => emitted.push(x)), /No completed build/); assert.equal(emitted.length, 0);
});
reset();
const result = { scope: 'Static candidate-source and bounded transport CPU review; synthetic fixtures, no product build, CI, evaluation or measurement.', checks, passed: checks.every(c => c.passed), total: checks.length, productBuildCommandsExecuted: 0, remoteMutations: 0 };
writeFileSync(join(root, 'cpu-review-results.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
