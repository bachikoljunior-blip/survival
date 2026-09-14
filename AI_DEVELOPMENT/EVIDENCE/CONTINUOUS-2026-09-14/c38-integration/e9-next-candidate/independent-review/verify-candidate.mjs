import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const HERE = dirname(fileURLToPath(import.meta.url)), SCOPE = resolve(HERE, '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const blob = bytes => createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
const targets = [['sol_first','vc_krajcik'], ...['k_choice','k_refuse','k_accept','ag_refused','k_end'].map(n => ['krajcik',n])];
const files = ['src/content/story.js', 'src/content/locale/ja/story.js', 'src/content/locale/ja/story2.js'];
const read = (area, file) => readFileSync(resolve(SCOPE, area, file));
const moduleFrom = async bytes => import(`data:text/javascript;base64,${bytes.toString('base64')}`);
const differences = (a,b,path=[]) => {
  if (Object.is(a,b)) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = [...new Set([...Object.keys(a),...Object.keys(b)])];
    return keys.flatMap(k => differences(a[k],b[k],[...path,k]));
  }
  return [{ path, before:a, after:b }];
};
function maskTextLiterals(source, names, english) {
  const spans = [];
  for (const name of names) {
    const matches = [...source.matchAll(new RegExp(`^${english?'    ':'      '}${name}: \\{`, 'gm'))];
    assert.equal(matches.length, 1, `unique node ${name}`);
    const start = matches[0].index + matches[0][0].length;
    const lead = source.slice(start).match(english ? /^\s*\.\.\.line\('[^']+',\s*/ : /^\s*text:\s*/);
    assert.ok(lead, `target text literal ${name}`);
    const at = start + lead[0].length, quote = source[at];
    assert.ok(['`', "'", '"'].includes(quote));
    let end = at + 1;
    for (;end < source.length;end++) {
      if (source[end] === '\\') { end++; continue; }
      if (source[end] === quote) break;
      assert.ok(!(quote === '`' && source[end] === '$' && source[end+1] === '{'), 'no new template expression');
    }
    assert.ok(end < source.length);
    spans.push({ start:at, end:end+1, name, literal:source.slice(at,end+1) });
  }
  for (const s of [...spans].sort((a,b)=>b.start-a.start)) source = source.slice(0,s.start) + `__TEXT_${s.name}__` + source.slice(s.end);
  return { masked:source, spans };
}
const tree = JSON.parse(readFileSync(resolve(HERE,'canonical-tree.json')));
assert.equal(tree.truncated,false);
const treeByPath = Object.fromEntries(tree.tree.map(x=>[x.path,x]));
const candidateFiles = readdirSync(resolve(SCOPE,'candidate'),{recursive:true,withFileTypes:true}).filter(x=>x.isFile()).map(x=>relative(resolve(SCOPE,'candidate'),resolve(x.parentPath,x.name))).sort();
assert.deepEqual(candidateFiles,[...files].sort(),'exactly the three authorized candidate files');
const inputs=[], candidatePins=[], leaves=[];
let englishBefore,englishAfter,jaBefore={},jaAfter={};
for (const file of files) {
  const before=read('source',file), after=read('candidate',file);
  assert.equal(blob(before),treeByPath[file].sha,`${file} canonical source pin`);
  inputs.push({path:file,bytes:before.length,sha256:hash(before),gitBlob:blob(before)});
  candidatePins.push({path:file,bytes:after.length,sha256:hash(after),gitBlob:blob(after)});
  const english = file===files[0];
  const names = english ? targets.map(x=>x[1]) : file===files[1] ? ['vc_krajcik'] : targets.slice(1).map(x=>x[1]);
  const a=maskTextLiterals(before.toString(),names,english),b=maskTextLiterals(after.toString(),names,english);
  assert.equal(a.masked,b.masked,`${file} every byte outside six/twelve allowed text literals unchanged`);
  const A=await moduleFrom(before), B=await moduleFrom(after);
  const diff=differences(A,B);
  assert.equal(diff.length,names.length,`${file} exactly allowed text leaves changed`);
  for(const d of diff) {
    assert.equal(d.path.at(-1),'text'); assert.ok(names.includes(d.path.at(-2)));
    assert.equal(typeof d.before,'string'); assert.equal(typeof d.after,'string');
    assert.ok(d.after.trim().length>0);
    leaves.push({file,...d});
  }
  if(english){englishBefore=A;englishAfter=B;} else {
    Object.assign(jaBefore,Object.values(A)[0].c); Object.assign(jaAfter,Object.values(B)[0].c);
  }
}
for(const [conversation,node] of targets) {
  assert.ok(jaAfter[conversation]?.[node]?.text,`${conversation}/${node} Japanese body present`);
  const original=englishBefore.CONVERSATIONS[conversation].nodes[node], candidate=englishAfter.CONVERSATIONS[conversation].nodes[node];
  assert.deepEqual({...candidate,text:original.text},original,'speaker, mood, condition, next, effects and choices unchanged');
}
// Complete masked-byte equality also verifies every prior non-target body;
// no separately guessed list of earlier revision identifiers is needed.
const paired=targets.map(([conversation,node])=>({conversation,node,en:englishAfter.CONVERSATIONS[conversation].nodes[node].text,ja:jaAfter[conversation][node].text}));
const result={status:'passed',sourceHead:'bf743056ce143f09e4c6544ef1c7df4b73b232fd',fileCount:3,targetNodes:6,changedTextLeaves:12,
  canonicalInputs:inputs,candidatePins,exactOutsideTextBytesUnchanged:true,allExportedNonTextValuesUnchanged:true,
  allConditionsEffectsChoicesBranchesUnchanged:true,allPriorNonTargetBodiesUnchanged:true,
  irisAndJournalUntouched:true,paired,
  scope:'Source-known production consistency only; no reference material, comparison, runtime screen, build or quality success.',remoteMutations:0,ciStarts:0,retries:0,comparisons:0};
writeFileSync(resolve(HERE,'candidate-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,fileCount:3,targetNodes:6,changedTextLeaves:12,candidatePins}));
