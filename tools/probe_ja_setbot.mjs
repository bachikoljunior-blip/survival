/** Settings panel in Japanese, scrolled to the bottom, measured. */
(async () => {
  const G = window.CINDERLINE.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  G.menus.settings.language = 'ja';
  G.applySettings(G.menus.settings);
  G.emit('locale', 'ja');
  await sleep(120);
  G.menus.hideTitle();
  G.menus.openPause('settings');
  await sleep(300);
  const p = G.menus.panels.settings.panel;
  p.scrollTop = p.scrollHeight;
  await sleep(200);
  const lh = (n) => parseFloat(getComputedStyle(n).lineHeight) || 12;
  return {
    rows: [...p.querySelectorAll('.item')].map((n) => {
      const nm = n.querySelector('.nm');
      const sub = nm && nm.querySelector('i');
      return {
        label: nm ? nm.childNodes[0].textContent.trim() : '',
        sub: sub ? sub.textContent : '',
        rowH: +n.getBoundingClientRect().height.toFixed(1),
        labelLines: nm ? Math.round((nm.getBoundingClientRect().height
          - (sub ? sub.getBoundingClientRect().height : 0)) / lh(nm)) : 0,
        subLines: sub ? Math.round(sub.getBoundingClientRect().height / lh(sub)) : 0,
      };
    }),
    note: p.querySelector('.sub') ? p.querySelector('.sub').textContent : '',
    overflowX: p.scrollWidth - p.clientWidth,
  };
})()
