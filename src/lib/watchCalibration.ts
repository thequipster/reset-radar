// RR16：对同一批已完成的前瞻窗口比较 watch 与不含 watch 的风险校准。
// 窗口 24h 来自 risk.ts 风险模型定义；北京日期边界复用 resetCard.ts（D004）。
// Brier/命中率只调用 calibration.ts，避免第二份评分公式。

import { selectCompletedPredictionWindows } from "./calibrationWindows.ts";
import { scorePredictions, type CalibrationScore, type PredictionOutcome } from "./calibration.ts";
import { WATCH_WEIGHT } from "./risk.ts";
import type { PredictionRecord } from "./predictions.ts";


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
  coverageStart: string | null = null,
): WatchPairedPrediction[] {
  const paired: WatchPairedPrediction[] = [];
  for (const { row, dateKey, realized } of selectCompletedPredictionWindows(rows, announcedAt, asOf, coverageStart).windows) {
    const watch = (row as PredictionRecord).watchComparison;
    if (!watch || watch.weight !== WATCH_WEIGHT
      || !Number.isFinite(watch.watchPercent) || watch.watchPercent < 0 || watch.watchPercent > 100
      || !Number.isFinite(watch.baselineRisk) || watch.baselineRisk < 0 || watch.baselineRisk > 100) continue;
    paired.push({ dateKey, baselineRisk: watch.baselineRisk, watchPercent: watch.watchPercent,
      predictedRisk: row.predictedRisk, realized });
  }
  return paired.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/** 两列共享相同样本；预测值分别取留存的 baselineRisk 与含 watch 的 predictedRisk。 */
export function compareWatchPredictions(
  rows: readonly PredictionRecord[],
  announcedAt: readonly string[],
  asOf: Date,
  coverageStart: string | null = null,
): { weight: number; pairedSamples: number; withoutWatch: CalibrationScore; withWatch: CalibrationScore } {
  const paired = joinProspectivePredictions(rows, announcedAt, asOf, coverageStart);
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
