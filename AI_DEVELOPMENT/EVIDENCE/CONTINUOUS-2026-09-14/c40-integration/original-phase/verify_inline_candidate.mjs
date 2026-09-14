import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root=dirname(fileURLToPath(import.meta.url));
const base=readFileSync(join(root,'current-source/tools/ios_audio_capture.mjs'),'utf8');
const candidate=readFileSync(join(root,'candidate/tools/ios_audio_capture.mjs'),'utf8');
const results=[];
async function test(name,body){await body();results.push({name,passed:true});}
function createHarness(source,{mutate,transfer=false,chunkDelayMs=0,cleanupError=null}={}){
  const clock={now:100000};const commands=[],wire=[];
  const page=vm.createContext({window:{}});let uploadJson=null,beginCalls=0;
  const bridge=transfer?{begin({id,chars}){
    beginCalls++;uploadJson=page.window.__cinderlineIosAudioTransfer.json;
    assert.equal(uploadJson.length,chars);
    return {path:'/fake-existing-upload',result:Promise.resolve(uploadJson),receipt:{},cancel(){throw Error('unexpected cancellation');}};
  }}:null;
  const startIosAudioUpload=function ({key,id}) {window[key].upload={status:'complete'};return {id};};
  const context=vm.createContext({Date:{now:()=>clock.now},delay:async ms=>{clock.now+=ms;},
    TRANSFER_KEY:'__cinderlineIosAudioTransfer',CHUNK_CHARS:131072,INLINE_JSON_CHARS:4096,
    MAX_TRANSFER_CHARS:48*1024*1024,IOS_TRANSFER_CHUNK_BYTES:131072,startIosAudioUpload});
  const begin=source.indexOf('export function createSafariEvaluate('),end=source.indexOf('// Inspect only',begin);
  assert(begin>=0&&end>begin);
  const factory=vm.runInContext(source.slice(begin,end).replace('export function','function')+'\ncreateSafariEvaluate;',context);
  async function execute(script,args,timeout){
    assert(timeout>0&&timeout<=90000);
    const kind=script.includes('Promise.resolve().then')?'start':script.includes('j.json.slice')?'chunk':
      script.includes('delete window')?'cleanup':script.includes('operationError:j.error')?'poll':
      script.includes('upload:j.upload')?'progress':'upload';
    commands.push({kind,timeout});
    if(mutate)await mutate({kind:kind+':before',clock,page,commands});
    if(kind==='chunk')clock.now+=chunkDelayMs;
    if(kind==='cleanup'&&cleanupError)throw new Error(cleanupError);
    page.__args=args;
    let value=vm.runInContext('(function(){'+script+'}).apply(null,__args)',page);
    await Promise.resolve();await Promise.resolve();
    // WebDriver serializes the captured result; clone it across the VM boundary.
    value=JSON.parse(JSON.stringify({value})).value;
    wire.push({kind,bytes:Buffer.byteLength(JSON.stringify({value}))});
    if(mutate)value=await mutate({kind,value,clock,page,commands});
    return value;
  }
  const evaluate=factory(execute,{pollMs:0,transfer:bridge});
  return {evaluate:async(...args)=>JSON.parse(JSON.stringify(await evaluate(...args))),commands,wire,clock,page,get beginCalls(){return beginCalls;}};
}
const valueFn=value=>new Function('return '+JSON.stringify(value)+';');
const kinds=h=>h.commands.map(x=>x.kind);

