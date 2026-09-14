> **SUPERSEDED WHERE IT CONFLICTS — 2026-08-01.**
> The governing protocol is now `AI_DEVELOPMENT/PROTOCOL.md` (Adaptive Edition
> with Enforced Floor, v2.2). This file is kept as the immutable legacy copy and
> as the origin record for decisions made under it.
>
> Version 2.2 takes precedence **only to the extent of a conflict**. Every rule
> below that does not conflict with it remains in force — in particular the
> product authorities (`docs/directive.md`, `docs/bible.md`, `docs/DONE.md`),
> the fabrication prohibitions, the evidence discipline, the ownership map, and
> the standing remote-delivery authorization of 2026-07-31, which v2.2 carries
> forward in its Section 14.
>
> Known conflicts, and how they resolve:
>
> | This file said | v2.2 says | Resolution |
> |---|---|---|
> | §3 index is `AI_DEVELOPMENT/INDEX.md` | the loader is `START_HERE.md` | mechanism migrated; INDEX.md archived |
> | §3 machine state is the two JSON files | canonical state is `AI_DEVELOPMENT/STATE.yaml` | STATE.yaml is authoritative; `SESSION_STATE.json` is now a derived projection and `PROJECT_STATE.json` is the work graph |
> | §9/§16 process is chosen per task | the Section 0 floor is never optional | the floor is non-discretionary; adaptive rigor applies only above it |
> | §31 loop is followed each iteration | same loop, plus F1–F9 | preserved, with the floor made enforceable |
> | "do not touch `.github/workflows/autopilot.yml`" | 0.4 bars unattended delivery chaining while the gates are absent | the file is **not modified**; the chain is halted with its own `docs/STOP` brake |
>
> Nothing recorded under this protocol was converted to complete or passed by
> the migration. See `AI_DEVELOPMENT/ARCHIVE/PRE-MIGRATION-2.2.md`.

# PROJECT-WIDE PERSISTENT AUTONOMOUS DEVELOPMENT PROTOCOL

この文書は CINDERLINE の**開発運用規約**であり、製品ブリーフではない。ユーザーが明示的に置換・変更・削除するまで、チャット、Work 実行、端末、担当エージェントをまたいで有効である。

この規約だけを理由に、ゲーム内容、機能、物語、技術、アート、対象環境、収益方式を新しく決めてはならない。製品の正本は `docs/directive.md`、承認済み設計は `docs/bible.md`、完了基準は `docs/DONE.md`、検証済みの現在地は `docs/STATE.md` にある。

## 1. 権限と競合解決

優先順位は次の通り。

1. ユーザーの最新の明示指示
2. 現在有効な製品要件と制約
3. 実ファイル、実行結果、テスト、計測、接続済みリポジトリの検証済み状態
4. 置換されていない設計・アーキテクチャ決定
5. 現行計画
6. 暫定仮定

競合を見つけたら、上位を採用し、置換内容・影響する計画・基準・決定を記録する。なお有効な完了作業は保全する。仮定や過去のエージェント発言を検証済み事実より上位に置かない。難しさを理由に要件を黙って弱めたり、範囲を黙って広げたりしない。

## 2. モバイル中心の実行環境

ユーザーは iPhone だけで操作している可能性がある。PC、ローカル端末、特定 OS、常駐プロセス、未接続アプリ、未提供資格情報、無制限ネットワーク、外部 AI API、課金サービスを前提にしない。

各 Work 実行の開始時に、利用可能なファイル、リポジトリ、アプリ、Web、実行・編集・ブラウザ・委任能力を実際に確認する。実行していない編集、テスト、スクリーンショット、コミット、push、deploy、ランタイム確認を完了済みと表現しない。

直接実行できない場合も、可能な作業を続け、適用可能な完全ファイル・パッチ・テスト・コマンド・handoff を用意する。適用済みと未適用、検証済みと未検証を分け、制約が確信度に与える影響と正確な再開点を残す。実際の予約処理が無い限り、Work 終了後のバックグラウンド継続を約束しない。

## 3. 永続運用構造と正本

運用構造の索引は `AI_DEVELOPMENT/INDEX.md` とする。新しい正本を増やさず、既存の同等機能を参照する。

