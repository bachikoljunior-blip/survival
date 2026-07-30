/**
 * Japanese fit probe for the second story block (nessa_truth, nessa_rescue,
 * iris_first, iris_after, krajcik, garage, vent_decision, final).
 *
 * Drives the REAL DialogueUI through the REAL localiser: each node is started
 * as a conversation whose id and node id match src/content/story.js, so the
 * text on screen is whatever c.<convo>.<node>.text resolves to in ja. English
 * placeholders sit underneath, so a missing key shows up as Latin text and a
 * wrong key shows up as a fit failure on the wrong line.
 *
 * Reports, per node: dialogue-box top (negative or above 0 means it has grown
 * off the top of a 375px screen), how many choices are fully visible without
 * scrolling, and whether the choice list overflows.
 *
 * Leaves final/choose — five choices, two of them locked with a `why` — on
 * screen for the screenshot, because it is the tightest node in the game.
 *
 *   node tools/shot.mjs --w 667 --h 375 --tag ja2 --script tools/probe_ja2.mjs
 */
(async () => {
  const C = window.CINDERLINE, G = C.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await C.startNewGame();
  await sleep(1500);
  G.applySettings({ ...G.settings, language: 'ja' });
  await sleep(300);

  // Authored shape only — ids, choice counts, tags, why, locked-ness. The text
  // is English filler that the ja table is expected to replace.
  const X = 'EN';
  const c = (n, opts = {}) => ({ text: X, ...opts });
  const ch = (n) => Array.from({ length: n }, () => ({ text: X, goto: 'end' }));

  const SPEC = {
    nessa_truth: {
      start: {}, nt_notyet: {}, nt2: { n: 3 }, nt_give: {}, nt_give2: {},
      nt_tell: {}, nt_tell2: { s: 'ren' }, nt_tell3: {}, nt_withhold: {},
      nt_after: { n: 4 }, nt_yours: {}, nt_hear: {}, nt_carry: {},
      nt_shop: {}, nt_shop2: {}, nt_end: {},
    },
    nessa_rescue: { start: {}, r2: { n: 2 }, r_filter: {}, r_walk: {}, r_out: {} },
    iris_first: {
      start: {}, i2: {}, i3: { n: 3 }, i_hello: {}, i_office: {}, i_lines: {},
      i_lines2: { n: 3 }, i_long: {}, i_say: {}, i_same: {}, i_same2: {},
      i_pass_q: { n: 3 }, i_log: {}, i_log2: {}, i_order: {}, i_finish: {},
      i_decide: {}, i_gives: {}, i_refuses: {}, i_end: {}, again: {},
      a_gave: {}, a_nogave: {},
    },
    iris_after: {
      start: {}, i_accused: {}, i_shared: {}, i_flat: {}, i_hub: { n: 5 },
      i_log: {}, i_door: {}, i_folder: {}, i_folder2: {}, i_sign: {},
    },
    krajcik: {
      again: {}, ag_accepted: {}, ag_cut: {}, ag_refused: {}, start: {},
      k2: { n: 3 }, k_knew: {}, k_order: {}, k_understand: {}, k_ledger: {},
      k_ledger_read: { n: 2, s: 'ren' }, k_noscheme: {}, k_ledger2: {},
      k_ledger3: { n: 4 }, k_cut: {}, k_choice: {}, k_after: {}, k_offer: {},
      k_offer2: { n: 4 }, k_refuse: {}, k_accept: {}, k_lie: {},
      k_deal_cut: {}, k_end: {},
    },
    garage: {
      again: {}, g_again_knows: {}, g_again_sign: {}, g_sign_plain: {},
      g_sign_nessa: {}, start: {}, g2: { n: 3 }, g_air: {}, g_why: {},
      g_filter: {}, g_end: {},
    },
    vent_decision: { start: { n: 3, s: 'ren' }, v_shut: { s: 'ren' }, v_leave: { s: 'ren' }, v_half: { s: 'ren' } },
    final: {
      start: { s: 'ren' }, k_sees: {}, k_unlogged: {}, k_stranger: {},
      k_renege: {}, k_lied: {}, k_asked: {}, k_asked2: {}, k_plain: {},
      k_291: {}, choose: { s: 'ren', final: true },
      e_publish: { s: 'ren' }, e_cut: { s: 'ren' }, e_cut_iris: {},
      e_cut_self: { s: 'ren' }, e_deal: { s: 'ren' }, e_evac: { s: 'ren' },
      e_leave: { s: 'ren' },
    },
  };
  const SPEAKER = { nessa_truth: 'nessa', nessa_rescue: 'nessa', iris_first: 'iris',
    iris_after: 'iris', krajcik: 'krajcik', garage: 'ostrowski', vent_decision: 'ren', final: 'krajcik' };

  // The real final/choose choice array, tags and locked `why` included.
  const FINAL_CHOICES = [
    { text: X, tag: 'record', goto: 'end' },
    { text: X, tag: 'the cut', goto: 'end', if: { flag: '__never' }, showLocked: true, why: X },
    { text: X, tag: 'the deal', goto: 'end' },
    { text: X, tag: 'everybody out', goto: 'end', if: { flag: '__never' }, showLocked: true, why: X },
    { text: X, tag: 'leave', goto: 'end' },
  ];

  const ui = G.dialogueUI;
  const measure = () => {
    const br = ui.box.getBoundingClientRect();
    const cn = ui.choicesNode;
    const cr = cn.getBoundingClientRect();
    const kids = [...cn.children];
    const vis = kids.filter((k) => {
      const r = k.getBoundingClientRect();
      return r.top >= cr.top - 1 && r.bottom <= cr.bottom + 1;
    }).length;
    return {
      boxTop: Math.round(br.top), boxBot: Math.round(br.bottom), boxH: Math.round(br.height),
      txtH: Math.round(ui.txt.getBoundingClientRect().height),
      nChoices: kids.length, choicesVisible: vis,
      overflow: cn.scrollHeight - cn.clientHeight > 4,
      scrollH: cn.scrollHeight, clientH: cn.clientHeight,
      widest: Math.max(0, ...kids.map((k) => Math.round(k.getBoundingClientRect().height))),
    };
  };

  const out = [];
  let last = null;
  for (const [cid, nodes] of Object.entries(SPEC)) {
    for (const [nid, o] of Object.entries(nodes)) {
      const choices = o.final ? FINAL_CHOICES : (o.n ? ch(o.n) : undefined);
      const convo = { id: cid, nodes: { [nid]: { speaker: o.s || SPEAKER[cid], text: X, choices, next: 'end' } }, start: nid };
      G.director.startConversation(convo, null);
      // No frame wait: show() has already written the DOM and _afterType()
      // builds the choice rows synchronously, so getBoundingClientRect() below
      // forces the layout we want. Waiting on rAF here costs a whole frame per
      // node, and a frame on a software renderer under load is seconds.
      ui.shown = ui.full.length; ui.typing = false; ui._render(); ui._afterType();
      const m = measure();
      m.id = `${cid}.${nid}`;
      m.untranslated = ui.full.indexOf('EN') >= 0;
      m.chars = ui.full.length;
      out.push(m);
      last = { cid, nid, convo };
      // Close, except on the last one, which stays up for the screenshot.
      if (!(cid === 'final' && nid === 'choose')) {
        try { G.director.dialogue.finish(); } catch (e) { ui.hide(); }
      }
    }
  }

  // Re-open the tightest node so it is the thing on screen at shot time.
  {
    const convo = { id: 'final', nodes: { choose: { speaker: 'ren', text: X, choices: FINAL_CHOICES } }, start: 'choose' };
    G.director.startConversation(convo, null);
    ui.shown = ui.full.length; ui.typing = false; ui._render(); ui._afterType();
    await sleep(400);
  }

  const bad = out.filter((m) => m.boxTop < 0 || m.untranslated
    || (m.nChoices && m.choicesVisible < m.nChoices));
  return {
    viewport: [window.innerWidth, window.innerHeight],
    lang: document.documentElement.getAttribute('data-lang'),
    nodes: out.length,
    worstBoxTop: Math.min(...out.map((m) => m.boxTop)),
    longest: out.slice().sort((a, b) => b.chars - a.chars).slice(0, 6).map((m) => `${m.id} ${m.chars}ch box=${m.boxH}px top=${m.boxTop}`),
    problems: bad.map((m) => `${m.id} top=${m.boxTop} choices=${m.choicesVisible}/${m.nChoices} overflow=${m.overflow} untranslated=${m.untranslated}`),
    onScreen: measure(),
    all: out,
  };
})()
