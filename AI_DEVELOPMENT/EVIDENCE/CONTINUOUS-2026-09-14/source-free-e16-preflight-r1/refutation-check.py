"""Read-only independent source/input check. Never invokes a model or rewrites inputs."""
from pathlib import Path
import datetime, hashlib, json, math, re, struct

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).with_name('refutation-raw.json')
assert not OUT.exists(), 'Preserve earlier evidence; use a fresh filename for another check.'

def sha(b):
    return hashlib.sha256(b).hexdigest()

def record(rel):
    p = ROOT / rel
    b = p.read_bytes()
    return {'path': rel, 'bytes': len(b), 'sha256': sha(b)}

def gguf_header(path):
    # Parse only GGUF metadata, not tensors; bound every actual read.
    limit = 12 * 1024 * 1024
    with path.open('rb') as f:
        captured = bytearray()
        def read(n):
            assert n >= 0 and len(captured) + n <= limit
            b = f.read(n)
            assert len(b) == n
            captured.extend(b)
            return b
        def num(fmt):
            return struct.unpack('<' + fmt, read(struct.calcsize('<' + fmt)))[0]
        def string():
            return read(num('Q')).decode('utf-8')
        fmts = {0:'B',1:'b',2:'H',3:'h',4:'I',5:'i',6:'f',7:'?',10:'Q',11:'q',12:'d'}
        def value(t):
            if t == 8:
                return string()
            if t == 9:
                subtype, count = num('I'), num('Q')
                assert count <= 2_000_000
                return [value(subtype) for _ in range(count)]
            return num(fmts[t])
        assert read(4) == b'GGUF'
        version, tensor_count, count = num('I'), num('Q'), num('Q')
        assert version in (2, 3) and count <= 2000
        meta = {}
        for _ in range(count):
            key = string()
            meta[key] = value(num('I'))
        return meta, {'path': str(path.relative_to(ROOT)), 'gguf_version':version,
                      'tensor_count':tensor_count, 'metadata_count':count,
                      'metadata_bytes_read':len(captured), 'header_sha256':sha(captured),
                      'tensor_payload_read':False}

primary = json.loads((ROOT/'source-free-e16-preflight-r1/raw.json').read_text())
protected = [record('source-free-e16-preflight-r1/'+name) for name in
             ('review-pre-refutation.json','review.json','raw.json','frozen-input-check.json','wrapper-compatibility.json')]
pins = []
for pin in primary['source_pins']:
    actual = record(pin['path'])
    actual['matches_primary_pin'] = actual['sha256'] == pin['sha256'] and actual['bytes'] == pin['bytes']
    pins.append(actual)
assert all(x['matches_primary_pin'] for x in pins)
prov = json.loads((ROOT/'comparison-c02e/provenance.json').read_text())
args = prov['args']
paths = [Path(args[i+1]) for i,x in enumerate(args) if x == '--image']
prompt_path = Path(args[args.index('-f')+1])
prompt_bytes = prompt_path.read_bytes()
prompt = prompt_bytes.decode('utf-8')
labels = re.findall(r'^([AB]0[1-8]\.png)\n<__media__>$', prompt, re.M)
expected = [f'{a}{i:02}.png' for a in 'AB' for i in range(1,9)]
assert labels == expected == [p.name for p in paths]
assert prompt.count('<__media__>') == 16 and sha(prompt_bytes) == prov['prompt_sha256']
params = {k:args[args.index(k)+1] for k in ('-c','-n','--image-min-tokens','--verbosity')}
assert params == {'-c':'32768','-n':'1500','--image-min-tokens':'1024','--verbosity':'4'}

