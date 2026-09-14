#!/usr/bin/env python3
"""Offline graph/script/input controls; never invokes a GitHub workflow."""
import copy
import hashlib
import itertools
import json
import os
from pathlib import Path
import re
import subprocess
import time
import yaml

ROOT=Path(__file__).resolve().parents[1]
class Loader(yaml.SafeLoader):
    yaml_implicit_resolvers=copy.deepcopy(yaml.SafeLoader.yaml_implicit_resolvers)
for key,entries in Loader.yaml_implicit_resolvers.items():
    Loader.yaml_implicit_resolvers[key]=[(tag,pattern) for tag,pattern in entries if tag!='tag:yaml.org,2002:bool']
Loader.add_implicit_resolver('tag:yaml.org,2002:bool',re.compile(r'^(?:true|false)$',re.I),list('tTfF'))
def document(directory,name):
    return yaml.load((ROOT/directory/'.github/workflows'/name).read_text(),Loader=Loader)
before=document('source-original','gates.yml');after=document('candidate','gates.yml')
mobile_before=document('source-original','mobile-simulator.yml');mobile=document('candidate','mobile-simulator.yml')
checks=[];start=time.monotonic()
def check(name,condition):
    assert condition,name
    checks.append({'name':name,'passed':True})

original=before['jobs']['f3-execution']; core=after['jobs']['f3-core']
audio_index=next(i for i,x in enumerate(original['steps']) if x.get('name')=='Capture production sound and video in Chromium')
check('every original non-audio F3 step is identical and ordered',core['steps']==original['steps'][:audio_index])
check('original F3 runner and timeout retained',core['runs-on']==original['runs-on'] and core['timeout-minutes']==original['timeout-minutes'])
check('all non-F3 jobs unchanged',all(after['jobs'].get(key)==value for key,value in before['jobs'].items() if key!='f3-execution'))
check('workflow triggers and permissions unchanged',{k:v for k,v in after.items() if k!='jobs'}=={k:v for k,v in before.items() if k!='jobs'})
aggregate=after['jobs']['f3-execution']; called=after['jobs']['f3-safari']
check('exact required name and both dependencies retained',aggregate['name']=='F3 execution' and aggregate['needs']==['f3-core','f3-safari'])
check('aggregate always runs and has no result bypass',aggregate['if']=='always()' and 'continue-on-error' not in aggregate
      and len(aggregate['steps'])==1 and 'continue-on-error' not in aggregate['steps'][0])
check('both measurement jobs are unconditional', 'if' not in core and 'if' not in called)
check('same-revision reusable call requires true audio',called['uses']=='./.github/workflows/mobile-simulator.yml' and called['with']=={'capture_audio':True})
check('typed workflow_call and standalone false default',mobile['on']['workflow_call']['inputs']['capture_audio']['type']=='boolean'
      and mobile['on']['workflow_call']['inputs']['capture_audio']['default'] is False
      and mobile['on']['workflow_dispatch']==mobile_before['on']['workflow_dispatch'])
check('caller has no colliding concurrency group','concurrency' not in after and 'concurrency' not in called)

# The only changes to the existing simulator body are opt-in expression,
# cancellation namespace, one path and an extra read-only evidence check.
restored=copy.deepcopy(mobile);del restored['on']['workflow_call']
restored['on']['push']['paths'].remove('tools/gates/f3_safari_audio.mjs')
restored['concurrency']=mobile_before['concurrency']
restored['jobs']['ios-safari']['env']=mobile_before['jobs']['ios-safari']['env']
added=[s for s in restored['jobs']['ios-safari']['steps'] if s.get('run')=='node tools/gates/f3_safari_audio.mjs']
check('exact evidence check remains active after a test failure',len(added)==1 and added[0]['if']=="${{ !cancelled() && env.CINDERLINE_IOS_AUDIO_CAPTURE == '1' }}")
restored['jobs']['ios-safari']['steps'].remove(added[0])
check('all existing standalone simulator execution steps remain unchanged',restored==mobile_before)

