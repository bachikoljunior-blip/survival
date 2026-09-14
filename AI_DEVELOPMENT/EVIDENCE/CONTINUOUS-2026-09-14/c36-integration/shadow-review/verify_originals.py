"""Verify existing C35 source bytes and controls; never render or modify images."""
import hashlib
import json
from pathlib import Path
import struct
from datetime import datetime, timezone

OUT = Path(__file__).resolve().parent
SRC = OUT.parent / 'c35-shadow-resolution-result'
COMMIT = 'd2c463b54d4ea12abc0a9444627db810440a59a7'
RUNTIME = '514f671fa64b75dda7f835a430245e9b168f9aca38fbce0b8184b12938679a55'
checks = []

def check(name, condition):
    checks.append({'name': name, 'passed': bool(condition)})
    if not condition:
        raise AssertionError(name)

def info(path):
    data = path.read_bytes()
    return {'path': str(path), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

recovered = json.loads((SRC / 'recovered-manifest.json').read_text())
transport = json.loads((SRC / 'transport-manifest.json').read_text())
report = json.loads((SRC / 'original/report.json').read_text())
rec = {f['file']: f for f in recovered['files']}
trans = {f['file']: f for f in transport['files']}
check('both manifests identify expected commit/run/job', all(m['sourceCommit'] == COMMIT and m['sourceRun'] == 34869816263 and m['sourceJob'] == 104062638759 for m in [recovered, transport]))
check('runtime pin is original 514f', report['shadowResolution']['pin']['bundleSha256'] == RUNTIME)
check('source diagnostic reports passed with no failures', report['status'] == 'passed' and report['failures'] == [])
files = []
names = ['report.json'] + ['shadow-resolution-' + s + '-' + v + '.png' for s in ['arcade', 'south'] for v in ['original', 'double', 'restored']]
for name in names:
    p = SRC / 'original' / name
    item = info(p)
    check(name + ': bytes/SHA match recovered and transport meta/end', all(item['bytes'] == entry['bytes'] and item['sha256'] == entry['sha256'] for entry in [rec[name], trans[name]['meta'], trans[name]['end']]))
    check(name + ': complete stable committed transport', trans[name]['meta']['complete'] is True and trans[name]['meta']['stableDuringRead'] is True and trans[name]['meta']['commit'] == COMMIT)
    if name.endswith('.png'):
        data = p.read_bytes()
        check(name + ': PNG signature and IHDR', data[:8] == b'\x89PNG\r\n\x1a\n' and data[12:16] == b'IHDR')
        item['imageDimensions'] = list(struct.unpack('>II', data[16:24]))
        check(name + ': native image is 1147x645', item['imageDimensions'] == [1147, 645])
    files.append(item)

scenes = []
for v in report['shadowResolution']['views']:
    scene = v['name']
    check(scene + ': expected scene', scene in ['arcade', 'south'])
    frames = v['frames']
    check(scene + ': variants and requested sizes', [(f['variant'], f['size']) for f in frames] == [('original', 1024), ('double', 2048), ('restored', 1024)])
    check(scene + ': all pose/time/camera/light fields equal', all(f['pose'] == frames[0]['pose'] for f in frames))
    check(scene + ': all foot coordinates equal', all(f['feet'] == frames[0]['feet'] for f in frames))
    check(scene + ': fixed bias/extent/settings/target fields equal', all(f['fixed'] == v['initialFixed'] for f in frames))
    for f in frames:
        label = scene + '/' + f['variant']
        resource = f['resources']
        size = f['size']
        name = Path(f['path']).name
        check(label + ': frame matches local original byte manifest', f['bytes'] == rec[name]['bytes'] and f['sha256'] == rec[name]['sha256'])
        check(label + ': all recorded native target dimensions agree', all(resource[k] == [size, size] for k in ['mapSize', 'targetSize', 'textureImageSize', 'gpuDepthSize']))
        check(label + ': recorded target live, complete and error-free', resource['framebufferStatus'] == 36053 and resource['colorAttachmentMatchesTexture'] is True and all(resource['attachmentsLive'].values()) and resource['bindingsRestored'] is True and resource['glError'] == 0)
    a = SRC / 'original' / ('shadow-resolution-' + scene + '-original.png')
    b = SRC / 'original' / ('shadow-resolution-' + scene + '-restored.png')
    c = SRC / 'original' / ('visual-' + scene + '-frame.png')
    check(scene + ': original/restored/cached actual bytes identical', a.read_bytes() == b.read_bytes() == c.read_bytes())
    check(scene + ': doubled original bytes differ', a.read_bytes() != (SRC / 'original' / ('shadow-resolution-' + scene + '-double.png')).read_bytes())
    check(scene + ': both transitions report disposal of all old attachments', len(v['transitions']) == 2 and all(t['disposeEvents'] == 1 and all(t['oldAttachmentsDeleted'].values()) and t['glError'] == 0 for t in v['transitions']))
    check(scene + ': flags/resources restored and no diagnostic failure', all(v[k] is True for k in ['restored', 'resourcesRestored', 'flagsRestored', 'listenerRemoved', 'complete', 'originalMatchesRestored', 'validDiagnostic', 'originalMatchesCached']) and v['failure'] is None and v['cleanupFailures'] == [])
    final = v['finalState']
    check(scene + ': final target 1024, no texture-count leak or context loss', final['mapSize'] == [1024, 1024] and final['targetSize'] == [1024, 1024] and final['memoryTextures'] == v['initialMemoryTextures'] and final['contextLost'] is False and final['retiredAttachmentsDeleted'] is True)
    scenes.append({'scene': scene, 'gpuDepthSizes': [f['resources']['gpuDepthSize'] for f in frames], 'originalRestoredAndCachedBytesIdentical': True, 'poseAndFixedFieldsUnchanged': True, 'recordedResourcesRestored': True, 'renderAndFinishMs': [f['renderAndFinishMs'] for f in frames], 'timingScope': frames[0]['renderTimingScope']})

old = SRC / 'image-review.json'
archive = OUT / 'prior-image-review.original.json'
archive.write_bytes(old.read_bytes())
check('prior source-known review archived byte-for-byte', archive.read_bytes() == old.read_bytes())
result = {'schemaVersion': 1, 'checkedAt': datetime.now(timezone.utc).isoformat(), 'status': 'passed', 'reviewer': '/root/integration_recovery_ultra/shadow_original_review_ultra', 'commit': COMMIT, 'runtimeSha256': RUNTIME, 'sourceRun': 34869816263, 'sourceJob': 104062638759, 'checks': checks, 'files': files, 'sourceManifests': [info(SRC / 'recovered-manifest.json'), info(SRC / 'transport-manifest.json')], 'priorReview': info(old), 'priorReviewArchive': info(archive), 'scenes': scenes, 'measurementScope': 'Local bytes independently rehashed. GPU dimensions, disposal and frozen state cross-checked within the original report; no GPU run repeated. These numeric checks are not perception evidence.', 'imageTransforms': 0, 'remoteMutations': 0, 'productChanges': 0, 'ciRunsStarted': 0, 'automationChanges': 0}
(OUT / 'verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'status': result['status'], 'checksPassed': len(checks), 'filesVerified': len(files), 'scenes': scenes, 'verification': info(OUT / 'verification.json')}, ensure_ascii=False, indent=2))
