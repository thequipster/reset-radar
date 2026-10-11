import { describe, expect, it } from "vitest";
import { planDailyUsage } from "../planner";
import { assessResetRisk } from "../risk";
import { planResetCard } from "../resetCard";
import type { ScheduledReset } from "../scheduledReset";

const NOW = new Date("2026-10-11T05:00:00Z");
const FUTURE_REGULAR: ScheduledReset = {
  id: "announcement-1",
  status: "scheduled",
  resetType: "regular",
  announcedAt: "2026-10-10T05:00:00Z",
  scheduledFor: "2026-10-11T07:00:00Z",
  text: "Global reset by EOD",
  source: { type: "tracker" },
};
const NATURAL_RESET = new Date(NOW.getTime() + 6 * 86_400_000).toISOString();
const QUIET_HAZARDS = [0, 0, 0, 0, 0, 0, 0];

const dailyInput = (scheduledReset?: ScheduledReset | null) => ({
  remaining: 29,
  daysToReset: 6,
  risk: 25,
  isWeekend: false,
  now: NOW,
  scheduledReset,
});

const cardInput = (scheduledReset?: ScheduledReset | null) => ({
  remainingPercent: 0.4,
  resetsAt: NATURAL_RESET,
  resetCredits: 1,
  creditExpiresAt: null,
  dailyNeedPercent: 12,
  weekdayHazards: QUIET_HAZARDS,
  tomorrowRiskPercent: 20,
  now: NOW,
  scheduledReset,
});

const notice = (patch: Partial<ScheduledReset> = {}): ScheduledReset => ({
  ...FUTURE_REGULAR,
  ...patch,
  source: patch.source ?? FUTURE_REGULAR.source,
});