- 運用規則: 本文書
- 製品要件・制約: `docs/directive.md`
- 承認済み設計・製品リスク・実装欠陥: `docs/bible.md`
- 完了条件: `docs/DONE.md`
- 人間向け現在地: `docs/STATE.md`
- ID、依存関係、状態遷移、追跡関係: `AI_DEVELOPMENT/PROJECT_STATE.json`
- 論理セッションと active frontier: `AI_DEVELOPMENT/SESSION_STATE.json`
- 批評: `docs/reviews/`

アクティブな記録は再読可能な大きさに保ち、履歴は archive へ移す。秘密、API キー、トークン、個人情報、復旧情報を、ソース、記憶、ログ、証拠、スクリーンショットへ保存しない。

## 4. 永続プロジェクト記憶

次を継続的に更新する: 目的、検証済み状態、完了・部分完了・進行中・予定・延期・阻害、要件、受け入れ基準、アーキテクチャ、依存、決定と理由、制約、仮定、未解決質問、バグ、回帰、技術的負債、性能・安全・アクセシビリティ・互換性、成功・失敗・棄却パターン、再利用可能な道具と手順、テスト・ベンチマーク・実験、変更ファイル、最後の検証状態、正確な次の開始点。

事実、ユーザー要件、採用済み決定、提案、仮定、仮説、生成候補、未検証主張を区別する。記録と実態が食い違う時は調査し、実態を優先して記録・計画・基準を修正する。意味のある各反復後に更新し、セッション末まで待たない。

## 5. ユーザーだけが決める論理セッション境界

新しいチャット、Work 再起動、アプリ終了、端末変更、短い返答、利用上限、道具障害、文脈圧縮、時間経過、話題変更は、論理セッションを終了させない。

ユーザーが明示的にセッション終了を宣言するまで `SESSION_STATE.json` は active のままとし、目的、未完了作業、最後の検証点、優先順位を保持する。ターン終了、task 完了、commit、PR は checkpoint であって session close ではない。

明示的終了時だけ、実態との照合、完了・部分完了・阻害・変更・テスト・性能・欠陥・失敗・再利用技能・次タスク・再開手順を記録し、final handoff と archive を作り、session を closed にする。セッション終了とプロジェクト完成を混同しない。

## 6. 再開手順

各実行開始時に、次の順で読む。

1. 本文書
2. `AI_DEVELOPMENT/INDEX.md`
3. `docs/STATE.md`
4. `AI_DEVELOPMENT/PROJECT_STATE.json`
5. `AI_DEVELOPMENT/SESSION_STATE.json`
6. 現在タスクが参照する `docs/directive.md`、`docs/DONE.md`、`docs/bible.md`、決定・失敗・技能・handoff
7. 実ファイル、リポジトリ差分、ランタイム

記録と実態を照合し、軽量 health check を行い、最後の検証点から続ける。検証済み完了作業や棄却済み手法を繰り返さない。再検討は、ユーザー指示、制約変化、新証拠、誤仮定のいずれかを記録した場合だけ行う。記録欠損はリポジトリと証拠から再構築し、不確実性を残す。

## 7. 生きた階層計画

実要件から、成果 → workstream → system → feature → bounded task → verification の階層を作る。各 node は必要に応じて ID、親子、依存、影響領域、入出力、制約、リスク、不確実性、受け入れ基準、検証方法、状態、優先度、担当、証拠、存在理由を持つ。

状態は proposed / accepted / ready / active / blocked / awaiting_verification / under_review / verified / rejected / deferred / superseded / archived を用いる。全体階層は `PROJECT_STATE.json`、今すぐ実行可能な小集合は `SESSION_STATE.json` の frontier とする。全体を書き直さず frontier だけ更新できるようにする。

leaf は割当可能、短い反復で実行可能、独立検証可能、証拠化可能、安全に統合・rollback 可能な大きさまで分割する。依存、入力、検証可能性、重複、安全性、実要件への寄与を確認してから active にする。ユーザーの計画変更は上位権限として descendants、依存、優先度、基準、handoff を再計算し、有効な完了分を保全する。

## 8. 自律的な次タスク選択

目的への寄与、ユーザー価値、依存解放、リスク・不確実性低減、基準、回帰防止、費用、検証費用、可逆性、緊急性、学習価値、保守性で候補を評価する。最大の前進を生む最小の独立検証可能 task を優先する。

機能より先に、欠けた記憶、テスト、測定、回復、asset、統合、性能基盤の方が全体価値を高める場合は、最小基盤を先に作る。古い計画を盲目的に実行せず、新証拠で再優先する。構造的リスクを放置して容易な外観変更を続けない。反復失敗時は共通原因と仮定を見直し、失敗パターンを記録して戦略を変える。

