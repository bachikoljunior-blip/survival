# 既存実装 CINDERLINE 技術監査

- **ゲート**: B
- **対象**: `src/` 全38ファイル / `tools/` / `public/styles.css` の実装
- **批評者**: 独立技術監査エージェント（§12 アーキテクチャ / §13 パフォーマンス / §11 モバイル・アクセシビリティ）
- **入力**: `docs/directive.md` §11 §12 §13、`src/` および `tools/` のソースコード、`public/` の実ファイル
- **日付**: 2026-07-30

**この監査は Gate A の判定材料であると同時に、その指摘は Gate B の作業項目である。** したがって記録上のゲートは B とし、`node tools/check_reviews.mjs --gate B` は以下の high が解消されるまで失敗する。それが正しい状態である。

## 独立性について（§14）

**批評者には README.md を根拠として使うことを明示的に禁じ、ソースコードを実際に読むことを求めた。** README は実装者自身が書いた自己申告文書であり、§14 は批評エージェントが実装側の報告や要約を入力にすることを禁じている。

この制約は実際に機能した。後述のとおり、**README が実装していると書いている機能のうち1つは実装されておらず、コード中のコメントがそれを明示的に否定している。** README を信じていれば、この乖離は発見されずバイブルに転写されていた（実際、一度転写された。§5 参照）。

---

## 総括

要求された17の責務のうち15を実ファイルとして分離しており、固定タイムステップ、品質ティアと p90 ベースの自動昇降、DPR 上限、可視性によるライフサイクル停止、タッチ優先の入力抽象を**実際に**備えている。

§13 の「検証の誠実性」については、`tools/perf.mjs` が SwiftShader である旨を先頭コメントと実行末尾の両方で明記し、**fps を意図的に出力しない設計**になっている。**実機主張の混入は発見されなかった。** この一点において、既存実装は §13 の要求水準を満たしている。

一方、§12 の要求のうち以下3点は明確に未達である: セーブのマイグレーション、起動後の未捕捉エラー／rejected promise ハンドラ、ロード進捗の表示。§13 ではチャンクストリーミングが存在せず（起動時に全世界を一括同期生成）、AI 更新のずらしと距離によるアニメーション間引きが未実装である。

§11 のアクセシビリティは8項目中7項目が実装済みで、未実装は「ホールドとトグルの選択」のみという良好な水準にある。

**critical はゼロ。high が2件。**

---

## 規模の実測

| 項目 | 実測値 |
|---|---|
| `src/` JS ファイル数 | 38 |
| `src/` 総行数 | 25,356 |
| うちエンジンコード（`src/content/` を除く） | 19,414 |
| うちコンテンツ（日本語ロケール含む） | 5,942 |
| `tools/` | 44 ファイル / 5,322 行 |
| `public/styles.css` | 1,046 行 |
| 最大のコードファイル | `src/game/director.js` 1,673 行 |
| 依存 | `three@0.180.0` のみ。devDeps は esbuild / playwright |
| 外部アセット | **ゼロ**（テクスチャ・音・モデルすべて実行時生成） |
| ネットワーク要求 | **ゼロ**（`fetch`/`XHR` ともに grep で0件） |

構成: `core/`(4) `render/`(4) `world/`(7) `actors/`(4) `game/`(6) `ui/`(2) `audio/`(1) `content/`(9)。**§12 の「製品版を1ファイルに詰め込まない」は充足。**

---

## §12 アーキテクチャ — 責務分離

