from pathlib import Path
import base64, hashlib, json, re

ROOT = Path(__file__).resolve().parent
PREVIOUS = ROOT.parent / 'c39-narrative-build-preparation-ultra'
HEAD = '61e8f8c595bde13634fe709f979816011df165d0'
RUN = '34884725972'
ATTEMPT = '1'
JOB = 104112424660
BASELINE = '1094c1d96bed6b953c1655ce65549c484b8f09e275f055bff283499cece110f7'
SOURCES = ['src/content/story.js', 'src/content/locale/ja/story.js', 'src/content/locale/ja/story2.js']
STATIC = ['index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg', '.nojekyll']
PREPARED = SOURCES + ['cinderline.1.0.0.js'] + STATIC + ['report.json']
targets = json.loads((PREVIOUS / 'route-targets.json').read_text())
ROUTES = [(lang, t['conversation'], t['node']) for lang in ['en', 'ja'] for t in targets]
SCREENS = [f'{lang}-{conversation}-{node}.png' for lang, conversation, node in ROUTES]
sha = lambda b: hashlib.sha256(b).hexdigest()
blob = lambda b: hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest()

def recover_group(log, group, expected):
    pattern = re.compile(r'\[' + re.escape(group) + r'-(meta|chunk|end)\] (\{.*\})$')
    active = None
    records = []
    files = {}
    for number, line in enumerate(log.splitlines(), 1):
        m = pattern.search(line)
        if not m:
            continue
        kind, raw = m.groups()
        item = json.loads(raw)
        if kind == 'meta':
            assert active is None, ('Nested file', group, number)
            assert item['file'] in expected and item['file'] not in files, ('Unexpected/duplicate file', item)
            assert item['complete'] is True
            assert isinstance(item['bytes'], int) and 0 <= item['bytes'] <= 4 * 1024 * 1024
            assert re.fullmatch('[0-9a-f]{64}', item['sha256'])
            assert item['commit'] == HEAD, ('Wrong commit', item)
            active = {'meta': item, 'chunks': [], 'offset': 0, 'metaLine': number, 'chunkLines': []}
        elif kind == 'chunk':
            assert active is not None and item['file'] == active['meta']['file']
            assert item['offset'] == active['offset'], ('Gap/duplicate/reordered chunk', group, item['file'], number)
            b = base64.b64decode(item['base64'], validate=True)
            assert base64.b64encode(b).decode() == item['base64']
            expected_length = min(3000, active['meta']['bytes'] - active['offset'])
            assert 0 < len(b) == expected_length, ('Unexpected chunk length', group, number)
            active['chunks'].append(b)
            active['offset'] += len(b)
            active['chunkLines'].append(number)
        else:
            assert active is not None and item == active['meta'], ('Metadata/end mismatch', group, number)
            b = b''.join(active['chunks'])
            assert len(b) == item['bytes'] and sha(b) == item['sha256']
            if 'gitBlob' in item:
                assert blob(b) == item['gitBlob']
            files[item['file']] = b
            records.append({'path': item['file'], 'bytes': len(b), 'sha256': sha(b), 'gitBlob': blob(b),
                'metadata': item, 'metaLine': active['metaLine'], 'chunkCount': len(active['chunks']), 'endLine': number})
            active = None
    assert active is None, ('Truncated final file', group)
    return files, records

