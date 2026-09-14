独立コードレビューは **pass、blocking 0 件**。対象は C39 `dff2d683d0a9821c79d84848bf93cb45b8920494` / tree `18bf6fb6597c2ef5d8cf96800b1761cdeea3827d` を基点とする、既存 save 修復用の `src/game/state.js` 1 file。候補 34,503 B、SHA-256 `356d2bb3d3ae1b019e38bd73c05778ff67b048cffa9775d5bad052fc9d118530`。C40 の 5 path に追加した状態ではなく、別の未 build 候補として採用可能と判断する。

正規 latest head → AGENTS.md → CLAUDE.md → SESSION_STATE.yaml を再受理した。基点 state.js の全文は新たな正規 GitHub 読取と byte 一致を確認。依存・経路を含む 13 原 file は、同一セッションで独立確認済みの正規 C39 pin と全 byte の size / SHA-256 / Git blob を照合した。候補の全 2 hunks と周辺処理を読み、逆変換で元 state.js 全 byte を復元した。Storage、validation、SAVE_VERSION=2、既存 migration は byte 不変。

変更は deserialise 時に、既知の Iris journal の id・title・旧英語本文全文が一致した entry をコピーし、その期間だけ修復する。旧本文は正規会話の実 effect と完全一致し、修復後は凍結済み C40 本文と完全一致する。異なる id/title、末尾空白、改行差、custom 文、日本語文、既修正文は保持する。追加 field、journal の時刻、順序、件数、他 entry と進行を保持し、journal / choice / trust 等の effect event を追加で発火しない。

独立 CPU controls は 15 件 pass。凍結した入力 payload の非変更、近似した 9 entry の除外、重複 entry、全 serialized 進行の旧 reader との差分、invalid 入力の拒否、optional journal の既存 default、実 Storage save→load→deserialise→save、v1→v2 と次回保存時の原 bytes 救済、冪等性、修正前 v2 reader との互換性を確認した。C40 本文を持つ実 DialogueRunner の英日 effect も旧 state reader と同じ進行を生成し、旧 save 読込後の英語 fallback と日本語翻訳が修正文に解決された。

Storage.inspect / load / hasSave は保存 slot と旧 payload 本文を書き換えず、実行状態に反映した修正文は次の通常 save で保存される。journal の時刻は保持され、通常保存が生成する metadata の処理も不変。検証は Node v24.19.0、合成 save と in-memory Web Storage API を使用した。Date.now は全 serialized field の比較用 fixture 内だけ固定した。初回の独立 harness に envelope を state として渡す誤りがあり、harness 1 行だけを修正して再実行した。候補の変更や欠陥として数えていない。

この修復は既知旧本文の読込時に限る。C39 の旧新規取得本文を取得直後に修復する機能は含まず、C40 の本文修正と併用する別段階の候補である。現在の C40 locked inputs に混ぜていない。将来、この state source を含む正式な locked build と実ブラウザーの起動・save/locale 表示の確認が必要。今回の実 build / browser / CI / root 生成 / 画面は 0、新 root SHA は unknown、現 root と pin の採用変更も 0。

公開記録は publication-allowlist.json の exact file / hash だけ。開始 `2026-09-13T20:56:49+09:00`、期限 `2026-09-20T20:56:49+09:00`、全 19 not measured、71 基準、固定 10 参照、valid blind 0、units 0、continuous を保持する。品質比較ではない。独立担当の local Git / remote write / CI 起動 / 新 spawn / Library access は 0。
