"""Independent finite synthetic checks of C39 recovery boundaries; no network."""
from pathlib import Path
from unittest.mock import patch
import base64, contextlib, copy, gzip, hashlib, importlib.util, io, json, os
import struct, subprocess, sys, zipfile

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
CANDIDATE = ROOT / 'candidate/tools/recover-ios-phase-c38.py'
candidate_bytes = CANDIDATE.read_bytes()
assert hashlib.sha256(candidate_bytes).hexdigest() == 'efbf6600efb7c332ca21e2b07b6b879c748ed5a27227608178cfa7b74c35135f'
spec = importlib.util.spec_from_file_location('review_candidate', CANDIDATE)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
cases = []
def ok(name): cases.append(name)
def rejects(name, fn):
    try: fn()
    except (ValueError, zipfile.BadZipFile, RuntimeError, KeyError, TypeError): ok(name); return
    raise AssertionError('unexpected acceptance: ' + name)

base = (HERE / 'base-gates.yml').read_bytes()
assert hashlib.sha1(b'blob ' + str(len(base)).encode() + b'\0' + base).hexdigest() == '7576645032ae06f4c01cf914e6bbd246f94ff4e3'
gates = (ROOT / 'candidate/.github/workflows/gates.yml').read_bytes()
assert hashlib.sha256(gates).hexdigest() == '737296093d9529e5aab8b2c4a8377cc082262eef0e6234caef54c5a0d3a8c660'
assert gates.startswith(base)
added = gates[len(base):].decode()
assert added.count('\n  recover-ios-phase-c38:') == 1
assert all(x in added for x in ["github.event_name == 'push'", "github.run_attempt == 1",
    "github.ref == 'refs/heads/claude/repo-instructions-constraints-r0070m'",
    "contains(github.event.head_commit.message, '[recover-ios-phase-c38-r1]')",
    'persist-credentials: false', 'actions: read', 'contents: read', 'timeout-minutes: 10',
    'set -o pipefail', '/actions/runs/34884725972/artifacts?per_page=100',
    'select(.id == 10364986195)', '/actions/artifacts/10364986195/zip'])
assert 'test-ios-safari' not in added and 'frame_work_probe' not in added
ok('canonical gates bytes preserved; only isolated recovery job appended')

metadata = json.loads((ROOT.parent / 'c38-safari-phase-result-ultra/transport/artifact-metadata.json').read_bytes())
summary = json.loads((ROOT.parent / 'c38-safari-phase-result-ultra/original/log-summary.json').read_bytes())
m.verify_metadata(metadata)
assert all(summary['provenance'][k] == v for k, v in m.SOURCE.items())
assert summary['failures'] == [m.ORIGINAL_FAILURE]
ok('fixed metadata and failure/provenance constants match actual prior evidence')
original = {'status': 'failed', 'checks': summary['checks'], 'failures': summary['failures'],
    'audioCapture': {'status': 'captured', 'clips': summary['clips'], 'provenance': summary['provenance']},
    'safariFrameWork': {'schemaVersion': 2, 'recordingCount': 3, 'limit': 4096, 'dropped': 844,
        'rows': [{}] * 4096, 'complete': False, 'restored': True, 'errors': [], 'provenance': summary['provenance']}}
raw = json.dumps(original, separators=(',', ':')).encode() + b' \n'
appium = 'SYNTHETIC Appium log α\n'.encode('utf-8')
def archive(data=raw, extras=(), log=appium, omit_log=False):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', compression=zipfile.ZIP_STORED) as z:
        z.writestr('report.json', data)
        if not omit_log: z.writestr('appium.log', log)
        for name, body in extras: z.writestr(name, body)
    return buf.getvalue()
def pin_for(arc): return {**m.PIN, 'size_in_bytes': len(arc), 'digest': 'sha256:' + m.sha(arc)}
def meta_for(pin): return {**metadata, 'size_in_bytes': pin['size_in_bytes'], 'digest': pin['digest']}
def recover(arc):
    pin = pin_for(arc); return m.recover(meta_for(pin), arc, pin)
