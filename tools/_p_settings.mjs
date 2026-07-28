(async () => {
  const C = window.CINDERLINE, G = C.game;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await C.startNewGame();
  await sleep(1500);
  G.emit('ui:menu');
  G.menus.showPanel('settings');
  await sleep(300);
  const p = G.menus.settingsPanel;
  const r = p.getBoundingClientRect();
  const rows = [...p.children].map(n => {
    const b = n.getBoundingClientRect();
    return { cls: n.className, text: (n.textContent || '').slice(0, 28), top: Math.round(b.top), h: Math.round(b.height) };
  });
  const cs = getComputedStyle(p);
  return {
    panel: { top: Math.round(r.top), h: Math.round(r.height), scrollH: p.scrollHeight, clientH: p.clientHeight },
    overflowY: cs.overflowY, touchAction: cs.touchAction,
    bodyTouchAction: getComputedStyle(document.body).touchAction,
    panelPE: cs.pointerEvents,
    rows: rows.slice(0, 60),
  };
})()
