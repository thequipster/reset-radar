// RR18：校准报告纯呈现；新鲜度、事件选择与计分唯一实现均在src/lib。
import { resolve } from "node:path";
import { buildCalibrationSnapshot } from "../src/lib/calibrationSnapshot.ts";
import { assessHistorySource, selectQuotaResetHistory, HISTORY_STALE_DAYS } from "../src/lib/history.ts";

export function generateCalibrationReport({ history, predictions, generatedAt }) {
  const lines = [];
  const emit = (s = "") => lines.push(s);
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
    return lines.join("\n") + "\n";
  }

  const source = assessHistorySource(history, new Date(generatedAt));
  if (source.state === "invalid") {
    emit("## ⚠️ 无法计分");
    emit();
    emit("- 历史 fetchedAt 缺失、非法或位于未来；不能使用墙钟代替历史覆盖时刻。");
    emit("- 先运行 `node scripts/fetch-history.mjs`，成功后重新生成本报告。");
    return lines.join("\n") + "\n";
  }
  if (source.state === "stale") {
    emit("## 🔴 历史数据已过期");
    emit();
    emit(`> fetchedAt 距生成时刻 ${source.ageDays.toFixed(1)} 天，超过 ${HISTORY_STALE_DAYS} 天。以下仅计历史覆盖内已完成窗口，不代表当前校准。先刷新历史。`);
    emit();
  }
  const announcedAt = selectQuotaResetHistory(history.events);
  const asOf = new Date(source.asOf);
  emit(
    `- 重置历史：data/resets-history.json —— ${source.totalEvents} 条原始事件 / ${announcedAt.length} 条额度重置（仅regular；排除 ${source.excludedEvents} 条）（fetchedAt ${history.fetchedAt ?? "缺失"}）`,
  );
  emit(`- as_of（数据新鲜度时刻）= 夹具 fetchedAt：${asOf.toISOString()}`);
  const snapshot = buildCalibrationSnapshot(history, predictions.rows, new Date(generatedAt));
  const comparison = snapshot.watchComparison;
  emit();
  emit("## Watch同样本比较（前瞻24h窗口）");
  emit();
  emit("| 策略 | watch权重 | 同样本 n | Brier | 命中率 |");
  emit("|---|---|---|---|---|");
  emit(`| 不含watch | 0% | ${comparison.pairedSamples} | ${fmt(comparison.withoutWatch.brier, (v) => v.toFixed(3))} | ${fmt(comparison.withoutWatch.hitRate, pct)} |`);
  emit(`| 公开watch | ${comparison.weight * 100}% | ${comparison.pairedSamples} | ${fmt(comparison.withWatch.brier, (v) => v.toFixed(3))} | ${fmt(comparison.withWatch.hitRate, pct)} |`);
  emit();
  emit("- 仅同一次预先留存的baseline与watch预测配对，窗口(start,end]已被历史覆盖；不从当前watch或四舍五入因子倒填旧预测。样本不足时指标为空，不能据此宣称25%权重更好。");
  emit();

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
    emit("| 基准率 | 窗口重置发生占比 | 预测技能的参照基线 |");
    emit();
    return lines.join("\n") + "\n";
  }

  emit(
    `- 预测日志来源：${predictionPathSummary}；合计 ${predictions.rows.length} 行有效${predictions.skipped ? ` / ${predictions.skipped} 行坏行跳过` : ""}`,
  );

  const outcomes = snapshot.outcomes;
  const score = snapshot.score;
  const realizedDays = outcomes.filter((r) => r.realized).length;

  emit(`- 计分窗口：${score.n} 个（每天首条合法预测的未来24h，已被历史覆盖；其中发生重置 ${realizedDays} 个）`);
  emit();
  emit(`- 排除：旧行无窗口 ${snapshot.excluded.legacy}；非法 ${snapshot.excluded.invalid}；事后记录 ${snapshot.excluded.late}；待窗口完成 ${snapshot.excluded.pending}；超出历史覆盖 ${snapshot.excluded["outside-history"]}；同日后补 ${snapshot.excluded.duplicate}。旧预测不倒填；事件只匹配(start,end]，不是预测当日。`);
  emit();
  emit("## 总分");
  emit();
  emit("| 指标 | 值 | 解读 |");
  emit("|---|---|---|");
  emit(`| 计分样本 n | ${score.n} | 每行 = 一个已完成24h预测窗口 |`);
  emit(
    `| Brier 分数 | ${fmt(score.brier, (v) => v.toFixed(3))} | 0=完美 / 0.25=恒50%参照 / 1=全错，越低越好 |`,
  );
  emit(`| 命中率（阈 ${score.thresholdPercent}%） | ${fmt(score.hitRate, pct)} | 阈值化命中占比 |`);
  emit(`| 基准率 | ${fmt(score.baseRate, pct)} | 窗口重置发生占比；「全猜不重置」命中率为 ${score.baseRate === null ? "—" : pct(1 - score.baseRate)} |`);
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
  emit("- Brier < 0.25 才优于「恒猜 50%」；**样本 < 30 时各项指标仅供参考**。");
  emit("- 可靠性表「平均预测」与「实际发生」越贴近对角线，概率越可信；系统性高估/低估即校准偏差方向。");
  emit("- 分周 Brier 持续走高 = 模型状态漂移，优先复核 risk 因子与夹具新鲜度。");
  emit();

  return lines.join("\n") + "\n";

  function pct(v) {
    return `${(v * 100).toFixed(1)}%`;
  }

  function fmt(v, f) {
    return v === null ? "—（暂无可计分窗口）" : f(v);
  }

}
