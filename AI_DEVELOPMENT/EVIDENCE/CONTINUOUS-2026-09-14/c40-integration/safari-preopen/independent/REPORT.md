独立レビュー完了。候補の機能上の阻害は0。**同一originの無JS文書を先に開き、既存 noReset session の後に exact URL / marker を確認する1file変更として整合する。実 macOS / Safari の修復成功は未測定。**

正規 GitHub App で最新 head → AGENTS → CLAUDE v3 → SESSION を順序受理し、head `dff2d683d0a9821c79d84848bf93cb45b8920494`、tree `18bf6fb6597c2ef5d8cf96800b1761cdeea3827d` を確認した。正規取得した base と作者候補の全bytes、独立再構成した diff、作者allowlistを照合した。

| 対象 | Bytes | SHA256 |
|---|---:|---|
| base `tools/test-ios-safari.mjs` | 35835 | `12490ace8e7a7344dc7e2bf5aa316b499b68e6ca4f222bbcb03b2eb9c07eceae` |
| candidate 同path | 36771 | `a278b87f0fb2e15b843205b6fe211a8046f72463e2f29956bfbf867f5900adee` |
| candidate.patch | 3206 | `5dc8c2076d301ffa32e233733845cbf53dad0c33fc19ae63f5d8cc8885b9f990` |

変更はchild_process import、local startup手順、localのinitialDeeplinkUrl/forceAppLaunch除去、startup marker出力。serverのHost/GET/HEAD/無JS/close処理、bootstrapのexact判定、orientation以降の製品・時計・release・lifecycle・cleanupの全bytesは基点と一致する。実 audio preflight は元8c root/dist、recorder785541d3と候補自身のharness SHAを保持し、起動後までcaptureはnot started/clips0だった。

当人独立の **30検査、8ケース** が成功した。実候補harnessを独立の実子プロセスとして動かし、fake xcrunは実行ファイル、Appiumはlocal HTTP合成応答とした。成功系はbootstrap検証後のorientationで意図的に止め、製品を実行したとは数えない。

- 子processの完了と実HTTP bootstrap取得の後にだけ POST /session を受信。UDID内の空白・記号も1つの引数として渡り、shellを経由しない。
- exact URL/marker一致のみverified=true。別queryのURL・marker欠落は製品処理前に失敗し、session cleanupを実施した。
- 実子processのexit7、SIGKILL、Unicode出力overflowはsession0のまま失敗。stdout/stderr、元理由、code/signal、1attemptを保持し、所有serverも閉じた。
- external URLではopenurl0回。external＋audioは既存pin検査で拒否され、session0・startup marker0だった。
- 抽出した実前処理blockでENOENT/timeout callbackのcauseと理由を検証。設定はtimeout90000 / maxBuffer65536 / SIGKILL、既存session900000 / 通常command90000 / WDA240000を保持。実90秒timeoutの完走やmacOSでのkillは測定していない。

startup markerはJSON.stringifyした元report.safariStartupと完全一致し、初期化された各ケースで1行だけ出た。実測line bytesは正常local332、誤URL343、marker欠落334、exit7=446、SIGKILL=383、Unicode overflow65847、external85。これらはfixture実測であり、あらゆる失敗内容の最大line長の証明ではない。既存compact audio reportと原report保存を変更せず、full telemetry/mediaを新markerへ追加しない。

精度補足：ローカル Node v24.19.0 のexecFileは、maxBuffer65536設定のUnicode overflow時に復号後stdoutが **65538 UTF-8 bytes** となった。ERR_CHILD_PROCESS_STDIO_MAXBUFFERで失敗し、sessionへ進まない。したがって「64KiB」はmaxBuffer設定として記す。復号後文字列の厳密65536B保証とはしない。作者へ連絡し、作者はcodeを変えずREPORTのこの表現を訂正した。機能上の阻害とは判定しない。

C39原Appiumのsource7105→7107行、standalone7750/7779/7781行を実読。WDA readyの後、initialUrl/forceAppLaunchが渡り、Safari起動が500になった。その後の再試行と接続拒否は後続症状。固定WDA16.1.0の実装は、URL openがエラーなく戻った後のapp.running=falseでこの一次エラーを返す。これはsourceに基づく推論であり、Safari crashと状態反映の遅れを区別しない。[WDA session source](https://github.com/appium/WebDriverAgent/blob/v16.1.0/WebDriverAgentLib/Commands/FBSessionCommands.m)

C38 PR/standaloneの通常native launch成功後のWebInspector空一覧とは段階が異なる。C38 sourceは別に録画まで到達したので、全C38を起動失敗へまとめない。今回の新手順は文書を先に用意し、C39で失敗したWDA URL付きlaunchとの結合を外す。OS側に別の失敗があれば、既存sessionとexact gateがそのまま拒否する。

原logにAppium3.6.0 / XCUITest12.1.3、実WDA応答に16.1.0を確認。固定版8 source blobsを独立SHA1で照合した。XCUITest12.1.3はnoReset時に未指定forceAppLaunchをfalseへ設定し、初期Safari URLの後書きも省く。WDAはcoldで通常launch、backgroundでactivate、foregroundでは既存appを保持する分岐となる。[XCUITest startup](https://github.com/appium/appium-xcuitest-driver/blob/v12.1.3/lib/commands/wda/startup.ts)、[initial URL predicate](https://github.com/appium/appium-xcuitest-driver/blob/v12.1.3/lib/commands/helpers/session.ts)

公式node-simctl v9のopenUrlはbooted SimulatorでUDID→URLを渡す契約。XCUITestの依存は^9.0.0で、実解決版は原logにない。候補はnpm依存を足さず、既存xcrun/simctlを直接使う。URLが実際にSafariで保持されるかはmacOS側の次の実観測に残る。[openUrl source](https://github.com/appium/node-simctl/blob/v9.0.0/lib/subcommands/openurl.ts)

候補を通常CIで検証する次段階へ進めることを推奨する。確認順はopenurlの実成功→WDA session→exact URL/marker→製品8c→元checks/3clips/時計/更新後release/lifecycle/F3。旧C38/C39 failure、時計失敗や844欠落を修復済みとしない。

公開は本manifestの明示allowlistのみ。公式source cache、fixture、原巨大log、製品bundle複製を公開候補へ混ぜない。編集は本独立scopeだけ、候補・旧凍結原分析・remote・CI/rerun・automation・新agent・Library変更0。全19 not measured /71基準 /10参照 /valid0 /units0 /continuous、開始2026-09-13T20:56:49+09:00、期限2026-09-20T20:56:49+09:00を保持する。
