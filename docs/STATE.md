# STATE — 進捗の唯一の情報源

<!-- state_revision: 2026-08-01.2 -->

<!--
  ⚠ この HTML コメントの `state_revision` 行を削除・改変しないこと。
  `npm run validate:ops` は、この値が AI_DEVELOPMENT/STATE.yaml・WORK_GRAPH.yaml・
  REQUIREMENTS.yaml・CAPABILITIES.yaml・POLICIES.yaml と一致することを要求する。
  一致しなければ validate:ops が失敗し、.github/workflows/pages.yml の build job が
  止まり、公開が古いまま静かに固定される。
  本文書を書き換えるときは、この行を必ず残し、状態を変えたなら5ファイルすべてを同じ値に上げること。

  ⚠ 本文書を docs/STATE.md 以外へ移動・改名しないこと。
  .github/workflows/autopilot.yml は ALL_DONE 判定をこのパスに対して行う（`git show "$REF:docs/STATE.md"`）。
  パスが変わると grep は何も見つけられず、**完了による連鎖停止条件が二度と発火しない**（fail-open）。
  同じことが緊急ブレーキ `docs/STOP` にも当てはまる。
-->


`docs/directive.md` §19 が要求する継続プロトコル文書。

**記憶を持たない新しいエージェントが再開できるように書くこと。** 再開時は `START_HERE.md` → `AI_DEVELOPMENT/STATE.yaml` → 本文書の順で読み、active task が参照する製品文書へ進む。運用規約の全文は `AI_DEVELOPMENT/PROTOCOL.md`。旧 `PROJECT_OPERATING_PROTOCOL.md` と2つの JSON state は 2026-08-01 の移行で `AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/legacy/` へ退避した（内容は不変のまま保存されている）。

最終更新: 2026-08-01 / 作業ブランチ `main` / 検証済み基点 `cc96f3a`

---

## 0. 30秒で把握するための要約

このリポジトリは **CINDERLINE** という、モバイルWeb向け三人称オープンワールド アクションRPG である。地下炭層火災で放棄された都市ホリスが舞台で、一酸化炭素が低地に溜まるため「高い場所は生きられ、低い場所は死ぬ」。**プレイヤーの経路判断は全て空気についての判断である。**

**ゲームは既に動く。** 5つのエンディング全てに実際のプレイで到達でき、日本語対応済み、外部アセットゼロ（テクスチャ・音・モデルは全て実行時生成）。約25,000行。

**残作業の中心は、既存コンテンツを `docs/directive.md` §16 の Gate B / C / D まで引き上げることである。** ただし `docs/bible.md` IMP-03 の BREAKER / DOG 遭遇は、Gate C の確定数値を保つ場合に限り、対象を絞った新規コンテンツを必要とする。

**製品文書の読順**: `docs/directive.md`（製品規則）→ `docs/bible.md`（設計）→ `docs/DONE.md`（完了条件）。運用上の読順は `START_HERE.md` を正とする。
**README.md を設計の根拠にしてはならない**（§14）。実装者の自己申告文書であり、実装との食い違いが実際に発見されている。

---

## 1. 現在フェーズ

**Gate A（創作基盤）通過。次は Gate B（代表的バーティカルスライス）。**

§16 は「Gate A を通過するまで、広範なコンテンツ生産を始めない」と定める。通過したので着手してよいが、**Gate B は品質ゲートであって最終成果物ではない**。

### Gate A の判定根拠

| # | 条件 | 判定 | 根拠 |
|---|---|---|---|
| A1 | 複数方向を検討した | ✓ | 相互不可視の独立エージェント3体＋既存実装を7軸で比較（`docs/reviews/gate-a-concepts.md`） |
| A2 | 選択案に明確な独自性がある | ✓（**縮小後**） | 当初4点→**2点**。批評が2点を無効と判定した（1点は §8 への準拠であって独自性ではない、1点は反証された） |
| A3 | ゲームプレイ・物語・世界が相互に支え合う | ✓ | 物語批評が「主題との結合は後付けの理屈ではない」と判定 |
| A4 | バイブルが内的に一貫している | ✓（**大幅修正後**） | 批評が6件の critical を出し、全てバイブルの記述を実装準拠に修正して解消した |
| A5 | スコープがプラットフォームに対して信頼できる | ✓（**留保付き**） | コンテンツは生産済み。ただし想定プレイ時間は未計測で過大の疑いあり、敵2種は未配置 |
| A6 | スコープ確定数値が記載されている | ✓ | `node tools/check_scope.mjs` exit 0。加えて `--against-content` が実コンテンツと突合して exit 0 |
| A7 | 未解決の critical が無い | ✓ | `node tools/check_reviews.mjs --gate A` exit 0。critical 6件すべて解消 |

