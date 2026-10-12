import { DAY_MS, HOUR_MS } from '../beijing';
import type { ResetCard } from './cards';
import type { AccountState } from './simulator';

export const POLICY_DAILY_COST = { light: 50 / 7, normal: 100 / 7, busy: 200 / 7 } as const;
const CARD_BUFFER_MS = 30 * 60_000;

export function allocateColdBudget(account: AccountState, now: number, nextReviewAt: number | null, todayWeight: 0.5 | 1 | 2 = 1): { today: number; untilReview: number; total: number } | null {
  const remaining = account.weekly.remaining, cutoff = account.weekly.resetsAt;
  if (![remaining, cutoff, now].every(Number.isFinite) || remaining < 0 || cutoff <= now) return null;
  const totalHours = (cutoff - now) / HOUR_MS;
  const todayEnd = Math.min(cutoff, beijingMidnightAfter(now));
  const todayHours = Math.max(0, (todayEnd - now) / HOUR_MS);
  const reviewHours = Math.max(0, Math.min(cutoff, nextReviewAt != null && nextReviewAt > now ? nextReviewAt : now + 12 * HOUR_MS) - now) / HOUR_MS;
  const weightedHours = totalHours + (todayWeight - 1) * todayHours;
  const total = clamp(remaining, 0, remaining);
  const weightedReviewHours = Math.min(reviewHours, todayHours) * todayWeight + Math.max(0, Math.min(reviewHours, totalHours) - todayHours);
  return { today: total * todayHours * todayWeight / weightedHours, untilReview: total * weightedReviewHours / weightedHours, total };
}

function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function beijingMidnightAfter(now: number): number {
  const day = Math.floor((now + 8 * HOUR_MS) / DAY_MS) * DAY_MS;
  return day - 8 * HOUR_MS + DAY_MS;
}
function firstFutureReview(now: number, reviews: readonly number[]): number | null {
  return [...reviews].filter(t => Number.isFinite(t) && t > now).sort((a, b) => a - b)[0] ?? null;
}

export type ColdStartAdvice = {
  action: 'use_card' | 'hold_card' | 'wait_for_reset' | 'refresh' | 'reconcile_card';
  headline: string;
  allocatedWeeklyPointsToday: number | null;
  nextReviewAt: number | null;
  trigger: string | null;
  basis: 'policy_default' | 'user_plan' | 'learned';
  expectedConsumption: number | null;
  assumptions: string[];
  cardId: string | null;
};

