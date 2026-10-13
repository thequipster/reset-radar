import { useState, type ReactNode } from 'react';
import type { V3DashboardModel } from './v3Model';
import type { PersonalInputsController } from './usePersonalInputs';
import { PersonalInputs } from './PersonalInputs';
import { PANEL_TABS, initialPanelTab } from './panelTabs';
import { RadarLogo, SunIcon, MoonIcon, ChevronUp, CloseIcon, RefreshIcon, GripDots, SpeakerIcon, CheckIcon, SparkleIcon, SlidersIcon, ShieldIcon, PulseIcon, BarChartIcon, CardStackIcon, CalendarIcon, DatabaseIcon, ChevronDown, ChevronRight, ClockIcon, CopyIcon } from './icons';
import { beijingFull, beijingShort, percentWhole, creditsLabel } from './format';
import { ProgressRing } from './viz';
import type {PlatformCalibrationV3} from '../lib/v3/runtime';
import type {WeekdayCalibration} from '../lib/v3/weekdayEvaluation';
import styles from './DashboardPanel.module.css';
import extra from './V3Dashboard.module.css';
import compact from './CompactBar.module.css';
import peek from './PeekCard.module.css';

export interface V3PanelProps {
  vm:V3DashboardModel|null; controller:PersonalInputsController;
  calibration?:PlatformCalibrationV3;
  weekdayCalibration?:WeekdayCalibration;
  verdictSummaries?: readonly {modelVersion:string;sampleCount:number;positiveCount:number;unknownCount:number;pendingCount:number;brier:number|null;logLoss:number|null}[];
  phase:string; readError:string|null; logError?:string|null;subscriptionError:boolean;refreshing:boolean;demo:boolean;
  activeTheme:'light'|'dark';onThemePreference:(theme:'light'|'dark')=>void;onRefresh:()=>void;onCollapse:()=>void;onClose:()=>void;
}
const pct=(v:number|null|undefined)=>v==null?'—':`${(v*100).toFixed(1)}%`;
const amount=(v:number|null|undefined)=>v==null?'学习中':`${v.toFixed(1)} 周额度百分点`;
const statusText={act_now:'建议现在处理',wait:'先保留，下一次查看再决定',conditional:'条件建议 · 尚有未知',need_data:'还在学习你的用量',not_applicable:'暂无可执行用卡方案'};
const weekdayEvidenceText:Record<WeekdayCalibration['evidenceStatus'],string>={
  unregistered:'尚未登记',collecting:'正在收集线上配对样本',review_due:'到达预定评审点',reviewed_unverified:'已评审，仍未验证',eligible_for_manual_review:'达到人工评审门槛',stopped:'影子记录已停止',
};
const signedScore=(value:number|null|undefined)=>value==null?'—':`${value>0?'+':''}${value.toFixed(4)}`;
function Section({icon,children}:{icon:ReactNode;children:ReactNode}){return <div className={styles.sectionHead}><span className={styles.sectionIcon}>{icon}</span><span className={styles.sectionTitle}>{children}</span></div>;}
function Suggestion({vm,onOpen}:{vm:V3DashboardModel;onOpen?:()=>void}){
  const budget=vm.recommendation.weeklyBudgetToday;
  return <section className={styles.suggestionBanner} aria-label="今日额度建议">
    <span className={styles.suggestionIcon}><SparkleIcon size={24}/></span>
    <div className={styles.suggestionBody}><span className={styles.suggestionLabel}>当前周余额的今日预算</span>
      <strong className={`${styles.suggestionNumber} ${budget?'':extra.learningTitle}`}>{budget?`${budget.low.toFixed(1)} – ${budget.high.toFixed(1)}`:'正在学习你的用量'}{budget&&<span className={styles.suggestionNumberSuffix}> 周额度百分点</span>}</strong>
      <span className={styles.suggestionSub}>{budget?'只按当前余额安排；未来补给到账后再更新。':'完整需求日正在积累；可以先填写今天的安排。'}</span>
    </div>{onOpen&&<button type="button" className={extra.bannerAction} onClick={onOpen} aria-label="填写今天的安排"><ChevronRight size={22}/></button>}
  </section>;
}
export default function V3Dashboard(props:V3PanelProps){
  const {vm,controller}=props;const [tab,setTab]=useState(()=>initialPanelTab(window.location.hash));
  const [focusSection,setFocusSection]=useState<'budget'|'cards'|null>(null);
  const [copyState,setCopyState]=useState<'idle'|'ok'|'error'>('idle');
  const r=vm?.recommendation;const card=controller.state.cards.find(c=>c.localId===r?.cardId);
  const extraVm=vm;
  const optionalController=controller as PersonalInputsController & {state:PersonalInputsController['state']&{continueWorking?:{localDate:string;value:boolean}|null;planningMode?:'policy_default'|'learned'};setContinueWorking?:(value:boolean)=>void;setPlanningMode?:(mode:'policy_default'|'learned')=>void};
  const openInputs=(section:'budget'|'cards')=>{setFocusSection(section);setTab('planner');};
  const replay=extraVm?.platformReference?.replay as {all?:Record<string,{count:number;positiveCount:number;brier:number|null;logLoss:number|null;predictedActualRatio:number|null}>;recent180?:Record<string,{count:number;positiveCount:number;brier:number|null;logLoss:number|null;predictedActualRatio:number|null}>;recent90?:Record<string,{count:number;positiveCount:number;brier:number|null;logLoss:number|null;predictedActualRatio:number|null}>}|undefined;
  const replayModels=['p0','p1','d60','r90'] as const;
  const score=(value:number|null|undefined)=>value==null?'—':value.toFixed(4);
  const replayTable=(period:'all'|'recent180'|'recent90')=>replay?.[period]&&<table className={extra.referenceTable}><thead><tr><th>窗口</th>{replayModels.map(model=><th key={model}>{model.toUpperCase()}</th>)}</tr></thead><tbody><tr><th>样本数</th>{replayModels.map(model=><td key={model}>{replay[period]?.[model]?.count??0}</td>)}</tr><tr><th>正例数</th>{replayModels.map(model=><td key={model}>{replay[period]?.[model]?.positiveCount??0}</td>)}</tr><tr><th>Brier</th>{replayModels.map(model=><td key={model}>{score(replay[period]?.[model]?.brier)}</td>)}</tr><tr><th>Log loss</th>{replayModels.map(model=><td key={model}>{score(replay[period]?.[model]?.logLoss)}</td>)}</tr><tr><th>预测/实际比</th>{replayModels.map(model=><td key={model}>{score(replay[period]?.[model]?.predictedActualRatio)}</td>)}</tr></tbody></table>;
  const scheduled=vm?.supply?.incidents.find(i=>i.kind==='scheduled'&&i.status!=='cancelled'&&i.scheduledFor!=null);
  const copySummary=async()=>{if(!vm)return;try{await navigator.clipboard.writeText(`reset-radar${props.demo?'（演示）':''}\n周余 ${percentWhole(vm.remainingPercent)} / 短余 ${percentWhole(vm.shortRemainingPercent)} / ${creditsLabel(vm.resetCredits)}\n${statusText[vm.recommendation.status]}：${vm.recommendation.reasons.join(' ')}\n平台24h公告参考 ${pct(vm.platform.probability24h)}；账号补给 ${pct(vm.supply?.accountProbability24h)}\n观测 ${beijingFull(vm.updatedAt)} 北京时间`);setCopyState('ok');}catch{setCopyState('error');}};
  return <div className={styles.shell} role="main" aria-label="reset-radar 展开面板">
    <header className={styles.header}>
      <div className={styles.headerDrag} data-tauri-drag-region><GripDots size={16}/><RadarLogo size={30} className={styles.logo}/><span className={styles.title}><span className={styles.titleMain}>reset-radar{vm?.plan&&<span className={styles.titleSubPlan}>{vm.plan}</span>}</span><span className={styles.titleSub}>Codex 额度规划与用卡建议</span></span></div>
      <div className={styles.headerActions}>{props.demo&&<span className={styles.demoBadge}>演示</span>}
        <span className={styles.themeToggle} role="group" aria-label="主题">{(['light','dark'] as const).map(theme=><button type="button" key={theme} className={`${styles.themeOption} ${props.activeTheme===theme?styles.themeOptionActive:''}`} aria-label={theme==='light'?'浅色主题':'深色主题'} aria-pressed={props.activeTheme===theme} onClick={()=>props.onThemePreference(theme)}>{theme==='light'?<SunIcon size={15}/>:<MoonIcon size={15}/>}</button>)}</span>
        <button className={styles.iconButton} onClick={props.onCollapse} aria-label="收起面板"><ChevronUp size={16}/></button><button className={styles.iconButton} onClick={props.onClose} aria-label="隐藏到托盘"><CloseIcon size={16}/></button>
      </div>
    </header>
    <nav className={styles.tabBar} role="tablist" aria-label="面板模块">{PANEL_TABS.map(item=><button type="button" role="tab" aria-selected={tab===item.key} aria-controls={`v3-${item.key}`} id={`v3-tab-${item.key}`} key={item.key} className={`${styles.tabButton} ${tab===item.key?styles.tabButtonActive:''}`} onClick={()=>setTab(item.key)}>{item.key==='risk'?'平台信号':item.label}</button>)}</nav>
    {(props.logError||props.readError||props.subscriptionError)&&<p className={extra.warning} role="status">{props.logError??props.readError??'自动订阅不可用，请手动刷新。'}</p>}
    <div className={`${styles.page} ${extra.page}`} role="tabpanel" id={`v3-${tab}`} aria-labelledby={`v3-tab-${tab}`}>
      {!vm?<div className={styles.stateBanner}><span className={styles.stateBody}><strong className={styles.stateTitle}>等待额度快照</strong><span className={styles.stateSub}>缺失数据不会填成满额。</span></span><button type="button" className={styles.primaryButton} onClick={props.onRefresh} disabled={props.refreshing}><RefreshIcon size={14}/>刷新额度</button></div>:<>
      {tab==='overview'&&<>
        <div className={styles.notices}>
          <div className={`${styles.noticeCard} ${scheduled?styles.noticeCardAnnouncement:''}`}><SpeakerIcon size={17} className={styles.noticeIcon}/><div className={styles.noticeBody}><strong className={styles.noticeTitle}>{scheduled?'有待确认的重置计划':'暂无有效重置计划'}</strong><span className={styles.noticeSub}>{scheduled?<>计划 <span className={styles.timeNoWrap}>{beijingShort(new Date(scheduled.scheduledFor!).toISOString())} 北京时间</span>，等待实际到账确认。</>:'平台公告与账号到账分别跟踪。'}</span></div></div>
          <div className={`${styles.noticeCard} ${vm.status==='ok'?styles.noticeCardOk:styles.noticeCardAnnouncement}`}><CheckIcon size={17} className={styles.noticeIcon}/><div className={styles.noticeBody}><strong className={styles.noticeTitle}>{vm.status==='ok'?'采集正常':vm.status==='stale'?'上次观测 · 数据过期':'采集待确认'}</strong><span className={styles.noticeSub}>最近观测 <span className={styles.timeNoWrap}>{beijingShort(vm.updatedAt)} 北京时间</span>{vm.message&&` ${vm.message}`}</span></div></div>
        </div>
        <Section icon={<PulseIcon size={13}/>}>额度状态与今日建议</Section>
        <div className={styles.quotaGrid}>{[{value:vm.remainingPercent,label:'周额度剩余',window:vm.account?.weekly,color:styles.ringBlue},{value:vm.shortRemainingPercent,label:'短窗剩余',window:vm.account?.short,color:styles.ringGreen}].map(item=><div className={styles.quotaCard} key={item.label}><ProgressRing value={item.value} size={54} className={item.color} label={item.label}><span className={styles.ringCenter}>{percentWhole(item.value)}</span></ProgressRing><span className={styles.quotaText}><span className={styles.quotaLabel}>{item.label}</span><span className={styles.quotaSub}>自然补给 {item.window?<span className={styles.timeNoWrap}>{beijingShort(new Date(item.window.resetsAt).toISOString())} 北京时间</span>:'待取得截止'}</span></span></div>)}</div>
        <Suggestion vm={vm} onOpen={()=>setTab('planner')}/>
        {vm.demand.sampleDays<7&&<div className={extra.coldStart} role="region" aria-label="正在学习你的用量"><strong>还在学习你的用量</strong><span>填写今天大概用多少，马上得到条件建议；也可以先补充卡台账。</span><div><button type="button" onClick={()=>openInputs('budget')}>填写今天用量</button><button type="button" onClick={()=>openInputs('cards')}>补充卡台账</button></div></div>}
        {extraVm?.coldAdvice&&<div className={extra.coldAdvice} aria-label="用量建议"><strong>{extraVm.coldAdvice.headline}</strong>{extraVm.coldAdvice.trigger&&<span>{extraVm.coldAdvice.trigger}</span>}<span>今日{extraVm.coldAdvice.basis==='learned'?'建议预算':'默认分配'}：{extraVm.coldAdvice.allocatedWeeklyPointsToday==null?'待刷新':`${extraVm.coldAdvice.allocatedWeeklyPointsToday.toFixed(1)} 周额度百分点`}</span><span>下次查看：{extraVm.coldAdvice.nextReviewAt==null?'待确认':beijingFull(new Date(extraVm.coldAdvice.nextReviewAt).toISOString())} 北京时间</span><small>依据：{extraVm.coldAdvice.basis==='learned'?'已学习用量':extraVm.coldAdvice.basis==='user_plan'?'你填写的计划':'默认策略档'}。{extraVm.coldAdvice.expectedConsumption==null?'预计用量仍在学习':`预计用量：${extraVm.coldAdvice.expectedConsumption.toFixed(1)} 周额度百分点`}。{extraVm.coldAdvice.assumptions?.join(' ')}</small></div>}
        {extraVm?.coldAdvice&&<div className={extra.confirmWork}><span>今天准备继续工作吗？确认后会纳入今天的规划。</span><button type="button" aria-pressed={optionalController.state.continueWorking?.value===true} onClick={()=>optionalController.setContinueWorking?.(true)}>准备继续工作</button>{vm.demand.sampleDays>=7&&<button type="button" onClick={()=>optionalController.setPlanningMode?.('learned')}>使用已学习用量</button>}</div>}
        <div className={styles.decisionCard}><span className={styles.decisionIcon}><CardStackIcon size={18}/></span><div className={styles.decisionText}><span className={styles.decisionTitle}>用卡建议</span><strong className={styles.decisionMain}>{r?statusText[r.status]:'等待数据'}</strong><span className={styles.decisionSub}>{card?`${card.label}：` : ''}{r?.reasons[0]}</span></div></div>
        {controller.state.reminders.map(rem=><div className={extra.reminder} role="status" key={`${rem.localId}:${rem.tier}`}><strong>临期提醒 · {controller.state.cards.find(c=>c.localId===rem.localId)?.label??'重置卡'}</strong><span>{rem.tier==='needs-confirmation'?'需补具体时间，可能仍可用':rem.tier==='last-chance'?'已到最后建议操作时段':`${rem.tier} 内需处理`}</span>{rem.lastActionAt!=null&&<b>最迟处理 {beijingFull(new Date(rem.lastActionAt).toISOString())} 北京时间</b>}</div>)}
        <div className={styles.pacingRow}><span className={`${styles.pacingIcon} ${styles.pacingIconCyan}`}><SlidersIcon size={17}/></span><div className={styles.pacingBody}><strong className={styles.pacingLabel}>今天的工作量</strong><span className={styles.pacingNote}>{vm.demand.weekly?`${amount(vm.demand.workload[controller.state.effectiveWorkloadToday==='quiet'?'light':controller.state.effectiveWorkloadToday??'unknown'].low)} – ${amount(vm.demand.workload[controller.state.effectiveWorkloadToday==='quiet'?'light':controller.state.effectiveWorkloadToday??'unknown'].high)}`:vm.demand.budgetScenarios.length?'使用你今天填写的预算情景':'正在学习，可在用卡页填今天预算'}</span></div><button type="button" className={styles.sectionLink} onClick={()=>setTab('planner')}>调整</button></div>
        <div className={extra.footerRow}><p className={styles.mutedNote}>{r?.shortWindowEvaluated?'已评估双窗工作量':'短窗工作量未知，周预算不保证连续工作不会限流。'}</p><button type="button" className={styles.primaryButton} onClick={props.onRefresh} disabled={props.refreshing}><RefreshIcon size={14}/> {props.refreshing?'正在读取':'刷新额度'}</button></div>
      </>}
      {tab==='risk'&&<>
        <Section icon={<ShieldIcon size={13}/>}>平台重置信号</Section>
        {extraVm?.platformReference&&<div className={extra.referencePanel}><strong>{extraVm.platformReference.activeModel} · {extraVm.platformReference.activeModel==='D60'?'近期加权参考':'长期参考'}</strong><span>{extraVm.platformReference.reason}</span><small>{extraVm.platformReference.deployment==='reference_active'?'参考版已启用':'保留长期参考'} · {extraVm.platformReference.evidence==='historical_replay'?'已有辅助历史回放':'仍按规定规则参考'}，尚未证明未来更准</small><details><summary>衰减与回放诊断</summary><dl className={extra.details}><dt>模型版本</dt><dd>{extraVm.platformReference.decay.version}</dd><dt>半衰期 / 收缩</dt><dd>60 天 / 7 等效观察日（固定假设）</dd><dt>折扣事件量</dt><dd>{extraVm.platformReference.decay.weightedCount.toFixed(2)}，不是独立样本数</dd><dt>加权暴露</dt><dd>{extraVm.platformReference.decay.weightedExposureDays.toFixed(2)} 天</dd><dt>完整覆盖</dt><dd>{extraVm.platformReference.decay.exposureDays.toFixed(1)} 天</dd><dt>近期发生率</dt><dd>{extraVm.platformReference.decay.ratePerDay?.toFixed(4)??'未知'} 次/天</dd></dl><p>近 90 / 180 天对照与全期评分见数据页；不额外加分，当前预测冻结发生率。</p></details></div>}
        <div className={styles.riskGrid}>{[{hours:24,value:vm.platform.probability24h,icon:<PulseIcon size={19}/>},{hours:48,value:vm.platform.probabilities.find(p=>p.horizonMs===2*86_400_000)?.probability,icon:<BarChartIcon size={19}/>}].map(item=><div className={styles.riskCard} key={item.hours}><span className={extra.signalIcon}>{item.icon}</span><div className={styles.riskText}><span className={styles.riskLabel}>未来 {item.hours} 小时平台公告</span><strong className={styles.riskValue}>{pct(item.value)}</strong><span className={extra.referenceBadge}>{extraVm?.platformReference?.activeModel??'P0'} · 当前概率参考</span></div></div>)}</div>
        <p className={extra.note}>这是新 regular 公告的时间口径，尚不等价于本人账号在窗口内回满的概率。</p>
        <div className={styles.plannerCard}><span className={styles.plannerCardBlueIcon}><CalendarIcon size={20}/></span><div className={styles.plannerText}><strong className={styles.plannerBig}>账号平台补给概率：{pct(vm.supply?.accountProbability24h)}</strong><span className={styles.plannerSub}>{vm.supply?.accountProbabilityReason??'双窗快照缺失，补给场景未计算。'}</span></div></div>
        <dl className={extra.details}><dt>当前选中模型</dt><dd>{extraVm?.platformReference?.activeModel??'P0'} · 参考展示，不代表账号回满</dd><dt>P0 长期参考</dt><dd>{pct((extraVm?.platformLongTerm as {probability24h?:number}|undefined)?.probability24h??vm.platform.probability24h)}</dd><dt>24h 影子模型 P1</dt><dd>{pct(vm.platform.shadow.probability24h)}，尚未升级</dd><dt>48h 当前模型</dt><dd>{pct(vm.platform.probabilities.find(p=>p.horizonMs===2*86_400_000)?.probability)}</dd><dt>regular / 相邻完整间隔</dt><dd>{vm.platform.training.eventCount} / {vm.platform.training.completedGapCount}</dd><dt>有效暴露</dt><dd>{vm.platform.training.exposureDays.toFixed(1)} 天</dd></dl>
        {vm.platform.factors.map(f=><p key={f.key} className={styles.mutedNote}>{f.explanation}：{pct(f.before)} → {pct(f.after)}</p>)}
        {vm.supply?.watchNotes.length? <p className={extra.note}>平台正在观察。原始 watch 百分比只作来源提示，不增加可放心使用的确定额度。</p>:null}
        <p className={styles.mutedNote}>{vm.evidenceQuality.join(' ')}</p>
      </>}
      {tab==='planner'&&<>
        <Section icon={<CardStackIcon size={13}/>}>重置卡与今天的安排</Section>
        {vm.demand.sampleDays>=7&&<div className={extra.confirmWork}><span>{optionalController.state.planningMode==='learned'?'当前按已学习用量规划。':'工作量选项是默认策略档，不是习惯预测。'}</span><button type="button" aria-pressed={optionalController.state.planningMode==='learned'} onClick={()=>optionalController.setPlanningMode?.(optionalController.state.planningMode==='learned'?'policy_default':'learned')}>{optionalController.state.planningMode==='learned'?'恢复默认策略档':'使用已学习用量'}</button></div>}
        <div className={styles.plannerGrid}><div className={styles.plannerCard}><span className={styles.plannerCardBlueIcon}><CardStackIcon size={20}/></span><div className={styles.plannerText}><strong className={styles.plannerBig}>{creditsLabel(vm.resetCredits)}</strong><span className={styles.plannerSub}>可用数量以服务端为准</span></div></div><div className={styles.plannerCard}><span className={extra.signalIcon}><ClockIcon size={20}/></span><div className={styles.plannerText}><strong className={styles.plannerBig}>{r?statusText[r.status]:'等待数据'}</strong><span className={styles.plannerSub}>{card?.label??'卡有效期与偏好可在下方补充'}</span></div></div></div>
        {vm.resetCredits===0&&<p className={extra.note}>未登记可用卡。服务端当前显示 0 张；请核对卡台账，不会替你推测卡片身份。</p>}
        <aside className={extra.usePreview} aria-label="用卡规则预览"><strong>用卡后会怎样？</strong><span>{vm.cardPreview?`周窗和短窗余额回满到 ${vm.cardPreview.weekly}%；周截止改为 ${beijingFull(new Date(vm.cardPreview.weeklyDeadlineAt).toISOString())} 北京时间。`:'取得双窗快照后显示预览。'}</span><small>短窗截止待刷新确认；先核对可用卡，此预览不会执行用卡。</small></aside>
        <PersonalInputs controller={controller} accountKey={props.demo?null:vm.accountKey} now={vm.now} onRecordedUse={props.onRefresh} focusSection={focusSection}/>
        <details className={extra.expander}><summary>建议方案与计算依据</summary><p>{r?.reasons.join(' ')}</p><p>用卡效果预览：周窗预计回满；周截止预计为 {vm.account?beijingFull(new Date(vm.now+7*86_400_000).toISOString()):'快照取得后显示'}。短窗截止待刷新确认。此预览不会执行用卡。</p>
          <p>共同视野：{vm.planning?.horizons.map(h=>`${h.days}天`).join(' / ')??'需求不足，未计算'}；{r?.sensitivity==='stable'?'首个动作稳定':r?.sensitivity==='changes_with_assumptions'?'随远期或机制假设变化，只作条件建议':'关键输入仍待学习'}。</p>
          {vm.planning?.selected&&<p>当前方案：{vm.planning.selected.firstAction?'现在用一张':'现在先留卡'}，最差情景不足 {vm.planning.selected.Ltail.toFixed(3)} 工作段单位，最多预计用 {vm.planning.selected.Nspent.toFixed(1)} 张。</p>}
          {vm.planning?.alternative&&<p>另一选择：{vm.planning.alternative.firstAction?'现在用一张':'现在先留卡'}，最差情景不足 {vm.planning.alternative.Ltail.toFixed(3)} 工作段单位，最多预计用 {vm.planning.alternative.Nspent.toFixed(1)} 张。你可以修改今天更在意的选项。</p>}
          {!!vm.planning?.selected?.scenarios.length&&<details className={extra.scenarios}><summary>各情景的详细比较</summary>{vm.planning.selected.scenarios.map(s=><p key={s.id}>情景 {s.id}：相对永远不用卡，减少不足 {s.deltaLoss.toFixed(3)} 工作段单位，增加实际周消耗 {s.deltaConsumedWeekly.toFixed(1)} 点，消耗 {s.spent.toFixed(1)} 张；错过保守截止 {s.missedSafeDeadline.toFixed(1)} 张。</p>)}</details>}
          <p>{r?.assumptions.join(' ')}</p><p>卡计划仅是条件安排；卡实际使用并刷新成功前，当前预算不会加上未来回满量。</p>
        </details>
      </>}
      {tab==='data'&&<>
        <Section icon={<DatabaseIcon size={13}/>}>观测与验证</Section>
        <div className={styles.metricGrid}>{[{label:'完整需求日',value:`${vm.demand.sampleDays} 天`},{label:'regular 公告',value:`${vm.platform.training.eventCount} 条`},{label:'完整间隔',value:`${vm.platform.training.completedGapCount} 段`},{label:'当前参考模型',value:extraVm?.platformReference?.activeModel??'P0'}].map(item=><div className={styles.metricMini} key={item.label}><span className={styles.metricMiniLabel}>{item.label}</span><strong className={styles.metricMiniValue}>{item.value}</strong></div>)}</div><p className={styles.mutedNote}>个人完整周需求日少于7日仅初步范围，14日起显示常规经验分位。</p>
        <details className={extra.expander}><summary>最近账号状态变化</summary><p>余额与截止变化会保留执行区间；仅靠时间接近无法确认是平台补给，来源未知时不记为未命中。</p>{vm.mapping.filter(m=>m.incidentId!=null||m.knownClassification!=='unobservable').slice(-10).map((m,i)=><p key={i}>{beijingFull(new Date(m.interval.fromExclusive).toISOString())} – {beijingFull(new Date(m.interval.toInclusive).toISOString())}：{m.knownClassification==='natural_reset'?'自然补给候选':m.knownClassification==='card_use'?'已记录用卡干预':m.status==='ambiguous'?'来源歧义':m.status==='hit'?'已确认平台命中':m.status==='miss'?'可辨识未命中':'不可观测'}。{m.reason}</p>)}</details>
        <p>参考启用与验证分开；60 日仅作回顾节点，现有回放尚未证明哪种模型更准。回放是历史证据，不代表线上成熟样本。</p>
        {extraVm?.weekdayShadow&&<section className={`${extra.replayBlock} ${extra.weekdayShadow}`} aria-label="星期影子模型验证">
          <h3>星期影子 · 当前参考保持不变</h3>
          <p>星期影子 {extraVm.weekdayShadow.status==='shadow'&&extraVm.weekdayShadow.forecast?pct(extraVm.weekdayShadow.forecast.probability):'—'} · D60 配对参考 {pct(extraVm.platformReference?.decay.probability24h)} · 当前选中 {extraVm.platformReference?.activeModel??'P0'} {pct(vm.platform.probability24h)} · 差值 {extraVm.weekdayShadow.differencePoints==null?'—':`${extraVm.weekdayShadow.differencePoints>0?'+':''}${extraVm.weekdayShadow.differencePoints.toFixed(2)} 个百分点`}</p>
          {extraVm.weekdayShadow.status==='unavailable'&&<p role="status">星期预测暂不可用：{extraVm.weekdayShadow.reason}</p>}
          <p className={extra.note}>影子概率只用于配对观察；不改变用卡模拟或建议。</p>
          <details><summary>训练覆盖与线上验证</summary>
            <dl className={extra.details}>
              <dt>训练覆盖</dt><dd>{extraVm.weekdayShadow.model.base.exposureDays.toFixed(1)} 天完整覆盖 · {extraVm.weekdayShadow.model.base.weightedExposureDays.toFixed(1)} 加权暴露天</dd>
              <dt>有效配对日</dt><dd>{props.weekdayCalibration?.matchedCount??'—'}</dd>
              <dt>正例 / 覆盖周</dt><dd>{props.weekdayCalibration?`${props.weekdayCalibration.positiveCount} / ${props.weekdayCalibration.weekCount}`:'—'}</dd>
              <dt>ΔBrier（D60−星期）</dt><dd>{signedScore(props.weekdayCalibration?.deltaBrier)}</dd>
              <dt>证据状态</dt><dd>{props.weekdayCalibration?weekdayEvidenceText[props.weekdayCalibration.evidenceStatus]:'等待线上评分数据'} · 未验证</dd>
              <dt>正式评审</dt><dd>启用后第 90 / 180 / 365 天</dd>
              <dt>下次评审</dt><dd>{!props.weekdayCalibration||props.weekdayCalibration.activationAt==null?'等待实验登记':props.weekdayCalibration.nextReviewAt==null?'预定评审已完成':`${beijingFull(new Date(props.weekdayCalibration.nextReviewAt).toISOString())} 北京时间`}</dd>
            </dl>
            {props.weekdayCalibration&&<p>待成熟 {props.weekdayCalibration.pendingCount} · 未知 {props.weekdayCalibration.unknownCount} · 缺配对 {props.weekdayCalibration.missingPairCount}；负值 ΔBrier 表示星期模型较差。无论达到何种状态，转正都须人工审阅。</p>}
          </details>
        </section>}
        {replay?.all&&<section className={extra.replayBlock} aria-label="历史回放对照"><h3>历史回放 · 全期</h3>{replayTable('all')}<details><summary>近期窗口对照</summary><h3>近 180 日</h3>{replayTable('recent180')}<h3>近 90 日</h3>{replayTable('recent90')}</details></section>}
        {props.verdictSummaries&&props.verdictSummaries.length>0&&<section className={extra.replayBlock} aria-label="线上 verdict 汇总"><h3>线上验证汇总</h3><p>只统计已追加的在线 verdict；当前汇总未证明 D60 已有成熟在线样本。</p><table className={extra.referenceTable}><thead><tr><th>模型</th><th>样本</th><th>正例</th><th>待覆盖</th><th>未知</th><th>Brier</th><th>Log loss</th></tr></thead><tbody>{props.verdictSummaries.map(row=><tr key={row.modelVersion}><th>{row.modelVersion}</th><td>{row.sampleCount}</td><td>{row.positiveCount}</td><td>{row.pendingCount}</td><td>{row.unknownCount}</td><td>{score(row.brier)}</td><td>{score(row.logLoss)}</td></tr>)}</tbody></table></section>}
        <dl className={extra.details}><dt>长期 P0 Brier</dt><dd>{score(replay?.all?.p0?.brier)}</dd></dl>
        <details className={extra.expander}><summary>旧版在线固定日校准统计</summary><dl className={extra.details}><dt>旧版 P0 Brier</dt><dd>{props.calibration?.brierP0?.toFixed(4)??'等待可评估样本'}</dd><dt>旧版 P1 Brier</dt><dd>{props.calibration?.brierP1?.toFixed(4)??'等待可评估样本'}</dd><dt>旧版 P1 相对改善</dt><dd>{props.calibration?.improvement?.toFixed(4)??'尚不可比较'}</dd><dt>旧版完整周分块</dt><dd>{props.calibration?.weeklyBootstrap.blockCount??0} 周；改善区间 {props.calibration?.weeklyBootstrap.lower?.toFixed(4)??'—'} – {props.calibration?.weeklyBootstrap.upper?.toFixed(4)??'—'}</dd><dt>历史覆盖截至</dt><dd>{props.calibration?.coverageEnd!=null?beijingFull(new Date(props.calibration.coverageEnd).toISOString()):'未取得完整覆盖'}</dd></dl></details>
        <details className={extra.expander}><summary>概率分组与评分边界</summary>{props.calibration?.probabilityBins.p0.map(bin=><p key={bin.from}>{pct(bin.from)} – {pct(bin.to)}：{bin.count} 个样本，平均预测 {pct(bin.meanProbability)}，实际公告比例 {pct(bin.eventRate)}</p>)}<p>临时预测 {props.calibration?.temporaryRows??0} 条单列，不加入固定日主成绩；旧日志不计入 v3。区间按完整周重采样，样本少时不能证明改进。</p></details>
        <dl className={extra.details}><dt>快照</dt><dd>{vm.updatedAt}</dd><dt>卡台账版本</dt><dd>{vm.ledgerVersion}</dd><dt>输入版本</dt><dd>{vm.preferenceVersion}</dd><dt>模拟种子</dt><dd>{vm.planning?.seed??'未运行'}</dd><dt>模型</dt><dd>{vm.planning?.modelVersion??'platform-v3'}</dd></dl>
        <p className={styles.mutedNote}>日耗、平台信号版本和各次预测均只追加到本机日志；演示不会写生产预测记录。</p>
        <div className={extra.footerRow}><button type="button" className={styles.primaryButton} onClick={props.onRefresh} disabled={props.refreshing}><RefreshIcon size={14}/>刷新额度</button><button type="button" className={styles.iconButton} onClick={copySummary} aria-label="复制摘要"><CopyIcon size={16}/></button><span role="status" className={styles.mutedNote}>{copyState==='ok'?'摘要已复制':copyState==='error'?'复制失败，请重试':''}</span></div>
      </>}
      </>}
    </div>
  </div>;
}
export function V3CompactBar({vm,phase,demo,onExpand,expandRef}:{vm:V3DashboardModel|null;phase?:string;demo:boolean;onExpand:()=>void;expandRef?:React.RefObject<HTMLButtonElement|null>}){
  const loading=!vm||phase==='initializing';
  const stale=vm?.status==='stale';const failed=phase==='read-error'||(vm!=null&&!['ok','stale'].includes(vm.status));
  return <div className={compact.shell} role="group" aria-label="reset-radar 悬浮条" onClick={onExpand}>
    <span className={compact.dragHandle} data-tauri-drag-region title="拖动悬浮条"><GripDots size={18}/></span>
    <span className={compact.brand}><RadarLogo size={30} className={compact.logo}/><span className={compact.brandText}><span className={compact.brandName}>CODEX<span className={`${compact.dot} ${loading||stale?compact.dotWarn:failed?compact.dotError:compact.dotOk}`} role="img" aria-label={loading?'读取中':failed?'采集失败':stale?'数据过期':'采集正常'}/></span><span className={compact.brandSub}>reset-radar{demo?' · 演示':vm?.plan?` · ${vm.plan}`:''}</span></span></span>
    <span className={compact.metric} title="周额度剩余"><span className={compact.metricText}><strong className={compact.metricValue}>{percentWhole(loading?null:vm.remainingPercent)}</strong><span className={compact.metricLabel}>周余</span></span></span>
    <span className={compact.metric} title="短窗额度剩余"><span className={extra.compactShortIcon}><PulseIcon size={18}/></span><span className={compact.metricText}><strong className={compact.metricValue}>{percentWhole(loading?null:vm.shortRemainingPercent)}</strong><span className={compact.metricLabel}>短窗</span></span></span>
    <span className={compact.metric} title="可用重置卡数量"><span className={compact.cardIconBox}><CardStackIcon size={16}/></span><span className={compact.metricText}><strong className={compact.metricValue}>{creditsLabel(loading?null:vm.resetCredits)}</strong><span className={compact.metricLabel}>重置卡</span></span></span>
    <span className={compact.spacer}/><button type="button" className={compact.expandButton} onClick={event=>{event.stopPropagation();onExpand();}} ref={expandRef} aria-label="展开完整面板"><ChevronDown size={20}/></button>
  </div>;
}
export function V3Peek({vm,phase,demo,onOpen}:{vm:V3DashboardModel|null;phase?:string;demo:boolean;onOpen:()=>void}){
  const budget=vm?.recommendation.weeklyBudgetToday;
  if(!vm||phase==='initializing')return <div className={peek.shell} role="status"><span className={peek.rowLabel}>正在获取 Codex 使用数据…</span></div>;
  return <div className={peek.shell}>
    <div className={peek.row}><span className={peek.rowLabel}>今日周预算</span><strong className={`${peek.rowValue} ${peek.rowValueAccent}`}>{budget?`${budget.low.toFixed(1)} – ${budget.high.toFixed(1)} 个周额度百分点`:'需求未知 · 积累观测中'}</strong></div>
    <div className={peek.row}><span className={peek.rowLabel}>用卡建议</span><span className={peek.rowValue}>{statusText[vm.recommendation.status]}</span></div>
    <div className={peek.footer}><span className={peek.observed}><ClockIcon size={13}/>{vm.status==='stale'?'上次观测':'额度观测'} {beijingShort(vm.updatedAt)} 北京时间{vm.status==='stale'?' · 数据过期':''}</span>{demo&&<span className={peek.demoBadge}>演示数据</span>}<button type="button" className={peek.openButton} onClick={onOpen}><BarChartIcon size={14}/>查看完整规划<ChevronRight size={13}/></button></div>
  </div>;
}
