// 重置卡规划器（RR06）：整文件移植自 MIT 项目 codex-cockpit 的 src/lib/resetCard.ts
// （出处：TRUTH §1 来源 3；下文「rc:NNN」均指该文件行号），逐函数对应移植。
// 本项目适配三处（详见 docs/DECISIONS.md D015）：
//   ① 历史消耗日键：参考实现用 usageDateKey（04:00 记账日，B06 双日边界陷阱），
//      本项目统一为北京日历键 beijingCalendarDateKey（D004 全项目唯一日边界）；
//   ② 依赖 planRemainingQuota / DEFAULT_WEEKDAY_HAZARDS 取自本仓 planner.ts
//      （dq:99-118 / dq:6 同源移植；RUNBOOK §1.4 单一实现源，不复制第二份）；
//   ③ 参考实现头部 import 的 ResetForecast 实际未使用，不移植；上游宽类型
//      CodexDailyUsage/DailyUsageSummary 收窄为本文件 DailyNeedSample。
// 卡面要求「决策文案留核心层外」：decision 为枚举、reasons 为机器键（UI 查表渲染），本层零文案。
//
// 模型一句话（rc:5-20）：重置卡把周额度窗口按需回满，回满的价值只在下一次重置事件
// （强制重置或自然周重置）到来前被实际消耗掉的部分，故在时刻 u 用卡的期望收益为
//   E[gain](u) = E[ min(dailyNeed · elapsed, 100 − remaining(u)) ]
// 期望遍历「u 之后第一个重置事件」的落点，用与配速器同一套星期强制重置风险先验建模
//（校准后的明日 24h 风险替换第一天的先验）。周二/周六重置波前夜用卡会被覆写，
// 该模型自动将其折价。

import { DEFAULT_WEEKDAY_HAZARDS, planRemainingQuota } from "./planner";

export const RESET_CARD_POLICY_VERSION = "reset-card-p010-v1"; // rc:22
/** 在「今天」之后向前评估多少个候选用卡日。rc:24 */
export const RESET_CARD_MAX_HORIZON_DAYS = 14;
/** 自然重置前没有任何一天的期望收益过线 → 持卡不放。rc:26 */
export const RESET_CARD_MIN_USEFUL_GAIN_PERCENT = 8;
/** 「今天就 用」容差：今日收益保住最佳日的 85% 即当日用（先验本身带 ±30% 校准噪声，
 *  为边际更好的未来日阻塞今日工作不值）。rc:27-32 */
export const RESET_CARD_USE_TODAY_TOLERANCE = 0.85;
/** 补给规模（100 − 预计剩余）低于该百分点视为还不值得烧卡。rc:34 */
export const RESET_CARD_MIN_USEFUL_REFILL_PERCENT = 25;

const DAY_MS = 86_400_000;
const BEIJING_OFFSET_MS = 8 * 3_600_000; // D004

export type ResetCardDecision =
  | "no-credits"
  | "hold-until-depleted"
  | "hold-until-natural-reset"
  | "use-today"
  | "wait-for-best-day"; // rc:39-44

export interface ResetCardDayOutlook {
  /** 该候选日的北京日历日期键（YYYY-MM-DD）。rc:48 */
  localDate: string;
  /** 该日用卡的期望额外消耗掉的周额度百分点。rc:50 */
  expectedGainPercent: number;
  /** 该日的补给规模（100 − 预计剩余）。rc:52 */
  refillPercent: number;
  /** 该日用卡后 24h 内发生强制重置的概率。rc:54 */
  resetWithin24hPercent: number;
}

export interface ResetCardPlan {
  policyVersion: string;
  decision: ResetCardDecision;
  /** 0 = 今天；>0 = 再等这么多天。rc:61 */
  bestDayOffset: number;
  bestDayLocalDate: string;
  expectedGainTodayPercent: number;
  expectedGainBestPercent: number;
  refillTodayPercent: number;
  /** 自此刻起 24h / 48h 内强制重置的概率。rc:66-67 */
  forcedReset24hPercent: number;
  forcedReset48hPercent: number;
  /** 预计剩余降到「值得用卡」区间还要多少天。rc:69 */
  daysUntilWorthwhile: number | null;
  daysUntilNaturalReset: number;
  /** 最早的卡过期距今天数（上游上报才有）。rc:73 */
  daysUntilCreditExpiry: number | null;
  credits: number;
  dailyNeedPercent: number;
  /** 给 UI 的机器键理由，最重要的在前。rc:77 */
  reasons: string[];
  outlook: ResetCardDayOutlook[];
}

