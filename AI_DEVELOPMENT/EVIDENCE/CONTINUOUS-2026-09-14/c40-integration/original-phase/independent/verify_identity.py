"""Independently decode the existing recovery log in memory; no network/writes outside HERE."""
from pathlib import Path
import base64, gzip, hashlib, json, zlib
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
def sha(b):return hashlib.sha256(b).hexdigest()
def strict_json(b):
    def pairs(items):
        d={}
        for k,v in items:
            assert k not in d, 'duplicate key';d[k]=v
        return d
    def bad(x):raise ValueError(x)
    return json.loads(b, object_pairs_hook=pairs, parse_constant=bad)
rawlog=(ROOT/'transport/job-original.log').read_bytes()
assert len(rawlog)==824606 and sha(rawlog)=='6cb56ab8a51b28f6720db3e7e258264261a1b02e77cda859a929dfc3805550e1'
assert rawlog.endswith(b'\n')
streams={};current=None;counts={'meta':0,'chunk':0,'end':0}
for line in rawlog.splitlines():
    for kind in counts:
        tag=('[ios-phase-recovery-'+kind+'] ').encode()
        if tag not in line:continue
        item=strict_json(line.split(tag,1)[1]);counts[kind]+=1
        if kind=='meta':
            assert current is None and item['file'] not in streams
            current=item['file'];streams[current]={'meta':item,'chunks':[]}
        elif kind=='chunk':
            assert current==item['file'];streams[current]['chunks'].append(item)
        else:
            assert current==item['file'] and streams[current]['meta']==item
            current=None
assert current is None and counts=={'meta':2,'chunk':195,'end':2}
assert set(streams)=={'report.json.gz','appium.log.gz'}
assert streams['report.json.gz']['meta']['files']==streams['appium.log.gz']['meta']['files']
expected={'report.json':(16237592,'9fe62379c2c35a01cb4b83af265b8ab67024d58b828a2da49bb586a68f6d092e'),
          'appium.log':(3654815,'bf39c21cbc8fef21b99ffe2130bd41575730cd193bd53c03c5eb6bac4ae11261')}
verified=[]
for name,stream in streams.items():
    m=stream['meta'];parts=[]
    assert m['fileCount']==2 and m['encoding']=='gzip' and m['complete'] is True
    assert m['artifactId']==10364986195 and m['artifactZipBytes']==25105480
    assert m['artifactZipDigest']=='sha256:661474f9320966960edf4794c0fdabe4d8f456ec6166efd1dbace592cef6d372'
    assert m['originalRunId']==34884725972 and m['originalRunAttempt']==1
    assert m['originalHead']=='61e8f8c595bde13634fe709f979816011df165d0'
    assert m['recoveryCommit']=='dff2d683d0a9821c79d84848bf93cb45b8920494'
    assert m['recoveryRunId']=='34891306829' and m['recoveryRunAttempt']==1
    assert m['recoveryHelperSha256']=='efbf6600efb7c332ca21e2b07b6b879c748ed5a27227608178cfa7b74c35135f'
    assert m['gzipTotalLimitBytes']==8388608 and m['rawTotalLimitBytes']==41943040
    assert m['gzipTotalBytes']==579678 and m['rawTotalBytes']==19892407
    assert len(stream['chunks'])==m['total']==(m['bytes']+2999)//3000
    for i,c in enumerate(stream['chunks']):
        assert c['index']==i and c['offset']==i*3000 and c['total']==m['total'] and c['file']==name
        part=base64.b64decode(c['base64'],validate=True)
        assert len(part)==min(3000,m['bytes']-i*3000);parts.append(part)
    packed=b''.join(parts)
    assert len(packed)==m['bytes'] and sha(packed)==m['sha256']
    assert packed==(ROOT/'original'/name).read_bytes()
    raw=gzip.decompress(packed)
    assert len(raw)==m['rawBytes'] and sha(raw)==m['rawSha256']
    assert f'{zlib.crc32(raw)&0xffffffff:08x}'==m['originalMemberCrc32']
    assert (len(raw),sha(raw))==expected[m['rawFile']]
    assert raw==(ROOT/'original'/m['rawFile']).read_bytes()
    assert len(raw)<=m['rawLimitBytes']
    entry=next(x for x in m['files'] if x['file']==name)
    assert all(m[k]==v for k,v in entry.items())
    assert m['originalDiagnostic']['status']=='failed' and m['originalDiagnostic']['profileComplete'] is False
    verified.append(entry)
r=strict_json((ROOT/'original/report.json').read_bytes())
assert r['status']=='failed' and len(r['checks'])==54 and sum(x['passed'] for x in r['checks'])==53
assert r['failures']==[streams['report.json.gz']['meta']['originalDiagnostic']['failure']]
assert r['safariFrameWork']['complete'] is False and r['safariFrameWork']['dropped']==844
assert r['safariFrameWork']['restored'] and r['safariFrameWork']['errors']==[]
assert r['safariFrameWork']['provenance']==r['audioCapture']['provenance']
original_summary=strict_json((ROOT.parent/'c38-safari-phase-result-ultra/original/log-summary.json').read_bytes())
f=r['safariFrameWork'];capture=r['audioCapture']
derived={'status':r['status'],'checks':r['checks'],'failures':r['failures'],
 'capabilities':r['safariAudioCapabilities'],'provenance':capture['provenance'],
 'frameWork':{'rows':len(f['rows']),'limit':f['limit'],'dropped':f['dropped'],'recordings':f['recordingCount'],'complete':f['complete'],'restored':f['restored'],'errors':f['errors']},
 'lifecycle':capture['lifecycle'],'captureStatus':capture['status'],'comparison':capture['comparison'],
 'clips':[{**{k:c[k] for k in ['name','path','bytes','sha256','mime','timing']},'tracks':c['before']['tracks']} for c in capture['clips']]}
assert derived==original_summary
source=[]
for file in sorted((ROOT/'source').rglob('*')):
    if not file.is_file() or '__pycache__' in file.parts:continue
    b=file.read_bytes();source.append({'path':str(file.relative_to(ROOT/'source')),'bytes':len(b),'sha256':sha(b)})
pins={x['path']:x['sha256'] for x in source}
for key,file in [('helperSha256','ios_audio_capture.mjs'),('transferHelperSha256','ios_audio_transfer.mjs'),('harnessSha256','test-ios-safari.mjs'),('frameWorkProbeSha256','frame_work_probe.mjs')]:
    assert capture['provenance'][key]==pins['tools/'+file]
assert pins['tools/recover-ios-phase-c38.py']==streams['report.json.gz']['meta']['recoveryHelperSha256']
rec=(ROOT/'source/tools/mobile_audio_capture.mjs').read_bytes()
assert hashlib.sha1(b'blob '+str(len(rec)).encode()+b'\0'+rec).hexdigest()==capture['provenance']['recorderBlob']=='785541d3beaed0e35e8bcf042973eabb7bdb5d6c'
out={'status':'verified','recoveryLogBytes':len(rawlog),'recoveryLogSha256':sha(rawlog),'streams':counts,'files':verified,
 'sharedFilesManifestVerified':True,'fullReportReproducesPriorOriginalSummary':True,'sourceFiles':source,
 'originalDiagnosticStillFailed':True,'missingProfileRowsRecovered':False,
 'originalArchiveIndependentlyFetched':False,'scope':'Independent recovery-wire/gzip/raw/CRC identity and source pin verification; no media acquisition.'}
(HERE/'identity-result.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'status':'verified','streams':counts,'rawTotalBytes':sum(x['rawBytes'] for x in verified),'priorSummaryMatches':True}))
