"""Read-only independent C40 journal transport and adoption boundary audit."""
import base64, difflib, gzip, hashlib, json, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE.parent / 'c40-journal-build-result-ultra'
PREP = HERE.parent / 'c40-journal-build-preparation-ultra'
HEAD = '8058f8431b7885e9e929e6cb57bb415d26d9f5b1'
RUN = '34895775143'
sha = lambda b: hashlib.sha256(b).hexdigest()
blob = lambda b: hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
checks = []
def check(name, value):
    assert value, name
    checks.append(name)
def strict(pairs):
    d = {}
    for k,v in pairs:
        assert k not in d, ('duplicate JSON key', k)
        d[k] = v
    return d
def parse(b): return json.loads(b, object_pairs_hook=strict)
def read(p): return parse(p.read_bytes())
def pin(p):
    b=p.read_bytes()
    return {'bytes':len(b),'sha256':sha(b),'gitBlob':blob(b)}

authority = {}
for name in ['head','AGENTS','CLAUDE','SESSION','helper']:
    s=read(HERE/'authority'/f'{name}.receipt.json')['structuredContent']
    b=s['content'].encode()
    if name=='head':
        check('fresh App canonical head',parse(b)['object']['sha']==HEAD)
    else:
        check('App content Git identity '+name,blob(b)==s['sha'])
    authority[name]={'bytes':len(b),'sha256':sha(b),'gitBlob':s.get('sha')}
check('CLAUDE v3 fixed',authority['CLAUDE']['gitBlob']=='8b758231a6b77277092ccee5a322f593320b123f')
session=read(HERE/'authority/SESSION.receipt.json')['structuredContent']['content']
check('fixed work dates and continuous',all(x in session for x in ['"units_requested": "continuous"','"units_completed": 0','"started_at": "2026-09-13T20:56:49+09:00"','"deadline_at": "2026-09-20T20:56:49+09:00"','全19not measured/固定71基準/10参照/validblind0/units0/continuous']))

log=(SRC/'original-job.log').read_bytes()
check('raw log exact identity',len(log)==2367267 and sha(log)=='32d922886f6a7bbea44646031b1d2b12e41a3663500a775c91f0fb1b974071e2')
gz=(SRC/'original-job.log.gz').read_bytes()
check('lossless saved gzip identity',len(gz)==737415 and sha(gz)=='cecc8938b60a1ee772dfb64dfc93e01add92dd962bd221450c72e3e39c3122fa' and gzip.decompress(gz)==log)
run=read(SRC/'authority/run.json');job=read(SRC/'authority/job.json')
check('actual run and failed job',str(run['id'])==RUN and run['head_sha']==HEAD and run['run_attempt']==1 and run['event']=='push' and run['head_branch']=='claude/repo-instructions-constraints-r0070m' and job['id']==104149240177 and str(job['run_id'])==RUN and job['status']=='completed' and job['conclusion']=='failure')
source=['src/content/story.js','src/content/locale/ja/content.js']
static=['index.html','styles.css','manifest.webmanifest','icon.svg','.nojekyll']
expected={'prepared-narrative':source+['cinderline.1.0.0.js']+static+['report.json'],'narrative-route':['report.json']}
files={}; stream=None; records=[]
pattern=re.compile(r'\[(prepared-narrative|narrative-route)-(meta|chunk|end)\] (\{.*\})$')
for line_no,line in enumerate(log.decode('utf-8').splitlines(),1):
    m=pattern.search(line)
    if not m: continue
    group,kind,data=m.groups(); obj=parse(data); key=(group,obj['file'])
    if kind=='meta':
        assert stream is None and key not in files
        assert obj['file'] in expected[group] and obj['complete'] is True and obj['commit']==HEAD
        assert type(obj['bytes']) is int and 0<=obj['bytes']<=4*1024**2
        assert re.fullmatch('[0-9a-f]{64}',obj['sha256'])
        stream={'key':key,'meta':obj,'bytes':bytearray(),'lines':[line_no],'chunks':0}
    elif kind=='chunk':
        assert stream is not None and stream['key']==key
        assert type(obj['offset']) is int and obj['offset']==len(stream['bytes'])
        b=base64.b64decode(obj['base64'],validate=True)
        assert base64.b64encode(b).decode()==obj['base64']
        assert 0<len(b)==min(3000,stream['meta']['bytes']-len(stream['bytes']))
        stream['bytes'].extend(b);stream['chunks']+=1
    else:
        assert stream is not None and stream['key']==key and obj==stream['meta']
        b=bytes(stream['bytes']);assert len(b)==obj['bytes'] and sha(b)==obj['sha256']
        if 'gitBlob' in obj: assert blob(b)==obj['gitBlob']
        folder='prepared-original' if group=='prepared-narrative' else 'route-original'
        assert (SRC/folder/obj['file']).read_bytes()==b
        files[key]=b
        records.append({'path':folder+'/'+obj['file'],'bytes':len(b),'sha256':sha(b),'gitBlob':blob(b),'metaLine':stream['lines'][0],'endLine':line_no,'chunks':stream['chunks'],'metadata':obj})
        stream=None
