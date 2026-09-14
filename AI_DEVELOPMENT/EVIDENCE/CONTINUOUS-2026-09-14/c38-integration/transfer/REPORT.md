# Safari third-recording transfer: bounded repair candidate

C36 の原失敗は、録音結果が ready になり容量検査を通った後、WebDriver の分割転送中に120秒の operation 期限を超えたことだった。既存の loopback DIST server へ、録音完了後の大きな JSON だけを同一 origin POST で渡す候補を作成した。元の録音・映像・音声・時計・容量上限は維持した。これは次の検証単位への候補であり、実Safari修復成功やC37採用済みとは扱わない。

## 元の証拠と限界

正規 latest head `789f2199bd3791a6dc6566eecaf3c1478c99afa6` → AGENTS → CLAUDE v3 → SESSION を本人が再受理し、4 helper と STATE も正規取得した。source の各fileは Git blob とbyte一致。単独 remote writer は `/root/integration_recovery_ultra`。

原 source Floor run `34875252891` / attempt1 / job `104080730225` は、第三 `arcade-room` の取得で `Safari audio chunk transfer timed out` を返した。原stackは `ios_audio_capture.mjs:81` → `mobile_audio_capture.mjs:164`。同担当の完全回収原reportは4,472,434 bytes、SHA256 `b2de6f0b9ce375082be62762ee2f880fd47ab0c2bfbcbb7f65923d44b1b2cbe8`。1491 chunksとendの一致を確認した sibling の原回収を参照し、本担当はその原report SHAを再照合した。原logを再取得していない。

街とgasの2 clipsだけが保存された。街のengine/audio比0.8966843166918298は元5% guard不合格、gas0.997069317023389は合格。第三のprofile rowsはあるが、第三の完成media bytes・size・chunk offset・個別WebDriver所要時間は残っていない。`safariAudioTransferFinal` はnull。共有recorderのfinallyが後続evaluateを呼んで元page slotを置き換え得ることはsourceから分かるが、nullだけから実際にどのcleanupが消したかを断定しない。時間損失のphase原因・修復は別担当。

元adapterは開始前に一度だけ期限を設定し、非同期録音停止とJSON作成、ready polling、131072文字ずつの直列 `/execute/sync` 往復に同じ120秒を使う。したがって「録音完了後に追加120秒」ではない。元line81に到達した事実はready・容量検査通過を示すが、転送往復が第三失敗の支配的処理だったことまでは原記録から測定できない。

