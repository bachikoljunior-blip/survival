"""One additional exact-byte workflow boundary check requested by integration."""
from pathlib import Path
import hashlib
import json
import re
import yaml

ROOT = Path(__file__).resolve().parent
SHARED = ROOT.parent
source = SHARED / 'main-integration-c41/candidate/.github/workflows/gates.yml'
combined = source.read_bytes()
base = (ROOT / 'baseline/gates.yml').read_bytes()
block = (ROOT / 'recovery-job-block.yml').read_bytes()
prepare_only = combined[:32671]

def sha(data):
    return hashlib.sha256(data).hexdigest()

assert len(combined) == 34517 and sha(combined) == '7ba29b14953d974ce873130dab882c1a5354cea458db6bdaccf6248aad0d2199'
assert sha(prepare_only) == '0a896f3baba6f6e7c9b66a18e5ff12ece698d4787f18db24e422584dba3cd85b'
assert sha(base) == 'f2ebc92dba2c5562ddcdf7527853b86b27578b5803586ac8f46ef0b86c685d49'
assert sha(block) == 'b275a57dd7df915d0666ac13d2ee4d2398663c2e8139042b982bfbe188d63082'
assert combined == prepare_only + b'\n' + block

def without_prepare(data):
    start = data.index(b'  prepare-narrative-product:\n')
    match = re.search(rb'^  [A-Za-z0-9_-]+:\n', data[start + 2:], re.MULTILINE)
    assert match
    end = start + 2 + match.start()
    return data[:start] + data[end:]

assert without_prepare(prepare_only) == without_prepare(base)
job_names = re.findall(rb'^  ([A-Za-z0-9_-]+):\n', combined.split(b'jobs:\n', 1)[1], re.MULTILINE)
assert len(job_names) == len(set(job_names))
before, after = yaml.safe_load(base), yaml.safe_load(combined)
assert set(after['jobs']) - set(before['jobs']) == {'recover-ios-c40-pr'}
assert all(after['jobs'][key] == value for key, value in before['jobs'].items() if key != 'prepare-narrative-product')
assert after['jobs']['recover-ios-c40-pr'] == yaml.safe_load(block)['recover-ios-c40-pr']
result = {
    'status': 'pass', 'checks': 1, 'blocking': 0,
    'scope': 'Exact composed workflow byte boundary only; sibling preparation helper internals belong to its separate reviewer',
    'repositoryPath': '.github/workflows/gates.yml', 'bytes': len(combined), 'sha256': sha(combined),
    'gitBlob': hashlib.sha1(b'blob ' + str(len(combined)).encode() + b'\0' + combined).hexdigest(),
    'prepareOnlySha256': sha(prepare_only), 'blockSha256': sha(block), 'baseSha256': sha(base),
    'composition': 'exact prepare-only prefix + one LF + exact reviewed recovery block',
    'allBytesOutsideExistingPreparationJobAndNewRecoveryJobUnchanged': True,
    'existingRequiredGatesUnchanged': True, 'duplicateJobIds': False, 'existingJobs': len(before['jobs']),
    'newJobs': ['recover-ios-c40-pr'], 'fullSiblingSixPathReview': False,
    'workflowModifiedByReviewer': False, 'actualCI': False, 'refUpdate': False,
}
(ROOT / 'combined-workflow-verification.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