**Gate A は無傷では通っていない。** 独立批評2件が critical 6件・high 10件を出し、そのほぼ全てが「バイブルが実装より良く書かれている」型だった。詳細は §8 の決定変更表。

---

## 2. 完了分

| 項目 | 成果物 | 検証 |
|---|---|---|
| リポジトリ現状調査（§21-1） | 本文書 §5 | 実測（`npm run validate`、5経路通しプレイ） |
| ディレクティブ設置 | `docs/directive.md` | コミット済み |
| 完了判定の作成（§21-3 / §18） | `docs/DONE.md` | Gate A〜D をそのまま転記。新基準を発明していない |
| Gate A 用検証スクリプト2本 | `tools/check_scope.mjs`, `tools/check_reviews.mjs` | **入力が無い状態で正しく非ゼロ終了することを確認済み**（失敗しない検査は何も証明しない） |
| 創作ディスカバリー（§21-4 / §5） | `docs/reviews/gate-a-concepts.md` | 相互不可視の独立エージェント3体＋既存実装を7軸で比較 |
| 既存実装の技術監査（§0） | `docs/reviews/audit-incumbent.md` | 独立エージェント。README を根拠にすることを禁止。critical 0 / high 2 |
| プロダクションバイブル（§5） | `docs/bible.md` | スコープ確定数値6項目を記載。`node tools/check_scope.mjs` が通る |
| アセット台帳（§3 / §9） | `docs/assets.md` | 実行時依存は three.js のみ。外部アセット0 |
| 実機テスト手順書（§13） | `docs/device-test-checklist.md` | **実施回数 0** と明記 |

### 本セッションで実際に走らせた検証

| コマンド | 結果 |
|---|---|
| `npm install` | 成功（5パッケージ） |
| `npm run validate` | **VALIDATION OK** — 対話ノード224 / クエスト9 / ステップ31 / エンディング5 / フラグ設定66・参照55 |
| `npm run build` | 成功。本番バンドル 1.3MB |
| `npm run test:play` | **PLAYTHROUGH OK** — 5経路すべて成功。`record` / `cut` / `westward` / `everybody` / `nothing` の5つの異なるエンディングに、実トリガ経由で到達（フラグ直書きなし） |
| `node tools/check_scope.mjs` | OK（6項目すべて数値記載あり） |

### 2026-07-31 継続 checkpoint

| コマンド | 結果 |
|---|---|
| `npm run validate:ops` | **OK** — revision / task graph / active session / evidence path を検証 |
| `npm run test:gate-b` | **OK（範囲限定）** — 19負例を全て非ゼロ拒否して各回の最新証拠を `passed:false` にした後、fresh 667×375 emulation 2回とも 302.6m、非免疫・filter無しで 857ppm / saturation 0.229、通常 combat 10 hit / 3 kill、9092 engine/game/combat step、browser error 0。`AI_DEVELOPMENT/EVIDENCE/GB-IMP06-SLICE.json`。**C1/D3・全編実走・実機・プレイ時間の証拠ではない。** |
| `npm run validate` / `npm run i18n` | **OK** — content 224 dialogue nodes / 9 quests / 5 endings、翻訳 882/882、用語 rejected variant 0 |
| `node tools/check_scope.mjs --against-content` | **OK（留保付き）** — 記載数値と実コンテンツは一致。playtime は未計測、breaker/dog は未配置と明示 |

初回から最終までの独立 source-aware review は、placement/HP、stale evidence、computed resolver、mutable attack definition、nested damage の high を順に実証し、その都度合格を撤回した。現行 hash を対象にした最終 closure（`docs/reviews/gate-b-imp06-slice-closure-current.md`）は、全19負例・最終clean・共有evidence bindingを別コピーで再実行し、**この代表スライスの限定範囲では未解決 high 0 / PASS**と判定した。過去のFAIL reviewは削除せず根拠履歴として保持する。

