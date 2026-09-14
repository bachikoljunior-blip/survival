bf743056ce143f09e4c6544ef1c7df4b73b232fd の入力を基点とする r2 helper 候補は採用可、独立レビューの blocking は 0。検査済み候補を変更せず C38 の保存へ同居させる方式として、最終 pin を固定した。製品 source / root の採用、build / CI の実行をこのレビューで行ったわけではない。

正規 tree と 47 個の baseline input の Git blob / SHA256、旧 root1094 を独立照合した。INPUTS の変更は既に採用済みの 3 本文 source に限られ、他の 44 inputs は旧成功 helper と同じ。r2 の 3 候補 bytes は前回独立レビューで固定した eab459 / 3033b17 / e75125 と一致する。6 targets は対象会話・node と英日 12 本文 hash を照合し、実 CPU の merged locale route 12 件も成功した。

元 helper の全 7 command stages、tracked input set、clean checkout、固定 dependency versions、旧 baseline 再現、root export check、3 source の事前検証、全 input / 静的出力 / tracked diff / dist-root 一致の guard は、許可された pins と記述の差分以外 byte 同一。新 root は build 結果から算出する実装のままで、値を推定していない。通常 build はこの担当で実行していない。

route helper の差分は 6 targets、12 routes / screens、targets index の modulo6、r2 output directory と記述だけ。PNG IHDR width offset16 / height offset20 は不変。667×375 / DPR1 / touch readback、原 served bundle SHA、実 runner の直 node 選択、自然な typewriter 完了、DOM 本文照合、実 screenshot bytes の hash、browser lifecycle / error 取得は byte 同一。これらは新候補の実画面成功を意味しない。

元 preparation / export controls 17 件が成功した。原 byte の 10 files 往復には 0 byte の .nojekyll と chunk 境界を含む。失敗状態、path traversal、file set 変更、byte 改変、4 MiB 上限は最初の emit 前に拒否した。空の隔離 Git fixture への prepare 呼出は input-set guard で停止し、commands=[] / source 書込0 の失敗 report を保存した。製品 build commands は 0。

元 route export controls 19 件も 12 routes に必要な差分だけ加えて成功した。成功時は合成 PNG12枚＋report の13filesを原 byte のまま復元。failed prefix、browser 起動前の failed report、CPU report-only を保持した。path / 順序 / count / hash / PNG寸法・signature / head / run / attempt / source text pins / lifecycle と容量違反は emit 前に拒否した。総量 32 MiB 超過 fixture は、12枚化に合わせ各3MiB＋1byteとして検査した。合成 PNG は parser の fixture であり、実ゲーム画像や取得済み画面に数えない。

workflow 全体の差分は当該 job の r2 marker・6 nodes 表記・r2 output / artifact 名だけ。source branch の push、explicit ref、run_attempt1、read-only permissions、persist-credentials:false、npm ci、実 Chromium step、未 cancel / report 存在時の export、失敗 report 保存は保持されている。

sourceBaseline=bf743056ce143f09e4c6544ef1c7df4b73b232fd は、今回実確認した47 inputsと旧root1094の由来を表す。sourceCommit は実行 checkout の git rev-parse HEAD から別に取得し、runId / runAttempt は実環境から記録する。route export は実HEAD=GITHUB_SHAとrun / attemptを照合する。したがって、製品47inputsと旧rootが不変であるC38へhelperを同居させても、baselineの由来と実行commitを混同しない。実行時のverifyInputs、root guard、候補3pinが逸脱を拒否する。

workflow は検査した workflow-diff.patch を C38 の既存 prepare-narrative-product job へ限定適用する。候補のfull gates.ymlはbf743文脈での照合用であり、他のC38変更を含むfull workflowへ上書きしない。統合後の全workflow hashと実行headは、この候補reviewのhashと同一だとは主張しない。

最終readbackで候補6filesが36 controls時のpinと一致することを確認した。検査済みcodeの再base変更はなく、36 controlsの反復0。実CIでの旧baseline再現、新root生成、原10filesと12原画面＋reportの回収・閲覧は未実施で、その成功を先取りしない。remote / CI / retry / automation 変更0、browser0、通常build0、比較0、製品採用0。全19 not measured / valid0 / units0 / continuous、開始2026-09-13T20:56:49+09:00 / 期限2026-09-20T20:56:49+09:00を保持。
