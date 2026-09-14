# C37 original Safari results: finite independent review

独立検証完了。原ログの内容・時計算術・3tool pinsに不一致なし。**sourceは成功、PRは時計guard失敗のまま**。製品の時間損失修復完了とは判定しない。

| 対象 | Floor run | Safari job | F3 execution | 結果 |
|---|---|---|---|---|
| source | 34879275702 | 104094199700 | 104097805106 | 53/53 checks成功、3clips、lifecycle checked |
| PR | 34879453199 | 104094807794 | 104098680720 | 44/47 checks成功、3clips、lifecycle not run |

F3 coreは両方success。execution原ログ最終結果もsource Safari=success、PR Safari=failureと一致。PRは2つの時計guard失敗に加え、後続lifecycle前提check失敗と例外を記録（failed checks 3、failure entries 4）。起動失敗や第三録音転送timeoutが今回の失敗段階ではない。

## 時計の独立再計算

既存summaryの3期間から比・差・`max(0.1, audioSeconds × 0.05)`をCPUで再計算し、6clipsの値とguard判定が一致した。原full report/clockFramesからの再算出ではない。telemetryComplete等はログ記載の結果として扱う。

| 対象 | Clip | engine/audio | audio−engine秒 | 許容秒 | Guard |
|---|---|---:|---:|---:|---|
| source | street-walk | 0.962022133 | 0.402666667 | 0.530133333 | pass |
| source | cut-gas-air | 0.998900293 | 0.008000000 | 0.363733333 | pass |
| source | arcade-room | 0.997631195 | 0.017333333 | 0.365866667 | pass |
| pr | street-walk | 0.925452687 | 1.361333333 | 0.913066667 | fail |
| pr | cut-gas-air | 0.989438254 | 0.121333333 | 0.574400000 | pass |
| pr | arcade-room | 0.945403696 | 0.598666667 | 0.548266667 | fail |

PRの許容超過はstreet 0.448266667秒、arcade 0.050400000秒。3clips保存のログ記載と、取得条件に失敗したcaptureStatusは両立する。mediaのbytes/SHAは原ログの宣言値であり、本担当でclip本体の取得・hash・decode・聴取をしていない。

sourceの入力解除は8ms、PRは即時moveMagnitude=1から最初の実fixed更新後85msで0となり、両release判定はpassed。sourceの5 lifecycle段階は録音後のproduction menuメソッドによるprogrammatic確認で、物理端末・native操作・音質比較ではない。PRでは前提失敗により実施されていない。

## 同一性と限界

正規GitHub Appで最新head `bf743056ce143f09e4c6544ef1c7df4b73b232fd` → AGENTS → CLAUDE → SESSIONを順序受理し、3toolを当人が取得した。全保存bytesのGit blobを再構成して原blob IDに一致し、SHA256はsource/PRのprovenanceに一致する（`source-pins.json`）。source runCommitはbf743、PRログ上runCommitは`d0d71920e393a506d95e93892416a57c8b1dfa8c`。PR merge関係の外部metadata確認は親担当で、本検証の独立取得には数えない。

両ログの実bundle pinsは`1094c1d96bed6b953c1655ce65549c484b8f09e275f055bff283499cece110f7`、recorder blobは`785541d3beaed0e35e8bcf042973eabb7bdb5d6c`。helper/harness/probeの実hash一致は検証済みだが、この担当でbundleやrecorder本体を再取得したとは主張しない。

4原log計161,789 bytesについて親の受け取った全bytes/SHAと一致、最終newline・cleanup末尾を確認。Safari summaryは各1markerでJSON完全parseし、親の保存summary全objectとも一致。F3 logsはsummary marker 0。原hash・末尾・line数は`original-input-ledger.json`へ固定した。これは通常ログ全体の検証であり、ログに出ないfull reportの回収ではない。

両frameWorkはnull。未採用のC37詳細probe/markersの測定結果ではなく、renderer/world/composite/fixed処理、callback内外間隔、clamp/discard内訳、CPU/GPU原因をこのsummaryから特定できない。source単回のguard成功は元C34/C36の原因修復や安定性の証明にならず、同一bundle/tool pinsのPRがなお失敗している。第三録音が今回は保存された事実も、旧C36転送timeoutの原因修復を意味しない。C35理由消失問題やunderlying recorder errorの解明にも流用しない。

再現: 許可root `/workspace/scratch/0b7ad82bafe7` から `python c37-safari-original-results-ultra/independent/verify_results.py`。実行成功、追加Safari/CI/retry/automation/remote変更0、原clip取得0、編集はindependent内のみ。品質19要素/71基準・全not measured・blind 0・units 0・continuous・開始2026-09-13T20:56:49+09:00・期限2026-09-20T20:56:49+09:00を保持。guard 5%/最小0.1秒、4substeps、131,072 chars/50,331,648 chars/120秒の緩和なし。