2026-07-31 のユーザー最新指示により、**検証済み checkpoint の remote push、merge、public publication/deploy は chat / Work / logical session の切替後も永続的に承認済み**となった。これは都度承認規則の当該3操作だけを置換する。PR #2 と公開互換修正 PR #3 は `main` へmerge済みで、GitHub Pages の2経路は成功し、公開HTML・JavaScript・CSS・manifestは本番buildとSHA-256一致した（その時点の検証済み基点は `cc96f3a`）。詳細は `AI_DEVELOPMENT/EVIDENCE/OPS-REMOTE-PUBLISH.md`。次のactive taskは `GB-H1` である。

### 2026-08-01 運用レイヤ移行 checkpoint（プロダクトは無変更）

旧 `PROJECT_OPERATING_PROTOCOL.md` / `AI_DEVELOPMENT/INDEX.md` / 2つの JSON state を、正本
`AI_DEVELOPMENT/`（`STATE.yaml` / `WORK_GRAPH.yaml` / `REQUIREMENTS.yaml` / `POLICIES.yaml` /
`CAPABILITIES.yaml` / `LEDGER.jsonl` / `SCHEMAS/`）へ移行した。入口は `START_HERE.md`、規約全文は
`AI_DEVELOPMENT/PROTOCOL.md`。旧記録は `AI_DEVELOPMENT/ARCHIVE/MIGRATION-2026-08-01/legacy/` に
**内容不変のまま**保存し、rollback 手順は同 `ROLLBACK.md`、対応表は `RECORD_MAP.md` にある。

**プロダクトの挙動・ビルド・公開物は一切変更していない。再公開もしていない。** 論理セッション
`SESSION-2026-07-31-01` は active のまま、目的と active task `GB-H1` はそのまま引き継いだ。

移行中に照合で見つかった記録と実態の食い違い（すべて修正済み。詳細は `LEDGER.jsonl`）:

| # | 食い違い | 対応 |
|---|---|---|
| 1 | 検証済み基点が `cc96f3a` のままだったが、実 HEAD は `193f408`。その2commitは記録自体を変更していた | 基点と rollback point を `193f408` に訂正。公開面でハッシュ照合済みの revision が `cc96f3a` である点は別途明記 |
| 2 | 作業ブランチが `main` と記録されていたが実際は移行ブランチ | 実態に合わせた |
| 3 | frontier に `GB-IMP02` と `GC-IMP06-FULLRUN` が欠けていた（条件は満たしていた）。旧 validator は「列挙漏れ」を検出できない設計だった | frontier を**導出値**に変更し、`validate:ops` が再計算して照合するようにした。選択順は不変で active task は `GB-H1` のまま |
| 4 | PR #4 が merge 済みなのに証拠記録が無かった | Pages run `30663264871` の成功と、`193f408` が記録のみの変更であることを確認して記録。公開ファイルのハッシュ再採取はしていない（その旨も記録） |
| 5 | `GB-H1` の理由が「action 2」を指していた（本文書では action 1） | 訂正 |
| 6 | §5 の規模数値が実態から乖離していた | 再計測して訂正 |
| 7 | 所有権マップに `src/main.js`（`GB-H2` の対象）とルート生成物の所有者が無かった | 追加 |
| 8 | `check_done_table` / `check_scope` / `check_reviews` はどの npm script からも実行されない | `OPS-GATE-WIRING` として **proposed** で記録。範囲を勝手に広げないため、この移行では配線しない |

移行で実行した検証: `yaml_selftest`（50件、うち約半数は失敗を検出できることの確認）、`validate:ops`、
`resume_check`（**旧記録と同じ再開地点に到達することを機械的に照合**）、`validate`、`check_done_table`、
`check_scope --against-content`、`check_reviews --gate A`、`build`、`validate:pages-root`。
validator 自体にも14件の故障注入を行い、すべて期待どおり非ゼロ終了することを確認した。

`tools/gate_b_slice.mjs` は evidence の binding 元を `PROJECT_STATE.json` から `STATE.yaml` へ1行変更した。
**必須ゲートへの変更なので推測せず実行した**: `npm run test:gate-b` は19の負例をすべて非ゼロ拒否したのち、
fresh 667×375 の2回とも `distance=302.6m / 857ppm・saturation 0.229 / hits=10 / kills=3 / hp=97.4` と
**2026-07-31 と同一の数値**を再現した（browser error 0、driver SHA-256 も不変）。
証拠 `GB-IMP06-SLICE.json` の `bindings.state_revision` は陳腐化していた `2026-07-31.6` から
`2026-08-01.2` へ再採取された。**範囲は変わらない — 依然として C1/D3・全編実走・実機・プレイ時間の証拠ではない。**