arc = archive()
result, packed, diagnostic, crc = recover(arc)
assert result == {'report.json': raw, 'appium.log': appium}
assert all(gzip.decompress(packed[name]) == data for name, data in result.items())
assert diagnostic['profileComplete'] is False
assert m.RAW_FILES == {'report.json':33554432,'appium.log':8388608}
assert m.TOTAL_RAW_LIMIT==41943040 and m.GZIP_LIMIT==8388608 and m.ZIP_LIMIT==33554432
ok('independent synthetic root report preserves original whitespace and failed state')

# Non-target CRC is deliberately invalid: selected files are checked while
# unrelated media bytes are not inflated. This is a scoped guarantee, not a test
# that all original archive members were read or verified.
media_arc = bytearray(archive(extras=[('audio/example.mp4', b'synthetic unused media')]))
second_central = media_arc.index(b'PK\x01\x02', media_arc.index(b'PK\x01\x02') + 4)
third_central = media_arc.index(b'PK\x01\x02', second_central + 4)
media_arc[third_central+16:third_central+20] = struct.pack('<I', 0)
assert recover(bytes(media_arc))[0]['report.json'] == raw
ok('non-target media not inflated; CRC guarantee covers selected report and appium only')
bad = bytearray(arc); pos = bad.index(b'PK\x01\x02'); bad[pos+16:pos+20] = struct.pack('<I', 0)
rejects('selected report CRC corruption rejected', lambda: recover(bytes(bad)))
rejects('normalized duplicate root path rejected', lambda: recover(archive(extras=[('./report.json', raw)])))
nul = bytearray(archive(extras=[('badXtail', b'x')]))
nul = nul.replace(b'badXtail', b'bad\0tail')
rejects('NUL-truncated member name rejected', lambda: recover(bytes(nul)))
local = bytearray(arc); local[30:41] = b'report.jsoX'
rejects('local-header vs central-name mismatch rejected', lambda: recover(bytes(local)))
encrypted = bytearray(arc); pos = encrypted.index(b'PK\x01\x02')
encrypted[pos+8:pos+10] = struct.pack('<H', 1)
rejects('encrypted flag rejected before selected read', lambda: recover(bytes(encrypted)))
rejects('65 members rejected', lambda: recover(archive(extras=[(f'x/{i}', b'') for i in range(63)])))
with patch.dict(m.RAW_FILES, {'report.json': len(raw)}):
    assert recover(arc)[0]['report.json'] == raw
    rejects('raw report boundary one byte over rejected', lambda: recover(archive(raw+b' ')))
ok('raw report boundary exact length accepted')
with patch.dict(m.RAW_FILES, {'appium.log': len(appium)-1}):
    rejects('appium raw bound rejected', lambda: recover(arc))
with patch.object(m, 'TOTAL_RAW_LIMIT', len(raw)+len(appium)-1):
    rejects('combined raw bound rejected', lambda: recover(arc))
with patch.object(m, 'GZIP_LIMIT', sum(map(len,packed.values()))):
    assert recover(arc)[1] == packed
ok('combined gzip exact boundary accepted')
with patch.object(m, 'GZIP_LIMIT', sum(map(len,packed.values()))-1):
    rejects('combined gzip one byte over rejected', lambda: recover(arc))
rejects('missing appium log rejected before export', lambda: recover(archive(omit_log=True)))
rejects('invalid UTF8 appium rejected', lambda: recover(archive(log=b'\xff')))
appium_bad=bytearray(arc)
second=appium_bad.index(b'PK\x01\x02',appium_bad.index(b'PK\x01\x02')+4)
appium_bad[second+16:second+20]=struct.pack('<I',0)
rejects('appium CRC corruption rejected', lambda: recover(bytes(appium_bad)))

