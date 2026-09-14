#!/usr/bin/env python3
"""Independent C36 transport/provenance verifier and CPU-side clock arithmetic.

Reads an original decoded job log and an already recovered report; never extracts
or overwrites the report and never executes a browser, CI job, or media recorder.
"""
import argparse
import base64
import copy
import hashlib
import json
import math
import re
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
HEAD = '789f2199bd3791a6dc6566eecaf3c1478c99afa6'
PATH = 'test-results/ios-safari/report.json'
MAX_BYTES = 8 * 1024 * 1024
CHUNK = 3000
FIXED = 1 / 60
PINS = {
    'runCommit': HEAD, 'runId': '34875252891', 'runAttempt': '1',
    'helperSha256': '7c7356237d487786234e737fe959075c942e39844f638d1e1ea3f925b0bd5194',
    'harnessSha256': 'fe15b0b8fc0143f826f45cc8642fac302e829c36e8242e1328e5498d8cf6b6ec',
    'frameWorkProbeSha256': '2ce6e467d5f6ba45b18da2d644b3ad4463bbd036aaac9def3117056bd5ef08cf',
}
PRODUCT = '514f671fa64b75dda7f835a430245e9b168f9aca38fbce0b8184b12938679a55'
RECORDER = '785541d3beaed0e35e8bcf042973eabb7bdb5d6c'


def need(condition, reason):
    if not condition:
        raise ValueError(reason)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def pairs(pairs):
    result = {}
    for key, value in pairs:
        need(key not in result, 'duplicate JSON property: ' + key)
        result[key] = value
    return result


def strict_json(value):
    def reject(value):
        raise ValueError('non-finite JSON literal: ' + value)
    return json.loads(value, object_pairs_hook=pairs, parse_constant=reject)


