import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const HERE=dirname(fileURLToPath(import.meta.url)),SCOPE=resolve(HERE,'..'),ROOT=resolve(SCOPE,'..');
const hash=b=>createHash('sha256').update(b).digest('hex');
const load=async file=>import(`data:text/javascript;base64,${readFileSync(file).toString('base64')}`);
const current=JSON.parse(readFileSync(resolve(HERE,'candidate-verification.json')));
for(const pin of current.candidatePins)assert.equal(hash(readFileSync(resolve(SCOPE,'candidate',pin.path))),pin.sha256,'candidate still equals independently reviewed version');
const en=(await load(resolve(SCOPE,'candidate/src/content/story.js'))).CONVERSATIONS;
const ja={...(await load(resolve(SCOPE,'candidate/src/content/locale/ja/story.js'))).STORY_JA.c,...(await load(resolve(SCOPE,'candidate/src/content/locale/ja/story2.js'))).STORY2_JA.c};
const originalBytes=readFileSync(resolve(ROOT,'e9-character-revision-ultra/revisions.json'));
const originals=JSON.parse(originalBytes);
assert.equal(originals.length,8);
const checks=[];
for(const {conversation,node,en:expectedEn,ja:expectedJa} of originals){
  assert.equal(en[conversation].nodes[node].text,expectedEn);
  assert.equal(ja[conversation][node].text,expectedJa);
  checks.push({conversation,node,englishUnchanged:true,japaneseUnchanged:true,enSha256:hash(Buffer.from(expectedEn)),jaSha256:hash(Buffer.from(expectedJa))});
}
const result={status:'passed',sourceGameBodyCount:8,sourceGameTextCount:16,checks,
  inputSha256:hash(originalBytes),candidatePins:current.candidatePins,
  scope:'Only game-authored prior revision bodies and source coordinates retained; no packet identifiers, comparison mapping, reference titles or comparison answers copied into this result.'};
writeFileSync(resolve(HERE,'prior-bodies-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:'passed',bodies:8,texts:16}));