fixture = HERE / 'fixture'; fixture.mkdir(exist_ok=True)
event = fixture / 'event.json'; event.write_text(json.dumps({'head_commit': {'message': m.MARKER}}))
env = {'GITHUB_ACTIONS': 'true', 'GITHUB_REPOSITORY': 'bachikoljunior-blip/survival',
    'GITHUB_WORKFLOW': 'Floor gates', 'GITHUB_EVENT_NAME': 'push', 'GITHUB_REF': 'refs/heads/'+m.PIN['branch'],
    'GITHUB_RUN_ATTEMPT': '1', 'GITHUB_SHA': 'a'*40, 'GITHUB_RUN_ID': '12345', 'GITHUB_EVENT_PATH': str(event)}
pin = pin_for(arc)
(fixture/'artifact-metadata.json').write_text(json.dumps(meta_for(pin)))
class Input:
    def __init__(self, data): self.buffer=io.BytesIO(data)
def receive(data):
    stdout=io.StringIO()
    with patch.dict(os.environ,env,clear=True),patch.dict(m.PIN,pin,clear=True),patch.object(m,'OUT',fixture),patch.object(sys,'argv',['recovery','--receive-archive']),patch.object(sys,'stdin',Input(data)),contextlib.redirect_stdout(stdout):
        m.main()
    assert stdout.getvalue() == ''
for name, data in [('short',arc[:-1]), ('long',arc+b'x'), ('digest',arc[:-1]+bytes([arc[-1]^1]))]:
    dest=fixture/'original.zip'; dest.unlink(missing_ok=True)
    rejects('receiver '+name+' input rejected', lambda data=data:receive(data))
    assert not dest.exists()
receive(arc)
assert (fixture/'original.zip').read_bytes() == arc
ok('receiver exact fixture bytes written with zero stdout')

for key,value in [('GITHUB_RUN_ATTEMPT','2'),('GITHUB_EVENT_NAME','pull_request'),('GITHUB_REF','refs/heads/main')]:
    with patch.dict(os.environ,{**env,key:value},clear=True): rejects('environment '+key, m.environment)
event.write_text(json.dumps({'head_commit': {'message':'[ios-frame-work-c38-r1]'}}))
with patch.dict(os.environ,env,clear=True): rejects('profile marker cannot select recovery',m.environment)
event.write_text(json.dumps({'head_commit': {'message':m.MARKER}}))

# Exercise the real candidate main with controlled synthetic input; patching
# constants occurs only in this independent Python process, not candidate files.
def main_capture():
    stdout=io.StringIO()
    with patch.dict(os.environ,env,clear=True),patch.dict(m.PIN,pin,clear=True),patch.object(m,'OUT',fixture),patch.object(sys,'argv',['recovery']),contextlib.redirect_stdout(stdout):
        m.main()
    return stdout.getvalue()
wire=main_capture().splitlines()
streams={}; current=None
for line in wire:
    tag,payload=line.split(' ',1); item=json.loads(payload)
    if tag=='[ios-phase-recovery-meta]':
        assert current is None and item['file'] not in streams
        current=item['file'];streams[current]={'meta':item,'chunks':[]}
    elif tag=='[ios-phase-recovery-chunk]':
        assert current==item['file'];streams[current]['chunks'].append(item)
    elif tag=='[ios-phase-recovery-end]':
        assert current==item['file'] and streams[current]['meta']==item;current=None
    else: raise AssertionError(tag)
assert current is None and set(streams)=={'report.json.gz','appium.log.gz'}
assert streams['report.json.gz']['meta']['files']==streams['appium.log.gz']['meta']['files']
for file,stream in streams.items():
    head=stream['meta']; chunks=stream['chunks']; name=head['rawFile']; data=result[name]
    assert head['rawSha256']==m.sha(data) and head['recoveryHelperSha256']==m.sha(candidate_bytes)
    assert head['fileCount']==2 and head['gzipTotalBytes']==sum(map(len,packed.values()))
    assert head['rawTotalBytes']==sum(map(len,result.values())) and head['total']==len(chunks)
    assert next(entry for entry in head['files'] if entry['file']==file)['rawSha256']==head['rawSha256']
    for i,ch in enumerate(chunks):
        assert ch['index']==i and ch['offset']==i*3000 and ch['total']==len(chunks)
    body=b''.join(base64.b64decode(ch['base64'],validate=True) for ch in chunks)
    assert body==packed[name] and len(body)==head['bytes'] and m.sha(body)==head['sha256']
    assert gzip.decompress(body)==data
    assert head['originalDiagnostic']['status']=='failed' and not head['originalDiagnostic']['profileComplete']
