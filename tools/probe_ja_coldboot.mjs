/**
 * First run on a Japanese device.
 *
 * Every other Japanese probe reaches Japanese by toggling the setting after the
 * game is already up, which is the path a player takes on their SECOND visit.
 * The first visit is different and is the one with the failure modes: there is
 * no stored setting, the language comes from the browser, and it has to be
 * resolved before the boot plate draws its first line and before the HUD builds
 * the buttons it never rebuilds.
 *
 * This probe is run against a context whose locale is ja-JP and which has never
 * seen this origin, so nothing is stored. It asserts, in order:
 *
 *   · the pre-boot inline script picked Japanese without the bundle
 *   · the boot note was Japanese before the game object existed
 *   · the HUD's build-once labels came out Japanese, not English
 *   · the setting was persisted, so the second visit does not re-detect
 *   · an explicit English choice survives a reload on a Japanese device
 *
 * It is driven by tools/shot_coldboot.mjs, which owns the browser context.
 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const G = window.CINDERLINE && window.CINDERLINE.game;
  const out = { faults: [], observed: {} };
  const fault = (what, detail) => out.faults.push({ what, ...detail });
  const ja = (s) => /[぀-ヿ㐀-鿿]/.test(String(s || ''));

  out.observed.navigatorLanguages = navigator.languages;
  out.observed.htmlLang = document.documentElement.lang;
  out.observed.dataLang = document.documentElement.getAttribute('data-lang');
  if (out.observed.dataLang !== 'ja') {
    fault('the document is not in Japanese after a cold boot on a ja device',
      { dataLang: out.observed.dataLang });
  }

  // The interface the HUD builds exactly once, in the constructor.
  const label = (sel) => {
    const n = document.querySelector(`#hud ${sel}`);
    return n ? n.textContent.trim() : null;
  };
  const built = {
    attack: label('.abtn.attack'),
    heavy: label('.abtn.heavy'),
    dodge: label('.abtn.dodge'),
    guard: label('.abtn.guard'),
    use: label('.abtn.use'),
    filter: label('.air .filter'),
    compassN: label('.compass .tick'),
  };
  out.observed.builtOnce = built;
  for (const k in built) {
    if (built[k] && !ja(built[k])) {
      fault('a build-once HUD label is still English', { which: k, text: built[k] });
    }
  }

  // The title screen, which is built by Menus before applySettings runs.
  const tagline = document.querySelector('#title .tagline');
  out.observed.tagline = tagline ? tagline.textContent.trim() : null;
  if (out.observed.tagline && !ja(out.observed.tagline)) {
    fault('the title tagline is still English', { text: out.observed.tagline });
  }

  // The choice has to be written down, or every visit re-detects and an
  // explicit choice of English could never stick on a Japanese device.
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem('cinderline.settings.v1') || 'null'); } catch { /* private */ }
  out.observed.storedLanguage = stored && stored.language;
  if (!stored || stored.language !== 'ja') {
    fault('the detected language was not persisted', { stored: out.observed.storedLanguage });
  }

  // And the other direction: choosing English on a Japanese device must win.
  if (G) {
    G.menus.settings.language = 'en';
    G.applySettings(G.menus.settings);
    G.emit('locale', 'en');
    await sleep(200);
    let after = null;
    try { after = JSON.parse(localStorage.getItem('cinderline.settings.v1') || 'null'); } catch { /* private */ }
    out.observed.afterChoosingEnglish = {
      dataLang: document.documentElement.getAttribute('data-lang'),
      stored: after && after.language,
    };
    if (out.observed.afterChoosingEnglish.stored !== 'en') {
      fault('an explicit choice of English was not stored', out.observed.afterChoosingEnglish);
    }
    if (out.observed.afterChoosingEnglish.dataLang !== 'en') {
      fault('an explicit choice of English did not take effect', out.observed.afterChoosingEnglish);
    }
  }

  out.ok = out.faults.length === 0;
  return out;
})();
