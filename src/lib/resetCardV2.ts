// v2 核心（五）：重置卡层 —— 比较「不用卡」与「在 τ 用卡」两条完整策略，而不是计算充值量。
// 规格出处：「reset-radar 核心算法 v2 实现规格」§5（5.1 同一快照出发、5.2 主指标、5.3 统一视野、
// 5.4 候选时刻、5.5 模拟步骤、5.6 决策规则）与 §8 的 resetCard.ts 输出契约。
//
// 已删除的旧规则（RR44 之前 resetCard.ts）：「补给不足 25 点不算数」「最佳收益不足 8 点不算数」
// 「今天达到 85% 就今天打」三条固定阈值 —— 换成 ε=1 点的「最小实用收益」与显式敏感性检查。

import { beijingDayFloor, beijingDayKey, beijingWeekday, DAY_MS, HOUR_MS } from "./beijing.ts";
import type { AllocationSegment } from "./plannerV2.ts";
import { estimateDemand, type DemandProfile } from "./plannerV2.ts";
import type { RateTable } from "./riskV2.ts";
import {
  DEFAULT_CYCLE_RULES,
  type CycleRules,
  type QuotaState,
  type RiskAgeBand,
  type UnexpectedScheduleRule,
} from "./resetState.ts";

/** 最小实用收益 ε（百分点）：只表示避免为极小收益折腾，不表示统计显著性（§5.6）。 */
export const MIN_USEFUL_GAIN_PERCENT = 1;
/** 候选决策时刻默认北京时间 09:00（可配置产品参数，§5.4）。 */
export const DEFAULT_DECISION_HOUR = 9;
/** 未来候选最多 14 天（§5.4）。 */
export const MAX_CANDIDATE_DAYS = 14;
export const DEFAULT_PATHS = 512;
export const MAX_PATHS = 4096;
export const DEFAULT_DEMAND_MULTIPLIERS = [0.75, 1, 1.25] as const;
/** 视觉/结算容差：余额≥此值视为「已回满」，未来候选跳过不强行用卡（§5.4）。 */
const FULL_BALANCE = 99.5;

export interface CardState {
  readonly id: string;
  readonly expiresAt: number;
}

export type ResetCardDecisionKind = "not_applicable" | "hold" | "use_today" | "wait" | "uncertain";

export interface CandidateResult {
  readonly at: number;
  readonly label: string;
  /** E[该策略在观察期内的实际消耗]（百分点）。 */
  readonly usage: number;
  /** ΔUsage = 用卡策略 − 不用卡策略（§5.2 主指标）。 */
  readonly incrementalUsage: number;
  /** 相对基线少了多少「需求未被满足」的天数（辅助输出）。 */
  readonly unmetDemandDays: number;
  readonly endingBalanceDiff: number;
  readonly nextResetShiftHours: number;
  readonly cardConsumed: boolean;
  readonly skippedReason?: string;
}

export interface SensitivityPoint {
  readonly multiplier: number;
  readonly bestAt: number | null;
  readonly bestUsage: number;
}

export interface ResetRulePoint {
  readonly rule: UnexpectedScheduleRule;
  readonly bestAt: number | null;
  readonly bestUsage: number;
}

export interface HorizonSensitivity {
  readonly baseHorizon: number;
  readonly extendedHorizon: number;
  readonly bestAtBase: number | null;
  readonly bestAtExtended: number | null;
  readonly bestUsageBase: number;
  readonly bestUsageExtended: number;
  /** 两个视野下的最佳「增量」收益：视野敏感性比较的是它，不是绝对消耗。 */
  readonly bestIncrementalBase: number;
  readonly bestIncrementalExtended: number;
  readonly flipped: boolean;
  readonly note: string;
}

export interface ResetCardDecisionV2 {
  readonly decision: ResetCardDecisionKind;
  readonly recommendedAt: number | null;
  readonly selectedCard: CardState | null;
  readonly baselineUsage: number;
  readonly candidateResults: readonly CandidateResult[];
  readonly incrementalUsage: number;
  readonly horizonSensitivity: HorizonSensitivity;
  readonly demandSensitivity: readonly SensitivityPoint[];
  readonly resetRuleSensitivity: readonly ResetRulePoint[];
  readonly simulationError: { readonly paths: number; readonly standardError: number; readonly note: string };
  readonly assumptions: readonly string[];
  readonly explanations: readonly string[];
}

