// RR57 冲刺模式：可手算的「哪天用卡」日程。尺度来自用户：5 小时短窗用完 = 周额度 1/6 ⇒ 30 小时用完一周。
import { describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS } from '../beijing';
import type { ResetCard } from '../v3/cards';
import { sprintPlan, sprintRatePerHour, SPRINT_HOURS_PER_WEEK } from '../v3/sprintPlan';

const now = Date.parse('2026-10-14T12:00:00Z');
const card = (localId: string, safeDeadlineAt: number | null, state: ResetCard['state'] = 'available'): ResetCard => ({
  localId, label: localId, enteredExpiry: null, entryPrecision: 'datetime', timezone: 'Asia/Shanghai', exactExpiryAt: safeDeadlineAt, safeDeadlineAt,
  source: 'user', confirmedAt: now - DAY_MS, reconciliation: 'consistent', state,
});
const closeTo = (a: number, b: number, toleranceMs = 60_000) => expect(Math.abs(a - b)).toBeLessThanOrEqual(toleranceMs);

describe('sprintPlan（这周期一定用卡 → 哪天用）', () => {
  it('速率：不停地用 30 小时用完 100%；一天 12 小时则拉长一倍', () => {
    expect(SPRINT_HOURS_PER_WEEK).toBe(30);
    expect(sprintRatePerHour(24)).toBeCloseTo(100 / 30, 9);
    expect(sprintRatePerHour(12)).toBeCloseTo(100 / 60, 9);
  });
  it('A 离自然恢复还远：当前额度刚用完那一刻用卡，不浪费也不空等', () => {
    const plan = sprintPlan({ now, weekly: { remaining: 66, resetsAt: now + 5 * DAY_MS }, cards: [card('a', now + 4 * DAY_MS)], hoursPerDay: 24 });
    expect(plan.steps).toHaveLength(1);
    const step = plan.steps[0]!;
    closeTo(step.useAt, now + 19.8 * HOUR_MS);
    closeTo(plan.exhaustAt!, now + 19.8 * HOUR_MS);
    expect(step.reason).toBe('exhausted');
    expect(step.overwritePercent).toBe(0);
    closeTo(step.burnedOutAt, step.useAt + 30 * HOUR_MS);
    expect(step.latestAt).toBe(now + 4 * DAY_MS - 30 * 60_000);
  });
  it('B 快要自然恢复：先等恢复、把恢复的额度用完再用卡（提前用会浪费一次自然恢复）', () => {
    const resetsAt = now + 10 * HOUR_MS;
    const plan = sprintPlan({ now, weekly: { remaining: 20, resetsAt }, cards: [card('b', now + 3 * DAY_MS)], hoursPerDay: 24 });
    const step = plan.steps[0]!;
    expect(step.reason).toBe('after_reset');
    expect(step.waitForResetAt).toBe(resetsAt);
    closeTo(step.useAt, resetsAt + 30 * HOUR_MS);
    expect(step.overwritePercent).toBe(0);
  });
  it('C 卡先到期：只能在最晚时刻用，并报告会被覆盖掉的剩余', () => {
    const plan = sprintPlan({ now, weekly: { remaining: 90, resetsAt: now + 6 * DAY_MS }, cards: [card('c', now + 12 * HOUR_MS)], hoursPerDay: 24 });
    const step = plan.steps[0]!;
    expect(step.reason).toBe('deadline');
    expect(step.useAt).toBe(now + 11.5 * HOUR_MS);
    expect(step.overwritePercent).toBe(Math.round(90 - 100 / 30 * 11.5));
  });
  it('D 多张卡按到期顺序接力：额度见底的现在用第一张，30 小时后用第二张', () => {
    const plan = sprintPlan({ now, weekly: { remaining: 0, resetsAt: now + 3 * DAY_MS }, cards: [card('late', now + 12 * DAY_MS), card('early', now + 10 * DAY_MS)], hoursPerDay: 24 });
    expect(plan.steps.map((s) => s.cardId)).toEqual(['early', 'late']);
    expect(plan.steps[0]!.reason).toBe('now');
    expect(plan.steps[0]!.useAt).toBe(now);
    closeTo(plan.steps[1]!.useAt, now + 30 * HOUR_MS);
    expect(plan.steps[1]!.reason).toBe('exhausted');
  });
  it('E 每天只能用 12 小时：同样的 66% 要 39.6 小时才用完', () => {
    const plan = sprintPlan({ now, weekly: { remaining: 66, resetsAt: now + 6 * DAY_MS }, cards: [card('e', now + 5 * DAY_MS)], hoursPerDay: 12 });
    closeTo(plan.steps[0]!.useAt, now + 39.6 * HOUR_MS);
  });
  it('F 并列时选覆盖最少的：12 小时/天、离自然恢复不到 60 小时，现在用和用光再用净收益相同 → 用光再用（不白扔 29%）', () => {
    const plan = sprintPlan({ now, weekly: { remaining: 29, resetsAt: now + 58 * HOUR_MS }, cards: [card('f', now + 4 * DAY_MS)], hoursPerDay: 12 });
    const step = plan.steps[0]!;
    expect(step.reason).toBe('exhausted');
    closeTo(step.useAt, now + 17.4 * HOUR_MS);
    expect(step.overwritePercent).toBe(0);
  });
  it('没有额度数据或没有可排的卡：不编日程；没填到期时间的卡单独列出', () => {
    expect(sprintPlan({ now, weekly: null, cards: [card('x', now + DAY_MS)], hoursPerDay: 24 }).steps).toEqual([]);
    const plan = sprintPlan({ now, weekly: { remaining: 50, resetsAt: now + 3 * DAY_MS }, cards: [card('unknown', null), card('used', now + DAY_MS, 'used'), card('expired', now - HOUR_MS)], hoursPerDay: 24 });
    expect(plan.steps).toEqual([]);
    expect(plan.unknownDeadline.map((c) => c.localId)).toEqual(['unknown']);
    expect(plan.assumptions[0]).toContain('1/6');
  });
});
