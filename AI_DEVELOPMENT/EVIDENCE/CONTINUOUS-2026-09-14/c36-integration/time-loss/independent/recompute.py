#!/usr/bin/env python3
"""CPU arithmetic on the original report bytes; no browser or media execution."""
import collections
import csv
import hashlib
import json
import math
from pathlib import Path

ROOT = Path('/workspace/scratch/0b7ad82bafe7')
OUT = ROOT / 'c36-safari-time-loss-ultra/independent'
FIXED_DT = 1 / 60


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def elapsed(before, after):
    wall = (after['wallMs'] - before['wallMs']) / 1000
    audio = after['audioTime'] - before['audioTime']
    engine = after['engineTime'] - before['engineTime']
    return dict(wallSeconds=wall, audioSeconds=audio, engineSeconds=engine,
                engineFrames=after['engineFrame'] - before['engineFrame'],
                engineToAudioRatio=engine / audio if audio else None,
                audioToWallRatio=audio / wall if wall else None,
                lossAudioSeconds=audio-engine, lossWallSeconds=wall-engine)


def interval_rows(frames):
    result = []
    for i, (before, after) in enumerate(zip(frames, frames[1:]), start=1):
        row = dict(fromIndex=i-1, toIndex=i, fromFrame=before['engineFrame'],
                   toFrame=after['engineFrame'], fromWallMs=before['wallMs'],
                   toWallMs=after['wallMs'], **elapsed(before, after))
        row['fixedSteps'] = round(row['engineSeconds'] / FIXED_DT)
        assert abs(row['engineSeconds'] - row['fixedSteps'] * FIXED_DT) < 1e-10
        result.append(row)
    return result


def engine_step(dt_seconds, accum=0):
    # Conditional model: supplied time is engine rAF delta, scale=1, no reset/pause.
    accum += min(dt_seconds, .25)
    steps = 0
    while accum >= FIXED_DT and steps < 4:
        accum -= FIXED_DT
        steps += 1
    if steps == 4:
        accum = 0
    return dict(steps=steps, accumSeconds=accum)


result = dict(
    schemaVersion=1,
    scope='Independent CPU arithmetic on recovered original report bytes; no physical device, Simulator, browser, media decoding, listening, or quality comparison executed here.',
    canonicalHead='d2c463b54d4ea12abc0a9444627db810440a59a7',
    fixed=dict(clockGuardRelative=.05, clockGuardMinimumSeconds=.1,
               fixedDtSeconds=FIXED_DT, maxSubsteps=4, maxInputDtSeconds=.25),
    originals={}, sourceFiles={}, conditionalCounterexample={})

