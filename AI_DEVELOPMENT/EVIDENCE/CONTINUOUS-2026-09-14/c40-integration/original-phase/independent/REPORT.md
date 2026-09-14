# C39 recovery of original C38: independent arithmetic

独立検証完了。2gzipの復元同一性、原3clipの時計/telemetry、保存4096行のclock/phase恒等、profile uploadのpayload SHAが一致した。**streetの全4025 framesを保存行で説明でき、3.816秒の時計差はclamp・4steps後の破棄・境界差で一致する。元の診断はfailed/53 of 54/844 dropped/complete=falseのまま。**

原C38はrun34884725972 attempt1/head61e8f8c595bde13634fe709f979816011df165d0、bundle1094。回収はC39 run34891306829 attempt1/head dff2d683d0a9821c79d84848bf93cb45b8920494、job104134403420。回収成功を新しい製品の性能成功にしない。

## 原物の同一性

| 原物 | Bytes | SHA256 |
|---|---:|---|
| recovery job log | 824,606 | 6cb56ab8a51b28f6720db3e7e258264261a1b02e77cda859a929dfc3805550e1 |
| original/report.json | 16,237,592 | 9fe62379c2c35a01cb4b83af265b8ab67024d58b828a2da49bb586a68f6d092e |
| original/appium.log | 3,654,815 | bf39c21cbc8fef21b99ffe2130bd41575730cd193bd53c03c5eb6bac4ae11261 |

当人が既存原logから2meta/195chunks/2endを独立decode。2系統の共通manifest、offset/sequence/length、gzip SHA、再展開raw SHA/CRC、保存原bytesの完全一致を確認した。gzipはreport477,153B+appium102,525B=579,678B。固定artifact10364986195/ZIP25,105,480B/digest661474…と回収helper efbf6600…の同一性も一致。archive自体の独立再取得はしていない。

full reportから元C38 log-summaryを再構成して全object一致。4toolsの実SHA、recorder Git blob、profile/report provenanceを提供sourceへ照合した。原reportが実際に8MiBを超えていたことを今回の16,237,592Bから確定できる。gzip回収は原JSONの置換・正規化ではない。

## 時計と被覆

| Clip | Wall秒 | engine/audio | audio−engine秒 | 5%許容秒 | 保存active rows / clip frames |
|---|---:|---:|---:|---:|---|
| street | 92.010 | 0.958468772 | 3.816000000 | 4.594133333 | 4025 / 4025 |
| cut-gas-air | 9.159 | 0.985884750 | 0.129333333 | 0.458133333 | 58 / 466 |
| arcade | 7.328 | 0.998453421 | 0.011333333 | 0.366400000 | 0 / 428 |

before.state/afterから期間・比・guardを再計算。全clipのclockFramesは有限・単調・連続frame、posesは有限、telemetry dropped/errorsは0で原判定に一致。3clipは取得guardを通過している。

保存行はstreet active4025+inactive13、gas active58。gasの後408framesとarcade428frames、合計836clip framesは詳細profileなし。844dropとの差8は未分類として残す。元の欠落行を復元したとは扱わない。

streetに限り、端点frameと保存全active行が一致し、次の恒等を実確認した。

`audio−engine = 1.468 clamp + 2.425 discarded backlog + 0.007333333 accumulator change − 0.084333333 endpoint/input difference = 3.816 seconds`

raw engine入力91.967秒、実engine進行88.066666667秒。4steps到達は65行で、原engineは残りの端数も0へ破棄する。全4096保存rowはrunning/play/low/unpaused/no context loss/unit timescale/no throw。各rowのdt上限0.25、steps<=4、updater呼出し数、accumulatorの恒等を確認。gas58行の局所予算は保存したが、gas/arcade全clipのclamp・discard内訳は計算できない。

## 処理別観測が支持する範囲

最大row3675/fromFrame6371はcallback sample span849ms、そのうちrenderer.world **単一call847ms**、composite0ms。同じrowのprogram countは43→44で、保存全行中唯一の変化。次row3676は前marker span849+inter-marker gap456=raw入力1305msとなり、clamp1055ms+backlog破棄184msへつながる。同期world callに長いelapsedが集中し、program増加を伴ったことは支持する。コンパイル時間、GPU時間、CPU占有、preemptionを分離した測定ではない。

別row2492/fromFrame5188はcallback201ms、updater148ms/2steps、fixed.actor:1累計129ms/2calls（個別slow call最大125ms）、camera46ms。actor:1のroleは原fixedTargetsでnullのため、特定役割を創作しない。最大inter-marker gap550msはrow2489の前。composite最大6ms、audio.update最大6ms。保存slowCalls58件は各row/phase/call/offsetへ整合し、slowCallsDropped0。

phaseはnested inclusiveであり、renderer.renderはworld/compositeの集計と重複する。各行のこの恒等と固定処理内訳を確認した。observerBookkeepingは全保存行438ms（street429ms）、最大43ms、probeClockReads630,672（street618,934）。各rowのread数は6+4×実wrap呼出し数と一致した。bookkeepingは部分観測でpreemptionも含み、全probe費用の推定や時計補正には使えない。markers前後にも未計測処理が残るので、gapを純粋な外部待機や特定原因とは呼ばない。細かい0ms値も処理費ゼロの証明ではない。

## 転送と92秒録音の境界

4 host upload receiptsはreceived、chunkBytes131072/最大50,331,648 chars/120秒を保持。id8/12/16の受信elapsedは36,883/3,817/815ms、profile id1は1923ms。profileから後付けprovenanceだけを除いてNode JSON.stringifyすると8,030,267 chars/bytes、SHA `44b170955d63a590d7fac1f4752cfd0458be50208b7fe4b53e103bd6d6bbc99b`となり、id1の62chunks/bytes/chars/hashに完全一致した。mediaを含む3upload payloadの原JSON/clip本体は未取得で、そのSHAを独立再構成したとは言わない。receipt elapsedは受信区間であり、録音期間や操作全体ではない。

Appium原log7991→7992行のargs[7,0]は、ready済み小JSONのslice読取。HTTP200、ログelapsed59,329ms、timestamp差60,377ms、response size field618を確認した。移動操作7999→8008はその後（logged4097ms/timestamp差4098ms）で、stop script8020より前。録音生成script7987と停止script8020の原bodyは途中省略されている。対応するsourceのawait順とこの境界は、92秒の録音を描画停止だけに帰属できないことを支持する。WebDriver内部の約60秒待ちの根本原因は本検査では未分離。stop後のid8 upload受信36,883msを録音内の原因へ混ぜない。

## 再現と固定条件

許可root `/workspace/scratch/0b7ad82bafe7` で以下を個別実行し、すべて成功した。

```sh
python c39-c38-original-phase-result-ultra/independent/verify_identity.py
python c39-c38-original-phase-result-ultra/independent/analyze_original.py
node c39-c38-original-phase-result-ultra/independent/verify_upload.mjs
python c39-c38-original-phase-result-ultra/independent/verify_appium_boundary.py
```

最新dff2のhead→AGENTS→CLAUDE→SESSIONを正規Appで当人が順序受理。編集は本independentのみ。新CI/remote/rerun/newspawn/job_logs取得/媒体追加取得0。全19not measured/71基準/10参照/valid0/units0/continuous、開始2026-09-13T20:56:49+09:00・期限2026-09-20T20:56:49+09:00固定。既存8MiB export・4096rows・時計5%・4stepsを変更しない。元C34/C36/C37の原因修復へ遡及適用せず、今回のC38観測範囲を保つ。