### 移行中の実態照合で見つかった記録の欠落（すべて訂正済み）

- `docs/DONE.md` の実装状況表に **B2 / C5 / D7 の行が欠けていた**（3項目とも自動検証 **可** と宣言しながら
  スクリプトが存在しない）。`check_done_table.mjs` は**存在する行しか歩かない**ため検出できない欠落方向だった。3行追加（現在14行）
- `GATE-C` / `GATE-D` の status `pending` はどの語彙にも無い値だった → `accepted`（合意済みだが着手不可）に対応付け。
  `ready` にはしない（着手可能だと偽ることになる）
- `D11` を `refuted` と判定していたのは**否定の側への過剰主張**だった → `not_verified` に訂正。
  受け入れ表の証拠なし行は「主張していない」のであって「失敗が確認された」のではない
- `C1/C3/D3/D4` の tool_status を `partially_implemented` → `implemented`（DONE.md は実装済み・**範囲**限定と書いている）
- Gate A の未解決 high は10件ではなく **3件**（N-03/N-04/N-06 = IMP-12/IMP-13/IMP-14）。Gate A の通過は阻害しないが未解決である
- 運用記録が英語で書かれている件（`REQ-ENG-06`）を `satisfied` → `partially_satisfied` に訂正し、**OD-008 として明示記録した**。
  ゲーム内テキストは日本語 882/882 で検証済み。運用層の日本語化を望むなら機械的に可能
- 所有権マップに `src/main.js`（次タスク GB-H2 の対象）とルート生成物の所有者が無かった → 追加
- `.github/workflows/autopilot.yml` は `claude-code-action` を使うため **`CLAUDE.md` を自動で読み込む**。
  loader を追加すると全 autopilot ラウンドの挙動が変わるが、autopilot.yml は変更禁止パスなので調停は
  `CLAUDE.md` 側に置いた（「autopilot から起動された場合も STATE.md の3アクションが範囲を縛る」）

**`check_reviews --gate B` は依然として失敗する（未解決 high 2件: H1 / H2）。これは移行による退行ではなく、
`GB-H1` と `GB-H2` が frontier である理由そのものである。** 隠していないし、再分類もしていない。

---

## 3. 次の3アクション

**§19 は「次の3アクション」を具体的な作業として書くことを要求する。範囲を広げないこと。**

この表示は `AI_DEVELOPMENT/WORK_GRAPH.yaml` の task graph から導く。frontier は「ready/active の leaf で、依存が全て verified のもの」という定義から**導出される派生ビュー**であり、`AI_DEVELOPMENT/STATE.yaml` にキャッシュされているだけである。`npm run validate:ops` が再計算して一致を検査するため、キャッシュが第二の正本になることはない。task 完了、ターン終了、commit、PR は checkpoint であり、ユーザーの明示宣言がない限り論理セッションを終了しない。プロジェクト完成は `ALL_DONE` 条件と別である。

### アクション 1 — H1: セーブマイグレーションを追加する（active）
`src/game/state.js:292,357` にはマイグレーション層がなく、version を上げると既存進行が警告なく破棄される。`migrate(d)` を追加し、旧version fixture、段階移行、失敗時の明示通知、save/load回帰を検証する。

### アクション 2 — H2: 起動後エラーから回復できるようにする
`public/index.html:92` と `src/main.js:31` を対象に、`window.onerror` と `unhandledrejection` を起動後も既存回復パネルへ接続する。正常起動、同期例外、rejected promise、再試行をユーザーsurfaceから検証する。

### アクション 3 — 実際に見えるタッチ操作を667×375で駆動する
`GB-TOUCH-SMOKE` として、画面上の移動・カメラ・攻撃・回避・防御・会話ボタンを実タッチ座標から操作し、44px目標、重なり、誤操作、同時入力、向き変更を検証する。既存のGate B代表スライスはproduction input chainを通るが、見えるhit target自体の証拠ではない。

**その次**は `GB-IMP02`、`GC-IMP06-FULLRUN` の優先度を再計算する。IMP-02、Vitest、IMP-01/03/04/05 ほかの詳細は `docs/bible.md` §17b を正とする。

---

## 4. ブロッカー

