// 用户 v3 §8–9：统一双窗状态推进；world只用于评价，策略接口不含未来路径。
import { DAY_MS, HOUR_MS } from '../beijing';
import type { ResetCard } from './cards';
export const weeklyDeadlineAfterCard=(now:number)=>now+7*DAY_MS;

export interface AccountState {
  observedAt: number;
  weekly: { remaining: number; resetsAt: number; durationMins: number };
  short: { remaining: number; resetsAt: number; durationMins: number };
  availableCardCount: number;
  lastConfirmedCardUseAt?: number;
  lastConfirmedExternalResetAt?: number;
}
export interface DemandBlock { start: number; end: number; weeklyCost: number; shortCost: number | null; weight: number; source?:'policy_default'|'user_plan'|'learned' }
export interface SupplyEvent { at: number; incidentId: string; weekly: boolean; short: boolean; reanchorWeekly: boolean }
export interface WorldPath { start: number; end: number; demand: readonly DemandBlock[]; platform: readonly SupplyEvent[]; reviews: readonly number[] }
export interface Mechanisms {
  shortAfterCard: 'keep_deadline' | 'restart_duration';
  weeklyContinuation: 'fixed_duration' | 'unknown';
  shortContinuation: 'fixed_duration' | 'unknown';
}
export interface VisibleState extends AccountState { weeklyGeneration: number; shortGeneration: number; cards: ResetCard[] }
export interface DemandForecast { weeklyCost: number; shortCost: number | null; nextKnownSupplyAt: number; blocks: readonly DemandBlock[] }
export interface PolicyContext { now: number; state: Readonly<VisibleState>; forecast: DemandForecast }
export type Policy = (visible: PolicyContext) => string | null;
export interface SimulationResult {
  loss: number; consumedWeekly: number; consumedShort: number;
  cardsSpent: number; expiredCards: number; missedSafeDeadlines: number;
  firstInsufficientAt: number | null; shortWindowEvaluated: boolean;
  actions: { at: number; cardId: string }[];
  trajectory: { at: number; weekly: number; short: number; weeklyGeneration: number; shortGeneration: number }[];
  terminal: VisibleState;
}

// §6.2 默认操作缓冲30分钟，来源是工程参数，并非平台规则。
export const ACTION_BUFFER_MS = 30 * 60_000;
function available(card: ResetCard, at: number): boolean {
  return card.state === 'available' && card.reconciliation === 'consistent' &&
    card.confirmedAt != null && card.safeDeadlineAt != null && at < card.safeDeadlineAt - ACTION_BUFFER_MS;
}

/** §8.2 已确认双窗回满/周截止+168h；短窗截止按显式机制，平台年龄不在账号状态里。 */
export function applyCardUse(state: VisibleState, cardId: string, at: number, mechanisms: Mechanisms): VisibleState | null {
  const card = state.cards.find(c => c.localId === cardId);
  if (!card || !available(card, at) || state.availableCardCount < 1) return null;
  return {
    ...state, observedAt: at, availableCardCount: state.availableCardCount - 1, lastConfirmedCardUseAt: at,
    weekly: { ...state.weekly, remaining: 100, resetsAt: at + 7 * DAY_MS },
    short: { ...state.short, remaining: 100, resetsAt: mechanisms.shortAfterCard === 'restart_duration' ? at + state.short.durationMins * 60_000 : state.short.resetsAt },
    weeklyGeneration: state.weeklyGeneration + 1, shortGeneration: state.shortGeneration + 1,
    cards: state.cards.map(c => c.localId === cardId ? { ...c, state: 'used' as const } : { ...c }),
  };
}

