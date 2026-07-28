(async () => {
  const C = window.CINDERLINE, G = C.game;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await C.startNewGame();
  await sleep(1500);
  const H = G.hud;
  const R = (n) => { const b = n.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  H.setPrompt('<b>USE</b> &nbsp;Speak to Sol');
  const interactRect = R(H.interactBtn);
  const promptText = H.prompt.textContent;
  await sleep(100);
  const circles = {};
  for (const k of ['attack','dodge','guard','use','heavy']) circles[k] = R(H.buttons[k]);
  circles.interact = interactRect;
  const gaps = {};
  const keys = Object.keys(circles);
  for (let i=0;i<keys.length;i++) for (let j=i+1;j<keys.length;j++){
    const a=circles[keys[i]], b=circles[keys[j]];
    if(!a.w||!b.w) continue;
    const d = Math.hypot((a.x+a.w/2)-(b.x+b.w/2),(a.y+a.h/2)-(b.y+b.h/2));
    gaps[keys[i]+'-'+keys[j]] = +(d - a.w/2 - b.w/2).toFixed(1);
  }
  const sys = {};
  for (const k of ['sysMenu','sysMap','sysLamp','sysMeter']) sys[k] = R(H[k]);
  return {
    viewport: { w: innerWidth, h: innerHeight },
    engineSize: G.engine.size,
    actions: R(H.actions), actionsPE: getComputedStyle(H.actions).pointerEvents,
    circles, gaps, sys,
    promptText,
    vitals: R(document.querySelector('.vitals')),
    hpLbl: R(H.hpBar.lbl), hpLblFont: getComputedStyle(H.hpBar.lbl).fontSize,
    notices: R(document.querySelector('.notices')),
    objective: R(document.querySelector('.objective')),
  };
})()
