"""Recover only startup-log bytes explicitly exported in already saved logs."""
from pathlib import Path
import json,base64,hashlib,re
P=Path(__file__).resolve().parent
allowed={'appium.log','simulator-selection.json','xcode-version.txt','xcode-path.txt','simulator-sdk-version.txt'}
allfiles=[]
for role in ['source','pr','standalone']:
 path=P/'transport'/f'{role}-safari.log'
 if not path.exists():continue
 groups={}
 for lineno,line in enumerate(path.read_text().splitlines(),1):
  for kind in ['meta','chunk','end']:
   tag=f'[ios-startup-log-{kind}] '
   if tag not in line:continue
   raw=line.split(tag,1)[1]
   if not raw.startswith('{'):continue
   d=json.loads(raw); name=d['file']; assert name in allowed,name
   g=groups.setdefault(name,{'meta':[],'chunk':[],'end':[]})
   g[kind].append((lineno,d))
 for name,g in groups.items():
  assert len(g['meta'])==len(g['end'])==1,(role,name,'missing/duplicate boundary')
  m=g['meta'][0][1];e=g['end'][0][1]
  assert all(m[k]==e[k] for k in ['bytes','sha256','complete'])
  chunks=g['chunk']; assert chunks
  offsets=[];parts=[]
  for line,c in chunks:
   b=base64.b64decode(c['base64'],validate=True);assert 0<len(b)<=3000
   assert g['meta'][0][0]<line<g['end'][0][0]
   offsets.append(c['offset']);parts.append(b)
  assert len(offsets)==len(set(offsets))
  ranges=m['ranges']; i=0
  for begin,end in ranges:
   pos=begin
   while pos<end:
    assert i<len(parts) and offsets[i]==pos,(role,name,pos)
    pos+=len(parts[i]);i+=1
   assert pos==end
  assert i==len(parts)
  data=b''.join(parts);complete=m['complete'] and m['stableDuringRead'] and ranges==[[0,m['bytes']]]
  if complete:
   assert len(data)==m['bytes'] and hashlib.sha256(data).hexdigest()==m['sha256']
   out=P/'original'/role/name;out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(data)
  else:
   out=P/'partial'/role/(name+'.ranges.bin');out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(data)
   out.with_suffix('.json').write_text(json.dumps(m,indent=2)+'\n')
  allfiles.append({'role':role,'file':name,'path':str(out.relative_to(P)),'exportedOriginalBytes':m['bytes'],
    'exportedOriginalSha256':m['sha256'],'recoveredBytes':len(data),'recoveredSha256':hashlib.sha256(data).hexdigest(),
    'chunks':len(parts),'ranges':ranges,'complete':complete,'stableDuringRead':m['stableDuringRead'],
    'boundaryLines':[g['meta'][0][0],g['end'][0][0]],'metaEndShaBytesMatch':True})
out={'status':'verified-exported-ranges' if allfiles else 'no-startup-raw-export-present','files':allfiles,'artifactMetadataReadByThisScript':False,'artifactArchiveRecovered':False}
(P/'startup-recovery-receipt.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out,indent=2))
