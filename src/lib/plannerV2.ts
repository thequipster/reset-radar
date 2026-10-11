// v2 核心（四）：配速层 —— 按「需求」与「能否等到那天」分配余额。
// 规格出处：「reset-radar 核心算法 v2 实现规格」§4（4.1 需求估计、4.2 规划截止、4.3 分配公式）
// 与 §8 的 planner.ts 输出契约。
//
// 已删除的旧规则（RR44 之前 planner.ts）：固定 25 点软上限、固定周末 ×0.75、
// 用 DEFAULT_WEEKDAY_HAZARDS 硬编码的周二/周六 0.7 —— 周末是否减少由个人历史决定。

import { beijingDayFloor, beijingDayKey, beijingWeekday, DAY_MS, HOUR_MS } from "./beijing.ts";

/** 需求估计只看最近 28 个完整北京时间日（§4.1）。 */
export const DEMAND_WINDOW_DAYS = 28;
/** 某组不足 4 天就退回全部完整日（§4.1）。 */
export const DEMAND_MIN_GROUP_DAYS = 4;
/** 二分求解的收敛阈值：总分配误差 < 0.01 点（§4.3）。 */
export const ALLOCATION_TOLERANCE = 0.01;

export type DayGroup = "weekday" | "weekend";

export interface DailyUsageSample {
  /** 北京时间日键 YYYY-MM-DD。 */
  readonly dateKey: string;
  /** 当日消耗（周额度百分点）。 */
  readonly usedPercent: number;
  /** 当日是否耗尽额度；缺失表示无法分辨「没需求」与「额度用完」（§4.1）。 */
  readonly exhausted?: boolean;
}

export type DemandQuality = "unknown" | "weak" | "estimated";

export interface DemandEstimate {
  readonly group: DayGroup;
  /** D_i：需求预测（该组日耗中位数）。 */
  readonly demand: number;
  /** C_i：建议上限（该组日耗 75 分位）。 */
  readonly cap: number;
  readonly sampleDays: number;
  /** 该组自己的样本天数（未回退前），用于判断是否触发回退。 */
  readonly ownSampleDays: number;
  /** true=该组样本不足 4 天，已退回全部完整日。 */
  readonly fallbackUsed: boolean;
  readonly note: string;
}

export interface DemandProfile {
  readonly weekday: DemandEstimate;
  readonly weekend: DemandEstimate;
  readonly completeDays: number;
  readonly quality: DemandQuality;
  /** 样本里是否带有「当日是否耗尽」的记录。 */
  readonly hasExhaustionData: boolean;
  readonly note: string;
}

const UNKNOWN_DEMAND: DemandEstimate = {
  group: "weekday",
  demand: 0,
  cap: 0,
  sampleDays: 0,
  ownSampleDays: 0,
  fallbackUsed: false,
  note: "没有可用历史：需求未知。",
};

/** 线性插值分位数（q ∈ [0,1]）。 */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export const dayGroupOf = (at: number): DayGroup => {
  const weekday = beijingWeekday(at);
  return weekday === 0 || weekday === 6 ? "weekend" : "weekday";
};

/**
 * 需求估计（§4.1）：
 * - 只用最近 28 个「完整」北京日；当前未结束日不算样本；
 * - 缺失日不填零（样本里没有就是没有）；
 * - 工作日/周末分组，中位数作需求、75 分位作上限；
 * - 某组不足 4 天则退回全部完整日；完全没有历史则输出「需求未知」，不代入固定值。
 */
