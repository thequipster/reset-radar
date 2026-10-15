// RR56：仿真器提速（按 world 缓存时间轴、游标代替集合查找、手工复制代替 structuredClone、同首动作共享结果）不得改变任何数值。
import { describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS } from '../beijing';
import { createResetCard } from '../v3/cards';
import { simulatePolicy, NEVER_USE, makePolicy, type AccountState, type DemandBlock, type Mechanisms, type WorldPath } from '../v3/simulator';
import { planActions, type PlanningInput } from '../v3/planning';
import { goldenInputs } from './fixtures/planning-memory-input';

const mechanisms: Mechanisms = { shortAfterCard: 'keep_deadline', weeklyContinuation: 'fixed_duration', shortContinuation: 'fixed_duration' };
const card = (localId: string, expiry: string) => ({ ...createResetCard({ localId, label: '卡', enteredExpiry: expiry, entryPrecision: 'date', now: 0 }), reconciliation: 'consistent' as const });
const account = (remaining: number): AccountState => ({ observedAt: 0, weekly: { remaining, resetsAt: 3 * DAY_MS, durationMins: 7 * 24 * 60 }, short: { remaining: 100, resetsAt: 5 * HOUR_MS, durationMins: 300 }, availableCardCount: 1 });
const uniform = (cost: number, days = 8): DemandBlock[] => Array.from({ length: days }, (_, i) => ({ start: i * DAY_MS, end: (i + 1) * DAY_MS, weeklyCost: cost, shortCost: null, weight: 1 }));
const forecast = () => ({ weeklyCost: 0, shortCost: null, nextKnownSupplyAt: DAY_MS, blocks: [] });

