# 物語状態台帳 — CINDERLINE

`docs/directive.md` §6 が要求し、`docs/bible.md` IMP-14 が「存在しない」と記録していた台帳。

**このファイルは装飾ではなく入力である。** `node tools/validate.mjs` が下の表を読み、
各行のアンカーと語を `src/content/story.js` の実物と突き合わせ、合わないものと未回収の
ものでビルドを落とす。書いてあるのに本文に無い語は、台帳の側の誤りとして落ちる。

台帳が本文とずれたまま静かに生き残ることが、この文書の唯一の失敗様式である
（`docs/bible.md` R-13「文書が実装から静かにずれる」）。そのため**すべての行が
機械可読で、すべての行が実物に照合される。**

## アンカー記法

| 形 | 指すもの | 照合対象の本文 |
|---|---|---|
| `convo:<会話id>:<ノードid>` | 会話の1ノード | 本文＋そのノードの選択肢テキスト＋そこで書かれるジャーナル本文 |
| `ending:<id>` | エンディング | 本文＋全ビート＋エピローグ told/untold |
| `epilogue:<id>` | 可変エピローグビート | 本文 |
| `cast:<id>` | 登場人物の bio | bio 全文 |
| `quest:<id>:<step>` | クエストの1ステップ | objective |

照合は空白を1個に潰したうえでの部分一致である。`|` を含む語は表に書けない。

---

## 1. 伏線と回収の台帳

`docs/directive.md` §6 が要求する対応付け。**回収アンカーが空（`—`）の行は未回収であり、
`validate.mjs` はそれで非ゼロ終了する。** 未回収を消したければ本文を書くしかない。

<!-- ledger:foreshadow -->

| id | 提示アンカー | 提示の語 | 回収アンカー | 回収の語 | 注記 |
|---|---|---|---|---|---|
| bek_shop | convo:garage:g_sign_nessa | Bek & Daughter. Ilya Bek. | convo:nessa_truth:nt_after | I'm telling you because it's yours. | ガレージの看板がネッサへの告知に着地する |
| ostrowski_family | convo:garage:g_sign_nessa | there's somebody in it keeping the damp out | epilogue:garage_died | She had not come down from the first floor in some time | ヴェント決定の最も具体的な着地点 |
| sol_boreholes | cast:sol | cracking borehole heads on the west side | convo:vent_decision:start | Three heads, cracked and wedged. | ソルの bio が第2章の決定そのものになる |
| teo_sent_letter | cast:teo | Sent her the letter and will not pretend he didn't. | convo:teo_first:t_why3 | Now there are two of us who didn't do the small thing at the time. | 手紙の送り主が共犯の提示に変わる |
| teo_small_thing | convo:teo_first:t_why3 | didn't do the small thing at the time | epilogue:teo | That was the small thing. Done now. | 「小さなこと」が最後の一行で返る |
| iris_kept_record | cast:iris | is the only person in the building who has kept a record of it | convo:iris_after:i_folder2 | I have been hiding behind the units for two years and ten months. | 記録の正体が単位への逃避として回収される |
| iris_survivable | cast:iris | Wants very badly for someone to tell her it was survivable. | epilogue:iris | a coast where nothing is on fire | 出られたことが結末で示される |
| july_sheet | convo:nessa_truth:nt_tell2 | I raised it with nobody. | ending:record | the July sheet with your own initials in the check box | レンの沈黙が記録に載る |
| krajcik_291 | convo:krajcik:k_after | Two hundred and ninety-one. | convo:final:k_291 | That is the number I gave you in the office | 291 が最終場面で戻る |
| vents_half_journal | convo:vent_decision:start | I have made both places slightly worse than one of them could have been. | ending:cut | which means it vents into ground nobody lives on | 折衷案の自己申告が結末で扱われる |
| letter_address | convo:teo_first:t_addr | It found you. | — | — | **未回収。** 1年前に引き払った住所に届いた理由が処理されていない（IMP-18 / N-11） |
| temperature_406 | convo:teo_log:l2 | Four hundred and six degrees at 9-3 | — | — | **未回収。** 同じ「四百六」が残存人口にも使われるのに、両者を結ぶ台詞がソース内に存在しない（IMP-15 / N-07） |

<!-- /ledger -->

---

## 2. フラグ対応表（自動生成）

**この表は手で書かない。** `node tools/validate.mjs --write-ledger` が
`src/content/story.js` から生成し、`node tools/validate.mjs` が生成結果と一致しない
場合に落とす。手で編集しても次の検査で戻される。

