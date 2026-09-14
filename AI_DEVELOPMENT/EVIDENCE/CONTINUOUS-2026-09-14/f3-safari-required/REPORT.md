# F3 必須 Safari 取得候補 — 独立レビュー待ち

基点は `68cf2d4d303684e6f6a62f0aec4120169e0945bc`。変更は 3 ファイルだけです。
既存 F3 の最後の Chromium 録音を、実時計が成功した既存 Mobile Safari 取得へ移します。
元 `F3 execution` 名・branch 保護・core/WebKit/fault 全検証・音声の 5%/100ms 三時計関数・
原 compressor/cap を保持します。旧 Chromium 失敗を成功へ書き換えません。

| 候補 | 動作 |
| --- | --- |
| `.github/workflows/gates.yml` | 非音声 10 steps をそのまま `f3-core` へ移し、`f3-safari` を並行呼出し。元名 `F3 execution` は `always()` で両 result が厳密に `success` の場合だけ成功。 |
| `.github/workflows/mobile-simulator.yml` | typed `workflow_call` を追加し `capture_audio: true` を caller event/attempt に依存せず反映。caller 名を concurrency group に含め、standalone と取消し衝突を防止。 |
| `tools/gates/f3_safari_audio.mjs` | 実 report、同じ commit/run/attempt、全 `IOS_AUDIO_PIN` field、原 3 clip の完全 bytes、元の関数で再計算した時計/telemetry を必須確認。失敗は exit 1 と検証 report に保存。 |

明示 input が false/未指定の全条件は元と同じ動作です。既存 push marker は attempt 1 のみです。
明示 `capture_audio: true` は PR/push の reusable call と再実行でも録音を要求します。
従来の workflow_dispatch true 再実行も録音を省略しなくなる点は意図した変更です。
standalone の既存 false default、全実行 steps、Appium/driver、全非 F3 job は保持しています。

GitHub の一次資料では、reusable workflow は caller の GitHub context/workflow 名を継承します。
callee の concurrency は `mobile-simulator-${{ github.workflow }}-${{ github.ref }}`、caller 側には
同じ group を置きません。[GitHub workflow reuse reference](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)

確認済み:

- 実 C29 原 report 828,821 bytes、SHA256 `507a4f82645e6ccc8cff34154f39a58ec1786c3ab4e09f385e86a8f5cf4471ed`、
  47 checks と原 MP4 3 本・9,103,110 bytes が新 validator を通過。
- 音声の 30 controls 成功、244.229496 ms。録音無効・旧 run/attempt・欠落 check/clip・cleanup失敗・
  provenance/原 bytes 改変・実時計ずれ・telemetry欠落・既存 preflight 不一致を拒否。
  追加 pin field `preparedFromCommit` / `preparationReportSha256` の欠落も拒否する独立 schema fixture を含む。
- workflow 19 checks 成功、0.2782211200101301 s。内訳に実 aggregate shell 36 組と input/event/attempt 36 組を含む。
  `failure` / `cancelled` / `skipped` / 空値 / 不明値は成功にならず、両 success だけ通過。
- YAML 読込、JS 構文、全 8 正規 source blob と元 core steps の同一性を確認。

環境内の検証は新しい録音・ブラウザ・CI・GitHub workflow_call を起動していません。
input 検証は使われた単純な boolean/property 式のローカル評価であり、GitHub の scheduling 実測ではありません。
実 macOS/Safari 再実行、PR 上の required check 名/集約、C31 新 bundle への適用は未測定です。
音声品質・参照比較は `not measured`、実評価 0 のままです。

現行 IOS_AUDIO_PIN の 6b bundle/原 recorder pin は変更していません。
新 `81c93f3bf6c45b14c25f0e742a78d19b8dc70dca665ebba897bb6e39bbc937b3` への pin 更新は統合担当に保留しています。
新 validator は `Object.keys(IOS_AUDIO_PIN)` 全件を照合するので、統合担当の preparedFromCommit/
preparationReportSha256 追加を列挙漏れなく検査します。詳細は `pin-update-pending.json`。

次の 1 操作は、統合担当によるこの 3-file patch の独立レビューです。採用時は統合担当が exact pin を決め、
通常の全必須 CI・PR/main 手順で実測してください。remote/automation 変更、新しい子の起動は 0 です。
