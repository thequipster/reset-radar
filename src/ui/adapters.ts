// 快照 → 视图模型 的纯映射层（RR09 建立，RR45 切算法 v2：统一事件流 + 周期状态机）。
// ARCHITECTURE §2：本文件不做业务判断，一切数字/建议都来自 src/lib 纯核心；
// 这里只负责喂参、透传与展示态装配（D006）。v2 接线口径（D033）：
//   - 事件流：resets-history 公开夹具=平台公告执行（scope=global）；实时公告来源 ok 时
//     latestReset(regular) 为本账号观测（scope=account），按时间戳去重不重复计数；
//   - watch：上游 WatchSignalAssessment 只有 percent/observedAt，无 v2 四项口径证据
//     （targetMatches/windowHours/includesAnnouncedOrNatural），恒判 reference-only 并列
//     展示、不融合（占位字段值不参与判定）；
//   - 周期规则：上游无周期时长观测，用 DEFAULT_CYCLE_RULES（assumed，riskV2 会如实记账）；
//   - 卡过期时刻：上游不产出（models.rs 裁剪注记），expiresAt 取安全上界（候选窗已被
//     maxCandidateDays≤14 天限制），不伪造真实过期；
//   - 日耗样本：RR45 观测日志落地前无样本源，estimateDemand([]) 诚实给出「需求未知」。
import {
  assessResetRiskV2,
  trainRates,
  type ResetRiskV2,
  type WatchSignal,
  estimateDemand,
  planPaceV2,
  type PacePlanV2,
  planResetCardV2,
  type ResetCardDecisionV2,
  splitObservationSegments,
  createInitialState,
  historyEvents,
  type ResetEvent,
  type QuotaState,
  evaluateResetStatus,
  type ResetStatusSnapshot,
  type ResetStatusEvaluation,
  assessHistorySource,
  type HistorySourceAssessment,
  type CalibrationSummaryView,
  buildPredictionRecord,
  type PredictionRecord,
} from "../lib";
import type { ProviderSnapshot } from "./types";

export const MS_PER_DAY = 86_400_000; // 单位换算（ms→天），非业务公式

const round1 = (value: number) => Math.round(value * 10) / 10;

/** 视图模型：三块面板数据 + 新鲜度元信息。字段可空 = 该面板因数据缺失不展示。 */
export interface DashboardViewModel {
  provider: string;
  displayName: string;
  status: string;
  message: string | null;
  plan: string | null;
  /** 周窗剩余额度 %（胶囊主数字）。 */
  remainingPercent: number | null;
  resetsAt: string | null;
  resetCredits: number | null;
  /** 短窗剩余 %（辅助展示）。 */
  shortRemainingPercent: number | null;
  updatedAt: string;
  /** 额度观测时刻；与公告抓取、风险评估时刻分开。旧快照无公告来源时仍为风险as_of。 */
  observedAt: string;
  risk: ResetRiskV2;
  /** probability24h×100（1 位小数）——UI 全站统一 0-100 展示口径，换算只在此一处。 */
  riskPercent: number;
  dailyPlan: PacePlanV2 | null;
  cardPlan: ResetCardDecisionV2 | null;
  resetStatus: (ResetStatusSnapshot & ResetStatusEvaluation) | null;
  riskEvaluatedAt: string;
  prediction: PredictionRecord | null;
  /** 离线历史独立来源时刻/数量/过期状态，不和实时公告混成一个状态。 */
  historySource: HistorySourceAssessment | null;
  /** RR28只读校准摘要：missing=尚未生成，invalid=坏文件需重生成，ok=真实计分（n=0=积累中）。 */
  calibrationSummary: CalibrationSummaryView;
}

/** 实时公告来源 ok 时的最近 regular 重置 → 账号口径事件（与夹具按时间戳去重）。
 *  banked 发卡并非额度自动回满（D022/B07），只有 regular 计入。 */
