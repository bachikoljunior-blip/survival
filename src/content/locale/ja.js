/**
 * Japanese.
 *
 * Split by what it translates so several people (or several agents) can work in
 * parallel without touching the same file, then merged into the one flat table
 * `i18n.js` looks keys up in.
 *
 * House style for this translation:
 *
 *   · Hollis is a working city that has been on fire underground for eleven
 *     years, and everybody in it is tired. The register is plain, clipped,
 *     adult 現代日本語 — not light-novel, not honorific-heavy, not キャラ語尾.
 *   · Characters keep their distinct voices. Sol counts people out loud and
 *     never reaches for an abstract noun. Teo is elliptical and dry. Krajcik
 *     retreats into 受身 and clause numbers exactly when he is most exposed.
 *     Nessa runs on and undercuts herself. Iris interrupts herself mid-clause.
 *   · Measurements stay metric and stay numerals. ppm stays ppm.
 *   · Proper nouns are transliterated once and consistently: ホリス, セラー通り,
 *     マロウ通り, シンダーライン, スタックス, スリップ, ヴェント第9区画.
 */

import { UI_JA } from './ja/ui.js';
import { ENGINE_JA } from './ja/engine.js';
import { STORY_JA } from './ja/story.js';
import { STORY2_JA } from './ja/story2.js';
import { CONTENT_JA } from './ja/content.js';

/**
 * Merge by walking, not by spreading.
 *
 * A shallow spread of two tables that both carry a `c` (conversations) or a
 * `ui` branch keeps only the last one and drops the other's entire subtree
 * silently — which looks exactly like an untranslated section and is very hard
 * to tell apart from one. Later sources win on individual leaf keys only.
 */
function merge(...sources) {
  const out = {};
  const into = (dst, src) => {
    for (const k in src) {
      const v = src[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (!dst[k] || typeof dst[k] !== 'object') dst[k] = {};
        into(dst[k], v);
      } else {
        dst[k] = v;
      }
    }
  };
  for (const s of sources) if (s) into(out, s);
  return out;
}

// ENGINE_JA is first so that anything the interface pass also covered wins:
// it holds the keys the engine gained while the translation was in flight.
export const JA = merge(ENGINE_JA, { ui: UI_JA }, STORY_JA, STORY2_JA, CONTENT_JA);
