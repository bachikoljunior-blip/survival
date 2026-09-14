/** Opt-in adapter for the existing Appium Mobile Safari acquisition route.
 * No server, simulator or browser is launched here. The production recorder and acquisition clock guards remain in
 * mobile_audio_capture.mjs; only the cut-gas-air scene label was corrected.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { captureMobileAudio } from './mobile_audio_capture.mjs';
import { installFrameWorkProbe, stopFrameWorkProbe } from './frame_work_probe.mjs';
import { IOS_TRANSFER_CHUNK_BYTES, startIosAudioUpload } from './ios_audio_transfer.mjs';

export const IOS_AUDIO_PIN = Object.freeze({
  preparedFromCommit: '8058f8431b7885e9e929e6cb57bb415d26d9f5b1',
  preparationReportSha256: '1ffc7875d1536a1bb088b2ae0e7867b7513c0e16700efc1b1dd22c1a494e8d02',
  bundle: 'cinderline.1.0.0.js',
  bundleSha256: '4912f328eddfe99293bc90387a304854b7f3c1e2a1f9d36bf7fa5677caeebbed',
  recorderBlob: '785541d3beaed0e35e8bcf042973eabb7bdb5d6c',
});
const TRANSFER_KEY = '__cinderlineIosAudioTransfer';
const FRAME_WORK_TRANSFER_KEY = '__cinderlineIosFrameWorkTransfer';
const CHUNK_CHARS = 131072;
// Keep even escaped/non-ASCII status replies below the existing 128 KiB wire bound.
const INLINE_JSON_CHARS = 4096;
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
    transferHelperSha256: sha256(readFileSync(join(root, 'tools/ios_audio_transfer.mjs'))),
    frameWorkProbeSha256: sha256(readFileSync(join(root, 'tools/frame_work_probe.mjs'))),
    harnessSha256: sha256(readFileSync(join(root, 'tools/test-ios-safari.mjs'))),
    runCommit: process.env.GITHUB_SHA || null, runId: process.env.GITHUB_RUN_ID || null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || null };
}

/** Launch asynchronous work using the already exercised /execute/sync API.
 * Only small status/chunk replies cross WebDriver; no async-script timeout or
 * whole recording in one command. Polling never steps or modifies game clocks.
 */