for label in ['source', 'pr']:
    folder = ROOT / f'c35-ios-{label}-recovered'
    raw = (folder / 'original/report.json').read_bytes()
    manifest_raw = (folder / 'recovered-manifest.json').read_bytes()
    manifest = json.loads(manifest_raw)
    expected = next(x for x in manifest['files'] if x['file'] == 'report.json')
    assert len(raw) == expected['bytes'] and digest(raw) == expected['sha256']
    report = json.loads(raw)
    item = dict(path=str(folder / 'original/report.json'), bytes=len(raw),
                sha256=digest(raw), recoveredManifestSha256=digest(manifest_raw),
                bytesAndShaMatched=True, sourceJob=manifest['sourceJob'],
                checkedAt=report['checkedAt'], target=report['target'],
                provenance=report['audioCapture']['provenance'], clips=[])
    for clip in report['audioCapture']['clips']:
        frames = clip['telemetry']['clockFrames']
        rows = interval_rows(frames)
        before, after = clip['before']['state'], clip['after']
        full = elapsed(before, after)
        # Recompute from raw endpoints, do not adopt report.timing's derived numbers.
        for key in ['wallSeconds', 'audioSeconds', 'engineSeconds', 'engineFrames',
                    'engineToAudioRatio', 'audioToWallRatio']:
            assert abs(full[key] - clip['timing'][key]) < 1e-10
        tolerance = max(.1, full['audioSeconds'] * .05)
        full['toleranceSeconds'] = tolerance
        full['lossBeyondToleranceSeconds'] = full['lossAudioSeconds'] - tolerance
        full['captureClockGuardPassed'] = (
            all(full[k] > 0 and math.isfinite(full[k]) for k in
                ['wallSeconds', 'audioSeconds', 'engineSeconds', 'engineFrames'])
            and before['audioState'] == after['audioState'] == 'running'
            and abs(full['lossAudioSeconds']) <= tolerance
            and abs(full['audioSeconds'] - full['wallSeconds']) <= tolerance)
        assert full['captureClockGuardPassed'] == clip['timing']['captureClockGuardPassed']
        observed = elapsed(frames[0], frames[-1])
        startup = elapsed(before, frames[0])
        tail = elapsed(frames[-1], after)
        assert abs(sum(x['lossAudioSeconds'] for x in rows) - observed['lossAudioSeconds']) < 1e-10
        assert abs(startup['lossAudioSeconds'] + observed['lossAudioSeconds'] + tail['lossAudioSeconds'] - full['lossAudioSeconds']) < 1e-10
        assert all(x['toFrame']-x['fromFrame'] == 1 for x in rows)
        entry = dict(name=clip['name'], fullEndpoints=full, firstToLastSample=observed,
                     setupToFirstSample=startup, lastSampleToAfter=tail,
                     clockSamples=len(frames), renderIntervals=len(rows),
                     frameDeltaHistogram=dict(collections.Counter(x['toFrame']-x['fromFrame'] for x in rows)),
                     fixedStepHistogram=dict(collections.Counter(x['fixedSteps'] for x in rows)),
                     dropped=clip['telemetry']['dropped'], errors=clip['telemetry']['errors'],
                     stateHistogram=[dict(mode=k[0],paused=k[1],audioState=k[2],tier=k[3],count=v)
                        for k,v in collections.Counter((f['mode'],f['paused'],f['audioState'],f['tier']) for f in frames).items()],
                     largestLossIntervals=sorted(rows,key=lambda x:x['lossAudioSeconds'],reverse=True)[:8])
        if clip['name'] == 'street-walk':
            largest = entry['largestLossIntervals'][:2]
            entry['largestTwoAudioLossSeconds'] = sum(x['lossAudioSeconds'] for x in largest)
            entry['largestTwoShareOfFullAudioLoss'] = entry['largestTwoAudioLossSeconds'] / full['lossAudioSeconds']
            entry['largestTwoShareOfSampleAudioLoss'] = entry['largestTwoAudioLossSeconds'] / observed['lossAudioSeconds']
            entry['movement'] = report['audioCapture']['movements'][0]
            entry['movementElapsed'] = elapsed(entry['movement']['before'],entry['movement']['after'])
            entry['sfxEvents'] = [{k:event[k] for k in ['wallMs','audioTime','engineTime','engineFrame','name']}
                                  for event in clip['telemetry']['sfxEvents']]
            csv_path = OUT / f'{label}-street-intervals.csv'
            with csv_path.open('w', newline='') as handle:
                writer=csv.DictWriter(handle,fieldnames=rows[0].keys())
                writer.writeheader(); writer.writerows(rows)
            entry['allIntervalsCsv'] = str(csv_path)
        item['clips'].append(entry)
    result['originals'][label] = item

for relative in ['src/core/engine.js', 'src/core/util.js', 'tools/mobile_audio_capture.mjs',
                 'tools/ios_audio_capture.mjs', 'tools/test-ios-safari.mjs']:
    path = ROOT / 'c36-safari-time-loss-ultra/source' / relative
    raw = path.read_bytes()
    git_blob = hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
    result['sourceFiles'][relative] = dict(bytes=len(raw),sha256=digest(raw),gitBlobSha1=git_blob)

for label in ['source','pr']:
    p = result['originals'][label]['provenance']
    assert result['sourceFiles']['tools/mobile_audio_capture.mjs']['gitBlobSha1'] == p['actualRecorderBlob'] == p['recorderBlob']
    assert result['sourceFiles']['tools/ios_audio_capture.mjs']['sha256'] == p['helperSha256']
    assert result['sourceFiles']['tools/test-ios-safari.mjs']['sha256'] == p['harnessSha256']

# This is an analytical counterexample, explicitly not a measurement or replay of rAF.
result['conditionalCounterexample'] = dict(
    assumptions=['timeScale=1','no clockLast reset','initial accumulator in [0,1/60)',
                 'supplied delta is rAF now minus clockLast, not render performance.now'],
    using894msAsRafDelta=engine_step(.894), observedFixedStepsFor894ms=2,
    using581msAsRafDelta=engine_step(.581), observedFixedStepsFor581ms=4,
    using249msAsRafDelta=engine_step(.249), observedFixedStepsFor249ms=1,
    implication='The 894 ms and 249 ms sample gaps cannot be substituted for engine rAF deltas under these assumptions.',
    prTwoStepRafDeltaBoundsMs=dict(lowerExclusive=1000/60,upperExclusive=3000/60),
    prIncreaseInSampleMinusRafOffsetLowerBoundMs=894-3000/60,
    caveat='The bound is conditional, not an observed CPU duration. timeScale, resets, entry/exit times and paused callbacks are absent from the report.')
assert result['conditionalCounterexample']['using894msAsRafDelta']['steps'] == 4
assert result['conditionalCounterexample']['using249msAsRafDelta']['steps'] == 4

(OUT / 'calculations.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
print(json.dumps(dict(report=str(OUT/'calculations.json'),
                     originals={k:dict(bytes=v['bytes'],sha256=v['sha256'],
                     street=v['clips'][0]['fullEndpoints'],
                     twoLargestShare=v['clips'][0]['largestTwoShareOfFullAudioLoss'])
                                for k,v in result['originals'].items()}),ensure_ascii=False))