describe('RR56 仿真器快路径与原语义一致', () => {
  it('同一 world 对象换一组卡（截止不同）后，时间轴必须重建：新卡的安全截止仍被处理', () => {
    const world: WorldPath = { start: 0, end: 8 * DAY_MS, demand: uniform(10), platform: [], reviews: [0] };
    const early = card('early', '1970-01-03');
    const late = card('late', '1970-01-06');
    const first = simulatePolicy(account(50), [late], NEVER_USE, world, mechanisms, forecast);
    const second = simulatePolicy(account(50), [early], NEVER_USE, world, mechanisms, forecast);
    expect(first.missedSafeDeadlines + first.expiredCards).toBe(1);
    expect(second.missedSafeDeadlines + second.expiredCards).toBe(1);
    expect(second.trajectory.some(t => t.at === early.safeDeadlineAt)).toBe(true);
    expect(first.trajectory.some(t => t.at === early.safeDeadlineAt)).toBe(false);
  });
  it('乱序工作段（不能用游标）与按时间排序的同一组段给出同样的消耗与损失', () => {
    const sorted = uniform(30, 6);
    const shuffled = [sorted[3]!, sorted[0]!, sorted[5]!, sorted[1]!, sorted[4]!, sorted[2]!];
    const a = simulatePolicy(account(40), [], NEVER_USE, { start: 0, end: 6 * DAY_MS, demand: sorted, platform: [], reviews: [] }, mechanisms, forecast);
    const b = simulatePolicy(account(40), [], NEVER_USE, { start: 0, end: 6 * DAY_MS, demand: shuffled, platform: [], reviews: [] }, mechanisms, forecast);
    expect(b.consumedWeekly).toBeCloseTo(a.consumedWeekly, 9);
    expect(b.loss).toBeCloseTo(a.loss, 9);
    expect(b.firstInsufficientAt).toBe(a.firstInsufficientAt);
  });
  it('同一时刻多个补给事件按原顺序处理，同 incidentId 只生效一次', () => {
    const platform = [
      { at: DAY_MS, incidentId: 'x', weekly: true, short: false, reanchorWeekly: false },
      { at: DAY_MS, incidentId: 'x', weekly: true, short: false, reanchorWeekly: false },
      { at: DAY_MS, incidentId: 'y', weekly: false, short: true, reanchorWeekly: false },
      { at: 2 * DAY_MS, incidentId: 'z', weekly: true, short: false, reanchorWeekly: true },
    ];
    const r = simulatePolicy(account(10), [], NEVER_USE, { start: 0, end: 4 * DAY_MS, demand: uniform(5, 4), platform, reviews: [] }, mechanisms, forecast);
    const atDay1 = r.trajectory.find(t => t.at === DAY_MS)!;
    expect(atDay1.weeklyGeneration).toBe(1);
    expect(atDay1.shortGeneration).toBeGreaterThanOrEqual(1);
    expect(r.terminal.lastConfirmedExternalResetAt).toBe(2 * DAY_MS);
    expect(r.terminal.weekly.resetsAt).toBe(2 * DAY_MS + 7 * DAY_MS);
  });
  it('策略拿到的可见状态是副本：策略改写它不影响仿真', () => {
    const c = card('only', '1970-01-07');
    const world: WorldPath = { start: 0, end: 4 * DAY_MS, demand: uniform(5, 4), platform: [], reviews: [0, DAY_MS] };
    const tamper = ({ state }: { state: Readonly<ReturnType<typeof simulatePolicy>['terminal']> }) => { (state as { weekly: { remaining: number } }).weekly.remaining = 0; state.cards.forEach(x => { (x as { state: string }).state = 'used'; }); return null; };
    const r = simulatePolicy(account(90), [c], tamper, world, mechanisms, forecast);
    expect(r.consumedWeekly).toBeCloseTo(20);
    expect(r.terminal.cards[0]!.state).toBe('available');
  });
  it('视野内只有起点一个查看时刻时，不同参数的同首动作方案指标逐项相同（共享结果的前提）', () => {
    const base = goldenInputs()[2]!;
    const input: PlanningInput = { ...base, reviews: [base.now] };
    const out = planActions(input);
    const groups = new Map<string, typeof out.comparisons>();
    for (const c of out.comparisons) { const key = c.firstAction ?? 'wait'; groups.set(key, [...(groups.get(key) ?? []), c]); }
    expect(groups.size).toBe(2);
    for (const list of groups.values()) {
      expect(list.length).toBeGreaterThan(1);
      for (const c of list.slice(1)) expect(c.scenarios).toEqual(list[0]!.scenarios);
    }
    // 参数在起点之后才起作用：加入后续查看时刻后，同首动作的方案允许出现差异（说明共享只在无后续查看时发生）。
    const withReviews = planActions({ ...input, reviews: [base.now, base.now + DAY_MS, base.now + 2 * DAY_MS] });
    expect(withReviews.comparisons.length).toBe(out.comparisons.length);
  });
  it('makePolicy 在起点之后按预测缺口决定用卡：复用同一预测段数组与每次新建段，动作与损失完全一致', () => {
    const c = card('only', '1970-01-09');
    const params = { quantile: 0.5 as const, horizonHours: 24 as const, expiryLeadHours: 0 as const, useForShort: false };
    const policy = makePolicy(params, 'wait', 0, mechanisms);
    const blocks = uniform(60, 8);
    const sharedBlocks: DemandBlock[] = blocks.map(b => ({ ...b }));
    const world: WorldPath = { start: 0, end: 8 * DAY_MS, demand: blocks, platform: [], reviews: [0, DAY_MS, 2 * DAY_MS, 3 * DAY_MS + HOUR_MS] };
    const cost = (list: readonly DemandBlock[], at: number) => list.filter(b => b.end > at && b.start < at + DAY_MS).reduce((s, b) => s + b.weeklyCost, 0);
    const forecastShared = (at: number, state: { weekly: { resetsAt: number } }) => ({ weeklyCost: cost(sharedBlocks, at), shortCost: null, nextKnownSupplyAt: state.weekly.resetsAt, blocks: sharedBlocks });
    const forecastFresh = (at: number, state: { weekly: { resetsAt: number } }) => ({ weeklyCost: cost(blocks, at), shortCost: null, nextKnownSupplyAt: state.weekly.resetsAt, blocks: blocks.map(b => ({ ...b })) });
    const shared = simulatePolicy(account(50), [c], policy, world, mechanisms, forecastShared);
    const fresh = simulatePolicy(account(50), [c], policy, world, mechanisms, forecastFresh);
    const again = simulatePolicy(account(50), [c], policy, world, mechanisms, forecastShared);
    expect(shared.actions).toEqual(fresh.actions);
    expect(again.actions).toEqual(shared.actions);
    expect(shared.loss).toBe(fresh.loss);
    expect(shared.consumedWeekly).toBe(fresh.consumedWeekly);
    expect(shared.trajectory).toEqual(fresh.trajectory);
    expect(sharedBlocks).toEqual(blocks);
    // 起点余额 50、每天 60 点需求：方案在后续查看时刻确实评估过缺口（不是空转）。
    expect(fresh.loss).toBeGreaterThan(0);
  });
});
