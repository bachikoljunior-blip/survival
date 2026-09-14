独立コードレビューは **次周期の診断候補について pass、blocking 0 件**。対象は C40 `8058f8431b7885e9e929e6cb57bb415d26d9f5b1` / tree `56dad9f8c5fea165b63de2241b1016fcf20cef93` の `tools/frame_work_probe.mjs` 1 file。候補 16,893 B、SHA-256 `33dfcc32bdc7a2b3de52c0295f822dd4f8eff112bb74fbf3d6e45926e23ac618`。現在の C40 capture、PR、main、製品 root に変更を加えていない。

正規 latest head → AGENTS.md → CLAUDE.md → SESSION_STATE.yaml を再受理した。制作者の正式 ready と manifest を受領後、候補全文と差分を読んだ。基点は正規 GitHub から新たに取得した 11,229 B / SHA-256 `eabc3f8ba621e992902a63790b86f0787bb84998bd5b9fa239ab20414d661fe8` / Git blob `d16786a6dc1b259cac5cc77045400f924e1df2a4`。宣言された inventory と呼出し箇所・出力 field の追加を逆変換すると、元 file の全 byte に戻る。

初期 inventory と保存対象 callback の入口・出口における件数増加だけを観測する。同じ object は再収集しない。64 entry、16 event、各 event の 128 添字走査、name 96 / cacheKey 256 UTF-16 code unit、retained records 60,000 B / 全 metadata 65,536 B の上限がある。missing / accessor / unsupported / descriptor error / truncation / capacity と限定読取の不完全状態を区別する。文字列は限定 prefix / suffix であり、全文 key の同一性を証明しない。

独立した source / VM controls は 15 件 pass。program field と配列添字の getter を呼ばないこと、継承 field の欠落扱い、absent / non-array / descriptor throw、型変換をしないこと、surrogate と control character の切断・JSON 往復、各件数と byte 上限、元 source の例外伝播、own / inherited method descriptor 復元、途中 install 失敗の rollback を確認した。getter 非実行の対象は program の id/name/cacheKey と配列添字である。上位の renderer.info/programs は通常 property access で読み、chain 全体の getter 非実行は主張しない。

定常 32 saved frame で追加 descriptor 走査 0、追加 encode 0、GL access 0。同数入替え、境界間だけの一時 object、最初に収集した field の後の変更は保存しなかった。独立 escaping fixture は 26 entry、records 59,723 B、全 inventory 60,648 B で byte cap に達した。これは synthetic 入力の結果であり、実 Safari metadata の大きさではない。

原 probe と候補を同じ VM callback・時計 fixture で実行し、programIdentity 以外の全 timing report、lifecycle、performance.now 呼出し数、complete / detailComplete が一致した。descriptor に合計 6 ms の synthetic cost を与えた場合、既存 observer / callback 経過にその分が入り、phase 正規化や追加 now はなかった。実コストは未測定。4098 callback の fixture は元どおり 4096 rows / 2 dropped / 3 recordings / complete=false / detailComplete=false を保持し、cap 後の追加 program は未観測だった。

boundedReadsComplete は限定された auxiliary inventory だけを表し、元 complete / detailComplete は timing coverage のまま。同数入替え、境界間の生成削除、既に queue 済みの元 callback、4096 row 後は観測しない。初期 inventory は row 計測外、後の読取は既存 observer 区間内にある。元の時計、4096 rows、256 slow calls、8 ms threshold、restore、失敗条件は byte 不変。engine、4 substeps、時計 guard、export / transport caps は候補変更対象外で、緩和していない。

制作者の actual Engine fixture 62 assertions と追加 50 assertions の receipt は別に受領し、独立 15 件へ加算していない。独立環境は Node v24.19.0 の VM と synthetic renderer/program/clock で、実 Engine / Safari の実行や GPU 測定ではない。独立 fixture の undefined 引数が default programs に置換される誤りを 1 行修正して再実行し、全 15 件が pass。候補の変更や欠陥は 0。

この追加は以前の world 847 ms の原因を証明せず、過去の program identity も復元しない。実 property availability、実 observer overhead、compile / CPU / GPU 因果、性能修復は未測定。bounded metadata を加えても既存 report/export 上限に収まる保証にはならず、正式な次周期で実原出力の受理を確認する必要がある。実 build / browser / Safari / new CI / remote / root 生成 / 新 spawn / Library / automation 操作は 0。

公開は publication-allowlist.json の exact file / hash のみ。開始 `2026-09-13T20:56:49+09:00`、期限 `2026-09-20T20:56:49+09:00`、全 19 not measured、71 基準、固定 10 参照、valid blind 0、units 0、continuous を保持する。品質比較は行っていない。
