// RR18：真实报告渲染验证，算法由TS核心执行；合成边界是测试输入，非生产夹具。
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateCalibrationReport } from "./calibration-report.mjs";

const fetchedAt = "2026-10-10T12:00:00.000Z";
const history = { fetchedAt, events: [
  { resetType: "regular", announcedAt: "2026-10-08T01:00:00Z" },
  { resetType: "banked", announcedAt: "2026-10-09T01:00:00Z" },
] };
const predictions = { files: [{ label: "测试", path: "sample.jsonl", missing: false, rows: 3 }], skipped: 0,
  rows: ["2026-10-08", "2026-10-09", "2026-10-11"].map((date) => ({ date, predictedRisk: 100, fetchedAt, factorsDigest: "test" })) };
const report = (generatedAt, input = history) => generateCalibrationReport({ history: input, predictions, generatedAt });

test("鲜活历史：仅regular计实际重置；未覆盖的未来日不计分", () => {
  const output = report("2026-10-11T12:00:00Z");
  assert.doesNotMatch(output, /历史数据已过期/);
  assert.match(output, /2 条原始事件 \/ 1 条额度重置/);
  assert.match(output, /计分日：2 个.*实际重置日 1 个/);
  assert.match(output, /\| Brier 分数 \| 0\.500 \|/);
});
test("恰好7日无过期；超过1毫秒顶部红色提示，as_of仍为历史覆盖时刻", () => {
  assert.doesNotMatch(report("2026-10-17T12:00:00.000Z"), /历史数据已过期/);
  const output = report("2026-10-17T12:00:00.001Z");
  assert.match(output, /## 🔴 历史数据已过期/);
  assert.ok(output.indexOf("历史数据已过期") < output.indexOf("重置历史："));
  assert.match(output, /as_of.*2026-10-10T12:00:00.000Z/);
  assert.match(output, /计分日：2 个/);
});
test("非法、缺失或未来fetchedAt：不能墙钟回退，不能输出计分指标", () => {
  for (const value of [undefined, "invalid", "2026-10-12T12:00:00Z"]) {
    const output = report("2026-10-11T12:00:00Z", { ...history, fetchedAt: value });
    assert.match(output, /无法计分/);
    assert.doesNotMatch(output, /## 总分|计分日：|\| Brier 分数 \|/);
  }
});
