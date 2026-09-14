import hashlib
import json
import math
from datetime import datetime, timezone, timedelta
from pathlib import Path
from PIL import Image

ROOT = Path('/workspace/scratch/0b7ad82bafe7')
OUT = ROOT / 'source-free-e16-preflight-r1'
LLAMA = ROOT / 'audio-evaluator-floor-r1/source-original/llama.cpp-5266f24da75dc449bd56cbed7addb9c8e4a6a73e'

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def read(path):
    return json.loads((ROOT / path).read_text())

def pin(path):
    path = Path(path)
    return {'path': str(path.relative_to(ROOT)), 'bytes': path.stat().st_size, 'sha256': digest(path)}

def size_for(width, height, min_tokens):
    factor = 28
    min_pixels, max_pixels = min_tokens * factor**2, 4096 * factor**2
    w, h = max(factor, math.floor(width/factor + .5)*factor), max(factor, math.floor(height/factor + .5)*factor)
    if w*h > max_pixels:
        beta = math.sqrt(width*height/max_pixels)
        w, h = max(factor, math.floor(width/beta/factor)*factor), max(factor, math.floor(height/beta/factor)*factor)
    elif w*h < min_pixels:
        beta = math.sqrt(min_pixels/(width*height))
        w, h = math.ceil(width*beta/factor)*factor, math.ceil(height*beta/factor)*factor
    return {'preprocessed_size': [w, h], 'embedding_slots': (w//factor)*(h//factor)}

acq = read('webkit-4190137/acquisition.json')
report = read('webkit-4190137/report.json')
ref = read('survival/AI_DEVELOPMENT/EVIDENCE/CONTINUOUS-2026-09-14/inside-materials.json')
models = read('audio-evaluator-diagnostic-01.json')['models']
native = ['stacks', 'marrow', 'arcade', 'cinder', 'survey', 'ventfield', 'south', 'plant']
manifest = []
for role, files, provenance in [
    ('candidate', [ROOT / f'webkit-4190137/visual-{name}-frame.png' for name in native], {r['file']:r for r in acq['files']}),
    ('reference', [ROOT / f'reference-materials/inside/INSIDE_{i:02d}.png' for i in range(1,9)], {r['name']:r for r in ref['files']}),
]:
    for index, file in enumerate(files, 1):
        record = pin(file)
        expected = provenance[file.name]
        record.update({'source_role_private': role, 'fixed_index': index, 'matches_acquisition': record['sha256']==expected['sha256'] and record['bytes']==expected['bytes']})
        with Image.open(file) as im:
            record.update({'native_size': list(im.size), 'mode': im.mode, 'metadata_keys': sorted(im.info), 'decoded_rgb_sha256': hashlib.sha256(im.convert('RGB').tobytes()).hexdigest()})
            record['default_preprocessor_calculation'] = size_for(*im.size, 8)
            record['min1024_preprocessor_calculation'] = size_for(*im.size, 1024)
        manifest.append(record)

paths = [
    ROOT / 'visual-comparison-runtime-r1/protocol.json',
    ROOT / 'visual-evaluator-control-r1/run.json', ROOT / 'visual-evaluator-control-r1/run-cwd.json',
    ROOT / 'visual-evaluator-control-r1/expected.json', ROOT / 'visual-evaluator-control-r1/stdout-cwd.txt',
    ROOT / 'visual-evaluator-control-r1/stderr-cwd.txt', ROOT / 'visual-evaluator-control-r1/control.png',
    ROOT / 'audio-evaluator-diagnostic-source-mtmd-cli.cpp', ROOT / 'audio-evaluator-diagnostic-source-mtmd-helper.cpp',
    ROOT / 'audio-evaluator-diagnostic-01.json', ROOT / 'audio-evaluator-diagnostic-02.json',
    ROOT / 'webkit-4190137/acquisition.json', ROOT / 'webkit-4190137/report.json',
    ROOT / 'survival/docs/benchmarks.md', ROOT / 'survival/AI_DEVELOPMENT/EVIDENCE/CONTINUOUS-2026-09-14/inside-materials.json',
] + [LLAMA / name for name in ['tools/mtmd/mtmd.cpp','tools/mtmd/clip.cpp','tools/mtmd/clip-model.h','tools/mtmd/mtmd-image.cpp']]
raw = {
    'recorded_at': datetime.now(timezone(timedelta(hours=9))).isoformat(),
    'scope': 'Independent source/material preflight. No evaluator inference, preference, game execution, browser, server, publication or product/threshold edit.',
    'candidate': {k:acq[k] for k in ['commit','build_sha256','run_id','job_id','job_conclusion','scope']},
    'capture_status': report['status'], 'capture_checks': len(report['checks']),
    'capture_scope': report['visualViews']['scope'], 'capture_setup': report['visualViews']['setup'],
    'fixed_view_selection': native,
    'excluded_existing_ninths': ['visual-marrow_roof-frame.png', 'INSIDE_09.png'],
    'manifest': manifest,
    'all_16_match_acquisition': len(manifest)==16 and all(x['matches_acquisition'] for x in manifest),
    'source_pins': [pin(p) for p in paths],
    'recorded_model_metadata': [
        {'file':m['file'], 'selected_metadata':{k:v for k,v in m['metadata'].items() if k in ['qwen2vl.context_length','clip.projector_type','clip.vision.patch_size','clip.vision.n_wa_pattern']}}
        for m in models
    ],
    'preprocessor_budget': {
        'kind': 'Calculation from fixed source and recorded model metadata; not measured encoder output or a claim of perceptual fidelity.',
        'implementation': 'clip.cpp QWEN25O vision selects QWEN25VL; patch=14 and default merge=2; clip-model.h set_limit_image_tokens; mtmd-image.cpp calc_size_preserved_ratio; clip.cpp clip_n_patches uses (width/28)*(height/28).',
        'default_image_slots': sum(x['default_preprocessor_calculation']['embedding_slots'] for x in manifest),
        'min1024_image_slots': sum(x['min1024_preprocessor_calculation']['embedding_slots'] for x in manifest),
        'context_capacity':32768,
        'remaining_slots_min1024':32768-sum(x['min1024_preprocessor_calculation']['embedding_slots'] for x in manifest),
        'proposed_output_cap':1500,
        'remaining_for_prompt_wrappers_and_safety':32768-sum(x['min1024_preprocessor_calculation']['embedding_slots'] for x in manifest)-1500,
        'limitations':['Wrapper/text tokens are additional and have not yet been tokenized.','M-RoPE position advancement differs from image embedding count; a low final position is not proof that all KV slots fit.','No image shrinking to meet a token budget is proposed. The original files remain unchanged; the ordinary model preprocessor itself resamples images.','The 1024 grounding recommendation is a warning from this runtime, not proof that artistic or pixel-level judgment becomes reliable.']
    },
    'cli_observations': [
        {'evidence':'mtmd-cli.cpp load_media and eval_message','fact':'Only decoded bitmap content is loaded. Filenames are not supplied as prose. Explicit <__media__> markers are matched to bitmap argv order; mismatched count returns failure.'},
        {'evidence':'mtmd-cli.cpp main single-turn branch','fact':'When the prompt contains no marker, one marker per image is prepended before the whole prompt; that does not itself create A01/B01 labels.'},
        {'evidence':'mtmd-cli.cpp eval_message and mtmd-helper.cpp decode_image_chunk','fact':'The implementation tokenizes all parts and encodes/decodes chunks, logging media batches. Decode error returns nonzero. Neither exit zero nor batch count proves semantic inspection of every frame.'},
        {'evidence':'mtmd-cli.cpp generate_response','fact':'The generation loop can end at n_predict without a completed structured answer. Raw truncation and missing final fields must be treated as invalid, even with exit zero.'}
    ],
    'control': {
        'observed_run':read('visual-evaluator-control-r1/run-cwd.json'),
        'original_failure_retained':'run.json / stderr.txt recorded missing backend; corrected cwd then executed the same image/prompt once.',
        'raw_output':(ROOT/'visual-evaluator-control-r1/stdout-cwd.txt').read_text(),
        'qualified_result':'Three colors/shapes and empty right half are represented. Blue triangle described as top center is imprecise against upper-right-of-left-half expectation. This is a limited input-fidelity result, not all-16 inspection or artistic judgment qualification.'
    },
    'limited_direct_visual_inspection': {
        'files':['visual-evaluator-control-r1/control.png','webkit-4190137/visual-stacks-frame.png','reference-materials/inside/INSIDE_01.png','reference-materials/inside/INSIDE_08.png'],
        'scope':'Four original images inspected with view_image before this probe. This is source-aware content inspection, not preference evaluation of all sixteen.',
        'observations':['Stacks shows a foreground third-person figure, warm brick wall/rubble and no visible sky.','Reference 01 and 08 show a red-shirt child and distinctive industrial presentation; no textual title is needed for possible source recognition.','No claim of blindness follows from neutral filenames, lack of logos, or a model merely saying it is unfamiliar.']
    },
    'revised_contract_from_parent': {
        'received_during_preflight':True,
        'values':{'markers':'explicit A01 through B08, each immediately paired with <__media__>','context':32768,'image_min_tokens':1024,'output_cap':1500},
        'rules':'Short prompt; retain raw stdout/stderr and encoder token sequence; insufficient actual decode/reading coverage invalid; original images unchanged and ordinary model preprocessing disclosed.',
        'status':'Planned parameters reported by coordinator, not an inspected final argv/prompt or completed inference.'
    },
    'criterion_coverage': [
        {'id':'BM-VIS-01','locked_requirement':'Dominant directional light/shadow hierarchy in all eight major views.','material_scope':'Exactly eight candidate views are present; request distinct visible anchors for each, not only a best-frame global impression.'},
        {'id':'BM-VIS-02','locked_requirement':'Controlled coal/ash/rust warm palette and cool sky in every sky-containing frame.','material_scope':'Sky absent is not a failure or proof; mark it absent. Generic palette preference alone does not establish this exact candidate requirement. Source-aware criterion mapping remains separate from the blind prompt.'},
        {'id':'BM-VIS-03','locked_requirement':'Contact shadows/AO and no floating objects, zero failures.','material_scope':'Only visibly depicted contacts can be judged. Do not infer every hidden object/interior from these exterior captures. Missing adequate coverage leaves the relevant claim unmeasured.'},
        {'id':'BM-VIS-04','locked_requirement':'Consistent texture density/scale, zero failures; images plus existing bench_measure.','material_scope':'Per-frame and cross-frame visible scale consistency can be evaluated. Unresolved detail at model input resolution and absent existing metric evidence cannot be silently inferred from preference.'}
    ]
}
assert raw['all_16_match_acquisition']
assert raw['preprocessor_budget']['default_image_slots'] == 29072
assert raw['preprocessor_budget']['min1024_image_slots'] == 29784
(OUT/'raw.json').write_text(json.dumps(raw,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'path':str(OUT/'raw.json'),'sha256':digest(OUT/'raw.json'),'all_16_match':raw['all_16_match_acquisition'],'slots':raw['preprocessor_budget']},ensure_ascii=False))
