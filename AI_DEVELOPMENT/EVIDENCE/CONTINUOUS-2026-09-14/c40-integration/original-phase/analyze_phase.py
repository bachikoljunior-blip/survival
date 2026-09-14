#!/usr/bin/env python3
"""Arithmetic on an exact recovered report, never inferred clip or hardware time."""
from pathlib import Path
from collections import Counter
import hashlib,json,math
ROOT=Path(__file__).resolve().parent
def dist(values):
    values=sorted(x for x in values if isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x))
    if not values:return {'count':0}
    return {'count':len(values),'sum':sum(values),'min':values[0],'p50':values[len(values)//2],
        'p90':values[min(len(values)-1,int(len(values)*.9))],'p99':values[min(len(values)-1,int(len(values)*.99))],'max':values[-1]}
def check_close(actual,expected,label,issues,epsilon=1e-6):
    if not math.isclose(actual,expected,abs_tol=epsilon,rel_tol=1e-10):issues.append({'label':label,'actual':actual,'expected':expected})
def profile_scope(indexed):
    rows=[r for _,r in indexed]; phases=sorted({label for r in rows for label in r['phaseMs']})
    outside=[];budgets=[];issues=[]
    for (idx,r),(jdx,next_row) in zip(indexed,indexed[1:]):
        if r['recording']!=next_row['recording']:continue
        clock_gap=next_row['before']['wallMs']-r['after']['wallMs']
        marker_gap=next_row['observedWrapperEntryMs']-r['observedWrapperExitMs']
        outside.append({'previousRow':idx,'nextRow':jdx,'fromFrame':r['after']['engineFrame'],
            'toFrame':next_row['before']['engineFrame'],'clockBoundaryGapMs':clock_gap,
            'wrapperMarkerGapMs':marker_gap,'nextEngineWallMs':next_row['engineWallMs'],
            'previousCallbackMs':r['callbackElapsedMs'],'previousWorldMs':r['phaseMs'].get('renderer.world',0),
            'previousCompositeMs':r['phaseMs'].get('renderer.composite',0)})
        if next_row['priorClockLastMs']==r['rafTimestampMs']:
            expected=r['callbackElapsedMs']+clock_gap-(next_row['entryAfterRafTimestampMs']-r['entryAfterRafTimestampMs'])
            check_close(next_row['engineWallMs'],expected,f'row {jdx}: raf/callback/gap identity',issues)
    for idx,r in indexed:
        b,a=r['before'],r['after'];advance=a['engineTime']-b['engineTime'];steps=round(advance*60)
        check_close(r['callbackElapsedMs'],a['wallMs']-b['wallMs'],f'row {idx}: callback duration',issues)
        check_close(r['phaseMs'].get('renderer.render',0),sum(r['phaseMs'].get(k,0) for k in ['renderer.world','renderer.composite','renderer.other']),f'row {idx}: render aggregate',issues)
        if r['acceptedDtSeconds'] is None or b['timeScale']!=1 or a['timeScale']!=1:continue
        if not (b['running'] and not b['paused'] and not b['lost'] and not r['threw']):continue
        accepted=r['acceptedDtSeconds'];raw=r['engineWallMs']/1000
        clamp=raw-accepted;discard=b['accum']+accepted-advance-a['accum']
        if abs(discard)<1e-9:discard=0
        check_close(accepted,min(raw,.25),f'row {idx}: unchanged 250ms input clamp',issues)
        check_close(advance,steps/60,f'row {idx}: fixed-step advance',issues)
        check_close(r['phaseCalls'].get('updater:0:0',0),steps,f'row {idx}: fixed invocation count',issues)
        if steps<4:check_close(discard,0,f'row {idx}: no discard below four steps',issues)
        elif steps==4:check_close(a['accum'],0,f'row {idx}: discard resets accumulator',issues)
        else:issues.append({'label':f'row {idx}: above four steps','actual':steps})
        if discard<0 or clamp<-1e-9:issues.append({'label':f'row {idx}: negative clamp/discard','clamp':clamp,'discard':discard})
        budgets.append({'row':idx,'recording':r['recording'],'fromFrame':b['engineFrame'],'toFrame':a['engineFrame'],
            'rawInputMs':raw*1000,'acceptedMs':accepted*1000,'steps':steps,'engineAdvanceMs':advance*1000,
            'clampLossMs':clamp*1000,'discardedBacklogMs':discard*1000,'totalDroppedMs':(clamp+discard)*1000,
            'accumulatorDeltaMs':(a['accum']-b['accum'])*1000,'callbackMs':r['callbackElapsedMs'],
            'phaseMs':r['phaseMs'],'phaseCalls':r['phaseCalls'],'programsBefore':r['programsBefore'],'programsAfter':r['programsAfter']})
    summary={'rows':len(rows),'recorderStates':dict(Counter(r['recorderState'] for r in rows)),
        'callbackElapsedMs':dist([r['callbackElapsedMs'] for r in rows]),
        'observedWrapperMarkerSpanMs':dist([r['observedWrapperExitMs']-r['observedWrapperEntryMs'] for r in rows]),
        'clockBoundaryGapMs':dist([x['clockBoundaryGapMs'] for x in outside]),
        'wrapperMarkerGapMs':dist([x['wrapperMarkerGapMs'] for x in outside]),
        'observerBookkeepingMs':dist([r['observerBookkeepingMs'] for r in rows]),
        'probeClockReads':dist([r['probeClockReads'] for r in rows]),
        'programCounts':sorted({v for r in rows for v in [r['programsBefore'],r['programsAfter']] if v is not None}),
        'programChangeRows':[{'row':idx,'recording':r['recording'],'fromFrame':r['before']['engineFrame'],'before':r['programsBefore'],'after':r['programsAfter'],'phaseMs':r['phaseMs']} for idx,r in indexed if r['programsBefore']!=r['programsAfter']],
        'phasesInclusiveMs':{label:dist([r['phaseMs'].get(label,0) for r in rows]) for label in phases},
        'phaseCallCounts':{label:dict(Counter(r['phaseCalls'].get(label,0) for r in rows)) for label in phases},
        'largestCallbacks':[{'row':idx,**r} for idx,r in sorted(indexed,key=lambda item:item[1]['callbackElapsedMs'],reverse=True)[:8]],
        'largestWrapperMarkerGaps':sorted(outside,key=lambda x:x['wrapperMarkerGapMs'],reverse=True)[:8],
        'activeUnitTimescaleBudgetRows':len(budgets),'budgetTotalsMs':{key:sum(x[key] for x in budgets) for key in ['rawInputMs','acceptedMs','engineAdvanceMs','clampLossMs','discardedBacklogMs','totalDroppedMs','accumulatorDeltaMs']},
        'largestDroppedRows':sorted(budgets,key=lambda x:x['totalDroppedMs'],reverse=True)[:8],
        'pausedRows':sum(bool(r['before']['paused']) for r in rows),'lostRows':sum(bool(r['before']['lost']) for r in rows),
        'thrownRows':sum(bool(r['threw']) for r in rows),'timeScales':sorted({r['before']['timeScale'] for r in rows}),
        'arithmeticIssues':issues}
    totals=summary['budgetTotalsMs'];check_close(totals['rawInputMs']-totals['engineAdvanceMs'],totals['clampLossMs']+totals['discardedBacklogMs']+totals['accumulatorDeltaMs'],'scoped input/advance budget identity',issues)
    return summary
def main():
    raw=(ROOT/'original/report.json').read_bytes();report=json.loads(raw);capture=report.get('audioCapture') or {};p=report.get('safariFrameWork')
    result={'scope':'Exact original C38 iOS Simulator report arithmetic. Synchronous elapsed includes preemption/blocking/observer work; nested phases overlap. Wrapper-marker gaps are not full callback gaps and remain unattributed. No CPU/GPU/host-load attribution is asserted.',
        'originalBytes':len(raw),'originalSha256':hashlib.sha256(raw).hexdigest(),'status':report['status'],
        'checks':len(report['checks']),'passedChecks':sum(c.get('passed') is True for c in report['checks']),
        'failures':report['failures'],'failedChecks':[c for c in report['checks'] if c.get('passed') is not True],
        'captureStatus':capture.get('status'),'captureReason':capture.get('reason'),'captureCleanupErrors':capture.get('cleanupErrors'),
        'profilePresent':p is not None,'audioTransferFinal':report.get('safariAudioTransferFinal'),'audioCleanupFinal':report.get('safariAudioCleanupFinal'),
        'release':report.get('interaction',{}).get('audioStreetRelease'),'lifecycle':capture.get('lifecycle'),'transport':capture.get('transport'),
        'clipOriginalMediaBytesLocallyRecovered':False,'originalMediaScope':'Report metadata and host receipts are original; actual encoded media files were not downloaded by this task.',
        'clips':[]}
    if p is not None:
        result['profileMetadata']={k:v for k,v in p.items() if k not in ['rows','slowCalls']};result['slowCalls']=p['slowCalls']
        result['allRows']=profile_scope(list(enumerate(p['rows'])))
        result['recordings']=[]
        for ordinal in sorted({r['recording'] for r in p['rows']}):
            indexed=[(i,r) for i,r in enumerate(p['rows']) if r['recording']==ordinal]
            active=[(i,r) for i,r in indexed if r['recorderState']=='recording']
            result['recordings'].append({'ordinal':ordinal,'allRowCount':len(indexed),'recordingStateRows':profile_scope(active)})
    for ordinal,c in enumerate(capture.get('clips',[]),1):
        b,a=c['before']['state'],c['after'];audio=a['audioTime']-b['audioTime'];engine=a['engineTime']-b['engineTime'];wall=(a['wallMs']-b['wallMs'])/1000
        timing={'wallSeconds':wall,'audioSeconds':audio,'engineSeconds':engine,'engineToAudioRatio':engine/audio if audio>0 else None,
            'audioToWallRatio':audio/wall if wall>0 else None,'engineMinusAudioSeconds':engine-audio,'audioMinusWallSeconds':audio-wall,
            'toleranceSeconds':max(.1,audio*.05),'recomputedClockGuardPassed':all(x>0 and math.isfinite(x) for x in [audio,engine,wall,a['engineFrame']-b['engineFrame']]) and b['audioState']==a['audioState']=='running' and abs(engine-audio)<=max(.1,audio*.05) and abs(audio-wall)<=max(.1,audio*.05)}
        clip={'ordinal':ordinal,'name':c['name'],'path':c['path'],'bytes':c['bytes'],'sha256':c['sha256'],'before':b,'after':a,'originalTiming':c['timing'],'recomputed':timing,'recalculationIssues':[]}
        for key,value in timing.items():
            if key in c['timing'] and isinstance(value,(int,float)):check_close(c['timing'][key],value,'clip '+c['name']+': '+key,clip['recalculationIssues'])
        if timing['recomputedClockGuardPassed']!=c['timing']['captureClockGuardPassed']:clip['recalculationIssues'].append({'label':'clock pass disagreement'})
        if p is not None:
            indexed=[(i,r) for i,r in enumerate(p['rows']) if r['recording']==ordinal]
            contained=[(i,r) for i,r in indexed if r['before']['wallMs']>=b['wallMs'] and r['after']['wallMs']<=a['wallMs']]
            clip.update(profileRecordingRows=len(indexed),boundaryRowsExcluded=len(indexed)-len(contained),fullyContainedProfile=profile_scope(contained))
            active=[(i,r) for i,r in indexed if r['recorderState']=='recording']
            if active and b['engineFrame']==active[0][1]['before']['engineFrame'] and a['engineFrame']==active[-1][1]['after']['engineFrame']:
                budget=profile_scope(active)['budgetTotalsMs'];clip['endpointFramesMatchActiveProfile']=True
                clip['audioDeficitBudgetSeconds']={'clamp':budget['clampLossMs']/1000,'discard':budget['discardedBacklogMs']/1000,
                    'accumulatorChange':budget['accumulatorDeltaMs']/1000,'audioMinusRafInput':audio-budget['rawInputMs']/1000}
                check_close(audio-engine,sum(clip['audioDeficitBudgetSeconds'].values()),'clip audio-deficit identity',clip['recalculationIssues'])
            else:clip['endpointFramesMatchActiveProfile']=False
        result['clips'].append(clip)
    (ROOT/'phase-analysis.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'status':result['status'],'checks':result['checks'],'passedChecks':result['passedChecks'],'clips':len(result['clips']),'profile':p is not None,'rows':len(p['rows']) if p else None,'recordingCount':p.get('recordingCount') if p else None,'clipRatios':[(c['name'],c['recomputed']['engineToAudioRatio'],c['recomputed']['recomputedClockGuardPassed']) for c in result['clips']]}))
if __name__=='__main__':main()
