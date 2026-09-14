"""Finite read-only verification of supplied completed C37 job logs.

Writes derived evidence only beside this script. No network, media decoding,
browser execution, CI invocation, source or candidate modifications.
"""
from pathlib import Path
import hashlib
import json
import math
import re

HERE = Path(__file__).resolve().parent
TRANSPORT = HERE.parent / 'transport'
EXPECTED_LOGS = {
    'source-safari.log': (82694, '58818e062ea9f636826f986e5de327b4e14122ef9b9ab7f2f70a897ba307d875'),
    'pr-safari.log': (74135, '880b2d104f4f34d3efb308581df934203aaf928b934fa9d99c663b23e54a7271'),
    'source-f3-execution.log': (2443, 'b6925cea947778b38f2b8321d8963d02d918e68469ac561c2a0abc041f99e929'),
    'pr-f3-execution.log': (2517, '9f79685bc977342aef32bd9bdbcad4da69b3e2fed3c2b3f4470e495ad83efd00'),
}
RUNS = {
    'source': {'run': 34879275702, 'commit': 'bf743056ce143f09e4c6544ef1c7df4b73b232fd',
               'core': 104094199428, 'safari': 104094199700, 'f3': 104097805106,
               'conclusion': 'success', 'checks': 53, 'failureChecks': 0, 'failures': 0},
    'pr': {'run': 34879453199, 'commit': 'd0d71920e393a506d95e93892416a57c8b1dfa8c',
           'core': 104094808213, 'safari': 104094807794, 'f3': 104098680720,
           'conclusion': 'failure', 'checks': 47, 'failureChecks': 3, 'failures': 4},
}

def digest(b):
    return hashlib.sha256(b).hexdigest()

def close(a, b):
    assert math.isfinite(a) and math.isfinite(b)
    assert math.isclose(a, b, rel_tol=1e-11, abs_tol=1e-11), (a, b)

ledger = []
texts = {}
for name, (size, sha) in EXPECTED_LOGS.items():
    b = (TRANSPORT / name).read_bytes()
    assert len(b) == size and digest(b) == sha
    assert b.endswith(b'\n')
    text = b.decode('utf-8', errors='strict')
    lines = text.splitlines()
    assert 'Cleaning up orphan processes' in text
    count = text.count('[ios-safari-report]')
    assert count == (1 if name.endswith('-safari.log') else 0)
    ledger.append({'path': str(TRANSPORT / name), 'bytes': len(b), 'sha256': sha,
                   'lineCount': len(lines), 'finalNewline': True,
                   'summaryMarkerCount': count, 'tailLastLine': lines[-1],
                   'cleanupTailPresent': True})
    texts[name] = text

pins_doc = json.loads((HERE / 'source-pins.json').read_text())
pin_sha = {}
for row in pins_doc['pins']:
    b = (HERE / 'source' / row['path']).read_bytes()
    assert len(b) == row['bytes'] and digest(b) == row['sha256']
    assert hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest() == row['gitBlobSha1']
    pin_sha[Path(row['path']).name] = digest(b)

helper = (HERE / 'source/tools/ios_audio_capture.mjs').read_text()
pin_block = helper.split('Object.freeze({', 1)[1].split('});', 1)[0]
frozen_pins = dict(re.findall(r"(\w+): '([^']+)'", pin_block))
assert frozen_pins['bundleSha256'] == '1094c1d96bed6b953c1655ce65549c484b8f09e275f055bff283499cece110f7'
assert 'const CHUNK_CHARS = 131072;' in helper
assert 'const MAX_TRANSFER_CHARS = 48 * 1024 * 1024;' in helper
assert 'timeoutMs = 120000' in helper

