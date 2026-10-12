import { describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS } from '../beijing';
import { simulatePolicy, NEVER_USE, type AccountState, type DemandBlock, type Mechanisms, type WorldPath } from '../v3/simulator';
import type { ResetCard } from '../v3/cards';
import { allocateDailyBudget, comparePolicies, planActions, scenarioActionSensitivity, type ScenarioMetric, type PlanningInput, type PolicyComparison } from '../v3/planning';

const fixed: Mechanisms = { shortAfterCard: 'keep_deadline', weeklyContinuation: 'fixed_duration', shortContinuation: 'fixed_duration' };
const account = (patch: Partial<AccountState> = {}): AccountState => ({ observedAt: 0,
  weekly: { remaining: 40, resetsAt: 2 * DAY_MS, durationMins: 7 * 24 * 60 },
  short: { remaining: 100, resetsAt: DAY_MS, durationMins: 300 }, availableCardCount: 1, ...patch });
const usableCard = (deadline: number): ResetCard => ({ localId: 'c1', label: 'card', enteredExpiry: null,
  entryPrecision: 'datetime', timezone: 'Asia/Shanghai', exactExpiryAt: deadline, safeDeadlineAt: deadline,
  source: 'user', confirmedAt: -DAY_MS, reconciliation: 'consistent', state: 'available' });
const forecast = () => ({ weeklyCost: 0, shortCost: null, nextKnownSupplyAt: DAY_MS, blocks: [] });
const block = (start: number, end: number, weeklyCost: number, shortCost: number | null = null): DemandBlock =>
  ({ start, end, weeklyCost, shortCost, weight: 1 });
const world = (demand: DemandBlock[], end: number, reviews: number[] = [0]): WorldPath =>
  ({ start: 0, end, demand, platform: [], reviews });

