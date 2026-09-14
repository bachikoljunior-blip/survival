# C36 原 Safari profile 回収・時間損失の有限結果

source Floor run `34875252891` / Safari job `104080730225` / attempt `1` / head `789f2199bd3791a6dc6566eecaf3c1478c99afa6` の原 report 全 bytes を正規 job log の明示 export から回収した。街の原取得 clock guard は失敗したままである。新 profile は、その実行で生じた損失を frame 入力、同期処理内の経過時間、callback 間の経過時間に分離した。renderer 内部の処理・CPU 専有・GPU 実行・外部待ち主体までは特定していない。製品修復済みとは扱わない。

## 原 bytes と実行同一性

| 保存物 | bytes | SHA-256 |
|---|---:|---|
| `original/report.json` | 4,472,434 | `b2de6f0b9ce375082be62762ee2f880fd47ab0c2bfbcbb7f65923d44b1b2cbe8` |
| `transport/job-final.log` | 6,256,481 | `b9a2d04ea04cb1f47dc0a5c109c7e79546aae8b2263886130b92cc8da6a7af50` |
| `transport/export.log` | 6,192,634 | `306c5d676a68411c3e589134662b0cbc3f4db6880be2c7d41dcf18ed10489d18` |
| 未完 prefix `transport/job-prefix.log` | 4,202,168 | `f90d50eb73aca37caaab7496c0dac770496d93402da9d2302657044ef597203f` |

prefix は meta 1 / chunk 998 / end 0 であり、原 report 完全回収とは数えなかった。その bytes を変更せず保全し、完了後の最終 log が同一 prefix を含むことも確認した。最終は meta 1 / chunk 1491 / end 1。重複・順序・offset・3000 raw bytes 単位・8 MiB 上限・全 bytes SHA・meta=end・run/head/attempt を検証した。原 report 内の helper / harness / probe provenance は実取得した C36 source と一致した。

| 同一性 | SHA-256 |
|---|---|
| ios helper | `7c7356237d487786234e737fe959075c942e39844f638d1e1ea3f925b0bd5194` |
| harness | `fe15b0b8fc0143f826f45cc8642fac302e829c36e8242e1328e5498d8cf6b6ec` |
| probe | `2ce6e467d5f6ba45b18da2d644b3ad4463bbd036aaac9def3117056bd5ef08cf` |
| exporter | `5d17504681f038706d61828eba286d495f91b99f30f0c2cd20a27cefed717f43` |
| 実製品 bundle | `514f671fa64b75dda7f835a430245e9b168f9aca38fbce0b8184b12938679a55` |

shared recorder git blob `785541d3beaed0e35e8bcf042973eabb7bdb5d6c` も一致。`recovered-manifest.json` と `independent/independent-result.json` が検査詳細である。

source artifact は正規 run_artifacts metadata と原 upload log が ID `10360518846` / 12,273,984 bytes / ZIP digest `0c7569830d3dc97f91c5c81d346f96daa9e7f36acabd01651d8c83888ac16d82` / run/head で一致した。ZIP 自体の取得・ローカル SHA 計算は未実施。この metadata 照合と上記原 report 実 bytes SHA 検証を区別する。

## 元取得結果

Safari 実起動と core checks は成功し、街の実タッチ解除も次の固定更新を含む frame で 18 ms 後に確認された。原 job は step 9 と F3 step 10 が failure、原 export step 11 と artifact 保存は success。

| 原 clip | wall 秒 | audio 秒 | engine 秒 | engine/audio | 原 5% guard |
|---|---:|---:|---:|---:|---|
| street-walk | 10.609 | 10.576 | 9.483333 | 0.8966843167 | failure |
| gas-approach | 10.465 | 10.464 | 10.433333 | 0.9970693170 | pass |

街は audio より engine が **1.092666667 秒**少なく、許容差 0.5288 秒を超えた。第三 arcade は録音中の profile 行が存在するが、`Safari audio chunk transfer timed out` により media 保存が成立していない。原 `safariAudioTransferFinal` は null。この転送原因は別担当へ原 report・最終 log を共有した。第三 clip を完成原音声として数えない。

## 新 profile が示す処理と時計

全 profile は 1853 行、3 recording identity、dropped 0、errors 空、restored/complete true。街 recording 1 は 540 行のうち active recording 536、inactive 4。原 clip clock は 537 samples、engine frame 増分 536。停止後の境界行や clip 間の転送待ちを街の処理負荷へ混入させていない。

