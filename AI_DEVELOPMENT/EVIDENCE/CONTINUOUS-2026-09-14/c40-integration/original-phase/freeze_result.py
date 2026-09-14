#!/usr/bin/env python3
"""Pin this finite result and select compressed originals for publication."""
from datetime import datetime,timezone
from pathlib import Path
import hashlib,json

ROOT=Path(__file__).resolve().parent
def pin(path):
    data=(ROOT/path).read_bytes()
    return {'path':path,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
def main():
    recovered=json.loads((ROOT/'recovered-manifest.json').read_text())
    candidate=json.loads((ROOT/'candidate-manifest.json').read_text())
    entry=candidate['files'][0];actual=pin('candidate/'+entry['path'])
    assert actual['bytes']==entry['bytes'] and actual['sha256']==entry['sha256']
    assert entry['sha256']=='e4f36959ec83f4d4112bda7be27e081ba0e721ee27784705a21a59c4c31d0262'
    selected=['REPORT.md','receipt.json','recovered-manifest.json','authority-receipt.json',
        'transport/job-original.log','transport/tool-readback.json','original/report.json.gz','original/appium.log.gz',
        'decode_recovery.py','analyze_phase.py','phase-analysis.json','analyze_appium.py','appium-analysis.json',
        'candidate-manifest.json','candidate.patch','candidate/tools/ios_audio_capture.mjs',
        'verify_inline_candidate.mjs','inline-candidate-results.json','current-source/tools/ios_audio_capture.mjs',
        'current-source-pins.json','freeze_result.py']
    selected.extend(str(p.relative_to(ROOT)) for p in (ROOT/'source').rglob('*') if p.is_file() and '__pycache__' not in p.parts)
    for subdir in ['independent','candidate-independent']:
        manifest=json.loads((ROOT/subdir/'manifest.json').read_text())
        selected.append(subdir+'/manifest.json')
        for item in manifest.get('files',manifest.get('artifacts',[])):
            name=str(Path(item['path']).relative_to(ROOT)) if Path(item['path']).is_absolute() else subdir+'/'+item['path']
            actual=pin(name)
            assert actual['bytes']==item['bytes'] and actual['sha256']==item['sha256'],name
            selected.append(name)
    raw=[pin('original/report.json'),pin('original/appium.log')]
    receipt={'status':'finite original recovery and limited capture-transport candidate complete',
        'finalizedAtUtc':datetime.now(timezone.utc).isoformat(),
        'authorityHead':'dff2d683d0a9821c79d84848bf93cb45b8920494',
        'originalHead':'61e8f8c595bde13634fe709f979816011df165d0',
        'recoveryRun':34891306829,'recoveryJob':104134403420,'recoveryAttempt':1,'jobLogsCalls':1,
        'artifact':{'id':10364986195,'run':34884725972,'attempt':1,'zipBytes':25105480,
            'sha256':'661474f9320966960edf4794c0fdabe4d8f456ec6166efd1dbace592cef6d372','zipDownloadedLocally':False},
        'gzipBytes':579678,'rawBytes':19892407,'metaCount':2,'chunkCount':195,'endCount':2,
        'originalFailure':recovered['originalFailurePreserved'],'rawOriginals':raw,'missingPhaseRowsRecovered':False,
        'originalArithmeticMismatches':0,'independentOriginalScriptsPassed':4,
        'street':{'wallSeconds':92.01,'preMovementBrowserMs':78349,'preMovementFrames':3401,
            'smallReplyAppiumElapsedMs':59329,'smallReplyLogEndpointMs':60377,
            'audioMinusEngineSeconds':3.815999999995114,'clampSeconds':1.468,'discardSeconds':2.425,
            'accumulatorChangeSeconds':0.007333333333333036,'audioMinusRafInputSeconds':-0.08433333333333337},
        'coverage':{'savedRows':4096,'droppedRows':844,'streetRecordingRows':4025,'streetInactiveRows':13,
            'gasRecordingRows':58,'arcadeRecordingRows':0,'complete':False},
        'candidate':{**entry,'type':'diagnostic transport only','recommended':True,'adopted':False,
            'ownChecksPassed':29,'independentChecksPassed':22,'syntaxPassed':True,'blocking':0,
            'actualSafariMeasured':False,'productPerformanceRepairClaimed':False,'priorFailureRepaired':False},
        'preserved':{'productChanges':0,'clockChanges':0,'recorderChanges':0,'thresholdRelaxations':0,
            'remoteChanges':0,'newCi':0,'reruns':0,'newProfiles':0,'automations':0,'deniedUrlRetries':0,
            'qualityElementsNotMeasured':19,'criteria':71,'references':10,'validBlind':0,'completedUnits':0,
            'mode':'continuous','startedAt':'2026-09-13T20:56:49+09:00','deadline':'2026-09-20T20:56:49+09:00'},
        'next':'Writer may preserve the exact two original gzip files and adopt the reviewed single helper candidate; assess actual Safari behavior in the next ordinary CI results. Do not rerun this old profile or mark its missing rows recovered.'}
    (ROOT/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    files=[pin(path) for path in sorted(set(selected))]
    assert not any(x['path'] in ['original/report.json','original/appium.log'] for x in files)
    manifest={'status':'finite result frozen','baseCommit':receipt['authorityHead'],
        'publication':'Selected files only. Publish the two exact original gzip files; raw report/Appium originals remain local and are reproduced losslessly from those gzip files. No giant raw text duplicate and no external reference/private E9 packet.',
        'files':files,'localRawOriginalsNotSelectedForPublication':raw,
        'unselectedLocalAnalysis':'appium-commands.json and current-source/src product source inspection copies are not selected; current-source-pins.json records their provenance.'}
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'selectedFiles':len(files),'selectedBytes':sum(f['bytes'] for f in files),
        'report':pin('REPORT.md'),'receipt':pin('receipt.json'),'manifest':pin('manifest.json'),
        'candidate':pin('candidate/tools/ios_audio_capture.mjs')},indent=2))
if __name__=='__main__':main()
