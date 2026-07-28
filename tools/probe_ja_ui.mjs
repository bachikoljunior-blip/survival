/**
 * Japanese interface probe.
 *
 * Switches to Japanese, opens each pause tab, and MEASURES the rows that can
 * break: every settings row's height (a wrapped label makes it taller than its
 * neighbours), every button's box, and the tab strip's total width against the
 * viewport. Returns the offenders rather than a screenshot of them.
 */
(async () => {
  const G = window.CINDERLINE.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // --- switch to Japanese through the same path the player uses -------------
  G.menus.settings.language = 'ja';
  G.applySettings(G.menus.settings);
  G.emit('locale', 'ja');
  await sleep(120);

  const which = new URLSearchParams(location.search).get('panel') || 'journal';

  const box = (n) => {
    const r = n.getBoundingClientRect();
    return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  };

  const report = { lang: document.documentElement.getAttribute('data-lang'), panel: which };

  if (which === 'title') {
    G.menus.showTitle(true);
    await sleep(200);
    report.buttons = [...document.querySelectorAll('#title .btn')]
      .map((b) => ({ text: b.textContent, ...box(b) }));
    const tl = document.querySelector('#title .tagline');
    report.tagline = { ...box(tl), text: tl.textContent.slice(0, 20) };
  } else if (which === 'death') {
    G.menus.hideTitle();
    G.menus.showDeath('gas');
    await sleep(200);
    report.title = document.querySelector('.dead-inner .k').textContent;
    report.sub = document.querySelector('.dead-inner .s').textContent;
    report.buttons = [...document.querySelectorAll('.dead-inner .btn')]
      .map((b) => ({ text: b.textContent, ...box(b) }));
  } else if (which === 'ending') {
    G.menus.hideTitle();
    const { ENDINGS } = await import('./__none__').catch(() => ({}));
    G.director.state.record('final', 'publish');
    G.director.state.counters.set('crisis_lost', 2);
    G.director.state.set('trench_slipped');
    await G.director.finish();
    await sleep(400);
    report.endTitle = document.querySelector('.ending .screen-title').textContent;
    report.paras = [...document.querySelectorAll('.ending .scroll .sub')]
      .map((d) => d.textContent.slice(0, 44));
  } else {
    // Give the run something to show in Kit and Journal.
    G.menus.hideTitle();
    const S = G.director.state;
    S.give('filter', 2); S.give('salvage', 6); S.give('logbook', 1); S.give('manual', 1);
    S.unlock('readAir'); S.unlock('breach');
    S.addJournal('back', 'Back in Hollis', 'x');
    S.addJournal('bek', "Bek's letter", 'x');
    G.director.quests.start('arrival');
    G.director.quests.start('cellarRow');
    G.menus.openPause(which);
    await sleep(320);
    const panel = G.menus.panels[which].panel;
    report.tabs = [...document.querySelectorAll('.tabs .tab')]
      .filter((n) => n.style.display !== 'none')
      .map((n) => ({ text: n.textContent, ...box(n) }));
    report.tabsTotal = +[...document.querySelectorAll('.tabs .tab')]
      .filter((n) => n.style.display !== 'none')
      .reduce((a, n) => a + n.getBoundingClientRect().width, 0).toFixed(1);
    report.viewport = window.innerWidth;
    report.rows = [...panel.querySelectorAll('.item')].map((n) => {
      const nm = n.querySelector('.nm');
      return {
        text: (nm ? nm.childNodes[0].textContent : n.textContent).trim().slice(0, 24),
        h: box(n).h,
        nmH: nm ? box(nm).h : 0,
        lines: nm ? Math.round(box(nm).h / parseFloat(getComputedStyle(nm).lineHeight || 12)) : 0,
      };
    });
    report.headings = [...panel.querySelectorAll('.h')].map((n) => n.textContent);
    report.subs = [...panel.querySelectorAll('.sub')].map((n) => n.textContent.slice(0, 40));
    report.scrollOverflowX = panel.scrollWidth - panel.clientWidth;
    report.footButtons = [...G.menus.pauseNode.querySelectorAll('.screen-inner > div > .btn')]
      .map((b) => ({ text: b.textContent, ...box(b) }));
  }

  report.missing = window.CINDERLINE.missingKeys ? window.CINDERLINE.missingKeys() : null;
  return report;
})()