| # | ブロッカー | 影響 | 誰が解けるか |
|---|---|---|---|
| B1 | **実機が存在しない。** iPhone SE 第3世代での検証が一度も行われていない | Gate D の性能項目が原理的に自動検証できない。30 FPS 目標は設計目標であって計測ではない | **人間のみ。** `docs/device-test-checklist.md` を実機で実行する必要がある。それまでいかなる実機性能主張もしてはならない（§13） |
| B2 | 日本語がネイティブ話者に読まれていない | 語調・語感の品質が保証できない。自動検査（用語一貫性・欠落キー・レイアウト崩れ）は通っている | 人間のみ |

**B1・B2 はどちらも作業を止めるものではない。** 他の全ての作業は継続してよい。ただしこの2点について**検証済みであるかのように書いてはならない。**

---

## 5. リポジトリ現状（§21-1 の調査結果）

### 規模

**2026-08-01 に再計測した（移行コミット時点）。** 以前の記載（`src/` 25,356行 / `tools/` 44ファイル 5,322行）は
Gate B ツール群と運用ツール群の追加後に更新されておらず、実態と乖離していた。§8 に記録した原則
「**数える作業も計測であり、grep の目視は計測ではない**」は、この表自身にも適用される。

| | |
|---|---|
| `src/` | 38ファイル / 25,388行（エンジン19,446 + コンテンツ5,942） |
| `tools/` | 54ファイル / 8,693行 |
| `AI_DEVELOPMENT/` | 44ファイル（うち archive 13） |
| `public/styles.css` | 1,046行 |
| 実行時依存 | `three@0.180.0` のみ |
| 外部アセット | **ゼロ**（画像・音声・モデル・フォントのファイルが1つも無い） |
| ネットワーク要求 | **ゼロ** |

### 構成
`core/`(4) `render/`(4) `world/`(7) `actors/`(4) `game/`(6) `ui/`(2) `audio/`(1) `content/`(9)

### ディレクティブとの既知の差異
| §0 の指定 | 現状 | 判断 |
|---|---|---|
| Vite | esbuild + 自作 `build.mjs` | **意図的に継続。** 相対パス・`.nojekyll`・再現ビルドという実質要件を既に満たしており、乗り換えの利得が無い。理由は `docs/bible.md` §0 に記録 |
| Vitest | 無し | **改修対象。** `docs/bible.md` R-06。現在のアクション3 `IMP-02` と混同しない |
| CI で PR ごとに lint + test + build | `pages.yml` が `main` で validate + build のみ。PR ワークフローが無い | 改修対象。**`.github/workflows/autopilot.yml` には触らないこと** |

---

## 6. 所有権マップ（§14）

**複数エージェントが同一ファイルを同時に編集しない。** サブシステムごとに所有者を定める。

| 領域 | 所有ファイル | 担当 |
|---|---|---|
| 主統合 | `docs/*`, `package.json`, `build.mjs`, `.github/workflows/pages.yml` | 主統合者。**製品ビジョン・アーキテクチャ・受け入れ表・統合・最終リリース判断を持つ** |
| 創作と物語 | `src/content/story.js`, `src/game/narrative.js`, `src/game/director.js` | 物語担当 |
| ワールドとミッション設計 | `src/content/world_data.js`, `src/world/city.js`, `src/world/buildings.js`, `src/world/props.js` | ワールド担当 |
| 戦闘・進行・AI・物理・ゲームフィール | `src/game/combat.js`, `src/game/ai.js`, `src/game/state.js`, `src/world/collision.js`, `src/world/nav.js`, `src/actors/*` | ゲームプレイ担当 |
| 環境アート・VFX・テクニカルアート | `src/render/*`, `src/world/geom.js`, `src/world/gas.js` | アート担当 |
| モバイル入力・UI・アクセシビリティ・オーディオ・性能 | `src/core/input.js`, `src/core/engine.js`, `src/main.js`, `src/core/rng.js`, `src/core/util.js`, `src/ui/*`, `src/audio/*`, `public/styles.css`, `public/index.html` | プラットフォーム担当 |
| 自動QAと通しプレイ検証 | `tools/*` | QA担当 |
| 運用記録（正本と履歴） | `CLAUDE.md`, `START_HERE.md`, `AI_DEVELOPMENT/*` | 主統合者 |
| **生成物（手で編集しない）** | ルート直下の `index.html`, `styles.css`, `cinderline.*.js`, `manifest.webmanifest`, `icon.svg`, `.nojekyll`, および `dist/` | **所有者なし。** `npm run build:pages-root` が生成する。`public/` 側を編集して再生成する（OD-005 / OF-006） |

