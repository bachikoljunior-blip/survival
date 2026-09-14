#!/usr/bin/env python3
"""Read the original Appium HTTP log; do not equate HTTP elapsed with browser work."""
from collections import defaultdict
from datetime import datetime
from pathlib import Path
import hashlib,json,re

ROOT=Path(__file__).resolve().parent
def stamp(value):
    return datetime.strptime(value,'%Y-%m-%d %H:%M:%S:%f')
def main():
    raw=(ROOT/'original/appium.log').read_bytes()
    pending=defaultdict(list); commands=[]
    for number,line in enumerate(raw.decode('utf8').splitlines(),1):
        request=re.search(r'\[HTTP\] --> (\S+) (\S+)(?: (.*))?',line)
        if request:
            body=request[3] or ''; parsed=None
            if body:
                try: parsed=json.loads(body)
                except json.JSONDecodeError: pass # Appium truncates long logged bodies.
            pending[(request[1],request[2])].append({'requestLine':number,'start':line[:23],
                'method':request[1],'route':request[2],'loggedBody':body,'completeJsonBody':parsed is not None,
                'args':parsed.get('args') if isinstance(parsed,dict) else None})
        response=re.search(r'\[HTTP\] <-- (\S+) (\S+) (\d+) (\d+) ms(?: - (\d+))?',line)
        if response:
            key=(response[1],response[2]); assert pending[key], 'unmatched response'
            item=pending[key].pop(0);end=line[:23]
            item.update(responseLine=number,end=end,status=int(response[3]),appiumElapsedMs=int(response[4]),
                loggedResponseBytes=int(response[5]) if response[5] else None,
                logEndpointMs=round((stamp(end)-stamp(item['start'])).total_seconds()*1000))
            commands.append(item)
    assert not any(pending.values()), 'incomplete HTTP command'
    by_line={x['requestLine']:x for x in commands}
    selected={name:by_line[line] for name,line in [('recorderStart',7987),('startStatus',7989),
        ('startSmallReply',7991),('startTransferCleanup',7993),('preMovementSnapshot',7995),
        ('viewport',7997),('trustedStreetGesture',7999),('releaseNativeActions',8011),
        ('observeRelease',8014),('readRelease',8016),('cleanupRelease',8018),('stopRecorder',8020),
        ('stopStatus',8022),('startStreetMediaUpload',8024)]}
    small=selected['startSmallReply']; assert small['args']==[7,0] and small['loggedResponseBytes']==618
    assert 'j.json.slice' in small['loggedBody'] and 'audio-street-stick' in selected['trustedStreetGesture']['loggedBody']
    assert 'mime=>{' in selected['recorderStart']['loggedBody']
    assert 'const after=rec.state()' in selected['stopRecorder']['loggedBody']
    report=json.loads((ROOT/'original/report.json').read_bytes());capture=report['audioCapture']
    clip=capture['clips'][0]; assert clip['name']=='street-walk'
    b,a=clip['before']['state'],clip['after'];move=report['interaction']['audioStreetRelease']
    pre_ms=move['before']['wallMs']-b['wallMs'];pre_frames=move['before']['engineFrame']-b['engineFrame']
    active=[row for row in report['safariFrameWork']['rows'] if row['recording']==1 and row['recorderState']=='recording']
    assert pre_frames==sum(row['after']['engineFrame']<=move['before']['engineFrame'] for row in active)
    transfer=capture['transport'];uploads=transfer['uploads']; assert [x['id'] for x in uploads]==[8,12,16,1]
    compact=lambda item:{k:v for k,v in item.items() if k!='loggedBody'}
    result={'scope':'Actual original C38 Appium HTTP log. Logged request/response timestamps and Appium elapsed are both preserved; they differ and are not browser CPU/GPU time. Long bodies in this original log are truncated by Appium.',
        'appium':{'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'pairedCommands':len(commands),'unpairedCommands':0},
        'street':{'recordingWallMs':a['wallMs']-b['wallMs'],'recordingFrames':a['engineFrame']-b['engineFrame'],
            'beforeMovementSnapshotMs':pre_ms,'beforeMovementSnapshotFrames':pre_frames,
            'preMovementFractionOfClip':pre_ms/(a['wallMs']-b['wallMs']),
            'startStopHttpEnvelopeMs':{'minimum':round((stamp(selected['stopRecorder']['start'])-stamp(selected['recorderStart']['end'])).total_seconds()*1000),
                'maximum':round((stamp(selected['stopRecorder']['end'])-stamp(selected['recorderStart']['start'])).total_seconds()*1000)},
            'selectedCommands':{name:compact(item) for name,item in selected.items()},
            'movement':move,
            'interpretation':'The recorder is already running while its start result is read. The 618-byte HTTP reply stalls for Appium elapsed 59,329 ms (log endpoints 60,377 ms) before movement starts. 78,349 browser ms and 3,401 rendered frames precede even the movement baseline snapshot. The 92.01-second recording is therefore prolonged by the awaited automation path; the root cause of the HTTP stall remains unassigned. Street media upload starts after the stop operation, so its 36,883 ms receipt cannot cause this recording duration.'},
        'longestCommands':[compact(x) for x in sorted(commands,key=lambda item:item['appiumElapsedMs'],reverse=True)[:12]],
        'uploads':uploads,
        'uploadScope':'All four receipts are received within the unchanged 120 s/48 MiB chars/128 KiB wire route. Receipt elapsed is host receiving time, not total WebDriver operation duration. Profile JSON identity can be reconstructed; media original bytes were not recovered.',
        'candidateDecision':{'productCandidateCount':0,'adoptedChanges':0,
            'reason':'The observed world stall and one new program lack program identity, compile timings, GPU timers and host scheduling separation. The separate fixed updater maximum is nested actor work. Current material warming, light visibility and gas-cost scheduling source reads do not identify a specific responsible operation with a proven equivalent faster replacement. Lowering visual quality, increasing catch-up limits or changing recorder/clock guards is unsupported.'}}
    (ROOT/'appium-analysis.json').write_text(json.dumps(result,indent=2)+'\n')
    (ROOT/'appium-commands.json').write_text(json.dumps({'commands':commands,'unpaired':{}},indent=2)+'\n')
    print(json.dumps({'paired':len(commands),'smallReplyAppiumMs':small['appiumElapsedMs'],'smallReplyEndpointMs':small['logEndpointMs'],
        'preMovementMs':pre_ms,'preMovementFrames':pre_frames,'streetWallMs':a['wallMs']-b['wallMs']}))
if __name__=='__main__':main()
