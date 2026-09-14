import json,hashlib,base64,re
from pathlib import Path
R=Path(__file__).resolve().parent
raw=(R/'job.log').read_bytes();current=None;out=[]
for line in raw.decode().splitlines():
 if '[story-transcript] ' in line:
  if current:out.append(current)
  current={'metadata':json.loads(line.split('[story-transcript] ',1)[1]),'parts':[],'expected_base64_offset':0}
 elif '[story-transcript-data] ' in line:
  assert current
  off,b64=line.split('[story-transcript-data] ',1)[1].split(' ',1);b=base64.b64decode(b64,validate=True)
  assert int(off)==current['expected_base64_offset'];current['parts'].append(b);current['expected_base64_offset']+=len(b64)
if current:out.append(current)
records=[]
for o in out:
 m=o['metadata'];b=b''.join(o['parts']);assert len(b)==m['bytes'] and hashlib.sha256(b).hexdigest()==m['sha256']
 name='transcript-'+m['language']+'-'+m['path']+'.json';(R/name).write_bytes(b);d=json.loads(b)
 ends=[e for e in d['events'] if e['kind']=='ending'];rec={'file':name,**m,'events':len(d['events']),'ending_events':len(ends),'captureSucceeded':d.get('captureSucceeded'),'executionSucceeded':d.get('executionSucceeded'),'ending':ends}
 records.append(rec)
manifest={'commit':'4190137d65aa5f2973d89a3901b443d2d6167f9e','build_sha256':'3aa1d190dd286d73538f7f9266a45edfb3e440ad102c62faaef04c963adbb592','run_id':34816817214,'job_id':103889111498,'job_conclusion':'success','original_log':{'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()},'records':records,'blind_comparison':False,'scope':'Original emitted actual UI words from the disclosed shortcut driver, not ordinary full-route traversal or an element verdict.'}
(R/'acquisition.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
for x in records:print(json.dumps(x,ensure_ascii=False))
