最小転送修復候補はレビュー上採用可、blocking 0。独立したローカル検査は 28 件と、最終差分に対する拒否接続 cleanup 1 件が成功した。これは候補コードと転送 guard の判定であり、実 Safari の第三録音回収や音声品質の成功を示さない。remote / CI 起動 / retry / automation 変更は 0。

正規 App で latest head 789f2199bd3791a6dc6566eecaf3c1478c99afa6 を確認後、AGENTS.md → CLAUDE.md → AI_DEVELOPMENT/SESSION_STATE.yaml の順に再受理した。v3、sole remote writer=/root/integration_recovery_ultra。4 原 source は同 C36 の正規 Git blob と一致する。原 report は 4,472,434 bytes、SHA256 b2de6f0b9ce375082be62762ee2f880fd47ab0c2bfbcbb7f65923d44b1b2cbe8 と一致する。

原失敗として確定するのは、ページの結果が ready になり、host が宣言長を受理した後、chunk loop で「Safari audio chunk transfer timed out」となったこと。第三の JSON 文字数、media byte 数、各 command の遅延、完了済み offset は残っていない。safariAudioTransferFinal=null は共有 recorder の後続 cleanup evaluate が同じ slot を上書き・削除し得る実装と整合する。WebDriver 往復が支配的原因だったとは断定できない。

原取得は street-walk と cut-gas-air の 2 files。street の clock guard は false、gas は true のまま。frame-work の 1,853 rows / 3 recordings / complete=true / restored=true / dropped=0 は第三 media file の回収成功を代替しない。

候補は既存の loopback DIST server に録音後の同一 origin POST を追加する。大きな JSON reply の WebDriver 往復だけを置換し、小さい値は既存経路を使う。共有 recorder の bytes、MediaRecorder、duration、canvas/audio source、実時計 guard、許容差、移動 input、製品 source は変更しない。この限定変更は検証へ進める最小手段として妥当で、録音量の縮小や期限の延長を必要としない。

原 JSON 全文を一度 UTF-8 化してから byte chunk に分割するため、UTF-16 surrogate 境界を壊さない。新 POST は最大 131,072 wire bytes、従来の 131,072 chars ceiling より厳しい上限。全体は 50,331,648 UTF-16 chars を保持し、wire bytes は chars × 3 以下。receiver は session/operation nonce、origin/host/method/content type、id、sequence、offset、固定 total/chars、SHA256、完全 UTF-8 decode、元 byte への再 encoding、JSON parse を確認してから受理する。payload の省略・再生成・media 加工はない。

operation の 120,000 ms は開始前から固定され、chunk 到着で延長しない。個々の WebDriver command も残予算と 90,000 ms の小さい方に制限する。これは旧版の「command 間で期限確認、実行中 command は上限まで超過し得る」より強い制限である。host の operation 固有 receipt は最初の転送失敗と最後の page progress を保持し、後続 cleanup に消されない。同時 evaluate / receiver operation は拒否する。期限・中断・終了・拒否時には未完 socket を閉じる。

| 最終候補 | bytes | SHA256 |
| --- | ---: | --- |
| tools/ios_audio_transfer.mjs | 10435 | 55150670ce3a89c24b9b3348110e29f315d9479ac14438faadf14389987eb41a |
| tools/ios_audio_capture.mjs | 24880 | c0965004ba7d1e389300ab6556431d67ea1e158f82832225389851e0c1314f2a |
| tools/test-ios-safari.mjs | 33878 | f10f3715630046333451ea4cce1f31b13b5ccef277b12e365aeed25d474763b7 |

独立検査は実 Node HTTP sockets、VM で serialize した実 page function、WebCrypto、実 wall clock を使った。Unicode・非 BMP・孤立 surrogate を含む JSON の完全一致、誤 origin/host/method/content type/ID/offset/sequence/chars/total/hash/length、無効 UTF-8/JSON、nonce 不一致、重複、期限後の final、同時接続、client abort、未完接続 close、壊れた ACK、WebDriver failure、後続 cleanup 後の receipt 保持、evaluate 排他と失敗後の解放を確認した。VM の返値は WebDriver と同じ JSON serialization 境界を通した。実 Safari や録音を模擬結果に置き換えたものではない。

最終 module 変更は拒否接続 cleanup の 2 箇所のみと、28 件を通した版との全文差分を厳密確認した。追加の 1 件では unknown nonce と malformed origin に対し Content-Length=2 の本文を 1 byte だけ送り、end() を呼ばずに待った。404 / 400 応答後に server 側 socket が閉じ、強制 close なしで server.close が完了した。capture / harness は 28 件検査時から byte 不変。既存 28 件を目的なく反復していない。

IOS_AUDIO_PIN の 3 fields は既に独立検証済みの C37 候補値を保持する。

| field | exact value |
| --- | --- |
| preparedFromCommit | 789f2199bd3791a6dc6566eecaf3c1478c99afa6 |
| preparationReportSha256 | 2dbf5a5b15424ccd2e1e33e628391fad46084f4ec46686b70db1023d9061bf69 |
| bundleSha256 | 1094c1d96bed6b953c1655ce65549c484b8f09e275f055bff283499cece110f7 |

recorderBlob=785541d3beaed0e35e8bcf042973eabb7bdb5d6c は不変。新 module の source SHA を実 report provenance に結び付ける transferHelperSha256 の追加も確認した。新たな shell 実行、外部転送先、製品 network 経路、任意 file 書込は追加しない。

必要なコード改善は closure 済みで、残 blocking はない。実 Safari の fetch / Origin / Content-Length / WebCrypto 動作、第三の native media 回収、街の clock failure、実聴取、品質比較は未確認のまま。実回収後は原 report / bytes / provenance で確認する必要があるが、この担当は追加 CI や再録音を開始していない。

全 19 項目 not measured、valid blind 0、units 0、continuous。固定 19 / 71 / 参照を維持。開始 2026-09-13T20:56:49+09:00、期限 2026-09-20T20:56:49+09:00 は不変。
