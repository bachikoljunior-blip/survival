/**
 * Japanese layout fit probe.
 *
 * Switches to Japanese through the same path the settings panel uses, walks the
 * screens that carry the most text, and MEASURES what could break rather than
 * asking somebody to look at a picture:
 *
 *   · the dialogue box: does the typed line overflow its own scroll height
 *   · the choice list: does any single choice wrap past two lines
 *   · every settings row: is any row taller than the rest because its label wrapped
 *   · the tab strip, the action buttons, the HUD air readout
 *   · the whole page: does anything stick out past the viewport width
 *
 * Anything that overflows comes back as a named offender with its numbers.
 * `?stage=` picks which screen: title | dialogue | choices | settings | status |
 * journal | items | map | hud | ending.
 */
(async () => {
  const G = window.CINDERLINE.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Same path the player takes: write the setting, apply, announce.
  G.menus.settings.language = 'ja';
  G.applySettings(G.menus.settings);
  G.emit('locale', 'ja');
  await sleep(200);

  const STAGES = ['title', 'hud', 'dialogue', 'choices', 'settings', 'status',
                  'journal', 'items', 'map', 'ending'];
  const all = [];
  for (const stage of STAGES) all.push(await run(stage));
  return { lang: document.documentElement.getAttribute('data-lang'),
    ok: all.every((s) => s.ok), stages: all };

  // Every stage in one page load. Booting the game once per screen costs half a
  // minute each and there are ten of them.
  async function run(stage) {
    const R = (n) => {
      const r = n.getBoundingClientRect();
      return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    };
    const out = {
      stage,
      lang: document.documentElement.getAttribute('data-lang'),
      viewport: { w: innerWidth, h: innerHeight },
      offenders: [],
      samples: {},
    };
    const flag = (what, detail) => out.offenders.push({ what, ...detail });

    const closeAll = () => { G.menus.closePause(); G.menus.hideTitle(); G.menus.hideEnding(); };

    if (stage === 'title') {
      closeAll();
      G.menus.showTitle(true);
      await sleep(250);
      const tag = document.querySelector('#title .tagline');
      out.samples.tagline = tag ? tag.textContent : null;
      out.samples.taglineBox = tag ? R(tag) : null;
      for (const b of document.querySelectorAll('#title .btn')) {
        const r = R(b);
        out.samples[`btn:${b.textContent.trim()}`] = r;
        if (r.h > 46) flag('title button wrapped', { label: b.textContent.trim(), ...r });
      }
    }

    if (stage === 'dialogue' || stage === 'choices') {
      closeAll();
      // The five-choice node is the worst case in the game for the choice list.
      const C = G.director.conversations;
      // `final` is the five-choice node — the worst case for the choice list.
      const convo = stage === 'choices' ? (C.final ? 'final' : 'sol_first') : 'sol_first';
      G.director.startConversation(C[convo]);
      await sleep(150);
      // Whatever conversation actually opened, run it to a node with choices.
      for (let i = 0; i < 40 && !G.dialogueUI.choiceList; i++) {
        G.dialogueUI.shown = G.dialogueUI.full.length;
        G.dialogueUI.typing = false;
        G.dialogueUI._render();
        G.dialogueUI._afterType();
        if (G.dialogueUI.choiceList) break;
        if (G.dialogueUI.onAdvance) G.dialogueUI.onAdvance(); else break;
        await sleep(40);
      }
      await sleep(200);
      const txt = document.querySelector('#dlg .dlg-txt');
      const box = document.querySelector('#dlg .dlg-box');
      if (txt && box) {
        out.samples.line = txt.textContent.slice(0, 120);
        out.samples.txt = R(txt);
        out.samples.box = R(box);
        // A space anywhere in a Japanese line means the newline join leaked.
        if (/\S \S/.test(txt.textContent) && !/[A-Za-z0-9]/.test(txt.textContent)) {
          flag('space inside a Japanese sentence', { text: txt.textContent.slice(0, 80) });
        }
        if (txt.scrollHeight > txt.clientHeight + 2) {
          flag('dialogue text overflows its box',
            { scrollHeight: txt.scrollHeight, clientHeight: txt.clientHeight });
        }
      }
      const cs = [...document.querySelectorAll('#dlg .dlg-choice')];
      out.samples.choiceCount = cs.length;
      out.samples.choices = cs.map((c) => ({ text: c.textContent.slice(0, 60), ...R(c) }));
      const wrap = document.querySelector('#dlg .dlg-choices');
      if (wrap) {
        out.samples.choiceScroll = { scrollHeight: wrap.scrollHeight, clientHeight: wrap.clientHeight };
      }
      for (const c of cs) {
        const r = R(c);
        if (r.h > 64) flag('choice taller than two lines', { text: c.textContent.slice(0, 40), ...r });
      }
    }

    if (['settings', 'status', 'journal', 'items', 'map'].includes(stage)) {
      closeAll();
      G.menus.openPause(stage === 'settings' ? 'settings' : stage, false);
      await sleep(stage === 'map' ? 700 : 260);
      const panel = G.menus.panels[stage === 'settings' ? 'settings' : stage].panel;
      const rows = [...panel.querySelectorAll('.item, .row')];
      const heights = rows.map((r) => R(r).h);
      const median = heights.slice().sort((a, b) => a - b)[Math.floor(heights.length / 2)] || 0;
      out.samples.rowCount = rows.length;
      out.samples.medianRowHeight = +median.toFixed(1);
      out.samples.panelScrollHeight = panel.scrollHeight;
      out.samples.panelClientHeight = panel.clientHeight;
      out.samples.screensTall = +(panel.scrollHeight / innerHeight).toFixed(2);
      rows.forEach((r) => {
        const b = R(r);
        // A row that wrapped is visibly taller than the row next to it.
        if (median && b.h > median * 1.45) {
          flag('settings/list row wrapped',
            { text: r.textContent.trim().slice(0, 44), h: b.h, median: +median.toFixed(1) });
        }
      });
      const tabs = [...document.querySelectorAll('.screen-tabs .tab')].filter((n) => n.style.display !== 'none');
      if (tabs.length) {
        const strip = tabs[0].parentElement;
        out.samples.tabStrip = R(strip);
        if (strip.scrollWidth > strip.clientWidth + 2) {
          flag('tab strip overflows',
            { scrollWidth: strip.scrollWidth, clientWidth: strip.clientWidth,
              tabs: tabs.map((t) => t.textContent.trim()) });
        }
      }
    }

    if (stage === 'hud') {
      closeAll();
      G.hud.setVisible(true);
      G.hud.setPrompt('掲示を読む', 'note', 'Read the board');
      G.hud.notice('<b>ワーデンの列</b><br>三人、シフトで入っている。', 'bad', 30);
      G.hud.setObjective('第1章', '中庭を横切り、スタックス中央の火のところへ行く。');
      await sleep(200);
      for (const sel of ['.abtn.attack', '.abtn.heavy', '.abtn.dodge', '.abtn.guard',
                         '.abtn.use', '.abtn.interact', '.air .filter', '.objective .task',
                         '.notice', '.prompt']) {
        const n = document.querySelector(`#hud ${sel}`);
        if (!n) continue;
        const r = R(n);
        out.samples[sel] = { text: n.textContent.trim().slice(0, 48), ...r };
        if (n.scrollWidth > n.clientWidth + 2 && sel.startsWith('.abtn')) {
          flag('button label wider than its button',
            { sel, text: n.textContent.trim(), scrollWidth: n.scrollWidth, clientWidth: n.clientWidth });
        }
      }
    }

    if (stage === 'ending') {
      closeAll();
      G.menus.showEnding(
        { id: 'record', title: '記録', text: '一段落目。\n\n二段落目。' },
        ['あとがきの段落。', 'ホリスで24分。メーターを6回持ち上げた。カートリッジ3本。']);
      await sleep(250);
      const body = G.menus.endBody;
      out.samples.paras = [...body.children].map((c) => ({ text: c.textContent.slice(0, 50), ...R(c) }));
      out.samples.scroll = { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight };
    }

    // Nothing anywhere may stick out sideways.
    //
    // Measured only once every entry animation has finished. Notices slide in
    // from the right over 280ms, so a scan taken during one reports a 14px spill
    // that does not exist a frame later — which is exactly the kind of finding
    // that wastes an afternoon.
    await sleep(600);
    const wide = [];
    for (const n of document.querySelectorAll('#ui *, #hud *')) {
      const r = n.getBoundingClientRect();
      const anim = typeof n.getAnimations === 'function' && n.getAnimations().length > 0;
      // Hidden things are allowed to be parked off-screen: the lock-on reticle
      // and the enemy pip sit at the origin under a -50% translate until a
      // target exists, which is a negative left and not a layout fault.
      const cs = getComputedStyle(n);
      const shown = cs.visibility !== 'hidden' && +cs.opacity > 0.01 && n.offsetParent !== null;
      if (shown && !anim && r.width > 0 && (r.right > innerWidth + 1.5 || r.left < -1.5)) {
        wide.push({ cls: n.className || n.tagName, left: +r.left.toFixed(1), right: +r.right.toFixed(1) });
      }
    }
    if (wide.length) flag('overflows the viewport horizontally', { count: wide.length, nodes: wide.slice(0, 8) });

    out.ok = out.offenders.length === 0;
    return out;
  }
})();
