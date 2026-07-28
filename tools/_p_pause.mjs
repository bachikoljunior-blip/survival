(async () => {
  const C = window.CINDERLINE, G = C.game;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await C.startNewGame();
  await sleep(1500);
  const before = { hudHidden: G.hud.node.classList.contains('hidden'), mode: G.mode };
  G.emit('ui:menu');
  await sleep(500);
  G.engine.stop();
  const hud = G.hud.node;
  const cs = getComputedStyle(hud);
  // Would a touch in the bottom-right of the settings list reach a HUD button?
  const probe = (x, y) => { const n = document.elementFromPoint(x, y); return n ? (n.className || n.id || n.tagName) : null; };
  const r = { hudHidden: hud.classList.contains('hidden'), pe: cs.pointerEvents, vis: cs.visibility,
    bottomRight: probe(630, 330), midRight: probe(600, 300), attackBtn: probe(628, 334) };
  G.menus.showPanel('status');
  await sleep(200);
  return { before, pauseOpen: G.menus.pauseOpen, hud: r,
    statusRows: [...G.menus.statusPanel.querySelectorAll('.item')].slice(0, 3)
      .map(n => ({ t: n.textContent.slice(0, 20), h: Math.round(n.getBoundingClientRect().height) })) };
})()
