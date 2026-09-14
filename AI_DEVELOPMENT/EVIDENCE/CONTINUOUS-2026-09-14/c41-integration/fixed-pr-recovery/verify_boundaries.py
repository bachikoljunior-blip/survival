"""Check the exact fixed-artifact fork and append-only workflow boundary."""
from pathlib import Path
import ast,hashlib,json,yaml
P=Path(__file__).resolve().parent
def sha(b):return hashlib.sha256(b).hexdigest()
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
old=(P/'authority/tools/recover-ios-phase-c38.py').read_bytes()
gates=(P/'authority/.github/workflows/gates.yml').read_bytes()
assert blob(old)=='cd635feda9587d9ae43a597b3e4e294f41dea76a'
assert blob(gates)=='65a492762a06f8d8007bfe8ee68c8cf3b430d56f'
new=(P/'candidate/tools/recover-ios-c40-pr.py').read_bytes()
def funcs(data):return {n.name:ast.dump(n,include_attributes=False) for n in ast.parse(data).body if isinstance(n,ast.FunctionDef)}
a,b=funcs(old),funcs(new)
assert set(a)==set(b)
unchanged=[n for n in a if a[n]==b[n]]
assert set(a)-set(unchanged)=={'main','verify_original'}
block=(P/'recovery-job-block.yml').read_text()
base=yaml.safe_load(gates);combined=yaml.safe_load(gates.decode()+'\n'+block)
assert set(combined['jobs'])-set(base['jobs'])=={'recover-ios-c40-pr'}
assert all(combined['jobs'][k]==v for k,v in base['jobs'].items())
job=combined['jobs']['recover-ios-c40-pr']
assert job['permissions']=={'contents':'read','actions':'read'} and job['timeout-minutes']==10
assert job['if']=="github.event_name == 'push' && github.ref == 'refs/heads/claude/repo-instructions-constraints-r0070m' && github.run_attempt == 1 && contains(github.event.head_commit.message, '[recover-ios-c40-pr-r1]')"
assert job['steps'][0]['with']=={'ref':'${{ github.sha }}','persist-credentials':False}
archive=job['steps'][2]
assert archive['run']=="set -o pipefail\ngh api repos/bachikoljunior-blip/survival/actions/artifacts/10369332540/zip | python3 tools/recover-ios-c40-pr.py --receive-archive\n"
assert job['steps'][-1]['if']=='always()'
patch=(P/'gates-append.patch').read_text();assert not any(x.startswith('-') and not x.startswith('---') for x in patch.splitlines())
out={'status':'passed','sourceCommit':'8058f8431b7885e9e929e6cb57bb415d26d9f5b1',
 'canonicalBaseHelperBlob':blob(old),'canonicalBaseGatesBlob':blob(gates),
 'candidate':{'bytes':len(new),'sha256':sha(new),'gitBlob':blob(new)},
 'unchangedFunctionBodies':unchanged,'changedFunctionBodies':['verify_original','main'],
 'workflowAddedJobs':['recover-ios-c40-pr'],'priorJobsByteSourcePreserved':True,
 'readOnlyPermissions':True,'sourceBranchPushAttempt1MarkerOnly':True,'officialApiPipeUnchangedPattern':True,
 'originalZipRead':False,'actualCiRun':False}
(P/'boundary-results.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out,indent=2))
