import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {createSafariEvaluate as candidate} from './runtime/ios_audio_capture.mjs';
import {createSafariEvaluate as baseline} from './runtime/base-ios_audio_capture.mjs';
import {createSafariEvaluate as initial} from './runtime/initial-ios_audio_capture.mjs';
const tests=[];const ok=name=>tests.push(name);const KEY='__cinderlineIosAudioTransfer';
function harness(factory=candidate,{tamper,afterExecute,withUpload=false,transferKey=KEY,timeoutMs=120000,maxTransferChars=50331648}={}){
  const calls=[],receipts=[],posted=[];let activeUpload;
  const ctx=vm.createContext({window:{},setTimeout,clearTimeout,AbortController,TextEncoder,crypto:crypto.webcrypto});
  ctx.fetch=async(path,options)=>{
    assert(activeUpload);assert.equal(path,activeUpload.path);assert.equal(options.method,'POST');
    assert.equal(options.mode,'same-origin');assert.equal(options.credentials,'omit');
    assert.equal(options.redirect,'error');const h=options.headers,body=Buffer.from(options.body);
    assert.equal(Number(h['x-cinderline-offset']),activeUpload.bytes);
    assert.equal(Number(h['x-cinderline-sequence']),posted.length);
    assert(body.length<=131072);posted.push(body);activeUpload.bytes+=body.length;
    const complete=activeUpload.bytes===Number(h['x-cinderline-total']);
    if(complete){const joined=Buffer.concat(posted);assert.equal(crypto.createHash('sha256').update(joined).digest('hex'),h['x-cinderline-sha256']);activeUpload.resolve(joined.toString('utf8'));}
    return {ok:true,status:200,json:async()=>({id:activeUpload.id,sequence:posted.length-1,
      offset:activeUpload.bytes-body.length,receivedBytes:activeUpload.bytes,complete})};
  };
  const transfer=withUpload?{begin({id,chars,deadline}){
    const receipt={id,chars,deadline};receipts.push(receipt);let resolve,reject;
    const result=new Promise((a,b)=>{resolve=a;reject=b;});
    activeUpload={id,path:'/__cinderline_ios_audio_transfer/synthetic',bytes:0,resolve,reject};
    return {path:activeUpload.path,result,receipt,cancel:e=>reject(e)};
  }}:null;
  async function execute(script,args=[],commandTimeout){
    const kind=script.includes('var input = arguments[0]')?'start':script.includes('operationError:j.error')?'poll':script.includes('text:j.json.slice')?'chunk':script.includes('delete window[')?'cleanup':script.includes('startIosAudioUpload')?'upload':'progress';
    if(kind==='poll'&&tamper)tamper(ctx.window[transferKey],ctx,calls.filter(x=>x.kind==='poll').length);
    const value=await vm.runInContext(`(function(){${script}})`,ctx)(...args);
    await Promise.resolve();
    const wire=JSON.stringify({value});
    const item={kind,commandTimeout,wireBytes:Buffer.byteLength(wire),args};calls.push(item);
    if(afterExecute)afterExecute(item);
    return JSON.parse(wire).value;
  }
  return {evaluate:factory(execute,{pollMs:0,transfer,transferKey,timeoutMs,maxTransferChars}),ctx,calls,receipts,posted,
    maxWire:()=>Math.max(0,...calls.map(x=>x.wireBytes))};
}
async function rejects(name,h,fn=/inline transfer/){await assert.rejects(()=>h.evaluate(()=>null),fn);ok(name);}

const bad=job=>{job.chars=4;job.json='x'.repeat(200000);};
const old=harness(initial,{tamper:bad});await assert.rejects(()=>old.evaluate(()=>null),/inline transfer/);
assert.equal(old.maxWire(),200061);
const fixed=harness(candidate,{tamper:bad});await assert.rejects(()=>fixed.evaluate(()=>null),/inline transfer/);
assert(fixed.maxWire()<131072);assert(fixed.calls.every(x=>x.kind!=='chunk'));
ok('original bounded-wire counterexample reproduced and final candidate rejects before oversized response');

const sizes=[];
for(const n of [2,4095,4096,4097,131072,131073]){
  const h=harness();const result=await h.evaluate(n=>'x'.repeat(n-2),n);
  assert.equal(JSON.stringify(result).length,n);
  assert.equal(h.calls.filter(x=>x.kind==='chunk').length,n<=4096?0:Math.ceil(n/131072));
  assert(!h.ctx.window[KEY]);sizes.push({jsonChars:n,calls:h.calls.length,chunks:h.calls.filter(x=>x.kind==='chunk').length});
}
ok('2/4095/4096 inline boundaries and 4097/131072/131073 chunk boundaries');
const base=harness(baseline),fast=harness();const value={ready:true,channels:2,before:{frame:13}};
assert.deepEqual(await base.evaluate(x=>x,value),await fast.evaluate(x=>x,value));
assert.equal(base.calls.length-fast.calls.length,1);assert.equal(base.calls.filter(x=>x.kind==='chunk').length,1);
assert.equal(fast.calls.filter(x=>x.kind==='chunk').length,0);ok('small result removes exactly one chunk command and preserves cleanup/result');

const unicode=[{name:'astral',value:'😀'.repeat(2047)},{name:'CJK',value:'街'.repeat(4094)},
  {name:'control',value:'\u0000'.repeat(682)+'ab'},{name:'quotes',value:'"'.repeat(2047)},
  {name:'backslashes',value:'\\'.repeat(2047)},{name:'lone-surrogate',value:'\ud800'.repeat(682)+'ab'}];