export interface ResetCardPlannerInput {
  /** 当前周剩余额度 0-100。rc:84 */
  remainingPercent: number;
  /** 自然周重置时刻（ISO）。rc:86 */
  resetsAt: string;
  /** 上游实时重置卡余量；未知传 null。rc:88 */
  resetCredits: number | null;
  /** 最早卡过期时刻（ISO）；上游上报才传。rc:90 */
  creditExpiresAt: string | null;
  /** 预期日消耗（周额度百分比/天）。rc:92 */
  dailyNeedPercent: number;
  /** 星期强制重置风险（周一=0…周日=6）；缺省用 DEFAULT_WEEKDAY_HAZARDS。rc:93-97 */
  weekdayHazards?: readonly number[];
  /** 校准后的未来 24h 强制重置风险 0-100（assessResetRisk().score 直传）。rc:98 */
  tomorrowRiskPercent: number | null;
  now?: Date;
}

/** 历史日消耗样本（estimateDailyNeedPercent 入参契约，收窄自参考实现的上游宽类型）。 */
export interface DailyNeedSample {
  /** 北京日历键 YYYY-MM-DD（D004；参考实现为 04:00 记账键，本项目弃用，见文件头①）。 */
  localDate: string;
  observedUsedPercent: number;
  sampleCount: number;
}

function beijingDayIndex(ms: number): number {
  return Math.floor((ms + BEIJING_OFFSET_MS) / DAY_MS); // rc:103-105
}

function beijingDayStartMs(dayIndex: number): number {
  return dayIndex * DAY_MS - BEIJING_OFFSET_MS; // rc:107-109
}

/** 北京日历日期键（零点边界）；参考实现同款，本项目全项目唯一键位（D004）。rc:111-114 */
function beijingCalendarDateKey(ms: number): string {
  return new Date(ms + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

/** ms 所在北京日的星期编号（周一=0…周日=6），与 DEFAULT_WEEKDAY_HAZARDS 下标对齐。rc:116-120 */
function hazardWeekday(ms: number): number {
  const shifted = new Date(ms + BEIJING_OFFSET_MS);
  return (shifted.getUTCDay() + 6) % 7;
}

const round1 = (v: number) => Math.round(v * 10) / 10; // rc:122-124
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v)); // rc:126-128

/** 整日风险 h 下，一天中 fraction 比例时段的存活概率（不发生强制重置）。rc:130-133 */
function survivalFraction(dayHazard: number, fraction: number): number {
  return Math.pow(1 - clamp(dayHazard, 0, 0.999), clamp(fraction, 0, 1));
}

/**
 * 近期观测日消耗的均值：卡补给实际被消耗掉的速率。闲置日计入（拉低速率），
 * 无观测日跳过；无可用水历史时退回均匀周配速。rc:135-140
 */
export function estimateDailyNeedPercent(
  history: readonly DailyNeedSample[],
  fallbackPercent = 100 / 7,
  today = new Date(),
): number {
  // rc:146-151：cutoff/today 键从 usageDateKey（04:00）改为北京日历键（D004，文件头①）
  const cutoff = beijingCalendarDateKey(today.getTime() - 28 * DAY_MS);
  const todayKey = beijingCalendarDateKey(today.getTime());
  const merged = new Map<string, number>();
  for (const item of history) {
    if (item.sampleCount > 0 && Number.isFinite(item.observedUsedPercent) && item.localDate >= cutoff && item.localDate < todayKey) {
      merged.set(item.localDate, Math.max(merged.get(item.localDate) ?? 0, item.observedUsedPercent));
    }
  }
  if (merged.size === 0) return round1(fallbackPercent); // rc:153
  const mean = [...merged.values()].reduce((total, value) => total + value, 0) / merged.size; // rc:154
  return round1(clamp(mean, 1, 60)); // rc:155 夹紧 1..60
}

interface DayHazardSchedule {
  /** 北京日 dayIndex（绝对序号）当天强制重置落地的风险。rc:160 */
  at(dayIndex: number): number;
}