列は `docs/reviews/gate-a-narrative.md` N-06 が指定したもの（フラグ名／設定箇所／
参照箇所）。`ENGINE` は `src/game/` 側が設定または参照していることを示す。

<!-- ledger:flags generated -->

| フラグ | 設定箇所 | 参照箇所 |
|---|---|---|
| `ch1_raid_done` | ENGINE src/game/director.js | — |
| `ch4_done` | quest:whitedamp:done | convo:sol_first:again<br>convo:teo_first:again |
| `crisis_done` | ENGINE src/game/director.js | ENGINE src/game/director.js<br>convo:sol_first:again |
| `crisis_saved_all` | ENGINE src/game/director.js | ENGINE src/game/director.js<br>convo:sol_first:after_crisis<br>ending:everybody:beat |
| `crisis_saved_some` | ENGINE src/game/director.js | ENGINE src/game/director.js<br>convo:sol_first:after_crisis |
| `crisis_south` | — | convo:sol_first:ac_end |
| `crisis_stacks` | — | convo:sol_first:ac_end |
| `entered_unlogged` | ENGINE src/game/director.js | ENGINE src/game/director.js<br>convo:final:k_sees |
| `found_venting` | ENGINE src/game/director.js<br>quest:southmarrow:1 | ENGINE src/game/director.js<br>convo:sol_first:again |
| `garage_suspects` | convo:garage:g_why | convo:garage:again |
| `gave_garage_filter` | convo:garage:g2 | epilogue:garage_lived |
| `has_log` | quest:log:done | convo:nessa_truth:start |
| `has_order` | quest:office:3 | convo:krajcik:k_offer2 |
| `iris_accused` | convo:iris_first:i_say | convo:iris_after:start |
| `iris_folder_named` | convo:iris_after:i_folder2 | ending:cut:beat |
| `iris_gave_pass` | convo:iris_first:i_gives | convo:iris_first:again<br>epilogue:iris |
| `iris_hinted_door` | convo:iris_first:i_refuses | convo:iris_after:i_hub |
| `iris_knows_log` | convo:iris_first:i_pass_q | convo:iris_after:i_hub |
| `iris_met` | convo:iris_first:i_end | convo:iris_first:entry |
| `iris_shared` | convo:iris_first:i_lines2 | convo:iris_after:start |
| `iris_signed` | convo:final:e_cut_iris | ending:cut:beat |
| `krajcik_291` | convo:krajcik:k_after | convo:final:k_plain |
| `krajcik_met` | convo:krajcik:k_end | ENGINE src/game/director.js<br>convo:final:k_sees<br>convo:krajcik:entry |
| `krajcik_noscheme` | convo:krajcik:k_noscheme | ending:cut:beat |
| `krajcik_open` | convo:krajcik:k_deal_cut | convo:final:choose<br>convo:final:k_sees<br>ending:cut:beat |
| `lied_to_krajcik` | convo:krajcik:k_offer2 | convo:final:k_sees |
| `met_garage` | convo:garage:g_end<br>quest:southmarrow:2 | convo:garage:entry<br>epilogue:garage_died<br>epilogue:garage_lived |
| `nessa_knows_connection` | convo:nessa_first:n_bek2 | convo:nessa_first:at_other |
| `nessa_met` | convo:nessa_first:n_end | convo:garage:g_again_sign<br>convo:nessa_first:entry |
| `nessa_rescue_started` | convo:nessa_rescue:r_out | ENGINE src/game/director.js |
| `nessa_rescued` | ENGINE src/game/director.js | ENGINE src/game/director.js<br>epilogue:nessa_rescued |
| `nessa_scene_done` | convo:nessa_truth:nt_end | ENGINE src/game/director.js |
| `nessa_shop_told` | convo:nessa_truth:nt_shop2 | epilogue:nessa_shop |
| `nessa_told_truth` | convo:nessa_truth:nt2<br>convo:nessa_truth:nt_give2 | convo:nessa_first:entry<br>ending:nothing:beat<br>ending:westward:beat |
| `ostrowski_bek` | convo:garage:g_sign_nessa | convo:nessa_truth:nt_after |
| `proposed_cut` | convo:krajcik:k_offer2 | convo:final:k_asked |
| `read_folder` | — | ENGINE src/game/director.js<br>convo:iris_after:i_hub |
| `ren_asked_bek` | convo:nessa_first:n2<br>convo:teo_first:t_why2 | convo:teo_first:a_shop |
| `ren_knows_field` | convo:teo_first:t_task2 | convo:teo_first:a_shop |
| `saw_danger_air` | ENGINE src/game/director.js | — |
| `signed_it_myself` | convo:final:e_cut_self | ending:cut:beat |
| `sol_confession` | convo:sol_first:s_cellar3 | convo:sol_first:as2<br>ending:westward:beat |
| `sol_debrief` | convo:sol_first:ac_close | convo:final:choose<br>convo:sol_first:again |
| `sol_knows_name` | convo:sol_after_raid:r_rope | ENGINE src/game/director.js |
| `sol_knows_survey` | convo:sol_first:s2 | convo:sol_first:as_end |
| `sol_met` | convo:sol_first:s_deal | convo:sol_first:entry |
| `sol_told_cellar` | convo:sol_first:s_ask | convo:sol_first:as_end |
| `sol_vent_talked` | convo:sol_first:vc_end | ENGINE src/game/director.js |
| `southmarrow_done` | quest:southmarrow:done | convo:teo_first:again |
| `teo_heard_crisis` | convo:teo_first:a_crisis_lost | convo:teo_first:again |
| `teo_log_done` | convo:teo_log:l_end | ENGINE src/game/director.js<br>convo:teo_first:again |
| `teo_met` | convo:teo_first:t_gift | convo:teo_first:entry |
| `teo_named_iris` | convo:teo_log:l_dunno<br>convo:teo_log:l_use | convo:teo_first:a_shop |
| `teo_shared` | convo:teo_first:t_why3 | epilogue:teo |
| `took_offer` | convo:krajcik:k_offer2 | convo:final:k_sees |
| `trench_fought` | ENGINE src/game/director.js | ENGINE src/game/director.js<br>ending:cut:beat<br>ending:record:beat |
| `trench_passed` | ENGINE src/game/director.js | — |
| `trench_slipped` | ENGINE src/game/director.js | ENGINE src/game/director.js<br>ending:everybody:beat<br>ending:record:beat |
| `trench_talked_through` | ENGINE src/game/director.js | ENGINE src/game/director.js<br>ending:record:beat |
| `vents_half` | convo:vent_decision:start | ENGINE src/game/director.js<br>convo:sol_first:again<br>epilogue:stacks_held |
| `vents_left` | convo:vent_decision:start | ENGINE src/game/director.js<br>convo:sol_first:again<br>epilogue:garage_died<br>epilogue:stacks_held |
| `vents_shut` | convo:vent_decision:start | ENGINE src/game/director.js<br>convo:sol_first:again<br>ending:everybody:beat<br>epilogue:garage_lived<br>epilogue:stacks_lost |

