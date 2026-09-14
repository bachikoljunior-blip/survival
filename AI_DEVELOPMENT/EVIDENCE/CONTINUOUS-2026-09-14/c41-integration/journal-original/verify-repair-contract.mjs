/** Local synthetic pointer-contract controls; no browser or product screenshot. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=dirname(fileURLToPath(import.meta.url));
const old=readFileSync(join(root,'../c40-journal-build-preparation-ultra/candidate/tools/check-narrative-routes.mjs'),'utf8');
const next=readFileSync(join(root,'repair-candidate/tools/check-narrative-routes.mjs'),'utf8');
const css=readFileSync(join(root,'prepared-original/styles.css'),'utf8');
const screens=readFileSync(join(root,'../c40-journal-build-preparation-ultra/baseline/src/ui/screens.js'),'utf8');
const controls=[];function check(name,fn){fn();controls.push({name,passed:true});}
const expression=next.match(/centerHit: ([\s\S]*?),\n            hitElement:/)[1];
const predicate=new Function('body','panel','hit','getComputedStyle','return ('+expression+');');
const descendant={pointerEvents:'none'},body={pointerEvents:'none',contains:node=>node===descendant},panel={pointerEvents:'auto'};
const style=node=>({pointerEvents:node.pointerEvents});
check('Original canonical CSS and renderer assign pointer ownership to journal scroller, not plain text',()=>{
 assert(css.includes('#ui * { pointer-events: none; }'));assert(css.includes('#ui .hit { pointer-events: auto;'));
 assert(screens.includes("el('div', 'col main scroll hit', this.body)"));assert(screens.includes("const d = el('div', 'sub', b,"));
});
check('Original predicate necessarily rejects the expected owning scroller',()=>assert.equal(panel===body||body.contains(panel),false));
check('Repair accepts the exact owning scroller under original pointer styles',()=>assert.equal(predicate(body,panel,panel,style),true));
check('Unrelated overlay, sibling control, outer ancestor and absent hit remain rejected',()=>{
 for(const hit of [{pointerEvents:'auto'}, {pointerEvents:'auto',parent:panel}, {pointerEvents:'auto',child:panel},null])assert.equal(predicate(body,panel,hit,style),false);
});
check('Parent hit cannot bypass unexpected pointer-enabled body or disabled scroller styles',()=>{
 assert.equal(predicate({...body,pointerEvents:'auto'},panel,panel,style),false);
 const disabled={pointerEvents:'none'};assert.equal(predicate(body,disabled,disabled,style),false);
});
check('Existing exact body or descendant hit acceptance remains',()=>{
 assert.equal(predicate(body,panel,body,style),true);assert.equal(predicate(body,panel,descendant,style),true);
});
check('Actual screenshot and complete journal-layout row are preserved before visual assertions',()=>{
 const capture=next.indexOf('const png = await page.screenshot('),save=next.indexOf('report.screens.push('),visual=next.indexOf('assert.equal(rendered.title');
 assert(capture<save&&save<visual);assert(next.slice(save,visual).includes('journalLayout: rendered'));
 assert(next.includes('hitElement: hit ?'));assert(next.includes('pointerEvents: { body:'));
});
check('Source-route checks and full export/provenance/capacity/failure contract remain byte-identical',()=>{
 assert.equal(next.slice(0,next.indexOf('async function verifyBrowser')),old.slice(0,old.indexOf('async function verifyBrowser')));
 const marker='/** Export original PNG and report bytes';assert.equal(next.slice(next.indexOf(marker)),old.slice(old.indexOf(marker)));
});
const result={status:'passed',scope:'Eight synthetic pointer-contract/source-order controls using the exact candidate expression and canonical CSS/renderer. No CSS engine, browser, source render or screenshot is claimed.',controls,passed:controls.length,node:process.version,repairSha256:createHash('sha256').update(next).digest('hex'),actualBrowserExecuted:false,originalScreens:0,remoteWrites:0,ciStarts:0,localBrowserCapability:'Runtime playwright module exists, its declared Chromium executable is absent. No install, alternate executable search or launch was attempted.'};
writeFileSync(join(root,'repair-verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:controls.length,actualBrowser:false,repairSha256:result.repairSha256}));
