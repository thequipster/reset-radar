// 预测校准器（RR07）：对「重置风险预测 vs 实际是否重置」对答案——项目差异化核心（D001）。
// 参考实现收集了数据却从不对答案（TRUTH §1 来源 3 全仓无 calibration 先例，已核实），
// 本模块为从零新建；度量取标准定义（RR07 卡面证据行，即本文件真值出处）：
//   Brier 分数 = mean((p − y)²)，y∈{0,1} —— 完美预测=0、恒 50% 预测=0.25、全错=1；
//   命中率 = 阈值化命中占比：p ≥ 阈值 判「会重置」，与 y 一致即命中。
// 日期唯一边界 = 北京日历键（D004），复用 resetCard.beijingCalendarDateKey（§1.4 单一实现源）。
// 接口契约见 docs/DECISIONS.md D016：全项目 0-100 刻度；同日多行取首行（ex-ante）；
// 未完结北京日不计分；byWeek 分组键=该周周一北京日历键；n=0 时 brier/hitRate=null。
// 本模块为纯函数：不查网络、不读文件、不读钟（now 一律显式传入）。

import { beijingCalendarDateKey } from "./resetCard.ts";

/** 卡面口径：50% 二分阈（p≥50% 判「会重置」）。 */
export const CALIBRATION_DEFAULT_THRESHOLD_PERCENT = 50;
/** 可靠性曲线分桶数（0-100 十等分，末桶双含）。标准可靠性图口径。 */
export const CALIBRATION_BIN_COUNT = 10;

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/; // 北京日历键形状（ YYYY-MM-DD ）
const DAY_MS = 86_400_000;

/** 一条已对账的预测：某北京日给出过的预测概率 vs 该日实际是否发生强制重置。 */
export interface PredictionOutcome {
  dateKey: string; // 北京日历键 YYYY-MM-DD（预测目标日）
  predictedPercent: number; // 0-100：该日发生强制重置的预测概率
  realized: boolean; // 该北京日内是否实际发生强制重置
}

/** data/predictions.jsonl 单行（RR10 写入口径，本卡先行定义契约）。 */
export interface PredictionLogRow {
  date: string; // 北京日历键（评估当日）
  predictedRisk: number; // 0-100（assessResetRisk().score 直传）
  fetchedAt?: string; // ISO 串，溯源用（排序语义=文件追加顺序，见 join）
}

export interface WeekCalibration {
  weekKey: string; // 该周周一的北京日历键（分组锚；规避 ISO 周年歧义，D016）
  n: number;
  brier: number; // 本周 Brier（0-1，精确值不四舍五入——展示层负责格式化）
  hitRate: number; // 本周命中率（0-1）
}

export interface ReliabilityBin {
  label: string; // "0-10"…"90-100"（百分点区间，含下不含上，末桶双含）
  n: number;
  avgPredictedPercent: number; // 桶内平均预测概率（0-100）
  observedPercent: number; // 桶内实际重置发生率（0-100）
}

export interface CalibrationScore {
  n: number; // 计分样本数（=已完结北京日数）
  brier: number | null; // 0-1；n=0 时 null（返回 0 会误读为完美预测）
  hitRate: number | null; // 0-1；同上
  thresholdPercent: number; // 本报告采用的二分阈
  baseRate: number | null; // 实际重置日占比（0-1）：预测技能的参照基线（全猜"不重置"的命中率）
  byWeek: WeekCalibration[]; // 按周聚合，weekKey 升序；仅含有样本的周
  reliability: ReliabilityBin[]; // 十分桶；仅列有样本的桶
}