export interface ResetCardInputV2 {
  readonly now: number;
  readonly state: QuotaState;
  readonly cards: readonly CardState[];
  readonly demand: DemandProfile;
  /** 分段发生率（来自风险层），用于生成意外重置等待时间。 */
  readonly rateTable: RateTable;
  readonly cycleRules?: CycleRules;
  readonly decisionHour?: number;
  readonly maxCandidateDays?: number;
  readonly minUsefulGain?: number;
  readonly paths?: number;
  readonly seed?: number;
  readonly demandMultipliers?: readonly number[];
  /** 公告情景：give probability=undefined ⇒ 分别跑执行/未执行（§5.5）。 */
  readonly announcements?: readonly { readonly at: number; readonly probability?: number }[];
}

// —— 确定性随机数（成对路径：同一条路径的两个策略共享同一串 Exp(1) 抽样）——

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const exponentialDraws = (seed: number, count: number): number[] => {
  const rng = mulberry32(seed);
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const u = Math.min(1 - 1e-12, Math.max(1e-12, rng()));
    out.push(-Math.log(1 - u));
  }
  return out;
};

const ageBandAt = (lastResetAt: number | null, at: number): RiskAgeBand | null => {
  if (lastResetAt == null) return null;
  const hours = (at - lastResetAt) / HOUR_MS;
  if (hours < 36) return "fresh";
  if (hours < 168) return "mid";
  return "old";
};

const BAND_INDEX: Record<RiskAgeBand, number> = { fresh: 0, mid: 1, old: 2 };

/** 分段发生率 λ(t)：按北京星期与风险年龄取表；年龄未知时只用星期模型（§3.1）。 */
function hazardAt(table: RateTable, at: number, lastResetAt: number | null): number {
  const band = ageBandAt(lastResetAt, at);
  const weekday = beijingWeekday(at);
  if (band == null) return table.weekday[weekday].rate;
  return table.weekdayAge[weekday * 3 + BAND_INDEX[band]].rate;
}

/**
 * 用「生成等待时间」的方式抽取下一次意外重置时刻：解 Λ(t0,t) = E（分段积分 + 段内线性插值）。
 * 规格 §5.5 允许此法或足够细的时间片；这里按分段发生率精确求逆，避免时间片误差。
 */
export function nextShockTime(
  table: RateTable,
  from: number,
  target: number,
  horizon: number,
  lastResetAt: number | null,
): number | null {
  let accumulated = 0;
  let cursor = from;
  let guard = 0;
  while (cursor < horizon && guard < 5000) {
    guard += 1;
    const dayEnd = beijingDayFloor(cursor) + DAY_MS;
    const ageEnd =
      lastResetAt == null
        ? horizon
        : Math.min(
            ...[36, 168]
              .map((hours) => lastResetAt + hours * HOUR_MS)
              .filter((value) => value > cursor)
              .concat([horizon]),
          );
    const segEnd = Math.min(dayEnd, ageEnd, horizon);
    const rate = hazardAt(table, cursor, lastResetAt);
    const lambda = (rate * (segEnd - cursor)) / DAY_MS;
    if (accumulated + lambda >= target) {
      const remaining = target - accumulated;
      const fraction = rate > 0 ? (remaining * DAY_MS) / rate : segEnd - cursor;
      return cursor + Math.min(fraction, segEnd - cursor);
    }
    accumulated += lambda;
    cursor = segEnd;
  }
  return null;
}

interface PathContext {
  readonly now: number;
  readonly horizon: number;
  readonly demand: DemandProfile;
  readonly table: RateTable;
  readonly rules: CycleRules;
  readonly rule: UnexpectedScheduleRule;
  readonly demandMultiplier: number;
  readonly announcements: readonly { readonly at: number }[];
}

interface PathOutcome {
  readonly usage: number;
  readonly unmetDays: number;
  readonly endingBalance: number;
  readonly nextResetAt: number | null;
  readonly cardConsumed: boolean;
  readonly cardSkipped: boolean;
}