| 街の実 frame | callback 内経過 | 計測された内訳 | 次 callback までの間隔 | 次 frame への入力 |
|---|---:|---|---:|---:|
| 925 → 926 | 263 ms | 固定 updater 4 calls 合計 182 ms、renderer 2 calls 合計 81 ms | 130 ms | 393 ms |
| 1097 → 1098 | 447 ms | renderer 2 calls 合計 446 ms | 319 ms | 766 ms |

後者の次 frame 1098 → 1099 では input 766 ms が 250 ms に clamp され、4 fixed steps 66.666667 ms の後、backlog 190.666667 ms を捨てた。clamp 分 516 ms と合わせ **706.666667 ms** の破棄が直接計算できる。前者に続く frame 926 → 927 は clamp 143 ms と backlog 183.333333 ms、合計 **326.333333 ms** を捨てた。長い renderer を実行した同じ frame がその実行時間で即座に simulation を進めるわけではない。

街 active 536 行の原 rAF 入力合計 10.600 秒について、次の恒等式が独立計算で成立した。

`raw input − engine advance = clamp loss + discarded backlog + accumulator change`

`10.600 − 9.483333333 = 0.659 + 0.458666667 − 0.001 = 1.116666667 秒`

audio endpoint と raw input の差 −0.024 秒を加えると、元 audio−engine 差 **1.092666667 秒**に一致する。エンジン時間を正規化せず、250 ms clamp、1/60 秒固定更新、最大 4 substeps、残り破棄の現行挙動で説明できた。

街 callback 内経過合計 1959 ms、p50 2 ms、最大 447 ms。callback 間合計 8580 ms は通常の rAF 待ちも含むため、全量を異常待ちと呼べない。最大間隔 319 ms の主体は未特定。街 `audio.update` の最大は 1 ms だが、音声合成が固定更新内のイベントで行われる可能性や別 thread の負荷まで否定しない。同期区間の経過時間には preemption・blocking・probe 自身の負荷も含まれる。nested phase は重複するため合算禁止。

## Source との対応と次の取得改善

C36 正規 `src/render/postfx.js` は low tier で scene を sceneRT へ描く call と、quadScene による composite call の 2 回を実行する。2 calls 自体は正常構造であり、原計測は 446 ms をどちらへ分けられない。`src/game/game.js` の固定 updater は gas/nav 更新、player 入力、actors、systems、zone を一つの外側関数で扱うため、182 ms の内部原因も未分離である。`city.updateVisibility` の街最大は 1 ms。shader compile / resource upload / graphics 同期待ち / OS scheduling のいずれかへ、この原データだけで決め付けない。

従って本有限結果に製品変更候補はない。別隔離 `c37-safari-phase-refinement-ultra/` で、world/composite 別、fixed 内訳、program count 変化、probe 自身の観測負荷を低負荷の範囲で記録する次の単回計測候補を作る。`gl.finish` 等の新同期負荷、製品低品質化、clock guard 緩和、4 steps 増加、転送容量・期限拡張は行わない。候補の採用・組合せと C38 の単回実測は唯一 writer が管理する。この成果から新しい CI は起動していない。

## 証拠の範囲と検証

- strict recovery は正規 exporter を用いた明示 synthetic positive/negative 12 controls に成功。原失敗 report を都合よく排除しない。
- 別 Ultra 子が最終 log から全 1491 chunks を独立に検証し、元 report 実 bytes/pin/clock 恒等を確認した。原 Safari 外の検査は CPU arithmetic・fixture であり、新しい Safari 性能試験ではない。
- C34 source/PR の旧 street 失敗では callback 内 profile が存在しなかった。新 C36 の計測は、C34 の特定 frame 内処理を遡及確定せず、旧失敗修復の証拠にもならない。
- C35 正常 HTTP 200 payload の `error` フィールド衝突による理由消失修復と、元の録音 operation 失敗は別問題。新 C36 第三 clip の転送 timeout を C35 と同じ原因とはしていない。
- C36 PR の WebDriverAgent `ECONNREFUSED 127.0.0.1:8100` は製品開始前の別失敗で、親が担当する。source では実 gameplay と clock failure を観測した。

remote writes / CI starts / retries / automation changes はすべて 0。固定開始 `2026-09-13T20:56:49+09:00` と期限 `2026-09-20T20:56:49+09:00` を保持する。19 要素・71 基準は固定、全 19 not measured / valid blind 0 / units 0 / continuous。回収と原因分離の進展を、品質達成や全目標完了に置き換えない。
