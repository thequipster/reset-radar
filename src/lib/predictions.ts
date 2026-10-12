// 预测日志（RR10 建立骨架，RR45 切 v2 口径 + §7.1 字段）：把「每日评估」幂等追加进
// data/predictions.jsonl——校准闭环的原料（消费端：scripts/calibrate.mjs →
// src/lib/calibration.ts 对答案）。本模块纯函数：不读文件、不读钟、不发网络；
// IO 薄壳在 scripts/log-prediction.mjs 与 src/data/predictionLog.ts（D016/D025）。
// 行 schema：前 4 字段 {date, predictedRisk, factorsDigest, fetchedAt} 保持旧字节兼容
// （calibrationWindows.ts 对账只读这四件），RR16 窗口两件随后；§7.1 v2 字段追加其后
// （predictionId/inputSnapshotId/trainingDataCutoff/stateBeforePrediction/factorSteps/
// dataQuality/assumptions/modelVersion）。旧行的 watchComparison 字段不再产出（v2 无
// watch 融合口径），解析容错照旧。数据锁（RUNBOOK §1.5）：日志只追加不修改。

import { beijingDayKey, DAY_MS } from "./beijing.ts";
import type { FactorStep, ResetRiskV2, RiskQuality } from "./riskV2.ts";

/** 同日补行阈值（0-100 分制）。依据：predictedRisk 输出固定 1 位小数（round1），
 *  0.5=显示精度下界——漂移超 0.5 才是可感知变化，≤0.5 视为噪声不补行。AI 裁决 D019。 */
export const PREDICTION_RISK_CHANGE_THRESHOLD = 0.5;

/** §7.1：预测时点的周期状态快照（stateBeforePrediction）——留痕「预测时站在什么状态上」。 */
export interface StateBeforePrediction {
  remaining: number | null;
  nextNaturalResetAt: string | null;
  cardsRemaining: number | null;
  lastForcedLikeResetAt: string | null;
  scheduleConfidence: string;
}

/** 预测日志行（§7.1 七字段 + 兼容旧四字段 + RR16 窗口两件）。 */
export interface PredictionRecord {
  date: string; // 北京日历键（评估 as_of 所在日）
  predictedRisk: number; // 0-100，assessResetRiskV2().probability24h×100（round1）
  factorsDigest: string; // 因子摘要（digestFactorSteps 生成），人可读对账留痕
  fetchedAt: string; // ISO 串，评估执行时刻（溯源）
  windowStart?: string; // RR16 前瞻评估窗口
  windowEnd?: string;
  /** 旧日志行遗留（v2 前的 watch 融合记录）：解析时保留供 watchCalibration 对账历史，
   *  RR45 起新行不再产出（v2 口径 watch 恒 reference-only 不融合，D033）。 */
  watchComparison?: { weight: number; watchPercent: number; baselineRisk: number };
  // —— §7.1 v2 新字段（RR45 起；类型可选=兼容旧日志行，生产路径由 buildPredictionRecord
  //     无条件全填，predictions.core.test 锁「产出必含全字段」，强度等价于必填）——
  predictionId?: string; // 本行唯一 ID：`p-<date>-<evaluatedMs>`（确定性，重放同参同值）
  inputSnapshotId?: string; // 喂入快照标识（adapters 按 `provider@updatedAt` 构造，D033）
  trainingDataCutoff?: string | null; // 训练数据最后时刻（riskV2.quality.dataRange.to）
  stateBeforePrediction?: StateBeforePrediction;
  factorSteps?: readonly FactorStep[];
  dataQuality?: RiskQuality;
  assumptions?: readonly string[];
  modelVersion?: string;
}

