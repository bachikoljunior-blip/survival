# C37 diagnostic probe: finite independent review

判定: **BLOCKERなし**。以下の固定候補は、次回C38単回計測用の診断候補として受理可能。製品性能修復、Safari実測成功、CPU/GPU原因の確定を示す判定ではない。

- Candidate: `candidate/tools/frame_work_probe.mjs`、11,229 bytes、SHA256 `eabc3f8ba621e992902a63790b86f0787bb84998bd5b9fa239ab20414d661fe8`。
- Patch: 9,624 bytes、SHA256 `162b7593e79169c2af2130910313be7149be8df5eb2d298ccc88cfbba9556f09`。原sourceへのpatch適用をメモリ上で独立再構成し、候補bytesと完全一致。変更対象は上記1fileのみ。
- 正規GitHub Appから最新head `789f2199bd3791a6dc6566eecaf3c1478c99afa6` → AGENTS → CLAUDE → SESSIONを順序再受理。詳細pinsは `review.json`。

## 検証結果

| 独立実施 | 結果 |
|---|---|
| 実装者fixtureの別コピー再実行 | 62 assertions成功、結果bytesも実装者結果と一致 |
| 独立追加edge cases | 25 assertions成功 |
| patch/source/candidate同一性 | 完全一致 |
| 原C36独立REPORT/manifest | 変更なし |

検査はcanonical `Engine._frame` とfake RAF/clockを使うローカルCPU検査であり、実機観測ではない。上限4096 rows、256 slow calls、throw時の元Error object、partial-install rollback、restore、外部置換維持、inherited method復元、serializationを確認した。

renderer.world/composite/otherのobject identityによる区別は、正本Game/PostFXの呼出し構造に合致する。fixedTargetsはplayer/combat/ai/directorの役割を保つ。元helper/harness/recorder/exporterの変更はなく、既存F3・provenance・転送条件の構造を維持する。新たなF3実行成功は主張しない。

## 解釈上の限界

- phaseはnested inclusive。`renderer.render` は個別renderer labelの集計でもあり、両者を足すと二重計上になる。同期呼出しのelapsedは、CPU実行時間・GPU時間・原因処理の特定そのものではない。
- observerBookkeepingMsは選択したexclusive区間の合計。全計測負荷ではない。独立fake-clock検査では90 readsに対する注入clock費22.5msに対してbookkeeping11.5msで、この差を実際に再現した。性能補正に使わない。
- 最終追加markersは既存2読取りを再利用し、追加now読取り0。観測entry/exitは初期recorder/WeakMap処理やexit marker後の代入・returnを含まない。間隔を完全なcallback外待機または外部原因とは呼ばない。engineWallMs（rAF入力差）とrender clock sample差を分離する。
- program count変化はコンパイル所要時間を測らず、不変でもGPU/driver待機を排除できない。gl.finishやGL queryの追加なし。
- 固定登録対象はinstall時、登録変化検査はstop時のみ。途中追加後に元へ戻したactorを検出しないケースを独立再現した（complete=trueでも個別detailなし、aggregate updaterには残る）。この限界はscopeに明記されている。`separateActors`等の未細分化処理も残る。completeは全処理網羅や3clips完了を意味しない。
- 既にqueueされた元RAF callback 1回は非計測。新probeは観測を変え得るため、原C34/C36の原因へ遡及断定できない。

## 容量と再現

原C36の1853 rows・1 actor/3 systems・全13追加labels・高精度数値・slow calls256件・2markersという合成モデルを独立再計算し、6,871,190 bytes（約6.55 MiB）、8 MiBまで1,517,418 bytes余裕。同一shapeを4096 rowsへ延ばす反例では14,190,835 bytesとなる。4096上限だけでは8 MiBを保証しない。次回の実reportサイズ・計測負荷は未測定であり、capを維持して実結果で確認する。

再現は許可root `/workspace/scratch/0b7ad82bafe7` をcwdとして以下を個別実行する。

```sh
node c37-safari-phase-refinement-ultra/independent/verify-frame-work.mjs
node c37-safari-phase-refinement-ultra/independent/verify-edge-cases.mjs
python c37-safari-phase-refinement-ultra/independent/recheck-volume.py
```

実測データ・実際の製品動作変更は追加していない。guard 5%（最小0.1s）、MAX_SUBSTEPS4、48 MiB転送、120秒、8 MiB export条件を維持。19要素/71基準は全not measured、blind 0、units 0、continuous、開始2026-09-13T20:56:49+09:00、期限2026-09-20T20:56:49+09:00。編集は本independentディレクトリのみ。remote/CI/retry/automation/source/candidate変更0。
