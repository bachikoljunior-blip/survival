(async () => {
  const C = window.CINDERLINE, G = C.game;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const R = (n) => { const b = n.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  await C.startNewGame();
  await sleep(1500);
  const out = {};

  // H3 — #hud.hidden must be inert, not merely transparent.
  G.hud.setVisible(false);
  await sleep(900);
  const cs = getComputedStyle(G.hud.node);
  out.hudHidden = { pe: cs.pointerEvents, visibility: cs.visibility, opacity: cs.opacity };
  out.hudHiddenBottomRight = (() => { const n = document.elementFromPoint(630, 340); return n ? (n.id || n.className || n.tagName) : null; })();
  G.hud.setVisible(true);
  await sleep(500);

  // H4 — the portrait nag must block input AND stop the world.
  G.menus.setRotateVisible(true);
  await sleep(100);
  out.rotate = {
    hasHit: G.menus.rotateNode.classList.contains('hit'),
    pe: getComputedStyle(G.menus.rotateNode).pointerEvents,
    centreElement: (() => { const n = document.elementFromPoint(333, 187); return n ? (n.id || n.className) : null; })(),
    enginePaused: G.engine.isPaused,
    reasons: [...G.engine.pauseReasons],
  };
  G.menus.setRotateVisible(false);
  await sleep(100);
  out.rotateOffResumed = !G.engine.isPaused;

  // H9 — left-handed mirrors the frame instead of stacking the stick on the buttons.
  const rightHanded = { actions: R(G.hud.actions), stick: R(G.hud.stick), vitals: R(document.querySelector('.vitals')) };
  document.body.classList.add('lefthanded');
  await sleep(100);
  const lefty = { actions: R(G.hud.actions), attack: R(G.hud.buttons.attack), vitals: R(document.querySelector('.vitals')), sys: R(document.querySelector('.syscluster')) };
  document.body.classList.remove('lefthanded');
  out.handed = { rightHanded, lefty };

  // H10 — reticles project against the engine's CSS size, not the layout viewport.
  out.projection = { engine: { w: G.engine.size.cssW, h: G.engine.size.cssH },
    window: { w: innerWidth, h: innerHeight },
    uiBox: R(document.getElementById('ui')) };

  // M2 — dead affordances gone.
  out.deadAffordances = {
    cdNodes: document.querySelectorAll('.abtn > .cd').length,
    pipRule: [...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => /\.compass \.pip/.test(r.cssText)); } catch { return false; } }),
    setTouchVisible: typeof G.hud.setTouchVisible,
  };
  return out;
})()
