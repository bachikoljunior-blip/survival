#!/usr/bin/env python3
"""Losslessly recover one fixed failed C38 report from its already saved artifact.

The original 8 MiB diagnostic exporter and 4096-row limit remain unchanged.
This separate archive recovery accepts at most 32 MiB of original JSON plus
8 MiB of original Appium log, and emits at most 8 MiB of gzip payload in total.
Recovery success never changes the failed test.
"""
import base64
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import zipfile

PIN = {
    'id': 10364986195,
    'name': 'iphone-se3-mobile-safari-61e8f8c595bde13634fe709f979816011df165d0',
    'size_in_bytes': 25105480,
    'digest': 'sha256:661474f9320966960edf4794c0fdabe4d8f456ec6166efd1dbace592cef6d372',
    'runId': 34884725972, 'head': '61e8f8c595bde13634fe709f979816011df165d0',
    'branch': 'claude/repo-instructions-constraints-r0070m', 'repositoryId': 1314923977,
}
SOURCE = {
    'preparedFromCommit': '789f2199bd3791a6dc6566eecaf3c1478c99afa6',
    'preparationReportSha256': '2dbf5a5b15424ccd2e1e33e628391fad46084f4ec46686b70db1023d9061bf69',
    'bundle': 'cinderline.1.0.0.js',
    'bundleSha256': '1094c1d96bed6b953c1655ce65549c484b8f09e275f055bff283499cece110f7',
    'recorderBlob': '785541d3beaed0e35e8bcf042973eabb7bdb5d6c',
    'actualRecorderBlob': '785541d3beaed0e35e8bcf042973eabb7bdb5d6c',
    'helperSha256': 'c0965004ba7d1e389300ab6556431d67ea1e158f82832225389851e0c1314f2a',
    'transferHelperSha256': '55150670ce3a89c24b9b3348110e29f315d9479ac14438faadf14389987eb41a',
    'frameWorkProbeSha256': 'eabc3f8ba621e992902a63790b86f0787bb84998bd5b9fa239ab20414d661fe8',
    'harnessSha256': '352330412d8ac248597bedbc34a4e2ac25c8252003447806adcd6b1761250e64',
    'runCommit': PIN['head'], 'runId': str(PIN['runId']), 'runAttempt': '1',
}
ORIGINAL_FAILURE = 'iOS audio diagnostic: bounded frame work captured and timing wrappers restored: {"recordings":3,"rows":4096,"dropped":844,"restored":true,"errors":[]}'
MARKER = '[recover-ios-phase-c38-r1]'
OUT = Path('test-results/ios-phase-c38-original-recovery-r1')
RAW_LIMIT = 32 * 1024 * 1024
RAW_FILES = {'report.json': RAW_LIMIT, 'appium.log': 8 * 1024 * 1024}
TOTAL_RAW_LIMIT = 40 * 1024 * 1024
GZIP_LIMIT = 8 * 1024 * 1024
ZIP_LIMIT = 32 * 1024 * 1024
EXPANSION_LIMIT = 96 * 1024 * 1024
PREFIX = '[ios-phase-recovery-'

def require(condition, reason):
    if not condition:
        raise ValueError(reason)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def strict_json(data):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'duplicate JSON key')
            result[key] = value
        return result
    def constant(_):
        raise ValueError('non-finite JSON value')
    return json.loads(data.decode('utf-8', errors='strict'), object_pairs_hook=pairs,
                      parse_constant=constant)

def verify_metadata(meta, pin=PIN):
    require(isinstance(meta, dict), 'artifact metadata must be an object')
    for key in ('id', 'name', 'size_in_bytes', 'digest'):
        require(meta.get(key) == pin[key], 'original artifact metadata mismatch: ' + key)
    require(meta.get('expired') is False, 'original artifact expired')
    run = meta.get('workflow_run') or {}
    for key, value in {'id': pin['runId'], 'head_sha': pin['head'], 'head_branch': pin['branch'],
                       'repository_id': pin['repositoryId'], 'head_repository_id': pin['repositoryId']}.items():
        require(run.get(key) == value, 'original artifact run mismatch: ' + key)

def bounded_read(path, limit):
    with path.open('rb') as stream:
        data = stream.read(limit + 1)
    require(len(data) <= limit, 'input exceeds bounded capacity: ' + path.name)
    return data

