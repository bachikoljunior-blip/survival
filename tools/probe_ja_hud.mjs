/** Japanese HUD: action button boxes, air readout, compass, interact prompt. */
(async () => {
  const G = window.CINDERLINE.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  G.menus.settings.language = 'ja';
  G.applySettings(G.menus.settings);
  G.emit('locale', 'ja');
  await sleep(120);
  await window.CINDERLINE.startNewGame();
  await sleep(600);
  for (let i = 0; i < 60; i++) G.fixedUpdate(1 / 60);
  await sleep(200);

  // Force a prompt so the sixth button is on screen with a Japanese verb.
  G.hud.setPrompt('Read the board', 'note');
  G.hud.showAutosave();
  await sleep(120);

  const box = (n) => { const r = n.getBoundingClientRect();
    return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const fits = (n) => n.scrollWidth <= n.clientWidth + 1;

  return {
    buttons: Object.entries(G.hud.buttons).map(([k, b]) =>
      ({ k, text: b.textContent, ...box(b), fits: fits(b) })),
    interact: { text: G.hud.interactBtn.textContent, ...box(G.hud.interactBtn),
      fits: fits(G.hud.interactBtn) },
    prompt: G.hud.prompt.textContent,
    filter: G.hud.filterNode.textContent,
    unit: document.querySelector('.air .unit').textContent,
    autosave: G.hud.autosave.textContent,
    compass: [...document.querySelectorAll('.compass .tick')].map((n) => n.textContent),
    objective: [G.hud.chapterNode.textContent, G.hud.taskNode.textContent],
  };
})()
