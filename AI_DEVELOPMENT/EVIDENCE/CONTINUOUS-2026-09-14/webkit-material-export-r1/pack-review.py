from pathlib import Path
import json,hashlib,tarfile,gzip,base64,re,io,shutil
R=Path('survival').resolve(); S=Path('webkit-material-export-r1'); D=R/'AI_DEVELOPMENT/EVIDENCE/CONTINUOUS-2026-09-14/webkit-material-export-r1';D.mkdir(exist_ok=True)
P=R/'AI_DEVELOPMENT/EVIDENCE/CONTINUOUS-2026-09-14/webkit-d19c424'
hashit=lambda b:hashlib.sha256(b).hexdigest()
index=[]; duplicate=[]; recipes={}
for p in S.rglob('*'):
 if not p.is_file():continue
 rel=str(p.relative_to(S)); b=p.read_bytes()
 index.append({'path':rel,'bytes':len(b),'sha256':hashit(b)})
 if '/prior-originals/' in rel or '/fixture-prior-originals/' in rel:
  q=P/p.name
  if not q.is_file(): continue # synthetic unallowlisted control stays in the raw archive
  assert q.read_bytes()==b,(p,q)
  duplicate.append({'path':rel,'repository_source':str(q.relative_to(R)),'sha256':hashit(b),'bytes':len(b)})
 elif rel in ['raw/prior-originals.stdout.log.gz','refuter-prior-originals-01.stdout.log.gz']:
  original=gzip.decompress(b); lines=[]; recovered=[]
  for line in original.splitlines(keepends=True):
   if line.startswith(b'[webkit-material-chunk] '):
    obj=json.loads(line.split(b'] ',1)[1]); raw=base64.b64decode(obj['base64'],validate=True)
    q=P/obj['file']; assert q.name==obj['file']; data=q.read_bytes()[obj['offset']:obj['offset']+len(raw)];assert data==raw
    marker=b'"base64":"'; start=line.index(marker)+len(marker); end=line.index(b'"',start)
    prefix=line[:start].decode(); suffix=line[end:].decode()
    lines.append({'prefix':prefix,'source':str(q.relative_to(R)),'offset':obj['offset'],'bytes':len(raw),'suffix':suffix})
    recovered.append(prefix.encode()+base64.b64encode(data)+suffix.encode())
   else:
    lines.append({'literal':line.decode()});recovered.append(line)
  assert b''.join(recovered)==original
  recipe={'scope':'Lossless storage of original decompressed stdout using already committed original PNG/report bytes. No source/result alteration. Gzip wrapper is replaced; its original digest remains in the source index.', 'original_stdout_bytes':len(original),'original_stdout_sha256':hashit(original),'original_gzip_sha256':hashit(b),'lines':lines}
  recipes[rel]=json.dumps(recipe,ensure_ascii=False,separators=(',',':')).encode()
with tarfile.open(D/'raw-review.tar.gz','w:gz') as tar:
 omit={x['path'] for x in duplicate}|set(recipes)
 for p in sorted(S.rglob('*')):
  if p.is_file() and str(p.relative_to(S)) not in omit:tar.add(p,arcname=str(p.relative_to(S)),recursive=False)
 for rel,b in recipes.items():
  info=tarfile.TarInfo(rel+'.lossless.json');info.size=len(b);tar.addfile(info,io.BytesIO(b))
 data=json.dumps({'duplicate_inputs':duplicate,'source_file_index':index},ensure_ascii=False,indent=2).encode();info=tarfile.TarInfo('lossless-storage-index.json');info.size=len(data);tar.addfile(info,io.BytesIO(data))
for f in ['review.json','refuter-review.json','pins.json','manifest.json']:
 shutil.copyfile(S/f,D/f)
archive=(D/'raw-review.tar.gz').read_bytes()
(D/'provenance.json').write_text(json.dumps({'scope':'Independent byte transport verification with separate refutation, not native game or blind comparison.','archive':{'file':'raw-review.tar.gz','bytes':len(archive),'sha256':hashit(archive)},'duplicate_inputs_referenced':len(duplicate),'original_stdout_streams_losslessly_preserved':len(recipes),'verification':'Both original decoded stdout byte streams were reconstructed from the stored literals and exact committed input ranges; equality asserted before archiving. Original source index preserves all digests, including replaced gzip wrappers.','blind_comparisons':0},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'archive_bytes':len(archive),'sources':len(index),'deduplicated_inputs':len(duplicate),'lossless_stdout_streams':len(recipes)}))
