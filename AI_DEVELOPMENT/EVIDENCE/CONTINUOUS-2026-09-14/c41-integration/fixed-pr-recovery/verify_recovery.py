#!/usr/bin/env python3
"""Small synthetic ZIP fixtures. No original artifact/CI/browser/recording run."""
from pathlib import Path
from unittest.mock import patch
import base64,contextlib,gzip,hashlib,importlib.util,io,json,os,stat,struct,sys,zipfile
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('candidate',ROOT/'candidate/tools/recover-ios-c40-pr.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
tests=[]
def passed(name):tests.append({'name':name,'passed':True})
def refuses(name,fn,match=None):
    try:fn()
    except (ValueError,zipfile.BadZipFile,KeyError,TypeError) as e:
        if match is not None:assert match in str(e),(name,str(e))
        passed(name);return
    raise AssertionError('accepted invalid fixture: '+name)
summary=json.loads((ROOT/'source/original-pr-summary.json').read_bytes())
assert all(summary['provenance'][k]==v for k,v in m.SOURCE.items())
assert summary['failures']==m.ORIGINAL_FAILURES
passed('all frozen original provenance/failure constants match actual C40 PR log summary')
metadata=json.loads((ROOT/'source/artifact-metadata.json').read_text())
m.verify_metadata(metadata);passed('actual saved run-artifact metadata matches production PIN')
original={'status':summary['status'],'failures':summary['failures'],
 'checks':summary['checks'],
 'audioCapture':{'status':summary['captureStatus'],'clips':summary['clips'],'provenance':summary['provenance'],'lifecycle':summary['lifecycle']}}
# This is a synthetic full-report-shaped fixture built from actual compact fields,
# never a recovered original full report or reconstructed missing timeline.
raw=json.dumps(original,separators=(',',':')).encode()+b'\n'
log_raw=b'SYNTHETIC Appium command log; not an original HTTP timing\n'
def archive(data=raw,extras=(),omit=False,omit_log=False):
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,'w',compression=zipfile.ZIP_DEFLATED) as z:
        if not omit:z.writestr('report.json',data)
        if not omit_log:z.writestr('appium.log',log_raw)
        for name,body in extras:z.writestr(name,body)
    return buf.getvalue()
def fixture(arc):
    pin={**m.PIN,'size_in_bytes':len(arc),'digest':'sha256:'+m.sha(arc)}
    meta={**metadata,'size_in_bytes':len(arc),'digest':pin['digest']}
    return meta,pin
def recover(arc):
    meta,pin=fixture(arc);return m.recover(meta,arc,pin)
arc=archive();out,packed,diagnostic,crc=recover(arc)
assert out['report.json']==raw and out['appium.log']==log_raw and gzip.decompress(packed['report.json'])==raw and gzip.decompress(packed['appium.log'])==log_raw and diagnostic['status']=='failed' and diagnostic['profilePresent'] is False
passed('actual candidate verifies ZIP CRC and lossless gzip with original failure preserved')
assert m.RAW_FILES=={'report.json':33554432,'appium.log':8388608} and m.TOTAL_RAW_LIMIT==41943040 and m.GZIP_LIMIT==8388608 and m.ZIP_LIMIT==33554432
passed('production raw32MiB/gzip8MiB/archive32MiB limits are fixed and distinct')
large=raw+b' '*(8*1024*1024)
out,large_gzip,_,_=recover(archive(large));assert len(out['report.json'])>8*1024*1024 and len(out['report.json'])<m.RAW_LIMIT and sum(map(len,large_gzip.values()))<m.GZIP_LIMIT and gzip.decompress(large_gzip['report.json'])==large
passed('separate fixed-failure recovery preserves more-than8MiB raw fixture inside explicit32MiB bound')
meta,pin=fixture(arc)
refuses('artifact digest mismatch',lambda:m.recover(meta,arc[:-1]+bytes([arc[-1]^1]),pin),'digest mismatch')
refuses('archive exact length mismatch',lambda:m.recover(meta,arc+b'x',pin),'size mismatch')
for key in ['id','name','size_in_bytes','digest']:
    bad={**meta,key:'invalid'};refuses('metadata '+key,lambda bad=bad:m.recover(bad,arc,pin),'metadata mismatch')
