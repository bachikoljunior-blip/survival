"""Finite checks on saved canonical responses; no remote access."""
from pathlib import Path
import json,hashlib,re
P=Path(__file__).resolve().parent
def read(n):return json.loads((P/n).read_text())
def pin(p):
 b=p.read_bytes();return {'path':str(p.relative_to(P)),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
pins=[]
for p in sorted((P/'transport').glob('*original-log-response-pins.json')):
 for r in json.loads(p.read_text()):
  name=r['role']+('.log' if 'f3-execution' in r['role'] else '-safari.log')
  f=P/'transport'/name; q=pin(f)
  assert q['bytes']==r['bytes'] and q['sha256']==r['sha256']
  assert f.read_bytes().endswith(b'\n')
  pins.append(dict(q,run=r['run'],job=r['job'],fetches=1))
assert len(pins)==5 and len({p['job'] for p in pins})==5
a=read('analysis.json');assert a['status']=='complete'
for r in a['results']:
 s=r['startupDirectSummary'];assert s['verified'] and s['actual']['ready']
 assert s['actual']['url']==s['bootstrapUrl'] and s['method']=='local-simctl-preopen'
 assert s['openUrl']['status']=='passed' and s['openUrl']['attempts']==1
 assert r['profileEnvironmentObserved']=='0' and r['frameWork'] is None
 assert r['log']['trailingCleanupPresent'] and r['jobStatus']=='completed'
 if r['role']=='standalone':
  assert r['checks']==27 and not r['failedChecks'] and r['safariConclusion']=='success' and not r['clips']
 else:
  assert r['checks']==47 and len(r['failedChecks'])==2 and len(r['clips'])==3
  assert [c['timing']['captureClockGuardPassed'] for c in r['clips']]==[False,True,True]
  assert r['movementRelease']['release']['status']=='passed'
  assert r['lifecycle']['status']=='not run'
  assert r['artifactUploadLogOnly']['metadataFetched']
merge=read('transport/pr-merge.json')
assert merge['sha']=='051d718255ef21c4ba37947f8177d4121cd159d3'
assert {p['sha'] for p in merge['parents']}=={'5456371249f5769c25d18f1686a44349e4292d6f',a['head']}
assert merge['commit']['tree']['sha']=='56dad9f8c5fea165b63de2241b1016fcf20cef93'
for role in ['source','pr']:
 t=(P/'transport'/f'{role}-f3-execution.log').read_text()
 assert 'F3 core=success Safari=failure' in t
assert not read('startup-recovery-receipt.json')['files']
receipt={'status':'passed','originalLogs':pins,'originalLogCount':5,'originalLogBytes':sum(p['bytes'] for p in pins),
 'scope':'Saved completed responses and compact report endpoint arithmetic; no original artifact report/Appium/media bytes',
 'startupVerifiedRoles':['source','pr','standalone'],'audioClockFailureRoles':['source','pr'],
 'standaloneAudioCapture':False,'inlineCommandOmissionDirectlyVerified':False,
 'canonicalArtifactMetadataAndUploadMatched':['source','pr'],'artifactZipRead':0,
 'remoteWrites':0,'newCiRuns':0,'duplicateJobLogFetches':0}
(P/'verification.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':'passed','originalLogBytes':receipt['originalLogBytes'],'originalLogCount':5}))
