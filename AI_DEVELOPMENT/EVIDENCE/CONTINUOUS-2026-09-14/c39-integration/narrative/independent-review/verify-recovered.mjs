import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { INPUTS, CANDIDATES, SOURCES, FILES, ORIGINAL_BUNDLE } from '../../c39-narrative-build-preparation-ultra/candidate/tools/prepare-narrative-product.mjs';
import { TARGETS } from '../../c39-narrative-build-preparation-ultra/candidate/tools/check-narrative-routes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORK = resolve(HERE, '../..');
const HEAD = '61e8f8c595bde13634fe709f979816011df165d0';
const RUN = '34884725972';
const JOB = '104112424660';
const ATTEMPT = '1';
const BASELINE = join(WORK, 'c39-narrative-build-preparation-ultra/baseline');
const CANDIDATE_ROOT = join(WORK, 'c39-narrative-build-preparation-ultra/candidate');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const gitBlob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const identify = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes), gitBlob: gitBlob(bytes) });
const ROUTE_NAMES = ['en', 'ja'].flatMap(language => TARGETS.map(({ conversation, node }) => `${language}-${conversation}-${node}.png`));

export function parseTransport(raw) {
  const families = new Map([['prepared-narrative', new Map()], ['narrative-route', new Map()]]);
  let active = null, records = 0;
  const control = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    // Original Actions log parts can begin with a UTF-8 BOM before a timestamp.
    // Recognize it only in framing; the original log and JSON/file bytes stay unchanged.
    const normalized = line.replace(/^\uFEFF/, '').replace(/^\d{4}-\d\d-\d\dT[^\s]+\s+/, '');
    const matched = /^\[(prepared-narrative|narrative-route)-(meta|chunk|end)\] (.*)$/.exec(normalized);
    if (!matched) continue;
    const [, family, kind, payload] = matched, item = JSON.parse(payload); records++;
    assert(item && !Array.isArray(item) && typeof item === 'object', 'Invalid transport record');
    const files = families.get(family);
    if (kind === 'meta') {
      assert.equal(active, null, 'Interleaved or missing transport end');
      const allowed = family === 'prepared-narrative' ? [...FILES, 'report.json'] : [...ROUTE_NAMES, 'report.json'];
      assert(allowed.includes(item.file), 'Unexpected exported file');
      assert(!files.has(item.file), 'Duplicate exported file');
      assert(Number.isSafeInteger(item.bytes) && item.bytes >= 0 && item.bytes <= 4 * 1024 * 1024, 'Invalid export size');
      assert(/^[0-9a-f]{64}$/.test(item.sha256), 'Invalid export hash');
      assert.equal(item.complete, true, 'Incomplete transport metadata');
      if (family === 'prepared-narrative') assert(/^[0-9a-f]{40}$/.test(item.gitBlob), 'Missing Git blob identity');
      active = { family, meta: item, chunks: [], offset: 0, startLine: index + 1, chunkCount: 0 };
    } else if (kind === 'chunk') {
      assert(active && family === active.family, 'Chunk outside active file');
      assert.equal(item.file, active.meta.file, 'Chunk belongs to another file');
      assert.equal(item.offset, active.offset, 'Missing, duplicated, or out-of-order chunk offset');
      assert(typeof item.base64 === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(item.base64), 'Invalid base64 encoding');
      const bytes = Buffer.from(item.base64, 'base64');
      assert.equal(bytes.toString('base64'), item.base64, 'Non-canonical or malformed base64');
      assert.equal(bytes.length, Math.min(3000, active.meta.bytes - active.offset), 'Unexpected chunk boundary or size');
      assert(bytes.length > 0, 'Unexpected empty chunk');
      active.chunks.push(bytes); active.offset += bytes.length; active.chunkCount++;
    } else {
      assert(active && family === active.family, 'End outside active file');
      assert.deepEqual(item, active.meta, 'Metadata/end mismatch');
      const bytes = Buffer.concat(active.chunks);
      assert.equal(active.offset, item.bytes, 'Incomplete recovered file');
      assert.equal(sha256(bytes), item.sha256, 'Recovered SHA256 mismatch');
      if (family === 'prepared-narrative') assert.equal(gitBlob(bytes), item.gitBlob, 'Recovered Git blob mismatch');
      files.set(item.file, { meta: item, bytes });
      control.push({ family, file: item.file, firstLine: active.startLine, lastLine: index + 1, chunks: active.chunkCount, bytes: bytes.length });
      active = null;
    }
  }
  assert.equal(active, null, 'Truncated final exported file');
  assert(records > 0, 'No actual transport records');
  return { families, control, records };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}

