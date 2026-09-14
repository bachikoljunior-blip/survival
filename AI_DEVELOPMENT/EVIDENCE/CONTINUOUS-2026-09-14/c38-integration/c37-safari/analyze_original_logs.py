"""Read-only original C37 log analysis. No remote actions or invented telemetry."""
from pathlib import Path
import hashlib
import json
import math
import re

root = Path(__file__).resolve().parent
transport = root / 'transport'
source_head = 'bf743056ce143f09e4c6544ef1c7df4b73b232fd'
merge_head = 'd0d71920e393a506d95e93892416a57c8b1dfa8c'
scenes = ['street-walk', 'cut-gas-air', 'arcade-room']
roles = [('source', 34879275702, 104094199700, 104097805106, source_head),
         ('pr', 34879453199, 104094807794, 104098680720, merge_head)]

def marker(text, tag):
    lines = [line.split(tag + ' ', 1)[1] for line in text.splitlines() if tag + ' ' in line]
    assert len(lines) == 1, (tag, len(lines))
    return json.loads(lines[0])

results = []
for role, run_id, safari_id, f3_id, execution_head in roles:
    raw = (transport / f'{role}-safari.log').read_bytes()
    text = raw.decode()
    summary = marker(text, '[ios-safari-report]')
    f3 = marker(text, '[f3-safari-audio]')
    (transport / f'{role}-f3-audio.json').write_text(json.dumps(f3, ensure_ascii=False, indent=2) + '\n')
    run = json.loads((transport / f'{role}-run.json').read_text())
    jobs = json.loads((transport / f'run-{run_id}-jobs.json').read_text())['jobs']
    safari = next(job for job in jobs if job['id'] == safari_id)
    final_f3 = next(job for job in jobs if job['id'] == f3_id)
    assert run['status'] == safari['status'] == final_f3['status'] == 'completed'
    assert run['head_sha'] == source_head and run['run_attempt'] == 1
    assert raw.endswith(b'\n') and 'Cleaning up orphan processes' in text
    assert 'CINDERLINE_IOS_AUDIO_CAPTURE: 1' in text and 'CINDERLINE_IOS_FRAME_WORK_CAPTURE: 0' in text
    assert summary['frameWork'] is None
    provenance = summary['provenance']
    assert provenance['runCommit'] == execution_head
    assert provenance['runId'] == str(run_id) and provenance['runAttempt'] == '1'
    assert [clip['name'] for clip in summary['clips']] == scenes
    checks = summary['checks']
    movement = [check for check in checks if check['name'] == 'iOS audio street: native movement advances and releases']
    assert len(movement) == 1 and movement[0]['passed']
    movement = json.loads(movement[0]['detail'])
    release = movement['release']
    assert release['status'] == 'passed' and release['after']['moveMagnitude'] == 0
    assert release['after']['stickActive'] is False and release['reason'] == 'first frame after fixed-step progress'
    clips = []
    for clip in summary['clips']:
        timing = clip['timing']
        ratio = timing['engineSeconds'] / timing['audioSeconds']
        deficit = timing['audioSeconds'] - timing['engineSeconds']
        tolerance = max(.1, .05 * timing['audioSeconds'])
        guard = abs(deficit) <= tolerance and abs(timing['audioSeconds'] - timing['wallSeconds']) <= tolerance
        assert math.isclose(ratio, timing['engineToAudioRatio'], rel_tol=1e-12)
        assert math.isclose(tolerance, timing['toleranceSeconds'], rel_tol=1e-12)
        assert guard == timing['captureClockGuardPassed']
        clips.append({'name': clip['name'], 'path': clip['path'], 'reportedBytes': clip['bytes'],
                      'reportedSha256': clip['sha256'], 'timing': timing, 'audioMinusEngineSeconds': deficit,
                      'guardExcessSeconds': max(0, abs(deficit)-tolerance), 'endpointArithmeticAgrees': True,
                      'mediaBytesLocallyRecovered': False})
    if role == 'source':
        assert f3['status'] == 'passed' and f3['runCommit'] == execution_head
        for clip, checked in zip(summary['clips'], f3['clips'], strict=True):
            for key in ['name', 'path', 'bytes', 'sha256', 'timing']:
                assert clip[key] == checked[key]
    else:
        assert f3['status'] == 'failed' and 'complete Safari gate did not pass' in f3['error']
    artifacts = json.loads((transport / f'{role}-artifacts.json').read_text())['artifacts']
    artifact = next(item for item in artifacts if item['name'] == f'iphone-se3-mobile-safari-{execution_head}')
    digest = re.findall(r'SHA256 digest of uploaded artifact zip is ([a-f0-9]{64})', text)
    upload = re.findall(r'Final size is (\d+) bytes\. Artifact ID is (\d+)', text)
    assert len(digest) == len(upload) == 1
    assert artifact['digest'] == 'sha256:' + digest[0]
    assert artifact['id'] == int(upload[0][1]) and artifact['size_in_bytes'] == int(upload[0][0])
    assert artifact['workflow_run']['id'] == run_id and artifact['workflow_run']['head_sha'] == source_head
    f3_text = (transport / f'{role}-f3-execution.log').read_text()
    wanted_f3 = 'success' if role == 'source' else 'failure'
    assert f'F3 core=success Safari={wanted_f3}' in f3_text
    results.append({'role': role, 'runId': run_id, 'safariJobId': safari_id, 'f3JobId': f3_id,
        'runSourceHead': source_head, 'executionCommit': execution_head, 'attempt': 1,
        'safariConclusion': safari['conclusion'], 'f3Conclusion': final_f3['conclusion'],
        'summaryStatus': summary['status'], 'checks': len(checks),
        'failedChecks': [check for check in checks if not check['passed']], 'failures': summary['failures'],
        'captureStatus': summary['captureStatus'], 'provenance': provenance, 'clips': clips,
        'release': {'immediateMoveMagnitude': movement['moveMagnitude'], 'afterFixedStepMoveMagnitude': release['after']['moveMagnitude'],
                    'elapsedMs': release['elapsedMs'], 'reason': release['reason'], 'passed': True},
        'frameWork': None, 'profileEnabled': False, 'lifecycle': summary['lifecycle'],
        'f3Audio': f3, 'artifact': artifact, 'artifactMetadataMatchesOriginalUploadLog': True,
        'artifactArchiveBytesLocallyRecovered': False,
        'originalReportLocallyRecovered': False,
        'log': {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'summaryMarkers': 1,
                'parsedFullSummary': True, 'completeCanonicalDecodedResponseSaved': True, 'trailingCleanupPresent': True}})

merge = json.loads((transport / 'pr-merge.json').read_text())
assert merge['sha'] == merge_head and [p['sha'] for p in merge['parents']] == ['5456371249f5769c25d18f1686a44349e4292d6f', source_head]
output = {'status': 'original-log-analysis-complete', 'results': results, 'prMergeParentsVerified': True,
          'scope': 'Original canonical completed-job logs and metadata. Summary endpoint arithmetic is checked; original full telemetry and media bytes have not been recovered locally. Source F3 reports its own original-byte and full-telemetry validation. No detailed frame profile in C37.',
          'quality': {'all19': 'not measured', 'validBlind': 0, 'completedUnits': 0, 'mode': 'continuous'},
          'oldFailureRepairClaimed': False, 'remoteWrites': 0, 'ciStarts': 0, 'retries': 0, 'automationChanges': 0}
(root / 'analysis.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'status': output['status'], 'sourceClips': len(results[0]['clips']), 'prClips': len(results[1]['clips']),
                  'sourceF3': results[0]['f3Conclusion'], 'prF3': results[1]['f3Conclusion']}))
