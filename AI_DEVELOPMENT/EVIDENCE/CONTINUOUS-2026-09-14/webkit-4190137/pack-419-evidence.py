from pathlib import Path
import json,re,base64,hashlib,gzip,shutil
root=Path(__file__).resolve().parent
target=root/'survival/AI_DEVELOPMENT/EVIDENCE/CONTINUOUS-2026-09-14'
def sha(b): return hashlib.sha256(b).hexdigest()
def dump(p,x): p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
for dirname in ['webkit-4190137','ios-4190137']:
    src=root/dirname;dst=target/dirname;dst.mkdir(exist_ok=True)
    for name in ['acquisition.json','report.json','decode.py','decode-before-bom-fix.py']:
        if (src/name).exists(): shutil.copy2(src/name,dst/name)
    for p in src.glob('*.png'): shutil.copy2(p,dst/p.name)
    if (src/'startup').exists():
        (dst/'startup').mkdir(exist_ok=True)
        for p in (src/'startup').iterdir():
            if p.name=='appium.log': (dst/'startup/appium.log.gz').write_bytes(gzip.compress(p.read_bytes(),mtime=0))
            else: shutil.copy2(p,dst/'startup'/p.name)
    raw=(src/'job.log').read_bytes();pieces=[];reconstructed=[];current_image=None
    for line in raw.decode().splitlines(keepends=True):
        m=re.search(r'^\ufeff?\d{4}-\d\d-\d\dT\S+Z \[(webkit-material|ios-startup-log)-(chunk|meta)\] (.*)',line)
        image_meta=re.search(r'^\ufeff?\d{4}-\d\d-\d\dT\S+Z \[ios-safari-image\] (.*)',line)
        image_data=re.search(r'^\ufeff?\d{4}-\d\d-\d\dT\S+Z \[ios-safari-image-data\] (\d+) ([A-Za-z0-9+/=]+)',line)
        source=None
        if image_meta: current_image=Path(json.loads(image_meta.group(1))['path']).name
        if m and m.group(2)=='chunk':
            d=json.loads(m.group(3));source=('startup/' if m.group(1)=='ios-startup-log' else '')+d['file'];offset=d['offset']
            encoded=re.search(r'"base64":"([A-Za-z0-9+/=]+)"',line);a,b=encoded.span(1)
        elif image_data:
            source=current_image;offset=int(image_data.group(1))*3//4;a,b=image_data.span(2)
        if source:
            payload=base64.b64decode(line[a:b],validate=True);original=(src/source).read_bytes()
            assert original[offset:offset+len(payload)]==payload
            record={'prefix':line[:a],'source':source,'offset':offset,'bytes':len(payload),'suffix':line[b:]}
            pieces.append(record);reconstructed.append((record['prefix']+base64.b64encode(original[offset:offset+len(payload)]).decode()+record['suffix']).encode())
        else:
            pieces.append({'literal':line});reconstructed.append(line.encode())
    assert b''.join(reconstructed)==raw
    recipe={'format':'literal-or-source-base64-v1','original_bytes':len(raw),'original_sha256':sha(raw),'pieces':pieces}
    (dst/'job.log.lossless.json.gz').write_bytes(gzip.compress(json.dumps(recipe,ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
    dump(dst/'storage.json',{'original_log_bytes':len(raw),'original_log_sha256':sha(raw),'exact_reconstruction_verified':True,'recipe':'job.log.lossless.json.gz','source_files':'Paths are relative to this evidence directory. startup/appium.log is stored as startup/appium.log.gz and must be decompressed before slicing. PNG files are original unmodified bytes.','parser_recovery': 'GitHub log segments contain leading U+FEFF; parser accepts only that prefix and retains original bytes. The first iOS parse failed its strict offset assertion because the original parser skipped a BOM-prefixed chunk. decode-before-bom-fix.py retains that failure source; no delivery loss was observed after correction.'})
    print(dirname,sum(p.stat().st_size for p in dst.rglob('*') if p.is_file()))
src=root/'narrative-4190137';dst=target/'narrative-4190137';dst.mkdir(exist_ok=True)
for p in src.iterdir():
    if p.is_file() and p.name!='job.log':shutil.copy2(p,dst/p.name)
(dst/'job.log.gz').write_bytes(gzip.compress((src/'job.log').read_bytes(),mtime=0))
for dirname in ['narrative-reading-r2']:
    shutil.copytree(root/dirname,target/dirname,dirs_exist_ok=True)
dst=target/'disco-e9-method-r2';dst.mkdir(exist_ok=True)
# Do not publish the private third-party dialogue corpus or verbose source probes.
for name in ['review.json','refutation.json','validation.json','refutation-validation.json','probe-attempts.json','source-probe.py','context-probe.py']:
    shutil.copy2(root/'disco-e9-method-r2'/name,dst/name)
dump(dst/'private-evidence-pins.json',{'files':[{'file':p.name,'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in (root/'disco-e9-method-r2').glob('*.json') if not (dst/p.name).exists()],'retention':'Full third-party source probes remain private source-analysis material, not part of the game or public distribution. Published review and refutation state scope and source limitations.'})
shutil.copy2(__file__,target/'webkit-4190137/pack-419-evidence.py')