# Execute the exact aggregate shell with GitHub's bash fail-fast options. These
# are supplied job-result fixtures, not statements that any real check ran.
step=aggregate['steps'][0]
check('aggregate reads both actual needs results',step['env']=={'F3_CORE_RESULT':'${{ needs.f3-core.result }}','F3_SAFARI_RESULT':'${{ needs.f3-safari.result }}'})
matrix=[]
states=['success','failure','cancelled','skipped','','unknown']
for a,b in itertools.product(states,repeat=2):
    run=subprocess.run(['bash','--noprofile','--norc','-e','-o','pipefail','-c',step['run']],
        env={**os.environ,'F3_CORE_RESULT':a,'F3_SAFARI_RESULT':b},capture_output=True,text=True)
    accepted=run.returncode==0
    assert accepted==(a==b=='success'),(a,b,run.stdout,run.stderr)
    matrix.append({'core':a,'safari':b,'exit':run.returncode,'accepted':accepted})
check('36 actual aggregate-shell controls accept only success/success',len(matrix)==36)

# This uses JavaScript for the shared simple boolean/property subset. It does
# not claim to be GitHub's expression engine or a hosted workflow_call run.
expression=mobile['jobs']['ios-safari']['env']['CINDERLINE_IOS_AUDIO_CAPTURE'][3:-3].strip()
old_expression=mobile_before['jobs']['ios-safari']['env']['CINDERLINE_IOS_AUDIO_CAPTURE'][3:-3].strip()
cases=[]
for event,attempt,explicit,marker in itertools.product(['push','pull_request','workflow_dispatch'],[1,2],[None,False,True],[False,True]):
    inputs={} if explicit is None else {'capture_audio':explicit}
    github={'event_name':event,'run_attempt':attempt,'event':{'head_commit':{'message':'[ios-audio-c28-r1]' if marker else 'ordinary source update'}}}
    cases.append({'github':github,'inputs':inputs,'expected':'1' if explicit is True or (event=='push' and attempt==1 and marker) else '0',
                  'default_must_match_original':explicit is not True})
runner="""const fs=require('node:fs'),vm=require('node:vm');const p=JSON.parse(fs.readFileSync(0,'utf8'));
const result=p.cases.map(c=>{const context={github:c.github,inputs:c.inputs,contains:(a,b)=>String(a).toLowerCase().includes(String(b).toLowerCase())};
return {...c,actual:vm.runInNewContext(p.expression,context,{timeout:100}),original:vm.runInNewContext(p.old_expression,context,{timeout:100})};});
process.stdout.write(JSON.stringify(result));"""
run=subprocess.run(['node','-e',runner],input=json.dumps({'expression':expression,'old_expression':old_expression,'cases':cases}),capture_output=True,text=True,check=True)
expressions=json.loads(run.stdout)
check('36 input/event/attempt controls keep explicit true enabled',all(c['actual']==c['expected'] for c in expressions) and len(expressions)==36)
check('every default-false/absent input case retains original behavior',all(c['actual']==c['original'] for c in expressions if c['default_must_match_original']))
group=mobile['concurrency']['group']
groups={workflow:group.replace('${{ github.workflow }}',workflow).replace('${{ github.ref }}','refs/heads/production')
        for workflow in ['Floor gates','Mobile Safari simulator']}
check('same-ref caller and standalone have distinct concurrency groups',len(set(groups.values()))==2 and mobile['concurrency']['cancel-in-progress'] is True)
source_pins=json.loads((ROOT/'source-original/acquisition.json').read_text())
for item in source_pins['files']:
    raw=(ROOT/'source-original'/item['path']).read_bytes()
    assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==item['git_blob']
check('all eight canonical source blobs remain byte-exact',len(source_pins['files'])==8)
check('source/core/recorder/harness/audio runtime are absent from change set',sorted(str(p.relative_to(ROOT/'candidate')) for p in (ROOT/'candidate').rglob('*') if p.is_file())==[
    '.github/workflows/gates.yml','.github/workflows/mobile-simulator.yml','tools/gates/f3_safari_audio.mjs'])
result={'scope':'Offline workflow/schema/shell controls only; hosted GitHub scheduling and simulator runtime unmeasured',
    'passed':len(checks),'checks':checks,'elapsed_seconds':time.monotonic()-start,'aggregate_results':matrix,
    'input_expression_results':expressions,'concurrency_groups':groups,'core_steps_preserved':audio_index,
    'workflow_call_started':False,'CI_started':False,'evaluation_count':0}
(ROOT/'verification/workflow-controls.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['passed','elapsed_seconds','core_steps_preserved','workflow_call_started','evaluation_count']}))
