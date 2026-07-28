/** Japanese ending screen: pick a run's worth of state, then show the ending. */
(async () => {
  const G = window.CINDERLINE.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  G.menus.settings.language = 'ja';
  G.applySettings(G.menus.settings);
  G.emit('locale', 'ja');
  await sleep(120);
  G.menus.hideTitle();

  const S = G.director.state;
  S.record('final', 'publish');
  S.record('krajcik_offer', 'lied');
  S.record('log_intent', 'use');
  S.record('vents', 'shut');
  S.record('nessa_truth', 'told');
  S.counters.set('crisis_lost', 2);
  S.counters.set('crisis_rescued', 2);
  S.counters.set('metersRead', 7);
  S.counters.set('breached', 3);
  S.counters.set('parries', 9);
  S.set('trench_slipped');
  S.set('vents_shut');
  S.set('nessa_rescued');
  S.filtersUsed = 4;
  S.deaths = 1;
  S.playTime = 3720;
  G.playTime = 3720;

  await G.director.finish();
  await sleep(600);

  const body = document.querySelector('.ending .scroll');
  body.scrollTop = 0;
  await sleep(120);
  return {
    title: document.querySelector('.ending .screen-title').textContent,
    paras: [...body.querySelectorAll('.sub')].map((d) => d.textContent),
    scrollHeight: body.scrollHeight,
    clientHeight: body.clientHeight,
    overflowX: body.scrollWidth - body.clientWidth,
  };
})()
