from pathlib import Path
import subprocess,hashlib,json,os,re
root=Path(__file__).resolve().parent
fixture=root/'workflow-fixture';out=fixture/'test-results/ios-safari';out.mkdir(parents=True,exist_ok=True)
files={'appium.log':b'SYNTHETIC command log line\n'*20000,'simulator-selection.json':b'{"synthetic":true}\n','xcode-version.txt':b'SYNTHETIC Xcode\n','xcode-path.txt':b'/SYNTHETIC\n','simulator-sdk-version.txt':b'18.5\n'}
for name,data in files.items():(out/name).write_bytes(data)
checks=[];cases=[]
def run(script,audio):
 r=subprocess.run(['node',str(root/script)],cwd=fixture,env={**os.environ,'CINDERLINE_IOS_AUDIO_CAPTURE':audio},capture_output=True,timeout=15)
 return {'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr}
def normalized(data):
 result=[]
 for line in data.decode().splitlines():
  marker,sep,body=line.partition(' ')
  if marker=='[ios-startup-log-skip]':result.append((marker,body));continue
  value=json.loads(body);value.pop('capturedAt',None);result.append((marker,value))
 return result
passed={'status':'passed','checks':[{'passed':True}],'failures':[]}
variants=[('passed',passed),('empty-checks',{**passed,'checks':[]}),('false-check',{**passed,'checks':[{'passed':False}]}),('null-check',{**passed,'checks':[None]}),('missing-checks',{'status':'passed','failures':[]}),('nonarray-checks',{**passed,'checks':{}}),('failure-present',{**passed,'failures':['failed']}),('missing-failures',{'status':'passed','checks':[{'passed':True}]}),('session-failed',{'status':'failed','checks':[],'failures':['WebDriver POST /session: SYNTHETIC rejection']}),('later-failed',{'status':'failed','checks':[{'passed':True}],'failures':['WebDriver POST /session: SYNTHETIC rejection']}),('other-failed',{'status':'failed','checks':[],'failures':['SYNTHETIC unrelated error']}),('invalid-json','INVALID JSON'),('missing-report',None)]
for name,report in variants:
 for audio in ['0','1']:
  path=out/'report.json'
  if report is None:path.unlink(missing_ok=True)
  else:path.write_text(report if isinstance(report,str) else json.dumps(report))
  before=run('startup-export-before.mjs',audio);after=run('startup-export.mjs',audio)
  assert before['exit']==0 and after['exit']==0,(name,audio,after['stderr'])
  if name=='passed':
   assert after['stdout'].count(b'\n')==1 and after['stdout'].startswith(b'[ios-startup-log-skip] ')
   if audio=='0':assert len(before['stdout'])>500000
  else:assert normalized(before['stdout'])==normalized(after['stdout']),(name,audio)
  assert all((out/n).read_bytes()==b for n,b in files.items())
  cases.append({'name':name,'audio':audio,'passed':True,'beforeStdoutBytes':len(before['stdout']),'afterStdoutBytes':len(after['stdout']),'beforeExit':before['exit'],'afterExit':after['exit'],'originalFilesUnchanged':True})
checks.append({'name':'26 actual extracted Node branch cases including null regression; all original logs unchanged','passed':True})
# Evaluate the actual expression with its JavaScript boolean/string semantics;
# this is an expression fixture, not an execution of the GitHub service.
workflow=(root.parent/'main-integration-c38/candidate/.github/workflows/mobile-simulator.yml').read_text()
expression=re.search(r'CINDERLINE_IOS_FRAME_WORK_CAPTURE: \$\{\{ (.*?) \}\}',workflow).group(1)
routes=[]
for name,inputs,github,expected in [
 ('first-source-floor',{'capture_audio':True},{'run_attempt':1,'event_name':'push','ref':'refs/heads/claude/repo-instructions-constraints-r0070m','event':{'head_commit':{'message':'[ios-frame-work-c38-r1]'}}},'1'),
 ('source-rerun',{'capture_audio':True},{'run_attempt':2,'event_name':'push','ref':'refs/heads/claude/repo-instructions-constraints-r0070m','event':{'head_commit':{'message':'[ios-frame-work-c38-r1]'}}},'0'),
 ('pr',{'capture_audio':True},{'run_attempt':1,'event_name':'pull_request','ref':'refs/pull/16/merge','event':{'head_commit':{'message':'[ios-frame-work-c38-r1]'}}},'0'),
 ('standalone-push',{}, {'run_attempt':1,'event_name':'push','ref':'refs/heads/claude/repo-instructions-constraints-r0070m','event':{'head_commit':{'message':'[ios-frame-work-c38-r1]'}}},'0'),
 ('standalone-dispatch',{'capture_audio':True},{'run_attempt':1,'event_name':'workflow_dispatch','ref':'refs/heads/claude/repo-instructions-constraints-r0070m','event':{'head_commit':{'message':'[ios-frame-work-c38-r1]'}}},'0'),
 ('wrong-ref',{'capture_audio':True},{'run_attempt':1,'event_name':'push','ref':'refs/heads/main','event':{'head_commit':{'message':'[ios-frame-work-c38-r1]'}}},'0'),
 ('missing-marker',{'capture_audio':True},{'run_attempt':1,'event_name':'push','ref':'refs/heads/claude/repo-instructions-constraints-r0070m','event':{'head_commit':{'message':'normal save'}}},'0'),
 ('old-marker',{'capture_audio':True},{'run_attempt':1,'event_name':'push','ref':'refs/heads/claude/repo-instructions-constraints-r0070m','event':{'head_commit':{'message':'[ios-frame-work-c36-r1]'}}},'0')]:
  js='const inputs='+json.dumps(inputs)+';const github='+json.dumps(github)+';const contains=(a,b)=>a.includes(b);process.stdout.write('+expression+');'
  actual=subprocess.check_output(['node','--input-type=module','-e',js],cwd=fixture).decode();assert actual==expected
  routes.append({'name':name,'actual':actual,'expected':expected,'passed':True})
base=(root.parent/'main-integration-c37/candidate/.github/workflows/mobile-simulator.yml').read_text()
assert workflow.split('      - name: Preserve Safari screenshots, video, logs and report\n')[1]==base.split('      - name: Preserve Safari screenshots, video, logs and report\n')[1]
assert workflow.split('      - name: Verify required original audio, provenance and unchanged clock guards\n')[1].split('      - name: Stop recording\n')[0]==base.split('      - name: Verify required original audio, provenance and unchanged clock guards\n')[1].split('      - name: Stop recording\n')[0]
result={'scope':'Synthetic local execution of exact workflow Node blocks and JS expression; no GitHub job or Safari execution','checksPassed':len(cases)+len(routes)+2,'cases':cases,'profileRoutes':routes,'alwaysArtifactAndRequiredF3StepsUnchanged':True,'logInputBytes':sum(map(len,files.values())),'originalLogsSha256':{n:hashlib.sha256(b).hexdigest() for n,b in files.items()},'finalWorkflowSha256':hashlib.sha256(workflow.encode()).hexdigest()}
(root/'workflow-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'passed':result['checksPassed'],'successfulOrdinary':cases[0],'finalWorkflowSha256':result['finalWorkflowSha256']}))
