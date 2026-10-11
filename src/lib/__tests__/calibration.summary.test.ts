// RR28 域测试：校准摘要只读映射。真值=scripts/refresh-calibration 落盘的
// reset-radar/calibration@1 快照（唯一生产者，buildCalibrationSnapshot 直序列化）；
// golden 对账用核心真实输出回灌，不手造第二份指标。
import { describe, expect, it } from "vitest";
import { parseCalibrationSummary } from "../calibrationSummary.ts";
import { buildCalibrationSnapshot } from "../calibrationSnapshot.ts";
import type { PredictionRecord } from "../predictions.ts";

const NOW = new Date("2026-10-10T05:00:00Z");
const ROW: PredictionRecord = {
  date: "2026-10-08", predictedRisk: 80, factorsDigest: "",
  fetchedAt: "2026-10-08T05:00:00Z", windowStart: "2026-10-08T05:00:00Z", windowEnd: "2026-10-09T05:00:00Z",
};
const HISTORY = (events: unknown[], fetchedAt = NOW.toISOString()) => ({
  fetchedAt, events, upstream: { pagination: { has_more: false } },
});
const serialize = (snapshot: unknown) => `${JSON.stringify(snapshot)}\n`;

describe("三态判定", () => {
  it("空输入=missing：null/undefined/空白串", () => {
    expect(parseCalibrationSummary(null)).toEqual({ status: "missing" });
    expect(parseCalibrationSummary(undefined)).toEqual({ status: "missing" });
    expect(parseCalibrationSummary("")).toEqual({ status: "missing" });
    expect(parseCalibrationSummary("  \r\n ")).toEqual({ status: "missing" });
  });

  it("坏JSON或契约不符=invalid：整体判废不做部分修补", () => {
    const ok = serialize(buildCalibrationSnapshot(HISTORY([{ resetType: "regular", announcedAt: "2026-10-08T06:00:00Z" }]), [ROW], NOW));
    // 变异构造器：深拷贝真实快照后覆写单个字段（spread 目标先收窄成 record）。
    const mutate = (path: string[], value: unknown) => {
      const clone = JSON.parse(ok) as Record<string, unknown>;
      let cursor = clone;
      for (let i = 0; i < path.length - 1; i += 1) {
        cursor = cursor[path[i]] as Record<string, unknown>;
      }
      cursor[path[path.length - 1]] = value;
      return serialize(clone);
    };
    expect(parseCalibrationSummary("not-json")).toEqual({ status: "invalid" });
    expect(parseCalibrationSummary("[]")).toEqual({ status: "invalid" });
    expect(parseCalibrationSummary(mutate(["schema"], "reset-radar/calibration@2"))).toEqual({ status: "invalid" });
    expect(parseCalibrationSummary(mutate(["state"], "unknown"))).toEqual({ status: "invalid" });
    expect(parseCalibrationSummary(mutate(["score"], null))).toEqual({ status: "invalid" });
    expect(parseCalibrationSummary(mutate(["score", "n"], -1))).toEqual({ status: "invalid" });
    // n>0 必须有有限指标；n=0 指标必须为 null——两头都堵，脏数据不能虚报也不能漏报。
    // golden 是 n=1+brier 实数：brier→null 覆盖「n>0 无指标」，n→0 覆盖「n=0 带指标」。
    expect(parseCalibrationSummary(mutate(["score", "brier"], null))).toEqual({ status: "invalid" });
    expect(parseCalibrationSummary(mutate(["score", "n"], 0))).toEqual({ status: "invalid" });
    expect(parseCalibrationSummary(mutate(["watchComparison", "pairedSamples"], "many"))).toEqual({ status: "invalid" });
    expect(parseCalibrationSummary(mutate(["excluded", "legacy"], undefined))).toEqual({ status: "invalid" });
    expect(parseCalibrationSummary(mutate(["outcomes"], "none"))).toEqual({ status: "invalid" });
  });
});

describe("golden 对账：核心真实输出 → 序列化 → 映射", () => {
  it("有计分样本：字段与快照逐项相等", () => {
    const events = [{ resetType: "regular", announcedAt: "2026-10-08T06:00:00Z" }];
    const snapshot = buildCalibrationSnapshot(HISTORY(events), [ROW], NOW);
    const view = parseCalibrationSummary(serialize(snapshot));
    expect(view.status).toBe("ok");
    if (view.status !== "ok") return;
    expect(view.data).toEqual({
      state: "fresh",
      generatedAt: NOW.toISOString(),
      historyAsOf: NOW.toISOString(),
      coverageStart: null,
      sampleCount: 1,
      realizedWindows: 1,
      brier: snapshot.score.brier,
      hitRate: snapshot.score.hitRate,
      thresholdPercent: 50,
      watchPairedSamples: 0,
      excluded: { legacy: 0, invalid: 0, late: 0, pending: 0, outsideHistory: 0, duplicate: 0 },
    });
  });

  it("零样本（旧行全排除）= ok 且 n=0 指标 null：生产当前真实形态", () => {
    const legacyRow = { date: "2026-10-09", predictedRisk: 32.1 } as unknown as PredictionRecord;
    const snapshot = buildCalibrationSnapshot(HISTORY([]), [legacyRow], NOW);
    expect(snapshot.score.n).toBe(0);
    const view = parseCalibrationSummary(serialize(snapshot));
    expect(view).toEqual({
      status: "ok",
      data: {
        state: "fresh",
        generatedAt: NOW.toISOString(),
        historyAsOf: NOW.toISOString(),
        coverageStart: null,
        sampleCount: 0,
        realizedWindows: 0,
        brier: null,
        hitRate: null,
        thresholdPercent: 50,
        watchPairedSamples: 0,
        excluded: { legacy: 1, invalid: 0, late: 0, pending: 0, outsideHistory: 0, duplicate: 0 },
      },
    });
  });

  it("stale 与分页截断覆盖边界透传不改动", () => {
    const stale = parseCalibrationSummary(
      serialize(buildCalibrationSnapshot(HISTORY([{ resetType: "regular", announcedAt: "2026-10-08T06:00:00Z" }], "2026-10-01T00:00:00Z"), [ROW], NOW)),
    );
    expect(stale).toMatchObject({ status: "ok", data: { state: "stale", historyAsOf: "2026-10-01T00:00:00.000Z" } });
    const truncated = { ...HISTORY([{ resetType: "regular", announcedAt: "2026-10-09T06:00:00Z" }]), upstream: { pagination: { has_more: true } } };
    const partial = parseCalibrationSummary(serialize(buildCalibrationSnapshot(truncated, [ROW], NOW)));
    expect(partial).toMatchObject({ status: "ok", data: { sampleCount: 0, excluded: { outsideHistory: 1 } } });
  });
});
