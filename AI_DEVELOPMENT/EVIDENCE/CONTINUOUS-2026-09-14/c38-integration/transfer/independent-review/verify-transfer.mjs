import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCOPE = resolve(HERE, '..');
const ROOT = resolve(SCOPE, '..');
const hash = x => createHash('sha256').update(x).digest('hex');
const fixture = resolve(HERE, 'fixture/tools');
mkdirSync(fixture, { recursive: true });
for (const name of ['ios_audio_transfer.mjs', 'ios_audio_capture.mjs']) copyFileSync(resolve(SCOPE, 'candidate/tools', name), resolve(fixture, name));
copyFileSync(resolve(SCOPE, 'source/tools/mobile_audio_capture.mjs'), resolve(fixture, 'mobile_audio_capture.mjs'));
copyFileSync(resolve(ROOT, 'main-integration-c36/payload/tools/frame_work_probe.mjs'), resolve(fixture, 'frame_work_probe.mjs'));
const { createIosAudioTransfer, IOS_TRANSFER_CHUNK_BYTES: CHUNK, IOS_TRANSFER_MAX_CHARS: MAX } = await import(pathToFileURL(resolve(fixture, 'ios_audio_transfer.mjs')));
const { createSafariEvaluate, IOS_AUDIO_PIN } = await import(pathToFileURL(resolve(fixture, 'ios_audio_capture.mjs')));
const checks = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = async (name, fn) => { await fn(); checks.push({ name, passed: true }); };

