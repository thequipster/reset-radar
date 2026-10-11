import { describe, expect, it } from "vitest";

import { DAY_MS, HOUR_MS } from "../beijing.ts";
import {
  ALLOCATION_TOLERANCE,
  allocationAtMu,
  buildSegments,
  DEMAND_MIN_GROUP_DAYS,
  estimateDemand,
  planPaceV2,
  resolvePlanningDeadline,
  solveAllocation,
  type DailyUsageSample,
  type DemandProfile,
} from "../plannerV2.ts";

// now = 北京时间 2026-10-11（周日）00:00
const NOW = Date.UTC(2026, 9, 11, 0, 0, 0) - 8 * HOUR_MS;
const DAY = 24 * HOUR_MS;

/** 生成最近 days 天的日耗样本：工作日 weekday 点、周末 weekend 点。 */
function samples(days: number, weekday: number, weekend: number): DailyUsageSample[] {
  const out: DailyUsageSample[] = [];
  for (let i = days; i >= 1; i -= 1) {
    const at = NOW - i * DAY;
    const weekdayIndex = new Date(at + 8 * HOUR_MS).getUTCDay();
    const isWeekend = weekdayIndex === 0 || weekdayIndex === 6;
    out.push({
      dateKey: new Date(at + 8 * HOUR_MS).toISOString().slice(0, 10),
      usedPercent: isWeekend ? weekend : weekday,
    });
  }
  return out;
}

const flatSurvival = (): ((at: number) => number) => () => 1;

describe("§4.1 需求估计", () => {
  it("工作日/周末分组取中位数与 75 分位，当前未结束日不算样本", () => {
    const profile = estimateDemand(samples(28, 10, 4), NOW);
    expect(profile.completeDays).toBe(28);
    expect(profile.quality).toBe("estimated");
    expect(profile.weekday.demand).toBe(10);
    expect(profile.weekday.cap).toBe(10);
    expect(profile.weekend.demand).toBe(4);
    expect(profile.weekend.cap).toBe(4);
    expect(profile.weekday.group).toBe("weekday");
  });

  it("窗口只取最近 28 个完整日；更早的样本不参与", () => {
    const profile = estimateDemand(samples(60, 10, 4), NOW);
    expect(profile.completeDays).toBe(28);
  });

  it("某组不足 4 天 → 退回全部完整日", () => {
    // 只给 2 个周末日：构造 8 天样本（其中 2 天周末）
    const eight = samples(8, 10, 4);
    const profile = estimateDemand(eight, NOW);
    expect(profile.weekend.ownSampleDays).toBeLessThan(DEMAND_MIN_GROUP_DAYS);
    expect(profile.weekend.fallbackUsed).toBe(true);
    expect(profile.weekend.sampleDays).toBe(profile.completeDays);
    expect(profile.weekend.note).toContain("已退回全部完整日");
  });

  it("完全无历史 → 需求未知，不代入固定值", () => {
    const profile = estimateDemand([], NOW);
    expect(profile.quality).toBe("unknown");
    expect(profile.weekday.demand).toBe(0);
    const plan = planPaceV2({
      now: NOW,
      remaining: 100,
      nextNaturalResetAt: NOW + 5 * DAY,
      demand: profile,
      survivalAt: flatSurvival(),
    });
    expect(plan.todaySuggested).toBeNull();
    expect(plan.totalAllocated).toBe(0);
    expect(plan.explanations.some((line) => line.includes("不代入固定的 25 点软上限"))).toBe(true);
  });

  it("缺失「当日是否耗尽」时如实标注无法分辨", () => {
    const profile = estimateDemand(samples(28, 10, 4), NOW);
    expect(profile.hasExhaustionData).toBe(false);
    expect(profile.note).toContain("无法分辨");
    const withFlag = samples(28, 10, 4).map((sample) => ({ ...sample, exhausted: false }));
    expect(estimateDemand(withFlag, NOW).hasExhaustionData).toBe(true);
  });
});

describe("§4.2 规划截止", () => {
  it("取 min(自然重置, 计划用卡, 假定公告执行)", () => {
    expect(
      resolvePlanningDeadline({ nextNaturalResetAt: NOW + 5 * DAY, plannedCardAt: NOW + 2 * DAY }),
    ).toEqual({ deadline: NOW + 2 * DAY, reason: "planned-card" });
    expect(
      resolvePlanningDeadline({
        nextNaturalResetAt: NOW + 5 * DAY,
        plannedCardAt: NOW + 7 * DAY,
        assumedAnnouncementAt: NOW + 3 * DAY,
      }).reason,
    ).toBe("assumed-announcement");
    expect(resolvePlanningDeadline({ nextNaturalResetAt: NOW + 5 * DAY })).toEqual({
      deadline: NOW + 5 * DAY,
      reason: "natural-reset",
    });
    expect(resolvePlanningDeadline({ nextNaturalResetAt: null })).toEqual({
      deadline: null,
      reason: "unknown",
    });
  });

  it("今天与最后一天按实际剩余时长折算需求与上限", () => {
    const now = NOW + 18 * HOUR_MS;
    const profile = estimateDemand(samples(28, 10, 10), now);
    const segments = buildSegments(now, NOW + 2 * DAY + 12 * HOUR_MS, profile, flatSurvival());
    expect(segments).toHaveLength(3);
    expect(segments[0].dayFraction).toBeCloseTo(0.25, 10);
    expect(segments[1].dayFraction).toBeCloseTo(1, 10);
    expect(segments[2].dayFraction).toBeCloseTo(0.5, 10);
    expect(segments[0].demand).toBeCloseTo(10 * 0.25, 10);
    expect(segments[2].cap).toBeCloseTo(10 * 0.5, 10);
  });
});

