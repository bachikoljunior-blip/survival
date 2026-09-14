/** Tool-side timing only. Both exported functions serialize into Safari intact.
 * Synchronous elapsed time includes blocking/preemption; it is neither CPU
 * utilization nor GPU time. Nested phase durations must not be added together.
 */
export function installFrameWorkProbe() {
  const C = window.CINDERLINE, engine = C.engine, game = C.game;
  if (C.__iosFrameWorkProbe) throw new Error('frame work probe already installed');
  const rows = [], lifecycle = [], errors = [], patches = [], recordings = new WeakMap();
  const limit = 4096;
  let recordingCount = 0, dropped = 0, active = true, current = null;
  const now = () => performance.now();
  const note = message => { if (errors.length < 16) errors.push(message); };
  const updateEntries = engine._updaters.slice();
  const clock = () => ({ wallMs: now(), engineFrame: engine.frame,
    engineTime: engine.time, accum: engine.accum, audioTime: game.audio.ctx.currentTime,
    audioState: game.audio.ctx.state, running: engine.running, paused: engine.isPaused, lost: engine.lost,
    mode: game.mode, tier: engine.tier.name, timeScale: engine.timeScale });
  const install = (object, key, wrap) => {
    if (!object || typeof object[key] !== 'function') throw new Error(`missing timing target: ${key}`);
    const own = Object.getOwnPropertyDescriptor(object, key);
    const original = object[key], replacement = wrap(original);
    object[key] = replacement;
    if (object[key] !== replacement) throw new Error(`timing target is not writable: ${key}`);
    patches.push({ object, key, original, replacement, own });
  };
  const restore = () => {
    active = false;
    for (const patch of patches.splice(0).reverse()) {
      const { object, key, replacement, own } = patch;
      if (object[key] !== replacement) { note(`timing target changed during capture: ${key}`); continue; }
      try {
        if (own) Object.defineProperty(object, key, own);
        else delete object[key];
      } catch (error) { note(`timing restore failed: ${key}: ${error.message}`); }
    }
  };
  const measure = label => original => function (...args) {
    if (!current) return original.apply(this, args);
    const row = current, start = now();
    try { return original.apply(this, args); }
    finally {
      row.phaseMs[label] = (row.phaseMs[label] || 0) + now() - start;
      row.phaseCalls[label] = (row.phaseCalls[label] || 0) + 1;
    }
  };
  try {
    // The engine schedules this bound callback. Replacing _frame alone would
    // miss it. One already queued original callback can precede this wrapper.
    install(engine, '_boundFrame', original => function (rafTimestampMs) {
      const rec = C.__audioRecording;
      if (!active || !rec) return original.apply(this, arguments);
      let recording = recordings.get(rec);
      if (!recording) { recording = ++recordingCount; recordings.set(rec, recording); }
      if (rows.length >= limit) { dropped++; return original.apply(this, arguments); }
      const row = { recording, recorderState: rec.recorder?.state || null, rafTimestampMs, before: clock(),
        priorClockLastMs: engine.clockLast, phaseMs: {}, phaseCalls: {}, threw: false };
      const parent = current;
      current = row;
      try { return original.apply(this, arguments); }
      catch (error) { row.threw = true; throw error; }
      finally {
        row.after = clock();
        row.callbackElapsedMs = row.after.wallMs - row.before.wallMs;
        row.engineWallMs = rafTimestampMs - row.priorClockLastMs;
        row.entryAfterRafTimestampMs = row.before.wallMs - rafTimestampMs;
        row.engineAdvanceSeconds = row.after.engineTime - row.before.engineTime;
        // clockLast may have been reset to performance.now by lifecycle code;
        // paused/stopped callbacks keep the preceding dtRaw stored on engine.
        row.dtRawStored = engine.dtRaw;
        row.acceptedDtSeconds = row.before.running && !row.before.paused && !row.before.lost
          ? engine.dtRaw : null;
        current = parent;
        rows.push(row);
      }
    });
    updateEntries.forEach((entry, index) => install(entry, 'fn', measure(`updater:${entry.order}:${index}`)));
    install(engine, 'emit', original => function (event, ...args) {
      if (active && C.__audioRecording && ['pause', 'resume', 'background', 'contextlost', 'contextrestored'].includes(event)) {
        if (lifecycle.length < 128) lifecycle.push({ event, ...clock() });
        else note('lifecycle observation capacity exceeded');
      }
      if (!current || !['prerender', 'render', 'renderpaused'].includes(event)) {
        return original.call(this, event, ...args);
      }
      return measure(`emit:${event}`)(original).call(this, event, ...args);
    });
    for (const [object, key, label] of [
      [game.audio, 'update', 'audio.update'], [game, 'render', 'game.render'],
      [game.camera, 'update', 'camera.update'], [game.atmos, 'update', 'atmos.update'],
      [game.hud, 'update', 'hud.update'], [game.hud, 'updatePerf', 'hud.updatePerf'],
      [game.city, 'updateVisibility', 'city.updateVisibility'],
      [game.post, 'render', 'post.render'], [engine.renderer, 'render', 'renderer.render'],
    ]) install(object, key, measure(label));
    C.__iosFrameWorkProbe = {
      stop() {
        if (engine._updaters.length !== updateEntries.length
          || engine._updaters.some((entry, index) => entry !== updateEntries[index])) {
          note('updater registration changed during capture');
        }
        restore();
        delete C.__iosFrameWorkProbe;
        return { schemaVersion: 1, limit, dropped, errors, recordingCount, rows, lifecycle,
          scope: 'Actual runner synchronous callback elapsed times. Includes blocking/preemption and measurement overhead; not CPU utilization, GPU duration, physical-device speed or a quality verdict. Nested phase times overlap. Frame gaps outside callbacks remain unattributed.',
          boundary: 'Only callbacks entered while the original recorder is present. One original callback may already be queued at installation; clip endpoint clocks remain authoritative.',
          restored: errors.length === 0,
          complete: errors.length === 0 && dropped === 0 && recordingCount === 3 && rows.length > 3 };
      },
    };
    return { installed: true, limit, phaseLabels: updateEntries.map((entry, index) => `updater:${entry.order}:${index}`) };
  } catch (error) {
    restore();
    throw error;
  }
}

export function stopFrameWorkProbe() {
  return window.CINDERLINE.__iosFrameWorkProbe?.stop() || null;
}