function hazardSchedule(weekdayHazards: readonly number[], tomorrowRiskPercent: number | null, nowMs: number): DayHazardSchedule {
  const hazards = Array.from({ length: 7 }, (_, index) => clamp(weekdayHazards[index] ?? DEFAULT_WEEKDAY_HAZARDS[index] ?? 0.1, 0.02, 0.95)); // rc:164
  const tomorrowDay = beijingDayIndex(nowMs) + 1; // rc:165
  const tomorrowRisk = tomorrowRiskPercent == null ? null : clamp(tomorrowRiskPercent, 0, 100) / 100; // rc:166
  return {
    at(dayIndex: number) {
      // rc:168-171：校准风险覆盖明日先验（缺省回退星期先验）
      if (dayIndex === tomorrowDay && tomorrowRisk != null) return tomorrowRisk;
      return hazards[hazardWeekday(beijingDayStartMs(dayIndex))];
    },
  };
}

/** 自 startMs 起 days 天内发生强制重置的概率（小数天边界感知）。rc:175-189 */
function forcedResetWithin(schedule: DayHazardSchedule, startMs: number, days: number): number {
  if (!(days > 0)) return 0;
  const firstDay = beijingDayIndex(startMs);
  const firstFraction = clamp((beijingDayStartMs(firstDay + 1) - startMs) / DAY_MS, 0, 1);
  let survival = survivalFraction(schedule.at(firstDay), firstFraction);
  let covered = firstFraction;
  for (let day = 1; covered < days - 1e-9 && day < 400; day += 1) {
    const fraction = Math.min(1, days - covered);
    survival *= survivalFraction(schedule.at(firstDay + day), fraction);
    covered += fraction;
    if (fraction < 1) break;
  }
  return round1(clamp(1 - survival, 0, 1) * 100);
}

interface DayEvaluation {
  dayOffset: number;
  useAt: number;
  naturalResetAt: number;
  refill: number;
  gain: number;
  reset24h: number;
}

function evaluateUseDay(
  schedule: DayHazardSchedule,
  useAt: number,
  dayOffset: number,
  remainingAtUse: number,
  naturalResetAt: number,
  needPerDay: number,
): DayEvaluation {
  const refill = clamp(100 - remainingAtUse, 0, 100); // rc:208
  const useDay = beijingDayIndex(useAt);
  const firstFraction = clamp((beijingDayStartMs(useDay + 1) - useAt) / DAY_MS, 0, 1);
  const capacityBy = (elapsedMs: number) => clamp(needPerDay * (elapsedMs / DAY_MS), 0, 100);
  // 相对「不用卡」的增量消耗：用卡时刻已有的余额本就可消耗，超出部分才算卡的增益。rc:211-214
  const consumed = (limitMs: number) => Math.min(Math.max(0, capacityBy(Math.max(0, limitMs - useAt)) - remainingAtUse), refill);

  // 从用卡时刻逐日走到自然重置。未来某北京日的强制重置按落在当日正午定价——
  // 落点未知时的无偏中点，刻意不让「重置波当日用卡」显得更划算；自然重置按精确时刻定价。rc:216-220
  let expected = 0;
  let survival = survivalFraction(schedule.at(useDay), firstFraction);
  expected += (1 - survivalFraction(schedule.at(useDay), firstFraction)) * consumed(beijingDayStartMs(useDay + 1));
  const lastDay = beijingDayIndex(naturalResetAt);
  for (let day = useDay + 1; day <= lastDay && day - useDay < RESET_CARD_MAX_HORIZON_DAYS + 2; day += 1) {
    const dayStart = beijingDayStartMs(day);
    if (dayStart >= naturalResetAt) break;
    const dayEnd = Math.min(beijingDayStartMs(day + 1), naturalResetAt);
    const fraction = clamp((dayEnd - dayStart) / DAY_MS, 0, 1);
    const hazard = schedule.at(day);
    const resetLandsAt = Math.min(dayStart + DAY_MS / 2, naturalResetAt);
    expected += survival * (1 - survivalFraction(hazard, fraction)) * consumed(resetLandsAt);
    survival *= survivalFraction(hazard, fraction);
    if (survival < 1e-6) break;
  }
  expected += survival * consumed(naturalResetAt);

  const reset24h = forcedResetWithin(schedule, useAt, 1);
  return { dayOffset, useAt, naturalResetAt, refill, gain: expected, reset24h };
}

