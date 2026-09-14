最終採否: **固定 C35 を基準に、準備 helper・英日 route 診断・追加 CI ジョブを準備候補として採用可。追加診断で発見した 2 件の不具合と起動記録の不正確さは親担当が修正し、再レビューで閉鎖した。未解決 blocking finding は 0。製品採用・実ビルド・実ブラウザ成功の判定ではない。**

最終対象は `c36-narrative-build-ultra/ci-candidate/`。helper SHA256 は `79a161d8b984dea9058f737f4092684e95f0ecd6ca101954add96277a192d653`、route helper は `c67a516cb109a02a43b693abe54127098e948ce53969c294642b036a2822c290`、workflow は `6255f8123d1a47aff56a295e53530d8fa5bfb4b5ebb36837c7e299622029216a`。helper と凍結 3 source は初回候補から byte 不変。初回記録の workflow `9995...` と pre-export 履歴の `56d6...` は旧版として保持し、最終採否はこの `6255...` に結び付ける。

最終追加の `--export` と branch 条件も採用可。workflow の専用 marker job は明示的な `github.ref == 'refs/heads/claude/repo-instructions-constraints-r0070m'` を要求し、report が存在し cancelled でない場合に原 byte 輸出を実行する。canonical C35 workflow の全 prefix byte と既存 20 jobs は不変。

route 輸出は成功 browser 診断の 16 PNG と report の **17 ファイル**を、`[narrative-route-meta]` / `[narrative-route-chunk]` / `[narrative-route-end]` で出す。chunk は原 bytes の連続 3000 byte 刻み。出力を始める前に report の確定状態、requested/attempted/executed の含意関係、全 16 source route pins、期待順序の screen prefix と flat filename、サイズ/SHA256、PNG signature/IHDR の 667×375、画像があれば実 git HEAD/GITHUB_SHA/run ID/attempt、各 4 MiB・全体 32 MiB 上限を検査する。PNG の decode/re-encode、切抜き、再撮影、画像差替えはしない。PNG signature/寸法と hash の検査は画像品質の検査ではない。

失敗診断は report.status/metadata.diagnosticStatus を `failed` のまま、実取得した順序通りの prefix と report を回収する。`complete: true` は各ファイルの byte 輸送が完全な意味で、診断合格の意味ではない。起動前失敗は 0 screens/0 routes、source-only 成功は browser 全 false/16 routes/0 screens として正しく report のみを出せる。成功 browser 診断には 16 screens が必須。画面取得後の browser error でもその原画像を落とさないよう、最終版は screenshot metadata を report.screens に入れてから errors assertion を実行することを確認した。

追加の独立輸出検証は **19/19 成功**。完全 17 ファイル復元、failed 5-screen prefix、preflight failure、CPU-only report、最後の file の破損・path 逸脱・重複・PNG signature/寸法違い・別 commit/run/attempt・text pin drift・不完全成功・lifecycle 不整合・各 file/report/総量 cap の全検査前拒否を確認した。入力 PNG はレビュー内で明示的に作った synthetic fixture であり、原画面や実測画像として使用していない。既存の孤立 Git fixture を再利用し、product build/actual browser/CI/remote 操作は 0。source-route 関数は独立 16/16 検証時から byte 不変で、最終 route helper syntax も成功。成果は `route-export-checks.mjs` と `route-export-results.json`。

追加 route 診断で閉鎖した具体的な指摘:

