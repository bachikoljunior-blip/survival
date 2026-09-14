"""Explicit synthetic shape estimate; never overwrite or reclassify original data."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
original = root.parent / 'c36-safari-profile-result-ultra/original/report.json'
raw = original.read_bytes()
assert hashlib.sha256(raw).hexdigest() == 'b2de6f0b9ce375082be62762ee2f880fd47ab0c2bfbcbb7f65923d44b1b2cbe8'
report = json.loads(raw)
serialize = lambda value: json.dumps(value, ensure_ascii=False, indent=2).encode()
base = len(serialize(report))
profile = report['safariFrameWork']
labels = ['fixed.input', 'fixed.gas', 'fixed.navGasCost', 'fixed.playerInput', 'fixed.events', 'fixed.zone',
          'fixed.actor:0', 'fixed.system:0', 'fixed.system:1', 'fixed.system:2',
          'renderer.world', 'renderer.composite', 'renderer.other']
for row in profile['rows']:
    for label in labels:
        row['phaseMs'][label] = 1.2345678901234567
        row['phaseCalls'][label] = 4
    row.update(programsBefore=20, programsAfter=21, observerBookkeepingMs=1.2345678901234567, probeClockReads=200,
               observedWrapperEntryMs=12345.678901234567, observedWrapperExitMs=12367.890123456789)
profile.update(schemaVersion=2, slowCallThresholdMs=8, slowCallLimit=256, slowCallsDropped=0, detailComplete=True,
               fixedTargets=[dict(phase='fixed.actor:0', role='player'),
                             *[dict(phase=f'fixed.system:{i}', role=role) for i, role in enumerate(['combat','ai','director'])]],
               fixedTargetScope='Actor/system targets are captured at installation. Final registration changes are detected at stop; a temporary registration change reversed before stop is not observed.',
               observerScope='SYNTHETIC estimate padding: ' + 'x' * 1000,
               slowCalls=[dict(recording=3, fromFrame=5000, phase='fixed.system:2', call=4,
                               startOffsetMs=123.45678901234567, elapsedMs=123.45678901234567) for _ in range(256)])
added = len(serialize(report)) - base
result = {'scope': 'Synthetic field-shape estimate over original C36 row count; timings/counters are invented only for serialization sizing, not measurements. No synthetic report exported.',
          'originalSha256': hashlib.sha256(raw).hexdigest(), 'originalBytes': len(raw), 'rows': len(profile['rows']),
          'assumption': 'One actor, three systems, all 13 new phase labels on every row, high-precision durations and full 256 slow-call capacity. More actors/rows can exceed the unchanged exporter cap.',
          'estimatedAddedBytes': added, 'estimatedReportBytes': len(raw) + added,
          'exportLimitBytesUnchanged': 8 * 1024 * 1024, 'estimateFits': len(raw) + added <= 8 * 1024 * 1024,
          'actualNextReportBytesMeasured': False}
(root / 'independent/volume-recheck.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))

# Independent additional shape check, not a future-run size prediction.
parent_rows=profile['rows']
profile['rows']=[parent_rows[i % len(parent_rows)] for i in range(4096)]
result['at4096RowsSameSyntheticShapesBytes']=len(raw)+len(serialize(report))-base
result['rowCapAloneGuaranteesEightMiB']=False
result['maximumRowShapeScope']='Hypothetical repetition of the same synthetic row shapes up to 4096; other original report fields held fixed. Not measured runtime data or a strict universal size bound.'
assert result['at4096RowsSameSyntheticShapesBytes']>8*1024*1024
(root / 'independent/volume-recheck.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'maximumRowShapeBytes':result['at4096RowsSameSyntheticShapesBytes']}))
