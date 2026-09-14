# C39: original C38 phase and Appium recovery

原 report と Appium log の2ファイルを完全復元し、時計損失と WebDriver 待ちを分離した。**元 C38 診断は failed、53/54 checks、4096保存行・844欠落・complete=false のまま。** 新しい Safari 起動成功や製品性能の修復とは扱わない。

回収元は固定 artifact `10364986195`、run `34884725972` attempt 1、head `61e8f8c595bde13634fe709f979816011df165d0`、元 bundle `1094c1d9…`。正規 C39 head `dff2d683d0a9821c79d84848bf93cb45b8920494` → AGENTS → CLAUDE v3 → SESSION を受理。完了 SUCCESS の既存回収 job `104134403420`（run `34891306829` attempt 1）の正規 job_logs を **1回だけ**取得した。

| 原物 | Bytes | SHA256 |
|---|---:|---|
| `transport/job-original.log` | 824606 | `6cb56ab8a51b28f6720db3e7e258264261a1b02e77cda859a929dfc3805550e1` |
| `original/report.json` | 16237592 | `9fe62379c2c35a01cb4b83af265b8ab67024d58b828a2da49bb586a68f6d092e` |
| `original/appium.log` | 3654815 | `bf39c21cbc8fef21b99ffe2130bd41575730cd193bd53c03c5eb6bac4ae11261` |
| `original/report.json.gz` | 477153 | `eac87da2381da3309e0e6cb02eeb2a4ad8bf8c1417422cffb73e7110197efbc9` |
| `original/appium.log.gz` | 102525 | `85aa3e935b7042147808d4cd0779b6bdd340976e33cd1c5e226444861d6b4166` |

原 job log の全824606 UTF-8 bytesは取得 tool string と14区間の読戻しで完全一致した。2 meta /195 chunks /2 end、共通 manifest、順序・offset・size、gzip/raw SHA、再展開 EOF、元 ZIP member CRC（report `ce995667`、Appium `a6964be3`）を照合。実 helper SHA `efbf6600efb7c332ca21e2b07b6b879c748ed5a27227608178cfa7b74c35135f`、原 run/head/attempt/4tool pins/recorder と元診断も一致した。

gzip 合計579678B、raw合計19892407B。元の report32MiB / Appium8MiB / raw合計40MiB / gzip共有8MiB を維持する。固定 ZIP は25105480B、digest `661474f9320966960edf4794c0fdabe4d8f456ec6166efd1dbace592cef6d372`。その ZIP digest は実 CI の検証済み helper が照合したもので、ZIP自体のローカル再取得はしていない。今回の実 raw bytes により、旧8MiB export容量超過を確定できた。保存時はこの**原 gzip 2ファイルをそのまま使用し、巨大 raw text を重複保存しない**。

街は wall92.010秒、audio91.882666667秒、engine88.066666667秒、ratio0.958468772。元5% guardは通る。gas9.159秒とarcade7.328秒も元 guardを通るが、全profileが揃った意味ではない。

| 保存範囲 | 録画行 / clip frames | その他 |
|---|---:|---|
| street | 4025 /4025 | inactive13行も保存 |
| gas | 58 /466 | 後408 clip framesの詳細なし |
| arcade | 0 /428 | 詳細なし |

欠落clip frames計836と dropped844 の差8は未分類。保存済み行の復元であり、844欠落を復元したとはしない。街ではclip両端frameと全4025録画行が一致するため、次を直接再計算できた。

`audio−engine = clamp 1.468 + discarded backlog 2.425 + accumulator差 0.007333333 − audio/rAF端点差 0.084333333 = 3.816 秒`

原 engine入力は91.967秒。全4096保存行で0.25秒clamp、最大4 fixed updates、呼出し数、accumulator、phase集計、rAF/marker恒等が一致する。全行 low/play/running/unpaused/unit-timescale/no context loss/no throw。clock/4steps/5% を変えていない。

| 街4025録画行の inclusive elapsed | 合計ms | 最大1行ms |
|---|---:|---:|
| callback | 14788 | 849 |
| world render | 6809 | 847 |
| composite render | 285 | 6 |
| fixed updater | 4220 | 148 |
| nav gas cost（updater内） | 1366 | 12 |
| player actor（updater内） | 840 | 17 |
| actor:1（updater内、role不明） | 458 | 129 |
| HUD update | 1584 | 14 |
| audio.update | 67 | 6 |

