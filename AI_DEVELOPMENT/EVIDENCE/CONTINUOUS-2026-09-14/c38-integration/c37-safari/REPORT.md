# C37 完了済み Safari 原ログの有限回収結果

正規 latest head `bf743056ce143f09e4c6544ef1c7df4b73b232fd` → AGENTS → CLAUDE → SESSION の順に受理し、完了済み source / PR Safari と F3 execution の4原ログを各1回回収した。全161,789 bytesを保存し、原summary各1件の完全JSON parse、job完了metadata、末尾cleanup/newlineを確認した。表示用に切り出した一部を完全原ログの代わりにしていない。`authority-and-log-receipt.json` が各bytes/SHAと取得回数を保持する。

## 実結果

| | source | PR |
|---|---|---|
| Floor run | 34879275702 | 34879453199 |
| Safari job | 104094199700 success | 104094807794 failure |
| F3 core job | 104094199428 success | 104094808213 success |
| F3 execution job | 104097805106 success | 104098680720 failure |
| 原checks | 53 / 53 pass | 44 / 47 pass |
| 原clip保存metadata | 3 clips | 3 clips |
| 実固定更新後の入力解除 | 8 ms、moveMagnitude 0 | 85 ms、moveMagnitude 0 |
| 原詳細frame profile | null、env 0 | null、env 0 |
| 取得後lifecycle | 5段階をchecked | 原clock失敗のためnot run |

4ログは `transport/source-safari.log`、`pr-safari.log`、`source-f3-execution.log`、`pr-f3-execution.log`。F3 coreは正規run-jobsの完了metadataを確認し、追加のcoreログ取得はしていない。standalone / roundの追加ログ取得や新しい実行も行っていない。

sourceの成功は今回の実取得成功であり、C34 / C36の元時間損失や転送原因を修復した証拠にはしない。PRは実ゲーム・3本の録音保存に到達した。今回の失敗はWebDriverAgent起動や第三clip転送timeoutではなく、streetとarcadeの原clock guardである。

## 元時計を変えない再計算

| 実行 / clip | wall秒 | audio秒 | engine秒 | engine/audio | audio−engine秒 | 元許容秒 | guard |
|---|---:|---:|---:|---:|---:|---:|---|
| source street-walk | 10.605 | 10.602667 | 10.200000 | 0.962022133 | 0.402667 | 0.530133 | pass |
| source cut-gas-air | 7.271 | 7.274667 | 7.266667 | 0.998900293 | 0.008000 | 0.363733 | pass |
| source arcade-room | 7.314 | 7.317333 | 7.300000 | 0.997631195 | 0.017333 | 0.365867 | pass |
| PR street-walk | 18.334 | 18.261333 | 16.900000 | 0.925452687 | 1.361333 | 0.913067 | failure |
| PR cut-gas-air | 11.483 | 11.488000 | 11.366667 | 0.989438254 | 0.121333 | 0.574400 | pass |
| PR arcade-room | 10.962 | 10.965333 | 10.366667 | 0.945403696 | 0.598667 | 0.548267 | failure |

summaryの元endpoint値から比・差・`max(0.1, audioSeconds × 0.05)`を再計算し一致した。PRの許容超過は街0.448266667秒、arcade0.0504秒。PRの3件目のfailed checkは、この原取得失敗を受けたlifecycle開始条件で、別のlifecycle処理不具合ではない。続く原Errorも「取得が成功していないため境界操作を試みない」という理由を保つ。

PRの解除直後snapshotはmoveMagnitude 1だったが、その後の最初の実fixed-step進行後85 msでは0。解除検査はこの後者を確認してpassedであり、即時snapshotを失敗扱いしない。元テレメトリの整列・有限値・pose完全性は各clipのsummaryでtrueだが、原fullreport全テレメトリは今回ローカル回収していない。詳細profileなしなので、処理内CPU / GPU / renderer / 外部待ちの原因へ帰属させない。

## provenanceと原bytesの証拠範囲

