import { describe, expect, it } from "vitest";
import { buildPredictionRecord, digestFactorSteps } from "../predictions";
import { assessResetRiskV2 } from "../riskV2";
const now = new Date("2026-10-11T17:00:00Z");
const base = () => ({ risk: assessResetRiskV2({ events: [], now: now.getTime() }), evaluatedAt: "2026-10-11T15:59:00Z",
  recordedAt: now, quotaStatus: "ok", resetSourceState: "ok" as string | null,
  inputSnapshotId: "codex@2026-10-11T16:00:00Z", stateBefore: { remaining: 55,
    nextNaturalResetAt: Date.parse("2026-10-17T05:00:00Z"), cardsRemaining: 3,
    lastForcedLikeResetAt: null, scheduleConfidence: "observed" } });

describe("运行时预测候选", () => {
  it("记录风险评估北京日，执行时间不改变目标日", () => {
    const input = base(); const row = buildPredictionRecord(input)!;
    expect(row.date).toBe("2026-10-11"); // recordedAt北京已经次日。
    expect(row.fetchedAt).toBe(now.toISOString());
    expect(row.predictedRisk).toBe(Math.round(input.risk.probability24h * 1000) / 10);
    expect(row.factorsDigest).toBe(digestFactorSteps(input.risk.factorSteps));
    expect(Object.keys(row)).toEqual(["date", "predictedRisk", "factorsDigest", "fetchedAt", "windowStart", "windowEnd",
      "predictionId", "inputSnapshotId", "trainingDataCutoff", "stateBeforePrediction", "factorSteps", "dataQuality", "assumptions", "modelVersion"]);
    expect(row).toMatchObject({ predictionId: `p-2026-10-11-${Date.parse(input.evaluatedAt)}`, inputSnapshotId: input.inputSnapshotId,
      stateBeforePrediction: { remaining: 55, cardsRemaining: 3, scheduleConfidence: "observed" }, modelVersion: input.risk.modelVersion });
  });
  it("旧契约没有公告来源可记录；存在但失败/过期的来源不冒充新预测", () => {
    expect(buildPredictionRecord({ ...base(), resetSourceState: null })).not.toBeNull();
    for (const state of ["stale", "error"]) expect(buildPredictionRecord({ ...base(), resetSourceState: state })).toBeNull();
  });
  it("额度失败不妨碍独立的新鲜风险；旧契约stale额度不能当新评估", () => {
    for (const quotaStatus of ["stale", "error", "unavailable"]) {
      expect(buildPredictionRecord({ ...base(), quotaStatus })).not.toBeNull();
      expect(buildPredictionRecord({ ...base(), quotaStatus, resetSourceState: null })).toBeNull();
    }
  });
  it("非法/未来评估和记录时间不能生成日志", () => {
    for (const evaluatedAt of ["invalid", "2026-10-11T17:00:01Z"]) expect(buildPredictionRecord({ ...base(), evaluatedAt })).toBeNull();
    expect(buildPredictionRecord({ ...base(), recordedAt: new Date(NaN) })).toBeNull();
  });
  it("缺失或不可信分数不生成伪预测", () => {
    expect(buildPredictionRecord({ ...base(), risk: null })).toBeNull();
    for (const probability24h of [NaN, Infinity, -0.01, 1.01]) expect(buildPredictionRecord({ ...base(), risk: { ...base().risk, probability24h } })).toBeNull();
  });
});