results = {}
for side, expected in RUNS.items():
    text = texts[f'{side}-safari.log']
    payloads = [line.partition('[ios-safari-report] ')[2]
                for line in text.splitlines() if '[ios-safari-report] ' in line]
    assert len(payloads) == 1
    summary = json.loads(payloads[0])
    assert summary == json.loads((TRANSPORT / f'{side}-safari-summary.json').read_text())
    passed = expected['conclusion'] == 'success'
    assert summary['status'] == ('passed' if passed else 'failed')
    assert len(summary['checks']) == expected['checks']
    assert sum(not c['passed'] for c in summary['checks']) == expected['failureChecks']
    assert len(summary['failures']) == expected['failures']
    assert text.count(f"[ios-safari] {'PASSED' if passed else 'FAILED'}: {expected['failures']} failure(s)") == 1
    assert len(summary['clips']) == 3
    assert [c['name'] for c in summary['clips']] == ['street-walk', 'cut-gas-air', 'arcade-room']
    assert summary['frameWork'] is None
    assert summary['comparison']['status'] == 'not measured'

    provenance = summary['provenance']
    for name, value in frozen_pins.items():
        assert provenance[name] == value
    assert provenance['actualRecorderBlob'] == frozen_pins['recorderBlob']
    assert set(provenance['actualBundleHashes']) == {frozen_pins['bundle'], 'dist/' + frozen_pins['bundle']}
    assert all(v == frozen_pins['bundleSha256'] for v in provenance['actualBundleHashes'].values())
    for key, file in [('helperSha256', 'ios_audio_capture.mjs'),
                      ('harnessSha256', 'test-ios-safari.mjs'),
                      ('frameWorkProbeSha256', 'frame_work_probe.mjs')]:
        assert provenance[key] == pin_sha[file]
    assert provenance['runId'] == str(expected['run'])
    assert provenance['runAttempt'] == '1' and provenance['runCommit'] == expected['commit']

    timing_rows = []
    for clip in summary['clips']:
        t = clip['timing']
        a, e, w = t['audioSeconds'], t['engineSeconds'], t['wallSeconds']
        assert a > 0 and e > 0 and w > 0
        tol = max(0.1, a * 0.05)
        close(tol, t['toleranceSeconds'])
        close(e / a, t['engineToAudioRatio'])
        close(a / w, t['audioToWallRatio'])
        close(e - a, t['engineMinusAudioSeconds'])
        close(a - w, t['audioMinusWallSeconds'])
        numeric_guard = abs(e - a) <= tol and abs(a - w) <= tol
        assert numeric_guard == t['captureClockGuardPassed']
        assert all(t[k] for k in ['telemetryComplete', 'finiteTimeline', 'orderedTimeline', 'finitePoses'])
        check = next(c for c in summary['checks'] if c['name'] ==
                     f"audio {clip['name']}: wall, audio and simulation clocks stay aligned for capture")
        assert check['passed'] == numeric_guard and json.loads(check['detail']) == t
        assert {track['kind'] for track in clip['tracks']} == {'audio', 'video'}
        assert all(track['state'] == 'live' for track in clip['tracks'])
        assert clip['bytes'] > 0 and re.fullmatch('[0-9a-f]{64}', clip['sha256'])
        timing_rows.append({'name': clip['name'], 'wallSeconds': w, 'audioSeconds': a,
                            'engineSeconds': e, 'audioMinusEngineSeconds': a-e,
                            'engineToAudioRatio': e/a, 'toleranceSeconds': tol,
                            'engineLossAboveToleranceSeconds': max(0, a-e-tol),
                            'guardRecomputedFromLoggedDurations': numeric_guard,
                            'loggedTelemetryComplete': t['telemetryComplete'],
                            'loggedMediaBytes': clip['bytes'], 'loggedMediaSha256': clip['sha256'],
                            'mediaIndependentlyFetchedOrHashed': False})

    movement_check = next(c for c in summary['checks'] if c['name'] ==
                          'iOS audio street: native movement advances and releases')
    movement = json.loads(movement_check['detail'])
    release = movement['release']
    assert movement_check['passed'] and release['status'] == 'passed'
    assert release['observationStatus'] == 'passed' and release['cleanupErrors'] is None
    assert not release['after']['stickActive'] and release['after']['moveMagnitude'] == 0
    assert release['elapsedMs'] == (8 if passed else 85)
    assert release['after']['inputTime'] == release['after']['engineTime']
    assert movement['moveMagnitude'] == (0 if passed else 1)

    lifecycle = summary['lifecycle']
    assert lifecycle['status'] == ('checked' if passed else 'not run')
    assert summary['captureStatus'] == ('captured' if passed else 'acquisition failed')
    if passed:
        assert [s['stage'] for s in lifecycle['samples']] == ['arcade', 'game-pause', 'title', 'title-settings', 'title-close']
        assert all(not s['activeRecording'] for s in lifecycle['samples'])
    else:
        assert any('lifecycle operations not attempted' in f for f in summary['failures'])

    jobs = json.loads((TRANSPORT / f"run-{expected['run']}-jobs.json").read_text())['jobs']
    matched_jobs = []
    for role in ['core', 'safari', 'f3']:
        job = next(j for j in jobs if j['id'] == expected[role])
        assert job['run_id'] == expected['run'] and job['status'] == 'completed'
        assert job['conclusion'] == ('success' if role == 'core' else expected['conclusion'])
        matched_jobs.append({k: job[k] for k in ['id', 'run_id', 'name', 'status', 'conclusion']})
    f3text = texts[f'{side}-f3-execution.log']
    f3lines = [line for line in f3text.splitlines()
               if line.endswith(f"F3 core=success Safari={expected['conclusion']}")]
    assert len(f3lines) == 1
    assert ('##[error]Process completed with exit code 1.' in f3text) == (not passed)

    results[side] = {'status': summary['status'], 'checks': len(summary['checks']),
                     'passedChecks': sum(c['passed'] for c in summary['checks']),
                     'failedChecks': [c['name'] for c in summary['checks'] if not c['passed']],
                     'failureEntryCount': len(summary['failures']),
                     'captureStatus': summary['captureStatus'], 'clipCount': 3,
                     'provenance': provenance, 'toolPinsMatchIndependentAppBytes': True,
                     'frameWork': None, 'timings': timing_rows,
                     'release': {'immediateMoveMagnitude': movement['moveMagnitude'],
                                 'afterMoveMagnitude': release['after']['moveMagnitude'],
                                 'elapsedMs': release['elapsedMs'], 'status': release['status'],
                                 'reason': release['reason']},
                     'lifecycleStatus': lifecycle['status'],
                     'lifecycleStages': [s['stage'] for s in lifecycle.get('samples', [])],
                     'jobsFromParentSuppliedMetadata': matched_jobs,
                     'f3ObservedLine': f3lines[0], 'summaryMatchesParentExtraction': True}

output = {'status': 'finite-independent-verification-passed',
          'scope': 'Recalculation of logged summary durations and byte/pin verification only; no original full report, clock-frame telemetry or media available to this task.',
          'source': results['source'], 'pr': results['pr'],
          'limits': ['No C37 diagnostic marker profile; both frameWork fields are null.',
                     'CPU phase, GPU, callback-gap and clamp/discard contributions cannot be recovered from these summaries.',
                     'A successful source observation does not establish C34/C36 cause repair; PR still fails unchanged 5 percent acquisition guard.',
                     'Three media hashes are logged per run; media bytes were not independently acquired or decoded.',
                     'Completed-log byte agreement and cleanup tail are verified; this is not recovery of the unlogged full report.']}
(HERE / 'original-input-ledger.json').write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + '\n')
(HERE / 'results.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'status': output['status'],
                  'source': {'checks': results['source']['checks'], 'clips': 3, 'guard': [t['guardRecomputedFromLoggedDurations'] for t in results['source']['timings']]},
                  'pr': {'checks': results['pr']['checks'], 'clips': 3, 'guard': [t['guardRecomputedFromLoggedDurations'] for t in results['pr']['timings']]},
                  'verifiedOriginalLogBytes': sum(x['bytes'] for x in ledger)}))