interface SimState {
  balance: number;
  nextNatural: number | null;
  lastResetAt: number | null;
  cardUsed: boolean;
  cardSkipped: boolean;
}

/**
 * 同一时刻的事件优先级：先重置类，后日界。
 * 否则自然重置正好落在北京午夜时会被「日界」事件挤掉，且下一轮它的时刻已不再 > t，
 * 于是这次重置永远丢失 —— 基线会凭空断粮。
 */
const KIND_ORDER: Record<string, number> = {
  shock: 0,
  card: 1,
  announcement: 2,
  natural: 3,
  day: 4,
  end: 5,
};

/**
 * 某天的实际消耗：需求 × 压力倍率，并受「余额 ÷ 距下次回满的天数」的配速约束（§5.5）。
 * 分母是到下一次回满（自然重置／候选用卡／假定公告执行）的天数，不是到观察期终点 ——
 * 否则明知道明天会回满，却把今天的余额摊到 44 天里，凭空制造断粮。
 */
function dailyConsumption(
  ctx: PathContext,
  at: number,
  balance: number,
  remainingDays: number,
): { consumption: number; demand: number } {
  const group = beijingWeekday(at) === 0 || beijingWeekday(at) === 6 ? ctx.demand.weekend : ctx.demand.weekday;
  const demand = group.demand * ctx.demandMultiplier;
  if (demand <= 0) return { consumption: 0, demand: 0 };
  const rationed = remainingDays > 0 ? balance / remainingDays : balance;
  const planned = Math.min(demand, Math.max(rationed, 0));
  return { consumption: Math.min(planned, balance), demand };
}

