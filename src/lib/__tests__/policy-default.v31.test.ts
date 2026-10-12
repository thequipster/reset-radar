import {describe,it,expect} from 'vitest';
import {planActions,comparePolicies,scopeDefaultComparisons,type PolicyComparison,type ScenarioMetric} from '../v3/planning';
import {createResetCard} from '../v3/cards';
import {DAY_MS,HOUR_MS} from '../beijing';
import {coldStartAdvice} from '../v3/coldStart';
import type {PlanningInput} from '../v3/planning';
const now=Date.parse('2026-10-12T12:00:00+08:00');
const input=(patch:Partial<PlanningInput>={}):PlanningInput=>({now,account:{observedAt:now,weekly:{remaining:30,resetsAt:now+4*DAY_MS,durationMins:10080},short:{remaining:100,resetsAt:now+HOUR_MS,durationMins:300},availableCardCount:1},
 cards:[{...createResetCard({localId:'early',label:'early',entryPrecision:'datetime',enteredExpiry:'2026-10-15T06:00',now}),reconciliation:'consistent',confirmedAt:now}],reviews:[now,now+DAY_MS],preference:'service',dailyRange:null,sampleDays:0,supplyScenarios:[],inputSnapshotId:'default-example',...patch});
describe('v3.1 默认策略接既有共同视野',()=>{
 it('无需求也计算均衡以及轻/忙对照与集中压力，不制造概率',()=>{
  const i=input();i.account.weekly.remaining=15;const result=planActions(i);expect(result.recommendation.weeklyBudgetToday).toEqual({low:1.875,high:1.875});
  expect(result.defaultScenarios).toHaveLength(3);expect(result.comparisons[0].scenarios.some(s=>s.id.includes('concentrated'))).toBe(true);
  const light=result.defaultScenarios!.find(s=>s.tier==='light')!,busy=result.defaultScenarios!.find(s=>s.tier==='busy')!;
  expect(light.tier).toBe('light');expect(busy.tier).toBe('busy');expect(busy.lossTail).toBeGreaterThanOrEqual(light.lossTail);
 });
 it('工作量翻转时按选定档选动作，不以三档平均掩盖不同决定',()=>{
  const metric=(id:string,loss:number):ScenarioMetric=>({id,lossTail:loss,lossMean:loss,spent:0,expired:0,missedSafeDeadline:0,consumedWeekly:0,deltaLoss:0,deltaConsumedWeekly:0,deltaCardsExpired:0,firstActionAt:null,shortWindowEvaluated:false,shortageFraction:0,estimateError:0});
  const candidate=(firstAction:string|null,loss:number[]):PolicyComparison=>({id:firstAction??'wait',firstAction,parameters:{quantile:.5,horizonHours:24,expiryLeadHours:0,useForShort:false},dominated:false,Ltail:2,Lmean:2,Eexpire:0,Nspent:firstAction?1:0,scenarios:[metric('default-light:uniform',loss[0]),metric('default-busy:uniform',loss[1])]});
  const comparisons=[candidate(null,[0,2]),candidate('early',[1,0])];expect(comparePolicies(scopeDefaultComparisons(comparisons,'light'),'service')?.firstAction).toBeNull();expect(comparePolicies(scopeDefaultComparisons(comparisons,'busy'),'service')?.firstAction).toBe('early');
 });
 it('即将自然恢复且用卡推迟补给，临期不能成为空打理由',()=>{
  const i=input();i.account.weekly={...i.account.weekly,remaining:100,resetsAt:now+HOUR_MS};
  const advice=coldStartAdvice({now,account:i.account,cards:[...i.cards],valid:true,selectedTier:'normal',reviews:[...i.reviews],comparison:{selectedUse:true,beneficial:false,otherWorse:true,reversal:true}});expect(advice.action).toBe('hold_card');
 });
});
