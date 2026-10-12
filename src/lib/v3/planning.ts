// 用户v3 §9：共享世界、有限策略、共同视野、词典序；数字是情景模型结果，不是实测收益。
import { beijingDayFloor, DAY_MS, HOUR_MS } from '../beijing';
import type { ResetCard } from './cards';
import type { SupplyScenario } from './supply';
import { generateRenewalPaths, type PlatformModel } from './platform';
import { simulatePolicy, makePolicy, enumeratePolicyParameters, NEVER_USE, nextReviewDelay,
  type AccountState, type DemandBlock, type DemandForecast, type Mechanisms, type PolicyParameters,
  type SimulationResult, type SupplyEvent, type VisibleState, type WorldPath } from './simulator';

export type Preference = 'service' | 'expiry' | 'save';
export interface Recommendation {
  status: 'act_now' | 'wait' | 'conditional' | 'need_data' | 'not_applicable';
  action: 'use_card' | 'keep_card' | 'review_expiry' | 'none'; cardId: string | null;
  nextReviewAt: number | null; lastSafeActionAt: number | null;
  weeklyBudgetToday: { low: number; high: number } | null; shortWindowEvaluated: boolean;
  reasons: string[]; assumptions: string[]; counterfactuals: PolicyComparison[];
  sensitivity: 'stable' | 'changes_with_assumptions' | 'unknown';
}
export interface ScenarioMetric { id: string; lossMean: number; lossTail: number; spent: number; expired: number; missedSafeDeadline: number; consumedWeekly: number; deltaLoss: number; deltaConsumedWeekly: number; deltaCardsExpired: number; firstActionAt: number | null; shortWindowEvaluated: boolean; shortageFraction: number; estimateError: number }
export interface PolicyComparison { id: string; firstAction: string | null; parameters: PolicyParameters; scenarios: ScenarioMetric[]; Ltail: number; Lmean: number; Eexpire: number; Nspent: number; dominated: boolean; firstCardDeadline?:number }
export interface PlanningInput {
  now: number; account: AccountState; cards: readonly ResetCard[]; reviews: readonly number[];
  preference: Preference; dailyRange: { low: number; median: number; high: number; p95: number } | null;
  todayRange?: {low:number;median:number;high:number;p95:number}|null;
  dailySamples?: readonly number[]; todayBudget?: number | null; workload?: 'light' | 'normal' | 'busy' | 'unknown';
  sampleDays: number; supplyScenarios: readonly SupplyScenario[]; platformModel?: PlatformModel | null;
  inputSnapshotId: string; inventoryConflict?: boolean;
  // 测试/明确工作计划可提供配对工作段；策略仍只取得forecast，不读取world。
  explicitDemand?: readonly DemandBlock[];
}
export interface PlanningOutput { recommendation: Recommendation; comparisons: PolicyComparison[]; horizons: { days: number; firstAction: string | null }[]; seed: number; modelVersion: string; assumptions: string[]; selected: PolicyComparison | null; alternative?: PolicyComparison|null }
export const MODEL_VERSION = 'decision-v3.2';
export function seedFromSnapshot(id: string): number {
  let n = 2166136261; for (const c of `${id}:${MODEL_VERSION}`) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0;
}
function random(seed: number): () => number { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let n = Math.imul(seed ^ seed >>> 15, 1 | seed); n ^= n + Math.imul(n ^ n >>> 7, 61 | n); return ((n ^ n >>> 14) >>> 0) / 4294967296; }; }

