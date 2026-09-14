from pathlib import Path
import datetime, hashlib, json
W=Path('/workspace/scratch/0b7ad82bafe7'); P=W/'main-integration-c37'
s=json.loads((W/'main-integration-c36/session-c36-expected.json').read_text())
work=json.dumps(s['work'],ensure_ascii=False,sort_keys=True)
def scalar(x): return json.dumps(x,ensure_ascii=False,separators=(',',':'))
def lines(x,n=0):
    out=[];pad=' '*n
    for k,v in (x.items() if isinstance(x,dict) else enumerate(x)):
        prefix=pad+(scalar(k)+':' if isinstance(x,dict) else '-')
        if isinstance(v,(dict,list)) and v:out.append(prefix);out+=lines(v,n+2)
        else:out.append(prefix+' '+scalar(v))
    return out
assert '\n'.join(lines(s))+'\n'==(W/'main-integration-c36/candidate/AI_DEVELOPMENT/SESSION_STATE.yaml').read_text()
now=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)));stamp=now.isoformat(timespec='milliseconds')
hours=(datetime.datetime.fromisoformat(s['work']['deadline_at'])-now).total_seconds()/3600
c=s['checkpoint'];c.update(last_progress_at=stamp,verified_commit='789f2199bd3791a6dc6566eecaf3c1478c99afa6',verified_build_sha256='1094c1d96bed6b953c1655ce65549c484b8f09e275f055bff283499cece110f7',evidence='AI_DEVELOPMENT/EVIDENCE/CONTINUOUS-2026-09-14/c37-integration/REPORT.md',current_browser_evidence='AI_DEVELOPMENT/EVIDENCE/CONTINUOUS-2026-09-14/c36-safari-profile/report.json')
c['continuation_check_observation']=stamp+' C36正式保存130path/受理済4run完了と未完原失敗を照合し続行。親remote0、唯一writer継承と旧環境原因未確認を保持。'
c['last_verified_action']='C36 789f219を130path全読戻しで保存、main545不変。source/PR Floorはfailure、roundと通常Safariはsuccess（27checks、音声取得なし）。source/PR core・narrative、PR F2/F5はsuccess。本文prepare104080729331は旧514f再現、47inputs、全7build段階、新1094bundleと3src/static一致を実確認。原27files/6537146Bを各正規meta/chunk/end/SHAで完全回収、16原PNGを本人閲覧し今回本文表示blocking0。独立5path/16CPUもblocking0で本文source3+root+IOS_AUDIO_PIN3fieldの同時採用を決定。C36source104080730225は実ゲームへ到達、入力解除は最初の実更新後18msでpassed。原fullreport4472434B/b2de6f0bを1491chunks/end一致で完全回収し、street時計0.8966843166918298・第三arcade転送120s失敗を保持。PR104080745531はゲーム以前WDA/session ECONNREFUSED127.0.0.1:8100/checks0/clips0の別障害。'
c['modified_but_unverified']='C37は8node英日本文だけの3sourceと実生成root1094を同時採用する。条件/効果/選択肢/分岐/他静的assetと音声source92ee不変。実1094 prepare画面はステージ済みChromium診断であり通常play/Safari/有効blindではない。IOS_AUDIO_PINはpreparedFromCommit789f/preparationReport2dbf5a5b/bundle1094のみ更新、recorder/5%時計/4substeps/48MiB・128KiB・120s guard保持。別にC36 PR原ZIP97944B/b40c9691の固定回収helper+単回sourcejobと、音声modeのsession作成失敗だけの原起動log出力を採用。独立49合成検査blocking0だが元ZIP7file形状・実回収は未検証。時間損失・第三転送・WDA起動そのものの修復は未完。'
c['next_action']='C37を指定制作branchへ通常保存し実head読戻し。marker選択の正規CIで固定C36 PR原WDAログを回収・digest照合し起動原因を修復する。原C36 frame-workの処理別時間損失を独立照合して原因に沿う最小製品修正へ進む。第三録音は容量/120s期限保持の同一origin診断転送候補を隔離実装・独立検証し、source/root/pinを整えて次の実Safariへ。新1094に一致する全文E9packetのfresh独立Ultra比較を1回開始し、出所認識時は無効blindとして保持。PR16の最新headで必須F2/F3/F5と通常検証を通し通常merge、Pages/F6で4assets一致を確認。全19not measured/valid0/units0のcontinuousを維持し、main/commit/CIで全体終了にしない。'
c['deadline_assessment']=f'{stamp} 継続確認後、残{hours:.2f}時間。全19not measured/有効blind0/units0の実速度から期限内全達成を根拠付きで「できる」とはまだ言えない。実方法変更の効果は、失われた8node候補をlockedCIで実1094へ生成、原16画面と独立5path/16controlsで採用判断、解除を実Safariの次固定更新後18msで確認、4472434B処理記録を完全回収しstreet約1.093秒損失と第三転送期限を分離したこと。街の最大callback447ms（renderer累計446ms/2calls）、別callbackのupdater累計182ms/4fixed calls、外部gap319ms、街の音声update最大1ms（全3recordingsでは最大2ms）は今回profileの同期経過時間でありCPU/GPU利用率ではない。source成功再試行に依存せず描画/更新の原因と転送経路を別々に修復し、PRの起動失敗は固定原artifactへ戻る。開始/期限/閾値不変。'
c['blockers']=[
'全19not measured/有効blind0/units0。continuous、固定71基準/10参照を保持。',
'元C34 street source0.947327044/PR0.814494681の時計失敗を保持。C36 sourceもstreet0.8966843166918298、損失1.092666666667208sで原5%失敗。原4472434B処理記録からrenderer/update/outside gapの帰属を独立解析中。',
'C36 source第三arcade録音はWebDriver chunk transfer120s期限失敗。原recording/profileは3回、保存clipはstreet/gas2個。容量/期限を緩めずharness同一origin転送候補へ方法変更、実Safari未検証。',
'C36 PRはWebDriverAgent session起動前の接続拒否、checks0/clips0。固定原artifact10360954160のZIP digestと7text回収を正規CIで行う。WDA根本原因未確認、新成功を元録音/時間修復としない。',
'本文1094は実build/16画面/独立byte検査を経て採用するが、新head通常play/Safari/PR必須CI、normal main/Pages/F6は未完。main545は旧6bのまま。',
'E9変更後全文packetは8本文以外60468bytesと参照/問い/graph不変で準備済み、実1094と一致。旧Q35 7200s timeout/answer0と旧Ultra2回不受理保持。fresh評価未起動、固有名詞から出所認識可能性あり、認識した結果を有効blindにしない。参照全文/詳細あらすじ/private mappingは公開保存/製品へ混入させない。',
'E16旧出所認識による無効比較を保持。C35 shadow6原画像はarcade局所改善だけでsouth/性能根拠不足、2048非採用/1024保持。足と支持面が見える新条件の改善と有効比較は未完。',
'E12聴取/有効品質比較は未測定。clock/provenance/波形数値は聴取の代用にならない。',
'旧環境通知cwd不存在/旧agent不在/旧workspace可読を観測。内部原因未確認、唯一writer継承済み。旧拒否fileURI/public URLの再試行や資格情報取得・権限/環境上限迂回なし。',
'E19公式FFF337は非回復modエラー画面のみ。公式demoHEAD403/desktop能力なし、既存headless資料をGUI回復や盲検の代用にしない。']
c['main_reflection']['game_implementation']='main545 is still old6b. C37 adopts three reviewed narrative sources and actual prepared root1094 together; audio92ee and all conditions/branches remain. C36 original street timing and third transfer failures, and separate PR WDA startup failure, remain unresolved. New-head required CI, normal PR16 merge and Pages/F6 pending.'
d=c['delegation'];d['active']=['/root/integration_recovery_ultra','/root/integration_recovery_ultra/safari_time_loss_ultra','/root/integration_recovery_ultra/narrative_build_ultra']
d['roles_pending_f3']='実処理原因と製品候補: safari_time_loss_ultra（独立raw_clock_refuter_ultra）。第三録音転送修復: narrative_build_ultra（独立prepare_helper_review_ultra）。本文27原file/16画面と5path採用reviewは有限完了。shadow_original_review_ultraは原影review・変更後private E9packet・C37起動回収3path独立49検査を有限完了。統合writerが保存/実CI/原回収/通常main/期限/報告、fresh匿名評価は次に正式割当。'
d['not_yet_executed']='C37新head必須CI、固定原WDA artifactの実回収と根本修復、実時間損失/第三転送修復、有効独立E9比較、音声聴取、通常main/Pages/F6。'
assert json.dumps(s['work'],ensure_ascii=False,sort_keys=True)==work
target=P/'candidate/AI_DEVELOPMENT/SESSION_STATE.yaml';target.parent.mkdir(parents=True,exist_ok=True);target.write_text('\n'.join(lines(s))+'\n')
(P/'session-c37-expected.json').write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n')
(P/'deadline-receipt.json').write_text(json.dumps({'at':stamp,'remainingHours':hours,'workUnchanged':True,'validBlind':0,'unitsCompleted':0,'allElements':'19 not measured'},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'at':stamp,'remainingHours':hours,'workUnchanged':True}))
