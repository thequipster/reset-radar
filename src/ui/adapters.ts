// 快照 → 视图模型 的纯映射层（RR09）。ARCHITECTURE §2：本文件不做业务判断，
// 一切数字/建议都来自 src/lib 纯核心；这里只负责喂参、透传与展示态装配（D006）。
import {
  assessResetRisk,
  estimateDailyNeedPercent,
  planDailyUsage,
  planResetCard,
  type DailyUsagePlan,
  type ResetCardPlan,
  type ResetRisk,
} from "../lib";
import type { ProviderSnapshot } from "./types";

export const MS_PER_DAY = 86_400_000; // 单位换算（ms→天），非业务公式

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
  /** 数据新鲜度时刻（risk 的 now 语义，risk.ts 文件头：取快照观测时刻而非墙钟）。 */
  observedAt: string;
  risk: ResetRisk | null;
  dailyPlan: DailyUsagePlan | null;
  cardPlan: ResetCardPlan | null;
}

/**
 * 组装仪表盘视图模型。
 * @param snapshot RR08 get_snapshots / background-snapshots-updated 的单条快照
 * @param history 已清洗的 announcedAt ISO 串（data/resets-history.json 夹具口径，RR03）
 */
export function buildDashboard(
  snapshot: ProviderSnapshot,
  history: readonly string[],
  now: Date = new Date(),
): DashboardViewModel {
  const observedAt =
    snapshot.rateLimitSnapshot?.observedAt ?? snapshot.updatedAt;
  // risk 的 now = 数据新鲜度时刻（as_of 语义）；解析失败退墙钟。
  const observedMs = Date.parse(observedAt);
  const asOf = Number.isFinite(observedMs) ? new Date(observedMs) : now;

  const risk = assessResetRisk(history, asOf);

  const weekly = snapshot.weeklyWindow;
  const remaining =
    weekly != null && Number.isFinite(weekly.remainingPercent)
      ? weekly.remainingPercent
      : null;
  const resetsAt = weekly?.resetsAt ?? null;

  // 今日建议与用卡规划都依赖有效周窗（剩余% + 自然重置时刻），缺失则两块不展示。
  let dailyPlan: DailyUsagePlan | null = null;
  let cardPlan: ResetCardPlan | null = null;
  if (remaining != null && resetsAt != null) {
    const resetsAtMs = Date.parse(resetsAt);
    if (Number.isFinite(resetsAtMs) && resetsAtMs > asOf.getTime()) {
      // daysToReset 是 planner 的入参契约（planner.ts:20），单位换算在调用侧完成。
      const daysToReset = (resetsAtMs - asOf.getTime()) / MS_PER_DAY;
      dailyPlan = planDailyUsage(
        {
          remaining,
          daysToReset,
          risk: risk.score,
          now: asOf,
        },
      );
      cardPlan = planResetCard({
        remainingPercent: remaining,
        resetsAt,
        resetCredits: snapshot.resetCredits,
        creditExpiresAt: null, // 上游 app-server v1 不产出过期时刻（models.rs 裁剪注记）
        // 无日消耗观测样本：走 lib 兜底均匀周配速 100/7（resetCard.ts:137 契约）。
        dailyNeedPercent: estimateDailyNeedPercent([]),
        tomorrowRiskPercent: risk.score,
        now: asOf,
      });
    }
  }

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
    dailyPlan,
    cardPlan,
  };
}
