import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('.', import.meta.url));
const revisions = JSON.parse(readFileSync(resolve(root, 'revisions-input.json'), 'utf8'));
const paths = ['src/content/story.js', 'src/content/locale/ja/story.js', 'src/content/locale/ja/story2.js'];
const modules = await Promise.all(paths.map(path => import(pathToFileURL(resolve(root, 'source', path)))));
const wrap = text => text.split('\n\n').map(paragraph => {
  const lines = [''];
  for (const word of paragraph.split(/\s+/)) {
    if (lines.at(-1).length && lines.at(-1).length + word.length + 1 > 78) lines.push(word);
    else lines[lines.length - 1] += (lines.at(-1).length ? ' ' : '') + word;
  }
  return lines.join('\n');
}).join('\n\n');
for (const revision of revisions) {
  revision.en = wrap(revision.en);
  revision.beforeEn = modules[0].CONVERSATIONS[revision.conversation].nodes[revision.node].text;
  const i = paths.indexOf(revision.localeFile), key = i === 1 ? 'STORY_JA' : 'STORY2_JA';
  revision.beforeJa = modules[i][key].c[revision.conversation][revision.node].text;
}
for (const [i, path] of paths.entries()) {
  let text = readFileSync(resolve(root, 'source', path), 'utf8');
  for (const revision of revisions.filter(r => i === 0 || r.localeFile === path)) {
    const before = i === 0 ? revision.beforeEn : revision.beforeJa;
    const after = i === 0 ? revision.en : revision.ja;
    assert.equal(text.split(before).length, 2, `target is not a unique raw literal: ${revision.conversation}:${revision.node}`);
    assert(!/[`\\]/.test(after), 'literal needs explicit escaping');
    text = text.replace(before, after);
  }
  const target = resolve(root, 'candidate', path);
  mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, text);
}
writeFileSync(resolve(root, 'revisions.json'), `${JSON.stringify(revisions, null, 2)}\n`);
process.stdout.write('Created 6 bilingual body-only revisions in 3 source files.\n');
