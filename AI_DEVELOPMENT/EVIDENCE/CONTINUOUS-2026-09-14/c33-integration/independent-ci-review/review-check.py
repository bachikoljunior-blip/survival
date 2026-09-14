from pathlib import Path
import difflib
import hashlib
import json
import re
import yaml

workspace = Path(__file__).resolve().parents[2]
out = Path(__file__).resolve().parent
candidate = workspace / 'main-integration-c33/ci-candidate'
sha = lambda b: hashlib.sha256(b).hexdigest()
pins = {
    'tools/prepare-audio-product.mjs': '53b1e5ffd913d7489627589f3e1d7e9f282f15ba695f81f7ad21492387f1be93',
    'tools/export-webkit-material.mjs': '410410ffbf09560d77d8139e4d5b911d295b04d183cf91048648baf36b4611ce',
    '.github/workflows/gates.yml': 'a37da031be6d95aa8ca403afdc11c66c6e76e0f26f5bad401f08225dd8e41749',
    'tools/candidates/audio-resume-r2.js': '92ee1d3c35fc02d868811ff1c02bb3d1403b4faddef804feb8984c897a037c6e',
    'tools/mobile_character_ground_contact.mjs': '3089656aef02dfb1a80e7f5721b558e0789efa1a9957ed8179f0f6f53c030a8e',
    'tools/mobile_visual_capture.mjs': '2afa0734c9fd2c73a3ddc6e45ce548f28b13d472a65c1c4bbed804007d60f3f5',
}
files = []
for name, pin in pins.items():
    b = (candidate / name).read_bytes()
    assert sha(b) == pin
    files.append({'path': str(candidate / name), 'bytes': len(b), 'sha256': pin,
                  'gitBlob': hashlib.sha1(f'blob {len(b)}\0'.encode() + b).hexdigest()})
old = (out / 'base/prepare-audio-product.mjs').read_text()
new = (candidate / 'tools/prepare-audio-product.mjs').read_text()
replacements = [
    ('tools/candidates/audio-interior-r1.js', 'tools/candidates/audio-resume-r2.js'),
    ('22add12afa50de4632d43afb00d52789c7f473a0657affd70f3a855a5951d2b7', pins['tools/candidates/audio-resume-r2.js']),
    ('test-results/audio-product-build-r1', 'test-results/audio-product-build-r2'),
    ("sourceBaseline: '0abe4628947064fe811ed842face2018b87d5bf5'", "sourceBaseline: 'b0f1dfb9860dbc00018c0c587d8f0934fadb6604'"),
    ('Only reviewed audio.js: interior ambience selection and retention of authored layer targets during modulation.',
     'Only reviewed audio.js: interior and title ambience boundaries, retained layer targets, and same-context recovery from a later trusted gesture.'),
]
for before, after in replacements:
    assert old.count(before) == 1
    old = old.replace(before, after)
assert old == new
inputs = json.loads(re.search(r'INPUTS = Object.freeze\((\{.*?\})\);', new, re.S).group(1))
assert len(inputs) == 47

export = (candidate / 'tools/export-webkit-material.mjs').read_text()
block = """if (process.env.CINDERLINE_CHARACTER_CONTACT === '1') {
  for (const scene of ['arcade', 'south']) {
    for (const variant of ['original', 'depth-zero', 'normal-zero', 'both-zero', 'repeat']) {
      files.push(`contact-${scene}-${variant}.png`);
    }
  }
}
"""
assert export.count(block) == 1
assert export.replace(block, '') == (out / 'base/export-webkit-material.mjs').read_text()

before = yaml.safe_load((out / 'base/gates.yml').read_text())
after = yaml.safe_load((candidate / '.github/workflows/gates.yml').read_text())
jobs, newjobs = before['jobs'], after['jobs']
assert set(newjobs) - set(jobs) == {'character-ground-contact'}
assert not set(jobs) - set(newjobs)
unchanged = [name for name in jobs if name != 'prepare-audio-product']
assert len(unchanged) == 15
for name in unchanged:
    assert jobs[name] == newjobs[name], name
expected_prepare = json.loads(json.dumps(jobs['prepare-audio-product'])
    .replace('[prepare-audio-product-r1]', '[prepare-audio-product-r2]')
    .replace('audio-product-build-r1', 'audio-product-build-r2'))
