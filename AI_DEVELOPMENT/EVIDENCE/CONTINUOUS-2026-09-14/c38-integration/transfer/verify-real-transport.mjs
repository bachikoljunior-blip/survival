import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { createSafariEvaluate } from './fixture/tools/ios_audio_capture.mjs';
import { createIosAudioTransfer } from './candidate/tools/ios_audio_transfer.mjs';
import { requestWebDriver } from './source/tools/webdriver-request.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = text => createHash('sha256').update(text).digest('hex');
const original = readFileSync(new URL('./source/tools/ios_audio_capture.mjs', import.meta.url), 'utf8');
const originalFunction = original.slice(original.indexOf('export function createSafariEvaluate'),
  original.indexOf('// Inspect only the existing production context.')).replace('export function', 'function');
const baselineFactory = vm.runInNewContext(`const CHUNK_CHARS=131072, MAX_TRANSFER_CHARS=50331648,
  TRANSFER_KEY='__cinderlineIosAudioTransfer';
  ${originalFunction}; createSafariEvaluate`, { Date, Promise, setTimeout, delay });
const payload = { fixtureOnly: true, noRecordedMedia: true,
  text: 'A'.repeat(5_000_000), unicode: '日本語\n改行\u0000🙂', nested: { enabled: false, empty: null } };
const expectedJson = JSON.stringify(payload);
const results = [];

async function listen(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return `http://127.0.0.1:${server.address().port}`;
}
async function run(label, factory, upload, timeoutMs, driverLatencyMs) {
  const transfer = createIosAudioTransfer();
  let posts = 0, maxPostBytes = 0, driverCommands = 0, driverReplyBytes = 0;
  const dist = createServer((request, response) => {
    posts++; maxPostBytes = Math.max(maxPostBytes, Number(request.headers['content-length'] || 0));
    if (!transfer.handle(request, response)) { response.writeHead(404); response.end(); }
  });
  const distOrigin = await listen(dist); transfer.bind(`${distOrigin}/`);
  const page = { fixturePayload: payload };
  const browserFetch = (path, options) => fetch(new URL(path, `${distOrigin}/`),
    { ...options, headers: { ...options.headers, origin: distOrigin } });
  const context = vm.createContext({ window: page, TextEncoder, AbortController, crypto: webcrypto,
    fetch: browserFetch, setTimeout, clearTimeout });
  const appium = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const { script, args } = JSON.parse(Buffer.concat(chunks));
    driverCommands++;
    await delay(driverLatencyMs);
    try {
      context.__args = args;
      const value = vm.runInContext(`(function(){${script}\n}).apply(null,__args)`, context);
      const reply = JSON.stringify({ value: value ?? null }); driverReplyBytes += Buffer.byteLength(reply);
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(reply);
    } catch (error) {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ value: { error: 'javascript error', message: error.message } }));
    }
  });
  const appiumOrigin = await listen(appium);
  const execute = (script, args = [], timeout = 90000) => requestWebDriver(`${appiumOrigin}/execute/sync`,
    { body: { script, args }, timeout });
  const evaluate = factory(execute, { timeoutMs, pollMs: 5, ...(upload ? { transfer } : {}) });
  const began = performance.now();
  let result, error;
  try { result = await evaluate(() => window.fixturePayload); }
  catch (caught) { error = caught.message; }
  const elapsedMs = performance.now() - began;
  if (result) assert.equal(JSON.stringify(result), expectedJson);
  transfer.close();
  appium.closeAllConnections(); dist.closeAllConnections();
  await Promise.all([new Promise(resolve => appium.close(resolve)), new Promise(resolve => dist.close(resolve))]);
  const receipt = { label, timeoutMs, driverLatencyMs, elapsedMs, success: Boolean(result), error: error || null,
    driverCommands, driverReplyBytes, posts, maxPostBytes, returnedJsonSha256: result ? sha(JSON.stringify(result)) : null,
    uploadReceipts: transfer.receipts };
  results.push(receipt); return receipt;
}

const failed = await run('original helper, real delayed HTTP WebDriver, synthetic 5M-character payload', baselineFactory, false, 1500, 60);
assert.equal(failed.success, false); assert.match(failed.error, /chunk transfer timed out/);
const repaired = await run('candidate helper, same payload/delay/budget, real same-origin HTTP upload', createSafariEvaluate, true, 1500, 60);
assert.equal(repaired.success, true); assert.ok(repaired.elapsedMs < 1500);
assert.ok(repaired.posts > 1); assert.ok(repaired.maxPostBytes <= 131072);
assert.ok(repaired.driverReplyBytes < 4096); assert.equal(repaired.returnedJsonSha256, sha(expectedJson));
assert.ok(repaired.driverCommands < failed.driverCommands);
assert.equal(repaired.uploadReceipts[0].chars, expectedJson.length);
const output = { schemaVersion: 1, fixtureOnly: true, actualSafari: false,
  scope: 'Real Node HTTP sockets, wall-clock delays, browser-function VM, WebCrypto and fetch; synthetic text only. The 1500 ms test budget is shorter than the unchanged production 120000 ms. This reproduces a possible serial round-trip deadline mechanism, not the unrecorded C36 per-command timings.',
  originalReportSha256: 'b2de6f0b9ce375082be62762ee2f880fd47ab0c2bfbcbb7f65923d44b1b2cbe8',
  fixtureJsonChars: expectedJson.length, fixtureJsonBytes: Buffer.byteLength(expectedJson),
  fixtureJsonSha256: sha(expectedJson),
  testedCandidateFiles: Object.fromEntries(['ios_audio_capture.mjs', 'ios_audio_transfer.mjs', 'test-ios-safari.mjs']
    .map(name => [name, sha(readFileSync(new URL(`./candidate/tools/${name}`, import.meta.url)))])),
  results, passed: true };
writeFileSync(new URL('./real-transport-result.json', import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