export function createSafariEvaluate(execute, { timeoutMs = 120000, pollMs = 200,
  maxTransferChars = MAX_TRANSFER_CHARS, transferKey = TRANSFER_KEY, transfer = null } = {}) {
  let sequence = 0, evaluating = false;
  async function evaluateOnce(fn, arg) {
    const id = ++sequence;
    const deadline = Date.now() + timeoutMs;
    const command = (script, args = []) => {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) throw new Error('Safari audio operation deadline expired');
      return execute(script, args, Math.min(90000, remainingMs));
    };
    const started = await command(`
      var key = ${JSON.stringify(transferKey)}, old = window[key];
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
      status = await command(`var j=window[${JSON.stringify(transferKey)}];
        return j && {id:j.id,status:j.status,chars:j.chars,operationError:j.error,
          inlineJson:j.status==='ready' && typeof j.json==='string'
            && j.json.length===j.chars && j.chars<=${INLINE_JSON_CHARS} ? j.json : undefined};`);
      if (status?.id !== id) throw new Error('iOS audio operation identity changed');
      if (status.status === 'failed') throw new Error(`Safari audio operation failed: ${status.operationError}`);
      if (status.status === 'ready') break;
      if (Date.now() >= deadline) throw new Error('Safari audio operation polling timed out');
      await delay(pollMs);
    } while (true);
    if (!Number.isSafeInteger(status.chars) || status.chars < 1 || status.chars > maxTransferChars) {
      throw new Error('iOS audio transfer length is invalid');
    }
    let json = '';
    if (status.chars <= INLINE_JSON_CHARS) {
      if (typeof status.inlineJson !== 'string' || status.inlineJson.length !== status.chars) {
        throw new Error('iOS audio inline transfer is missing or truncated');
      }
      // The ready poll already carries this small result; avoid a second
      // WebDriver round trip while a just-started recorder is running.
      json = status.inlineJson;
    } else if (transfer && status.chars > CHUNK_CHARS) {
      const upload = transfer.begin({ id, chars: status.chars, deadline });
      let received = false, receivedJson, receiveError;
      upload.result.then(value => { received = true; receivedJson = value; },
        error => { received = true; receiveError = error; });
      try {
        const launched = await command(`return (${startIosAudioUpload.toString()})(arguments[0]);`,
          [{ key: transferKey, id, path: upload.path, remainingMs: deadline - Date.now(),
            chunkBytes: IOS_TRANSFER_CHUNK_BYTES }]);
        if (launched?.id !== id) throw new Error('Safari audio upload launch identity mismatch');
        while (true) {
          const progress = await command(`var j=window[${JSON.stringify(transferKey)}];
            return j && {id:j.id,upload:j.upload};`);
          upload.lastPageProgress = progress;
          if (progress?.id !== id) throw new Error('Safari audio upload operation identity changed');
          if (progress.upload?.status === 'failed') {
            throw new Error(`Safari audio upload failed: ${progress.upload.operationError}`);
          }
          if (receiveError) throw receiveError;
          if (received && progress.upload?.status === 'complete') break;
          if (Date.now() >= deadline) throw new Error('Safari audio upload timed out');
          await delay(Math.min(pollMs, deadline - Date.now()));
        }
        json = receivedJson;
      } catch (error) {
        upload.cancel(error);
        // Host receipt survives the shared recorder's later cleanup evaluate.
        upload.receipt.evaluationFailure = error.message;
        upload.receipt.lastPageProgress = upload.lastPageProgress || null;
        throw error;
      }
    } else for (let offset = 0; offset < status.chars; offset += CHUNK_CHARS) {
      if (Date.now() >= deadline) throw new Error('Safari audio chunk transfer timed out');
      const part = await command(`var j=window[${JSON.stringify(transferKey)}];
        if (!j || j.id!==arguments[0] || j.status!=='ready') throw new Error('iOS audio transfer identity changed');
        return {id:j.id,offset:arguments[1],text:j.json.slice(arguments[1],arguments[1]+${CHUNK_CHARS})};`, [id, offset]);
      const expected = Math.min(CHUNK_CHARS, status.chars - offset);
      if (part?.id !== id || part.offset !== offset || typeof part.text !== 'string' || part.text.length !== expected) {
        throw new Error('iOS audio transfer chunk is missing or truncated');
      }
      json += part.text;
    }
    await command(`var j=window[${JSON.stringify(transferKey)}];
      if (j && j.id===arguments[0]) delete window[${JSON.stringify(transferKey)}]; return true;`, [id]);
    return JSON.parse(json);
  }
  return async function evaluate(fn, arg) {
    if (evaluating) throw new Error('Concurrent Safari audio evaluation is not allowed');
    evaluating = true;
    try { return await evaluateOnce(fn, arg); }
    finally { evaluating = false; }
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

/** Programmatic production-menu checks after recording; no new audio source,
 * recording, mix change, manual clock step, or Audio.update call is made. */
export async function inspectIosAudioLifecycle({ evaluate, waitFrames, check, evidence }) {
  const lifecycle = evidence.lifecycle = {
    status: 'started', samples: [],
    scope: 'Programmatic production Game/Screens menu methods after the original three recordings. State and retained preset targets are checked after real engine frames; this is not native user interaction, added recording, listening or a quality verdict. Reverb gain.value is observed only, not treated as a scheduled target.',
  };
  const interior = { wind: 0.08, burn: 0.18, hiss: 0.02, hum: 0.25, room: 0.9 };
  const street = { wind: 0.7, burn: 0.5, hiss: 0.05, hum: 0.15, room: 0 };
  const stages = [
    ['arcade', null, 'play', false, false, 'interior', interior],
    ['game-pause', 'pause', 'menu', false, true, 'interior', interior],
    ['title', 'title', 'title', false, false, 'street', street],
    ['title-settings', 'settings', 'title', true, true, 'street', street],
    ['title-close', 'close', 'title', false, false, 'street', street],
  ];
  let reportedFailure = false;
  try {
    for (const [stage, action, mode, fromTitle, pauseOpen, ambience, targets] of stages) {
      if (action) await evaluate(async action => {
        const g = window.CINDERLINE.game;
        if (action === 'pause') g.emit('ui:menu');
        else if (action === 'title') await g.toTitle();
        else if (action === 'settings') g.menus.openPause('settings', true);
        else if (action === 'close') g.menus.closePause();
        else throw new Error('Unknown audio lifecycle operation');
      }, action);
      await waitFrames(2);
      const observed = await evaluate(() => {
        const C = window.CINDERLINE, g = C.game, a = g.audio;
        return {
          wallMs: performance.now(), engineFrame: C.engine.frame, engineTime: C.engine.time,
          audioTime: a.ctx?.currentTime ?? null, audioState: a.ctx?.state ?? null,
          ready: a.ready, unlocked: a.unlocked, activeRecording: Boolean(C.__audioRecording),
          mode: g.mode, fromTitle: Boolean(g.menus.fromTitle), pauseOpen: Boolean(g.menus.pauseOpen),
          currentInterior: g.director.currentInterior, region: g.zone?.id ?? null,
          position: g.player.pos.toArray(), ambience: a.ambienceState,
          layerTargets: Object.fromEntries(['wind', 'burn', 'hiss', 'hum', 'room']
            .map(k => [k, a.ambLayers?.[k]?.target ?? null])),
          reverbGainValues: Object.fromEntries(Object.entries(a.reverbs || {})
            .map(([k, value]) => [k, value.gain.gain.value])),
        };
      });
      lifecycle.samples.push({ stage, action, ...observed });
      const passed = observed.ready && observed.unlocked && observed.audioState === 'running'
        && !observed.activeRecording && observed.currentInterior === 'arcade'
        && observed.mode === mode && observed.fromTitle === fromTitle && observed.pauseOpen === pauseOpen
        && observed.ambience === ambience && Object.entries(targets).every(([k, v]) =>
          Number.isFinite(observed.layerTargets[k]) && Math.abs(observed.layerTargets[k] - v) < 1e-12);
      if (!passed) reportedFailure = true;
      check(passed, `iOS audio lifecycle ${stage}: production state and authored targets agree`,
        JSON.stringify({ expected: { mode, fromTitle, pauseOpen, ambience, targets }, observed }));
      if (!passed) throw new Error(`iOS audio lifecycle mismatch at ${stage}; later operations not attempted`);
    }
    lifecycle.status = 'checked';
  } catch (error) {
    lifecycle.status = 'failed'; lifecycle.error = error.message || String(error);
    if (!reportedFailure) check(false, 'iOS audio lifecycle: programmatic boundary inspection completed', lifecycle.error);
    throw error;
  }
}

export async function captureIosAudio({ execute, tap, moveForCapture, releaseActions,
  waitFrames, root, output, check, report, provenance, transfer = null,
  captureFrameWork = process.env.CINDERLINE_IOS_FRAME_WORK_CAPTURE === '1' }) {
  mkdirSync(output, { recursive: true });
  const originalSettings = await execute('return Object.assign({}, window.CINDERLINE.game.settings);');
  const evaluate = createSafariEvaluate(execute, { transfer });
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
      if (captureFrameWork) report.safariFrameWorkInstallation = await evaluate(installFrameWorkProbe);
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
  const failuresBeforeCapture = report.failures?.length || 0;
  let captureCheckFailed = false;
  const captureCheck = (condition, ...args) => {
    if (!condition) captureCheckFailed = true;
    return check(condition, ...args);
  };
  let failure;
  try {
    await captureMobileAudio({ page, root, output, check: captureCheck, report: captureReport,
      waitFrames: (_page, count) => waitFrames(count) });
    const clips = captureReport.audioCapture?.clips || [];
    const completed = !captureCheckFailed && (report.failures?.length || 0) === failuresBeforeCapture
      && captureReport.audioCapture?.status === 'captured' && clips.length === 3
      && clips.every(clip => clip.timing?.captureClockGuardPassed === true && clip.timing?.telemetryComplete === true)
      && clips.at(-1)?.placed?.interior === 'arcade';
    check(completed, 'iOS audio lifecycle: original three recordings completed before boundary operations',
      JSON.stringify({ status: captureReport.audioCapture?.status, clips: clips.length, captureCheckFailed,
        timing: clips.map(clip => ({ captureClockGuardPassed: clip.timing?.captureClockGuardPassed,
          telemetryComplete: clip.timing?.telemetryComplete })),
        lastInterior: clips.at(-1)?.placed?.interior, newFailures: (report.failures?.length || 0) - failuresBeforeCapture }));
    if (!completed) throw new Error('Original iOS audio capture did not complete successfully; lifecycle operations not attempted');
    await inspectIosAudioLifecycle({ evaluate, waitFrames, check, evidence: captureReport.audioCapture });
  } catch (error) { failure = error; }
  finally {
    const cleanupErrors = [];
    try { await finishMove(); } catch (error) { cleanupErrors.push(error.message); }
    try { await releaseActions(); } catch (error) { cleanupErrors.push(error.message); }
    // Also works when a pending/failed transfer prevented the shared helper's
    // ordinary cleanup evaluate. Preserve page-side failure evidence first.
    try {
      report.safariAudioTransferFinal = await execute(`var j=window[${JSON.stringify(TRANSFER_KEY)}];
        return j ? {id:j.id,status:j.status,chars:j.chars,operationError:j.error} : null;`);
    } catch (error) { cleanupErrors.push(error.message); }
    // Read and restore directly: a prior pending/failed transfer must not
    // prevent diagnostic cleanup or overwrite the preserved operation error.
    if (captureFrameWork) {
      try {
        report.safariFrameWorkCleanup = await execute(`var C=window.CINDERLINE;
          var result=(${stopFrameWorkProbe.toString()})(); C.__iosFrameWorkResult=result;
          return result ? {rows:result.rows.length,complete:result.complete,restored:result.restored} : null;`);
        if (report.safariFrameWorkCleanup) {
          // Reuse the original bounded transport on its own operation slot;
          // never overwrite an audio failure or return all rows in one reply.
          report.safariFrameWork = await createSafariEvaluate(execute, { transferKey: FRAME_WORK_TRANSFER_KEY, transfer })(() => {
            const C = window.CINDERLINE, result = C.__iosFrameWorkResult;
            delete C.__iosFrameWorkResult;
            return result;
          });
          report.safariFrameWork.provenance = provenance;
        }
        check(report.safariFrameWork?.complete === true,
          'iOS audio diagnostic: bounded frame work captured and timing wrappers restored',
          JSON.stringify({ recordings: report.safariFrameWork?.recordingCount,
            rows: report.safariFrameWork?.rows.length, dropped: report.safariFrameWork?.dropped,
            restored: report.safariFrameWork?.restored, errors: report.safariFrameWork?.errors }));
      } catch (error) { cleanupErrors.push(error.message); }
    }
    try {
      const fallbackSettings = failure || cleanupErrors.length ? originalSettings : null;
      report.safariAudioCleanupFinal = await execute(`var C=window.CINDERLINE, errors=[];
        try { if(C.__audioRecording) C.__audioRecording.cleanup(); } catch(e) { errors.push(String(e.message||e)); }
        try { if(arguments[0]) C.game.applySettings(arguments[0]); } catch(e) { errors.push(String(e.message||e)); }
        delete window[${JSON.stringify(TRANSFER_KEY)}];
        delete window[${JSON.stringify(FRAME_WORK_TRANSFER_KEY)}]; delete C.__iosFrameWorkResult;
        if(errors.length) throw new Error(errors.join('; '));
        return {fallbackSettingsApplied:Boolean(arguments[0]),settings:Object.assign({},C.game.settings)};`, [fallbackSettings]);
    } catch (error) { cleanupErrors.push(error.message); }
    report.audioCapture = captureReport.audioCapture || { clips: [] };
    const evidence = report.audioCapture;
    evidence.lifecycle ||= { status: 'not run', reason: 'Original acquisition did not complete successfully; no boundary operation was attempted.' };
    evidence.provenance = provenance;
    evidence.scope = 'Actual iOS Simulator Mobile Safari production compressor output and simultaneous native canvas video, using the shared recorder with the cut-gas-air scene label corrected. Placement is programmatic; street movement is one trusted native stick gesture. Canvas video excludes DOM HUD. This is acquisition, not physical-device audio or a blind quality comparison.';
    evidence.transport = { command: '/execute/sync', asyncWork: 'page-side promise + status polling',
      chunkChars: CHUNK_CHARS, maxTransferChars: MAX_TRANSFER_CHARS, operationTimeoutMs: 120000,
      singleCommandMaxMs: 90000, deadlineScope: 'Each command is bounded by the remaining original 120000 ms operation budget; the upload receiver rejects late data.',
      largeReplyRoute: transfer ? 'existing loopback DIST server; same-origin POST after recorder completion' : 'WebDriver chunks',
      uploadChunkBytes: transfer ? IOS_TRANSFER_CHUNK_BYTES : null, uploads: transfer?.receipts || [] };
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
    frameWork: report.safariFrameWork ? { rows: report.safariFrameWork.rows.length,
      limit: report.safariFrameWork.limit, dropped: report.safariFrameWork.dropped,
      recordings: report.safariFrameWork.recordingCount, complete: report.safariFrameWork.complete,
      restored: report.safariFrameWork.restored, errors: report.safariFrameWork.errors } : null,
    lifecycle: report.audioCapture?.lifecycle,
    captureStatus: report.audioCapture?.status, comparison: report.audioCapture?.comparison,
    clips: (report.audioCapture?.clips || []).map(clip => ({ name: clip.name, path: clip.path,
      bytes: clip.bytes, sha256: clip.sha256, mime: clip.mime, timing: clip.timing,
      tracks: clip.before?.tracks })) };
}
