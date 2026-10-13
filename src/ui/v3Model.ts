// 薄适配层：v3的目标、账号补给和行动建议独立，不调用旧风险/用卡模型。
import { beijingDayKey, DAY_MS } from '../lib/beijing';
import { emptyPersonalInputs, reconcileCardCount, createResetCard, computeLastActionAt } from '../lib/v3/cards';
import { fitPlatformModel, predictPlatform, type RegularEventInput } from '../lib/v3/platform';
import { buildSupplyScenarios,classifyAccountObservations,type AccountObservationSnapshot } from '../lib/v3/supply';
import { aggregateUsageDays, type UsageObservation } from '../lib/v3/observations';
import { fitDemandModel, selectDemandDays, type WorkloadChoice } from '../lib/v3/demand';
import { planActions,comparePolicies,scopeDefaultComparisons, type PlanningOutput, type Recommendation, type PlanningInput } from '../lib/v3/planning';
import {coldStartAdvice,POLICY_DAILY_COST,type ColdStartAdvice} from '../lib/v3/coldStart';
import {fitWeekdayModel,predictWeekday} from '../lib/v3/weekday';
import {fitTrendModel,replayTrend,selectTrendReference,rateProbability,recentWindowRate} from '../lib/v3/trend';
import {normalizeAccount,buildReviewTimes,normalizeSignalVersions} from '../lib/v3/inputs';
import type { PersonalInputsState } from './usePersonalInputs';
import type { PlatformSignalHistory } from './useV3Journal';
import type { ProviderSnapshot } from './types';
import type { OrbReadout, OrbMetric } from './orbMetric';
import {weeklyDeadlineAfterCard} from '../lib/v3/simulator';

