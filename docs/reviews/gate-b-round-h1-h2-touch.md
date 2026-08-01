# 本ラウンド（GB-H1 / GB-H2 / GB-TOUCH-SMOKE）の独立批評

- **ゲート**: B
- **対象**: 統合後の `src/game/state.js` 移行層、`src/main.js` / `src/ui/screens.js` の fault と告知経路、`tools/save_migration.mjs` / `tools/fault_recovery.mjs` / `tools/touch_smoke.mjs`
- **批評者**: 相互不可視の独立エージェント3体。実装者の説明・`README.md`・`docs/STATE.md` を入力から除外
- **入力**: レンズA = **実装ソース非開示**（`dist/` の実ビルドと `docs/DONE.md` のみ）。レンズB1 = 3本の runner と証拠 JSON のみ（`src/` 不可）。レンズB2 = 移行層のソースと fixture のみ（`docs/*` と runner 不可）
- **日付**: 2026-08-01
- **独立性レベル**: レンズA = **A（source-blind）**、レンズB1 / B2 = **B（source-restricted）**

各レンズは使い捨てコピーで実験し、共有ファイルを変更していない。

## 指摘

| ID | severity | 指摘 | 対象箇所 | 証拠・再現手順 | 推奨対応 | 状態 |
|---|---|---|---|---|---|---|
| R2-1 | high | `migrateSave` がエンベロープの `v` だけを見て `ok` を返すため、`{v:2, state:{v:1}}` や `state` が配列・空オブジェクトのセーブが「読める」と判定され、`deserialise` が拒否 → 退避も告知もされず、直後の新規ゲームが上書きする | `src/game/state.js` migrateSave | `migrateSave({v:2,state:{v:1,chapter:3}})` → status `ok`、`deserialise` → false | ロード可否の判定を `deserialise` と同じ述語にする。state ブロックの形と内側の版を検査する | 解決済 — `looksLikeState()` を追加し、`ok` 経路でも `state.v === target` と進行フィールドの存在を要求。負例と検査を追加（`loader: a save whose versions disagree ...`） |
| R2-2 | high | `{v:1, state:[]}` が「移行成功」の緑通知つきで**進行を消す**。移行後の中身を誰も検査していない | 同上 | `migrateSave({v:1,state:[]})` → `migrated`、chapter 0 / 所持品なしで起動 | 各 step の出力が主張どおりの版に到達し、進行を落としていないことを検査する | 解決済 — step ごとに `next.v === v+1` と `keptTheProgress()` を要求。`a migration that empties the save fails instead of reporting success` を追加 |
| R2-3 | high | 退避スロットが先勝ちなのに、タイトルの文言は「スロットに何かあるか」で出る。過去のゴミが枠を占めていると、**退避していないセーブについて「退避した」と言う** | `state.js` `_rescue` / `main.js` タイトル文言 | ゴミを1件退避させた後に本物を読ませると `hasRescuedSave()` は true、本物は保管されていない | 退避を複数保持にし、`_rescue` は**その blob** が保管されたかを返す。文言はその戻り値で出す | 解決済 — 退避はリスト化（上限3件・512KB、満杯時は最小のものを捨てる）。文言は `lastResult.rescued` を根拠にする |
| R2-4 | high | 容量超過で退避が黙って失敗し、小さい新規セーブだけが書き込まれる。プレイヤーには「そのまま残してあります」としか出ない | `state.js` `_rescue` | 書き込み上限つき localStorage で再現 | 退避できなかったことを明示する文言を出す | 解決済 — `_rescue` は書けなければ false を返し、タイトルは `ui.savefile.notkept`（「複製は作れませんでした」）を出す |
| R2-5 | high | 移行は内側の `v` も上げるため、コメントの「旧ビルドはまだ読める」は偽。ロールバック時に旧ビルドが拒否 → CONTINUE 非表示 → 新規ゲームで上書き | `state.js` `SAVE_MIGRATIONS` | `git show 193f408:src/game/state.js` の `load()` が `state.v !== 1` を null 返しする | 偽のコメントを消し、旧形式のバイト列を保全する | 解決済 — 限定的。コメントを訂正し、**移行後の最初の保存前に旧バイト列を退避リストへ入れる**。ただし旧ビルドから復元する導線は無く、これは R2-9 として未解決 |
| R2-6 | critical | `save_migration.mjs` が保存キーを**被試験モジュールから import** しているため、保存先を全く別のアドレスに変えても 100/100 で通る。全プレイヤーのセーブが孤立する変更を検知できない | `tools/save_migration.mjs` | `SAVE_KEY` を別文字列に書き換えて `SAVE MIGRATION OK (100 checks)` / exit 0 | キーをリテラルで表明する | 解決済 — `PUBLISHED_SAVE_KEY` / `PUBLISHED_RESCUE_KEY` をリテラルで比較する検査を追加 |
| R2-7 | critical | `touch_smoke.mjs` が `controls.length >= 8` を見るため、**操作子が1個消えても通る**。回転後の再検査も `hud.buttons` しか見ない | `tools/touch_smoke.mjs` | `.sysbtn:last-child{opacity:0}` を入れて FAIL 0・検査数が 118→107 に減るだけ | 期待する操作子名を列挙し、欠落を FAIL にする | 解決済 — `REQUIRED_CONTROLS` 9件を名指しで検査。回転後も同じ9件を（`hidden` 判定つきで）再検査 |
| R2-8 | high | Playwright が落ちると**チェック出力も証拠 JSON も書かれず**、前回の `passed:true` の証拠がディスクに残る。`--force-failure` にも到達しない | 3本の runner | エラーハンドラを削除して再実行 → 例外で即死、証拠は `passed:true` のまま | 例外を捕まえて必ず報告と証拠を書く | 解決済 — `save_migration.mjs` と `fault_recovery.mjs` に `uncaughtException` / `unhandledRejection` を掴む `finish()` を追加。落ちた実行は `crashed` つきの `passed:false` を書く |
| R2-9 | medium | 退避したセーブを**プレイヤーが取り戻す導線が無い**。「別の場所に保管してあります」は devtools でしか開けないものを指している | `state.js` / タイトル画面 | `clearRescuedSave()` の呼び出し元が存在しない | タイトルに復元／書き出しを出す | 未解決 — 本ラウンドでは実装しない。R2-5 のロールバック復旧もこれに依存する |
| R2-10 | medium | `available()` が新規キーの書き込みで判定するため容量超過で false になり、「何も残りません」と言いながら既存キーへの上書きは成功する | `state.js` `available()` | 上限つき localStorage で再現 | 既存キーの書き換えで判定するか、文言を弱める | 未解決 — 記録のみ |
| R2-11 | medium | fixture の出自チェックが同語反復（`_provenance.save_version` は `state.v` の写し）。ドリフト検出の仕組みは削除され、README は存在しない生成器を案内していた | `tools/save_migration.mjs` / `tools/fixtures/README.md` | チェック式を展開すると `state.v===1 && state.v===1` | 記録された revision を git に問い合わせる | 解決済 — `git show <source_revision>:src/game/state.js` の `SAVE_VERSION` が 1 であることを実際に確認する検査に置換。README を実態に合わせて書き直した |
| R2-12 | medium | 反復判定が5秒窓に依存し、負荷の高い端末では同じ例外が窓を跨いで**永久に告知されない** | `src/main.js` onFault | レビュー3本と同時実行した際に実際に発生（同一例外3件・パネル出ず） | 同一メッセージの再来は窓に関係なく昇格させる | 解決済 — 同一メッセージ2回目で昇格。窓は「異なる例外の嵐」の判定にのみ使う |
| R2-13 | medium | `button: X shows the player it is pressed` が全ボタンの `.down` を数えるため、**別のボタンが光っていても通る**。回転後の貫通タップは横持ち座標を縦持ちへ丸めており、どこの操作子でもない場所を叩いていた | `tools/touch_smoke.mjs` | 該当行の読解と再現 | 当該ノード自身を見る／縦持ちの実測座標を使う | 解決済 — `thisOne` と `others === 0` に分離。貫通タップは縦持ちで実測した位置を使う |
| R2-14 | medium | 「ゲームが保存した」が定期オートセーブと区別できない。`stall` の判定はホスト速度依存。歩行判定は壁時計依存で、動く実装でも落ちる | `tools/fault_recovery.mjs` / `touch_smoke.mjs` | 同一ビルドで 0.39m 実測・ja レンズが実行ごとに変動 | フォールト起因であることを分離し、フレーム基準に直す | 解決済 — 保存前に「他に書き込む予定が無い」ことを確認。`stall` は経過時間を測り、測れない場合は pass にせず未計測と記録。歩行は**フレームあたり**で判定 |
| R2-16 | high | **退避は起動時（load）にしか存在しない。** セッション実行中に読めないセーブがスロットに現れると（新しいデプロイ、同一オリジンの別タブ）、保存経路が中身を確認せず上書きする。告知なし・退避なし | `src/game/state.js` `Storage.save` | レンズA が実ビルドで再現: 起動→22秒プレイ→スロットを `{"v":3,…}` に差し替え→28秒プレイ→再読込。v3 のバイト列は**どのキーにも残っていない**。CONTINUE は出て警告は出ない | 書き込む前にスロットの中身を読み、このビルドで読めないものなら先に退避する | 解決済 — `Storage.save` が既存バイト列を検査し、読めないものを先に退避する。検査 `write: and the save it could not read was copied first` と負例 `a write path that overwrites without looking` を追加 |
| R2-17 | high | **ゲーム自身のイベントバスが例外を握り潰すため、描画が死んでも誰も気づかない。** `render` リスナ内の例外で GL 描画コールが 4秒124回→0回 になっても、ループと HUD と時計は動き続け、パネルもトーストも出ず、`console.error` が10秒で659件出るだけ | `src/core/util.js` `Emitter.emit`, `src/main.js` | レンズA が `drawArrays`/`drawElements` を計装して実測 | 握り潰した例外を fault 経路へ回す | 解決済 — `onSwallowedError()` を追加し、`main.js` が `listener` 種別の fault として扱う（反復するので昇格する）。検査 `swallowed: an error the event bus caught still reaches the fault path` を追加 |
| R2-15 | low | 負例は layer 1 / 1b のみを再実行し、**ブラウザ層には自動負例が無い**。「何かが落ちた」だけで合格とし、例外を捕まえたことも合格に数えていた | `tools/save_migration.mjs` | 負例ハーネスの読解 | 各負例を「落ちるべき検査」に紐付ける | 解決済 — 限定的。各負例が**指定した検査名**で捕まることを要求。例外は別扱いで併記。ブラウザ層に自動負例が無いことはファイルと証拠に明記した |

**未解決 high: 0。未解決 medium: 2（R2-9, R2-10）。**

レンズA（実装ソース非開示）は claim 1 を **FAIL** と判定した（R2-16）。claim 2 / 3 / 4 は PASS。ただし**レンズA が叩いたのは 10:36 時点のバンドル**であり、他レンズの指摘に対する修正は入っていない。R2-16 と R2-17 は修正後に本レビュー用の検査で再現・回帰化してあるが、**レンズA 自身による再検証は行われていない**。

## 実装側が取り下げた主張

- 「保存キーを版非依存にする」— 撤回した。ロールバック時に旧ビルドが新アドレスを見に行かず、同じ事故を別の形で起こす。キーは `cinderline.save.v1` のまま据え置き、版はエンベロープが持つ。
- 「多段連鎖は未実行」— 注入レジストリで 1→2→3 を実走する検査があるため、機構としては実証済み。ただし**本番に登録された step は1つ**であり、実データによる多段移行は依然として未実行。
