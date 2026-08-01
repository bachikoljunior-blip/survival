/**
 * CINDERLINE — entry point.
 */

import * as THREE from 'three';
import { Game, MODE } from './game/game.js';
import { Storage } from './game/state.js';
import { moveActor } from './world/collision.js';
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

  const startNewGame = async () => {
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
  };

  const continueGame = async () => {
    const save = Storage.load();
    if (!save) return startNewGame();
    game.player.group.visible = true;      // hidden for the title card
    game.menus.hideTitle();
    await game.menus.fadeOut();
    game.director.applySave(save);
    game.playTime = game.director.state.playTime;
    game.hud.setVisible(true);
    await game.menus.fadeIn();
    game.setMode(MODE.PLAY);
    game.emit('music', 'explore');
    warnStorage();
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
  const onFault = (kind, message) => {
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
    const recent = faults.filter((f) => at.t - f.t < 5000);
    if (recent.length >= 3 || recent.some((f) => f !== at && f.message === at.message)) {
      showRecoveryPanel();
      return;
    }
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
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev && ev.reason;
    onFault('rejection', (r && (r.message || r)) || 'rejection');
  });

  // ---- storage availability --------------------------------------------
  // Storage.available() existed and was called from nowhere; in iOS private
  // browsing every write throws, every save silently fails, and the game said
  // "Saved." anyway for a whole playthrough that vanishes on tab close.
  const storageOk = Storage.available();
  if (!storageOk) {
    game.storageAvailable = false;
    game.menus.setTitleWarning(t('ui.storage.warn',
      'This browser will not let the game save — private browsing, most likely. ' +
      'You can play, but nothing will be kept when you close the tab.'));
  }

  game.hud.setVisible(false);
  game.setMode(MODE.TITLE);
  const hasSave = Storage.hasSave();

  // ---- what happened to the save --------------------------------------
  // A save the loader could not use is not gone: it has been copied aside by
  // Storage.load(). Say so on the title, because the alternative is a player
  // who sees CONTINUE missing and concludes their playthrough was deleted —
  // and then starts a new game, which is the only thing that actually could
  // have deleted it.
  const loadState = Storage.lastLoad;
  if (loadState && loadState.status === 'failed') {
    const kept = loadState.rescued
      ? t('ui.savefile.kept', ' The old file has been kept aside, and nothing the game does from here will overwrite it.')
      : '';
    const head = loadState.reason === 'from-newer-build'
      ? t('ui.savefile.newer', 'Your save was written by a newer version of the game, so this one cannot read it.')
      : t('ui.savefile.unreadable', 'Your save could not be read.');
    game.menus.setTitleWarning(head + kept);
  } else if (loadState && loadState.status === 'ok' && loadState.migrated) {
    game.menus.setTitleWarning(t('ui.savefile.migrated',
      'Your save was made by an older version and has been brought forward. Your progress is intact.'));
  }

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