def resize(w,h,min_tokens):
    factor = 28
    low, high = min_tokens*factor**2, 4096*factor**2
    wb, hb = (max(factor, math.floor(v/factor+.5)*factor) for v in (w,h))
    if wb*hb > high:
        beta = math.sqrt(w*h/high)
        wb,hb = (max(factor,math.floor(v/beta/factor)*factor) for v in (w,h))
    elif wb*hb < low:
        beta = math.sqrt(low/(w*h))
        wb,hb = (math.ceil(v*beta/factor)*factor for v in (w,h))
    return {'width':wb,'height':hb,'embedding_slots':(wb//factor)*(hb//factor)}

files = []
for path,item in zip(paths,prov['files']):
    b = path.read_bytes()
    original = Path(item['source']).read_bytes()
    assert b[:8] == b'\x89PNG\r\n\x1a\n' and b[12:16] == b'IHDR'
    w,h = struct.unpack('>II',b[16:24])
    files.append({'label':path.name,'sha256':sha(b),'bytes':len(b),'size':[w,h],
                  'original_bytes_equal':b==original,
                  'matches_provenance':sha(b)==item['sha256'] and len(b)==item['bytes'],
                  'source_predicted_default':resize(w,h,8),
                  'source_predicted_min1024':resize(w,h,1024)})
assert all(x['original_bytes_equal'] and x['matches_provenance'] for x in files)
total = sum(x['source_predicted_min1024']['embedding_slots'] for x in files)
assert total == 29784

model,model_record = gguf_header(Path(args[args.index('-m')+1]))
projector,projector_record = gguf_header(Path(args[args.index('--mmproj')+1]))
tokens = model['tokenizer.ggml.tokens']
types = model['tokenizer.ggml.token_type']
strings = ['<|vision_start|>','<|vision_end|>','<|vision_bos|>','<|vision_eos|>']
vocabulary = {s:[{'id':i,'type':types[i]} for i,t in enumerate(tokens) if t==s] for s in strings}
assert vocabulary['<|vision_start|>'] == vocabulary['<|vision_end|>'] == []
assert vocabulary['<|vision_bos|>'] == [{'id':151652,'type':3}]
assert vocabulary['<|vision_eos|>'] == [{'id':151653,'type':3}]
template = model['tokenizer.chat_template']
assert '<|vision_bos|><|IMAGE|><|vision_eos|>' in template

prefix = 'audio-evaluator-floor-r1/source-original/llama.cpp-5266f24da75dc449bd56cbed7addb9c8e4a6a73e/tools/mtmd/'
selections = {
 'audio-evaluator-diagnostic-source-mtmd-cli.cpp':[(194,204),(207,218),(233,250),(260,311),(354,395)],
 prefix+'clip.cpp':[(1284,1289),(1651,1661),(4083,4088),(4144,4158)],
 prefix+'clip-model.h':[(186,195)],
 prefix+'mtmd-image.cpp':[(122,156),(766,780)],
 prefix+'mtmd.cpp':[(694,703),(1308,1318),(1352,1354),(1547,1549)]
}
excerpts = []
for rel,ranges in selections.items():
    lines=(ROOT/rel).read_text().splitlines()
    excerpts.append({'path':rel,'sha256':sha((ROOT/rel).read_bytes()),
                     'excerpts':[{'start':a,'end':b,'text':'\n'.join(f'{n+1}: {lines[n]}' for n in range(a-1,b))} for a,b in ranges]})

out = {
 'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'scope':'Independent read-only source/input refutation. No inference, no output interpretation, no product or source edits.',
 'protected_primary_files':protected,
 'source_pins':pins,
 'frozen_input':{'prompt_bytes':len(prompt_bytes),'prompt_sha256':sha(prompt_bytes),'ordered_labels':labels,
                 'markers_argv_exact':True,'params':params,'files':files,
                 'provenance_status_read_only':prov['status']},
 'budget':{'predicted_image_embedding_slots':total,'context':32768,'after_images':32768-total,
           'output_cap':1500,'text_wrapper_safety_remainder':32768-total-1500,
           'actual_encoder_measurement':False,'actual_prompt_tokenization':False,
           'completion_guaranteed':False,
           'note':'Independent arithmetic models fixed positive input dimensions and C++ smart resize. It is not an encoder or image-reading measurement.'},
 'wrapper':{'model_header':model_record,'projector_header':projector_record,
            'vocabulary':vocabulary,'model_template':template,
            'model_context_fields':{k:v for k,v in model.items() if k.endswith('.context_length') or k=='general.architecture'},
            'projector_fields':{k:v for k,v in projector.items() if 'projector_type' in k or 'patch_size' in k or 'spatial_merge' in k or 'attention' in k and 'pattern' in k},
            'source_string_mismatch_confirmed':True,'inference_effect_measured':False,
            'limitation':'Absent whole-vocabulary entries do not prove zero visual processing. No tokenizer or model was executed by this refuter.'},
 'source_excerpts':excerpts,
 'citation_correction':{'primary_name':'clip_n_patches','actual_name':'clip_n_output_tokens',
                        'path':prefix+'clip.cpp','line':4083,'changes_budget':False},
 'control':{'stdout_path':'visual-evaluator-control-r1/stdout-cwd.txt',
            'stdout':(ROOT/'visual-evaluator-control-r1/stdout-cwd.txt').read_text(),
            'interpretation':'Basic colors/shapes and blank right side were reported; triangle horizontal location is imprecise. This is not evidence of sixteen-image art direction capability.'},
 'no_process_stdout_or_stderr_read_by_this_script':True
}
OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'raw':str(OUT),'sha256':sha(OUT.read_bytes()),'source_pins_match':True,
                  'image_slots':total,'residual':32768-total-1500,'wrapper_vocabulary':vocabulary,
                  'model_header':model_record,'projector_header':projector_record},ensure_ascii=False,indent=2))