await test('original small-reply delay is removed as one modeled command, with equal value',async()=>{
  const input={state:{wallMs:65447,engineFrame:2696},mime:'video/mp4'};
  const old=createHarness(base,{chunkDelayMs:60377}),fresh=createHarness(candidate,{chunkDelayMs:60377});
  assert.deepEqual(await old.evaluate(valueFn(input)),input);assert.deepEqual(await fresh.evaluate(valueFn(input)),input);
  assert.deepEqual(kinds(old),['start','poll','chunk','cleanup']);assert.deepEqual(kinds(fresh),['start','poll','cleanup']);
  assert.equal(old.clock.now-fresh.clock.now,60377);
});
for(const [label,value] of [['null',null],['boolean',false],['zero',0],['empty string',''],['Japanese','日本語'],['surrogate','\ud800']]){
  await test('small exact value '+label,async()=>{const h=createHarness(candidate);assert.deepEqual(await h.evaluate(valueFn(value)),value);assert.equal(kinds(h).includes('chunk'),false);assert.equal(h.page.window.__cinderlineIosAudioTransfer,undefined);});
}
await test('undefined retains original JSON null result',async()=>{const h=createHarness(candidate);assert.equal(await h.evaluate(()=>undefined),null);});
await test('4096 chars inline, including UTF-8 wire bound',async()=>{
  const value='界'.repeat(4094),h=createHarness(candidate);assert.equal(JSON.stringify(value).length,4096);
  assert.equal(await h.evaluate(valueFn(value)),value);assert(!kinds(h).includes('chunk'));
  assert(h.wire.every(x=>x.bytes<131072));
});
await test('escaped small JSON wire bound',async()=>{
  const value='\u0000\\"'.repeat(400),h=createHarness(candidate);assert(JSON.stringify(value).length<=4096);
  assert.equal(await h.evaluate(valueFn(value)),value);assert(h.wire.every(x=>x.bytes<131072));
});
await test('4097 chars keeps original chunk route',async()=>{
  const value='x'.repeat(4095),h=createHarness(candidate);assert.equal(JSON.stringify(value).length,4097);
  assert.equal(await h.evaluate(valueFn(value)),value);assert.deepEqual(kinds(h),['start','poll','chunk','cleanup']);
});
await test('large result keeps existing upload launch/progress/cleanup route',async()=>{
  const value='x'.repeat(131072),h=createHarness(candidate,{transfer:true});
  assert.equal(await h.evaluate(valueFn(value)),value);assert.equal(h.beginCalls,1);
  assert.deepEqual(kinds(h),['start','poll','upload','progress','cleanup']);
});
await test('small value never starts host upload',async()=>{const h=createHarness(candidate,{transfer:true});assert.equal(await h.evaluate(()=>42),42);assert.equal(h.beginCalls,0);});
for(const [label,alter,error] of [
  ['missing',v=>{delete v.inlineJson;},/inline transfer is missing or truncated/],
  ['short',v=>{v.inlineJson=v.inlineJson.slice(1);},/inline transfer is missing or truncated/],
  ['extra',v=>{v.inlineJson+='x';},/inline transfer is missing or truncated/],
  ['wrong type',v=>{v.inlineJson={};},/inline transfer is missing or truncated/],
  ['wrong id',v=>{v.id++;},/identity changed/],
  ['zero length',v=>{v.chars=0;},/length is invalid/],
  ['overflow length',v=>{v.chars=48*1024*1024+1;},/length is invalid/],
  ['fraction length',v=>{v.chars=2.5;},/length is invalid/],
])await test('reject '+label+' status payload',async()=>{
  const h=createHarness(candidate,{mutate:({kind,value})=>{if(kind==='poll')alter(value);return value;}});
  await assert.rejects(()=>h.evaluate(()=>42),error);assert(!kinds(h).includes('chunk'));
});
await test('failed operation retains original reason',async()=>{const h=createHarness(candidate);await assert.rejects(()=>h.evaluate(()=>{throw Error('primary failure');}),/Safari audio operation failed: primary failure/);});
await test('corrupt page length cannot send oversized inline bytes before rejection',async()=>{
  const h=createHarness(candidate,{mutate:({kind,value,page})=>{
    if(kind==='poll:before'){const job=page.window.__cinderlineIosAudioTransfer;job.chars=4;job.json='x'.repeat(200000);}
    return value;
  }});
  await assert.rejects(()=>h.evaluate(()=>42),/inline transfer is missing or truncated/);
  assert(h.wire.every(x=>x.bytes<131072));
});
await test('deadline before first poll remains enforced',async()=>{
  const h=createHarness(candidate,{mutate:({kind,value,clock})=>{if(kind==='start')clock.now+=120000;return value;}});
  await assert.rejects(()=>h.evaluate(()=>42),/operation deadline expired/);assert.deepEqual(kinds(h),['start']);
});
await test('deadline after ready inline remains enforced before cleanup',async()=>{
  const h=createHarness(candidate,{mutate:({kind,value,clock})=>{if(kind==='poll')clock.now+=120000;return value;}});
  await assert.rejects(()=>h.evaluate(()=>42),/operation deadline expired/);assert.deepEqual(kinds(h),['start','poll']);
});
await test('cleanup failure remains failure after exact inline result',async()=>{const h=createHarness(candidate,{cleanupError:'cleanup refused'});await assert.rejects(()=>h.evaluate(()=>42),/cleanup refused/);});
await test('invalid inline JSON is rejected after same cleanup ordering',async()=>{
  const h=createHarness(candidate,{mutate:({kind,value})=>{if(kind==='poll')value.inlineJson='xx';return value;}});
  await assert.rejects(()=>h.evaluate(()=>42),/Unexpected token/);assert.deepEqual(kinds(h),['start','poll','cleanup']);
});
await test('concurrent evaluate rejection and later reuse preserved',async()=>{
  const h=createHarness(candidate);const first=h.evaluate(()=>42);
  await assert.rejects(()=>h.evaluate(()=>43),/Concurrent Safari audio evaluation/);
  assert.equal(await first,42);assert.equal(await h.evaluate(()=>44),44);
});
await test('large upload body and recorder/lifecycle integration unchanged',async()=>{
  const large=s=>s.slice(s.indexOf('      const upload = transfer.begin'),s.indexOf('    } else for (let offset'));
  assert.equal(large(candidate),large(base));
  assert.equal(candidate.slice(candidate.indexOf('// Inspect only')),base.slice(base.indexOf('// Inspect only')));
  assert.equal(candidate.slice(0,candidate.indexOf('const CHUNK_CHARS')),base.slice(0,base.indexOf('const CHUNK_CHARS')));
});
const result={status:'passed',checks:results.length,checksPassed:results,
  scope:'CPU/VM execution of the exact createSafariEvaluate source. Modeled command delay, not a new Safari/profile/media measurement. Large route mock verifies branch and sequencing; unchanged real HTTP transport was independently verified previously.',
  actualSafariMeasured:false,originalFailureRepaired:false,productChanges:0};
writeFileSync(join(root,'inline-candidate-results.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,checks:results.length}));
