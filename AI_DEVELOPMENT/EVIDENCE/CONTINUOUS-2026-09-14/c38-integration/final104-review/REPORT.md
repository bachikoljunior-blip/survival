# C38 最終状態・原物・公開範囲の独立照合

保存前の104 pathsは境界検査に合格、blocking 0。対象は staged-manifest SHA256 `bd9847e63d0dd1d2222361083b83d5823912c090d1eedae66f1bbb53e0c99f8f` と、その全payload bytes。remote保存や実Safari成功を証明する結果ではない。

正規Appで最新 bf743056ce143f09e4c6544ef1c7df4b73b232fd を確認し、AGENTS→CLAUDE→SESSIONの順に本人が受理した。先の83 paths（manifest SHA256 3384354510dc131066f79888c426447f58e310fa8c9af7f14991bffbacd243bc）も受理時に全bytes/SHA256/gitblobを照合済み。旧manifestの完全保存コピーは残っていないため、83の原物を再構成したとは扱わない。最終104は別途全件再計算し、余分なfile・欠落・symlink・hash不一致0を確認した。

| 対象 | 結果 |
| --- | --- |
| 最終payload | 104/104 のbytes・SHA256・gitblob一致 |
| SESSION | 14,271 B、SHA256 ed45a2598a1fb1fa7e5f0c83d18bb8ad60787010f4369c9b2d77603208058812 |
| strict状態確認 | 正規reader blob 176dbeec7b81bb1a4e4cb59b8569c0f5a80917d0でparse・独立serialize/parse往復・expected object・元work深い一致 |
| 原資料 | WDA 9 files 3,355,781 B＋C37 decoded 4 logs 161,789 B＝13 files 3,517,570 B。全件が既回収原bytesと一致 |
| 追加制作成果 | exact allowlist 20 entries＋controlのみ、264,038 B。各元bytes/hash一致、非許可追加0 |
| 実装範囲 | 既レビュー済みcode 7 paths＋SESSIONのみ。7 code pinsは51検査blocking0の独立receiptと一致。新fixture実行0 |

製品root1094・src・recorder・STATE・CLAUDE・BENCHMARKSを変更するpathはない。6 nodes/12本文はevidence内の未build・未採用候補であり、旧8 nodes/16本文保持と独立制作レビューの結果を実画面・品質比較の成功にはしない。

workは開始2026-09-13T20:56:49+09:00、期限2026-09-20T20:56:49+09:00、continuous、units0を完全保持。全19 not measured・有効blind0・固定71基準を維持する。記録時刻からの残時間再計算は137.139648時間で、receiptとの差は0.00053秒未満。生成時のマイクロ秒から表示ミリ秒への丸め範囲である。active/rolesは本reviewの受理と、制作候補freeze後の次build準備受理を反映している。本書が当reviewの有限完了記録となる。

公開対象にprivate archive・原比較回答・匿名対応表・保存識別子の混入を認めない。利用可能なlocal原物との全file一致、長い原文/回答断片の照合、公開制作診断の読解を行った。共有本文は既存ゲーム自身のsourceであることを確認した。private保存のlocal receiptはsucceeded/71,501 B/version0、ZIPは7原files＋整合manifestの8 members、CRCと全原fileのbytes/SHA一致。remote bytesの再読取りは0であり、remote保存内容の再照合済みとはしない。公開される一般的な保全状態・内容hashは保存識別子と区別した。

保存済み正規run観測はC37の4 runすべてcompleted/attempt1と一致する。source/standalone/roundはsuccess、PR Floorはfailure。C37両側3 clipsのmetadata、PR解除85ms成功、PR街・arcadeの元時計失敗、両profile nullを区別した記述は原4 logsと整合する。C34/C36の失敗修復、第三転送の実Safari修復、WDA根本原因、GPU/CPU専有の判定へ拡張していない。C38の転送・処理probe・stdout改善は有限fixtureと未実測を分離しており、保存REPORTに証拠より強い修復・完成主張はない。

この担当のremote変更・CI起動・再試行・automation変更・新子起動・候補直接編集は0。唯一writerは /root/integration_recovery_ultra。本結果2 filesの追加後、通常保存と実CIへ進むための境界確認として返却する。
