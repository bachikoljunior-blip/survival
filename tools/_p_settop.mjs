(async () => {
  const C = window.CINDERLINE, G = C.game;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  G.menus.openPause('settings', true);
  await sleep(300);
  G.engine.stop();
  await sleep(100);
  const p = G.menus.settingsPanel;
  const R = (n) => { const b = n.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
  const steppers = [...p.querySelectorAll('.glyph.hit')].slice(0, 4).map(R);
  const tabs = [...document.querySelectorAll('.tab')].map(R);
  const close = R(document.querySelector('.close'));
  const btns = [...document.querySelectorAll('.screen.on .btn')].map(R);
  return { steppers, tabs, close, btns,
    scroll: { clientH: p.clientHeight, scrollH: p.scrollHeight },
    minTarget: Math.min(...[...steppers, ...tabs, close, ...btns].map(o => Math.min(o.w, o.h))) };
})()
