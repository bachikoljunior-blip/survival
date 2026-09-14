import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const root = new URL('../', import.meta.url);
const workspace = new URL('../../', import.meta.url);
const source = readFileSync(new URL('base/tools/ios_audio_capture.mjs', root), 'utf8');
const candidate = readFileSync(new URL('candidate/tools/ios_audio_capture.mjs', root), 'utf8');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const results = [];
const sourceInputs = [];
const started = performance.now();
async function test(name, fn) {
  const start = performance.now();
  const detail = await fn();
  results.push({ name, passed: true, cpuElapsedMs: performance.now() - start, ...(detail && { detail }) });
}
function originalFile(relative) {
  const url = new URL(relative, workspace), bytes = readFileSync(url);
  sourceInputs.push({ path: relative, bytes: bytes.length, sha256: hash(bytes) });
  return bytes;
}

// Execute the real adapter function and its generated browser scripts in a CPU
// VM. Only Date/setTimeout and WebDriver delivery are modeled. No browser,
// recorder, game clocks, build or CI result is replaced with a passing fixture.
function apparatus(text = candidate, { latencyMs = 0, mutate, initialJob } = {}) {
  const constants = ['TRANSFER_KEY', 'CHUNK_CHARS', 'MAX_TRANSFER_CHARS'].map(name => {
    const match = text.match(new RegExp(`^const ${name} = .+;$`, 'm'));
    assert(match, `missing exact constant ${name}`); return match[0];
  }).join('\n');
  const begin = text.indexOf('export function createSafariEvaluate(');
  const end = text.indexOf('\n// Inspect only the existing production context.', begin);
  assert(begin >= 0 && end > begin);
  let clockMs = 0;
  const metadata = { requests: 0, chunkRequests: 0, returnedChars: 0, maxChunkChars: 0 };
  const context = vm.createContext({
    window: initialJob ? { __cinderlineIosAudioTransfer: initialJob } : {},
    Date: { now: () => clockMs },
    setTimeout: (resolve, ms) => { clockMs += ms; queueMicrotask(resolve); },
  });
  vm.runInContext(`${constants}\nconst delay = ms => new Promise(resolve => setTimeout(resolve, ms));\n` +
    text.slice(begin, end).replace('export function', 'function'), context);
  const execute = async (script, args = []) => {
    metadata.requests++;
    clockMs += latencyMs;
    if (script.includes('text:j.json.slice')) metadata.chunkRequests++;
    const fn = vm.runInContext(`(function () { ${script}\n})`, context);
    let reply = fn.apply(null, JSON.parse(JSON.stringify(args)));
    reply = reply === undefined ? null : JSON.parse(JSON.stringify(reply));
    if (mutate) reply = mutate(reply, script);
    if (typeof reply?.text === 'string') {
      metadata.returnedChars += reply.text.length;
      metadata.maxChunkChars = Math.max(metadata.maxChunkChars, reply.text.length);
    }
    return reply;
  };
  return {
    context,
    evaluate: options => {
      const evaluate = vm.runInContext('createSafariEvaluate', context)(execute, { pollMs: 0, ...options });
      // Normalize VM prototypes only; the real function already returns JSON.
      return async (fn, arg) => JSON.parse(JSON.stringify(await evaluate(fn, arg)));
    },
    stats: () => ({ ...metadata, modeledElapsedMs: clockMs }),
  };
}
const identity = x => x;

await test('production diff is exactly one chunk-width constant; all pins, deadlines, capacity and guards unchanged', () => {
  assert.equal(candidate, source.replace('const CHUNK_CHARS = 32768;', 'const CHUNK_CHARS = 131072;'));
  assert.match(candidate, /timeoutMs = 120000/);
  assert.match(candidate, /const MAX_TRANSFER_CHARS = 48 \* 1024 \* 1024;/);
  return { sourceSha256: hash(source), candidateSha256: hash(candidate), oldChunkChars: 32768, newChunkChars: 131072 };
});

