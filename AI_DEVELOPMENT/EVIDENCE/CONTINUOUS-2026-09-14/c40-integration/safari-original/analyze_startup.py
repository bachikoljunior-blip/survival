from pathlib import Path
import json,hashlib,re
P=Path(__file__).resolve().parent
rows=[]
for role in ['source','pr','standalone']:
 f=P/'original'/role/'appium.log'; lines=f.read_text().splitlines()
 capline=next((i+1,l) for i,l in enumerate(lines) if '[HTTP] --> POST /session ' in l)
 caps=json.loads(capline[1].split('[HTTP] --> POST /session ',1)[1])['capabilities']['alwaysMatch']
 url=caps['appium:initialDeeplinkUrl'];assert re.fullmatch(r'http://127\.0\.0\.1:\d+/__ios_safari_bootstrap__\.html',url)
 assert caps['appium:forceAppLaunch'] is True and caps['appium:noReset'] is True and caps['appium:wdaLaunchTimeout']==240000
 needles={'wdaListening':'ServerURLHere->','deeplinkAccepted':'The deeplink URL will be set to ',
 'firstSessionFailure':'Got response with status 500:','retryLaunch':"Selected 'simulator' WebDriverAgent startup strategy",'retryInterrupted':'** BUILD INTERRUPTED **','lastConnectionRefusal':'connect ECONNREFUSED 127.0.0.1:8100','outerSessionFailure':'[HTTP] <-- POST /session 500'}
 events={}
 for key,needle in needles.items():
  found=[{'line':i+1,'text':l} for i,l in enumerate(lines) if needle in l]; assert found,(role,key)
  events[key]=found[-1] if key in ['retryLaunch','lastConnectionRefusal'] else found[0]
 assert 'Cannot launch com.apple.mobilesafari application' in events['firstSessionFailure']['text']
 assert events['wdaListening']['line']<events['deeplinkAccepted']['line']<events['firstSessionFailure']['line']<events['retryLaunch']['line']<events['retryInterrupted']['line']<events['lastConnectionRefusal']['line']<events['outerSessionFailure']['line']
 assert not any('connectToRemoteDebugger' in l or 'remote debugger did not return' in l for l in lines)
 rows.append({'role':role,'appiumPath':str(f.relative_to(P)),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'inputCapabilities':caps,'inputCapabilityLine':capline[0],'events':events,'firstFailure':'WDA initial URL launch returned session not created because MobileSafari was not running','outerFailure':'driver retry subsequently could not connect to restarted WDA port 8100','bootstrapVerified':False,'productReached':False,'webInspectorReached':False})
out={'status':'three-causal-orders-verified','results':rows,'officialInference':'WDA v16.1.0 FBSessionCommands.m launchApplication returns Cannot launch only after openDeepLink returned without an error and app.running is false. XCUIDevice+FBHelpers delegates explicit application URL to FBXCTestDaemonsProxy, which returns the XCTest daemon completion result. Thus this is a reported successful URL-open completion followed by running=false, not evidence establishing whether Safari crashed or its state lagged.','causeNotIdentified':['MobileSafari crash versus delayed/stale state observation','OS-level cause of URL-open completion and application-state disagreement'],'repairClaimed':False}
(P/'startup-analysis.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':out['status'],'rawFiles':len(rows),'firstFailure':'Cannot launch MobileSafari','outerFailure':'ECONNREFUSED after retry'}))
