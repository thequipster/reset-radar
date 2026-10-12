// RR16 合成数据：只验证纯函数，不读写 data/ 生产预测日志。
import { describe, expect, it } from "vitest";
import { compareWatchPredictions, joinProspectivePredictions } from "../watchCalibration.ts";
import type { PredictionRecord } from "../predictions.ts";

const row = (over: Partial<PredictionRecord> = {}): PredictionRecord => ({
  date: "2026-10-08",
  predictedRisk: 45,
  factorsDigest: "base=45",
  fetchedAt: "2026-10-08T00:00:00.000Z",
  windowStart: "2026-10-08T00:00:00.000Z",
  windowEnd: "2026-10-09T00:00:00.000Z",
  watchComparison: { weight: 0.25, watchPercent: 85, baselineRisk: 20 },
  ...over,
});

describe("compareWatchPredictions 前瞻同样本校准", () => {
  it("分别评分留存基线与含 watch 概率，事件在窗口端点命中", () => {
    const result = compareWatchPredictions([row()], ["2026-10-09T00:00:00Z"], new Date("2026-10-10T00:00:00Z"));
    expect(result.weight).toBe(0.25);
    expect(result.pairedSamples).toBe(1);
    // baseline 20% 对 y=1：Brier .64；含 watch 的行预测 45%：Brier .3025。
    expect(result.withoutWatch.brier).toBeCloseTo(0.64, 10);
    expect(result.withWatch.brier).toBeCloseTo(0.3025, 10);
    expect(result.withoutWatch.hitRate).toBe(0);
    expect(result.withWatch.hitRate).toBe(0);
  });

  it("窗口起点前的重置不算命中，起点本身也不算", () => {
    const paired = joinProspectivePredictions([row()], [
      "2026-10-07T23:59:59.999Z", "2026-10-08T00:00:00Z",
    ], new Date("2026-10-09T00:00:00Z"));
    expect(paired[0]?.realized).toBe(false);
  });

  it("排除 future / 未完成窗口；窗口完成时刻等于 asOf 可纳入", () => {
    const valid = row();
    const future = row({ date: "2026-10-09", windowStart: "2026-10-09T00:00:00Z", windowEnd: "2026-10-10T00:00:00Z", fetchedAt: "2026-10-09T00:00:00Z" });
    expect(joinProspectivePredictions([valid, future], [], new Date("2026-10-09T00:00:00Z"))).toHaveLength(1);
    expect(joinProspectivePredictions([valid], [], new Date("2026-10-08T23:59:59.999Z"))).toHaveLength(0);
  });

  it("同日先选有效窗口首行；首行无 watch 时不以之后补行替代", () => {
    const first = row({ watchComparison: undefined });
    const later = row({ fetchedAt: "2026-10-08T01:00:00Z", windowStart: "2026-10-08T01:00:00Z", windowEnd: "2026-10-09T01:00:00Z", predictedRisk: 80 });
    const completed = new Date("2026-10-09T01:00:00Z");
    expect(joinProspectivePredictions([later], [], completed)).toHaveLength(1);
    expect(joinProspectivePredictions([first, later], [], completed)).toEqual([]);
  });

  it("跳过非法元数据、非严格事前时刻及四字段旧行；空样本分数为 null", () => {
    const invalid = row({ watchComparison: { weight: 0.2, watchPercent: 50, baselineRisk: 50 } });
    const afterStart = row({ fetchedAt: "2026-10-08T00:00:00.001Z" });
    const malformed = row({ watchComparison: { weight: 0.25, watchPercent: Number.NaN, baselineRisk: 50 } });
    const old: PredictionRecord = { date: "2026-10-08", predictedRisk: 50, factorsDigest: "", fetchedAt: "2026-10-08T00:00:00Z" };
    const result = compareWatchPredictions([invalid, afterStart, malformed, old], [], new Date("2026-10-10T00:00:00Z"));
    expect(result.pairedSamples).toBe(0);
    expect(result.withWatch.n).toBe(0);
    expect(result.withWatch.brier).toBeNull();
    expect(result.withoutWatch.brier).toBeNull();
  });

  it("孤立的事后记录也不能进入配对样本", () => {
    const completed = new Date("2026-10-10T00:00:00Z");
    expect(compareWatchPredictions([row()], [], completed).pairedSamples).toBe(1);
    expect(compareWatchPredictions([row({ fetchedAt: "2026-10-08T00:00:00.001Z" })], [], completed).pairedSamples).toBe(0);
  });
});