/** §9.7 按权重截断分配，D=0不分；平台/未确认卡补给不增加确定余额。 */
export function allocateDailyBudget(account: AccountState, blocks: readonly DemandBlock[], now: number, priorities?: readonly number[]): { today: number; allocations: { start: number; end: number; demand: number; budget: number }[]; shortWindowEvaluated: boolean } | null {
  if (!Number.isFinite(account.weekly.resetsAt) || account.weekly.resetsAt <= now || blocks.length === 0) return null;
  const segments = blocks.filter(b => b.end > now && b.start < account.weekly.resetsAt).map((b, index) => {
    const start = Math.max(now, b.start), end = Math.min(account.weekly.resetsAt, b.end);
    const demand = b.weeklyCost * (end - start) / (b.end - b.start);
    return { start, end, demand, weight: priorities?.[index] == null ? demand : Math.max(0, priorities[index]!), budget: 0 };
  });
  if (segments.length === 0 || segments.some(b => !Number.isFinite(b.demand) || b.demand < 0)) return null;
  const target = Math.min(Math.max(0, account.weekly.remaining), segments.reduce((s, b) => s + b.demand, 0));
  let lo = 0, hi = Math.max(1, ...segments.map(b => b.weight > 0 ? b.demand / b.weight : 0));
  for (let i = 0; i < 64; i++) { const mid = (lo + hi) / 2; const total = segments.reduce((s, b) => s + Math.min(b.demand, mid * b.weight), 0); if (total < target) lo = mid; else hi = mid; }
  for (const b of segments) b.budget = Math.min(b.demand, hi * b.weight);
  const todayEnd = beijingDayFloor(now) + DAY_MS;
  const today = segments.reduce((s, b) => s + b.budget * Math.max(0, Math.min(todayEnd, b.end) - b.start) / (b.end - b.start), 0);
  return { today, allocations: segments.map(({ start, end, demand, budget }) => ({ start, end, demand, budget })), shortWindowEvaluated: blocks.every(b => b.shortCost != null) };
}
function makeBlocks(input: PlanningInput, end: number, daily: (index: number) => number): DemandBlock[] {
  if (input.explicitDemand) return input.explicitDemand.filter(b => b.end > input.now && b.start < end).map(b => ({ ...b }));
  if(input.dailyRange==null&&input.todayBudget==null)return [];
  const blocks: DemandBlock[] = [];
  const floor = beijingDayFloor(input.now);
  for (let start = floor, index = 0; start < end; start += DAY_MS, index++) {
    if (index > 0 && input.dailyRange == null) break; // 今天手填不能永久变成未来每日需求。
    const a = Math.max(input.now, start), b = Math.min(end, start + DAY_MS), cost = daily(index);
    blocks.push({ start: a, end: b, weeklyCost: cost * (b - a) / DAY_MS, shortCost: null, weight: (b - a) / DAY_MS });
  }
  return blocks;
}
function scenarioEvents(scenario: SupplyScenario, start: number, end: number): SupplyEvent[] {
  const groups = new Map<string, SupplyEvent>();
  for (const e of scenario.events) {
    if (e.at < start || e.at >= end || !e.incidentId || e.certainty !== 'conditional') continue;
    const event = groups.get(e.incidentId) ?? { at: e.at, incidentId: e.incidentId, weekly: false, short: false, reanchorWeekly: scenario.id.includes('reanchor') && !scenario.id.includes('no-reanchor') };
    if (e.kind === 'scheduled_weekly_supply') event.weekly = true;
    if (e.kind === 'scheduled_short_supply') event.short = true;
    groups.set(e.incidentId, event);
  }
  return [...groups.values()].filter(e => e.weekly || e.short);
}
function mean(v: readonly number[]): number { return v.reduce((s, n) => s + n, 0) / Math.max(1, v.length); }
function tail(v: readonly number[], probabilistic: boolean): number { if (!probabilistic) return Math.max(0, ...v); const values = [...v].sort((a,b) => b-a); return mean(values.slice(0, Math.max(1, Math.ceil(values.length * 0.1)))); }
function summarize(id: string, results: readonly SimulationResult[], baselines: readonly SimulationResult[], probabilistic: boolean): ScenarioMetric {
  const losses = results.map(r => r.loss), m = mean(losses);
  const variance = mean(losses.map(v => (v - m) ** 2));
  return { id, lossMean: probabilistic ? m : Math.max(0, ...losses), lossTail: tail(losses, probabilistic),
    spent: mean(results.map(r => r.cardsSpent)), expired: mean(results.map(r => r.expiredCards)), missedSafeDeadline: mean(results.map(r => r.missedSafeDeadlines)),
    consumedWeekly: mean(results.map(r => r.consumedWeekly)), deltaLoss: mean(results.map((r,i) => baselines[i]!.loss-r.loss)),
    deltaConsumedWeekly: mean(results.map((r,i) => r.consumedWeekly-baselines[i]!.consumedWeekly)), deltaCardsExpired: mean(results.map((r,i) => baselines[i]!.expiredCards-r.expiredCards)),
    firstActionAt: results.find(r => r.actions.length)?.actions[0]?.at ?? null, shortWindowEvaluated: results.every(r => r.shortWindowEvaluated),
    shortageFraction: mean(results.map(r => Number(r.loss > 0))), estimateError: probabilistic ? Math.sqrt(variance / results.length) : 0 };
}
export function comparePolicies(candidates: readonly PolicyComparison[], preference: Preference): PolicyComparison | null {
  const eligible = candidates.filter(c => !c.dominated);
  if (!eligible.length) return null;
  const minTail = Math.min(...eligible.map(c => c.Ltail));
  const best = eligible.filter(c => c.Ltail - minTail <= Math.max(0, ...c.scenarios.map(s => s.estimateError)));
  const time = (c: PolicyComparison) => Math.min(...c.scenarios.map(s => s.firstActionAt ?? Infinity));
  const keys = (c: PolicyComparison) => preference === 'save' ? [c.Nspent, -time(c), c.Lmean, c.Eexpire]
    : preference === 'expiry' ? [c.Eexpire, c.Lmean, c.Nspent, time(c)] : [c.Lmean, c.Eexpire, c.Nspent, time(c)];
  return [...best].sort((a,b) => { const ka=keys(a), kb=keys(b); for(let i=0;i<ka.length;i++){if(ka[i]!==kb[i])return ka[i]!<kb[i]!?-1:1;} return (a.firstCardDeadline??Infinity)-(b.firstCardDeadline??Infinity)||a.id.localeCompare(b.id); })[0]!;
}