/** 幂等追加结果：lines=追加后完整日志（输入不被修改）；reason 供脚本输出与人读。 */
export interface AppendOutcome {
  lines: string[];
  appended: boolean;
  reason: "first-of-day" | "risk-drift" | "suppressed-noise";
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** 因子摘要：`id=delta‰` 逗号连接（v2 factorSteps 概率为 0-1，按千分位留痕）。
 *  用途=留痕对账，非判等；幂等键（appendPredictionLog 阈值）只看 predictedRisk。 */
export function digestFactorSteps(steps: readonly FactorStep[]): string {
  return steps.map((step) => `${step.id}=${Math.round(step.delta * 1000)}`).join(",");
}

/** 评估 as_of 时刻 → 预测行 date（北京日历键，D004）。 */
export function predictionDateKey(asOf: Date): string {
  return beijingDayKey(asOf.getTime());
}

/** 日志行 → 记录；坏行（非法 JSON / 缺 date / predictedRisk 非 Finite）返回 null。
 *  容错口径与 calibrate.mjs readPredictionRows 同源：跳过不修；§7.1 字段缺省容错。 */
function parseRow(line: string): PredictionRecord | null {
  try {
    const obj = JSON.parse(line);
    if (typeof obj?.date === "string" && Number.isFinite(obj?.predictedRisk)) {
      return {
        date: obj.date,
        predictedRisk: obj.predictedRisk,
        factorsDigest: typeof obj.factorsDigest === "string" ? obj.factorsDigest : "",
        fetchedAt: typeof obj.fetchedAt === "string" ? obj.fetchedAt : "",
        ...(typeof obj.windowStart === "string" ? { windowStart: obj.windowStart } : {}),
        ...(typeof obj.windowEnd === "string" ? { windowEnd: obj.windowEnd } : {}),
        ...(obj.watchComparison && typeof obj.watchComparison === "object"
          ? { watchComparison: obj.watchComparison as PredictionRecord["watchComparison"] }
          : {}),
        ...(typeof obj.predictionId === "string" ? { predictionId: obj.predictionId } : {}),
        ...(typeof obj.inputSnapshotId === "string" ? { inputSnapshotId: obj.inputSnapshotId } : {}),
        ...(obj.trainingDataCutoff === null || typeof obj.trainingDataCutoff === "string"
          ? { trainingDataCutoff: obj.trainingDataCutoff }
          : {}),
        ...(obj.stateBeforePrediction && typeof obj.stateBeforePrediction === "object"
          ? { stateBeforePrediction: obj.stateBeforePrediction }
          : {}),
        ...(Array.isArray(obj.factorSteps) ? { factorSteps: obj.factorSteps } : {}),
        ...(obj.dataQuality && typeof obj.dataQuality === "object" ? { dataQuality: obj.dataQuality } : {}),
        ...(Array.isArray(obj.assumptions) ? { assumptions: obj.assumptions } : {}),
        ...(typeof obj.modelVersion === "string" ? { modelVersion: obj.modelVersion } : {}),
      };
    }
  } catch {
    // 坏行：跳过（不修不删，数据锁）
  }
  return null;
}

/**
 * 幂等追加一条评估进预测日志（纯函数，卡面规则）：
 * - 同日无行 → 追加（reason=first-of-day，每日首次评估）；
 * - 同日已有行 → 仅 |candidate − 同日最后一行| > threshold 时补行（risk-drift），
 *   否则抑制（suppressed-noise）；
 * - 坏行原样保留在输出中，不参与同日判断。
 */
export function appendPredictionLog(
  existing: readonly string[],
  candidate: PredictionRecord,
  threshold: number = PREDICTION_RISK_CHANGE_THRESHOLD,
): AppendOutcome {
  let lastOfDay: PredictionRecord | null = null;
  for (const line of existing) {
    const row = parseRow(line);
    if (row && row.date === candidate.date) lastOfDay = row;
  }
  if (!lastOfDay) {
    return {
      lines: [...existing, JSON.stringify(candidate)],
      appended: true,
      reason: "first-of-day",
    };
  }
  if (Math.abs(candidate.predictedRisk - lastOfDay.predictedRisk) > threshold) {
    return {
      lines: [...existing, JSON.stringify(candidate)],
      appended: true,
      reason: "risk-drift",
    };
  }
  return { lines: [...existing], appended: false, reason: "suppressed-noise" };
}

/** 预测时点的周期状态快照（§7.1 stateBeforePrediction）。字段可空=喂参侧没有该观测。 */
function snapshotStateBefore(state: {
  remaining: number | null;
  nextNaturalResetAt: number | null;
  cardsRemaining: number | null;
  lastForcedLikeResetAt: number | null;
  scheduleConfidence: string;
}): StateBeforePrediction {
  return {
    remaining: state.remaining,
    nextNaturalResetAt:
      state.nextNaturalResetAt != null && Number.isFinite(state.nextNaturalResetAt)
        ? new Date(state.nextNaturalResetAt).toISOString()
        : null,
    cardsRemaining: state.cardsRemaining,
    lastForcedLikeResetAt:
      state.lastForcedLikeResetAt != null && Number.isFinite(state.lastForcedLikeResetAt)
        ? new Date(state.lastForcedLikeResetAt).toISOString()
        : null,
    scheduleConfidence: state.scheduleConfidence,
  };
}

/** RR15：生产评估→记录（RR45 起 v2 输入）。状态与日期检查只在核心，浏览器 demo 由 IO 壳禁止写盘。 */
export function buildPredictionRecord(input: {
  risk: ResetRiskV2 | null;
  evaluatedAt: string;
  recordedAt: Date;
  quotaStatus: string;
  resetSourceState: string | null;
  inputSnapshotId: string;
  stateBefore: Parameters<typeof snapshotStateBefore>[0];
}): PredictionRecord | null {
  const evaluatedMs = Date.parse(input.evaluatedAt);
  const recordedMs = input.recordedAt.getTime();
  const percent = input.risk == null ? null : round1(input.risk.probability24h * 100);
  // 风险不依赖额度余额：有新鲜公告来源时额度失败仍可记录；旧契约靠 quota 观测时刻。
  if ((input.resetSourceState === null ? input.quotaStatus !== "ok" : input.resetSourceState !== "ok")
    || input.risk == null || percent == null || !Number.isFinite(percent) || percent < 0 || percent > 100
    || !Number.isFinite(evaluatedMs) || !Number.isFinite(recordedMs) || evaluatedMs > recordedMs) return null;
  const cutoff = input.risk.quality.dataRange.to;
  return {
    date: predictionDateKey(new Date(evaluatedMs)),
    predictedRisk: percent,
    factorsDigest: digestFactorSteps(input.risk.factorSteps),
    fetchedAt: input.recordedAt.toISOString(),
    windowStart: new Date(evaluatedMs).toISOString(),
    windowEnd: new Date(evaluatedMs + DAY_MS).toISOString(),
    predictionId: `p-${predictionDateKey(new Date(evaluatedMs))}-${evaluatedMs}`,
    inputSnapshotId: input.inputSnapshotId,
    trainingDataCutoff: cutoff != null ? new Date(cutoff).toISOString() : null,
    stateBeforePrediction: snapshotStateBefore(input.stateBefore),
    factorSteps: input.risk.factorSteps,
    dataQuality: input.risk.quality,
    assumptions: input.risk.assumptions,
    modelVersion: input.risk.modelVersion,
  };
}
