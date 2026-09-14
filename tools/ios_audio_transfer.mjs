/** Harness-only upload to the existing loopback DIST server after recording.
 * No new listener, public endpoint, product fetch, recorder or game-clock change.
 */
import { createHash, randomBytes } from 'node:crypto';

export const IOS_TRANSFER_CHUNK_BYTES = 128 * 1024;
export const IOS_TRANSFER_MAX_CHARS = 48 * 1024 * 1024;
const PREFIX = '/__cinderline_ios_audio_transfer/';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function createIosAudioTransfer() {
  const sessionNonce = randomBytes(24).toString('hex');
  let origin, active;
  const receipts = [];
  const respond = (response, status, value) => {
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify(value));
  };
  const finish = (op, error, json) => {
    if (op.finished) return;
    op.finished = true;
    clearTimeout(op.timer);
    if (active === op) active = null;
    op.receipt.elapsedMs = Date.now() - op.startedAt;
    op.receipt.status = error ? 'failed' : 'received';
    if (error) op.receipt.error = error.message;
    op.buffers = [];
    if (error) for (const request of op.requests) request.destroy(error);
    op.requests.clear();
    if (error) op.reject(error); else op.resolve(json);
  };
  return {
    receipts,
    bind(url) {
      if (origin) throw new Error('iOS audio transfer origin already bound');
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.port
        || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
        throw new Error('iOS audio transfer requires the existing loopback DIST origin');
      }
      origin = parsed.origin;
    },
    begin({ id, chars, deadline }) {
      const now = Date.now();
      if (!origin || active) throw new Error('iOS audio transfer unavailable or another operation is active');
      if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(chars) || chars < 1
        || chars > IOS_TRANSFER_MAX_CHARS || !Number.isSafeInteger(deadline)
        || deadline <= now || deadline > now + 120000 || receipts.length >= 128) {
        throw new Error('iOS audio transfer operation exceeds bounded capacity or deadline');
      }
      const path = `${PREFIX}${sessionNonce}/${randomBytes(24).toString('hex')}`;
      let resolve, reject;
      const result = new Promise((yes, no) => { resolve = yes; reject = no; });
      // A server rejection can arrive while the small WebDriver start reply is in flight.
      result.catch(() => {});
      const receipt = { id, chars, chunkBytes: IOS_TRANSFER_CHUNK_BYTES,
        maxTransferChars: IOS_TRANSFER_MAX_CHARS, deadline, receivedBytes: 0, chunks: 0, status: 'pending' };
      receipts.push(receipt);
      const op = active = { id, chars, deadline, path, startedAt: now, resolve, reject,
        receipt, buffers: [], requests: new Set(), bytes: 0, busy: false, finished: false };
      op.timer = setTimeout(() => finish(op, new Error('Safari audio upload timed out')), deadline - now);
      return { path, result, receipt, cancel: error => finish(op, error || new Error('Safari audio upload cancelled')) };
    },
    handle(request, response) {
      const path = new URL(request.url || '/', 'http://127.0.0.1').pathname;
      if (!path.startsWith(PREFIX)) return false;
      const op = active;
      if (!op || path !== op.path || request.url !== path) {
        response.once('finish', () => request.destroy());
        respond(response, 404, { operationError: 'unknown transfer operation' });
        request.resume(); return true;
      }
      const fail = message => {
        finish(op, new Error(message));
        if (!response.headersSent && !response.destroyed) {
          response.once('finish', () => request.destroy());
          respond(response, 400, { operationError: message });
        } else request.destroy();
        request.resume();
      };
      if (request.method !== 'POST' || request.headers.origin !== origin
        || request.headers.host !== new URL(origin).host
        || request.headers['content-type'] !== 'application/octet-stream') {
        fail('Safari audio upload method, origin or content type mismatch'); return true;
      }
      if (op.busy || Date.now() >= op.deadline) {
        fail('Safari audio upload concurrent request or expired deadline'); return true;
      }
      const integer = name => {
        const value = request.headers[name];
        return typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && Number.isSafeInteger(Number(value))
          ? Number(value) : NaN;
      };
      const id = integer('x-cinderline-id'), offset = integer('x-cinderline-offset');
      const sequence = integer('x-cinderline-sequence'), total = integer('x-cinderline-total');
      const chars = integer('x-cinderline-chars'), length = integer('content-length');
      const digest = request.headers['x-cinderline-sha256'];
      if (id !== op.id || offset !== op.bytes || sequence !== op.receipt.chunks || chars !== op.chars
        || !Number.isSafeInteger(total) || total < 1 || total > op.chars * 3
        || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)
        || length !== Math.min(IOS_TRANSFER_CHUNK_BYTES, total - offset) || length < 1
        || (op.total !== undefined && (total !== op.total || digest !== op.digest))) {
        fail('Safari audio upload identity, sequence, offset, length or hash metadata mismatch'); return true;
      }
      op.total = total; op.digest = digest; op.busy = true;
      let received = 0;
      const chunks = [];
      request.on('data', chunk => {
        if (op.finished) return;
        received += chunk.length;
        if (received > length || received > IOS_TRANSFER_CHUNK_BYTES || Date.now() >= op.deadline) {
          fail('Safari audio upload chunk exceeds length or deadline'); return;
        }
        chunks.push(chunk);
      });
      request.on('aborted', () => fail('Safari audio upload request aborted'));
      request.on('error', error => fail(`Safari audio upload request error: ${error.message}`));
      request.on('end', () => {
        op.requests.delete(request);
        if (op.finished) return;
        if (received !== length || Date.now() >= op.deadline) {
          fail('Safari audio upload chunk is truncated or late'); return;
        }
        op.buffers.push(Buffer.concat(chunks)); op.bytes += received; op.busy = false;
        op.receipt.receivedBytes = op.bytes; op.receipt.chunks++;
        if (op.bytes === total) {
          try {
            const bytes = Buffer.concat(op.buffers);
            if (sha256(bytes) !== digest) throw new Error('Safari audio upload SHA256 mismatch');
            const json = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
            if (json.length !== op.chars || !Buffer.from(json, 'utf8').equals(bytes)) {
              throw new Error('Safari audio upload decoded length or encoding mismatch');
            }
            JSON.parse(json);
            if (Date.now() >= op.deadline) throw new Error('Safari audio upload verification timed out');
            op.receipt.sha256 = digest;
            finish(op, null, json);
          } catch (error) { fail(error.message); return; }
        }
        respond(response, 200, { id, sequence, offset, receivedBytes: op.bytes, complete: op.finished });
      });
      request.on('close', () => op.requests.delete(request));
      op.requests.add(request);
      return true;
    },
    close() { if (active) finish(active, new Error('Safari audio transfer closed before completion')); },
  };
}

