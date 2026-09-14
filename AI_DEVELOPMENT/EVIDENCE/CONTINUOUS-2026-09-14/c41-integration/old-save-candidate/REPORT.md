既存セーブに残る Iris journal の旧期間を、読込み時だけ限定修復する1ファイル候補。既知の id・title・本文が全て完全一致した場合だけ、本文の one month. を ten months. に変える。未build・未採用であり、生成rootはない。

基点は正規 C39 dff2d683d0a9821c79d84848bf93cb45b8920494 / tree18bf6fb6597c2ef5d8cf96800b1761cdeea3827d。head→AGENTS→CLAUDE→SESSIONを順に受理し、src/game/state.js の Git blob138970ef227079cb437c4f30c28448f5566b8913と、story・narrative・locale・UI・Director・utilの計13原ファイルを同じ固定headから取得・照合した。元source/rootには書込んでいない。

実経路は、CONVERSATIONS.iris_first.nodes.i_gives.effects[3].journal の英語値→applyEffects→GameState.addJournal。addJournalは同idがあればfalseを返し、既存本文を更新しない。serialiseはjournal本文を保存する。読込みはStorage.load→migrateSave→Director.applySave→GameState.deserialise。Menus.refreshJournalは t('journal.<id>.text', j.text) を使い、英語時は保存されたfallbackがそのまま選ばれる。日本語時は表示直前にlocaleの本文を選ぶため、日本語で遊んだ正常なセーブも保存本文は英語である。従ってC40の新規取得用2文字列を直すだけでは、既存英語セーブの表示が残る。

変更はsrc/game/state.jsのみ、2 hunks。既知旧本文の定数を置き、deserialiseのjournal代入に限定変換を加えた。条件は id='iris'、title='Iris Nadeau'、本文全文が正規旧英文と改行を含め完全一致すること。条件に一致したentryだけを {...entry, text:...} でcopyし、t・追加field・他のentry・順序・件数を保持する。異なるid/title、末尾空白、改行を潰した近似文、別本文、日本語本文には適用しない。同idの任意の現行文を上書きする仕組みではない。

SAVE_KEY='cinderline.save.v1'、SAVE_VERSION=2、SAVE_MIGRATIONS、validation、Storage全関数は元bytesのまま。format migrationへv3を追加していない。Storage.load/inspect/hasSaveが保存slotを書き換えるようにもしていない。実行状態へ反映した本文は既存の次の通常Storage.saveで保存される。入力payloadは不変で、旧v1は従来の1→2移行後に修復し、次のsave時の旧bytes救済も従来どおり動く。version2の旧readerは修復後のsaveを引き続き読める。journal event、新規取得、choice、trust、flag、quest、inventory等の効果を再実行しない。

候補34,503B / SHA256 356d2bb3d3ae1b019e38bd73c05778ff67b048cffa9775d5bad052fc9d118530。candidate.patchとprovenance.jsonに基点・候補のSHA256/Git blobを固定する。C40の47inputs/root8c基点やC40本文候補は変更しておらず、fixtureへ検証用のexact copyを置いただけである。C40 source correctionの採用後に使う別のsave互換候補として渡す。C39旧storyのまま新規取得した本文を取得直後に直す機能は加えず、その本文は次に読込む時の完全一致修復対象になる。

限定検証は56checks成功。実際のGameState/Storage/narrative/i18nモジュールをNodeでimportし、in-memory Web Storage API fixture上で通常save→JSON→load→deserialise→save→再loadを実行した。元ユーザーのセーブは読んでいない。10ケースは旧v2、既修復、別id、別title、近似本文、別改行、custom本文、日本語本文、空journal、重複entry。保存前後の全serialised状態、world/envelope/player全fieldを比較し、許された本文差以外は一致。入力JSONの非変更、journal event0、同id追加拒否、2回目の冪等性、v2旧reader互換も確認した。

追加でv1→v2の既存移行と原v1 bytes救済、optional journal欠落、invalid journal拒否、新規EN/JA取得時の全effects一致と保存往復を確認した。C40のexact英語/日本語候補をfixtureに使い、実i18n.tで旧saveからのEN fallbackがtwo years and ten months、JA表示が2年10か月になることを確認。既存UIの改行整形・DOM描画はsource経路を確認しただけで、browser/画面の新測定はしていない。2 hunksを逆変換すると正規state.jsの全bytesへ戻り、Storageとversion/migration/validationコードが全bytes不変であることも確認した。

公開対象はpublication-allowlist.jsonに明示した候補・差分・検証script・検証結果・provenance・本REPORT・manifest/controlだけ。authority、原sourceのbaseline、fixture、作成scriptは公開しない。比較参照原文・詳細あらすじ・private archive・Library識別情報にはアクセスしていない。

残る工程は、正式な独立レビューと、このsourceを含む将来の正規buildおよび起動・save/localeの実ブラウザ確認。今回の候補をC40の既定build inputsに混ぜず、生成root/pinsを推測しない。compilation0、CI0、remote0、automation0、Library操作0、新spawn0。全19 not measured / 71基準 / validBlind0 / units0 / continuous、開始2026-09-13T20:56:49+09:00、期限2026-09-20T20:56:49+09:00を保持。品質達成や全体修復を示す結果ではない。
