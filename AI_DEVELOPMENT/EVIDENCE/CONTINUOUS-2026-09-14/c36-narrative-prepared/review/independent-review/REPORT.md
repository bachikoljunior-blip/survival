採否: **C37 のローカル 5-path 候補は採用可。独立 byte/provenance/pin レビューの blocking finding は 0。** 3 source と新 root を同時採用し、IOS_AUDIO_PIN の 3 値を下記に揃える条件である。source 採用・remote 更新・CI 起動・main merge は本担当では実施していない。

| IOS_AUDIO_PIN の更新対象 | 確定値 |
|---|---|
| `preparedFromCommit` | `789f2199bd3791a6dc6566eecaf3c1478c99afa6` |
| `preparationReportSha256` | `2dbf5a5b15424ccd2e1e33e628391fad46084f4ec46686b70db1023d9061bf69` |
| `bundleSha256` | `1094c1d96bed6b953c1655ce65549c484b8f09e275f055bff283499cece110f7` |

`bundle: cinderline.1.0.0.js`、`recorderBlob: 785541d3beaed0e35e8bcf042973eabb7bdb5d6c`、全 recorder・時計・転送 guard は保持する。旧 514f の履歴 helper や失敗証拠を一括置換しない。

対象は `bachikoljunior-blip/survival`、制作 branch `claude/repo-instructions-constraints-r0070m`、C36 `789f2199bd3791a6dc6566eecaf3c1478c99afa6`。許可された正規 Git ref 経路で latest を確認し、AGENTS.md → CLAUDE.md → SESSION_STATE.yaml を順に読み `ULTRA-CHILDREN-20260914-v3` を受理した。正規 fetch の C36 prepare helper、route helper、gates は凍結候補と byte/blob 完全一致。gates はこの時点で全体一致しており、対象 job block も一致する。正規 canonical tree 1694 entries、truncated:false から、47 build inputs の集合と各 Git blob を独立照合した。

受理済み run `34875252891` / attempt `1` / job `104080729331` の成功を、専用 `github_fetch_workflow_run_jobs` と独立した run metadata 読取で確認した。job は直接 head_sha を返さないため、job.run_id → run.id/head_sha/run_attempt → 両原 report と各 export metadata/end の整合を検査した。16 job steps はすべて completed/success。取得時点で全 Floor run はまだ in_progress であり、他の必須 CI まで成功したとは扱わない。一般 actions/jobs URL、拒否 URL、資格情報にはアクセスしていない。原 job log は親が正規専用 tool で一度取得し、本担当は再取得しなかった。

原ログ 9,041,979 bytes、SHA256 `20b6f25fc8f0fe15da03fd45cc663ffb9c05951ca616ca296e68969be88cc91b` を独立に解析した。2,245 transport records から preparation 10 files と route 17 files を再構成し、親の保存済み全 27 files と完全一致した。全 chunk offset・3000-byte 境界・canonical base64・meta/end・サイズ・SHA256・prepared Git blob・集合順序を確認した。ログ中には 5 個の BOM があり、初回の厳格 parser は timestamp 前の BOM 付き行を認識せず停止した。原 log/JSON/file bytes は変更せず、ログ framing の先頭 BOM だけを認識する修正を検査器に加え、その後全件成功した。欠落 chunk を補造したものではない。

47 original input hashes/bytes/blob IDs、locked esbuild 0.25.0 / three 0.180.0、Node 20/Linux/x64、元 bundle 514f の再現、元 root check、固定 3 候補、7 command stages の全 exit 0、変更集合が 3 source と runtime の 4 files だけであることを確認した。static root 5 files は canonical C36 と不変。新 root は 1,446,171 bytes、Git blob `70857633766d7064806f06f965b7aafa0bf1533e`。原 report の candidate dist hash は回収 root byte の 1094 hash と一致し、canonical helper の実 root/dist equality check も成功している。

原 browser report は requested/attempted/executed=true、passed、source routes 16、screens 16。frozen source/localiseNode/display hashes と実 runner/DOM report の全 16 hashes、同じ 1094 runtime、同一 head/run/attempt、全 screen の実 667×375/DPR1/touch readback、browser errors=[] が一致した。PNG は全 16 個の元 bytes と hash を確認し、667×375 IHDR、全 PNG chunk CRC、IEND 終端、IDAT 展開と scanline size/filter も独立に検査した。この担当は画像の閲覧や再撮影をしていない。

親 `/root/integration_recovery_ultra/narrative_build_ultra` の `visual-review.json` は 16 原画像の実閲覧と blocking0 を記録しており、全 image hashes が本担当の回収結果と一致した。親の一時的な ja-final-k_asked2 末尾疑義は、原画像の単独再閲覧と原 source 照合で解消したという当人の記録として受領した。本担当の視認結果として代筆していない。本文の空行が通常の折返しになる点、2 箇所の非本文 mood `quiet` が英語である点は、既存の変更対象外挙動として同記録に残っている。

C37 `main-integration-c37/candidate` と `initial-candidate-manifest.json` は正確に下記の 5 paths だけであり、全 size/hash/blob と元 preparation bytes を照合した。

| Path | SHA256 |
|---|---|
| `src/content/story.js` | `faa5d203dd5aeb8900400a8b13959f2f5286b3400d19fdd375ffa41bc9535f44` |
| `src/content/locale/ja/story.js` | `0530d41bb02ab9f72d71b5323491e560a16aff78e29c032390e41b371dac8158` |
| `src/content/locale/ja/story2.js` | `179c9d8e3e2cc525fe01a8744037fb15e712da2bdc5cd536b0e80ea4ada8143f` |
| `cinderline.1.0.0.js` | `1094c1d96bed6b953c1655ce65549c484b8f09e275f055bff283499cece110f7` |
| `tools/ios_audio_capture.mjs` | `0ac5b36321b1fdf3d87c6062cd7b070daa7d939f0e3d3e53574d4993320ee513` |

音声 helper は canonical C36 と上記 3 pin 値だけが違い、他の byte は同一である。新 helper blob は `457f3e1efcd596b102969c508dfa7f64e81a7b92`。独立 fixture 内で実 `verifyIosAudioBuild` 関数を変更せず実行し、新 1094 root/dist を受理、旧 514f の両方・root のみ・dist のみを拒否、recorder 1-byte drift と external URL を拒否、復元後の新 bundle を再受理した。fixture の recorder/probe/harness はすべて canonical C36 blob と一致する。5-path/3-pin 検査、実 guard 検査、原ログの欠落・重複 chunk、end metadata 改変、base64 不正、final end 欠落の拒否を合わせ **16/16 CPU checks 成功**。fixture だけを書き、元 source/raw/candidate は編集していない。

この承認は source/root/pin の整合と限定した staged display の証拠に関するもの。通常プレイでの到達、Mobile Safari、新 bundle の音声動作・聴取、他サイズの可読性、品質比較、最新 required F2/F3/F5、通常 PR merge、Pages/F6 はそれぞれ後続検証が必要。全 19 elements `not measured`、valid blind0、units completed0、units requested `continuous`、開始 `2026-09-13T20:56:49+09:00`、期限 `2026-09-20T20:56:49+09:00` は不変。

独立担当の書込みは `c36-narrative-prepared-result-ultra/independent-review/` 内だけ。remote/CI/automation mutation0、actual browser executions0、画像閲覧0、source採用0、raw再取得0。sole remote writer は `/root/integration_recovery_ultra`。
