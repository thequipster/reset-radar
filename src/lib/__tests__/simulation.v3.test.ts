import { describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS } from '../beijing';
import { createResetCard } from '../v3/cards';
import { simulatePolicy, NEVER_USE, applyCardUse, makePolicy, enumeratePolicyParameters, type AccountState, type DemandBlock, type Mechanisms, type WorldPath } from '../v3/simulator';
import { allocateDailyBudget, seedFromSnapshot } from '../v3/planning';
const mechanisms:Mechanisms={shortAfterCard:'keep_deadline',weeklyContinuation:'fixed_duration',shortContinuation:'fixed_duration'};
const card={...createResetCard({localId:'first',label:'卡',enteredExpiry:'2026-12-31',entryPrecision:'date',now:0}),reconciliation:'consistent' as const};
const account=(remaining:number):AccountState=>({observedAt:0,weekly:{remaining,resetsAt:DAY_MS,durationMins:7*24*60},short:{remaining:100,resetsAt:100*DAY_MS,durationMins:300},availableCardCount:1});
const uniform=(cost:number):DemandBlock[]=>Array.from({length:8},(_,i)=>({start:i*DAY_MS,end:(i+1)*DAY_MS,weeklyCost:cost,shortCost:null,weight:1}));
const world=(demand:DemandBlock[]):WorldPath=>({start:0,end:8*DAY_MS,demand,platform:[],reviews:[0]});
const forecast=()=>({weeklyCost:0,shortCost:null,nextKnownSupplyAt:DAY_MS,blocks:[]});
const nowUse=()=>card.localId;
describe('v3同一双窗模拟器的可手算反例',()=>{
  it('E28 回满80不等于增量收益，已有20时两路径都服务80',()=>{
    const w=world(uniform(10));const base=simulatePolicy(account(20),[card],NEVER_USE,w,mechanisms,forecast);const use=simulatePolicy(account(20),[card],nowUse,w,mechanisms,forecast);
    expect(base.consumedWeekly).toBeCloseTo(80);expect(use.consumedWeekly).toBeCloseTo(80);expect(use.consumedWeekly-base.consumedWeekly).toBeCloseTo(0);
  });
  it('E29 缺额时实际增量10，非回满100',()=>{
    const w=world(uniform(10));const base=simulatePolicy(account(0),[card],NEVER_USE,w,mechanisms,forecast);const use=simulatePolicy(account(0),[card],nowUse,w,mechanisms,forecast);
    expect(base.consumedWeekly).toBeCloseTo(70);expect(use.consumedWeekly).toBeCloseTo(80);
  });
  it('E30 提前用卡取消明日自然补给，160变100，不能藏掉损失',()=>{
    const demand=uniform(0);demand[0]!.weeklyCost=60;demand[1]!.weeklyCost=100;
    const base=simulatePolicy(account(60),[card],NEVER_USE,world(demand),mechanisms,forecast);const use=simulatePolicy(account(60),[card],nowUse,world(demand),mechanisms,forecast);
    expect(base.consumedWeekly).toBeCloseTo(160);expect(use.consumedWeekly).toBeCloseTo(100);expect(use.loss).toBeGreaterThan(base.loss);
    expect(use.trajectory.find(t=>t.at===DAY_MS)!.weeklyGeneration).toBe(1);
  });
  it('D21 状态转换回满双窗、周+168h且标记指定卡已用',()=>{
    const initial={...account(5),cards:[card],weeklyGeneration:3,shortGeneration:4};
    const used=applyCardUse(initial,'first',0,mechanisms)!;
    expect(used.weekly.remaining).toBe(100);expect(used.short.remaining).toBe(100);expect(used.weekly.resetsAt).toBe(7*DAY_MS);expect(used.cards[0]!.state).toBe('used');
    expect(applyCardUse(used,'first',0,mechanisms)).toBeNull();
  });
  it('D22 周窗充足但短窗耗尽，用卡能实际满足已知配对工作',()=>{
    const demand=[{start:0,end:HOUR_MS,weeklyCost:5,shortCost:50,weight:1}];const w={...world(demand),end:HOUR_MS};const a=account(100);a.short.remaining=0;
    const base=simulatePolicy(a,[card],NEVER_USE,w,mechanisms,forecast);const use=simulatePolicy(a,[card],nowUse,w,mechanisms,forecast);
    expect(base.loss).toBe(1);expect(use.loss).toBe(0);expect(use.shortWindowEvaluated).toBe(true);
  });
  it('B9 同incident重播只提供一次额度',()=>{
    const demand=uniform(60);const a=account(0);a.weekly.resetsAt=100*DAY_MS;
    const w={...world(demand),end:3*DAY_MS,platform:[{at:0,incidentId:'incident',weekly:true,short:false,reanchorWeekly:false},{at:DAY_MS,incidentId:'incident',weekly:true,short:false,reanchorWeekly:false}]};
    const result=simulatePolicy(a,[],NEVER_USE,w,mechanisms,forecast);expect(result.consumedWeekly).toBeCloseTo(100);expect(result.terminal.weeklyGeneration).toBe(1);
  });
  it('D24 满额无需求不为少过期而空打卡，D26只在查看时刻行动',()=>{
    const parameters={quantile:0.5 as const,horizonHours:24 as const,expiryLeadHours:48 as const,useForShort:false};
    const noDemand=simulatePolicy(account(100),[card],makePolicy(parameters,'wait',0),world(uniform(0)),mechanisms,forecast);expect(noDemand.cardsSpent).toBe(0);
    const w={...world(uniform(100)),reviews:[0,2*DAY_MS]};const possible=simulatePolicy(account(0),[card],()=>card.localId,w,mechanisms,forecast);expect(possible.actions.every(a=>w.reviews.includes(a.at))).toBe(true);
  });
  it('F34短窗未知必须未评估，F36策略无未来数组',()=>{
    let keys:string[]=[];const policy=(ctx:Parameters<typeof NEVER_USE>[0])=>{keys=Object.keys(ctx);expect('world' in ctx).toBe(false);expect('futureDemand' in ctx.state).toBe(false);return null;};
    const result=simulatePolicy(account(100),[],policy,world(uniform(1)),mechanisms,forecast);expect(keys.sort()).toEqual(['forecast','now','state']);expect(result.shortWindowEvaluated).toBe(false);
  });
  it('同输入seed可重现，最多54参数，短未知只27种',()=>{expect(seedFromSnapshot('a')).toBe(seedFromSnapshot('a'));expect(enumeratePolicyParameters(true)).toHaveLength(54);expect(enumeratePolicyParameters(false)).toHaveLength(27);});
  it('9.7 按需求比例预算，截止段精确裁切，需求0预算0',()=>{
    const a=account(30);a.weekly.resetsAt=2.5*DAY_MS;
    const result=allocateDailyBudget(a,[...uniform(10).slice(0,3),{start:3*DAY_MS,end:4*DAY_MS,weeklyCost:0,shortCost:null,weight:1}],0)!;
    expect(result.allocations.map(b=>b.demand)).toEqual([10,10,5]);expect(result.allocations.reduce((s,b)=>s+b.budget,0)).toBeCloseTo(25);expect(result.today).toBeCloseTo(10*16/24);
    a.weekly.remaining=10;const scarce=allocateDailyBudget(a,uniform(10),0)!;expect(scarce.allocations.reduce((s,b)=>s+b.budget,0)).toBeCloseTo(10);expect(scarce.today).toBeCloseTo(4*16/24);
  });
});