check('all ten complete streams and 565 chunks',stream is None and list(files)==[(g,p) for g,ps in expected.items() for p in ps] and sum(r['chunks'] for r in records)==565 and sum(len(b) for b in files.values())==1683387)
p=parse(files['prepared-narrative','report.json']);r=parse(files['narrative-route','report.json'])
check('no missing PNG reclassified as success',r['status']=='failed' and r['screens']==[] and 'Journal body is covered' in r['error'] and all(r[k] is True for k in ['browserRequested','browserAttempted','browserExecuted']) and not list((SRC/'route-original').glob('*.png')))
for report in [p,r]:
    assert report['sourceCommit']==HEAD and str(report['runId'])==RUN and str(report['runAttempt'])=='1'
meta=records[-1]['metadata']
check('failed route provenance and count',meta['runId']==RUN and meta['runAttempt']=='1' and meta['diagnosticStatus']=='failed' and meta['screenCount']==0 and meta['bundleSha256']==r['bundleSha256'])
baseline='8c5624edd96ba238135e46c90e53c6221b3c3303b977bb5d4e41b752264d94f0'
check('old root reproduced and new root exact',p['status']=='prepared and content/root verified' and p['baselineReproduced'] is True and p['baselineDistSha256']==p['originalBundleSha256']==baseline and p['candidateBundleSha256']==r['bundleSha256']==sha(files['prepared-narrative','cinderline.1.0.0.js'])=='4912f328eddfe99293bc90387a304854b7f3c1e2a1f9d36bf7fa5677caeebbed')
tree=read(SRC/'authority/tree.json');assert tree['truncated'] is False and tree['sha']=='56dad9f8c5fea165b63de2241b1016fcf20cef93'
blobs={v['path']:v['sha'] for v in tree['tree'] if v['type']=='blob'}
inputs=read(PREP/'verified-current-pins.json')['inputs']
assert p['inputs']==inputs and len(inputs)==47
for path,v in inputs.items():
    assert pin(PREP/'baseline'/path)==v and v['gitBlob']==blobs[path],path
check('all 47 raw input pins match actual C40 tree',True)
for f in read(PREP/'candidate-pins.json')['files']:
    assert f['gitBlob']==blobs[f['repositoryPath']]
check('all five exact preparation code candidates in C40 tree',True)
check('locked dependencies and seven successful stages',p['dependencies']=={'esbuild':'0.25.0','three':'0.180.0'} and len(p['commands'])==7 and all(c['exit']==0 for c in p['commands']) and [c['args'] for c in p['commands'][:2]]==[['build.mjs'],['tools/export_pages_root.mjs','--check']] and p['commands'][2]['args'][3:]==source and [c['args'] for c in p['commands'][3:]]==[['build.mjs'],['tools/export_pages_root.mjs'],['tools/export_pages_root.mjs','--check'],['tools/validate.mjs']])
for f in p['files']:
    b=files['prepared-narrative',f['path']]
    assert all(f[k]==v for k,v in {'bytes':len(b),'sha256':sha(b),'gitBlob':blob(b)}.items())
    assert f['changed']==(f['path'] in source+['cinderline.1.0.0.js'])