1. 現行 `DialogueUI._tap()` は typing=true で本文を render してから false にするため、caret の「▌」が残る。最初の診断はその直後の textContent を期待本文と比べるので失敗する。親は `_tap` 呼出しを除去し、実 update/render が自然に typing=false になるまで最大 90 秒待つ方法へ変更した。live DOM、source、bundle は編集しない。固定 UI の実 method body に対する最小 CPU fixture 3/3 でも、旧 tap 経路の caret 残存と自然完了経路の除去を確認した。これは実 browser/DOM 測定ではない。
2. 最初の `newContext` は width/height を options 直下へ渡していた。必要な `viewport: { width, height }` 形式に修正し、page.viewportSize、innerWidth/innerHeight、devicePixelRatio、maxTouchPoints の readback と 667×375/DPR1/touch の一致検査を追加した。API 形式は [Playwright 公式 newContext ドキュメント](https://playwright.dev/docs/api/class-browser#browser-new-context-option-viewport) でも確認した。実寸法の取得成功はまだ測定していない。
3. browserExecuted が prepared report 検証より先に true になっていた。最終版は browserRequested を CLI 要求、browserAttempted を launch 直前、browserExecuted を launch 成功後に記録し、preflight/import 失敗を起動成功と記録しない。

最終 route helper の syntax は成功。source-only 関数を独立実行し、47 input pins と 8 nodes×2 languages の **16/16 経路が成功**した。英語 text、merged Japanese override、t/localiseNode の同一経路と固定 text SHA、本文以外の node fields 不変を検査している。browser 分岐は静的に確認し、成功した preparation report、HEAD/run provenance、baseline514f、candidate bundle/dist/root、実応答 runtime byte の hash、実 bundled runner の node ID/英語 source、localized UI full/DOM text、可視性、実 viewport と原 screenshot SHA を検査する構成である。8 node を直接選ぶ有限診断であり、通常の gameplay 到達、自然な進行経路、可読性・画面品質、Mobile Safari、ブラインド比較の証拠にはしない。

正規固定 fetch で `.kit/lib/browser/serve.mjs` も読み、blob `8351fd1d3b50c9f1f6cc21eb9d8093d5bdcae627` を記録した。site.origin が指定 base path を含むため /narrative-route 配下の URL 接続は整合する。goto と runtime response 待機は Promise.all で一緒に待ち、応答待ちの未処理 reject を避けている。最終 workflow は canonical C35 の全 byte を引き続き保持し、既存 20 jobs は不変。追加は専用 marker の 1 job だけで、準備・完全 byte 輸出の後に source-only と限定 browser 診断、always artifact 保存を行う。required F3/Safari 等の代替にはしない。

追加成果は `route-review-summary.json`、`independent-route-results.json`、`caret-regression-results.json` と final candidate snapshots に記録。レビュー担当の actual browser executions / product builds / CI runs / remote mutations はすべて 0。通常プレイ・品質判断・比較数の変更 0。最終候補で追加の実装修正要求はない。

対象は `bachikoljunior-blip/survival`、制作ブランチ `claude/repo-instructions-constraints-r0070m`、固定 SHA `d2c463b54d4ea12abc0a9444627db810440a59a7`。正規 `github_fetch_file` で AGENTS.md → CLAUDE.md → AI_DEVELOPMENT/SESSION_STATE.yaml を順に読み、`ULTRA-CHILDREN-20260914-v3` を受理した。latest head の独自取得や既知の拒否 URL の再試行はしていない。

| 検査対象 | 結果 |
|---|---|
| 元入力 | Git の tracked `src/public/build/package/lock` 集合が正確に 47 ファイルであることと、各 SHA256 を書換前に検査。候補適用後も全入力を再検査する。47 canonical inputs の個別照合は親担当の並行作業であり、ここでは重複して実施していない。 |
| 依存 | workflow が `npm ci` を実行し、helper は固定 package/lock hash と実インストールされた esbuild 0.25.0 / three 0.180.0 を要求する。バージョン文字列だけで依存全 byte を証明したとは扱わない。lock に沿った新規インストール、元 bundle 再現との組合せで検査する。 |
| 元 build | 元 root bundle `514f671fa64b75dda7f835a430245e9b168f9aca38fbce0b8184b12938679a55` を要求。固定 build ID 1.0.0 で再 build し、同 SHA256 と既存 exporter による全 root/dist byte 一致を要求してから候補を書く。 |
| 候補と変更範囲 | 全 3 候補 hash を最初の source write より前に確認。候補適用後は 3 source と bundle の正確な 4 tracked files だけが変わり、static 5 files は元 byte のままであることを要求。既存音声 92ee と他の全 44 build inputs を保持する。 |
| 検証順序 | 元 build、元 root check、3 source syntax check、候補 build、root export、root check、content validate の 7 command stages。成功時だけ completed status と候補 dist/root bundle 一致を記録する。 |
| 輸出 | 9 prepared files と report の 10 ファイル。集合・flat output path・サイズ・SHA256・Git blob hash と各 4 MiB 上限を全件確認後に最初の record を出す。空 .nojekyll、3000 byte 境界、連続 offset、meta/end を保持する。 |
| 失敗 | try 内の失敗は failed report を finally で保存し、完了輸出を拒否する。CI の always artifact step は失敗資料を保持する。fresh disposable checkout 前提であり、過去の completed report を使い回す運用を許可するものではない。 |

固定 C35 の workflow は正規 fetch の blob `e64a3c638c30fb2a098fe24f0b92fb320cc2cca2` とローカル baseline が一致した。候補はその全 byte を prefix として保持し、新規 `prepare-narrative-product` のみを追加している。既存 20 jobs、F2/F3/F5、Safari、他 marker jobs は変更 0。push・run attempt 1・専用 marker の同時条件、contents: read、checkout の persist-credentials: false、既存 Node 20/npm ci、15 分 timeout、always artifact 保存を確認した。helper/workflow の diff は実候補との差分と完全一致した。

shell injection 経路は認められない。commit message は Actions の if 式内の contains にだけ使われ、run shell に埋め込まれない。helper の subprocess は固定実行ファイルと argv 配列を用い、shell を起動しない。3 source syntax check の eval コードも定数で、source path は argv として渡る。新 job に commit/push/merge/公開/API write/automation 操作はない。

独立 CPU 検証 **17/17 成功**。3 候補の正確な byte 受理、各 original/candidate drift 拒否、候補集合欠落・追加の拒否、Git blob NUL、10 ファイルの完全復元、最後の file 破損・出力 path traversal・集合順変更・failed status・file/report 容量超過の最初の emit 前拒否、および孤立 Git fixture の入力集合不一致による build command 0 での failed report 保持を検査した。helper syntax check も成功。テストの最初の起動はレビュー用 import 相対パスの誤りで評価前に停止し、レビュー script のみ修正後に全件成功した。product build や CI は実行していない。

採用後の具体的な取扱いは次の 3 点。

1. 親が発見した旧準備 source/index.html の public-template 誤 copy は修復してから local baseline として使う。これはこの helper の欠陥ではなく準備入力の不一致であり、既存 baseline root check が拒否する。正規 root byte を使用し、helper 条件は緩めない。
2. 受取側は実際の run commit と全 10 ファイルの meta/chunk/end、連続 offset、byte 数、SHA256/Git blob、report の整合を独立に確認する。さらに 3 source を凍結 pin、元 bundle を 514f、入力 manifest と依存・baselineReproduced・全 7 exit 0・変更集合・root/dist と照合する。exporter は成功 report の自己記載 hash と sourceCommit を読み出す transport であり、report 自体を別の署名付き証明に変える機能ではない。`sourceBaseline` は基準の記録で、独立の ancestry check ではない。
3. build 後の製品採用前に、正規 checkout の exporter/validator と helper/workflow の byte をこの receipt に結び付ける。exporter/validator は 47 INPUTS の対象外だが、今回読んだ canonical blob はそれぞれ `c25a859af884b1871945e75adbf4b43261cde38d` / `5d41ac14f2e30701a81f2302285fd24a3be5df95` と一致する。今回の最小候補に追加 source 改稿や helper 変更は不要。

主な対象 SHA256: helper `79a161d8b984dea9058f737f4092684e95f0ecd6ca101954add96277a192d653`、candidate gates `9995c85929095f957eb16f08ddec670e6d1266aca22c2e00919bda5e8337723e`。各 input と検証結果の完全な hash は同ディレクトリの JSON に保存した。

新規書込みは `c36-narrative-build-ultra/helper-review/` 内だけ。root source・既存凍結成果・remote・CI・automation の変更 0。workflow 部分の独立孫は実 Ultra/fork none/model 省略で正式 spawn を試みたが `agent thread limit reached` で不受理となり、この受理済み Ultra 担当が全レビューを実施した。新規受理 child 0。sole remote writer は `/root/integration_recovery_ultra`。

本レビューは品質比較に数えない。all 19 `not measured`、valid blind 0、units completed 0、units requested `continuous` を保持。開始 `2026-09-13T20:56:49+09:00`、期限 `2026-09-20T20:56:49+09:00` は不変。
