(async () => {
  const C = window.CINDERLINE, G = C.game;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await C.startNewGame();
  await sleep(2000);
  // Freeze the sim so the contextual prompt stays up for the frame, and drain
  // stamina so the disabled-button state is visible too.
  G.player.stamina = 4;
  G.hud.update(1 / 60);
  G.engine.addPause('probe');
  G.hud.setPrompt('<b>USE</b> &nbsp;Speak to Sol');
  G.hud.notice('Filter fitted. <b>92%</b>', 'good', 9);
  G.hud.subtitle('SOL', 'Keep off the low ground after dark.', 9);
  await sleep(150);
  return { ok: true, staDis: G.hud.buttons.heavy.className, prompt: G.hud.prompt.textContent };
})()
