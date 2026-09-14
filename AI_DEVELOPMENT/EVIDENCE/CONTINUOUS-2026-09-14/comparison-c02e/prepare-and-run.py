from pathlib import Path
from datetime import datetime,timezone,timedelta
import json,secrets,shutil,hashlib,subprocess,time
r=Path(__file__).resolve().parent.parent
out=r/'comparison-c02e';assert not out.exists(), 'Frozen attempt already exists; do not rerun unchanged material.'
out.mkdir();packet=out/'packet';packet.mkdir()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(name,x):(out/name).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
old=json.loads((r/'visual-evaluator-control-r1/run-cwd.json').read_text())
marker=json.loads((r/'visual-comparison-runtime-r1/runtime-marker.json').read_text())['value']
labels=['A','B'];secrets.SystemRandom().shuffle(labels)
views=['stacks','marrow','arcade','cinder','survey','ventfield','south','plant']
files=[]
for i,view in enumerate(views,1):
    for label,source,role in [(labels[0],r/'webkit-4190137'/f'visual-{view}-frame.png','candidate'),(labels[1],r/'reference-materials/inside'/f'INSIDE_{i:02}.png','reference')]:
        name=f'{label}{i:02}.png';dest=packet/name;shutil.copy2(source,dest)
        assert source.read_bytes()==dest.read_bytes()
        files.append({'label':name,'role':role,'source':str(source),'sha256':sha(source),'bytes':source.stat().st_size,'transformation':'none; exact original PNG bytes'})
files.sort(key=lambda x:x['label'])
prompt='Evaluate visual art direction in these two unlabelled sets of game images, A and B. Inspect each numbered image. Judge the visible images only.\n'
for f in files:prompt+=f['label']+'\n'+marker+'\n'
prompt+='''Answer in this order, within 900 words:
1. RECOGNITION: State whether you recognize either work, publisher, or provenance, or can identify which is an existing benchmark versus a work being developed. Give any suspected identity or role and visible reason honestly; do not suppress familiarity. If you have none, say unknown. This must precede preference.
2. IMAGE OBSERVATIONS: Exactly sixteen short lines labelled A01 through A08, then B01 through B08. For each give a specific visible spatial or lighting/material detail and its effect. If an image is unavailable or indistinguishable to you, say so rather than inventing it.
3. Compare the whole sets on dominant light and shadow hierarchy, controlled palette, depth and contact grounding, and coherent texture scale. Support each with image labels. Do not claim animation, playability, sound, or unseen views. Do not use fame, budget, provenance, object counts or resolution alone as quality.
4. PREFERENCE: A, B, equal, or unable to judge, for this visual element as a whole. Explain the decisive visible reason and limitations. Do not assign numerical scores.
'''
(packet/'prompt.txt').write_text(prompt)
args=[old['args'][0],'-m',str(r/'audio-evaluator/Qwen2.5-Omni-7B-Q8_0.gguf'),'--mmproj',str(r/'audio-evaluator/mmproj-Qwen2.5-Omni-7B-f16.gguf')]
for f in files:args+=['--image',str(packet/f['label'])]
args+=['-f',str(packet/'prompt.txt'),'-ngl','0','--no-mmproj-offload','-t','6','-c','32768','-n','1500','--image-min-tokens','1024','--temp','0','--seed','917','--verbosity','4','--offline']
manifest={'created_at':datetime.now(timezone(timedelta(hours=9))).isoformat(),'element':'E-16','candidate_commit':'4190137d65aa5f2973d89a3901b443d2d6167f9e','candidate_build_sha256':'3aa1d190dd286d73538f7f9266a45edfb3e440ad102c62faaef04c963adbb592','reference_work':'INSIDE','candidate_label':labels[0],'reference_label':labels[1],'files':files,'source_mapping_exposed_to_model':False,'model_input':'Only the numbered pixel inputs and packet/prompt.txt. No source path, mapping, prior conversation, reference name, code or coordinator result is model text input.','prompt_sha256':sha(packet/'prompt.txt'),'comparison_policy':'One frozen input, one inference, all output retained. Recognition or insufficient perception makes the comparison invalid. No re-rating unchanged works for a preferred result.','scope':'Eight locked exterior visual views, not motion, every interior or other elements.','preprocessing':'Original PNG bytes unchanged. Existing model vision encoder applies its standard smart resize; image-min-tokens 1024 for both sets. Actual token coverage must be verified; basic control alone does not establish artistic judgment ability.','args':args,'environment':old['environment'],'cwd':old['cwd'],'status':'running'}
save('provenance.json',manifest);started=time.monotonic()
with (out/'stdout.txt').open('wb') as stdout,(out/'stderr.txt').open('wb') as stderr:
    try:
        result=subprocess.run(args,cwd=old['cwd'],env=old['environment'],stdout=stdout,stderr=stderr,timeout=1800)
        manifest.update(status='process_completed',exit_code=result.returncode)
    except subprocess.TimeoutExpired:
        manifest.update(status='process_timeout',exit_code=None)
manifest['seconds']=time.monotonic()-started
save('provenance.json',manifest)
print(json.dumps({k:manifest[k] for k in ['status','exit_code','seconds']}))