/** 同一world复用给所有策略。forecast是独立的当时可见预测函数，不能由world生成。 */
export function simulatePolicy(initial: AccountState, cards: readonly ResetCard[], policy: Policy,
  world: WorldPath, mechanisms: Mechanisms, forecastAt: (at: number, state: Readonly<VisibleState>) => DemandForecast): SimulationResult {
  let state: VisibleState = { ...initial, weekly: { ...initial.weekly }, short: { ...initial.short },
    cards: cards.map(c => ({ ...c })), weeklyGeneration: 0, shortGeneration: 0 };
  let loss = 0, consumedWeekly = 0, consumedShort = 0, expiredCards = 0, missedSafeDeadlines = 0;
  let firstInsufficientAt: number | null = null;
  const actions: SimulationResult['actions'] = [], trajectory: SimulationResult['trajectory'] = [];
  const applied = new Set<string>(), deadlineSeen = new Set<string>();
  const evaluateShort = world.demand.some(b=>b.shortCost!=null);
  const reviews = new Set(world.reviews.filter(t => t >= world.start && t < world.end));
  const fixed = [...new Set([world.start, world.end, ...reviews,
    ...world.demand.flatMap(b => [b.start, b.end]), ...world.platform.map(e => e.at),
    ...cards.flatMap(c => c.safeDeadlineAt == null ? [] : [c.safeDeadlineAt])])].filter(t => t >= world.start && t <= world.end).sort((a, b) => a - b);
  let fixedIndex = 0;
  let at = world.start;
  while (at < world.end) {
    // §8.4 补给和截止先于行动/工作。每次重新从当前generation读取截止，旧截止不再入队。
    for (const key of ['weekly', 'short'] as const) {
      const window = state[key];
      if (window.resetsAt <= at && Number.isFinite(window.resetsAt)) {
        const continuation = key === 'weekly' ? mechanisms.weeklyContinuation : mechanisms.shortContinuation;
        const duration=window.durationMins*60_000;
        const generations=continuation==='fixed_duration'&&duration>0?Math.floor((at-window.resetsAt)/duration)+1:1;
        state[key] = { ...window, remaining: 100, resetsAt: continuation === 'fixed_duration'&&duration>0 ? window.resetsAt+generations*duration : Infinity };
        if (key === 'weekly') state.weeklyGeneration+=generations; else state.shortGeneration+=generations;
      }
    }
    for (const event of world.platform.filter(e => e.at === at)) {
      if (applied.has(event.incidentId)) continue;
      applied.add(event.incidentId);
      if (event.weekly) {
        state.weekly = { ...state.weekly, remaining: 100, resetsAt: event.reanchorWeekly ? at + state.weekly.durationMins * 60_000 : state.weekly.resetsAt };
        state.weeklyGeneration++;
      }
      if (event.short) { state.short = { ...state.short, remaining: 100 }; state.shortGeneration++; }
      state.lastConfirmedExternalResetAt = at;
    }
    state.cards = state.cards.map(c => {
      if (c.state !== 'available' || c.safeDeadlineAt == null || c.safeDeadlineAt > at || deadlineSeen.has(c.localId)) return c;
      deadlineSeen.add(c.localId);
      if (c.exactExpiryAt != null && c.exactExpiryAt <= at) {
        expiredCards++; state.availableCardCount = Math.max(0, state.availableCardCount - 1);
        return { ...c, state: 'expired-confirmed' as const };
      }
      missedSafeDeadlines++;
      return { ...c, state: 'unresolved' as const };
    });
    if (reviews.has(at)) {
      // 不把可变state引用交给策略，防止策略修改仿真或取到未来world。
      const visible = structuredClone(state);
      const requested = policy({ now: at, state: visible, forecast: structuredClone(forecastAt(at, visible)) });
      if (requested != null) {
        const next = applyCardUse(state, requested, at, mechanisms);
        if (next) { state = next; actions.push({ at, cardId: requested }); }
      }
    }
    trajectory.push({ at, weekly: state.weekly.remaining, short: state.short.remaining,
      weeklyGeneration: state.weeklyGeneration, shortGeneration: state.shortGeneration });
    while (fixedIndex < fixed.length && fixed[fixedIndex]! <= at) fixedIndex++;
    const next = Math.min(world.end, state.weekly.resetsAt > at ? state.weekly.resetsAt : Infinity,
      evaluateShort&&state.short.resetsAt > at ? state.short.resetsAt : Infinity, fixed[fixedIndex] ?? world.end);
    if (!(next > at) || !Number.isFinite(next)) throw new Error('invalid simulation time axis');
    for (const block of world.demand) {
      const duration = Math.min(next, block.end) - Math.max(at, block.start);
      if (duration <= 0 || block.end <= block.start) continue;
      const fraction = duration / (block.end - block.start);
      const week = Math.max(0, block.weeklyCost * fraction);
      const short = block.shortCost == null ? null : Math.max(0, block.shortCost * fraction);
      const served = Math.min(1, week > 0 ? state.weekly.remaining / week : 1,
        short != null && short > 0 ? state.short.remaining / short : 1);
      // 段内按均匀工作推进；余额能支持的前半段不能误报成从段起点就不足。
      if (served < 1 && firstInsufficientAt == null) firstInsufficientAt = Math.max(at, block.start) + duration * served;
      loss += block.weight * fraction * (1 - served);
      consumedWeekly += week * served; state.weekly.remaining = Math.max(0, state.weekly.remaining - week * served);
      if (short != null) { consumedShort += short * served; state.short.remaining = Math.max(0, state.short.remaining - short * served); }
    }
    at = next;
  }
  return { loss, consumedWeekly, consumedShort, cardsSpent: actions.length, expiredCards, missedSafeDeadlines,
    firstInsufficientAt, shortWindowEvaluated: world.demand.length > 0 && world.demand.every(b => b.shortCost != null),
    actions, trajectory, terminal: state };
}

