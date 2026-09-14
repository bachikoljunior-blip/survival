# C37 保存境界の最終独立レビュー

**成功、阻害0。現91pathの通常保存へ進める。** 対象manifest SHA256は `d0b9f57ce4c1ad9e9500eafe3c69f926ee0df28b05049a5be53350dbec7b4fc0`。正規latest head789f219 / baseTree71f650e9を再確認し、AGENTS→CLAUDE v3→SESSIONを受理した。

91payload全filesのbytes/SHA/Git blobと実path集合が一致。候補9pathは既レビュー8pathを全bytes保持しSESSIONのみ更新、原28pathは原保全記録・現存原bytesと一致する。9候補の全path/hashはreceipt.jsonに保存。初期83pathへ分析証拠8pathだけを加えた時点の不変性も、8項を除いたmanifestが元SHA347fc50…へ完全復元することで確認。最後の修正はSESSION、統合REPORT、prepare-state.py、deadline-receipt.jsonの4pathに限られる。

既存strict YAML parser（Git blob176dbeec）でSESSIONのexpected全値一致、正規旧work/repository全値不変、初回開始・期限・continuous・units0を確認。正規elementsは19件すべてnot measured。STATE・概念・BENCHMARKS・固定基準の変更0、有効blind0。E9はallowlistのpublic-summary.json/public-allowlist.jsonだけが原bytes一致で入り、private packet・参照全文・mappingの混入はない。

source原report4472434 bytes/b2de6f0b…の完全保全と、解除18ms成功・街0.8966843166918298失敗・第三転送120秒失敗・完成clip2件の記録は整合。PRは別WDA起動失敗、受理済4run完了、main545未反映を保持し、回収や時間/転送/WDAの修復を過大主張していない。追加profile分析も同一原reportへ結合している。source/PRのZIP実取得は未確認として区別する。

記述の2点を明確化済み：renderer累計446ms/2callsは447ms callback内、updater182ms/4callsは別callback。audio.update最大1msは街だけで全3recordingsでは2ms。同期経過時間をCPU/GPU時間や原因確定にしていない。

既存49/16検査、新build、原回収、画像閲覧、解析、比較は再実行していない。候補編集・remote・CI起動0。本レビューはserialization/組合せ境界だけであり、新head必須CI、実原因修復、fresh比較、main/Pages反映は統括が継続する。
