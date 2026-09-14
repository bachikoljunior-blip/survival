C35影マップ原画像の技術レビュー（C36保全）
==================================================

2048ではarcadeの影の輪郭と足近くの細い連続が明瞭になる。一方、southでは足元が暗く下端で切れており、接地改善を判断できない。現時点ではmedium tier全体を2048へ上げる設定は非採用を推奨する。局所的な知覚効果を否定する判断ではなく、2場面の静止画と未測定の性能費用から全体採用へ進めない判断である。製品設定は変更していない。

担当は /root/integration_recovery_ultra/shadow_original_review_ultra。正規GitHubAppで制作ブランチ最新head d2c463b54d4ea12abc0a9444627db810440a59a7を確認し、AGENTS.md→CLAUDE.md→AI_DEVELOPMENT/SESSION_STATE.yaml、その後STATE.yamlを受理した。ULTRA-CHILDREN-20260914-v3を保持する。原runは34869816263、jobは104062638759、対象runtime SHA-256は514f671fa64b75dda7f835a430245e9b168f9aca38fbce0b8184b12938679a55。

以下の6原PNGを、それぞれtools.view_image(detail:original)で実際に開き、返された1147×645の画像を見た。加工、切抜き、拡大画像の作成、再生成は0。数値差分を知覚の代用に使っていない。

| 閲覧順 | 原画像の絶対path | 観測 |
|---|---|---|
| 1 | /workspace/scratch/0b7ad82bafe7/c35-shadow-resolution-result/original/shadow-resolution-arcade-original.png | 人物は中央で両足が画面内にあり、足元から左手前へ長い影が続く。影は幅広くぼけ、足の近くの細い接続と離れた人型の区別が弱い。姿勢は直立で、これだけで動作時の荷重を評価できない。 |
| 2 | /workspace/scratch/0b7ad82bafe7/c35-shadow-resolution-result/original/shadow-resolution-arcade-double.png | 左手前へ伸びる影の輪郭が明瞭になり、足の近くの暗く細い連続が読み取りやすい。影の先端側の形も元画像よりまとまって見える。この静止画の影の読みやすさには局所的な改善がある。足の位置や硬い姿勢自体は変化せず、完全な荷重感や全場面での接地を示すものではない。 |
| 3 | /workspace/scratch/0b7ad82bafe7/c35-shadow-resolution-result/original/shadow-resolution-arcade-restored.png | 元の広くぼけた影の外観へ戻り、元画像との目視上の不一致は見つからない。bytes完全一致も別途確認した。 |
| 4 | /workspace/scratch/0b7ad82bafe7/c35-shadow-resolution-result/original/shadow-resolution-south-original.png | 人物は大きく暗い横向きシルエットで、足元は下端に接し一部が切れている。前景は建物の大きな影で暗く、人物の接地影を明確に分離して判断できない。 |
| 5 | /workspace/scratch/0b7ad82bafe7/c35-shadow-resolution-result/original/shadow-resolution-south-double.png | 画面右下の明るい地面と前景影の境界などにわずかな締まりは感じられるが、人物の足元は引き続き暗く下端で切れている。足と支持面の接続について明確な改善は見て取れない。影境界の小差を接地改善へ読み替えない。 |
| 6 | /workspace/scratch/0b7ad82bafe7/c35-shadow-resolution-result/original/shadow-resolution-south-restored.png | 元画像と同じ暗い足元と画面下端の切れ方へ戻り、元画像との目視上の不一致は見つからない。復元一致は接地品質の達成を意味しない。 |

6枚の閲覧後、統合担当から既存の c35-shadow-resolution-result/image-review.json が発見されたとの通知を受けた。その後、同原レビューを読み、prior-image-review.original.jsonへbytesを変えず保全した。本担当の原画像観測は既存のarcade局所改善・south判断不可・global非採用という観測と整合する。これは出所既知の技術再確認であり、匿名比較の再試行、勝敗、E16達成、追加の完了単位には数えない。閲覧記録は本担当の記録であり、ツールtranscript exportを取得したという主張ではない。

verify_originals.pyを一度実行し68検査が成功した。6原PNGとreport.jsonの実bytes/SHA-256がrecovered-manifestとtransport meta/endに一致する。両場面のoriginal/restored/cached画像はbytes完全一致、doubleは異なる。元report内のpose（時刻、カメラ、人物、光源を含む）、feet、fixed全体が各3段階で同じことを照合した。bias=-0.0009、normalBias=0.028、radius=1、blurSamples=8、extent=[-48,48,48,-48,1,150]を保持。全記録対象寸法は1024→2048→1024、旧attachments解放、最終texture count復元、contextLost=false、glError=0を原reportから確認した。GPU実行をこのレビューで再実施したとはしない。詳細と全hashはverification.jsonを参照。

費用と適用範囲には未測定が残る。元のrender+gl.finishの単回host wall timeはarcade 250/198/約187 ms、south 218/約203/200 msで、独立GPU timerやFPS測定ではない。これらから2048の高速化や性能回帰なしを主張できない。2048のtexel数が4倍という計算も、総GPUメモリ、ピークRAM、熱、電池の実測ではない。今回の目視はnative1147×645の2静止画に限り、667×375 CSS表示、運動、カメラ移動、影のちらつき、他場面へ一般化しない。実機検証は行っていない。

次操作は、1024の製品設定とこの完了した単変数診断を保持すること。接地について新候補を作る場合、まず両足と支持面が画面内に見えるカメラ条件を用意する。解像度採用を再検討するには、その新候補のスマートフォン表示での観測と、継続描画・メモリ回帰の実測を揃える。旧同一資料の反復を有効blindへ数えない。

全19要素not measured、固定71基準、概念・参照・STATEは不変。有効blind0、完了units0、continuous。開始2026-09-13T20:56:49+09:00、期限2026-09-20T20:56:49+09:00を保持。remote/CI/automation/製品変更はすべて0。編集は /workspace/scratch/0b7ad82bafe7/c36-shadow-original-review-ultra/ 内のみ。
