"""Independent synthetic-only tests. Never downloads or launches a simulator."""
from pathlib import Path
import base64,contextlib,copy,hashlib,importlib.util,io,json,os,re,stat,struct,subprocess,sys,zipfile
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parent;BASE=ROOT.parent
CANDIDATE=BASE/'main-integration-c37/candidate'
spec=importlib.util.spec_from_file_location('candidate_recovery',CANDIDATE/'tools/recover-ios-startup-c36.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
checks=[]
def check(name,fn):fn();checks.append({'name':name,'passed':True})
def assert_(x,msg='assertion failed'):
 if not x:raise AssertionError(msg)
def rejects(fn,needle=None):
 try:fn()
 except Exception as e:
  if needle:assert needle in str(e),(needle,str(e))
  return
 raise AssertionError('expected rejection')
baseReport={'status':'failed','checks':[],'failures':['Error: WebDriver POST /session: connect ECONNREFUSED 127.0.0.1:8100'],'audioCapture':{'clips':[]}}
contents={name:(json.dumps(baseReport).encode() if name=='report.json' else b'{"status":"failed"}' if name=='f3-audio-verification.json' else ('synthetic '+name+'\n').encode()) for name in m.FILES}
def archive(files=None,extra=()):
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w',zipfile.ZIP_STORED) as z:
  for name,data in (contents if files is None else files).items():z.writestr(name,data)
  for info,data in extra:z.writestr(info,data)
 return out.getvalue()
def fixture(z):
 pin=dict(m.PIN,size_in_bytes=len(z),digest='sha256:'+m.sha(z))
 meta={k:pin[k] for k in ['id','name','size_in_bytes','digest']};meta.update(expired=False,workflow_run={'id':pin['runId'],'head_sha':pin['head'],'head_branch':pin['branch'],'repository_id':pin['repositoryId'],'head_repository_id':pin['repositoryId']})
 return meta,pin
def accepted(z):
 meta,pin=fixture(z);return m.recover(meta,z,pin)
def mutatefile(name,data):
 files=dict(contents);files[name]=data;return archive(files)
z=archive();meta,pin=fixture(z)
check('synthetic seven originals return byte-exact',lambda:assert_(accepted(z)==contents))
check('unknown safe entry is ignored',lambda:assert_(accepted(archive(extra=[('safe-extra.pid',b'123')]))==contents))
for key in ['id','name','size_in_bytes','digest']:
 def f(key=key):
  bad=copy.deepcopy(meta);bad[key]='wrong';rejects(lambda:m.recover(bad,z,pin),'metadata mismatch')
 check('reject wrong metadata '+key,f)
for key in ['id','head_sha','head_branch','repository_id','head_repository_id']:
 def f(key=key):
  bad=copy.deepcopy(meta);bad['workflow_run'][key]='wrong';rejects(lambda:m.recover(bad,z,pin),'run mismatch')
 check('reject wrong original workflow '+key,f)
check('reject expired artifact',lambda:rejects(lambda:m.recover(dict(meta,expired=True),z,pin),'expired'))
check('reject archive size change',lambda:rejects(lambda:m.recover(meta,z+b'x',pin),'size mismatch'))
check('reject same-size archive digest change',lambda:rejects(lambda:m.recover(meta,z[:-1]+bytes([z[-1]^1]),pin),'digest mismatch'))
check('reject missing required original',lambda:rejects(lambda:accepted(archive({k:v for k,v in contents.items() if k!='appium.log'})),'required original'))
for name in ['../escape.txt','/absolute.txt','path\\escape.txt']:
 check('reject traversal '+name,lambda name=name:rejects(lambda:accepted(archive(extra=[(name,b'x')])),'unsafe archive'))
link=zipfile.ZipInfo('link');link.create_system=3;link.external_attr=(stat.S_IFLNK|0o777)<<16
check('reject symlink',lambda:rejects(lambda:accepted(archive(extra=[(link,b'appium.log')])),'unsafe archive'))
with __import__('warnings').catch_warnings():
 __import__('warnings').simplefilter('ignore');duplicate=archive(extra=[('appium.log',b'duplicate')])
check('reject duplicate entry',lambda:rejects(lambda:accepted(duplicate),'duplicate archive'))
check('reject more than 32 entries',lambda:rejects(lambda:accepted(archive(extra=[('x'+str(i),b'') for i in range(26)])),'entry count'))
check('reject invalid UTF-8 before export',lambda:rejects(lambda:accepted(mutatefile('appium.log',b'\xff'))))
# In-memory synthetic metadata can use its own digest; production pins remain unchanged.
def oversized_selected():
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as az:
  for n,b in contents.items():az.writestr(n,b'X'*(m.FILES[n]+1) if n=='appium.log' else b)
 rejects(lambda:accepted(out.getvalue()),'file exceeds bound')
check('reject selected file expansion over cap',oversized_selected)
def total_expansion():
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as az:
  for n,b in contents.items():az.writestr(n,b)
  az.writestr('ignored-large',b'X'*(16*1024*1024))
 rejects(lambda:accepted(out.getvalue()),'archive expansion')
check('reject total archive expansion including unselected files',total_expansion)
def crc():
 corrupt=bytearray(z)
 with zipfile.ZipFile(io.BytesIO(z)) as az:
  i=az.getinfo('appium.log');offset=i.header_offset;nl,el=struct.unpack_from('<HH',corrupt,offset+26);corrupt[offset+30+nl+el]^=1
 rejects(lambda:accepted(bytes(corrupt)),'CRC')
check('reject corrupted selected CRC after synthetic digest update',crc)
for label,changes in [('passed status',{'status':'passed'}),('nonempty checks',{'checks':[{}]}),('other failure',{'failures':['execute/sync error']}),('extra failure',{'failures':baseReport['failures']+['another']}),('unexpected captured clip',{'audioCapture':{'clips':[{'path':'synthetic.mp4'}]}})]:
 check('reject '+label,lambda changes=changes:rejects(lambda:accepted(mutatefile('report.json',json.dumps(dict(baseReport,**changes)).encode()))))
check('reject passed F3',lambda:rejects(lambda:accepted(mutatefile('f3-audio-verification.json',b'{"status":"passed"}')),'audio gate'))
def emission():
 data=('日本語\n'*1300).encode();capture=io.StringIO()
 with contextlib.redirect_stdout(capture):m.emit('synthetic.txt',data,{'fixtureOnly':True})
 rows=[json.loads(line.split('] ',1)[1]) for line in capture.getvalue().splitlines()];first,last=rows[0],rows[-1]
 assert first==last and first['sha256']==m.sha(data) and first['bytes']==len(data)
 chunks=rows[1:-1];assert len(chunks)==first['total']
 rebuilt=b''
 for i,c in enumerate(chunks):
  raw=base64.b64decode(c['base64'],validate=True);assert c['index']==i and c['offset']==len(rebuilt) and len(raw)<=3000;rebuilt+=raw
 assert rebuilt==data
check('UTF-8 and 3000-byte original chunk transfer roundtrip',emission)
# Inspect complete YAML, then execute the exact embedded Node script against fixtures.
import yaml
oldRoot=BASE/'main-integration-c36/candidate'
oldG=yaml.safe_load((oldRoot/'.github/workflows/gates.yml').read_text());newG=yaml.safe_load((CANDIDATE/'.github/workflows/gates.yml').read_text())
job=newG['jobs'].pop('recover-ios-startup-c36');check('all original Floor jobs and top-level conditions unchanged',lambda:assert_(newG==oldG))
check('only source push attempt1 with fixed marker can run recovery job',lambda:assert_(job['if']=="github.event_name == 'push' && github.ref == 'refs/heads/claude/repo-instructions-constraints-r0070m' && github.run_attempt == 1 && contains(github.event.head_commit.message, '[recover-ios-startup-c36-r1]')"))
check('recovery token permissions read-only',lambda:assert_(job['permissions']=={'contents':'read','actions':'read'} and job['steps'][0]['with']['persist-credentials'] is False))
check('fixed official GET metadata then ZIP; no credential extraction',lambda:assert_(job['steps'][1]['run'].index('gh api repos/bachikoljunior-blip/survival/actions/artifacts/10360954160 >')>=0 and job['steps'][2]['run']=='gh api repos/bachikoljunior-blip/survival/actions/artifacts/10360954160/zip > test-results/ios-startup-c36-original-recovery-r1/original.zip' and all('-X POST' not in s.get('run','') for s in job['steps'])))
oldM=yaml.safe_load((oldRoot/'.github/workflows/mobile-simulator.yml').read_text());newM=yaml.safe_load((CANDIDATE/'.github/workflows/mobile-simulator.yml').read_text());oi=next(i for i,s in enumerate(oldM['jobs']['ios-safari']['steps']) if s.get('name')=='Emit startup diagnostics in ordinary CI log');oldStep=oldM['jobs']['ios-safari']['steps'][oi];newStep=newM['jobs']['ios-safari']['steps'][oi]
newCopy=copy.deepcopy(newM);newCopy['jobs']['ios-safari']['steps'][oi]=oldStep
check('mobile env acquisition frame-work guards and other steps unchanged',lambda:assert_(newCopy==oldM))
code=newStep['run'].split("<<'NODE'\n",1)[1].rsplit('\nNODE',1)[0]
fixtureRoot=ROOT/'fixtures/condition';work=fixtureRoot/'test-results/ios-safari';work.mkdir(parents=True,exist_ok=True)
for n,_ in [('appium.log',0),('simulator-selection.json',0),('xcode-version.txt',0),('xcode-path.txt',0),('simulator-sdk-version.txt',0)]:(work/n).write_text('SYNTHETIC '+n+'\n')
def condition(name,audio,report,want):
 path=work/'report.json'
 if report is None:path.unlink(missing_ok=True)
 else:path.write_bytes(report if isinstance(report,bytes) else json.dumps(report).encode())
 result=subprocess.run(['node','--input-type=module','-e',code],cwd=fixtureRoot,env={**os.environ,'CINDERLINE_IOS_AUDIO_CAPTURE':audio},text=True,capture_output=True)
 assert result.returncode==0,(name,result.stderr)
 count=sum('[ios-startup-log-meta]' in line for line in result.stdout.splitlines());assert count==want,(name,count,want)
 return {'name':name,'audio':audio,'emittedFileCount':count,'exitCode':result.returncode}
cases=[('ordinary non-audio unchanged','0',None,5),('audio missing report','1',None,0),('audio malformed report','1',b'broken',0),('audio successful report','1',{'status':'passed','checks':[],'failures':[]},0),('audio real-shaped pre-session failure','1',baseReport,5),('audio recorded later failure','1',{'status':'failed','checks':[{}],'failures':baseReport['failures']},0),('audio execute-sync failure before checks','1',{'status':'failed','checks':[],'failures':['WebDriver POST /session/id/execute/sync: error']},0),('audio no-session-id fallback','1',{'status':'failed','checks':[],'failures':['Appium did not return a session id']},0),('audio empty failures','1',{'status':'failed','checks':[],'failures':[]},0),('audio wrong check shape','1',{'status':'failed','checks':None,'failures':baseReport['failures']},0),('audio wrong failure shape','1',{'status':'failed','checks':[],'failures':[None,42]},0)]
conditionResults=[]
for args in cases:
 result=condition(*args);conditionResults.append(result);checks.append({'name':args[0],'passed':True})
# Fixed original digest must remain compiled into candidate after all fixtures.
check('production PIN remained fixed',lambda:assert_(m.PIN['digest']=='sha256:b40c9691451187b79db2d9263f19f52756abacb2e23f88e5d285b691d50b7113' and m.PIN['size_in_bytes']==97944))
result={'status':'passed','syntheticOnly':True,'checks':checks,'namedCheckCount':len(checks),'conditionFixtures':conditionResults,'realArtifactDownloaded':False,'realRecoveryProven':False,'simulatorStarted':False,'remoteWrites':0,'ciLaunches':0,'productChanges':0}
(ROOT/'fixture-results.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='checks' and k!='conditionFixtures'}))