## 9. 一指示による基盤構築

この規約は、可逆・非破壊・project-scoped な必要基盤の作成と検証を許可する。具体的な要件、基準、反復作業、既知リスク、回復・性能需要に結びつく最小構成だけを作る。

再現ビルド、version lock、format/lint/static/type、unit/integration/e2e、ブラウザ・入力、ログ・crash、seed/clock/fixture、state inspection/injection/checkpoint、task orchestration、handoff schema、quality gate、benchmark/profile、local telemetry、rollback/recovery、CI は必要に応じて追加する。基盤自体も clean setup、startup、test discovery、失敗検出、non-zero exit、report、rollback、再開で検証する。

## 10. ローカル優先・API 非依存

製品ランタイムは、明示承認なしに追加の外部 AI API、hosted agent、有料推論、第三者 cloud を必須にしない。既存機能 → bundled deterministic code → 適合する OSS → rule/algorithm → 実用的な既存 local model → 明示承認済み外部サービスの順で選ぶ。optional service が停止しても core は動くこと。

依存は source、license、version、attribution、互換性、保守・security を確認する。怪しい・不要・license 不適合なものを避ける。導入不能時は仕様と統合物を用意するが、導入済みと主張しない。

## 11. 受け入れ基準と追跡

重要要件を観察可能な動作、閾値、比較、platform check、再現可能な surface outcome に変換する。曖昧な「良い」「完成度が高い」だけを基準にしない。

要件 → plan node → decision → task → files → test/checkpoint/surface test → evidence → result を追跡する。基準変更は元基準、提案、理由、影響を記録し、結果を実質的に変える場合はユーザー承認を得る。難しさを理由に黙って弱めない。

## 12. 専門担当

文脈・道具・視点・独立性が実質的に改善する時だけ、最少人数の専門担当を使う。契約には task ID、目的、許容範囲、対象 file/interface、入力、仮定、制約、禁止変更、出力、基準、証拠、完了条件、handoff 先を含める。

独立 surface reviewer は実装ソースを見ない。複数担当は同一 file を同時編集しない。真に独立した agent が無い場合は、別 task artifact、fresh review pass、isolated workspace、sanitized package で近似し、完全な独立性ではないことを記録する。

## 13. 型付き handoff

重要な引継ぎを曖昧な文章だけで渡さない。schema version、task、producer/consumer、目的、入出力 artifact、interface、依存、不変条件、仮定、未解決質問、基準、必要テスト、リスク、rollback、状態を含める。可能なら検証し、不正・矛盾した handoff は downstream で黙って補完せず上流へ戻す。

## 14. tool・engine・scene・asset 自動化

実 stack と version を検出してから adapter を作る。API、型、source、公式資料を確認し、method/parameter/config を捏造しない。生成、変更、scene、配置、import/convert/compress/validate、manifest、shader、build、runtime、log、test、screenshot、performance を必要に応じて自動化する。

asset manifest は source、license、attribution、version、変換、size、runtime cost、互換性、置換状態を記録する。未知・不適合 license を release に残さない。コード生成成功を integration 成功としない。build/load/run/behavior まで確認する。

## 15. 再利用技能

繰り返し成功する作業を executable script、tested utility、adapter、test helper、diagnostic/repair/optimization/migration/recovery 手順として `AI_DEVELOPMENT/SKILLS/` に保存する。目的、適用条件、入出力、依存、使用法、検証、限界、失敗例、version、最終検証 revision を持たせる。再利用前に適用条件・interface・verification を確認する。失敗・危険パターンは別記録にし、古い技能は deprecate する。

## 16. 実行可能 quality gate

schema、format、lint、static、type/build、unit、integration、e2e、checkpoint、state injection、save/migration、startup、resource/license、accessibility/layout、performance/memory/network/bundle、regression、visual、independent review、surface interaction を可能な範囲で executable にする。

必須 gate の失敗は受入・release を止める。欠陥を通すため gate を変えない。結果は passed / failed / blocked / not_applicable / prepared_not_executed / inconclusive で記録し、未実行を passed としない。build 成功と feature 完了を同一視しない。

## 17. 独立レビュー

実装は自己承認しない。重大変更後は fresh context または別担当が、仮定、未処理状態、回帰、lifecycle、race、state corruption、data loss/save、interface、accessibility、security、performance、保守、重複、誤った test、hidden coupling、recovery、挙動不一致を反証しに行く。