describe("scheduled reset integration", () => {
  it("未来 2h regular 公告会前拉配速，但不超过剩余额度或软上限", () => {
    const withoutNotice = planDailyUsage(dailyInput());
    const withNotice = planDailyUsage(dailyInput(FUTURE_REGULAR));

    expect(withoutNotice.suggested).toBeGreaterThanOrEqual(5);
    expect(withoutNotice.suggested).toBeLessThan(7);
    expect(withNotice.suggested).toBe(29);
    expect(withNotice.suggested).toBeGreaterThan(withoutNotice.suggested);
    expect(withNotice.suggested).toBeLessThanOrEqual(withNotice.cap);
    expect(withNotice.suggested).toBeLessThanOrEqual(29);
    expect(withNotice.planningResetAt).toBe(FUTURE_REGULAR.scheduledFor);
  });

  it("公告只作独立说明，不改变统计风险分；watch 80 仍只有一个 watch 因子", () => {
    const baseline = assessResetRisk([], NOW, 80);
    const withNotice = assessResetRisk([], NOW, 80, FUTURE_REGULAR);

    expect(withNotice.score).toBe(baseline.score);
    expect(withNotice.factors.filter((factor) => factor.id === "tracker-watch")).toHaveLength(1);
    expect(withNotice.factors.find((factor) => factor.id === "scheduled-reset")?.delta).toBe(0);
    expect(withNotice.scheduledReset?.state).toBe("planned");
  });

  it.each([
    ["已取消", notice({ status: "cancelled" })],
    ["时间非法", notice({ scheduledFor: "not-a-time" })],
    ["发布时间在未来", notice({ announcedAt: "2026-10-11T05:00:00.001Z" })],
    ["计划时间早于发布时间", notice({ scheduledFor: "2026-10-10T04:59:00Z" })],
  ])("%s 公告不影响配速与用卡计划", (_label, invalidNotice) => {
    expect(planDailyUsage(dailyInput(invalidNotice))).toEqual(planDailyUsage(dailyInput()));
    expect(planResetCard(cardInput(invalidNotice))).toEqual(planResetCard(cardInput()));
  });

  it("到达计划时刻的精确边界标记待核实，不继续清仓", () => {
    const atScheduledTime = new Date(FUTURE_REGULAR.scheduledFor);
    const expired = notice({ scheduledFor: FUTURE_REGULAR.scheduledFor });
    const noAnnouncement = planDailyUsage({ ...dailyInput(), now: atScheduledTime });
    const atBoundary = planDailyUsage({ ...dailyInput(expired), now: atScheduledTime });
    const expiredRisk = assessResetRisk([], atScheduledTime, undefined, expired);
    const baselineRisk = assessResetRisk([], atScheduledTime);

    expect(atBoundary).toEqual(noAnnouncement);
    expect(expiredRisk.score).toBe(baselineRisk.score);
    expect(expiredRisk.scheduledReset?.state).toBe("awaiting-confirmation");
    expect(expiredRisk.factors.find((factor) => factor.id === "scheduled-reset")?.label).toBe("公告待核实");
    expect(planResetCard({ ...cardInput(expired), now: atScheduledTime })).toEqual(
      planResetCard({ ...cardInput(), now: atScheduledTime }),
    );
  });

  it("无公告、null 与无效公告保持完整旧输出", () => {
    const baselineRisk = assessResetRisk([], NOW, 25);
    const baselineDaily = planDailyUsage(dailyInput());
    const baselineCard = planResetCard(cardInput());

    for (const absent of [undefined, null, notice({ status: "cancelled" }), notice({ scheduledFor: "bad" })]) {
      expect(assessResetRisk([], NOW, 25, absent)).toEqual(baselineRisk);
      expect(planDailyUsage(dailyInput(absent))).toEqual(baselineDaily);
      expect(planResetCard(cardInput(absent))).toEqual(baselineCard);
    }
  });

  it("晚于自然重置的公告不改变今日计划", () => {
    const laterThanNatural = notice({
      scheduledFor: new Date(NOW.getTime() + 7 * 86_400_000).toISOString(),
    });
    expect(planDailyUsage(dailyInput(laterThanNatural))).toEqual(planDailyUsage(dailyInput()));
    expect(planResetCard(cardInput(laterThanNatural))).toEqual(planResetCard(cardInput()));
  });

  it.each(["banked", "unrecognized-reset-type"])("%s 计划只作为公告展示，不缩短配速或用卡 horizon", (resetType) => {
    const otherType = notice({ resetType });
    const daily = planDailyUsage(dailyInput(otherType));
    const card = planResetCard(cardInput(otherType));

    expect(daily).toEqual(planDailyUsage(dailyInput()));
    expect(card).toEqual(planResetCard(cardInput()));
    expect(assessResetRisk([], NOW, undefined, otherType).scheduledReset?.appliesToQuota).toBe(false);
  });

  it("卡收益受计划前 2h 可消耗量限制，计划后无候选日，碰撞统计不视为 100%", () => {
    const plan = planResetCard(cardInput(FUTURE_REGULAR));
    const baseline = planResetCard(cardInput());

    expect(plan).not.toBeNull();
    expect(plan!.expectedGainTodayPercent).toBe(0.6);
    expect(plan!.expectedGainBestPercent).toBeLessThanOrEqual(12 * 2 / 24 - 0.4);
    expect(plan!.outlook).toHaveLength(1);
    expect(plan!.bestDayOffset).toBe(0);
    expect(plan!.bestDayLocalDate).toBe("2026-10-11");
    expect(plan!.decision).toBe("hold-until-scheduled-reset");
    expect(plan!.daysUntilNaturalReset).toBe(6);
    expect(plan!.forcedReset24hPercent).toBe(baseline!.forcedReset24hPercent);
    expect(plan!.forcedReset48hPercent).toBe(baseline!.forcedReset48hPercent);
    expect(plan!.forcedReset24hPercent).toBeLessThan(100);
    expect(plan!.forcedReset48hPercent).toBeLessThan(100);
  });

  it("北京 23:00 的 regular 计划跨零点后仍允许零点当天作为计划前候选", () => {
    const nearMidnight = new Date("2026-10-11T15:00:00Z"); // 北京 10/11 23:00
    const afterMidnight = notice({
      announcedAt: "2026-10-11T14:00:00Z",
      scheduledFor: "2026-10-11T17:00:00Z", // 北京 10/12 01:00
    });
    const naturalReset = new Date(nearMidnight.getTime() + 6 * 86_400_000).toISOString();
    const plan = planResetCard({
      ...cardInput(afterMidnight),
      now: nearMidnight,
      resetsAt: naturalReset,
    });

    expect(plan).not.toBeNull();
    expect(plan!.outlook.map((day) => day.localDate)).toEqual(["2026-10-11", "2026-10-12"]);
    expect(plan!.outlook.every((day) => day.expectedGainPercent <= 12 * 2 / 24 - 0.4)).toBe(true);
    expect(["2026-10-11", "2026-10-12"]).toContain(plan!.bestDayLocalDate);
  });

  it("regular 计划恰在北京零点时不把零点当天列为候选", () => {
    const nearMidnight = new Date("2026-10-11T15:00:00Z"); // 北京 10/11 23:00
    const atMidnight = notice({
      announcedAt: "2026-10-11T14:00:00Z",
      scheduledFor: "2026-10-11T16:00:00Z", // 北京 10/12 00:00
    });
    const naturalReset = new Date(nearMidnight.getTime() + 6 * 86_400_000).toISOString();
    const plan = planResetCard({
      ...cardInput(atMidnight),
      now: nearMidnight,
      resetsAt: naturalReset,
    });

    expect(plan).not.toBeNull();
    expect(plan!.outlook.map((day) => day.localDate)).toEqual(["2026-10-11"]);
    expect(plan!.bestDayLocalDate).toBe("2026-10-11");
  });

  it("2h regular 公告前拉计划仍受 soft cap 约束", () => {
    const input = {
      remaining: 80,
      daysToReset: 2,
      risk: 25,
      isWeekend: false,
      now: NOW,
    };
    const baseline = planDailyUsage(input);
    const planned = planDailyUsage({
      ...input,
      scheduledReset: FUTURE_REGULAR,
    });

    expect(baseline.suggested).toBeLessThan(planned.suggested);
    expect(planned.suggested).toBe(34.4);
    expect(planned.cap).toBe(34.4);
    expect(planned.suggested).toBeLessThan(80);
  });
});