ok('actual main two streams/manifests/rawSHA/gzipSHA/helperSHA independently reconstructed')
(fixture/'original.zip').write_bytes(arc+b'x')
stdout=io.StringIO()
with patch.dict(os.environ,env,clear=True),patch.dict(m.PIN,pin,clear=True),patch.object(m,'OUT',fixture),patch.object(sys,'argv',['recovery']),contextlib.redirect_stdout(stdout):
    rejects('invalid archive publishes no wire metadata/chunks',m.main)
assert stdout.getvalue()==''

# A valid first member plus corrupt second member must create no publication
# directory and emit no metadata for the first member.
fresh=fixture/'invalid-second';fresh.mkdir(exist_ok=True)
bad_arc=bytes(appium_bad);bad_pin=pin_for(bad_arc)
(fresh/'artifact-metadata.json').write_text(json.dumps(meta_for(bad_pin)))
(fresh/'original.zip').write_bytes(bad_arc)
stdout=io.StringIO()
with patch.dict(os.environ,env,clear=True),patch.dict(m.PIN,bad_pin,clear=True),patch.object(m,'OUT',fresh),patch.object(sys,'argv',['recovery']),contextlib.redirect_stdout(stdout):
    rejects('second member CRC failure prevents both publications',m.main)
assert stdout.getvalue()=='' and not (fresh/'original').exists()

# Run the real shell pipeline with a local synthetic producer that writes the
# exact valid archive then exits 7. pipefail must make the step fail even though
# the receiver successfully verifies its complete byte stream.
bootstrap=fixture/'receiver-bootstrap.py'
bootstrap.write_text("import sys,importlib.util,json\nfrom pathlib import Path\nsys.dont_write_bytecode=True\np=Path(sys.argv[1]);q=Path(sys.argv[2]);s=importlib.util.spec_from_file_location('m',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nm.PIN.update(json.loads((q/'fixture-pin.json').read_text()));m.OUT=q;sys.argv=['recovery','--receive-archive'];m.main()\n")
(fixture/'fixture-pin.json').write_text(json.dumps(pin));(fixture/'producer-input.zip').write_bytes(arc)
producer=fixture/'producer.py';producer.write_text("from pathlib import Path\nimport sys\nsys.stdout.buffer.write(Path(sys.argv[1]).read_bytes());sys.stdout.buffer.flush();raise SystemExit(7)\n")
shell='set -o pipefail\npython "$1" "$2" | python "$3" "$4" "$5"'
process=subprocess.run(['bash','--noprofile','--norc','-c',shell,'review',str(producer),str(fixture/'producer-input.zip'),str(bootstrap),str(CANDIDATE),str(fixture)],env={**os.environ,**env},capture_output=True)
assert process.returncode==7 and process.stdout==b'' and process.stderr==b''
assert (fixture/'original.zip').read_bytes()==arc
ok('actual bash pipefail preserves producer failure after complete valid bytes')

out={'status':'passed','independentChecks':len(cases),'checks':cases,
    'candidateSha256':m.sha(candidate_bytes),'gatesSha256':m.sha(gates),
    'canonicalBaseGatesBytes':len(base),'canonicalBaseGatesSha256':m.sha(base),'onlyAppend':True,
    'originalArtifactAcquired':False,'candidateEdited':False,'realCompressionRatioMeasured':False,
    'scope':'Local synthetic fixtures and actual local bash pipeline only. Fixed archive pins overridden in memory for fixtures; production provides no override.',
    'syntheticBytes':{'reportRaw':len(raw),'appiumRaw':len(appium),'zip':len(arc),'gzipTotal':sum(map(len,packed.values()))},'pipelineExitStatus':process.returncode}
(HERE/'edge-results.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'status':'passed','independentChecks':len(cases),'pipelineExitStatus':process.returncode,'originalArtifactAcquired':False}))
