// 薄适配层：v3的目标、账号补给和行动建议独立，不调用旧风险/用卡模型。
import { beijingDayKey, DAY_MS } from '../lib/beijing';
import { emptyPersonalInputs, reconcileCardCount, createResetCard, computeLastActionAt } from '../lib/v3/cards';
import { fitPlatformModel, predictPlatform, type RegularEventInput } from '../lib/v3/platform';
import { buildSupplyScenarios } from '../lib/v3/supply';
import { aggregateUsageDays, type UsageObservation } from '../lib/v3/observations';
import { fitDemandModel, type WorkloadChoice } from '../lib/v3/demand';
import { planActions, type PlanningOutput, type Recommendation, type PlanningInput } from '../lib/v3/planning';
import {normalizeAccount,buildReviewTimes,normalizeSignalVersions} from '../lib/v3/inputs';
import type { PersonalInputsState } from './usePersonalInputs';
import type { PlatformSignalHistory } from './useV3Journal';
import type { ProviderSnapshot } from './types';
import type { OrbReadout, OrbMetric } from './orbMetric';

export {normalizeAccount,buildReviewTimes} from '../lib/v3/inputs';
function rawHistory(document:unknown):{events:RegularEventInput[];fetchedAt:number;complete:boolean}{
  const doc=document as {events?:RegularEventInput[];fetchedAt?:string;upstream?:{pagination?:{has_more?:boolean;next_cursor?:unknown}};coverage?:{complete?:boolean}};
  return {events:Array.isArray(doc?.events)?doc.events:[],fetchedAt:Date.parse(doc?.fetchedAt??''),complete:doc?.upstream?.pagination?.has_more===false&&doc.upstream.pagination.next_cursor==null};
}
export function buildV3Dashboard(snapshot:ProviderSnapshot,historyDocument:unknown,now:number,personal?:PersonalInputsState,
  observations:readonly UsageObservation[]=[],signalHistory:readonly PlatformSignalHistory[]=[],deferPlanning=false){
  const history=rawHistory(historyDocument),events=[...history.events];
  const status=snapshot.resetStatus;
  const latest=status?.latestReset;
  if(latest?.reset_type==='regular'&&typeof latest.announced_at==='string')events.push({id:typeof latest.id==='string'||typeof latest.id==='number'?latest.id:`live:${latest.announced_at}`,resetType:'regular',announcedAt:latest.announced_at,firstSeenAt:status?.fetchedAt});
  const eventTimes=history.events.filter(e=>e.resetType==='regular').map(e=>Date.parse(String(e.announcedAt))).filter(Number.isFinite);
  const start=eventTimes.length?Math.min(...eventTimes):NaN;
  const coverage=history.complete&&Number.isFinite(start)&&Number.isFinite(history.fetchedAt)&&history.fetchedAt<=now
    ?[{from:start,to:history.fetchedAt,complete:true as const}]:[];
  const platformModel=fitPlatformModel({events,coverage,trainingCutoff:now});
  const platform=predictPlatform(platformModel,now,[DAY_MS,2*DAY_MS]);
  const account=normalizeAccount(snapshot);
  const data=personal??{...emptyPersonalInputs(snapshot.accountKey??null),reconciliation:reconcileCardCount([],snapshot.resetCredits),effectiveWorkloadToday:null,reminders:[],accountCount:snapshot.resetCredits};
  const scopedObservations=observations.filter(o=>o.accountKey===snapshot.accountKey);
  const days=aggregateUsageDays(scopedObservations,now);
  const choices:WorkloadChoice[]=data.inputVersions.filter(v=>v.field==='workloadToday'&&v.after!=null).map(v=>{
    const c=v.after as {localDate:string;level:string};return {dateKey:c.localDate,workload:c.level==='quiet'?'light':c.level as WorkloadChoice['workload']};
  });
  const budget=data.weeklyBudgetPercent?.localDate===beijingDayKey(now)?data.weeklyBudgetPercent.value:null;
  const demand=fitDemandModel(days,choices,now,budget==null?{}:{weeklyBudget:budget});
  const reviews=buildReviewTimes(now,data.usualViewTimes,data.viewTimesConfirmed);
  const scheduleSnapshots=normalizeSignalVersions(signalHistory,'scheduled_reset');
  const watchSnapshots=normalizeSignalVersions(signalHistory,'active_watch');
  if(status?.scheduledReset&&!scheduleSnapshots.length) scheduleSnapshots.push({...status.scheduledReset,firstSeenAt:status.fetchedAt??snapshot.updatedAt,version:1});
  if(status?.activeWatch&&!watchSnapshots.length) watchSnapshots.push({...status.activeWatch,id:`watch:${status.fetchedAt}`,firstSeenAt:status.fetchedAt??snapshot.updatedAt,version:1});
  const supply=account?buildSupplyScenarios({accountState:account,platformForecast:platform,scheduleSnapshots,watchSnapshots,now,mechanismConfig:{horizonMs:42*DAY_MS,includePlatformBackground:true,nextReviewAt:reviews[1]??null}}):null;
  const cards=data.reconciliation.cards.flatMap(c=>c.card?[c.card]:[]);
  for(let i=0;i<data.reconciliation.placeholderCount;i++)cards.push({...createResetCard({localId:`unknown-${i}`,label:'有效期待补充',enteredExpiry:null,entryPrecision:'unknown',now}),confirmedAt:null});
  const daily=demand.weekly;
  const workload=data.effectiveWorkloadToday==='quiet'?'light':data.effectiveWorkloadToday??'unknown';
  const preference=data.preference==='save-cards'?'save':data.preference==='use-expiring'?'expiry':'service';
  let planning:PlanningOutput|null=null;
  const planningInput:PlanningInput|null=account?{now,account,cards,reviews,preference,workload,
    dailyRange:daily?{low:daily.p20,median:daily.median,high:daily.p80,p95:daily.p95}:null,
    dailySamples:days.filter(d=>d.weeklyComplete&&!d.weeklyLowerBound&&!d.crossedReset&&!d.estimated&&!d.capacityConstrained).map(d=>d.weeklyCost!).slice(-28),
    todayBudget:budget,sampleDays:demand.sampleDays,supplyScenarios:supply?.scenarios??[],platformModel,inputSnapshotId:`${snapshot.accountKey??'demo'}@${snapshot.updatedAt}`,
    inventoryConflict:data.reconciliation.status==='conflict'||snapshot.resetCredits==null}:null;
  if(planningInput&&!deferPlanning)planning=planActions(planningInput);
  const recommendation:Recommendation=planning?.recommendation??{status:'need_data',action:'review_expiry',cardId:null,nextReviewAt:reviews[1]??null,lastSafeActionAt:null,weeklyBudgetToday:null,shortWindowEvaluated:false,
    reasons:[account?'正在比较建议方案；你可以继续修改个人安排。':'请刷新完整双窗快照；缺失窗口不会补成满额。'],assumptions:[],counterfactuals:[],sensitivity:'unknown'};
  if(recommendation.cardId){const card=cards.find(c=>c.localId===recommendation.cardId);recommendation.lastSafeActionAt=data.viewTimesConfirmed?computeLastActionAt(card?.safeDeadlineAt??null,data.usualViewTimes):null;}
  return {provider:snapshot.provider,status:snapshot.status,message:snapshot.message,plan:snapshot.plan,updatedAt:snapshot.updatedAt,now,
    accountKey:snapshot.accountKey??null,account,remainingPercent:account?.weekly.remaining??snapshot.weeklyWindow?.remainingPercent??null,
    shortRemainingPercent:account?.short.remaining??snapshot.shortWindow?.remainingPercent??null,resetCredits:snapshot.resetCredits,
    platformModel,platform,supply,demand,planning,planningInput,recommendation,personal:data,
    ledgerVersion:`card-v${data.cardVersions.length}`,preferenceVersion:`preference-v${data.version}`,
    evidenceQuality:[...(coverage.length?[]:['平台历史覆盖不完整，概率可能不可评估。']),'历史firstSeenAt缺失时只作公告时间理想化参考。',`历史覆盖截至 ${Number.isFinite(history.fetchedAt)?new Date(history.fetchedAt).toISOString():'未知'}`],
  };
}
export type V3DashboardModel=ReturnType<typeof buildV3Dashboard>;
export function v3OrbReadout(vm:V3DashboardModel|null,metric:OrbMetric):OrbReadout{
  const value=metric==='remaining'?vm?.remainingPercent:metric==='risk'?vm?.platform.probability24h==null?null:vm.platform.probability24h*100:vm?.recommendation.weeklyBudgetToday?.high;
  const valid=value!=null&&Number.isFinite(value);const text=valid?(metric==='remaining'?Math.round(value).toString():value.toFixed(1)):'—';
  const label=metric==='remaining'?'周额度剩余':metric==='risk'?'平台公告参考概率（不等于账号回满）':'今天周预算（短窗未保证）';
  return {metric,value:text,unit:valid?'%':'',title:`${label} ${text}${valid?'%':''}`,percent:metric==='remaining'&&valid?value:null,band:'unknown',hasValue:valid};
}
