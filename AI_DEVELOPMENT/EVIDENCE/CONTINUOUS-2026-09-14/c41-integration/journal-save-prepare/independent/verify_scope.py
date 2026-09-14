"""Independent immutable-input and tools-only preparation diff audit; no build."""
from pathlib import Path
import hashlib,json,re,difflib
R=Path(__file__).resolve().parent;P=R.parent/'c41-journal-save-build-preparation-ultra'
H='8058f8431b7885e9e929e6cb57bb415d26d9f5b1'
sha=lambda b:hashlib.sha256(b).hexdigest()
blob=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def j(p):return json.loads(p.read_text())
def pin(p):
 b=p.read_bytes();return {'bytes':len(b),'sha256':sha(b),'gitBlob':blob(b)}
checks=[]
def check(n,v):assert v,n;checks.append(n)
for name in ['head','AGENTS','CLAUDE','SESSION']:
 s=j(R/'authority'/f'{name}.receipt.json')['structuredContent'];b=s['content'].encode()
 check('fresh authority '+name,json.loads(b)['object']['sha']==H if name=='head' else blob(b)==s['sha'])
manifest=j(P/'manifest.json');cp=j(P/'candidate-pins.json')
check('manifest and path count',len(cp['files'])==6 and cp['changedRepositoryPaths']==4 and cp['sourceCommit']==manifest['baselineCommit']==H and manifest['files']==cp['files'])
tree=j(R.parent/'c40-journal-build-result-ultra/authority/tree.json');assert tree['truncated'] is False
blobs={f['path']:f['sha'] for f in tree['tree'] if f['type']=='blob'}
diffs=[]
for f in cp['files']:
 assert all(f[k]==v for k,v in pin(P/f['path']).items())
 path=f['repositoryPath'];candidate=(P/f['path']).read_bytes()
 if f['changed']:
  assert path in ['tools/prepare-narrative-product.mjs','tools/check-narrative-routes.mjs','.github/workflows/gates.yml','tools/candidates/journal-save-state-r1.js']
  base=(R/'canonical'/path).read_bytes() if f['baselineGitBlob'] else b''
  if f['baselineGitBlob']:assert blob(base)==blobs[path]==f['baselineGitBlob']
  diffs.append(''.join(difflib.unified_diff(base.decode().splitlines(keepends=True),candidate.decode().splitlines(keepends=True),fromfile='a/'+path if base else '/dev/null',tofile='b/'+path)))
 else:assert blob(candidate)==f['baselineGitBlob']==blobs[path]
check('six files exact, four changed, two existing candidates unchanged',True)
check('complete four-path patch exact', ''.join(diffs)==(P/'candidate.patch').read_text())
new=(P/'candidate/tools/check-narrative-routes.mjs').read_text();old=(P/'repair-baseline/tools/check-narrative-routes.mjs').read_text();canonical=(R/'canonical/tools/check-narrative-routes.mjs').read_text()
check('reviewed repair inherited exactly',sha(old.encode())=='c37ff0a9458fde111c7396f7492c053f554f4c2fee7313b03b04c28693520709')
for a,b,name in [(canonical,old,'inherited-repair.patch'),(old,new,'new-scope.patch')]:
 exact=''.join(difflib.unified_diff(a.splitlines(keepends=True),b.splitlines(keepends=True),fromfile='a/tools/check-narrative-routes.mjs',tofile='b/tools/check-narrative-routes.mjs'))
 check(name+' exact',exact==(P/name).read_text())
def rendered(s):
 start=s.index('        const rendered = await page.evaluate(');end=s.index('        // Preserve actual layout',start)
 return s[start:end]
check('entire browser layout/pointer callback unchanged',rendered(new)==rendered(old))
def assertions(s):
 start=s.index('        assert.equal(rendered.title');end=s.index('      } finally { await context.close(); }',start)
 return s[start:end]
check('entire visual assertions unchanged',assertions(new)==assertions(old))
check('context per row and cleanup unchanged',all(t in new and t in old for t in ['for (const row of rows) {\n      const context = await browser.newContext(report.contextOptions);\n      try {','      } finally { await context.close(); }','  } finally { if (browser) await browser.close(); await site.close(); }']))
check('pre-assertion original viewport screenshot and new evidence',new.index('const png = await page.screenshot(')<new.index('assert.equal(rendered.title') and 'fullPage: false' in new and 'slotRaw: undefined, slotSha256: hash(selected.saveLoad.slotRaw)' in new)
check('route caps unchanged',all(s in new for s in ['file.bytes.length <= 4 * 1024 * 1024','<= 32 * 1024 * 1024','offset += 3000','{ timeout: 120000 }']))
inputs=j(P/'verified-current-pins.json')['inputs']
assert len(inputs)==47
for path,v in inputs.items():assert pin(P/'baseline'/path)==v and v['gitBlob']==blobs[path]
check('all 47 baseline byte and canonical tree pins',True)
for path in ['cinderline.1.0.0.js','index.html','styles.css','manifest.webmanifest','icon.svg','.nojekyll']:
 assert blob((P/'baseline'/path).read_bytes())==blobs[path]