bad={**meta,'expired':True};refuses('expired original artifact',lambda:m.recover(bad,arc,pin),'expired')
bad={**meta,'workflow_run':{**meta['workflow_run'],'head_sha':'0'*40}};refuses('wrong original source head',lambda:m.recover(bad,arc,pin),'run mismatch')
refuses('missing root report',lambda:recover(archive(extras=[('sub/report.json',raw)],omit=True)),'missing')
for name in ['../escape','/absolute','C:/absolute','bad\\path']:
    refuses('unsafe path '+name,lambda name=name:recover(archive(extras=[(name,b'x')])),'unsafe')
refuses('duplicate report path',lambda:recover(archive(extras=[('report.json',raw)])),'duplicate')
symlink=zipfile.ZipInfo('link');symlink.create_system=3;symlink.external_attr=(stat.S_IFLNK|0o777)<<16
refuses('archive symbolic link',lambda:recover(archive(extras=[(symlink,b'report.json')])),'unsafe')
crc_bad=bytearray(arc);pos=crc_bad.index(b'PK\x01\x02');crc_bad[pos+16:pos+20]=struct.pack('<I',0)
refuses('original selected report CRC mismatch',lambda:recover(bytes(crc_bad)),'CRC')
with patch.dict(m.RAW_FILES,{'report.json':len(raw)-1}):refuses('raw report bound',lambda:recover(arc),'raw recovery bound')
with patch.object(m,'GZIP_LIMIT',sum(map(len,packed.values()))-1):refuses('shared gzip payload bound',lambda:recover(arc),'gzip total exceeds')
with patch.dict(m.RAW_FILES,{'appium.log':len(log_raw)-1}):refuses('Appium log raw bound',lambda:recover(arc),'raw recovery bound')
with patch.object(m,'TOTAL_RAW_LIMIT',len(raw)+len(log_raw)-1):refuses('shared total raw bound',lambda:recover(arc),'total raw bound')
refuses('missing original Appium log',lambda:recover(archive(omit_log=True)),'missing')
crc_bad_log=bytearray(arc);pos=crc_bad_log.index(b'PK\x01\x02');pos=crc_bad_log.index(b'PK\x01\x02',pos+4);crc_bad_log[pos+16:pos+20]=struct.pack('<I',0)
refuses('original selected Appium CRC mismatch',lambda:recover(bytes(crc_bad_log)),'CRC')
with patch.object(m,'EXPANSION_LIMIT',len(raw)-1):refuses('declared expansion bound',lambda:recover(arc),'expansion')
refuses('invalid UTF8 report',lambda:recover(archive(b'\xff')))
refuses('duplicate JSON key',lambda:recover(archive(raw.replace(b'{',b'{"status":"failed",',1))),'duplicate JSON')
refuses('NaN JSON',lambda:recover(archive(b'{"test":NaN}')),'non-finite')
for name,mutate in [('rewritten success',lambda r:r.update(status='passed')),
 ('invented profile',lambda r:r.update(safariFrameWork={'complete':True})),
 ('hidden street failure',lambda r:r['audioCapture']['clips'][0]['timing'].update(captureClockGuardPassed=True)),
 ('integer clock boolean',lambda r:r['audioCapture']['clips'][0]['timing'].update(captureClockGuardPassed=0)),
 ('invented lifecycle success',lambda r:r['audioCapture']['lifecycle'].update(status='checked')),
 ('swapped source and merge',lambda r:r['audioCapture']['provenance'].update(runCommit=m.PIN['head'])),
 ('wrong transfer provenance',lambda r:r['audioCapture']['provenance'].update(transferHelperSha256='0'*64))]:
    bad=json.loads(raw);mutate(bad);refuses(name,lambda bad=bad:recover(archive(json.dumps(bad).encode())))
