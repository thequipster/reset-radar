// RR28：校准摘要只读桥接的纯映射层——把脚本生成的 calibration.json（schema
// reset-radar/calibration@1，唯一生产者 scripts/refresh-calibration.mjs 调
// buildCalibrationSnapshot）映射成 UI 可直接消费的可空摘要。
// 本模块零算法：不重算任何指标，只做形状校验与字段透传（ARCHITECTURE §2 分层；
// 02-spec「不在React实现另一份评分算法」）。三态：missing（文件缺失/空）/ invalid
// （坏 JSON 或契约不符）/ ok（真实计分结果，含 n=0 的诚实零样本）。
import type { HistoryFreshnessState } from "./history.ts";

export const CALIBRATION_SNAPSHOT_SCHEMA = "reset-radar/calibration@1";

/** ok 态摘要字段（全部来自快照原文，无推导）。 */
export interface CalibrationSummaryData {
  state: HistoryFreshnessState; // 历史来源状态（fresh/stale/invalid）
  generatedAt: string | null; // 快照生成时刻（脚本运行时刻）
  historyAsOf: string | null; // 计分 as_of（历史 fetchedAt）
  coverageStart: string | null; // 历史全覆盖=null；分页截断=最早已返回 regular
  sampleCount: number; // 已计分 24h 窗口数（n）
  realizedWindows: number; // 其中实际发生重置的窗口数
  brier: number | null; // n=0 时 null（calibration.ts 口径）
  hitRate: number | null;
  thresholdPercent: number;
  watchPairedSamples: number; // watch 同样本配对数
  excluded: {
    legacy: number; // 旧行无窗口
    invalid: number;
    late: number; // 事后记录
    pending: number; // 窗口未完成
    outsideHistory: number; // 早于历史覆盖
    duplicate: number; // 同日后补
  };
}

export type CalibrationSummaryView =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "ok"; data: CalibrationSummaryData };

const STATES: readonly HistoryFreshnessState[] = ["fresh", "stale", "invalid"];

function isFiniteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function optionalIso(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function metric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * 快照原文 → 摘要视图。空/全空白 = missing（文件尚未生成）；JSON 或契约非法 =
 * invalid（UI 提示重新生成，不用旧数冒充）；其余 = ok。任何字段不符整体判 invalid，
 * 不做部分修补——摘要要么完整可信要么明确失效。
 */
export function parseCalibrationSummary(content: string | null | undefined): CalibrationSummaryView {
  if (typeof content !== "string" || content.trim() === "") return { status: "missing" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { status: "invalid" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { status: "invalid" };
  const snapshot = parsed as Record<string, unknown>;
  if (snapshot.schema !== CALIBRATION_SNAPSHOT_SCHEMA) return { status: "invalid" };

  const state = snapshot.state;
  if (typeof state !== "string" || !STATES.includes(state as HistoryFreshnessState)) {
    return { status: "invalid" };
  }
  const score = snapshot.score;
  if (typeof score !== "object" || score === null || Array.isArray(score)) return { status: "invalid" };
  const scoreRecord = score as Record<string, unknown>;
  if (!isFiniteCount(scoreRecord.n)) return { status: "invalid" };
  const brier = metric(scoreRecord.brier);
  const hitRate = metric(scoreRecord.hitRate);
  // n>0 时指标必须存在且有限；n=0 时必须为 null（calibration.ts 契约，防脏数据虚报）。
  if (scoreRecord.n > 0 && (brier === null || hitRate === null)) return { status: "invalid" };
  if (scoreRecord.n === 0 && (scoreRecord.brier !== null || scoreRecord.hitRate !== null)) {
    return { status: "invalid" };
  }
  if (typeof scoreRecord.thresholdPercent !== "number" || !Number.isFinite(scoreRecord.thresholdPercent)) {
    return { status: "invalid" };
  }

  const watch = snapshot.watchComparison;
  if (typeof watch !== "object" || watch === null || Array.isArray(watch)) return { status: "invalid" };
  if (!isFiniteCount((watch as Record<string, unknown>).pairedSamples)) return { status: "invalid" };

  const excludedSource = snapshot.excluded;
  if (typeof excludedSource !== "object" || excludedSource === null || Array.isArray(excludedSource)) {
    return { status: "invalid" };
  }
  const excludedRecord = excludedSource as Record<string, unknown>;
  // 快照原文用 kebab-case 键（calibrationWindows.ts WindowExclusion 序列化形）。
  const excludedCounts = [
    excludedRecord.legacy,
    excludedRecord.invalid,
    excludedRecord.late,
    excludedRecord.pending,
    excludedRecord["outside-history"],
    excludedRecord.duplicate,
  ];
  if (!excludedCounts.every(isFiniteCount)) return { status: "invalid" };
  const [legacy, invalid, late, pending, outsideHistory, duplicate] = excludedCounts as number[];

  const outcomes = snapshot.outcomes;
  if (!Array.isArray(outcomes)) return { status: "invalid" };
  const realizedWindows = outcomes.filter(
    (row) => typeof row === "object" && row !== null && (row as Record<string, unknown>).realized === true,
  ).length;

  const historySource = snapshot.historySource;
  const historyAsOf =
    typeof historySource === "object" && historySource !== null && !Array.isArray(historySource)
      ? optionalIso((historySource as Record<string, unknown>).asOf)
      : null;

  return {
    status: "ok",
    data: {
      state: state as HistoryFreshnessState,
      generatedAt: optionalIso(snapshot.generatedAt),
      historyAsOf,
      coverageStart: optionalIso(snapshot.coverageStart),
      sampleCount: scoreRecord.n,
      realizedWindows,
      brier,
      hitRate,
      thresholdPercent: scoreRecord.thresholdPercent,
      watchPairedSamples: (watch as Record<string, unknown>).pairedSamples as number,
      excluded: { legacy, invalid, late, pending, outsideHistory, duplicate },
    },
  };
}
