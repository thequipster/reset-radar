import { describe, expect, it } from "vitest";
import { buildPredictionRecord, digestFactors } from "../predictions";
import { assessResetRisk } from "../risk";
const now = new Date("2026-10-11T17:00:00Z");
const base = () => ({ risk: assessResetRisk([], now), evaluatedAt: "2026-10-11T15:59:00Z",
  recordedAt: now, quotaStatus: "ok", resetSourceState: "ok" as string | null });

describe("运行时预测候选", () => {
  it("记录风险评估北京日，执行时间不改变目标日", () => {
    const input = base(); const row = buildPredictionRecord(input)!;
    expect(row.date).toBe("2026-10-11"); // recordedAt北京已经次日。
    expect(row.fetchedAt).toBe(now.toISOString());
    expect(row.predictedRisk).toBe(input.risk.score);
    expect(row.factorsDigest).toBe(digestFactors(input.risk.factors));
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
    for (const score of [NaN, Infinity, -1, 101]) expect(buildPredictionRecord({ ...base(), risk: { ...base().risk, score } })).toBeNull();
  });
});