export {normalizeAccount,buildReviewTimes} from '../lib/v3/inputs';
const replayCache=new WeakMap<object,ReturnType<typeof replayTrend>>();
function rawHistory(document:unknown):{events:RegularEventInput[];fetchedAt:number;complete:boolean}{
  const doc=document as {events?:RegularEventInput[];fetchedAt?:string;coverageThrough?:string;upstream?:{pagination?:{has_more?:boolean;next_cursor?:unknown}};coverage?:{complete?:boolean}};
  return {events:Array.isArray(doc?.events)?doc.events:[],fetchedAt:Date.parse(doc?.coverageThrough??doc?.fetchedAt??''),complete:doc?.upstream?.pagination?.has_more===false&&doc.upstream.pagination.next_cursor==null};
}
export function buildV3Dashboard(snapshot:ProviderSnapshot,historyDocument:unknown,now:number,personal?:PersonalInputsState,
  observations:readonly UsageObservation[]=[],signalHistory:readonly PlatformSignalHistory[]=[],deferPlanning=false,accountSnapshots:readonly AccountObservationSnapshot[]=[]){
  const history=rawHistory(historyDocument),events=[...history.events];
  const status=snapshot.resetStatus;
  const latest=status?.latestReset;
  if(latest?.reset_type==='regular'&&typeof latest.announced_at==='string')events.push({id:typeof latest.id==='string'||typeof latest.id==='number'?latest.id:`live:${latest.announced_at}`,resetType:'regular',announcedAt:latest.announced_at,firstSeenAt:status?.fetchedAt});
  const eventTimes=history.events.filter(e=>e.resetType==='regular').map(e=>Date.parse(String(e.announcedAt))).filter(Number.isFinite);
  const start=eventTimes.length?Math.min(...eventTimes):NaN;
  const coverage=history.complete&&Number.isFinite(start)&&Number.isFinite(history.fetchedAt)&&history.fetchedAt<=now
    ?[{from:start,to:history.fetchedAt,complete:true as const}]:[];
  const platformModel=fitPlatformModel({events,coverage,trainingCutoff:now});
  const platformLongTerm=predictPlatform(platformModel,now,[DAY_MS,2*DAY_MS]);
  const trendInput={events,coverage,trainingCutoff:now};
  let replay=typeof historyDocument==='object'&&historyDocument!=null?replayCache.get(historyDocument):undefined;
  if(!replay){replay=replayTrend({...trendInput,to:history.fetchedAt});if(typeof historyDocument==='object'&&historyDocument!=null)replayCache.set(historyDocument,replay);}
  const platformReference=selectTrendReference(fitTrendModel(trendInput),replay);
  const weekdayModel=fitWeekdayModel(trendInput),weekdayForecast=predictWeekday(weekdayModel,now,DAY_MS);
  const weekdayShadow={model:weekdayModel,forecast:weekdayForecast,
    differencePoints:weekdayForecast==null||platformReference.decay.probability24h==null?null:(weekdayForecast.probability-platformReference.decay.probability24h)*100,
    status:weekdayForecast==null?'unavailable' as const:'shadow' as const,
    reason:weekdayForecast==null?'完整覆盖或有限发生率不足；星期候选不写入':'固定D60-W28-BJT影子，尚未验证；当前概率参考及用卡仍沿用D60/P0'};
  const platform=platformReference.activeModel==='D60'?{...platformLongTerm,probability24h:platformReference.decay.probability24h,probabilities:platformReference.decay.probabilities,globalRatePerDay:platformReference.decay.ratePerDay,
    factors:platformLongTerm.probability24h==null||platformReference.decay.probability24h==null?[]:[{key:'long_term',before:0,after:platformLongTerm.probability24h,explanation:'P0长期参考'},{key:'calendar_decay',before:platformLongTerm.probability24h,after:platformReference.decay.probability24h,explanation:'D60近期日历权重；60天半衰期/7等效日收缩是预定假设'}]}:platformLongTerm;
  const account=normalizeAccount(snapshot);
  const data=personal??{...emptyPersonalInputs(snapshot.accountKey??null),reconciliation:reconcileCardCount([],snapshot.resetCredits),effectiveWorkloadToday:null,reminders:[],accountCount:snapshot.resetCredits};
  const scopedObservations=observations.filter(o=>o.accountKey===snapshot.accountKey);
  const days=aggregateUsageDays(scopedObservations,now);
  const choices:WorkloadChoice[]=data.inputVersions.filter(v=>v.field==='workloadToday').map(v=>{
    if(v.after==null)return {dateKey:beijingDayKey(v.changedAt),workload:'unknown'};
    const c=v.after as {localDate:string;level:string};return {dateKey:c.localDate,workload:c.level==='quiet'?'light':c.level as WorkloadChoice['workload']};
  });
  const budget=data.weeklyBudgetPercent?.localDate===beijingDayKey(now)?data.weeklyBudgetPercent.value:null;
  const demand=fitDemandModel(days,choices,now,budget==null?{}:{weeklyBudget:budget});
  const reviews=buildReviewTimes(now,data.usualViewTimes,data.viewTimesConfirmed);
  const scheduleSnapshots=normalizeSignalVersions(signalHistory,'scheduled_reset');
  const watchSnapshots=normalizeSignalVersions(signalHistory,'active_watch');
  if(status?.scheduledReset&&!scheduleSnapshots.length) scheduleSnapshots.push({...status.scheduledReset,firstSeenAt:status.fetchedAt??snapshot.updatedAt,version:1});
  if(status?.activeWatch&&!watchSnapshots.length) watchSnapshots.push({...status.activeWatch,id:`watch:${status.fetchedAt}`,firstSeenAt:status.fetchedAt??snapshot.updatedAt,version:1});
  const supply=account?buildSupplyScenarios({accountState:account,platformForecast:platform,scheduleSnapshots,watchSnapshots,platformEvents:events,now,mechanismConfig:{horizonMs:42*DAY_MS,includePlatformBackground:true,nextReviewAt:reviews[1]??null}}):null;
  const uniqueSnapshots=[...new Map([...accountSnapshots,...(account?[account]:[])].filter(s=>s.observedAt<=now).map(s=>[s.observedAt,s])).values()].sort((a,b)=>a.observedAt-b.observedAt);
  const mappingSnapshots=uniqueSnapshots.map((s,i)=>({...s,candidateIncidentIds:supply?.incidents.filter(incident=>incident.kind!=='watch'&&
    [incident.announcedAt,incident.firstSeenAt,incident.scheduledFor].some(at=>at!=null&&at>(uniqueSnapshots[i-1]?.observedAt??s.observedAt)&&at<=s.observedAt)).map(incident=>incident.id)}));
  const mapping=classifyAccountObservations({snapshots:mappingSnapshots,incidents:supply?.incidents??[],
    cardOperations:data.useRecords.map(op=>{
      const previous=uniqueSnapshots.filter(s=>s.observedAt<op.recordedAt).at(-1),current=uniqueSnapshots.find(s=>s.observedAt>=op.recordedAt);
      const corroborated=previous&&current&&current.availableCardCount<previous.availableCardCount&&
        current.weekly.resetsAt!==previous.weekly.resetsAt&&
        (current.weekly.remaining>previous.weekly.remaining||current.short.remaining>previous.short.remaining||
          Math.abs(current.weekly.resetsAt-(op.recordedAt+7*DAY_MS))<=15*60_000);
      return {id:op.id,occurredAt:op.recordedAt,confirmed:op.status==='user-recorded'&&!!corroborated};
    })});
  const cards=data.reconciliation.cards.flatMap(c=>c.card?[c.card]:[]);
  for(let i=0;i<data.reconciliation.placeholderCount;i++)cards.push({...createResetCard({localId:`unknown-${i}`,label:'有效期待补充',enteredExpiry:null,entryPrecision:'unknown',now}),confirmedAt:null});
  const daily=demand.weekly;
  const workload=data.effectiveWorkloadToday==='quiet'?'light':data.effectiveWorkloadToday??'unknown';
  const tier=workload==='unknown'?'normal':workload;
  const learned=data.planningMode==='learned'&&demand.sampleDays>=7&&daily!=null;
  const learnedToday=workload==='unknown'?null:demand.workloadGroups[workload];
  const preference=data.preference==='save-cards'?'save':data.preference==='use-expiring'?'expiry':'service';
  let planning:PlanningOutput|null=null;
  const planningInput:PlanningInput|null=account?{now,account,cards,reviews,preference,workload,
    dailyRange:learned&&daily?{low:daily.p20,median:daily.median,high:daily.p80,p95:daily.p95}:{low:POLICY_DAILY_COST.light,median:POLICY_DAILY_COST[tier],high:POLICY_DAILY_COST.busy,p95:POLICY_DAILY_COST.busy},
    todayRange:learned&&learnedToday&&!learnedToday.fallbackToAll?{low:learnedToday.p20,median:learnedToday.median,high:learnedToday.p80,p95:learnedToday.p95}:null,
    dailySamples:learned?selectDemandDays(days,now).map(d=>d.weeklyCost!):[],policyDefaultTier:learned?undefined:tier,
    platformRates:platformReference.decay.ratePerDay==null?undefined:[{id:'D60-half',ratePerDay:platformReference.decay.ratePerDay*.5},{id:'D60-current',ratePerDay:platformReference.decay.ratePerDay},{id:'D60-double',ratePerDay:platformReference.decay.ratePerDay*2}],
    todayBudget:budget,sampleDays:demand.sampleDays,supplyScenarios:supply?.scenarios??[],platformModel,inputSnapshotId:`${snapshot.accountKey??'demo'}@${snapshot.updatedAt}`,
    inventoryConflict:data.reconciliation.status==='conflict'||snapshot.resetCredits==null}:null;
  if(planningInput&&!deferPlanning)planning=planActions(planningInput);
  const coldContext:Parameters<typeof coldStartAdvice>[0]={now,account,cards,inventoryConflict:data.reconciliation.status==='conflict'||snapshot.resetCredits==null,valid:snapshot.status==='ok'&&now-Date.parse(snapshot.updatedAt)<=15*60_000,
    continueWorking:data.continueWorking?.localDate===beijingDayKey(now)&&data.continueWorking.value,selectedTier:tier,reviews,todayWeight:(workload==='light'?.5:workload==='busy'?2:1) as .5|1|2,
    expectedConsumption:budget??(learned?learnedToday?.median??daily?.median??null:null),basis:(budget!=null?'user_plan':learned?'learned':'policy_default') as ColdStartAdvice['basis']};
  const initialAdvice=coldStartAdvice(coldContext);
  const recommendation:Recommendation=planning?.recommendation??{status:'need_data',action:'review_expiry',cardId:null,nextReviewAt:reviews[1]??null,lastSafeActionAt:null,weeklyBudgetToday:null,shortWindowEvaluated:false,
    reasons:[initialAdvice.headline],assumptions:initialAdvice.assumptions,counterfactuals:[],sensitivity:'unknown'};
  if(recommendation.weeklyBudgetToday==null&&initialAdvice.allocatedWeeklyPointsToday!=null)recommendation.weeklyBudgetToday={low:initialAdvice.allocatedWeeklyPointsToday,high:initialAdvice.allocatedWeeklyPointsToday};
  if(!planning){recommendation.status='conditional';recommendation.action=initialAdvice.action==='use_card'?'use_card':initialAdvice.action==='reconcile_card'?'review_expiry':'keep_card';recommendation.nextReviewAt=initialAdvice.nextReviewAt;recommendation.cardId=initialAdvice.cardId;}
  if(recommendation.cardId){const card=cards.find(c=>c.localId===recommendation.cardId);recommendation.lastSafeActionAt=data.viewTimesConfirmed?computeLastActionAt(card?.safeDeadlineAt??null,data.usualViewTimes):null;}
  const result={provider:snapshot.provider,status:snapshot.status,message:snapshot.message,plan:snapshot.plan,updatedAt:snapshot.updatedAt,now,
    accountKey:snapshot.accountKey??null,account,remainingPercent:account?.weekly.remaining??snapshot.weeklyWindow?.remainingPercent??null,
    shortRemainingPercent:account?.short.remaining??snapshot.shortWindow?.remainingPercent??null,resetCredits:snapshot.resetCredits,
    platformModel,platform,platformLongTerm,platformReference,weekdayShadow,r90Probability:rateProbability(recentWindowRate(trendInput),DAY_MS),supply,mapping,demand,planning,planningInput,recommendation,personal:data,coldContext,coldAdvice:initialAdvice,cardPreview:account?{weekly:100,short:100,weeklyDeadlineAt:weeklyDeadlineAfterCard(now)}:null,
    ledgerVersion:`card-v${data.cardVersions.length}`,preferenceVersion:`preference-v${data.version}`,
    evidenceQuality:[...(coverage.length?[]:['平台历史覆盖不完整，概率可能不可评估。']),'历史firstSeenAt缺失时只作公告时间理想化参考。',`历史覆盖截至 ${Number.isFinite(history.fetchedAt)?new Date(history.fetchedAt).toISOString():'未知'}`],
  };return mergeV31Planning(result,planning);
}
export type V3DashboardModel=Omit<ReturnType<typeof buildV3Dashboard>,'coldAdvice'> & {coldAdvice:ColdStartAdvice};
export function mergeV31Planning<T extends {coldContext:Parameters<typeof coldStartAdvice>[0];recommendation:Recommendation;planning:PlanningOutput|null;planningInput:PlanningInput|null;now:number}>(vm:T,planning:PlanningOutput|null){
 const tier=vm.coldContext.selectedTier,cs=planning?.comparisons??[],scoped=vm.planningInput?.policyDefaultTier?scopeDefaultComparisons(cs,tier):cs;
 const earliest=vm.coldContext.cards.filter(c=>c.state==='available'&&c.reconciliation==='consistent'&&c.confirmedAt!=null&&c.safeDeadlineAt!=null&&vm.now<c.safeDeadlineAt-30*60_000).sort((a,b)=>a.safeDeadlineAt!-b.safeDeadlineAt!)[0];
 const preference=vm.planningInput?.preference??'service';
 const nowPlan=comparePolicies(scoped.filter(c=>c.firstAction===earliest?.localId),preference),wait=comparePolicies(scoped.filter(c=>c.firstAction==null),preference);
 const beneficial=!!nowPlan&&!!wait&&(nowPlan.Ltail<wait.Ltail-1e-9||nowPlan.Ltail<=wait.Ltail+1e-9&&nowPlan.scenarios.some((s,i)=>s.consumedWeekly>(wait.scenarios[i]?.consumedWeekly??Infinity)+1e-9));
 const next=vm.coldContext.reviews.find(t=>t>vm.now)??vm.now+12*3_600_000;
 const lastChance=earliest!=null&&next>=earliest.safeDeadlineAt!-30*60_000;
 const beforeReview=(vm.coldContext.expectedConsumption??POLICY_DAILY_COST[tier])*Math.min(24,(next-vm.now)/3_600_000)/24>(vm.coldContext.account?.weekly.remaining??Infinity);
 const fullNow=cs.find(c=>c.id===nowPlan?.id),fullWait=cs.find(c=>c.id===wait?.id);
 const otherWorse=!!fullNow&&!!fullWait&&fullNow.scenarios.some(s=>s.lossTail>(fullWait.scenarios.find(w=>w.id===s.id)?.lossTail??Infinity)+1e-9);
 const advice=coldStartAdvice({...vm.coldContext,comparison:planning?{selectedUse:beneficial&&(lastChance||beforeReview),beneficial,otherWorse,reversal:planning.recommendation.sensitivity==='changes_with_assumptions',trigger:lastChance?'本轮已是下次查看前的最后安全机会；按所选档及共同视野比较。':'所选档在下次查看前可能不足；可修改工作量档再看。'}:undefined});
 const r=planning?.recommendation??vm.recommendation;
 const weeklyBudgetToday=vm.coldContext.basis==='learned'&&r.weeklyBudgetToday?r.weeklyBudgetToday:advice.allocatedWeeklyPointsToday==null?null:{low:advice.allocatedWeeklyPointsToday,high:advice.allocatedWeeklyPointsToday};
 if(vm.coldContext.basis==='learned')advice.allocatedWeeklyPointsToday=weeklyBudgetToday?.high??null;
 const recommendation={...r,status:(advice.action==='use_card'?'conditional':'wait') as Recommendation['status'],action:(advice.action==='use_card'?'use_card':advice.action==='reconcile_card'?'review_expiry':'keep_card') as Recommendation['action'],cardId:advice.cardId,nextReviewAt:advice.nextReviewAt,reasons:[advice.headline,...r.reasons.filter(reason=>reason!==advice.headline)],assumptions:[...advice.assumptions,...r.assumptions],weeklyBudgetToday};
 return {...vm,planning,recommendation,coldAdvice:advice,expectedConsumption:advice.expectedConsumption,allocationBudget:weeklyBudgetToday};
}
export function v3OrbReadout(vm:V3DashboardModel|null,metric:OrbMetric):OrbReadout{
  const value=metric==='remaining'?vm?.remainingPercent:metric==='risk'?vm?.platform.probability24h==null?null:vm.platform.probability24h*100:vm?.recommendation.weeklyBudgetToday?.high;
  const valid=value!=null&&Number.isFinite(value);const text=valid?(metric==='remaining'?Math.round(value).toString():value.toFixed(1)):'—';
  const label=metric==='remaining'?'周额度剩余':metric==='risk'?'平台公告参考概率（不等于账号回满）':'今天周预算（短窗未保证）';
  return {metric,value:text,unit:valid?'%':'',title:`${label} ${text}${valid?'%':''}`,percent:metric==='remaining'&&valid?value:null,band:'unknown',hasValue:valid};
}
