3 source・実生成 root・IOS_AUDIO_PIN の 3 fields を同時に採用する 5 path 候補は、独立 byte / provenance レビューとして採用可。blocking は 0。製品への書込・保存・CI の追加実行は、この担当では行っていない。

正規 App で latest → AGENTS.md → CLAUDE.md → SESSION_STATE.yaml を順に再受理した。実行 head は 61e8f8c595bde13634fe709f979816011df165d0、commit の tree は 67c414952eec36eb0472b6fa5dd54816d209ba87。run34884725972 / attempt1 / job104112424660 を正規 metadata で確認し、専用準備 job の 16 steps は success。run 全体は独立確認時に in_progress であり、全 CI 成功とは扱わない。

原 job log 7,382,705 bytes、SHA256 972068aa8cdd985b4fedce4627e22937cfdd5fbc59d0148e1455cea45154ba7d から、1,834 transport records を独立に parse した。prepared10files と routes13files（PNG12枚＋report）を、許可 file set・順序・全 chunk offset・正規 base64・3000-byte 境界・meta=end・全長・SHA256・prepared Git blob で確認した。復元 bytes は全23 filesとも親の保存原物と一致する。ログ再取得0、原ログ・原fileへの書込0。

正規 C38 tree の47inputsと baseline原bytesを照合し、旧 root1094の再現、固定 esbuild0.25.0 / three0.180.0、Node20 Linux x64、全7 command stages の実 exit0を確認した。sourceBaseline=bf743056ce143f09e4c6544ef1c7df4b73b232fd は入力由来、sourceCommit=61e8f8c… は実CI checkoutとして区別されている。新3sourceは凍結候補と完全一致し、変更出力は3source＋rootだけ。静的 root files は public template でなく、正規 current root の bytes / Git blob と照合した。

実行された prepare / route helper、r2候補3sourceの計5filesは、独立レビュー済みのコードと正規C38 treeで一致する。正規 full workflow 中の対象job blockもレビュー済み候補と一致した。

新 bundle は原byteから算出した 8c5624edd96ba238135e46c90e53c6221b3c3303b977bb5d4e41b752264d94f0、1,445,368 bytes。prepared report と route report が同じ root / head / run / attempt を指す。12 routes の英日 source / merged locale / display hashes、実 DOM の rendered hash、667×375 / DPR1 / touch readback、browserErrors=[] を確認した。全12原PNGは signature・IHDR・全chunk CRC・IDAT解凍長・scanline filter・IENDまで整合する。

画像の本人視認は制作担当 /root/integration_recovery_ultra/narrative_build_ultra が行い、この独立担当は重複閲覧していない。親の12画像視認receiptを原PNGのfile/bytes/SHAと照合し、本文表示blocking0という限定判断を受理した。日本語 k_refuse / k_end は最後の仮名が1文字の最終行となる旨が残っている。本文の完全表示を一般的な可読性・文章品質の合格に拡張しない。

5 path 候補の実files・manifestを照合した。3sourceとrootは上記原prepared bytesそのもの。ios_audio_capture.mjs は正規C38の60fc3fd…を基点に下表の3fieldsだけを変更し、その他の全byteを保持する。

| IOS_AUDIO_PIN field | exact value |
| --- | --- |
| preparedFromCommit | 61e8f8c595bde13634fe709f979816011df165d0 |
| preparationReportSha256 | 000c622624315c43eb98639b2fc32c566e91f1c5cf4ec67713b4d8dd048efa44 |
| bundleSha256 | 8c5624edd96ba238135e46c90e53c6221b3c3303b977bb5d4e41b752264d94f0 |

新 ios helper は 24,880 bytes、SHA256 084829ec335d8969e21406da1e5311e7c71134c73eb4e56a29d8dc7c0f4042b6、Git blob c02c06122512036cdeb6b50e9e5dceb7f7b66083。bundle名・recorderBlob785541d3beaed0e35e8bcf042973eabb7bdb5d6c・転送/時計guardは不変。正規C38の依存4modulesを使う隔離CPU fixtureで、実verifyIosAudioBuildが新root/distを受理し、旧1094の両方・rootだけ・distだけを拒否することを確認した。recorder byte driftと外部URLも拒否した。返却transferHelperSha256は正規55150670ce3a89c24b9b3348110e29f315d9479ac14438faadf14389987eb41aと一致する。

独立16 controlsは全成功。上記5path/pinsと実guardに加え、原ログをメモリ上だけで改変した missing / duplicate chunk、end metadata不一致、壊れたbase64、最後のend欠落を拒否した。正常原物を失敗に置き換えたり、異常fixtureを実取得結果に数えたりしていない。

この結果は source-known の staged Chromium 表示と原byte取得に限る。通常play・全分岐 traversal・Mobile Safariでの新bundle動作・音声・性能・有効blind comparison・文章品質は未測定。既存Iris journal期間不一致も今回修正していない。全19 not measured / validBlind0 / units0 / continuous、固定19/71/参照、開始2026-09-13T20:56:49+09:00・期限2026-09-20T20:56:49+09:00を保持する。
