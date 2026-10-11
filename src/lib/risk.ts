// 重置风险评估（RR04）：估计「未来 24 小时内发生强制重置」的概率（0-100 百分比）。
// 算法思路借鉴 MIT 项目 codex-cockpit 的 reset_forecast.rs::calibrated_risk
// （出处：TRUTH §1 来源 3；下文「rs:NNN」均指该文件行号），重写为纯 TS，常量逐一注明。
// 思路重写非逐字复用；版权声明与全仓复用清单见 THIRD_PARTY_NOTICES.md。
// 星期判定全项目唯一边界 = 北京零点（D004）：一律 +8h 后取星期，绝不用本地时区。
// 输入契约：history 为已清洗的 announcedAt ISO 串（RR03 夹具口径，scripts/fetch-history.mjs
// 已做去重/未来过滤）；本函数仍保留解析容错与未来容差防御（与 rs:110-114 同源）。
// now 语义 = as_of 数据新鲜度时刻（参考实现取 meta.generated_at 而非墙钟）。

import { assessScheduledReset, type ScheduledReset, type ScheduledResetAssessment } from "./scheduledReset.ts";

export interface RiskFactor {
  id: string; // D006 强制接口：UI 依 id/label/delta/note 渲染可解释因子行
  label: string;
  delta: number; // 百分点（0-100 尺度），展示层四舍五入到 0.1
  note: string;
}

export interface ResetRisk {
  score: number; // 0-100，输出取 1 位小数
  factors: RiskFactor[]; // 逐因子累计，factors 各 delta 之和 ≈ score
  watchComparison?: { weight: number; watchPercent: number; baselineRisk: number };
  scheduledReset?: ScheduledResetAssessment; // 与概率分列的公告信息；缺省不改变旧输出形状
}

export const RESET_RISK_HORIZON_MS = 86_400_000; // 风险模型定义的未来24小时，唯一窗口长度
const DAY_MS = RESET_RISK_HORIZON_MS;
const BEIJING_OFFSET_MS = 8 * 3_600_000; // D004 唯一日边界
const FUTURE_TOLERANCE_MS = 5 * 60_000; // rs:8 未来容差 5min（与 fetch-history.mjs 同源）

// —— 以下常量出处均为 reset_forecast.rs::calibrated_risk ——
const WEEKDAY_BASE_HIGH = 70; // rs:140-141 目标日（北京星期）为周二/周六的基线
const WEEKDAY_BASE_LOW = 10; // rs:143 其余星期基线
const CONSECUTIVE_FLOOR = 40; // rs:159 上次重置后 36h 内，风险至少抬到 40
const CONSECUTIVE_WINDOW_DAYS = 1.5; // rs:158 即 36 小时
const INTERVAL_MIN_SAMPLES = 5; // rs:176 间隔条件风险最少有效间隔数
const INTERVAL_MIN_DAYS = 0.25; // rs:174 有效间隔下限 6h（兼防近重复事件）
const INTERVAL_WEIGHT = 0.25; // rs:183 经验风险向当前概率的融入权重
const INTERVAL_CLAMP = 12; // rs:183 单因子夹紧 ±12
const RECENT_MIN_SAMPLES = 8; // rs:193 近期频率/星期分布最少样本
const RECENT_WINDOW_DAYS = 30; // rs:196 近期窗口
const RECENT_RATIO = 1.25; // rs:204 近期频次超长期基线 25% 判升频
const RECENT_DELTA = 12; // rs:205 升频抬升
const WEEKDAY_SMOOTH_NUM = 2; // rs:218 星期占比 Laplace 平滑（2/14=1/7，向均匀先验收缩）
const WEEKDAY_SMOOTH_DEN = 14;
const WEEKDAY_WEIGHT = 20; // rs:219
const WEEKDAY_CLAMP = 6; // rs:219
export const WATCH_WEIGHT = 0.25; // rs:230；RR16复用既有权重，不新增可调参数
const SCORE_MIN = 2; // rs:239 最终输出夹紧下限
const SCORE_MAX = 95; // rs:239 最终输出夹紧上限

const round1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** UTC 时间戳 → 北京星期（0=周日…6=周六）。D004：+8h 后取星期，全项目星期判定唯一入口。 */
export function beijingWeekday(ts: number): number {
  return new Date(ts + BEIJING_OFFSET_MS).getUTCDay();
}

/**
 * 评估未来 24h 强制重置风险。
 * @param history 已清洗的 announcedAt ISO 串（最新在前或乱序均可，内部排序）
 * @param now as_of 数据新鲜度时刻
 * @param watchPercent 上游 codex-resets.com watch 概率（0-100），缺省视为无信号
 * @param scheduledReset 公告计划独立状态；不伪造概率，规划器按情景调整horizon
 */