def finite(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def close(actual, expected, message, epsilon=1e-8):
    need(finite(actual) and abs(actual - expected) <= epsilon, message)


def fingerprint(path):
    raw = path.read_bytes()
    return {'path': str(path), 'bytes': len(raw), 'sha256': sha(raw)}


def verify_transport(log_text, report_raw):
    records = []
    marker = re.compile(r'\[ios-frame-work-(meta|chunk|end)\] ')
    for line_number, line in enumerate(log_text.splitlines(), 1):
        matches = list(marker.finditer(line))
        if not matches:
            continue
        need(len(matches) == 1, 'multiple export markers on one log line')
        match = matches[0]
        records.append((match.group(1), strict_json(line[match.end():]), line_number))
    need(len(records) >= 3, 'missing complete export stream')
    need(records[0][0] == 'meta' and records[-1][0] == 'end', 'export boundaries missing or reordered')
    need(Counter(x[0] for x in records)['meta'] == 1 and Counter(x[0] for x in records)['end'] == 1,
         'multiple export streams or duplicate boundaries')
    meta, end = records[0][1], records[-1][1]
    need(meta == end, 'meta/end differ')
    need(meta.get('file') == PATH and meta.get('complete') is True, 'export identity/completion mismatch')
    need(type(meta.get('bytes')) is int and 1 <= meta['bytes'] <= MAX_BYTES, 'report outside 8 MiB byte capacity')
    need(type(meta.get('totalChunks')) is int and meta['totalChunks'] == math.ceil(meta['bytes'] / CHUNK), 'chunk count inconsistent with bytes')
    for key, value in PINS.items():
        need(meta.get(key) == value, 'export pin mismatch: ' + key)
    need(len(records) == meta['totalChunks'] + 2, 'missing or extra chunks')
    decoded = []
    for i, (kind, item, line_number) in enumerate(records[1:-1]):
        need(kind == 'chunk', 'non-chunk within export')
        need(item.get('file') == PATH, 'chunk file mismatch')
        need(type(item.get('index')) is int and item['index'] == i, 'chunk index/order mismatch')
        need(type(item.get('offset')) is int and item['offset'] == i * CHUNK, 'chunk offset mismatch')
        need(type(item.get('total')) is int and item['total'] == meta['totalChunks'], 'chunk total mismatch')
        need(isinstance(item.get('base64'), str), 'missing base64')
        part = base64.b64decode(item['base64'], validate=True)
        need(base64.b64encode(part).decode('ascii') == item['base64'], 'noncanonical base64')
        need(len(part) == min(CHUNK, meta['bytes'] - i * CHUNK), 'chunk byte length mismatch')
        decoded.append(part)
    joined = b''.join(decoded)
    need(len(joined) == meta['bytes'] and sha(joined) == meta.get('sha256'), 'export bytes/SHA mismatch')
    need(joined == report_raw, 'recovered report differs from exported original bytes')
    report = strict_json(report_raw.decode('utf-8'))
    need(isinstance(report, dict), 'report is not an object')
    need(meta.get('diagnosticStatus') == report.get('status'), 'status differs from original report')
    need(meta.get('frameWorkPresent') is bool(report.get('safariFrameWork')), 'profile-presence metadata differs')
    provenance = report.get('audioCapture', {}).get('provenance', {})
    for key, value in PINS.items():
        need(provenance.get(key) == value, 'report provenance mismatch: ' + key)
    profile = report.get('safariFrameWork')
    if profile:
        need(profile.get('provenance') == provenance, 'profile and original-report provenance differ')
    return report, dict(meta=meta, firstMarkerLine=records[0][2], lastMarkerLine=records[-1][2],
                        originalJob=104080730225, recoveredBytesIdentical=True,
                        exportScope='Complete original byte export; meta.complete does not imply acquisition/profile/quality passed.')


def verify_source_pins():
    mapping = {'tools/ios_audio_capture.mjs': PINS['helperSha256'],
               'tools/test-ios-safari.mjs': PINS['harnessSha256'],
               'tools/frame_work_probe.mjs': PINS['frameWorkProbeSha256'],
               'tools/export-ios-frame-work.mjs': '5d17504681f038706d61828eba286d495f91b99f30f0c2cd20a27cefed717f43'}
    result = []
    for name, expected in mapping.items():
        f = fingerprint(ROOT / 'source' / name)
        need(f['sha256'] == expected, 'read-only source differs from frozen pin: ' + name)
        result.append(f)
    return result


def clock_delta(before, after):
    wall = (after['wallMs'] - before['wallMs']) / 1000
    audio = after['audioTime'] - before['audioTime']
    engine = after['engineTime'] - before['engineTime']
    return dict(wallSeconds=wall, audioSeconds=audio, engineSeconds=engine,
                engineFrames=after['engineFrame']-before['engineFrame'],
                audioMinusEngineSeconds=audio-engine, wallMinusEngineSeconds=wall-engine,
                engineToAudioRatio=engine/audio if audio else None)


def analyze(report):
    result = {'scope': 'CPU recomputation of original observed clocks; elapsed duration is not CPU on-core or GPU execution time.',
              'reportStatus': report.get('status'), 'target': report.get('target'),
              'originalFailures': report.get('failures'), 'audioReason': report.get('audioCapture', {}).get('reason'),
              'originalAudioTransferFinal': report.get('safariAudioTransferFinal'), 'clips': []}
    provenance = report['audioCapture']['provenance']
    need(provenance.get('bundleSha256') == PRODUCT, 'product bundle changed')
    need(provenance.get('actualRecorderBlob') == RECORDER and provenance.get('recorderBlob') == RECORDER, 'recorder changed')
    for value in provenance.get('actualBundleHashes', {}).values():
        need(value == PRODUCT, 'served bundle hash differs')
    for clip in report.get('audioCapture', {}).get('clips', []):
        before, after = clip['before']['state'], clip['after']
        full = clock_delta(before, after)
        tolerance = max(.1, full['audioSeconds'] * .05)
        guard = (all(finite(full[k]) and full[k] > 0 for k in ['wallSeconds','audioSeconds','engineSeconds','engineFrames'])
                 and before['audioState'] == after['audioState'] == 'running'
                 and abs(full['audioMinusEngineSeconds']) <= tolerance
                 and abs(full['audioSeconds']-full['wallSeconds']) <= tolerance)
        for key in ['wallSeconds','audioSeconds','engineSeconds','engineFrames','engineToAudioRatio']:
            close(clip['timing'][key], full[key], 'original clip summary differs: ' + key)
        need(clip['timing']['captureClockGuardPassed'] == guard, 'original guard disagreement')
        frames = clip['telemetry']['clockFrames']
        intervals = [dict(index=i, fromFrame=a['engineFrame'], toFrame=b['engineFrame'],
                          fromWallMs=a['wallMs'], toWallMs=b['wallMs'], **clock_delta(a,b))
                     for i,(a,b) in enumerate(zip(frames, frames[1:]),1)]
        result['clips'].append(dict(name=clip['name'], endpoints=full,
             toleranceSeconds=tolerance, originalGuardRecomputed=guard, clockSamples=len(frames),
             largestAudioDeficits=sorted(intervals,key=lambda x:x['audioMinusEngineSeconds'],reverse=True)[:12]))
    profile = report.get('safariFrameWork')
    if not profile:
        result['profile'] = {'status': 'not measured', 'reason': 'Original report contains no frame-work snapshot.'}
        return result
    rows = profile.get('rows', [])
    need(profile.get('limit') == 4096 and len(rows) <= 4096, 'profile row cap changed/exceeded')
    need(type(profile.get('dropped')) is int and profile['dropped'] >= 0, 'invalid profile dropped count')
    arithmetic = []
    groups = {}
    for i, row in enumerate(rows):
        before, after = row['before'], row['after']
        elapsed = after['wallMs'] - before['wallMs']
        need(elapsed >= 0, 'negative callback duration')
        close(row['callbackElapsedMs'], elapsed, 'callback elapsed mismatch')
        close(row['engineWallMs'], row['rafTimestampMs'] - row['priorClockLastMs'], 'raw engine-input mismatch')
        close(row['entryAfterRafTimestampMs'], before['wallMs'] - row['rafTimestampMs'], 'entry offset mismatch')
        advance = after['engineTime'] - before['engineTime']
        close(row['engineAdvanceSeconds'], advance, 'engine advance mismatch')
        eligible = before['running'] and not before['paused'] and not before['lost']
        if not eligible:
            need(row['acceptedDtSeconds'] is None, 'paused/stopped/lost row accepts stale dt')
        elif not row.get('threw'):
            close(row['acceptedDtSeconds'], min(row['engineWallMs']/1000,.25), 'accepted clamped delta mismatch')
        steps = round(advance / FIXED)
        close(advance, steps*FIXED, 'advance not a fixed-step multiple')
        need(0 <= steps <= 4, 'fixed-step count outside original cap')
        for value in row['phaseMs'].values():
            need(finite(value) and value >= 0, 'non-finite/negative phase duration')
        item = dict(index=i,recording=row['recording'],beforeWallMs=before['wallMs'],afterWallMs=after['wallMs'],
             callbackElapsedMs=elapsed, engineWallMs=row['engineWallMs'],
             entryAfterRafTimestampMs=row['entryAfterRafTimestampMs'],engineAdvanceSeconds=advance,
             inferredFixedSteps=steps,phaseMs=row['phaseMs'],phaseCalls=row['phaseCalls'],
             beforeEngineFrame=before['engineFrame'],afterEngineFrame=after['engineFrame'],
             beforePaused=before['paused'],beforeLost=before['lost'],threw=row.get('threw'))
        group = groups.setdefault(row['recording'], [])
        if group:
            prev = group[-1]
            item['betweenCallbackElapsedMs'] = before['wallMs'] - prev['afterWallMs']
            item['priorClockLastMinusPreviousRafMs'] = row['priorClockLastMs'] - rows[prev['index']]['rafTimestampMs']
        group.append(item); arithmetic.append(item)
    summaries = []
    for recording, group in groups.items():
        total = sum(r['callbackElapsedMs'] for r in group)
        external = sum(r.get('betweenCallbackElapsedMs',0) for r in group)
        span = group[-1]['afterWallMs'] - group[0]['beforeWallMs']
        close(total+external,span,'callback/external interval telescoping mismatch',epsilon=1e-5)
        labels = sorted({label for r in group for label in r['phaseMs']})
        summaries.append(dict(recording=recording,rows=len(group),spanMs=span,
            callbackElapsedMsSum=total,betweenCallbacksElapsedMsSum=external,
            phaseInclusiveMs={label:sum(r['phaseMs'].get(label,0) for r in group) for label in labels},
            largestCallbacks=sorted(group,key=lambda r:r['callbackElapsedMs'],reverse=True)[:12],
            largestExternalIntervals=sorted(group,key=lambda r:r.get('betweenCallbackElapsedMs',0),reverse=True)[:12]))
    result['profile'] = dict(status='present',completeClaim=profile.get('complete'),restoredClaim=profile.get('restored'),
        dropped=profile['dropped'],errors=profile.get('errors'),recordingCount=profile.get('recordingCount'),
        rows=len(rows),lifecycle=profile.get('lifecycle'),recordings=summaries,
        limitations=['Nested phase durations overlap and cannot be summed into total cost.',
            'Between-callback elapsed time is not an identified external process or an on-core CPU duration.',
            'Engine wall input, rAF timestamp, callback entry time and render-listener sample are distinct.',
            'This new run cannot retroactively attribute C34 failures to a particular CPU/GPU operation.',
            'Original error propagation and the underlying recording failure are separate questions.',
            'Successful byte export, trace completeness or acquisition guard does not imply quality completion.'])
    return result


def fixture(report):
    raw = (json.dumps(report,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
    meta = dict(file=PATH,bytes=len(raw),sha256=sha(raw),**PINS,
                diagnosticStatus=report['status'],frameWorkPresent=bool(report.get('safariFrameWork')),
                totalChunks=math.ceil(len(raw)/CHUNK),complete=True)
    records = [('meta',meta)]
    for i, offset in enumerate(range(0,len(raw),CHUNK)):
        records.append(('chunk',dict(file=PATH,index=i,offset=offset,total=meta['totalChunks'],
                                      base64=base64.b64encode(raw[offset:offset+CHUNK]).decode())))
    records.append(('end',copy.deepcopy(meta)))
    return records, raw


def render_fixture(records):
    return '\n'.join('2026-09-14T00:00:00Z [ios-frame-work-'+kind+'] '+json.dumps(obj)
                     for kind,obj in records)


def self_test():
    # These are synthetic transport controls, never execution/profile evidence.
    report = dict(status='failed',audioCapture=dict(provenance=PINS),fixture='境界'*2000)
    records, raw = fixture(report)
    checks = []
    verify_transport(render_fixture(records), raw); checks.append('accept complete multibyte, multi-chunk original')
    mutations = []
    d=copy.deepcopy(records);d[1],d[2]=d[2],d[1];mutations.append(('reject reordered chunks',d,raw))
    d=copy.deepcopy(records);d.insert(2,copy.deepcopy(d[1]));mutations.append(('reject duplicate chunk',d,raw))
    d=copy.deepcopy(records);d.pop(-2);mutations.append(('reject missing chunk',d,raw))
    d=copy.deepcopy(records);d[1][1]['base64']='!'+d[1][1]['base64'][1:];mutations.append(('reject invalid base64',d,raw))
    d=copy.deepcopy(records);d[-1][1]['sha256']='0'*64;mutations.append(('reject altered end metadata',d,raw))
    d=copy.deepcopy(records)
    for _,meta in [d[0],d[-1]]:meta['runId']='34875252892'
    mutations.append(('reject foreign run',d,raw))
    d=copy.deepcopy(records)
    for _,meta in [d[0],d[-1]]:meta['bytes']=MAX_BYTES+1
    mutations.append(('reject above 8 MiB capacity',d,raw))
    mutations.append(('reject recovered byte alteration',records,raw+b'\n'))
    divergent=copy.deepcopy(report);divergent['safariFrameWork']={'provenance':dict(PINS,runAttempt='2')}
    d,b=fixture(divergent);mutations.append(('reject profile/report provenance divergence',d,b))
    for name, changed, changed_raw in mutations:
        try:verify_transport(render_fixture(changed),changed_raw)
        except (ValueError,TypeError,KeyError):checks.append(name)
        else:raise AssertionError(name+' was not rejected')
    return dict(status='pass',checks=len(checks),cases=checks,
                scope='Synthetic CPU transport controls only; no original report, Safari, media or quality result.')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--log',type=Path,help='Original decoded UTF-8 job log text supplied by recovery owner')
    parser.add_argument('--report',type=Path,default=ROOT/'original/report.json')
    parser.add_argument('--self-test',action='store_true')
    args=parser.parse_args()
    source=verify_source_pins()
    if args.self_test:
        result=self_test();result['sourcePins']=source
        path=HERE/'preparation-self-test.json'
    else:
        need(args.log is not None,'--log is required; no implicit log search or remote fetch')
        raw=args.report.read_bytes()
        report,transport=verify_transport(args.log.read_text(encoding='utf-8'),raw)
        result=dict(status='verified',report=fingerprint(args.report),log=fingerprint(args.log),
                    sourcePins=source,transport=transport,analysis=analyze(report))
        path=HERE/'independent-result.json'
    path.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps(dict(path=str(path),status=result['status'],sha256=sha(path.read_bytes()))))


if __name__=='__main__':
    main()
