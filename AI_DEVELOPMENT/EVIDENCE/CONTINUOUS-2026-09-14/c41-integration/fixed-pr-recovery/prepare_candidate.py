"""Prepare a new fixed PR recovery tool; leave all existing repository files intact."""
from pathlib import Path
import json,hashlib,difflib
P=Path(__file__).resolve().parent
old=(P/'authority/tools/recover-ios-phase-c38.py').read_text()
summary=json.loads((P.parent/'c40-safari-original-results-ultra/transport/pr-summary.json').read_text())
artifacts=json.loads((P.parent/'c40-safari-original-results-ultra/transport/pr-artifacts.json').read_text())['artifacts']
meta=next(x for x in artifacts if x['id']==10369332540)
source=P/'source';source.mkdir(exist_ok=True)
(source/'original-pr-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
(source/'artifact-metadata.json').write_text(json.dumps(meta,indent=2)+'\n')
new=old.replace('fixed failed C38 report','fixed failed C40 PR report')
replacements={
 '10364986195':'10369332540','25105480':'13459726','34884725972':'34895779614',
 'iphone-se3-mobile-safari-61e8f8c595bde13634fe709f979816011df165d0':'iphone-se3-mobile-safari-051d718255ef21c4ba37947f8177d4121cd159d3',
 'sha256:661474f9320966960edf4794c0fdabe4d8f456ec6166efd1dbace592cef6d372':meta['digest'],
 "'head': '61e8f8c595bde13634fe709f979816011df165d0'":"'head': '8058f8431b7885e9e929e6cb57bb415d26d9f5b1'",
 '789f2199bd3791a6dc6566eecaf3c1478c99afa6':summary['provenance']['preparedFromCommit'],
 '2dbf5a5b15424ccd2e1e33e628391fad46084f4ec46686b70db1023d9061bf69':summary['provenance']['preparationReportSha256'],
 '1094c1d96bed6b953c1655ce65549c484b8f09e275f055bff283499cece110f7':summary['provenance']['bundleSha256'],
 'c0965004ba7d1e389300ab6556431d67ea1e158f82832225389851e0c1314f2a':summary['provenance']['helperSha256'],
 '352330412d8ac248597bedbc34a4e2ac25c8252003447806adcd6b1761250e64':summary['provenance']['harnessSha256'],
 "'runCommit': PIN['head']":"'runCommit': '051d718255ef21c4ba37947f8177d4121cd159d3'",
 '[recover-ios-phase-c38-r1]':'[recover-ios-c40-pr-r1]',
 'ios-phase-c38-original-recovery-r1':'ios-c40-pr-original-recovery-r1',
 '[ios-phase-recovery-':'[ios-c40-pr-recovery-',
 'original diagnostic remains failed and incomplete.':'original acquisition remains failed and lifecycle operations remain unexecuted.',
 }
for a,b in replacements.items():
 assert a in new,a
 new=new.replace(a,b)
start=new.index('ORIGINAL_FAILURE = ');end=new.index('\nMARKER = ',start)
new=new[:start]+'ORIGINAL_FAILURES = '+repr(summary['failures'])+'\nFAILED_CHECK_NAMES = '+repr([c['name'] for c in summary['checks'] if c['passed'] is False])+new[end:]
start=new.index('def verify_original(report):');end=new.index('\ndef recover(',start)
body='''def verify_original(report):
    require(isinstance(report, dict), 'original report must be an object')
    checks = report.get('checks')
    require(report.get('status') == 'failed' and report.get('failures') == ORIGINAL_FAILURES,
            'fixed original acquisition failures differ')
    require(isinstance(checks, list) and len(checks) == 47
            and all(isinstance(item, dict) for item in checks)
            and sum(item.get('passed') is True for item in checks) == 45,
            'fixed original check counts differ')
    failed = [item for item in checks if item.get('passed') is not True]
    require(len(failed) == 2 and all(item.get('passed') is False for item in failed)
            and [item.get('name') for item in failed] == FAILED_CHECK_NAMES,
            'fixed original failed checks differ')
    capture = report.get('audioCapture') or {}
    require(capture.get('status') == 'acquisition failed' and isinstance(capture.get('clips'), list)
            and all(isinstance(c, dict) for c in capture['clips'])
            and [c.get('name') for c in capture['clips']] == ['street-walk', 'cut-gas-air', 'arcade-room'],
            'fixed original capture declarations differ')
    require(all((c.get('timing') or {}).get('captureClockGuardPassed') is expected
            for c, expected in zip(capture['clips'], [False, True, True])),
            'fixed original acquisition clocks differ')
    provenance = capture.get('provenance') or {}
    for key, value in SOURCE.items():
        require(provenance.get(key) == value, 'fixed original provenance mismatch: ' + key)
    require(provenance.get('actualBundleHashes') == {
        'cinderline.1.0.0.js': SOURCE['bundleSha256'], 'dist/cinderline.1.0.0.js': SOURCE['bundleSha256']},
        'fixed original root/dist hashes differ')
    require(report.get('safariFrameWork') is None, 'fixed original unexpectedly has a frame profile')
    lifecycle = capture.get('lifecycle') or {}
    require(lifecycle.get('status') == 'not run'
            and lifecycle.get('reason') == 'Original acquisition did not complete successfully; no boundary operation was attempted.',
            'fixed original lifecycle declaration differs')
    return {'status': 'failed', 'checks': 47, 'passedChecks': 45,
            'profilePresent': False, 'captureStatus': 'acquisition failed', 'clips': 3,
            'lifecycleStatus': 'not run', 'failures': ORIGINAL_FAILURES}
'''
new=new[:start]+body+new[end:]
new=new.replace("'originalRunId': PIN['runId'], 'originalRunAttempt': 1, 'originalHead': PIN['head'],", "'originalRunId': PIN['runId'], 'originalRunAttempt': 1, 'originalHead': PIN['head'],\n        'originalCheckoutCommit': SOURCE['runCommit'],")
target=P/'candidate/tools/recover-ios-c40-pr.py';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(new)
(P/'helper-from-c38.patch').write_text(''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='tools/recover-ios-phase-c38.py',tofile='tools/recover-ios-c40-pr.py')))
gates=(P/'authority/.github/workflows/gates.yml').read_text()
block=gates[gates.index('  recover-ios-phase-c38:\n'):]
assert block.endswith('          retention-days: 14\n')
for a,b in [('recover-ios-phase-c38','recover-ios-c40-pr'),('fixed failed C38 source','fixed failed C40 PR'),('34884725972','34895779614'),('10364986195','10369332540'),('ios-phase-c38-original-recovery-r1','ios-c40-pr-original-recovery-r1')]:block=block.replace(a,b)
(P/'recovery-job-block.yml').write_text(block)
# Review only this append-only patch; the writer combines sibling prepare changes.
(P/'gates-append.patch').write_text(''.join(difflib.unified_diff(gates.splitlines(True),(gates+'\n'+block).splitlines(True),fromfile='a/.github/workflows/gates.yml',tofile='b/.github/workflows/gates.yml')))
print(json.dumps({'candidateBytes':len(new.encode()),'candidateSha256':hashlib.sha256(new.encode()).hexdigest(),'jobBlockBytes':len(block.encode())}))
