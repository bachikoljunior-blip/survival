# E9人物描写：英日8node改稿候補

Frozen ready。出所既知の制作診断に基づく文面候補であり、匿名評価・勝敗・品質合格ではない。

正規 `81de9354117a54397bf2c9e64e18a91c397dd06a` のAGENTS → CLAUDE v3 → SESSIONを再受理し、英語story、日本語story/story2、localeの結合元と最後の結合先をGitHubで確認した。単独writerは `/root/integration_decisions_ultra_v2`。本担当の書込みは `e9-character-revision-ultra/` だけで、production/source原本、remote、CI、automation、新子へは変更していない。

## 採用対象の正確な3ファイル

| candidate内のrepository path | Bytes | SHA-256 |
| --- | ---: | --- |
| src/content/story.js | 111989 | faa5d203dd5aeb8900400a8b13959f2f5286b3400d19fdd375ffa41bc9535f44 |
| src/content/locale/ja/story.js | 29927 | 0530d41bb02ab9f72d71b5323491e560a16aff78e29c032390e41b371dac8158 |
| src/content/locale/ja/story2.js | 30756 | 179c9d8e3e2cc525fe01a8744037fb15e712da2bdc5cd536b0e80ea4ada8143f |

`candidate.patch`: 11,553 bytes、SHA-256 `747b1b4d9d3e3fe3c5d4c5c9c9f7fc44e753a13935930c408d65a1f396b57e11`。

英語主sourceの対象本文8フィールドと、それを日本語で上書きする8フィールドだけを変更した。英語は対象合計314語→304語。人物・世界・分岐の追加はない。修正文は本制作の既存の当番表、照明、水場、測量、通行証、転居台帳・費用を使って書き起こし、参照作品の文面・設定・場面を移植していない。

## 実nodeと変更内容

| Packet | CONVERSATIONS内の座標 | 改稿の目的と日本語対応 |
| --- | --- | --- |
| B-U1 N025 | sol_first.nodes.ah2 | 相手の内心の断定をやめ、二つの当番表に対して照明・水場の担当をどう割り当てるかを求める。STORY_JA.c.sol_first.ah2.text。 |
| B-U1 N043 | sol_first.nodes.vc_end | バール・楔・妨害しない立場を残し、流れを変えた場合にどの頭を触ったか知らせるよう求める。照明配置のための情報という用途を示す。STORY_JA.c.sol_first.vc_end.text。 |
| B-U8 N017 | iris_first.nodes.i_decide | 通行証による入室と測量値への本人の署名を分ける。STORY2_JA.c.iris_first.i_decide.text。 |
| B-U8 N019 | iris_first.nodes.i_refuses | 契約残11か月、母の施設費月400、北面の故障した掛け金を保持。通行証が本人に結び付く不安と、入口を知らせても自分が開けない境界を示す。STORY2_JA.c.iris_first.i_refuses.text。 |
| B-U9 N010 | iris_after.nodes.i_sign | 公の場で決意を試してほしいという要求を、使用場所で線と測量値を示し、測定への責任と用途への賛同を分ける要求へ変える。STORY2_JA.c.iris_after.i_sign.text。 |
| B-U10 N023 | krajcik.nodes.k_deal_cut | 公開訂正、900万、ひと月で職を失う見込み、転居事業も終わる蓋然性を保持。現場での再提案に署名者と待機世帯の扱いを含めるよう求める。STORY2_JA.c.krajcik.k_deal_cut.text。 |
| B-U13 N007 | final.nodes.k_asked | 現場で再提案する前段を受け、整約の署名者の責任も指示書と一緒に記録するよう求める。STORY2_JA.c.final.k_asked.text。 |
| B-U13 N008 | final.nodes.k_asked2 | 提案者が主人公である点を保持し、訂正で転居費用が止まるなら、その結果も記録から外さないよう求める。STORY2_JA.c.final.k_asked2.text。 |

## 有限の意味整合確認

前回の26node対応表と全13unitの既読内容へ照合した。改稿8node以外の18周辺nodeを含め、全文の他のフィールドは不変。

- 生活拠点担当者の要求は、B-U1 N024の二枚の当番表、N019の照明と階段、N040の庭の水・電源に接続する。実際に当番を割り当てた、照明を移動した、報告を受領したとは記述していない。新しい期限条件も設けていない。換気の三択と後の地区別反応はそのまま。
- 技術者の文面は、B-U8 N018の通行証譲渡、N019の拒否、B-U9 N007の自分では開錠していない説明と両立する。署名を無条件に約束せず、B-U13 N014の署名とN015の拒否の双方を保持する。数値を新たに照査・校正したとは主張せず、照査の完了条件も追加していない。
- 契約担当者はB-U10 N014–019の転居財源・人員を守る目的から要求する。公開訂正の提案、公開の場で再度求めること、B-U13 N013–015の署名者問題へ接続する。転居財源を確保できた、事業が継続すると決まった、全住民が移動したとは記述していない。
- 日本語は各文の責任範囲・条件表現・数字を英語と合わせた。生活拠点担当者は短い常体、技術者は丁寧体で署名範囲を限定、契約担当者は丁寧体で記録責任を求める。単一改行で日本語の文中に空白が入らないよう、段落内改行を置いていない。

これらは人物の会話上の要求・限定である。当番参加、報告、測量値の提示、責任者の名指し、転居の引継ぎを新しいゲーム操作や達成条件として実装したものではない。従来の条件・効果で会話は進む。新しい行動が実行済みだと読み替えてはならない。

## 検証

`node verify-candidate.mjs`：17項目成功。3ファイルの構文、正式blob pins、指定8nodeの一致、対象本文を戻した全exportの完全一致、全13会話の非対象フィールド一致、英日対象本文・段落の対応、対象本文以外の全bytes一致を確認した。choices・edges・conditions・effects・mood・人物紹介・クエスト・後続結末・日本語の選択肢やタグはすべて不変。

通行証の信頼度12と最終署名の信頼度10は別の条件のまま。換気能力の付与、公開訂正のフラグ、最終署名者の分岐も不変。元の条件付きグラフを、全て同じ通常プレイで実行された履歴とは扱っていない。

正規ja.jsはSTORY_JA → STORY2_JA → CONTENT_JAの順で再帰結合する。最後のCONTENT_JAに会話のc枝が存在しないことを実moduleと正式blobで確認したため、改稿した8つの日本語本文は後続tableで上書きされない。証拠は `locale-route-receipt.json`。

既存suiteの再実行、runtime build、bundle pin更新、実ブラウザでの表示、音声・動画・匿名比較は実施していない。次の採否・独立統合レビュー・実buildは単独writerへ渡す。

19要素すべてnot measured、10参照・71基準は不変。有効blind比較0、work completed 0。継続開始2026-09-13 20:56:49 JST、期限2026-09-20 20:56:49 JSTを保持。