const wires=[];
for(const item of unicode){const h=harness();const result=await h.evaluate(x=>x,item.value);assert.equal(result,item.value);
  assert.equal(JSON.stringify(item.value).length,4096);assert.equal(h.calls.filter(x=>x.kind==='chunk').length,0);
  assert(h.maxWire()<131072);wires.push({case:item.name,maxWireBytes:h.maxWire()});}
ok('UTF16 4096-char boundary preserves Unicode/control/quotes/backslashes/surrogates below wire bound');
for(const value of [undefined,null,false,0,'',{nested:['x',null]}]){const h=harness();assert.deepEqual(await h.evaluate(x=>x,value),value===undefined?null:value);}
ok('null/undefined/primitives/nested JSON round trip');
const errorValue={error:'payload value, not WebDriver protocol error'};assert.deepEqual(await harness().evaluate(x=>x,errorValue),errorValue);
ok('successful value.error remains data');
await assert.rejects(()=>harness().evaluate(()=>{throw new Error('original recorder reason');}),/Safari audio operation failed: original recorder reason/);
ok('page operation failure preserves original reason');
for(const [name,tamper,error] of [
 ['wrong identity',j=>j.id++,/identity changed/],
 ['missing string',j=>delete j.json,/inline transfer/],
 ['wrong type',j=>j.json={},/inline transfer/],
 ['short string',j=>j.json='x',/inline transfer/],
 ['zero chars',j=>j.chars=0,/length is invalid/],
 ['fractional chars',j=>j.chars=3.5,/length is invalid/],
 ['oversize chars',j=>j.chars=50331649,/length is invalid/]]){
 const h=harness(candidate,{tamper});await rejects(name,h,error);assert(h.maxWire()<131072);
}
const invalid=harness(candidate,{tamper:j=>{j.chars=4;j.json='oops';}});
await assert.rejects(()=>invalid.evaluate(()=>null),SyntaxError);assert(!invalid.ctx.window[KEY]);ok('same-length invalid JSON fails after original cleanup');
const bounded=harness(candidate,{maxTransferChars:16});await assert.rejects(()=>bounded.evaluate(()=>'x'.repeat(32)),/bounded capacity/);ok('existing overall char capacity remains enforced');
const custom=harness(candidate,{transferKey:'__independentOtherSlot'});const pending={id:99,status:'pending',error:'original'};custom.ctx.window[KEY]=pending;
assert.deepEqual(await custom.evaluate(()=>({x:1})),{x:1});assert.equal(custom.ctx.window[KEY],pending);ok('separate diagnostic slot does not overwrite original pending audio slot');
const prior=harness();const original={status:'pending'};prior.ctx.window[KEY]=original;
await assert.rejects(()=>prior.evaluate(()=>null),/prior iOS audio operation still pending/);assert.equal(prior.ctx.window[KEY],original);ok('prior pending operation remains unchanged');

const large=harness(candidate,{withUpload:true});const text=await large.evaluate(()=>'x'.repeat(300000));
assert.equal(text.length,300000);assert.equal(large.receipts.length,1);assert.equal(large.posted.length,3);
assert.equal(large.calls.filter(x=>x.kind==='chunk').length,0);assert(!large.ctx.window[KEY]);
assert(large.maxWire()<131072);ok('large result retains actual serialized upload function, digest/acks and three bounded POST chunks');
const mid=harness(candidate,{withUpload:true});await mid.evaluate(()=>'x'.repeat(4095));
assert.equal(mid.receipts.length,0);assert.equal(mid.calls.filter(x=>x.kind==='chunk').length,1);ok('mid-size reply retains WebDriver chunk route when upload is available');

const realNow=Date.now;let fakeNow=1000000;
try{
 Date.now=()=>fakeNow;
 const timed=harness(candidate,{afterExecute:item=>{if(item.kind==='start')fakeNow+=119999;}});
 await timed.evaluate(()=>null);assert.deepEqual(timed.calls.map(x=>x.commandTimeout),[90000,1,1]);
 ok('remaining 120s operation budget and 90s per-command cap apply to inline route');
 fakeNow=1000000;
 const expired=harness(candidate,{afterExecute:item=>{if(item.kind==='poll')fakeNow+=120000;}});
 await assert.rejects(()=>expired.evaluate(()=>null),/operation deadline expired/);
 assert.equal(expired.calls.filter(x=>x.kind==='cleanup').length,0);ok('expiry after ready poll rejects before another command');
}finally{Date.now=realNow;}

const helper=fs.readFileSync(new URL('../candidate/tools/ios_audio_capture.mjs',import.meta.url));
const hash=crypto.createHash('sha256').update(helper).digest('hex');
assert.equal(hash,'e4f36959ec83f4d4112bda7be27e081ba0e721ee27784705a21a59c4c31d0262');
assert(helper.equals(fs.readFileSync(new URL('runtime/ios_audio_capture.mjs',import.meta.url))));
const out={status:'passed',independentChecks:tests.length,checks:tests,candidateSha256:hash,
 originalCounterexampleWireBytes:old.maxWire(),finalCounterexampleWireBytes:fixed.maxWire(),
 boundaries:sizes,unicodeWireBytes:wires,largeUpload:{bytes:Buffer.concat(large.posted).length,chunks:large.posted.length,maxResponseWireBytes:large.maxWire()},
 scope:'Actual helper functions in Node with isolated VM page and JSON-serialized WebDriver replies; large path uses actual serialized upload function, crypto and synthetic same-origin fetch acknowledgements. No Safari, external HTTP, CI or real latency measurement.'};
fs.writeFileSync(new URL('edge-results.json',import.meta.url),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({status:out.status,independentChecks:tests.length,oldCounterexampleBytes:out.originalCounterexampleWireBytes,finalCounterexampleBytes:out.finalCounterexampleWireBytes}));
