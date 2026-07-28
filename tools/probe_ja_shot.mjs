/**
 * Screenshot setup for Japanese.
 *
 * Puts the game into Japanese and onto one named screen, then returns what is
 * on it. `shot.mjs` takes the picture afterwards, so this is only the staging:
 * the evidence is the PNG next to the JSON.
 *
 *   node tools/shot.mjs --script tools/probe_ja_shot.mjs --q screen=settings \
 *     --tag ja-settings --w 667 --h 375
 */
(async () => {
  const G = window.CINDERLINE.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const screen = new URLSearchParams(location.search).get('screen') || 'title';

  G.menus.settings.language = 'ja';
  G.applySettings(G.menus.settings);
  G.emit('locale', 'ja');
  await sleep(200);

  G.menus.closePause();
  G.menus.hideTitle();
  G.menus.hideEnding();
  G.menus.hideDeath();

  if (screen === 'title') {
    G.hud.setVisible(false);
    G.menus.showTitle(true);
  } else if (screen === 'settings' || screen === 'status' || screen === 'journal'
             || screen === 'items' || screen === 'map' || screen === 'about') {
    G.menus.openPause(screen, false);
  } else if (screen === 'death') {
    G.hud.setVisible(false);
    G.menus.showDeath('gas');
  } else if (screen === 'ending') {
    const S = G.state;
    S.set('published');
    G.hud.setVisible(false);
    await G.director.finish();
  } else if (screen === 'dialogue') {
    G.hud.setVisible(true);
    const C = G.director.conversations;
    G.director.startConversation(C.final || C.sol_first);
    await sleep(120);
    for (let i = 0; i < 60 && !G.dialogueUI.choiceList; i++) {
      G.dialogueUI.shown = G.dialogueUI.full.length;
      G.dialogueUI.typing = false;
      G.dialogueUI._render();
      G.dialogueUI._afterType();
      if (G.dialogueUI.choiceList) break;
      if (G.dialogueUI.onAdvance) G.dialogueUI.onAdvance(); else break;
      await sleep(30);
    }
  } else if (screen === 'hud') {
    G.hud.setVisible(true);
    G.director.quests.emitObjective();
    G.hud.setPrompt('掲示を読む', 'note', 'Read the board');
    G.hud.notice('<b>ウォーデンの列</b><br>三人、シフトで入っている。', 'bad', 60);
  }

  await sleep(900);
  return {
    screen,
    lang: document.documentElement.getAttribute('data-lang'),
    visibleText: (document.getElementById('ui').innerText || '').replace(/\n{2,}/g, '\n').slice(0, 900),
  };
})();