export function estimateDemand(samples: readonly DailyUsageSample[], now: number): DemandProfile {
  const todayKey = beijingDayKey(now);
  const windowStart = now - DEMAND_WINDOW_DAYS * DAY_MS;
  const complete = samples
    .filter((sample) => {
      if (sample.dateKey === todayKey) return false; // 当天未结束，不能作为一个完整样本
      const at = Date.parse(`${sample.dateKey}T00:00:00Z`) - 8 * HOUR_MS;
      if (!Number.isFinite(at)) return false;
      return at >= windowStart && at < now;
    })
    .map((sample) => ({ ...sample, at: Date.parse(`${sample.dateKey}T00:00:00Z`) - 8 * HOUR_MS }));

  const hasExhaustionData = complete.some((sample) => typeof sample.exhausted === "boolean");

  if (complete.length === 0) {
    return {
      weekday: UNKNOWN_DEMAND,
      weekend: { ...UNKNOWN_DEMAND, group: "weekend" },
      completeDays: 0,
      quality: "unknown",
      hasExhaustionData,
      note: "没有完整日样本：需求未知，不代入固定值（§4.1）。缺失日不填零。",
    };
  }

  const build = (group: DayGroup): DemandEstimate => {
    const own = complete.filter((sample) => dayGroupOf(sample.at) === group).map((sample) => sample.usedPercent);
    const fallback = own.length < DEMAND_MIN_GROUP_DAYS;
    const values = (fallback ? complete.map((sample) => sample.usedPercent) : own).slice().sort((a, b) => a - b);
    const demand = quantile(values, 0.5);
    const cap = quantile(values, 0.75);
    return {
      group,
      demand,
      cap: Math.max(demand, cap),
      sampleDays: values.length,
      ownSampleDays: own.length,
      fallbackUsed: fallback,
      note: fallback
        ? `${group === "weekend" ? "周末" : "工作日"}样本不足 ${DEMAND_MIN_GROUP_DAYS} 天（${own.length} 天），已退回全部完整日（${values.length} 天）。`
        : `${group === "weekend" ? "周末" : "工作日"} ${values.length} 个完整日：中位数 ${demand.toFixed(1)} 点，75 分位 ${cap.toFixed(1)} 点。`,
    };
  };

  const weekday = build("weekday");
  const weekend = build("weekend");
  const quality: DemandQuality = complete.length < DEMAND_MIN_GROUP_DAYS ? "weak" : "estimated";

  return {
    weekday,
    weekend,
    completeDays: complete.length,
    quality,
    hasExhaustionData,
    note: hasExhaustionData
      ? `按最近 ${complete.length} 个完整北京日的实际消耗估计（含当日是否耗尽记录）。`
      : `按最近 ${complete.length} 个完整北京日的实际消耗估计；缺少「当日是否耗尽」记录，无法分辨「没需求」与「额度用完」。`,
  };
}

export type DeadlineReason = "natural-reset" | "planned-card" | "assumed-announcement" | "unknown";

export interface AllocationSegment {
  readonly dateKey: string;
  readonly startAt: number;
  readonly endAt: number;
  /** 当日折算系数：今天与最后一天按实际剩余时长折算（§4.3）。 */
  readonly dayFraction: number;
  readonly group: DayGroup;
  readonly demand: number;
  readonly cap: number;
  /** S_i：当前余额存续到该片段起点的概率。 */
  readonly survival: number;
  readonly allocation: number;
}

export interface PacePlanV2 {
  /** 今天建议用量（百分点）；需求未知时为 null。 */
  readonly todaySuggested: number | null;
  readonly dailyAllocations: readonly AllocationSegment[];
  readonly planningDeadline: number | null;
  readonly deadlineReason: DeadlineReason;
  /** 预计来不及使用的余额（百分点）。 */
  readonly expectedUnspentBeforeDeadline: number;
  readonly demandQuality: DemandQuality;
  readonly explanations: readonly string[];
  readonly totalAllocated: number;
}

export interface PacePlanInputV2 {
  readonly now: number;
  /** 当前余额 R（周额度百分点）。 */
  readonly remaining: number;
  /** 当前自然重置时刻 N；计划用卡只用于预演，不改变它（§4.2）。 */
  readonly nextNaturalResetAt: number | null;
  /** 本情景的计划用卡时刻（预演）。 */
  readonly plannedCardAt?: number | null;
  /** 本情景假定执行的公告重置时刻。 */
  readonly assumedAnnouncementAt?: number | null;
  readonly demand: DemandProfile;
  /** S(t)：当前余额存续到 t 的概率（来自风险层的存续曲线）。 */
  readonly survivalAt: (at: number) => number;
}

