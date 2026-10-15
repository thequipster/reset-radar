import {RadarBrand,ResetCardArtwork} from './RadarArtwork';
import { useMemo, useState, type ReactNode } from 'react';
import type { V3DashboardModel } from './v3Model';
import type { PersonalInputsController } from './usePersonalInputs';
import { PersonalInputs } from './PersonalInputs';
import { PANEL_TABS, initialPanelTab } from './panelTabs';
import { RadarLogo, SunIcon, MoonIcon, ChevronUp, CloseIcon, RefreshIcon, GripDots, SpeakerIcon, CheckIcon, SparkleIcon, ShieldIcon, PulseIcon, BarChartIcon, CardStackIcon, CalendarIcon, DatabaseIcon, ChevronDown, ChevronRight, ClockIcon, CopyIcon } from './icons';
import { beijingFull, beijingShort, percentWhole, creditsLabel } from './format';
import { plainAdvice, clockLabel, whenLabel, percentLabel, TIER_DAILY_PERCENT, type PlainAdvice } from './plainAdvice';
import { SPRINT_HOURS_OPTIONS } from '../lib/v3/sprintPlan';
import type { PreferenceFeedback, WorkloadLevel } from '../lib/v3/cards';
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
  phase:string; readError:string|null; logError?:string|null;subscriptionError:boolean;refreshing:boolean;demo:boolean;planningPending?:boolean;compactionNote?:string|null;
  historyRefreshing?:boolean; historyError?:string|null;
  activeTheme:'light'|'dark';onThemePreference:(theme:'light'|'dark')=>void;onRefresh:()=>void;onCollapse:()=>void;onClose:()=>void;
}
const pct=(v:number|null|undefined)=>v==null?'—':`${(v*100).toFixed(1)}%`;
const amount=(v:number|null|undefined)=>v==null?'学习中':`${v.toFixed(1)} 周额度百分点`;
const statusText={act_now:'建议现在处理',wait:'先保留，下一次查看再决定',conditional:'条件建议 · 尚有未知',need_data:'还在学习你的用量',not_applicable:'暂无可执行用卡方案'};
/** RR56：页签显示名改成人话；key 与 hash 契约（panelTabs.ts）不变。 */
export const TAB_DISPLAY:Record<string,string>={overview:'今天怎么用',planner:'我的设置',risk:'平台动态',data:'准不准'};
const WORKLOAD_OPTIONS:{value:WorkloadLevel;label:string;hint:string}[]=[
  {value:'quiet',label:'轻松',hint:`≈${percentLabel(TIER_DAILY_PERCENT.light)}/天`},{value:'normal',label:'正常',hint:`≈${percentLabel(TIER_DAILY_PERCENT.normal)}/天`},
  {value:'busy',label:'很忙',hint:`≈${percentLabel(TIER_DAILY_PERCENT.busy)}/天`},{value:'unknown',label:'不确定',hint:'按正常算'},
];
const FEEDBACK_OPTIONS:{value:PreferenceFeedback;label:string}[]=[{value:'appropriate',label:'合适'},{value:'insufficient',label:'不够用'},{value:'save-card',label:'我想留着卡'},{value:'too-late',label:'提醒太晚了'}];
const toneClass:Record<PlainAdvice['card']['tone'],string>={now:'planNow',wait:'planWait',none:'planNone',fill:'planFill',refresh:'planFill'};
/** 把 VM + 个人输入翻译成人话（UI 零业务规则：只措辞）。 */
export function plainFromVm(vm:V3DashboardModel,controller:PersonalInputsController,planningPending:boolean):PlainAdvice{
  const tier=vm.coldContext.selectedTier;
  return plainAdvice({now:vm.now,status:vm.status,updatedAt:vm.updatedAt,weekly:vm.account?{remaining:vm.account.weekly.remaining,resetsAt:vm.account.weekly.resetsAt}:null,short:vm.account?{remaining:vm.account.short.remaining,resetsAt:vm.account.short.resetsAt}:null,
    resetCredits:vm.resetCredits,advice:vm.coldAdvice,budgetToday:vm.recommendation.weeklyBudgetToday,expectedDailyUse:vm.coldAdvice.expectedConsumption??vm.expectedConsumption??(vm.coldAdvice.basis==='policy_default'?TIER_DAILY_PERCENT[tier]:null),
    tier,basis:vm.coldAdvice.basis,cards:controller.state.cards,lastSafeActionAt:vm.recommendation.lastSafeActionAt,planningPending,sampleDays:vm.demand.sampleDays,sprint:controller.state.cardSprint??null,cardRisk:vm.cardRisk});
}
const weekdayEvidenceText:Record<WeekdayCalibration['evidenceStatus'],string>={
  unregistered:'尚未登记',collecting:'正在收集线上配对样本',review_due:'到达预定评审点',reviewed_unverified:'已评审，仍未验证',eligible_for_manual_review:'达到人工评审门槛',stopped:'影子记录已停止',
};
const signedScore=(value:number|null|undefined)=>value==null?'—':`${value>0?'+':''}${value.toFixed(4)}`;
function Section({icon,children}:{icon:ReactNode;children:ReactNode}){return <div className={styles.sectionHead}><span className={styles.sectionIcon}>{icon}</span><span className={styles.sectionTitle}>{children}</span></div>;}
/** 今天最多用多少 + 双环（周额度 / 短窗）。 */
function TodayHero({vm,plain,onPlan}:{vm:V3DashboardModel;plain:PlainAdvice;onPlan:()=>void}){
  return <div className={extra.metricsGrid}>
    <section className={`${styles.suggestionBanner} ${extra.hero}`} aria-label="今日额度建议">
      <span className={styles.suggestionIcon}><SparkleIcon size={24}/></span>
      <div className={styles.suggestionBody}><span className={styles.suggestionLabel}>{plain.sprint?'风险优先 · 用卡计划':'下一步 · 用卡建议'}</span>
        <strong className={`${styles.suggestionNumber} ${plain.budget.percent==null?extra.learningTitle:''}`}>{plain.card.headline}</strong>
        <span className={styles.suggestionSub}>{plain.budget.headline}</span>
        <button type="button" className={extra.heroAction} onClick={onPlan}>{plain.sprint?'管理我的卡与到期时间':'先选用卡窗口，再安排用量'}<ChevronRight size={14}/></button>
        <details className={extra.heroDetails}><summary>查看额度分配依据</summary><p>{plain.budget.detail}</p></details>
      </div>
    </section>
    <div className={styles.quotaGrid}>{[{value:vm.remainingPercent,label:'本周额度还剩',window:vm.account?.weekly,color:styles.ringBlue},{value:vm.shortRemainingPercent,label:'短窗还剩',window:vm.account?.short,color:styles.ringGreen}].map(item=><div className={styles.quotaCard} key={item.label}><ProgressRing value={item.value} size={54} className={item.color} label={item.label}><span className={styles.ringCenter}>{percentWhole(item.value)}</span></ProgressRing><span className={styles.quotaText}><span className={styles.quotaLabel}>{item.label}</span><span className={styles.quotaSub}>{item.window?<><span className={styles.timeNoWrap}>{whenLabel(vm.now,item.window.resetsAt)}</span> 自动恢复</>:'恢复时间待读取'}</span></span></div>)}</div>
  </div>;
}
// 小日历格子只有 50 px 宽：芯片显示 2–4 字短标签（必要时换行），完整说明放 title/aria-label。
const MARK_SHORT:Record<string,string>={use:"用卡",decide:"再决定",expire:"最后期限",reset:"周额恢复",short:"短窗恢复",empty:"可能用完"};
/** 未来 7 天：哪天用卡 / 哪天到期 / 哪天恢复 / 哪天可能用完。 */
function WeekStrip({plain}:{plain:PlainAdvice}){
  const glyph={use:'★',decide:'？',expire:'⏰',reset:'↻',short:'↻',empty:'⚠'} as const;
  return <ol className={extra.strip} aria-label="未来七天">{plain.strip.map(day=><li key={day.dateKey} className={`${extra.stripDay} ${day.today?extra.stripToday:''} ${day.marks.length?extra.stripBusy:''}`}><span className={extra.dayBeacon} data-action={day.marks.some(m=>m.kind==='use')?'use':'none'} aria-hidden="true"/><span className={extra.stripLabel}>{day.label}</span><span className={extra.stripDate}>{day.date}</span>{day.marks.map(m=>{const time=/\d{2}:\d{2}$/.exec(m.text)?.[0];return <span key={`${m.kind}:${m.text}`} className={`${extra.stripMark} ${extra[`mark_${m.kind}`]??''}`} title={m.text} aria-label={m.text}>{glyph[m.kind]}{MARK_SHORT[m.kind]}{time&&<em className={extra.stripTime}>{time}</em>}</span>;})}</li>)}</ol>;
}
/** RR57 冲刺模式：「这个周期我一定会用卡」→ 只回答哪天用（按最快用法：5 小时短窗 = 周额度 1/6，30 小时用完一周）。 */
function SprintBox({plain,controller,onOpenCards}:{plain:PlainAdvice;controller:PersonalInputsController;onOpenCards:()=>void}){
  const current=controller.state.cardSprint??null;const on=current?.enabled===true;const hours=current?.hoursPerDay??24;
  const set=(next:{enabled:boolean;hoursPerDay:number})=>controller.setCardSprint?.(next);
  return <fieldset className={`${extra.inlineGroup} ${on?extra.sprintOn:''}`} aria-label="这周期一定用卡">
    <legend>这周期我一定会用卡？</legend>
    <div className={extra.choiceRow} role="group" aria-label="用卡模式">
      <button type="button" aria-pressed={!on} className={`${extra.choice} ${!on?extra.choiceOn:''}`} onClick={()=>set({enabled:false,hoursPerDay:hours})}><b>按用量算</b><small>够用就留着卡</small></button>
      <button type="button" aria-pressed={on} className={`${extra.choice} ${on?extra.choiceOn:''}`} onClick={()=>set({enabled:true,hoursPerDay:hours})}><b>一定用卡，告诉我哪天</b><small>先选风险窗口，再安排用量</small></button>
    </div>
    {on&&<>
      <div className={extra.choiceRow} role="group" aria-label="每天能用几小时">
        <span className={extra.sprintHint}>用卡后每天准备使用几小时？</span>
        {SPRINT_HOURS_OPTIONS.map(h=>{const sel=hours===h;return <button type="button" key={h} aria-pressed={sel} className={`${extra.choice} ${sel?extra.choiceOn:''}`} onClick={()=>set({enabled:true,hoursPerDay:h})}><b>{h>=24?'不停地用':`${h} 小时`}</b></button>;})}
      </div>
      {plain.sprint&&<>
        {plain.sprint.lines.length>0&&<ol className={extra.sprintList}>{plain.sprint.lines.map((line,i)=><li key={line.cardId}><strong>{i+1}. 「{line.label}」→ {line.when}</strong><span>{line.why}最晚 {line.latest}。</span></li>)}</ol>}
        <span className={extra.sprintHint}>{plain.sprint.note}{plain.sprint.needCards&&<> <button type="button" className={extra.linkButton} onClick={onOpenCards}>去登记卡的到期时间</button></>}</span>
        <details className={extra.sprintDetails}><summary>查看规划假设与概率边界</summary><p>{plain.sprint.assumptions.join(" ")}</p></details>
      </>}
      {!plain.sprint&&<span className={extra.sprintHint}>先刷新拿到额度数据，再排日程。</span>}
    </>}
  </fieldset>;
}
/** Radar is a visual frame for the actual scalar probability, not invented risk axes. */
function RiskPortrait({vm}:{vm:V3DashboardModel}){
 const probability=vm.platform.probability24h;
 return <section className={extra.radarPanel} aria-label="平台公告概率参考">
   <div className={extra.panelHeading}><span><ShieldIcon size={17}/>概率雷达</span><span className={extra.microBadge}>参考模型 · 非承诺</span></div>
   <div className={extra.radarBody}>
     <div className={extra.radarGraphic}>
       <svg viewBox="0 0 240 240" aria-hidden="true"><circle cx="120" cy="120" r="102"/><circle cx="120" cy="120" r="75"/><circle cx="120" cy="120" r="48"/><path d="M18 120H222M120 18V222M48 48L192 192M48 192L192 48"/><path className={extra.radarSweep} d="M120 120 L209 69 A102 102 0 0 1 209 171 Z"/><circle className={extra.radarDot} cx="209" cy="69" r="4"/></svg>
       <div className={extra.radarReadout}><strong>{pct(probability)}</strong><span>未来 24 小时公告参考</span></div>
     </div>
     <div className={extra.radarFacts}><div><span>历史公告</span><strong>{vm.historyEventCount??'—'}<small> 条</small></strong></div><div><span>个人用量样本</span><strong>{vm.demand.sampleDays}<small> 天</small></strong></div><p>先观察窗口，再安排用量。<br/>公告概率不等于本账号回满概率。</p></div>
   </div>
   <div className={extra.radarFoot}><span className={extra.statusDot}/>未知不是低风险，数据不足时不强行推荐。</div>
 </section>;
}
function AnnouncementBar(props:V3PanelProps){const vm=props.vm;return <section className={`${extra.inlineGroup} ${extra.announcementBar}`} aria-label="公告更新" aria-live="polite">
        <div className={extra.choiceRow}><span className={extra.announcementTitle}><SpeakerIcon size={17}/><strong>公告与概率</strong></span><button type="button" className={extra.choice} onClick={props.onRefresh} disabled={props.refreshing||props.historyRefreshing||props.demo}><RefreshIcon size={14}/>{props.refreshing?'正在获取公告…':props.historyRefreshing?'正在更新完整历史与概率…':'立即更新公告并重算'}</button></div>
        <span>{props.demo?'演示模式，不会获取实时公告。':`公告最近成功检查：${vm?.announcementStatus?.fetchedAt?beijingFull(vm.announcementStatus.fetchedAt):'尚无成功记录'}（北京时间）`}</span>
        <details className={extra.syncDetails}><summary>查看来源与历史覆盖</summary><span>完整历史截至：{vm&&Number.isFinite(vm.historyFetchedAt)?beijingFull(new Date(vm.historyFetchedAt).toISOString()):'未知'} · {vm?.historyEventCount??0} 条。{props.historyRefreshing?'更新中，请勿按旧概率激活卡。':'历史更新后自动重新计算模型与用卡窗口。'}</span>
        </details>{vm?.announcementStatus?.status==='error'&&<span role="alert">公告更新失败，保留旧值：{vm.announcementStatus.message}</span>}
        {props.historyError&&<span role="alert">{props.historyError}</span>}
        {vm?.announcementStatus?.latestReset&&<details className={extra.syncDetails}><summary>最近平台事件</summary><span>最近平台事件：{String(vm.announcementStatus.latestReset.announced_at??vm.announcementStatus.latestReset.announcedAt??'时间未知')}。平台事件不代表本账号已经回满，请以额度实读为准。</span></details>}
      </section>;}
