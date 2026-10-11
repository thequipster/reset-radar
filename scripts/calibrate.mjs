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
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { joinPredictionsWithResets, scorePredictions } from "../src/lib/calibration.ts";
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
const lines = [];
const emit = (s = "") => lines.push(s);

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
const predictionPathSummary = predictions.files.map((file) =>
  `${file.label} ${resolve(file.path)}：${file.missing ? "缺失" : `${file.rows} 行有效`}`,
).join("；");
const noPredictionFiles = predictions.files.every((file) => file.missing);

emit("# 校准报告（calibration-latest）");
emit();
emit(`> 生成：${generatedAt}｜命令：\`node scripts/calibrate.mjs > docs/calibration-latest.md\``);
emit();

if (history.missing || history.broken || !Array.isArray(history.events)) {
  emit("## ⚠️ 无法计分");
  emit();
  emit(`- 历史夹具 data/resets-history.json 不可用（${history.missing ? "文件不存在" : history.broken ? "解析失败" : "events 非数组"}）。`);
  emit("- 先运行 `node scripts/fetch-history.mjs` 拉取重置历史，再重新生成本报告。");
  emit();
  process.stdout.write(lines.join("\n") + "\n");
  process.exit(0);
}

const announcedAt = history.events
  .map((e) => e?.announcedAt)
  .filter((v) => typeof v === "string");
const fetchedAtMs = Date.parse(history.fetchedAt ?? "");
const asOf = Number.isFinite(fetchedAtMs) ? new Date(fetchedAtMs) : generatedAtDate();

function generatedAtDate() {
  console.error("[calibrate] 夹具 fetchedAt 缺失/非法，as_of 退化为墙钟（结果仅作骨架参考）");
  return new Date();
}

emit(
  `- 重置历史：data/resets-history.json —— ${announcedAt.length} events（fetchedAt ${history.fetchedAt ?? "缺失"}）`,
);
emit(`- as_of（数据新鲜度时刻）= 夹具 fetchedAt：${asOf.toISOString()}`);

if (noPredictionFiles) {
  emit(`- 预测日志来源：${predictionPathSummary}`);
  emit();
  emit("## ⚠️ 暂无预测日志，无可计分样本");
  emit();
  emit("- 校准闭环需要先积累「每日预测 → 落盘」（应用自动记录，或运行npm run log-prediction）。");
  emit("- 该文件出现后本报告自动给出完整指标；此前本文件仅作报告骨架（REVIEW 拍仍会生成）。");
  emit();
  emit("## 指标口径（供对照）");
  emit();
  emit("| 指标 | 定义 | 参照 |");
  emit("|---|---|---|");
  emit("| Brier 分数 | mean((p − y)²)，y∈{0,1} | 0=完美 / 0.25=恒50% / 1=全错 |");
  emit("| 命中率 | p≥50% 判「会重置」，与实际一致即命中 | 地板=「全猜不重置」=1−基准率 |");
  emit("| 基准率 | 实际重置日占比 | 预测技能的参照基线 |");
  emit();
  process.stdout.write(lines.join("\n") + "\n");
  process.exit(0);
}

emit(
  `- 预测日志来源：${predictionPathSummary}；合计 ${predictions.rows.length} 行有效${predictions.skipped ? ` / ${predictions.skipped} 行坏行跳过` : ""}`,
);

const outcomes = joinPredictionsWithResets(predictions.rows, announcedAt, asOf);
const score = scorePredictions(outcomes);
const realizedDays = outcomes.filter((r) => r.realized).length;

emit(`- 计分日：${score.n} 个（同日多行取首行 + 未完结日剔除；其中实际重置日 ${realizedDays} 个）`);
emit();
emit("## 总分");
emit();
emit("| 指标 | 值 | 解读 |");
emit("|---|---|---|");
emit(`| 计分样本 n | ${score.n} | 每行 = 一个已完结的北京日 |`);
emit(
  `| Brier 分数 | ${fmt(score.brier, (v) => v.toFixed(3))} | 0=完美 / 0.25=恒50%参照 / 1=全错，越低越好 |`,
);
emit(`| 命中率（阈 ${score.thresholdPercent}%） | ${fmt(score.hitRate, pct)} | 阈值化命中占比 |`);
emit(`| 基准率 | ${fmt(score.baseRate, pct)} | 实际重置日占比；「全猜不重置」命中率为 ${score.baseRate === null ? "—" : pct(1 - score.baseRate)} |`);
emit();
emit("## 分周走势（周一起）");
emit();
emit("| 周（周一） | 样本 | Brier | 命中率 |");
emit("|---|---|---|---|");
for (const w of score.byWeek) {
  emit(`| ${w.weekKey} | ${w.n} | ${w.brier.toFixed(3)} | ${pct(w.hitRate)} |`);
}
if (score.byWeek.length === 0) emit("| —（无样本） | | | |");
emit();
emit("## 可靠性曲线（预测十分桶）");
emit();
emit("| 预测区间% | 样本 | 平均预测% | 实际发生% |");
emit("|---|---|---|---|");
for (const b of score.reliability) {
  emit(`| ${b.label} | ${b.n} | ${b.avgPredictedPercent.toFixed(1)} | ${b.observedPercent.toFixed(1)} |`);
}
if (score.reliability.length === 0) emit("| —（无样本） | | | |");
emit();
emit("## 读法");
emit();
emit("- Brier ≤ 0.25 才优于「恒猜 50%」；**样本 < 30 时各项指标仅供参考**。");
emit("- 可靠性表「平均预测」与「实际发生」越贴近对角线，概率越可信；系统性高估/低估即校准偏差方向。");
emit("- 分周 Brier 持续走高 = 模型状态漂移，优先复核 risk 因子与夹具新鲜度。");
emit();

process.stdout.write(lines.join("\n") + "\n");

function pct(v) {
  return `${(v * 100).toFixed(1)}%`;
}

function fmt(v, f) {
  return v === null ? "—（暂无可计分日）" : f(v);
}
