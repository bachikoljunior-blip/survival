# C37 fixed startup recovery — independent review

**阻害事項0。対象3ファイルの診断・原記録回収用採用を推奨。** 原ZIP回収やWDA起動修復の成功を意味しない。候補直接編集、remote変更、CI起動、automation変更、製品変更はすべて0。新E9 packetは凍結状態を保持した。

正規GitHub Appで最新head → AGENTS → CLAUDE → SESSIONを再受理。head `789f2199bd3791a6dc6566eecaf3c1478c99afa6`、CLAUDE v3、全19 not measured / 71基準 / 10参照 / valid blind0 / units0 / continuousを保持。開始 `2026-09-13T20:56:49+09:00`、期限 `2026-09-20T20:56:49+09:00` 不変。

| 対象 | bytes | SHA-256 |
|---|---:|---|
| tools/recover-ios-startup-c36.py | 6774 | ca2b650031d6a5583cf124e1df9ec4af936f8677557ae02174fa37fc121527ee |
| .github/workflows/gates.yml | 30780 | 0ca44de7a8b28d208c933370b9348608955e1d21adb3794b5ab6b91e2288dd01 |
| .github/workflows/mobile-simulator.yml | 9827 | c55ddbebdf1a4f70122048cf2a03ad0602506341426ac6340fcb1f5603ff9b1f |

## 原証拠

C36 PR Safari job104080745531 / run34875256619の保存済み原logを実読取。line498のreport summaryはfailed、checks=[]、clips=[]、失敗1件でWebDriver POST /sessionがWDAの127.0.0.1:8100へのECONNREFUSEDにより失敗。F3もfailed。ゲーム・録音前の失敗と判断できる範囲であり、WDA内部の根本原因は未解明。別のsource Safariへ同一原因を転記していない。

原upload logは9ファイル、artifact10360954160、97944 bytes、ZIP SHA `b40c9691451187b79db2d9263f19f52756abacb2e23f88e5d285b691d50b7113` を記録。統括が以前成功した正規run-artifacts GETから保存したparsed metadata objectを、独立に解析して候補のid/name/size/digest/expired=falseとworkflow_runのrun/head/branch/両repository IDへ照合した。source head789fとPR merge checkout d175f81は区別されている。metadataはZIP内容ではない。

本担当の単体artifact endpointへのGitHub App GETは400「endpoint not allowed」。原拒否応答を保存し、同endpointの再試行や別ローカルURL経路、資格情報取得はしていない。既存成功済みmetadata receiptと原CIlogで確認を進めた。

## 境界と失敗保持

固定metadataを先に検証し、その後に固定ZIPのsizeとdigestを照合する。32 entries/圧縮2MiB/展開16MiBの上限、重複名・絶対path・親path・backslash・symlinkの拒否、選択7textの個別上限とstrict UTF-8、選択entryのCRCを確認。原reportのpre-check/session失敗・mediaなし・F3failedを確認してから、固定名で保存/exportする。ZIP内コードを実行せず、一般extractもしない。不整合時は例外で失敗し、検証前の原text exportはない。

Floorはsource branchのpush、attempt1、明示markerに限る独立1jobを追加するだけ。既存の全job、top-level trigger、F2/F3/F5、準備・音声・処理計測の条件は構造一致。recovery jobの権限はcontents/actionsのread、checkoutのcredential永続化なし。失敗をcontinue-on-errorで隠さない。

workflow内の2つの `gh api` は引数なしの固定GET。通常のGETであることは[GitHub CLI公式manual](https://cli.github.com/manual/gh_api)に一致し、ZIP endpointはActions read権限で取得する公式download endpoint（302 redirect）に一致する。[GitHub REST公式artifact仕様](https://docs.github.com/en/rest/actions/artifacts#download-an-artifact)

既存CI内のgithub.tokenを2つのGET stepのGH_TOKENへ渡す範囲に限る。ローカルtoken探索・資格情報取得はない。実ダウンロード時のredirectとraw ZIP byte一致はまだ実行していないため、CI上の固定size/digest検証で確定する。

Mobileの既存startup export本文は保持され、新判定を先頭に追加。audio=1ではfailed、checks空配列、POST /session失敗文字列の三条件を満たす場合だけ出力する。現在のharnessではこのPOSTはセッション生成箇所であり、後続execute/syncとは区別される。通常のaudio成功・後続失敗・report欠落/壊れは出力0、non-audioは従来どおり。session IDが戻らない別形式の失敗やAppium起動前の失敗は今回の対象外であり、この変更だけで全起動失敗を収集するとは主張しない。既存exportのcomplete/stableDuringRead/途中省略表示と、原失敗stepの結論を保持する。

## 検証と未確認範囲

独立の合成49検査に成功。固定PINを変更せず、テスト関数の明示pin引数だけに合成ZIP自身の識別値を渡した。metadata/run不一致、期限切れ、size/digest破損、CRC破損、重複・traversal・symlink、entry数/個別展開/全展開上限、7file欠落、UTF-8不正、report/F3/media矛盾、3000 raw-byte chunk復元、workflow構造保持を検査。実workflow内Node本文を実行した11条件fixtureも成功。合成ファイルは原artifactとして保存・表示していない。

まだ原ZIPをダウンロードしていない。原logは9総ファイルを示すだけで、選択7ファイルの正確なroot entry名と全JSON shapeは未確認。既存workflow/harnessから想定は支持されるが、名前の違い、欠落、上限超過、shape差なら候補は回収を失敗させる。原textの再生成、ファイルを探して曖昧に対応付けるfallback、固定digestを外す対応は行わない。実回収が成功して初めて原7textの内容/SHA/export復元を検証できる。

次操作は唯一writerによる対象3ファイルの通常保存とmarker初回の正規CI回収。成功時は原ZIP digest・7textのSHA・meta/chunk/end完全復元を確認し、WDA原logの実原因に応じて修正を判断する。合成成功を原記録回収・Safari起動成功・品質改善の証拠には数えない。
