#!/usr/bin/env python3
"""Recover exact C36 source report bytes; never accepts a rerun or partial export."""
import argparse, base64, hashlib, json, math, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent
HEAD = '789f2199bd3791a6dc6566eecaf3c1478c99afa6'
RUN = '34875252891'
JOB = 104080730225
PATH = 'test-results/ios-safari/report.json'
MAX_BYTES = 8 * 1024 * 1024
CHUNK = 3000
TAG = re.compile(r'\[ios-frame-work-(meta|chunk|end)\] (\{.*\})\s*$')
PRODUCT = '514f671fa64b75dda7f835a430245e9b168f9aca38fbce0b8184b12938679a55'
RECORDER = '785541d3beaed0e35e8bcf042973eabb7bdb5d6c'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def expected(source=ROOT/'source'):
    return dict(runCommit=HEAD, runId=RUN, runAttempt='1', **{
        key: sha((source/'tools'/file).read_bytes()) for key, file in [
            ('helperSha256', 'ios_audio_capture.mjs'), ('harnessSha256', 'test-ios-safari.mjs'),
            ('frameWorkProbeSha256', 'frame_work_probe.mjs')]})

def recover(text, pins):
    records = []
    for line in text.splitlines():
        match = TAG.search(line)
        if match:
            records.append((match[1], json.loads(match[2])))
    if not records or records[0][0] != 'meta' or records[-1][0] != 'end':
        raise ValueError('missing complete meta/chunk/end frame-work export')
    if sum(kind == 'meta' for kind, _ in records) != 1 or sum(kind == 'end' for kind, _ in records) != 1:
        raise ValueError('duplicate or interleaved export boundaries')
    meta, end = records[0][1], records[-1][1]
    if meta != end or meta.get('complete') is not True or meta.get('file') != PATH:
        raise ValueError('export boundary identity mismatch')
    size = meta.get('bytes')
    if type(size) is not int or not 1 <= size <= MAX_BYTES:
        raise ValueError('original report byte count outside frozen export bound')
    total = math.ceil(size / CHUNK)
    if type(meta.get('totalChunks')) is not int or meta.get('totalChunks') != total or len(records) != total + 2:
        raise ValueError('missing or extra export chunks')
    for key, value in pins.items():
        if meta.get(key) != value:
            raise ValueError('export source/run mismatch: ' + key)
    chunks = []
    for index, (kind, item) in enumerate(records[1:-1]):
        if (kind != 'chunk' or item.get('file') != PATH or type(item.get('offset')) is not int
            or type(item.get('index')) is not int or item['offset'] != index * CHUNK
            or item['index'] != index or type(item.get('total')) is not int or item.get('total') != total):
            raise ValueError('chunk order/offset/index/total mismatch')
        data = base64.b64decode(item.get('base64', ''), validate=True)
        if len(data) != min(CHUNK, size - index * CHUNK):
            raise ValueError('truncated or oversized chunk')
        chunks.append(data)
    raw = b''.join(chunks)
    if len(raw) != size or sha(raw) != meta.get('sha256'):
        raise ValueError('original report bytes/SHA256 mismatch')
    report = json.loads(raw.decode('utf-8'))
    provenance = report.get('audioCapture', {}).get('provenance', {})
    for key, value in pins.items():
        if provenance.get(key) != value:
            raise ValueError('original report source/run mismatch: ' + key)
    if provenance.get('bundleSha256') != PRODUCT or provenance.get('actualRecorderBlob') != RECORDER:
        raise ValueError('original product/recorder identity mismatch')
    if provenance.get('actualBundleHashes') != {'cinderline.1.0.0.js': PRODUCT, 'dist/cinderline.1.0.0.js': PRODUCT}:
        raise ValueError('original actual product hashes mismatch')
    profile = report.get('safariFrameWork')
    if bool(profile) != meta.get('frameWorkPresent') or report.get('status') != meta.get('diagnosticStatus'):
        raise ValueError('original diagnostic metadata mismatch')
    if profile is not None:
        for key, value in pins.items():
            if profile.get('provenance', {}).get(key) != value:
                raise ValueError('profile source/run mismatch: ' + key)
    return raw, report, meta

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--log', type=pathlib.Path, default=ROOT/'transport/export.log')
    args = parser.parse_args()
    raw, report, meta = recover(args.log.read_text(), expected())
    output = ROOT/'original/report.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists() and output.read_bytes() != raw:
        raise ValueError('refusing to replace an existing different recovered original')
    output.write_bytes(raw)
    manifest = dict(sourceJob=JOB, sourceRun=RUN, sourceHead=HEAD, sourceAttempt='1',
        originalFile=PATH, bytes=len(raw), sha256=sha(raw), byteVerified=True,
        meta=meta, diagnosticComplete=(report.get('safariFrameWork') or {}).get('complete'),
        output=str(output), transport={'path':str(args.log), 'bytes':args.log.stat().st_size,
            'sha256':sha(args.log.read_bytes())},
        scope='Exact exported original report bytes only; failed or incomplete diagnostics are retained, not rejected as an inconvenient outcome.')
    (ROOT/'recovered-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    print(json.dumps(manifest, indent=2))

if __name__ == '__main__':
    main()
