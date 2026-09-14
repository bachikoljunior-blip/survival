# C33 実保存候補 6 ファイルの独立読取りレビュー

対象は `main-integration-c33/ci-candidate/` の 6 ファイル。旧 `candidate/` の 239 採用 draft と区別した。正規 b0f1dfb9860dbc00018c0c587d8f0934fadb6604 のソース、限定 diff、既存検証記録を照合し、この範囲の統合阻害は 0 件。

- 準備 helper は宣言された 5 置換だけ。47 入力、元 root 81c の再現、固定依存、失敗処理、完全 export を保持している。
- workflow の既存 15 jobs とトップレベルは同一。準備 job は marker・出力名だけを変更し、contact job は明示 marker 付き push の初回に限定している。既存 F3 core・Safari・両 success 集約は同一。
- exporter は contact 有効時に期待する 10 PNG 名を追加するだけ。元の 2 MiB 上限、offset、SHA、欠落・不安定ファイルでの失敗を保持している。artifact upload の missing-files は warn だが、直前の always exporter は欠落で失敗する。
- 接地 tools 2 ファイルは既存凍結候補と完全一致。合成 audio 92ee は作者の composite と完全一致し、239 draft からの変更は既存 context が suspended のときに後続の trusted gesture で resume を再要求する最小修正である。

既存の audio CPU 35 controls と export 20 ファイル往復・欠落拒否の記録を読取り確認した。今回これらの suite、build、CI は再実行していない。読取り検査の初回には旧 marker 名の仮定を誤ったため assertion が停止し、正規値 `[prepare-audio-product-r1]` に検査側だけを訂正した。候補は変更していない。

実際の新候補ビルド、Safari 復帰、contact GPU 描画の効果は未測定。保存予定 tree 全体と 239 原資料 archive は今回の 6 ファイルレビュー範囲外。19 要素・71 基準の判定は変更せず、比較 0。remote 書込み、CI 起動、automation、新規子、候補編集はすべて 0。

全 6 ファイルの byte 数・SHA-256・Git blob、正規取得先、限定差分は同ディレクトリの `review-result.json`、`canonical-receipt.json`、`limited-diff.patch` に保存した。結果 SHA-256: `1153811789574e46260f4ca5163b05c46eeb642f8fd16d2a91f3759f7ec5edcb`。
