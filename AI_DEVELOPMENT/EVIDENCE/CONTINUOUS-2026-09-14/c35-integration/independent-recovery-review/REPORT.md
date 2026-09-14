# C35 原録音回収と最終 workflow の独立読取りレビュー

限定 5 ファイルの統合阻害は 0 件。回収 helper / summary 4 ファイルと、統合担当が追補指定した最終 workflow SHA `74659c1ee3fcfde3c820d3615b9014992fc67ea20c91a73b9aa3f6e2e76c19ae` を照合した。元 `recovery-five-files.json` の workflow `b4ae9d…` は shadow job 追加前の記録として区別し、書き換えていない。

source helper は作者凍結版・統合担当の独立コピーと完全一致する（SHA `7a910eeca46854659c410a35d778e3f407c3ab7098bbe453d3b4597b17d70d12`）。PR helper はそこから pins、出力先、対応 summary、説明、および metadata head と実 runCommit を分ける 1 条件だけを変更している。summary projection 関数は既存 iOS helper SHA `1b3bc6fd…` と byte 単位で同一。

| 原証拠 | source | PR |
|---|---|---|
| Artifact ID | 10357143198 | 10356974645 |
| Run ID | 34866156884 | 34866168484 |
| Metadata head | 81de9354117a54397bf2c9e64e18a91c397dd06a | 81de9354117a54397bf2c9e64e18a91c397dd06a |
| 実 runCommit / artifact 名末尾 | 81de9354117a54397bf2c9e64e18a91c397dd06a | 6eaddedf951047c41c735bad4b6dfcf8b9e8946f |
| Archive bytes | 13,304,946 | 12,127,290 |
| 元街 engine/audio 比 | 0.9473270440251034 | 0.8144946808510178 |
| 街 / gas / room clock guard | false / true / true | false / true / true |
| Lifecycle | not run | not run |

両候補の summary bytes は保存原 summary と一致し、各原 log の唯一の `[ios-safari-report]` JSON と全内容が一致する。status=failed、captureStatus=acquisition failed、全 failures / checks / provenance / lifecycle を exact projection 照合で保持する。metadata の ID / name / bytes / digest / run / head / expired と、各媒体の bytes / SHA は保存された実 metadata・原 summary と一致した。source と PR の artifact、run、実行 commit、summary SHA、3 媒体 SHA はすべて別々で、相互受理を許す正規化はない。PR の metadata head に合成 merge SHA を要求する誤りもない。

回収では未知だった full report の原 bytes を再 serialize せず保存・export する。全 3 媒体の固定 bytes / SHA と summary 照合が通る前には成功 set を export せず、16 MiB / 32 MiB 上限と 3000-byte offset、失敗時 throw を保持している。回収成功という輸送状態は、元の録音成功や品質合格を意味しない。

正規 C34 `.github/workflows/gates.yml` を取得し、既存 17 jobs と他のトップレベル設定が最終版で解析上完全一致することを確認した。追加は回収 2 jobs と shadow 解像度 1 job のみ。回収は明示 marker 付き push の attempt 1、contents/actions read、checkout credentials 無保持。正規 repo の固定 artifact metadata 検査後に official download-artifact を実行する。録音・browser・build コマンドは回収 jobs にない。エラーを許容する設定もない。always upload の部分成功で先行 step の失敗を消さない。

shadow job は既存 contact job から明示された名前・marker・単独 opt-in・helper 構文確認・出力先だけを替えた複製である。既存の実 WebKit route と always export を保持する。これは接続差分のレビューであり、実 GPU の成功ではない。

作者版と一致する独立コピーの 19 CPU controls、および統合担当の source/PR metadata・相互拒否 10 controls の既存結果を読んだ。今回は両 suite や helper を再実行していない。原 full report / MP4 の正規回収、実 shadow control、原因の特定は今回未実施。回収前の full report 生 byte SHA は未知なので、事前には保存された exact projection と固定媒体 SHA を検査するという証拠範囲を維持する。

最初の読取り検査は、統合担当が shadow job を追加した直後に旧 19-job 件数の assertion で停止した。追補された最終 20-job 版を改めて有限照合したもので、最初の停止から合格結果を出していない。候補編集・原資料変更・suite 再実行・remote・CI・automation・新規子・比較は 0。

全 5 ファイルと原記録の hash、厳密差分、workflow の照合は `review-result.json` / `workflow-review.json` / `limited-pr-derivation.diff` に保存した。review-result SHA-256: `336afd8ed05a845170fe09b83ba47637a94641f6e1042f12771f49a581207552`。