export default function V3Dashboard(props:V3PanelProps){
  const {vm,controller}=props;const [tab,setTab]=useState(()=>initialPanelTab(window.location.hash));
  const [focusSection,setFocusSection]=useState<'budget'|'cards'|null>(null);
  const [copyState,setCopyState]=useState<'idle'|'ok'|'error'>('idle');
  const [feedbackDone,setFeedbackDone]=useState<{choice:PreferenceFeedback;at:number}|null>(null);
  const [showPro,setShowPro]=useState(false);
  const plain=useMemo(()=>vm?plainFromVm(vm,controller,!!props.planningPending):null,[vm,controller,props.planningPending]);
  const r=vm?.recommendation;const card=controller.state.cards.find(c=>c.localId===r?.cardId);
  const actionCard=controller.state.cards.find(c=>c.localId===(plain?.card.cardId??r?.cardId));
  const extraVm=vm;
  const optionalController=controller as PersonalInputsController & {state:PersonalInputsController['state']&{continueWorking?:{localDate:string;value:boolean}|null;planningMode?:'policy_default'|'learned'};setContinueWorking?:(value:boolean)=>void;setPlanningMode?:(mode:'policy_default'|'learned')=>void};
  const openInputs=(section:'budget'|'cards')=>{setFocusSection(section);setTab('planner');};
  const replay=extraVm?.platformReference?.replay as {all?:Record<string,{count:number;positiveCount:number;brier:number|null;logLoss:number|null;predictedActualRatio:number|null}>;recent180?:Record<string,{count:number;positiveCount:number;brier:number|null;logLoss:number|null;predictedActualRatio:number|null}>;recent90?:Record<string,{count:number;positiveCount:number;brier:number|null;logLoss:number|null;predictedActualRatio:number|null}>}|undefined;
  const replayModels=['p0','p1','d60','r90'] as const;
  const score=(value:number|null|undefined)=>value==null?'—':value.toFixed(4);
  const replayTable=(period:'all'|'recent180'|'recent90')=>replay?.[period]&&<table className={extra.referenceTable}><thead><tr><th>窗口</th>{replayModels.map(model=><th key={model}>{model.toUpperCase()}</th>)}</tr></thead><tbody><tr><th>样本数</th>{replayModels.map(model=><td key={model}>{replay[period]?.[model]?.count??0}</td>)}</tr><tr><th>正例数</th>{replayModels.map(model=><td key={model}>{replay[period]?.[model]?.positiveCount??0}</td>)}</tr><tr><th>Brier</th>{replayModels.map(model=><td key={model}>{score(replay[period]?.[model]?.brier)}</td>)}</tr><tr><th>Log loss</th>{replayModels.map(model=><td key={model}>{score(replay[period]?.[model]?.logLoss)}</td>)}</tr><tr><th>预测/实际比</th>{replayModels.map(model=><td key={model}>{score(replay[period]?.[model]?.predictedActualRatio)}</td>)}</tr></tbody></table>;
  const scheduled=vm?.supply?.incidents.find(i=>i.kind==='scheduled'&&i.status!=='cancelled'&&i.scheduledFor!=null);
  const copySummary=async()=>{if(!vm||!plain)return;try{await navigator.clipboard.writeText(`reset-radar${props.demo?'（演示）':''}\n本周额度还剩 ${percentWhole(vm.remainingPercent)} / 短窗 ${percentWhole(vm.shortRemainingPercent)} / ${creditsLabel(vm.resetCredits)}\n${plain.budget.headline}。${plain.budget.detail}\n${plain.card.headline}。${plain.card.detail}\n${plain.runway.headline}。${plain.runway.detail}\n（专业口径）${statusText[vm.recommendation.status]}：${vm.recommendation.reasons.join(' ')}；平台24h公告参考 ${pct(vm.platform.probability24h)}；账号补给 ${pct(vm.supply?.accountProbability24h)}\n观测 ${beijingFull(vm.updatedAt)} 北京时间`);setCopyState('ok');}catch{setCopyState('error');}};
  return <div className={`${styles.shell} ${extra.studio}`} role="main" aria-label="reset-radar 展开面板">
    <header className={styles.header}>
      <div className={styles.headerDrag} data-tauri-drag-region><GripDots size={16}/><RadarLogo size={30} className={styles.logo}/><span className={styles.title}><span className={styles.titleMain}>reset-radar{vm?.plan&&<span className={styles.titleSubPlan}>{vm.plan}</span>}</span><span className={styles.titleSub}>Codex 额度：今天用多少、卡哪天用</span></span></div>
      <div className={styles.headerActions}>{props.demo&&<span className={styles.demoBadge}>演示</span>}
        <span className={styles.themeToggle} role="group" aria-label="主题">{(['light','dark'] as const).map(theme=><button type="button" key={theme} className={`${styles.themeOption} ${props.activeTheme===theme?styles.themeOptionActive:''}`} aria-label={theme==='light'?'浅色主题':'深色主题'} aria-pressed={props.activeTheme===theme} onClick={()=>props.onThemePreference(theme)}>{theme==='light'?<SunIcon size={15}/>:<MoonIcon size={15}/>}</button>)}</span>
        <button className={styles.iconButton} onClick={props.onCollapse} aria-label="收起面板"><ChevronUp size={16}/></button><button className={styles.iconButton} onClick={props.onClose} aria-label="隐藏到托盘"><CloseIcon size={16}/></button>
      </div>
    </header>
    <aside className={extra.sidebar} aria-label="工作台导航">
      <div className={extra.brand}><RadarBrand size={38}/><div><strong>Reset Radar</strong><span>把握每一次使用窗口</span></div></div>
      <span className={extra.navCaption}>WORKSPACE</span>
      <nav className={`${styles.tabBar} ${extra.sideNav}`} role="tablist" aria-label="面板模块">{PANEL_TABS.map(item=>{
        const Icon=item.key==='overview'?BarChartIcon:item.key==='planner'?CardStackIcon:item.key==='risk'?PulseIcon:DatabaseIcon;
        return <button type="button" role="tab" aria-selected={tab===item.key} aria-controls={`v3-${item.key}`} id={`v3-tab-${item.key}`} key={item.key} className={`${styles.tabButton} ${extra.navItem} ${tab===item.key?`${styles.tabButtonActive} ${extra.navActive}`:''}`} onClick={()=>setTab(item.key)}><Icon size={18}/><span>{TAB_DISPLAY[item.key]??item.label}</span>{tab===item.key&&<span className={extra.navDot}/>}</button>;
      })}</nav>
      <div className={extra.sideNote}><ShieldIcon size={21}/><strong>先推荐时间<br/>再安排用量</strong><p>让每一份额度，<br/>留给真正重要的事。</p></div>
      <div className={extra.accountTile}><span className={extra.accountAvatar}>C</span><div><strong>Codex 工作空间</strong><span>{vm?.plan??'额度与重置规划'}</span></div><span className={extra.statusDot}/></div>
      <small className={extra.sideVersion}>RESET RADAR / LOCAL FIRST</small>
    </aside>
    {(props.logError||props.readError||props.subscriptionError)&&<p className={`${extra.warning} ${extra.topAlert}`} role="status">{props.logError??props.readError??'自动订阅不可用，请手动刷新。'}</p>}
    <div className={`${styles.page} ${extra.page}`} role="tabpanel" id={`v3-${tab}`} aria-labelledby={`v3-tab-${tab}`}>
      <div className={extra.intro}><div><span className={extra.eyebrow}>YOUR QUOTA, WELL TIMED.</span><h1>{tab==='overview'?'把额度用在，恰好的时候。':tab==='planner'?'你的用量，由你安排。':tab==='risk'?'看清信号，再做决定。':'让每一次预测，都有依据。'}</h1><p>看清额度与重置信号，找到值得投入的时间窗口。</p></div><span className={extra.livePill}><span className={extra.statusDot}/>{props.demo?'演示工作空间':props.refreshing||props.historyRefreshing?'正在同步':vm?.status==='ok'?'已连接工作空间':'等待最新数据'}</span></div>
      {(tab!=='overview'||!vm)&&<AnnouncementBar {...props}/>}
      {!vm?<div className={styles.stateBanner}><span className={styles.stateBody}><strong className={styles.stateTitle}>等待额度快照</strong><span className={styles.stateSub}>缺失数据不会填成满额。</span></span><button type="button" className={styles.primaryButton} onClick={props.onRefresh} disabled={props.refreshing}><RefreshIcon size={14}/>刷新额度</button></div>:<>
      {tab==='overview'&&plain&&<>
        <TodayHero vm={vm} plain={plain} onPlan={()=>{if(!controller.state.cardSprint?.enabled)controller.setCardSprint?.({enabled:true,hoursPerDay:controller.state.cardSprint?.hoursPerDay??24});else openInputs('cards');}}/>
        <AnnouncementBar {...props}/>
        <details className={extra.sourceNotices} open={!!scheduled}><summary>额度来源与计划公告</summary><div className={styles.notices}>
          <div className={`${styles.noticeCard} ${vm.status==='ok'?styles.noticeCardOk:styles.noticeCardAnnouncement}`}><CheckIcon size={17} className={styles.noticeIcon}/><div className={styles.noticeBody}><strong className={styles.noticeTitle}>{vm.status==='ok'?'数据是新的':vm.status==='stale'?'数据有点旧了':'还没读到最新数据'}</strong><span className={styles.noticeSub}>上次读取 <span className={styles.timeNoWrap}>{whenLabel(vm.now,Date.parse(vm.updatedAt)||vm.now)}</span>{vm.message&&` · ${vm.message}`}</span></div></div>
          {scheduled&&<div className={`${styles.noticeCard} ${styles.noticeCardAnnouncement}`}><SpeakerIcon size={17} className={styles.noticeIcon}/><div className={styles.noticeBody}><strong className={styles.noticeTitle}>官方说要给大家重置额度</strong><span className={styles.noticeSub}>计划 <span className={styles.timeNoWrap}>{whenLabel(vm.now,scheduled.scheduledFor!)}</span>，到账前别指望它。</span></div></div>}
        </div></details>
        <div className={extra.overviewGrid}><div className={extra.signalColumn}><RiskPortrait vm={vm}/><div className={extra.philosophyCard}><ResetCardArtwork className={extra.philosophyArt}/><strong>先选时机，不必急着耗尽。</strong><p>重置是外部信号，用量是你的选择。风险窗口优先于消耗速度。</p></div></div><section className={extra.schedulePanel}><div className={extra.panelHeading}><span><CalendarIcon size={17}/>用卡时间线</span><span className={extra.microBadge}>未来 7 天</span></div>
        <section className={`${extra.plan} ${extra[toneClass[plain.card.tone]]}`} aria-label="用卡建议"><span className={extra.planIcon}><CardStackIcon size={20}/></span><div className={extra.planBody}><span className={extra.planLabel}>重置卡{vm.resetCredits!=null&&`（手上 ${vm.resetCredits} 张）`}</span><strong className={extra.planTitle}>{plain.card.headline}</strong><span>{plain.card.detail}</span>
          <span className={extra.planActions}>{plain.card.tone==='now'&&actionCard&&<button type="button" onClick={()=>{controller.recordUse(actionCard.localId);props.onRefresh();}}>我已经用了，记一下</button>}{(plain.card.tone==='fill'||plain.card.tone==='none')&&<button type="button" onClick={()=>openInputs('cards')}>去填卡的信息</button>}{plain.card.tone==='refresh'&&<button type="button" onClick={props.onRefresh} disabled={props.refreshing}>刷新额度</button>}{plain.card.tone==='wait'&&plain.card.cardLabel&&<button type="button" onClick={()=>openInputs('cards')}>看卡的到期时间</button>}</span>
        </div></section>
        <SprintBox plain={plain} controller={optionalController} onOpenCards={()=>openInputs('cards')}/>
        <div className={styles.pacingRow}><span className={`${styles.pacingIcon} ${styles.pacingIconCyan}`}><ClockIcon size={17}/></span><div className={styles.pacingBody}><strong className={styles.pacingLabel}>{plain.runway.headline}</strong><span className={styles.pacingNote}>{plain.runway.detail}</span></div></div>
        <div className={extra.calendarHeading}><span>一周日程</span><small>北京时间 · 横向查看完整日期</small></div><WeekStrip plain={plain}/><p className={extra.calendarFoot}>只标注已知日程；没有事件标记，不代表这一天安全。</p>
        </section></div>
        <fieldset className={extra.inlineGroup}><legend>今天忙不忙？直接点一下，上面的量会跟着变</legend><div className={extra.choiceRow} role="group" aria-label="今天的工作量">{WORKLOAD_OPTIONS.map(o=>{const on=controller.state.effectiveWorkloadToday===o.value;return <button type="button" key={o.value} aria-pressed={on} className={`${extra.choice} ${on?extra.choiceOn:''}`} onClick={()=>controller.setWorkloadToday(on?null:o.value)}><b>{o.label}</b><small>{o.hint}</small></button>;})}</div>{controller.state.effectiveWorkloadToday==null&&<p className={styles.mutedNote}>没选的话按「正常」算。</p>}</fieldset>
        {(()=>{const w=vm.account;const exhausted=!!w&&(w.weekly.remaining<=0||w.short.remaining<=0);const full=!!w&&w.weekly.remaining>=100&&w.short.remaining>=100;if(!exhausted&&!full)return null;const on=optionalController.state.continueWorking?.value===true;return <div className={extra.inlineGroup}><span>{exhausted?'额度用完了。接下来还要继续干活吗？选了「要」才会建议你用卡。':'额度是满的。今天还要用 Codex 吗？不用的话卡就先留着。'}</span><div className={extra.choiceRow}><button type="button" aria-pressed={on} className={`${extra.choice} ${on?extra.choiceOn:''}`} onClick={()=>optionalController.setContinueWorking?.(!on)}><b>{on?'✓ 要继续干活':'要继续干活'}</b></button></div></div>;})()}
        {vm.demand.sampleDays>=7&&<div className={extra.inlineGroup}><span>{optionalController.state.planningMode==='learned'?'现在按你最近的实际用量来算。':`已经记录了 ${vm.demand.sampleDays} 天的用量，可以改成按你的习惯来算。`}</span><div className={extra.choiceRow}><button type="button" aria-pressed={optionalController.state.planningMode==='learned'} className={`${extra.choice} ${optionalController.state.planningMode==='learned'?extra.choiceOn:''}`} onClick={()=>optionalController.setPlanningMode?.(optionalController.state.planningMode==='learned'?'policy_default':'learned')}><b>{optionalController.state.planningMode==='learned'?'✓ 按我的习惯算':'按我的习惯算'}</b></button></div></div>}
        {vm.demand.sampleDays<7&&<div className={extra.coldStart} role="region" aria-label="正在学习你的用量"><strong>还在学习你的用量（已记录 {vm.demand.sampleDays} 天，满 7 天后按你的习惯算）</strong><span>现在先按上面选的忙不忙来估。也可以直接填今天打算用多少，或者把卡的到期时间补上。</span><div><button type="button" onClick={()=>openInputs('budget')}>填今天打算用多少</button><button type="button" onClick={()=>openInputs('cards')}>补卡的到期时间</button></div></div>}
        {controller.state.reminders.map(rem=><div className={extra.reminder} role="status" key={`${rem.localId}:${rem.tier}`}><strong>⏰ 「{controller.state.cards.find(c=>c.localId===rem.localId)?.label??'重置卡'}」快到期了</strong><span>{rem.tier==='needs-confirmation'?'只知道日期不知道几点，保险起见按前一天算；到设置里补上具体时间就能更准。':rem.tier==='last-chance'?'现在是最后的机会，再不用就作废了。':`${rem.tier==='48h'?'两天':'一天'}内要处理，不然就浪费了。`}</span>{rem.lastActionAt!=null&&<b>最晚 {whenLabel(vm.now,rem.lastActionAt)}</b>}</div>)}
        <div className={extra.feedbackRow} role="group" aria-label="这个建议合适吗"><span>这个建议合适吗？</span>{FEEDBACK_OPTIONS.map(o=>{const on=feedbackDone?.choice===o.value;return <button type="button" key={o.value} aria-pressed={on} className={`${extra.choice} ${on?extra.choiceOn:''}`} onClick={()=>{controller.recordFeedback(o.value);setFeedbackDone({choice:o.value,at:Date.now()});}}>{on?'✓ ':''}{o.label}</button>;})}{feedbackDone&&<small role="status">已记录 {clockLabel(feedbackDone.at)}，谢谢。</small>}</div>
        <details className={extra.expander} open={showPro} onToggle={e=>setShowPro((e.target as HTMLDetailsElement).open)}><summary>专业细节（模型原话）</summary>
          <p>{vm.coldAdvice.headline}{vm.coldAdvice.trigger?` ${vm.coldAdvice.trigger}`:''}</p>
          <p>用卡建议状态：{r?statusText[r.status]:'等待数据'}{card?` · ${card.label}`:''}；{r?.reasons.join(' ')}</p>
          <p>今日{vm.coldAdvice.basis==='learned'?'建议预算':'默认分配'}：{vm.coldAdvice.allocatedWeeklyPointsToday==null?'待刷新':`${vm.coldAdvice.allocatedWeeklyPointsToday.toFixed(1)} 周额度百分点`}；预计日用量：{vm.coldAdvice.expectedConsumption==null?'学习中':`${vm.coldAdvice.expectedConsumption.toFixed(1)} 周额度百分点`}；下次查看：{vm.coldAdvice.nextReviewAt==null?'待确认':`${beijingFull(new Date(vm.coldAdvice.nextReviewAt).toISOString())} 北京时间`}。</p>
          <p>依据：{vm.coldAdvice.basis==='learned'?'已学习用量':vm.coldAdvice.basis==='user_plan'?'你填写的计划':'默认策略档'}。{vm.coldAdvice.assumptions?.join(' ')}</p>
          <p>{r?.shortWindowEvaluated?'已评估双窗工作量。':'短窗工作量未知，周预算不保证连续工作不会限流。'}{props.planningPending?' 256 路径规划正在后台计算。':vm.planning?` 规划完成（${vm.planning.horizons.map(h=>`${h.days}天`).join(' / ')} 共同视野，种子 ${vm.planning.seed}）。`:''}</p>
          <p className={styles.mutedNote}>{vm.evidenceQuality.join(' ')}</p>
        </details>
        {props.compactionNote&&<p className={styles.mutedNote}>{props.compactionNote}</p>}
        <div className={extra.footerRow}><p className={styles.mutedNote}>{props.planningPending?'详细比较还在后台算（几十秒），先按上面的建议来。':'卡的到期时间按北京时间算。'}</p><button type="button" className={styles.primaryButton} onClick={props.onRefresh} disabled={props.refreshing}><RefreshIcon size={14}/> {props.refreshing?'正在读取':'刷新额度'}</button></div>
      </>}
      {tab==='risk'&&<>
        <Section icon={<ShieldIcon size={13}/>}>平台动态（官方会不会给大家重置）</Section>
        <div className={extra.plan+' '+extra.planWait}><span className={extra.planIcon}><PulseIcon size={20}/></span><div className={extra.planBody}><strong className={extra.planTitle}>未来 24 小时官方发公告重置的可能性约 {pct(vm.platform.probability24h)}</strong><span>这是“官方给所有人加额度”的概率，不等于你的账号会回满（账号实际回满的可能性 {pct(vm.supply?.accountProbability24h)}）。{scheduled?`官方已经预告 ${whenLabel(vm.now,scheduled.scheduledFor!)} 重置，等到账再算。`:'目前没有官方预告。'}</span></div></div>
        <details className={extra.expander}><summary>专业细节</summary><div className={extra.proStack}>
        {extraVm?.platformReference&&<div className={extra.referencePanel}><strong>{extraVm.platformReference.activeModel} · {extraVm.platformReference.activeModel==='D60'?'近期加权参考':'长期参考'}</strong><span>{extraVm.platformReference.reason}</span><small>{extraVm.platformReference.deployment==='reference_active'?'参考版已启用':'保留长期参考'} · {extraVm.platformReference.evidence==='historical_replay'?'已有辅助历史回放':'仍按规定规则参考'}，尚未证明未来更准</small><details><summary>衰减与回放诊断</summary><dl className={extra.details}><dt>模型版本</dt><dd>{extraVm.platformReference.decay.version}</dd><dt>半衰期 / 收缩</dt><dd>60 天 / 7 等效观察日（固定假设）</dd><dt>折扣事件量</dt><dd>{extraVm.platformReference.decay.weightedCount.toFixed(2)}，不是独立样本数</dd><dt>加权暴露</dt><dd>{extraVm.platformReference.decay.weightedExposureDays.toFixed(2)} 天</dd><dt>完整覆盖</dt><dd>{extraVm.platformReference.decay.exposureDays.toFixed(1)} 天</dd><dt>近期发生率</dt><dd>{extraVm.platformReference.decay.ratePerDay?.toFixed(4)??'未知'} 次/天</dd></dl><p>近 90 / 180 天对照与全期评分见数据页；不额外加分，当前预测冻结发生率。</p></details></div>}
        <div className={styles.riskGrid}>{[{hours:24,value:vm.platform.probability24h,icon:<PulseIcon size={19}/>},{hours:48,value:vm.platform.probabilities.find(p=>p.horizonMs===2*86_400_000)?.probability,icon:<BarChartIcon size={19}/>}].map(item=><div className={styles.riskCard} key={item.hours}><span className={extra.signalIcon}>{item.icon}</span><div className={styles.riskText}><span className={styles.riskLabel}>未来 {item.hours} 小时平台公告</span><strong className={styles.riskValue}>{pct(item.value)}</strong><span className={extra.referenceBadge}>{extraVm?.platformReference?.activeModel??'P0'} · 当前概率参考</span></div></div>)}</div>
        <p className={extra.note}>这是新 regular 公告的时间口径，尚不等价于本人账号在窗口内回满的概率。</p>
        <div className={styles.plannerCard}><span className={styles.plannerCardBlueIcon}><CalendarIcon size={20}/></span><div className={styles.plannerText}><strong className={styles.plannerBig}>账号平台补给概率：{pct(vm.supply?.accountProbability24h)}</strong><span className={styles.plannerSub}>{vm.supply?.accountProbabilityReason??'双窗快照缺失，补给场景未计算。'}</span></div></div>
        <dl className={extra.details}><dt>当前选中模型</dt><dd>{extraVm?.platformReference?.activeModel??'P0'} · 参考展示，不代表账号回满</dd><dt>P0 长期参考</dt><dd>{pct((extraVm?.platformLongTerm as {probability24h?:number}|undefined)?.probability24h??vm.platform.probability24h)}</dd><dt>24h 影子模型 P1</dt><dd>{pct(vm.platform.shadow.probability24h)}，尚未升级</dd><dt>48h 当前模型</dt><dd>{pct(vm.platform.probabilities.find(p=>p.horizonMs===2*86_400_000)?.probability)}</dd><dt>regular / 相邻完整间隔</dt><dd>{vm.platform.training.eventCount} / {vm.platform.training.completedGapCount}</dd><dt>有效暴露</dt><dd>{vm.platform.training.exposureDays.toFixed(1)} 天</dd></dl>
        {vm.platform.factors.map(f=><p key={f.key} className={styles.mutedNote}>{f.explanation}：{pct(f.before)} → {pct(f.after)}</p>)}
        {vm.supply?.watchNotes.length? <p className={extra.note}>平台正在观察。原始 watch 百分比只作来源提示，不增加可放心使用的确定额度。</p>:null}
        <p className={styles.mutedNote}>{vm.evidenceQuality.join(' ')}</p>
              </div></details>
      </>}
      {tab==='planner'&&plain&&<>
        <Section icon={<CardStackIcon size={13}/>}>我的设置：卡、习惯、提醒时间</Section>
        <div className={styles.plannerGrid}><div className={styles.plannerCard}><span className={styles.plannerCardBlueIcon}><CardStackIcon size={20}/></span><div className={styles.plannerText}><strong className={styles.plannerBig}>{vm.resetCredits==null?'卡数未读到':`手上 ${vm.resetCredits} 张卡`}</strong><span className={styles.plannerSub}>张数以服务端为准</span></div></div><div className={styles.plannerCard}><span className={extra.signalIcon}><ClockIcon size={20}/></span><div className={styles.plannerText}><strong className={styles.plannerBig}>{plain.card.headline}</strong><span className={styles.plannerSub}>{plain.card.deadlineAt!=null?`最晚 ${whenLabel(vm.now,plain.card.deadlineAt)}`:'把卡的到期时间填上，才能算最晚哪天用'}</span></div></div></div>
        {vm.resetCredits===0&&<p className={extra.note}>服务端显示 0 张卡。下面台账里登记的卡会按“待核对”处理，不会替你猜。</p>}
        <aside className={extra.usePreview} aria-label="用卡规则预览"><strong>用卡之后会怎样？</strong><span>{vm.cardPreview?`周额度和短窗都回满到 ${vm.cardPreview.weekly}%，新的一周从用卡那一刻起算，到 ${whenLabel(vm.now,vm.cardPreview.weeklyDeadlineAt)} 再恢复。`:'拿到额度数据后显示。'}</span><small>这里只是预览，不会真的帮你用卡；用了之后到台账里点“我用了”。</small></aside>
        <PersonalInputs controller={controller} accountKey={props.demo?null:vm.accountKey} now={vm.now} onRecordedUse={props.onRefresh} focusSection={focusSection}/>
        <details className={extra.expander}><summary>专业细节（规划比较）</summary><p>{r?.reasons.join(' ')}</p><p>用卡效果预览：周窗预计回满；周截止预计为 {vm.account?beijingFull(new Date(vm.now+7*86_400_000).toISOString()):'快照取得后显示'}。短窗截止待刷新确认。此预览不会执行用卡。</p>
          <p>共同视野：{vm.planning?.horizons.map(h=>`${h.days}天`).join(' / ')??(props.planningPending?'后台计算中':'需求不足，未计算')}；{r?.sensitivity==='stable'?'首个动作稳定':r?.sensitivity==='changes_with_assumptions'?'随远期或机制假设变化，只作条件建议':'关键输入仍待学习'}。</p>
          {vm.planning?.selected&&<p>当前方案：{vm.planning.selected.firstAction?'现在用一张':'现在先留卡'}，最差情景不足 {vm.planning.selected.Ltail.toFixed(3)} 工作段单位，最多预计用 {vm.planning.selected.Nspent.toFixed(1)} 张。</p>}
          {vm.planning?.alternative&&<p>另一选择：{vm.planning.alternative.firstAction?'现在用一张':'现在先留卡'}，最差情景不足 {vm.planning.alternative.Ltail.toFixed(3)} 工作段单位，最多预计用 {vm.planning.alternative.Nspent.toFixed(1)} 张。你可以修改今天更在意的选项。</p>}
          {!!vm.planning?.selected?.scenarios.length&&<details className={extra.scenarios}><summary>各情景的详细比较</summary>{vm.planning.selected.scenarios.map(s=><p key={s.id}>情景 {s.id}：相对永远不用卡，减少不足 {s.deltaLoss.toFixed(3)} 工作段单位，增加实际周消耗 {s.deltaConsumedWeekly.toFixed(1)} 点，消耗 {s.spent.toFixed(1)} 张；错过保守截止 {s.missedSafeDeadline.toFixed(1)} 张。</p>)}</details>}
          <p>{r?.assumptions.join(' ')}</p><p>卡计划仅是条件安排；卡实际使用并刷新成功前，当前预算不会加上未来回满量。</p>
        </details>
      </>}
      {tab==='data'&&<>
        <Section icon={<DatabaseIcon size={13}/>}>准不准：它学到了多少、算得准不准</Section>
        <p className={extra.note}>已经记录你 {vm.demand.sampleDays} 天完整用量（满 7 天开始按你的习惯算，14 天后更稳）；平台公告历史 {vm.platform.training.eventCount} 条。下面是给较真的人看的评分，看不懂可以不管。</p>
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
  return <div className={compact.shell} data-floating-surface="bar" role="group" aria-label="reset-radar 悬浮条" onClick={onExpand}>
    <span className={compact.dragHandle} data-tauri-drag-region title="拖动悬浮条"><GripDots size={18}/></span>
    <span className={compact.brand}><RadarBrand className={compact.logo}/><span className={compact.brandText}><span className={compact.brandName}>RADAR<span className={`${compact.dot} ${loading||stale?compact.dotWarn:failed?compact.dotError:compact.dotOk}`} role="img" aria-label={loading?'读取中':failed?'采集失败':stale?'数据过期':'采集正常'}/></span><span className={compact.brandSub}>{demo?'演示模式':vm?.plan??'CODEX'}</span></span></span>
    <span className={compact.metric} title="本周额度还剩"><span className={compact.metricText}><strong className={compact.metricValue}>{percentWhole(loading?null:vm.remainingPercent)}</strong><span className={compact.metricLabel}>本周还剩</span><span className={compact.miniMeter} aria-hidden="true"><i style={{width:`${loading?0:Math.max(0,Math.min(100,vm.remainingPercent??0))}%`}}/></span></span></span>
    <span className={compact.metric} title="短窗额度剩余"><span className={compact.metricText}><strong className={compact.metricValue}>{percentWhole(loading?null:vm.shortRemainingPercent)}</strong><span className={compact.metricLabel}>短窗</span><span className={compact.miniMeter} aria-hidden="true"><i style={{width:`${loading?0:Math.max(0,Math.min(100,vm.shortRemainingPercent??0))}%`}}/></span></span></span>
    <span className={compact.metric} title="可用重置卡数量"><span className={compact.cardIconBox}><CardStackIcon size={16}/></span><span className={compact.metricText}><strong className={compact.metricValue}>{creditsLabel(loading?null:vm.resetCredits)}</strong><span className={compact.metricLabel}>重置卡</span></span></span>
    <span className={compact.spacer}/><button type="button" className={compact.expandButton} onClick={event=>{event.stopPropagation();onExpand();}} ref={expandRef} aria-label="展开完整面板"><ChevronDown size={20}/></button>
  </div>;
}
export function V3Peek({vm,phase,demo,onOpen,cards=[],sprint=null}:{vm:V3DashboardModel|null;phase?:string;demo:boolean;onOpen:()=>void;cards?:readonly PersonalInputsController['state']['cards'][number][];sprint?:{enabled:boolean;hoursPerDay:number}|null}){
  const budget=vm?.recommendation.weeklyBudgetToday;
  const peekCard=vm?plainAdvice({now:vm.now,status:vm.status,updatedAt:vm.updatedAt,weekly:vm.account?{remaining:vm.account.weekly.remaining,resetsAt:vm.account.weekly.resetsAt}:null,short:vm.account?{remaining:vm.account.short.remaining,resetsAt:vm.account.short.resetsAt}:null,resetCredits:vm.resetCredits,advice:vm.coldAdvice,budgetToday:budget??null,expectedDailyUse:vm.coldAdvice.expectedConsumption??null,tier:vm.coldContext.selectedTier,basis:vm.coldAdvice.basis,cards,lastSafeActionAt:vm.recommendation.lastSafeActionAt,planningPending:false,sampleDays:vm.demand.sampleDays,sprint,cardRisk:vm.cardRisk}).card.headline:'';
  if(!vm||phase==='initializing')return <div className={peek.shell} data-floating-surface="peek" role="status"><span className={peek.rowLabel}>正在获取 Codex 使用数据…</span></div>;
  return <div className={peek.shell} data-floating-surface="peek">
    <div className={peek.row}><span className={peek.rowLabel}>今天最多用</span><strong className={`${peek.rowValue} ${peek.rowValueAccent}`}>{budget?`约 ${percentLabel(budget.high)}（本周还剩 ${percentWhole(vm.remainingPercent)}）`:'还在算 · 先刷新额度'}</strong></div>
    <div className={peek.row}><span className={peek.rowLabel}>重置卡</span><span className={peek.rowValue}>{peekCard}</span></div>
    <div className={peek.footer}><span className={peek.observed}><ClockIcon size={13}/>{vm.status==='stale'?'上次读取':'读取于'} {beijingShort(vm.updatedAt)} 北京时间{vm.status==='stale'?' · 数据过期':''}</span>{demo&&<span className={peek.demoBadge}>演示数据</span>}<button type="button" className={peek.openButton} onClick={onOpen}><BarChartIcon size={14}/>看今天怎么用<ChevronRight size={13}/></button></div>
  </div>;
}
