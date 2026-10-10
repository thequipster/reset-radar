// RR10 域测试：预测日志幂等追加（卡面验证口径：同日重复调用不重复追加/仅变化超阈值补行）。
import { describe, expect, it } from "vitest";

import {
  PREDICTION_RISK_CHANGE_THRESHOLD,
  appendPredictionLog,
  digestFactors,
  predictionDateKey,
  type PredictionRecord,
} from "../predictions.ts";

const rec = (over: Partial<PredictionRecord> = {}): PredictionRecord => ({
  date: "2026-10-11",
  predictedRisk: 30,
  factorsDigest: "weekday=+20",
  fetchedAt: "2026-10-11T01:00:00.000Z",
  ...over,
});

describe("appendPredictionLog 幂等（卡面口径）", () => {
  it("空日志首评 → 追加一行，reason=first-of-day，字段序=卡面 schema", () => {
    const out = appendPredictionLog([], rec());
    expect(out.appended).toBe(true);
    expect(out.reason).toBe("first-of-day");
    expect(out.lines).toHaveLength(1);
    const row = JSON.parse(out.lines[0]!);
    expect(Object.keys(row)).toEqual([
      "date",
      "predictedRisk",
      "factorsDigest",
      "fetchedAt",
    ]);
    expect(row).toEqual(rec());
  });

  it("同日重复同值 → 不追加（suppressed-noise），行数不变", () => {
    const base = [JSON.stringify(rec())];
    const out = appendPredictionLog(base, rec({ fetchedAt: "2026-10-11T05:00:00.000Z" }));
    expect(out.appended).toBe(false);
    expect(out.reason).toBe("suppressed-noise");
    expect(out.lines).toEqual(base);
  });

  it("同日漂移 0.6 > 阈值 0.5 → 补行（risk-drift）", () => {
    const base = [JSON.stringify(rec({ predictedRisk: 30 }))];
    const out = appendPredictionLog(base, rec({ predictedRisk: 30.6 }));
    expect(out.appended).toBe(true);
    expect(out.reason).toBe("risk-drift");
    expect(out.lines).toHaveLength(2);
  });

  it("同日漂移 0.4 ≤ 阈值 → 抑制（suppressed-noise）", () => {
    const base = [JSON.stringify(rec({ predictedRisk: 30 }))];
    const out = appendPredictionLog(base, rec({ predictedRisk: 30.4 }));
    expect(out.appended).toBe(false);
    expect(out.lines).toHaveLength(1);
  });

  it("边界：同日漂移恰等阈值 0.5 → 抑制（严格大于才补行）", () => {
    const base = [JSON.stringify(rec({ predictedRisk: 30 }))];
    const out = appendPredictionLog(base, rec({ predictedRisk: 30.5 }));
    expect(out.appended).toBe(false);
  });

  it("跨日 → 追加（每日首次评估口径）", () => {
    const base = [JSON.stringify(rec({ date: "2026-10-10" }))];
    const out = appendPredictionLog(base, rec({ date: "2026-10-11" }));
    expect(out.appended).toBe(true);
    expect(out.reason).toBe("first-of-day");
  });

  it("同日多行时与最后一行比较（30 → 30.6 后，30.3 距末行 0.3 → 抑制）", () => {
    const base = [
      JSON.stringify(rec({ predictedRisk: 30 })),
      JSON.stringify(rec({ predictedRisk: 30.6 })),
    ];
    const out = appendPredictionLog(base, rec({ predictedRisk: 30.3 }));
    expect(out.appended).toBe(false);
  });

  it("坏行原样保留、不参与同日判断", () => {
    const base = ["not-json", JSON.stringify(rec({ date: "2026-10-10" }))];
    const out = appendPredictionLog(base, rec());
    expect(out.lines[0]).toBe("not-json");
    expect(out.appended).toBe(true); // 坏行不算 10-11 的既有行
  });

  it("纯函数：不修改输入数组", () => {
    const base = [JSON.stringify(rec())];
    const frozen = [...base];
    appendPredictionLog(base, rec({ predictedRisk: 31 }));
    expect(base).toEqual(frozen);
  });

  it("阈值可显式覆盖（默认导出口径受上述用例覆盖）", () => {
    expect(PREDICTION_RISK_CHANGE_THRESHOLD).toBe(0.5);
    const base = [JSON.stringify(rec({ predictedRisk: 30 }))];
    expect(appendPredictionLog(base, rec({ predictedRisk: 30.4 }), 0.2).appended).toBe(true);
  });
});

describe("digestFactors 因子摘要", () => {
  it("id=delta 逗号连接，delta 取 1 位小数", () => {
    const factors = [
      { id: "weekday", label: "星期", delta: 12.34, note: "" },
      { id: "consecutive", label: "连续", delta: -6.26, note: "" },
    ];
    expect(digestFactors(factors)).toBe("weekday=12.3,consecutive=-6.3");
  });

  it("空因子 → 空串；顺序敏感（数组序即摘要序）", () => {
    expect(digestFactors([])).toBe("");
    const a = [
      { id: "x", label: "", delta: 1, note: "" },
      { id: "y", label: "", delta: 2, note: "" },
    ];
    const b = [a[1]!, a[0]!];
    expect(digestFactors(a)).not.toBe(digestFactors(b));
  });
});

describe("predictionDateKey 北京日键（D004）", () => {
  it("UTC 15:30 → 当日；UTC 17:30（北京次日 01:30）→ 次日", () => {
    expect(predictionDateKey(new Date("2026-10-11T15:30:00Z"))).toBe("2026-10-11");
    expect(predictionDateKey(new Date("2026-10-11T17:30:00Z"))).toBe("2026-10-12");
  });
});