export function planResetCard(input: ResetCardPlannerInput): ResetCardPlan | null {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const naturalResetAt = Date.parse(input.resetsAt);
  if (!Number.isFinite(naturalResetAt) || naturalResetAt <= nowMs) return null; // rc:246 窗口无效/已过期
  if (!Number.isFinite(input.remainingPercent)) return null;

  const remaining = clamp(input.remainingPercent, 0, 100);
  const needPerDay = clamp(input.dailyNeedPercent, 0.5, 100);
  const hazards = input.weekdayHazards ?? DEFAULT_WEEKDAY_HAZARDS;
  const schedule = hazardSchedule(hazards, input.tomorrowRiskPercent, nowMs);

  const credits = input.resetCredits == null ? 0 : Math.max(0, Math.trunc(input.resetCredits)); // rc:254
  const creditExpiryAt = input.creditExpiresAt == null || !Number.isFinite(Date.parse(input.creditExpiresAt)) ? null : Date.parse(input.creditExpiresAt); // rc:255
  const daysUntilNaturalReset = (naturalResetAt - nowMs) / DAY_MS;
  const daysUntilCreditExpiry = creditExpiryAt == null ? null : Math.max(0, (creditExpiryAt - nowMs) / DAY_MS);

  // 候选日：今天 → 自然重置前最后一个整天（那之后补给免费，归下个周期），
  // 再被卡自身过期与评估视野夹住。rc:259-264
  const naturalBound = Math.max(0, Math.ceil(daysUntilNaturalReset) - 1);
  const expiryBound = daysUntilCreditExpiry == null ? Number.POSITIVE_INFINITY : Math.floor(daysUntilCreditExpiry);
  const lastDay = Math.min(RESET_CARD_MAX_HORIZON_DAYS, naturalBound, expiryBound);

  const todayStart = beijingDayStartMs(beijingDayIndex(nowMs));
  const todayRemainingFraction = clamp((beijingDayStartMs(beijingDayIndex(nowMs) + 1) - nowMs) / DAY_MS, 0, 1);
  const outlook: ResetCardDayOutlook[] = [];
  const evaluations: DayEvaluation[] = [];
  for (let offset = 0; offset <= lastDay; offset += 1) {
    const useAt = offset === 0 ? nowMs : todayStart + offset * DAY_MS;
    const remainingAtUse = offset === 0
      ? remaining
      : clamp(remaining - needPerDay * todayRemainingFraction - needPerDay * (offset - 1), 0, 100); // rc:272-274
    const evaluation = evaluateUseDay(schedule, useAt, offset, remainingAtUse, naturalResetAt, needPerDay);
    evaluations.push(evaluation);
    outlook.push({
      localDate: beijingCalendarDateKey(useAt),
      expectedGainPercent: round1(evaluation.gain),
      refillPercent: round1(evaluation.refill),
      resetWithin24hPercent: round1(evaluation.reset24h),
    });
  }

  const forcedReset24hPercent = forcedResetWithin(schedule, nowMs, 1);
  const forcedReset48hPercent = forcedResetWithin(schedule, nowMs, 2);
  const best = evaluations.reduce((top, candidate) => (candidate.gain > top.gain + 1e-9 ? candidate : top), evaluations[0]);
  const today = evaluations[0];
  const refillTodayPercent = round1(today.refill);
  const daysUntilWorthwhile = remaining > 100 - RESET_CARD_MIN_USEFUL_REFILL_PERCENT && needPerDay > 0
    ? Math.max(0, (remaining - (100 - RESET_CARD_MIN_USEFUL_REFILL_PERCENT)) / needPerDay)
    : 0;

  const reasons: string[] = [];
  let decision: ResetCardDecision;
  if (credits <= 0) {
    decision = "no-credits"; // rc:296-298
    reasons.push("no-credits");
  } else if (refillTodayPercent < RESET_CARD_MIN_USEFUL_REFILL_PERCENT) {
    decision = "hold-until-depleted"; // rc:299-302 额度还多，补给不值钱
    reasons.push("quota-plentiful");
    if (daysUntilWorthwhile > 0.5) reasons.push("wait-for-depletion");
  } else if (best.gain < RESET_CARD_MIN_USEFUL_GAIN_PERCENT) {
    decision = "hold-until-natural-reset"; // rc:303-305 撑得到自然重置，无需烧卡
    reasons.push("gain-below-threshold");
  } else if (best.dayOffset === 0 || today.gain >= best.gain * RESET_CARD_USE_TODAY_TOLERANCE) {
    decision = "use-today"; // rc:306-308
    reasons.push(today.reset24h >= 0.5 ? "today-high-collision-risk" : "today-optimal");
  } else {
    decision = "wait-for-best-day"; // rc:309-312
    reasons.push("better-day-ahead");
    if (daysUntilCreditExpiry != null && best.dayOffset >= expiryBound - 1e-9 && expiryBound < naturalBound) reasons.push("card-expires-soon");
  }

  return {
    policyVersion: RESET_CARD_POLICY_VERSION,
    decision,
    bestDayOffset: best.dayOffset,
    bestDayLocalDate: outlook[Math.min(best.dayOffset, outlook.length - 1)]?.localDate ?? beijingCalendarDateKey(nowMs),
    expectedGainTodayPercent: round1(today.gain),
    expectedGainBestPercent: round1(best.gain),
    refillTodayPercent,
    forcedReset24hPercent,
    forcedReset48hPercent,
    daysUntilWorthwhile: daysUntilWorthwhile == null ? null : round1(daysUntilWorthwhile),
    daysUntilNaturalReset: round1(daysUntilNaturalReset),
    daysUntilCreditExpiry: daysUntilCreditExpiry == null ? null : round1(daysUntilCreditExpiry),
    credits,
    dailyNeedPercent: round1(needPerDay),
    reasons,
    outlook,
  };
}

