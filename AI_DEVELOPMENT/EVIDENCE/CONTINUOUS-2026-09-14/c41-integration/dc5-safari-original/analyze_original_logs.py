"""dc5 completed canonical job logs only; read-only endpoint arithmetic."""
from pathlib import Path
import json, hashlib, math, re
P=Path(__file__).resolve().parent
HEAD='dc565c0f0fda14b946d0c5e5c7b4eac43e3bdfd5'
ROLES=[('source',34898336642,104157904054),('pr',34898351772,104157952955)]
PINS={'preparedFromCommit':'61e8f8c595bde13634fe709f979816011df165d0','preparationReportSha256':'000c622624315c43eb98639b2fc32c566e91f1c5cf4ec67713b4d8dd048efa44','bundleSha256':'8c5624edd96ba238135e46c90e53c6221b3c3303b977bb5d4e41b752264d94f0','recorderBlob':'785541d3beaed0e35e8bcf042973eabb7bdb5d6c','helperSha256':'e4f36959ec83f4d4112bda7be27e081ba0e721ee27784705a21a59c4c31d0262','harnessSha256':'a278b87f0fb2e15b843205b6fe211a8046f72463e2f29956bfbf867f5900adee','transferHelperSha256':'55150670ce3a89c24b9b3348110e29f315d9479ac14438faadf14389987eb41a','frameWorkProbeSha256':'eabc3f8ba621e992902a63790b86f0787bb84998bd5b9fa239ab20414d661fe8'}
def write(p,d): p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def markers(t,tag): return [json.loads(l.split(tag+' ',1)[1]) for l in t.splitlines() if tag+' ' in l and l.split(tag+' ',1)[1].startswith('{')]
results=[]
for role,runid,jobid in ROLES:
 f=P/'transport'/f'{role}-safari.log'
 if not f.exists(): continue
 raw=f.read_bytes(); text=raw.decode('utf-8')
 summaries=markers(text,'[ios-safari-report]'); assert len(summaries)==1,(role,'report',len(summaries))
 s=summaries[0]; write(P/'transport'/f'{role}-summary.json',s)
 jobs=json.loads((P/'transport'/f'jobs-{runid}-completed.json').read_text())['jobs']
 job=next(j for j in jobs if j['id']==jobid); assert job['status']=='completed'
 run=json.loads((P/'transport'/f'run-{runid}-initial.json').read_text()); assert run['head_sha']==HEAD and run['run_attempt']==1
 assert raw.endswith(b'\n') and 'Cleaning up orphan processes' in text
 commits=re.findall(r"\[command\]/[^\r\n]*git log -1 --format=%H\r?\n[^\r\n]*?([a-f0-9]{40})(?:\r?\n)",text)
 checks=s.get('checks',[]); failed=[c for c in checks if not c.get('passed')]
 prov=s.get('provenance')
 if prov:
  for k,v in PINS.items(): assert prov[k]==v,(role,k,prov.get(k),v)
  assert prov['runId']==str(runid) and prov['runAttempt']=='1'
  assert prov['actualRecorderBlob']==PINS['recorderBlob']
  assert set(prov['actualBundleHashes'].values())=={PINS['bundleSha256']}
  if role!='pr': assert prov['runCommit']==HEAD
 clips=[]
 for clip in s.get('clips',[]):
  t=clip['timing']; ratio=t['engineSeconds']/t['audioSeconds']; delta=t['audioSeconds']-t['engineSeconds']
  tol=max(.1,.05*t['audioSeconds']); guard=abs(delta)<=tol and abs(t['audioSeconds']-t['wallSeconds'])<=tol
  assert math.isclose(ratio,t['engineToAudioRatio'],rel_tol=1e-12)
  assert math.isclose(tol,t['toleranceSeconds'],rel_tol=1e-12) and guard==t['captureClockGuardPassed']
  state_checks=[c for c in checks if c['name']==f"audio {clip['name']}: audio and real game clocks advance during recording"]
  end_state=json.loads(state_checks[0]['detail']) if state_checks else None
  clips.append({**clip,'audioMinusEngineSeconds':delta,'guardExcessSeconds':max(0,abs(delta)-tol),'endpointArithmeticAgrees':True,'mediaBytesLocallyRecovered':False,'endStateFromClockAdvanceCheck':end_state})
 movement=[c for c in checks if c['name']=='iOS audio street: native movement advances and releases']
 release=json.loads(movement[0]['detail']) if movement else None
 f3=markers(text,'[f3-safari-audio]'); assert len(f3)<=1
 if f3: write(P/'transport'/f'{role}-f3-audio.json',f3[0])
 startupMarkers=markers(text,'[ios-safari-startup]'); assert len(startupMarkers)<=1
 startup=startupMarkers[0] if startupMarkers else s.get('safariStartup')
 if s.get('safariStartup') is not None: assert startup==s['safariStartup']
 inferred=bool(prov and checks and not startup)
 uploads=re.findall(r'Final size is (\d+) bytes\. Artifact ID is (\d+)',text)
 digests=re.findall(r'SHA256 digest of uploaded artifact zip is ([a-f0-9]{64})',text)
 metadata_path=P/'transport'/f'{role}-artifacts.json'; metadata=None
 if metadata_path.exists():
  envelope=json.loads(metadata_path.read_text()); metadata=envelope.get('structuredContent',envelope)
  matches=[x for x in metadata['artifacts'] if str(x['id']) in [i for _,i in uploads]]
  assert len(matches)==1
  metadata=matches[0]
  assert [str(metadata['size_in_bytes']),str(metadata['id'])] in [list(x) for x in uploads]
  assert metadata['digest']=='sha256:'+digests[0]
  assert metadata['workflow_run']['id']==runid and metadata['workflow_run']['head_sha']==HEAD
  assert metadata['workflow_run']['repository_id']==metadata['workflow_run']['head_repository_id']==1314923977
 assert set(re.findall(r'CINDERLINE_IOS_FRAME_WORK_CAPTURE: ([01])',text))=={'0'}
 r={'role':role,'runId':runid,'safariJobId':jobid,'runSourceHead':HEAD,'attempt':1,'event':run['event'],
    'jobStatus':job['status'],'safariConclusion':job['conclusion'],'summaryStatus':s['status'],
    'checks':len(checks),'failedChecks':failed,'failures':s.get('failures',[]),
    'captureEnabled':role!='standalone','captureStatus':s.get('captureStatus'),
    'provenance':prov,'checkoutCommitsFromLog':commits,
    'startupDirectSummary':startup,'startupGuardPassedDerivedFromPinnedHarnessAndReachedChecks':inferred,
    'clips':clips,'movementRelease':release,'lifecycle':s.get('lifecycle'),
    'interRecordingGapsDerivedFromReportedEndpoints':[{'after':before['name'],'before':after['name'],
       'gapMs':after['endStateFromClockAdvanceCheck']['wallMs']-after['timing']['wallSeconds']*1000-before['endStateFromClockAdvanceCheck']['wallMs'],
       'scope':'Derived wall endpoint gap; does not identify commands, CPU or damage cause.'}
       for before,after in zip(clips,clips[1:]) if before['endStateFromClockAdvanceCheck'] and after['endStateFromClockAdvanceCheck']],
    'frameWork':s.get('frameWork'),'f3Audio':f3[0] if f3 else None,
    'artifactUploadLogOnly':{'sizesAndIds':uploads,'zipSha256':digests,'metadataFetched':metadata is not None,'zipRecovered':False},
    'artifactMetadata':metadata,'profileEnvironmentObserved':'0',
    'reportOriginalBytesLocallyRecovered':False,
    'log':{'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'summaryCount':1,'trailingCleanupPresent':True,'fullDecodedResponseSaved':True}}
 results.append(r)
out={'status':'partial' if len(results)!=2 else 'complete','head':HEAD,'pins':PINS,'results':results,
'limits':['Summary endpoint arithmetic is checked. Original report and MP4 bytes have not been recovered locally.','Startup guard derivation from pinned harness is distinct from an explicit bootstrap URL/marker record.','No CPU/GPU root-cause or old clock/WDA complete repair claim.'],
'quality':{'all19':'not measured','validBlind':0,'completedUnits':0,'mode':'continuous'},
'work':{'startedAt':'2026-09-13T20:56:49+09:00','deadline':'2026-09-20T20:56:49+09:00'},
'remoteWrites':0,'ciStarts':0,'retries':0,'automationChanges':0}
write(P/'analysis.json',out)
for r in results:
 print(json.dumps({k:r[k] for k in ['role','safariConclusion','checks','failedChecks','captureStatus','startupDirectSummary','checkoutCommitsFromLog']},ensure_ascii=False))
 print(json.dumps({'role':r['role'],'clips':[{'name':c['name'],'timing':c['timing']} for c in r['clips']],'failures':r['failures']},ensure_ascii=False))
