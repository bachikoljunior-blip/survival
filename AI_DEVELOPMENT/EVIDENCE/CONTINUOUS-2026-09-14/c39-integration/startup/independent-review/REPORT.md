# C39 Safari 起動順序修復・独立レビュー

最終候補 version 2 は、限定した harness 修復として採用可能です。blocking は 0。独立に見つけた bootstrap 接続の後始末の問題は修正され、実 TCP の異常系で解消を確認しました。実 Safari で起動失敗が解消するかは未測定です。

| 項目 | 固定値 |
|---|---|
| 正本 | `bachikoljunior-blip/survival` / `claude/repo-instructions-constraints-r0070m` |
| 本人受理した head | `61e8f8c595bde13634fe709f979816011df165d0` |
| 基点 harness | 33,990 B / SHA-256 `352330412d8ac248597bedbc34a4e2ac25c8252003447806adcd6b1761250e64` |
| 基点 Git blob | `63697c804ef2cc6ab62a8d313cc44e22eb1d9b1e` |
| 最終候補 `tools/test-ios-safari.mjs` | 35,835 B / SHA-256 `12490ace8e7a7344dc7e2bf5aa316b499b68e6ca4f222bbcb03b2eb9c07eceae` |
| 最終候補 Git blob | `5064084376f0743d2f082ae3656406fe408b1b51` |

正規 App の latest → AGENTS → CLAUDE/v3 → SESSION を本人受理しました。唯一の remote writer は `/root/integration_recovery_ultra`。本担当の remote 変更、CI 起動、retry、automation、追加評価・比較はいずれも 0。編集は本レビュー領域だけです。

## 原失敗から分かること

PR Safari job `104112449885` と standalone job `104112422235` は、ともに WDA の session 作成後、WebInspector のアプリ一覧が空のまま 5,000 ms の待機を終え、Appium の session 作成に失敗しています。standalone 原ログには Safari の冷起動、WDA の応答成功、WebInspector socket の接続、空一覧の順序が残っています。製品 URL への通常の navigation、ゲーム ready 判定、録音へ到達した証拠はありません。

原 Appium 等 10 ファイルは、回収担当の正規 transport receipt に記載された各 byte 数と SHA-256 に独立一致しました。原ログの再取得はしていません。standalone run は `34884725698`、PR run は `34884733596`、どちらも attempt 1。PR 実 checkout の merge commit と run metadata の source head は別物です。原 PR provenance の `runCommit` は `e357adca8fd0007927d8ac9025f0ccc777ef9ea8`、当時の製品 bundle は `1094c1d…` であり、これを新しい `8c5624…` の Safari 結果とは扱いません。

この証拠だけで、空一覧の根本原因や、bootstrap により確実に回復することまでは断定できません。WDA build 時間の長さと、この session 作成失敗の直接の境界も区別します。

## 公式実装と候補の関係

