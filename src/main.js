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
  game.menus.showTitle(Storage.hasSave());
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
