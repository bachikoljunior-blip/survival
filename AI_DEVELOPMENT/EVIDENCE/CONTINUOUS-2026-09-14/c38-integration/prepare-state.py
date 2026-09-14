from pathlib import Path
import datetime,hashlib,json
W=Path('/workspace/scratch/0b7ad82bafe7');P=W/'main-integration-c38'
s=json.loads((W/'main-integration-c37/session-c37-expected.json').read_text())
prior_work=json.dumps(s['work'],ensure_ascii=False,sort_keys=True)
def scalar(x):return json.dumps(x,ensure_ascii=False,separators=(',',':'))
def lines(x,n=0):
    out=[];pad=' '*n
    for k,v in (x.items() if isinstance(x,dict) else enumerate(x)):
        prefix=pad+(scalar(k)+':' if isinstance(x,dict) else '-')
        if isinstance(v,(dict,list)) and v:out.append(prefix);out+=lines(v,n+2)
        else:out.append(prefix+' '+scalar(v))
    return out
assert '\n'.join(lines(s))+'\n'==(W/'main-integration-c37/candidate/AI_DEVELOPMENT/SESSION_STATE.yaml').read_text()
now=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)));stamp=now.isoformat(timespec='milliseconds')
hours=(datetime.datetime.fromisoformat(s['work']['deadline_at'])-now).total_seconds()/3600
c=s['checkpoint'];c.update(last_progress_at=stamp,verified_commit='bf743056ce143f09e4c6544ef1c7df4b73b232fd',evidence='AI_DEVELOPMENT/EVIDENCE/CONTINUOUS-2026-09-14/c38-integration/REPORT.md')
c['continuation_check_observation']=stamp+' C37の94path正式保存・PR head同期・原Safari結果と担当継続状態を照合して続行。親remote0、統合担当だけがwriter、開始/期限/全19/71基準を保持。'
c['last_verified_action']='C37 bf743を94path/tree f67b3d5全読戻しで保存、本文3source/root1094採用、main545は旧6b。sourceFloor34879275702はsuccess、PRFloor34879453199はfailure、round34879452664はsuccess。source Safari104094199700は53checks/3clips全pass、F3 execution104097805106 success。PR104094807794も実起動・3clips保存したがstreet比0.9254526869/arcade比0.9454036965で元時計guard失敗。PRの解除直後moveMagnitude1は次実fixed更新85msで0、解除検査passed。原失敗時lifecycle追加操作なし。両profile無し、新successをC34/C36の原因修復としない。C36原WDAの9files3355781Bを1126chunks/meta=end/SHA照合で回収。build成功後WDA/status待ち失敗、BUILD INTERRUPTEDはtimeout後の停止と分離。'
c['modified_but_unverified']='C38は既存DISTの同一origin POSTによる大録音JSON転送、処理別frame-work probe、transferHelperSha256のF3/export必須照合、検証済みpreflight provenanceのsession前保持、成功CIの重複stdout省略を統合する候補。原120s/48MiB文字/128KiB上限、録音/時計/4substeps/5%guard、1094と音声92ee不変。実HTTP fixtureは同じ1500ms予算で旧1526ms timeout→新485ms完全JSON一致、29独立検査成功。phaseは実Engine CPU62+独立25成功だが実Safari負荷・新report実容量・CPU/GPU原因未測定。WDA能力/期限変更0。新英日6node候補は別担当で制作中、C38製品には未採用。'
c['next_action']='C38の独立code reviewを完了し受理済C37 runが完了した安全点で通常保存・head/tree読戻し。source限定[ ios-frame-work-c38-r1 ]の実単回profileでworld/composite/各fixed処理と残損失を測り最小製品修復へ進む。新転送で3原録音/元時計/解除/原SHAを実Safari検証。C37 PR原時計失敗は保持して条件を緩めない。新E9診断を基に対立時の応答構造を分けた英日候補を実build/画面確認後に同branchへ採用。PR16の最終headでF2/F3/F5と通常検証を通して通常merge、既存Pages/F6で4assetsを確認。全19not measured/valid0/units0のcontinuousを継続する。'
c['deadline_assessment']=f'{stamp} 継続確認直後、残{hours:.2f}時間。全19not measured/有効blind0/units0で期限内全達成を根拠付きで「できる」とはまだ言えない。実速度に対し方法変更を続ける。転送は実HTTPで1526ms失敗→485ms成功を測定、処理probeをrenderer2calls集計からworld/compositeと各fixed相へ細分化、待ちが続く成功CIの重複原ログstdoutを省く候補を検証中。C37新Safari source成功に対しPR街/室内時計は依然失敗、元C36損失1.092667sはclamp/更新後破棄で一致したが内部CPU/GPU原因未確定。fresh全文比較は正式受理・1746語回答まで完了したが出所認識によりblind無効。都合良い再比較ではなく対立時の2人物の応答構造を実制作で分ける方法へ変更。開始/期限/参照/閾値不変。'
c['blockers']=[
'全19not measured/有効blind0/units0。固定71基準/10参照・continuousを保持。',
'C34 street source0.947327044/PR0.814494681、C36 source0.8966843166918298の原時計失敗を保持。C36原profileの損失1.092667sはclamp/4updates後破棄で一致。renderer446ms/2calls、別callback updater182ms/4calls、外部gap319msは同期経過でCPU/GPU負荷と断定しない。C37 PR street0.9254526869/arcade0.9454036965も失敗、細分phase実測と製品修復未完。',
'C36第三arcade転送120s失敗は原失敗のまま。C37で3clips保存できても旧原因修復証明ではない。C38同一origin転送は29独立HTTP否定検査と同条件fixture成功、実Safari新経路は未検証。',
'C36 PR WDA原9filesを完全回収。build成功からWDA応答までが一次境界、根本原因不明。C37 source/PR起動成功から原因解決とせず、能力/timeout増量0。',
'C37英日8node/root1094を実locked build/16原画/byte検査後に採用済み。main545は旧6b、PR16必須F3失敗、通常main/Pages/F6未反映。',
'E9変更後全文packetのfresh Ultraは7+13unit/両終端読了を申告しCOMPARISON_END到達、認識yesでblind無効。診断は対立時の思考差で参照優位、独自の目的で同等。制作2人の似た応答構造を新英日候補で修正中、未採用。同一未変更資料の再比較0。旧Q35 7200s timeout/answer0と旧2回不受理は保持。参照原文/詳細あらすじ/対応表を公開repo/製品へ混入しない。',
'E16影6原画はarcade局所改善、south/性能根拠不足のため2048非採用・1024保持。原足/支持面の固定浮遊仮説は反証済。出所認識の旧比較無効を保持、別の実制作改善と有効比較は未完。',
'E12音声聴取/有効比較は未測定。clock/provenance/波形数値を聴取としない。',
'旧環境cwd不存在/旧agent不在/旧workspace可読、内部原因未確認。今回原Safari担当のcapacity errorは保存物を確認し同一既存Ultraへ正規followup、下位fallback0。追加subreviewのthreadlimitは不受理として新起動0、既存独立reviewer自身が継続。安全/権限/上限を迂回しない。',
'E19公式FFF337は非回復modエラー画面のみ。公式demoHEAD403/desktop能力なし、既存headless資料をGUI回復や盲検の代用にしない。']
c['comparison_record_preservation']='E9 freshの原4inputs/response/receipt/正式受理の7filesをprivate archive71501B（SHA43ae2d8f207ebec77fad71f3ed1fbfee0ea409feef75bb52e770f9baff0b6e6f）に保全。local ZIP再読取りCRC/全fileSHA一致、正規private保管createがsucceeded/71501B/version0を返しlocalidentity適用も成功。scratch別コピーだけではない。remote bytesの再読取り/SHAは未実施、会話権限はupload/置換のみなのでread/list0。原応答とprivate識別情報は会話内private記録に保持し公開repoには含めない。有効blind0。'
c['main_reflection']['game_implementation']='main545 remains old6b. C37 adopted verified narrative3/root1094; audio92ee unchanged. C37 source Safari/F3 passed, PR Safari failed original street/arcade clock guards. C38 transfer/probe/provenance/CI-output changes await real Safari; normal PR16 merge and Pages/F6 remain pending.'
d=c['delegation'];d['active']=['/root/integration_recovery_ultra','/root/integration_recovery_ultra/narrative_build_ultra','/root/integration_recovery_ultra/shadow_original_review_ultra','/root/integration_recovery_ultra/safari_time_loss_ultra']
d['roles_pending_f3']='writer integration_recovery_ultra: 保存・実CI・原解析・修復・main・期限判断。narrative_build_ultra: 既存転送候補freeze後E9新応答構造の英日制作。shadow_original_review_ultra: WDA原回収完了後C38統合7path独立review。safari_time_loss_ultra: C37 source/PR原結果・既存raw_clock_refuter独立照合のfreeze。同既存Ultraはcapacity停止後に保存地点から正規受理して続行。匿名評価者は有限完了、認識yesで無効blind。追加subreviewはthreadlimit不受理、未起動。'
d['not_yet_executed']='C38新転送/細分phase実Safari、時計損失の内部原因と製品修復、新英日候補build/採用、有効blind、音声聴取、PR16通常main/Pages/F6。'
c['last_verified_action']+=' 受理済C37 standalone34879275517もcompleted successとなり4run全完了。C38独立code reviewは7paths/51検査blocking0、null-safe guard修正も確認済み。'
c['deadline_assessment']=c['deadline_assessment'].replace('省く候補を検証中','省く候補の51独立検査を完了')
c['c38_independent_review']={'paths':7,'limitedChecksPassed':51,'blocking':0,'reviewReportSha256':'88ee1e30977c3d6fe82956a1cfc2ecff5562997809df795439dd210ca58958ef','manifestSha256':'b0350b88e43af39d16aa7f5db5fda2e2de4bcfaa07f7c3f698c702b717f67bed','actualSafari':False,'next':'final preservation/state boundary review, then normal save and actual CI'}
d['active']=['/root/integration_recovery_ultra','/root/integration_recovery_ultra/narrative_build_ultra']
c['modified_but_unverified']=c['modified_but_unverified'].replace('別担当で制作中','独立review blocking0で凍結済み（6nodes/12本文、旧8nodes/16本文保持）')
c['next_action']=c['next_action'].replace('[ ios-frame-work-c38-r1 ]','[ios-frame-work-c38-r1]')
c['blockers']=[v.replace('新英日候補で修正中、未採用','新英日候補で分離し凍結・独立review blocking0、未build/未採用') for v in c['blockers']]
c['e9_candidate_preserved']='新6nodes/12本文の3source候補・制作診断・独立検証をexact公開allowlist20files＋controlに限りevidenceへ保存準備。製品3source/root1094は不変、通常build/英日12原画/採用は次段。明確な既存journal期間不一致は別残差として原座標を保存し未修正。'
d['active']=['/root/integration_recovery_ultra','/root/integration_recovery_ultra/narrative_build_ultra','/root/integration_recovery_ultra/safari_time_loss_ultra']
d['roles_pending_f3']='writer integration_recovery_ultra: 保存・実CI・原解析・修復・main・期限判断。narrative_build_ultra: 新6node英日候補freeze後、既存locked CIによる次build準備の有限担当を正式受理。shadow_original_review_ultra: C38統合7path独立51検査blocking0で有限完了。safari_time_loss_ultra: C37原結果freeze後C38保存前の状態/原物/公開境界の有限独立review。raw_clock_refuterと匿名評価者は有限完了、後者認識yesで無効blind。追加subreviewはthreadlimit不受理、未起動。'
c['last_verified_action']+=' 保存前104pathの原物/公開/strict状態境界は別Ultraがblocking0で確認。その後、独立36controls済みの本文実build準備6pathを同じC38へ追加採用する判断。統合writerは正規bf743 gatesの既存prepare job以外全byte不変を確認した。'
c['modified_but_unverified']+=' 新本文のbuild準備はbf743の47inputs/root1094一致を保持する6pathをC38へ同居。実git HEAD/run identityを生成時に取得し、[prepare-narrative-product-r2]のsource単回jobで23原filesを生成する。これにより専用prepareコミット/CI往復を省く構成へ変更。実生成SHA/実12画面/所要時間はまだ未取得。'
c['next_action']='C38を通常保存・head/tree読戻しし、同じsource CI周期で[ios-frame-work-c38-r1]による細分phaseと[prepare-narrative-product-r2]による6node実build/12原画を実行する。source/PRの新転送3録音・元時計/解除と原SHAを検証し、細分phaseから最小製品修復へ進む。新本文23原filesを回収・byte/pin/原画像を確認後に3sourceと生成rootを同branchへ同時採用。既存journal期間の明確な不一致も次の最小制作修正として残す。最新PR16必須F2/F3/F5と通常CIを満たして通常merge、既存Pages/F6で4assetsと起動を確認。全19not measured/valid0/units0のcontinuousを継続する。'
c['deadline_assessment']+=' 独立検査済み6node build準備も同じC38 source CIへ統合して専用prepare往復を省く。既104path境界を新6pathまで検査したと拡張せず、追加6pathの別独立36controlsとwriterのjob境界照合を根拠にする。実CIで並行生成の完了と所要時間を確認する。'
c['c38_final_boundary_review']={'paths':104,'blocking':0,'manifestSha256':'bd9847e63d0dd1d2222361083b83d5823912c090d1eedae66f1bbb53e0c99f8f','reportSha256':'e7fd0a5230a77c957d8c64f892e34a66b9843d286dc28e9c386891730b53166e','receiptSha256':'1df5c8af915db7944c3f87844d650a53ca6d9fcc05b27d9d93c0bf8aa6e26c15','additionalPreparationSixPathsCovered':False}
c['c38_additional_build_preparation']={'paths':6,'independentControls':36,'blocking':0,'sourceBaseline':'bf743056ce143f09e4c6544ef1c7df4b73b232fd','buildInputs':47,'actualBuild':False,'actualGeneratedSha256':None,'writerGatesOutsidePrepareJobByteIdentical':True,'scope':'Same source CI; 10 prepared original files plus 12 screenshots and route report. No product source/root adoption yet.'}
d['active']=['/root/integration_recovery_ultra','/root/integration_recovery_ultra/narrative_build_ultra']
d['roles_pending_f3']='integration_recovery_ultra is sole writer and owns save/CI/raw recovery/performance repair/main/deadline. narrative_build_ultra and its already accepted Ultra helper reviewer completed 6node candidate and 36-control build preparation; source-CI acquisition continues after actual save identity is provided. shadow_original_review_ultra completed 7path/51 controls. safari_time_loss_ultra completed C37 raw results and final104 boundary; the added6paths use separate narrative review, not an expanded104 verdict. Future source profile analysis and all main/Pages verification remain assigned to the integration owner until a formal bounded handoff.'
assert json.dumps(s['work'],ensure_ascii=False,sort_keys=True)==prior_work
t=P/'candidate/AI_DEVELOPMENT/SESSION_STATE.yaml';t.parent.mkdir(parents=True,exist_ok=True);t.write_text('\n'.join(lines(s))+'\n')
(P/'session-c38-expected.json').write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n')
(P/'deadline-receipt.json').write_text(json.dumps({'recordedAt':stamp,'remainingHours':hours,'workUnchanged':True,'allElements':'19 not measured','validBlind':0,'unitsCompleted':0},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'remainingHours':hours,'workUnchanged':True,'sessionBytes':t.stat().st_size}))