describe('v3 planning/simulator behavioral acceptance', () => {
  it('uniform work first becomes insufficient when the remaining resource actually runs out',()=>{
    const result=simulatePolicy(account({weekly:{remaining:20,resetsAt:DAY_MS,durationMins:10080}}),[],NEVER_USE,
      world([block(0,10*HOUR_MS,40)],10*HOUR_MS),fixed,forecast);
    expect(result.firstInsufficientAt).toBe(5*HOUR_MS);
  });
  it('surface scenario action reversals even when a robust aggregate still selects one action',()=>{
    const metric=(id:string,loss:number,spent:number):ScenarioMetric=>({id,lossMean:loss,lossTail:loss,spent,expired:0,missedSafeDeadline:0,consumedWeekly:0,deltaLoss:0,deltaConsumedWeekly:0,deltaCardsExpired:0,firstActionAt:spent?0:null,shortWindowEvaluated:false,shortageFraction:Number(loss>0),estimateError:0});
    const candidate=(firstAction:string|null,losses:number[]):PolicyComparison=>({id:firstAction??'wait',firstAction,parameters:{quantile:.5,horizonHours:24,expiryLeadHours:0,useForShort:false},dominated:false,Ltail:Math.max(...losses),Lmean:Math.max(...losses),Eexpire:0,Nspent:firstAction?1:0,
      scenarios:losses.map((loss,i)=>metric(`mechanism-${i}`,loss,firstAction?1:0))});
    const candidates=[candidate(null,[0,2]),candidate('c1',[1,0])];
    expect(comparePolicies(candidates,'service')!.firstAction).toBe('c1');
    expect(scenarioActionSensitivity(candidates,'service')).toBe(true);
    expect(scenarioActionSensitivity([candidate(null,[0,0]),candidate('c1',[1,1])],'service')).toBe(false);
  });
  const planningInput = (patch: Partial<PlanningInput> = {}): PlanningInput => ({now: 0, account: account(), cards: [], reviews: [0],
    preference: 'service', dailyRange: {low: 5, median: 10, high: 20, p95: 30}, sampleDays: 3,
    supplyScenarios: [], inputSnapshotId: 'demand-regression', workload: 'unknown', ...patch});
  it('未知工作量的初步范围分别评估低中高，不能只使用中值', () => {
    const result = planActions(planningInput());
    const metrics = result.selected!.scenarios.filter(s => s.id.includes('mechanism-0'));
    expect(metrics).toHaveLength(3);
    expect(new Set(metrics.map(s => s.consumedWeekly)).size).toBe(3);
    expect(metrics.map(s => s.id)).toEqual(expect.arrayContaining([
      expect.stringContaining('demand-low'), expect.stringContaining('demand-median'), expect.stringContaining('demand-high')]));
  });
  it('已有经验分布也保留手填0.5/1/2压力分组，不能混入同一概率样本', () => {
    const result = planActions(planningInput({sampleDays: 7, dailySamples: [5, 6, 7, 8, 9, 10, 11], todayBudget: 30}));
    const metrics = result.selected!.scenarios.filter(s => s.id.includes('mechanism-0'));
    expect(metrics).toHaveLength(3);
    expect(metrics.map(s => s.id)).toEqual(expect.arrayContaining([
      expect.stringContaining('pressure-0'), expect.stringContaining('pressure-1'), expect.stringContaining('pressure-2')]));
    expect(new Set(metrics.map(s => s.consumedWeekly)).size).toBe(3);
  });
  it('D23 does not keep an expiring candidate alive across a natural deadline', () => {
    const expiry = DAY_MS;
    const w = world([block(0, DAY_MS, 20), block(DAY_MS, 2 * DAY_MS, 80)], 2 * DAY_MS, [0, expiry]);
    const naturalResetAccount = account({ weekly: { remaining: 40, resetsAt: expiry, durationMins: 7 * 24 * 60 } });
    const expiringCard = { ...usableCard(expiry), exactExpiryAt: null };
    const result = simulatePolicy(naturalResetAccount, [expiringCard], ({ now }) => now === expiry ? 'c1' : null, w, fixed, forecast);
    expect(result.missedSafeDeadlines).toBe(1);
    expect(result.actions).toEqual([]);
    expect(result.terminal.cards[0]?.state).toBe('unresolved');
    expect(result.trajectory.find(x => x.at === expiry)?.weekly).toBe(100); // natural supply happens before review
  });

  it('D25 evaluates candidate policies against the same world path and supply timing', () => {
    const w: WorldPath = { ...world([block(0, DAY_MS, 80), block(DAY_MS, 2 * DAY_MS, 40)], 2 * DAY_MS, [0, DAY_MS]),
      platform: [{ at: DAY_MS, incidentId: 'shared-event', weekly: true, short: false, reanchorWeekly: false }] };
    const never = simulatePolicy(account(), [usableCard(3 * DAY_MS)], () => null, w, fixed, forecast);
    const waitThenUse = simulatePolicy(account(), [usableCard(3 * DAY_MS)], ({ now }) => now === DAY_MS ? 'c1' : null, w, fixed, forecast);
    expect(never.trajectory.find(x => x.at === DAY_MS)?.weeklyGeneration).toBe(1);
    expect(waitThenUse.actions).toEqual([{ at: DAY_MS, cardId: 'c1' }]);
    // Both see the exact same observed event timestamp; only their own action changes the state.
    expect(w.platform.map(event => event.at)).toEqual([DAY_MS]);
  });

  it('F36 policy receives a detached visible state, never the future world or demand path', () => {
    const w = world([block(0, DAY_MS, 60), block(DAY_MS, 2 * DAY_MS, 60)], 2 * DAY_MS);
    const result = simulatePolicy(account(), [], (context) => {
      expect(Object.keys(context).sort()).toEqual(['forecast', 'now', 'state']);
      expect('demand' in context.state).toBe(false);
      (context.state.weekly as { remaining: number }).remaining = 100;
      return null;
    }, w, fixed, forecast);
    expect(result.consumedWeekly).toBeCloseTo(40);
    expect(result.loss).toBeCloseTo(4 / 3);
  });

  it('retaining a card can lose against the shared work path, and action improves served demand', () => {
    const w = world([block(0, HOUR_MS, 70)], HOUR_MS);
    const keep = simulatePolicy(account({ weekly: { remaining: 0, resetsAt: 7 * DAY_MS, durationMins: 7 * 24 * 60 } }),
      [usableCard(2 * DAY_MS)], () => null, w, fixed, forecast);
    const use = simulatePolicy(account({ weekly: { remaining: 0, resetsAt: 7 * DAY_MS, durationMins: 7 * 24 * 60 } }),
      [usableCard(2 * DAY_MS)], () => 'c1', w, fixed, forecast);
    expect(keep.loss).toBe(1);
    expect(use.loss).toBe(0);
    expect(use.cardsSpent).toBe(1);
  });

  it('mechanism reversal is surfaced as sensitivity instead of averaging assumptions', () => {
    const initial = account({ weekly: { remaining: 20, resetsAt: 7 * DAY_MS, durationMins: 7 * 24 * 60 },
      short: { remaining: 0, resetsAt: DAY_MS, durationMins: 300 } });
    const card = usableCard(2 * DAY_MS);
    const w = world([block(0, HOUR_MS, 5, 60), block(6 * HOUR_MS, 7 * HOUR_MS, 5, 80)], 7 * HOUR_MS);
    const keepDeadline = simulatePolicy(initial, [card], () => 'c1', w, fixed, forecast);
    const restartShort = simulatePolicy(initial, [card], () => 'c1', w, { ...fixed, shortAfterCard: 'restart_duration' }, forecast);
    expect(restartShort.loss).toBeLessThan(keepDeadline.loss);
    expect(keepDeadline.shortWindowEvaluated).toBe(true);
  });

  it('today budget at epoch zero covers Beijing 08:00 to midnight, not a full UTC day', () => {
    const result = allocateDailyBudget(account({ weekly: { remaining: 30, resetsAt: 3 * DAY_MS, durationMins: 7 * 24 * 60 } }),
      [block(0, DAY_MS, 10), block(DAY_MS, 2 * DAY_MS, 10)], 0)!;
    expect(result.today).toBeCloseTo(10 * (16 / 24));
  });

  it('comparison keeps action tradeoffs explicit and deterministic', () => {
    const comparison = (id: string, dominated: boolean, loss: number, spent: number): PolicyComparison => ({
      id, firstAction: null, parameters: { quantile: 0.5, horizonHours: 24, expiryLeadHours: 0, useForShort: false },
      scenarios: [], Ltail: loss, Lmean: loss, Eexpire: 0, Nspent: spent, dominated,
    });
    expect(comparePolicies([comparison('dominated', true, 0, 0), comparison('keep', false, 3, 0),
      comparison('use', false, 1, 1)], 'service')?.id).toBe('use');
  });
});
