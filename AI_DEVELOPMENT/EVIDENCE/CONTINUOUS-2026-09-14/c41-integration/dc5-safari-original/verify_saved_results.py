"""Verify original response bytes and exact-run result declarations offline."""
from pathlib import Path
import json,hashlib,yaml
P=Path(__file__).resolve().parent
def read(n):return json.loads((P/n).read_text())
analysis=read('analysis.json');assert analysis['status']=='complete'
pins=read('transport/original-log-response-pins.json')
assert len(pins)==2 and len({p['job'] for p in pins})==2
for p in pins:
 raw=(P/'transport'/f"{p['role']}-safari.log").read_bytes()
 assert len(raw)==p['bytes'] and hashlib.sha256(raw).hexdigest()==p['sha256']
 assert raw.endswith(b'\n') and 'Cleaning up orphan processes' in raw.decode()
commit=read('transport/source-commit.json')
assert commit['sha']==analysis['head'] and commit['parents'][0]['sha']=='8058f8431b7885e9e929e6cb57bb415d26d9f5b1'
assert [(f['filename'],f['status']) for f in commit['files']]==[('CLAUDE.md','modified')]
session=yaml.safe_load((P/'authority/SESSION_STATE.yaml').read_text())
assert session['work']['started_at']=='2026-09-13T20:56:49+09:00'
assert session['work']['deadline_at']=='2026-09-20T20:56:49+09:00'
assert session['work']['units_requested']=='continuous' and session['work']['units_completed']==0
for r in analysis['results']:
 assert r['jobStatus']=='completed' and r['attempt']==1
 assert len(r['checkoutCommitsFromLog'])==1
 if r['provenance']:assert r['provenance']['runCommit']==r['checkoutCommitsFromLog'][0]
 if r['role']=='source':assert r['checkoutCommitsFromLog']==[analysis['head']]
 else:
  merge=read('transport/pr-merge.json')
  assert merge['sha']==r['checkoutCommitsFromLog'][0]
  assert {x['sha'] for x in merge['parents']}=={analysis['head'],'5456371249f5769c25d18f1686a44349e4292d6f'}
  assert merge['commit']['tree']['sha']==commit['commit']['tree']['sha']
 if r['summaryStatus']=='passed':assert not r['failures'] and not r['failedChecks']
 assert r['profileEnvironmentObserved']=='0' and r['frameWork'] is None
receipt={'status':'passed','sourceHead':analysis['head'],'originalLogCount':2,'originalLogBytes':sum(p['bytes'] for p in pins),
 'originalLogs':pins,'onlyInstructionFileChanged':True,'productRuntimeBytesUnchanged':True,
 'historicalClockFailureRepaired':False,'canonicalSourceAndMergeVerified':True,
 'originalArtifactReportOrMediaRecovered':False,'oldStartAndDeadlinePreserved':True,
 'remoteWrites':0,'newCiRuns':0,'duplicateJobLogFetches':0,'automationChanges':0}
(P/'verification.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':'passed','originalLogBytes':receipt['originalLogBytes']}))