| 要件 | 判定 | 証拠 |
|---|---|---|
| アプリライフサイクル | 充足 | `src/main.js:30-190`, `src/core/engine.js:227-273`（`pauseReasons` Set で多重管理） |
| レンダラとシーン | 充足 | `src/core/engine.js:100-158`, `src/render/postfx.js:43`, `src/render/atmosphere.js:122` |
| ワールドストリーミング | **不足** | `src/world/city.js:110-150`（全ステージ同期生成）, `998-1006`（距離カリングのみ） |
| エンティティ状態 | 充足 | `src/actors/actor.js:60`, `src/game/state.js:129` |
| 入力抽象 | 充足 | `src/core/input.js:88-403`（タッチ/キー/ゲームパッドが同一の `Button` エッジ検出を通る） |
| カメラ | 部分的 | `src/actors/player.js:309-470`（独立モジュールではなく player.js に同居） |
| 移動と物理 | 充足 | `src/world/collision.js:429`, `:86` |
| 戦闘と相互作用 | 充足 | `src/game/combat.js:158`, `src/game/game.js:570-668` |
| AI とナビゲーション | 充足 | `src/game/ai.js:241`, `src/world/nav.js:17` |
| クエストと物語状態 | 充足 | `src/game/narrative.js:119,229`, `src/game/director.js:43` |
| 進行 | 充足 | `src/game/state.js:25-61`（能力制）, `:216-222` |
| UI | 充足 | `src/ui/hud.js:27`, `src/ui/screens.js:79,281` |
| オーディオ | 充足 | `src/audio/audio.js:87` |
| セーブとマイグレーション | **部分的** | `src/game/state.js:19,266-313,322-382`（バージョン番号はあるが分岐が無い） |
| アセットロード | 該当薄 | 外部アセットが無いためローダ層が存在しない。生成は同期・ブロッキング |
| 性能計測 | 充足 | `src/core/engine.js:381-398`, `src/ui/hud.js:619-627`, `tools/perf.mjs` |
| デバッグとテスト | 充足 | `src/main.js:160-182`, `tools/` 44本 |

## §12 アーキテクチャ — 品質要件

| 要件 | 判定 | 証拠 |
|---|---|---|
| 隠れたグローバル結合 | 部分的 | `src/game/director.js:47`（`game.state = this.state` の後付け）, `src/render/materials.js:21`, `src/render/textures.js:22-23` |
| 状態の重複 | 部分的 | `game.playTime`/`state.playTime`、`game.time`/`engine.time`。save 時に同期（`director.js:1338`） |
| フレームレート依存ロジック | ほぼ充足 | `src/core/engine.js:13,318,324-333`（60Hz固定・アキュムレータ・`MAX_SUBSTEPS=4`・dt を0.25sクランプ）。物理は全て `damp()` で dt 正規化。**例外1件**: `src/ui/hud.js:472` |
| 毎フレームのアロケーション | 部分的 | ベクタは module スコープで再利用済み（`game.js:760-762`）。残存は L7 参照 |
| オブジェクトプール | 部分的 | ライト・パーティクルは実質プール（`atmosphere.js:183-239,685,818`）。**`util.js:132` の `Pool` クラスは全コードベースで未使用**、投擲物は毎回 `new THREE.Mesh` |
| dispose 漏れ | 部分的 | dispose は6箇所で定義されるが、呼び出し元は `game.js:383`（actor のみ）だけ |
| 管理されないリスナー | **不足** | `addEventListener` 47箇所に対し `removeEventListener` は3箇所のみ |
| セーブのマイグレーション | **不足** | H1 参照 |
| 起動失敗時に回復可能なエラー | 充足 | `src/main.js:185-190`, `public/index.html:67-101`（バンドル自体が落ちても日本語表示） |
| 非表示時のシミュレーション停止 | 充足 | `src/core/engine.js:239-247,315`。`blur`/`pagehide`/portrait でも停止 |
| 未捕捉エラー・rejection ハンドラ | **未実装** | H2 参照 |
| 再現ビルド／相対パス／秘密なし | 充足 | `build.mjs:36-63`, `public/index.html:14-17`, `public/.nojekyll` |
| 有用なロード進捗 | **不足** | M1 参照 |
| 安全地点でのオートセーブ | 充足 | `src/game/director.js:1538-1541`（90秒・レイド中抑止）＋節目7箇所＋退出時 |
| リロードと中断からの復帰 | 充足 | `src/main.js:90-103`, `src/game/director.js:1366-1427`（NPC位置・危機タイマー・ガス源状態まで復元） |
| コンソールスパムがない | 充足 | `src/` に `console.log` 0件 |

## §13 パフォーマンス