WebDriverのExecute Scriptは返却値をJSON cloneして成功応答へ載せる。この仕様は転送経路の説明に使い、特定Safari/Appiumの性能測定の代わりにはしない。[W3C WebDriver Working Draft, Execute Script](https://www.w3.org/TR/webdriver2/#execute-script)

## 最小手段変更

採用候補は3 pathsだけ。

- `tools/ios_audio_transfer.mjs`: 既存serverに付ける受信handlerとページ内送信function。新たなserver・公開endpoint・外部URLは作らない。
- `tools/ios_audio_capture.mjs`: 131072文字を超える完成JSONだけを新経路へ渡す。小さな操作は既存WebDriver経路を使う。receiverの原failure/progress receiptをhostに保持し、後続cleanupで消さない。新moduleのsource SHAもprovenanceに記録する。
- `tools/test-ios-safari.mjs`: audio capture時だけ同じDIST serverにhandlerを接続し、残り期限を既存WebDriver HTTP requestへ渡す。既存startup・録音・release・必須checkは保つ。

元recorder `tools/mobile_audio_capture.mjs` のGit blob `785541d3beaed0e35e8bcf042973eabb7bdb5d6c` は不変。`tools/webdriver-request.mjs` 自体も不変。IOS_AUDIO_PINはwriterのC37候補SHA `0ac5b36321b1fdf3d87c6062cd7b070daa7d939f0e3d3e53574d4993320ee513` にある1094の3 pinsを保持する。製品source/root、gameclock・pause・4substeps、録音15秒stop timeout、media bitrate・再生速度・音声mixを変更しない。

受信操作はsession nonceとoperation nonce、単一slotに結び付く。POST・同origin・Host・content-type・operation ID・sequence・offset・total・chars・SHA256・各ackを検査し、異常時は採用しない。未完requestは期限・close・errorで破棄する。同adapterの同時evaluateも開始前に拒否する。

上限は48×1024×1024 UTF-16 charsのまま。元WebDriverの131072 chars上限を残し、新HTTPは131072 UTF-8 wire bytes以下という、より厳しいchunk上限にする。JSON全体を一度だけUTF-8 encodeしてからbytesで分割し、join後にfatal UTF-8 decode・chars一致・再encode一致・JSON parse・SHA256を検査する。byte総量にはchars×3の独立上限も置く。mediaのbase64内容を変換・再圧縮・生成しない。

operationの開始前に設定した絶対期限120000msを、chunkごとに延長しない。receiverは期限後の受信・検証を拒否し、各WebDriver requestは残り期限と従来90000msの小さい方で中断する。元実装が許していた「in-flight commandで120秒を越える」範囲も締める。

## 実再現と独立検査

`verify-real-transport.mjs` は実Node HTTP sockets、実時計、ページfunctionのVM、WebCrypto、fetchを使う。素材は5000121 UTF-16 charsの合成テキストであり、実録音・第三clipの再生成ではない。WebDriver往復へ60msの固定遅延を入れ、同じ短縮予算1500msで比較した。

初回実測では旧経路が1531.55ms、24 commands、返却2,884,656 bytesで同じchunk timeout。候補は478.59ms、7 commands、返却371 bytes、39 POST chunks（最大131072 bytes）で完了し、元JSONのSHA256と完全一致した。これは直列大reply往復で期限を消費する機序と、その経路を変える効果の再現。C36第三録音の実遅延や新Safari性能を推定値で置き換えない。production deadlineは120000msのまま。

最終候補を固定した後の1回では、旧経路1526.02msで同じtimeout、候補484.87msで完全一致の転送に成功した。返却量・commands・POST数は初回と同じ。初回結果も `real-transport-result-initial.json` に保持し、最終結果は `real-transport-result.json` に実際に使った3 candidate SHAとともに保存した。

独立Ultra reviewerは別の実HTTP negative fixturesとserialized senderで28検査に成功した。元JSONの一致、UTF8境界、容量・期限・nonce・同origin・順序・SHA・ack、同時操作拒否、途中切断、後続cleanup後の原failure保持を含む。最後に発見した拒否requestのsocket残留を2箇所だけ修正し、その差分を独立照合した上で、unknown nonceと不正originの未完bodyを送る1件を追加した。404/400後にsocketが閉じ、強制closeなしでserver.closeが完了した。28+1検査、blocking0。独立reviewの初回VM realm間object比較エラーはfixtureのassertionを修正したもので、原失敗fileも保全した。実SafariはこのVM/HTTP試験で測定した扱いにしない。最終REPORT/receiptは `independent-review/`、candidate全path/hashと非競合差分はmanifestと `candidate.patch` にある。

## 次CIで確認する範囲

採用後の通常必須CIで、同じMobile Safari・同じDIST originからPOSTが通ること、HTTP content length / Origin / WebCrypto / TextEncoderの実適合、原media3件とtelemetryの回収、hostの各upload receipt・SHA・所要時間・期限内完了を確認する。失敗した場合は最初の理由と取得済み範囲を保持する。大replyごとのWebDriver返却量減少と転送所要時間が、実Safariでも改善するかは未測定。

街の元時計不合格はこの転送変更では解消扱いにしない。新しい録音や取得成功で元失敗を消さない。WDA startup別障害、Mobile Safari本番経路、通常merge・Pages/F6・聴取・品質比較も本担当の完了には数えない。無変更CIの再起動は行っていない。

全19 not measured / valid blind0 / units0 / continuous。19要素・71基準・参照・STATEは固定。開始2026-09-13T20:56:49+09:00、期限2026-09-20T20:56:49+09:00を保持。remote / CI / retry / automation mutationは0。