finding は ID、severity、要件、証拠、再現、原因、修正方向、再テストを持つ。意見の不一致は再現証拠で解く。未解決 high 以上は完了を阻害する。

## 18. user surface / GUI test

interactive surface は source 読解だけでなく実操作する。可能ならユーザーと同じ surface を touch/keyboard/pointer/controller で操作し、normal、invalid、edge、interruption、recovery、rapid/repeated/simultaneous input、long run、小画面、回転、offline/degraded、loading/failure を検査する。

source-blind tester には runnable build、controls、目的、観察可能な基準だけを渡す。厳密分離不能なら sanitized package/fresh context を使い、部分的であると記録する。初期状態、操作、観察、期待、画像/動画/log、環境、severity、再現性を残し、修正後に同じ試験を再実行する。実行不能なら harness を作るが prepared と記録する。

## 19. checkpoint と state injection

遅い状態の試験に全編 replay を要求しない。開発・test build に限定し、production から到達不能な deterministic state inspection/injection、seed、clock、fixture、snapshot、teleport/spawn/failure/offline simulation を必要に応じて実装する。

checkpoint は開始状態、注入状態、操作、surface/internal 期待、cleanup、証拠を持つ。注入状態が通常進行で到達可能かを確認し、synthetic fault は明示する。normal full flow と併用し、注入で初期化・遷移・実進行の不具合を隠さない。

## 20. 計測による修正・調整

startup、応答、frame、input latency、memory/CPU/GPU、load、bundle/network、crash/error、completion/failure/retry/abandon、misclick、遭遇、resource、damage、path、save/restore を project-local かつ privacy-preserving に測る。明示承認なしに remote analytics を追加しない。

実験は baseline、target、hypothesis、限定変更、反復、比較、副作用、keep/rollback を記録する。一つの metric、scenario、seed、skill level に過適合しない。scripted/rule/search/planning/local executable agent を使ってよいが外部 AI API を必須にしない。

## 21. 品質多様な実験

複数の妥当解がある未解決問題では、表面的でない候補を isolated prototype/sandbox/feature flag/temporary branch/simulator で比較する。complexity、skill expression、depth、speed、accessibility、predictability、maintainability、risk、runtime/memory、replayability、reversibility の多様性を保つ。

候補ごとに親、変更変数、仮説、利点、欠点、費用、結果、保持/棄却理由を記録する。高価な 3D 系は妥当な簡易 simulator で shortlist を作り、実環境で再検証する。既に明確な優越解が基準を満たす時や停止条件後は実験を続けない。

## 22. ローカル自律 entity

実プロジェクトに持続的 entity が必要な場合だけ適用し、この節を理由に追加しない。default runtime は外部 LLM 無しで deterministic に動く。

必要に応じ identity、role、goals、needs、beliefs、relationships、trust/hostility、obligations、event memory、plan、schedule、state、allowed/prohibited action を structured data として保持する。recency/importance/relevance/relationship/location/goal で local retrieval し、aggregation、threshold、rules、state machine、utility、GOAP、schedule、template で更新する。canon、mandatory event、secret/disclosure、progress、role/location/mortality、resource を authority layer で守る。save/reload、seed replay、long simulation、invalid prevention、scale/cost を試験する。

## 23. 制御された実装と統合

小さく分離・review・rollback 可能な変更を優先する。interface 変更前に consumer、不変条件、migration、test、rollback を特定する。置換は baseline → isolated replacement → 比較 → migration → regression → obsolete removal → docs/state update の順で行う。

integration owner は interface、依存、data/state flow、failure safety、performance、既存機能、configuration、test/release 分離を確認する。明示的な変更依頼は可逆な project file 変更と test 実行を許可する。remote push/merge と public deploy/publication は §28 の永続承認に従う。本番 data、課金、account、その他の不可逆外部操作は、その承認に含めない。

## 24. 層別テスト

schema/config → format/lint → static/type/build → unit → integration → checkpoint/state injection → end-to-end → source-blind surface → exploratory → performance/stress → clean setup/build → release build の順を目安にする。小変更ごとに全 expensive test を回さず、統合点で必要範囲を回す。

success/error/interruption/recovery/invalid/boundary/repeated/migration/compatibility/long-run を含める。誤った理由で通る test を直す。unstable timing、external network、mutable service、unordered/shared state を避ける。flaky quarantine は理由・owner・解除条件・確信度影響を記録し、pass と数えない。

## 25. 証拠と報告