/** 单条路径、单个策略的模拟（事件驱动：日界 / 自然重置 / 公告 / 候选用卡 / 随机意外重置）。 */
function simulatePath(
  ctx: PathContext,
  draws: readonly number[],
  cardAt: number | null,
  start: SimState,
): PathOutcome {
  const state: SimState = { ...start, cardSkipped: false };
  let usage = 0;
  let unmetDays = 0;
  let t = ctx.now;
  let drawIndex = 0;
  let pendingShock: number | null = null;
  let guard = 0;

  while (t < ctx.horizon && guard < 5000) {
    guard += 1;
    const dayEnd = beijingDayFloor(t) + DAY_MS;
    const refills = [state.nextNatural, cardAt != null && !state.cardUsed ? cardAt : null]
      .concat(ctx.announcements.map((item) => item.at))
      .filter((value): value is number => value != null && value > t);
    const nextRefill = refills.length > 0 ? Math.min(...refills, ctx.horizon) : ctx.horizon;
    const daysLeft = Math.max(1, Math.ceil((Math.min(nextRefill, ctx.horizon) - t) / DAY_MS));
    const { consumption, demand } = dailyConsumption(ctx, t, state.balance, daysLeft);
    const slice = Math.min(dayEnd, ctx.horizon) - t;

    if (pendingShock == null) {
      const draw = draws[drawIndex] ?? Number.POSITIVE_INFINITY;
      pendingShock = nextShockTime(ctx.table, t, draw, ctx.horizon, state.lastResetAt);
    }

    // 事件时间：意外重置 / 自然重置 / 公告 / 候选用卡 / 日界 / 观察期终点
    const events: { at: number; kind: "shock" | "natural" | "announcement" | "card" | "day" | "end" }[] = [
      { at: Math.min(dayEnd, ctx.horizon), kind: "day" },
      { at: ctx.horizon, kind: "end" },
    ];
    if (pendingShock != null && pendingShock < ctx.horizon) events.push({ at: pendingShock, kind: "shock" });
    if (state.nextNatural != null && state.nextNatural > t && state.nextNatural < ctx.horizon) {
      events.push({ at: state.nextNatural, kind: "natural" });
    }
    for (const announcement of ctx.announcements) {
      if (announcement.at > t && announcement.at < ctx.horizon) {
        events.push({ at: announcement.at, kind: "announcement" });
      }
    }
    if (cardAt != null && !state.cardUsed && cardAt >= t && cardAt < ctx.horizon) {
      events.push({ at: cardAt, kind: "card" });
    }
    events.sort((a, b) => a.at - b.at || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    const next = events[0];
    const span = Math.max(0, Math.min(next.at, ctx.horizon) - t);
    const consumed = Math.min((consumption * span) / slice, state.balance);
    state.balance -= consumed;
    usage += consumed;
    if (demand > 0 && consumed + 1e-9 < (demand * span) / slice) {
      unmetDays += span / DAY_MS; // 该段需求未被满足（断粮）
    }

    const at = Math.min(next.at, ctx.horizon);
    switch (next.kind) {
      case "shock": {
        state.balance = 100;
        state.lastResetAt = at;
        if (ctx.rule === "keep") state.nextNatural = state.nextNatural;
        else if (ctx.rule === "roll") state.nextNatural = at + ctx.rules.cycleDurationHours * HOUR_MS;
        else state.nextNatural = null;
        pendingShock = null;
        drawIndex += 1;
        break;
      }
      case "natural": {
        state.balance = 100;
        state.nextNatural =
          state.nextNatural != null ? state.nextNatural + ctx.rules.cycleDurationHours * HOUR_MS : null;
        break;
      }
      case "announcement": {
        state.balance = 100;
        state.lastResetAt = at;
        state.nextNatural = at + ctx.rules.cycleDurationHours * HOUR_MS;
        break;
      }
      case "card": {
        // 未来候选遇到已回满状态时跳过，不强行用卡（§5.4）。
        if (state.balance >= FULL_BALANCE) {
          state.cardUsed = true;
          state.cardSkipped = true;
          break;
        }
        state.balance = 100;
        state.lastResetAt = at;
        state.nextNatural = at + ctx.rules.cycleDurationHours * HOUR_MS;
        state.cardUsed = true;
        break;
      }
      default:
        break;
    }
    t = at;
    if (next.kind === "end") break;
  }

  return {
    usage,
    unmetDays,
    endingBalance: state.balance,
    nextResetAt: state.nextNatural,
    cardConsumed: state.cardUsed && !state.cardSkipped,
    cardSkipped: state.cardSkipped,
  };
}

/** 候选时刻：现在 + 未来最多 14 天的北京每日固定决策时刻 + 卡过期前最后可执行时刻（§5.4）。 */
export function buildCandidates(
  now: number,
  cards: readonly CardState[],
  decisionHour: number,
  maxCandidateDays: number,
): { at: number; label: string }[] {
  const selected = [...cards].sort((a, b) => a.expiresAt - b.expiresAt)[0] ?? null;
  const latest = selected?.expiresAt ?? now + (maxCandidateDays + 2) * DAY_MS;
  const out: { at: number; label: string }[] = [{ at: now, label: "现在" }];
  for (let day = 1; day <= maxCandidateDays; day += 1) {
    const at = beijingDayFloor(now) + day * DAY_MS + decisionHour * HOUR_MS;
    if (at <= now || at > latest) continue;
    out.push({ at, label: `${beijingDayKey(at)} ${String(decisionHour).padStart(2, "0")}:00` });
  }
  if (selected != null && selected.expiresAt > now) {
    out.push({ at: selected.expiresAt, label: `卡过期前最后时刻（${beijingDayKey(selected.expiresAt)}）` });
  }
  return out.sort((a, b) => a.at - b.at);
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardError(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance / values.length);
}

interface RunResult {
  readonly baselineUsage: number;
  readonly candidates: CandidateResult[];
  readonly bestAt: number | null;
  readonly bestUsage: number;
  readonly bestIncremental: number;
  readonly standardError: number;
}

function runScenario(input: ResetCardInputV2, options: {
  readonly demandMultiplier: number;
  readonly rule: UnexpectedScheduleRule;
  readonly horizon: number;
  readonly paths: number;
  readonly announcements: readonly { readonly at: number }[];
}): RunResult {
  const rules = input.cycleRules ?? DEFAULT_CYCLE_RULES;
  const start: SimState = {
    balance: input.state.remaining,
    nextNatural: input.state.nextNaturalResetAt,
    lastResetAt: input.state.lastForcedLikeResetAt,
    cardUsed: false,
    cardSkipped: false,
  };
  const ctx: PathContext = {
    now: input.now,
    horizon: options.horizon,
    demand: input.demand,
    table: input.rateTable,
    rules,
    rule: options.rule,
    demandMultiplier: options.demandMultiplier,
    announcements: options.announcements,
  };
  const candidates = buildCandidates(
    input.now,
    input.cards,
    input.decisionHour ?? DEFAULT_DECISION_HOUR,
    input.maxCandidateDays ?? MAX_CANDIDATE_DAYS,
  );

  const usageByCandidate = new Map<number, number[]>();
  const unmetByCandidate = new Map<number, number[]>();
  const endBalanceByCandidate = new Map<number, number[]>();
  const shiftByCandidate = new Map<number, number[]>();
  const consumedByCandidate = new Map<number, number[]>();
  const skippedByCandidate = new Map<number, number[]>();
  const baselineUsage: number[] = [];
  const baselineUnmet: number[] = [];

  for (let path = 0; path < options.paths; path += 1) {
    // 成对路径：同一条路径共用同一串 Exp(1) 抽样（§5.1「需求和外部随机数必须共享」）。
    const draws = exponentialDraws((input.seed ?? 20261011) + path * 7919, 64);
    const baseline = simulatePath(ctx, draws, null, start);
    baselineUsage.push(baseline.usage);
    baselineUnmet.push(baseline.unmetDays);
    for (const candidate of candidates) {
      const outcome = simulatePath(ctx, draws, candidate.at, start);
      const delta = outcome.usage - baseline.usage;
      usageByCandidate.set(candidate.at, [...(usageByCandidate.get(candidate.at) ?? []), delta]);
      unmetByCandidate.set(candidate.at, [
        ...(unmetByCandidate.get(candidate.at) ?? []),
        baseline.unmetDays - outcome.unmetDays,
      ]);
      endBalanceByCandidate.set(candidate.at, [
        ...(endBalanceByCandidate.get(candidate.at) ?? []),
        outcome.endingBalance - baseline.endingBalance,
      ]);
      shiftByCandidate.set(candidate.at, [
        ...(shiftByCandidate.get(candidate.at) ?? []),
        ((outcome.nextResetAt ?? options.horizon) - (baseline.nextResetAt ?? options.horizon)) / HOUR_MS,
      ]);
      consumedByCandidate.set(candidate.at, [
        ...(consumedByCandidate.get(candidate.at) ?? []),
        outcome.cardConsumed ? 1 : 0,
      ]);
      skippedByCandidate.set(candidate.at, [
        ...(skippedByCandidate.get(candidate.at) ?? []),
        outcome.cardSkipped ? 1 : 0,
      ]);
    }
  }

  const baselineMean = mean(baselineUsage);
  const results: CandidateResult[] = candidates.map((candidate) => {
    const deltas = usageByCandidate.get(candidate.at) ?? [];
    return {
      at: candidate.at,
      label: candidate.label,
      usage: baselineMean + mean(deltas),
      incrementalUsage: mean(deltas),
      unmetDemandDays: mean(unmetByCandidate.get(candidate.at) ?? []),
      endingBalanceDiff: mean(endBalanceByCandidate.get(candidate.at) ?? []),
      nextResetShiftHours: mean(shiftByCandidate.get(candidate.at) ?? []),
      cardConsumed: mean(consumedByCandidate.get(candidate.at) ?? []) > 0.5,
      ...(mean(skippedByCandidate.get(candidate.at) ?? []) > 0.5
        ? { skippedReason: "该时刻多数路径下余额已回满：跳过用卡，不强行消耗（§5.4）。" }
        : {}),
    };
  });

  const best = results.reduce<{ at: number | null; usage: number; incremental: number }>(
    (current, candidate) =>
      candidate.incrementalUsage > current.incremental
        ? { at: candidate.at, usage: candidate.usage, incremental: candidate.incrementalUsage }
        : current,
    { at: null, usage: baselineMean, incremental: -Infinity },
  );

  return {
    baselineUsage: baselineMean,
    candidates: results,
    bestAt: best.at,
    bestUsage: best.usage,
    bestIncremental: best.incremental,
    standardError: standardError(baselineUsage),
  };
}

/** 零发生率表：用于「忽略意外重置」的对照场景（验收用例 4/5）。 */
export const ZERO_RATE_TABLE: RateTable = {
  lambda0: 0,
  weekday: Array.from({ length: 7 }, () => ({ exposureDays: 0, events: 0, rate: 0 })),
  weekdayAge: Array.from({ length: 21 }, () => ({ exposureDays: 0, events: 0, rate: 0 })),
  totalEvents: 0,
  totalExposureDays: 0,
  ageEligibleEvents: 0,
  ageEligibleExposureDays: 0,
};

export function planResetCardV2(input: ResetCardInputV2): ResetCardDecisionV2 {
  const rules = input.cycleRules ?? DEFAULT_CYCLE_RULES;
  const epsilon = input.minUsefulGain ?? MIN_USEFUL_GAIN_PERCENT;
  const paths = Math.min(MAX_PATHS, Math.max(16, input.paths ?? DEFAULT_PATHS));
  const multipliers = input.demandMultipliers ?? DEFAULT_DEMAND_MULTIPLIERS;
  const assumptions: string[] = [];
  const explanations: string[] = [];

  const usableCards = input.cards.filter((card) => card.expiresAt > input.now);
  const selectedCard = [...usableCards].sort((a, b) => a.expiresAt - b.expiresAt)[0] ?? null;

  const empty = (decision: ResetCardDecisionKind, note: string): ResetCardDecisionV2 => ({
    decision,
    recommendedAt: null,
    selectedCard: null,
    baselineUsage: 0,
    candidateResults: [],
    incrementalUsage: 0,
    horizonSensitivity: {
      baseHorizon: input.now,
      extendedHorizon: input.now,
      bestAtBase: null,
      bestAtExtended: null,
      bestUsageBase: 0,
      bestUsageExtended: 0,
      bestIncrementalBase: 0,
      bestIncrementalExtended: 0,
      flipped: false,
      note,
    },
    demandSensitivity: [],
    resetRuleSensitivity: [],
    simulationError: { paths: 0, standardError: 0, note },
    assumptions,
    explanations: [...explanations, note],
  });

  if (selectedCard == null) {
    return empty("not_applicable", "没有可用卡（数量为零或已过期）：用卡规划不适用。");
  }
  if (input.demand.quality === "unknown") {
    return empty("uncertain", "需求历史不足：无法估计消耗，暂无法可靠建议（不代入固定需求值）。");
  }
  if (rules.cycleRuleSource === "assumed") {
    assumptions.push("cycle-duration-assumed");
    explanations.push(`周期长度为暂定假设（${rules.cycleDurationHours}h）：用卡后的截止按预演计算，结论随之浮动。`);
  }
  if (rules.unexpectedResetScheduleRule === "unknown") {
    assumptions.push("unexpected-rule-unknown");
    explanations.push("意外重置后的周期规则未知：已分别模拟「截止保持」与「截止滚动」两种情景。");
  }

  const candidates = buildCandidates(
    input.now,
    [selectedCard],
    input.decisionHour ?? DEFAULT_DECISION_HOUR,
    input.maxCandidateDays ?? MAX_CANDIDATE_DAYS,
  );
  const latestCandidate = candidates[candidates.length - 1]?.at ?? input.now;
  const cycleMs = rules.cycleDurationHours * HOUR_MS;
  // 统一比较视野：所有候选比到同一个绝对终点 H = 最晚候选 + 2L（§5.3）。
  const baseHorizon = latestCandidate + 2 * cycleMs;
  const extendedHorizon = baseHorizon + cycleMs;

  // 公告：给概率的按「假定执行」跑；没给概率的分别跑执行/未执行，不擅自给可信度（§5.5）。
  const announcements = (input.announcements ?? []).filter((item) => item.at > input.now);
  const announcementScenario = announcements.filter(
    (item) => item.probability == null || (item.probability ?? 0) >= 0.5,
  );
  if (announcements.length > 0) {
    assumptions.push("announcement-scenario-assumed");
    explanations.push("公告未来是否执行不确定：已按情景分别计算，未给可信度百分比。");
  }

  const ruleOptions: UnexpectedScheduleRule[] =
    rules.unexpectedResetScheduleRule === "unknown" ? ["keep", "roll"] : [rules.unexpectedResetScheduleRule];

  const base = runScenario(input, {
    demandMultiplier: 1,
    rule: ruleOptions[0],
    horizon: baseHorizon,
    paths,
    announcements: announcementScenario,
  });
  const extended = runScenario(input, {
    demandMultiplier: 1,
    rule: ruleOptions[0],
    horizon: extendedHorizon,
    paths,
    announcements: announcementScenario,
  });

  const demandSensitivity: SensitivityPoint[] = multipliers.map((multiplier) => {
    const run = runScenario(input, {
      demandMultiplier: multiplier,
      rule: ruleOptions[0],
      horizon: baseHorizon,
      paths,
      announcements: announcementScenario,
    });
    return { multiplier, bestAt: run.bestAt, bestUsage: run.bestUsage };
  });

  const resetRuleSensitivity: ResetRulePoint[] = ruleOptions.map((rule) => {
    const run = runScenario(input, {
      demandMultiplier: 1,
      rule,
      horizon: baseHorizon,
      paths,
      announcements: announcementScenario,
    });
    return { rule, bestAt: run.bestAt, bestUsage: run.bestUsage };
  });

  const best = base.candidates.reduce<CandidateResult | null>(
    (current, candidate) =>
      current == null || candidate.incrementalUsage > current.incrementalUsage ? candidate : current,
    null,
  );
  const today = base.candidates[0];
  const bestIncremental = best?.incrementalUsage ?? 0;
  const todayIncremental = today?.incrementalUsage ?? 0;

  const flipped =
    extended.bestAt !== base.bestAt ||
    Math.abs(extended.bestIncremental - base.bestIncremental) > 1 ||
    demandSensitivity.some((point) => point.bestAt !== base.bestAt) ||
    resetRuleSensitivity.some((point) => point.bestAt !== base.bestAt);

  const horizonSensitivity: HorizonSensitivity = {
    baseHorizon,
    extendedHorizon,
    bestAtBase: base.bestAt,
    bestAtExtended: extended.bestAt,
    bestUsageBase: base.bestUsage,
    bestUsageExtended: extended.bestUsage,
    bestIncrementalBase: base.bestIncremental,
    bestIncrementalExtended: extended.bestIncremental,
    flipped,
    note: flipped
      ? "受比较视野影响：延长视野或换假设后最佳候选改变/关键收益变化超过 1 点，不输出确定性的「今天打」。"
      : `两个视野（${beijingDayKey(baseHorizon)} / ${beijingDayKey(extendedHorizon)}）结论一致。`,
  };

  explanations.push(
    `主指标是「观察期内实际消耗之差」，不是补给规模：最大候选增量 ${bestIncremental.toFixed(1)} 点（阈值 ε=${epsilon} 点）。`,
  );
  explanations.push("只评估下一张卡，后续卡价值未纳入长期优化（§5.4）。");

  let decision: ResetCardDecisionKind;
  let recommendedAt: number | null = null;
  if (bestIncremental <= epsilon) {
    decision = "hold";
    explanations.push("所有候选收益都不超过 ε：持有，当前未发现明显收益。");
  } else if (flipped) {
    decision = "uncertain";
    explanations.push("假设或模拟误差足以翻转方向：建议不稳健，已列出翻转原因。");
  } else if (todayIncremental > epsilon && bestIncremental - todayIncremental <= epsilon) {
    decision = "use_today";
    recommendedAt = today?.at ?? null;
    explanations.push(`今天收益 ${todayIncremental.toFixed(1)} 点，且距最佳收益不超过 ε：今天可用。`);
  } else {
    decision = "wait";
    recommendedAt = best?.at ?? null;
    explanations.push(
      `未来候选明显更好：建议等到 ${best != null ? beijingDayKey(best.at) : "—"}（增量 ${bestIncremental.toFixed(1)} 点）。`,
    );
  }

  return {
    decision,
    recommendedAt,
    selectedCard,
    baselineUsage: base.baselineUsage,
    candidateResults: base.candidates,
    incrementalUsage: bestIncremental,
    horizonSensitivity,
    demandSensitivity,
    resetRuleSensitivity,
    simulationError: {
      paths,
      standardError: base.standardError,
      note: "模拟误差小不代表模型可靠；这是成对路径下的基线消耗标准误，与模型可靠性分开显示（§5.6）。",
    },
    assumptions,
    explanations,
  };
}