def verify_original(report):
    require(isinstance(report, dict), 'original report must be an object')
    checks = report.get('checks')
    require(report.get('status') == 'failed' and report.get('failures') == [ORIGINAL_FAILURE],
            'fixed original diagnostic failure differs')
    require(isinstance(checks, list) and len(checks) == 54
            and all(isinstance(item, dict) for item in checks)
            and sum(item.get('passed') is True for item in checks) == 53,
            'fixed original check counts differ')
    failed = [item for item in checks if item.get('passed') is not True]
    require(len(failed) == 1 and failed[0].get('passed') is False
            and failed[0].get('name') == 'iOS audio diagnostic: bounded frame work captured and timing wrappers restored',
            'fixed original failed check differs')
    capture = report.get('audioCapture') or {}
    require(capture.get('status') == 'captured' and isinstance(capture.get('clips'), list)
            and [c.get('name') for c in capture['clips']] == ['street-walk', 'cut-gas-air', 'arcade-room'],
            'fixed original capture declarations differ')
    provenance = capture.get('provenance') or {}
    for key, value in SOURCE.items():
        require(provenance.get(key) == value, 'fixed original provenance mismatch: ' + key)
    require(provenance.get('actualBundleHashes') == {
        'cinderline.1.0.0.js': SOURCE['bundleSha256'], 'dist/cinderline.1.0.0.js': SOURCE['bundleSha256']},
        'fixed original root/dist hashes differ')
    profile = report.get('safariFrameWork') or {}
    require(profile.get('schemaVersion') == 2 and profile.get('recordingCount') == 3
            and profile.get('limit') == 4096 and profile.get('dropped') == 844
            and isinstance(profile.get('rows'), list) and len(profile['rows']) == 4096
            and profile.get('complete') is False and profile.get('restored') is True
            and profile.get('errors') == [], 'fixed original incomplete profile differs')
    require(profile.get('provenance') == provenance, 'profile and report provenance differ')
    return {'status': 'failed', 'checks': 54, 'passedChecks': 53,
            'profileRows': 4096, 'profileDropped': 844, 'profileComplete': False,
            'profileRestored': True, 'captureStatus': 'captured', 'failure': ORIGINAL_FAILURE}

def recover(meta, archive, pin=PIN):
    verify_metadata(meta, pin)
    require(len(archive) == pin['size_in_bytes'] and 0 < len(archive) <= ZIP_LIMIT,
            'original archive size mismatch')
    require('sha256:' + sha(archive) == pin['digest'], 'original archive digest mismatch')
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        infos = z.infolist()
        require(0 < len(infos) <= 64, 'archive entry count exceeds bound')
        require(sum(info.file_size for info in infos) <= EXPANSION_LIMIT,
                'declared archive expansion exceeds bound')
        seen = set()
        targets = {}
        for info in infos:
            path = PurePosixPath(info.filename)
            require(info.orig_filename == info.filename and info.filename
                    and not path.is_absolute() and '..' not in path.parts
                    and '\\' not in info.filename and '\0' not in info.filename
                    and not re.match(r'^[A-Za-z]:', info.filename)
                    and str(path) not in seen
                    and stat.S_IFMT(info.external_attr >> 16) in (0, stat.S_IFREG, stat.S_IFDIR),
                    'unsafe or duplicate archive path')
            seen.add(str(path))
            require(not info.flag_bits & 1 and info.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED),
                    'unsupported encrypted or compressed archive entry')
            if info.filename in RAW_FILES:
                require(not info.is_dir() and 0 < info.file_size <= RAW_FILES[info.filename],
                        'selected original exceeds raw recovery bound: ' + info.filename)
                targets[info.filename] = info
        require(set(targets) == set(RAW_FILES), 'fixed root original file is missing')
        require(sum(info.file_size for info in targets.values()) <= TOTAL_RAW_LIMIT,
                'selected originals exceed total raw bound')
        originals, crcs = {}, {}
        # Do not inflate or extract media. zipfile checks each selected CRC.
        for name, limit in RAW_FILES.items():
            target = targets[name]
            with z.open(target) as stream:
                data = stream.read(limit + 1)
            require(len(data) == target.file_size and len(data) <= limit,
                    'original file length mismatch: ' + name)
            data.decode('utf-8', errors='strict')
            originals[name], crcs[name] = data, target.CRC
    diagnostic = verify_original(strict_json(originals['report.json']))
    packed = {name: gzip.compress(data, compresslevel=9, mtime=0)
              for name, data in originals.items()}
    require(0 < sum(map(len, packed.values())) <= GZIP_LIMIT,
            'lossless recovery gzip total exceeds 8 MiB bound')
    for name, data in packed.items():
        require(gzip.decompress(data) == originals[name], 'lossless original gzip round-trip differs')
    return originals, packed, diagnostic, crcs

