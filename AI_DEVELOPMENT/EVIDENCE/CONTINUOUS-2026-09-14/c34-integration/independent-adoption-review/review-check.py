from pathlib import Path
import hashlib, json, re, difflib

ROOT = Path('/workspace/scratch/0b7ad82bafe7')
OUT = ROOT / 'c34-audio-adoption-review-ultra'
NEW = ROOT / 'main-integration-c34/candidate'
OLD = ROOT / 'main-integration-c33/candidate'
RAW = ROOT / 'c33-audio-product-prepared/original'
COMMIT = 'eb81be9053204fa25a0e7556f78941dd862d4032'
REPORT_SHA = '3af69d8780c54ca4a5f2868e7b5958f6200578390a47977440fc65edf8189446'
BUNDLE_SHA = '514f671fa64b75dda7f835a430245e9b168f9aca38fbce0b8184b12938679a55'
SOURCE_SHA = '92ee1d3c35fc02d868811ff1c02bb3d1403b4faddef804feb8984c897a037c6e'
def sha(b): return hashlib.sha256(b).hexdigest()
def metadata(p):
    b = p.read_bytes()
    return {'bytes':len(b), 'sha256':sha(b), 'gitBlob':hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()}
def readjson(p): return json.loads(p.read_bytes())

draft = readjson(ROOT / 'main-integration-c34/draft-five-file-manifest.json')
expected = {f['path']:f for f in draft['files']}
assert len(expected) == 5
assert {p.relative_to(NEW).as_posix() for p in NEW.rglob('*') if p.is_file()} == set(expected)
assert draft['baseCommit'] == COMMIT and draft['preparedReportSha256'] == REPORT_SHA
measured = []
for path, item in expected.items():
    actual = metadata(NEW / path)
    assert all(actual[k] == item[k] for k in actual), path
    measured.append({'path':path, **actual})

old_review_path = ROOT / 'c33-audio-integration-review-ultra/review-result.json'
assert sha(old_review_path.read_bytes()) == 'e0c04a753c3e8aca668668d920dd1a709098932fd0bca8d9355c8758cddb59c4'
old_review = readjson(old_review_path)
for item in old_review['reviewedFiles']:
    actual = metadata(ROOT / item['path'])
    assert all(actual[k] == item[k] for k in actual)
for path in ['tools/mobile_audio_capture.mjs','tools/gates/f3_safari_audio.mjs']:
    assert (NEW / path).read_bytes() == (OLD / path).read_bytes()

helper_path = 'tools/ios_audio_capture.mjs'
before = (OLD / helper_path).read_text()
after = (NEW / helper_path).read_text()
replacements = {
    'b0f1dfb9860dbc00018c0c587d8f0934fadb6604':COMMIT,
    'b7d9ec73952bff902671be16a03b7e507e35d343928a5a5b4229d237e027f738':REPORT_SHA,
    '239007002bcd9e126ce8fcc87f94f19b4ae4c779af512c7ce4b1fb8eec253ddf':BUNDLE_SHA,
}
changed = before
for old, new in replacements.items():
    assert changed.count(old) == 1 and after.count(new) == 1
    changed = changed.replace(old, new)
assert changed == after
pins_block = re.search(r'export const IOS_AUDIO_PIN = Object.freeze\(\{(.*?)\}\);',after,re.S).group(1)
pins = dict(re.findall(r"(\w+): '([^']*)'", pins_block))
assert pins == {'preparedFromCommit':COMMIT, 'preparationReportSha256':REPORT_SHA,
                'bundle':'cinderline.1.0.0.js','bundleSha256':BUNDLE_SHA,
                'recorderBlob':metadata(NEW / 'tools/mobile_audio_capture.mjs')['gitBlob']}