| 要件 | 判定 | 証拠 |
|---|---|---|
| 品質ティア | 充足 | `src/core/engine.js:21-52`（low/medium/high、14パラメータ）, `:411-429`（初期推定） |
| 自動劣化 | 部分的 | `src/core/engine.js:349-378`（p90>38ms で降格、p90<15 かつ p50<13 で昇格）。**テクスチャに波及しない**（M2） |
| DPR 上限 | 充足 | `src/core/engine.js:192-193` |
| 動的レンダースケール | 部分的 | `src/core/engine.js:200-201`（0.72/0.86/1.0 の離散3段のみ） |
| LOD | 部分的 | `src/world/city.js:998-1006`, `src/actors/rig.js:361-364`。**`tier.npcDetail` は未参照** |
| カリング | 充足 | `src/world/city.js:998-1006`, `src/world/geom.js:352-357` |
| インスタンシング | 部分的 | 街のジオメトリは InstancedMesh ではなく**マテリアル別マージ**（`geom.js:347-360`）。設計として妥当だがパーティクル系以外はインスタンシングではない |
| 影の制限 | 部分的 | `shadowMap.autoUpdate = false`（`engine.js:119-121`）だが**全チャンクが `castShadow = true`**（`geom.js:354`）。§13「影キャスター2以下」は未達 |
| 距離によるアニメーション間引き | **未実装** | M6 |
| AI 更新のずらし | **未実装** | M6 |
| エフェクト密度低減 | 充足 | `engine.js:27,37,47` → `atmosphere.js:470,582,685,818` |
| 起動時に全世界をロードせずチャンク化 | **不足** | `src/game/game.js:77-78`, `src/world/city.js:110-150` |
| ドローコール・三角形の実測手段 | 充足（信頼できる） | `tools/perf.mjs:80-126`（`info.autoReset=false`＋`info.reset()` で1フレーム分に正規化）。3ティア×8視点 |
| **性能記述の誠実性** | **充足** | `tools/perf.mjs:2-20,184-187`（SwiftShader 明記、fps 出力を拒否）。**実機主張の混入なし** |
| 実測成果物の可検証性 | 不足 | `.gitignore:3` が `shots/` を除外。README の数値を第三者が検証する手段がリポジトリ内に無い |

## §11 モバイル・アクセシビリティ

| 要件 | 判定 | 証拠 |
|---|---|---|
| タッチ優先設計 | 充足 | `src/core/input.js:1-15,185-273`（左42%フローティングスティック／右58%カメラ面） |
| ジェスチャ競合抑止 | 充足 | `src/core/input.js:156-161`, `public/styles.css:68-76,87,102-104`（`overscroll-behavior:none`, `touch-action:none`） |
| 同時タッチの正しい処理 | 充足 | `src/core/input.js:195-215`（pointerId 単位）, `src/ui/hud.js:240-256` |
| セーフエリア対応 | 充足 | `public/styles.css:38-41` ほか, `public/index.html:6`（`viewport-fit=cover`） |
| 667×375 横向きで可読 | 部分的 | `public/styles.css:916-924`, `tools/probe_ja_fit.mjs`。**実機フォントメトリクス未検証** |
| タッチターゲット 44px 以上 | **部分的** | L2 参照 |
| 感度・カメラ反転設定 | 充足 | `src/ui/screens.js:807-808` |
| 中断からの復帰 | 充足 | `src/core/engine.js:227-255`, `src/audio/audio.js:127-134`, `src/main.js:119-134`（WebGL コンテキスト喪失） |
| 全画面タッチ操作 — メニュー/対話/インベントリ/ジャーナル/設定/死亡/ポーズ/エンディング | 充足 | `src/ui/screens.js` 各該当箇所。設定は `tools/_touchscroll.mjs:105-140` で実タッチ検証済み |
| — マップ | 部分的 | `src/ui/screens.js:595-717`（表示のみ。パン/ズーム/マーカー操作なし） |
| — **チュートリアル** | **画面が存在しない** | grep で `tutorial`/`onboarding` は0件。導線はクエストのヒント文のみ |
| UI テキスト拡大 | 充足 | `src/game/state.js:398`, `src/ui/screens.js:814`（0.8〜1.5×） |
| 字幕 | 充足 | `src/game/game.js:178-187`, `src/ui/hud.js:602-612` |
| 個別音量スライダー | 充足 | `src/ui/screens.js:818-820`（master/music/sfx） |
| 高コントラスト | 充足 | `src/game/game.js:291`, `public/styles.css:955-973` |
| 色に依存しない状態表現 | 部分的 | 形状差と数値は多くで併記。**`.air.warn`/`.air.crit` は枠色＋点滅のみで、`reduced` 設定で点滅も消える**（`styles.css:304-307,978`）。スタミナバーに数値ラベルが無い |
| 画面揺れ・動きの低減 | 充足 | `src/game/game.js:292-299`, `public/styles.css:911-914,975-983`（`prefers-reduced-motion` 併用） |
| **ホールドとトグルの選択** | **未実装** | `DEFAULT_SETTINGS`（`state.js:385-408`）に該当項目なし。ガードは `game.js:492` で `down()` 固定 |
| 触覚フィードバックの切替 | 充足 | `src/game/state.js:404`, `src/game/game.js:173-176,304` |

