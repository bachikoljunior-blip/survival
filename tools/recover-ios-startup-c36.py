#!/usr/bin/env python3
"""Recover the fixed C36 PR startup failure; no simulator, retry or product work."""
import base64
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
    'id': 10360954160,
    'name': 'iphone-se3-mobile-safari-d175f81fa3c89f93fca9040e959a69bc258f666c',
    'size_in_bytes': 97944,
    'digest': 'sha256:b40c9691451187b79db2d9263f19f52756abacb2e23f88e5d285b691d50b7113',
    'runId': 34875256619,
    'runCommit': 'd175f81fa3c89f93fca9040e959a69bc258f666c',
    'head': '789f2199bd3791a6dc6566eecaf3c1478c99afa6',
    'branch': 'claude/repo-instructions-constraints-r0070m',
    'repositoryId': 1314923977,
}
FILES = {
    'report.json': 8 * 1024 * 1024,
    'appium.log': 4 * 1024 * 1024,
    'simulator-selection.json': 128 * 1024,
    'xcode-version.txt': 64 * 1024,
    'xcode-path.txt': 64 * 1024,
    'simulator-sdk-version.txt': 64 * 1024,
    'f3-audio-verification.json': 128 * 1024,
}
OUT = Path('test-results/ios-startup-c36-original-recovery-r1')
PREFIX = '[ios-startup-recovery-'

def require(ok, reason):
    if not ok:
        raise ValueError(reason)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def verify_metadata(meta, pin=PIN):
    for key in ('id', 'name', 'size_in_bytes', 'digest'):
        require(meta.get(key) == pin[key], 'original artifact metadata mismatch: ' + key)
    require(meta.get('expired') is False, 'original artifact expired')
    run = meta.get('workflow_run') or {}
    for key, value in {'id': pin['runId'], 'head_sha': pin['head'],
                       'head_branch': pin['branch'], 'repository_id': pin['repositoryId'],
                       'head_repository_id': pin['repositoryId']}.items():
        require(run.get(key) == value, 'original artifact run mismatch: ' + key)

def recover(meta, archive, pin=PIN):
    verify_metadata(meta, pin)
    require(len(archive) == pin['size_in_bytes'] and len(archive) <= 2 * 1024 * 1024,
            'original archive size mismatch')
    require('sha256:' + sha(archive) == pin['digest'], 'original archive digest mismatch')
    originals = {}
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        infos = z.infolist()
        require(0 < len(infos) <= 32, 'unexpected original archive entry count')
        require(sum(i.file_size for i in infos) <= 16 * 1024 * 1024, 'archive expansion exceeds bound')
        seen = set()
        for info in infos:
            path = PurePosixPath(info.filename)
            require(info.filename not in seen, 'duplicate archive entry')
            seen.add(info.filename)
            require(not path.is_absolute() and '..' not in path.parts and '\\' not in info.filename
                    and not stat.S_ISLNK(info.external_attr >> 16), 'unsafe archive entry')
            if info.filename not in FILES:
                continue
            require(not info.is_dir() and info.file_size <= FILES[info.filename], 'original file exceeds bound')
            data = z.read(info)  # zipfile also checks the original CRC.
            require(len(data) == info.file_size, 'original file length mismatch')
            data.decode('utf-8', errors='strict')
            originals[info.filename] = data
    require(set(originals) == set(FILES), 'required original startup file missing')
    report = json.loads(originals['report.json'])
    require(report.get('status') == 'failed' and report.get('checks') == [],
            'fixed original was not a pre-check failure')
    failures = report.get('failures') or []
    require(len(failures) == 1 and 'WebDriver POST /session:' in failures[0]
            and 'ECONNREFUSED 127.0.0.1:8100' in failures[0], 'fixed original failure differs')
    require(not (report.get('audioCapture') or {}).get('clips'), 'unexpected acquired media')
    gate = json.loads(originals['f3-audio-verification.json'])
    require(gate.get('status') == 'failed', 'original required audio gate did not fail')
    return originals

def emit(file, data, identity):
    count = (len(data) + 2999) // 3000
    meta = dict(identity, file=file, bytes=len(data), sha256=sha(data), total=count, complete=True)
    print(PREFIX + 'meta] ' + json.dumps(meta, separators=(',', ':')))
    for index, offset in enumerate(range(0, len(data), 3000)):
        chunk = dict(file=file, index=index, offset=offset, total=count,
                     base64=base64.b64encode(data[offset:offset + 3000]).decode('ascii'))
        print(PREFIX + 'chunk] ' + json.dumps(chunk, separators=(',', ':')))
    print(PREFIX + 'end] ' + json.dumps(meta, separators=(',', ':')))

def main():
    require(sys.argv[1:] in ([], ['--metadata-only']), 'unsupported recovery arguments')
    require(os.environ.get('GITHUB_REPOSITORY') == 'bachikoljunior-blip/survival'
            and os.environ.get('GITHUB_EVENT_NAME') == 'push'
            and os.environ.get('GITHUB_REF') == 'refs/heads/' + PIN['branch']
            and os.environ.get('GITHUB_RUN_ATTEMPT') == '1'
            and re.fullmatch(r'[a-f0-9]{40}', os.environ.get('GITHUB_SHA', ''))
            and re.fullmatch(r'[1-9][0-9]*', os.environ.get('GITHUB_RUN_ID', '')),
            'recovery must be the selected source push attempt')
    metadata_bytes = (OUT / 'artifact-metadata.json').read_bytes()
    require(len(metadata_bytes) <= 128 * 1024, 'metadata exceeds bound')
    meta = json.loads(metadata_bytes)
    verify_metadata(meta)
    if sys.argv[1:] == ['--metadata-only']:
        print('[ios-startup-recovery-identity] ' + json.dumps(PIN, separators=(',', ':')))
        return
    originals = recover(meta, (OUT / 'original.zip').read_bytes())
    identity = dict(artifactId=PIN['id'], originalRunId=PIN['runId'], originalRunCommit=PIN['runCommit'],
                    sourceHead=PIN['head'], recoveryCommit=os.environ['GITHUB_SHA'],
                    recoveryRunId=os.environ['GITHUB_RUN_ID'], recoveryRunAttempt='1')
    receipt = dict(status='recovered original startup failure', artifact=PIN,
                   scope='Original WDA/session startup failure only. No recording, timing or quality success.',
                   files=[dict(file=f, bytes=len(b), sha256=sha(b)) for f, b in originals.items()],
                   quality='not measured', comparison='not measured')
    originals['artifact-metadata.json'] = metadata_bytes
    originals['recovery-report.json'] = (json.dumps(receipt, indent=2) + '\n').encode()
    # All archive, identity and failure checks finish before writing or exporting any original.
    target = OUT / 'original'
    target.mkdir(parents=True, exist_ok=True)
    for file, data in originals.items():
        (target / file).write_bytes(data)
        emit(file, data, identity)

if __name__ == '__main__':
    main()
