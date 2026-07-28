(async () => {
  const C = window.CINDERLINE, G = C.game;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await C.startNewGame();
  await sleep(1500);
  const n = G.hud.node;
  const snap = (t) => ({ t, cls: n.className, op: getComputedStyle(n).opacity,
    vis: getComputedStyle(n).visibility,
    hit: (() => { const e = document.elementFromPoint(630, 340); return e ? (e.id || e.className) : null; })() });
  const out = [snap('before')];
  G.hud.setVisible(false);
  out.push(snap('t=0'));
  await sleep(200); out.push(snap('t=200'));
  await sleep(400); out.push(snap('t=600'));
  await sleep(600); out.push(snap('t=1200'));
  return out;
})()