**インターフェースを先に定義し、小さく検証しながら統合する。** 各担当は変更前に既存の作業を調査し、変更内容・理由・テスト・計測結果・残存リスク・影響ファイルを報告する。

### 批評者の独立性（§14）
**機能を作ったエージェントが、その機能を承認する唯一のエージェントであってはならない。**

批評エージェントの入力は、リポジトリ内の成果物・実際のビルド・`docs/DONE.md` の受け入れ基準のみ。**実装エージェントの報告や要約、および `README.md` を入力にしてはならない。**

この規定は空論ではない。本セッションで、README が「空気ゲージはタップできる」と書いている機能が実装されておらず（`src/ui/hud.js:78-84` のコメントが明示的に否定している）、その誤りが一度バイブルに転写された。独立監査が無ければ残っていた。

---

## 7. 受け入れ表

**全ての主張には証拠が必要である**（§16 Gate D11）。証拠の無い行は主張してはならない。

| # | 主張 | 証拠 | 種別 | 状態 |
|---|---|---|---|---|
| 1 | 物語グラフに参照切れ・到達不能分岐・死んだ帰結が無い | `npm run validate` → VALIDATION OK | 自動 | **検証済**（本セッション実行） |
| 2 | 5つのエンディング全てに**物語グラフ上**到達できる | `npm run test:play` → PLAYTHROUGH OK、5経路が5つの異なるエンディングに到達 | 自動 | **検証済（範囲限定）** — harness はテレポート・ガス免疫・直接ダメージで走る。**歩行可能性・生存可能性・戦闘成立性は検証されていない**（IMP-06） |
| 3 | 本番ビルドが成功し、静的・相対パスである | `npm run build`、`build.mjs:36-63`、`public/.nojekyll` | 自動 | **検証済** |
| 4 | シミュレーションが固定ステップでフレームレート非依存 | `src/core/engine.js:13,318,327-333` | コード | **検証済**（監査＋主統合者が個別確認） |
| 5 | ガスがプレイヤー生存・敵生存・視程を支配する | `src/actors/actor.js:608-623`, `src/game/ai.js:76,164-170` | コード | **検証済。** ただし視程は本編で作用しない（敵が全員 `aggro=true` で生成される。IMP-04） |
| 6 | 信頼値が UI に出ない | — | — | **反証された。** 5段階の語で常時表示され（`src/ui/screens.js:473-487`）、信頼変動47件中38件が色付きトースト。**主統合者が「QUIET が存在する」ことだけを確認して検証済みとしたのが誤り**（IMP-02） |
| 7 | 進行が数値ではなく能力である（7種、各々 diegetic な解放条件） | `src/game/state.js:25-61` | コード | **検証済**（主統合者が個別確認） |
| 8 | 外部アセットとネットワーク要求がゼロ | 監査（`fetch`/`XHR` の grep 0件）、`docs/assets.md` | コード | **検証済** |
| 9 | スコープ確定数値6項目がバイブルに記載されている | `node tools/check_scope.mjs` → exit 0 | 自動 | **検証済** |
| 10 | 性能記述に実機主張が混入していない | `tools/perf.mjs:2-20,184-187`（SwiftShader 明記、fps 出力を拒否）、監査 | コード | **検証済** |
| 11 | ガスが AI の**経路選択**を支配する | — | — | **未検証**（視程と退避は確認済み。経路そのものは未確認） |
| 12 | 667×375 で全画面がタッチ操作可能 | 監査で大半を確認。ただしマップはパン/ズーム無し、チュートリアル画面は存在しない | コード | **部分的**（監査 M8） |
| 13 | §13 の描画予算を満たす | — | — | **未達**（ドローコールが medium で超過。影キャスタ数未達。監査 §13 表） |
| 14 | 実機で 30 FPS を満たす | — | — | **原理的に未検証。** 実機が存在しない。**主張してはならない**（§13） |
| 15 | 想定プレイ時間 3〜5時間 | — | — | **未計測の見積もり。** バイブル §16 に見積もりと明記済み。Gate C までに実測する |

---

## 8. バイブル確定後の決定変更

