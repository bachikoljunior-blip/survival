Iris の期間表現は、すべてを同一記録の矛盾とは判定できない。ゲーム自身の原文だけを照合した制作診断であり、比較・品質評価ではない。

| source 座標 | 記録されている内容 | 判断 |
| --- | --- | --- |
| src/game/director.js:1029、iris_folder | 机上の差分 binder。11 sheets、one per quarter、余白は数字だけ。 | 四半期差分ファイルの原物。 |
| src/content/locale/ja/content.js:335、iris_folder | 11 枚、四半期ごとに 1 枚。 | 原物の英日一致。 |
| src/content/story.js、iris_first:i_long / iris_after:i_folder2 | 2 年 10 か月。 | 11 四半期分の記録と現在の端数は両立可能。正確な起算日がないため、33 か月と 34 か月を機械的に矛盾扱いしない。 |
| src/content/story.js:2210、final:e_cut_iris / ENDINGS cut の iris_signed beat | 未署名の reductions が 11 か月分、引き出しにある。 | 前述の差分 binder と同一一式か、別一式・一部期間かは未特定。同一性を創作して期間を統一しない。 |
| src/content/locale/ja/story2.js:507、final:e_cut_iris / locale/ja/content.js:561 | 同じく未署名のものが 11 か月分。 | 英日で同じ曖昧さを保持している。 |
| src/content/story.js、iris_first:i_gives の journal / locale/ja/content.js:423 | 差分ファイルを 2 年 1 か月つけたと記す。 | i_long / i_folder2 の 2 年 10 か月と同一ファイルについて食い違う、明確な既存不一致。 |

期間に手を入れる場合、i_gives の journal 英日を既存 i_long / i_folder2 の「2 年 10 か月」に合わせるのが、新しい経緯を作らない最小案となる。ただし journal は既存 effects 内の文字列で、日本語は locale/ja/content.js にある。今回の「全効果を保持、3 source の会話本文のみ」という候補範囲では変更しない。

final:e_cut_iris は、unsigned ones の指示対象を reductions と明記して期間を省く余地があるが、期間の確定矛盾が確認できたわけではない。今回は当該台詞を保持し、別記録だったとも同一記録だったとも断定しない。

診断基点は bf743056ce143f09e4c6544ef1c7df4b73b232fd。原物・関連原文は正規 App で取得したゲーム自身の source。参照作品・匿名対応表・比較回答は読んでおらず、本書にも含まない。
