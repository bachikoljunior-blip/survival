/** Opt-in adapter for the existing Appium Mobile Safari acquisition route.
 * No server, simulator or browser is launched here. The unchanged production
 * recorder and acquisition clock guards remain in mobile_audio_capture.mjs.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { captureMobileAudio } from './mobile_audio_capture.mjs';

export const IOS_AUDIO_PIN = Object.freeze({
  preparedFromCommit: '68cf2d4d303684e6f6a62f0aec4120169e0945bc',
  preparationReportSha256: '8c1f211d5179aa60c97a6e641718be589f816695d5f32245d48f9d6f7101f4ad',
  bundle: 'cinderline.1.0.0.js',
  bundleSha256: '81c93f3bf6c45b14c25f0e742a78d19b8dc70dca665ebba897bb6e39bbc937b3',
  recorderBlob: '86c1d9c9a0b0eeac3d947aad3d99d25272d3eeaa',
});
const TRANSFER_KEY = '__cinderlineIosAudioTransfer';
const CHUNK_CHARS = 32768;
const MAX_TRANSFER_CHARS = 48 * 1024 * 1024;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function verifyIosAudioBuild(root, externalUrl = '') {
  if (externalUrl) throw new Error('Pinned iOS audio capture requires the existing harness DIST server');
  const hashes = {};
  for (const path of [IOS_AUDIO_PIN.bundle, `dist/${IOS_AUDIO_PIN.bundle}`]) {
    hashes[path] = sha256(readFileSync(join(root, path)));
    if (hashes[path] !== IOS_AUDIO_PIN.bundleSha256) throw new Error(`iOS audio build pin mismatch: ${path}`);
  }
  const recorder = readFileSync(join(root, 'tools/mobile_audio_capture.mjs'));
  const recorderBlob = createHash('sha1').update(`blob ${recorder.length}\0`).update(recorder).digest('hex');
  if (recorderBlob !== IOS_AUDIO_PIN.recorderBlob) throw new Error('iOS audio recorder/clock-guard source pin mismatch');
  return { ...IOS_AUDIO_PIN, actualBundleHashes: hashes, actualRecorderBlob: recorderBlob,
    helperSha256: sha256(readFileSync(join(root, 'tools/ios_audio_capture.mjs'))),
    harnessSha256: sha256(readFileSync(join(root, 'tools/test-ios-safari.mjs'))),
    runCommit: process.env.GITHUB_SHA || null, runId: process.env.GITHUB_RUN_ID || null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || null };
}

/** Launch asynchronous work using the already exercised /execute/sync API.
 * Only small status/chunk replies cross WebDriver; no async-script timeout or
 * whole recording in one command. Polling never steps or modifies game clocks.
 */
export function createSafariEvaluate(execute, { timeoutMs = 120000, pollMs = 200,
  maxTransferChars = MAX_TRANSFER_CHARS } = {}) {
  let sequence = 0;
  return async function evaluate(fn, arg) {
    const id = ++sequence;
    const deadline = Date.now() + timeoutMs;
    const started = await execute(`
      var key = ${JSON.stringify(TRANSFER_KEY)}, old = window[key];
      if (old && old.status === 'pending') throw new Error('prior iOS audio operation still pending');
      var job = window[key] = {id:arguments[1],status:'pending'};
      var input = arguments[0];
      Promise.resolve().then(function () { return (${fn.toString()})(input); }).then(function (value) {
        var json = JSON.stringify(value === undefined ? null : value);
        if (json.length > ${maxTransferChars}) throw new Error('iOS audio transfer exceeds bounded capacity');
        job.json = json; job.chars = json.length; job.status = 'ready';
      }).catch(function (error) { job.error = String(error && error.message || error); job.status = 'failed'; });
      return {id:job.id,status:job.status};
    `, [arg === undefined ? null : arg, id]);
    if (started?.id !== id) throw new Error('iOS audio operation start mismatch');
    let status;
    do {
      status = await execute(`var j=window[${JSON.stringify(TRANSFER_KEY)}];
        return j && {id:j.id,status:j.status,chars:j.chars,error:j.error};`);
      if (status?.id !== id) throw new Error('iOS audio operation identity changed');
      if (status.status === 'failed') throw new Error(`Safari audio operation failed: ${status.error}`);
      if (status.status === 'ready') break;
      if (Date.now() >= deadline) throw new Error('Safari audio operation polling timed out');
      await delay(pollMs);
    } while (true);
    if (!Number.isSafeInteger(status.chars) || status.chars < 1 || status.chars > maxTransferChars) {
      throw new Error('iOS audio transfer length is invalid');
    }
    let json = '';
    for (let offset = 0; offset < status.chars; offset += CHUNK_CHARS) {
      if (Date.now() >= deadline) throw new Error('Safari audio chunk transfer timed out');
      const part = await execute(`var j=window[${JSON.stringify(TRANSFER_KEY)}];
        if (!j || j.id!==arguments[0] || j.status!=='ready') throw new Error('iOS audio transfer identity changed');
        return {id:j.id,offset:arguments[1],text:j.json.slice(arguments[1],arguments[1]+${CHUNK_CHARS})};`, [id, offset]);
      const expected = Math.min(CHUNK_CHARS, status.chars - offset);
      if (part?.id !== id || part.offset !== offset || typeof part.text !== 'string' || part.text.length !== expected) {
        throw new Error('iOS audio transfer chunk is missing or truncated');
      }
      json += part.text;
    }
    await execute(`var j=window[${JSON.stringify(TRANSFER_KEY)}];
      if (j && j.id===arguments[0]) delete window[${JSON.stringify(TRANSFER_KEY)}]; return true;`, [id]);
    return JSON.parse(json);
  };
}

