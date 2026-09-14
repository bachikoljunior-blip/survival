# C34 固定 runtime の単回 shadow 解像度診断候補

候補を凍結した。基点は `81de9354117a54397bf2c9e64e18a91c397dd06a`、root / dist runtime は `514f671fa64b75dda7f835a430245e9b168f9aca38fbce0b8184b12938679a55` に固定する。正規 AGENTS → CLAUDE v3 → SESSION を取得受理済み。変更対象は tools 3 ファイルだけで、製品 source / root / bias / actor 位置 / workflow は変更していない。

| 候補ファイル | SHA-256 |
|---|---|
| tools/mobile_shadow_resolution.mjs | 4739ed7fbcad3737167f8b73125c68239b493c929bf6567f6824bcb34a14aa5c |
| tools/mobile_visual_capture.mjs | 057d2fda8dfa9a95f5e1157d5a8d745710cfd1daa0b48887d8f1500e8ee217f8 |
| tools/export-webkit-material.mjs | 6f8ab325ede1fc0632cd47f65af4b7a1ccf85b521c04367e8b3ef465835e19e2 |

既存の `mobile_character_ground_contact.mjs` は byte 不変の companion として候補フォルダに置いた。既存の視覚 route は新 import と明示 opt-in の arcade / south 呼出しだけを追加した。exporter は同じ opt-in で 6 期待名を追加した。これらの追加を除くと正規 C34 と完全一致する。

正規 three.js r180 の `WebGLShadowMap.js` は、既存 shadow.map がある場合に mapSize の変更だけでは render target を作り直さない。`RenderTarget.setSize()` は texture.image と target 寸法を更新し dispose を発火する。`WebGLTextures.onRenderTargetDispose` は旧 framebuffer / depth renderbuffer / texture を解放し properties を除去する。次の通常 render が同じ target オブジェクト用の GPU attachment を再確保する。正規取得 URL・blob・全 source bytes は `canonical-receipt.json` と `source-original/r180/` に保存した。

新 helper は既存の停止済み visual route で足裏・pose の baseline を読み、各場面で **original 1024 → double 2048 → restored 1024** の 3 枚だけを取得する。camera、pose、time、足裏座標、light、元 bias −0.0009 / normalBias 0.028、extent ±48 / near 1 / far 150、PCFSoft、tier、設定、画像寸法、target の非寸法設定を保持する。tier 全体の変更や画像加工は行わない。

mapSize の数値だけで成功にせず、実 target / texture.image 寸法、GPU depth renderbuffer の実 storage 寸法、framebuffer completeness と実 color attachment、旧 3 資源の gl.is* 解放、texture memory 数の減少と回復を検査する。r180 の properties 内部キーを読むため、この実装は固定 runtime / three 版を前提とする。GPU handle 自体を report に露出せず、寸法・生存状態・件数・結果だけを保存する。

途中の render / GL / dispose / allocation / cleanup 失敗を記録し、finally で元 mapSize / target 寸法・render target / read framebuffer / renderbuffer binding・更新 flags・計測 listener の復元を試みる。復元できなければ実最終寸法・資源状態と失敗を残して無効にする。中途失敗を消したり、復元 PNG の相違を許容したりしない。render+gl.finish の経過時間を実 CI で記録するが、独立した GPU timer や FPS 測定とは扱わない。

Node 側は root と dist の両 bytes を pin と照合し、外部 test URL、他の opt-in 変数、同一 report 内での同じ場面の再実施を拒否する。受領した PNG bytes を原形で保存し、PNG デコード・寸法・元 cached PNG / restored PNG の SHA 一致を検査する。壊れた frame があっても他の受領済み原 frame の保存を試み、失敗を report/check/throw に伝播する。export は 6 期待名をすべて要求し、既存の 2 MiB cap、3000-byte offset、SHA、欠落・不完全での失敗を保持する。

検証は以下の有限範囲で成功した。

- CPU 20 / 20、91.27 ms。正規 r180 WebGLShadowMap と WebGLTextures の実関数、実 Three r180 RenderTarget.setSize を CPU GL handle fixture で実行。mapSize だけでは寸法が変わらないこと、実 dispose / 再生成手順、成功時の復元を再現した。旧資源 leak、非 dispose、実 storage 異寸法、incomplete framebuffer、GL error、context loss、中途描画例外、cleanup 失敗、pose / bias / extent / PCF drift、復元 PNG token 不一致を拒否した。
- Node / export 境界 12 / 12、1088.63 ms。正しい pin と原 byte 保存、誤 pin、外部 URL、同一 scene 再実施、他 control 混在、破損 / 異寸法 / 復元相違の失敗伝播を確認した。既存 10 出力 + 新 6 出力の全量往復・offset / SHA と、欠落 / 2 MiB 超過の拒否を確認した。
- Node 構文と正規 base コピー上の `git apply --check` が成功した。新 tools helper 以外の機能 suite、browser、CI は起動していない。

CPU の GL 資源は計測用 fixture であり、実 GPU ではない。CPU 画像値は非画像 token、転送検査は既存 C33 原 PNG の再利用であり、新規診断 PNG とは数えない。最初の限定 CPU 結果も別名で保持し、最終結果は現在の helper SHA に一致する。

統合担当の次の 1 操作は、この 3-file patch を独立レビュー後、通常の正規 CI に **明示 marker 付き push の初回だけ動く単回診断 job** として接続すること。環境は `CINDERLINE_VISUAL_ONLY=1`、`CINDERLINE_SHADOW_RESOLUTION=1`、固有の `CINDERLINE_WEBKIT_OUTPUT` を設定し、外部 URL と他の試行 opt-in は設定しない。既存 WebKit command、always の exporter と artifact 保存を使い、`shadow-resolution-{arcade,south}-{original,double,restored}.png` の 6 原枚と report を回収する。workflow の保存・起動・再実行判断は単独 writer の担当であり、今回の候補には含めない。

実 WebKit / GPU の寸法・旧資源解放・復元・原 PNG 一致、影の視覚効果、性能、歩行 / 段差 / 階段回帰は未測定。診断設定の製品採用 0、19 要素 / 71 基準・参照不変、有効品質比較 0。remote / CI / automation / 新規子 0。通常の sandbox source 保存で一度 OS の引数長上限に当たったが、同じ許可範囲の apply_patch に切り替えて全 source の Git blob 一致を確認した。権限拡張や拒否経路の再試行は行っていない。

`candidate.patch` SHA-256: `451feafee54be78e7737dc8d93d3a071cfc2d09b19859c51e606c505adb07c36`。ローカル fixture 用 node_modules link と patch-check コピーは納品 manifest / remote 対象から除外する。検証結果を再実行する場合は専有の別コピーを使い、ここに凍結した結果を上書きしない。
