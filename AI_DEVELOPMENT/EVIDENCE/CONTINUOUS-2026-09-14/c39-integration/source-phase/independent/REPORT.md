# C38 original summary: finite independent review

独立照合完了。原ログ・summary・4tool pins・時計算術に不一致なし。**3録音の時計guardは通過したが、診断profileは4096行で上限に達し844回欠落、full reportのexportも容量guardで拒否された。今回の目的である処理別原因の算術は実行できない。**

対象はsource Floor34884725972 attempt1、Safari104112425709、commit61e8f8c595bde13634fe709f979816011df165d0。Safari job completed failure。原54checks中53pass、唯一のfailed checkはbounded frame work。原summaryはcaptureStatus=captured、3clips、frameWork rows4096/limit4096/dropped844/recordings3/completefalse/restoredtrue/errors0。保存された診断の完全性と、wrapper復元の成功を分ける。

| Clip | Wall秒 | Frames | engine/audio | audio−engine秒 | 許容秒 | Guard |
|---|---:|---:|---:|---:|---:|---|
| street-walk | 92.010 | 4025 | 0.958468772 | 3.816000000 | 4.594133333 | pass |
| cut-gas-air | 9.159 | 466 | 0.985884750 | 0.129333333 | 0.458133333 | pass |
| arcade-room | 7.328 | 428 | 0.998453421 | 0.011333333 | 0.366400000 | pass |

CPU再計算はsummaryに記録された期間・比・差・`max(0.1, audioSeconds × 0.05)`の整合確認である。原clip endpoints、全clockFrames、trajectoryは未取得であり、telemetryComplete等は原ログの宣言として扱う。streetは3.816秒の差を残すが、91.883秒のaudio期間に対する元5%許容4.594秒内。guard通過を損失ゼロや旧C34/C36修復の証拠にしない。

入力解除は即時moveMagnitude1から最初の実fixed更新後110msで0、原check passed。録音後5段階（arcade/game-pause/title/title-settings/title-close）のstate/targetsを記録内で照合し、全段階activeRecording=false/audioState=running。これはprogrammatic menu確認であり、物理端末・聴取・品質比較ではない。

streetの4025 framesだけで4096 row上限の98.2666%に相当し、92.01秒の長さは容量圧迫と整合する。3clip frames合計4919と保存4096+drop844=4940 callback試行は別の計数。差21の意味、録音別drop配分、長時間化の原因はrowsなしでは確定できない。

## 原物・失敗境界

- 原log: 79,989 bytes、SHA256 `7708ce8065f490e8438631f6885e3535e56af97f418cf2b262bdc02d6484d054`。634行、末尾newlineとcleanupを確認。
- summary: log477行目のJSON substringと完全bytes一致、28,778 bytes、SHA256 `5cbb7d15a67d349d20c17edba62eb7114d6052cc414ef744ca06b12258f6cc12`。marker1。pretty再生成やfull reportではない。
- export meta/chunk/endはすべて0。原errorは `Original diagnostic report exceeds bounded export capacity`。原exporterはbytes<1またはbytes>8,388,608を同じerrorで拒否し、bytes実値は非表示。周辺観測は過容量と整合するが、原raw reportのサイズ/SHAを創作しない。exportはサイズ検査で止まり、exporter自身の後続provenance照合成功まで主張しない。
- Safari内のF3 audio gateは `The complete Safari gate did not pass` で失敗。Exercise/F3 audio verify/exportの3step failureがjob metadataに一致。
- artifact uploadログはID10364986195、ZIP25,105,480 bytes、digest `661474f9320966960edf4794c0fdabe4d8f456ec6166efd1dbace592cef6d372`。archiveは未取得・未hash。ZIP長を原report長に代用しない。3mediaのbytes/SHAもログ値で、clip取得・decode・聴取0。

準備時に本人が正規GitHub Appでlatest61e8→AGENTS→CLAUDE→SESSIONを順序受理。提供source7filesのhashを再確認し、helper/transfer/harness/probeの4実SHAがsummary provenanceに一致。root1094、recorder785541d3、run/head/attempt pinsも一致した。詳細はreceipt/results。

## 残る不明範囲

原rows、world/composite/fixedのphase、4steps/clamp/discard内訳、observerBookkeeping、inter-marker gap、program数、slowCalls、同一origin upload receipt/元payload JSONは未取得。これらを準備済み式で計算した結果は存在しない。3clipsのcapture完了とprofile summaryがあることから、upload receipt全件のhashや所要時間を独立検証したとは扱わない。欠けた観測を旧C36データや合成値で補わない。

再現: 許可root `/workspace/scratch/0b7ad82bafe7` で `python c38-safari-phase-result-ultra/independent/verify_summary.py`。独立実行成功。編集は本independent内のみ。job_logs取得0、remote/CI/rerun/automation/newspawn/上限緩和0。19要素/71基準/10参照、全not measured/valid0/units0/continuous、固定開始2026-09-13T20:56:49+09:00・期限2026-09-20T20:56:49+09:00を保持。
