// RR17合成序列：只测纯核心，不向生产日志补样本。
import { describe, expect, it } from "vitest";
import { buildCalibrationSnapshot } from "../calibrationSnapshot.ts";
import { buildHistoryPrediction } from "../historyPrediction.ts";
import { selectCompletedPredictionWindows } from "../calibrationWindows.ts";
import type { PredictionRecord } from "../predictions.ts";

const NOW = new Date("2026-10-10T05:00:00Z");
const row: PredictionRecord = { date: "2026-10-08", predictedRisk: 80, factorsDigest: "",
  fetchedAt: "2026-10-08T05:00:00Z", windowStart: "2026-10-08T05:00:00Z", windowEnd: "2026-10-09T05:00:00Z" };
const document = (events: unknown[] = [], fetchedAt = NOW.toISOString()) => ({ fetchedAt, events, upstream: { pagination: { has_more: false } } });
const event = { resetType: "regular", announcedAt: "2026-10-08T06:00:00Z" };

describe("自动对答案与源覆盖", () => {
  it("没有新事件也结算完整窗口；新增regular自动改变实际结果而不改预测", () => {
    const before = structuredClone(row);
    const missed = buildCalibrationSnapshot(document(), [row], NOW);
    const hit = buildCalibrationSnapshot(document([event]), [row], NOW);
    expect(missed.score).toMatchObject({ n: 1, hitRate: 0, baseRate: 0 });
    expect(missed.score.brier).toBeCloseTo(0.64);
    expect(hit.score).toMatchObject({ n: 1, hitRate: 1, baseRate: 1 });
    expect(hit.score.brier).toBeCloseTo(0.04);
    expect(buildCalibrationSnapshot(document([event]), [row], NOW)).toEqual(hit);
    expect(row).toEqual(before);
  });
  it("banked不改答案；未完成窗口不能抢先结算，即使已经知道一次重置", () => {
    expect(buildCalibrationSnapshot(document([{ ...event, resetType: "banked" }]), [row], NOW).score.brier).toBeCloseTo(0.64);
    const inWindow = new Date("2026-10-08T06:00:00Z");
    const pending = buildCalibrationSnapshot(document([event], inWindow.toISOString()), [row], inWindow);
    expect(pending.score).toMatchObject({ n: 0, brier: null, hitRate: null });
    expect(pending.excluded.pending).toBe(1);
  });
  it("分页截断不能把最早已返回事件之前的窗口算作未重置", () => {
    const partial = { ...document([{ resetType: "regular", announcedAt: "2026-10-09T06:00:00Z" }]), upstream: { pagination: { has_more: true } } };
    const output = buildCalibrationSnapshot(partial, [row], NOW);
    expect(output.score.n).toBe(0);
    expect(output.excluded["outside-history"]).toBe(1);
    expect(output.watchComparison.pairedSamples).toBe(0);
  });
  it("历史非法不退墙钟，stale只报告原覆盖内旧成绩", () => {
    expect(buildCalibrationSnapshot({ fetchedAt: "bad", events: [] }, [row], NOW)).toMatchObject({ state: "invalid", score: { n: 0, brier: null } });
    expect(buildCalibrationSnapshot({ fetchedAt: NOW.toISOString(), events: null }, [row], NOW).score.n).toBe(0);
    expect(buildCalibrationSnapshot(document([event]), [row], new Date("2026-10-18T05:00:00Z"))).toMatchObject({ state: "stale", score: { n: 1 } });
  });
  it("同日首行按记录时刻选择，后补不能改变概率；非法旧行单独列排除", () => {
    const later = { ...row, predictedRisk: 10, fetchedAt: "2026-10-08T06:00:00Z", windowStart: "2026-10-08T06:00:00Z", windowEnd: "2026-10-09T06:00:00Z" };
    const old = { date: row.date, predictedRisk: 90 };
    const output = selectCompletedPredictionWindows([later, old, row], [event.announcedAt], NOW);
    expect(output.windows[0]).toMatchObject({ predictedPercent: 80, realized: true });
    expect(output.excluded).toMatchObject({ legacy: 1, duplicate: 1 });
  });
});

describe("CLI预测时点", () => {
  it("历史fetchedAt只判新鲜度，评估和24h起点统一为本次逻辑时刻", () => {
    const candidate = buildHistoryPrediction(document([], "2026-10-09T05:00:00Z"), NOW);
    expect(candidate).toMatchObject({ date: "2026-10-10", fetchedAt: NOW.toISOString(), windowStart: NOW.toISOString(), windowEnd: "2026-10-11T05:00:00.000Z" });
    expect(buildHistoryPrediction(document([], "2026-10-01T05:00:00Z"), NOW)).toBeNull();
    expect(buildHistoryPrediction(document([], "2026-10-11T05:00:00Z"), NOW)).toBeNull();
  });
});
