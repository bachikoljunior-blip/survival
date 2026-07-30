/**
 * Japanese — engine strings that no other file owns.
 *
 * This file used to carry a full parallel copy of the interface, written while
 * the interface pass was still in flight. Once that pass landed, `ja/ui.js` and
 * `ja/content.js` won every one of those keys under the merge in ../ja.js — 185
 * of 226 of them, 94 with different wording. A translation nobody can reach is
 * worse than none: it reads like the live text in review, and it drifts.
 *
 * So what is left here is only what nothing else provides:
 *
 *   · the trust-change toasts, which are authored in story.js as bare English
 *     sentences with no id, and are therefore keyed on themselves the way the
 *     interact prompts are (`phrase()` strips the '.' before it looks them up,
 *     so a key here must not contain one);
 *   · the objective banner's chapter format, which is a template because
 *     Japanese wraps the numeral in 第…章 and "CHAPTER 1" has nowhere to put
 *     the counter word.
 *
 * If a key is added here that another file also defines, the other file wins
 * silently. `node tools/i18n_report.mjs ja --shadowed` lists any such key.
 */

export const ENGINE_JA = {
  ui: {
    'chapter.fmt': '第@n章',
  },

  // Trust-change toasts. Subjects are dropped throughout: the English shifts
  // between "She …" (sometimes Ren, sometimes the person whose opinion moved)
  // and "You …", and Japanese carries every one of them without naming anybody.
  p: {
    'A compromise nobody asked for': '誰も頼んでいない折衷。',
    'An honest answer': '正直な答え。',
    'At least it was true': '少なくとも本当のことだった。',
    'At least she is direct': '少なくとも回りくどくはない。',
    'Four out of four': '4人中4人。',
    'He believes her': '信じている。',
    'He expected better of her': 'もっとましだと思っていた。',
    'He had already worked it out': 'とっくに見当はついていた。',
    'He knows what that shift cost': 'あの当番が何を削るか知っている。',
    'He liked being asked': '訊かれて悪い気はしなかった。',
    'He said what she was for': '何をする人間かを言ってもらえた。',
    'He sharpened your bar': 'バールを研いでくれた。',
    'She came back stocked': '補給を持って戻ってきた。',
    'She came to listen': '聞きに来た。',
    'She chose her words and kept them': '言葉を選んで、そのとおりにした。',
    'She committed to something': '腹を決めた。',
    'She counted the difference': '差を数えた。',
    'She did not believe you': '信じてもらえなかった。',
    'She did not come in swinging': '殴り込みではなかった。',
    'She did not dress it up': '飾らなかった。',
    'She found it herself': '自分で見つけた。',
    'She gave up her own cartridge': '自分のカートリッジを譲った。',
    'She gave you her line': '自分の見立てを渡してくれた。',
    'She has done that shift': 'その当番を自分でやったことがある。',
    'She has heard that before': 'その台詞は前にも聞いている。',
    'She has heard that from someone who did not': '同じ台詞を、そうしなかった人間から聞いている。',
    'She has not stopped thinking about it': 'ずっと考え続けている。',
    'She knows what you are now': 'こちらが何者か、もう分かっている。',
    'She read the clause and did not flinch': '条項を読んで、顔色ひとつ変えなかった。',
    'She said the true small thing': '小さくても本当のことを言った。',
    'She signed it': '署名した。',
    'She would not take it': '受け取らなかった。',
    'Someone finally said the useful thing': 'やっと役に立つことを言う人間が現れた。',
    'Word travels': '話は伝わる。',
    'You brought her back': '連れ戻した。',
    'You came down for her': '迎えに降りてきた。',
    'You fought for the block': '街区のために戦った。',
    'You told her the shop was standing': '店がまだ建っていると伝えた。',
  },
};
