import { describe, expect, it } from 'vitest';
import { allocateColdBudget, coldStartAdvice, POLICY_DAILY_COST } from '../v3/coldStart';
import type { AccountState } from '../v3/simulator';
import type { ResetCard } from '../v3/cards';

const H = 3_600_000, D = 24 * H;
const now = Date.parse('2026-10-12T04:00:00Z'); // 北京中午
const account = (weekly = 40, weeklyAt = now + 96 * H, short = 100, shortAt = now + D): AccountState => ({ observedAt: now,
  weekly: { remaining: weekly, resetsAt: weeklyAt, durationMins: 7 * 24 * 60 },
  short: { remaining: short, resetsAt: shortAt, durationMins: 5 * 60 }, availableCardCount: 0 });
const card = (id: string, deadline: number): ResetCard => ({ localId: id, label: id, enteredExpiry: null,
  entryPrecision: 'datetime', timezone: 'Asia/Shanghai', exactExpiryAt: deadline, safeDeadlineAt: deadline,
  source: 'user', confirmedAt: now - D, reconciliation: 'consistent', state: 'available' });

describe('v3.1 cold start planner', () => {
  it('allocates by remaining wall-clock hours and does not call it predicted use', () => {
    const result = allocateColdBudget(account(), now, now + 12 * H);
    expect(result?.today).toBeCloseTo(5, 10);
    expect(result?.untilReview).toBeCloseTo(5, 10);
    expect(result?.total).toBe(40);
    expect(POLICY_DAILY_COST).toEqual({ light: 50 / 7, normal: 100 / 7, busy: 200 / 7 });
  });
  it('returns an actionable non-learning plan with a budget and default review when history is absent', () => {
    const result = coldStartAdvice({ now, account: account(), cards: [], valid: true, selectedTier: 'normal', reviews: [] });
    expect(result.action).toBe('hold_card');
    expect(result.allocatedWeeklyPointsToday).toBeCloseTo(5, 10);
    expect(result.nextReviewAt).toBe(now + 12 * H);
    expect(result.expectedConsumption).toBeNull();
    expect(result.basis).toBe('policy_default');
    expect(result.assumptions.join(' ')).toContain('不保证届时查看');
  });
  it('waits for the latest exhausted window when no card exists', () => {
    const weeklyAt = now + 3 * D, shortAt = now + D;
    const result = coldStartAdvice({ now, account: account(0, weeklyAt, 0, shortAt), cards: [], valid: true, continueWorking: true, selectedTier: 'normal', reviews: [] });
    expect(result.action).toBe('wait_for_reset');
    expect(result.nextReviewAt).toBe(weeklyAt);
    expect(result.trigger).toContain('短窗恢复');
    expect(result.allocatedWeeklyPointsToday).toBe(0);
  });
  it('does not burn several expiring cards while full and idle', () => {
    const cards = [card('later', now + 20 * H), card('sooner', now + 18 * H)];
    const result = coldStartAdvice({ now, account: account(100, now + D, 100, now + D), cards, valid: true, selectedTier: 'normal', reviews: [] });
    expect(result.action).toBe('hold_card');
    expect(result.cardId).toBeNull();
    expect(result.headline).toContain('不为避免过期而空用卡');
  });
  it('refreshes when the snapshot is invalid or a reset deadline has passed', () => {
    expect(coldStartAdvice({ now, account: account(10, now - 1), cards: [], valid: true, selectedTier: 'normal', reviews: [] }).action).toBe('refresh');
    expect(coldStartAdvice({ now, account: account(), cards: [], valid: false, selectedTier: 'normal', reviews: [] }).action).toBe('refresh');
  });
  it('uses the earliest confirmed card only when work continues and a window is exhausted', () => {
    const cards = [card('later', now + 3 * D), card('first', now + 2 * D)];
    const result = coldStartAdvice({ now, account: account(0, now + 4 * D), cards, valid: true, continueWorking: true, selectedTier: 'busy', reviews: [] });
    expect(result.action).toBe('use_card');
    expect(result.cardId).toBe('first');
  });
  it('enters the final safe-use comparison before the buffer cutoff when the next review crosses it', () => {
    const deadline = now + 13 * H;
    const result = coldStartAdvice({ now, account: account(), cards: [card('soon', deadline)], valid: true, selectedTier: 'normal',
      reviews: [now + 14 * H], comparison: { selectedUse: false, beneficial: false, otherWorse: false, reversal: false, trigger: 'final-opportunity' } });
    expect(result.trigger).toBe('final-opportunity');
    expect(result.headline).toContain('先不用卡');
  });
  it('acts on the selected tier when use is beneficial and annotates a reversal', () => {
    const result = coldStartAdvice({ now, account: account(), cards: [card('soon', now + D)], valid: true, selectedTier: 'busy', reviews: [],
      comparison: { selectedUse: true, beneficial: true, otherWorse: false, reversal: true } });
    expect(result.action).toBe('use_card');
    expect(result.cardId).toBe('soon');
    expect(result.headline).toContain('较忙档');
    expect(result.assumptions.join(' ')).toContain('其他需求情景会翻转');
  });
  it('keeps the card while full and idle even when the supplied comparison recommends use', () => {
    const result = coldStartAdvice({ now, account: account(100, now + D, 100, now + D), cards: [card('soon', now + H)], valid: true,
      selectedTier: 'normal', reviews: [], comparison: { selectedUse: true, beneficial: true, otherWorse: true, reversal: false } });
    expect(result.action).toBe('hold_card');
    expect(result.cardId).toBeNull();
    expect(result.headline).toContain('不为避免过期而空用卡');
    expect(result.allocatedWeeklyPointsToday).not.toBeNull();
  });
});
