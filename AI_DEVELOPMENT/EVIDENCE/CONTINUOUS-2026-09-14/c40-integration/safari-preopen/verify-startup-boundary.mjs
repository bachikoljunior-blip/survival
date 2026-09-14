import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)), source=readFileSync(resolve(root,'candidate/tools/test-ios-safari.mjs'),'utf8'), baseline=readFileSync(resolve(root,'../c39-safari-original-results-ultra/authority/tools/test-ios-safari.mjs'),'utf8');
const sha=s=>createHash('sha256').update(s).digest('hex'), checks=[];
const check=(name,fn)=>{fn();checks.push(name);};
const start=source.indexOf('  if (bootstrapUrl) {',source.indexOf("await waitForHttp(new URL('status'"));
const end=source.indexOf("  const created = await webdriver('session'",start);
assert(start>0&&end>start);
const run=new Function('execFile','bootstrapUrl','UDID','report','return (async()=>{'+source.slice(start,end)+'})();');
const url='http://127.0.0.1:12345/__ios_safari_bootstrap__.html', udid='synthetic arg with spaces; literal';
for(const kind of ['success','ENOENT','timeout']) {
 const report={safariStartup:{}},calls=[];
 const error=kind==='success'?null:Object.assign(new Error(kind+' original diagnostic'),kind==='ENOENT'?{code:'ENOENT'}:{code:null,killed:true,signal:'SIGKILL'});
 let failure;
 try {await run((command,args,options,cb)=>{calls.push({command,args,options});cb(error,'fixture stdout','fixture stderr');},url,udid,report);}
 catch(e){failure=e;}
 check(kind+': exact shell-free command, argument vector and bounded original timeout',()=>{
  assert.equal(calls.length,1);assert.equal(calls[0].command,'xcrun');assert.deepEqual(calls[0].args,['simctl','openurl',udid,url]);
  assert.deepEqual(calls[0].options,{timeout:90000,maxBuffer:65536,killSignal:'SIGKILL'});
 });
 check(kind+': one result, complete original diagnostics and first failure preserved',()=>{
  assert.equal(report.safariStartup.openUrl.attempts,1);assert.equal(report.safariStartup.openUrl.stdout,'fixture stdout');assert.equal(report.safariStartup.openUrl.stderr,'fixture stderr');
  if(error){assert.equal(failure.cause,error);assert(failure.message.includes(error.message));assert.equal(report.safariStartup.openUrl.status,'failed');}
  else{assert.equal(failure,undefined);assert.equal(report.safariStartup.openUrl.status,'passed');}
 });
}
let externalCalls=0;await run(()=>externalCalls++,null,udid,{safariStartup:{}});
check('external mode never calls openurl',()=>assert.equal(externalCalls,0));
const orientation="  await webdriver(sessionPath('/orientation')";
const summary="console.log(`[ios-safari] ";
check('orientation through all product, clocks, audio, release, lifecycle and cleanup code is byte-identical',()=>assert.equal(source.slice(source.indexOf(orientation),source.indexOf(summary)),baseline.slice(baseline.indexOf(orientation),baseline.indexOf(summary))));
check('entire owned HTTP server and transfer routing is byte-identical',()=>assert.equal(source.slice(source.indexOf('function startServer()'),source.indexOf('function waitForHttp')),baseline.slice(baseline.indexOf('function startServer()'),baseline.indexOf('function waitForHttp'))));
check('bootstrap exact URL and marker guard retained verbatim',()=>{
 const a=baseline.indexOf('  if (bootstrapUrl) {',baseline.indexOf('  sessionId ='));
 const b=source.indexOf('  if (bootstrapUrl) {',source.indexOf('  sessionId ='));
 assert.equal(source.slice(b,source.indexOf(orientation)),baseline.slice(a,baseline.indexOf(orientation)));
});
check('only pre-session simctl command; no custom retry, webdriver limit or device reset introduced',()=>{
 assert.equal((source.match(/execFile\(/g)||[]).length,1);
 for(const token of ['const SESSION_REQUEST_TIMEOUT = 900000;',"'appium:wdaLaunchTimeout': 240000,","'appium:newCommandTimeout': 300,","'appium:noReset': true,"])assert(source.includes(token));
 for(const cap of ['appium:initialDeeplinkUrl','appium:forceAppLaunch','appium:webviewConnectTimeout','appium:webviewConnectRetries'])assert(!source.includes(cap));
});
const official=readFileSync(resolve(root,'official-source/node-simctl-v9.0.0/lib/subcommands/openurl.ts'),'utf8');
const body=official.slice(official.indexOf("  return await this.exec('openurl'"),official.lastIndexOf('}'));
const open=new Function('return async function(url){'+body+'};')();
let invoked;await open.call({requireUdid:command=>{assert.equal(command,'openurl');return udid;},exec:(command,opts)=>{invoked={command,opts};return {code:0};}},url);
check('official node-simctl v9 openUrl body yields identical simctl openurl argument order',()=>assert.deepEqual(invoked,{command:'openurl',opts:{args:[udid,url]}}));
const out={status:'passed',candidateSha256:sha(source),checks,finiteChecks:checks.length,limits:'Extracted actual harness block and actual official source body. Stub callbacks test failure propagation and configured limits, not elapsed 90-second macOS behavior or actual Safari startup.'};
writeFileSync(resolve(root,'startup-boundary-verification.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({status:out.status,finiteChecks:checks.length,candidateSha256:out.candidateSha256}));
