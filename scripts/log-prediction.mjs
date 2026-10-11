#!/usr/bin/env node
// scripts/log-prediction.mjs —— RR10/RR15：每日评估落盘器（幂等追加生产predictions.jsonl）。
// 用法：默认写应用 canonical 文件；可用 --path <路径> 指定唯一写入文件。
// 建议先 node scripts/fetch-history.mjs 刷新夹具。
// 算法单一源 src/lib（RUNBOOK §1.4）：风险=assessResetRisk、幂等=appendPredictionLog——
// 本脚本零算法，只做读夹具/调核心/追加写（先例 calibrate.mjs，D016 node ≥22.18 原生
// type-stripping 直载 .ts）。
// as_of = 历史夹具 fetchedAt（数据新鲜度时刻，与 calibrate.mjs 同口径）：date=as_of 北京日键
// ——夹具滞后时评估的是「数据新鲜度所在日」（诚实语义），所以先刷新夹具再落盘。
// 数据锁（RUNBOOK §1.5）：脚本与app共用核心判重，只追加、绝不修改既有行。

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { appendPredictionLog, buildPredictionRecord } from "../src/lib/predictions.ts";
import { assessWatchSignal } from "../src/lib/watchSignal.ts";
import { assessResetRisk } from "../src/lib/risk.ts";
import { assessHistorySource, selectQuotaResetHistory } from "../src/lib/history.ts";
import { appendPredictionFile, canonicalPredictionPath, parsePredictionPathArg } from "./prediction-files.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const override = parsePredictionPathArg(process.argv.slice(2));
const logPath = override ?? canonicalPredictionPath();

const history = JSON.parse(readFileSync(`${root}data/resets-history.json`, "utf8"));
const source = assessHistorySource(history, new Date());
if (source.state === "invalid") {
  console.error("[log-prediction] 夹具 fetchedAt 缺失/非法：先跑 node scripts/fetch-history.mjs");
  process.exit(1);
}
if (source.state === "stale") console.error("[log-prediction] 历史已过期：本次只评估历史fetchedAt所在日，请先刷新历史。");
const announcedAt = selectQuotaResetHistory(history.events);
const asOf = new Date(source.asOf);

const watch = assessWatchSignal(history.status?.active_watch, new Date(), source.state === "fresh");
const risk = assessResetRisk(announcedAt, asOf, watch.percent ?? undefined);
const candidate = buildPredictionRecord({ risk, evaluatedAt: asOf.toISOString(), recordedAt: new Date(),
  quotaStatus: "ok", resetSourceState: null });
if (!candidate) throw new Error("预测候选无效");

const outcome = appendPredictionFile(logPath, (existing) => appendPredictionLog(existing, candidate));

console.log(
  `[log-prediction] date=${candidate.date} predictedRisk=${candidate.predictedRisk}` +
    ` → ${outcome.appended ? `追加（${outcome.reason}）` : `不追加（${outcome.reason}）`}` +
  `；日志现有 ${outcome.lines.length} 行；文件 ${resolve(logPath)}`,
);
if (outcome.appended) {
  console.log(`[log-prediction] factorsDigest=${candidate.factorsDigest}`);
}
