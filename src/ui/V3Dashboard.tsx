import { useState } from 'react';
import type { V3DashboardModel } from './v3Model';
import type { PersonalInputsController } from './usePersonalInputs';
import { PersonalInputs } from './PersonalInputs';
import { PANEL_TABS, initialPanelTab } from './panelTabs';
import { RadarLogo, SunIcon, MoonIcon, ChevronUp, CloseIcon, RefreshIcon } from './icons';
import { beijingFull, percentWhole } from './format';
import { ProgressRing } from './viz';
import styles from './DashboardPanel.module.css';
import extra from './V3Dashboard.module.css';

export interface V3PanelProps {
  vm:V3DashboardModel|null; controller:PersonalInputsController;
  phase:string; readError:string|null; logError?:string|null;subscriptionError:boolean;refreshing:boolean;demo:boolean;
  activeTheme:'light'|'dark';onThemePreference:(theme:'light'|'dark')=>void;onRefresh:()=>void;onCollapse:()=>void;onClose:()=>void;
}
const pct=(v:number|null|undefined)=>v==null?'—':`${(v*100).toFixed(1)}%`;
const amount=(v:number|null|undefined)=>v==null?'学习中':`${v.toFixed(1)} 周额度百分点`;
const statusText={act_now:'建议现在处理',wait:'先保留，下一次查看再决定',conditional:'条件建议 · 尚有未知',need_data:'还在学习你的用量',not_applicable:'暂无可执行用卡方案'};
export default function V3Dashboard(props:V3PanelProps){
  const {vm,controller}=props;const [tab,setTab]=useState(()=>initialPanelTab(window.location.hash));
  const r=vm?.recommendation;const budget=r?.weeklyBudgetToday;const card=controller.state.cards.find(c=>c.localId===r?.cardId);
  return <div className={styles.shell} role="main" aria-label="reset-radar 展开面板">
    <header className={styles.header}>
      <div className={styles.headerDrag} data-tauri-drag-region><RadarLogo size={28}/><span className={styles.title}><span className={styles.titleMain}>reset-radar</span><span className={styles.titleSub}>额度、补给与用卡建议</span></span></div>
      <div className={styles.headerActions}>{props.demo&&<span className={styles.demoBadge}>演示</span>}
        <span className={styles.themeToggle} role="group" aria-label="主题">{(['light','dark'] as const).map(theme=><button type="button" key={theme} className={`${styles.themeOption} ${props.activeTheme===theme?styles.themeOptionActive:''}`} aria-label={theme==='light'?'浅色主题':'深色主题'} aria-pressed={props.activeTheme===theme} onClick={()=>props.onThemePreference(theme)}>{theme==='light'?<SunIcon size={15}/>:<MoonIcon size={15}/>}</button>)}</span>
        <button className={styles.iconButton} onClick={props.onCollapse} aria-label="收起面板"><ChevronUp size={16}/></button><button className={styles.iconButton} onClick={props.onClose} aria-label="隐藏到托盘"><CloseIcon size={16}/></button>
      </div>
    </header>
    <nav className={styles.tabBar} role="tablist" aria-label="面板模块">{PANEL_TABS.map(item=><button type="button" role="tab" aria-selected={tab===item.key} aria-controls={`v3-${item.key}`} id={`v3-tab-${item.key}`} key={item.key} className={`${styles.tabButton} ${tab===item.key?styles.tabButtonActive:''}`} onClick={()=>setTab(item.key)}>{item.key==='risk'?'平台信号':item.label}</button>)}</nav>
    {(props.logError||props.readError||props.subscriptionError)&&<p className={extra.warning} role="status">{props.logError??props.readError??'自动订阅不可用，请手动刷新。'}</p>}
    <div className={`${styles.page} ${extra.page}`} role="tabpanel" id={`v3-${tab}`} aria-labelledby={`v3-tab-${tab}`}>
      {!vm?<p className={styles.mutedNote}>等待额度快照；缺失数据不会填成满额。</p>:<>
      {tab==='overview'&&<>
        <div className={styles.quotaGrid}>{[{value:vm.remainingPercent,label:'周额度剩余',window:vm.account?.weekly},{value:vm.shortRemainingPercent,label:'短窗剩余',window:vm.account?.short}].map(item=><div className={styles.quotaCard} key={item.label}><ProgressRing value={item.value} size={54} label={item.label}><span className={styles.ringCenter}>{percentWhole(item.value)}</span></ProgressRing><span className={styles.quotaText}><span className={styles.quotaLabel}>{item.label}</span><span className={styles.quotaSub}>自然补给 {item.window?beijingFull(new Date(item.window.resetsAt).toISOString()):'待取得截止'}</span></span></div>)}</div>
        {vm.supply?.incidents.filter(i=>i.kind==='scheduled'&&i.status!=='cancelled'&&i.scheduledFor!=null).map(i=><p className={extra.note} key={i.id}>计划在 {beijingFull(new Date(i.scheduledFor!).toISOString())} 重置；等待实际到账确认。</p>)}
        <section className={extra.summary}><strong>{r?statusText[r.status]:'等待数据'}</strong><p>{card?`${card.label}：` : ''}{r?.reasons[0]}</p><p>{r?.shortWindowEvaluated?'已评估双窗工作量':'短窗工作量未知，周预算不保证连续工作不会限流。'}</p></section>
        {controller.state.reminders.map(rem=><p className={extra.warning} key={`${rem.localId}:${rem.tier}`}>临期卡：{controller.state.cards.find(c=>c.localId===rem.localId)?.label} · {rem.tier==='needs-confirmation'?'需补具体时间，可能仍可用':rem.tier==='last-chance'?'已到最后建议操作时段':`${rem.tier} 内需处理`}{rem.lastActionAt!=null?` · 最迟 ${beijingFull(new Date(rem.lastActionAt).toISOString())}`:''}</p>)}
        <div className={extra.summary}><p>按今天工作量预计会用：{vm.demand.weekly?`${amount(vm.demand.workload[controller.state.effectiveWorkloadToday==='quiet'?'light':controller.state.effectiveWorkloadToday??'unknown'].low)} – ${amount(vm.demand.workload[controller.state.effectiveWorkloadToday==='quiet'?'light':controller.state.effectiveWorkloadToday??'unknown'].high)}`:vm.demand.budgetScenarios.length?'使用你今天填写的预算情景':'正在学习，可在用卡页填今天预算'}</p><p>当前周余额的今日预算：{budget?`${amount(budget.low)} – ${amount(budget.high)}`:'学习中'}</p></div>
        <button type="button" className={styles.primaryButton} onClick={props.onRefresh} disabled={props.refreshing}><RefreshIcon size={14}/> {props.refreshing?'正在读取':'刷新额度'}</button>
        <p className={styles.mutedNote}>最近观测 {beijingFull(vm.updatedAt)} · {vm.status==='ok'?'成功':vm.message??vm.status}</p>
      </>}
      {tab==='risk'&&<>
        <h2 className={extra.heading}>未来 24 小时平台重置信号参考概率</h2>
        <div className={extra.metric}>{pct(vm.platform.probability24h)}</div>
        <p className={extra.note}>这是新 regular 公告的时间口径，尚不等价于本人账号在窗口内回满的概率。</p>
        <div className={extra.summary}><p>账号平台补给概率：{pct(vm.supply?.accountProbability24h)}</p><p>{vm.supply?.accountProbabilityReason??'双窗快照缺失，补给场景未计算。'}</p></div>
        <dl className={extra.details}><dt>正式模型</dt><dd>P0 常数发生率（参考）</dd><dt>24h 影子模型 P1</dt><dd>{pct(vm.platform.shadow.probability24h)}，尚未升级</dd><dt>48h 同口径 P0</dt><dd>{pct(vm.platform.probabilities.find(p=>p.horizonMs===2*86_400_000)?.probability)}</dd><dt>regular / 相邻完整间隔</dt><dd>{vm.platform.training.eventCount} / {vm.platform.training.completedGapCount}</dd><dt>有效暴露</dt><dd>{vm.platform.training.exposureDays.toFixed(1)} 天</dd></dl>
        {vm.platform.factors.map(f=><p key={f.key} className={styles.mutedNote}>{f.explanation}：{pct(f.before)} → {pct(f.after)}</p>)}
        {vm.supply?.watchNotes.length? <p className={extra.note}>平台正在观察。原始 watch 百分比只作来源提示，不增加可放心使用的确定额度。</p>:null}
        <p className={styles.mutedNote}>{vm.evidenceQuality.join(' ')}</p>
      </>}
      {tab==='planner'&&<>
        <PersonalInputs controller={controller} accountKey={props.demo?null:vm.accountKey} now={vm.now} onRecordedUse={props.onRefresh}/>
        <details className={extra.expander}><summary>建议方案与计算依据</summary><p>{r?.reasons.join(' ')}</p><p>现在用卡会回满双窗，并把周截止改为 {vm.account?beijingFull(new Date(vm.now+7*86_400_000).toISOString()):'快照取得后显示'}；短窗的新截止需刷新确认。</p>
          <p>共同视野：{vm.planning?.horizons.map(h=>`${h.days}天`).join(' / ')??'需求不足，未计算'}；{r?.sensitivity==='stable'?'首个动作稳定':r?.sensitivity==='changes_with_assumptions'?'随远期或机制假设变化，只作条件建议':'关键输入仍待学习'}。</p>
          {vm.planning?.selected&&<p>当前方案：{vm.planning.selected.firstAction?'现在用一张':'现在先留卡'}，最差情景不足 {vm.planning.selected.Ltail.toFixed(3)} 工作段单位，最多预计用 {vm.planning.selected.Nspent.toFixed(1)} 张。</p>}
          {vm.planning?.alternative&&<p>另一选择：{vm.planning.alternative.firstAction?'现在用一张':'现在先留卡'}，最差情景不足 {vm.planning.alternative.Ltail.toFixed(3)} 工作段单位，最多预计用 {vm.planning.alternative.Nspent.toFixed(1)} 张。你可以修改今天更在意的选项。</p>}
          {vm.planning?.selected?.scenarios.map(s=><p key={s.id}>情景 {s.id}：相对永远不用卡，减少不足 {s.deltaLoss.toFixed(3)} 工作段单位，增加实际周消耗 {s.deltaConsumedWeekly.toFixed(1)} 点，消耗 {s.spent.toFixed(1)} 张；错过保守截止 {s.missedSafeDeadline.toFixed(1)} 张。</p>)}
          <p>{r?.assumptions.join(' ')}</p><p>卡计划仅是条件安排；卡实际使用并刷新成功前，当前预算不会加上未来回满量。</p>
        </details>
      </>}
      {tab==='data'&&<>
        <h2 className={extra.heading}>观测与验证</h2><p>个人完整周需求日：{vm.demand.sampleDays}；少于7日仅初步范围，14日起显示常规经验分位。</p>
        <p>v3 在线固定日预测正在积累；P0 正式参考，P1 / watch 保持影子。旧版本日志保留原 target 和 modelVersion，不算作 v3 成绩。</p>
        <p>升级至少需要60个可评估固定日预测、10个正例、周分块改善证据；watch 另需30个可分辨 episode。</p>
        <dl className={extra.details}><dt>快照</dt><dd>{vm.updatedAt}</dd><dt>卡台账版本</dt><dd>{vm.ledgerVersion}</dd><dt>输入版本</dt><dd>{vm.preferenceVersion}</dd><dt>模拟种子</dt><dd>{vm.planning?.seed??'未运行'}</dd><dt>模型</dt><dd>{vm.planning?.modelVersion??'platform-v3'}</dd></dl>
        <p className={styles.mutedNote}>日耗、平台信号版本和各次预测均只追加到本机日志；演示不会写生产预测记录。</p>
      </>}
      </>}
    </div>
  </div>;
}
export function V3CompactBar({vm,demo,onExpand,expandRef}:{vm:V3DashboardModel|null;phase?:string;demo:boolean;onExpand:()=>void;expandRef?:React.RefObject<HTMLButtonElement|null>}){
  return <button type="button" className={extra.compact} onClick={onExpand} ref={expandRef} aria-label="展开完整面板"><RadarLogo size={22}/><strong>周 {percentWhole(vm?.remainingPercent??null)}</strong><span>短 {percentWhole(vm?.shortRemainingPercent??null)}</span><span>卡 ×{vm?.resetCredits??'—'}</span>{demo&&<small>演示</small>}<span>展开</span></button>;
}
export function V3Peek({vm,demo,onOpen}:{vm:V3DashboardModel|null;phase?:string;demo:boolean;onOpen:()=>void}){return <div className={extra.summary}><p>{demo?'演示 · ':''}周 {percentWhole(vm?.remainingPercent??null)} / 短 {percentWhole(vm?.shortRemainingPercent??null)}</p><p>{vm?.recommendation.reasons[0]??'等待快照'}</p><button type="button" onClick={onOpen}>查看安排</button></div>;}
