import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createIosAudioTransfer } from '../candidate/tools/ios_audio_transfer.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const cases = [];
for (const kind of ['unknown operation nonce', 'known nonce with malformed origin']) {
  const transfer = createIosAudioTransfer();
  const server = createServer((req, res) => { assert.equal(transfer.handle(req, res), true); });
  let socketClosed;
  server.once('connection', socket => { socketClosed = new Promise(resolve => socket.once('close', resolve)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  transfer.bind(origin + '/');
  const op = transfer.begin({ id: 1, chars: 2, deadline: Date.now() + 2000 });
  let timer, client;
  const started = performance.now();
  try {
    const result = await new Promise(resolve => {
      client = request(origin + op.path + (kind.startsWith('unknown') ? '0' : ''), {
        method: 'POST', headers: { origin: kind.startsWith('known') ? 'http://localhost:1' : origin,
          'content-type': 'application/octet-stream', 'content-length': '2',
          'x-cinderline-id': '1', 'x-cinderline-offset': '0', 'x-cinderline-sequence': '0',
          'x-cinderline-total': '2', 'x-cinderline-chars': '2', 'x-cinderline-sha256': hash(Buffer.from('{}')) },
      }, response => {
        const chunks = [];
        response.on('data', data => chunks.push(data));
        response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }));
        response.on('error', error => resolve({ error: error.message }));
      });
      client.on('error', error => resolve({ error: error.message }));
      client.write('{'); // Deliberately omit the second byte and never call end().
    });
    assert.ok(result.error || result.status === (kind.startsWith('unknown') ? 404 : 400));
    assert.ok(socketClosed);
    await Promise.race([socketClosed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('rejected partial-body server socket remained open')), 500); })]);
    clearTimeout(timer);
    if (kind.startsWith('unknown')) {
      assert.equal(transfer.receipts[0].status, 'pending');
      op.cancel(new Error('fixture completion')); await assert.rejects(op.result, /fixture completion/);
    } else await assert.rejects(op.result, /origin or content type mismatch/);
    await new Promise(resolve => server.close(resolve));
    cases.push({ kind, passed: true, result, elapsedMs: performance.now() - started, bodyBytesSent: 1, declaredBytes: 2,
      clientEndCalled: false, serverSocketClosed: true, forcedCloseUsed: false });
  } finally {
    clearTimeout(timer); transfer.close(); client?.destroy(); server.closeAllConnections(); server.close();
  }
}
const names = ['ios_audio_transfer.mjs', 'ios_audio_capture.mjs', 'test-ios-safari.mjs'];
const candidatePins = Object.fromEntries(names.map(name => {
  const bytes = readFileSync(resolve(HERE, '../candidate/tools', name));
  return [name, { bytes: bytes.length, sha256: hash(bytes), gitBlob: createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex') }];
}));
const prior = JSON.parse(readFileSync(resolve(HERE, 'verification.json')));
for (const name of names.slice(1)) assert.deepEqual({ bytes: candidatePins[name].bytes, sha256: candidatePins[name].sha256 }, prior.candidatePins[name]);
const oldSource = readFileSync(resolve(HERE, 'fixture/tools/ios_audio_transfer.mjs'), 'utf8');
const newSource = readFileSync(resolve(HERE, '../candidate/tools/ios_audio_transfer.mjs'), 'utf8');
const expected = oldSource
  .replace("        respond(response, 404, { operationError: 'unknown transfer operation' });", "        response.once('finish', () => request.destroy());\n        respond(response, 404, { operationError: 'unknown transfer operation' });")
  .replace("        if (!response.headersSent && !response.destroyed) respond(response, 400, { operationError: message });", "        if (!response.headersSent && !response.destroyed) {\n          response.once('finish', () => request.destroy());\n          respond(response, 400, { operationError: message });\n        } else request.destroy();");
assert.equal(newSource, expected, 'final module delta must be exactly the two rejected-request cleanup changes');
const receipt = { status: 'passed', checkCount: 1, cases, candidatePins, exactDeltaFrom28CheckVersionVerified: true,
  scope: 'One finite rejection-cleanup regression with two actual incomplete HTTP request cases; no Safari, CI, recording or quality measurement.' };
writeFileSync(resolve(HERE, 'rejected-socket-verification.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