// Inspect only the existing production context. No replacement context,
// synthetic unlock, getUserMedia, microphone permission or test tone.
export function safariAudioCapabilities() {
  const C = window.CINDERLINE, a = C.game.audio, canvas = document.getElementById('gl');
  const recorder = typeof MediaRecorder === 'function';
  const mimeTypes = ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'].map(mime => {
    try { return { mime, supported: recorder && MediaRecorder.isTypeSupported(mime) }; }
    catch (error) { return { mime, supported: false, error: String(error.message || error) }; }
  });
  return {
    checkedWallMs: performance.now(), userAgent: navigator.userAgent, secureContext: isSecureContext,
    audioContextConstructor: typeof AudioContext === 'function',
    webkitAudioContextConstructor: typeof webkitAudioContext === 'function',
    productionContext: Boolean(a.ctx), ready: a.ready, unlocked: a.unlocked,
    state: a.ctx?.state || null, sampleRate: a.ctx?.sampleRate || null,
    outputChannels: a.ctx?.destination.channelCount || null,
    createMediaStreamDestination: typeof a.ctx?.createMediaStreamDestination === 'function',
    compressorConnect: typeof a.comp?.connect === 'function',
    mediaStream: typeof MediaStream === 'function', mediaRecorder: recorder,
    mediaRecorderIsTypeSupported: recorder && typeof MediaRecorder.isTypeSupported === 'function',
    canvasCaptureStream: typeof canvas?.captureStream === 'function',
    blobArrayBuffer: typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer === 'function',
    mimeTypes,
    supportedMime: mimeTypes.find(item => item.supported)?.mime || null,
    observedTrustedTouch: (window.__cinderlineIosInput || []).some(event =>
      event.type === 'pointerdown' && event.trusted && event.pointerType === 'touch'),
    build: C.build,
    limitations: 'API availability and MIME advertisements only. Actual track/recorder creation and recording are separate observations.',
  };
}

