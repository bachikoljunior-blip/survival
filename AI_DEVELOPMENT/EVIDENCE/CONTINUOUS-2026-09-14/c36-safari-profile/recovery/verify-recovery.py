#!/usr/bin/env python3
"""Finite adversarial transport checks on explicitly synthetic CPU data."""
import copy, json, pathlib, subprocess
import recovery

ROOT = pathlib.Path(__file__).resolve().parent
V = ROOT/'verification'
F = V/'synthetic-only'
(F/'tools').mkdir(parents=True, exist_ok=True)
(F/'test-results/ios-safari').mkdir(parents=True, exist_ok=True)
for name in ['ios_audio_capture.mjs', 'test-ios-safari.mjs', 'frame_work_probe.mjs']:
    (F/'tools'/name).write_bytes((ROOT/'source/tools'/name).read_bytes())
pins = recovery.expected()
provenance = dict(pins, bundleSha256=recovery.PRODUCT, actualRecorderBlob=recovery.RECORDER,
    actualBundleHashes={'cinderline.1.0.0.js':recovery.PRODUCT,'dist/cinderline.1.0.0.js':recovery.PRODUCT})
report = {'status':'failed', 'audioCapture':{'provenance':provenance},
    'safariFrameWork':{'complete':False,'rows':[], 'provenance':pins},
    'scope':'CPU SYNTHETIC ONLY - not a Safari result', 'padding':'x'*4096}
raw = (json.dumps(report, indent=2)+'\n').encode()
(F/'test-results/ios-safari/report.json').write_bytes(raw)
script = """import {exportFrameWorkReport} from '../source/tools/export-ios-frame-work.mjs';
import {writeFileSync} from 'node:fs';
const lines=[];exportFrameWorkReport(new URL('./synthetic-only',import.meta.url).pathname,
{CINDERLINE_IOS_FRAME_WORK_CAPTURE:'1',GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/claude/repo-instructions-constraints-r0070m',GITHUB_RUN_ATTEMPT:'1',GITHUB_WORKFLOW:'Floor gates',GITHUB_SHA:'789f2199bd3791a6dc6566eecaf3c1478c99afa6',GITHUB_RUN_ID:'34875252891'},line=>lines.push(line));
writeFileSync(new URL('./synthetic-export.log',import.meta.url),lines.join('\\n')+'\\n');
"""
(V/'export-synthetic.mjs').write_text(script)
subprocess.run(['node', str(V/'export-synthetic.mjs')], check=True)
lines = (V/'synthetic-export.log').read_text().splitlines()
checks = []
def expect(name, candidate, passed=False):
    try:
        result = recovery.recover('\n'.join(candidate)+'\n', pins)
    except Exception as error:
        if passed: raise
        checks.append({'name':name,'passed':True,'rejection':str(error)})
    else:
        assert passed, name+' was wrongly accepted'
        assert result[0] == raw
        checks.append({'name':name,'passed':True,'preservedOriginalFailure':result[1]['status']=='failed'})
def alter(line, fn):
    prefix, data = line.split(' ',1); obj=json.loads(data); fn(obj)
    return prefix+' '+json.dumps(obj,separators=(',',':'))
expect('canonical exporter roundtrip preserves failed original bytes',lines,True)
expect('missing end',lines[:-1])
expect('missing chunk',lines[:1]+lines[2:])
expect('duplicate meta',lines[:1]+lines)
mut=lines.copy();mut[1]=alter(mut[1],lambda o:o.update(offset=1));expect('wrong offset',mut)
mut=lines.copy();mut[1]=alter(mut[1],lambda o:o.update(index=1));expect('wrong index',mut)
mut=lines.copy();mut[1]=alter(mut[1],lambda o:o.update(base64=o['base64'][:-4]));expect('truncated chunk',mut)
mut=lines.copy();mut[1]=alter(mut[1],lambda o:o.update(base64='!'+o['base64'][1:]));expect('invalid base64',mut)
mut=lines.copy();mut[0]=alter(mut[0],lambda o:o.update(sha256='0'*64));mut[-1]=mut[0].replace('-meta]', '-end]');expect('wrong whole-report SHA',mut)
mut=lines.copy();mut[0]=alter(mut[0],lambda o:o.update(runAttempt='2'));mut[-1]=mut[0].replace('-meta]', '-end]');expect('rerun identity rejected',mut)
mut=lines.copy();mut[0]=alter(mut[0],lambda o:o.update(frameWorkProbeSha256='0'*64));mut[-1]=mut[0].replace('-meta]', '-end]');expect('wrong probe hash rejected',mut)
mut=lines.copy();mut[0]=alter(mut[0],lambda o:o.update(bytes=8*1024*1024+1));mut[-1]=mut[0].replace('-meta]', '-end]');expect('capacity widening rejected',mut)
result={'status':'pass','passed':len(checks),'checks':checks,'scope':'CPU synthetic transport controls using exact canonical C36 exporter. Does not represent recovered Safari or measured runtime performance.'}
(V/'recovery-controls.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'status':'pass','passed':len(checks)}))