for path in source:
    b=files['prepared-narrative',path]
    assert b==(HERE.parent/'c40-journal-period-repair-ultra/candidate'/path).read_bytes()
    assert sha(b)==p['expectedSources'][path]['sha256']
for path in static:
    b=files['prepared-narrative',path]
    assert b==(PREP/'baseline'/path).read_bytes() and blob(b)==blobs[path]
check('exact two authorized sources and five unchanged static files',True)
adopt=read(SRC/'adoption-pins.json')
assert len(adopt['files'])==4 and adopt['fileCount']==4 and adopt['productAdopted'] is False and adopt['originalScreens']==0 and adopt['visualAdoptionEvidenceComplete'] is False
for f in adopt['files']:
    assert all(f[k]==v for k,v in pin(SRC/f['local']).items())
    if f['path']!='tools/ios_audio_capture.mjs': assert (SRC/f['local']).read_bytes()==files['prepared-narrative',f['path']]
old=(SRC/'authority/ios_audio_capture.mjs').read_text();new=(SRC/'adoption-candidate/tools/ios_audio_capture.mjs').read_text()
assert blob(old.encode())==blobs['tools/ios_audio_capture.mjs']
for key,value in adopt['iosPinChanges'].items():
    old,n=re.subn(r'('+key+r": ')[0-9a-f]+(')",lambda m:m[1]+value+m[2],old)
    assert n==1,(key,n)
check('held four paths with exactly three IOS pin replacements',old==new)
base=(HERE/'baseline/tools/check-narrative-routes.mjs').read_bytes();candidate=(SRC/'repair-candidate/tools/check-narrative-routes.mjs').read_bytes()
check('one helper candidate exact identity',len(candidate)==19190 and sha(candidate)=='c37ff0a9458fde111c7396f7492c053f554f4c2fee7313b03b04c28693520709' and sha(base)=='3c631b2286ef7e6ff24d8be0b6d317689a22852a55e7da82efe5961fc0bc90b3' and blob(base)==blobs['tools/check-narrative-routes.mjs'])
diff=''.join(difflib.unified_diff(base.decode().splitlines(keepends=True),candidate.decode().splitlines(keepends=True),fromfile='a/tools/check-narrative-routes.mjs',tofile='b/tools/check-narrative-routes.mjs'))
check('provided patch exact independent diff',diff==(SRC/'repair-candidate.patch').read_text())
start=b'        const rendered = await page.evaluate(async ('
end=b'/** Export original PNG and report bytes'
check('source selection and final export/failure/cap guards byte-identical',base.split(start)[0]==candidate.split(start)[0] and base[base.index(end):]==candidate[candidate.index(end):])
allow=read(SRC/'publication-allowlist.json')
for f in allow['files']:
    assert not pathlib.PurePosixPath(f['path']).is_absolute() and '..' not in pathlib.PurePosixPath(f['path']).parts
    assert all(f[k]==v for k,v in pin(SRC/f['path']).items())
check('author exact allowlist readback',True)
out={'status':'PASS','checks':checks,'checkCount':len(checks),'authority':authority,'originalFiles':records,'originalLog':pin(SRC/'original-job.log'),'logGzip':pin(SRC/'original-job.log.gz'),'originalStatus':'failed','originalScreens':0,'originalActualHitElementKnown':False,'inputCount':47,'successfulBuildStages':7,'heldAdoptionPaths':adopt['files'],'candidate':pin(SRC/'repair-candidate/tools/check-narrative-routes.mjs'),'authorManifest':pin(SRC/'manifest.json'),'authorAllowlist':pin(SRC/'publication-allowlist.json'),'blocking':[],'jobLogCalls':0,'newCI':0,'remoteWrites':0}
(HERE/'original-verification.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'status':out['status'],'checks':len(checks),'originalFiles':len(records),'chunks':sum(x['chunks'] for x in records),'screens':0,'blocking':[]}))
