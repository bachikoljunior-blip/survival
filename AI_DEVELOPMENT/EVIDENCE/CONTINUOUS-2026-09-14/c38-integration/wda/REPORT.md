# C36 PR WDA原失敗のC37回収・限定診断

**原9ファイルの回収・完全性検証は完了。WDA起動の根本原因は未確定、能力設定の変更候補は0。** 元のビルドは成功しており、ビルド後のWDA応答待ちが失敗した。後続のBUILD INTERRUPTEDをコンパイル失敗の原因として扱わない。

正規latest head `bf743056ce143f09e4c6544ef1c7df4b73b232fd` → AGENTS → CLAUDE v3 → SESSIONを受理。正規job_logsは回収job `104094199386` へ1回だけ実行した。同jobはsource Floor run34879275702 / attempt1 / headbf743、全step completed/success。親run全体は取得時in_progressであり、全run成功には数えない。元失敗は別のC36 PR run34875256619 / merge checkout d175f81 / source head789fである。

## 原物と検証

正規decoded logは4,650,218 bytes、SHA `85709d276a7e9e6877bdecfc1f4ee65da37ea6d153914d1d76cdc8e72a9da74d`、1320行。BOM3個を除去せず保存し、解析時だけtimestamp前のBOMを許容した。9meta/1126chunks/9endとidentity1を解析し、固定run/head/attempt/artifact、連続index/offset、3000 raw-byte単位、canonical base64、全file bytes/SHA、meta=end、集合9件を検証した。全検査後に原bytesを書き出した。総計3,355,781 bytes。

| `original/` 内ファイル | bytes | SHA-256 |
|---|---:|---|
| appium.log | 3351607 | fca54a514a8113eb243300a32eb92c221e33e34e74374ff845c604fa8067c57f |
| report.json | 1068 | 40d7ad93d1e7f97a992b707230bba82f036991d8ca8b2b47bec286815fa70fb1 |
| f3-audio-verification.json | 150 | 9eb1e2cbdec426bd2cccaa4d7bdb3283c57121cdc6227e885c05690f12b8e3c4 |
| simulator-selection.json | 314 | 2ef373631c2f92ae2ff8b89efca9dd0a29e59c9e09c1eb604f4a9101faaaba25 |
| simulator-sdk-version.txt | 5 | a63403a2472f8c14d9ac8ac94ef7e77d9e13844217cddc161cbc573aeaec8836 |
| xcode-path.txt | 48 | 9014c394d2d86817f0259dec8d76bc78677354c8767ca9b36c01fbec01ea21dd |
| xcode-version.txt | 30 | a8be4f9af0a29137fe7e59b9928056d4a0df297bb46ba40f80eaa6b0ae982f12 |
| artifact-metadata.json | 787 | 42731b751f211569bc4396492b204a32d00089e7e89f34cfb00a55ceb1282c8d |
| recovery-report.json | 1772 | 208af6dbd7a835eb11749028f83e09478d8320b72233dc5a3a785c6ab699b7a5 |

前7件は元C36 ZIPの選択member。後2件はC37回収jobが取得/生成して出力したmetadataとreceiptの原bytesであり、C36 ZIPにもともと含まれたファイルとは区別する。

固定artifact10360954160 / 97944 bytes / ZIP SHA `b40c9691451187b79db2d9263f19f52756abacb2e23f88e5d285b691d50b7113` はidentity・原metadata・回収receipt間で一致する。bf743に保存された正規helper（SHAca2b650…）とworkflow（SHA0ca44de…）もGit blobまで再取得照合した。成功した実CI stepは、固定ZIP size/digest、選択CRC/上限/path/UTF-8/report形状を検査してから出力するコードである。ZIPそのもののローカル再ダウンロード・再SHA計算はしていない。今回独立に再検証したのは、実CIが検証・出力した9ファイルのbytesと識別情報である。前回未確認だった7 root名とJSON形状は、今回の実回収で確認できた。

## 実ログの時系列

原appium.logの先頭、成功したbuild終端、待受待ち区間、失敗・終了末尾と診断行を実読し、Xcode/SDK/selection/fullreport/F3原文と照合した。詳細17時点と原行はdiagnosis.jsonに保存。

