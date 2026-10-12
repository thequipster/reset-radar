import { describe, expect, it } from "vitest";
import { assessScheduledReset, upcomingQuotaResetAt, type ScheduledReset } from "../scheduledReset";
import { planPaceV2 } from "../plannerV2";
import { estimateDemand } from "../plannerV2";
import { assessResetRiskV2 } from "../riskV2";

const NOW = Date.parse("2026-10-11T05:00:00Z");
const FUTURE: ScheduledReset = { id: "announcement-1", status: "scheduled", resetType: "regular",
  announcedAt: "2026-10-10T05:00:00Z", scheduledFor: "2026-10-11T07:00:00Z", text: "Global reset by EOD", source: { type: "tracker" } };
const notice = (patch: Partial<ScheduledReset> = {}): ScheduledReset => ({ ...FUTURE, ...patch });

describe("scheduled reset v2 integration", () => {
  it("有效 regular 公告可用作规划截止，但风险评估仍保留独立目标", () => {
    const assessed = assessScheduledReset(FUTURE, new Date(NOW));
    expect(assessed).toMatchObject({ state: "planned", appliesToQuota: true });
    expect(upcomingQuotaResetAt(FUTURE, new Date(NOW))).toBe(Date.parse(FUTURE.scheduledFor));
    const history = assessResetRiskV2({ events: [], now: NOW });
    const withPlan = assessResetRiskV2({ events: [], now: NOW, plannedIntervention: true });
    expect(withPlan.probability24h).toBe(history.probability24h);
    expect(withPlan.target).toEqual(history.target);
  });

  it.each([
    ["已取消", notice({ status: "cancelled" })],
    ["时间非法", notice({ scheduledFor: "not-a-time" })],
    ["发布时间在未来", notice({ announcedAt: "2026-10-11T05:00:00.001Z" })],
    ["计划早于发布时间", notice({ scheduledFor: "2026-10-10T04:59:00Z" })],
  ])("%s 公告不会成为有效计划", (_label, invalid) => {
    expect(assessScheduledReset(invalid, new Date(NOW))).toBeNull();
    expect(upcomingQuotaResetAt(invalid, new Date(NOW))).toBeNull();
  });

  it("到达计划时刻只标记待核实，不再截短规划", () => {
    const at = new Date(FUTURE.scheduledFor);
    expect(assessScheduledReset(FUTURE, at)?.state).toBe("awaiting-confirmation");
    expect(upcomingQuotaResetAt(FUTURE, at)).toBeNull();
    expect(upcomingQuotaResetAt(null, at)).toBeNull();
  });

  it("只有 regular 计划缩短周额度规划，banked 与未知类型仅作公告", () => {
    const natural = Date.parse("2026-10-17T05:00:00Z");
    const plan = (announcement: ScheduledReset | null) => planPaceV2({ now: NOW, remaining: 29,
      nextNaturalResetAt: natural,
      assumedAnnouncementAt: upcomingQuotaResetAt(announcement, new Date(NOW)),
      demand: estimateDemand([], NOW), survivalAt: () => 1 });
    const regular = plan(FUTURE);
    expect(regular.planningDeadline).toBe(Date.parse(FUTURE.scheduledFor));
    expect(regular.deadlineReason).toBe("assumed-announcement");
    expect(regular.todaySuggested).toBeNull();
    for (const resetType of ["banked", "unrecognized-reset-type"]) {
      const other = notice({ resetType });
      expect(assessScheduledReset(other, new Date(NOW))?.appliesToQuota).toBe(false);
      expect(plan(other).planningDeadline).toBe(natural);
    }
  });
});
