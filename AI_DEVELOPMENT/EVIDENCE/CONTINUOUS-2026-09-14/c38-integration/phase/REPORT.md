# 次の単回 Safari 計測に向けた phase 分離候補

C36 の街では renderer 2 calls 合計 446 ms、固定 updater 4 calls 合計 182 ms、callback サンプル間隔 319 ms を観測した。製品内の具体的な処理を選んで修復する根拠はまだ足りないため、この候補は **取得する処理内訳を増やす 1 file の変更**である。Safari 性能改善・C34 旧失敗修復・C35 元録音失敗修復・C36 第三 clip 転送修復のいずれも主張しない。

基点は正規 latest head `789f2199bd3791a6dc6566eecaf3c1478c99afa6`。順に AGENTS / CLAUDE / SESSION を再取得し、本人受理済みと同一の原 bytes を確認した。原 probe SHA-256 は `2ce6e467d5f6ba45b18da2d644b3ad4463bbd036aaac9def3117056bd5ef08cf`。変更対象は `candidate/tools/frame_work_probe.mjs` だけ。製品・harness・録音 helper・workflow・exporter は編集していない。

## 何を次に区別するか

| 候補の記録 | 原 C36 で不足していた区別 | 限界 |
|---|---|---|
| `renderer.world` / `renderer.composite` / `renderer.other` の呼出し別集計 | 通常 low tier の world sceneRT と composite のどちらが長いか | renderer 内部 CPU / graphics blocking / GPU 実行を区別しない |
| `fixed.input/gas/navGasCost/playerInput/events/zone` と actor/system 別集計 | 182 ms を gas/nav/player/AI/director 等へ分ける | nested 呼出しは重複し、合算で総 CPU 時間にはできない |
| 8 ms 以上の個別 `slowCalls`、開始 offset、call 番号 | 4 fixed steps 内の一度の停止か、複数回の重い処理か | 8 ms 未満の各 call 時間は集計のみ。最大256件で超過は明示失敗 |
| `programsBefore/After` | 長い frame と renderer program 数増加が同時か | 単なる JS 配列長。compile 時間や GPU 利用率ではない |
| `observerBookkeepingMs` / `probeClockReads` | probe 自身の同期 bookkeeping が観測区間を占めていないか | 全計測負荷ではない。preemption を含み、時計読取り・prologue/return 等の一部は範囲外 |
| `observedWrapperEntryMs/ExitMs` | 元 before/after snapshot の外にある観測済み wrapper 処理 | 既存markerを再利用。rec/WeakMap前段やmarker後assign/return等を除くため、完全なcallback入口・出口ではない |

renderer のラベルは正規 C36 `PostFX.render` の scene / quadScene / matComposite のオブジェクト identity で決める。program count は `renderer.info.programs.length` を読むだけで、GL query、`gl.finish`、同期 GPU readback を追加しない。

次回は同じ recording の隣接行に限り、従来の `next.before.wallMs − previous.after.wallMs` を、`previous.exitMarker − previous.after`、`next.entryMarker − previous.exitMarker`、`next.before − next.entryMarker` の3項に分けられる。最初と最後は観測済み wrapper 部分で、中央も未観測の wrapper 前後や他処理を含む。中央を特定の外部 process や GPU 待ちと断定しない。元 clip endpoint の audio/engine 差はこの分解で補正しない。

actor と system の index は install 時の `fixedTargets` で player / actor kind / combat / ai / director に対応させる。stop 時に最終登録の変化を確認し、変化があれば complete を立てない。一度変更され、stop 前に元へ戻る登録変更までは観測しない。対象を静的に捕捉する範囲を report に明記する。

## 時計・容量・例外を維持する

候補は original 関数を同じ receiver / 引数で呼び、戻り値と例外を引き継ぐ。engine raw input / clockLast / accum / engine.time / 1/60 fixed dt / 4 substeps / clock guard を変更しない。bookkeeping 時間を時計や phase 時間から差し引かない。stop は元の property descriptor を復元し、他者が交換した関数は上書きしない。

