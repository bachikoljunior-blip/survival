"""Read original observations and preserve a bounded chronology; no new execution."""
from pathlib import Path
from datetime import datetime
import json,re,hashlib
ROOT=Path(__file__).resolve().parent;path=ROOT/'original/appium.log';lines=path.read_text().splitlines()
sha=lambda b:hashlib.sha256(b).hexdigest()
records=[]
def take(label,needle,occurrence=0):
 found=[(i+1,l) for i,l in enumerate(lines) if needle in l];assert len(found)>occurrence,(label,len(found));no,text=found[occurrence];stamp=datetime.strptime(text[:23],'%Y-%m-%d %H:%M:%S:%f');record={'label':label,'line':no,'timestampUTC':stamp.isoformat(timespec='milliseconds')+'Z','originalText':text};records.append(record);return stamp
post=take('session_request','[HTTP] --> POST /session ')
take('driver_selected','Appium v3.6.0 creating new XCUITestDriver (v12.1.3) session')
take('real_device_discovery_fallback','RemoteXPC devices listing unavailable')
take('explicit_simulator','real device: false')
take('same_simulator_booted_headless','is already booted in headless mode')
take('initial_cache_probe_connection_refused','[WD Proxy] connect ECONNREFUSED')
inv=take('xcode_build_and_test_command','[Xcode] Command line invocation:')
build=take('test_build_succeeded','** TEST BUILD SUCCEEDED **')
take('test_without_building_destination_selection','WARNING: Using the first of multiple matching destinations:',1)
timeout=take('first_recorded_startup_timeout','Unable to start WebDriverAgent: Error: We were not able to retrieve the /status response')
take('driver_stops_xcode_after_timeout',"Shutting down 'xcodebuild' process")
take('build_interrupted_after_timeout','** BUILD INTERRUPTED **')
take('xcode_sigterm_after_timeout',"xcodebuild exited with code 'null' and signal 'SIGTERM'")
take('internal_second_attempt','Retrying WDA startup (2 of 2)')
take('second_xcode_invocation','[Xcode] Command line invocation:',1)
take('webdriver_final_failure','[HTTP] <-- POST /session 500')
take('workflow_stops_appium_after_failure','[Appium] Received SIGTERM - shutting down')
markers=['Test Suite','ServerURLHere','WebDriverAgent version:','wdaSessionStarted','Test Case ']
counts={mark:sum(mark in l for l in lines) for mark in markers}
errors=[{'line':i+1,'text':l} for i,l in enumerate(lines) if re.search(r'\[Xcode\].*:\d+:\d+:\s+(?:fatal )?error:',l)]
selection=json.loads((ROOT/'original/simulator-selection.json').read_text());report=json.loads((ROOT/'original/report.json').read_text())
assert selection['sdkVersion']==selection['platformVersion']=='18.5';assert selection['udid']=='22A3039C-6A45-47F4-82D4-80C58CA94379'
assert all(v==0 for v in counts.values());assert not errors
result={'status':'original failure bounded diagnosis complete','originalAppium':{'bytes':path.stat().st_size,'sha256':sha(path.read_bytes()),'lines':len(lines)},'timeline':records,'timingObservations':{'xcodeCommandToBuildSuccessSeconds':(build-inv).total_seconds(),'buildSuccessToFirstTimeoutSeconds':(timeout-build).total_seconds(),'sessionRequestToFirstTimeoutSeconds':(timeout-post).total_seconds(),'configuredWdaLaunchTimeoutMs':240000,'configuredClientSessionTimeoutMs':report['transport']['sessionRequestTimeoutMs'],'warning':'Configured status timeout is not the elapsed duration of the whole xcodebuild/session sequence; do not assign discrepancy to CPU/GPU or host load.'},'absenceChecks':{'markerCounts':counts,'compilerFatalDiagnosticMatches':errors,'connectionRefusals':sum('connect ECONNREFUSED 127.0.0.1:8100' in l for l in lines)},'observedBoundary':'WDA build succeeds; subsequent XCTest/WDA execution and HTTP readiness are not established by retained log. First explicit terminal startup condition is /status timeout; SIGTERM/build interruption are following cleanup, final ECONNREFUSED follows internal retry.','notRootCausesEstablished':['Xcode/SDK or simulator UDID mismatch','headless simulator not booted','compiler error','code-signing rejection','port conflict','app under test idle timeout','RemoteXPC tunnel requirement for this simulator','specific host CPU/GPU load or scheduling cause'],'hypothesesStillOpen':['Xcode test runner dispatch or simulator test-service startup stalled after successful build','WDA process failed or remained unavailable before HTTP listen without retained process/system diagnostics','host scheduling/resource delays or internal driver waiting behavior contributed; no resource/system trace captured'],'nextEvidence':['Exact installed appium-webdriveragent/transitive package versions; driver12.1.3 alone specifies a version range','Xcode test result/session diagnostics and simulator process/system logs for the failed launch phase','A separately prepared, installed and verified same-source WDA with documented usePreinstalledWDA may test a different launch path, but its setup and real success are not established here'],'candidateDecision':{'codeChanges':0,'reason':'No root cause supports changing current capabilities, port, headless mode, launch timeout or app idle settings. Do not convert log recommendation to a proven repair.','unimplementedAlternative':'Build/install same-source WDA and use documented simulator preinstalled launch route. Needs isolated implementation and actual CI; not added as an unvalidated capability.'},'sourceMeaning':'Appium driver12.1.3 source at1cb63dc24813a6cef0a81f70f51970e112f7a472 supports simulator preinstalled startup and separates WDA proxy creation; exact transitive WDA runtime version is absent from this retained log.','newSafariLaunches':0,'newCI':0,'newComparisons':0}
(ROOT/'diagnosis.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'timelinePoints':len(records),'timing':result['timingObservations'],'candidateChanges':0,'absenceChecks':result['absenceChecks']},ensure_ascii=False))
