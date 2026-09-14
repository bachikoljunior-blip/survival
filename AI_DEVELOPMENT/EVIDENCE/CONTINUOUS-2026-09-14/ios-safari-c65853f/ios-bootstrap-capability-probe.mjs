// CPU-only proof of the actual outgoing new-session capability body.
// fetch, HTTP-server creation and output writes are stubbed. No browser,
// Appium server, simulator, network request or game is launched.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const repo=fileURLToPath(new URL('./survival/',import.meta.url));
const target='tools/test-ios-safari.mjs',baseline='c65853f105bc192fae9d952d7e73eba62870dfcb';
const hash=b=>createHash('sha256').update(b).digest('hex');
const sources={baseline:execFileSync('git',['show',baseline+':'+target],{cwd:repo}),current:fs.readFileSync(path.join(repo,target))};
const runs=[];
for(const [name,bytes] of Object.entries(sources)){
  const requests=[],writes={};let exitCode=0;
  const source=bytes.toString().replace(/^#![^\n]*\n/,'').replace(/^import\s[\s\S]*?;\n/gm,'')
    .replaceAll('import.meta.url',JSON.stringify(new URL('./survival/'+target,import.meta.url).href));
  const scope={...path,fileURLToPath,URL,Buffer,
    createServer:()=>{throw Error('No server may be started in CPU fixture');},
    mkdirSync:()=>{},readFileSync:()=>{throw Error('Unexpected file read');},writeFileSync:(p,b)=>{writes[p]=b;},
    process:{env:{IOS_SIMULATOR_UDID:'CPU-ONLY-UDID',IOS_SIMULATOR_PLATFORM_VERSION:'26.2',CINDERLINE_TEST_URL:'http://cpu-only.invalid/never-requested',APPIUM_URL:'http://cpu-only-appium.invalid/'},exit:n=>{exitCode=n;}},
    console:{log:()=>{},error:()=>{}},
    fetch:async(url,options={})=>{
      requests.push({url:String(url),...options});
      if(options.method==='POST')return {ok:false,status:500,text:async()=>JSON.stringify({value:{error:'session not created',message:'CPU_STOP_BEFORE_BROWSER_SESSION'}})};
      return {ok:true,status:200,text:async()=>JSON.stringify({value:{ready:true}})};
    },
  };
  await vm.runInNewContext('(async()=>{'+source+'})()',scope,{filename:target});
  const post=requests.filter(r=>r.method==='POST');assert.equal(post.length,1);assert(post[0].url.endsWith('/session'));
  const body=JSON.parse(post[0].body),report=JSON.parse(writes[path.join(repo,'test-results/ios-safari/report.json')]);
  assert.equal(report.status,'failed');assert.equal(report.checks.length,0);assert.equal(exitCode,1);
  assert(report.failures.some(s=>s.includes('CPU_STOP_BEFORE_BROWSER_SESSION')));
  runs.push({name,sourceSha256:hash(bytes),requests,body,exitCode,report});
}
const before=runs[0].body.capabilities.alwaysMatch,after=runs[1].body.capabilities.alwaysMatch;
assert.equal(Object.hasOwn(before,'appium:isHeadless'),false);assert.equal(after['appium:isHeadless'],true);
const withoutHeadless={...after};delete withoutHeadless['appium:isHeadless'];assert.deepEqual(withoutHeadless,before);
assert.equal(hash(fs.readFileSync(path.join(repo,target))),hash(sources.current),'Source changed during probe');
const result={checkedAt:new Date().toISOString(),scope:'Actual baseline/current gate body at mocked external boundaries. Source import declarations removed only for dependency injection. Both runs deliberately reject new-session creation before any device action. This does not test the Appium implementation or simulator behavior.',baseline,target,
  checks:{onlyCapabilityDifferenceIsBooleanTrueHeadless:true,bodySentAtActualSessionEndpoint:true,sessionFailureStillExitsNonzero:true,noGameChecksExecuted:true},runs};
fs.writeFileSync(new URL('./ios-bootstrap-capability-probe.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({checks:result.checks,currentSha256:runs[1].sourceSha256}));