export function inspectPng(bytes) {
  assert(bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'Bad PNG signature');
  let offset = 8, header = null, ended = false, count = 0; const idat = [];
  while (offset < bytes.length) {
    assert(offset + 12 <= bytes.length, 'Truncated PNG chunk header');
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8), end = offset + 12 + length;
    assert(end <= bytes.length, 'Truncated PNG chunk');
    assert.equal(bytes.readUInt32BE(end - 4), crc32(bytes.subarray(offset + 4, end - 4)), 'PNG CRC mismatch');
    if (count === 0) assert.equal(type, 'IHDR', 'PNG does not begin with IHDR');
    if (type === 'IHDR') {
      assert.equal(header, null); assert.equal(length, 13);
      header = { width: bytes.readUInt32BE(offset + 8), height: bytes.readUInt32BE(offset + 12), bitDepth: bytes[offset + 16], colorType: bytes[offset + 17], compression: bytes[offset + 18], filter: bytes[offset + 19], interlace: bytes[offset + 20] };
      assert.equal(header.width, 667); assert.equal(header.height, 375); assert.equal(header.compression, 0); assert.equal(header.filter, 0);
    }
    if (type === 'IDAT') idat.push(bytes.subarray(offset + 8, end - 4));
    if (type === 'IEND') { assert.equal(length, 0); assert.equal(end, bytes.length, 'Bytes remain after IEND'); ended = true; }
    offset = end; count++;
  }
  assert(header && ended && idat.length, 'Incomplete PNG structure');
  const inflated = inflateSync(Buffer.concat(idat), { maxOutputLength: 4 * 1024 * 1024 });
  if (header.interlace === 0) {
    const channels = {0:1,2:3,3:1,4:2,6:4}[header.colorType]; assert(channels, 'Unsupported PNG color type');
    const stride = Math.ceil(header.width * channels * header.bitDepth / 8) + 1;
    assert.equal(inflated.length, stride * header.height, 'PNG decompressed size mismatch');
    for (let row = 0; row < header.height; row++) assert(inflated[row * stride] <= 4, 'Invalid PNG scanline filter');
  }
  return { ...header, pngChunks: count, crcVerified: true, decompressedBytes: inflated.length };
}

function runBody(value) {
  if (value.structuredContent) return runBody(value.structuredContent);
  if (value.result) return runBody(value.result);
  if (typeof value.content === 'string') return JSON.parse(value.content);
  return value;
}

function materialized(dir, name, mode) {
  return readFileSync(join(dir, mode === 'flat' ? name.replaceAll('/', '__') : name));
}

