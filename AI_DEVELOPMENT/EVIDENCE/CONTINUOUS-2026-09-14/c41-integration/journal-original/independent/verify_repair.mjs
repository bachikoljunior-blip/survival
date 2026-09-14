// Independent VM controls. No browser, image generation, screenshot file or CI.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const source=readFileSync(join(here,'../c40-journal-build-result-ultra/repair-candidate/tools/check-narrative-routes.mjs'),'utf8');
const baseline=readFileSync(join(here,'baseline/tools/check-narrative-routes.mjs'),'utf8');
const digest=b=>createHash('sha256').update(b).digest('hex');
assert.equal(digest(source),'c37ff0a9458fde111c7396f7492c053f554f4c2fee7313b03b04c28693520709');
function parts(text) {
  const token='const rendered = await page.evaluate(';
  const begin=text.indexOf(token)+token.length;
  const finish=text.indexOf('}, row);',begin)+1;
  const hostStart=text.indexOf('\n',finish)+1;
  const hostEnd=text.indexOf('      } finally { await context.close(); }',hostStart);
  const mainStart=text.indexOf('  try {\n    const rows = await verifySourceRoutes(root);');
  const mainEnd=text.indexOf("finally { writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\\n'); }",mainStart)+"finally { writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\\n'); }".length;
  assert(begin>token.length && finish>begin && hostStart>finish && hostEnd>hostStart && mainStart>0 && mainEnd>mainStart);
  return {callback:text.slice(begin,finish),host:text.slice(hostStart,hostEnd),main:text.slice(mainStart,mainEnd)};
}
const controls=[];
async function run(name,cfg={},old=false) {
  const part=parts(old?baseline:source);
  const code=`(async()=>{
    const cfg=${JSON.stringify(cfg)};
    const events=[];let serialized=null;
    const row={language:'en',conversation:'iris_first',node:'i_gives',journal:'iris',expectedTitle:'Fixture title',expectedDisplay:'Fixture text'};
    const selected={stored:{text:'Fixture source'},journalCountBefore:0,journalCountAfter:1};
    const box=(left,top,width,height)=>({x:left,y:top,left,top,width,height,right:left+width,bottom:top+height});
    const descendant={tagName:'SPAN',id:'child',className:'child'};
    const body={tagName:'DIV',id:'body',className:'sub',textContent:row.expectedDisplay,
      getBoundingClientRect:()=>box(120,130,300,60),contains:e=>e===descendant};
    const block={children:[{},{}],firstElementChild:{textContent:row.expectedTitle},lastElementChild:body,
      scrollIntoView:opts=>events.push({event:'scroll',opts}),getBoundingClientRect:()=>box(120,100,300,90)};
    const panel={tagName:'DIV',id:'panel',className:'col main scroll hit',children:[block],
      getBoundingClientRect:()=>box(100,80,400,230),clientWidth:400,clientHeight:230,
      scrollWidth:400,scrollHeight:500,scrollLeft:0,scrollTop:0};
    const other={tagName:'BUTTON',id:'overlay',className:'hit'};
    const hit=cfg.hit==='body'?body:cfg.hit==='descendant'?descendant:cfg.hit==='other'?other:cfg.hit==='null'?null:panel;
    const G={mode:cfg.menuClosed?'play':'menu',menus:{pauseOpen:true,activePanel:'journal',journalPanel:panel},dialogueUI:{node:{classList:{contains:()=>false}}}};
    const window={CINDERLINE:{game:G}};
    const document={elementFromPoint:(x,y)=>{events.push({event:'hit',x,y});return hit;}};
    const getComputedStyle=el=>({pointerEvents:el===body?(cfg.bodyPE||'none'):(cfg.panelPE||'auto'),display:'block',visibility:'visible',whiteSpace:'normal',fontStyle:'normal'});
    const requestAnimationFrame=f=>{events.push({event:'raf'});f();};
    if(cfg.duplicateTitle)panel.children=[block,block];
    const report={status:'started',sourceRoutes:[],screens:[],viewport:{width:667,height:375},contextOptions:{deviceScaleFactor:1}};
    const errors=cfg.browserError?['fixture browser error']:[];
    const process={argv:['node','fixture','--browser'],exitCode:0};
    const console={log:()=>{}};const root='fixture-root',output='fixture-output';
    const hash=hashFn;
    const innerWidth=cfg.innerWidth??667,innerHeight=375,devicePixelRatio=cfg.scale??1;
    const navigator={maxTouchPoints:cfg.touch??1};
    const page={viewportSize:()=>({width:cfg.viewportWidth??667,height:375}),evaluate:async fn=>fn(),
      screenshot:async opts=>{events.push({event:'screenshot',opts});if(cfg.screenshotError)throw Error('Fixture screenshot failure');return Buffer.from('synthetic stub bytes; no PNG or browser');}};
    const verifySourceRoutes=async()=>[row,row];
    const verifyBrowser=async()=>{
      const rendered=await (${part.callback})(row);
      if(cfg.hidden)rendered.visible=false;
      if(cfg.dialogue)rendered.dialogueVisible=true;
      if(cfg.badTitle)rendered.title='Wrong';
      if(cfg.badText)rendered.domText='Wrong';
      if(cfg.block)Object.assign(rendered.blockRect,cfg.block);
      if(cfg.overflow)rendered.panelScroll.width=402;
      ${part.host}
    };
    const writeFileSync=(path,text)=>{events.push({event:'write',path});serialized=text;};
    ${part.main}
    return JSON.parse(JSON.stringify({report:JSON.parse(serialized),events,exitCode:process.exitCode}));
  })()`;
  const result=JSON.parse(JSON.stringify(await vm.runInNewContext(code,{assert,Buffer,join,hashFn:digest},{timeout:3000})));
  controls.push({name,status:result.report.status,exitCode:result.exitCode,screens:result.report.screens.length,error:result.report.error||null,events:result.events.map(e=>e.event)});
  return result;
}
const good=await run('exact owning panel with body none and panel auto');
assert.equal(good.report.status,'passed');assert.equal(good.report.screens.length,1);
assert.equal(good.report.screens[0].journalLayout.hitIsPanel,true);
assert.deepEqual(good.report.screens[0].journalLayout.pointerEvents,{body:'none',panel:'auto'});
assert.deepEqual(good.report.screens[0].journalLayout.hitElement,{tag:'DIV',id:'panel',className:'col main scroll hit'});
assert.deepEqual(good.events.find(x=>x.event==='hit'),{event:'hit',x:270,y:160});
assert.equal(good.events.filter(x=>x.event==='raf').length,2);
assert.equal(good.events.find(x=>x.event==='screenshot').opts.fullPage,false);
assert.equal(good.report.screens[0].journalLayout.domText,'Fixture text');
const old=await run('canonical helper rejects the CSS parent case',{},true);
assert.equal(old.report.status,'failed');assert.match(old.report.error,/Journal body is covered/);assert.equal(old.report.screens.length,0);
for(const hit of ['body','descendant'])assert.equal((await run('existing '+hit+' acceptance',{hit})).report.status,'passed');
for(const [name,cfg] of [
  ['foreign pointer-receiving overlay',{hit:'other'}],
  ['missing hit',{hit:'null'}],
  ['owning panel but body auto',{bodyPE:'auto'}],
  ['owning panel but panel none',{panelPE:'none'}],
  ['owning panel but unsupported body style',{bodyPE:'inherit'}],
  ['hidden body',{hidden:true}],
  ['dialogue overlay',{dialogue:true}],
  ['wrong title',{badTitle:true}],
  ['wrong text',{badText:true}],
  ['zero layout',{block:{width:0}}],
  ['left outside owning panel',{block:{left:98}}],
  ['right outside owning panel',{block:{right:502}}],
  ['top outside owning panel',{block:{top:78}}],
  ['bottom outside owning panel',{block:{bottom:312}}],
  ['horizontal overflow',{overflow:true}],
  ['viewport mismatch',{viewportWidth:668}],
  ['inner viewport mismatch',{innerWidth:668}],
  ['DPR mismatch',{scale:2}],
  ['touch absent',{touch:0}],
  ['browser error',{browserError:true}],
]){
  const r=await run(name,cfg);
  assert.equal(r.report.status,'failed',name);assert.equal(r.exitCode,1,name);
  assert.equal(r.report.screens.length,1,name);
  assert.equal(r.events.filter(x=>x.event==='screenshot').length,1,name);
  assert.equal(r.events.at(-1).event,'write',name);
  assert(r.report.screens[0].journalLayout,name);
}
for(const [name,cfg] of [['menu closed',{menuClosed:true}],['duplicate title',{duplicateTitle:true}],['screenshot throws',{screenshotError:true}]]){
  const r=await run(name,cfg);assert.equal(r.report.status,'failed');assert.equal(r.exitCode,1);assert.equal(r.report.screens.length,0);
  if(cfg.screenshotError)assert.match(r.report.error,/Fixture screenshot failure/);
}
// A pointer-events:none visual cover cannot be detected by elementFromPoint;
// both helpers share this boundary. VM assigns the resulting underlying hit.
const transparentToPointer=await run('preexisting pointer-only limit for a visual cover',{hit:'body'});
assert.equal(transparentToPointer.report.status,'passed');
const result={status:'PASS',candidateSha256:digest(source),checkCount:controls.length,controls,
  actualBrowserRuns:0,actualScreenshots:0,syntheticScreenshotFilesWritten:0,
  blocking:[],limits:['VM controls use synthetic DOM and screenshot-return stubs, not a browser/CSS engine or image evidence.',
    'Pointer-hit acceptance alone cannot establish absence of a visual overlay with pointer-events:none. Original visual cause and typography remain unmeasured.',
    'Actual browser has two routes; the local host fragment uses one row solely to exercise failure propagation. The byte-identical exporter still rejects a one-screen successful browser diagnostic.']};
writeFileSync(join(here,'repair-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,checks:controls.length,actualBrowserRuns:0,blocking:[]}));