const reportBytes = originalFile('c30-ios-original-recovered/original/report.json');
const report = JSON.parse(reportBytes);
const restoredOriginalValues = report.audioCapture.clips.map(clip => {
  const bytes = originalFile(`c30-ios-original-recovered/original/audio/audio-${clip.name}.mp4`);
  assert.equal(bytes.length, clip.bytes); assert.equal(hash(bytes), clip.sha256);
  return { after: clip.after, telemetry: clip.telemetry, mime: clip.mime,
    bytes: clip.bytes, base64: bytes.toString('base64') };
});
await test('original three complete media/telemetry values survive a >8 MiB aggregate JSON CPU transfer', async () => {
  // Aggregation is a CPU stress envelope, not a claim that Safari emits all
  // three clips in one response. Individual original values are unmodified.
  const input = restoredOriginalValues, inputJson = JSON.stringify(input);
  assert(Buffer.byteLength(inputJson) > 8 * 1024 * 1024);
  const a = apparatus(), output = await a.evaluate()(identity, input);
  assert.deepEqual(output, input);
  assert.equal(hash(JSON.stringify(output)), hash(inputJson));
  output.forEach((value, i) => assert.equal(hash(Buffer.from(value.base64, 'base64')), report.audioCapture.clips[i].sha256));
  assert.equal(a.context.window.__cinderlineIosAudioTransfer, undefined);
  return { jsonUtf8Bytes: Buffer.byteLength(inputJson), jsonChars: inputJson.length, jsonSha256: hash(inputJson), ...a.stats() };
});
await test('each original clip response survives separately without modifying media or telemetry', async () => {
  const details = [];
  for (const value of restoredOriginalValues) {
    const a = apparatus(); assert.deepEqual(await a.evaluate()(identity, value), value);
    details.push({ jsonChars: JSON.stringify(value).length, ...a.stats() });
  }
  return details;
});

for (const serializedChars of [131071, 131072, 131073, 262144]) {
  await test(`exact serialized length ${serializedChars} preserves final chunk and offsets`, async () => {
    const input = 'x'.repeat(serializedChars - 2), a = apparatus();
    assert.equal(await a.evaluate()(identity, input), input);
    assert.equal(a.stats().chunkRequests, Math.ceil(serializedChars / 131072));
    assert.equal(a.stats().returnedChars, serializedChars);
  });
}
for (const [name, token] of [['surrogate pair', '🌋'], ['escaped quote', '"'],
  ['escaped backslash', '\\'], ['escaped newline', '\n'], ['escaped lone surrogate', '\ud800']]) {
  await test(`${name} split at actual 128 Ki UTF-16 boundary reconstructs exactly`, async () => {
    const input = { text: 'x'.repeat(131072 - 1 - '{"text":"'.length) + token + 'tail日本語' };
    const serialized = JSON.stringify(input), a = apparatus();
    assert.equal(serialized.charAt(131072 - 2), 'x');
    assert.deepEqual(await a.evaluate()(identity, input), input);
    assert.equal(a.stats().chunkRequests, 2);
  });
}

const slowInput = { base64: 'A'.repeat(8 * 1024 * 1024) };
await test('same 120000 ms deadline: old 32 Ki chunks time out under declared 600 ms/command CPU model', async () => {
  const a = apparatus(source, { latencyMs: 600 });
  await assert.rejects(a.evaluate()(identity, slowInput), /chunk transfer timed out/);
  assert.equal(a.stats().modeledElapsedMs, 120000);
  assert(a.stats().returnedChars < JSON.stringify(slowInput).length);
  return { model: 'Fixed 600 ms per WebDriver response, including start/status/cleanup; no claim of measured Safari latency.', ...a.stats() };
});
await test('same 120000 ms deadline: 128 Ki chunks complete identical >8 MiB input under same model', async () => {
  const a = apparatus(candidate, { latencyMs: 600 });
  assert.deepEqual(await a.evaluate()(identity, slowInput), slowInput);
  assert(a.stats().modeledElapsedMs < 120000);
  return { jsonUtf8Bytes: Buffer.byteLength(JSON.stringify(slowInput)), ...a.stats() };
});
await test('new chunks still reject transfer timeout when modeled latency exceeds the unchanged budget', async () => {
  const a = apparatus(candidate, { latencyMs: 2000 });
  await assert.rejects(a.evaluate()(identity, slowInput), /chunk transfer timed out/);
  assert.equal(a.stats().modeledElapsedMs, 120000);
  return a.stats();
});