def environment():
    require(os.environ.get('GITHUB_ACTIONS') == 'true'
            and os.environ.get('GITHUB_REPOSITORY') == 'bachikoljunior-blip/survival'
            and os.environ.get('GITHUB_WORKFLOW') == 'Floor gates'
            and os.environ.get('GITHUB_EVENT_NAME') == 'push'
            and os.environ.get('GITHUB_REF') == 'refs/heads/' + PIN['branch']
            and os.environ.get('GITHUB_RUN_ATTEMPT') == '1'
            and re.fullmatch(r'[a-f0-9]{40}', os.environ.get('GITHUB_SHA', ''))
            and re.fullmatch(r'[1-9][0-9]*', os.environ.get('GITHUB_RUN_ID', '')),
            'recovery requires the selected first source Floor push')
    event = strict_json(bounded_read(Path(os.environ.get('GITHUB_EVENT_PATH', '')), 256 * 1024))
    message = (event.get('head_commit') or {}).get('message')
    require(isinstance(message, str) and MARKER in message, 'fixed recovery marker missing')

def emit(file, packed, meta):
    print(PREFIX + 'meta] ' + json.dumps(meta, separators=(',', ':')))
    for index, offset in enumerate(range(0, len(packed), 3000)):
        print(PREFIX + 'chunk] ' + json.dumps({'file': file, 'index': index,
            'offset': offset, 'total': meta['total'],
            'base64': base64.b64encode(packed[offset:offset + 3000]).decode('ascii')}, separators=(',', ':')))
    print(PREFIX + 'end] ' + json.dumps(meta, separators=(',', ':')))

def main():
    require(sys.argv[1:] in ([], ['--metadata-only'], ['--receive-archive']), 'unsupported recovery arguments')
    environment()
    metadata_bytes = bounded_read(OUT / 'artifact-metadata.json', 128 * 1024)
    meta = strict_json(metadata_bytes)
    verify_metadata(meta)
    if sys.argv[1:] == ['--metadata-only']:
        print('[ios-phase-recovery-identity] ' + json.dumps(PIN, separators=(',', ':')))
        return
    if sys.argv[1:] == ['--receive-archive']:
        archive = sys.stdin.buffer.read(PIN['size_in_bytes'] + 1)
        require(len(archive) == PIN['size_in_bytes'] and 'sha256:' + sha(archive) == PIN['digest'],
                'downloaded fixed archive bytes/digest differ')
        (OUT / 'original.zip').write_bytes(archive)
        return
    archive = bounded_read(OUT / 'original.zip', PIN['size_in_bytes'])
    originals, packed, diagnostic, crcs = recover(meta, archive)
    files = [{'file': name + '.gz', 'encoding': 'gzip', 'bytes': len(packed[name]),
        'sha256': sha(packed[name]), 'rawFile': name, 'rawBytes': len(data),
        'rawSha256': sha(data), 'originalMemberCrc32': f'{crcs[name]:08x}',
        'rawLimitBytes': RAW_FILES[name], 'total': (len(packed[name]) + 2999) // 3000}
        for name, data in originals.items()]
    identity = {'schemaVersion': 1, 'files': files, 'fileCount': len(files),
        'gzipTotalBytes': sum(map(len, packed.values())), 'gzipTotalLimitBytes': GZIP_LIMIT,
        'rawTotalBytes': sum(map(len, originals.values())), 'rawTotalLimitBytes': TOTAL_RAW_LIMIT,
        'artifactId': PIN['id'], 'artifactZipBytes': PIN['size_in_bytes'], 'artifactZipDigest': PIN['digest'],
        'originalRunId': PIN['runId'], 'originalRunAttempt': 1, 'originalHead': PIN['head'],
        'recoveryCommit': os.environ['GITHUB_SHA'], 'recoveryRunId': os.environ['GITHUB_RUN_ID'],
        'recoveryRunAttempt': 1, 'recoveryHelperSha256': sha(Path(__file__).read_bytes()),
        'originalDiagnostic': diagnostic,
        'complete': True, 'scope': 'Lossless fixed original artifact recovery only; original diagnostic remains failed and incomplete.'}
    target = OUT / 'original'
    target.mkdir(parents=True, exist_ok=True)
    # All identity, ZIP/CRC, original failure and size checks precede publication.
    for name, data in packed.items():
        (target / (name + '.gz')).write_bytes(data)
    (target / 'artifact-metadata.json').write_bytes(metadata_bytes)
    (target / 'recovery-report.json').write_text(json.dumps(identity, indent=2) + '\n')
    for entry in files:
        emit(entry['file'], packed[entry['rawFile']], dict(identity, **entry))

if __name__ == '__main__':
    main()