export function assessResetRisk(
  history: readonly string[],
  now: Date,
  watchPercent?: number,
  scheduledReset?: ScheduledReset | null,
): ResetRisk {
  const asOf = now.getTime();
  // 解析容错 + 未来容差防御 + 降序（最新在前），与 rs:110-114 同源
  const parsed = history
    .map((v) => Date.parse(v))
    .filter((ts) => Number.isFinite(ts) && ts <= asOf + FUTURE_TOLERANCE_MS)
    .sort((a, b) => b - a);

  // 目标星期 = 明天的北京星期（rs:139 的 +24h+8h 语义）
  const targetWeekday = beijingWeekday(asOf + DAY_MS);
  const isHighDay = targetWeekday === 2 || targetWeekday === 6; // 2=周二 6=周六（rs:140）
  let probability = isHighDay ? WEEKDAY_BASE_HIGH : WEEKDAY_BASE_LOW;
  const factors: RiskFactor[] = [
    {
      id: "base",
      label: "星期启发式基线",
      delta: probability,
      note: isHighDay ? "目标日为周二/周六，基线 70%。" : "普通日基线 10%。",
    },
  ];

  // 连续重置效应（rs:154-167）
  const ageDays = parsed.length > 0 ? Math.max(0, (asOf - parsed[0]) / DAY_MS) : 0;
  if (parsed.length > 0 && ageDays <= CONSECUTIVE_WINDOW_DAYS && probability < CONSECUTIVE_FLOOR) {
    const delta = CONSECUTIVE_FLOOR - probability;
    probability += delta;
    factors.push({
      id: "consecutive-reset",
      label: "连续重置效应",
      delta: round1(delta),
      note: "上次重置后 36 小时内，24h 风险至少抬到 40%。",
    });
  }

  // 历史间隔条件风险（rs:169-191）：在已等待 ageDays 天的条件下，
  // 用相邻间隔的经验分布做 Laplace 平滑估计（rs:182 的 (events+1)/(atRisk+2)）
  const ascending = [...parsed].sort((a, b) => a - b);
  const intervals: number[] = [];
  for (let i = 1; i < ascending.length; i += 1) {
    const gap = (ascending[i] - ascending[i - 1]) / DAY_MS;
    if (gap >= INTERVAL_MIN_DAYS) intervals.push(gap);
  }
  if (intervals.length >= INTERVAL_MIN_SAMPLES) {
    const atRisk = intervals.filter((v) => v >= ageDays).length;
    const events = intervals.filter((v) => v >= ageDays && v < ageDays + 1).length;
    const empirical = ((events + 1) / (atRisk + 2)) * 100;
    const delta = clamp((empirical - probability) * INTERVAL_WEIGHT, -INTERVAL_CLAMP, INTERVAL_CLAMP);
    probability += delta;
    factors.push({
      id: "interval-hazard",
      label: "历史间隔条件风险",
      delta: round1(delta),
      note: `已等待 ${round1(ageDays)} 天的条件下，用历史间隔经验分布校准。`,
    });
  }

  if (parsed.length >= RECENT_MIN_SAMPLES) {
    // 最近 30 天频率（rs:193-213）
    const recent = parsed.filter((ts) => (asOf - ts) / DAY_MS < RECENT_WINDOW_DAYS).length;
    const spanDays = Math.max(1, (asOf - parsed[parsed.length - 1]) / DAY_MS);
    const longTerm30d = (parsed.length / spanDays) * 30;
    if (recent > longTerm30d * RECENT_RATIO) {
      probability += RECENT_DELTA;
      factors.push({
        id: "recent-regime",
        label: "最近 30 天频率",
        delta: RECENT_DELTA,
        note: "近期重置频率高于长期基线 25% 以上。",
      });
    }
    // 历史星期分布平滑（rs:214-227）
    const matching = parsed.filter((ts) => beijingWeekday(ts) === targetWeekday).length;
    const smoothedShare = (matching + WEEKDAY_SMOOTH_NUM) / (parsed.length + WEEKDAY_SMOOTH_DEN);
    const delta = clamp((smoothedShare - 1 / 7) * WEEKDAY_WEIGHT, -WEEKDAY_CLAMP, WEEKDAY_CLAMP);
    probability += delta;
    factors.push({
      id: "weekday-empirical",
      label: "历史星期分布",
      delta: round1(delta),
      note: "用清洗后的重置星期分布做平滑校准。",
    });
  }

  // 上游公开 watch 信号（rs:229-238）：以 25% 权重向 watch 概率拉近
  let watchComparison: ResetRisk["watchComparison"];
  if (typeof watchPercent === "number" && Number.isFinite(watchPercent)) {
    if (watchPercent >= 0 && watchPercent <= 100) {
      watchComparison = { weight: WATCH_WEIGHT, watchPercent, baselineRisk: round1(clamp(probability, SCORE_MIN, SCORE_MAX)) };
    }
    const delta = (watchPercent - probability) * WATCH_WEIGHT;
    probability += delta;
    factors.push({
      id: "tracker-watch",
      label: "codex-resets.com watch",
      delta: round1(delta),
      note: `上游公开 watch 信号约 ${round1(watchPercent)}%，以 25% 权重融入。`,
    });
  }

  const announcement = assessScheduledReset(scheduledReset, now);
  if (announcement) {
    factors.push({
      id: "scheduled-reset",
      label: announcement.state === "planned" ? "已发布重置计划" : "公告待核实",
      delta: 0, // 没有公告可靠性校准证据；不把计划伪装成100%概率（D022）。
      note: announcement.state === "planned"
        ? announcement.appliesToQuota
          ? `公告计划于 ${announcement.announcement.scheduledFor} 重置；规划优先按计划边界准备，模型概率另列。`
          : `公告计划于 ${announcement.announcement.scheduledFor} 发布${announcement.announcement.resetType}重置；仅展示公告，不调整周额度规划。`
        : `公告计划时刻 ${announcement.announcement.scheduledFor} 已过，尚未确认执行；不继续清仓。`,
    });
  }
  return {
    score: round1(clamp(probability, SCORE_MIN, SCORE_MAX)), factors,
    ...(announcement ? { scheduledReset: announcement } : {}),
    ...(watchComparison ? { watchComparison } : {}),
  };
}
