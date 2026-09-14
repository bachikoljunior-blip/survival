"""Finite independent check of the nominated command interval; no full-body output."""
from pathlib import Path
import datetime, hashlib, json, re
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent
b=(ROOT/'original/appium.log').read_bytes()
assert hashlib.sha256(b).hexdigest()=='bf39c21cbc8fef21b99ffe2130bd41575730cd193bd53c03c5eb6bac4ae11261'
lines=[re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]','',s) for s in b.decode('utf8').splitlines()]
def at(n):return lines[n-1]
def stamp(line):return datetime.datetime.strptime(line[:23],'%Y-%m-%d %H:%M:%S:%f')
request,response=at(7991),at(7992)
body=json.loads(request.split('/execute/sync ',1)[1])
assert body['args']==[7,0] and "j.status!=='ready'" in body['script']
assert 'j.json.slice(arguments[1],arguments[1]+131072)' in body['script']
assert '__cinderlineIosAudioTransfer' in body['script']
match=re.search(r'/execute/sync (\d+) (\d+) ms - (\d+)$',response)
assert match and tuple(map(int,match.groups()))==(200,59329,618)
span=(stamp(response)-stamp(request)).total_seconds()*1000
assert abs(span-60377)<1e-6
assert 'mime=>{' in at(7987) and 'let destination,recorder,connected=false' in at(7987)
assert 'const rec=window.CINDERLINE.__audioRecording' in at(8020) and 'rec.recorder.stop()' in at(8020)
action_start,action_end=at(7999),at(8008)
assert '"id":"audio-street-stick"' in action_start and '/actions 200 4097 ms - 14' in action_end
assert stamp(request)<stamp(response)<stamp(action_start)<stamp(action_end)<stamp(at(8020))
pair_span=(stamp(action_end)-stamp(action_start)).total_seconds()*1000
assert abs(pair_span-4098)<1e-6
result={'status':'verified','appiumRawSha256':hashlib.sha256(b).hexdigest(),
 'smallRead':{'requestLine':7991,'responseLine':7992,'requestTimestamp':request[:23],'responseTimestamp':response[:23],
   'args':body['args'],'kind':'ready operation 7 JSON slice at offset 0','status':200,
   'loggedElapsedMs':59329,'logTimestampSpanMs':span,'responseLogSizeField':618},
 'movement':{'requestLine':7999,'responseLine':8008,'requestTimestamp':action_start[:23],
   'responseTimestamp':action_end[:23],'loggedElapsedMs':4097,'logTimestampSpanMs':pair_span},
 'recordingCreationScriptLine':7987,'recordingStopScriptLine':8020,
 'creationAndStopBodiesTruncatedInOriginalLog':True,
 'scope':'Independent exact lines/args/status and timestamp arithmetic. Ready-result read waits before movement, between recorder creation and stop in the harness sequence. Appium elapsed and log timestamp span differ; neither is renderer CPU or browser frame duration. No complete reconstruction of internal WebDriver waiting cause.'}
(HERE/'appium-boundary-result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'status':'verified','commandSpanMs':span,'loggedCommandElapsedMs':59329,'movementAfterRead':True}))
