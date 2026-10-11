// RR23：公告来源的可用性判断在核心，adapter只透传，React不再做一份清仓规则。
import { assessScheduledReset, type ScheduledReset, type ScheduledResetAssessment } from "./scheduledReset.ts";

/** Rust reset_status::ResetStatusSnapshot camelCase契约，旧缓存允许没有整个字段。 */
export interface ResetStatusSnapshot {
  scheduledReset: ScheduledReset | null;
  activeWatch: Record<string, unknown> | null; // B07原文；RR16再接watch因子，不猜上游缺字段
  latestReset: Record<string, unknown> | null;
  fetchedAt: string | null;
  generatedAt: string | null;
  freshUntil: string | null; // 数据层按实际轮询周期提供，核心不另抄TTL常数
  lastAttemptAt: string;
  status: string;
  message: string | null;
}

export interface ResetStatusEvaluation {
  state: "ok" | "stale" | "error";
  announcement: ScheduledResetAssessment | null;
  actionableReset: ScheduledReset | null;
}

/** 失败与stale保留公告信息供展示，停止把它当有效规划输入。精确有效期边界即过期。 */
export function evaluateResetStatus(snapshot: ResetStatusSnapshot, now: Date): ResetStatusEvaluation {
  const nowMs = now.getTime();
  const fetchedMs = Date.parse(snapshot.fetchedAt ?? "");
  const deadline = Date.parse(snapshot.freshUntil ?? "");
  const fresh = Number.isFinite(nowMs) && Number.isFinite(fetchedMs) && Number.isFinite(deadline)
    && fetchedMs <= nowMs && deadline > nowMs && deadline > fetchedMs;
  const state = snapshot.status !== "ok" ? "error" : fresh ? "ok" : "stale";
  const announcement = assessScheduledReset(snapshot.scheduledReset, now);
  return {
    state, announcement,
    actionableReset: state === "ok" && announcement?.state === "planned" && announcement.appliesToQuota
      ? announcement.announcement : null,
  };
}

/** 来源成功时把最新已公布事件并入历史，按时间戳去重；不在UI实现风险模型。 */
export function historyWithResetStatus(history: readonly string[], snapshot: ResetStatusSnapshot, now: Date): readonly string[] {
  if (evaluateResetStatus(snapshot, now).state !== "ok") return history;
  if (snapshot.latestReset?.reset_type !== "regular") return history; // banked发卡并非额度自动回满，D022/B07
  const date = snapshot.latestReset?.announced_at;
  const timestamp = typeof date === "string" ? Date.parse(date) : NaN;
  if (!Number.isFinite(timestamp) || timestamp > now.getTime() || history.some((value) => Date.parse(value) === timestamp)) return history;
  return [...history, date as string];
}
