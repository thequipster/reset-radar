// RR17：CLI预测以本次评估时刻开启24h窗口；旧历史只提供模型输入，不能充当预测时刻。
// RR45：切 v2 口径——事件流（平台 scope=global）→ assessResetRiskV2 → §7.1 预测记录。
// CLI 没有额度快照/卡数观测，stateBeforePrediction 相关字段如实为 null（不伪造）。
import { assessHistorySource, historyEvents, selectQuotaResetHistory } from "./history.ts";
import { assessWatchSignal } from "./watchSignal.ts";
import { assessResetRiskV2, type WatchSignal } from "./riskV2.ts";
import { buildPredictionRecord } from "./predictions.ts";

export function buildHistoryPrediction(history: unknown, evaluatedAt: Date) {
  const source = assessHistorySource(history, evaluatedAt);
  if (source.state !== "fresh") return null;
  const document = history as { events: unknown[]; status?: { active_watch?: unknown } };
  const watch = assessWatchSignal(document.status?.active_watch, evaluatedAt);
  // 与 adapters 同口径（D033）：上游 watch 无 v2 四项口径证据 → targetMatches=false，
  // riskV2 判 reference-only 并列展示不融合；占位字段值不参与判定。
  const watchSignal: WatchSignal | null =
    watch.percent != null && watch.observedAt != null && Number.isFinite(Date.parse(watch.observedAt))
      ? {
          probability: watch.percent / 100,
          updatedAt: Date.parse(watch.observedAt),
          targetMatches: false,
          windowHours: 24,
          includesAnnouncedOrNatural: false,
        }
      : null;
  const risk = assessResetRiskV2({
    events: historyEvents(selectQuotaResetHistory(document.events)),
    now: evaluatedAt.getTime(),
    watch: watchSignal,
  });
  return buildPredictionRecord({
    risk,
    evaluatedAt: evaluatedAt.toISOString(),
    recordedAt: evaluatedAt,
    quotaStatus: "ok",
    resetSourceState: null,
    inputSnapshotId: `cli-history@${source.fetchedAt ?? "unknown"}`,
    stateBefore: {
      remaining: null,
      nextNaturalResetAt: null,
      cardsRemaining: null,
      lastForcedLikeResetAt: null,
      scheduleConfidence: "unknown",
    },
  });
}