def main():
    log_bytes = (ROOT / 'original-job.log').read_bytes()
    log = log_bytes.decode('utf-8')
    run = json.loads((ROOT / 'authority/run.json').read_text())
    job = json.loads((ROOT / 'authority/job.json').read_text())
    assert str(run['id']) == RUN and run['head_sha'] == HEAD and run['run_attempt'] == 1
    assert run['event'] == 'push' and run['head_branch'] == 'claude/repo-instructions-constraints-r0070m'
    # The official run-jobs wrapper omits head_sha; the actual run payload above
    # and both independently exported reports bind this job's run to HEAD.
    assert job['id'] == JOB and str(job['run_id']) == RUN
    assert job['status'] == 'completed' and job['name'] == 'Prepare exact reviewed narrative source and root'
    prepared, p_records = recover_group(log, 'prepared-narrative', PREPARED)
    assert list(prepared) == PREPARED, ('Incomplete/wrong prepared output set', list(prepared))
    p = json.loads(prepared['report.json'])
    assert p['status'] == 'prepared and content/root verified'
    assert p['sourceCommit'] == HEAD and str(p['runId']) == RUN and str(p['runAttempt']) == ATTEMPT
    assert p['sourceBaseline'] == 'bf743056ce143f09e4c6544ef1c7df4b73b232fd'
    assert p['baselineReproduced'] is True and p['baselineDistSha256'] == BASELINE
    assert p['originalBundleSha256'] == BASELINE
    assert p['dependencies'] == {'esbuild': '0.25.0', 'three': '0.180.0'}
    assert len(p['commands']) == 7 and all(c['exit'] == 0 for c in p['commands'])
    old_report = json.loads((ROOT.parent / 'c36-narrative-prepared-result-ultra/prepared-original/report.json').read_text())
    assert [c['args'] for c in p['commands']] == [c['args'] for c in old_report['commands']], 'Seven command stages changed'
    canonical = json.loads((PREVIOUS / 'verified-baseline-pins.json').read_text())
    input_paths = [x['path'] for x in canonical['files']]
    input_pins = {x['path']: {k: x[k] for k in ['bytes', 'sha256', 'gitBlob']} for x in canonical['files'] if x['path'] in input_paths}
    assert len(input_pins) == 47 and p['inputs'] == input_pins
    actual_tree = {f['path']: f for f in json.loads((ROOT / 'authority/c38-tree-pins.json').read_text())['files']}
    for path, pin in input_pins.items():
        assert actual_tree[path]['sha'] == pin['gitBlob'], ('C38 canonical input differs', path)
    before = {x['path']: x for x in canonical['files']}
    assert [f['path'] for f in p['files']] == PREPARED[:-1]
    for f in p['files']:
        b = prepared[f['path']]
        assert f['output'] == f['path'].replace('/', '__')
        assert (f['bytes'], f['sha256'], f['gitBlob']) == (len(b), sha(b), blob(b))
        assert f['changed'] == (f['path'] in SOURCES + ['cinderline.1.0.0.js'])
    for path in SOURCES:
        expected = (ROOT.parent / 'c38-e9-reasoning-revision-ultra/candidate' / path).read_bytes()
        assert prepared[path] == expected, ('Frozen source mismatch', path)
    static_tree = {f['path']: f for f in json.loads((ROOT / 'authority/c38-static-root-pins.json').read_text())['files']}
    for path in STATIC:
        original_static = (PREVIOUS / 'baseline' / path).read_bytes()
        assert blob(original_static) == static_tree[path]['sha'], ('Unverified current static root', path)
        assert prepared[path] == original_static, ('Static root changed', path)
    new_bundle = sha(prepared['cinderline.1.0.0.js'])
    assert new_bundle != BASELINE and p['candidateBundleSha256'] == new_bundle
    route_files, r_records = recover_group(log, 'narrative-route', SCREENS + ['report.json'])
    route = json.loads(route_files['report.json']) if 'report.json' in route_files else None
    if route:
        assert route['sourceCommit'] == HEAD and str(route['runId']) == RUN and str(route['runAttempt']) == ATTEMPT
        assert route['bundleSha256'] == new_bundle
        assert route['status'] in ['passed', 'failed']
        assert route['browserRequested'] is True and route['browserAttempted'] is True and route['browserExecuted'] is True
        assert len(route['sourceRoutes']) == 12
        count = len(route['screens'])
        assert list(route_files) == SCREENS[:count] + ['report.json']
        for i, row in enumerate(route['sourceRoutes']):
            lang, conversation, node = ROUTES[i]
            assert (row['language'], row['conversation'], row['node']) == (lang, conversation, node)
            assert row['sourceSha256'] == targets[i % 6]['en'] and row['textSha256'] == targets[i % 6][lang]
        for i, screen in enumerate(route['screens']):
            assert screen['file'] == SCREENS[i]
            b = route_files[screen['file']]
            assert (len(b), sha(b)) == (screen['bytes'], screen['sha256'])
            assert b[:8] == b'\x89PNG\r\n\x1a\n' and b[12:16] == b'IHDR'
            assert int.from_bytes(b[16:20], 'big') == 667 and int.from_bytes(b[20:24], 'big') == 375
            assert screen['renderedSha256'] == route['sourceRoutes'][i]['displaySha256']
            assert screen['viewport'] == {'viewport': {'width': 667, 'height': 375}, 'innerWidth': 667, 'innerHeight': 375, 'devicePixelRatio': 1, 'maxTouchPoints': 1}
            if route['status'] == 'passed':
                assert screen['browserErrors'] == []
        for record in r_records:
            meta = record['metadata']
            assert str(meta['runId']) == RUN and str(meta['runAttempt']) == ATTEMPT
            assert meta['bundleSha256'] == new_bundle and meta['screenCount'] == count and meta['diagnosticStatus'] == route['status']
        if route['status'] == 'passed':
            assert count == 12 and job['conclusion'] == 'success'
    # Only validated original bytes are materialized; the immutable raw log is
    # retained even when an assertion prevents accepting incomplete transport.
    for folder, files in [('prepared-original', prepared), ('route-original', route_files)]:
        for path, b in files.items():
            out = ROOT / folder / path
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(b)
    result = {'status': 'verified original outputs', 'head': HEAD, 'runId': RUN, 'runAttempt': ATTEMPT, 'jobId': JOB,
        'jobConclusion': job['conclusion'], 'originalLog': {'bytes': len(log_bytes), 'sha256': sha(log_bytes)},
        'preparedFiles': p_records, 'routeFiles': r_records, 'candidateBundleSha256': new_bundle,
        'preparedFromCommit': HEAD, 'preparationReportSha256': sha(prepared['report.json']),
        'routeStatus': route['status'] if route else 'not recovered', 'screensRecovered': len(route['screens']) if route else 0,
        'baselineReproduced': True, 'frozenSourceFiles': 3, 'canonicalInputs': 47, 'allSevenBuildStagesPassed': True,
        'sourceKnownStagedDiagnostic': True, 'visualReview': 'pending', 'validBlindComparisons': 0,
        'allElements': '19 not measured', 'unitsCompleted': 0, 'remoteMutations': 0, 'ciStarts': 0}
    (ROOT / 'recovered-manifest.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['status', 'jobConclusion', 'candidateBundleSha256', 'preparationReportSha256', 'routeStatus', 'screensRecovered']}))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        failure = {'status':'recovery failed; originals not accepted as success','error':repr(error),'originalLogPreserved':(ROOT / 'original-job.log').exists(),'head':HEAD,'runId':RUN,'jobId':JOB}
        (ROOT / 'recovery-failure.json').write_text(json.dumps(failure,indent=2)+'\n')
        raise
