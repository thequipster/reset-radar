// RR17：CLI预测以本次评估时刻开启24h窗口；旧历史只提供模型输入，不能充当预测时刻。
import { assessHistorySource, selectQuotaResetHistory } from "./history.ts";
import { assessWatchSignal } from "./watchSignal.ts";
import { assessResetRisk } from "./risk.ts";
import { buildPredictionRecord } from "./predictions.ts";

export function buildHistoryPrediction(history: unknown, evaluatedAt: Date) {
  const source = assessHistorySource(history, evaluatedAt);
  if (source.state !== "fresh") return null;
  const document = history as { events: unknown[]; status?: { active_watch?: unknown } };
  const watch = assessWatchSignal(document.status?.active_watch, evaluatedAt);
  const risk = assessResetRisk(selectQuotaResetHistory(document.events), evaluatedAt, watch.percent ?? undefined);
  return buildPredictionRecord({ risk, evaluatedAt: evaluatedAt.toISOString(), recordedAt: evaluatedAt,
    quotaStatus: "ok", resetSourceState: null });
}
