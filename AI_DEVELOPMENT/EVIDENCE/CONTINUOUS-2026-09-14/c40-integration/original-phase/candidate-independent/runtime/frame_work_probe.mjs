/** Tool-side timing only. Both exported functions serialize into Safari intact.
 * Synchronous elapsed time includes blocking/preemption; it is neither CPU
 * utilization nor GPU time. Nested phase durations must not be added together.
 */
export function installFrameWorkProbe() {
  const C = window.CINDERLINE, engine = C.engine, game = C.game;
  if (C.__iosFrameWorkProbe) throw new Error('frame work probe already installed');
  const rows = [], lifecycle = [], errors = [], patches = [], recordings = new WeakMap(), slowCalls = [];
  const limit = 4096;
  const slowCallLimit = 256, slowCallThresholdMs = 8;
  let recordingCount = 0, dropped = 0, slowCallsDropped = 0, active = true, current = null, clockReads = 0;
  const now = () => { clockReads++; return performance.now(); };
  const note = message => { if (errors.length < 16) errors.push(message); };
  const updateEntries = engine._updaters.slice();
  const actorEntries = game.actors.slice(), systemEntries = game.systems.slice();
  const fixedTargets = [
    ...actorEntries.map((actor, index) => ({ phase: `fixed.actor:${index}`,
      role: actor === game.player ? 'player' : typeof actor.kind === 'string' ? actor.kind.slice(0, 32) : null })),
    ...systemEntries.map((system, index) => ({ phase: `fixed.system:${index}`,
      role: system === game.combat ? 'combat' : system === game.ai ? 'ai' : system === game.director ? 'director' : null })),
  ];
  const programCount = () => engine.renderer.info?.programs?.length ?? null;
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
  const measure = (label, detail = false) => original => function (...args) {
    if (!current) return original.apply(this, args);
    const observerStart = now(), row = current;
    const resolved = typeof label === 'function' ? label(args) : label;
    const start = now();
    try { return original.apply(this, args); }
    finally {
      const end = now(), elapsed = end - start;
      row.phaseMs[resolved] = (row.phaseMs[resolved] || 0) + elapsed;
      row.phaseCalls[resolved] = (row.phaseCalls[resolved] || 0) + 1;
      if (resolved.startsWith('renderer.')) {
        row.phaseMs['renderer.render'] = (row.phaseMs['renderer.render'] || 0) + elapsed;
        row.phaseCalls['renderer.render'] = (row.phaseCalls['renderer.render'] || 0) + 1;
      }
      if (detail && elapsed >= slowCallThresholdMs) {
        if (slowCalls.length < slowCallLimit) slowCalls.push({ recording: row.recording,
          fromFrame: row.before.engineFrame, phase: resolved,
          call: row.phaseCalls[resolved], startOffsetMs: start - row.before.wallMs, elapsedMs: elapsed });
        else slowCallsDropped++;
      }
      // Exclusive observer bookkeeping intervals exclude the original call.
      // This is a lower-bound observation, not a correction to any game clock:
      // clock-read/prologue/return costs are not fully measurable by this probe.
      row.observerBookkeepingMs += (start - observerStart) + (now() - end);
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
      const observerStart = now(), readsBefore = clockReads;
      const row = { recording, recorderState: rec.recorder?.state || null, rafTimestampMs, before: clock(),
        priorClockLastMs: engine.clockLast, phaseMs: {}, phaseCalls: {}, threw: false,
        programsBefore: programCount(), observerBookkeepingMs: 0, observedWrapperEntryMs: observerStart };
      const parent = current;
      current = row;
      const originalStart = now();
      row.observerBookkeepingMs += originalStart - observerStart;
      try { return original.apply(this, arguments); }
      catch (error) { row.threw = true; throw error; }
      finally {
        const originalEnd = now();
        row.after = clock();
        row.programsAfter = programCount();
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
        const observerEnd = now();
        row.observerBookkeepingMs += observerEnd - originalEnd;
        row.observedWrapperExitMs = observerEnd;
        row.probeClockReads = clockReads - readsBefore + 1;
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
      [game.post, 'render', 'post.render'],
    ]) install(object, key, measure(label));
    // These are the two normal low-tier render calls; higher-tier post blits
    // get their own label instead of being mistaken for the composite.
    install(engine.renderer, 'render', measure(args => args[0] === game.scene ? 'renderer.world'
      : args[0] === game.post.quadScene && game.post.quad.material === game.post.matComposite
        ? 'renderer.composite' : 'renderer.other', true));
    for (const [object, key, label] of [
      [game.input, 'step', 'fixed.input'], [game.gas, 'update', 'fixed.gas'],
      [game.nav, 'updateGasCost', 'fixed.navGasCost'], [game, '_playerInput', 'fixed.playerInput'],
      [game, '_drainEvents', 'fixed.events'], [game, '_updateZone', 'fixed.zone'],
      ...actorEntries.map((actor, index) => [actor, 'update', `fixed.actor:${index}`]),
      ...systemEntries.map((system, index) => [system, 'update', `fixed.system:${index}`]),
    ]) install(object, key, measure(label, true));
    C.__iosFrameWorkProbe = {
      stop() {
        if (engine._updaters.length !== updateEntries.length
          || engine._updaters.some((entry, index) => entry !== updateEntries[index])) {
          note('updater registration changed during capture');
        }
        if (game.actors.length !== actorEntries.length || game.actors.some((actor, index) => actor !== actorEntries[index])
          || game.systems.length !== systemEntries.length || game.systems.some((system, index) => system !== systemEntries[index])) {
          note('fixed detail target registration changed during capture');
        }
        restore();
        delete C.__iosFrameWorkProbe;
        return { schemaVersion: 2, limit, dropped, errors, recordingCount, rows, lifecycle,
          slowCallThresholdMs, slowCallLimit, slowCallsDropped, slowCalls, fixedTargets,
          fixedTargetScope: 'Actor/system targets are captured at installation. Final registration changes are detected at stop; a temporary registration change reversed before stop is not observed.',
          detailComplete: errors.length === 0 && dropped === 0 && slowCallsDropped === 0 && recordingCount === 3 && rows.length > 3,
          observerScope: 'observerBookkeepingMs brackets exclusive wrapper setup/bookkeeping only, includes preemption, and omits some clock-read/prologue/return costs. It is not complete instrumentation overhead or CPU utilization; no clock or phase is normalized by it. observedWrapperEntryMs/ExitMs reuse existing timing markers, not the full callback entry/exit: initial recorder/WeakMap work and assignments/return after the exit marker remain outside. Inter-marker gaps remain unattributed. probeClockReads counts probe performance.now calls. Program counts are renderer.info.programs.length, not compile duration or GPU usage.',
          scope: 'Actual runner synchronous callback elapsed times. Includes blocking/preemption and measurement overhead; not CPU utilization, GPU duration, physical-device speed or a quality verdict. Nested phase times overlap. Frame gaps outside callbacks remain unattributed.',
          boundary: 'Only callbacks entered while the original recorder is present. One original callback may already be queued at installation; clip endpoint clocks remain authoritative.',
          restored: errors.length === 0,
          complete: errors.length === 0 && dropped === 0 && slowCallsDropped === 0 && recordingCount === 3 && rows.length > 3 };
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
