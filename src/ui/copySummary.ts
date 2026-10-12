// RR27：复制摘要文本（02-spec §2「输出单位、模型标签、时刻与 stale 标记」）。纯函数：
// 只拼接 VM/摘要既有字段，不重算任何数字；演示模式必须带标识，绝不冒充实跑。
import type { DashboardViewModel } from "./adapters";
import type { CalibrationSummaryView, ResetCardDecisionKind } from "../lib";
import { beijingFull, creditsLabel, percent1, percentWhole } from "./format";

/** v2 用卡决策短语（机器键→中文，非业务判断；与 PeekCard.DECISION_SHORT 同口径）。 */
const CARD_DECISION_PHRASE: Record<ResetCardDecisionKind, string> = {
  not_applicable: "暂不适用（无有效周窗或无卡）",
  hold: "暂缓用卡",
  use_today: "建议今天用卡",
  wait: "等待更优用卡时机",
  uncertain: "需求未知 · 结论不稳",
};

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
  lines.push(`重置风险（未来24h 模型估计）：${percent1(vm.riskPercent)}`);
  if (vm.dailyPlan != null) {
    lines.push(
      vm.dailyPlan.todaySuggested == null
        ? "今日建议：需求未知（尚无日耗观测样本，不代入固定配速）"
        : `今日建议追加：+${vm.dailyPlan.todaySuggested.toFixed(1)} 个周额度百分点`,
    );
  }
  if (vm.cardPlan != null) {
    const at = vm.cardPlan.recommendedAt != null ? beijingFull(new Date(vm.cardPlan.recommendedAt).toISOString()) : null;
    lines.push(
      `用卡建议：${CARD_DECISION_PHRASE[vm.cardPlan.decision]}`
        + `（增量期望 +${vm.cardPlan.incrementalUsage.toFixed(1)} pp${at != null ? `，建议时刻 ${at} 北京时间` : ""}）`,
    );
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