最大 row3675/fromFrame6371 は callback849ms、world単一call847ms、composite0ms、program数43→44（全保存行で唯一の増分）。次row3676は前marker span849＋gap456 = raw入力1305ms、clamp1055＋残余破棄184 =1239ms。別row2492のupdater148ms/2stepsにはactor:1累計129ms（個別call125ms）を含む。最大gap550msは別row2489の前。nested phaseを足して総負荷とはしない。program増加は同時観測であり、compile時間・GPU時間・CPU占有・host schedulingの因果分離ではない。

街observerBookkeeping429ms、clock reads618934（全保存行438ms/630672reads）。部分観測と計時自体の負荷を含むため、全probe費用の推定や補正には使わない。wrapper外gapにはmarker外の未計測処理も残る。

**街92秒の録画は WebDriver の待ちで長くなっている。** 原 Appium248 HTTPペアを解析した。録画開始結果 id7/offset0 の小さい JSON slice 読取（原7991→7992行）はHTTP200、応答sizefield618、Appium elapsed59329ms、ログ時刻差60377ms。この2時間値の差も原どおり保持する。開始結果の受理後に初めて移動を始めるコード順が確認できる。

| 原命令 | Appium elapsed | 原ログ時刻 |
|---|---:|---|
| 録画開始結果の小reply読取 | 59329ms | 19:16:45.166 →19:17:45.543 |
| trusted `audio-street-stick` actions | 4097ms | 19:17:51.875 →19:17:55.973 |
| recorder停止開始 | — | 19:18:02.716 |

ブラウザ原状態でも録画開始→移動前snapshotは78349ms/3401 rendered frames（街4025framesの大部分）。原 Appium の長いscript bodyは途中省略されているが、対応sourceと命令順・短いslice引数は読める。約60秒の WebDriver 内部待ちの根本原因は未分離。停止後のstreet media upload受信36883msを録画内へ混ぜない。

4 host receiptsはreceivedで、元120秒 /48MiB chars /128KiB wire /同一origin POSTを保持。street/gas/arcadeの受信elapsedは36883/3817/815ms、profileは1923ms。profileの後付けprovenanceだけ除いて Node JSON.stringifyすると8030267 chars/bytes、SHA `44b170955d63a590d7fac1f4752cfd0458be50208b7fe4b53e103bd6d6bbc99b`、62chunksの原receiptに完全一致した。media本体は回収しておらず、3clip payload SHAの再構成はしていない。実更新後release110ms、元即時mag1→次更新mag0、後続5 lifecycle状態とcleanupも原結果どおり。

製品性能・画質設定の候補は0。保存情報は特定shaderやlightの削減、描画品質変更を支持しない。親の追加許可に基づく**診断転送の限定1file候補**は `candidate/tools/ios_audio_capture.mjs`（25571B、SHA `e4f36959ec83f4d4112bda7be27e081ba0e721ee27784705a21a59c4c31d0262`）。C39正式helper SHA `084829ec335d8969e21406da1e5311e7c71134c73eb4e56a29d8dc7c0f4042b6` の差分で、4096文字以下のready JSONだけ既存status pollへ同封し、次の小chunk読取1命令を省く。ページ側も実string.lengthと宣言charsの一致を必須とし、破損時の過大返値を防ぐ。大型HTTP経路、cleanup順、元recorder、8c bundle pins、120秒operation/90秒command、capture条件・clock guardsを保持する。

この候補は原59秒待ちが発生した命令を省略できるが、残るstatus/cleanup命令のSafari遅延まで除去したとは言えない。実Safariの改善値、新しい完全profile、時計修復成功は未測定。構文＋自分29 CPU/VM境界＋独立22検査が成功し、阻害0。独立検証が発見した宣言4文字/実200000文字のwire反例は、修正後200061B→45Bとなり過大送信前に拒否できた。Unicode outer wire最大12350B、4096/4097境界、既存chunk/upload、期限・cleanup・元reason保持も確認した。限定候補の採用を推奨するが、実Safariの効果確認はwriterの次の通常CI結果に残る。

原物の独立Ultra検証は `independent/REPORT.md`（SHA `fa3db1f982b2bd1ac283d3f6b650bd6d43676b4b4cc9513f9119f285f6e00c72`）、4原再現scriptすべて成功。自分の `decode_recovery.py`、`analyze_phase.py`、`analyze_appium.py` も成功し、算術不一致0。次操作はwriterによる原gzip保存と限定候補の採否判断。新CI/rerun/profile/remote/automation/拒否URL再試行0。main545へ未反映。全19 not measured /71基準 /10参照 /valid0 /units0 /continuous、開始2026-09-13T20:56:49+09:00、期限2026-09-20T20:56:49+09:00を保持する。
