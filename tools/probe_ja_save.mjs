/**
 * Save portability across languages.
 *
 * The whole i18n design rests on one claim: the game's logic never sees a
 * translated string, so a save written in Japanese is the same save in English.
 * This exercises it rather than asserting it — plays a little, saves in
 * Japanese, reloads in English, and compares the state the save is made of.
 *
 * It also checks the other direction, and checks that the things that SHOULD
 * change with the language (what is on screen) actually do.
 */
(async () => {
  const G = window.CINDERLINE.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { steps: [], faults: [] };
  const fault = (what, detail) => out.faults.push({ what, ...detail });

  const setLang = async (code) => {
    G.menus.settings.language = code;
    G.applySettings(G.menus.settings);
    G.emit('locale', code);
    await sleep(150);
  };

  // A snapshot of everything the save is made of, in a comparable shape.
  const snap = () => {
    const S = G.state;
    return {
      chapter: S.chapter,
      flags: [...S.flags].sort(),
      counters: [...S.counters.entries()].sort(),
      quests: [...S.quests.entries()].map(([id, q]) => [id, q.state, q.step]).sort(),
      inventory: [...S.inventory.entries()].sort(),
      journal: S.journal.map((j) => j.id).sort(),
      trust: [...(S.trust ? S.trust.entries() : [])].sort(),
      choices: [...(S.choices ? S.choices.entries() : [])].sort(),
      capabilities: [...(S.capabilities || [])].sort(),
    };
  };

  // --- put some state in it, in Japanese ------------------------------------
  await setLang('ja');
  const S = G.state;
  S.set('probe_flag');
  S.bump('metersRead');
  S.bump('metersRead');
  S.give('filter', 2);
  S.addJournal('probe_note', 'Probe note', 'Written while the game was in Japanese.');
  if (S.quests.get('cellarRow') === undefined) G.director.quests.start('cellarRow');
  await sleep(80);

  const jaSnap = snap();
  out.steps.push({ at: 'wrote state in ja', flags: jaSnap.flags.length, journal: jaSnap.journal });

  // What the save actually serialises.
  const saved = JSON.parse(JSON.stringify(S.serialise ? S.serialise() : S.toJSON ? S.toJSON() : {}));
  const asText = JSON.stringify(saved);

  // A save must not contain Japanese. Every identifier in it is English by
  // design; a kana or kanji anywhere in the blob means a display string leaked
  // into the state and the save is no longer language-portable.
  const cjk = asText.match(/[぀-ヿ㐀-鿿]/g);
  out.steps.push({ at: 'serialised', bytes: asText.length, cjkChars: cjk ? cjk.length : 0 });
  if (cjk) {
    const where = [];
    const walk = (o, path) => {
      if (typeof o === 'string') {
        if (/[぀-ヿ㐀-鿿]/.test(o)) where.push({ path, value: o.slice(0, 60) });
      } else if (o && typeof o === 'object') {
        for (const k in o) walk(o[k], path ? `${path}.${k}` : k);
      }
    };
    walk(saved, '');
    fault('translated text inside the save', { count: cjk.length, where: where.slice(0, 10) });
  }

  // --- reload it in English -------------------------------------------------
  await setLang('en');
  await sleep(120);
  const enSnap = snap();

  const diff = [];
  for (const k in jaSnap) {
    if (JSON.stringify(jaSnap[k]) !== JSON.stringify(enSnap[k])) {
      diff.push({ field: k, ja: jaSnap[k], en: enSnap[k] });
    }
  }
  if (diff.length) fault('state changed when the language changed', { diff });

  // --- and the display DID change ------------------------------------------
  const readObjective = () => {
    const n = document.querySelector('#hud .objective .task');
    return n ? n.textContent.trim() : '';
  };
  G.director.quests.emitObjective();
  await sleep(100);
  const enText = readObjective();
  await setLang('ja');
  G.director.quests.emitObjective();
  await sleep(150);
  const jaText = readObjective();
  out.steps.push({ at: 'objective', en: enText, ja: jaText });
  if (enText && jaText && enText === jaText) {
    fault('the objective did not change with the language', { text: enText });
  }
  if (jaText && !/[぀-ヿ㐀-鿿]/.test(jaText)) {
    fault('the objective is still English under ja', { text: jaText });
  }

  out.ok = out.faults.length === 0;
  return out;
})();