describe("§4.3 分配公式", () => {
  const demand = (): DemandProfile => estimateDemand(samples(28, 10, 10), NOW);

  it("上限之和不超过余额 → 全部分配到上限", () => {
    const drafts = buildSegments(NOW, NOW + 3 * DAY, demand(), flatSurvival());
    const { allocation } = solveAllocation(drafts, 200);
    expect(allocation).toEqual([10, 10, 10]);
  });

  it("二分求解：总分配贴近余额（误差 < 0.01 点），低风险时各日满足比例相近", () => {
    const drafts = buildSegments(NOW, NOW + 3 * DAY, demand(), flatSurvival());
    const { allocation } = solveAllocation(drafts, 20);
    const total = allocation.reduce((sum, value) => sum + value, 0);
    expect(Math.abs(total - 20)).toBeLessThan(ALLOCATION_TOLERANCE);
    for (const value of allocation) {
      expect(value).toBeCloseTo(20 / 3, 1);
    }
  });

  it("风险高时后面的 S_i 更小 → 分配自然前移", () => {
    const drafts = buildSegments(NOW, NOW + 3 * DAY, demand(), flatSurvival());
    const decaying = drafts.map((draft, index) => ({ ...draft, survival: [1, 0.8, 0.5][index] }));
    const { allocation } = solveAllocation(decaying, 20);
    expect(allocation[0]).toBeGreaterThan(allocation[1]);
    expect(allocation[1]).toBeGreaterThan(allocation[2]);
    const total = allocation.reduce((sum, value) => sum + value, 0);
    expect(Math.abs(total - 20)).toBeLessThan(ALLOCATION_TOLERANCE);
  });

  it("需求为零的片段直接分配零", () => {
    const drafts = buildSegments(NOW, NOW + 3 * DAY, demand(), flatSurvival()).map((draft) => ({
      ...draft,
      demand: 0,
    }));
    expect(allocationAtMu(drafts, 0.5)).toEqual([0, 0, 0]);
    expect(solveAllocation(drafts, 50).allocation).toEqual([0, 0, 0]);
  });

  it("完整计划：todaySuggested / 各日分配 / 预计来不及使用 / 原因", () => {
    const plan = planPaceV2({
      now: NOW,
      remaining: 20,
      nextNaturalResetAt: NOW + 3 * DAY,
      demand: demand(),
      survivalAt: () => 1,
    });
    expect(plan.todaySuggested).toBeCloseTo(20 / 3, 1);
    expect(plan.dailyAllocations).toHaveLength(3);
    expect(Math.abs(plan.totalAllocated - 20)).toBeLessThan(ALLOCATION_TOLERANCE);
    expect(plan.expectedUnspentBeforeDeadline).toBeLessThan(ALLOCATION_TOLERANCE);
    expect(plan.deadlineReason).toBe("natural-reset");
    expect(plan.planningDeadline).toBe(NOW + 3 * DAY);
    expect(plan.explanations.some((line) => line.includes("存续概率"))).toBe(true);
  });

  it("不为清空额度而超出历史可消耗范围（余额富余时留下来不及使用的部分）", () => {
    const plan = planPaceV2({
      now: NOW,
      remaining: 100,
      nextNaturalResetAt: NOW + 2 * DAY,
      demand: demand(),
      survivalAt: () => 1,
    });
    expect(plan.totalAllocated).toBeCloseTo(20, 6); // 2 天 × 上限 10
    expect(plan.expectedUnspentBeforeDeadline).toBeCloseTo(80, 6);
    expect(plan.explanations.some((line) => line.includes("来不及使用"))).toBe(true);
  });

  it("周末是否减少由个人历史决定（不是固定 ×0.75）", () => {
    const weekendHeavy = estimateDemand(samples(28, 4, 20), NOW);
    const plan = planPaceV2({
      now: NOW, // 周日
      remaining: 30,
      nextNaturalResetAt: NOW + 2 * DAY,
      demand: weekendHeavy,
      survivalAt: () => 1,
    });
    expect(weekendHeavy.weekend.demand).toBeGreaterThan(weekendHeavy.weekday.demand);
    expect(plan.dailyAllocations[0].group).toBe("weekend");
    expect(plan.dailyAllocations[0].allocation).toBeGreaterThan(plan.dailyAllocations[1].allocation);
  });
});
