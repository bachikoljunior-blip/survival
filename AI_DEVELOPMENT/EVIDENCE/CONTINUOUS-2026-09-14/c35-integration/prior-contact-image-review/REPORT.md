# C33 接地 control 原画像の出所既知診断

**現時点では bias / normalBias をゼロにする製品変更を推奨しない。** arcade の足元は depth bias に応答するが、浮遊感が明確に解消したとは判断できない。south の可視足元は全 3 control で原画素と同一だった。これは因果調査であり、匿名品質比較・品質合格ではない。

対象は C33 `eb81be9053204fa25a0e7556f78941dd862d4032`、実 runtime `81c93f3bf6c45b14c25f0e742a78d19b8dc70dca665ebba897bb6e39bbc937b3`、run 34864648858 / job 104045297002。原 report は 1,133,163 B、SHA-256 `3a39deae1fa8f756f9facfefb9a5878b2a2d259fd237ec4d1dde59c653e3a3ed`。report と 19 PNG の全 20 原ファイルを回収 manifest の bytes / SHA と照合した。実閲覧した画像は指定された contact 原 10 枚で、すべて 1147 × 645 の無加工画像。crop、拡縮、明度補正、差分画像の生成は 0。

全 8 場面で実 pose / camera / time と設定の復元は一致し、診断 failure / cleanupFailure はない。arcade と south は original = repeat = 元 visual frame の完全 byte 一致を確認した。

| 原 control（各場面 5 枚） | arcade の観察 | south の観察 |
|---|---|---|
| original：bias −0.0009、normalBias 0.028 | 左下へ広がる柔らかい影は残る。黒い足と地面の接点が弱く、両足に明瞭な接触影があるとは読めない。 | 人物と地面が大きな暗部に重なり、右足裏の多くは下端外。足元の境界を読む条件が弱い。 |
| depth-zero：bias 0、normalBias 0.028 | 足元と周囲の影は変化するが、接続が明確に修復されたとは判断できない。広い影の形は残る。 | 可視足元の改善は見えない。周囲の階段・建物・物体の影には変化がある。 |
| normal-zero：bias −0.0009、normalBias 0 | 足周辺の変化は小さく、接続の改善は確定できない。 | 可視足元は変わらない。周囲への小さな変化はある。 |
| both-zero：bias 0、normalBias 0 | depth-zero と同様に足元は応答するが、採用できる明確な改善とは判断しない。 | 可視足元は変わらない。周囲の影も変わるため、足だけへの局所修正ではない。 |
| repeat：元設定へ復元 | original の見え方に戻り、原 bytes も同一。 | original の見え方に戻り、原 bytes も同一。 |

ゼロ設定による大きな新規の縞状 shadow acne は、今回の 2 場面の原画像閲覧では明瞭に確認できなかった。ただし既存の斑点・壁面模様・暗部があり、微細な acne や他場面での副作用がないとは証明できない。

原 report の実足裏記録は以下のとおり。左右は actor の L / R で、arcade では画面上の左右と逆になる。値は collision 面に対する頂点の差であり、レンダリングされた地面の高さの直接測定ではない。

| 場面・足 | 最低 / 最高 gap (mm) | 原画像の足裏頂点範囲 x / y (px) |
|---|---:|---|
| arcade L | −20.36 / +21.61 | 520.83–540.99 / 540.77–554.67 |
| arcade R | −24.26 / +11.66 | 479.28–501.91 / 542.76–555.57 |
| south L | −18.67 / +22.06 | 463.90–519.20 / 607.79–629.60 |
| south R | −20.96 / +16.22 | 453.67–514.94 / 640.40–664.54 |

全 8 場面とも grounded=true で両足の最低頂点は collision 面以下だった。足裏全体を一律に上へ浮かせているという説明は支持されない。south R は重複を含む 12 頂点記録中 9、固有 4 頂点中 3 が y=645 の画面下端外にある。頂点の投影は可視性や遮蔽の証明ではない。歩行・段差・階段は今回未測定。

補助の原 RGBA 照合では、報告された足裏投影範囲の周囲 12 px を含む領域を読み取った。画像は生成していない。arcade の領域 `[467,528,554,569)` では、depth-zero / normal-zero / both-zero の最大 channel 差がそれぞれ 31 / 8 / 31。south の画面内領域 `[441,595,533,645)` は全 3 control と original が完全同一だった。これらは応答位置の診断であり、品質尺度でも接触影の所有者判定でもない。depth bias が arcade 足元の描画へ寄与することは確認できるが、その寄与だけで浮遊感の主因は確定しない。

次の有限診断は **arcade と south の同じ固定 pose で、shadow map サイズだけを 1024 → 2048 → 1024 にする単回 control** を推奨する。正規 C33 engine は medium tier で shadowSize=1024、shadowDistance=48、PCFSoftShadowMap を使用する。原 report の matrix から計算した足裏の shadow-map 境界幅は、arcade で約 2.79–2.81 × 2.36–2.39 texel、south で約 2.79–2.81 × 1.96–2.02 texel。粗いサンプリングとフィルタが接点を曖昧にしている可能性があるが、未検証の仮説である。

この診断では tier 全体を切り替えず、shadow extent ±48、元 bias −0.0009 / normalBias 0.028、light、camera、pose、time、material、画像解像度を固定する。実 shadow render target の width / height が指定値に変わったことを測り、単に mapSize の数値だけを書き換えた状態を成功にしない。各場面の original / 2048 / restored の原 PNG と全設定を保存し、finally 復元・原画像と復元画像の byte 一致を要求する。近接と周囲の shadow acne、接続、実描画負荷を測ってから採否を判断する。解像度を上げても接点が変わらない場合は、影の depth / caster / receiver と足裏の実描画面の関係を次に限定して計測し、根拠なく actor を下げない。

これは次の診断提案であり、製品 patch や新 CI は作成・起動していない。新しい shadow-map 診断、実 Safari、動作回帰と品質効果は未測定。19 要素 / 71 基準の判定は変更せず、有効 blind 比較 0。remote、製品編集、automation、新規子は 0。

原 hash、全 8 pose の集約、10 枚の閲覧対象、補助計算は `evidence.json` に保存した。SHA-256: `7d3cdd5e55d57769209ab060985905823bab76311aae4ee6ee0c6d990a32eb38`。
