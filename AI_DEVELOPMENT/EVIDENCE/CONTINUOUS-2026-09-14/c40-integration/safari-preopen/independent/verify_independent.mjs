import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,execFile} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,chmodSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),fx=join(root,'fixture');
const candidate=readFileSync(join(fx,'tools/test-ios-safari.mjs'),'utf8');
const base=readFileSync(join(root,'base/tools/test-ios-safari.mjs'),'utf8');
const cases=[],checks=[];const check=(name,fn)=>{fn();checks.push({name,passed:true});};
const hash=b=>createHash('sha256').update(b).digest('hex');
check('exact independently pinned candidate and canonical base',()=>{
 assert.equal(hash(candidate),'a278b87f0fb2e15b843205b6fe211a8046f72463e2f29956bfbf867f5900adee');
 assert.equal(hash(base),'12490ace8e7a7344dc7e2bf5aa316b499b68e6ca4f222bbcb03b2eb9c07eceae');
});
const bin=join(fx,'bin');mkdirSync(bin,{recursive:true});
writeFileSync(join(bin,'xcrun'),'#!/usr/bin/env node\n'+String.raw`
const fs=require('node:fs'),http=require('node:http');
const args=process.argv.slice(2),mode=process.env.PREOPEN_REVIEW_MODE;
fs.writeFileSync(process.env.PREOPEN_REVIEW_RECEIPT,JSON.stringify({args,done:false,pid:process.pid}));
if(mode==='exit7'){process.stdout.write('original stdout');process.stderr.write('original reason\nsecond line');process.exitCode=7;}
else if(mode==='signal'){process.kill(process.pid,'SIGKILL');}
else if(mode==='unicode-overflow'){process.stdout.write('界'.repeat(90000));setInterval(()=>{},1000);}
else if(mode==='escaped-bound'){process.stdout.write('\u0000'.repeat(65535));process.stderr.write('\u0000'.repeat(65535));process.exitCode=7;}
else http.get(args[3],r=>{const chunks=[];r.on('data',x=>chunks.push(x));r.on('end',()=>{
fs.writeFileSync(process.env.PREOPEN_REVIEW_RECEIPT,JSON.stringify({args,done:true,status:r.statusCode,headers:r.headers,body:Buffer.concat(chunks).toString()}));
process.stdout.write('preopen fixture completed');});}).on('error',e=>{process.stderr.write(e.message);process.exitCode=9;});
`);chmodSync(join(bin,'xcrun'),0o755);
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r(`http://127.0.0.1:${s.address().port}/`)));
const close=s=>new Promise(r=>s.close(r));
const udid='independent UDID ; literal';
for(const mode of ['local-audio','wrong-url','missing-marker','exit7','signal','unicode-overflow','external','external-audio']){
 const output=join(fx,'out-'+mode),receipt=join(fx,mode+'-child.json'),seen=[];let bootstrap=null,origin=null,caps;
 const external=mode.startsWith('external'),audio=mode==='local-audio'||mode==='external-audio';
 const target=createServer((req,res)=>res.end('<!doctype html>external synthetic fixture'));
 const targetUrl=external?await listen(target):'';
 const appium=createServer(async(req,res)=>{
  const pieces=[];for await(const p of req)pieces.push(p);const body=pieces.length?JSON.parse(Buffer.concat(pieces).toString()):null;
  seen.push({method:req.method,path:req.url,body});
  const reply=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify({value}));};
  const fail=message=>reply({error:'unknown error',message},500);
  if(req.url==='/status')return reply({ready:true});
  if(req.url==='/session'){
   caps=body.capabilities.alwaysMatch;
   if(!external){const child=JSON.parse(readFileSync(receipt));assert(child.done);bootstrap=child.args[3];origin=new URL('/',bootstrap).href;}
   return reply({sessionId:'independent-session'});
  }
  if(req.method==='DELETE'&&req.url==='/session/independent-session')return reply(null);
  if(req.url.endsWith('/execute/sync')){
   if(body.script.includes('ios-safari-bootstrap'))return reply({url:mode==='wrong-url'?bootstrap+'?different':bootstrap,ready:mode!=='missing-marker'});
   return reply({syntheticFailureProbe:true});
  }
  if(req.url.endsWith('/orientation'))return fail('independent stop after startup verification; no product exercised');
  if(req.url.endsWith('/screenshot'))return fail('independent screenshot unavailable');
  return fail('unexpected route '+req.url);
 });
 const appiumUrl=await listen(appium);
 const child=spawn(process.execPath,[join(fx,'tools/test-ios-safari.mjs')],{cwd:fx,env:{...process.env,
  PATH:bin+':'+process.env.PATH,APPIUM_URL:appiumUrl,IOS_SIMULATOR_UDID:udid,
  IOS_SIMULATOR_PLATFORM_VERSION:'synthetic',CINDERLINE_IOS_OUTPUT:output,CINDERLINE_IOS_AUDIO_CAPTURE:audio?'1':'0',
  CINDERLINE_TEST_URL:targetUrl,PREOPEN_REVIEW_MODE:mode,PREOPEN_REVIEW_RECEIPT:receipt},stdio:['ignore','pipe','pipe']});
 const stdout=[],stderr=[];child.stdout.on('data',x=>stdout.push(x));child.stderr.on('data',x=>stderr.push(x));
 const timer=setTimeout(()=>child.kill('SIGKILL'),15000);
 const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',(code,signal)=>resolve({code,signal}));});clearTimeout(timer);
 await close(appium);if(external)await close(target);
 const rawOut=Buffer.concat(stdout),out=rawOut.toString(),report=JSON.parse(readFileSync(join(output,'report.json')));
 const marker=out.split('\n').filter(x=>x.startsWith('[ios-safari-startup] '));
 check(mode+': real harness fails at intentional boundary and emits one exact startup record when initialized',()=>{
  assert.equal(exit.code,1);assert.equal(report.status,'failed');assert.equal(report.checks.length,0);
  assert.equal(marker.length,mode==='external-audio'?0:1);
  if(marker.length)assert.deepEqual(JSON.parse(marker[0].slice('[ios-safari-startup] '.length)),report.safariStartup);
 });
 if(external){
  check(mode+': external does not spawn preopen; audio external rejected before session',()=>{
   assert(!existsSync(receipt));assert.equal(seen.filter(x=>x.path==='/session').length,mode==='external-audio'?0:1);
   if(mode==='external-audio')assert(report.failures[0].includes('requires the existing harness DIST server'));
  });
 }else{
  const opened=JSON.parse(readFileSync(receipt));
  check(mode+': one literal shell-free argument vector and owned loopback URL',()=>{
   assert.deepEqual(opened.args.slice(0,3),['simctl','openurl',udid]);const u=new URL(opened.args[3]);
   assert.equal(u.hostname,'127.0.0.1');assert.equal(u.protocol,'http:');assert.equal(u.pathname,'/__ios_safari_bootstrap__.html');
   assert.equal(report.safariStartup.openUrl.attempts,1);
  });
  if(['exit7','signal','unicode-overflow'].includes(mode)){
   check(mode+': actual child failure blocks session and preserves primary diagnostic',()=>{
    assert.equal(seen.filter(x=>x.path==='/session').length,0);assert.equal(report.safariStartup.openUrl.status,'failed');
    assert(report.failures[0].includes('Safari bootstrap openurl failed:'));
    if(mode==='exit7'){assert.equal(report.safariStartup.openUrl.code,7);assert.equal(report.safariStartup.openUrl.stdout,'original stdout');assert.equal(report.safariStartup.openUrl.stderr,'original reason\nsecond line');}
    if(mode==='signal')assert.equal(report.safariStartup.openUrl.signal,'SIGKILL');
    if(mode==='unicode-overflow')assert.equal(report.safariStartup.openUrl.code,'ERR_CHILD_PROCESS_STDIO_MAXBUFFER');
   });
  }else{
   check(mode+': real HTTP document, preopen completion, noReset and unchanged session limits',()=>{
    assert(opened.done);assert.equal(opened.status,200);assert(!/<script\b/i.test(opened.body));
    assert(opened.body.includes('id="ios-safari-bootstrap"'));assert.equal(opened.headers['cache-control'],'no-store');
    assert.equal(caps['appium:noReset'],true);assert(!('appium:initialDeeplinkUrl'in caps));assert(!('appium:forceAppLaunch'in caps));
    assert.equal(caps['appium:wdaLaunchTimeout'],240000);assert.equal(report.transport.sessionRequestTimeoutMs,900000);
    assert.equal(report.transport.commandRequestTimeoutMs,90000);
   });
   check(mode+': exact URL and marker precede product/orientation and session cleanup remains',()=>{
    assert.equal(report.safariStartup.verified,mode==='local-audio');
    const orientations=seen.filter(x=>x.path.endsWith('/orientation'));assert.equal(orientations.length,mode==='local-audio'?1:0);
    assert.equal(seen.filter(x=>x.method==='DELETE').length,1);
    if(mode!=='local-audio')assert(report.failures[0].includes('Safari session bootstrap mismatch:'));
   });
   if(audio)check(mode+': real original pins and not-started capture state retained',()=>{
    assert.equal(report.audioCapture.status,'not started');assert.equal(report.audioCapture.clips.length,0);
    assert.equal(report.audioCapture.provenance.bundleSha256,'8c5624edd96ba238135e46c90e53c6221b3c3303b977bb5d4e41b752264d94f0');
    assert.equal(report.audioCapture.provenance.harnessSha256,hash(candidate));
    assert.equal(report.audioCapture.provenance.actualRecorderBlob,'785541d3beaed0e35e8bcf042973eabb7bdb5d6c');
   });
  }
  await assert.rejects(()=>fetch(new URL('/',opened.args[3]),{signal:AbortSignal.timeout(1000)}));
 }
 cases.push({mode,exit,requestCount:seen.length,sessionCount:seen.filter(x=>x.path==='/session').length,
  reportStatus:report.status,startup:report.safariStartup,markerBytes:marker.length?Buffer.byteLength(marker[0]):0,
  markerLines:marker.length,processStdoutBytes:rawOut.length,processStderrBytes:Buffer.concat(stderr).length});
}
const start=candidate.indexOf('  if (bootstrapUrl) {',candidate.indexOf("await waitForHttp(new URL('status'"));
const end=candidate.indexOf("  const created = await webdriver('session'",start);
const run=new Function('execFile','bootstrapUrl','UDID','report','return (async()=>{'+candidate.slice(start,end)+'})();');
for(const code of ['ENOENT','timeout']){
 const error=Object.assign(new Error('independent '+code),code==='timeout'?{code:null,signal:'SIGKILL',killed:true}:{code});
 const report={safariStartup:{}};let caught;
 try{await run((command,args,options,callback)=>{
  assert.equal(command,'xcrun');assert.deepEqual(options,{timeout:90000,maxBuffer:65536,killSignal:'SIGKILL'});
  callback(error,'stdout original','stderr original');
 },'http://127.0.0.1:12345/__ios_safari_bootstrap__.html',udid,report);}catch(e){caught=e;}
 check(code+': original cause and configured timer/output/kill bounds retained',()=>{
  assert.equal(caught.cause,error);assert(caught.message.includes(error.message));assert.equal(report.safariStartup.openUrl.status,'failed');
 });
}
check('all product/clock/release/lifecycle/cleanup bytes and owned server unchanged',()=>{
 const anchor="  await webdriver(sessionPath('/orientation')",finish='console.log(`[ios-safari] ';
 assert.equal(candidate.slice(candidate.indexOf(anchor),candidate.indexOf(finish)),base.slice(base.indexOf(anchor),base.indexOf(finish)));
 const server=s=>s.slice(s.indexOf('function startServer()'),s.indexOf('async function waitForHttp'));
 assert.equal(server(candidate),server(base));assert.equal((candidate.match(/execFile\(/g)||[]).length,1);
});
const result={status:'passed',checks:checks.length,checksPassed:checks,cases,node:process.version,
 scope:'Independent exact harness; actual local child processes and HTTP, synthetic xcrun/Appium replies. Successful startup scenarios intentionally stop before product execution. Timeout callback/config is synthetic; no 90-second macOS/Safari test.',
 candidateSha256:hash(candidate),actualSafariMeasured:false,remoteWrites:0,newCi:0,reruns:0,productChanges:0};
writeFileSync(join(root,'verification-result.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({checks:checks.length,cases:cases.length,status:'passed',markerBytes:cases.map(x=>[x.mode,x.markerBytes])}));
