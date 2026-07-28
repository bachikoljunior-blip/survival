/**
 * Japanese — ui. Keys mirror the English content; see ../ja.js for style.
 *
 * The interface is an instrument panel, not an app. Rules this file follows:
 *
 *   · Noun phrases, not sentences. 「保存」 not 「保存します」. No です/ます
 *     anywhere except the two boot-failure lines, which are addressed to a
 *     person whose game has just broken.
 *   · Settings rows are measured against 667x375 CSS px with the label column
 *     sharing a row with a value and two 44px steppers. Anything over about
 *     nine full-width characters wraps and breaks the row height, so several
 *     labels here are deliberately shorter than the English.
 *   · Numerals, units and instrument words stay Latin: ppm, PPM CO, kg, %, ×.
 *     A CO meter in Hollis would be labelled in the same characters.
 *   · @n / @a / @b / @item are engine interpolation markers. Keep them.
 */
export const UI_JA = {

  // ------------------------------------------------------------------ title
  tagline: '消えない火の上に建った街。低いところの空気は人を殺す。登るか、息が詰まるか。',
  continue: 'つづきから',
  newgame: 'はじめから',
  settings: '設定',
  about: '概要',

  // ------------------------------------------------------------------ shell
  paused: '一時停止',
  save: '保存',
  title: 'タイトル',
  resume: '再開',
  getup: '起き上がる',
  rotate: 'シンダーラインは横向きで遊ぶ。\n端末を回してください。',

  tab: {
    status: '状態',
    items: '装備',
    journal: '手記',
    map: '地図',
    settings: '設定',
    about: '概要',
  },

  // ----------------------------------------------------------------- status
  ren: 'レナータ・ヴァスコ',
  condition: '現在の状態',
  abilities: 'できること',
  'abilities.none': 'まだ何もない。ここで身につくものは、すべて誰かが教えたものだ。',
  people: '人物',
  run: '今回の記録',
  carried: '所持品',
  documents: '書類・鍵',
  inhand: '進行中',
  done: '完了',
  notes: '覚え書き',

  stat: {
    health: '体力',
    sat: '血中飽和',
    filter: 'フィルター',
    'filter.none': '未装着',
    lamp: 'ランプ電池',
    carried: '積載',
  },
  'run.time': 'ホリス滞在',
  'run.chapter': '章',
  'run.filters': '使用フィルター',
  'run.deaths': '死亡',

  trust: {
    trusts: '信頼',
    warming: '歩み寄り',
    wary: '警戒',
    done: '決別',
    neutral: '中立',
  },

  'items.none': 'なし。',
  'journal.none': 'なし。',
  'journal.added': '覚え書き追加',
  'quest.complete': '完了',
  'quest.done': '済',
  chapter: '第',

  // Units. Latin on purpose: these sit against numerals in a monospace column.
  unit: { kg: 'kg', h: '時間', m: '分' },

  map: {
    objective: '目標',
    you: '現在地',
    badair: '悪い空気',
    above: '煙の上',
  },

  // --------------------------------------------------------------- settings
  set: {
    language: '言語',
    // The row prints this followed by a hard-coded 「言語」, so the label side
    // stays in Latin and the pair reads "Language 言語" in either locale.
    'language.row': 'Language',

    controls: '操作',
    look: '視点感度',
    inverty: '上下反転',
    lefthanded: '左手用配置',
    'lefthanded.sub': 'スティックを右側に。',
    autosprint: '倒し切りで走る',
    'autosprint.sub': '走るボタンは不要。',

    display: '表示',
    quality: '画質',
    uiscale: 'UI倍率',
    showperf: '性能表示',

    audio: '音声',
    master: '全体',
    music: '音楽',
    effects: '効果音',

    accessibility: '補助機能',
    subtitles: '字幕',
    'subtitles.sub': '話し声を文字で出す。',
    shake: '画面の揺れ',
    reduced: '動きを抑える',
    'reduced.sub': 'カメラの動きと粒子を減らす。',
    contrast: '高コントラスト',
    damage: 'ダメージ数値',
    gas: '空気の補助',
    'gas.sub': '警告を強く、飽和を遅く、判定を緩く。',
    combat: '戦闘の補助',
    'combat.note': '<b>0</b> 標準 &nbsp; <b>1</b> 緩和 ── 体力多め、敵は遅い &nbsp; ' +
      '<b>2</b> 物語 ── 戦闘では死なない。',
    vibration: '振動',
    'vibration.sub': '対応している端末で。',
  },

  // Setting values shown in the value column. Kept short: the column is narrow.
  quality: { auto: '自動', low: '低', medium: '中', high: '高' },

  // ------------------------------------------------------------------ about
  // One physical line per paragraph. This is injected as innerHTML, where a
  // source newline becomes a space — which in Japanese is a visible gap in the
  // middle of a sentence rather than a word break.
  'about.body':
    'オリジナルのサバイバル・アクションRPG。街も、人も、テクスチャも、アニメーションも、音楽も、すべての音も、このリポジトリのコードから実行時に生成される。第三者の絵、音、モデルデータは一切使っておらず、ダウンロードもしない。'
    + '<br><br><b>使用ライブラリ</b> 描画に three.js (MIT)、バンドルに esbuild (MIT)、自動テストに Playwright (Apache-2.0)。ライセンス全文は <span class="mono">THIRD-PARTY.md</span> にある。'
    + '<br><br><b>操作 ── タッチ。</b> 画面の左半分が移動スティック。どこに触れても親指の下に出る。右半分をなぞると視点が動く。右半分をタップでロックオン、もう一度で対象切替、射程に何もない状態でタップすると解除。'
    + '<br><br><b>ボタン。</b> 打つ・強打・回避・防御は常に出ている。使うは消耗品を一つ消費する ── フィルターか包帯か、そのとき必要なほう。手の届く範囲に何かあると六つ目のボタンがその上に出て、何ができるかが書かれる ── 話す、取る、開ける、読む、登る。位置は決まっているので、扉に手を伸ばして防御を失うことはない。薄く描かれたボタンは今は使えない ── 体力切れ、使うものがない、あるいは手がふさがっている。'
    + '<br><br><b>左手用。</b> 設定 → 操作 で画面全体が反転する。移動側だけではない。'
    + '<br><br><b>操作 ── キーボード。</b> WASD 移動、マウス 視点、J 弱攻撃、K 強攻撃、Space 回避、Q 防御、E 調べる、F 道具、R ランプ、C しゃがみ、Tab ロックオン、M 地図、Esc メニュー。ゲームパッドにも対応。'
    + '<br><br><b>いちばん大事な規則。</b> 一酸化炭素とブラックダンプは低いところに溜まる。高さが安全だ。メーターが読んでいるのは今立っている場所の空気で、これから行く場所の空気ではない。',

  // ------------------------------------------------------------------ death
  death: {
    gas: {
      title: '呼吸が止まった',
      text: '一酸化炭素は痛くない。それがこの気体の唯一にして最大の問題だ。疲れていたので、少しだけ座った。',
    },
    blunt: {
      title: '倒れた',
      text: 'この街の誰かは、こちらが立ち続けることより、こちらが持っていたものを必要としていた。',
    },
    flesh: {
      title: '倒れた',
      text: '向こうのほうが速く、しかも三人いた。',
    },
    fall: {
      title: '落ちた',
      text: '瓦礫まで9メートル。分かっていたはずだ。誰でも分かっている。',
    },
  },

  // ------------------------------------------------------------- dialogue box
  dlg: {
    next: 'タップで進む',
    locked: '不可',
  },

  // --------------------------------------------------------------------- HUD
  saved: '保存',
  air: {
    // Instrument face. Stays Latin — this is a CO meter, not a menu.
    nofilter: 'フィルターなし',
    filter: 'フィルター',
    sat: '飽和',
  },
  btn: {
    HIT: '打つ',
    HEAVY: '強打',
    ROLL: '回避',
    GUARD: '防御',
    USE: '使う',
  },
  verb: {
    TALK: '話す',
    OPEN: '開ける',
    CLIMB: '登る',
    TAKE: '取る',
    READ: '読む',
    LOOK: '見る',
    USE: '使う',
  },
  dir: { N: '北', NE: '北東', E: '東', SE: '南東', S: '南', SW: '南西', W: '西', NW: '北西' },
  bark: { scav: '灰の組', slinger: '灰の組', breaker: 'ブレイカー', warden: 'ウォーデン' },
  speakto: '@nと話す',

  // Numbers written out inside ending beats.
  count: { 0: '誰も', 1: '1人', 2: '2人', 3: '3人', 4: '4人' },

  // ------------------------------------------------------- chapter cards
  // NOT WIRED. `{ card: [...] }` effects reach hud.showCard as raw English
  // (narrative.js:93, main.js:82). Keyed here by chapter so wiring is a lookup
  // on the quest's own chapter number.
  card: {
    1: { kicker: '第一章', title: '悪い空気', sub: 'スタックス・ホリス' },
    2: { kicker: '第二章', title: 'スリップ', sub: 'マロウ通り' },
    3: { kicker: '第三章', title: '第二現地事務所', sub: 'カット' },
    4: { kicker: '第四章', title: 'ホワイトダンプ', sub: 'ホリス' },
    5: { kicker: '第五章', title: 'シンダーライン', sub: 'カット' },
  },

  // Chapter-four survivors. NOT WIRED: director.js:617 names them in English
  // and ui.hud.ontheirfeet interpolates that name verbatim.
  survivor: {
    0: 'オストロフスキ',
    1: '子供を連れた女',
    2: '年配の男',
    3: 'コートの人',
    4: '誰か',
  },

  // ------------------------------------------------------------ HUD notices
  hud: {
    wardenline: '<b>ウォーデンの列</b><br>三人、仕事で立っている。',
    drawreverses: '引きが反転する。変わる音が聞こえる。',
    halfvents: '頭を一つ閉じた。どちらの場所も、片方だけがそうなり得たより悪い。',
    firstlight: '<b>夜明けと同時に始めていた。</b>',
    ashcrew: '<b>灰の組</b><br>庭にいる',
    stepsaside: '<b>彼は道を空ける。</b><br>どちらも、見ていたことにしないと決めている。',
    pastthem: '<b>抜けた。</b><br>誰も顔を上げなかった。',
    courtyard: '<b>中庭が埋まりはじめている。</b><br>ペル館、一階。',
    fennstreet: '<b>フェン通りが落ちた。</b><br>まだ4人、下にいる。',
    nessanag: '<i>ネッサ</i><br>「そこは登ってついていけない。」',
    nessaout: '<b>上に出た。</b><br>彼女は屋根材の上に座り、しばらく立ち上がらない。',
    nessawith: '<b>ネッサが一緒にいる。</b><br>煙の上まで連れて上がる。',
    rescued: '<b>4人中@n人</b>、上へ。',
    allfour: '<b>4人とも。</b>',
    someout: '<b>@a人が出た。@b人は出ていない。</b>',
    locked: '施錠。',
    boards: '板は枠まで釘で打ち抜いてある。これでは無理だ。',
    behindboards: '板の裏',
    ontheirfeet: '<b>@n</b>が立った。どこか上へ連れて行く。',
    cracked: '<b>割って楔で留めてある。</b><br>誰かが意図してやった。',
    nothingmore: 'ここでやることはもうない。',
    talksolfirst: '先にソルと話す。礼は言われないが、教えてはくれる。',
    filterstillgood: '今ついているのはまだ使える。',
    freshcartridge: '新しいカートリッジ。',
    nothingtodress: '手当てするものがない。',
    lampcell: 'ランプ電池を交換した。',
    stim: '胸が開く。空気に酸素が足されるわけではない。',
    nothinguseful: '手元に使えるものがない。',
  },

  // ------------------------------------------------------------------ trade
  trade: {
    intro: '左が屑鉄、右が品物。掛け売りはなし。',
    row: '@item ── 屑鉄@n',
    poor: '屑鉄が足りない。',
    leave: '何も。',
    mm: 'ふん。',
  },

  // ----------------------------------------------------------- ending ledger
  // Ren's own record of the run, in her units. Not a scoreboard.
  ledger: {
    minutes: 'ホリスに@n分。',
    meters: 'メーターを@n回上げた。',
    filters: 'カートリッジ@n本。',
    rescued: '@n人を階段の上へ。',
    breached: '店先を@n軒開けた。',
    parries: '@n発を受け流した。',
    survived: '自分の脚であそこから@n回上がってきた。',
    deaths: '@n回倒れて、そのたび起き上がった。',
  },

  // ------------------------------------------------------------------- boot
  // Not currently reachable: index.html is static and main.js sets these
  // before a locale exists. Translated so that wiring them is a one-line job.
  boot: {
    loading: '読み込み中',
    renderer: '描画を起動',
    ground: '地面を敷く',
    streets: '街路を敷く',
    buildings: 'ホリスを起こす',
    structures: '非常階段を掛ける',
    dressing: '街に肉付けする',
    interiors: '扉を開ける',
    skyline: '稜線を引く',
    air: '空気を測る',
    lighting: '火に灯を入れる',
    navigation: '地面を地図にする',
    ready: '準備完了',
    failed: '起動できません ── ',
    noscript: 'このゲームには JavaScript が必要です。',
  },
  ctxlost: {
    title: '画面が止まりました',
    text: '端末がグラフィックスの接続を切りました。ふつうは別のアプリによるメモリ不足です。進行は保存済みです。再読み込みすれば続きから始められます。',
    reload: '再読み込み',
  },
  storage: {
    warn: 'このブラウザではゲームを保存できません。おそらくプライベートブラウズです。遊べますが、タブを閉じると何も残りません。',
    notice: '<b>保存されません。</b>このブラウザは保存を拒否しています。何も残りません。',
  },
};
