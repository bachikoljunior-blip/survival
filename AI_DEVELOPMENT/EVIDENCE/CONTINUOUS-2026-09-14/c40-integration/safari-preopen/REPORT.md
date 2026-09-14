C39 の一次 Safari 起動失敗に対し、同じ所有serverの無JS bootstrapを Simulator の標準 openurl で先に開く、1ファイルの候補を凍結した。実 Safari 効果は未測定。新CI・remote write・workflow変更はない。

対象は dff2d683d0a9821c79d84848bf93cb45b8920494 の tools/test-ios-safari.mjs。基点35,835B / SHA12490ace8e7a7344dc7e2bf5aa316b499b68e6ca4f222bbcb03b2eb9c07eceae。候補36,771B / SHAa278b87f0fb2e15b843205b6fe211a8046f72463e2f29956bfbf867f5900adee。製品root8c5624…、IOS helper084829ec…、recorder、transfer、probe、他workflow、SESSIONは編集していない。採用時のSESSION更新は唯一writer側で行う。

原C39 source / PR / standaloneは、初回WDAが応答してinitial URLを受け取った後、WDA500「Cannot launch com.apple.mobilesafari application」。driver再試行による後続 ECONNREFUSED が要約に残った。WDA16.1.0固定sourceでは、URL open completionが成功として戻った後、app.running=falseだった場合の分岐である。Safari crashか状態反映の不一致かは原資料から分離できず、ここを断定していない。原結果は ../c39-safari-original-results-ultra/ の凍結REPORT/manifestに全bytesを保全済み。

C38の通常Safari native launchは成功したが、その後のWebInspector application listが空だった。今回の候補は、先に実在するローカルdocumentを開く処理を保持しながら、C39で失敗したWDA initialUrl付きlaunchApplicationとの結合を外す。単純にC38手順へ戻すだけの変更ではない。

手順は、既存preflight、所有loopback serverとAppium /statusを確認後、execFileの固定command xcrunへ ['simctl','openurl',UDID,bootstrapUrl] を一度だけ渡す。そのコマンドの正常完了後に、既存 noReset=true の通常Safari /sessionを作る。initialDeeplinkUrl / forceAppLaunch指定を外し、WDAの通常launch/activate経路を使う。その後の同一exactURLとmarkerの実ブラウザ検査は保持する。誤URL、欠落marker、正常終了を装った未表示を通過させない。外部URL経路はsimctlを実行しない。

[公式 node-simctl v9 openurl](https://github.com/appium/node-simctl/blob/v9.0.0/lib/subcommands/openurl.ts) は、booted SimulatorのURL schemeを対応アプリで開き、httpは内蔵browserを使う契約で、引数はUDID→URL、非ゼロ終了は失敗。公式 XCUITest12.1.3 は node-simctl ^9.0.0 に依存するが、C39ログでは実解決されたnode-simctl版は未記録である。候補はそのnpmモジュールを追加せず、既存CIのxcrun/simctlを直接使う。WDAの noReset / forceAppLaunch / initialUrl 分岐根拠は原結果の公式source receiptに固定されている。これはApple実環境の成功証明ではない。

追加1コマンドは90,000ms、maxBuffer=65536設定、SIGKILLで終了する。出力超過は失敗として扱い、復号後文字列の厳密65536-byte上限とは主張しない。独立担当のローカルNode24.19.0ではUTF-8の「界」反復でoverflow時stdout65538B、ERR_CHILD_PROCESS_STDIO_MAXBUFFER、session作成0を観測した。CI/macOSでの値は未測定。既存session900,000ms、WebDriver各command90,000ms、WDA240,000ms、既定WebInspector5秒/20設定、各game/録音deadline、時計5%guard、4substeps、容量上限は変更していない。新コマンドは起動前処理として最大90秒を要し得るが、既存sessionのtimeout設定や合否条件を拡張しない。retry/fallbackは追加しない。stdout/stderr/原error/code/signalを原reportに保持し、失敗時はsession作成前に一次理由を返す。finallyによる所有serverのcloseも維持する。

追加 [ios-safari-startup] markerは、録音の有無に関係なく原report.safariStartupをそのまま出す。意図URL、実URL/marker、verified、openurlの1回の結果を次の原joblogで直接照合できる。既存compact audio summaryの制限を無効化せず、full telemetry/mediaを出力しない。子process出力は前記maxBuffer設定で監視し、超過を失敗にする。元error理由も報告に残る。

有限検証は72checks成功。実候補harness＋localHTTP＋実子processの10シナリオ60checksで、事前openurl完了→POST sessionの順序、cold/foregroundを表す合成応答、誤URL/marker、session失敗、cleanup失敗、external、external audio拒否、openurl非ゼロ終了、出力超過を確認。xcrunはテスト用の実行ファイル、WebDriverは合成応答であり、SafariやmacOSは動かしていない。候補の抽出block＋公式openUrl bodyによる12checksは、ENOENT/timeout通知の原理由とcause、引数配列、90秒/64KiB/SIGKILL設定、外部URL分離を確認。実macOSで90秒待ち切る試験はしていない。orientation以降から最終状態記録までの製品/時計/audio/release/lifecycle/cleanupコード、所有HTTP/transfer route、bootstrap検査の全bytesが基点と一致する。最終report後に前記1行のmarker出力を追加した。

初版fixtureはshebangが相対nodeになり、合成xcrun起動がENOENTとなった。fixtureのみ /usr/bin/env nodeへ訂正し、同候補の実行で正常系と失敗系を検証した。候補にはテスト用環境変数・fake executable・fixture分岐を含まない。fixtureの成功をSafari修復と数えない。

次は既存独立担当によるexact候補review後、唯一writerが通常の正規CIで検証する。必要workflow envは追加0。観測は openurl成功、WDA /session成功、exactURL/marker verified、製品8c起動、元checks/3clips/時計/更新後release/lifecycle、requiredF3を順に分ける。起動後に元時計等が失敗した場合も原失敗を保持し、別原因が修復されたとしない。

fixed開始2026-09-13T20:56:49+09:00、期限2026-09-20T20:56:49+09:00、全19 not measured、validBlind0、units0、continuous。CPU/GPU原因、実機品質、旧時計/WDA原因の全修復について主張しない。