for (const [name, change] of [
  ['wrong offset', p => ({ ...p, offset: p.offset + 1 })],
  ['wrong id', p => ({ ...p, id: p.id + 1 })],
  ['truncated text', p => ({ ...p, text: p.text.slice(1) })],
  ['missing text', p => ({ ...p, text: null })],
]) await test(`${name} remains rejected`, async () => {
  const a = apparatus(candidate, { mutate: p => typeof p?.text === 'string' ? change(p) : p });
  await assert.rejects(a.evaluate()(identity, 'original'), /missing or truncated/);
});
await test('changed status identity remains rejected', async () => {
  const a = apparatus(candidate, { mutate: p => p?.status === 'ready' ? { ...p, id: p.id + 1 } : p });
  await assert.rejects(a.evaluate()(identity, 'original'), /identity changed/);
});
await test('bad start identity remains rejected', async () => {
  const a = apparatus(candidate, { mutate: p => p?.status === 'pending' ? { ...p, id: 999 } : p });
  await assert.rejects(a.evaluate()(identity, 'original'), /start mismatch/);
});
for (const chars of [0, -1, 1.5, 48 * 1024 * 1024 + 1]) {
  await test(`declared invalid result length ${chars} remains rejected`, async () => {
    const a = apparatus(candidate, { mutate: p => p?.status === 'ready' ? { ...p, chars } : p });
    await assert.rejects(a.evaluate()(identity, 'original'), /length is invalid/);
  });
}
await test('actual 48 Mi-character default cap refuses oversized page JSON before any chunk transfer', async () => {
  const a = apparatus();
  await assert.rejects(a.evaluate()(() => 'x'.repeat(48 * 1024 * 1024)), /bounded capacity/);
  assert.equal(a.stats().chunkRequests, 0);
});
await test('exact custom cap boundary accepts capacity and rejects capacity plus one', async () => {
  const a = apparatus();
  assert.equal(await a.evaluate({ maxTransferChars: 20 })(identity, 'x'.repeat(18)), 'x'.repeat(18));
  await assert.rejects(a.evaluate({ maxTransferChars: 20 })(identity, 'x'.repeat(19)), /bounded capacity/);
});
await test('never-settling operation still times out and pending work cannot be overwritten', async () => {
  const a = apparatus(candidate, { latencyMs: 1000 }), evaluate = a.evaluate();
  await assert.rejects(evaluate(() => new Promise(() => {})), /polling timed out/);
  await assert.rejects(evaluate(() => true), /prior iOS audio operation still pending/);
});
await test('page-side error remains failed and cannot produce a clip', async () => {
  const a = apparatus();
  await assert.rejects(a.evaluate()(async () => { throw new Error('fixture page error'); }), /Safari audio operation failed: fixture page error/);
});
await test('invalid JSON of correct advertised length remains rejected by parse', async () => {
  const a = apparatus(candidate, { mutate: p => typeof p?.text === 'string' ? { ...p, text: 'x'.repeat(p.text.length) } : p });
  await assert.rejects(a.evaluate()(identity, 'original'), /Unexpected token/);
});
await test('all original report/media files retain their starting byte hashes', () => {
  for (const input of sourceInputs) {
    const bytes = readFileSync(new URL(input.path, workspace));
    assert.equal(bytes.length, input.bytes); assert.equal(hash(bytes), input.sha256);
  }
});

const result = {
  scope: 'CPU transport/control verification only. Virtual elapsed times are explicit performance-model assumptions, not actual Safari measurements or acquisition/quality passes.',
  cpuElapsedMs: performance.now() - started,
  passed: results.length, failed: 0, results, sourceInputs,
  unchangedDeadlineMeaning: 'Existing deadline checks between commands only; an in-flight command can exceed the deadline by its bounded command timeout. This one-line candidate preserves that behavior.',
  actualSafariCandidateRuns: 0, comparisons: 0,
};
writeFileSync(new URL('evidence/transport-controls.json', root), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ passed: result.passed, failed: result.failed, cpuElapsedMs: result.cpuElapsedMs,
  modeledRuns: results.filter(r => r.name.includes('120000 ms')).map(r => ({ name: r.name, ...r.detail })) }, null, 2));
