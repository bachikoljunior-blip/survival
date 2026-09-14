"""CPU arithmetic over recovered original telemetry; no clocks are altered."""
from pathlib import Path
from collections import Counter
import csv, hashlib, json, math
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent;FIXED=1/60;EPS=1e-7
def close(a,b):assert math.isfinite(a) and math.isfinite(b) and abs(a-b)<=EPS,(a,b)
raw=(ROOT/'original/report.json').read_bytes()
assert hashlib.sha256(raw).hexdigest()=='9fe62379c2c35a01cb4b83af265b8ab67024d58b828a2da49bb586a68f6d092e'
r=json.loads(raw);p=r['safariFrameWork'];rows=p['rows'];clips=r['audioCapture']['clips']
assert len(rows)==4096 and p['dropped']==844 and p['recordingCount']==3
assert p['schemaVersion']==2 and not p['complete'] and not p['detailComplete']
assert p['errors']==[] and p['lifecycle']==[] and p['restored']
assert p['slowCallsDropped']==0 and len(p['slowCalls'])==58
budget=[];program_changes=[]
for i,row in enumerate(rows):
    b,a=row['before'],row['after'];pm=row['phaseMs'];pc=row['phaseCalls']
    assert b['running'] and a['running'] and not b['paused'] and not a['paused']
    assert not b['lost'] and not a['lost'] and not row['threw']
    assert b['mode']==a['mode']=='play' and b['tier']==a['tier']=='low'
    assert b['audioState']==a['audioState']=='running' and b['timeScale']==a['timeScale']==1
    close(row['engineWallMs'],row['rafTimestampMs']-row['priorClockLastMs'])
    close(row['entryAfterRafTimestampMs'],b['wallMs']-row['rafTimestampMs'])
    close(row['callbackElapsedMs'],a['wallMs']-b['wallMs'])
    assert row['observedWrapperEntryMs']<=b['wallMs']+EPS and row['observedWrapperExitMs']>=a['wallMs']-EPS
    assert 0<=row['observerBookkeepingMs']<=row['observedWrapperExitMs']-row['observedWrapperEntryMs']+EPS
    dt=min(row['engineWallMs']/1000,.25);close(dt,row['acceptedDtSeconds']);close(dt,row['dtRawStored'])
    advance=a['engineTime']-b['engineTime'];close(advance,row['engineAdvanceSeconds'])
    steps=round(advance/FIXED);assert 0<=steps<=4;close(advance,steps*FIXED)
    close(pc.get('updater:0:0',0),steps);assert a['engineFrame']==b['engineFrame']+1
    clamp=row['engineWallMs']/1000-dt;discard=b['accum']+dt-advance-a['accum']
    if abs(discard)<EPS:discard=0.0
    assert clamp>=-EPS and discard>=-EPS
    if steps<4:close(discard,0)
    else:close(a['accum'],0)
    for k,v in pm.items():assert math.isfinite(v) and -EPS<=v<=row['callbackElapsedMs']+EPS
    close(pm.get('renderer.render',0),sum(pm.get(k,0) for k in ['renderer.world','renderer.composite','renderer.other']))
    assert pc.get('renderer.render',0)==sum(pc.get(k,0) for k in ['renderer.world','renderer.composite','renderer.other'])
    assert pc.get('renderer.world',0)==pc.get('renderer.composite',0)==1 and pc.get('renderer.other',0)==0
    for k,v in pc.items():
        if k.startswith('fixed.') and k!='fixed.events':assert v==steps,(i,k,v,steps)
    close(pc.get('fixed.events',0),steps*len([t for t in p['fixedTargets'] if t['phase'].startswith('fixed.actor:')]))
    assert sum(v for k,v in pm.items() if k.startswith('fixed.'))<=pm.get('updater:0:0',0)+EPS
    assert pm['renderer.render']<=pm['post.render']+EPS
    invocations=sum(pc.values())-pc['renderer.render']
    assert row['probeClockReads']==6+4*invocations
    if row['programsBefore']!=row['programsAfter']:
        program_changes.append({'rowIndex':i,'fromFrame':b['engineFrame'],'before':row['programsBefore'],'after':row['programsAfter']})
    v={'rowIndex':i,'recording':row['recording'],'recorderState':row['recorderState'],'fromFrame':b['engineFrame'],
       'rawInputMs':row['engineWallMs'],'acceptedMs':dt*1000,'steps':steps,'advanceMs':advance*1000,
       'clampLossMs':clamp*1000,'discardedBacklogMs':discard*1000,'markerSpanMs':row['observedWrapperExitMs']-row['observedWrapperEntryMs'],
       'callbackElapsedMs':row['callbackElapsedMs'],'observerBookkeepingMs':row['observerBookkeepingMs'],
       'interMarkerGapMs':None,'snapshotGapMs':None,'previousRowIndex':None,'markerRafOffsetChangeMs':None}
    if i and rows[i-1]['recording']==row['recording']:
        previous=rows[i-1];close(row['priorClockLastMs'],previous['rafTimestampMs'])
        gap=row['observedWrapperEntryMs']-previous['observedWrapperExitMs']
        oldspan=previous['observedWrapperExitMs']-previous['observedWrapperEntryMs']
        offset_change=(row['observedWrapperEntryMs']-row['rafTimestampMs'])-(previous['observedWrapperEntryMs']-previous['rafTimestampMs'])
        close(row['engineWallMs'],oldspan+gap-offset_change)
        v.update(interMarkerGapMs=gap,snapshotGapMs=b['wallMs']-previous['after']['wallMs'],previousRowIndex=i-1,markerRafOffsetChangeMs=offset_change)
    budget.append(v)

