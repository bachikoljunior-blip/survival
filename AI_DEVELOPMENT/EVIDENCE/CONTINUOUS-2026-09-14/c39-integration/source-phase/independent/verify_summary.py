"""Verify supplied C38 original log bytes and its exact summary, without network."""
from pathlib import Path
import hashlib
import json
import math
import re

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
def sha(b): return hashlib.sha256(b).hexdigest()
def close(a, b):
    assert math.isfinite(a) and math.isfinite(b)
    assert math.isclose(a, b, rel_tol=1e-11, abs_tol=1e-11), (a, b)

raw = (ROOT / 'transport/job-original.log').read_bytes()
assert len(raw) == 79989
assert sha(raw) == '7708ce8065f490e8438631f6885e3535e56af97f418cf2b262bdc02d6484d054'
assert raw.endswith(b'\n')
text = raw.decode('utf-8', errors='strict')
lines = raw.splitlines()
assert len(lines) == 634 and b'Cleaning up orphan processes' in raw
marker = b'[ios-safari-report] '
matches = [(i + 1, line.split(marker, 1)[1]) for i, line in enumerate(lines) if marker in line]
assert len(matches) == 1 and matches[0][0] == 477
summary_raw = (ROOT / 'original/log-summary.json').read_bytes()
assert matches[0][1] == summary_raw
summary = json.loads(summary_raw)
assert summary['status'] == 'failed' and len(summary['checks']) == 54
failed = [c for c in summary['checks'] if not c['passed']]
assert len(failed) == 1 and len(summary['failures']) == 1
assert failed[0]['name'] == 'iOS audio diagnostic: bounded frame work captured and timing wrappers restored'
assert summary['frameWork'] == {'rows': 4096, 'limit': 4096, 'dropped': 844,
    'recordings': 3, 'complete': False, 'restored': True, 'errors': []}
assert json.loads(failed[0]['detail']) == {'recordings': 3, 'rows': 4096,
    'dropped': 844, 'restored': True, 'errors': []}
assert summary['captureStatus'] == 'captured'
assert len(summary['clips']) == 3 and summary['comparison']['status'] == 'not measured'

receipt = json.loads((HERE / 'receipt.json').read_text())
source_shas = {}
for file in receipt['sourceFiles']:
    b = Path(file['path']).read_bytes()
    assert len(b) == file['bytes'] and sha(b) == file['sha256']
    source_shas[Path(file['path']).name] = sha(b)
provenance = summary['provenance']
for key, file in [('helperSha256', 'ios_audio_capture.mjs'),
                  ('transferHelperSha256', 'ios_audio_transfer.mjs'),
                  ('harnessSha256', 'test-ios-safari.mjs'),
                  ('frameWorkProbeSha256', 'frame_work_probe.mjs')]:
    assert provenance[key] == source_shas[file]
assert provenance['runCommit'] == '61e8f8c595bde13634fe709f979816011df165d0'
assert provenance['runId'] == '34884725972' and provenance['runAttempt'] == '1'
bundle = '1094c1d96bed6b953c1655ce65549c484b8f09e275f055bff283499cece110f7'
assert provenance['bundleSha256'] == bundle and set(provenance['actualBundleHashes'].values()) == {bundle}
assert provenance['actualRecorderBlob'] == provenance['recorderBlob'] == '785541d3beaed0e35e8bcf042973eabb7bdb5d6c'
assert provenance['preparedFromCommit'] == '789f2199bd3791a6dc6566eecaf3c1478c99afa6'
assert provenance['preparationReportSha256'] == '2dbf5a5b15424ccd2e1e33e628391fad46084f4ec46686b70db1023d9061bf69'

timings = []
for clip in summary['clips']:
    t = clip['timing']
    w, a, e = t['wallSeconds'], t['audioSeconds'], t['engineSeconds']
    tol = max(.1, a * .05)
    close(t['toleranceSeconds'], tol)
    close(t['engineToAudioRatio'], e / a)
    close(t['audioToWallRatio'], a / w)
    close(t['engineMinusAudioSeconds'], e - a)
    close(t['audioMinusWallSeconds'], a - w)
    assert w > 0 and a > 0 and e > 0 and t['engineFrames'] > 0
    assert abs(e - a) <= tol and abs(a - w) <= tol
    assert all(t[k] for k in ['captureClockGuardPassed', 'telemetryComplete', 'finiteTimeline', 'orderedTimeline', 'finitePoses'])
    check = next(c for c in summary['checks'] if c['name'] ==
        f"audio {clip['name']}: wall, audio and simulation clocks stay aligned for capture")
    assert check['passed'] and json.loads(check['detail']) == t
    assert {track['kind'] for track in clip['tracks']} == {'audio', 'video'}
    assert all(track['state'] == 'live' for track in clip['tracks'])
    assert clip['bytes'] > 0 and re.fullmatch('[0-9a-f]{64}', clip['sha256'])
    timings.append({'name': clip['name'], 'wallSeconds': w, 'audioSeconds': a,
        'engineSeconds': e, 'engineFrames': t['engineFrames'], 'engineAudioRatio': e/a,
        'audioMinusEngineSeconds': a-e, 'toleranceSeconds': tol,
        'remainingGuardMarginSeconds': tol-(a-e), 'numericClockGuardRecomputed': True,
        'loggedTelemetryComplete': True, 'loggedMediaBytes': clip['bytes'],
        'loggedMediaSha256': clip['sha256'], 'mediaIndependentlyFetched': False})