/** Serialized into the existing page by one small /execute/sync command.
 * The JSON was produced after the unchanged recorder stopped and cleaned up.
 */
export function startIosAudioUpload({ key, id, path, remainingMs, chunkBytes }) {
  const job = window[key];
  if (!job || job.id !== id || job.status !== 'ready' || job.upload) {
    throw new Error('Safari audio upload page identity mismatch');
  }
  if (!path.startsWith('/__cinderline_ios_audio_transfer/') || path.includes('?') || path.includes('#')
    || !Number.isInteger(remainingMs) || remainingMs < 1 || remainingMs > 120000
    || chunkBytes !== 131072 || !Number.isSafeInteger(job.chars) || job.chars > 50331648
    || job.chars < 1 || typeof job.json !== 'string' || job.json.length !== job.chars) {
    throw new Error('Safari audio upload page bounds mismatch');
  }
  const controller = new AbortController();
  job.upload = { status: 'pending', offset: 0, chunks: 0 };
  const timer = setTimeout(() => controller.abort(), remainingMs);
  (async () => {
    const bytes = new TextEncoder().encode(job.json);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map(value => value.toString(16).padStart(2, '0')).join('');
    for (let offset = 0, sequence = 0; offset < bytes.length; offset += chunkBytes, sequence++) {
      if (controller.signal.aborted) throw new Error('Safari audio upload page deadline expired');
      const response = await fetch(path, { method: 'POST', mode: 'same-origin', credentials: 'omit',
        redirect: 'error', cache: 'no-store', signal: controller.signal,
        headers: { 'content-type': 'application/octet-stream', 'x-cinderline-id': String(id),
          'x-cinderline-offset': String(offset), 'x-cinderline-sequence': String(sequence),
          'x-cinderline-total': String(bytes.length), 'x-cinderline-chars': String(job.chars),
          'x-cinderline-sha256': digest },
        body: bytes.subarray(offset, Math.min(offset + chunkBytes, bytes.length)) });
      if (!response.ok) throw new Error(`Safari audio upload HTTP ${response.status}`);
      const ack = await response.json(), end = Math.min(offset + chunkBytes, bytes.length);
      if (ack.id !== id || ack.sequence !== sequence || ack.offset !== offset || ack.receivedBytes !== end
        || ack.complete !== (end === bytes.length)) throw new Error('Safari audio upload acknowledgement mismatch');
      job.upload.offset = end; job.upload.chunks++;
    }
    job.upload.status = 'complete';
  })().catch(error => {
    job.upload.status = 'failed'; job.upload.operationError = String(error.message || error);
  }).finally(() => clearTimeout(timer));
  return { id, status: job.upload.status };
}
