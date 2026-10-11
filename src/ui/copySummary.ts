// RR27：复制摘要文本（02-spec §2「输出单位、模型标签、时刻与 stale 标记」）。纯函数：
// 只拼接 VM/摘要既有字段，不重算任何数字；演示模式必须带标识，绝不冒充实跑。
import type { DashboardViewModel } from "./adapters";
import type { CalibrationSummaryView } from "../lib";
import { beijingFull, creditsLabel, percent1, percentWhole } from "./format";

export function buildCopySummary(
  vm: DashboardViewModel,
  calibration: CalibrationSummaryView,
  options: { live: boolean },
): string {
  const lines: string[] = [];
  lines.push(options.live ? "reset-radar 状态摘要" : "reset-radar 状态摘要（演示数据 · 非本机实采）");
  lines.push(`方案：${vm.provider}${vm.plan != null ? ` · ${vm.plan}` : ""}`);
  lines.push(`周额度剩余：${percentWhole(vm.remainingPercent)}${vm.shortRemainingPercent != null ? `｜短窗剩余：${percentWhole(vm.shortRemainingPercent)}` : ""}`);
  lines.push(`重置卡：${creditsLabel(vm.resetCredits)}`);
  lines.push(`重置风险（未来24h 模型估计）：${vm.risk == null ? "—" : percent1(vm.risk.score)}`);
  if (vm.dailyPlan != null) {
    lines.push(`今日建议追加：+${vm.dailyPlan.suggested.toFixed(1)} 个周额度百分点（建议后剩余 ${vm.dailyPlan.suggestedRemaining.toFixed(1)}%）`);
  }
  if (vm.cardPlan != null) {
    lines.push(`用卡建议：今日期望 +${vm.cardPlan.expectedGainTodayPercent.toFixed(1)} pp / 最佳日 +${vm.cardPlan.expectedGainBestPercent.toFixed(1)} pp（${vm.cardPlan.bestDayLocalDate}）`);
  }
  const observed = beijingFull(vm.observedAt);
  lines.push(`额度观测：${observed ?? "—"}（北京时间）`);
  if (vm.historySource != null && vm.historySource.state !== "fresh") {
    lines.push(`历史来源：${vm.historySource.state === "stale" ? "已过期" : "无效"}（as_of ${vm.historySource.asOf ?? "—"}）——以上建议基于上次观测`);
  }
  if (vm.resetStatus != null && vm.resetStatus.state !== "ok") {
    lines.push(`公告来源：${vm.resetStatus.state === "stale" ? "已过期" : "失败"}（上次尝试 ${beijingFull(vm.resetStatus.lastAttemptAt) ?? "—"}）`);
  }
  if (calibration.status === "ok") {
    const data = calibration.data;
    lines.push(
      data.sampleCount === 0
        ? "校准：数据积累中（n=0）"
        : `校准：n=${data.sampleCount}，Brier ${data.brier?.toFixed(3) ?? "—"}，命中率 ${data.hitRate == null ? "—" : `${(data.hitRate * 100).toFixed(1)}%`}（报告时刻 ${beijingFull(data.generatedAt) ?? "—"} 北京时间）`,
    );
  } else {
    lines.push(`校准：${calibration.status === "missing" ? "尚未生成报告" : "报告无效，需重新生成"}`);
  }
  return lines.join("\n");
}