/** 规划截止 = min(当前自然重置, 本情景计划用卡, 本情景假定公告执行)（§4.2）。 */
export function resolvePlanningDeadline(
  input: Pick<PacePlanInputV2, "nextNaturalResetAt" | "plannedCardAt" | "assumedAnnouncementAt">,
): { deadline: number | null; reason: DeadlineReason } {
  const candidates: { at: number; reason: DeadlineReason }[] = [];
  if (input.nextNaturalResetAt != null) {
    candidates.push({ at: input.nextNaturalResetAt, reason: "natural-reset" });
  }
  if (input.plannedCardAt != null) candidates.push({ at: input.plannedCardAt, reason: "planned-card" });
  if (input.assumedAnnouncementAt != null) {
    candidates.push({ at: input.assumedAnnouncementAt, reason: "assumed-announcement" });
  }
  if (candidates.length === 0) return { deadline: null, reason: "unknown" };
  candidates.sort((a, b) => a.at - b.at);
  return { deadline: candidates[0].at, reason: candidates[0].reason };
}

interface SegmentDraft {
  readonly dateKey: string;
  readonly startAt: number;
  readonly endAt: number;
  readonly dayFraction: number;
  readonly group: DayGroup;
  readonly demand: number;
  readonly cap: number;
  readonly survival: number;
}

/** 把截止前的时间切成北京时间日片段（§4.3）。 */
export function buildSegments(
  now: number,
  deadline: number,
  demand: DemandProfile,
  survivalAt: (at: number) => number,
): SegmentDraft[] {
  const segments: SegmentDraft[] = [];
  let cursor = Math.max(now, beijingDayFloor(now));
  let guard = 0;
  while (cursor < deadline && guard < 400) {
    guard += 1;
    const dayStart = beijingDayFloor(cursor);
    const dayEnd = dayStart + DAY_MS;
    const end = Math.min(dayEnd, deadline);
    const fraction = (end - cursor) / DAY_MS;
    if (fraction <= 0) break;
    const group = dayGroupOf(cursor);
    const estimate = group === "weekend" ? demand.weekend : demand.weekday;
    segments.push({
      dateKey: beijingDayKey(cursor),
      startAt: cursor,
      endAt: end,
      dayFraction: fraction,
      group,
      demand: estimate.demand * fraction,
      cap: estimate.cap * fraction,
      survival: Math.min(1, Math.max(0, survivalAt(cursor))),
    });
    cursor = end;
  }
  return segments;
}

/** x_i(μ) = clamp(D_i × (S_i/μ − 1), 0, C_i)；需求为零的片段直接分配零（§4.3）。 */
/** 需求为零时有效上限也是 0：不因为「还有余额」就把额度塞进没有需求的日子。 */
export const effectiveCap = (segment: SegmentDraft): number => (segment.demand <= 0 ? 0 : segment.cap);

export function allocationAtMu(segments: readonly SegmentDraft[], mu: number): number[] {
  return segments.map((segment) => {
    if (segment.demand <= 0) return 0;
    const raw = segment.demand * (segment.survival / mu - 1);
    return Math.min(segment.cap, Math.max(0, raw));
  });
}

/**
 * 求解 max Σ S_i D_i log(1 + x_i/D_i)，s.t. 0 ≤ x_i ≤ C_i、Σ x_i ≤ R。
 * 上限之和不超过余额时全部分配到上限；否则二分 μ 直到总分配误差 < 0.01 点。
 * 注意：这是可解释的配速启发式，不宣称是全局最优控制策略（§4.3）。
 */
export function solveAllocation(
  segments: readonly SegmentDraft[],
  remaining: number,
): { allocation: number[]; mu: number; iterations: number } {
  const caps = segments.map(effectiveCap);
  const capSum = caps.reduce((sum, value) => sum + value, 0);
  if (capSum <= remaining) {
    return { allocation: caps, mu: 0, iterations: 0 };
  }
  const R = Math.max(0, remaining);
  const maxSurvival = segments.reduce((max, segment) => Math.max(max, segment.survival), 0);
  let low = 1e-9;
  let high = Math.max(maxSurvival, 1e-6);
  // 扩大上界直到总分配 ≤ R（μ 越大分配越少，函数单调）。
  let guard = 0;
  while (high < 1e9 && guard < 200) {
    const total = allocationAtMu(segments, high).reduce((sum, value) => sum + value, 0);
    if (total <= R) break;
    low = high;
    high *= 2;
    guard += 1;
  }
  let iterations = 0;
  for (let i = 0; i < 200; i += 1) {
    iterations = i + 1;
    const mid = (low + high) / 2;
    const total = allocationAtMu(segments, mid).reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - R) < ALLOCATION_TOLERANCE) break;
    if (total > R) low = mid;
    else high = mid;
  }
  const mu = (low + high) / 2;
  return { allocation: allocationAtMu(segments, mu), mu, iterations };
}

