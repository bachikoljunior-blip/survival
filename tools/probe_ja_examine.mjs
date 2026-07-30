/** Japanese examine text + interact prompt through the real interact path. */
(async () => {
  const G = window.CINDERLINE.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  G.menus.settings.language = 'ja';
  G.applySettings(G.menus.settings);
  G.emit('locale', 'ja');
  await sleep(120);
  await window.CINDERLINE.startNewGame();
  await sleep(500);

  // Drive the real interaction resolver against a real world interaction.
  const it = G.city.interactions.find((i) => i.topic === 'bek_letter')
    || G.city.interactions.find((i) => i.kind === 'examine');
  G.director._examine(it || { topic: 'the_log' });
  await sleep(300);
  const first = G.dialogueUI.full;
  G.dialogueUI._tap(); await sleep(60); G.dialogueUI.onAdvance();
  await sleep(300);

  // And a world prompt through phrase().
  const p = G.player;
  const target = G.city.interactions.find((i) => i.prompt === 'Read the board');
  let prompt = null;
  if (target) {
    p.placeAt(target.x, target.y, target.z + 1.2);
    G.camera.yaw = Math.PI;
    for (let i = 0; i < 20; i++) G.fixedUpdate(1 / 60);
    prompt = G.hud.prompt.textContent;
  }
  return { first, second: G.dialogueUI.full, prompt,
    journalTitles: G.director.state.journal.map((j) => j.id) };
})()
