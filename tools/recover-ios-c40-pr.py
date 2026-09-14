#!/usr/bin/env python3
"""Losslessly recover one fixed failed C40 PR report from its already saved artifact.

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
    'id': 10369332540,
    'name': 'iphone-se3-mobile-safari-051d718255ef21c4ba37947f8177d4121cd159d3',
    'size_in_bytes': 13459726,
    'digest': 'sha256:1a316ac9b028cb6b3d1f126401c36bef33e8b9eac869db367ecb50e1cddcd1a2',
    'runId': 34895779614, 'head': '8058f8431b7885e9e929e6cb57bb415d26d9f5b1',
    'branch': 'claude/repo-instructions-constraints-r0070m', 'repositoryId': 1314923977,
}
SOURCE = {
    'preparedFromCommit': '61e8f8c595bde13634fe709f979816011df165d0',
    'preparationReportSha256': '000c622624315c43eb98639b2fc32c566e91f1c5cf4ec67713b4d8dd048efa44',
    'bundle': 'cinderline.1.0.0.js',
    'bundleSha256': '8c5624edd96ba238135e46c90e53c6221b3c3303b977bb5d4e41b752264d94f0',
    'recorderBlob': '785541d3beaed0e35e8bcf042973eabb7bdb5d6c',
    'actualRecorderBlob': '785541d3beaed0e35e8bcf042973eabb7bdb5d6c',
    'helperSha256': 'e4f36959ec83f4d4112bda7be27e081ba0e721ee27784705a21a59c4c31d0262',
    'transferHelperSha256': '55150670ce3a89c24b9b3348110e29f315d9479ac14438faadf14389987eb41a',
    'frameWorkProbeSha256': 'eabc3f8ba621e992902a63790b86f0787bb84998bd5b9fa239ab20414d661fe8',
    'harnessSha256': 'a278b87f0fb2e15b843205b6fe211a8046f72463e2f29956bfbf867f5900adee',
    'runCommit': '051d718255ef21c4ba37947f8177d4121cd159d3', 'runId': str(PIN['runId']), 'runAttempt': '1',
}
ORIGINAL_FAILURES = ['audio street-walk: wall, audio and simulation clocks stay aligned for capture: {"wallSeconds":10.426000000000007,"audioSeconds":10.432,"engineSeconds":9.866666666666667,"engineFrames":560,"engineToAudioRatio":0.9458077709611452,"audioToWallRatio":1.0005754843660073,"engineMinusAudioSeconds":-0.5653333333333332,"audioMinusWallSeconds":0.005999999999993122,"toleranceSeconds":0.5216000000000001,"captureGuardScope":"Acquisition clock guard only; no quality or reference-comparison pass.","captureClockGuardPassed":false,"telemetryComplete":true,"finiteTimeline":true,"orderedTimeline":true,"finitePoses":true}', 'iOS audio lifecycle: original three recordings completed before boundary operations: {"status":"captured","clips":3,"captureCheckFailed":true,"timing":[{"captureClockGuardPassed":false,"telemetryComplete":true},{"captureClockGuardPassed":true,"telemetryComplete":true},{"captureClockGuardPassed":true,"telemetryComplete":true}],"lastInterior":"arcade","newFailures":1}', 'Error: Original iOS audio capture did not complete successfully; lifecycle operations not attempted\n    at Module.captureIosAudio (file:///Users/runner/work/survival/survival/tools/ios_audio_capture.mjs:321:27)\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///Users/runner/work/survival/survival/tools/test-ios-safari.mjs:624:5']
FAILED_CHECK_NAMES = ['audio street-walk: wall, audio and simulation clocks stay aligned for capture', 'iOS audio lifecycle: original three recordings completed before boundary operations']
MARKER = '[recover-ios-c40-pr-r1]'
OUT = Path('test-results/ios-c40-pr-original-recovery-r1')
RAW_LIMIT = 32 * 1024 * 1024
RAW_FILES = {'report.json': RAW_LIMIT, 'appium.log': 8 * 1024 * 1024}
TOTAL_RAW_LIMIT = 40 * 1024 * 1024
GZIP_LIMIT = 8 * 1024 * 1024
ZIP_LIMIT = 32 * 1024 * 1024
EXPANSION_LIMIT = 96 * 1024 * 1024
PREFIX = '[ios-c40-pr-recovery-'

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
    require(report.get('status') == 'failed' and report.get('failures') == ORIGINAL_FAILURES,
            'fixed original acquisition failures differ')
    require(isinstance(checks, list) and len(checks) == 47
            and all(isinstance(item, dict) for item in checks)
            and sum(item.get('passed') is True for item in checks) == 45,
            'fixed original check counts differ')
    failed = [item for item in checks if item.get('passed') is not True]
    require(len(failed) == 2 and all(item.get('passed') is False for item in failed)
            and [item.get('name') for item in failed] == FAILED_CHECK_NAMES,
            'fixed original failed checks differ')
    capture = report.get('audioCapture') or {}
    require(capture.get('status') == 'acquisition failed' and isinstance(capture.get('clips'), list)
            and all(isinstance(c, dict) for c in capture['clips'])
            and [c.get('name') for c in capture['clips']] == ['street-walk', 'cut-gas-air', 'arcade-room'],
            'fixed original capture declarations differ')
    require(all((c.get('timing') or {}).get('captureClockGuardPassed') is expected
            for c, expected in zip(capture['clips'], [False, True, True])),
            'fixed original acquisition clocks differ')
    provenance = capture.get('provenance') or {}
    for key, value in SOURCE.items():
        require(provenance.get(key) == value, 'fixed original provenance mismatch: ' + key)
    require(provenance.get('actualBundleHashes') == {
        'cinderline.1.0.0.js': SOURCE['bundleSha256'], 'dist/cinderline.1.0.0.js': SOURCE['bundleSha256']},
        'fixed original root/dist hashes differ')
    require(report.get('safariFrameWork') is None, 'fixed original unexpectedly has a frame profile')
    lifecycle = capture.get('lifecycle') or {}
    require(lifecycle.get('status') == 'not run'
            and lifecycle.get('reason') == 'Original acquisition did not complete successfully; no boundary operation was attempted.',
            'fixed original lifecycle declaration differs')
    return {'status': 'failed', 'checks': 47, 'passedChecks': 45,
            'profilePresent': False, 'captureStatus': 'acquisition failed', 'clips': 3,
            'lifecycleStatus': 'not run', 'failures': ORIGINAL_FAILURES}

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
        print('[ios-c40-pr-recovery-identity] ' + json.dumps(PIN, separators=(',', ':')))
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
        'originalCheckoutCommit': SOURCE['runCommit'],
        'recoveryCommit': os.environ['GITHUB_SHA'], 'recoveryRunId': os.environ['GITHUB_RUN_ID'],
        'recoveryRunAttempt': 1, 'recoveryHelperSha256': sha(Path(__file__).read_bytes()),
        'originalDiagnostic': diagnostic,
        'complete': True, 'scope': 'Lossless fixed original artifact recovery only; original acquisition remains failed and lifecycle operations remain unexecuted.'}
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