release_check = next(c for c in summary['checks'] if c['name'] ==
    'iOS audio street: native movement advances and releases')
move = json.loads(release_check['detail']); release = move['release']
assert release_check['passed'] and release['status'] == release['observationStatus'] == 'passed'
assert move['moveMagnitude'] == 1 and release['after']['moveMagnitude'] == 0
assert release['elapsedMs'] == 110 and release['cleanupErrors'] is None
assert not release['after']['stickActive']
assert release['after']['engineTime'] == release['after']['inputTime']
stages = ['arcade', 'game-pause', 'title', 'title-settings', 'title-close']
life = summary['lifecycle']; assert life['status'] == 'checked'
assert [s['stage'] for s in life['samples']] == stages
for sample in life['samples']:
    assert not sample['activeRecording'] and sample['audioState'] == 'running'
    check = next(c for c in summary['checks'] if c['name'] ==
        f"iOS audio lifecycle {sample['stage']}: production state and authored targets agree")
    data = json.loads(check['detail']); assert check['passed']
    for k, v in data['expected'].items():
        assert data['observed']['layerTargets' if k == 'targets' else k] == v

tags = ['[ios-frame-work-meta]', '[ios-frame-work-chunk]', '[ios-frame-work-end]']
assert all(text.count(tag) == 0 for tag in tags)
error = 'Error: Original diagnostic report exceeds bounded export capacity'
assert text.count(error) == 1
assert 'bytes.length < 1 || bytes.length > 8*1024*1024' in text
f3 = [line.split('[f3-safari-audio] ', 1)[1] for line in text.splitlines() if '[f3-safari-audio] ' in line]
assert len(f3) == 1
f3 = json.loads(f3[0]); assert f3['status'] == 'failed'
assert f3['error'] == 'Error: The complete Safari gate did not pass'
job = json.loads((ROOT / 'transport/job-completed.json').read_bytes())
assert job['id'] == 104112425709 and job['run_id'] == 34884725972 and job['run_attempt'] == 1
assert job['head_sha'] == provenance['runCommit'] and job['status'] == 'completed' and job['conclusion'] == 'failure'
assert all(next(s for s in job['steps'] if s['number'] == n)['conclusion'] == 'failure' for n in [9, 10, 11])
assert 'Uploaded bytes 25105480' in text
assert 'SHA256 digest of uploaded artifact zip is 661474f9320966960edf4794c0fdabe4d8f456ec6166efd1dbace592cef6d372' in text
assert 'Final size is 25105480 bytes. Artifact ID is 10364986195' in text

result = {'status': 'finite-summary-verification-complete',
    'originalLog': {'bytes': len(raw), 'sha256': sha(raw), 'lines': len(lines),
        'summaryMarkers': 1, 'summaryLine': matches[0][0], 'finalNewline': True, 'cleanupTailPresent': True},
    'originalSummary': {'bytes': len(summary_raw), 'sha256': sha(summary_raw), 'exactLogSubstring': True, 'fullReport': False},
    'job': {k: job[k] for k in ['id', 'run_id', 'run_attempt', 'head_sha', 'conclusion']},
    'checks': {'total': 54, 'passed': 53, 'failed': 1}, 'failedCheck': failed[0],
    'provenance': provenance, 'fourToolHashesMatch': True, 'captureStatus': 'captured',
    'frameWorkSummary': summary['frameWork'], 'timings': timings,
    'release': {'status': 'passed', 'immediateMoveMagnitude': 1, 'afterMoveMagnitude': 0, 'elapsedMs': 110},
    'lifecycle': {'status': 'checked', 'stages': stages, 'scope': life['scope']},
    'capacityArithmetic': {'streetLoggedEngineFrames': timings[0]['engineFrames'],
        'streetFramesAsPercentOfRowCap': timings[0]['engineFrames']/4096*100,
        'threeClipLoggedFrameSum': sum(t['engineFrames'] for t in timings),
        'storedPlusDroppedCallbackAttempts': 4096+844,
        'differenceNotAttributed': 4096+844-sum(t['engineFrames'] for t in timings)},
    'export': {'error': error, 'markers': {tag: 0 for tag in tags},
        'guardRejects': 'bytes<1 OR bytes>8388608', 'actualReportBytes': None,
        'originalReportRecovered': False, 'oversizeInterpretation': 'Consistent with summary size pressure, but exact file length was not logged; artifact archive length is not report length.'},
    'f3AudioGate': f3,
    'artifactUploadLog': {'id': 10364986195, 'zipBytes': 25105480,
        'zipSha256': '661474f9320966960edf4794c0fdabe4d8f456ec6166efd1dbace592cef6d372',
        'archiveAcquired': False, 'archiveIndependentlyHashed': False},
    'unavailable': ['original clip endpoints and clock-frame telemetry', 'profile rows and per-recording row/drop distribution',
        'world/composite/fixed phase durations', 'clamp/discard/accumulator budget',
        'observerBookkeepingMs and inter-marker gaps', 'program counts and slow calls',
        'same-origin upload receipts and exact uploaded payload JSON'],
    'phaseArithmeticPerformed': False,
    'causeConclusion': '92.01-second street/4025 frames is consistent with row-cap pressure; its duration cause, phase cause, CPU/GPU cause and prior C34/C36 repair remain unestablished.'}
(HERE / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({'status': result['status'], 'checks': result['checks'],
    'clipNumericGuards': [t['numericClockGuardRecomputed'] for t in timings],
    'capacityArithmetic': result['capacityArithmetic'], 'fullReportRecovered': False}))
