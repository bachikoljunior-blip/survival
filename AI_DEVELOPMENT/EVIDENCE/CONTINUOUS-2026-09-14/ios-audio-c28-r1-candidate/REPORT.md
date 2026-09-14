# iOS Safari 原音取得候補

基点 `67a458d7af2af5efbe8a0ef73c6a2e15bb17f38c` の正規GitHub接続fetchに基づく、3ファイルの候補です。remote書込み・CI・ブラウザ・Simulator・新serverは実行していません。全19要素・71基準、全`not measured`、continuous、開始`2026-09-13T20:56:49+09:00`／期限`2026-09-20T20:56:49+09:00`を保持しています。E12判定は変更しません。

引渡し時に最新 `a6d420f40995d33fb12c54b2338aee8f6211768a/CLAUDE.md` の `ULTRA-ALL-20260914-v2` を正式fetchで受理しました。既存Ultra担当・既完レビューを保持し、判断は `/root/integration_decisions_ultra_v2`、remote機械的実行者は `/root` 一人へ集約します。受理記録は `evidence/v2-acceptance.json`。親／backendの実効強度は未確認であり、全工程の実効強度確認完了を主張しません。

## 根拠と方式

- 指定SHAの `AGENTS.md` → `CLAUDE.md` → `AI_DEVELOPMENT/SESSION_STATE.yaml` を順に取得。委任境界でproduction branchのCLAUDE／SESSIONも再取得し、同blob `442fbf12e25df10bc71f83222a6001f01234daca`／`1acfb32a297a25ff3da12f65621a9ea8f45a957d` を確認しました。
- 既存workflowにはmacos-15、Appium 3.6.0、XCUITest 12.1.3、実Simulator選択・起動、校正済みtrusted touch、`/execute/sync`、always artifact保存があります。原音helperは原compressorへの追加destinationだけを接続し、原destination・engine step cap・時計guardを保持しています。
- 新helperはこの音声helperを**完全無変更でimport**。既存Playwright型のevaluate要求を「ページ内Promise開始→同期状態poll→32,768文字ずつのJSON回収」に適応させます。既存録音のBase64を含む全データは順序・ID・offset・長さを照合して回収し、元helperがdecode後のbyte数確認・原媒体保存・SHA-256計算を行います。
- W-down要求は、既存座標変換を通る単一の実native stick gestureへ対応します。CSS (110,250) down→(110,190)まで350 ms→2150 ms保持→up。streetはこの実動作、vent-air／arcade-roomは入力なし。記録の入力説明を訂正し、trusted down/up・実距離・解放状態も保存します。engine進行は一切書き換えません。
- 能力測定は既存production AudioContextだけを読みます。AudioContext／webkitAudioContext、running／unlocked、createMediaStreamDestination、MediaStream、MediaRecorder／isTypeSupported、canvas.captureStream、Blob.arrayBuffer、3候補MIMEを記録します。実trusted tap後のproduct側resumeに最大5秒待ちます。置換context・合成unlock・getUserMedia・permission取得・test toneはありません。
- MIMEの広告とconstructor／start／dataavailable／stopの実成功を区別します。API欠如はcheck失敗と`not measured`を原reportへ残し、代用clipを作りません。constructor等の例外も取得失敗として残します。実constructor成功・live tracks・原clipは元helperの観測結果です。[W3C MediaRecorder](https://www.w3.org/TR/mediastream-recording/#dom-mediarecorder-istypesupported)
- 校正は既存標準テスト内で終わり、追加録音中には呼びません。固定XCUITest 12.1の校正は別ページへ移動し復帰する仕様です。[固定版Appium docs](https://appium.github.io/appium-xcuitest-driver/12.1/reference/execute-methods/#mobile-calibratewebtorealcoordinatestranslation)

## 差分と保持

`candidate.patch` は新 `tools/ios_audio_capture.mjs`、既存 `tools/test-ios-safari.mjs`、既存 `.github/workflows/mobile-simulator.yml` だけです。元blob／候補blob／SHA-256は `manifest.json` に記録しています。

標準harnessの全チェックが完了した後だけ、`CINDERLINE_IOS_AUDIO_CAPTURE=1`で追加録音します。通常は新helperをimportしません。workflowの標準branch、concurrency、runner、45分上限、permissions、artifact保存は保持。Pages／Floor workflows／製品source／bundleは変更しません。

opt-in時のみ重複するsimctl無音videoを止め、Appiumのlog-levelをinfoにし、raw Appium／PNGのordinary-log exportを止めます。標準のスクリーンショット・ログ・reportと追加原媒体・全telemetryは同じartifactに残ります。通常のMobile Safari検証では元どおりsimctl videoと診断logを取得します。追加録音のordinary logはcheck・能力・pin・各clipのpath/bytes/hash/MIME/track/時計要約です。

取得前にrootとDISTのbundle双方のSHA-256 `6b887bc1cf6ebc0b7fae6c146e46c05d067ad5ba51544fd218d17e8483ea338b` と、共有録音helperのGit blob `86c1d9c9a0b0eeac3d947aad3d99d25272d3eeaa` を照合します。external URLは拒否して、既存harnessがそのDISTを配信する経路に限定します。実行commit/run/attempt、helperとharnessのhashも保存します。

## 実確認

- CPU境界10/10成功。複数chunkのUnicode／escape／Base64原byte保持、非同期拒否、chunk欠落／ID変更、容量上限、未完Promiseのtimeoutと上書き拒否、external URL拒否、共有helper byte不変、提供された3組のChromium端点を元時計guardが拒否、raw media／全telemetryのログ除外。
- helper／harness構文成功。YAML parse成功。元push branch／permissions／concurrency／runner／timeout／artifact一致、dispatch default falseを確認。
- 基点コピーに`git apply --check`と実applyを行い、適用結果が候補とbyte一致。共有録音helper、Pages、Floor、AGENTS、CLAUDE、SESSIONがbyte不変。
- 独立読み取り担当 `/root/ios_audio_acquisition_ultra/ios_api_review_ultra` を `reasoning_effort=ultra`、`fork_turns=none`、model省略で受理。実効強度の独立確認は未取得。標準経路破壊・guard合格捏造に該当する重大欠陥なし。指摘されたtimeout時settings復帰は、保存した元settingsを直接cleanupでも復帰させる限定修正を追加しました。この追加の実Safari実行は未確認です。

ここでのCPUテストは実媒体・実Safariの代替測定ではありません。新規mediaは0本、実Simulator能力・録音・decode・stereo・実時計整合はすべて未測定です。p50 20 ms／50 fpsの既存Safari結果が今回の録音成功を保証するとは扱いません。

## Ultra統合担当へ提案する、一度の実CI操作

以下の採否・最終順序・結果の判断はUltra統合担当が行い、確定したremote操作を単独実行者rootへ渡してください。

1. 最新production branch headと上記base blobを再照合し、3ファイルの差分・必要なF2/F5記録・SESSION checkpointを統合してください。製品bundleはpin `6b887bc1…`のままにします。grain等の製品変更を同時採用すると意図どおりpin拒否になります。
2. commit messageへ正確なmarker **`[ios-audio-c28-r1]`** を一度付け、既存正式GitHub接続経路でproduction branchへ保存してください。今回の3ファイル変更はworkflowのpathsに含まれます。`Mobile Safari simulator`のそのSHA・run_attempt 1だけが追加音声を取得します。候補自身はdispatchを実行していません。正式UIでworkflow_dispatchを選ぶ場合の入力名は`capture_audio`（boolean true）、refは同じ確定SHAを含むproduction branchです。両方式を重複起動しないでください。
3. 対象SHAの `Mobile Safari simulator` / `ios-safari` を確認し、artifact **`iphone-se3-mobile-safari-<実commit SHA>`** を取得します。原reportは `test-results/ios-safari/report.json`、clipは `test-results/ios-safari/audio/audio-street-walk.mp4|webm`、`audio-vent-air.mp4|webm`、`audio-arcade-room.mp4|webm`。拡張子は実MIMEに従います。
4. まず`audioCapture.provenance`、`safariAudioCapabilities`、全check／failureを確認。能力欠如やconstructor失敗ならその実結果を保存して止め、成功clipを捏造しません。能力測定まで到達しなければAppium／標準チェックの実failureを保存してください。
5. 取得できた各原clipのbytes/hash一致、decode成功、audio/videoの非空、実stereo channelと非無音、動画内容を確認。その後`before.state`／`after`／`timing`と全`telemetry`を検査します。元guardはmax(0.1秒, audio時間の5%)のままです。`captureClockGuardPassed`／`telemetryComplete`を弱めません。街路のtrusted動作／実距離、実listener matrix／right／forward、敵位置、SFXログ、drop/errorとmode/paused/audio stateを確認してください。
6. guardが通ってもE12は`not measured`のままです。実stereo聴取と適切な参照の有効ブラインド比較は別途必要です。`audioCapture.status=captured`は保存byte取得を意味するだけで、global reportやguard失敗を覆しません。

## 残る技術的限界

- page-side PromiseはWebDriverのpoll timeoutでは取り消されません。cleanupはrecorder／track／専用destination／settingsを復帰させ、失敗後は次のclipへ進まず最後にsessionを削除します。未完処理の成功・完全取消を主張しません。
- 120秒のoperation deadlineはcommand間で検査し、進行中の既存WebDriver commandは最大90秒まで上回る可能性を記録します。元MediaRecorder stop待ちは15秒のままです。
- 48 Mi文字は転送結果上限です。共有helperがbrowser内で全Base64を生成しJSON化した後に検査するため、browserのピークメモリ上限ではありません。短い実録音の安定性は今回のCIで測定します。取得に失敗しても音声を再標本化・時間圧縮・速度変更しません。
- 追加録音はnative canvasと原production音声で、DOM HUD／物理speaker／物理端末性能／絶対AV latencyの測定ではありません。

CPU再現: この作業directoryで `node verify-cpu.mjs`、`python3 prepare-handoff.py`。ブラウザやネットワークは起動しません。
