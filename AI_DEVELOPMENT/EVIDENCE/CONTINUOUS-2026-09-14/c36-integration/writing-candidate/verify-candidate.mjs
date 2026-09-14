import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('.', import.meta.url));
const revisions = JSON.parse(readFileSync(resolve(root, 'revisions.json')));
const files = ['src/content/story.js', 'src/content/locale/ja/story.js', 'src/content/locale/ja/story2.js'];
const pins = ['7af0553369357b9d4812c64cbe4da22c1aec87f8', '80c9858e0a24b794560114782fd87cd6bd6916f0', '2e7bf4fce84b976d95155d54876709c72b96263b'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const checkList = [];
const check = (name, fn) => { fn(); checkList.push({ name, passed: true }); };
const before = [], after = [];
for (let i = 0; i < files.length; i++) {
  const path = files[i], a = resolve(root, 'source', path), b = resolve(root, 'candidate', path);
  const bytes = readFileSync(a);
  check('Official Git blob source pin: ' + path, () => assert.equal(createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex'), pins[i]));
  check('Candidate syntax: ' + path, () => {
    const result = spawnSync(process.execPath, ['--check', b], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });
  before.push(await import(pathToFileURL(a))); after.push(await import(pathToFileURL(b)));
}
check('Exactly the eight assigned node IDs and no duplicate target', () => {
  assert.deepEqual(revisions.map(r => `${r.conversation}:${r.node}`).sort(), ['sol_first:ah2', 'sol_first:vc_end', 'iris_first:i_decide', 'iris_first:i_refuses', 'iris_after:i_sign', 'krajcik:k_deal_cut', 'final:k_asked', 'final:k_asked2'].sort());
  assert.equal(new Set(revisions.map(r => r.conversation + ':' + r.node)).size, 8);
});
const oldEn = before[0], newEn = after[0];
const restored = structuredClone({ ...newEn });
for (const r of revisions) {
  const a = oldEn.CONVERSATIONS[r.conversation].nodes[r.node], b = newEn.CONVERSATIONS[r.conversation].nodes[r.node];
  assert.equal(b.text, r.en); assert.notEqual(a.text, b.text);
  restored.CONVERSATIONS[r.conversation].nodes[r.node].text = a.text;
}
check('All English exports identical after restoring the eight text fields', () => assert.deepEqual(restored, structuredClone({ ...oldEn })));
check('All 13 conversation structures, conditions, effects, choices, edges and all other fields unchanged', () => {
  assert.equal(Object.keys(oldEn.CONVERSATIONS).length, 13);
  for (const [c, conversation] of Object.entries(oldEn.CONVERSATIONS)) {
    for (const [n, oldNode] of Object.entries(conversation.nodes)) {
      const newNode = newEn.CONVERSATIONS[c].nodes[n];
      const { text: oldText, ...oldOther } = oldNode, { text: newText, ...newOther } = newNode;
      assert.deepEqual(oldOther, newOther, c + ':' + n);
      if (!revisions.some(r => r.conversation === c && r.node === n)) assert.equal(newText, oldText, c + ':' + n);
    }
  }
});
for (let i = 1; i < files.length; i++) {
  const exportName = i === 1 ? 'STORY_JA' : 'STORY2_JA';
  const restoredJa = structuredClone(after[i][exportName]);
  const selected = revisions.filter(r => r.localeFile === files[i]);
  check('All assigned Japanese overrides exist and match their candidate texts: ' + files[i], () => {
    for (const r of selected) {
      const oldText = before[i][exportName].c[r.conversation][r.node].text;
      const newText = after[i][exportName].c[r.conversation][r.node].text;
      assert.equal(newText, r.ja); assert.notEqual(newText, oldText);
      assert.equal(newText.split('\n\n').length, r.en.split('\n\n').length);
      assert(!/(?<!\n)\n(?!\n)/.test(newText), 'Japanese single newline would insert a visible space');
      restoredJa.c[r.conversation][r.node].text = oldText;
    }
  });
  check('All non-target Japanese fields, choices and tags unchanged: ' + files[i], () => assert.deepEqual(restoredJa, before[i][exportName]));
}
for (let i = 0; i < files.length; i++) {
  let a = readFileSync(resolve(root, 'source', files[i]), 'utf8');
  let b = readFileSync(resolve(root, 'candidate', files[i]), 'utf8');
  for (const r of revisions.filter(r => i === 0 || r.localeFile === files[i])) {
    const oldText = i === 0 ? before[0].CONVERSATIONS[r.conversation].nodes[r.node].text
      : before[i][i === 1 ? 'STORY_JA' : 'STORY2_JA'].c[r.conversation][r.node].text;
    const newText = i === 0 ? r.en : r.ja;
    const marker = `__ASSIGNED_TEXT_${r.conversation}_${r.node}__`;
    assert.equal(a.split(oldText).length, 2); assert.equal(b.split(newText).length, 2);
    a = a.replace(oldText, marker); b = b.replace(newText, marker);
  }
  check('Every byte outside target text contents unchanged: ' + files[i], () => assert.equal(a, b));
}
check('Existing pass and final-signature gates remain distinct and unchanged', () => {
  assert.deepEqual(newEn.CONVERSATIONS.iris_first.nodes.i_decide.branch, oldEn.CONVERSATIONS.iris_first.nodes.i_decide.branch);
  assert.equal(newEn.CONVERSATIONS.iris_first.nodes.i_decide.branch[0].if.trust[1], 12);
  assert.equal(newEn.CONVERSATIONS.final.nodes.e_cut.branch[0].if.trust[1], 10);
  assert.deepEqual(newEn.CONVERSATIONS.final.nodes.e_cut_iris, oldEn.CONVERSATIONS.final.nodes.e_cut_iris);
  assert.deepEqual(newEn.CONVERSATIONS.final.nodes.e_cut_self, oldEn.CONVERSATIONS.final.nodes.e_cut_self);
});
const edits = revisions.map(r => {
  const oldText = oldEn.CONVERSATIONS[r.conversation].nodes[r.node].text;
  return { coordinate: r.conversation + ':' + r.node, packet: r.unit + '/' + r.packetNode, locale: r.localeFile,
    beforeEnWords: oldText.trim().split(/\s+/).length, afterEnWords: r.en.trim().split(/\s+/).length,
    beforeEnSha256: sha(Buffer.from(oldText)), afterEnSha256: sha(Buffer.from(r.en)), afterJaSha256: sha(Buffer.from(r.ja)) };
});
const result = { status: 'passed', scope: 'Finite syntax, all-export structure, exact non-target byte preservation and eight Japanese override checks only; no game suite, runtime build, playback or blind comparison.',
  checks: checkList, englishWordsBefore: edits.reduce((n,e) => n + e.beforeEnWords,0), englishWordsAfter: edits.reduce((n,e) => n + e.afterEnWords,0), edits };
writeFileSync(resolve(root, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, checks: checkList.length, englishWordsBefore: result.englishWordsBefore, englishWordsAfter: result.englishWordsAfter }));
