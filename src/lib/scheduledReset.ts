// RR22 公告输入契约；RR23 将 B07 /status 的 snake_case 原文适配为此 camelCase 纯数据。
// 公告是计划，不是已发生事件或经校准的概率（docs/design/02-spec.md:192-194）。
export interface ScheduledReset {
  id: string;
  status: string;
  resetType: string;
  announcedAt: string;
  scheduledFor: string;
  text: string;
  source: { type: string; author?: string; url?: string };
}

export interface ScheduledResetAssessment {
  announcement: ScheduledReset;
  state: "planned" | "awaiting-confirmation";
  // 只将 regular 周额度重置纳入配速；其他类型可展示，不能猜测其回满语义。
  appliesToQuota: boolean;
}

/** 无效/取消/尚未发布公告不采用；到计划时刻只标待核实，不自行确认执行。 */
export function assessScheduledReset(
  announcement: ScheduledReset | null | undefined,
  now: Date,
): ScheduledResetAssessment | null {
  if (!announcement || announcement.status !== "scheduled") return null;
  const asOf = now.getTime();
  const announcedAt = Date.parse(announcement.announcedAt);
  const scheduledFor = Date.parse(announcement.scheduledFor);
  if (!Number.isFinite(asOf) || !Number.isFinite(announcedAt) || !Number.isFinite(scheduledFor)
      || announcedAt > asOf || scheduledFor < announcedAt) return null;
  return {
    announcement,
    state: scheduledFor > asOf ? "planned" : "awaiting-confirmation",
    appliesToQuota: announcement.resetType === "regular",
  };
}

/** 截短规划 horizon 的情景边界；概率输出仍走原模型。IO/来源新鲜度由RR23负责。 */
export function upcomingQuotaResetAt(
  announcement: ScheduledReset | null | undefined,
  now: Date,
): number | null {
  const assessment = assessScheduledReset(announcement, now);
  return assessment?.state === "planned" && assessment.appliesToQuota
    ? Date.parse(assessment.announcement.scheduledFor) : null;
}