export const NEVER_USE: Policy = () => null;
export interface PolicyParameters { quantile: 0.5 | 0.8 | 0.95; horizonHours: 0 | 24 | 48; expiryLeadHours: 0 | 24 | 48; useForShort: boolean }
export function enumeratePolicyParameters(shortKnown: boolean): PolicyParameters[] {
  const result: PolicyParameters[] = [];
  for (const quantile of [0.5, 0.8, 0.95] as const) for (const horizonHours of [0, 24, 48] as const)
    for (const expiryLeadHours of [0, 24, 48] as const) for (const useForShort of shortKnown ? [false, true] : [false])
      result.push({ quantile, horizonHours, expiryLeadHours, useForShort });
  return result;
}

/** 无未来路径访问：只按当前预测的周/短窗缺口行动；临期零收益只能提醒。 */
export function makePolicy(parameters: PolicyParameters, firstAction: 'wait' | string, start: number,
  mechanisms: Mechanisms = { shortAfterCard: 'keep_deadline', weeklyContinuation: 'fixed_duration', shortContinuation: 'fixed_duration' }): Policy {
  return ({ now, state, forecast }) => {
    const cards = state.cards.filter(c => available(c, now)).sort((a, b) => a.safeDeadlineAt! - b.safeDeadlineAt! || a.localId.localeCompare(b.localId));
    if (now === start) return firstAction === 'wait' ? null : firstAction;
    const weekGap = forecast.weeklyCost > state.weekly.remaining;
    const shortGap = parameters.useForShort && forecast.shortCost != null && forecast.shortCost > state.short.remaining;
    const card = cards[0];
    if (!card) return null;
    const nearExpiry = parameters.expiryLeadHours > 0 && card.safeDeadlineAt! - now <= parameters.expiryLeadHours * HOUR_MS;
    if (!weekGap && !shortGap && !nearExpiry) return null;
    if (weekGap && state.weekly.remaining >= 100 && !shortGap) return null;
    if (shortGap && state.short.remaining >= 100 && !weekGap) return null;
    // §9.3 用预测而非抽好的实际world配对计算；未来临期动作关闭，有限调用不递归。
    const blocks = forecast.blocks.filter(b => b.end > now);
    if (blocks.length === 0) return null;
    const predictedWorld: WorldPath = { start: now, end: Math.max(...blocks.map(b => b.end)), demand: blocks, platform: [], reviews: [now] };
    const emptyForecast = () => ({ weeklyCost: 0, shortCost: null, nextKnownSupplyAt: state.weekly.resetsAt, blocks: [] });
    const keep = simulatePolicy(state, state.cards, NEVER_USE, predictedWorld, mechanisms, emptyForecast);
    const use = simulatePolicy(state, state.cards, ({ now: t }) => t === now ? card.localId : null, predictedWorld, mechanisms, emptyForecast);
    return use.loss < keep.loss || use.loss <= keep.loss && use.consumedWeekly > keep.consumedWeekly ? card.localId : null;
  };
}

export function nextReviewDelay(reviews: readonly number[], now: number): number {
  return Math.max(HOUR_MS, (reviews.find(t => t > now) ?? now + DAY_MS) - now);
}