/** 无经验权重的机制不能被最差值汇总隐藏：分别重选首个动作并报告反转。 */
export function scenarioActionSensitivity(candidates:readonly PolicyComparison[],preference:Preference):boolean {
  const ids=[...new Set(candidates.flatMap(c=>c.scenarios.map(s=>s.id)))];
  const actions=new Set<string|null>();
  for(const id of ids){
    const scoped=candidates.flatMap(c=>{
      const s=c.scenarios.find(s=>s.id===id);
      return s?[{...c,scenarios:[s],Ltail:s.lossTail,Lmean:s.lossMean,Eexpire:s.expired,Nspent:s.spent}]:[];
    });
    const selected=comparePolicies(scoped,preference);
    if(selected)actions.add(selected.firstAction);
  }
  return actions.size>1;
}

function evaluateHorizon(input: PlanningInput, days: number, seed: number): { selected: PolicyComparison | null; comparisons: PolicyComparison[] } {
  const end = input.now + days * DAY_MS;
  const empirical = (input.dailySamples?.length ?? 0) >= 7;
  // 手填倍率是无权重压力，未来经验抽样在每个压力组内独立计分，不能混成概率。
  // 未建立经验分布且忙闲未知时，保留低/中/高全路径，避免中值掩盖较忙缺口。
  const demandCases = input.todayBudget != null
    ? [0.5, 1, 2].map((multiplier, i) => ({id:`pressure-${i}`,multiplier,daily:input.dailyRange?.median??0}))
    : !empirical && input.dailyRange && (input.workload == null || input.workload === 'unknown')
      ? [{id:'demand-low',multiplier:1,daily:input.dailyRange.low}, {id:'demand-median',multiplier:1,daily:input.dailyRange.median}, {id:'demand-high',multiplier:1,daily:input.dailyRange.high}]
      : [{id:'demand-reference',multiplier:1,daily:input.dailyRange?.median??0}];
  const sampleGroups = demandCases.map(demandCase => {
    const rng = random(seed); // 各压力组共享同一未来需求抽样，差别仅为指定压力。
    const samples = Array.from({length:empirical?256:1}, () => {
      const costs = Array.from({length:days+1}, () => empirical ? input.dailySamples![Math.floor(rng()*input.dailySamples!.length)]! : demandCase.daily);
      const todayRange=input.todayRange??input.dailyRange;
      return makeBlocks(input,end,index => index === 0 && input.todayBudget != null ? input.todayBudget*demandCase.multiplier
        : index === 0 && input.workload === 'light' && todayRange ? todayRange.low
        : index === 0 && input.workload === 'busy' && todayRange ? todayRange.high
        : index === 0 && input.workload === 'normal' && input.todayRange ? input.todayRange.median : costs[index]!);
    });
    return {id:demandCase.id,samples};
  });
  // 额外平台过程属于独立敏感性机制，所有策略复用相同seed/path；不等价本账号概率。
  const background = input.platformModel ? generateRenewalPaths(input.platformModel,{now:input.now,horizonMs:days*DAY_MS,count:256,seed}) : [];
  const scenarios = input.supplyScenarios.length ? input.supplyScenarios : [{ id:'no-extra-supply',events:[] } as unknown as SupplyScenario];
  const mechanisms: Mechanisms[] = [
    { shortAfterCard:'keep_deadline', weeklyContinuation:'fixed_duration',shortContinuation:'fixed_duration' },
    { shortAfterCard:'restart_duration', weeklyContinuation:'fixed_duration',shortContinuation:'fixed_duration' },
    { shortAfterCard:'keep_deadline', weeklyContinuation:'unknown',shortContinuation:'unknown' },
    { shortAfterCard:'restart_duration', weeklyContinuation:'unknown',shortContinuation:'unknown' },
  ];
  // 无权重手填压力各自单列，不能平均成概率；有概率的背景过程始终256条共享路径。
  const worlds = scenarios.flatMap(sc => mechanisms.flatMap((mechanism, mi) => {
    return sampleGroups.map(({samples:group,id})=>{
      const probabilistic=empirical||sc.source==='platform_background'&&input.platformModel?.lambda0!=null;
      const grouped=probabilistic&&!empirical?Array.from({length:256},()=>group[0]!):group;
      return {id:`${sc.id}:mechanism-${mi}:${id}`,mechanism,probabilistic,
        paths:grouped.map((demand,path)=>({start:input.now,end,demand,reviews:input.reviews,platform:[...scenarioEvents(sc,input.now,end),...(sc.source==='platform_background'?(background[path]??[]).map((at,i)=>({at,incidentId:`background-${path}-${i}`,weekly:true,short:false,reanchorWeekly:false})):[])]}as WorldPath))};
    });
  }));
  const baselines = worlds.map(w => w.paths.map(path => simulatePolicy(input.account,input.cards,NEVER_USE,path,w.mechanism,()=>({weeklyCost:0,shortCost:null,nextKnownSupplyAt:input.account.weekly.resetsAt,blocks:[]}))));
  const known = input.cards.filter(c => c.state==='available' && c.reconciliation==='consistent' && c.confirmedAt!=null && c.safeDeadlineAt!=null && input.now<c.safeDeadlineAt-30*60_000)
    .sort((a,b)=>a.safeDeadlineAt!-b.safeDeadlineAt!||a.localId.localeCompare(b.localId));
  const comparisons: PolicyComparison[]=[];
  const parameterOptions=enumeratePolicyParameters(input.explicitDemand?.every(b=>b.shortCost!=null)??false);
  for(const parameters of known.length?parameterOptions:parameterOptions.slice(0,1)) for(const firstAction of ['wait',...known.map(c=>c.localId)]) {
    const metrics = worlds.map((w,wi) => {
      const horizonMs = parameters.horizonHours===0 ? nextReviewDelay(input.reviews,input.now) : parameters.horizonHours*HOUR_MS;
      const daily = input.dailyRange ? parameters.quantile===0.5?input.dailyRange.median:parameters.quantile===0.8?input.dailyRange.high:input.dailyRange.p95 : input.todayBudget ?? 0;
      const forecastAt=(at:number,state:Readonly<VisibleState>):DemandForecast=>{
        const today = beijingDayFloor(at)===beijingDayFloor(input.now);
        const todayRange=input.todayRange??input.dailyRange;
        const todayDaily=todayRange?parameters.quantile===0.5?todayRange.median:parameters.quantile===0.8?todayRange.high:todayRange.p95:daily;
        const blocks=makeBlocks({...input,now:at,todayBudget:today?input.todayBudget:null},Math.min(end,at+horizonMs),index=>
          index===0&&today?input.todayBudget??todayDaily:daily);
        return {weeklyCost:blocks.reduce((s,b)=>s+b.weeklyCost,0),shortCost:blocks.every(b=>b.shortCost!=null)?blocks.reduce((s,b)=>s+(b.shortCost??0),0):null,nextKnownSupplyAt:state.weekly.resetsAt,blocks};
      };
      const results=w.paths.map(path=>simulatePolicy(input.account,input.cards,makePolicy(parameters,firstAction,input.now,w.mechanism),path,w.mechanism,forecastAt));
      return summarize(w.id,results,baselines[wi]!,w.probabilistic);
    });
    const Nspent=Math.max(...metrics.map(m=>m.spent));
    comparisons.push({id:`${firstAction}:${parameters.quantile}:${parameters.horizonHours}:${parameters.expiryLeadHours}:${parameters.useForShort}`,firstAction:firstAction==='wait'?null:firstAction,parameters,scenarios:metrics,
      Ltail:Math.max(...metrics.map(m=>m.lossTail)),Lmean:Math.max(...metrics.map(m=>m.lossMean)),Eexpire:Math.max(...metrics.map(m=>m.expired)),Nspent,
      firstCardDeadline:known.find(c=>c.localId===firstAction)?.safeDeadlineAt??undefined,
      dominated:Nspent>0&&metrics.every(m=>m.deltaLoss<=0&&m.deltaConsumedWeekly<=0)});
  }
  // 第一张卡也必须有边际用途：同参数“先等”若所有机制都不差且少花卡，剔除冗余的现在空打。
  for(const current of comparisons.filter(c=>c.firstAction!=null)){
    const wait=comparisons.find(c=>c.firstAction==null&&JSON.stringify(c.parameters)===JSON.stringify(current.parameters));
    if(wait&&current.scenarios.every((s,i)=>wait.scenarios[i]!.lossTail<=s.lossTail&&wait.scenarios[i]!.consumedWeekly>=s.consumedWeekly&&wait.scenarios[i]!.spent<=s.spent)&&current.scenarios.some((s,i)=>wait.scenarios[i]!.spent<s.spent))current.dominated=true;
  }
  return { selected:comparePolicies(comparisons,input.preference),comparisons };
}