export async function captureIosAudio({ execute, tap, moveForCapture, releaseActions,
  waitFrames, root, output, check, report, provenance }) {
  mkdirSync(output, { recursive: true });
  const originalSettings = await execute('return Object.assign({}, window.CINDERLINE.game.settings);');
  const evaluate = createSafariEvaluate(execute);
  let pendingMove = null, capabilityFailure = false;
  const movementRecords = [];
  const finishMove = async () => {
    if (!pendingMove) return;
    const pending = pendingMove; pendingMove = null;
    const result = await pending;
    if (result.error) throw result.error;
    movementRecords.push(result.value);
  };
  const page = {
    evaluate,
    waitForTimeout: delay,
    touchscreen: { tap: async (x, y) => {
      await tap(x, y);
      // resume() in the product's trusted gesture handler is asynchronous.
      // Give that real context a bounded chance to run; never call resume here.
      let caps;
      const deadline = Date.now() + 5000;
      do {
        caps = await evaluate(safariAudioCapabilities);
        if (caps.state === 'running' || Date.now() >= deadline) break;
        await delay(200);
      } while (true);
      report.safariAudioCapabilities = caps;
      const available = caps.productionContext && caps.ready && caps.unlocked && caps.state === 'running'
        && caps.createMediaStreamDestination && caps.compressorConnect && caps.mediaStream
        && caps.mediaRecorder && caps.mediaRecorderIsTypeSupported && caps.canvasCaptureStream && caps.blobArrayBuffer
        && caps.supportedMime && caps.observedTrustedTouch;
      check(available, 'iOS audio: actual Safari exposes the required recording APIs after a trusted gesture', JSON.stringify(caps));
      if (!available) {
        capabilityFailure = true;
        throw new Error('Actual Mobile Safari lacks a required audio/video acquisition capability; no substitute clip created');
      }
    } },
    // The shared recorder requests W-down / wait / W-up. Here that request
    // starts one complete trusted native stick gesture; release waits for its
    // real completion. No synthetic key event or direct movement mutation.
    keyboard: {
      down: async key => {
        if (key !== 'w' || pendingMove) throw new Error('unexpected iOS audio movement request');
        pendingMove = moveForCapture().then(value => ({ value }), error => ({ error }));
      },
      up: async key => {
        if (key !== 'w') throw new Error('unexpected iOS audio movement release');
        await finishMove();
      },
    },
  };
  const captureReport = { browser: 'iOS Simulator Mobile Safari' };
  let failure;
  try {
    await captureMobileAudio({ page, root, output, check, report: captureReport,
      waitFrames: (_page, count) => waitFrames(count) });
  } catch (error) { failure = error; }
  finally {
    const cleanupErrors = [];
    try { await finishMove(); } catch (error) { cleanupErrors.push(error.message); }
    try { await releaseActions(); } catch (error) { cleanupErrors.push(error.message); }
    // Also works when a pending/failed transfer prevented the shared helper's
    // ordinary cleanup evaluate. Preserve page-side failure evidence first.
    try {
      report.safariAudioTransferFinal = await execute(`var j=window[${JSON.stringify(TRANSFER_KEY)}];
        return j ? {id:j.id,status:j.status,chars:j.chars,error:j.error} : null;`);
      const fallbackSettings = failure || cleanupErrors.length ? originalSettings : null;
      report.safariAudioCleanupFinal = await execute(`var C=window.CINDERLINE, errors=[];
        try { if(C.__audioRecording) C.__audioRecording.cleanup(); } catch(e) { errors.push(String(e.message||e)); }
        try { if(arguments[0]) C.game.applySettings(arguments[0]); } catch(e) { errors.push(String(e.message||e)); }
        delete window[${JSON.stringify(TRANSFER_KEY)}];
        if(errors.length) throw new Error(errors.join('; '));
        return {fallbackSettingsApplied:Boolean(arguments[0]),settings:Object.assign({},C.game.settings)};`, [fallbackSettings]);
    } catch (error) { cleanupErrors.push(error.message); }
    report.audioCapture = captureReport.audioCapture || { clips: [] };
    const evidence = report.audioCapture;
    evidence.provenance = provenance;
    evidence.scope = 'Actual iOS Simulator Mobile Safari production compressor output and simultaneous native canvas video, using the unchanged shared recorder. Placement is programmatic; street movement is one trusted native stick gesture. Canvas video excludes DOM HUD. This is acquisition, not physical-device audio or a blind quality comparison.';
    evidence.transport = { command: '/execute/sync', asyncWork: 'page-side promise + status polling',
      chunkChars: CHUNK_CHARS, maxTransferChars: MAX_TRANSFER_CHARS, operationTimeoutMs: 120000,
      singleCommandMaxMs: 90000, deadlineScope: 'Checked between commands; an in-flight command may overrun the operation deadline by its bounded command timeout.' };
    evidence.movements = movementRecords;
    for (const clip of evidence.clips) {
      if (clip.name === 'street-walk') clip.input = 'Trusted native stick: down at CSS (110,250), drag to (110,190) over 350 ms, hold 2150 ms, release. Actual input events and clocks retained.';
    }
    if (failure || cleanupErrors.length) {
      evidence.status = capabilityFailure ? 'not measured' : 'acquisition failed';
      evidence.reason = [failure?.message, ...cleanupErrors].filter(Boolean).join('; ');
    }
    evidence.cleanupErrors = cleanupErrors;
    evidence.comparison = { status: 'not measured', reason: 'Requires decoding, three-clock inspection, successful stereo listening and a valid reference comparison.' };
    if (cleanupErrors.length) failure = new Error([failure?.message, ...cleanupErrors].filter(Boolean).join('; '));
  }
  if (failure) throw failure;
}

// Permissible acquisition metadata only. Full telemetry and original encoded
// media belong in the artifact, not in CI logs or a screenshot export stream.
export function iosAudioLogSummary(report) {
  return { status: report.status, checks: report.checks, failures: report.failures,
    capabilities: report.safariAudioCapabilities, provenance: report.audioCapture?.provenance,
    captureStatus: report.audioCapture?.status, comparison: report.audioCapture?.comparison,
    clips: (report.audioCapture?.clips || []).map(clip => ({ name: clip.name, path: clip.path,
      bytes: clip.bytes, sha256: clip.sha256, mime: clip.mime, timing: clip.timing,
      tracks: clip.before?.tracks })) };
}
