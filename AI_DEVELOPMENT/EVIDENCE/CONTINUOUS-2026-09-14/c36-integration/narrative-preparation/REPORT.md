# C36 narrative build and route preparation

採用判断: 既存CIへ渡す準備候補。製品の新runtimeはまだ生成されておらず、3ソースだけの採用は不可。C36は47 build inputsと製品root514fを維持し、準備jobだけを追加する方針を単独writerが確認済み。本担当のremote/CI/automation変更は0。

## 正本と実検証

固定C35 `d2c463b54d4ea12abc0a9444627db810440a59a7` のAGENTS → CLAUDE v3 → SESSIONを本人が正規GitHubAppで順序取得・受理した。branch URLの1回の400 INVALID_ARGUMENT（URL書式）は再試行・迂回せず、最新headは親の `main-integration-c36/authority/latest-head-receipt.json` に依存する。固定C35のrecursive treeは本人の正規取得に成功、truncated=false。

47 build inputsとroot/検証toolsを合わせた57ファイルは、canonical Git blobとsizeに完全一致する隔離baselineを用意した。旧準備のroot index.htmlはpublicテンプレート5014Bであり、正規root5023Bと不一致だったため、正規取得のrootで修復した。古いsurvival/distを現行buildとして扱っていない。

- 凍結3ファイルは元候補と独立コピーの双方へbyte照合。隔離コピーで17項目検証成功。本文だけ英日8+8fields、英語314→304語、条件・効果・分岐・選択肢・非対象byte保持。
- 現行 `tools/validate.mjs` の実検証成功: 13会話、224nodes。新しいゲーム操作、達成条件、成功した事実を追加していない。
- 実Node moduleで `t` / `localiseNode` と日本語mergeを経由する16routesの原文hash・翻訳hash・非本文field一致成功。旧C35本文を候補として渡すnegative checkは拒否に成功。
- 実baseline production buildはexit1、`ERR_MODULE_NOT_FOUND: esbuild`。完全なthree0.180.0、esbuild0.25.0、@esbuild/linux-x640.25.0は利用できず、CPU three fixtureを代用していない。したがって新candidate buildは実行せず、bundle hashはnull。
- ローカルPlaywrightは1.62.1でlockの1.56.0と異なり、設定先Chromium/WebKit/Firefoxの実行体も不存在。browser/server起動0、screen取得0。画面検証は以下の未実行CI候補である。

実行原記録は `local-execution.json`、`frozen-check/verification.json`、`candidate/test-results/narrative-route-r1/report.json`、`route-negative-check.json`。正規57ファイルのpinsは `verified-baseline-pins.json`。

## 採用対象となる凍結ソース

| repository path | Bytes | SHA256 |
| --- | ---: | --- |
| src/content/story.js | 111989 | faa5d203dd5aeb8900400a8b13959f2f5286b3400d19fdd375ffa41bc9535f44 |
| src/content/locale/ja/story.js | 29927 | 0530d41bb02ab9f72d71b5323491e560a16aff78e29c032390e41b371dac8158 |
| src/content/locale/ja/story2.js | 30756 | 179c9d8e3e2cc525fe01a8744037fb15e712da2bdc5cd536b0e80ea4ada8143f |

`product-source-candidate/` は凍結3ソースだけの提出用コピー。`candidate/` は検査用の作業コピーで、そこに見える旧514f rootは新ソースの生成物ではなく提出対象外である。現在の正式rootは1445983B、SHA256 `514f671fa64b75dda7f835a430245e9b168f9aca38fbce0b8184b12938679a55`。採用後のrootは未生成。

## C36に渡す6ファイルのCI候補

`ci-candidate/` の6ファイルのみ。既存の `prepare-narrative-product.mjs` と3つのtools/candidatesソースは元の準備候補からbyte不変。追加の `check-narrative-routes.mjs` とworkflowの任意marker jobを含む。全path/bytes/hashは `ci-candidate-pins.json`、正規C35との差は `workflow-diff.patch`。

