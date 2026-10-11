// 每日配速建议（RR05）：把「剩余额度 / 距重置天数 / 重置风险」折成今日建议用量。
// 公式借鉴 MIT 项目 codex-cockpit 的 dynamicQuota.ts::planCalibratedRiskQuota
// （出处：TRUTH §1 来源 3；下文「dq:NNN」均指该文件行号），
// dashboard 版三段式：均匀配速 + 风险平方前拉 + 疲劳软上限，取三者最小。
// 周末判定沿用 RR04 的 beijingWeekday（D004 北京零点唯一边界）。
// 本函数为纯函数：不查网络、不读钟（now 仅用于推导周末，可显式传 isWeekend 覆盖）。

// import 带 .ts 扩展：node ≥22.18 原生 type-stripping 直载脚本链所需（RR07 D016；
// tsc 侧由 tsconfig allowImportingTsExtensions 放行，noEmit 下合法）
import type { RiskFactor } from "./risk.ts";
import { beijingWeekday } from "./risk.ts";
import { upcomingQuotaResetAt, type ScheduledReset } from "./scheduledReset.ts";
// —— 以下两件为 RR06（resetCard 移植）一并引入的同源依赖，出处均为 dynamicQuota.ts ——
// 星期强制重置风险先验（周一=0…周日=6；周二/周六为重置波 0.7）。出处 dq:6。
export const DEFAULT_WEEKDAY_HAZARDS = [0.1, 0.7, 0.1, 0.1, 0.1, 0.7, 0.1] as const;

export interface DailyUsagePlanInput {
  remaining: number; // 0-100：当前窗口剩余额度百分比
  daysToReset: number; // 距自然重置天数（允许小数，内部截整；0=今日到期）
  risk: number; // 0-100：重置风险分（assessResetRisk().score 直传）
  kneePercent?: number; // 疲劳拐点 K，dq:7 默认 25
  isWeekend?: boolean; // 显式覆盖周末判定；缺省由 now 按北京时区推导
  now?: Date; // 周末推导基准时刻；缺省当前时刻（不影响除周末外的任何输出）
  scheduledReset?: ScheduledReset | null;
}

export interface DailyUsagePlan {
  suggested: number; // 0-100：今日建议用量（追加口径，不含已用）
  cap: number; // 0-100：软上限 = min(剩余, K(1+1.5r)×周末折扣)（dq:163）
  uniformPace: number; // 均匀配速份额（dq:154）
  riskBoost: number; // 风险平方前拉量（dq:155）
  suggestedRemaining: number; // 建议执行后剩余（dq:160）
  factors: RiskFactor[]; // D006 可解释因子，各 delta 之和 = suggested
  planningResetAt?: string; // 按公告计划准备的情景边界，不代表实际已重置
}

// —— 以下常量出处均为 dynamicQuota.ts ——
const KNEE_DEFAULT = 25; // dq:7 DEFAULT_SMOOTH_KNEE_PERCENT（dashboard 算例同款 K）
const RISK_DEFAULT = 10; // dq:151 tomorrowRiskPercent 缺省 10
const SOFT_CAP_SLOPE = 1.5; // dq:156 软上限对风险的斜率 K(1+1.5r)
const WEEKEND_FACTOR = 0.75; // dq:156 dashboard 周末软上限折扣 0.75
const DAYS_CLAMP_MAX = 7; // dq:153 天数夹紧上限（周期最长按 7 天计）

const round1 = (v: number) => Math.round(v * 10) / 10; // dq:137-138 roundPercent
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finiteOr = (v: number | undefined, fallback: number) =>
  Number.isFinite(v) ? Number(v) : fallback; // dq:140-142

/**
 * 今日用卡配速建议：min(剩余, 均匀配速+风险²前拉, 软上限 K(1+1.5r))（dq:157）。
 * risk 越高 → 前拉越猛（p² 只信已证实的风险）且软上限越宽；周末软上限×0.75
 * （周末窗口历史更脆，dashboard 口径）。
 */
