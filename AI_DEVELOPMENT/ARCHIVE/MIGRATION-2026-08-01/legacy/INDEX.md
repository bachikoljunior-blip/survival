# AI development operating index

このディレクトリは、製品文書を複製せずに、セッション継続・階層計画・機械検証可能な依存関係・証拠索引を保持する。

## 正本の対応

| 分類 | 正本 |
|---|---|
| 開発運用、セッション境界、権限、安全 | `PROJECT_OPERATING_PROTOCOL.md` |
| 製品要件と制約 | `docs/directive.md` |
| 承認済み設計、製品リスク、実装欠陥 | `docs/bible.md` |
| Gate A〜D の完了条件 | `docs/DONE.md` |
| 人間向けの検証済み現在地、判断理由、次の3件 | `docs/STATE.md` |
| plan/task ID、依存、状態、受け入れ追跡 | `AI_DEVELOPMENT/PROJECT_STATE.json` |
| 論理セッション、active frontier、checkpoint | `AI_DEVELOPMENT/SESSION_STATE.json` |
| 独立批評 | `docs/reviews/` |
| 運用上の決定 | `AI_DEVELOPMENT/DECISIONS.md` |
| 失敗した実行・手法と回復 | `AI_DEVELOPMENT/FAILURES.md` |

製品要件・設計・欠陥の本文を JSON やこのディレクトリへコピーしない。JSON は stable ID、edge、status、authority/evidence reference だけを持つ。

## 再開時に必ず読む順序

1. `PROJECT_OPERATING_PROTOCOL.md`
2. 本ファイル
3. `docs/STATE.md`
4. `PROJECT_STATE.json`
5. `SESSION_STATE.json`
6. active task が参照する `docs/directive.md` / `docs/DONE.md` / `docs/bible.md`
7. 関連する decision / failure / handoff / skill / evidence
8. 実リポジトリ差分と軽量 health check

`state_revision` が `docs/STATE.md` と2つの JSON で一致しない場合、先へ進まず実態を調べて同期する。意味上の競合は、実ファイルと実行結果を根拠に `docs/STATE.md` を修正し、その後 JSON projection を合わせる。

## 競合と履歴

権限順位は root protocol §1 に従う。置換された判断は削除せず `DECISIONS.md` に superseded として残す。失敗は `FAILURES.md`、obsolete session は `SESSION_ARCHIVE/`、task handoff は `HANDOFFS/` へ移す。active file は再読可能な大きさに保つ。

## 論理セッション

新しい chat/Work、ターン終了、commit、PR、task 完了、文脈圧縮はセッション終了ではない。`SESSION_STATE.json.end_declared_by_user` が true になれるのは、ユーザーが明示的に終了を宣言した場合だけである。その時だけ final handoff と archive reference を作り、status を closed にする。

## 検証

`npm run validate:ops` は JSON 構文、revision、ID/親/依存、循環、active task、frontier、受け入れ参照、evidence path、session close 条件を検査する。未実行の検査を pass と記録しない。
