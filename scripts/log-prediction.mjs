#!/usr/bin/env node
// scripts/log-prediction.mjs —— RR10/RR15：每日评估落盘器（幂等追加生产predictions.jsonl）。
// 用法：默认写应用 canonical 文件；可用 --path <路径> 指定唯一写入文件。
// 建议先 node scripts/fetch-history.mjs 刷新夹具。
// 算法单一源 src/lib（RUNBOOK §1.4）：风险=assessResetRisk、幂等=appendPredictionLog——
// 本脚本零算法，只做读夹具/调核心/追加写（先例 calibrate.mjs，D016 node ≥22.18 原生
// type-stripping 直载 .ts）。
// RR17评估/窗口起点=本次捕获时刻；历史fetchedAt独立验证新鲜度，不倒签旧预测。
// stale/invalid来源不能写入当前预测；先刷新历史再落盘。
// 数据锁（RUNBOOK §1.5）：脚本与app共用核心判重，只追加、绝不修改既有行。

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { appendPredictionLog } from "../src/lib/predictions.ts";
import { buildHistoryPrediction } from "../src/lib/historyPrediction.ts";
import { appendPredictionFile, canonicalPredictionPath, parsePredictionPathArg } from "./prediction-files.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const override = parsePredictionPathArg(process.argv.slice(2));
const logPath = override ?? canonicalPredictionPath();

const history = JSON.parse(readFileSync(`${root}data/resets-history.json`, "utf8"));
// 同一逻辑评估时刻留存在窗口起点与fetchedAt；旧历史只作输入，不倒签预测时间。
const evaluatedAt = new Date();
const candidate = buildHistoryPrediction(history, evaluatedAt);
if (!candidate) {
  console.error("[log-prediction] 历史缺失/非法/过期：先刷新历史，不生成当前预测。");
  process.exit(1);
}

const outcome = appendPredictionFile(logPath, (existing) => appendPredictionLog(existing, candidate));

console.log(
  `[log-prediction] date=${candidate.date} predictedRisk=${candidate.predictedRisk}` +
    ` → ${outcome.appended ? `追加（${outcome.reason}）` : `不追加（${outcome.reason}）`}` +
  `；日志现有 ${outcome.lines.length} 行；文件 ${resolve(logPath)}`,
);
if (outcome.appended) {
  console.log(`[log-prediction] factorsDigest=${candidate.factorsDigest}`);
}
