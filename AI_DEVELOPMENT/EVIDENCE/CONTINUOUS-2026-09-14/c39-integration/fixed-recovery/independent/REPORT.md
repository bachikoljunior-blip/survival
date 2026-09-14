# C39 fixed C38 recovery: finite independent review

判定: **BLOCKERなし**。以下の2file候補を、固定失敗artifactの原report/appium.log回収用として受理可能。実原ZIP回収・実圧縮率・製品の時間損失修復は未検証。

| 固定候補 | Bytes | SHA256 |
|---|---:|---|
| tools/recover-ios-phase-c38.py | 13,167 | efbf6600efb7c332ca21e2b07b6b879c748ed5a27227608178cfa7b74c35135f |
| .github/workflows/gates.yml | 32,656 | 737296093d9529e5aab8b2c4a8377cc082262eef0e6234caef54c5a0d3a8c660 |

当人が正規GitHub Appから取得した61e8f8c595bde13634fe709f979816011df165d0のgates 30,776 bytesを完全prefixとして保持し、固定回収job追加のみ。独立生成unified diffも提供patchと一致。source push/指定branch/attempt1/固有marker、contents/actions read、exact github.sha checkout、persist-credentials=false、10分job上限、固定run-artifactsのID選択、公式API ZIP受信とpipefailを確認した。新Safari/profile実行jobを追加していない。固有markerはwriterがこの回収用pushに使う選択条件であり、将来の別pushへのmarker再使用を永続的に禁止する仕組みではない。

独立31検査が成功（`verify_edges.py`、`edge-results.json`）。合成ZIPと一時的なプロセス内pin置換だけを用い、candidate本体・remote・CIを変更しない。

- 受信exact長とdigestを照合。短い・長い・digest違いを拒否し、受信archive出力なし。実ローカルbash pipelineでproducerが正しい全bytesを送信後exit7した場合、receiver成功でもpipefailが7を保持した。
- NUL切断名、正規化重複パス、local/central名不一致、暗号flag、65 entries、selected report/appium CRC不一致を拒否。非対象mediaはinflateしないことを確認し、CRC保証を選択2membersに限定した。
- report正常/appium CRC不正の場合、meta/chunk出力0かつoriginal出力directory未作成を実確認。2member検証前に最初のreportだけを公開しない。
- report/appiumの個別raw上限、合計raw上限、共有gzip上限のexact/超過境界を縮小合成fixtureで検査。production constantsはreport32 MiB/appium8 MiB/合計40 MiB、gzip合計8 MiB、ZIP32 MiB、宣言展開合計96 MiBで固定。
- 実mainの2系統meta/chunks/endについて共通files manifest、file/index/offset/total、meta=end、rawSHA/gzipSHA/helperSHA、再展開bytes一致を独立再構成。原JSONの末尾空白とUTF-8 appium文字も保持した。

固定metadataはartifact10364986195/run34884725972/head61e8、ZIP25,105,480 bytes、digest661474f9320966960edf4794c0fdabe4d8f456ec6166efd1dbace592cef6d372と既存原証拠に一致。元reportはfailed/54checks中53pass/4096rows/844dropped/completefalse/restoredtrueと4tool・bundle1094・recorder785541d3 pinsを要求する。gzipは原bytesの別回収形式であり、JSON再生成や失敗の消去ではない。既存report exporter8 MiB、probe4096、時計5%/4stepsを変更しない。

実ZIPと2membersの実サイズ・圧縮率・UTF-8適合・root filename形状は未取得で、今回の合成検査から収容成功を保証しない。対象不足、不正CRC、raw/gzip上限超過は回収失敗として保持する。raw SHA等は実bytes取得後にだけ確定する。回収後も844回の欠落は残り、全profileが完全になったとは呼べない。appium.logの待ち時間とphase elapsedの原因対応も回収後の別検証となる。

再現: 許可root `/workspace/scratch/0b7ad82bafe7` で `python c39-c38-phase-recovery-ultra/independent/verify_edges.py`。候補直接編集・原ZIP取得・remote/CI/rerun/automation/newspawn0。唯一writer=/root/integration_recovery_ultra。全19not measured/71基準/10参照/valid0/units0/continuous、開始2026-09-13T20:56:49+09:00・期限2026-09-20T20:56:49+09:00固定。
