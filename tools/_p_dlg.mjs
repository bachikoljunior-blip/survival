(async () => {
  const C = window.CINDERLINE, G = C.game;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await C.startNewGame();
  await sleep(1500);
  // The real FINAL node, verbatim from src/content/story.js (5 choices, 2 gated).
  const convo = {
    id: 'final', who: 'system',
    nodes: {
      start: {
        speaker: 'ren',
        text: `The excavators are idling on the published line. Krajcik is standing on the
spoil heap with a clipboard he is not reading. Forty people are watching from the
far side, because it is the largest thing that has happened in Hollis in a year.

I am carrying the log, the order, and the July sheet with my initials in the
check box.`,
        choices: [
          { text: 'Put it on the record. All of it, including me.', tag: 'record', goto: 'e_publish' },
          { text: 'Make him cut it on the true line, openly.', tag: 'the cut',
            if: { trust: ['iris', 12] }, showLocked: true,
            why: 'It needs a surveyor inside willing to sign it. Iris will not.', goto: 'e_cut' },
          { text: 'Take the desk. Draw the line honestly and tell nobody.', tag: 'the deal', goto: 'e_deal' },
          { text: "Burn it. Use their own lorries and empty Hollis.", tag: 'everybody out',
            if: { trust: ['sol', 20] }, showLocked: true,
            why: 'Sol would have to run it with you, and she does not trust you with it.', goto: 'e_evac' },
          { text: 'Walk away. Take it with me.', tag: 'leave', goto: 'e_leave' },
        ],
      },
      e_publish: { speaker: 'ren', text: '.', next: 'end' },
      e_cut: { speaker: 'ren', text: '.', next: 'end' },
      e_deal: { speaker: 'ren', text: '.', next: 'end' },
      e_evac: { speaker: 'ren', text: '.', next: 'end' },
      e_leave: { speaker: 'ren', text: '.', next: 'end' },
    },
    start: 'start',
  };
  G.director.startConversation(convo);
  await sleep(200);
  const ui = G.dialogueUI;
  ui.shown = ui.full.length; ui.typing = false; ui._render(); ui._afterType();
  await sleep(400);
  const cn = ui.choicesNode;
  const cr = cn.getBoundingClientRect();
  const kids = [...cn.children].map(n => {
    const b = n.getBoundingClientRect();
    return { t: (n.textContent||'').slice(0,26), top: Math.round(b.top), bot: Math.round(b.bottom), h: +b.height.toFixed(1) };
  });
  const dr = ui.node.getBoundingClientRect();
  const br = ui.box.getBoundingClientRect();
  return {
    dlg: { top: Math.round(dr.top), bot: Math.round(dr.bottom) },
    box: { top: Math.round(br.top), bot: Math.round(br.bottom) },
    choices: { top: Math.round(cr.top), bot: Math.round(cr.bottom), clientH: cn.clientHeight, scrollH: cn.scrollHeight },
    kids,
  };
})()