by_from={(x['recording'],x['before']['engineFrame']):x for x in rows}
slow_summary=[]
for slow in p['slowCalls']:
    row=by_from[(slow['recording'],slow['fromFrame'])]
    assert slow['elapsedMs']>=8 and 1<=slow['call']<=row['phaseCalls'][slow['phase']]
    assert slow['elapsedMs']<=row['phaseMs'][slow['phase']]+EPS
    assert slow['startOffsetMs']>=-EPS and slow['startOffsetMs']+slow['elapsedMs']<=row['callbackElapsedMs']+EPS
    slow_summary.append(slow)

def finite_vec(v):return isinstance(v,list) and len(v)==3 and all(isinstance(x,(int,float)) and math.isfinite(x) for x in v)
clip_results=[]
for rec,c in enumerate(clips,1):
    b,a,t=c['before']['state'],c['after'],c['timing'];tele=c['telemetry'];frames=tele['clockFrames'];poses=tele['trajectory']
    assert tele['errors']==[] and all(v==0 for v in tele['dropped'].values()) and len(frames)>1 and len(poses)>1
    for j,x in enumerate(frames):
        assert all(math.isfinite(x[k]) for k in ['wallMs','audioTime','engineTime','engineFrame'])
        assert not x['paused'] and x['mode']=='play' and x['audioState']=='running'
        if j:
            assert all(x[k]>=frames[j-1][k] for k in ['wallMs','audioTime','engineTime','engineFrame'])
            assert x['engineFrame']==frames[j-1]['engineFrame']+1
    for x in poses:
        assert all(finite_vec(x[entity][key]) for entity,key in [('listener','position'),('listener','right'),('listener','forward'),('player','position'),('player','velocity')])
        assert all(finite_vec(y[k]) for y in x['threats'] for k in ['position','velocity'])
    wall=(a['wallMs']-b['wallMs'])/1000;audio=a['audioTime']-b['audioTime'];engine=a['engineTime']-b['engineTime'];count=a['engineFrame']-b['engineFrame'];tol=max(.1,audio*.05)
    for key,value in [('wallSeconds',wall),('audioSeconds',audio),('engineSeconds',engine),('engineFrames',count),('engineToAudioRatio',engine/audio),('audioToWallRatio',audio/wall),('engineMinusAudioSeconds',engine-audio),('audioMinusWallSeconds',audio-wall),('toleranceSeconds',tol)]:close(t[key],value)
    assert b['audioState']==a['audioState']=='running' and abs(engine-audio)<=tol and abs(audio-wall)<=tol and t['captureClockGuardPassed']
    assert all(t[k] for k in ['telemetryComplete','finiteTimeline','orderedTimeline','finitePoses'])
    assert len(frames)==count+1 and frames[0]['engineFrame']==b['engineFrame'] and frames[-1]['engineFrame']==a['engineFrame']
    active=[(i,x) for i,x in enumerate(rows) if x['recording']==rec and x['recorderState']=='recording']
    indexed={x['after']['engineFrame']:x for _,x in active};matched=0
    for x in frames[1:]:
        if x['engineFrame'] not in indexed:continue
        row=indexed[x['engineFrame']];assert row['before']['wallMs']-EPS<=x['wallMs']<=row['after']['wallMs']+EPS
        close(row['after']['engineTime'],x['engineTime']);matched+=1
    result={'recording':rec,'name':c['name'],'wallSeconds':wall,'audioSeconds':audio,'engineSeconds':engine,
      'audioMinusEngineSeconds':audio-engine,'engineToAudioRatio':engine/audio,'toleranceSeconds':tol,'guardPassed':True,
      'telemetryCompleteIndependentlyVerified':True,'clockSamples':len(frames),'trajectorySamples':len(poses),
      'loggedEngineFrames':count,'storedActiveRows':len(active),'matchedRenderSamples':matched,'renderSamplesWithoutStoredProfile':count-matched,
      'storedInactiveRows':sum(x['recording']==rec and x['recorderState']!='recording' for x in rows),
      'wholeClipProfileCovered':matched==count}
    if active:
        chosen=[budget[i] for i,_ in active];first,last=active[0][1],active[-1][1]
        raw_input=sum(x['rawInputMs'] for x in chosen)/1000;advance=sum(x['advanceMs'] for x in chosen)/1000
        clamp=sum(x['clampLossMs'] for x in chosen)/1000;discard=sum(x['discardedBacklogMs'] for x in chosen)/1000
        accum=last['after']['accum']-first['before']['accum'];close(raw_input-advance,clamp+discard+accum)
        result['observedBudget']={'rowIndices':[active[0][0],active[-1][0]],'rawInputSeconds':raw_input,'engineAdvanceSeconds':advance,
           'clampLossSeconds':clamp,'discardedBacklogSeconds':discard,'accumulatorChangeSeconds':accum,
           'fixedStepHistogram':dict(Counter(x['steps'] for x in chosen)),
           'observerBookkeepingSumMs':sum(x['observerBookkeepingMs'] for x in chosen),
           'probeClockReadsSum':sum(x['probeClockReads'] for _,x in active)}
        if result['wholeClipProfileCovered']:
            assert first['before']['engineFrame']==b['engineFrame'] and last['after']['engineFrame']==a['engineFrame']
            close(advance,engine);close(audio-engine,clamp+discard+accum+audio-raw_input)
            result['fullClipBudget']={**result['observedBudget'],'audioMinusRawInputSeconds':audio-raw_input,
                'sumEqualsAudioMinusEngineSeconds':clamp+discard+accum+audio-raw_input}
    clip_results.append(result)

