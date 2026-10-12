// RR16：对同一批已完成的前瞻窗口比较 watch 与不含 watch 的风险校准。
// RR45：旧 risk.ts 已删（v2 单轨）；watch 对账仅服务历史日志行的遗留 watchComparison
// 字段——v2 起新行不再融合 watch（恒 reference-only），本模块继续对账存量数据。
// 窗口 24h = 风险模型唯一目标；北京日期边界复用 beijing（D004）。
// Brier/命中率只调用 calibration.ts，避免第二份评分公式。

import { selectCompletedPredictionWindows } from "./calibrationWindows.ts";
import { scorePredictions, type CalibrationScore, type PredictionOutcome } from "./calibration.ts";
import type { PredictionRecord } from "./predictions.ts";

/** 旧 risk.ts:38 WATCH_WEIGHT=0.25（rs:230）；与 v2 riskV2.WATCH_BLEND_WEIGHT 同值，非新增参数。 */
const WATCH_WEIGHT = 0.25;


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