export interface ScoreOptions {
  thresholdPercent?: number; // 缺省 CALIBRATION_DEFAULT_THRESHOLD_PERCENT
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 逐行三指标统计（Brier / 命中 / 基准率）；入参须已过防御过滤，n>0 由调用方保证。 */
function scoreCore(rows: readonly PredictionOutcome[], thresholdPercent: number) {
  let brierSum = 0;
  let hits = 0;
  let realizedCount = 0;
  for (const r of rows) {
    const p = clamp(r.predictedPercent, 0, 100) / 100;
    const y = r.realized ? 1 : 0;
    brierSum += (p - y) * (p - y); // 标准定义：均方差（卡面证据行）
    if (r.predictedPercent >= thresholdPercent === r.realized) hits += 1;
    if (r.realized) realizedCount += 1;
  }
  const n = rows.length;
  return { n, brier: brierSum / n, hitRate: hits / n, baseRate: realizedCount / n };
}

/** 北京日历键 → 该周周一的北京日历键。键按 UTC 平面日解析（键本身无时区语义）。
 *  周日=0 折算同 resetCard.hazardWeekday（(d+6)%7）：周一回退 0 天、周日回退 6 天。 */
function weekKeyOfDateKey(dateKey: string): string | null {
  const ms = Date.parse(`${dateKey}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  const monday = ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY_MS;
  return new Date(monday).toISOString().slice(0, 10);
}

/**
 * 逐条打分：Brier / 命中率 / 分周走势 / 可靠性曲线。
 * 防御：dateKey 形状非法或 predictedPercent 非Finite 的行剔除（不改写、不报错，调用方日志可见 n 差额）；
 * predictedPercent 越界夹紧到 [0,100]（写入口径已是 0-100，夹紧仅防脏数据放大）。
 */
export function scorePredictions(
  records: readonly PredictionOutcome[],
  options?: ScoreOptions,
): CalibrationScore {
  const thresholdPercent = options?.thresholdPercent ?? CALIBRATION_DEFAULT_THRESHOLD_PERCENT;

  const valid = records.filter(
    (r) =>
      DATE_KEY_RE.test(r.dateKey) &&
      Number.isFinite(r.predictedPercent) &&
      typeof r.realized === "boolean",
  );
  const n = valid.length;

  const byWeekMap = new Map<string, PredictionOutcome[]>();
  const bins: PredictionOutcome[][] = Array.from({ length: CALIBRATION_BIN_COUNT }, () => []);

  for (const r of valid) {
    const wk = weekKeyOfDateKey(r.dateKey);
    if (wk !== null) {
      const bucket = byWeekMap.get(wk);
      if (bucket) bucket.push(r);
      else byWeekMap.set(wk, [r]);
    }
    const binIdx = Math.min(CALIBRATION_BIN_COUNT - 1, Math.floor(clamp(r.predictedPercent, 0, 100) / 10));
    bins[binIdx].push(r);
  }

  if (n === 0) {
    return {
      n: 0,
      brier: null,
      hitRate: null,
      thresholdPercent,
      baseRate: null,
      byWeek: [],
      reliability: [],
    };
  }

  const total = scoreCore(valid, thresholdPercent);

  const byWeek = [...byWeekMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([weekKey, rows]) => {
      const s = scoreCore(rows, thresholdPercent); // 分量与总量同一口径
      return { weekKey, n: s.n, brier: s.brier, hitRate: s.hitRate };
    });

  const reliability = bins
    .map((rows, i) => {
      if (rows.length === 0) return null;
      const avg = rows.reduce((acc, r) => acc + clamp(r.predictedPercent, 0, 100), 0) / rows.length;
      const observed = rows.filter((r) => r.realized).length / rows.length;
      return {
        label: binLabel(i),
        n: rows.length,
        avgPredictedPercent: avg,
        observedPercent: observed * 100,
      };
    })
    .filter((b): b is ReliabilityBin => b !== null);

  return {
    n,
    brier: total.brier,
    hitRate: total.hitRate,
    thresholdPercent,
    baseRate: total.baseRate,
    byWeek,
    reliability,
  };
}

function binLabel(i: number): string {
  return `${i * 10}-${(i + 1) * 10}`;
}

/**
 * 预测日志 × 重置历史 → 可打分的已对账记录（计分前的诚实性过滤都在这一步）。
 * ① realized：announcedAt（RR03 夹具口径 ISO 串）折北京日历键，键相等即该日实现；
 * ② 同日多行只取首行（ex-ante：当日后续补行已含当日部分信息，不算事前预测，D016）；
 *    行序=数组序（RR10 追加写，文件序即时间序）；
 * ③ 未完结日剔除：dateKey ≥ as_of（now）的北京日键不参与计分——
 *    与 risk.ts 的 as_of 数据新鲜度语义同源：夹具滞后时不把未覆盖日误判为 realized=false。
 */
export function joinPredictionsWithResets(
  rows: readonly PredictionLogRow[],
  announcedAt: readonly string[],
  now: Date,
): PredictionOutcome[] {
  const resetDayKeys = new Set(
    announcedAt
      .map((v) => Date.parse(v))
      .filter((ts) => Number.isFinite(ts))
      .map((ts) => beijingCalendarDateKey(ts)),
  );

  const asOfKey = beijingCalendarDateKey(now.getTime());
  const firstRowPerDay = new Map<string, PredictionLogRow>();
  for (const row of rows) {
    if (typeof row?.date !== "string" || !DATE_KEY_RE.test(row.date)) continue;
    if (!Number.isFinite(row.predictedRisk)) continue;
    if (row.date >= asOfKey) continue; // 未完结北京日：当日/未来一律不计分
    if (!firstRowPerDay.has(row.date)) firstRowPerDay.set(row.date, row); // 首行=事前预测
  }

  return [...firstRowPerDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([dateKey, row]) => ({
      dateKey,
      predictedPercent: row.predictedRisk,
      realized: resetDayKeys.has(dateKey),
    }));
}
