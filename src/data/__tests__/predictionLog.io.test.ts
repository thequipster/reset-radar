import { describe, expect, it } from "vitest";
import { persistPrediction, type PredictionLogPort } from "../predictionLog";
import type { PredictionRecord } from "../../lib";
const row: PredictionRecord = { date: "2026-10-11", predictedRisk: 25.4, factorsDigest: "weekday=3", fetchedAt: "2026-10-11T05:00:00Z" };
function store(initial = "") {
  let content = initial; let appended = 0;
  const port: PredictionLogPort = {
    read: async () => ({ path: "app/predictions.jsonl", content }),
    append: async (expected, line) => {
      if (expected !== content) return "conflict";
      content += (content && !content.endsWith("\n") ? "\n" : "") + line + "\n"; appended++; return "appended";
    },
  };
  return { port, contents: () => content, writes: () => appended };
}
describe("预测日志IO编排", () => {
  it("首评/噪声/0.5边界/0.6漂移均使用核心规则", async () => {
    const data = store();
    expect((await persistPrediction(data.port, row)).reason).toBe("first-of-day");
    expect((await persistPrediction(data.port, row)).appended).toBe(false);
    expect((await persistPrediction(data.port, { ...row, predictedRisk: 25.9 })).appended).toBe(false);
    expect((await persistPrediction(data.port, { ...row, predictedRisk: 26 })).reason).toBe("risk-drift");
    expect(data.writes()).toBe(2);
  });
  it("同时首次评估通过CAS重读不会写两条同值记录", async () => {
    const data = store();
    const results = await Promise.all([persistPrediction(data.port, row, async () => {}), persistPrediction(data.port, row, async () => {})]);
    expect(data.writes()).toBe(1);
    expect(results.map((r) => r.appended).sort()).toEqual([false, true]);
  });
  it("坏行/CRLF/未结尾换行的原文作为CAS依据，不重写已有字节", async () => {
    const original = "bad\r\ntruncated"; const data = store(original);
    await persistPrediction(data.port, row);
    expect(data.contents().startsWith(original + "\n")).toBe(true);
    expect(data.writes()).toBe(1);
  });
  it("busy有限重试；之后报失败，不能伪造成功", async () => {
    let attempts = 0;
    const port: PredictionLogPort = { read: async () => ({ path: "x", content: "" }), append: async () => { attempts++; return "busy"; } };
    await expect(persistPrediction(port, row, async () => {})).rejects.toThrow("其他写者");
    expect(attempts).toBe(5);
  });
  it("读盘失败原样报告且不调用追加", async () => {
    let writes = 0;
    const port: PredictionLogPort = { read: async () => { throw new Error("denied"); }, append: async () => { writes++; return "appended"; } };
    await expect(persistPrediction(port, row)).rejects.toThrow("denied"); expect(writes).toBe(0);
  });
});
