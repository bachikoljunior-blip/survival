/**
 * CINDERLINE — entry point.
 */

import * as THREE from 'three';
import { Game, MODE } from './game/game.js';
import { Storage, SAVE_STATUS, SAVE_LOADABLE } from './game/state.js';
import { moveActor } from './world/collision.js';
import { onSwallowedError } from './core/util.js';
import { Audio } from './audio/audio.js';
import { setLocale, detectLocale, t } from './content/i18n.js';

const boot = document.getElementById('boot');
const bootNote = document.getElementById('boot-note');
const setNote = (s) => { if (bootNote) bootNote.textContent = s; };

const STAGE_TEXT = {
  ground: 'laying ground',
  streets: 'laying streets',
  buildings: 'raising hollis',
  structures: 'hanging fire escapes',
  dressing: 'dressing the city',
  interiors: 'opening doors',
  skyline: 'drawing the skyline',
  air: 'measuring the air',
  lighting: 'lighting the burn',
  navigation: 'mapping the ground',
  ready: 'ready',
};

async function main() {
  window.__cinderlineBooted = true;
  window.CINDERLINE = { ready: false };

  // Before the first line of text reaches the boot plate. `new Game` resolves
  // the language again from the same setting; this is only so the two or three
  // stage notes that precede it are not in English on a Japanese device.
  const saved = Storage.loadSettings();
  setLocale((saved && saved.language) || detectLocale());

  setNote(t('ui.boot.renderer', 'starting renderer'));
  const canvas = document.getElementById('gl');
  const game = new Game(canvas);

  await game.buildWorld((stage) => setNote(t(`ui.boot.${stage}`, STAGE_TEXT[stage] || stage)));

  game.spawnPlayer('start');

  // Audio has to wait for a user gesture before it can make a sound; the
  // engine is created now and unlocked on the first touch.
  game.audio = new Audio(game);
  game.applySettings(game.settings);

  game.start();

  // --- boot flow ---------------------------------------------------------
  const warnStorage = () => {
    if (storageOk || warnStorage.done) return;
    warnStorage.done = true;
    game.hud.notice(t('ui.storage.notice',
      '<b>Not saving.</b> This browser blocks storage — nothing will be kept.'), 'bad', 7);
  };

  // Two fingers on a phone can press CONTINUE and NEW GAME in the same frame,
  // and both handlers used to run: the save loaded, then the new game reset it,
  // and nothing on screen said the loaded game had been thrown away. One
  // transition at a time.
  //
  // Released when the transition FINISHES, not when the title comes back. Tying
  // it to the title left the guard stuck for anything that starts a game
  // without passing through the title screen — which silently swallowed every
  // start after the first and, in the playthrough harness, left four of five
  // routes running on the previous route's state.
  let leavingTitle = false;
  const startNewGame = async () => {
    if (leavingTitle) return;
    leavingTitle = true;
    try {
        game.menus.hideTitle();
        await game.menus.fadeOut();
        game.director.state.reset();
        game.director.resetWorld();
        game.player.group.visible = true;      // hidden for the title card
        game.teleport('start');
        game.player.hp = game.player.maxHp;
        game.player.stamina = game.player.maxStamina;
        game.player.lungs.sat = 0;
        game.player.lungs.removeFilter();
        game.player.dead = false;
        game.playTime = 0;
        game.director.refreshCast();
        game.director.quests.start('arrival');
        game.director.quests.start('cellarRow');
        game.hud.setVisible(true);
        await game.menus.fadeIn();
        game.setMode(MODE.PLAY);
        game.hud.showCard(
          t('ui.card.1.kicker', 'CHAPTER ONE'),
          t('ui.card.1.title', 'BAD AIR'),
          t('ui.card.1.sub', 'The Stacks · Hollis'));
        game.emit('music', 'explore');
        warnStorage();
      } finally { leavingTitle = false; }
    };

    // What to say about a save this build will not load. Silence is the one
    // unacceptable answer: the player pressed Continue, so something happened to
    // their progress and they are owed the reason before the next autosave
    // writes over it.
    const saveFailureText = (status) => {
      if (status === SAVE_STATUS.FUTURE) {
        return t('ui.savefile.future',
          '<b>Save not loaded.</b> It was written by a newer version of the game. ' +
          'It has been left alone — open the newer version to continue it.');
      }
      if (status === SAVE_STATUS.CORRUPT || status === SAVE_STATUS.UNKNOWN_VERSION) {
        return t('ui.savefile.corrupt',
          '<b>Save not loaded.</b> The stored save could not be read. ' +
          'A copy of it has been kept aside.');
      }
      return t('ui.savefile.failed',
        '<b>Save not loaded.</b> It could not be brought up to date with this ' +
        'version. It has been left alone, and a copy has been kept aside.');
    };

    const continueGame = async () => {
      if (leavingTitle) return;
      leavingTitle = true;
      try {
      const save = Storage.load();
      const result = Storage.lastResult;
      if (!save) {
        // There WAS a save and this build could not read it. Starting a new game
        // here is the one thing that must not happen automatically: the player
        // asked to continue, and the old file — rescued copy or not — is the
        // thing a new game writes over. Stay on the title, say why, and let them
        // choose. (A HUD notice is no good for this: the title has no HUD, and
        // the notice queue that would carry it is four deep and evicts the
        // oldest, so a new game's own notices would delete the explanation.)
        if (result && result.status !== SAVE_STATUS.EMPTY) {
          game.menus.refreshTitleWarning();  // still on the title; it stays usable
          return;
        }
        leavingTitle = false;                // startNewGame takes the guard itself
        return startNewGame();
      }
      game.player.group.visible = true;      // hidden for the title card
      game.menus.hideTitle();
      await game.menus.fadeOut();
      if (!game.director.applySave(save)) {
        // The world has been reset but the progression was refused. Do not drop
        // the player into a half-restored city.
        await game.menus.fadeIn();
        game.hud.notice(saveFailureText(SAVE_STATUS.CORRUPT), 'bad', 9);
        leavingTitle = false;
        return startNewGame();
      }
      if (result && result.status === SAVE_STATUS.MIGRATED) {
        // Not "updated": nothing has been written yet. The old file is still
        // exactly where it was, which is the point — the previous build can
        // still open it until this session saves.
        game.hud.notice(t('ui.savefile.migrated',
          'Save updated from an older version — it will be written in the new ' +
          'format the next time the game saves.'), 'good', 6);
      }
      game.playTime = game.director.state.playTime;
      game.hud.setVisible(true);
      await game.menus.fadeIn();
      game.setMode(MODE.PLAY);
      game.emit('music', 'explore');
      warnStorage();
    } finally { leavingTitle = false; }
  };

  game.on('ui:newgame', startNewGame);
  game.on('ui:continue', continueGame);

  // ---- persistence lifecycle -------------------------------------------
  // The only periodic save is a 90s timer that is skipped entirely during a
  // raid, and iOS Safari discards backgrounded tabs without warning. Save on
  // the way out instead of losing up to a minute and a half in silence.
  const saveOnExit = () => {
    if (!game.director) return;
    if (game.mode !== MODE.PLAY && game.mode !== MODE.MENU && game.mode !== MODE.DIALOGUE) return;
    try { game.director.save(true); } catch (e) { console.warn('[cinderline] exit save failed', e); }
  };
  game.engine.on('background', saveOnExit);

  // ---- WebGL context loss ----------------------------------------------
  // Engine sets lost=true and pauses; _frame then returns early forever. Left
  // unhandled that is a frozen frame with no message, no save and no way out,
  // and Safari frequently never fires webglcontextrestored.
  const ctxLost = document.getElementById('ctxlost');
  const ctxReload = document.getElementById('ctxlost-reload');
  if (ctxReload) ctxReload.addEventListener('click', () => window.location.reload());
  game.engine.on('contextlost', () => {
    saveOnExit();
    if (ctxLost) ctxLost.classList.add('on');
  });
  game.engine.on('contextrestored', () => {
    if (ctxLost) ctxLost.classList.remove('on');
    game.engine.renderer.shadowMap.needsUpdate = true;
    if (game.atmos) game.atmos.shadowDirty = true;
  });

  // ---- uncaught errors and rejected promises ---------------------------
  // The page's own handler stops listening the moment the bundle boots, so
  // after boot nothing caught either of these. The loop re-arms its rAF at the
  // top of the frame, which means a throw inside a frame does not stop the
  // loop — it repeats forever, and what the player sees is a picture that has
  // stopped changing with no message and no way out.
  //
  // Not every uncaught error is fatal, so this does not put a wall in front of
  // a player whose game is still running. One fault saves and says so; a fault
  // that repeats, or one after which the simulation has stopped advancing,
  // escalates to the same recovery panel context loss uses.
  const faults = [];
  let faultPanelShown = false;
  const showRecoveryPanel = () => {
    if (faultPanelShown || !ctxLost) return;
    faultPanelShown = true;
    const k = ctxLost.querySelector('.k');
    const s = ctxLost.querySelector('.s');
    if (k) k.textContent = t('ui.fault.title', 'SOMETHING BROKE');
    if (s) {
      s.textContent = t('ui.fault.text',
        'The game hit an error it could not carry on from. Your progress has been saved. ' +
        'Reload to pick up where you left off.');
    }
    ctxLost.classList.add('on');
  };

  let lastFaultSave = 0;
  const onFault = (kind, message, opts = {}) => {
    const e = game.engine;
    const at = { kind, message: String(message || 'unknown'), t: Date.now(), frame: e.frame };
    faults.push(at);
    // A fault inside the loop arrives once per frame. Neither the list nor the
    // save may grow with it: keeping every entry is a leak, and writing the
    // save every frame is a stall on top of a stall.
    if (faults.length > 24) faults.splice(0, faults.length - 24);
    if (window.CINDERLINE) window.CINDERLINE.faults = faults;
    console.error('[cinderline] uncaught', kind, message);

    if (at.t - lastFaultSave > 5000) {
      lastFaultSave = at.t;
      saveOnExit();
    }
    if (faults.length === 1) {
      try {
        game.hud.notice(t('ui.fault.notice',
          '<b>Something went wrong.</b> Your progress has been saved.'), 'bad', 6);
      } catch { /* the HUD itself may be what broke */ }
    }

    // Repeats mean the fault is in something that runs again — a frame, an
    // updater, a listener — and one message is not enough.
    //
    // The same message twice escalates no matter how far apart the two are. A
    // time window was wrong here: a device under enough load that the repeats
    // arrive six seconds apart is a device having a worse time than one where
    // they arrive in one, and the window let exactly that case through
    // silently. The window only decides how many DIFFERENT faults count as a
    // storm.
    //
    // A CAUGHT listener error is not the same thing. The bus catches so one
    // listener cannot stop the others, and most of what it catches leaves the
    // game entirely playable — walling those off would break more sessions
    // than it saves, and did: a benign listener throwing twice took a
    // playthrough out at chapter five. Only the caller decides when a caught
    // error has actually stopped something (see the render path below).
    const listener = kind === 'listener';
    const sameAgain = !listener && faults.some((f) => f !== at && f.message === at.message);
    const burst = !listener && faults.filter((f) => at.t - f.t < 5000).length >= 3;
    if (opts.escalate || sameAgain || burst) {
      showRecoveryPanel();
      return;
    }
    // A caught error did not stop the loop by definition — the frame counter
    // is incremented before the render listeners run — so the stall check
    // below cannot say anything about it.
    if (listener) return;
    // Otherwise give the loop a moment and check whether it is still alive.
    // A frame counter that has not moved is the player's actual complaint —
    // the picture stopped — whether the loop is throwing before it can count
    // the frame or has stopped being scheduled at all. Pause and context loss
    // are excluded because both stop the counter on purpose and both already
    // say so on screen.
    setTimeout(() => {
      if (faultPanelShown) return;
      if (!e.isPaused && !e.lost && e.frame === at.frame) showRecoveryPanel();
    }, 1200);
  };

  window.addEventListener('error', (ev) => {
    onFault('error', (ev && (ev.message || (ev.error && ev.error.message))) || 'error');
  });
  // An exception inside a listener is caught by the event bus so one listener
  // cannot stop the others — which also meant a throw in the `render` listener
  // stopped the picture without anything noticing. Same treatment as an
  // uncaught error: it repeats every frame, so it escalates.
  //
  // The drawing path is the exception: `frame` is counted before the render
  // listeners run, so a renderer that throws every frame leaves the counter
  // climbing while the picture is dead — measured at zero GL draw calls. That
  // is the silent freeze, and it is what escalates. Everything else the bus
  // catches is recorded and surfaced once, and the game carries on.
  let drawingFaults = 0;
  onSwallowedError((where, error) => {
    const drawing = where === 'event:render' || where === 'event:prerender';
    if (drawing) drawingFaults++;
    onFault('listener', `${where}: ${(error && error.message) || error}`,
      { escalate: drawing && drawingFaults >= 3 });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev && ev.reason;
    onFault('rejection', (r && (r.message || r)) || 'rejection');
  });

  // ---- storage availability --------------------------------------------
  // Storage.available() existed and was called from nowhere; in iOS private
  // browsing every write throws, every save silently fails, and the game said
  // "Saved." anyway for a whole playthrough that vanishes on tab close.
  const storageOk = Storage.available();
  if (!storageOk) game.storageAvailable = false;

  // ---- what the title screen says about the save -----------------------
  // Computed on every showTitle rather than pushed in once here. Continue is
  // hidden when a save cannot be loaded, which on its own is indistinguishable
  // from having never played; the player is owed the difference on the screen
  // where the decision to start a new game gets made. It has to stay true as
  // the state changes and survive the rebuild a language change performs.
  game.menus.setTitleWarningSource(() => {
    const lines = [];
    if (!storageOk) {
      lines.push(t('ui.storage.warn',
        'This browser will not let the game save — private browsing, most likely. ' +
        'You can play, but nothing will be kept when you close the tab.'));
    }
    // A live load attempt, not a cached answer: it is idempotent for a save
    // that loads, and for one that does not it is what performs the rescue.
    // `lastResult.rescued` then says whether THIS save was copied — not
    // whether some earlier failure left something in the list.
    Storage.load();
    const r = Storage.lastResult;
    if (r && r.status !== SAVE_STATUS.EMPTY && !SAVE_LOADABLE.includes(r.status)) {
      lines.push(r.status === SAVE_STATUS.FUTURE
        ? t('ui.savefile.warnFuture',
          'There is a saved game here, but it was written by a newer version of ' +
          'the game and this one cannot read it. It has been left untouched.')
        : t('ui.savefile.warnUnreadable',
          'There is a saved game here, but it cannot be read by this version. ' +
          'It has been left untouched.'));
      lines.push(r.rescued
        ? t('ui.savefile.kept',
          'A copy of it has been kept aside, and nothing the game does from here ' +
          'overwrites that copy.')
        : t('ui.savefile.notkept',
          'A copy could NOT be made — this browser refused the write. Starting a ' +
          'new game will replace the save that is there.'));
    }
    return lines.join(' ');
  });

  game.hud.setVisible(false);
  game.setMode(MODE.TITLE);
  // hasSave() is what performs the rescue copy, so it runs before the title —
  // and therefore before the warning above can be asked whether one exists.
  const hasSave = Storage.hasSave();
  game.menus.showTitle(hasSave);
  // One place owns the title framing, so boot and return-to-title cannot
  // drift apart.
  game.setTitleCamera();

  setNote(t('ui.boot.ready', 'ready'));
  boot.classList.add('gone');
  setTimeout(() => { if (boot.parentNode) boot.remove(); }, 800);

  // ---- test / tooling handle -------------------------------------------
  Object.assign(window.CINDERLINE, {
    ready: true, game, THREE, MODE,
    engine: game.engine, input: game.input, post: game.post,
    scene: game.scene, atmos: game.atmos, city: game.city,
    stats: game.city.stats, build: __BUILD_ID__,
    // Exposed so probes drive the real mover against the real world rather
    // than reimplementing it and proving something else.
    moveActor,
    startNewGame, continueGame,
    setCamera(x, y, z, yawDeg, pitchDeg) {
      const p = game.player;
      // placeAt, not a raw write: moving the camera must not read as a fall.
      // It did, and with fall damage unclamped the inspection tool was killing
      // the player at every elevated vantage.
      p.placeAt(x, y, z);
      game.camera.yaw = yawDeg * Math.PI / 180;
      game.camera.pitch = pitchDeg * Math.PI / 180;
      game.camera._init = false;
      game.camera._manualT = 999;
      game.engine.renderer.shadowMap.needsUpdate = true;
      game.atmos.shadowDirty = true;
    },
  });
}

main().catch((e) => {
  console.error(e);
  setNote(t('ui.boot.failed', 'failed to start — ') + (e && e.message ? e.message : e));
  if (bootNote) bootNote.className = 'boot-note err';
  if (window.CINDERLINE) window.CINDERLINE.ready = true;
});