# Actual CLI main, with only in-memory fixed ZIP pins replaced for this synthetic
# fixture. No command, environment or production file exposes a pin override.
fixture_dir=ROOT/'fixture';fixture_dir.mkdir(exist_ok=True)
event=fixture_dir/'event.json';event.write_text(json.dumps({'head_commit':{'message':m.MARKER}}))
env={'GITHUB_ACTIONS':'true','GITHUB_REPOSITORY':'bachikoljunior-blip/survival','GITHUB_WORKFLOW':'Floor gates','GITHUB_EVENT_NAME':'push','GITHUB_REF':'refs/heads/'+m.PIN['branch'],'GITHUB_RUN_ATTEMPT':'1','GITHUB_SHA':'a'*40,'GITHUB_RUN_ID':'12345','GITHUB_EVENT_PATH':str(event)}
for key,value in [('GITHUB_ACTIONS','false'),('GITHUB_REPOSITORY','another/repo'),('GITHUB_WORKFLOW','Mobile Safari simulator'),('GITHUB_EVENT_NAME','pull_request'),('GITHUB_REF','refs/heads/main'),('GITHUB_RUN_ATTEMPT','2'),('GITHUB_SHA','bad'),('GITHUB_RUN_ID','0')]:
    with patch.dict(os.environ,{**env,key:value},clear=True):refuses('environment '+key,m.environment,'selected first source')
with patch.dict(os.environ,env,clear=True):m.environment()
passed('exact first source Floor environment and unique marker accepted')
event.write_text(json.dumps({'head_commit':{'message':'[ios-frame-work-c38-r1]'}}))
with patch.dict(os.environ,env,clear=True):refuses('old profile marker does not enable archive recovery',m.environment,'marker')
event.write_text(json.dumps({'head_commit':{'message':m.MARKER}}))
(fixture_dir/'artifact-metadata.json').write_text(json.dumps(meta));(fixture_dir/'original.zip').write_bytes(arc)
capture=io.StringIO()
with patch.dict(os.environ,env,clear=True),patch.dict(m.PIN,pin,clear=True),patch.object(m,'OUT',fixture_dir),patch.object(sys,'argv',['recovery']),contextlib.redirect_stdout(capture):m.main()
lines=capture.getvalue().splitlines();segments=[];current=None
for line in lines:
    tag,payload=line.split(' ',1);value=json.loads(payload)
    if tag=='[ios-c40-pr-recovery-meta]':
        assert current is None;current={'meta':value,'data':[]}
    elif tag=='[ios-c40-pr-recovery-chunk]':
        assert value['file']==current['meta']['file'] and value['index']==len(current['data'])
        current['data'].append(base64.b64decode(value['base64'],validate=True))
    else:
        assert tag=='[ios-c40-pr-recovery-end]' and value==current['meta'];segments.append(current);current=None
assert current is None and len(segments)==2
for segment in segments:
    head=segment['meta'];wire=b''.join(segment['data']);expected=raw if head['rawFile']=='report.json' else log_raw
    assert wire==(fixture_dir/'original'/head['file']).read_bytes() and m.sha(wire)==head['sha256'] and gzip.decompress(wire)==expected and m.sha(expected)==head['rawSha256']
    assert head['originalDiagnostic']['status']=='failed' and head['originalDiagnostic']['profilePresent'] is False
    assert head['fileCount']==2 and head['gzipTotalBytes']==sum(len(x) for x in packed.values()) and head['gzipTotalBytes']<=head['gzipTotalLimitBytes']
assert segments[0]['meta']['files']==segments[1]['meta']['files']
passed('actual CLI emits both ordered gzip streams and identical member manifest with original failure')
(ROOT/'fixture-result.json').write_text(json.dumps({'status':'passed','syntheticOnly':True,'actualOriginalZipRecovered':False,'actualOriginalCompressionRatioMeasured':False,'testsPassed':len(tests),'tests':tests,'syntheticSmall':{'rawBytes':len(raw),'zipBytes':len(arc),'gzipBytes':sum(map(len,packed.values()))},'syntheticLargeWhitespace':{'rawBytes':len(large),'gzipBytes':sum(map(len,large_gzip.values()))},'actualCliWire':{'files':head['files'],'gzipTotalBytes':head['gzipTotalBytes'],'originalStatus':head['originalDiagnostic']['status']}},indent=2)+'\n')
print(json.dumps({'passed':len(tests),'syntheticOnly':True,'actualOriginalZipRecovered':False}))
