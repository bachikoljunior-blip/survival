# C38 PR/standalone 原Safari失敗と起動順序の修復候補

PR Safariとstandaloneは、どちらも製品URLへ進む前に失敗した。WebDriverAgentによるSafari起動とnative sessionは成功し、その後Web Inspectorから接続中application一覧が返らなかった。時計・録音転送・入力解除・lifecycleの失敗ではない。原3 logsを各1回だけ取得し、同じlog内の完全なstartup exportから原Appiumと環境記録を回収した。

| 対象 | PR Floor | standalone |
| --- | --- | --- |
| run / Safari job | 34884733596 / 104112449885 | 34884725698 / 104112422235 |
| workflow head / attempt | 61e8f8c595bde13634fe709f979816011df165d0 / 1 | 同じhead / 1 |
| 実checkout | e357adca8fd0007927d8ac9025f0ccc777ef9ea8 | 61e8f8c595bde13634fe709f979816011df165d0 |
| 音声 / profile選択 | 1 / 0 | 0 / 0 |
| 初回失敗 | POST /session: connected web applicationsなし、5351ms | 同じ種類、6346ms |
| 製品検査 / 録音 | checks0、capture not started、clips0 | checks0、音声取得無効 |
| 原decoded log | 4,599,237 B | 4,756,969 B |
| 完全回収Appium | 3,320,532 B / 1107 chunks | 3,438,122 B / 1147 chunks |

正規run APIは両方completed/failure/attempt1。PR mergeの正規parentsはmain5456371249f5769c25d18f1686a44349e4292d6fとsource61e8。原checkout行、run metadata、PR取得provenanceが一致する。PRはroot/distの1094c1d96bed6b953c1655ce65549c484b8f09e275f055bff283499cece110f7、recorder blob785541d3beaed0e35e8bcf042973eabb7bdb5d6c、helper c0965004…、transfer55150670…、probe eabc3f8b…、harness35233041…を起動前に保持した。standaloneは音声無効のためこれら音声pinを原reportへ出しておらず、実測provenanceを補ったとは扱わない。

F3 execution104115712838の原2,525 Bも1回取得し、core=success/Safari=failureによる後続failureと確認した。PRの音声検証はcomplete gate failureを受けた従属失敗、standaloneの音声検証はskipである。frameWorkはPRでnull、standaloneは選択0で該当fieldを出さない。

原log計9,358,731 Bはtoolの全decoded文字列をUTF-8化して別に計算したSHA256と保存fileが一致する。BOMと末尾改行を保持した。startup exportは各fileのmeta/end・complete・stableDuringRead・全offset・base64・bytes・SHAを検証し、5 filesずつ計10 filesを復元した。原pretty report.jsonやartifact ZIPそのものを回収したとはしない。artifact upload行のID/size/digestはanalysis.jsonに保持したが、artifact metadata API/ZIP読取りは0。

standalone原Appium 8095–8157行では、WDA起動成功→Safari起動→native session HTTP200→remote debugger socket接続→connection-key送信→5000msのapplication-list待ち→空一覧→session作成HTTP500→cleanupとなる。PR7095–7109行もSafari起動/native session成功後の同じ境界で失敗する。先行するECONNREFUSEDはWDA起動途中の一時観測であり、今回の最終失敗理由と混同しない。ログの「20 retries」は設定値の表示で、20回の実反復が完了した証拠にはしない。

実versionはAppium3.6.0、XCUITest12.1.3、RemoteDebugger16.0.3、WDA16.1.0。固定版の公式sourceで、Webview選択が通常の初期URL設定より先にあり、noResetかつ初期URL未指定では後者も省かれることを確認した。この取得順序は、cold Safariへ先にWeb文書を作る保証がない。[driver](https://github.com/appium/appium-xcuitest-driver/blob/v12.1.3/lib/driver.ts)、[URL分岐](https://github.com/appium/appium-xcuitest-driver/blob/v12.1.3/lib/commands/helpers/session.ts)。

候補はtools/test-ios-safari.mjsだけを変更する。既存の127.0.0.1 serverに、外部資源・JavaScriptのないbootstrap HTMLを追加し、local modeだけinitialDeeplinkUrlへ指定する。既存Safariがforegroundでも適用するためforceAppLaunchを同時指定し、noResetによるデータ保持は継続する。公式sourceはURLをWDA sessionへ先に渡し、WDAの起動分岐がそのURLを開く。[XCUITest WDA caps](https://github.com/appium/appium-xcuitest-driver/blob/v12.1.3/lib/commands/wda/startup.ts)、[WDA launch](https://github.com/appium/WebDriverAgent/blob/v16.1.0/WebDriverAgentLib/Commands/FBSessionCommands.m)。

session成立後、同一originの正確なURLとHTMLの目印を確認してから、既存landscape→製品URL→ready→storage clear→refreshへ進む。bootstrapは正確なHostとGET/HEADだけを受け付ける。独立レビューで、未完bodyがcleanupを待たせる欠陥を発見したため、bootstrap応答に限りfinish後のrequest破棄とconnection closeを追加した。通常asset/transfer処理を変更しない。

最終候補は35,835 B、SHA256 12490ace8e7a7344dc7e2bf5aa316b499b68e6ca4f222bbcb03b2eb9c07eceae、gitblob5064084376f0743d2f082ae3656406fe408b1b51。candidate.patchを添付した。限定した追加を逆に除去すると正規harnessの全bytesに戻る。元5000ms/20 retries、各WebDriver期限、120秒転送期限、48Mi文字/128Ki単位上限、5% clock guard、4substepsを変更しない。mobile-simulator/workflow、製品src/root、recorder、STATE/CLAUDE/BENCHMARKS変更0。

当人の実harness＋HTTP serverを用いた8シナリオ・37検査は成功。cold/foreground条件のcap、通常GET/HEAD、405/421、他asset、誤URL/目印、元session error、cleanup error、外部URL、元ゲーム初期化順を確認した。WebDriver応答は合成であり、ゲームやSafariを実行した検査ではない。公式capの型宣言とURL分岐の純関数も検証したが、新capを実Appium sessionへ受理させた実測はまだない。独立担当は最終候補で22検査に成功し、未完GET/HEAD/拒否要求のsocket終了とserver.closeの250ms以内完了を確認した。

この候補は、空一覧の前に実Web文書を用意する取得手段の修復である。原画がないため空白画面を実見したとはせず、OS/host応答遅延など他の内部原因も排除していない。実Safariでの修復成功、C34/C36/C37の時計失敗修復、CPU/GPU原因、音声品質やblindの達成には数えない。次の通常CIで新capの実受理、bootstrap検証、元検査・3録音・時計/解除/lifecycleと厳密なprovenanceを確認する。

全19 not measured・71基準・有効blind0・units0・continuous、開始2026-09-13T20:56:49+09:00、期限2026-09-20T20:56:49+09:00を保持する。当人のsource log再取得、新CI/rerun、remote/automation変更、新子起動は0。唯一writerは /root/integration_recovery_ultra。
