C39 の source・PR・standalone Safari は全て失敗した。新 cap は Appium / WDA 側へ届いたが、一次失敗は WDA の Safari URL 付き起動での「Cannot launch com.apple.mobilesafari application」。続く driver 既定再試行の ECONNREFUSED 127.0.0.1:8100 が、harness の最終エラーとして返った。bootstrap の exact URL / marker 検証と製品実行には到達していない。成功・修復済みの主張はない。

|系統|run / attempt|Safari job|実 checkout|結果|
|---|---|---|---|---|
|source|34891306829 / 1|104134403922|dff2d683d0a9821c79d84848bf93cb45b8920494|failure|
|PR|34891314048 / 1|104134426851|6942ccc72c0a7abc8161b5b8ac303fa6377466a9|failure|
|standalone|34891306506 / 1|104134401072|dff2d683d0a9821c79d84848bf93cb45b8920494|failure|

正規 latest → AGENTS → CLAUDE → SESSION の順で受理した。正規 run metadata は3本とも source head dff2d683…、attempt 1、completed/failure。PR merge の parents は main 5456371249f5769c25d18f1686a44349e4292d6f と dff2d683…、tree は source と同じ 18bf6fb6597c2ef5d8cf96800b1761cdeea3827d。初期 in_progress metadata と完了 metadata を別の原ファイルとして保存している。

原 decoded job log は Safari 3本＋F3 execution 2本を、正規 completed 確認後に各1回だけ取得した。応答文字列の UTF-8 byte 数・SHA256 を取得側で計算し、保存後の全 bytes と一致。BOM・末尾改行・cleanup を含む。5本合計 **13,929,035 bytes**。詳細は verification-receipt.json / transport/*response-pins.json。画面出力の短縮を原ファイルの短縮と扱っていない。

startup export の meta/chunk/end から3系統×5ファイルを全量復元した。全15ファイルで3000 raw bytes以下の連続 chunk、先頭0〜原末尾の全範囲、meta/end byte/SHA、complete/stableDuringRead、復元 SHA が一致。原 appium は source 3,322,890 B / PR 3,324,141 B / standalone 3,407,973 B。全15原ファイルは startup-recovery-receipt.json に列挙。追加の artifact metadata / ZIP 読取りは行っていない。固定 C38 recovery job104134403420には触れていない。

原 Appium の因果順序は startup-analysis.json に元行番号付きで保存した。3本とも WDA testRunner / ServerURL の後に「The deeplink URL will be set to …」が出て、その後の WDA /session が500になった。sourceの一次失敗は原 appium7107、PR7125、standalone7781。standalone は7750で WDA /status ready=true の200、7779で initialUrl と forceAppLaunch=true を含む WDA /session bodyも直接記録している。その後、driver の既定再試行が xcodebuild を停止・再起動し、起動直後の /status が接続拒否となった。初期化中に繰り返された transient ECONNREFUSED と、この後続の最終エラーを一次 Safari 起動失敗と混同しない。

対象公式 WDA16.1.0 FBSessionCommands.m の launchApplication は initialUrl があると openDeepLink を呼び、その失敗なら別の「Cannot open the URL…」を返す。今回の「Cannot launch…」は、openDeepLink がエラーなしで戻った後の !app.running 分岐だけに対応する。XCUIDevice+FBHelpers / FBXCTestDaemonsProxy の固定原 source は XCTest daemon の openURL completion 結果を返す。このため「URL open completion は成功を返したが、後の app.running は false」が source に基づく推論となる。Safari crash とアプリ状態の遅れ・不一致は区別できていない。旧 C38 は通常 Safari native launch 成功後の WebInspector 空一覧であり、今回の初期 URL 起動失敗とは段階が異なる。一次エラーより浅い最終要約だけでは、この区別が失われる。

[WDA v16.1.0 session commands](https://github.com/appium/WebDriverAgent/blob/v16.1.0/WebDriverAgentLib/Commands/FBSessionCommands.m)、[device URL helper](https://github.com/appium/WebDriverAgent/blob/v16.1.0/WebDriverAgentLib/Categories/XCUIDevice%2BFBHelpers.m)、[XCTest daemon proxy](https://github.com/appium/WebDriverAgent/blob/v16.1.0/WebDriverAgentLib/Utilities/FBXCTestDaemonsProxy.m) を正規 App source / Git blobで照合した。公式 source cache は公開対象外で、URL・ref・blobのreceiptのみ公開候補とする。

source と PR は preflight provenance が保持され、root/dist **8c5624edd96ba238135e46c90e53c6221b3c3303b977bb5d4e41b752264d94f0**、helper **084829ec335d8969e21406da1e5311e7c71134c73eb4e56a29d8dc7c0f4042b6**、harness **12490ace8e7a7344dc7e2bf5aa316b499b68e6ca4f222bbcb03b2eb9c07eceae**、recorder785541d3…、transfer55150670…、probe eabc3f8b…、準備元61e8f8c…・準備report000c6226…が全て期待値と一致する。これは実行ファイルの一致であり、新製品8cの Safari 実行成功ではない。standalone は capture_audio=0で録音 provenance の出力自体がないため、録音 pinを実測したと数えない。

3本とも checks[] / clips[]、profileなし。source/PR は captureStatus=not started、capabilities/lifecycle未取得。standalone の通常 report には local-deeplink、意図URL http://127.0.0.1:49579/__ios_safari_bootstrap__.html、verified=false が直接残る。source/PR の compact summary は safariStartup を出さないが、Appium の実URLは各49673 / 50014番portに保持された。exact URL / marker のブラウザ観測、製品起動、31 core checks、3 clips、5%時計条件、更新後release、lifecycle、転送の全て未到達。元 guard、4 substeps、録音120秒などは変更しておらず、今回は合否判定まで届いていない。

source/PR の後続 F3 audio は「The complete Safari gate did not pass」で失敗。F3 execution104137999116 / 104137956489の原ログは両方 core=success / Safari=failure を報告する。standalone の required audio step は capture無効のため skipped。録音転送失敗や時計失敗が新たに起きたとはしない。

次の候補は、同じ所有serverの無JS bootstrapを通常の Simulator URL open経路で先に開き、WDAの初期URL付きcold launchとの結合を避けた上で、同じ exact URL / marker gateを維持する限定harness手順変更。これは別隔離で検証する候補であり、この原結果に修復済みとして含めない。新CI・rerun・remote write・新子・automation変更は0。

固定開始2026-09-13T20:56:49+09:00、期限2026-09-20T20:56:49+09:00、全19 not measured、valid blind0、units0、continuousを保持。実機品質・CPU専有・GPU原因・旧時計/WDA原因の全修復を示す結果ではない。
