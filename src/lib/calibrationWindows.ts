// RR17：风险模型唯一目标为未来24h（risk.ts），不能用同一北京日代替。
// 日键只用于每天选首条与分周，实际结果采用精确的(start,end]窗口。
import { beijingCalendarDateKey } from "./resetCard.ts";
import { RESET_RISK_HORIZON_MS } from "./risk.ts";
import { parseIsoWithZone } from "./watchSignal.ts";
import type { PredictionLogRow } from "./calibration.ts";

export type WindowExclusion = "legacy" | "invalid" | "late" | "pending" | "outside-history" | "duplicate";
export interface CompletedPredictionWindow {
  row: PredictionLogRow;
  dateKey: string;
  windowStart: string;
  windowEnd: string;
  predictedPercent: number;
  realized: boolean;
}

/** 文件顺序仅作同刻平局决胜；先按实际记录时刻选择合法的同日首行，再判断窗口覆盖。 */
export function selectCompletedPredictionWindows(
  rows: readonly PredictionLogRow[], announcedAt: readonly string[], asOf: Date,
  coverageStart: string | null = null,
): { windows: CompletedPredictionWindow[]; excluded: Record<WindowExclusion, number> } {
  const excluded: Record<WindowExclusion, number> = { legacy: 0, invalid: 0, late: 0, pending: 0, "outside-history": 0, duplicate: 0 };
  const asOfMs = asOf.getTime();
  const lowerBound = coverageStart === null ? null : parseIsoWithZone(coverageStart)?.timestamp;
  const valid: { row: PredictionLogRow; start: number; end: number; recorded: number; index: number }[] = [];
  for (const [index, row] of rows.entries()) {
    if (row?.windowStart === undefined && row?.windowEnd === undefined) { excluded.legacy++; continue; }
    const start = parseIsoWithZone(row?.windowStart)?.timestamp;
    const end = parseIsoWithZone(row?.windowEnd)?.timestamp;
    const recorded = parseIsoWithZone(row?.fetchedAt)?.timestamp;
    if (!Number.isFinite(asOfMs) || start === undefined || end === undefined || recorded === undefined
      || typeof row?.date !== "string" || beijingCalendarDateKey(start) !== row.date
      || end - start !== RESET_RISK_HORIZON_MS || !Number.isFinite(row.predictedRisk)
      || row.predictedRisk < 0 || row.predictedRisk > 100) { excluded.invalid++; continue; }
    if (recorded > start) { excluded.late++; continue; }
    valid.push({ row, start, end, recorded, index });
  }
  valid.sort((a, b) => a.recorded - b.recorded || a.index - b.index);
  const resetTimes = announcedAt.map((v) => parseIsoWithZone(v)?.timestamp).filter((v): v is number => v !== undefined && v <= asOfMs);
  const selected = new Set<string>();
  const windows: CompletedPredictionWindow[] = [];
  for (const { row, start, end } of valid) {
    if (selected.has(row.date)) { excluded.duplicate++; continue; }
    selected.add(row.date);
    if (end > asOfMs) { excluded.pending++; continue; }
    if (lowerBound === undefined || (lowerBound !== null && start < lowerBound)) { excluded["outside-history"]++; continue; }
    windows.push({ row, dateKey: row.date, windowStart: new Date(start).toISOString(), windowEnd: new Date(end).toISOString(),
      predictedPercent: row.predictedRisk, realized: resetTimes.some((event) => event > start && event <= end) });
  }
  windows.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  return { windows, excluded };
}
