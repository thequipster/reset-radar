// RR16：对同一批已完成的前瞻窗口比较 watch 与不含 watch 的风险校准。
// 窗口 24h 来自 risk.ts 风险模型定义；北京日期边界复用 resetCard.ts（D004）。
// Brier/命中率只调用 calibration.ts，避免第二份评分公式。

import { beijingCalendarDateKey } from "./resetCard.ts";
import { scorePredictions, type CalibrationScore, type PredictionOutcome } from "./calibration.ts";
import { RESET_RISK_HORIZON_MS, WATCH_WEIGHT } from "./risk.ts";
import type { PredictionRecord } from "./predictions.ts";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface WatchPairedPrediction {
  dateKey: string;
  realized: boolean;
  baselineRisk: number;
  watchPercent: number;
  predictedRisk: number;
}

/**
 * 选择可用于前瞻比较的同日首条预测。先确定合格窗口的同日首行，再验证该行
 * 是否保存了有效 watch 元数据，防止用当天后续有 watch 的补行替代首行。
 */
export function joinProspectivePredictions(
  rows: readonly PredictionRecord[],
  announcedAt: readonly string[],
  asOf: Date,
): WatchPairedPrediction[] {
  const asOfMs = asOf.getTime();
  if (!Number.isFinite(asOfMs)) return [];

  const resetTimes = announcedAt
    .map((value) => Date.parse(value))
    .filter((time) => Number.isFinite(time));
  const firstByDay = new Map<string, PredictionRecord>();

  for (const row of rows) {
    if (!row || typeof row.date !== "string" || !DATE_KEY_RE.test(row.date)
      || !Number.isFinite(row.predictedRisk) || row.predictedRisk < 0 || row.predictedRisk > 100
      || typeof row.windowStart !== "string" || typeof row.windowEnd !== "string"
      || typeof row.fetchedAt !== "string") continue;
    const start = Date.parse(row.windowStart);
    const end = Date.parse(row.windowEnd);
    const fetched = Date.parse(row.fetchedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(fetched)
      || end - start !== RESET_RISK_HORIZON_MS || fetched > start || end > asOfMs
      || beijingCalendarDateKey(start) !== row.date) continue;
    if (!firstByDay.has(row.date)) firstByDay.set(row.date, row);
  }

  const paired: WatchPairedPrediction[] = [];
  for (const [dateKey, row] of firstByDay) {
    const watch = row.watchComparison;
    if (!watch || watch.weight !== WATCH_WEIGHT
      || !Number.isFinite(watch.watchPercent) || watch.watchPercent < 0 || watch.watchPercent > 100
      || !Number.isFinite(watch.baselineRisk) || watch.baselineRisk < 0 || watch.baselineRisk > 100) continue;
    const start = Date.parse(row.windowStart!);
    const end = Date.parse(row.windowEnd!);
    paired.push({
      dateKey,
      baselineRisk: watch.baselineRisk,
      watchPercent: watch.watchPercent,
      predictedRisk: row.predictedRisk,
      realized: resetTimes.some((time) => time > start && time <= end),
    });
  }
  return paired.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/** 两列共享相同样本；预测值分别取留存的 baselineRisk 与含 watch 的 predictedRisk。 */
export function compareWatchPredictions(
  rows: readonly PredictionRecord[],
  announcedAt: readonly string[],
  asOf: Date,
): { weight: number; pairedSamples: number; withoutWatch: CalibrationScore; withWatch: CalibrationScore } {
  const paired = joinProspectivePredictions(rows, announcedAt, asOf);
  const withoutWatch: PredictionOutcome[] = paired.map(({ dateKey, baselineRisk, realized }) => ({
    dateKey, predictedPercent: baselineRisk, realized,
  }));
  const withWatch: PredictionOutcome[] = paired.map(({ dateKey, predictedRisk, realized }) => ({
    dateKey, predictedPercent: predictedRisk, realized,
  }));
  return {
    weight: WATCH_WEIGHT,
    pairedSamples: paired.length,
    withoutWatch: scorePredictions(withoutWatch),
    withWatch: scorePredictions(withWatch),
  };
}
