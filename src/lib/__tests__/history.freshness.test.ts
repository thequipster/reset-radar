import { describe, expect, it } from "vitest";
import {
  assessHistorySource,
  evaluateHistoryFreshness,
  HISTORY_STALE_DAYS,
  selectQuotaResetHistory,
} from "../history";

const NOW = new Date("2026-10-11T12:00:00.000Z");

describe("历史重置筛选", () => {
  it("只选 regular，按 epoch 去重并倒序；banked、未知类型和非法时间排除", () => {
    expect(selectQuotaResetHistory([
      { resetType: "regular", announcedAt: "2026-10-08T03:00:00Z" },
      { resetType: "banked", announcedAt: "2026-10-11T03:00:00Z" },
      { resetType: "regular", announcedAt: "2026-10-10T03:00:00+00:00" },
      { resetType: "regular", announcedAt: "2026-10-10T11:00:00+08:00" },
      { resetType: "unknown", announcedAt: "2026-10-09T03:00:00Z" },
      { resetType: "regular", announcedAt: "2026-02-30T03:00:00Z" },
      null,
    ])).toEqual(["2026-10-10T03:00:00.000Z", "2026-10-08T03:00:00.000Z"]);
  });
});

describe("历史抓取新鲜度", () => {
  it("7日常数来自 RR18；精确 7 日仍新鲜，超过阈值才 stale", () => {
    expect(HISTORY_STALE_DAYS).toBe(7);
    const atBoundary = new Date(NOW.getTime() - HISTORY_STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const justOld = new Date(Date.parse(atBoundary) - 1).toISOString();
    expect(evaluateHistoryFreshness(atBoundary, NOW)).toMatchObject({ state: "fresh", ageDays: 7 });
    expect(evaluateHistoryFreshness(justOld, NOW).state).toBe("stale");
  });

  it.each(["bad", "2026-10-11", "2026-10-11T13:00:00Z", null, 42])("非法/未来抓取时刻 %j 为 invalid 且不回退", (fetchedAt) => {
    expect(evaluateHistoryFreshness(fetchedAt, NOW)).toEqual({
      state: "invalid", fetchedAt: null, asOf: null, ageDays: null,
    });
  });

  it("事件数组无效时整份来源 invalid，合法数组给出筛选计数", () => {
    expect(assessHistorySource({ fetchedAt: "2026-10-11T11:00:00Z", events: null }, NOW)).toMatchObject({
      state: "invalid", totalEvents: null, quotaResetEvents: null, excludedEvents: null,
    });
    expect(assessHistorySource({
      fetchedAt: "2026-10-11T11:00:00Z",
      events: [
        { resetType: "regular", announcedAt: "2026-10-10T00:00:00Z" },
        { resetType: "banked", announcedAt: "2026-10-09T00:00:00Z" },
        { resetType: "unknown", announcedAt: "2026-10-08T00:00:00Z" },
        { resetType: "regular", announcedAt: "bad" },
      ],
    }, NOW)).toMatchObject({
      state: "fresh", totalEvents: 4, quotaResetEvents: 1, excludedEvents: 3,
    });
  });
});