def row_summary(i):
    x=rows[i]
    return {**budget[i],'beforeWallMs':x['before']['wallMs'],'afterWallMs':x['after']['wallMs'],
       'programsBefore':x['programsBefore'],'programsAfter':x['programsAfter'],'phaseMs':x['phaseMs'],'phaseCalls':x['phaseCalls']}
phase_summary=[]
for label in sorted({k for x in rows for k in x['phaseMs']}):
    i=max(range(len(rows)),key=lambda i:rows[i]['phaseMs'].get(label,0))
    phase_summary.append({'phase':label,'summedInclusiveMs':sum(x['phaseMs'].get(label,0) for x in rows),
       'calls':sum(x['phaseCalls'].get(label,0) for x in rows),'maxRowElapsedMs':rows[i]['phaseMs'].get(label,0),
       'maxRowIndex':i,'callsInMaxRow':rows[i]['phaseCalls'].get(label,0)})
out={'status':'all_observed_identities_verified','originalReportSha256':hashlib.sha256(raw).hexdigest(),
     'scope':'CPU arithmetic on original Safari elapsed/clock observations; no CPU-utilization/GPU/preemption separation.',
     'storedRows':4096,'droppedCallbacks':844,'clips':clip_results,'fixedTargets':p['fixedTargets'],
     'allStoredRowsLowTierPlayRunningUnpausedUnitScaleNoThrow':True,
     'allStoredProbeClockReadCountsMatchFormula':True,'allAdjacentSameRecordingMarkerClockIdentitiesMatch':True,
     'phaseSummary':phase_summary,'programChanges':program_changes,'slowCallCount':len(slow_summary),'slowCallsDropped':0,
     'topSlowCalls':sorted(slow_summary,key=lambda x:x['elapsedMs'],reverse=True)[:12],
     'topCallbackRows':[row_summary(i) for i in sorted(range(len(rows)),key=lambda i:rows[i]['callbackElapsedMs'],reverse=True)[:5]],
     'topGapRows':[row_summary(v['rowIndex']) for v in sorted((v for v in budget if v['interMarkerGapMs'] is not None),key=lambda v:v['interMarkerGapMs'],reverse=True)[:5]],
     'topDiscardRows':[row_summary(v['rowIndex']) for v in sorted(budget,key=lambda v:v['clampLossMs']+v['discardedBacklogMs'],reverse=True)[:8]],
     'observerBookkeeping':{'sumMs':sum(x['observerBookkeepingMs'] for x in rows),'maxMs':max(x['observerBookkeepingMs'] for x in rows),
       'probeClockReads':sum(x['probeClockReads'] for x in rows),'scope':p['observerScope']},
     'unprofiledClipFrames':sum(c['renderSamplesWithoutStoredProfile'] for c in clip_results),
     'remainingDroppedCallbacksUnclassified':844-sum(c['renderSamplesWithoutStoredProfile'] for c in clip_results),
     'originalProfileComplete':False,'missingRowsReconstructed':False}
(HERE/'arithmetic-result.json').write_text(json.dumps(out,indent=2)+'\n')
with (HERE/'observed-row-budgets.csv').open('w',newline='') as file:
    writer=csv.DictWriter(file,fieldnames=budget[0]);writer.writeheader();writer.writerows(budget)
print(json.dumps({'status':out['status'],'clipCoverage':[{k:c[k] for k in ['name','storedActiveRows','loggedEngineFrames','wholeClipProfileCovered']} for c in clip_results],
 'streetBudget':clip_results[0]['fullClipBudget'],'programChanges':program_changes,'remainingDroppedCallbacksUnclassified':out['remainingDroppedCallbacksUnclassified']}))
