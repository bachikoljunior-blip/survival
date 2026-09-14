from pathlib import Path
import re,json,base64,hashlib
r=Path(__file__).resolve().parent
raw=(r/'job.log').read_bytes()
files={}
for line in raw.decode().splitlines():
    m=re.match(r'^\ufeff?\d{4}-\d\d-\d\dT\S+Z \[webkit-material-(meta|chunk|end|error)\] (.*)$',line)
    if not m: continue
    tag,s=m.groups();d=json.loads(s);name=d['file']
    assert name==Path(name).name
    if tag=='meta':
        assert name not in files and d['complete'] and d['stableDuringRead']
        assert d['commit']=='4190137d65aa5f2973d89a3901b443d2d6167f9e'
        files[name]={'meta':d,'parts':[],'offset':0,'end':None}
    elif tag=='chunk':
        o=files[name];assert d['offset']==o['offset']
        b=base64.b64decode(d['base64'],validate=True);o['parts'].append(b);o['offset']+=len(b)
    elif tag=='end':
        assert files[name]['end'] is None;files[name]['end']=d
    else: raise AssertionError(s)
assert set(files)=={'report.json',*[f'visual-{s}-frame.png' for s in ['stacks','marrow','arcade','cinder','survey','ventfield','south','plant','marrow_roof']]}
records=[]
for name,o in files.items():
    b=b''.join(o['parts']);sha=hashlib.sha256(b).hexdigest();m=o['meta'];e=o['end']
    assert e and len(b)==m['bytes']==e['bytes'] and sha==m['sha256']==e['sha256']
    (r/name).write_bytes(b);records.append(m)
report=json.loads((r/'report.json').read_text())
manifest={'commit':'4190137d65aa5f2973d89a3901b443d2d6167f9e','build_sha256':'3aa1d190dd286d73538f7f9266a45edfb3e440ad102c62faaef04c963adbb592','run_id':34816817214,'job_id':103889111405,'job_conclusion':'success','original_log':{'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()},'files':records,'parser':'Optional leading U+FEFF before GitHub log timestamps; original log bytes retained without transformation. Strict byte offsets, lengths and SHA-256 checks.','scope':'Actual mobile WebKit material; no blind quality comparison or physical-device claim.'}
(r/'acquisition.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'files':len(records),'bytes':sum(x['bytes'] for x in records),'report_keys':list(report),'status':report.get('status'),'failures':report.get('failures')},ensure_ascii=False))
