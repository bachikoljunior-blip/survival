/**
 * Screenshot companion to probe_ja2.mjs: switches to Japanese and leaves the
 * tightest node in the game — final/choose, five choices, two of them locked
 * and carrying a `why` — on screen so the frame can be looked at.
 *
 * Separate from the measuring probe because that one walks 111 nodes, and on a
 * software renderer under load the extra work is what makes page.screenshot
 * time out waiting for a compositor frame.
 *
 *   node tools/shot.mjs --w 667 --h 375 --dpr 1 --tag ja2shot --script tools/probe_ja2_shot.mjs
 */
(async () => {
  const C = window.CINDERLINE, G = C.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await C.startNewGame();
  await sleep(1200);
  G.applySettings({ ...G.settings, language: 'ja' });
  await sleep(200);

  const X = 'EN';
  const convo = {
    id: 'final',
    nodes: {
      choose: {
        speaker: 'ren', text: X,
        choices: [
          { text: X, tag: 'record', goto: 'end' },
          { text: X, tag: 'the cut', goto: 'end', if: { flag: '__never' }, showLocked: true, why: X },
          { text: X, tag: 'the deal', goto: 'end' },
          { text: X, tag: 'everybody out', goto: 'end', if: { flag: '__never' }, showLocked: true, why: X },
          { text: X, tag: 'leave', goto: 'end' },
        ],
      },
    },
    start: 'choose',
  };
  G.director.startConversation(convo, null);
  const ui = G.dialogueUI;
  ui.shown = ui.full.length; ui.typing = false; ui._render(); ui._afterType();
  await sleep(500);

  const cn = ui.choicesNode;
  const cr = cn.getBoundingClientRect();
  const rows = [...cn.children].map((n) => {
    const r = n.getBoundingClientRect();
    return { t: (n.textContent || '').slice(0, 34), top: Math.round(r.top), bot: Math.round(r.bottom),
      inside: r.top >= cr.top - 1 && r.bottom <= cr.bottom + 1 };
  });
  const br = ui.box.getBoundingClientRect();
  return {
    lang: document.documentElement.getAttribute('data-lang'),
    text: ui.full,
    box: { top: Math.round(br.top), bot: Math.round(br.bottom) },
    choicesFullyVisible: rows.filter((r) => r.inside).length + '/' + rows.length,
    overflow: cn.scrollHeight - cn.clientHeight > 4,
    rows,
  };
})()
