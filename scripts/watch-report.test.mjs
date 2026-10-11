// RR16：报告必须基于前瞻配对元数据；这里仅构造测试输入，不写真实历史。
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateCalibrationReport } from "./calibration-report.mjs";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { readPredictionFiles } from "./prediction-files.mjs";

const base = { date: "2026-10-08", predictedRisk: 27.5, fetchedAt: "2026-10-08T05:00:00Z",
  windowStart: "2026-10-08T05:00:00Z", windowEnd: "2026-10-09T05:00:00Z",
  watchComparison: { weight: 0.25, watchPercent: 80, baselineRisk: 10 } };
const output = (rows) => generateCalibrationReport({
  history: { fetchedAt: "2026-10-11T05:00:00Z", events: [{ resetType: "regular", announcedAt: "2026-10-08T06:00:00Z" }] },
  predictions: { rows, files: [{ path: "test-only.jsonl", label: "测试", missing: false, rows: rows.length }], skipped: 0 },
  generatedAt: "2026-10-11T06:00:00Z",
});

test("同一预先留存窗口分列0%与25%权重，真实调用核心计分", () => {
  const report = output([base]);
  assert.match(report, /\| 不含watch \| 0% \| 1 \| 0\.810 \| 0\.0% \|/);
  assert.match(report, /\| 公开watch \| 25% \| 1 \| 0\.526 \| 0\.0% \|/);
});
test("旧行和事后记录无法伪造paired样本，0不呈现为完美Brier", () => {
  const report = output([{ date: "2026-10-08", predictedRisk: 27.5 },
    { ...base, fetchedAt: "2026-10-08T05:00:01Z" }]);
  assert.match(report, /\| 公开watch \| 25% \| 0 \| —/);
  assert.doesNotMatch(report, /\| 公开watch \| 25% \| 0 \| 0\.000/);
});
test("文件读取保留24h窗口与watch基准元数据，报告不会在IO接线时丢失配对", () => {
  const directory = mkdtempSync(join(tmpdir(), "reset-radar-watch-"));
  const path = join(directory, "prediction.jsonl");
  try {
    writeFileSync(path, JSON.stringify(base) + "\n");
    const data = readPredictionFiles([{ path, label: "测试" }]);
    assert.deepEqual(data.rows[0].watchComparison, base.watchComparison);
    assert.equal(data.rows[0].windowStart, base.windowStart);
    assert.equal(data.rows[0].windowEnd, base.windowEnd);
    assert.match(output(data.rows), /\| 公开watch \| 25% \| 1 \| 0\.526/);
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    assert.ok(directory.split(sep).at(-1).startsWith("reset-radar-watch-"));
    unlinkSync(path);
    rmdirSync(directory);
  }
});
