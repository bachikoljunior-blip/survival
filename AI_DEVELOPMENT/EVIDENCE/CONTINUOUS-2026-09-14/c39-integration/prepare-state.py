from pathlib import Path
import datetime, hashlib, json
W=Path('/workspace/scratch/0b7ad82bafe7'); P=W/'main-integration-c39'
s=json.loads((W/'main-integration-c38/session-c38-expected.json').read_text())
def scalar(v): return json.dumps(v,ensure_ascii=False,separators=(',',':'))
def lines(value,n=0):
    out=[]
    for key,v in (value.items() if isinstance(value,dict) else enumerate(value)):
        prefix=' '*n+(scalar(key)+':' if isinstance(value,dict) else '-')
        if isinstance(v,(dict,list)) and v: out.append(prefix); out.extend(lines(v,n+2))
        else: out.append(prefix+' '+scalar(v))
    return out
assert '\n'.join(lines(s))+'\n'==(P/'authority-session.yaml').read_text()
frozen_work=json.dumps(s['work'],ensure_ascii=False,sort_keys=True)
now=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)))
stamp=now.isoformat(timespec='milliseconds')
hours=(datetime.datetime.fromisoformat(s['work']['deadline_at'])-now).total_seconds()/3600
c=s['checkpoint']
c.update(last_progress_at=stamp,verified_commit='61e8f8c595bde13634fe709f979816011df165d0',verified_build_sha256='1094c1d96bed6b953c1655ce65549c484b8f09e275f055bff283499cece110f7',evidence='AI_DEVELOPMENT/EVIDENCE/CONTINUOUS-2026-09-14/c39-integration/REPORT.md')
c['continuation_check_observation']=stamp+' 正規C38 head/tree/126path読戻し・受理済4run全completed・親remote0/未完0と実担当継続を照合。唯一writerを保持して同じ未完制作を続行。'
c['last_verified_action']='C38 61e8f8c/tree67c41495を126path読戻しで正式保存、1675blobs/旧1549blob不変/無関係変更0。source Floor34884725972 failure、PR Floor34884733596 failure、round34884733123 success、standalone34884725698 failure、全attempt1 completed。PR core/F2/F5/narrativeはsuccess。本文prepare104112424660は全16steps成功、原23files5329922B/1788chunks/meta=end/SHA/blob全照合、新8c5624生成。47inputs/旧1094再現/7stages/3source/5static/12DOM、12原PNG本人閲覧と独立16controls blocking0。source Safari104112425709は53/54pass/3clips時計guard通過、profile4096rows+844drop/completefalseで失敗、原exportcapacity拒否/meta-chunk-end0。全文原reportはまだ未回収。PRとstandaloneはWDA session成功後にWebInspector application list空でゲーム起動前失敗、原ログ単回回収。'
c['modified_but_unverified']='C39へ実生成3source/root8c5624とIOS_AUDIO_PINの3fieldsを同時採用する5pathを準備、本文のみ6nodes12texts、旧8nodes16texts/条件/効果/分岐不変。実built/表示診断済みだが新製品の通常play/実Safari/品質比較未測定。同一origin初期ページをSafari起動時に開く順序修復と固定C38原artifact回収は別の最小候補として検証中。原時計5%/4substeps/録音/転送期限/容量を弱めず、過去失敗を成功としない。'
c['next_action']='C39で新本文5pathを通常保存、head/readbackを確認し、新製品の受理済PR必須F2/F3/F5を通常実行。Safari初期接続の実効果と固定原artifactの完全回収を同じCI周期で確認する。C38保存済みphase行から製品処理の原因を分析し、証拠が支持する最小修復へ進む。新6node変更後の制作全文materialを保持して有効比較を進める。PR16の最終headで必須gateを通したら通常merge、既存Pages/F6で実main4assetsと起動を確認。全19not measured/valid0/units0のcontinuousを続ける。'
c['deadline_assessment']=f'{stamp} 継続確認後、残{hours:.2f}時間。全19not measured/有効blind0/units0の速度から、期限内全達成を根拠付きで「できる」とはまだ言えない。本文prepareを処理診断と同じC38周期へ統合し、原log上288.26秒で生成/12画面が完了、専用prepare commit/CI往復1回を省いた。総時間の反実比較は未測定。新phaseは4096rows+844dropで飽和し原exportも容量条件拒否、解析不能なので同じ診断の反復でなく固定artifactの安全なlossless回収へ方法を変更する。PRの起動前空WebInspector一覧は公式実version sourceの起動順序に対応する同一origin初期ページの先行起動候補へ変更し、待ち/試行/時計条件を据え置いて次の実Safariで効果を測る。識別された旧比較はvalid0を保持、新6node制作変更後の全文materialへ進める。計画/記録のみや新成功による原原因解決の代用をしない。'
c['blockers']=[
'全19not measured/有効blind0/units0、固定71基準/10参照/continuousを保持。',
'C34/C36/C37原時計失敗を保持。C36原損失1.092667sのclamp/更新後破棄算術は一致したがCPU/GPU/外部待ちの原因未分離。C38は3録音時計guard passでも旧原因修復の証拠ではない。新phase4096rows+844dropで欠落、全文export capacity拒否のため原詳細回収と製品性能修復が未完。',
'C36第三clip転送120s失敗を保持。C38で3clipsと時計guardは成功したが新HTTP転送の全receipt/byte/時間を原fullreportから独立照合する作業は未完。',
'C36 WDA/status ECONNREFUSEDは原9files保全済みで根本原因未確定。C38 PR/standaloneはWDA session成功後のWebInspector application list空によるゲーム起動前失敗で別障害。公式実version sourceを根拠に初期ページ先行起動候補を検証、実Safari効果は未測定。',
'C37の英日8node/root1094は制作branchへ採用済み。新6node/root8c5624はC38locked build/12原画/独立16controlsを通した同時採用候補。main545は旧6b、PR16必須F3失敗、通常main/Pages/F6未反映。',
'E9 fresh全文比較は出所認識yesのため無効、応答構造診断から新6nodeを改稿した。新変更後の制作全文material/匿名比較は次段。既存Iris journal期間の2年1か月対2年10か月不一致は別残差で未修正。旧Q35timeout/answer0と旧2回不受理を保持、同一未変更reroll0。原参照全文/詳細あらすじ/対応表は公開repo/ゲームへ混入禁止。',
'E16影6原画はarcade局所改善のみ、south/性能根拠不足のため2048非採用・1024保持。固定浮遊仮説は反証済み、出所認識の旧比較は無効。',
'E12実音声聴取/有効比較は未測定。clock/provenance/波形数値を聴取としない。',
'旧環境cwd不存在/旧agent不在/旧workspace可読、内部原因未確認。capacity/threadlimitの原拒否を保持、既存正式Ultraの有限followupを使い下位fallback0、安全/権限/上限回避0。',
'E19公式FFF337は非回復modエラー画面のみ。公式demoHEAD403/desktop能力なし、既存headless資料をGUI回復や盲検の代用にしない。']
c['c38_additional_build_preparation'].update(actualBuild=True,actualGeneratedSha256='8c5624edd96ba238135e46c90e53c6221b3c3303b977bb5d4e41b752264d94f0',scope='Actual C38 job104112424660: 23 originals, 12 original screens, 47 pins, 7 stages, independent16controls. Product adoption prepared as exact five paths for C39.')
c['e9_candidate_preserved']='新6nodes/12本文のexact3sourceをC38lockedCIで実生成、prepared report000c6226/root8c5624、原23files全回収・12原画本人閲覧・独立16controls blocking0。C39では原bytesと3field pinを同時採用する。旧8node16texts保持、journal期間修正は別未完。'
c['main_reflection']['game_implementation']='main545 remains old6b. C38 source root1094 remains current before this save. C39 stages verified three narrative sources/root8c5624 and exact three-field IOS pin. Current PR16 F3 is blocked by pre-game empty WebInspector application listing; normal merge and existing Pages/F6 remain pending.'
d=c['delegation'];d['active']=['/root/integration_recovery_ultra','/root/integration_recovery_ultra/narrative_build_ultra','/root/integration_recovery_ultra/safari_time_loss_ultra','/root/integration_recovery_ultra/shadow_original_review_ultra']
d['roles_pending_f3']='integration_recovery_ultra: sole writer, exact product adoption, CI, main/Pages/F6, deadline and integration. narrative_build_ultra: completed real new6node build/screens and next changed production full material. safari_time_loss_ultra: C38 PR/standalone original recovery and minimal Safari initial-page ordering repair. shadow_original_review_ultra: C38 original report recovery candidate from fixed artifact; existing raw_clock_refuter_ultra reviews independently. Existing prepare_helper_review_ultra is coordinated for bounded independent code review. Parent remote0; no conflicting new principal.'
d['not_yet_executed']='New8c5624 production Safari/normalplay, proposed Safari initial-page repair in realCI, full originalC38 phase recovery and product performance repair, validblind/audio listening, normalPR16/main/PagesF6.'
if (P/'final-state-additions.json').exists():
    additions=json.loads((P/'final-state-additions.json').read_text())
    c.update(additions)
    d['active']=additions['current_scope_owners']['observedRunning']
    d['roles_pending_f3']='All five listed finite producer/reviewer scopes completed. integration_recovery_ultra is the only observed running child at this save boundary and owns normal save/CI/phase analysis/product repair/comparison/main/Pages/deadline. Existing formal Ultra followups will be assigned concrete run/head identities after save; parent remote0.'
assert json.dumps(s['work'],ensure_ascii=False,sort_keys=True)==frozen_work
dst=P/'candidate/AI_DEVELOPMENT/SESSION_STATE.yaml';dst.parent.mkdir(parents=True,exist_ok=True);dst.write_text('\n'.join(lines(s))+'\n')
(P/'session-c39-expected.json').write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n')
(P/'deadline-receipt.json').write_text(json.dumps(dict(recordedAt=stamp,remainingHours=hours,workUnchanged=True,elements='19 not measured',validBlind=0,unitsCompleted=0),ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(sessionBytes=dst.stat().st_size,remainingHours=hours,workUnchanged=True)))
