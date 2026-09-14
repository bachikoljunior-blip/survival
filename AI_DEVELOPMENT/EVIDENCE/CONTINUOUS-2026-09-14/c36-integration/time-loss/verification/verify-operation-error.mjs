import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import vm from 'node:vm';
import { writeFileSync } from 'node:fs';
import { requestWebDriver } from '../source/tools/webdriver-request.mjs';
import { createSafariEvaluate as oldEvaluate } from '../source/tools/ios_audio_capture.mjs';
import { createSafariEvaluate as newEvaluate } from './runtime/tools/ios_audio_capture.mjs';

const context = vm.createContext({ window: {} });
const chunkLengths = [];
const server = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  const { script, args = [] } = JSON.parse(raw);
  let value, status = 200;
  try { context.__args = args; value = vm.runInContext(`(function(){${script}}).apply(null,__args)`, context); }
  catch (error) { status = 500; value = { error: 'javascript error', message: error.message }; }
  if (typeof value?.text === 'string') chunkLengths.push(value.text.length);
  res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ value }));
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const execute = (script, args = []) => requestWebDriver(`http://127.0.0.1:${server.address().port}/execute/sync`, { body: { script, args } });
let assertions = 0;
try {
  await assert.rejects(oldEvaluate(execute, { pollMs: 0 })(() => { throw new Error('recording failure sentinel'); }), /HTTP 200/); assertions++;
  assert.equal(context.window.__cinderlineIosAudioTransfer.error, 'recording failure sentinel'); assertions++;
  await assert.rejects(newEvaluate(execute, { pollMs: 0 })(() => { throw new Error('recording failure sentinel'); }), /Safari audio operation failed: recording failure sentinel/); assertions++;
  assert.equal(context.window.__cinderlineIosAudioTransfer.error, 'recording failure sentinel'); assertions++;
  const final = await execute('var j=window.__cinderlineIosAudioTransfer;return {id:j.id,status:j.status,chars:j.chars,operationError:j.error};');
  assert.equal(final.operationError, 'recording failure sentinel'); assertions++;
  assert.equal(final.status, 'failed'); assertions++;
  assert.equal(Object.hasOwn(final, 'error'), false); assertions++;
  const success = await newEvaluate(execute, { pollMs: 0 })(() => ({ error: 'ordinary returned data', count: 17 }));
  assert.deepEqual(success, { error: 'ordinary returned data', count: 17 }); assertions++;
  assert.equal(context.window.__cinderlineIosAudioTransfer, undefined); assertions++;
  await assert.rejects(execute("throw new Error('real W3C failure sentinel');"), /real W3C failure sentinel/); assertions++;
  const pending = { id: 777, status: 'pending', error: 'original operation retained' };
  context.window.__cinderlineIosAudioTransfer = pending;
  const large = await newEvaluate(execute, { pollMs: 0, transferKey: '__diagnosticFixture' })(() => ({ rows: 'x'.repeat(300000) }));
  assert.equal(large.rows.length, 300000); assertions++;
  assert.equal(context.window.__cinderlineIosAudioTransfer, pending); assertions++;
  assert.equal(context.window.__cinderlineIosAudioTransfer.error, 'original operation retained'); assertions++;
  assert.equal(context.window.__diagnosticFixture, undefined); assertions++;
  assert.ok(chunkLengths.length >= 3 && chunkLengths.every(n => n <= 131072)); assertions++;
  await assert.rejects(newEvaluate(execute, { pollMs: 0, maxTransferChars: 16, transferKey: '__diagnosticFixture' })(() => 'x'.repeat(100)), /bounded capacity/); assertions++;
  assert.equal(context.window.__cinderlineIosAudioTransfer, pending); assertions++;
  const result = { status: 'pass', passed: assertions, transport: 'real local HTTP 200/500 through unchanged canonical requestWebDriver',
    oldFailure: 'HTTP 200; underlying recording failure sentinel retained only on page', newFailure: 'Safari audio operation failed: recording failure sentinel',
    isolatedDiagnosticTransfer: { payloadChars: 300000, chunkLengths, originalPendingAudioOperationPreserved: true },
    scope: 'CPU synthetic error identity propagation; the original C35 Safari recording error was not recovered by this fixture and its underlying cause remains unknown.' };
  writeFileSync(new URL('operation-error-result.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ passed: assertions, status: 'pass' }));
} finally { await new Promise(resolve => server.close(resolve)); }