async function setup() {
  const transfer = createIosAudioTransfer();
  const server = createServer((req, res) => { if (!transfer.handle(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  transfer.bind(`${origin}/`);
  return { transfer, origin, server,
    close: async () => { transfer.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
function metadata(env, op, bytes, chars, offset = 0, sequence = 0) {
  return { origin: env.origin, host: new URL(env.origin).host,
    'content-type': 'application/octet-stream', 'content-length': String(Math.min(CHUNK, bytes.length - offset)),
    'x-cinderline-id': '1', 'x-cinderline-offset': String(offset), 'x-cinderline-sequence': String(sequence),
    'x-cinderline-total': String(bytes.length), 'x-cinderline-chars': String(chars), 'x-cinderline-sha256': hash(bytes) };
}
function send(env, op, bytes, headers, { method = 'POST', path = op.path, end = true } = {}) {
  let req;
  const result = new Promise(resolve => {
    req = request(`${env.origin}${path}`, { method, headers, timeout: 1500 }, res => {
      const chunks = [];
      res.on('data', b => chunks.push(b));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      res.on('error', error => resolve({ error: error.message }));
    });
    req.on('timeout', () => req.destroy(new Error('fixture request timeout')));
    req.on('error', error => resolve({ error: error.message }));
    if (end) req.end(bytes); else if (bytes.length) req.write(bytes);
  });
  return { req, result };
}
async function validUpload(env, json, id = 1) {
  const bytes = Buffer.from(json), op = env.transfer.begin({ id, chars: json.length, deadline: Date.now() + 2000 });
  for (let offset = 0, sequence = 0; offset < bytes.length; offset += CHUNK, sequence++) {
    const headers = metadata(env, op, bytes, json.length, offset, sequence);
    headers['x-cinderline-id'] = String(id);
    const response = await send(env, op, bytes.subarray(offset, offset + CHUNK), headers).result;
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { id, sequence, offset, receivedBytes: Math.min(bytes.length, offset + CHUNK), complete: offset + CHUNK >= bytes.length });
  }
  assert.equal(await op.result, json);
  return op;
}
async function rejectsUpload(name, mutate, expected) {
  await check(name, async () => {
    const env = await setup();
    try {
      const json = JSON.stringify({ original: '日本語😀', sample: 1 }), bytes = Buffer.from(json);
      const op = env.transfer.begin({ id: 1, chars: json.length, deadline: Date.now() + 1000 });
      const data = { bytes, headers: metadata(env, op, bytes, json.length), options: {} };
      mutate(data, { env, op, json });
      const rejected = assert.rejects(op.result, expected);
      await send(env, op, data.bytes, data.headers, data.options).result;
      await rejected;
      assert.equal(env.transfer.receipts[0].status, 'failed');
      assert.equal(env.transfer.receipts[0].receivedBytes, 0);
    } finally { await env.close(); }
  });
}
function page(env, { corruptAck = false, failPoll = false } = {}) {
  const calls = [];
  const context = vm.createContext({ window: {}, crypto: webcrypto, TextEncoder, AbortController, setTimeout, clearTimeout,
    fetch: async (path, options) => {
      const response = await fetch(`${env.origin}${path}`, { ...options, headers: { ...options.headers, origin: env.origin } });
      if (!corruptAck) return response;
      return { ok: response.ok, status: response.status, json: async () => ({ ...(await response.json()), offset: -1 }) };
    } });
  const execute = async (script, args = [], timeout) => {
    calls.push({ script, timeout });
    if (failPoll && script.includes('upload:j.upload')) throw new Error('fixture WebDriver progress failure');
    context.__args = args;
    const value = vm.runInContext(`(function(){${script}\n}).apply(null,__args)`, context);
    return value === undefined ? null : JSON.parse(JSON.stringify(value));
  };
  return { execute, calls, context };
}

try {
  await check('fixed production bounds and C37 adoption pins retained', async () => {
    assert.equal(CHUNK, 131072); assert.equal(MAX, 50331648);
    assert.deepEqual(IOS_AUDIO_PIN, { preparedFromCommit: '789f2199bd3791a6dc6566eecaf3c1478c99afa6', preparationReportSha256: '2dbf5a5b15424ccd2e1e33e628391fad46084f4ec46686b70db1023d9061bf69', bundle: 'cinderline.1.0.0.js', bundleSha256: '1094c1d96bed6b953c1655ce65549c484b8f09e275f055bff283499cece110f7', recorderBlob: '785541d3beaed0e35e8bcf042973eabb7bdb5d6c' });
  });
  await check('loopback binding, single active slot, char cap and absolute deadline guards', async () => {
    for (const url of ['https://127.0.0.1:12/', 'http://localhost:12/', 'http://127.0.0.1:12/x', 'http://user@127.0.0.1:12/', 'http://127.0.0.1:12/?x']) assert.throws(() => createIosAudioTransfer().bind(url));
    const env = await setup();
    try {
      assert.throws(() => env.transfer.bind(`${env.origin}/`));
      for (const fields of [{ chars: MAX + 1 }, { chars: 0 }, { chars: 1.5 }, { id: 0 }, { deadline: Date.now() - 1 }, { deadline: Date.now() + 120001 }]) assert.throws(() => env.transfer.begin({ id: 1, chars: 2, deadline: Date.now() + 1000, ...fields }));
      const op = env.transfer.begin({ id: 1, chars: 2, deadline: Date.now() + 1000 });
      assert.throws(() => env.transfer.begin({ id: 2, chars: 2, deadline: Date.now() + 1000 }));
      op.cancel(new Error('fixture cancellation')); await assert.rejects(op.result, /fixture cancellation/);
    } finally { await env.close(); }
  });
  await check('exact original JSON with non-BMP, escaped lone surrogates, multibyte wire boundary and new nonce', async () => {
    const env = await setup();
    try {
      const json = JSON.stringify({ data: 'a'.repeat(CHUNK - 12) + '日本語😀e\u0301\ud800' + 'z'.repeat(CHUNK) });
      const first = await validUpload(env, json);
      const next = await validUpload(env, 'null', 2);
      assert.notEqual(first.path, next.path);
      assert.equal(env.transfer.receipts[0].sha256, hash(Buffer.from(json)));
      assert.equal(env.transfer.receipts[0].chunks, 3);
      const replay = await send(env, first, Buffer.from('null'), metadata(env, first, Buffer.from('null'), 4)).result;
      assert.equal(replay.status, 404);
      assert.equal(env.transfer.receipts[0].status, 'received');
    } finally { await env.close(); }
  });
  for (const [name, mutate] of [
    ['wrong origin', d => { d.headers.origin = 'http://localhost:1'; }],
    ['wrong host', d => { d.headers.host = 'localhost:1'; }],
    ['wrong method', d => { d.options.method = 'PUT'; }],
    ['wrong content type', d => { d.headers['content-type'] = 'text/plain'; }],
    ['wrong operation id', d => { d.headers['x-cinderline-id'] = '2'; }],
    ['noncanonical integer', d => { d.headers['x-cinderline-offset'] = '00'; }],
    ['wrong offset', d => { d.headers['x-cinderline-offset'] = '1'; }],
    ['wrong sequence', d => { d.headers['x-cinderline-sequence'] = '1'; }],
    ['wrong char count', d => { d.headers['x-cinderline-chars'] = '1'; }],
    ['total above UTF8 bound', d => { d.headers['x-cinderline-total'] = String(MAX * 3 + 1); }],
    ['wire length above chunk cap', d => { d.headers['content-length'] = String(CHUNK + 1); }],
    ['malformed digest', d => { d.headers['x-cinderline-sha256'] = 'z'.repeat(64); }],
  ]) await rejectsUpload(name, mutate, /mismatch/);
  await check('same-length payload corruption fails actual SHA256', async () => {
    const env = await setup();
    try {
      const bytes = Buffer.from('{"x":1}'), op = env.transfer.begin({ id: 1, chars: bytes.length, deadline: Date.now() + 1000 });
      const headers = metadata(env, op, bytes, bytes.length); const changed = Buffer.from('{"x":2}');
      const rejected = assert.rejects(op.result, /SHA256 mismatch/);
      await send(env, op, changed, headers).result; await rejected;
    } finally { await env.close(); }
  });
  await check('valid digest still rejects malformed UTF8 and invalid JSON', async () => {
    for (const bytes of [Buffer.from([0x22, 0xc0, 0xaf, 0x22]), Buffer.from('oops')]) {
      const env = await setup();
      try {
        const op = env.transfer.begin({ id: 1, chars: bytes.length, deadline: Date.now() + 1000 });
        const rejected = assert.rejects(op.result);
        await send(env, op, bytes, metadata(env, op, bytes, bytes.length)).result; await rejected;
      } finally { await env.close(); }
    }
  });
  await check('unknown session/operation and query path do not contaminate active slot', async () => {
    const env = await setup();
    try {
      const bytes = Buffer.from('null'), op = env.transfer.begin({ id: 1, chars: 4, deadline: Date.now() + 1000 });
      for (const path of [op.path + '0', op.path + '?x=1', op.path.replace(/([a-f0-9]{48})/, '0'.repeat(48))]) {
        const result = await send(env, op, bytes, metadata(env, op, bytes, 4), { path }).result;
        assert.equal(result.status, 404); assert.equal(env.transfer.receipts[0].status, 'pending');
      }
      await send(env, op, bytes, metadata(env, op, bytes, 4)).result;
      assert.equal(await op.result, 'null');
    } finally { await env.close(); }
  });
  await check('duplicate chunk rejects and no incomplete payload resolves', async () => {
    const env = await setup();
    try {
      const json = JSON.stringify('x'.repeat(CHUNK + 10)), bytes = Buffer.from(json);
      const op = env.transfer.begin({ id: 1, chars: json.length, deadline: Date.now() + 1000 });
      const headers = metadata(env, op, bytes, json.length);
      assert.equal((await send(env, op, bytes.subarray(0, CHUNK), headers).result).status, 200);
      const rejected = assert.rejects(op.result, /mismatch/);
      await send(env, op, bytes.subarray(0, CHUNK), headers).result; await rejected;
      assert.equal(env.transfer.receipts[0].receivedBytes, CHUNK);
    } finally { await env.close(); }
  });
  await check('later total or digest change cannot replace original operation metadata', async () => {
    for (const changed of ['x-cinderline-total', 'x-cinderline-sha256']) {
      const env = await setup();
      try {
        const json = JSON.stringify('x'.repeat(CHUNK + 10)), bytes = Buffer.from(json);
        const op = env.transfer.begin({ id: 1, chars: json.length, deadline: Date.now() + 1000 });
        await send(env, op, bytes.subarray(0, CHUNK), metadata(env, op, bytes, json.length)).result;
        const headers = metadata(env, op, bytes, json.length, CHUNK, 1);
        headers[changed] = changed.endsWith('total') ? String(bytes.length - 1) : '0'.repeat(64);
        const rejected = assert.rejects(op.result, /mismatch/);
        await send(env, op, bytes.subarray(CHUNK), headers).result; await rejected;
      } finally { await env.close(); }
    }
  });
  await check('concurrent partial HTTP request fails operation and closes both requests', async () => {
    const env = await setup();
    try {
      const bytes = Buffer.from('{"x":1}'), op = env.transfer.begin({ id: 1, chars: bytes.length, deadline: Date.now() + 1000 });
      const first = send(env, op, bytes.subarray(0, 2), metadata(env, op, bytes, bytes.length), { end: false });
      await pause(15);
      const rejected = assert.rejects(op.result, /concurrent request/);
      const next = send(env, op, bytes, metadata(env, op, bytes, bytes.length));
      await rejected; await Promise.all([first.result, next.result]);
      assert.equal(env.transfer.receipts[0].receivedBytes, 0);
    } finally { await env.close(); }
  });
  await check('client abort fails an incomplete operation', async () => {
    const env = await setup();
    try {
      const bytes = Buffer.from('{"x":1}'), op = env.transfer.begin({ id: 1, chars: bytes.length, deadline: Date.now() + 1000 });
      const first = send(env, op, bytes.subarray(0, 2), metadata(env, op, bytes, bytes.length), { end: false });
      await pause(15); const rejected = assert.rejects(op.result, /aborted|request error/);
      first.req.destroy(); await rejected; await first.result;
    } finally { await env.close(); }
  });
  await check('receiving chunks does not extend original deadline and late final is rejected', async () => {
    const env = await setup();
    try {
      const json = JSON.stringify('x'.repeat(CHUNK + 10)), bytes = Buffer.from(json), deadline = Date.now() + 200;
      const op = env.transfer.begin({ id: 1, chars: json.length, deadline });
      const rejected = assert.rejects(op.result, /timed out/);
      await send(env, op, bytes.subarray(0, CHUNK), metadata(env, op, bytes, json.length)).result;
      await pause(Math.max(0, deadline - Date.now()) + 30); await rejected;
      const late = await send(env, op, bytes.subarray(CHUNK), metadata(env, op, bytes, json.length, CHUNK, 1)).result;
      assert.equal(late.status, 404); assert.equal(env.transfer.receipts[0].receivedBytes, CHUNK);
      assert.ok(env.transfer.receipts[0].elapsedMs < 1000);
    } finally { await env.close(); }
  });
  await check('receiver close destroys partial socket and preserves failed receipt for next operation', async () => {
    const env = await setup();
    try {
      const bytes = Buffer.from('{"x":1}'), op = env.transfer.begin({ id: 1, chars: bytes.length, deadline: Date.now() + 1000 });
      const partial = send(env, op, bytes.subarray(0, 2), metadata(env, op, bytes, bytes.length), { end: false });
      await pause(15); env.transfer.close();
      await assert.rejects(op.result, /closed before completion/);
      const ended = await partial.result;
      assert.ok(ended.error || ended.status >= 400, `partial HTTP request must terminate as failure: ${JSON.stringify(ended)}`);
      await pause(0);
      assert.equal(partial.req.socket?.destroyed, true);
      const failure = structuredClone(env.transfer.receipts[0]);
      await validUpload(env, 'true', 2);
      assert.deepEqual(env.transfer.receipts[0], failure);
    } finally { await env.close(); }
  });
  await check('serialized evaluator preserves exact JSON through real HTTP and keeps small values off HTTP', async () => {
    const env = await setup();
    try {
      const p = page(env), evaluate = createSafariEvaluate(p.execute, { transfer: env.transfer, timeoutMs: 2000, pollMs: 2 });
      const value = { original: '日本語😀'.repeat(50000), omitted: undefined, zero: 0, flag: false };
      assert.equal(JSON.stringify(await evaluate(x => x, value)), JSON.stringify(value));
      assert.equal(env.transfer.receipts.length, 1);
      assert.equal(await evaluate(() => true), true);
      assert.equal(await evaluate(() => undefined), null);
      assert.equal(env.transfer.receipts.length, 1);
      assert.ok(p.calls.every(c => Number.isInteger(c.timeout) && c.timeout > 0 && c.timeout <= 2000));
      assert.equal(p.context.window.__cinderlineIosAudioTransfer, undefined);
    } finally { await env.close(); }
  });
  await check('concurrent evaluate is rejected before slot mutation and guard releases after failure', async () => {
    const env = await setup();
    try {
      const p = page(env), evaluate = createSafariEvaluate(p.execute, { transfer: env.transfer, timeoutMs: 2000, pollMs: 2 });
      const first = evaluate(async () => { await new Promise(resolve => setTimeout(resolve, 20)); return 42; });
      await assert.rejects(evaluate(() => 99), /Concurrent Safari audio evaluation/);
      assert.equal(await first, 42);
      await assert.rejects(evaluate(() => { throw new Error('fixture original operation failed'); }), /fixture original operation failed/);
      assert.equal(await evaluate(() => true), true);
    } finally { await env.close(); }
  });
  for (const kind of ['corruptAck', 'failPoll']) await check(`${kind}: primary evaluation failure survives later shared-style cleanup`, async () => {
    const env = await setup();
    try {
      const p = page(env, { [kind]: true }), evaluate = createSafariEvaluate(p.execute, { transfer: env.transfer, timeoutMs: 2000, pollMs: 2 });
      await assert.rejects(evaluate(x => x, { bytes: 'x'.repeat(CHUNK + 100) }), kind === 'corruptAck' ? /acknowledgement mismatch/ : /fixture WebDriver progress failure/);
      assert.equal(env.transfer.receipts.length, 1);
      const first = structuredClone(env.transfer.receipts[0]);
      assert.match(first.evaluationFailure, kind === 'corruptAck' ? /acknowledgement mismatch/ : /fixture WebDriver progress failure/);
      assert.equal(await evaluate(() => true), true);
      assert.deepEqual(env.transfer.receipts[0], first);
    } finally { await env.close(); }
  });
  const candidatePins = Object.fromEntries(['ios_audio_transfer.mjs', 'ios_audio_capture.mjs', 'test-ios-safari.mjs'].map(name => {
    const bytes = readFileSync(resolve(SCOPE, 'candidate/tools', name));
    if (name !== 'test-ios-safari.mjs') assert.equal(hash(bytes), hash(readFileSync(resolve(fixture, name))), 'candidate changed during independent tests');
    return [name, { bytes: bytes.length, sha256: hash(bytes) }];
  }));
  const receipt = { status: 'passed', checks, checkCount: checks.length, candidatePins,
    scope: 'Independent local actual Node HTTP sockets, VM serialized page functions, WebCrypto and malformed protocol fixtures; no Safari, recording, listening, quality result or CI execution.',
    remoteMutations: 0, ciStarts: 0, retries: 0, quality: { all19: 'not measured', validBlind: 0, units: 0, mode: 'continuous' } };
  writeFileSync(resolve(HERE, 'verification.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ status: receipt.status, checkCount: checks.length, candidatePins }));
} catch (error) {
  writeFileSync(resolve(HERE, 'verification-failure.json'), JSON.stringify({ status: 'failed', checks, error: error.stack }, null, 2) + '\n');
  throw error;
}
