/**
 * Japanese dialogue fit probe.
 *
 * Switches the running game to `ja` and pushes the real story nodes through
 * the real DialogueUI, going through localiseNode() exactly as play does — the
 * node objects below carry the ENGLISH text as the fallback and the AUTHORED
 * choice arrays, so anything on screen that is Japanese arrived via the i18n
 * table under `c.<convo>.<node>`.
 *
 * Reports, per node: whether the dialogue block overflowed the viewport, and
 * whether the choice list had to scroll. Leaves the screen on TARGET so
 * tools/shot.mjs can photograph it.
 *
 *   node tools/shot.mjs --w 667 --h 375 --script tools/probe_ja_dialogue.mjs --tag ja-dlg
 */
(async () => {
  const C = window.CINDERLINE, G = C.game;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await C.startNewGame();
  await sleep(1200);

  // Real path: the settings object owns the language, applySettings calls
  // setLocale. Nothing here reaches into i18n behind the game's back.
  G.applySettings({ ...G.settings, language: 'ja' });
  await sleep(200);

  const lang = document.documentElement.getAttribute('data-lang');

  // The nodes most at risk: longest prose, most choices, and the 8-choice shop.
  const CASES = [
    ['sol_first', 'vc_math', 'sol', null, []],
    ['sol_first', 'vc_admit', 'sol', null, [
      'Give me the arithmetic.',
      "You're doing exactly what Krajcik does. Just smaller.",
      "Nothing. I just needed to hear you say it.",
    ]],
    ['sol_first', 's2', 'sol', null, [
      'I know it. I used to survey it.',
      "I know the air. That's all I need to know.",
      "I'm passing through.",
    ]],
    ['sol_first', 'ac_all', 'sol', 'quiet', []],
    ['sol_after_raid', 'r_shift', 'sol', null, []],
    ['teo_first', 'a_shop', 'teo', null, [
      '[Trade]', 'Can you do anything with this bar?', 'You said a name. Iris Nadel.',
      'Bek. What was he like?', 'Field 9. Half those heads are mine.',
      'Tell me about the Cinder Line.', 'Tell me about Sol.', 'Nothing today.',
    ]],
    ['teo_first', 't_why2', 'teo', null, [
      'What was he like?', 'You could have burned it.', '[Say nothing]',
    ]],
    ['teo_log', 'l_pub', 'teo', null, []],
    ['nessa_first', 'n2', 'nessa', null, [
      'How low do you go?', "That's a bad job.", "Bek. Are you Ilya Bek's daughter?",
    ]],
    ['nessa_first', 'at_told', 'nessa', null, []],
  ];

  // Photograph this one. Longest single node with a full choice list.
  const TARGET = 'nessa_first/n2';

  const ui = G.dialogueUI;
  const out = [];

  const stage = async ([convo, nodeId, who, mood, choices]) => {
    G.director.startConversation({
      id: convo, start: nodeId,
      nodes: {
        [nodeId]: {
          id: nodeId, speaker: who, mood,
          text: 'ENGLISH FALLBACK — a translation is missing if you can read this.',
          choices: choices.map((t) => ({ text: t, goto: 'end' })),
        },
      },
    });
    await sleep(150);
    ui.shown = ui.full.length; ui.typing = false; ui._render(); ui._afterType();
    await sleep(250);
  };

  for (const kase of CASES) {
    const [convo, nodeId] = kase;
    await stage(kase);

    const vh = window.innerHeight, vw = window.innerWidth;
    const dr = ui.node.getBoundingClientRect();
    const br = ui.box.getBoundingClientRect();
    const cn = ui.choicesNode;
    const cr = cn.getBoundingClientRect();
    const txt = ui.txt.getBoundingClientRect();
    // Any glyph wider than its box, or a box past the top of the screen.
    const rec = {
      node: `${convo}/${nodeId}`,
      chars: ui.full.length,
      hasJapanese: /[぀-ヿ一-鿿]/.test(ui.txt.textContent || ''),
      untranslated: (ui.txt.textContent || '').includes('ENGLISH FALLBACK'),
      textH: Math.round(txt.height),
      boxTop: Math.round(br.top), boxBot: Math.round(br.bottom),
      dlgTop: Math.round(dr.top),
      clippedAtTop: dr.top < 0,
      hSpill: Math.round(ui.txt.scrollWidth - ui.txt.clientWidth),
      choiceCount: cn.children.length,
      choiceScroll: cn.scrollHeight > cn.clientHeight + 2,
      choiceClientH: cn.clientHeight, choiceScrollH: cn.scrollHeight,
      choiceKids: [...cn.children].map((n) => {
        const b = n.getBoundingClientRect();
        return { h: Math.round(b.height), spill: Math.round(n.scrollWidth - n.clientWidth), t: (n.textContent || '').slice(0, 18) };
      }),
      vw, vh,
    };
    out.push(rec);
    G.director.dialogue.finish();
    await sleep(80);
  }

  // Re-stage the target last so the screenshot lands on it.
  await stage(CASES.find(([a, b]) => `${a}/${b}` === TARGET));

  const worst = out.filter((r) => r.clippedAtTop || r.hSpill > 0 || r.untranslated);
  return { lang, shotOf: TARGET, problems: worst.map((r) => r.node), cases: out };
})()