---

## 指摘

| ID | severity | 指摘 | 対象箇所 | 証拠・再現手順 | 推奨対応 | 状態 |
|---|---|---|---|---|---|---|
| H1 | high | セーブのマイグレーションが存在せず、バージョン不一致のセーブが警告なく破棄され、次のオートセーブで上書きされる | `src/game/state.js:292,357,365` | `SAVE_VERSION` を2に上げるか互換性のない変更を入れる。既存 v1 セーブ保持者が起動すると `hasSave()` が false を返し、CONTINUE が `display:none`（`src/ui/screens.js:365`）になり、90秒後のオートセーブ（`director.js:1538`）で旧データが消える。警告も選択肢も出ない | `migrate(d)` 層を追加し、`v !== SAVE_VERSION` を「破棄」から「移行を試み、失敗時は明示的に告知」に変える | 対応中 — 2026-08-01 に `src/game/state.js` へ `migrateSave()` と段階移行レジストリを実装し、読めないセーブを `cinderline.save.rescued` へ退避してタイトルで告知するようにした。公開ビルド由来の実 v1 セーブで `npm run test:save` 73検査・負例5種が通る。**独立批評は未実施のため解決済にしない** |
| H2 | high | 起動後の未捕捉エラーと rejected promise を捕捉するものが無く、プレイヤーは無言のフリーズを見る | `public/index.html:92-101`, `src/main.js:31` | `index.html` の error リスナーは冒頭で `if (window.__cinderlineBooted) return;` を実行し、`main.js:31` が `main()` の1行目で同フラグを立てるため起動後は何も表示しない。`unhandledrejection` ハンドラはリポジトリ全体に0件 | `window.onerror` と `unhandledrejection` を起動後も生かし、既存の回復パネル（`index.html:36-43`）に接続する | 対応中 — 2026-08-01 に `src/main.js` で両方を起動後も受け、保存・告知の上、反復またはフレーム停止時に回復パネルへ接続するようにした。`npm run test:faults` 30検査が本番ビルド 667×375 で通る。**独立批評は未実施のため解決済にしない** |
| M1 | medium | ロード進捗の10段階が一度も描画されず、日本語環境でも英語のまま固まる | `src/game/game.js:73-95`, `src/world/city.js:110-150`, `src/main.js:16-28` | `City.build` は完全に同期（`await` 0件）。`await frame()` の継続は paint 前に走るため10文字列が画面に出ない。実際に見えるのは `starting renderer` と `warming shaders` の2つのみで、この2つは i18n キーが無い（訳語は `ja/ui.js:288-301` にあるが到達不能） | 生成ステージ間に本物の yield を入れ、キーを正規化する。i18n も同時に直る | 未解決 |
| M2 | medium | 自動ティア降格がテクスチャ解像度と異方性フィルタに反映されない | `src/render/materials.js:281`, `src/game/game.js:55-59`, `src/render/textures.js:22-23` | medium で起動しフレーム時間が悪化して low へ降格させる。解像度・影・パーティクルは下がるがテクスチャメモリと異方性は medium のまま。§13 のテクスチャメモリ上限に対する劣化手段が1つ効かない | `MaterialLibrary.setTier` を追加し `engine.on('tier')` から転送する | 未解決 |
| M3 | medium | 死体が永久に残り、毎ステップ骨格評価され続ける。メモリと画面内スキンドメッシュ数が単調増加する | `src/game/game.js:197-203,430-435`, `src/actors/actor.js:310-342` | actor ループが `a.dead` を除外せず、`update` も冒頭で return しない。`removeActor` はリセット／リトライ／危機解決の経路からしか呼ばれない。同一エリアで戦闘を繰り返すと actor 配列とシーンが単調増加する。§13「有界なメモリ」「画面内スキンドメッシュ8以下」の両方に対する反例 | 死体の上限本数を導入し、古いものからフェード＋`removeActor`。`update` で `dead` をスキップ | 未解決 |
| M4 | medium | `window.CINDERLINE.ready` が起動失敗時にも true になり、ハーネスが失敗を別の症状として報告する | `src/main.js:189` | `ready = true` が catch 節の中にある。全ハーネスがこのフラグを起動完了の合図として待つ（`tools/perf.mjs:62`, `tools/playthrough.mjs:72`）。起動失敗時にハーネスを回すと待機が成功し、次の evaluate が別理由で落ちる | 失敗時は `ready` を立てず、別途 `failed` を立てる。ハーネス側で両方を待つ | 未解決 |
| M5 | medium | 影マップの全再描画が走行中およそ0.75秒ごとに走り、周期的なフレームスパイクになる | `src/render/atmosphere.js:307-310`, `src/world/geom.js:354` | 3m 移動で `shadowDirty`、走行速度は約4m/s。加えて全チャンクが `castShadow = true`。`autoUpdate = false` の意図（毎フレーム回避）は達成されているが周期スパイクに置換されただけ。§13「長い停止のない一貫したフレームペーシング」に対するリスク | カスケード分割、または静的ジオメトリの焼き込み影と動的キャスタ限定の実時間影に分離 | 未解決 |
| M6 | medium | AI 更新のずらしと距離によるアニメーション間引きが両方とも未実装（§13 が明示的に要求している項目） | `src/game/ai.js:246-249`, `src/game/game.js:430-435` | 全 Enemy を毎固定ステップ処理し、その中で `canSee`（レイキャストを含む）と `hears` を毎回呼ぶ。全 actor も無条件更新 | 距離バンドごとの更新間隔と位相ずらしを導入。既存の `e.think` タイマーがあるので知覚側をずらすだけでも効果が大きい | 未解決 |
| M7 | medium | 「ホールドとトグルの選択」が未実装。§11 のアクセシビリティ必須項目 | `src/game/state.js:385-408`, `src/game/game.js:492` | `DEFAULT_SETTINGS` に該当項目が無く、ガードは `down()` 固定。スプリントのみ `autoSprint` がある | ガードのホールド／トグル設定を追加する | 未解決 |
| M8 | medium | チュートリアル画面が存在しない。§11 は全画面がタッチで操作可能であることを要求し、チュートリアルをその一つに挙げている | 該当ファイルなし | grep で `tutorial`/`onboarding` は0件。導線はクエストのヒント文（`director.js:1217-1222`）のみ | §8 の「プレイで教えるオープニング」として設計するか、画面として実装するかを決める。どちらも取らないなら §11 の項目として未達であることを記録する | 未解決 |
| L1 | low | `Pool` クラスが宣言されているだけで未使用。実装済みの外観だけを与える | `src/core/util.js:127-145`, `src/game/ai.js:722` | `src/` 全体で `Pool` の import は0件。実際のプーリングは `atmosphere.js` の独自実装で、投擲物は毎回 `new THREE.Mesh` | 使うか消すかのどちらか。消す場合は「プールは atmosphere のスロット方式のみ」と正直に書く | 未解決 |
| L2 | low | uiScale 0.8 でアクションボタンが 35.2px となり §11 の 44px を割る | `public/styles.css:450-451`, `src/ui/screens.js:814` | `.abtn.mid/.sml` が `calc(44px * var(--uiscale))`、スライダ下限が 0.8。`.btn`/`.tab`/`.close`/`.item` は固定44pxで守られているだけにアクションクラスタだけが例外 | 下限を 44px でクランプする | 未解決 |
| L3 | low | `dispose()` 群が定義のみで呼び出しゼロ。いずれもリスナー解除を含まない | `src/core/engine.js:400`, `src/world/city.js:1073`, `src/render/postfx.js:449` ほか3箇所 | `src/`/`tools/` から呼ばれない（grep）。`engine._installLifecycle` が登録した6本、`input._install` が登録した15本に解除経路が無い | 単一セッション設計なので実害は限定的。dispose を呼ぶ経路を作るか、呼ばれない旨を明記する | 未解決 |
| L4 | low | フレームレート依存の補間が1箇所残っている（表示のみ） | `src/ui/hud.js:472` | `lerp(this._chipEnemy, hp, 0.06)` がフレーム毎固定係数。同ファイル `328,338` は `1 - Math.exp(-dt/0.5)` で正しく正規化されているため、この1行だけが取り残されている | dt 正規化に揃える | 未解決 |
| L5 | low | ティア定義の未参照フィールドが4つ。品質設定が実際には何もしないつまみを持っている | `src/core/engine.js:22-52` | `reflections`/`npcDetail`/`decalBudget`/`ssao` が `engine.js` 自身を除いて0件参照。`decalBudget` は `combat.js:135-136` にプリセット、`textures.js:1120-1121` に `decalSprite()` があるのに配置システムが無い | 実装するか削除する。効かないつまみは性能調整のたびに判断を誤らせる | 未解決 |
| L6 | low | 毎フレーム／毎イベントの小アロケーションが複数残存 | `src/core/util.js:120`, `src/game/game.js:429,704-707`, `src/core/input.js:359`, `src/ui/hud.js:486`, `src/render/postfx.js:392,402`, `src/core/engine.js:382` | `emit` のたびにハンドラ配列を `slice()`。perf HUD 表示時は毎フレーム `Array.from().filter().sort()`。**`perf.mjs` の「4秒でヒープ増加0」は `fixedUpdate` のみを回しており（`tools/perf.mjs:156-160`）、`render()` 経路のアロケーションは測定対象外** | render 経路を含むヒープ計測を追加した上で対処する | 未解決 |
| L7 | low | CI が実際に走らせるテストは validate と build のみ。§0 の「PR で lint + test + build」が未達 | `.github/workflows/pages.yml:31-34` | PR 用ワークフローが存在しない。`package.json:9` の `test` にも `test:play:ja` と `i18n` が含まれない | PR ワークフローを追加する。**`.github/workflows/autopilot.yml` には触らない** | 未解決 |
| RD1 | medium | README が実装していると書いている機能が実装されておらず、コード中のコメントがそれを明示的に否定している | `README.md`「Controls / Touch」表、`src/ui/hud.js:78-84` | README は「The air gauge — Tap it.」と書くが、`hud.js:78-84` に「**NOT tappable.** It sits inside the movement-stick zone…」というコメントがあり、`_buildVitals` は `hit` クラスもタップ束縛も行わない。`public/styles.css:98`（`#ui * { pointer-events: none }`）により実際に反応しない。`styles.css:308` の `.air { cursor: pointer; }` は削除し忘れた残骸 | README を実装に合わせて修正する。**この乖離は既に `docs/bible.md` に転写されており、そちらも修正が必要** | 解決済 — `docs/bible.md` §14 を実装準拠に修正、`README.md` は Gate B で修正 |
| RD2 | low | README の `npm test` の説明が不正確 | `README.md`「Testing」節, `package.json:9` | `test` は `build --dev && validate && playthrough && perf` であり、直前に列挙された `npm run i18n` / `test:play:ja` / `shots` を含まない | README を修正する | 未解決 |
| RD3 | low | 左利きレイアウトが「フレーム全体の鏡像」ではない | `public/styles.css:457,940` | 右利き `heavy: right 120px` に対し左利き `heavy: left 112px`。他4ボタンは同値でミラーされているのに HEAVY だけ 8px ずれる | どちらかに揃える | 未解決 |

