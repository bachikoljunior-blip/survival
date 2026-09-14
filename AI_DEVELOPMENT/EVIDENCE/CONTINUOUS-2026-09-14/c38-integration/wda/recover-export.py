"""Verify and reconstruct one fixed completed official job-log export; no network."""
from pathlib import Path
import base64,hashlib,json,re,math
ROOT=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
job=json.loads((ROOT/'job.json').read_text());run=json.loads((ROOT/'run.json').read_text())
assert job['id']==104094199386 and job['run_id']==run['id']==34879275702
assert job['status']=='completed' and job['conclusion']=='success'
assert job['head_sha']==run['head_sha']=='bf743056ce143f09e4c6544ef1c7df4b73b232fd' and job['run_attempt']==run['run_attempt']==1
assert all(s['status']=='completed' and s['conclusion']=='success' for s in job['steps'])
raw=(ROOT/'transport/job-original.log').read_bytes();assert len(raw)==4650218 and sha(raw)=='85709d276a7e9e6877bdecfc1f4ee65da37ea6d153914d1d76cdc8e72a9da74d'
limits={'appium.log':4*1024*1024,'report.json':8*1024*1024,'f3-audio-verification.json':128*1024,'simulator-selection.json':128*1024,'xcode-version.txt':64*1024,'xcode-path.txt':64*1024,'simulator-sdk-version.txt':64*1024,'artifact-metadata.json':128*1024,'recovery-report.json':128*1024}
identity={'artifactId':10360954160,'originalRunId':34875256619,'originalRunCommit':'d175f81fa3c89f93fca9040e959a69bc258f666c','sourceHead':'789f2199bd3791a6dc6566eecaf3c1478c99afa6','recoveryCommit':job['head_sha'],'recoveryRunId':str(run['id']),'recoveryRunAttempt':'1'}
art={'id':10360954160,'name':'iphone-se3-mobile-safari-d175f81fa3c89f93fca9040e959a69bc258f666c','size_in_bytes':97944,'digest':'sha256:b40c9691451187b79db2d9263f19f52756abacb2e23f88e5d285b691d50b7113','runId':34875256619,'runCommit':'d175f81fa3c89f93fca9040e959a69bc258f666c','head':'789f2199bd3791a6dc6566eecaf3c1478c99afa6','branch':'claude/repo-instructions-constraints-r0070m','repositoryId':1314923977}
pattern=re.compile(r'^\ufeff?\d{4}-\d\d-\d\dT\S+Z \[ios-startup-recovery-(meta|chunk|end|identity)\] (\{.*\})$')
records=[]
for no,line in enumerate(raw.decode('utf-8').splitlines(),1):
 m=pattern.fullmatch(line)
 if m:records.append((no,m[1],json.loads(m[2])))
 elif '[ios-startup-recovery-' in line:raise AssertionError(('unparsed marker',no))
assert len([x for x in records if x[1]=='identity'])==1
assert next(x[2] for x in records if x[1]=='identity')==art
files={};active=None;recovered={};chunks=0
for line,kind,value in records:
 if kind=='identity':continue
 name=value['file'];assert name in limits
 if kind=='meta':
  assert active is None and name not in files
  assert all(value[k]==v for k,v in identity.items());assert value['complete'] is True
  assert isinstance(value['bytes'],int) and 0<=value['bytes']<=limits[name]
  assert value['total']==math.ceil(value['bytes']/3000)
  active=name;files[name]={'meta':value,'firstLine':line,'pieces':[]}
 elif kind=='chunk':
  assert active==name;f=files[name];index=len(f['pieces']);assert value['index']==index and value['offset']==index*3000 and value['total']==f['meta']['total']
  b=base64.b64decode(value['base64'],validate=True);assert base64.b64encode(b).decode()==value['base64']
  assert len(b)==min(3000,f['meta']['bytes']-index*3000)
  f['pieces'].append(b);chunks+=1
 else:
  assert active==name;f=files[name];assert value==f['meta'];assert len(f['pieces'])==value['total']
  b=b''.join(f.pop('pieces'));assert len(b)==value['bytes'] and sha(b)==value['sha256'];b.decode('utf-8','strict');recovered[name]=b;f['lastLine']=line;active=None
assert active is None and set(recovered)==set(limits)
metadata=json.loads(recovered['artifact-metadata.json']);receipt=json.loads(recovered['recovery-report.json'])
for k in ['id','name','size_in_bytes','digest']:assert metadata[k]==art[k]
assert metadata['expired'] is False
wr=metadata['workflow_run'];assert wr=={'head_branch':art['branch'],'head_repository_id':art['repositoryId'],'head_sha':art['head'],'id':art['runId'],'repository_id':art['repositoryId']}
assert receipt['artifact']==art and receipt['status']=='recovered original startup failure'
assert receipt['quality']=='not measured' and receipt['comparison']=='not measured'
assert len(receipt['files'])==7
for f in receipt['files']:assert len(recovered[f['file']])==f['bytes'] and sha(recovered[f['file']])==f['sha256']
report=json.loads(recovered['report.json']);assert report['status']=='failed' and report['checks']==[] and len(report['failures'])==1
assert 'WebDriver POST /session:' in report['failures'][0] and 'ECONNREFUSED 127.0.0.1:8100' in report['failures'][0]
assert not (report.get('audioCapture') or {}).get('clips');assert json.loads(recovered['f3-audio-verification.json'])['status']=='failed'
# Emit only after every file and cross-file check has passed.
original=ROOT/'original';original.mkdir(exist_ok=True)
for name,b in recovered.items():(original/name).write_bytes(b)
result={'status':'complete original export verified','recoveryJob':job['id'],'recoveryRun':run['id'],'recoveryHead':job['head_sha'],'recoveryAttempt':1,'parentRunAtFetch':{'status':run['status'],'conclusion':run['conclusion']},'jobLog':{'bytes':len(raw),'sha256':sha(raw),'fetchCount':1,'bomCharacters':raw.decode().count('\ufeff')},'artifactPin':art,'recordCounts':{'identity':1,'meta':9,'chunks':chunks,'end':9},'files':[{'file':name,'bytes':len(b),'sha256':sha(b),'firstMetaLine':files[name]['firstLine'],'lastEndLine':files[name]['lastLine'],'origin':'original selected C36 artifact member' if name not in ['artifact-metadata.json','recovery-report.json'] else 'original bytes emitted by C37 recovery job'} for name,b in recovered.items()],'archiveVerification':'Fixed ZIP size/digest and selected CRC checked by reviewed helper in successful original CI recovery step before any export. Local independent ZIP download or ZIP SHA recomputation not performed.','scope':'Byte recovery of the original failed C36 PR session startup. Not a new Safari launch, original root-cause resolution, clock repair, audio capture or quality comparison.','remoteMutations':0,'ciLaunches':0,'validBlindComparisons':0}
(ROOT/'recovery-receipt.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'status':result['status'],'files':len(recovered),'totalBytes':sum(map(len,recovered.values())),'chunks':chunks,'appiumBytes':len(recovered['appium.log'])}))
