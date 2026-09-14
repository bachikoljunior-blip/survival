# C36 reviewed narrative: actual build and original screen recovery

既存受理済job `104080729331`（source Floor run `34875252891` / attempt1）が成功した。新しいCI・再試行・remote・automation操作は0。C36 `789f2199bd3791a6dc6566eecaf3c1478c99afa6` の実buildと原16画面を正規job logsから回収した。今回の候補は製品採用へ進める状態だが、C37最新必須CI・実Safari・通常merge・Pages/F6は別途必要。

## 実結果

| 項目 | 確認値 |
| --- | --- |
| source commit / preparedFromCommit | 789f2199bd3791a6dc6566eecaf3c1478c99afa6 |
| run / attempt / job | 34875252891 / 1 / 104080729331 |
| 実新bundle | cinderline.1.0.0.js、1446171 bytes |
| 新bundle SHA256 | 1094c1d96bed6b953c1655ce65549c484b8f09e275f055bff283499cece110f7 |
| 新bundle Git blob | 70857633766d7064806f06f965b7aafa0bf1533e |
| 原preparationReportSha256 | 2dbf5a5b15424ccd2e1e33e628391fad46084f4ec46686b70db1023d9061bf69 |
| 再現した旧bundle SHA256 | 514f671fa64b75dda7f835a430245e9b168f9aca38fbce0b8184b12938679a55 |
| 依存 | npm ci / esbuild0.25.0 / three0.180.0 |
| 準備原files | 10 files、1686610 bytes |
| 画面原files | 16 PNG + report、4850536 bytes |
| 実画面 | Chromium mobile emulation、667×375、DPR1、touch1 |

正規latesthead→AGENTS→CLAUDE v3→SESSIONを本人が受理した。一般fetchのactions/jobs URLはallowlistの400だったため同URLを再試行せず、明示された専用job steps/logsとrun jobs toolを用いた。元の拒否fileURI/公開URLへの再試行・資格情報読取りはない。

`original-job.log` は正規専用job logsの一回の取得から保存した全文。取得応答とのcodepoint数、CR/LF数、末尾改行を照合済み。`run.json` はrunの実head/event/branch/attempt、`job.json` と `completed-steps.json` は当該jobの成功と全stepを記録する。専用run-jobsの正規化結果はjobのhead_shaを省くため、job.run_id→実run.head_shaと両原reportのsourceCommitで結合する。省略された値を取得済み字段として捏造しない。

## 回収検証

`recover.py` は `prepared-narrative` と `narrative-route` のmeta/chunk/endを別々に検査した。期待filename/順序、meta=end、offset0から連続する最大3000原bytesのchunk、canonical base64、全byte長・SHA256・Git blob、実commit/run/attemptを確認してから原fileを書き出した。2系統のreport.jsonは異なるfolderへ保存した。

準備reportの47inputsはC35 canonical pins全件と一致。7実build stagesが全てexit0で、旧514f再現とroot mirrorが成功した後に凍結3sourceだけを適用した。3sourceの原bytesは英日8nodeの凍結候補と完全一致し、static5filesは正規rootのまま。変更は3sourceと生成runtimeの4filesだけで、新dist/rootは同じ1094になることを実reportで確認した。

画面reportは実1094 bundleと同じsourceCommit/run/attemptに属する。実served response bytes、新root/dist、英語source、英日16のlocale/UI/DOM hashes、各原PNGのsize/SHA256/IHDR667×375、viewport/DPR/touchとbrowser errors0が一致。原files一覧・hash・元log行/offsetは `recovered-manifest.json`、実閲覧一覧の絶対path・hashは `visual-review.json`。

## 原画面の本人閲覧

`view_image` のoriginal表示で16枚全てを実閲覧した。対象本文は各dialogue box内に表示され、文字欠落、残ったcaret、日本語文字化け、対象本文の英語fallback、重なり・枠外overflowは確認されなかった。長いIris拒否/Krajcik条件本文も全体が収まる。

`ja-final-k_asked2.png` は複数画像表示で末尾の読取りに一度疑義があったため原PNGを単独で再閲覧し、sourceどおり「残してください」まで確認した。元hashは不変で、画像編集・新画像生成・録り直しは行っていない。

確認した既存の限定事項:

- sourceの段落空行は既存normal-whitespace UIで空行にならず、通常の折返しになる。段落の見た目を改善したとの主張はしない。
- 日本語の `iris_first:i_decide` と `final:k_asked` に非本文mood `quiet` が残る。この3source改稿で変更した本文16fields外の既存表示であり、日本語UI全体の完了を意味しない。
- 全画面は新しいcontextでnodeを直接選ぶ有限表示診断。通常プレイの到達履歴、自然な進行、他viewportの可読性、Mobile Safari・実機・音声品質・ブラインド比較ではない。

画面確認のblockingは0。元PNGを一括して合成画像へ変換していない。各原imageは `route-original/` の `en-` / `ja-` に次の8座標を続けたfilenameで保存した: `sol_first-ah2`、`sol_first-vc_end`、`iris_first-i_decide`、`iris_first-i_refuses`、`iris_after-i_sign`、`krajcik-k_deal_cut`、`final-k_asked`、`final-k_asked2`。

## 採用に渡すもの

`prepared-original/` の3sourceと `cinderline.1.0.0.js` が同時採用対象。static5filesは既存と同一なので追加変更不要。原preparation reportは同folderの `report.json`。IOS_AUDIO_PINは `adoption-pins.json` の実値を使い、bundleSha256 / preparedFromCommit / preparationReportSha256の3fieldsだけ更新する。bundle名とrecorderBlob `785541d3beaed0e35e8bcf042973eabb7bdb5d6c`、時計・録音・容量・転送・必須検査条件を保持する。

独立Ultra担当は原logから別parserで2245の転送recordsと27filesを再構成し、C36正規47inputs、PNG全CRC/IDAT構造、source/report/runtime/DOMのpin一致を確認した。C37 `main-integration-c37/candidate` の3source・rootは回収原bytesと完全一致し、5番目の `tools/ios_audio_capture.mjs` は指定3pinsだけの変更と確認した。旧514f拒否・現1094受理を含むCPU検査16/16成功、blocking0。最終結果は `independent-review/REPORT.md` と `independent-review/receipt.json` に保存済みで、C37の5path同時採用へ渡せる。独立担当は原PNGの構造・hashと本人の閲覧receiptを照合したが、追加の画面実閲覧はしていない。

全19要素not measured、有効blind0、units_completed0、continuous。STATE・概念・10参照・BENCHMARKS・71基準は不変。開始2026-09-13T20:56:49+09:00、期限2026-09-20T20:56:49+09:00を保持。新しい有効比較、C37必須CI、通常main反映と公開検証は未完であり、このjob成功を全体完了にしない。