**critical / blocker: 0件。high: 2件（H1, H2）。**

---

## README の誠実性についての所見

上記 RD1〜RD3 以外の乖離は発見されなかった。特に重要な確認として:

**README の「Not measured」節に誇張は発見されなかった。** 「This project has never been run on an iPhone SE (3rd generation), or on any other physical device.」「The 30 fps target … is a design target, not a measurement.」という記述は `tools/perf.mjs:2-20,184-187` の実装と完全に一致しており、ハーネスは fps の出力を設計として拒否している。

「Known limitations」節が自ら挙げる欠陥——近接戦闘が長期間まったく機能していなかったこと、通しプレイのドライバが `damage()` を直接呼んでいて一度も攻撃ボタンを押していなかったこと、計測器自体が壊れていたこと——はいずれもコード上で確認できた（`tools/driver.js:170-182` の `clearHostiles` は今も `damage({amount: 9999})` を直接呼び、`tools/probe_combat.mjs` がその穴を塞ぐ目的で存在する）。

**自己申告文書としては珍しく正直である。** ただしそのことは、§14 が README を批評の入力として認めない理由を変えない——RD1 は、正直に書かれた文書でも実装から静かにずれることを示している。

---

## 起点として使う場合の判断

### 継承すべき

| 対象 | 理由 |
|---|---|
| `src/core/engine.js` のフレームループとライフサイクル | 固定ステップ＋アキュムレータ＋サブステップ上限＋dtクランプ、pauseReasons による多重停止管理、p90 ベースの自動ティア。§12/§13 の中核要求をそのまま満たす |
| `src/core/input.js` | エッジ検出を固定ステップに同期させた `Button`、フローティングスティックの原点追従、pointerId 単位のマルチタッチ分離。§11 の「最初からタッチで設計する」を実際に満たしている数少ない層 |
| `public/styles.css` のタッチ／セーフエリア層 | `env(safe-area-inset-*)`、`#ui` の pointer-events opt-in、44px 規定、`prefers-reduced-motion`。コメントに障害の再現条件が残っており退行の再発を防いでいる |
| `src/render/atmosphere.js` のライトプールとパーティクル | ヒステリシス付きライト割当と固定スロット InstancedMesh。要求どおりのプーリング |
| `tools/perf.mjs` と `tools/_touchscroll.mjs` | 前者は §13 の検証誠実性を満たす唯一の資産。後者は CDP による本物のタッチ入力で測定する数少ない手段（ただし assert が無く exit code を返さないので改修が必要） |
| `tools/validate.mjs` のエンジンソース走査方式 | フラグ・フック・トリガ id をホワイトリストではなくソースから抽出する。物語規模が増えても腐らない |
| `src/game/state.js` の能力制進行と単一シリアライズ可能状態 | §12 の「エンティティ状態」「進行」を満たす |

