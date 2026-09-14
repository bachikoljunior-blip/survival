"""Pair original Appium HTTP commands; absence of a recovered file is not proof."""
from pathlib import Path
from collections import defaultdict
from datetime import datetime
import json,re,hashlib
P=Path(__file__).resolve().parent
results=[]
for role in ['source','pr','standalone']:
 f=P/'original'/role/'appium.log'
 if not f.exists():
  results.append({'role':role,'status':'original Appium log not locally recovered','inlineCommandOmissionDirectlyVerified':False});continue
 raw=f.read_bytes();pending=defaultdict(list);commands=[]
 for n,line in enumerate(raw.decode().splitlines(),1):
  m=re.search(r'\[HTTP\] --> (\S+) (\S+)(?: (.*))?',line)
  if m:
   body=m[3] or '';parsed=None
   try:parsed=json.loads(body)
   except json.JSONDecodeError:pass
   pending[(m[1],m[2])].append({'requestLine':n,'start':line[:23],'method':m[1],'route':m[2],
    'body':body,'parsedBody':parsed,'loggedBodyCompleteJson':parsed is not None})
  m=re.search(r'\[HTTP\] <-- (\S+) (\S+) (\d+) (\d+) ms(?: - (\d+))?',line)
  if m:
   key=(m[1],m[2]);assert pending[key],(role,n,'unmatched response')
   c=pending[key].pop(0);c.update(responseLine=n,end=line[:23],status=int(m[3]),appiumElapsedMs=int(m[4]),loggedResponseBytes=int(m[5]) if m[5] else None)
   fmt='%Y-%m-%d %H:%M:%S:%f';c['logEndpointMs']=round((datetime.strptime(c['end'],fmt)-datetime.strptime(c['start'],fmt)).total_seconds()*1000)
   commands.append(c)
 unpaired=[c for group in pending.values() for c in group]
 ops=[];active=None
 for c in commands:
  if 'var job = window[key]' in c['body']:
   assert active is None,(role,'overlap')
   active={'startRequestLine':c['requestLine'],'startBodyExcerpt':c['body'][:1200],'commands':[]}
  if active is not None:
   active['commands'].append(c)
   parsed=c['parsedBody']
   if 'delete window[' in c['body'] and parsed and len(parsed.get('args',[]))==1:
    active['id']=parsed['args'][0];active['cleanupRequestLine']=c['requestLine']
    active['inlinePolls']=[x['requestLine'] for x in active['commands'] if 'inlineJson:' in x['body']]
    active['sliceReads']=[x['requestLine'] for x in active['commands'] if 'j.json.slice' in x['body']]
    active['mediaUploadLaunches']=[x['requestLine'] for x in active['commands'] if 'async function startIosAudioUpload' in x['body']]
    ops.append(active);active=None
 def compact(c):return {k:v for k,v in c.items() if k not in ['body','parsedBody']}
 out={'role':role,'status':'original HTTP log paired','bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),
  'pairedCommands':len(commands),'unpairedCommands':len(unpaired),'finishedOperations':len(ops),
  'operations':[dict(x,commands=[compact(c) for c in x['commands']]) for x in ops],
  'unfinishedOperation':active is not None,'inlineCommandOmissionDirectlyVerified':False,
  'interpretation':'Operation identity and complete ordered command intervals are preserved. A specific ready-small operation must be identified from original responses/report before claiming omission. Appium HTTP elapsed is not browser CPU/GPU time.'}
 (P/'transport'/f'{role}-appium-commands.json').write_text(json.dumps(commands,ensure_ascii=False,indent=2)+'\n')
 results.append(out)
(P/'inline-observation.json').write_text(json.dumps({'results':results,'noTimingCausalityClaimed':True},ensure_ascii=False,indent=2)+'\n')
print(json.dumps([{'role':r['role'],'status':r['status'],'paired':r.get('pairedCommands'),'operations':r.get('finishedOperations')} for r in results]))
