// RR17：自动对答案的可序列化纯核心产物；文件IO由脚本/Rust承接。
import { assessHistorySource, selectQuotaResetHistory } from "./history.ts";
import { scorePredictions, type PredictionOutcome } from "./calibration.ts";
import { selectCompletedPredictionWindows } from "./calibrationWindows.ts";
import { compareWatchPredictions } from "./watchCalibration.ts";
import type { PredictionRecord } from "./predictions.ts";

export function buildCalibrationSnapshot(history: unknown, rows: readonly PredictionRecord[], generatedAt: Date) {
  const source = assessHistorySource(history, generatedAt);
  const document = history as { events?: unknown[]; upstream?: { pagination?: { has_more?: boolean } } } | null;
  const resetTimes = selectQuotaResetHistory(Array.isArray(document?.events) ? document.events : []);
  // API分页可能截断早期事件：只在最早已返回regular之后判定无重置，不能猜未覆盖的旧窗口。
  const coverageStart = document?.upstream?.pagination?.has_more === false ? null : resetTimes.at(-1) ?? "invalid";
  const asOf = new Date(source.state === "invalid" ? NaN : source.asOf!);
  const selection = selectCompletedPredictionWindows(rows, resetTimes, asOf, coverageStart);
  const outcomes: PredictionOutcome[] = selection.windows.map(({ dateKey, predictedPercent, realized }) => ({ dateKey, predictedPercent, realized }));
  return {
    schema: "reset-radar/calibration@1" as const,
    generatedAt: Number.isFinite(generatedAt.getTime()) ? generatedAt.toISOString() : null,
    state: source.state,
    historySource: source,
    coverageStart: coverageStart === "invalid" ? null : coverageStart,
    excluded: selection.excluded,
    score: scorePredictions(outcomes),
    watchComparison: compareWatchPredictions(rows, resetTimes, asOf, coverageStart),
    outcomes: selection.windows.map(({ row: _row, ...window }) => window),
  };
}