重要主張には test output、log、screenshot/video、benchmark/profile、snapshot、before/after、artifact、再現 command、source-blind report を結びつける。過大な disposable evidence は避け、再現手順と要約を残す。

進捗は変更、検証、失敗、修正中、次の高価値 task を簡潔に報告する。完了検証済み / 完了未検証 / prepared 未適用 / blocked / rejected を分ける。重大欠陥・仮定変更・scope 影響を早く報告する。

## 26. 失敗回復と rollback

risky change 前に回復 checkpoint を作る。重大失敗では log と再現、必要なら failing state、最後の検証点を保存し、working state を回復し、原因を分離、仮定を再検証し、戦略を変える。失敗履歴を隠さず、作業途中だからという理由で project を壊れたままにしない。

各反復で active task/node、modified files、last success、current failure、hypothesis、next action、rollback point、pending verification を残す。

## 27. 効率と資源制御

最終品質、信頼性、有用な進展に最適化し、不要な agent、tool、dashboard、document、test、abstraction、infrastructure を作らない。確実な deterministic tool を先に使い、全体の再読・再生成を避け、index/frontier/cache を使う。安全な独立作業だけ並列化する。品質を落として急がないが、証拠が十分な結果を反復証明しない。

## 28. 外部操作と安全

明示承認なしに、購入、account/subscription、credential 作成・回転・開示、public deploy/publication、remote push/merge、破壊的 DB/cloud、不可逆 migration、user data 削除、法的同意、private data 公開を行わない。security control や production isolation を弱めない。秘密を source、state、log、evidence、report に置かない。

### このプロジェクトで有効な永続承認

2026-07-31 のユーザー最新指示により、CINDERLINE では今後の chat / Work / logical session 切替後も、検証済み変更の **remote push、merge、public publication/deploy** を通常の統合・公開手順として実行する。この承認はユーザーが置換・変更・撤回するまで有効であり、従来の「これら3操作は都度承認が必要」という部分を置換する。

実行前に対象 repository・branch・差分・quality gate を確認し、既知の mandatory gate failure や秘密を含む checkpoint は公開しない。実行後は remote commit、merge、deployment と公開 surface を実測し、成功・失敗を永続状態へ記録する。この承認は、購入、課金、account/credential 操作、private data 公開、破壊的 DB/cloud 操作、不可逆 migration、security control 無効化を許可しない。

## 29. 自律性と質問

要件、慣例、客観比較、試験、可逆実験で解ける routine detail をユーザーへ戻さない。最善の可逆判断を記録して続ける。製品を実質的に変える、不可逆、credential、課金、private data、真に阻害する判断だけ質問する。

曖昧でも安全に進める場合は仮定を記録し、保守的・可逆に実装する。規模・難しさ・未完成を停止理由にせず分解する。外部阻害 branch があっても独立 branch を続ける。既提供情報を聞き直さず、background 完了を約束しない。

## 30. 完了基準

コード、file、compile、起動、単一 test、screenshot、単一 reviewer、prototype、plan だけで完了としない。task 完了には、基準、mandatory gates、integration、regression、surface、performance、failure/recovery、documentation/state、evidence、未解決 high 以上ゼロが必要である。

release 完了には clean setup/build、release config、開始から ending、save/restore、critical checkpoints、対象環境、性能・安定性、必須機能の到達性、production から dev control 不到達、placeholder/license、current docs、recoverable release state を検証する。限界と不確実性を証拠に比例して明示する。

## 31. 継続運用 loop

意味のある各反復で次を行う: state reload → 実態照合 → plan/frontier → next task → acceptance → 必要基盤 → 最少 specialist/handoff → 最小完全変更 → fast checks → integration → checkpoint/surface → independent review → evidence/telemetry → repair/baseline comparison/rollback → reusable skill/failure → plan/project/session update → next task。

各検証済み反復は project をより functional、tested、recoverable、understandable、maintainable、reusable にする。

## 32. 初回導入と現在の継続

この規約受領後の初回は、実ファイル・接続 repo・tools を調査し、既存の持続システムを保全する。本規約、最小 state、active session、現状 inventory、実要件だけからの plan/frontier、最初の acceptance、必要最小基盤を作って検証し、承認待ちせず最高価値 task を開始する。

CINDERLINE には既に製品目的と実装があるため、製品を発明し直さない。現在の検証済み継続点は `docs/STATE.md` と machine state の一致で決める。安全に実行可能な時は plan だけで止めない。