assert expected_prepare == newjobs['prepare-audio-product']
assert {k: v for k, v in before.items() if k != 'jobs'} == {k: v for k, v in after.items() if k != 'jobs'}
contact = newjobs['character-ground-contact']
assert contact['permissions'] == {'contents': 'read'}
assert contact['env'] == {'CINDERLINE_VISUAL_ONLY': '1', 'CINDERLINE_CHARACTER_CONTACT': '1',
                          'CINDERLINE_WEBKIT_OUTPUT': 'test-results/character-contact-c33-r1'}
assert contact['if'] == "github.event_name == 'push' && github.run_attempt == 1 && contains(github.event.head_commit.message, '[character-contact-c33-r1]')"
assert all(step.get('continue-on-error') is not True for step in contact['steps'])
assert next(s for s in contact['steps'] if s.get('run') == 'node tools/export-webkit-material.mjs')['if'] == 'always()'

for name in ['tools/mobile_character_ground_contact.mjs', 'tools/mobile_visual_capture.mjs']:
    assert (candidate / name).read_bytes() == (workspace / 'character-ground-contact-ultra/candidate' / name).read_bytes()
assert (candidate / 'tools/candidates/audio-resume-r2.js').read_bytes() == (workspace / 'safari-audio-resume-ultra/composite/src/audio/audio.js').read_bytes()
resume_path = workspace / 'safari-audio-resume-ultra/verification.json'
resume = json.loads(resume_path.read_text())
assert len(resume['checks']) == 35 and all(c['passed'] is True for c in resume['checks'])
export_path = workspace / 'main-integration-c33/export-verification.json'
export_result = json.loads(export_path.read_text())
assert export_result['completeExpectedFiles'] == 20 and export_result['decodedOriginalByteMatches'] == 20
assert export_result['missingExpectedControlRejected'] is True

result = {
    'scope': 'Read-only byte/diff/YAML review of six ci-candidate files. No helper, build, CI or CPU suite reexecuted.',
    'blockingFindings': [], 'reviewedFiles': files,
    'prepareOnlyFiveDeclaredReplacements': True, 'unchangedBuildInputPins': 47,
    'originalBundlePin': '81c93f3bf6c45b14c25f0e742a78d19b8dc70dca665ebba897bb6e39bbc937b3',
    'unchangedExistingJobs': unchanged, 'prepareJobOnlyMarkerAndOutputRename': True,
    'workflowTopLevelUnchanged': True, 'newJobExplicitSinglePushDiagnostic': True,
    'exportOnlyAddsTenExpectedContactNamesWhenEnabled': True,
    'old2MiBCapOffsetsShaAndFailureExitUnchanged': True,
    'twoContactToolsMatchPriorFrozenCandidate': True, 'combinedAudioMatchesAuthorsComposite': True,
    'existingEvidenceRead': [
        {'path': str(resume_path), 'sha256': sha(resume_path.read_bytes()), 'checks': 35, 'rerunByThisReviewer': False},
        {'path': str(export_path), 'sha256': sha(export_path.read_bytes()), 'roundtripFiles': 20, 'missingRejected': True, 'rerunByThisReviewer': False},
    ],
    'limitations': [
        'No actual new candidate build, Safari recovery or contact render is measured here.',
        'Complete outgoing commit tree and raw 239 archive entries are outside this six-file review.',
        'Artifact upload uses missing-files warn; the preceding always-run exporter still fails the job for absent expected files.',
    ],
    'reviewCheckerCorrection': 'Initial comparison assumed old marker [prepare-audio-product]; canonical baseline actually uses [prepare-audio-product-r1]. Corrected the read-only checker, not the candidate. That initial assertion supplied no passing review result.',
    'candidateEdits': 0, 'newCI': 0, 'remoteWrites': 0, 'automationChanges': 0, 'newAgents': 0, 'comparisons': 0,
}
(out / 'review-result.json').write_text(json.dumps(result, indent=2) + '\n')
diff = []
for baseline, name in [('prepare-audio-product.mjs', 'tools/prepare-audio-product.mjs'),
                       ('export-webkit-material.mjs', 'tools/export-webkit-material.mjs'),
                       ('gates.yml', '.github/workflows/gates.yml')]:
    diff.extend(difflib.unified_diff((out / 'base' / baseline).read_text().splitlines(True),
                                  (candidate / name).read_text().splitlines(True),
                                  fromfile='b0/' + name, tofile='candidate/' + name))
(out / 'limited-diff.patch').write_text(''.join(diff))
print(json.dumps({'blockingFindings': 0, 'files': len(files), 'unchangedJobs': len(unchanged),
                  'reviewResultSha256': sha((out / 'review-result.json').read_bytes())}))