両runのsource headはbf743、attempt 1。sourceの実行commitはbf743。PR実行commitはmerge `d0d71920e393a506d95e93892416a57c8b1dfa8c` で、正規commit応答のparentsはmain `5456371249f5769c25d18f1686a44349e4292d6f` とsource bf743。PRのmerge SHAをsource SHAへ書き換えない。

両実行のroot / dist bundle SHAは `1094c1d96bed6b953c1655ce65549c484b8f09e275f055bff283499cece110f7`、shared recorder blobは `785541d3beaed0e35e8bcf042973eabb7bdb5d6c`。独立担当が正規bf743から取得したhelper `0ac5b363…20ee513`、harness `fe15b0b8…cf6b6ec`、probe `2ce6e467…5ef08cf` の実bytes/SHA/Git blobは両原provenanceと一致した。全SHAは `independent/source-pins.json` と `analysis.json` に保存している。

source原F3出力はfullreport **944,656 bytes / SHA-256 `671387b2dea3b7004002b83b466f5856d292914e06dce3b319a7107aa4a83e73`** を記録する。正規 `tools/gates/f3_safari_audio.mjs` は、原full telemetryで元時計関数を再実行し、各3clipの実file bytes/SHAもCI内で再照合してからpassedを返す。これはCI内の実検証成功であり、こちらで原fullreportやMP4を回収・聴取したという意味ではない。

PR F3は原report.status / failed checksの段階で停止し、元理由は `The complete Safari gate did not pass`。clip metadataが3本存在してもF3全完了ではない。PR原fullreportのbytes/SHAは今回のログからは得られていない。

## 固定原artifactと最小の次回収候補

正規artifact metadataと原uploadログのID / size / ZIP digestが一致した。

| | artifact ID | ZIP bytes | SHA-256 |
|---|---:|---:|---|
| source | 10361539497 | 11,246,160 | `75221e62f888adf6525d9b7981b3318b926fe82c4118fd5f90314d819d176185` |
| PR | 10362417424 | 15,617,119 | `5eb9508ad3097f2105667b6467094e46b73df7dbb68f8d0be1e907a61eb28003` |

ZIP実bytesの取得・ローカルhash照合は0。各clipのCI記録bytes/SHAは `analysis.json` に保持する。追加の原回収を選ぶ場合、まず固定PR artifactから `report.json` と `f3-audio-verification.json` の原bytesを選択的に取り出す候補が最小である。これで新しい街・arcadeの原frame時計を読めるが、C37に存在しない処理内profileを作ることはできない。sourceは固定fullreport SHAを照合できる。原3MP4の回収は聴取等で必要になった段階の別取得とし、今回の時計原因特定の代わりにはしない。

回収を採用する場合は、唯一writerが既存の許可された正規経路・固定ID/digest・元run/head/attempt・必要ファイルを明示して管理する。今回、新CI / retry / artifact download / clip取得を起動していない。既存拒否URLやfile URIを別経路で再試行していない。

## 有限検証と固定状態

当人の `analyze_original_logs.py` と別Ultraの `independent/verify_results.py` は、4原log hash、完全summary parse、tool pins、clock算術、解除、F3原末尾を照合した。不一致なし。独立REPORT SHAは `5923c06183c582a765dbc25d1c86a9d2d1586a870cbbf3d72f5e6038b7ec0295`、独立manifest SHAは `d11df770e8377e712c794596b779985321ee51d9ade7e80ea7b0a3f79ac6cadc`。

開始 `2026-09-13T20:56:49+09:00` / 期限 `2026-09-20T20:56:49+09:00`、19要素 / 71基準、全19 not measured / valid blind0 / units0 / continuousを保持。製品・guard・120秒期限・remote・CI・rerun・automation変更0、remote pending0。唯一writerは `/root/integration_recovery_ultra`。保存済み成果を引き継いだ最終followupでは、新ログ取得0・重複子起動0でこのREPORT/manifestのみを確定した。通知されたcapacity errorの内部原因は推測していない。
