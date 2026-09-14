"""Independent synthetic ZIP/CLI validation; no original archive or network use."""
import ast
import base64
import contextlib
import copy
import gzip
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import random
import stat
import string
import struct
import sys
import tempfile
import types
import warnings
import zipfile
import zlib
import yaml

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
CANDIDATE = ROOT / 'candidate/tools/recover-ios-c40-pr.py'
spec = importlib.util.spec_from_file_location('independent_recovery_candidate', CANDIDATE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
checks = []
facts = {}

def check(name, fn):
    fn()
    checks.append({'name': name, 'passed': True})

def require(value, message='independent assertion failed'):
    if not value:
        raise AssertionError(message)

def rejects(fn):
    try:
        fn()
    except (ValueError, TypeError, AttributeError, UnicodeError, zipfile.BadZipFile, NotImplementedError):
        return
    raise AssertionError('expected rejection did not occur')

def digest(b):
    return hashlib.sha256(b).hexdigest()

summary = json.loads((ROOT / 'producer-original-pr-summary.json').read_text())
original_meta = json.loads((ROOT / 'producer-artifact-metadata.json').read_text())
# This shaped object is a synthetic input derived from compact fields. It is
# never claimed to contain the unread original report or its complete timeline.
fixture_report = {
    'status': summary['status'], 'checks': copy.deepcopy(summary['checks']),
    'failures': list(summary['failures']), 'safariFrameWork': summary['frameWork'],
    'audioCapture': {'status': summary['captureStatus'], 'clips': copy.deepcopy(summary['clips']),
                     'provenance': copy.deepcopy(summary['provenance']), 'lifecycle': copy.deepcopy(summary['lifecycle'])},
    'syntheticIndependentFixture': True,
}
raw_report = json.dumps(fixture_report, ensure_ascii=False, separators=(',', ':')).encode()
rng = random.Random(1729)
raw_appium = ('SYNTHETIC INDEPENDENT LOG\n' + ''.join(rng.choices(string.ascii_letters + string.digits, k=18000)) + '\n').encode()

def archive(entries=None):
    stream = io.BytesIO()
    if entries is None:
        entries = [('report.json', raw_report), ('appium.log', raw_appium), ('ignored-media.bin', b'not inflated')]
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', UserWarning)
        with zipfile.ZipFile(stream, 'w', compression=zipfile.ZIP_STORED) as z:
            for name, data in entries:
                z.writestr(name, data)
    return stream.getvalue()

def with_pin(data):
    pin = dict(m.PIN, size_in_bytes=len(data), digest='sha256:' + digest(data))
    meta = copy.deepcopy(original_meta)
    meta.update({key: pin[key] for key in ('id', 'name', 'size_in_bytes', 'digest')})
    return meta, pin

def recover(data):
    meta, pin = with_pin(data)
    return m.recover(meta, data, pin)

def changed_report(fn):
    r = copy.deepcopy(fixture_report)
    fn(r)
    return r

def bodies(text):
    lines = text.splitlines(keepends=True)
    return {node.name: ''.join(lines[node.lineno - 1:node.end_lineno])
            for node in ast.parse(text).body if isinstance(node, ast.FunctionDef)}

def boundaries():
    baseline = (ROOT / 'baseline/tools/recover-ios-phase-c38.py').read_bytes()
    require(hashlib.sha1(b'blob ' + str(len(baseline)).encode() + b'\0' + baseline).hexdigest() == 'cd635feda9587d9ae43a597b3e4e294f41dea76a')
    require(digest(CANDIDATE.read_bytes()) == 'fb5617825afad11c03e4d1783fbe4bb71589905a7558b054448ee0c5e656551b')
    old, new = bodies(baseline.decode()), bodies(CANDIDATE.read_text())
    preserved = ['require', 'sha', 'strict_json', 'verify_metadata', 'bounded_read', 'recover', 'environment', 'emit']
    require(all(old[name] == new[name] for name in preserved))
    require(m.RAW_FILES == {'report.json': 32 * 1024**2, 'appium.log': 8 * 1024**2})
    require((m.TOTAL_RAW_LIMIT, m.GZIP_LIMIT, m.ZIP_LIMIT, m.EXPANSION_LIMIT) == (40 * 1024**2, 8 * 1024**2, 32 * 1024**2, 96 * 1024**2))
    facts['unchangedFunctionBodies'] = preserved
check('Canonical base and candidate pins, eight unchanged function bodies, and original hard capacities', boundaries)

def source_identity():
    m.verify_metadata(original_meta)
    require(m.PIN['head'] == '8058f8431b7885e9e929e6cb57bb415d26d9f5b1')
    require(m.SOURCE['runCommit'] == '051d718255ef21c4ba37947f8177d4121cd159d3')
    require(m.ORIGINAL_FAILURES == summary['failures'])
    require(all(summary['provenance'][key] == value for key, value in m.SOURCE.items()))
    require(m.verify_original(fixture_report)['passedChecks'] == 45)
    wrong = copy.deepcopy(original_meta); wrong['workflow_run']['head_sha'] = m.SOURCE['runCommit']
    rejects(lambda: m.verify_metadata(wrong))
    rejects(lambda: m.verify_original(changed_report(lambda r: r['audioCapture']['provenance'].update(runCommit=m.PIN['head']))))
check('Source head and actual checkout merge are separate; original compact failure fields match every frozen pin', source_identity)

def metadata_rejection():
    for key in ['id', 'name', 'size_in_bytes', 'digest', 'expired']:
        bad = copy.deepcopy(original_meta); bad[key] = True if key == 'expired' else 'wrong'
        rejects(lambda: m.verify_metadata(bad))
    for key in ['id', 'head_sha', 'head_branch', 'repository_id', 'head_repository_id']:
        bad = copy.deepcopy(original_meta); bad['workflow_run'][key] = 'wrong'
        rejects(lambda: m.verify_metadata(bad))
check('All fixed artifact/run/repository fields and expiration reject mismatches', metadata_rejection)

def original_failure_rejection():
    mutations = [lambda r: r.update(status='passed'), lambda r: r.update(failures=[]),
        lambda r: r['checks'][0].update(passed=False), lambda r: r['failures'].reverse(),
        lambda r: r['audioCapture'].update(status='captured'),
        lambda r: r['audioCapture']['clips'][0]['timing'].update(captureClockGuardPassed=True),
        lambda r: r['audioCapture']['clips'][0]['timing'].update(captureClockGuardPassed=0),
        lambda r: r['audioCapture']['clips'][1]['timing'].update(captureClockGuardPassed=1),
        lambda r: r['audioCapture']['clips'].reverse(), lambda r: r.update(safariFrameWork={}),
        lambda r: r['audioCapture']['lifecycle'].update(status='passed'),
        lambda r: r['audioCapture']['lifecycle'].update(reason='changed'),
        lambda r: r['audioCapture']['provenance']['actualBundleHashes'].update({'dist/cinderline.1.0.0.js': 'wrong'})]
    for mutation in mutations:
        rejects(lambda: m.verify_original(changed_report(mutation)))
check('Fixed failed status, checks, three clocks, no profile and unexecuted lifecycle fail closed on mutation', original_failure_rejection)

def json_checks():
    for raw in [b'{"a":1,"a":2}', b'{"a":NaN}', b'{"a":Infinity}', b'\xff', b'{}{}']:
        rejects(lambda: m.strict_json(raw))
    require(m.strict_json(b'{"valid":true}') == {'valid': True})
check('Duplicate JSON keys, nonfinite literals, invalid UTF-8 and concatenated metadata reject', json_checks)

good_zip = archive()
def zip_complete():
    meta, pin = with_pin(good_zip)
    for bad in [good_zip[:-1], good_zip + b'extra', bytes([good_zip[0] ^ 1]) + good_zip[1:]]:
        rejects(lambda: m.recover(meta, bad, pin))
    originals, packed, diagnostic, crcs = recover(good_zip)
    require(originals == {'report.json': raw_report, 'appium.log': raw_appium})
    require(diagnostic['status'] == 'failed' and diagnostic['profilePresent'] is False and diagnostic['lifecycleStatus'] == 'not run')
    for name, raw in originals.items():
        require(gzip.decompress(packed[name]) == raw)
        require(crcs[name] == zlib.crc32(raw))
    facts['syntheticOriginals'] = {name: {'bytes': len(raw), 'sha256': digest(raw)} for name, raw in originals.items()}
check('Complete ZIP size/digest admission and exact two-member gzip/CRC round trip', zip_complete)

def zip_paths():
    for bad_name in ['../outside', '/absolute', 'bad\\path', 'C:/drive', './report.json']:
        rejects(lambda: recover(archive([('report.json', raw_report), ('appium.log', raw_appium), (bad_name, b'bad')])))
    rejects(lambda: recover(archive([('report.json', raw_report), ('appium.log', raw_appium), ('report.json', raw_report)])))
    nul = archive([('report.json', raw_report), ('appium.log', raw_appium), ('bad0hidden', b'bad')]).replace(b'bad0hidden', b'bad\0hidden')
    rejects(lambda: recover(nul))
    link = zipfile.ZipInfo('link'); link.create_system = 3; link.external_attr = (stat.S_IFLNK | 0o777) << 16
    rejects(lambda: recover(archive([('report.json', raw_report), ('appium.log', raw_appium), (link, b'outside')])))
    rejects(lambda: recover(archive([('nested/report.json', raw_report), ('appium.log', raw_appium)])))
check('Traversal, absolute/drive/backslash/NUL paths, normalized duplicates, symlinks and missing root members reject', zip_paths)

def central_mutation(data, key, value):
    b = bytearray(data); offset = b.index(b'PK\x01\x02')
    offsets = {'uncompressed': (24, '<I'), 'compressedMethod': (10, '<H'), 'flags': (8, '<H')}
    relative, fmt = offsets[key]; struct.pack_into(fmt, b, offset + relative, value)
    return bytes(b)

def zip_capacity_crc():
    rejects(lambda: recover(archive([('report.json', b''), ('appium.log', raw_appium)])))
    rejects(lambda: recover(archive([('report.json', raw_report), ('appium.log', raw_appium)] + [(f'ignored-{i}', b'') for i in range(63)])))
    rejects(lambda: recover(central_mutation(good_zip, 'uncompressed', 32 * 1024**2 + 1)))
    rejects(lambda: recover(central_mutation(good_zip, 'uncompressed', 96 * 1024**2 + 1)))
    rejects(lambda: recover(central_mutation(good_zip, 'compressedMethod', 99)))
    rejects(lambda: recover(central_mutation(good_zip, 'flags', 1)))
    damaged = bytearray(good_zip); start = damaged.index(raw_report); damaged[start + 5] ^= 1
    rejects(lambda: recover(bytes(damaged)))
    non_utf8 = archive([('report.json', raw_report), ('appium.log', b'\xff')])
    rejects(lambda: recover(non_utf8))
check('Selected length/CRC/UTF-8, entry count, declared expansion, raw size, encryption and codec bounds reject', zip_capacity_crc)

def excluded_media_and_gzip():
    original_open = zipfile.ZipFile.open
    opened = []
    def counted(self, name, *args, **kwargs):
        opened.append(name.filename if isinstance(name, zipfile.ZipInfo) else name)
        return original_open(self, name, *args, **kwargs)
    zipfile.ZipFile.open = counted
    try:
        originals, packed, _, _ = recover(good_zip)
    finally:
        zipfile.ZipFile.open = original_open
    require(opened == ['report.json', 'appium.log'])
    old_limit = m.GZIP_LIMIT
    try:
        # Exercise the exact aggregate limit branch with a smaller fixture-only
        # limit; the production 8 MiB constant is separately byte-verified.
        m.GZIP_LIMIT = sum(map(len, packed.values())) - 1
        rejects(lambda: recover(good_zip))
    finally:
        m.GZIP_LIMIT = old_limit
check('Only two selected members are inflated and the aggregate gzip rejection branch remains active', excluded_media_and_gzip)

@contextlib.contextmanager
def cli_scope(data=good_zip):
    with tempfile.TemporaryDirectory(prefix='synthetic-cli-', dir=ROOT) as directory:
        out = Path(directory)
        meta, pin = with_pin(data)
        (out / 'artifact-metadata.json').write_text(json.dumps(meta))
        event = out / 'event.json'; event.write_text(json.dumps({'head_commit': {'message': m.MARKER}}))
        old_env, old_pin, old_out, old_argv, old_stdin = dict(os.environ), dict(m.PIN), m.OUT, sys.argv, sys.stdin
        for key in list(os.environ):
            if key.startswith('GITHUB_'):
                del os.environ[key]
        os.environ.update({'GITHUB_ACTIONS': 'true', 'GITHUB_REPOSITORY': 'bachikoljunior-blip/survival',
            'GITHUB_WORKFLOW': 'Floor gates', 'GITHUB_EVENT_NAME': 'push',
            'GITHUB_REF': 'refs/heads/' + pin['branch'], 'GITHUB_RUN_ATTEMPT': '1',
            'GITHUB_SHA': 'a' * 40, 'GITHUB_RUN_ID': '123', 'GITHUB_EVENT_PATH': str(event)})
        m.PIN.clear(); m.PIN.update(pin); m.OUT = out
        try:
            yield out
        finally:
            m.PIN.clear(); m.PIN.update(old_pin); m.OUT = old_out
            os.environ.clear(); os.environ.update(old_env); sys.argv = old_argv; sys.stdin = old_stdin

def invoke(args, incoming=b''):
    sys.argv = [str(CANDIDATE)] + args
    sys.stdin = types.SimpleNamespace(buffer=io.BytesIO(incoming))
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        m.main()
    return output.getvalue()

def cli_environment():
    with cli_scope() as out:
        for key in ['GITHUB_ACTIONS', 'GITHUB_REPOSITORY', 'GITHUB_WORKFLOW', 'GITHUB_EVENT_NAME', 'GITHUB_REF', 'GITHUB_RUN_ATTEMPT', 'GITHUB_SHA', 'GITHUB_RUN_ID']:
            saved = os.environ[key]; os.environ[key] = 'wrong'
            rejects(lambda: invoke(['--metadata-only']))
            os.environ[key] = saved
        (out / 'event.json').write_text('{"head_commit":{"message":"no marker"}}')
        rejects(lambda: invoke(['--metadata-only']))
        require(not (out / 'original').exists() and not (out / 'original.zip').exists())
    with cli_scope() as out:
        rejects(lambda: invoke(['--other-artifact', '1']))
        text = invoke(['--metadata-only']); require(text.startswith('[ios-c40-pr-recovery-identity] '))
        require(not (out / 'original').exists() and not (out / 'original.zip').exists())
check('Repository/source push/attempt/workflow/event marker and fixed CLI argument gates reject before output files', cli_environment)

def receive_exact():
    for data in [good_zip[:-1], good_zip + b'X', bytes([good_zip[0] ^ 1]) + good_zip[1:]]:
        with cli_scope() as out:
            rejects(lambda: invoke(['--receive-archive'], data))
            require(not (out / 'original.zip').exists() and not (out / 'original').exists())
    with cli_scope() as out:
        require(invoke(['--receive-archive'], good_zip) == '')
        require((out / 'original.zip').read_bytes() == good_zip)
        require(not (out / 'original').exists())
check('Archive receiver writes only complete exact-size exact-digest bytes, with no early recovered output', receive_exact)

def cli_lossless():
    with cli_scope() as out:
        invoke(['--receive-archive'], good_zip)
        lines = invoke([]).splitlines()
        files = {}
        for line in lines:
            kind, body = line.split('] ', 1); value = json.loads(body); name = value['file']
            record = files.setdefault(name, {'chunks': []})
            if kind.endswith('-meta'): record['meta'] = value
            elif kind.endswith('-end'): record['end'] = value
            else: record['chunks'].append(value)
        require(set(files) == {'report.json.gz', 'appium.log.gz'})
        total_chunks = 0
        for name, value in files.items():
            meta = value['meta']; require(meta == value['end'])
            require(meta['originalHead'] != meta['originalCheckoutCommit'])
            require(meta['originalDiagnostic']['status'] == 'failed' and meta['originalDiagnostic']['lifecycleStatus'] == 'not run')
            require(meta['complete'] is True and meta['recoveryHelperSha256'] == digest(CANDIDATE.read_bytes()))
            require(len(value['chunks']) == meta['total'])
            packed = b''
            for index, chunk in enumerate(value['chunks']):
                require((chunk['index'], chunk['offset'], chunk['total']) == (index, len(packed), meta['total']))
                piece = base64.b64decode(chunk['base64'], validate=True); require(0 < len(piece) <= 3000); packed += piece
            raw = {'report.json.gz': raw_report, 'appium.log.gz': raw_appium}[name]
            require(len(packed) == meta['bytes'] and digest(packed) == meta['sha256'])
            require(gzip.decompress(packed) == raw and digest(raw) == meta['rawSha256'] and len(raw) == meta['rawBytes'])
            require(meta['originalMemberCrc32'] == f'{zlib.crc32(raw):08x}')
            require((out / 'original' / name).read_bytes() == packed)
            total_chunks += len(value['chunks'])
        facts['syntheticCLIStreams'] = {'files': 2, 'chunks': total_chunks, 'metaEqualsEnd': True, 'originalFailureRetained': True}
check('CLI emits two complete meta/chunk/end streams that reconstruct exact raw bytes and preserve the failed diagnostic', cli_lossless)

def no_partial_on_failure():
    data = archive([('report.json', json.dumps(changed_report(lambda r: r.update(status='passed'))).encode()), ('appium.log', raw_appium)])
    with cli_scope(data) as out:
        invoke(['--receive-archive'], data)
        output = io.StringIO()
        sys.argv = [str(CANDIDATE)]
        with contextlib.redirect_stdout(output):
            rejects(m.main)
        require(output.getvalue() == '' and not (out / 'original').exists())
check('A structurally valid archive with altered original failure creates no recovered files or success stream', no_partial_on_failure)

def workflow_boundary():
    original = (ROOT / 'baseline/gates.yml').read_bytes()
    require(hashlib.sha1(b'blob ' + str(len(original)).encode() + b'\0' + original).hexdigest() == '65a492762a06f8d8007bfe8ee68c8cf3b430d56f')
    block = (ROOT / 'recovery-job-block.yml').read_text()
    require(digest(block.encode()) == 'b275a57dd7df915d0666ac13d2ee4d2398663c2e8139042b982bfbe188d63082')
    before = yaml.safe_load(original); after = yaml.safe_load(original.decode() + '\n' + block)
    jobs_before = before['jobs']; jobs_after = after['jobs']
    require(set(jobs_after) - set(jobs_before) == {'recover-ios-c40-pr'})
    require(all(jobs_after[k] == v for k, v in jobs_before.items()))
    job = jobs_after['recover-ios-c40-pr']; require(job['permissions'] == {'contents': 'read', 'actions': 'read'})
    require(job['timeout-minutes'] == 10)
    require(job['if'] == "github.event_name == 'push' && github.ref == 'refs/heads/claude/repo-instructions-constraints-r0070m' && github.run_attempt == 1 && contains(github.event.head_commit.message, '[recover-ios-c40-pr-r1]')")
    steps = job['steps']; require(steps[0]['with'] == {'ref': '${{ github.sha }}', 'persist-credentials': False})
    require('--metadata-only' in steps[1]['run'])
    require('set -o pipefail\n' in steps[2]['run'])
    require('gh api repos/bachikoljunior-blip/survival/actions/artifacts/10369332540/zip | python3 tools/recover-ios-c40-pr.py --receive-archive' in steps[2]['run'])
    require(steps[3]['run'] == 'python3 tools/recover-ios-c40-pr.py')
    require(steps[4]['if'] == 'always()' and steps[4]['with']['if-no-files-found'] == 'error')
    patch = (ROOT / 'gates-append.patch').read_text().splitlines()
    require(not any(line.startswith('-') and not line.startswith('---') for line in patch))
    added = '\n'.join(line[1:] for line in patch if line.startswith('+') and not line.startswith('+++')) + '\n'
    require(added == '\n' + block)
    facts['workflow'] = {'existingJobsUnchanged': len(jobs_before), 'addedJobs': 1, 'fullCombinedWorkflowCandidateProduced': False}
check('Append-only standalone job preserves existing jobs, read-only permissions, marker and metadata-first official stream', workflow_boundary)

(ROOT / 'independent-controls.json').write_text(json.dumps({
    'scope': 'Independent source and synthetic ZIP/CLI controls; original archive unread',
    'pythonVersion': sys.version.split()[0], 'passed': len(checks), 'controls': checks, 'facts': facts, 'blocking': 0,
    'producerControlsCountedAsIndependent': 0,
    'fixturePinOverride': 'Only in-memory PIN size/digest and isolated OUT for synthetic CLI; candidate source file unchanged',
    'gzipBranchFixture': 'Reduced in-memory limit only for rejection branch; production 8 MiB constant independently verified unchanged',
    'actualOriginalZipRead': False, 'actualOriginalReportBytesRead': False, 'actualOriginalAppiumBytesRead': False,
    'build': False, 'generatedRoot': None, 'remoteWrites': 0, 'newCI': 0, 'reruns': 0, 'newSpawn': 0,
    'libraryAccess': 0, 'automationChanges': 0, 'rejectedRouteRetries': 0,
}, indent=2) + '\n')
print(json.dumps({'passed': len(checks), 'blocking': 0, 'facts': facts}))