<!-- /ledger -->

---

## 3. 選択の台帳と主要帰結地点

多分岐の選択について、**すべての分岐が判別されなければならない地点**を宣言する。
宣言した地点の本体に分岐フラグが現れない場合、その分岐はそこで既定値に潰れており、
`validate.mjs` が落とす。

これとは別に `validate.mjs` は自動規則を持つ:
**エンジン（`src/game/`）がある選択の一部の分岐だけを読んでいる場合、読まれていない
分岐はそこで潰れている**として落とす。宣言漏れがあっても、この規則は効く。

<!-- ledger:choices -->

| 選択id | 分岐 | 分岐フラグ | 主要帰結地点 |
|---|---|---|---|
| vents | shut/half/left | vents_shut/vents_half/vents_left | src/game/director.js::_beginCrisis |

<!-- /ledger -->

`_beginCrisis` は第2章の決定が第4章の地形として届く唯一の地点であり、帰結モデルで
最も荷重のかかる場所である（`docs/bible.md` §11）。現状 `vents_half` はここに現れない
（IMP-11 / N-10）。

---

## 4. 世界の数値台帳

同じ量が複数の台詞に現れる。**値は1か所で持ち、本文はそこから照合する。**

<!-- ledger:world -->

| 量 | 値 | 単位 | 典拠アンカー | 典拠の語 |
|---|---|---|---|---|
| population_remaining | 406 | 人 | convo:krajcik:k_ledger3 | Four hundred and six people are still in Hollis |
| households_relocated | 340 | 世帯 | cast:krajcik | Three hundred and forty households |
| relocation_rate | 30 | 世帯/四半期 | convo:krajcik:k_offer2 | thirty households a quarter |
| westward_households | 380 | 世帯 | ending:westward | Three hundred and eighty more households |
| westward_years | 11 | 年 | ending:westward | Eleven years. |
| westward_first_three_quarters | 99 | 世帯 | ending:westward | Thirty-one that quarter. Twenty-eight the next. Then forty | 
| evacuation_days | 19 | 日 | ending:everybody | empty Hollis in nineteen days |
| evacuation_operators | 2 | 人 | ending:everybody | the two of you used the Authority's own evacuation machinery |
| borehole_9_3_temperature | 406 | ℃ | convo:teo_log:l2 | Four hundred and six degrees at 9-3 |
| dead_after_cellar_row | 291 | 人 | convo:krajcik:k_after | Two hundred and ninety-one. |
| ren_age | 41 | 歳 | cast:ren | Forty-one. |
| ren_rescue_training_age | 19 | 歳 | cast:ren | Mine-rescue trained at nineteen |
| ren_rescue_years | 10 | 年 | cast:ren | ten years on a rescue team |
| ren_survey_years | 8 | 年 | cast:ren | then eight as a survey tech |
| ren_left_months_ago | 18 | ヶ月 | convo:sol_first:s_cellar3 | eighteen months late |