export function planPaceV2(input: PacePlanInputV2): PacePlanV2 {
  const { now, demand, survivalAt } = input;
  const remaining = Math.max(0, input.remaining);
  const explanations: string[] = [];
  const { deadline, reason } = resolvePlanningDeadline(input);

  if (reason === "unknown") {
    explanations.push("截止时间未知（没有自然重置时刻、也没有本次情景的计划用卡或公告执行）：只规划今天，不伪造截止。");
  } else {
    const label =
      reason === "natural-reset"
        ? "当前自然重置时刻"
        : reason === "planned-card"
          ? "本情景的计划用卡时刻（预演，不改变真实自然重置时刻）"
          : "本情景假定执行的公告重置时刻";
    explanations.push(`规划截止 = ${label}（${new Date(deadline as number).toISOString()}），取三者最早。`);
  }

  if (demand.quality === "unknown") {
    return {
      todaySuggested: null,
      dailyAllocations: [],
      planningDeadline: deadline,
      deadlineReason: reason,
      expectedUnspentBeforeDeadline: remaining,
      demandQuality: "unknown",
      explanations: [...explanations, demand.note, "需求未知时不分配：不代入固定的 25 点软上限。"],
      totalAllocated: 0,
    };
  }

  const horizon = deadline ?? now + DAY_MS;
  const drafts = buildSegments(now, horizon, demand, survivalAt);
  const { allocation } = solveAllocation(drafts, remaining);
  const segments: AllocationSegment[] = drafts.map((draft, index) => ({
    dateKey: draft.dateKey,
    startAt: draft.startAt,
    endAt: draft.endAt,
    dayFraction: draft.dayFraction,
    group: draft.group,
    demand: draft.demand,
    cap: draft.cap,
    survival: draft.survival,
    allocation: allocation[index],
  }));

  const totalAllocated = allocation.reduce((sum, value) => sum + value, 0);
  const unspent = Math.max(0, remaining - totalAllocated);
  const today = segments[0];

  explanations.push(demand.note);
  explanations.push(
    `需求与上限按组取值：工作日 中位数 ${demand.weekday.demand.toFixed(1)} / 上限 ${demand.weekday.cap.toFixed(1)}；周末 中位数 ${demand.weekend.demand.toFixed(1)} / 上限 ${demand.weekend.cap.toFixed(1)}。周末是否减少由个人历史决定。`,
  );
  explanations.push(
    `按存续概率 S_i 前移：越靠后 S_i 越小，分配越少（今天建议 ${today ? today.allocation.toFixed(1) : "—"} 点）。`,
  );
  if (unspent > 0.01) {
    explanations.push(
      `预计来不及使用 ${unspent.toFixed(1)} 点：已到各日建议上限（历史 75 分位），不为清空额度而超出历史可消耗范围。`,
    );
  }
  const weakest = segments.reduce(
    (worst, segment) => (segment.survival < worst.survival ? segment : worst),
    segments[0],
  );
  if (weakest != null && weakest.survival < 0.9) {
    explanations.push(
      `风险前移：${weakest.dateKey} 的存续概率只有 ${(weakest.survival * 100).toFixed(0)}%，该日之后的额度被提前分配。`,
    );
  }
  if (demand.quality === "weak") {
    explanations.push("样本偏少（完整日不足 4 天）：结论为弱证据，仅供参考。");
  }

  return {
    todaySuggested: today == null ? null : today.allocation,
    dailyAllocations: segments,
    planningDeadline: deadline,
    deadlineReason: reason,
    expectedUnspentBeforeDeadline: unspent,
    demandQuality: demand.quality,
    explanations,
    totalAllocated,
  };
}