固定版 XCUITest 12.1.3 は WDA 起動後に WebView を選択します。`initialDeeplinkUrl` はその前の WDA session 作成で `initialUrl` に渡されます。候補はこの順序を利用し、同じ localhost origin の JavaScript を含まない HTML を Safari 起動時に読み込みます。[driver.ts](https://github.com/appium/appium-xcuitest-driver/blob/v12.1.3/lib/driver.ts)、[WDA startup.ts](https://github.com/appium/appium-xcuitest-driver/blob/v12.1.3/lib/commands/wda/startup.ts)

`noReset:true` の既定では `forceAppLaunch` が false になります。候補の local-only `forceAppLaunch:true` はこの既定を上書きします。WDA 16.1.0 では、冷起動と既に起動中の両方を URL 付き launch 分岐へ通し、後者は Safari プロセスを終了して deeplink で起動します。`noReset` 自体とデータ消去方針は維持されます。既に前面の Safari が URL を受け取らず残る分岐を避ける、という設計は公式実装に整合します。[FBSessionCommands.m](https://github.com/appium/WebDriverAgent/blob/v16.1.0/WebDriverAgentLib/Commands/FBSessionCommands.m)

この capability は iOS 16.4 以上が前提です。原 simulator-selection の対象は iOS 18.5 で条件を満たします。[固定版 capability 文書](https://github.com/appium/appium-xcuitest-driver/blob/v12.1.3/docs/reference/capabilities.md)

公式 10 ファイルは、担当が正規 GitHub App で得た receipt の Git blob に全て独立一致しました。本担当による別途の primary web open は DisabledError で、再試行・迂回は 0。上記判断は正規 App 取得済みの固定版原ファイルを読んだ結果です。

## 変更範囲と独立検査

canonical C38 基点に `candidate.patch` を適用した bytes が候補に完全一致します。差分は 5 hunks、追加 30 行、削除 0 行です。bootstrap の定数、専用 HTTP route、起動 provenance、local-only capabilities、session 後の URL/marker guard に限られます。

session 後は実 URL が bootstrap の完全な URL と一致し、marker が存在することを確認してから、既存の landscape → 製品 URL → ready → storage clear → refresh → ready へ進みます。誤 origin・誤 path・marker 不在は製品 navigation 前に失敗します。外部 URL の capabilities は基点の式を実行した値と完全一致しました。

orientation 以降の全 bytes、既存 request/poll helper、入力、capture、原失敗の記録、cleanup、export は基点と一致します。session 900,000 ms、command 90,000 ms、WDA 240,000 ms、ゲーム起動既定 240,000 ms、WebInspector 5 秒・20 retries を変更しません。製品 3 sources・root `8c5624…`・IOS_AUDIO_PIN の別の 5-path 採用候補は変更していません。既存の時計 5%・4 substeps、recorder/source pin の緩和もありません。

独立検査 22 件は全て成功しました。実 candidate から抽出した HTTP/server・capability・初期化コードを使い、HTTP は実 loopback TCP、制御分岐は VM で検査しています。固定版 XCUITest の WDA capability 構築も、型注釈だけを除いた原 body を VM で実行しました。Objective-C/WDA、WebInspector、Safari は起動していません。

| 検査対象 | 結果 |
|---|---|
| 基点 blob、patch 完全再現、元処理の byte 保持 | 成功 |
| 原診断 10 files の byte/hash と失敗順序 | 成功 |
| GET の原 HTML、JS/外部 asset 不在、no-store、HEAD | 成功 |
| POST/PUT/OPTIONS の 405、異なる Host の 421 | 成功 |
| 通常 static root/asset/404 の保持 | 成功 |
| 未完 body を伴う拒否 2 経路・GET・HEAD の接続終了 | 4 件成功 |
| local/external capability、誤 origin/path/marker、既存初期化順序 | 成功 |
| 固定公式 cap 構築、冷起動/前面起動分岐と時限の source 照合 | 成功 |

## 解消した指摘と残る限界

version 1 の新 bootstrap route は、拒否応答を返しても未完 body の socket が残り、`server.close` が完了しませんでした。実 TCP で Content-Length 10,000 に本文 1 byte だけを送る POST と誤 Host GET を使い、close 開始から 250 ms 後も未完だったことを確認しました。

version 2 は新 route 内だけで `Connection: close` と response finish 後の request 破棄を行います。通常 GET/HEAD の応答を保持し、同じ拒否 2 件と許可 GET/HEAD の未完 body 計 4 件すべてで socket 破棄と close の 250 ms 内完了を確認しました。残る修正要求はありません。

制作担当の 37 checks / 8 HTTP scenarios の報告も最終候補 SHA と一致します。その cold/foreground は合成 WebDriver 応答による fixture 名であり、実 Safari の状態を作って得た成功結果ではありません。本担当の検査も同じ限界を明示しています。元失敗は failed のまま保存し、bootstrap 起動の修復効果、ゲーム/Safari 動作、音声、品質、通常プレイを成功へ更新しません。

全 19 項目 not measured、71 criteria、valid blind 0、units 0、continuous を保持。開始 `2026-09-13T20:56:49+09:00`、期限 `2026-09-20T20:56:49+09:00` は不変です。公開対象は `manifest.json` の allowlist だけで、authority 原応答、fixture 原物、原ログ、公式 source cache は公開 copy の対象外です。
