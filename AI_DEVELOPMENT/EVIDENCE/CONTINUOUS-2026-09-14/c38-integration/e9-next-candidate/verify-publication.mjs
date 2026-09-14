import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('.', import.meta.url));
const allowlist = JSON.parse(readFileSync(resolve(root, 'publication-allowlist.json'), 'utf8'));
assert.equal(allowlist.policy, 'deny all other paths; do not recursively follow directories or document links');
assert.equal(allowlist.controlFile, 'publication-allowlist.json');
const seen = new Set();
for (const item of allowlist.entries) {
  assert(!seen.has(item.path)); seen.add(item.path);
  assert(!item.path.startsWith('/') && !item.path.split('/').some(part => ['..', 'private'].includes(part)));
  const full = resolve(root, item.path);
  assert(!relative(root, full).startsWith('..') && lstatSync(full).isFile());
  const bytes = readFileSync(full);
  assert.equal(bytes.length, item.bytes, item.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256, item.path);
}
assert.deepEqual(allowlist.entries.filter(x => x.path.startsWith('candidate/')).map(x => x.path).sort(), [
  'candidate/src/content/locale/ja/story.js', 'candidate/src/content/locale/ja/story2.js', 'candidate/src/content/story.js']);
assert(!seen.has('private/input-receipt.json') && !seen.has('private/authority-receipt.json'));
process.stdout.write(JSON.stringify({ status: 'passed', hashCheckedFiles: seen.size,
  controlFile: allowlist.controlFile, controlSha256: createHash('sha256').update(readFileSync(resolve(root, allowlist.controlFile))).digest('hex'),
  policy: allowlist.policy, meaning: 'Listed bytes verified; publish only these exact entries and the control file pinned by the handoff hash. No directory or document-link traversal.' }, null, 2) + '\n');