check('old root and five statics canonical',sha((P/'baseline/cinderline.1.0.0.js').read_bytes())=='8c5624edd96ba238135e46c90e53c6221b3c3303b977bb5d4e41b752264d94f0')
statePin=j(R.parent/'c41-iris-journal-save-independent-review-ultra/input-pins.json')['candidate']
check('same independently reviewed state356d source',pin(P/'candidate/tools/candidates/journal-save-state-r1.js')=={k:statePin[k] for k in ['bytes','sha256','gitBlob']})
check('fresh state base still exact',pin(R/'canonical/src/game/state.js')==inputs['src/game/state.js'])
prep=(P/'candidate/tools/prepare-narrative-product.mjs').read_text();pbase=(R/'canonical/tools/prepare-narrative-product.mjs').read_text()
extract=lambda s:re.search(r'export const INPUTS = Object.freeze\((\{[\s\S]*?\})\);',s)[1]
check('all 47 preparation pin constants unchanged',extract(prep)==extract(pbase))
def body(s,token,end):return s[s.index(token):s.index(end,s.index(token))]
for token,end in [('export function changedSources','export function verifyInputs'),('export function verifyInputs','export function exportPrepared'),('export function exportPrepared','export function prepare')]:check(token+' byte unchanged',body(prep,token,end)==body(pbase,token,end))
check('seven original command stages retained',re.findall(r"run\(\[([^\n]+?)\]\)",prep)==re.findall(r"run\(\[([^\n]+?)\]\)",pbase))
check('180s command limit and all-input postcheck unchanged',"timeout: 180000" in prep and "for (const [path, pin] of Object.entries(INPUTS)) if (hash(readFileSync(join(root,path))) !== (CANDIDATES[path]?.sha256 ?? pin))" in prep)
gbase=(R/'canonical/.github/workflows/gates.yml').read_text();gnew=(P/'candidate/.github/workflows/gates.yml').read_text()
start='\n  prepare-narrative-product:\n'
def splitjob(s):
 begin=s.index(start);m=re.search(r'\n  [a-zA-Z0-9_-]+:\n',s[begin+len(start):]);end=begin+len(start)+m.start() if m else len(s)
 return s[:begin],s[begin:end],s[end:]
a,oldjob,b=splitjob(gbase);c,newjob,d=splitjob(gnew)
check('workflow prefix and suffix outside preparation job byte-identical',a.encode()==c.encode() and b.encode()==d.encode())
check('source-only first-attempt marker and job guard',all(t in newjob for t in ["github.event_name == 'push'","github.ref == 'refs/heads/claude/repo-instructions-constraints-r0070m'","github.run_attempt == 1","[prepare-journal-save-product-r1]","timeout-minutes: 15","contents: read"]))
check('workflow failure export and artifact retention',"!cancelled() && hashFiles('test-results/journal-save-route-r1/report.json') != ''" in newjob and newjob.count('if: always()')==oldjob.count('if: always()') and newjob.count('continue-on-error')==0)
check('unknown new build and retained old failure scope',manifest['candidateRootSha256'] is None and manifest['actualBuild'] is False and manifest['actualBrowser'] is False and manifest['candidateAdopted'] is False and manifest['c40Root4912Adoption']=='hold')
result={'status':'PASS','checks':checks,'checkCount':len(checks),'candidateFiles':cp['files'],'producerManifest':pin(P/'manifest.json'),'producerReport':pin(P/'REPORT.md'),'unchangedWorkflowPrefixBytes':len(a.encode()),'unchangedWorkflowSuffixBytes':len(b.encode()),'reviewedPriorStateSource':statePin,'actualBuild':False,'actualBrowser':False,'productAdopted':False,'remoteWrites':0,'ciStarts':0}
(R/'scope-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'status':'PASS','checks':len(checks),'candidateLocalFiles':6,'changedRepositoryPaths':4}))
