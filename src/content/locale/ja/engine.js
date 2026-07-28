/**
 * Japanese — engine strings.
 *
 * Everything the engine itself puts on screen: the HUD, the corner notices, the
 * death cards, the map legend, the run ledger, the enemy barks, and the glossary
 * of interact prompts. Keys mirror the English content; see ../ja.js for style.
 *
 * Three things about the shape here that are not obvious from i18n.js:
 *
 *  1. `$` is the value of a key that is BOTH a leaf and a branch. `ui.stat.filter`
 *     is a settings label and `ui.stat.filter.none` is the value it takes when
 *     nothing is fitted; the label lives under `$`.
 *  2. `@n`, `@a`, `@b`, `@item` are interpolation markers owned by the engine and
 *     must survive translation. Japanese puts the number in a different place
 *     than English does, which is the whole reason these are templates.
 *  3. The `p` table is a glossary keyed on the ENGLISH prompt text, because most
 *     interact prompts in the world data have no id to key on. Dots are stripped
 *     from the key by `phrase()`, so an entry here must not contain one.
 */

export const ENGINE_JA = {
  ui: {
    // -------------------------------------------------------------- dialogue
    dlg: { next: 'タップして続ける', locked: 'ロック' },

    // ----------------------------------------------------------------- title
    tagline: '消えない火の上に建った街。低いところは、空気が人を殺す。登るか、窒息するか。',
    paused: '一時停止',
    rotate: 'シンダーラインは横向きで遊ぶ。\n端末を回してください。',

    // ------------------------------------------------------------------- HUD
    saved: '保存',
    air: { nofilter: 'フィルターなし', filter: 'フィルター', sat: '飽和' },
    dir: { N: '北', NE: '北東', E: '東', SE: '南東', S: '南', SW: '南西', W: '西', NW: '北西' },
    // The interact button. Two characters where the English has five, which is
    // what lets the button stay the size it is.
    verb: { TALK: '話す', OPEN: '開ける', CLIMB: '登る', TAKE: '取る', READ: '読む', LOOK: '見る', USE: '使う' },
    btn: { HIT: '攻撃', ROLL: '回避', GUARD: '防御', USE: '使用', HEAVY: '強撃' },

    // ---------------------------------------------------------------- status
    stat: {
      health: '体力',
      sat: '血中飽和度',
      filter: { $: 'フィルター', none: '未装着' },
      lamp: 'ランプ電池',
      carried: '積載',
    },
    unit: { kg: 'kg', h: '時間', m: '分' },
    abilities: { none: 'まだ何もない。ここで身につけることは、すべて誰かが教えたことになる。' },
    trust: {
      trusts: '信頼している',
      warming: '打ち解けてきた',
      done: '見限られた',
      wary: '警戒している',
      neutral: '中立',
    },
    run: { time: 'ホリスでの時間', chapter: '章', filters: '使ったフィルター', deaths: '倒れた回数' },
    items: { none: '何もない。' },
    journal: { none: '手持ちの用件はない。' },
    map: { objective: '目標', you: '現在地', badair: '悪い空気', above: '煙の上' },

    // -------------------------------------------------------------- settings
    set: {
      // Flat because `ui.set.combat` is itself a label: a key that is both a
      // leaf and a branch is written either flat like this or with `$`.
      'combat.note': '<b>0</b> 標準 &nbsp; <b>1</b> 寛容 — スタミナが多く、敵が遅い &nbsp; ' +
        '<b>2</b> 物語 — 戦闘では死なない。',
    },

    // ------------------------------------------------------------------ shop
    trade: {
      intro: '左がサルベージ、右が品物。ツケはなしだ。',
      row: '@item — サルベージ@n',
      poor: 'サルベージが足りない。',
      leave: '何もいらない。',
      mm: 'ふむ。',
    },
    speakto: '@nに話しかける',
    // The objective banner. A template because Japanese wraps the numeral in
    // 第…章 and "CHAPTER 1" has nowhere to put the counter word.
    'chapter.fmt': '第@n章',

    // --------------------------------------------------------------- notices
    hud: {
      wardenline: '<b>ウォーデンの列</b><br>三人、シフトで入っている。',
      drawreverses: '流れが逆になる。変わるのが聞こえる。',
      halfvents: '頭をひとつ閉じた。どちらの場所も、片方だけのときより悪くなった。',
      firstlight: '<b>夜明けと同時に始まった。</b>',
      ashcrew: '<b>灰の組</b><br>ヤードに',
      stepsaside: '<b>男が脇へどく。</b><br>どちらも、見ていたことにはしない。',
      pastthem: '<b>抜けた。</b><br>誰も見上げなかった。',
      courtyard: '<b>中庭に溜まりはじめた。</b><br>ペル館、1階。',
      fennstreet: '<b>フェン通りが呑まれた。</b><br>まだ4人、下にいる。',
      nessanag: '<i>ネッサ</i><br>「そこは登れない」',
      nessaout: '<b>その上に出た。</b><br>彼女はルーフィングに座り込み、しばらく立ち上がらない。',
      rescued: '<b>4人中@n人</b>を上へ。',
      allfour: '<b>4人とも。</b>',
      someout: '<b>@a人は上へ。@b人は上がれなかった。</b>',
      locked: '施錠されている。',
      boards: '板は枠まで釘で打ち抜いてある。これでは無理だ。',
      behindboards: '板の裏',
      ontheirfeet: '<b>@n</b>が立ち上がった。どこか上へ連れていく。',
      cracked: '<b>割って楔を打ってある。</b><br>誰かが意図してやった。',
      nothingmore: 'ここでできることはもうない。',
      talksolfirst: 'まずソルと話す。礼は言われないが、教えてはくれる。',
      nessawith: '<b>ネッサが付いてきている。</b><br>煙の上まで連れていく。',
      filterstillgood: '今ついているものでまだもつ。',
      freshcartridge: '新しいカートリッジ。',
      nothingtodress: '手当てするところがない。',
      lampcell: 'ランプの電池を交換した。',
      stim: '胸が開く。空気の酸素が増えるわけではない。',
      nothinguseful: '使えるものが手元にない。',
    },

    // ------------------------------------------------------------------ dead
    death: {
      gas: {
        title: '呼吸が止まった',
        text: '一酸化炭素は痛まない。それがこの気体の厄介なところだ。疲れていたから、少しだけ座った。',
      },
      blunt: {
        title: '倒れた',
        text: '運んでいたものを、この街の誰かが、立っていることより必要としていた。',
      },
      flesh: { title: '倒れた', text: '向こうのほうが速く、三人いた。' },
      fall: { title: '落ちた', text: '瓦礫まで9メートル。分かっていたはずだ。誰だって分かっている。' },
    },

    // ---------------------------------------------------------------- ending
    // `@n` in an ending beat expands to one of these; the numeral form is @N.
    count: { 0: '誰も', 1: '一人', 2: '二人', 3: '三人', 4: '四人' },
    ledger: {
      minutes: 'ホリスで@n分。',
      meters: 'メーターを@n回持ち上げた。',
      filters: 'カートリッジ@n本。',
      rescued: '@n人を階段の上へ。',
      breached: '店先を@n軒こじ開けた。',
      parries: '@n発を受け流した。',
      survived: '@n度、自分の脚で戻ってきた。',
      deaths: '@n度倒れて、そのたび起き上がった。',
    },

    // ----------------------------------------------------------------- barks
    bark: { scav: '灰の組', slinger: '灰の組', breaker: 'ブレイカー', warden: 'ウォーデン' },
  },

  // The barks themselves, by enemy kind and by index into the English list.
  bark: {
    scav: { 0: 'おい — ヤードに一人いるぞ！', 1: '入り込んでる！', 2: 'うちの者じゃない。' },
    slinger: { 0: '頭を下げろ、下げてろ！', 1: '生きてるのが一匹いる。' },
    breaker: { 0: 'じっとしてろよ。', 1: '追わせるな。' },
    warden: { 0: '現場は閉鎖中だ。引き返せ。', 1: '予定表に載っていない。' },
    dog: { 0: '（吠える）' },
  },

  // ------------------------------------------------------------------ places
  region: {
    slip: { name: 'スリップ' },
    stacks: { name: 'スタックス' },
    yard: { name: 'スタックスの中庭' },
    cut: { name: 'カット' },
    ventfield: { name: 'ヴェント第9区画' },
    cinderroad: { name: 'シンダー通り' },
    southmarrow: { name: 'サウス・マロウ' },
    westheads: { name: '西の坑口' },
  },

  // ------------------------------------------------- interact prompt glossary
  p: {
    // ---------------------------------------------------------- trust toasts
    // Authored in story.js as English sentences with no id, so they are keyed
    // on themselves like the prompts. Subjects are dropped: the English shifts
    // between "She …" (sometimes Ren, sometimes the other person) and "You …",
    // and Japanese carries all of them without naming anybody.
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

    // ------------------------------------------------------ interact prompts
    // Engine defaults
    'Interact': '調べる',
    'Climb': '登る',
    // Doors and ways through
    'Enter the Arcade': 'アーケードに入る',
    'Enter Pell House': 'ペル館に入る',
    'Enter the field office': '現場事務所に入る',
    'Enter the garage': '整備場に入る',
    'Enter the instrument hut': '計器小屋に入る',
    'Go down into the cellar': '地下へ降りる',
    'Back up the steps': '階段を戻る',
    'Out to Fenn Street': 'フェン通りへ出る',
    'Out to Marrow Street': 'マロウ通りへ出る',
    'Out to the courtyard': '中庭へ出る',
    'Out to the field': '区画へ出る',
    'Out to the yard': 'ヤードへ出る',
    'Service door — north elevation': '通用口 — 北面',
    'Locked — pass reader': '施錠 — パスリーダー',
    'The hasp is sound here Iris said the north elevation': '掛け金は生きている。アイリスは北面と言った',
    'Force the rusted hasp': '錆びた掛け金をこじ開ける',
    // Things to read and look at
    'Read': '読む',
    'Read the board': '掲示を読む',
    'Read the published line': '公表された線を読む',
    'Read the record': '記録を読む',
    'Look at the sign': '看板を見る',
    'Look at the bag': '袋を見る',
    'Open the folder': 'ファイルを開く',
    'Open the second drawer': '二段目の抽斗を開ける',
    'Take the borehole log': '坑井記録を取る',
    'Put your hand on the flags': '敷石に手をつく',
    'Examine the wedged head': '楔を打たれた坑口を調べる',
    'Show them the order': '指示書を見せる',
    'Lever the boards off': '板をこじ開ける',
    'Get them on their feet': '立たせる',
    // Labels that double as prompts
    'A filter bag': 'フィルターの袋',
    "Bek's rain gauge": 'ベックの雨量計',
    "Nadeau's folder": 'ナドーのファイル',
    '14 Cellar Row': 'セラー通り14番',
    'Bek & Daughter': 'ベック & ドーター',
    'Boarded shopfront': '板を打った店先',
    'Borehole log': '坑井記録',
    'Cracked borehole head': '割られた坑口',
    'H.R.A. Field Office 2': 'H.R.A. 第2現場事務所',
    'Instrument hut': '計器小屋',
    'Marrow Arcade': 'マロウ・アーケード',
    'Pell House': 'ペル館',
    'Second drawer': '二段目の抽斗',
    'The back wall': '奥の壁',
    'VASKO & CO': 'ヴァスコ商会',
    'The Warden line': 'ウォーデンの列',
    // What is behind the boards
    'Chapel vestry': '礼拝堂の聖具室',
    'Colliery Outfitters': '炭鉱用品店',
    'Delph Ironmongers, back store': 'デルフ金物店・奥の倉',
    'Laundry, rear': '洗濯屋の裏',
    'Nine Lamps — cellar hatch': 'ナイン・ランプス — 地下の揚げ蓋',
    'Selvin & Vane': 'セルヴィン & ヴェイン',
    'Weighbridge office': '計量所の事務室',
  },
};
