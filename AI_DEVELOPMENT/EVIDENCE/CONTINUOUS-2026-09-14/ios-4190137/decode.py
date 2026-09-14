from pathlib import Path
import re,json,base64,hashlib
r=Path(__file__).resolve().parent;raw=(r/'job.log').read_bytes();images=[];current=None;startup={};report=None
for line in raw.decode().splitlines():
 m=re.match(r'^\ufeff?\d{4}-\d\d-\d\dT\S+Z \[(ios-safari-report|ios-safari-image|ios-safari-image-data|ios-startup-log-meta|ios-startup-log-chunk|ios-startup-log-end|ios-startup-log-error)\] (.*)$',line)
 if not m:continue
 tag,s=m.groups()
 if tag=='ios-safari-report':report=json.loads(s)
 elif tag=='ios-safari-image':
  current={'meta':json.loads(s),'base64':[],'offset':0};images.append(current)
 elif tag=='ios-safari-image-data':
  off,b64=s.split(' ',1);assert current and int(off)==current['offset'];base64.b64decode(b64,validate=True);current['base64'].append(b64);current['offset']+=len(b64)
 elif tag=='ios-startup-log-meta':
  d=json.loads(s);assert d['file'] not in startup;startup[d['file']]={'meta':d,'chunks':[],'end':None}
 elif tag=='ios-startup-log-chunk':
  d=json.loads(s);startup[d['file']]['chunks'].append(d)
 elif tag=='ios-startup-log-end':
  d=json.loads(s);startup[d['file']]['end']=d
 elif tag=='ios-startup-log-error':raise AssertionError(s)
assert report and report['status']=='passed' and not report['failures']
(r/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
image_records=[]
for o in images:
 m=o['meta'];assert m['included'];b=base64.b64decode(''.join(o['base64']),validate=True);assert len(b)==m['bytes'] and hashlib.sha256(b).hexdigest()==m['sha256']
 name=Path(m['path']).name;assert name in ['ios-safari-pause.png','ios-safari-gameplay.png'];(r/name).write_bytes(b);image_records.append({'file':name,**m})
startup_records=[]
(r/'startup').mkdir(exist_ok=True)
for name,o in startup.items():
 assert name==Path(name).name;m=o['meta'];assert m['complete'] and o['end'] and m['stableDuringRead']
 parts=[];offset=0
 for c in o['chunks']:
  assert c['offset']==offset;b=base64.b64decode(c['base64'],validate=True);parts.append(b);offset+=len(b)
 b=b''.join(parts);assert len(b)==m['bytes'] and hashlib.sha256(b).hexdigest()==m['sha256']
 (r/'startup'/name).write_bytes(b);startup_records.append(m)
manifest={'commit':'4190137d65aa5f2973d89a3901b443d2d6167f9e','build_sha256':'3aa1d190dd286d73538f7f9266a45edfb3e440ad102c62faaef04c963adbb592','run_id':34816817217,'job_id':103889111738,'job_conclusion':'success','original_log':{'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()},'images':image_records,'startup_files':startup_records,'checks':len(report['checks']),'failures':report['failures'],'blind_comparison':False,'scope':'Actual iOS Simulator Mobile Safari checks and lossless native screenshots, not physical-device or blind-quality proof. Prior transient startup cause is not established by this successful repeat.'}
(r/'acquisition.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'checks':report['checks'],'images':image_records,'startup_files':len(startup_records),'keys':list(report)},ensure_ascii=False))