<!-- /ledger -->

### 4b. 台帳の前提（本文に典拠を持たない値）

これらは本文に書かれていない。**検査の前提であることを明示するために分けてある。**
前提を緩めれば検査は通る——だから前提は本文と同じ場所に置き、変更が目に見えるようにする。

<!-- ledger:world-assumptions -->

| 量 | 値 | 単位 | 根拠 |
|---|---|---|---|
| household_size_min | 1.8 | 人/世帯 | 単身世帯が多い廃止工業都市でも、世帯あたり2人を下回る集団は現実に存在しない下限として置く |
| quarter_days | 91.3 | 日 | 365.25 / 4 |
| evacuation_speedup_max | 2.0 | 倍 | 秘密保持下の退去が公式の移転より速くなりうる上限。これを超えるなら本文に説明が要る |
| career_tolerance_years | 0.5 | 年 | 経歴の合計と年齢の食い違いの許容 |
| collision_min_value | 100 | — | これ未満の一致は偶然である。「十九日」と「十九歳」は衝突ではない |
| duration_tolerance | 0.2 | 比 | 期間の宣言値と算出値の許容相対差 |

<!-- /ledger -->

### 4c. 検査規則

`validate.mjs` に実装されている規則。**表の規則idと実装の規則idは一致しなければならず、
一致しない場合は落ちる**（片方だけ消える事故を塞ぐため）。

<!-- ledger:world-rules -->

| 規則id | 内容 | 対応 |
|---|---|---|
| W-ANCHOR | すべての典拠の語が、そのアンカーの本文に実在する | 台帳の腐敗 |
| W-HOUSEHOLD-SIZE | westward_households × household_size_min ≤ population_remaining | IMP-13 |
| W-DURATION | westward_first_three_quarters から出る速度で westward_households を移すのに要する年数が westward_years と一致する | IMP-13 |
| W-EVAC-RATE | 退去の実効速度が relocation_rate の evacuation_speedup_max 倍を超えない | IMP-12 |
| W-COLLISION | 単位の異なる2つの量が同じ値を持つ場合、両者を結ぶ本文が存在する | IMP-15 |
| W-CAREER | ren_rescue_training_age + ren_rescue_years + ren_survey_years が離脱時の年齢と一致する | IMP-17 |

<!-- /ledger -->

---

## 5. 可視フィードバックの方針

`docs/bible.md` §1 柱5「ゲームはプレイヤーの答案を採点しない」の機械化。

<!-- ledger:feedback -->

| 指標 | 閾値 | 根拠 |
|---|---|---|
| visible_trust_ratio | 0.25 | 柱5。信頼変動の可視化は例外であって既定ではない。**これは計測値ではなく方針として置いた閾値である** |

<!-- /ledger -->

これとは別に、閾値を持たない硬い規則がある: `src/content/story.js` の `QUIET` の
設計コメントが**名指しで禁じた文字列**は、`QUIET` なしで発火してはならない。禁止語は
コメントから抽出されるので、コメントを書き換えれば検査も変わる——**その書き換えは
diff に残る。**

---

## 6. 公社の職位（N-14 / IMP-16 の申し送り）

未解決。`cast:iris` は Survey Engineer II、`convo:krajcik:k_offer2` は
Survey Engineer One を提示し、`:11-12` のレンは22ヶ月前に survey assistant である。
等級の一貫性検査は本台帳の対象外であり、IMP-16 として未着手のまま残る。
**ここに書いてあることは、検査されているという意味ではない。**