assert sha((RAW / 'report.json').read_bytes()) == REPORT_SHA
report = readjson(RAW / 'report.json')
assert report['sourceCommit'] == COMMIT and report['runId'] == '34864648858' and report['runAttempt'] == '1'
assert report['status'] == 'prepared and content/root verified' and report['baselineReproduced'] is True
assert report['baselineDistSha256'] == report['originalBundleSha256'] == '81c93f3bf6c45b14c25f0e742a78d19b8dc70dca665ebba897bb6e39bbc937b3'
assert report['candidateBundleSha256'] == BUNDLE_SHA and report['expectedSourceSha256'] == SOURCE_SHA
assert report['dependencies'] == {'esbuild':'0.25.0','three':'0.180.0'}
assert len(report['commands']) == 7 and all(c['exit'] == 0 for c in report['commands'])
prepare_path = ROOT / 'main-integration-c33/ci-candidate/tools/prepare-audio-product.mjs'
assert sha(prepare_path.read_bytes()) == '53b1e5ffd913d7489627589f3e1d7e9f282f15ba695f81f7ad21492387f1be93'
fixed = json.loads(re.search(r'export const INPUTS = Object.freeze\((\{.*?\})\);',prepare_path.read_text(),re.S).group(1))
assert len(fixed) == 47 and {p:v['sha256'] for p,v in report['inputs'].items()} == fixed
assert {f['path'] for f in report['files'] if f['changed']} == {'src/audio/audio.js','cinderline.1.0.0.js'}
report_files = {f['path']:f for f in report['files']}
recovered_path = ROOT / 'c33-audio-product-prepared/recovered-manifest.json'
recovered = readjson(recovered_path)
assert recovered['run'] == 34864648858 and recovered['job'] == 104045296962 and recovered['sourceCommit'] == COMMIT
recovered_files = {f['file']:f for f in recovered['completeFiles']}
for path in ['src/audio/audio.js','cinderline.1.0.0.js','report.json']:
    actual = metadata(RAW / path)
    assert recovered_files[path]['complete'] is True and recovered_files[path]['commit'] == COMMIT
    assert all(actual[k] == recovered_files[path][k] for k in actual)
    if path != 'report.json':
        assert (NEW / path).read_bytes() == (RAW / path).read_bytes()
        assert all(actual[k] == report_files[path][k] for k in actual)
assert (NEW / 'src/audio/audio.js').read_bytes() == (ROOT / 'main-integration-c33/ci-candidate/tools/candidates/audio-resume-r2.js').read_bytes()
canonical = readjson(OUT / 'canonical-receipt.json')
canonical_files = {f['path']:f for f in canonical['files']}
assert canonical_files['tools/candidates/audio-resume-r2.js']['sha256'] == SOURCE_SHA
assert canonical_files['tools/prepare-audio-product.mjs']['sha256'] == sha(prepare_path.read_bytes())
for item in measured:
    assert metadata(NEW / item['path']) == {k:item[k] for k in ['bytes','sha256','gitBlob']}

result = {
    'scope':'Read-only final C34 five-file adoption reconciliation against canonical C33, actual recovered preparation bytes and prior frozen reviews. No build, suite, preflight, CI or browser executed.',
    'baseCommit':COMMIT, 'blockingFindings':[], 'reviewedFiles':measured,
    'candidateManifest':{'path':'main-integration-c34/draft-five-file-manifest.json','sha256':sha((ROOT / 'main-integration-c34/draft-five-file-manifest.json').read_bytes())},
    'priorReview':{'path':str(old_review_path.relative_to(ROOT)), 'sha256':sha(old_review_path.read_bytes()),'allOldCandidateHashesStillMatch':True},
    'agreements':{'sourceAndRootExactlyEqualRecoveredOriginalBytes':True,'sourceExactlyEqualsCanonicalC33Candidate92ee':True,'helperOnlyThreeExactPinReplacements':True,'recorderAndF3ExactlyEqualPriorReviewedDraft':True,'recorderBlobMatchesPin':True,'lifecycleTransportLimitsClocksAndFailureBehaviorUnchanged':True,'sameCandidateHashesAtReadAndFinish':True},
    'pins':pins,
    'preparation':{'reportSha256':REPORT_SHA,'sourceCommit':report['sourceCommit'],'runId':report['runId'],'runAttempt':report['runAttempt'],'recoveredJob':recovered['job'],'status':report['status'],'inputHashesExactlyMatchCanonicalFixedPins':47,'baselineReproduced':True,'originalBundleSha256':report['originalBundleSha256'],'candidateBundleSha256':BUNDLE_SHA,'lockedDependencies':report['dependencies'],'sevenRecordedCommandsExitedZero':True,'recoveredManifestSha256':sha(recovered_path.read_bytes())},
    'limits':['Actual Mobile Safari recovery, recordings and quality remain not measured.','Prior 80-control lifecycle and 35-control resume suites were not reexecuted; unchanged implementations and prior review identities were checked.','Static old-evidence rejection preflight and actual required CI are owned by integration owner, not executed by this reviewer.','Complete outgoing commit tree and other archived assets are outside this five-file review.'],
    'candidateEdits':0,'remoteWrites':0,'newCI':0,'automationChanges':0,'newAgents':0,'comparisons':0
}
(OUT / 'review-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
(OUT / 'limited-helper-diff.patch').write_text(''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='reviewed-239-draft/'+helper_path,tofile='c34-candidate/'+helper_path)))
print(json.dumps({'blockingFindings':0,'files':5,'exactHelperPinChanges':3,'fixedInputs':47,'resultSha256':sha((OUT / 'review-result.json').read_bytes())}))
