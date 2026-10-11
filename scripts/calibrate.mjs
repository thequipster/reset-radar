#!/usr/bin/env node
// scripts/calibrate.mjs —— RR07：预测 vs 实际 对答案，渲染校准报告 Markdown（REVIEW artifact）。
// 用法（RUNBOOK §9.1）：node scripts/calibrate.mjs [--path <路径>] > docs/calibration-latest.md
// 默认合并仓内归档与应用 canonical 日志；--path 仅读取指定文件。
// 计分实现单一源于 src/lib/calibration.ts（RUNBOOK §1.4 单一实现源，本脚本零算法）；
// 经 node ≥22.18 原生 type-stripping 直载 .ts（本机 v22.23.1 实测；lib 内 import 链带
// .ts 扩展 + tsconfig allowImportingTsExtensions，见 docs/DECISIONS.md D016）。
// as_of 取历史夹具 fetchedAt（数据新鲜度时刻，与 risk.ts now 语义同源）：夹具滞后时，
// 未被历史覆盖的预测日按「未完结」剔除，绝不误判为 realized=false。

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateCalibrationReport } from "./calibration-report.mjs";
import {
  canonicalPredictionPath,
  parsePredictionPathArg,
  readPredictionFiles,
  resolvePredictionPaths,
} from "./prediction-files.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const override = parsePredictionPathArg(process.argv.slice(2));
const predictionSources = resolvePredictionPaths({
  override,
  archivePath: join(root, "data/predictions.jsonl"),
  canonicalPath: canonicalPredictionPath(),
});
const generatedAt = new Date().toISOString();

function readJsonIfExists(path, label) {
  try {
    return JSON.parse(readFileSync(`${root}${path}`, "utf8"));
  } catch (err) {
    if (err?.code === "ENOENT") return { missing: path };
    console.error(`[calibrate] ${label} 解析失败: ${err.message}`);
    return { broken: path, error: err.message };
  }
}

const history = readJsonIfExists("data/resets-history.json", "历史夹具");
let predictions;
try { predictions = readPredictionFiles(predictionSources); }
catch (err) {
  console.error(`[calibrate] ${err.message}`);
  process.exit(1);
}
process.stdout.write(generateCalibrationReport({ history, predictions, generatedAt }));