function liveAccountEvent(
  status: ResetStatusSnapshot | null,
  evaluation: ResetStatusEvaluation | null,
  events: readonly ResetEvent[],
  nowMs: number,
): ResetEvent | null {
  if (status == null || evaluation?.state !== "ok") return null;
  if (status.latestReset?.reset_type !== "regular") return null;
  const date = status.latestReset?.announced_at;
  const at = typeof date === "string" ? Date.parse(date) : NaN;
  if (!Number.isFinite(at) || at > nowMs) return null;
  if (events.some((event) => event.occurredAt === at)) return null;
  return {
    id: `live-${date}`,
    kind: "announced",
    occurredAt: at,
    timePrecision: "exact",
    scope: "account",
    source: "reset-status",
  };
}

/** 旧 watch 评估 → v2 WatchSignal。上游无口径四项证据 → targetMatches 恒 false（D033）：
 *  riskV2 判 reference-only 并列展示不融合；windowHours/includesAnnouncedOrNatural 为
 *  占位值，assessWatchComparability 在 targetMatches=false 处短路，不会消费它们。 */
function toWatchSignal(evaluation: ResetStatusEvaluation | null): WatchSignal | null {
  const watch = evaluation?.watch;
  if (watch == null || watch.percent == null || watch.observedAt == null) return null;
  const updatedAt = Date.parse(watch.observedAt);
  if (!Number.isFinite(updatedAt)) return null;
  return {
    probability: watch.percent / 100,
    updatedAt,
    targetMatches: false,
    windowHours: 24,
    includesAnnouncedOrNatural: false,
  };
}

/** 存续曲线（hours→survival，0–72h 每 6h 一点）→ 任意时刻查询函数（线性插值）。
 *  超出曲线末端按末端值保持（指数衰减下偏保守）；曲线缺失恒 1。单位换算与插值，非业务公式。 */
export function survivalAtFromCurve(
  curve: readonly { hours: number; survival: number }[],
): (at: number) => number {
  if (curve.length === 0) return () => 1;
  return (at: number) => {
    const hours = at / 3_600_000;
    if (hours <= curve[0]!.hours) return curve[0]!.survival;
    for (let i = 1; i < curve.length; i += 1) {
      const prev = curve[i - 1]!;
      const point = curve[i]!;
      if (hours <= point.hours) {
        const t = (hours - prev.hours) / (point.hours - prev.hours);
        return prev.survival + t * (point.survival - prev.survival);
      }
    }
    return curve[curve.length - 1]!.survival;
  };
}

/**
 * 组装仪表盘视图模型（RR45 起 v2 链路：事件流 → riskV2 → paceV2/cardV2）。
 * @param snapshot RR08 get_snapshots / background-snapshots-updated 的单条快照
 * @param history 已清洗的 announcedAt ISO 串（data/resets-history.json 夹具口径，RR03）
 */