| UTC | 原行 | 観測 |
|---|---:|---|
| 17:34:45.398 | 16 | iOS Safari / XCUITest12.1.3へPOST /session |
| 17:35:16.823 | 37 | 指定UDIDのsimulatorは既にheadlessでboot済み |
| 17:35:32.311 | 40 | WDA再利用確認で8100接続拒否。その後fresh起動へ進む |
| 17:35:39.047 | 44 | 同UDIDでbuild-for-testing + test-without-building開始 |
| 17:38:19.131 | 7098 | TEST BUILD SUCCEEDED |
| 17:43:48.085 | 7425 | /statusを240000ms以内に取得できなかったとの明示的起動失敗 |
| 17:43:48–49 | 7428–7430 | Appiumがxcodebuildを停止、BUILD INTERRUPTED / SIGTERM |
| 17:43:59.617 | 7431 | driver内部の2回目起動 |
| 17:44:16.177 | 7448 | POST /session 500、最後の理由はECONNREFUSED |

最初の接続拒否はWDA未起動時の再利用確認であり、それだけで故障原因とは言えない。明示的なterminal startup failureは成功build後の/status期限切れ。その後のSIGTERMと最終HTTP500は後続症状である。

build命令から成功まで160.084秒、成功から明示timeoutまで328.954秒。240000msという内部設定を全セッションの経過時間と同一視しない。retained logではTest Suite/Test Case開始、ServerURLHere、WDA version/readinessを確認できないが、ログ欠落だけからOS processが一度も起動しなかったとまでは断定しない。fullreportはchecks0、device/layout無し、screenshots無し、失敗1件、録音無しでF3failedを保持する。

## 原因として分かった範囲

Xcode16.4/16F6、active SDK18.5、選択runtime18.5、命令先UDID、boot済みheadlessの組合せは整合。compiler fatal diagnosticの検索は0で、build成功も明示される。複数architecture destinationの警告、Swift debug環境変数警告、real-device discoveryのRemoteXPC fallbackを、根本原因へ格上げしない。

確認できる失敗境界は成功buildからXCTest/WDA実行・HTTP待受まで。Xcode test dispatch、simulator test service、WDA起動直後の停止、host scheduling/resource遅延などは仮説として残る。個別process/system trace、xcresult、host負荷計測が原保存物にないため分離できない。

実指定のdriver12.1.3は正規tagからcommit `1cb63dc24813a6cef0a81f70f51970e112f7a472` に固定してsourceを読んだ。起動とWDA proxy session作成が分かれることを確認した。[Appium driver起動実装](https://github.com/appium/appium-xcuitest-driver/blob/1cb63dc24813a6cef0a81f70f51970e112f7a472/lib/commands/wda/startup.ts) 一方、依存WDAはpackage上のversion rangeであり、この原logから実インストール版の確定はできない。未確認のtransitive実装へ原因を断定しない。

## 候補判断と継続地点

**能力・port・headless・waitForIdle・タイムアウトの変更候補は非採用。** 元の失敗に対してどれが制御可能な原因かを裏付ける記録がなく、ログ内の「timeoutを増やす」提案をそのまま修復として採用しない。9原ファイル保全と失敗段階の分離は完了した。

次の限定検証では、同一WDA sourceの実build/installを先に確認し、公式の`usePreinstalledWDA`によるsimulator起動へ切り替える方法を候補にできる。これはxcodebuild test-without-buildingの起動経路を変える方法であり、今回の根本原因の証明ではない。iOS17+での対応とsimctl経路は固定版資料/sourceにある。[固定版preinstalled WDA手順](https://github.com/appium/appium-xcuitest-driver/blob/1cb63dc24813a6cef0a81f70f51970e112f7a472/docs/guides/run-preinstalled-wda.md) 正確なbuilt .app、installed version、実install/launchと既存240秒/900秒・必須gateを保持する隔離実装・実CI確認が必要であり、未準備のcapabilityだけは今回追加しない。あるいは既存経路のXcode test-session結果とSimulator process/system診断を取得し、原因をさらに絞る。

本担当は新CI/rerun/remote/automation/製品・候補変更0。拒否済みURL・単体artifact endpointの再試行や資格情報取得0。兄弟の転送/probe候補には触れていない。回収成功を新Safari起動、元時計失敗修復、録音・品質比較成功に数えない。全19 not measured / 71基準 / 参照固定 / valid0 / units0 / continuous、開始2026-09-13T20:56:49+09:00・期限2026-09-20T20:56:49+09:00不変。