export function planDailyUsage(input: DailyUsagePlanInput): DailyUsagePlan {
  const remaining = clamp(finiteOr(input.remaining, 0), 0, 100); // dq:150
  const risk = clamp(finiteOr(input.risk, RISK_DEFAULT), 0, 100) / 100; // dq:151
  const knee = clamp(finiteOr(input.kneePercent, KNEE_DEFAULT), 0.1, 100); // dq:152
  const now = input.now ?? new Date();
  const scheduledAt = upcomingQuotaResetAt(input.scheduledReset, now);
  const scheduledDays = scheduledAt == null ? null : (scheduledAt - now.getTime()) / 86_400_000; // ms→天
  const useAnnouncement = scheduledDays != null && scheduledDays < finiteOr(input.daysToReset, 0);
  const horizon = useAnnouncement ? scheduledDays! : finiteOr(input.daysToReset, 0);
  const daysLeft = Math.trunc(clamp(horizon, 0, DAYS_CLAMP_MAX)); // dq:153；公告提前结束旧额度使用情景(D022)
  const isWeekend =
    input.isWeekend ?? [0, 6].includes(beijingWeekday(now.getTime())); // dq:156 语义，边界改用 D004

  const uniformPace = remaining / (daysLeft + 1); // dq:154 含今天在内平摊
  const riskBoost = Math.max(0, remaining - uniformPace) * risk ** 2; // dq:155 风险平方前拉
  const softCap = knee * (1 + SOFT_CAP_SLOPE * risk) * (isWeekend ? WEEKEND_FACTOR : 1); // dq:156
  const suggestedRaw = Math.min(remaining, uniformPace + riskBoost, softCap); // dq:157
  const factors: RiskFactor[] = [
    {
      id: "pace-uniform",
      label: "均匀配速",
      delta: round1(uniformPace),
      note: `剩余 ${round1(remaining)}% 按 ${daysLeft + 1} 天（含今天）平摊。`,
    },
    {
      id: "risk-boost",
      label: "风险平方前拉",
      delta: round1(riskBoost),
      note: `重置风险 ${round1(risk * 100)}%，按 p² 把未来份额前拉到今天。`,
    },
  ];
  const trim = suggestedRaw - (uniformPace + riskBoost); // ≤0：软上限/剩余墙削掉的量
  const capped = trim < 0;
  factors.push({
    id: "soft-cap" + (capped && softCap <= remaining ? "-binding" : ""),
    label: capped ? "软上限约束" : "软上限",
    delta: round1(trim),
    note: capped
      ? softCap <= remaining
        ? `软上限 ${round1(softCap)}% 生效，削减 ${round1(-trim)}%。`
        : `剩余 ${round1(remaining)}% 已见底，构成硬约束。`
      : `软上限 ${round1(softCap)}%，未构成约束。`,
  });

  if (useAnnouncement) factors.push({
    id: "scheduled-horizon", label: "公告计划配速", delta: 0,
    note: `按公告计划 ${input.scheduledReset!.scheduledFor} 前准备用量；软上限仍保留，计划可能变更。`,
  });
  return {
    suggested: round1(suggestedRaw),
    cap: round1(Math.min(remaining, softCap)), // dq:163
    uniformPace: round1(uniformPace),
    riskBoost: round1(riskBoost),
    suggestedRemaining: round1(remaining - suggestedRaw), // dq:160
    factors,
    ...(useAnnouncement ? { planningResetAt: input.scheduledReset!.scheduledFor } : {}),
  };
}

export interface RemainingQuotaInput {
  remainingPercent: number; // 0-100：剩余额度（净值口径：已扣除全部历史用量）
  daysUntilReset: number; // 距自然重置天数（允许小数；≤0 视为已到期）
  tomorrowRiskPercent: number; // 0-100：重置风险
  fatigueKneePercent: number; // 疲劳拐点 K
  isWeekend: boolean;
  todayUsedPercent?: number; // 今日已用（从软上限里扣减，缺省 0）
  todayFractionRemaining?: number; // 今日剩余时间占比 0-1（缺省 1 = 整天可用）
}

export interface RemainingQuotaPlan {
  suggestedUsagePercent: number; // 0-100：建议追加用量（不含今日已用）
  suggestedRemainingPercent: number;
  uniformPacePercent: number;
  resetRiskBoostPercent: number;
  softCapPercent: number;
}

/** 距自然重置每过一天所需的周额度消耗百分点；入参无效返回 null。出处 dq:89-95。 */
export function quotaConsumptionUrgency(remainingPercent: number, daysUntilReset: number): number | null {
  if (!Number.isFinite(remainingPercent) || !Number.isFinite(daysUntilReset) || daysUntilReset <= 0) return null;
  return clamp(remainingPercent, 0, 100) / daysUntilReset;
}

/**
 * 剩余额度配速（dq:99-118）：与 planDailyUsage 同族三段式，口径差异有二——
 * ① 剩余额度是净值，均匀配速只摊「今日剩余时间片」urgent × today；
 * ② 软上限扣减今日已用 used，返回追加用量而非当日总量。
 * 重置卡模式（resetCard.ts RR06）把 horizon 从自然重置缩到卡日前一天后调用本函数。
 */
export function planRemainingQuota(input: RemainingQuotaInput): RemainingQuotaPlan {
  const remaining = clamp(finiteOr(input.remainingPercent, 0), 0, 100); // dq:100
  const days = Math.max(0, finiteOr(input.daysUntilReset, 0)); // dq:101
  const today = clamp(finiteOr(input.todayFractionRemaining, 1), 0, 1); // dq:102
  const used = clamp(finiteOr(input.todayUsedPercent, 0), 0, 100); // dq:103
  const risk = clamp(finiteOr(input.tomorrowRiskPercent, 10), 0, 100) / 100; // dq:104
  const knee = clamp(finiteOr(input.fatigueKneePercent, 25), 0.1, 100); // dq:105
  const urgency = quotaConsumptionUrgency(remaining, days); // dq:106
  const uniform = urgency === null ? 0 : Math.min(remaining, urgency * today); // dq:107
  const boost = days > 0 ? (remaining - uniform) * risk ** 2 * today : 0; // dq:108
  // dq:109：参考实现另有 sharedAccount 直通分支，本项目无共享账户概念，不移植
  const cap = Math.max(0, knee * (1 + SOFT_CAP_SLOPE * risk) * (input.isWeekend ? WEEKEND_FACTOR : 1) - used);
  const amount = days > 0 ? Math.min(remaining, uniform + boost, cap) : 0; // dq:110
  return {
    suggestedUsagePercent: round1(amount),
    suggestedRemainingPercent: round1(remaining - amount),
    uniformPacePercent: round1(uniform),
    resetRiskBoostPercent: round1(boost),
    softCapPercent: round1(Math.min(remaining, cap)),
  };
}
