(async () => {
  const C = window.CINDERLINE, G = C.game;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await C.startNewGame();
  await sleep(1200);
  G.engine.stop();
  const ending = {
    title: 'ON THE RECORD',
    text: `I read the July sheet out at the barrier with my own initials in the check box,
and then I read the rest of it, and nobody stopped me.`,
  };
  const paras = [
    `The contract voided in eleven days. The Authority pulled its people out of Hollis in a
fortnight and the relocation stopped where it stood, which was nine households short of
Cellar Row.`,
    `Sol got them out anyway, on borrowed lorries, over six weeks, and never once said what
it cost her.`,
    `Time in Hollis: 74 minutes. Filters spent: 6. You went down 2 times.`,
  ];
  // Exactly the director's finish() sequence.
  await G.menus.fadeOut(true);
  G.menus.showEnding(ending, paras);
  await sleep(300);
  // Then force the fade plate back on: the ending must still be readable even
  // if a caller leaves #fade up, which is the failure mode being fixed.
  document.getElementById('fade').classList.add('on');
  await sleep(200);
  const end = G.menus.endNode.getBoundingClientRect();
  const mid = document.elementFromPoint(Math.round(end.width / 2), Math.round(end.height / 2));
  const btn = [...G.menus.endNode.querySelectorAll('.btn')][0].getBoundingClientRect();
  const btnHit = document.elementFromPoint(btn.x + btn.width / 2, btn.y + btn.height / 2);
  const body = G.menus.endBody;
  return {
    fadeOn: document.getElementById('fade').classList.contains('on'),
    fadeZ: getComputedStyle(document.getElementById('fade')).zIndex,
    endingZ: getComputedStyle(G.menus.endNode).zIndex,
    centreElement: mid && (mid.id || mid.className),
    titleButtonReachable: !!(btnHit && btnHit.classList.contains('btn')),
    bodyScroll: { clientH: body.clientHeight, scrollH: body.scrollHeight },
    bodyIsHit: body.classList.contains('hit'),
  };
})()