export function planActions(input: PlanningInput): PlanningOutput {
  const seed=seedFromSnapshot(input.inputSnapshotId);
  const assumptions=['平台公告概率不是账号补给概率；机制情景没有权重。','远期自然窗口续接和用卡后短窗截止分别做机制情景。',
    '缺日内轨迹时，周需求仅作均匀时长分配情景；短窗未评估。'];
  const basic:Recommendation={status:'need_data',action:input.cards.length?'review_expiry':'none',cardId:null,nextReviewAt:input.reviews.find(t=>t>input.now)??null,
    lastSafeActionAt:null,weeklyBudgetToday:null,shortWindowEvaluated:false,reasons:['还在学习你的用量；卡截止提醒与值得用卡分开。'],assumptions,counterfactuals:[],sensitivity:'unknown'};
  if(input.dailyRange==null&&input.todayBudget==null&&input.explicitDemand==null) return {recommendation:basic,comparisons:[],horizons:[],seed,modelVersion:MODEL_VERSION,assumptions,selected:null};
  const horizons:PlanningOutput['horizons']=[];
  let result=evaluateHorizon(input,21,seed); horizons.push({days:21,firstAction:result.selected?.firstAction??null});
  let changes=false,hadReversal=false;
  for(const days of [28,35,42]) {
    const next=evaluateHorizon(input,days,seed); const first=next.selected?.firstAction??null;
    horizons.push({days,firstAction:first});
    const reversed=first!==(result.selected?.firstAction??null);
    changes=reversed;
    if(days===28&&!reversed){result=next;break;}
    hadReversal ||= reversed;
    result=next;
  }
  const selected=result.selected;
  const chosenCard=input.cards.find(c=>c.localId===selected?.firstAction);
  const positive=selected!=null&&selected.scenarios.every(s=>s.deltaLoss>0||s.deltaLoss>=0&&s.deltaConsumedWeekly>0);
  const reverses=selected?.scenarios.some(s=>s.deltaLoss<0)??false;
  const mechanismReversal=scenarioActionSensitivity(result.comparisons,input.preference);
  const uncertain=input.inventoryConflict||input.sampleDays<7||input.dailyRange==null||changes||reverses||mechanismReversal;
  const firstAction=selected?.firstAction??null;
  const budgetForToday=(daily:number)=>allocateDailyBudget(input.account,makeBlocks(input,input.account.weekly.resetsAt,index=>index===0?daily:input.dailyRange?.median??daily),input.now)?.today??null;
  const todayRange=input.todayRange??input.dailyRange;
  const low=budgetForToday(input.todayBudget!=null?input.todayBudget*0.5:todayRange?.low??0),high=budgetForToday(input.todayBudget!=null?input.todayBudget*2:todayRange?.high??0);
  const recommendation:Recommendation={...basic,status:!selected?'not_applicable':firstAction&&positive&&!uncertain?'act_now':uncertain?'conditional':'wait',
    action:firstAction?'use_card':'keep_card',cardId:firstAction,
    lastSafeActionAt:chosenCard?.safeDeadlineAt==null?null:chosenCard.safeDeadlineAt-30*60_000,
    weeklyBudgetToday:low==null||high==null?null:{low,high},shortWindowEvaluated:selected?.scenarios.every(s=>s.shortWindowEvaluated)??false,
    reasons:!selected?['没有可执行的用卡方案。']:firstAction?['该用卡方案与先等待、永远不用卡共同比较；收益以实际满足需求计算。']:['当前先不用卡；后续仍在查看时段重新决定。'],
    assumptions:[...assumptions,...(mechanismReversal?['不同机制或需求压力下首个动作反转；当前仅给条件建议，到账或需求确认后再决定。']:[]),...(hadReversal?['较短视野曾改变首个动作，已延长至42天复算。']:[]),...(input.dailyRange==null?['仅评估手填今天工作量0.5/1/2倍压力，未来需求未知，不作长期强建议。']:[])],
    counterfactuals:result.comparisons,sensitivity:changes||reverses||mechanismReversal?'changes_with_assumptions':uncertain?'unknown':'stable'};
  const alternative=comparePolicies(result.comparisons.filter(c=>c.firstAction!==firstAction),input.preference);
  return {recommendation,comparisons:result.comparisons,horizons,seed,modelVersion:MODEL_VERSION,assumptions,selected,alternative};
}