### 破棄・改修すべき

| 対象 | 判断 | 理由 |
|---|---|---|
| `City.build()` の一括同期生成 | **要改修（構造レベル）** | §13 が明示的に禁じる「起動時に全世界をロード」そのもの。チャンク境界と `ChunkBuilder` は既にあるが、`_finalise` の AO ベイクとナビベイクが全世界完成を前提にしているため改修は小さくない |
| `Storage`／`GameState.deserialise` のバージョン処理 | **要改修** | H1 |
| 未捕捉エラー／rejection の扱い | **要改修** | H2。回復パネルの土台があるので工数は小さい |
| `game.state = this.state` の後付け | **要改修** | 隠れ結合。HUD/Menus が生成順に暗黙依存している |
| `Pool` クラスと未参照ティアフィールド | **破棄または実装** | 使われない実装は「実装済み」の外観だけを与える |
| 死体の永続化 | **要改修** | M3 |
| AI／アニメーションの更新スケジューリング | **要追加** | M6 |
| 影の更新戦略 | **要改修** | M5 |
| ローディング表示 | **要改修** | M1 |
| ビルド／テスト基盤 | **判断保留・要記録** | esbuild は相対パス・`.nojekyll`・再現性を実際に満たしており乗り換えの利得は薄い。**ただし単体テスト層が完全に欠落しており、`util.js`/`state.js`/`collision.js` のような純関数群にテストが1本も無いのは穴** |
| README の3箇所 | **要修正** | RD1〜RD3。実装が正しく README が古い |

**総合判断**: エンジン層（`core/`, `render/`, `world/geom.js`, `input`）とタッチ／アクセシビリティ層は §11/§12 の要求水準に達しており、継承する価値が高い。破棄・改修が必要なのは「ワールド生成の粒度」「セーブの前方互換性」「実行時エラーの可視化」「更新スケジューリング」の4系統で、いずれも局所的ではなく設計判断を伴う。