export interface ResetCardPacingInput {
  remainingPercent: number;
  bestDayOffset: number;
  fatigueKneePercent: number;
  todayUsedPercent: number;
  todayFractionRemaining: number;
  isWeekend: boolean;
  /** 计划卡日之前发生强制重置的融合概率 0-100。rc:343 */
  forcedResetBeforePlanPercent: number;
}

export interface ResetCardPacingPlan {
  suggestedUsagePercent: number;
  softCapPercent: number;
}

/**
 * 卡模式下的每日配速（rc:351-358）：卡日之前剩余额度应当花掉（卡触发时余额会被
 * 覆写），故 horizon 从自然重置缩短为卡日，且卡日前的强制重置仍然正当化前拉；
 * 计划即今日时余额马上销毁 → 不受疲劳软上限约束全额建议。
 */
export function planResetCardPacing(input: ResetCardPacingInput): ResetCardPacingPlan {
  if (input.bestDayOffset <= 0) {
    return { suggestedUsagePercent: round1(clamp(input.remainingPercent, 0, 100)), softCapPercent: round1(clamp(input.remainingPercent, 0, 100)) }; // rc:360-362
  }
  const planDays = Math.max(0, input.bestDayOffset) + Math.max(0, input.todayFractionRemaining); // rc:363
  const plan = planRemainingQuota({
    remainingPercent: input.remainingPercent,
    daysUntilReset: planDays,
    tomorrowRiskPercent: input.forcedResetBeforePlanPercent,
    fatigueKneePercent: input.fatigueKneePercent,
    todayUsedPercent: input.todayUsedPercent,
    todayFractionRemaining: input.todayFractionRemaining,
    isWeekend: input.isWeekend,
  }); // rc:364-372（实现位于 planner.ts，dq:99-118 同源）
  return { suggestedUsagePercent: plan.suggestedUsagePercent, softCapPercent: plan.softCapPercent };
}

/** 计划卡日之前发生强制重置的概率（供配速紧迫度用）。rc:376-385 */
export function forcedResetBeforeDayPercent(
  weekdayHazards: readonly number[],
  tomorrowRiskPercent: number | null,
  daysAhead: number,
  now = new Date(),
): number {
  if (daysAhead <= 0) return 0;
  return forcedResetWithin(hazardSchedule(weekdayHazards, tomorrowRiskPercent, now.getTime()), now.getTime(), daysAhead);
}