| 日付 | 変更 | 理由 |
|---|---|---|
| 2026-07-30 | スコアカードの D「モバイル実現性」を 5 → 4 に下げ、合計 31 → 30 | 独立監査が §13 の明示的要求3項目（チャンクストリーミング／AI更新のずらし／距離によるアニメーション間引き）の未実装を file:line 付きで示したため。証拠を受けても動かないスコアカードは追認でしかない |
| 2026-07-30 | バイブル §14 の「空気ゲージはタップできる」を「タップできない」に修正 | README の記述をそのまま転写していた。実装（`src/ui/hud.js:78-84`）はタップを明示的に拒否している。**§14 が README を批評の入力として認めない理由の実例** |
| 2026-07-30 | スコープ確定数値のエリア数を 15（屋外9/屋内6）→ **14（屋外8/屋内6）** に訂正 | grep での数え間違い。`src/content/world_data.js` を実際に実行して `regions.length === 8` を確認した。**数える作業も計測であり、grep の目視は計測ではない** |
| 2026-07-30 | **独自性の主張を4点→2点に縮小** | 批評が2点を無効と判定した。「進行が数値ではなく能力」は §8 への**準拠**であって独自性ではない（範疇の誤り）。「信頼が UI に出ない」は反証された。**数を保つために弱い項目を残さない**（§4 の原則を独自性主張にも適用） |
| 2026-07-30 | **主柱を「ガスが4つを支配する」→「3つ」に縮小** | 4つ目の AI 経路が、バイブルが引用した行に存在しなかった。実体の `applyGasCost` は `city.js:147` の1回きりで、`rigVent`・風・危機のいずれにも追随しない。**プレイヤーが動かしたガスは敵の経路を変えない。** 引用行を実在する `nav.js:281-290` に差し替えた |
| 2026-07-30 | §16 の「削らない」判定の**根拠**を差し替え | 当初の根拠「5経路の通しプレイで到達可能性が検証されている」が事実に反していた。harness はテレポート・ガス免疫・直接ダメージで走る。判定は維持するが、根拠は「コンテンツが既に生産済みである」ことのみに限定した |
| 2026-07-30 | 「残作業はコンテンツ量の追加ではない」という断定を撤回 | BREAKER と DOG の遭遇設計は定義上コンテンツの新規生産であり、これ無しに Gate C2 は通せない |
| 2026-07-30 | 敵アーキタイプ数の記載を「5」→「**定義5 / 本編配置3**」に変更 | BREAKER と DOG が本編に一度も出現しない。`node tools/check_scope.mjs --against-content` が両方を実測するようにした |
| 2026-07-30 | バイブル §12 から「約950三角形」を削除 | 出所がコードに無かった（`grep -rn "950" src/` 該当なし）。**計測して書く。それまで書かない** |
| 2026-07-30 | バイブル §0 から初期ペイロードの数値を削除 | 唯一の出所が README.md であり、バイブル自身が「設計の根拠にしてはならない」と宣言した文書だった。`shots/` は `.gitignore` されており再現可能な計測成果物が無い |

---

## 9. 作業規則の再掲（§20 — 毎回読むこと）

- 編集前に既存リポジトリと現状を調査する。無関係な作業を保全する
- 計画・設計文書・モックアップ・メニュー・バーティカルスライスで止まらない
- 実装の欠落を、それがあればどうなるかという説明文で代替しない
- 未完成を「今後の拡張」で隠さない
- **アセット・テスト・計測・スクリーンショット・比較・完了主張を捏造しない**
- 開発を通じてゲームを常に実行可能に保つ。`main` は常に動作すること
- 小さく統合し、小さく検証する
- 自己評価より証拠を優先する
- **`.github/workflows/autopilot.yml` には触らない**
- **本文書を `docs/STATE.md` から移動・改名しない。** autopilot は `git show "$REF:docs/STATE.md"` で
  ALL_DONE を判定するため、パスが変わると停止条件が**永久に発火しなくなる**（fail-open）
- **冒頭の `state_revision` コメント行を消さない。** 消すと `validate:ops` が失敗し、Pages の build job が
  止まり、公開が古いまま静かに固定される
- **ルート直下の公開ファイルは生成物。** 手で編集せず `npm run build:pages-root` で再生成する（OD-005 / OF-006）
- 実機性能・FPS の主張をしない（ブロッカー B1）。エミュレーション結果はそう明記する
