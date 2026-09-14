"""Inspect the existing single run only after it reaches a recorded terminal status."""
from pathlib import Path
import datetime, hashlib, json, re

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = HERE/'audit-terminal-raw.json'
assert not OUT.exists(), 'Do not overwrite an earlier terminal audit.'
provenance_bytes = (HERE/'provenance.json').read_bytes()
prov = json.loads(provenance_bytes)
assert prov['status'] in ('process_completed','process_timeout'), 'Refuse to audit a running process as a final result.'

def digest(b):
    return hashlib.sha256(b).hexdigest()

def pin(path):
    b = path.read_bytes()
    return {'path':str(path.relative_to(ROOT)),'bytes':len(b),'sha256':digest(b)}

stdout = (HERE/'stdout.txt').read_bytes()
stderr = (HERE/'stderr.txt').read_bytes()
lines = stderr.decode('utf-8',errors='replace').splitlines()
media = []
selected = []
errors = []
for line_no,line in enumerate(lines,1):
    start = re.search(r'encoding mtmd batch, n_chunks = (\d+) \(done = (\d+), total = (\d+)\)',line)
    enc_done = re.search(r'mtmd batch encoding done in (\d+) ms',line)
    dec_start = re.search(r'decoding image batch (\d+)/(\d+), n_tokens_batch = (\d+)',line)
    dec_done = re.search(r'image decoded \(batch (\d+)/(\d+)\) in (\d+) ms',line)
    if start:
        chunks,chunk_index,total = map(int,start.groups())
        media.append({'sequence':len(media)+1,'n_chunks':chunks,'chunk_index':chunk_index,
                      'all_chunk_count':total,'encode_start_line':line_no,
                      'encoded':False,'decode_batches':[]})
        selected.append({'line':line_no,'text':line})
    elif enc_done:
        assert media
        media[-1].update(encoded=True,encode_ms=int(enc_done.group(1)),encode_done_line=line_no)
        selected.append({'line':line_no,'text':line})
    elif dec_start:
        assert media
        i,n,tokens = map(int,dec_start.groups())
        media[-1]['decode_batches'].append({'index':i,'total':n,'tokens':tokens,'start_line':line_no,'completed':False})
        selected.append({'line':line_no,'text':line})
    elif dec_done:
        assert media and media[-1]['decode_batches']
        i,n,ms = map(int,dec_done.groups())
        batch=media[-1]['decode_batches'][-1]
        assert (batch['index'],batch['total']) == (i,n)
        batch.update(completed=True,decode_ms=ms,done_line=line_no)
        selected.append({'line':line_no,'text':line})
    if re.search(r'failed to decode|Failed to encode|Unable to (?:decode|eval|tokenize)|GGML_ASSERT|out of memory|context shift|out of context|Error',line):
        errors.append({'line':line_no,'text':line})

mapping_safe = all(m['n_chunks']==1 and m['chunk_index']==2*i+1 and m['all_chunk_count']==33 for i,m in enumerate(media))
for i,m in enumerate(media):
    m['label_from_verified_cli_order'] = prov['files'][i]['label'] if mapping_safe and i<len(prov['files']) else None
    m['mapping_is_inference_from_fixed_argv_and_source_order'] = True
    batches=m['decode_batches']
    count=batches[0]['total'] if batches else 0
    m['logged_decode_started_tokens']=sum(b['tokens'] for b in batches)
    m['logged_decode_completed_tokens']=sum(b['tokens'] for b in batches if b['completed'])
    m['all_decode_batches_completed']=bool(count and len(batches)==count and all(b['completed'] for b in batches) and [b['index'] for b in batches]==list(range(1,count+1)))
    m['image_processing_completed']=m['encoded'] and m['all_decode_batches_completed']

out = {
 'recorded_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'scope':'Terminal-status audit of exactly the existing frozen one-run output. No rerun, model execution, image transformation or product edit.',
 'provenance':prov,
 'source_pins':[pin(ROOT/'visual-comparison-runtime-r1/prepare-and-run.py'),
                pin(ROOT/'audio-evaluator-diagnostic-source-mtmd-cli.cpp'),
                pin(ROOT/'audio-evaluator-diagnostic-source-mtmd-helper.cpp'),
                pin(HERE/'packet/prompt.txt'),pin(HERE/'audit-original-observations.json')],
 'terminal_file_pins':[
    {'path':'comparison-c02e/provenance.json','bytes':len(provenance_bytes),'sha256':digest(provenance_bytes)},
    {'path':'comparison-c02e/stdout.txt','bytes':len(stdout),'sha256':digest(stdout)},
    {'path':'comparison-c02e/stderr.txt','bytes':len(stderr),'sha256':digest(stderr)}],
 'stdout_utf8':stdout.decode('utf-8',errors='replace'),
 'stderr_line_count':len(lines),'stderr_selected_raw_lines':selected,'stderr_error_candidates':errors,
 'media_sequence':media,'mapping_pattern_supported':mapping_safe,
 'counts':{'image_files_in_frozen_argv':len(prov['files']),
           'encode_started':len(media),'encode_completed':sum(m['encoded'] for m in media),
           'fully_decoded_images':sum(m['image_processing_completed'] for m in media),
           'logged_decode_completed_tokens':sum(m['logged_decode_completed_tokens'] for m in media)},
 'limits':'Tokens are observed image-embedding decode batch counts, not a claim of semantic comprehension. Encoding complete alone is not decoded input complete. An announced decoding batch is counted as complete only when its matching post-decode success log exists. A final M-RoPE coordinate is not used as an ingestion count. Source recognition and preference must be audited from a completed answer, if present.'
}
assert (HERE/'provenance.json').read_bytes()==provenance_bytes, 'Provenance changed during audit.'
assert (HERE/'stdout.txt').read_bytes()==stdout and (HERE/'stderr.txt').read_bytes()==stderr, 'Output changed during audit.'
OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'output':str(OUT),'sha256':digest(OUT.read_bytes()),
                  'status':prov['status'],'exit_code':prov.get('exit_code'),
                  'seconds':prov.get('seconds'),'counts':out['counts'],
                  'mapping_pattern_supported':mapping_safe,
                  'stdout_bytes':len(stdout),'stderr_bytes':len(stderr)},indent=2))