export function buildDashboard(
  snapshot: ProviderSnapshot,
  history: readonly string[],
  now: Date = new Date(),
  historyDocument?: unknown,
  calibrationSummary?: CalibrationSummaryView,
): DashboardViewModel {
  const observedAt =
    snapshot.rateLimitSnapshot?.observedAt ?? snapshot.updatedAt;
  // risk 的 now = 数据新鲜度时刻（as_of 语义）；解析失败退墙钟。
  const observedMs = Date.parse(observedAt);
  const asOf = Number.isFinite(observedMs) ? new Date(observedMs) : now;

  const status = snapshot.resetStatus ?? null;
  const statusEvaluation = status == null ? null : evaluateResetStatus(status, now);
  // 公告来源 ok 时以墙钟为模型时刻（公告是「现在」的信息），否则退额度观测时刻。
  const modelAsOf = statusEvaluation?.state === "ok" ? now : asOf;
  const modelAsOfMs = modelAsOf.getTime();

  // —— 事件流（v2 §1）：平台夹具 + 账号实时观测，scope 分列不混淆 ——
  const events = historyEvents(history);
  const live = liveAccountEvent(status, statusEvaluation, events, modelAsOfMs);
  if (live != null) events.push(live);

  // —— 周期状态机（v2 §1）：快照观测直接作初始状态（历史无余额轨迹，不伪造回放） ——
  const weekly = snapshot.weeklyWindow;
  const remaining =
    weekly != null && Number.isFinite(weekly.remainingPercent)
      ? weekly.remainingPercent
      : null;
  const resetsAt = weekly?.resetsAt ?? null;
  const resetsAtMs = resetsAt != null ? Date.parse(resetsAt) : NaN;
  const hasLiveWindow = remaining != null && resetsAt != null && Number.isFinite(resetsAtMs);

  const actionableReset = statusEvaluation?.actionableReset ?? null;
  const watch = toWatchSignal(statusEvaluation);
  const state: QuotaState = createInitialState({
    remaining: remaining ?? 100,
    nextNaturalResetAt: hasLiveWindow ? resetsAtMs : null,
    cardsRemaining: snapshot.resetCredits ?? 0,
    scheduleConfidence: hasLiveWindow ? "observed" : "unknown",
  });

  // —— 风险层（v2 §3）：24h 概率 + 因子步骤 + 存续曲线 ——
  const interventionAtMs =
    actionableReset != null ? Date.parse(actionableReset.scheduledFor) : NaN;
  const plannedIntervention =
    Number.isFinite(interventionAtMs) &&
    interventionAtMs - modelAsOfMs > 0 &&
    interventionAtMs - modelAsOfMs <= MS_PER_DAY;
  const risk = assessResetRiskV2({ events, now: modelAsOfMs, watch, plannedIntervention });
  const riskPercent = round1(risk.probability24h * 100);

  // —— 配速层（v2 §4）：需求未知时诚实不分配（观测日志落地前恒为 unknown，D033） ——
  const dailyPlan =
    hasLiveWindow && resetsAtMs > modelAsOfMs
      ? planPaceV2({
          now: modelAsOfMs,
          remaining: remaining as number,
          nextNaturalResetAt: resetsAtMs,
          assumedAnnouncementAt: Number.isFinite(interventionAtMs) ? interventionAtMs : null,
          demand: estimateDemand([], modelAsOfMs),
          survivalAt: survivalAtFromCurve(risk.survivalCurve),
        })
      : null;

  // —— 用卡层（v2 §5）：与风险层同口径 rateTable（scope 沿 risk 实际判定值） ——
  const coverage = splitObservationSegments(events, modelAsOfMs).map((segment) => ({
    from: segment.startAt,
    to: segment.endAt ?? modelAsOfMs,
  }));
  const rateTable = trainRates({ events, coverage, now: modelAsOfMs, scope: risk.scope });
  const cardPlan =
    hasLiveWindow && resetsAtMs > modelAsOfMs
      ? planResetCardV2({
          now: modelAsOfMs,
          state,
          cards: Array.from({ length: state.cardsRemaining }, (_, index) => ({
            id: `card-${index + 1}`,
            expiresAt: Number.MAX_SAFE_INTEGER,
          })),
          demand: estimateDemand([], modelAsOfMs),
          rateTable,
          announcements:
            Number.isFinite(interventionAtMs) ? [{ at: interventionAtMs }] : [],
        })
      : null;

  return {
    provider: snapshot.provider,
    displayName: snapshot.displayName,
    status: snapshot.status,
    message: snapshot.message,
    plan: snapshot.plan,
    remainingPercent: remaining,
    resetsAt,
    resetCredits: snapshot.resetCredits,
    shortRemainingPercent:
      snapshot.shortWindow != null &&
      Number.isFinite(snapshot.shortWindow.remainingPercent)
        ? snapshot.shortWindow.remainingPercent
        : null,
    updatedAt: snapshot.updatedAt,
    observedAt,
    risk,
    riskPercent,
    dailyPlan,
    cardPlan,
    resetStatus: status != null && statusEvaluation != null ? { ...status, ...statusEvaluation } : null,
    riskEvaluatedAt: modelAsOf.toISOString(),
    historySource: historyDocument === undefined ? null : assessHistorySource(historyDocument, now),
    calibrationSummary: calibrationSummary ?? { status: "missing" },
    prediction: buildPredictionRecord({
      risk,
      evaluatedAt: modelAsOf.toISOString(),
      recordedAt: now,
      quotaStatus: snapshot.status,
      resetSourceState: statusEvaluation?.state ?? null,
      inputSnapshotId: `${snapshot.provider}@${snapshot.updatedAt}`,
      stateBefore: {
        remaining,
        nextNaturalResetAt: hasLiveWindow ? resetsAtMs : null,
        cardsRemaining: snapshot.resetCredits,
        lastForcedLikeResetAt: state.lastForcedLikeResetAt,
        scheduleConfidence: state.scheduleConfidence,
      },
    }),
  };
}