export function coldStartAdvice(input: {
  now: number; account: AccountState | null; cards: ResetCard[]; inventoryConflict?: boolean; valid: boolean;
  continueWorking?: boolean; selectedTier: 'light' | 'normal' | 'busy'; reviews: number[]; todayWeight?: 0.5 | 1 | 2;
  comparison?: { selectedUse: boolean; beneficial: boolean; otherWorse: boolean; reversal: boolean; trigger?: string };
  expectedConsumption?: number | null; basis?: 'policy_default' | 'user_plan' | 'learned';
}): ColdStartAdvice {
  const { now, account } = input;
  const basis = input.basis ?? 'policy_default';
  const assumedReview = now + 12 * HOUR_MS;
  const confirmedReview = firstFutureReview(now, input.reviews);
  const nextReview = confirmedReview ?? assumedReview;
  const known = input.cards.filter(c => c.state === 'available' && c.reconciliation === 'consistent' && c.confirmedAt != null && c.safeDeadlineAt != null && now < c.safeDeadlineAt - CARD_BUFFER_MS)
    .sort((a, b) => a.safeDeadlineAt! - b.safeDeadlineAt! || a.localId.localeCompare(b.localId));
  const card = known[0] ?? null;
  const advice = (action: ColdStartAdvice['action'], headline: string, cardId: string | null = null, reviewAt: number | null = nextReview, trigger: string | null = null, allocated: number | null = null, extraAssumptions: string[] = []): ColdStartAdvice => ({
    action, headline, allocatedWeeklyPointsToday: allocated, nextReviewAt: reviewAt, trigger, basis,
    expectedConsumption: input.expectedConsumption ?? null,
    assumptions: [basis === 'policy_default' ? '预算与工作量档位来自公开默认策略，不代表个人历史预测。' : '预算与工作量以所选输入为依据。',
      ...(confirmedReview == null ? ['默认12小时仅为可修改的提醒时间，不保证届时查看。'] : []), ...extraAssumptions], cardId,
  });
  if (!input.valid || !account || account.weekly.resetsAt <= now || account.short.resetsAt <= now) return advice('refresh', '先刷新额度', null, assumedReview, '账号快照无效或自然重置时刻已过。');
  const allocation = allocateColdBudget(account, now, nextReview, input.todayWeight ?? 1);
  const withBudget = allocation?.today ?? 0;
  if (input.inventoryConflict || input.cards.some(c => c.reconciliation === 'conflict' || c.state === 'unresolved')) {
    const blockedAt = Math.max(...[account.weekly.remaining <= 0 ? account.weekly.resetsAt : -Infinity, account.short.remaining <= 0 ? account.short.resetsAt : -Infinity].filter(Number.isFinite));
    return advice('reconcile_card', '先核对这张卡是否还在；同时按自然恢复时间等待。', null, Number.isFinite(blockedAt) ? blockedAt : nextReview, '卡片库存或有效期存在冲突。', withBudget);
  }
  const exhausted = [account.weekly.remaining <= 0 ? account.weekly.resetsAt : null, account.short.remaining <= 0 ? account.short.resetsAt : null].filter((t): t is number => t != null);
  if (exhausted.length) {
    const restoreAt = Math.max(...exhausted);
    if (input.continueWorking && card) return advice('use_card', `额度已耗尽；继续工作时使用最早截止卡「${card.label}」。`, card.localId, restoreAt, `使用后周窗预计从当前时刻顺延 7 天。`, withBudget);
    if (input.continueWorking) return advice('wait_for_reset', '没有可确认有效的卡；等所有受限窗口自然恢复后再继续。', null, restoreAt, '短窗恢复不能解除仍耗尽的周窗。', withBudget);
    return advice(card ? 'hold_card' : 'wait_for_reset', card ? `先留卡；开始工作前用「${card.label}」。` : '先留卡；等所有受限窗口自然恢复后再继续。', null, restoreAt, '尚未表示要继续工作。', withBudget);
  }
  const deadline = card?.safeDeadlineAt ?? null;
  const lastOpportunityAt = deadline == null ? null : deadline - CARD_BUFFER_MS;
  const lastChance = lastOpportunityAt != null && now < lastOpportunityAt && nextReview >= lastOpportunityAt;
  if (account.weekly.remaining >= 100 && account.short.remaining >= 100 && !input.continueWorking)
    return advice('hold_card', '额度充足且近期没有工作需要；不为避免过期而空用卡。', null, Math.min(nextReview, lastOpportunityAt ?? Infinity, account.weekly.resetsAt, account.short.resetsAt), '满额闲置时保留额度。', withBudget);
  if (card && input.comparison && (lastChance || input.comparison.selectedUse)) {
    if (input.comparison.selectedUse && input.comparison.beneficial) return advice('use_card', `按${tierName(input.selectedTier)}档，现在使用最早截止卡「${card.label}」。`, card.localId, nextReview, input.comparison.trigger ?? '所选档比较支持现在使用。', withBudget,
      [input.comparison.reversal ? '其他需求情景会翻转结论；当前动作仍按所选档给出。' : '', input.comparison.otherWorse ? '其他情景不足更严重，已按所选档说明动作。' : ''].filter(Boolean));
    if (input.comparison.reversal) return advice('hold_card', `按所选${tierName(input.selectedTier)}档先留卡；若工作量变化，切换对应档后再判断。`, null, nextReview, input.comparison.trigger ?? '不同需求情景下结论反转。', withBudget, ['不同需求情景会翻转结论；当前动作按所选档给出。']);
    return advice('hold_card', '先不用卡；即使卡临期，当前比较也不支持为了避免过期而使用。', null, nextReview, input.comparison.trigger ?? '用卡没有改善所选档的结果。', withBudget);
  }
  const next = Math.min(nextReview, lastOpportunityAt ?? Infinity, account.weekly.resetsAt, account.short.resetsAt);
  const points = withBudget == null ? '—' : `${Number(withBudget.toFixed(2))}`;
  return advice('hold_card', `先留卡，今天按约 ${points} 点分配；到下次提醒再看。`, null, next, '按默认余额分配；复查时间可修改。', withBudget);
}

function tierName(tier: 'light' | 'normal' | 'busy'): string { return tier === 'normal' ? '均衡' : tier === 'light' ? '轻用' : '较忙'; }
