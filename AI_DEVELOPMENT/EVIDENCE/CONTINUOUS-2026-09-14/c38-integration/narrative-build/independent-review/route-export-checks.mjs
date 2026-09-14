import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { exportRouteArtifacts, TARGETS } from '../candidate/tools/check-narrative-routes.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const fixture = join(root, 'failure-fixture');
const out = join(fixture, 'test-results/narrative-route-r2'); mkdirSync(out, { recursive: true });
const hash = data => createHash('sha256').update(data).digest('hex');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fixture, encoding: 'utf8' }).trim();
const environment = { GITHUB_SHA: commit, GITHUB_RUN_ID: '123456', GITHUB_RUN_ATTEMPT: '1' };
const routes = JSON.parse(readFileSync(join(root, 'independent-route-results.json'))).rows;
const crc32 = bytes => {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const kind = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4); length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([kind, data])));
  return Buffer.concat([length, kind, data, crc]);
}
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(667, 0); ihdr.writeUInt32BE(375, 4); ihdr[8] = 8; ihdr[9] = 6;
const pixels = Buffer.alloc((667 * 4 + 1) * 375);
for (let y = 0; y < 375; y++) for (let x = 0; x < 667; x++) { const i = y * (667 * 4 + 1) + 1 + x * 4; pixels[i] = x % 256; pixels[i + 1] = y % 256; pixels[i + 2] = (x * y) % 256; pixels[i + 3] = 255; }
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
assert(png.length > 3000);
const expected = ['en','ja'].flatMap(language => TARGETS.map(({conversation,node}) => ({language,conversation,node,file:`${language}-${conversation}-${node}.png`})));
function full() { return { status:'passed', browserRequested:true,browserAttempted:true,browserExecuted:true, bundleSha256:'a'.repeat(64), sourceCommit:commit,runId:environment.GITHUB_RUN_ID,runAttempt:environment.GITHUB_RUN_ATTEMPT, sourceRoutes:structuredClone(routes), screens:expected.map(row=>({...row,bytes:png.length,sha256:hash(png),browserErrors:[]})) }; }
function reset(report=full(), bytes=png) { for(const row of expected)writeFileSync(join(out,row.file),bytes);writeFileSync(join(out,'report.json'),JSON.stringify(report)+'\n');return report; }
function rejects(report, pattern, env=environment) { writeFileSync(join(out,'report.json'),JSON.stringify(report)+'\n');const lines=[];assert.throws(()=>exportRouteArtifacts(fixture,line=>lines.push(line),env),pattern);assert.equal(lines.length,0); }
function records(report) { writeFileSync(join(out,'report.json'),JSON.stringify(report)+'\n');const lines=[];exportRouteArtifacts(fixture,line=>lines.push(line),environment);return lines; }
const checks=[];function check(name,fn){fn();checks.push({name,passed:true});}
check('13-file successful transport reconstructs all unchanged synthetic PNG/report bytes and contiguous chunks',()=>{
 reset();const lines=records(full());let active=null;const complete=[];
 for(const line of lines){const m=/^\[narrative-route-(meta|chunk|end)\] (.*)$/.exec(line);assert(m);const record=JSON.parse(m[2]);if(m[1]==='meta'){assert.equal(active,null);active={meta:record,parts:[],offset:0};}else if(m[1]==='chunk'){assert.equal(record.file,active.meta.file);assert.equal(record.offset,active.offset);const part=Buffer.from(record.base64,'base64');active.parts.push(part);active.offset+=part.length;}else{assert.deepEqual(record,active.meta);const bytes=Buffer.concat(active.parts);assert.deepEqual(bytes,readFileSync(join(out,record.file)));assert.equal(hash(bytes),record.sha256);assert.equal(bytes.length,record.bytes);assert.equal(record.commit,commit);assert.equal(record.diagnosticStatus,'passed');assert.equal(record.screenCount,12);assert.equal(record.complete,true);complete.push(record.file);active=null;}}
 assert.equal(active,null);assert.deepEqual(complete,[...expected.map(r=>r.file),'report.json']);
});
check('failed five-screen prefix is exported as failed, with complete only denoting file bytes',()=>{const report=reset();report.status='failed';report.error='synthetic diagnostic failure';report.screens.length=5;const lines=records(report);const metas=lines.filter(x=>x.startsWith('[narrative-route-meta] ')).map(x=>JSON.parse(x.slice(23)));assert.equal(metas.length,6);for(const meta of metas){assert.equal(meta.diagnosticStatus,'failed');assert.equal(meta.screenCount,5);assert.equal(meta.complete,true);}});
check('failed preflight without browser or screens exports only honest failure report',()=>{const report={status:'failed',browserRequested:true,browserAttempted:false,browserExecuted:false,sourceRoutes:[],screens:[],error:'synthetic preflight rejection'};reset(report);const lines=records(report);assert.equal(lines.filter(x=>x.startsWith('[narrative-route-meta] ')).length,1);});
check('source-only successful report requires no browser and exports report only',()=>{const report={status:'passed',browserRequested:false,browserAttempted:false,browserExecuted:false,sourceRoutes:structuredClone(routes),screens:[]};reset(report);const lines=records(report);assert.equal(lines.filter(x=>x.startsWith('[narrative-route-meta] ')).length,1);});
check('last screen byte corruption rejects before first emit',()=>{const report=reset();writeFileSync(join(out,expected.at(-1).file),Buffer.concat([png,Buffer.from('x')]));rejects(report,/Screen length changed/);});
check('last path traversal rejects before first emit',()=>{const report=reset();report.screens.at(-1).file='../outside.png';rejects(report,/Unexpected screen route or path/);});
check('duplicate/reordered screen route rejects before first emit',()=>{const report=reset();report.screens[11]={...report.screens[10]};rejects(report,/Unexpected screen route or path/);});
check('accurately hashed wrong PNG dimensions reject before first emit',()=>{const report=reset(),wrong=Buffer.from(png);wrong.writeUInt32BE(668,16);writeFileSync(join(out,expected.at(-1).file),wrong);report.screens.at(-1).sha256=hash(wrong);rejects(report,/Unexpected PNG width/);});
check('accurately hashed wrong PNG signature rejects before first emit',()=>{const report=reset(),wrong=Buffer.from(png);wrong[0]=0;writeFileSync(join(out,expected.at(-1).file),wrong);report.screens.at(-1).sha256=hash(wrong);rejects(report,/Screen is not an original PNG/);});
check('foreign report source commit rejects before first emit',()=>{const report=reset();report.sourceCommit='b'.repeat(40);rejects(report,/another checkout/);});
check('foreign workflow commit rejects before first emit',()=>{const report=reset();rejects(report,/actual workflow commit/,{...environment,GITHUB_SHA:'b'.repeat(40)});});
check('foreign run and attempt reject before first emit',()=>{let report=reset();report.runId='123457';rejects(report,/another workflow run/);report=reset();report.runAttempt='2';rejects(report,/another workflow attempt/);});
check('frozen source text pin drift rejects before first emit',()=>{const report=reset();report.sourceRoutes[11].textSha256='b'.repeat(64);rejects(report,/AssertionError/);});
check('passed browser report with only 11 screens rejects before first emit',()=>{const report=reset();report.screens.length=11;rejects(report,/Incomplete successful browser diagnostic/);});
check('source-only passed report missing routes rejects before first emit',()=>{const report={status:'passed',browserRequested:false,browserAttempted:false,browserExecuted:false,sourceRoutes:[],screens:[]};reset(report);rejects(report,/source route|AssertionError/);});
check('executed browser without requested/attempted flags rejects even with zero screens',()=>{const report={status:'failed',browserRequested:false,browserAttempted:false,browserExecuted:true,sourceRoutes:[],screens:[]};reset(report);rejects(report,/browser|Browser|AssertionError/);});
check('file over 4 MiB cap rejects after hash verification and before emission',()=>{const report=reset(),large=Buffer.alloc(4*1024*1024+1);png.copy(large);writeFileSync(join(out,expected.at(-1).file),large);Object.assign(report.screens.at(-1),{bytes:large.length,sha256:hash(large)});rejects(report,/Per-file export cap/);});
check('report over 4 MiB cap rejects before emission',()=>{const report=reset();report.padding='x'.repeat(4*1024*1024);rejects(report,/Per-file export cap/);});
check('total set above 32 MiB with each file below 4 MiB rejects before emission',()=>{const report=full(),large=Buffer.alloc(3*1024*1024+1);png.copy(large);for(const screen of report.screens)Object.assign(screen,{bytes:large.length,sha256:hash(large)});reset(report,large);rejects(report,/Total export cap/);});
reset({status:'failed',browserRequested:false,browserAttempted:false,browserExecuted:false,sourceRoutes:[],screens:[],error:'Synthetic review fixture; not a production result'});
const result={scope:'Independent bounded route-export transport tests using explicitly synthetic PNG files, an isolated local Git fixture and synthetic run IDs; no browser measurement, screenshot acquisition, CI or build.',checks,total:checks.length,passed:checks.every(x=>x.passed),syntheticPngBytes:png.length,actualBrowserExecutions:0,remoteMutations:0};writeFileSync(join(root,'route-export-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