export function verify(config) {
  const rawBytes = readFileSync(config.log), parsed = parseTransport(rawBytes.toString('utf8'));
  const prepared = parsed.families.get('prepared-narrative'), routeFiles = parsed.families.get('narrative-route');
  assert.deepEqual([...prepared.keys()], [...FILES, 'report.json'], 'Incomplete or reordered prepared set');
  assert.deepEqual([...routeFiles.keys()], [...ROUTE_NAMES, 'report.json'], 'Incomplete successful browser transport set');
  const record = JSON.parse(prepared.get('report.json').bytes), routes = JSON.parse(routeFiles.get('report.json').bytes);
  const run = runBody(JSON.parse(readFileSync(config.runMetadata)));
  assert.equal(String(run.id), RUN); assert.equal(String(run.run_attempt), ATTEMPT); assert.equal(run.head_sha, HEAD);
  assert.equal(run.head_branch, 'claude/repo-instructions-constraints-r0070m'); assert.equal(run.event, 'push');
  assert.equal(run.repository.full_name, 'bachikoljunior-blip/survival');
  const job = JSON.parse(readFileSync(config.jobMetadata));
  assert.equal(String(job.id), JOB); assert.equal(String(job.run_id), RUN); assert.equal(job.status, 'completed'); assert.equal(job.conclusion, 'success');
  assert.equal(job.name, 'Prepare exact reviewed narrative source and root');
  for (const step of job.steps) { assert.equal(step.status,'completed'); assert.equal(step.conclusion,'success'); }
  const tree = JSON.parse(readFileSync(join(HERE, 'canonical-c38-tree.json'))); assert.equal(tree.truncated, false);
  const remote = new Map(tree.tree.map(row => [row.path, row]));
  const currentInputs = tree.tree.filter(row => row.type === 'blob' && (/^(src|public)\//.test(row.path) || ['build.mjs','package.json','package-lock.json'].includes(row.path))).map(row => row.path).sort();
  assert.deepEqual(currentInputs, Object.keys(INPUTS).sort(), 'Canonical C38 build input set mismatch');
  assert.deepEqual(Object.keys(record.inputs).sort(), Object.keys(INPUTS).sort());
  for (const [path, expected] of Object.entries(INPUTS)) {
    const bytes = readFileSync(join(BASELINE, path)); assert.equal(sha256(bytes), expected, 'Frozen baseline drift: ' + path);
    assert.equal(remote.get(path)?.sha, gitBlob(bytes), 'C38 canonical source drift: ' + path);
    assert.deepEqual(record.inputs[path], { bytes: bytes.length, sha256: expected, gitBlob: gitBlob(bytes) });
  }
  assert.equal(record.status, 'prepared and content/root verified'); assert.equal(record.sourceCommit, HEAD);
  assert.equal(String(record.runId), RUN); assert.equal(String(record.runAttempt), ATTEMPT);
  assert.equal(record.sourceBaseline, 'bf743056ce143f09e4c6544ef1c7df4b73b232fd');
  assert.equal(record.originalBundleSha256, ORIGINAL_BUNDLE); assert.equal(record.baselineDistSha256, ORIGINAL_BUNDLE); assert.equal(record.baselineReproduced, true);
  assert.deepEqual(record.dependencies, { esbuild: '0.25.0', three: '0.180.0' });
  assert(/^v20\./.test(record.node)); assert.equal(record.platform, 'linux'); assert.equal(record.arch, 'x64');
  assert.deepEqual(record.expectedSources, CANDIDATES); assert.equal(record.commands.length, 7);
  const expectedArgs = [ ['build.mjs'], ['tools/export_pages_root.mjs','--check'], ['--input-type=module','--eval','import { execFileSync } from "node:child_process"; for (const path of process.argv.slice(1)) execFileSync(process.execPath, ["--check", path], { stdio: "inherit" });',...SOURCES], ['build.mjs'], ['tools/export_pages_root.mjs'], ['tools/export_pages_root.mjs','--check'], ['tools/validate.mjs'] ];
  record.commands.forEach((command, i) => { assert.deepEqual(command.args, expectedArgs[i]); assert.equal(command.exit, 0); });
  assert.deepEqual(record.files.map(file => file.path), FILES);
  assert.deepEqual(record.files.filter(file => file.changed).map(file => file.path).sort(), [...SOURCES,'cinderline.1.0.0.js'].sort());
  const verifiedFiles = [];
  for (const name of [...FILES, 'report.json']) {
    const decoded = prepared.get(name); assert.equal(decoded.meta.commit, HEAD);
    assert.deepEqual(materialized(config.preparedDirectory, name, config.preparedNameMode), decoded.bytes, 'Prepared materialization differs: ' + name);
    verifiedFiles.push(identify(name, decoded.bytes));
    if (name === 'report.json') continue;
    const row = record.files.find(file => file.path === name);
    assert.equal(row.output, name.replaceAll('/', '__')); assert.equal(row.bytes, decoded.bytes.length); assert.equal(row.sha256, sha256(decoded.bytes)); assert.equal(row.gitBlob, gitBlob(decoded.bytes));
    const baseline = readFileSync(join(BASELINE, name)); assert.equal(remote.get(name)?.sha, gitBlob(baseline), 'Canonical root/source baseline mismatch: ' + name);
    assert.equal(row.changed, !baseline.equals(decoded.bytes));
    if (CANDIDATES[name]) { assert.equal(sha256(decoded.bytes), CANDIDATES[name].sha256); assert.deepEqual(decoded.bytes, readFileSync(join(CANDIDATE_ROOT, CANDIDATES[name].file))); }
    else if (name !== 'cinderline.1.0.0.js') assert.deepEqual(decoded.bytes, baseline, 'Static root bytes changed: ' + name);
  }
  const newBundle = prepared.get('cinderline.1.0.0.js').bytes, bundleSha256 = sha256(newBundle);
  assert.equal(record.candidateBundleSha256, bundleSha256); assert.notEqual(bundleSha256, ORIGINAL_BUNDLE);
  assert.equal(routes.status, 'passed'); assert.equal(routes.browserRequested, true); assert.equal(routes.browserAttempted, true); assert.equal(routes.browserExecuted, true);
  assert.equal(routes.sourceCommit, HEAD); assert.equal(String(routes.runId), RUN); assert.equal(String(routes.runAttempt), ATTEMPT); assert.equal(routes.bundleSha256, bundleSha256);
  assert.equal(routes.browser, 'Chromium mobile emulation, not Mobile Safari'); assert.equal(typeof routes.browserVersion, 'string'); assert(routes.browserVersion.length > 0);
  assert.deepEqual(routes.viewport, {width:667,height:375}); assert.deepEqual(routes.contextOptions, {viewport:{width:667,height:375},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const sourceRows = JSON.parse(readFileSync(join(WORK,'c39-narrative-build-preparation-ultra/independent-review/independent-route-results.json'))).rows.map(({expectedDisplay, ...row}) => row);
  assert.deepEqual(routes.sourceRoutes, sourceRows, 'Frozen source/localization/display route hashes differ');
  assert.equal(routes.screens.length, 12);
  const screens = [];
  let routeBytes = 0;
  for (const [i, name] of [...ROUTE_NAMES,'report.json'].entries()) {
    const {meta,bytes} = routeFiles.get(name); routeBytes += bytes.length;
    assert.equal(meta.commit, HEAD); assert.equal(String(meta.runId), RUN); assert.equal(String(meta.runAttempt), ATTEMPT); assert.equal(meta.bundleSha256, bundleSha256); assert.equal(meta.diagnosticStatus, 'passed'); assert.equal(meta.screenCount, 12);
    assert.deepEqual(materialized(config.routeDirectory, name, config.routeNameMode), bytes, 'Route materialization differs: ' + name);
    if (name === 'report.json') continue;
    const row = routes.screens[i], source = sourceRows[i]; assert.equal(row.file, name);
    for (const key of ['language','conversation','node']) assert.equal(row[key], source[key]);
    assert.equal(row.bytes, bytes.length); assert.equal(row.sha256, sha256(bytes)); assert.equal(row.renderedSha256, source.displaySha256); assert.deepEqual(row.browserErrors, []);
    assert.deepEqual(row.viewport.viewport, {width:667,height:375}); assert.equal(row.viewport.innerWidth,667); assert.equal(row.viewport.innerHeight,375); assert.equal(row.viewport.devicePixelRatio,1); assert(row.viewport.maxTouchPoints>0);
    screens.push({...identify(name,bytes),...inspectPng(bytes),renderedSha256:row.renderedSha256,viewport:row.viewport});
  }
  assert(routeBytes <= 32*1024*1024);
  const frozenCode = [['tools/prepare-narrative-product.mjs','a54bcf9b46af0deaaac8355e024911c1b05b3444'],['tools/check-narrative-routes.mjs','a8c779dc577b7066cc01da688678de42f9ef907e']];
  for(const [path,blob] of frozenCode)assert.equal(remote.get(path)?.sha,blob,'Executed C38 helper drift');
  return {status:'passed',scope:'Independent original byte/provenance/pin validation; no screenshot viewing or quality comparison by this reviewer.',run:{id:RUN,jobId:JOB,attempt:ATTEMPT,head:HEAD,event:run.event,headBranch:run.head_branch,status:run.status,conclusion:run.conclusion},rawLog:identify(config.log,rawBytes),transport:{records:parsed.records,files:parsed.control,preparedCount:prepared.size,routeCount:routeFiles.size,routeBytes},canonicalInputCount:47,baselineBundleSha256:ORIGINAL_BUNDLE,preparedFiles:verifiedFiles,screens,preparation:{status:record.status,baselineReproduced:record.baselineReproduced,commands:record.commands,dependencies:record.dependencies,node:record.node},adoptionPins:{preparedFromCommit:HEAD,preparationReportSha256:sha256(prepared.get('report.json').bytes),bundleSha256},preservePins:{bundle:'cinderline.1.0.0.js',recorderBlob:'785541d3beaed0e35e8bcf042973eabb7bdb5d6c'},engineeringAdoption:'Byte/provenance acceptable for simultaneous three-source plus root adoption and the three exact IOS_AUDIO_PIN updates; parent-owned original screen viewing, latest required gates, normal merge and Pages verification remain separate.',quality:{allElements:'19 not measured',validBlind:0,unitsCompleted:0,unitsRequested:'continuous',startedAt:'2026-09-13T20:56:49+09:00',deadlineAt:'2026-09-20T20:56:49+09:00'},actualBrowserExecutionsByReviewer:0,rawSourceWrites:0,remoteMutations:0};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const config = JSON.parse(readFileSync(process.argv[2])); const result = verify(config); writeFileSync(join(HERE,'independent-verification.json'),JSON.stringify(result,null,2)+'\n'); console.log(JSON.stringify({status:result.status,preparedFiles:result.preparedFiles.length,screens:result.screens.length,adoptionPins:result.adoptionPins})); }
  catch(error) { writeFileSync(join(HERE,'verification-failure.json'),JSON.stringify({status:'failed',error:String(error),stack:error.stack,actualBrowserExecutions:0,remoteMutations:0},null,2)+'\n'); console.error(String(error)); process.exitCode=1; }
}
