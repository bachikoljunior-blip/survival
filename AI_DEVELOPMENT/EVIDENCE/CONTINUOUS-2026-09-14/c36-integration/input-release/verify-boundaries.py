import difflib, hashlib, json, pathlib, re, shutil, subprocess

base = pathlib.Path(__file__).resolve().parent
sha = lambda b: hashlib.sha256(b).hexdigest()
receipts = json.loads((base/'evidence/canonical-fetch.json').read_text())
for item in receipts:
    b = (base/'source'/item['path']).read_bytes()
    actual = hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
    assert actual == item['blob'], (item['path'], actual, item['blob'])
    item.update(bytes=len(b), sha256=sha(b))
old = (base/'source/tools/test-ios-safari.mjs').read_text()
new = (base/'candidate/tools/test-ios-safari.mjs').read_text()
start = new.index('// Observe the first render after fixed-step progress,')
end = new.index('function finger(', start)
without_helpers = new[:start] + new[end:]
old_start = old.index('      moveForCapture: async () => {')
old_end = old.index('\n      },\n    });', old_start)
new_start = without_helpers.index('      moveForCapture: async () => {')
new_end = without_helpers.index('\n      },\n    });', new_start)
assert without_helpers[:new_start] == old[:old_start]
assert without_helpers[new_end:] == old[old_end:]
old_cb, new_cb = old[old_start:old_end], without_helpers[new_start:new_end]
assert new_cb[:new_cb.index('        const after =')] == old_cb[:old_cb.index('        const after =')]
trusted = "        check(after.input.some(event => event.type === 'pointerdown'"
old_trust = old_cb[old_cb.index(trusted):old_cb.index('        check(distance')]
new_trust = new_cb[new_cb.index(trusted):new_cb.index('        check(distance')]
assert old_trust == new_trust
assert "distance > 0.15" in new_cb and "release.after.moveMagnitude === 0" in new_cb
assert "!release.after.stickActive" in new_cb and "release.status === 'passed'" in new_cb
assert 'stepFixedForTest' not in new[start:end] and '.step(' not in new[start:end]
assert '.reset(' not in new[start:end] and 'setEnabled(' not in new[start:end]
patch = ''.join(difflib.unified_diff(old.splitlines(True), new.splitlines(True),
    fromfile='a/tools/test-ios-safari.mjs', tofile='b/tools/test-ios-safari.mjs'))
(base/'candidate.patch').write_text(patch)
fixture = base/'apply-check-fixture/tools'
fixture.mkdir(parents=True,exist_ok=True)
shutil.copyfile(base/'source/tools/test-ios-safari.mjs',fixture/'test-ios-safari.mjs')
check = subprocess.run(['git','apply','--check',str(base/'candidate.patch')],cwd=fixture.parent,
    capture_output=True,text=True)
assert check.returncode == 0, check.stderr

rawpath=base.parent/'c35-ios-pr-recovered/original/report.json'
raw=rawpath.read_bytes()
assert len(raw)==939375 and sha(raw)=='abf62e88aa00183e035453e63e9ab136597a1de79e230148177318f66533cf8e'
r=json.loads(raw)
move=r['audioCapture']['movements'][0]
after=move['after']
frames=r['audioCapture']['clips'][0]['telemetry']['clockFrames']
previous=max((f for f in frames if f['wallMs']<=after['wallMs']),key=lambda f:f['wallMs'])
following=min((f for f in frames if f['wallMs']>after['wallMs']),key=lambda f:f['wallMs'])
assert previous['engineFrame']==after['engineFrame']==1439 and following['engineFrame']==1440
assert previous['engineTime']==after['engineTime'] and following['engineTime']>after['engineTime']
assert not after['stickActive'] and after['moveMagnitude']==1
assert not any('wallMs' in e or 'timeStamp' in e for e in after['input'])
actual={'source':str(rawpath),'bytes':len(raw),'sha256':sha(raw),
    'paths':['audioCapture.movements[0]','audioCapture.clips[0].telemetry.clockFrames'],
    'movement':move,'previousClockFrame':previous,'nextClockFrame':following,
    'scope':'Original recovered PR telemetry, read-only. Consistent with a read before the next native fixed update; pointerup has no timestamp, and there is no exact original Input.step trace. No claim that this timing explains the separate street audio clock failure.'}
(base/'evidence/original-pr-release-window.json').write_text(json.dumps(actual,indent=2,ensure_ascii=False)+'\n')
result={'canonicalSourceFiles':receipts,'candidateSha256':sha(new.encode()),
    'patchSha256':sha(patch.encode()),'checks':{
      'allCanonicalGitBlobsExact':True,'onlyHelperAdditionAndAudioMovementCallbackChanged':True,
      'originalBeforeSnapshotAndNativeGestureBytesExact':True,'trustedEventConditionBytesExact':True,
      'sameDistanceAndZeroMagnitudeReleaseConditions':True,'noManualStepResetOrInputEnable':True,
      'nonAudioCoreChecksAndOrderExact':True,'originalAudioHelperClockPinsCapAndRecorderUnchanged':True,
      'originalRecorderWaits2500And3500Untouched':True,'gitApplyCheck':True,
      'originalPrFullReportHashExact':True,'originalPrAfterBetweenAdjacentFramesWithoutEngineTimeProgress':True},
    'limits':['No new Safari/CI/recording/GPU/native gesture execution. CPU fixtures do not prove real Safari scheduling.',
      'Browser observation fails at 2000 ms; Node collection also rejects late responses after its 2000 ms poll budget. Each existing WebDriver request retains its original 90000 ms transport timeout, including cleanup; this is not a new 2-second transport-abort guarantee.',
      'First native render after input/engine time progress may contain 1–4 original fixed substeps. We do not wait through a failed rendered release result for a later good result.',
      'Recorder source windows, 5 percent three-clock checks, caps and gestures are unchanged. Waiting for actual release observation can add measured wall time to gesture completion; it does not rewrite or normalize original recording timestamps.']}
(base/'evidence/boundaries.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'checksPassed':len(result['checks']),'candidateSha256':result['candidateSha256'],
    'patchSha256':result['patchSha256'],'originalPrReportSha256':sha(raw)},indent=2))
