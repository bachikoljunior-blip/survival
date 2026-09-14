/** Build the reviewed light change into an exact source/root pair for review.
 * This prepares bytes only. It cannot commit, merge, deploy, or grade an element. */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'test-results', 'reviewed-light-build-r2');
const sourcePath = 'src/render/atmosphere.js';
const originalSourceSha = 'df35d01afc8d7ccb05fbdf0d937810d7a2893b7d017461e2bc2c5515ec1d71e3';
const expectedSourceSha = '4bc604f65d390b7cdcf34c7c8c9939d26f0810202ea2d651895cf989a3ab51b5';
const originalBundleSha = '14ea69b0d7bf581c25deeca6bdcf8f3c9ecd4bc895384c216902efe01c1eab28';
const files = [sourcePath, 'cinderline.1.0.0.js', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg', '.nojekyll'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const run = args => execFileSync(process.execPath, args, { cwd: root, stdio: 'inherit', timeout: 180000, env: { ...process.env, CINDERLINE_BUILD_ID: '1.0.0' } });

if (process.argv.includes('--export')) {
  const report = JSON.parse(readFileSync(join(output, 'report.json'), 'utf8'));
  if (report.status !== 'prepared and content/root verified') throw Error('No completed build to export');
  for (const file of [...report.files, { path: 'report.json', output: 'report.json' }]) {
    const bytes = readFileSync(join(output, file.output));
    const digest = sha(bytes);
    if (file.sha256 && (file.sha256 !== digest || file.bytes !== bytes.length)) throw Error('Prepared file changed: ' + file.path);
    if (bytes.length > 4 * 1024 * 1024) throw Error('Bounded export size exceeded');
    const meta = { file: file.path, bytes: bytes.length, sha256: digest, commit: report.sourceCommit, complete: true };
    console.log('[prepared-light-meta] ' + JSON.stringify(meta));
    for (let offset = 0; offset < bytes.length; offset += 3000) {
      console.log('[prepared-light-chunk] ' + JSON.stringify({ file: file.path, offset, base64: bytes.subarray(offset, offset + 3000).toString('base64') }));
    }
    console.log('[prepared-light-end] ' + JSON.stringify(meta));
  }
} else {
  mkdirSync(output, { recursive: true });
  const report = {
    schema_version: 1,
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    status: 'started',
    sourcePath,
    originalSourceSha,
    expectedSourceSha,
    originalBundleSha,
    change: 'Only the directional sun offset in constructor and per-frame update, from [-30,92,34] to [-43,85,38].',
    visualEvidence: 'AI_DEVELOPMENT/EVIDENCE/CONTINUOUS-2026-09-14/light-direction-a840-r2/visual-review.json',
    limits: 'Preparing a production source/root pair does not publish it. Current-build mobile checks follow adoption. No blind result or element verdict is produced.',
    files: [],
  };
  try {
    if (sha(readFileSync(join(root, sourcePath))) !== originalSourceSha) throw Error('Unreviewed source baseline');
    if (sha(readFileSync(join(root, 'cinderline.1.0.0.js'))) !== originalBundleSha) throw Error('Unexpected product build');
    const originals = new Map(files.map(path => [path, readFileSync(join(root, path))]));
    let source = originals.get(sourcePath).toString('utf8');
    const replacements = [
      ['this.sun.position.set(-30, 92, 34);', 'this.sun.position.set(-43, 85, 38);'],
      ['this.sun.position.set(playerPos.x - 30, playerPos.y + 92, playerPos.z + 34);', 'this.sun.position.set(playerPos.x - 43, playerPos.y + 85, playerPos.z + 38);'],
    ];
    for (const [before, after] of replacements) {
      if (source.split(before).length !== 2) throw Error('Source change was not unique');
      source = source.replace(before, after);
    }
    if (sha(source) !== expectedSourceSha) throw Error('Unexpected changed source');
    writeFileSync(join(root, sourcePath), source);
    run(['--check', sourcePath]);
    run(['build.mjs']);
    run(['tools/export_pages_root.mjs']);
    run(['tools/export_pages_root.mjs', '--check']);
    run(['tools/validate.mjs']);
    for (const path of files) {
      const bytes = readFileSync(join(root, path));
      const destination = path.replaceAll('/', '__');
      copyFileSync(join(root, path), join(output, destination));
      report.files.push({ path, output: destination, bytes: bytes.length, sha256: sha(bytes), changed: !originals.get(path).equals(bytes) });
    }
    const changed = report.files.filter(file => file.changed).map(file => file.path).sort();
    if (JSON.stringify(changed) !== JSON.stringify([sourcePath, 'cinderline.1.0.0.js'].sort())) throw Error('Unintended static output change');
    const trackedChanged = execFileSync('git', ['diff', '--name-only'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean).sort();
    if (JSON.stringify(trackedChanged) !== JSON.stringify(changed)) throw Error('Unintended tracked source change');
    report.status = 'prepared and content/root verified';
  } catch (error) {
    report.status = 'preparation failed; no product commit';
    report.error = String(error);
    throw error;
  } finally {
    writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
}
