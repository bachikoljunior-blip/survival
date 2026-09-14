# C34 音声採用 5 ファイルの独立読取り照合

限定範囲の統合阻害は 0 件。正規 C33 `eb81be9053204fa25a0e7556f78941dd862d4032` の AGENTS → CLAUDE v3 → SESSION を順に取得受理し、`main-integration-c34/candidate/` の全 5 ファイルと固定 manifest を照合した。候補ファイルは変更していない。

- source 92ee と root 514f は、run 34864648858 / job 104045296962 の回収原 bytes と完全一致した。SHA-256、byte 数、Git blob は原 report と recovered manifest にも一致する。source は正規 C33 の準備候補とも一致する。
- 原 report SHA は `3af69d8780c54ca4a5f2868e7b5958f6200578390a47977440fc65edf8189446`。実準備記録の 47 入力 SHA は正規準備 helper の固定値とすべて一致し、元 81c 再現、固定依存、7 コマンド exit 0、音声 source と root だけの変更を記録している。今回ビルドを再実行した結果ではない。
- `ios_audio_capture.mjs` は前回レビュー済み 239 draft から preparedFromCommit、preparationReportSha256、bundleSha256 の 3 値だけを置換した完全一致。recorderBlob は実 recorder の Git blob と一致する。録音 cap・転送期限・三時計 guard・5 stage と失敗伝播の実装は同一。
- recorder と F3 は前回レビュー済み draft と byte 単位で同一。前回 5 ファイルの固定 SHA 自体も再照合した。

実 Mobile Safari 復帰、新録音、品質は未測定。旧 80 / 35 CPU suite は再実行していない。静的な旧証拠拒否 preflight と通常 PR 必須 CI は統合担当の担当であり、今回の照合に含めない。保存 tree 全体や他の archive のレビューも範囲外。19 要素・71 基準と判定は変更せず、比較 0。remote 書込み・CI 起動・automation・新規子は 0。

全 5 ファイルの hash、正規取得 receipt、再現可能な読取り検査、3 pins の限定 diff を同ディレクトリに保存した。`review-result.json` SHA-256: `71062ae5933427fd765fbfac7d9e73befcae58ca1c5eec880f3b677cd786a799`。