既存4096行上限と lifecycle128上限を維持する。新しい個別 slow calls は最大256件で、超過数を保存し `detailComplete` と `complete` を false にする。転送128 Ki chars / 48 Mi chars / 120秒、raw export8 MiB / 3000 raw bytes は変更しない。候補独自 schemaVersion は2。

合成 field shape の容量試算は、原 C36 の1853行・actor1・system3・全13追加ラベル・高精度小数・slow calls256件・wrapper時刻2値という明示仮定で **6,871,190 bytes**、既存8 MiB未満だった。これは次の実 report サイズではない。actorや行が増えれば上限を超え得るため、exporter の失敗条件を維持する。元 report や原音声を合成データで置き換えていない。

独立容量再計算も同値だった。同じ合成形状を4096行へ繰り返す反証では14,190,835 bytesとなるため、4096行capだけで8 MiB以内とは保証しない。実C38の原bytesとexport完了を確認し、過容量なら取得失敗として保全する。

## 有限 CPU 検証

`verification/verify-frame-work.mjs` は正規 C36 `Engine._frame` を実行し、rAF・phase body・performance.now のみ明示 fixture に置き換える。62 assertions が成功した。world/composite/other の分離、4 calls の182 ms、program count 増加、個別 slow cap、元4steps/backlog破棄、wrapper復元、途中install失敗、原例外、登録変更、0.25 msの仮想時計読取り負荷とwrapper marker範囲を検査した。0.25 ms fixture でも raw frame 入力20 msを変更せず、observer elapsedを独立欄に残す。

この検査は新しい Safari / CPU utilization / GPU / 実機性能測定ではない。実 instrumentation cost と元 street clock guard への効果は次の受理された単回 CI で測る。独立レビューの結果と候補最終SHAは `manifest.json` を参照する。

別 Ultra 子は最終候補の62 assertionsを独立配置で再実行し、さらに25 assertionsを実行した。probeの時計読取り実カウンタ90回との一致、marker追加による読取り増加0、役割mapping、nested原例外と継承method復元に成功した。0.25 ms仮想clockではbookkeeping11.5 msと全clock読取り22.5 msが異なり、部分観測という説明が実際に必要であることも確認した。一時的actor追加後に削除されるケースでは個別未観測でもaggregateへ時間が残り、最終登録検査だけでは検出しない宣言済み限界を確認した。blocking defectなし。これらはCPU fixture内の数値であり、Safari実測値ではない。

## 唯一 writer への組合せ条件

1. 親が採用する最新 source の probe を基点と照合し、この1 file差分を組み込む。別担当の第三 media転送候補とは録音helper編集が重ならない。
2. helper が原 report と profile に格納する実 probe SHA、harness側F3の実file SHA、export metaの実file SHA を採用時に照合する。旧 C36 probe SHA を新候補の provenance として使わない。
3. C38 の指定 source Floor / push / attempt1 / designated branch / 明示 marker による単回 opt-in だけを親が用意する。既存 `[ios-frame-work-c36-r1]` への偶然の一致や PR への一律有効化で代替しない。こちらはworkflow/envも変更していない。
4. 原 report の全 meta/chunk/end・bytes・SHA・run/head/attempt・全tool SHAを回収してから、街の元 clip clocksと phase行を照合する。成功でも旧失敗原因修復と自動判定しない。source failed/third clip未完成/診断dropもそのまま保全する。

C36 原回収の有限成果は `c36-safari-profile-result-ultra/` に凍結済み。元 report SHAは `b2de6f0b9ce375082be62762ee2f880fd47ab0c2bfbcbb7f65923d44b1b2cbe8`。補記: そちらの REPORT 表で第二clipを説明的に `gas-approach` と記したが、原 JSON の正確な name は **`cut-gas-air`**。数値・原 bytes・独立検証に変更はなく、原 JSON の name を採用する。

remote writes / CI starts / retries / automation変更は0。sole writerは `/root/integration_recovery_ultra`。開始 `2026-09-13T20:56:49+09:00`、期限 `2026-09-20T20:56:49+09:00`、19要素 / 71基準、全19 not measured / valid blind0 / units0 / continuousを保持する。