既存workflowの全byteをprefixとして保持し、`push`・明示された制作branch ref・run_attempt1・`[prepare-narrative-product-r1]` の条件を満たす1jobだけを追加した。contents:read、checkout persist-credentials:false、固定lockのnpm ciを使う。既存F2/F3/F5・Safari等の条件や閾値を変更しない。

準備helperは47inputs集合/pins、locked dependencies、旧514fの実build再現、正規root一致を確認してから3候補を適用する。新build、root mirror、内容検査、全inputs事後pin、3source+runtime以外の変更なしを検証する。現在の47inputsが先に変われば正しく拒否する。

route helperは同じ生成bundleから8nodes×2言語を直接選択し、実DialogueRunner・locale・UIを経由して自然typewriter完了を待つ。原英語source、本文、DOM、served bundle byte/root/dist、実viewport667×375/DPR1/touch設定を照合して16原PNGを取得する候補。各nodeを新しいbrowser contextで測る。これはChromium mobile emulation上の出所既知の表示診断であり、通常プレイの履歴、Mobile Safari、可読性・美術品質の合格ではない。

独立レビューでは、初版のtapによるcaret残留とviewport指定階層の2問題を検出し修正した。browserRequested/Attempted/Executedも、要求・起動試行・実起動を区別する。最終独立レビューは未解決blocking0、準備helper17/17・経路16/16・原byte輸出19/19成功。輸出試験のPNG/Git/runは明示的な合成fixtureで、実画面ではない。結果と固定hashは `helper-review/receipt.json` と `helper-review/REPORT.md` に保存済み。

## 原bytesの回収

準備成果は既存の `node tools/prepare-narrative-product.mjs --export` で `[prepared-narrative-meta]` / `[prepared-narrative-chunk]` / `[prepared-narrative-end]` を出力する。これは3source+root/staticの9filesと原reportである。

画面は `node tools/check-narrative-routes.mjs --export` で `[narrative-route-meta]` / `[narrative-route-chunk]` / `[narrative-route-end]` を出力する。chunkのoffsetは原byte位置、1chunkは最大3000原bytesのbase64。成功したbrowser診断なら16原PNG+原reportの17files。failed診断は取得済みの順序付きprefixと失敗原reportを `diagnosticStatus:failed` / screenCount付きで保持し、録り直さない。completeは各fileのbyte完結性だけを表す。

全期待filename/順序・PNG signature/IHDR667×375・size/SHA256・各file4MiB/全体32MiB上限・実gitHEAD/GITHUB_SHA/run/attempt・16source route pinsを最初のemitより前に照合する。PNGの変換・切抜き・再圧縮はない。受取側もmeta/end一致、offset0から隙間・重複なし、base64全byte長/SHA、実runCommit、生成bundleと3source pinsを独立照合する必要がある。reportとPNGを一緒に保存してから実画像を閲覧する。artifact名は `narrative-product-build-r1-${github.sha}` と `narrative-route-r1-${github.sha}`。

## 実採用時のpins

`integration-pin-changes.json` に3sourceの新旧SHA256/Git blobを保存した。新bundleは実成功準備reportと回収原bytesの照合後にだけ確定する。

採用時は3source+生成rootを同時に保存し、`tools/ios_audio_capture.mjs` のIOS_AUDIO_PINのbundleSha256、preparedFromCommit、preparationReportSha256を当該実準備に合わせる。recorderBlob/全時計・転送guardを保持する。`f3_safari_audio.mjs` はそのpinを動的に参照するため文字列置換不要。SESSIONに新commit/build/evidenceと未完了検証を記録する。歴史的prepare/recovery helperや元514fの失敗証拠を一括置換しない。

19要素はすべてnot measured、有効blind0、units_completed0、continuous。STATE・概念・BENCHMARKS・10参照・71基準は不変。開始2026-09-13T20:56:49+09:00、期限2026-09-20T20:56:49+09:00を保持。参照作品本文や詳細あらすじの取得・製品混入なし。正式CI・実build/原画面回収・独立採用review・必須PR条件・通常merge/Pages/F6は単独writerの次作業であり、本担当が実施済みとは記録しない。
