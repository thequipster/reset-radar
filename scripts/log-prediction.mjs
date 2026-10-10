#!/usr/bin/env node
// scripts/log-prediction.mjs —— RR10：每日评估落盘器（幂等追加 data/predictions.jsonl）。
// 用法：node scripts/log-prediction.mjs（建议先 node scripts/fetch-history.mjs 刷新夹具）。
// 算法单一源 src/lib（RUNBOOK §1.4）：风险=assessResetRisk、幂等=appendPredictionLog——
// 本脚本零算法，只做读夹具/调核心/追加写（先例 calibrate.mjs，D016 node ≥22.18 原生
// type-stripping 直载 .ts）。
// as_of = 历史夹具 fetchedAt（数据新鲜度时刻，与 calibrate.mjs 同口径）：date=as_of 北京日键
// ——夹具滞后时评估的是「数据新鲜度所在日」（诚实语义），所以先刷新夹具再落盘。
// 数据锁（RUNBOOK §1.5）：本脚本是 predictions.jsonl 的唯一写者，只追加、绝不修改既有行。

import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { appendPredictionLog, digestFactors, predictionDateKey } from "../src/lib/predictions.ts";
import { assessResetRisk } from "../src/lib/risk.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const logPath = `${root}data/predictions.jsonl`;

const history = JSON.parse(readFileSync(`${root}data/resets-history.json`, "utf8"));
const announcedAt = history.events
  .map((e) => e?.announcedAt)
  .filter((v) => typeof v === "string");
const fetchedAtMs = Date.parse(history.fetchedAt ?? "");
if (!Number.isFinite(fetchedAtMs)) {
  console.error("[log-prediction] 夹具 fetchedAt 缺失/非法：先跑 node scripts/fetch-history.mjs");
  process.exit(1);
}
const asOf = new Date(fetchedAtMs);

const risk = assessResetRisk(announcedAt, asOf);
const candidate = {
  date: predictionDateKey(asOf),
  predictedRisk: risk.score,
  factorsDigest: digestFactors(risk.factors),
  fetchedAt: new Date().toISOString(),
};

let existing = [];
try {
  existing = readFileSync(logPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim());
} catch (err) {
  if (err?.code !== "ENOENT") throw err; // 首次落盘：文件尚不存在
}

const outcome = appendPredictionLog(existing, candidate);
if (outcome.appended) {
  // 新行一律取自 appendPredictionLog 的序列化结果（单一序列化源）
  appendFileSync(logPath, outcome.lines[outcome.lines.length - 1] + "\n");
}

console.log(
  `[log-prediction] date=${candidate.date} predictedRisk=${candidate.predictedRisk}` +
    ` → ${outcome.appended ? `追加（${outcome.reason}）` : `不追加（${outcome.reason}）`}` +
    `；日志现有 ${outcome.lines.length} 行`,
);
if (outcome.appended) {
  console.log(`[log-prediction] factorsDigest=${candidate.factorsDigest}`);
}
