// RR06 域测试：重置卡规划器。前 13 条逐条移植自参考仓 codex-cockpit 的
// src/lib/resetCard.test.ts（MIT，TRUTH §1 来源 3，断言原样对齐），
// 末段 3 条为本项目新增边界用例（自然重置日历边界，卡面验证口径要求）。
// 时区约定：规划器日历 = 北京时间（D004）。
import { describe, expect, it } from "vitest";
import { DEFAULT_WEEKDAY_HAZARDS } from "../planner";
import { estimateDailyNeedPercent, forcedResetBeforeDayPercent, planResetCard, planResetCardPacing } from "../resetCard";

// 北京时刻构造：规划器日历为 UTC+8
const atBeijing = (dateKey: string, hour = 12, minute = 0): Date =>
  new Date(`${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`);

// 2026-10-09 是周五；默认先验下周二/周六是重置波
const FRIDAY_EVENING = atBeijing("2026-10-09", 20);
const WEDNESDAY_NOON = atBeijing("2026-10-07", 12);
const QUIET_HAZARDS = [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05];
const DAY_MS = 86_400_000;

describe("estimateDailyNeedPercent", () => {
  it("取观测日均值：闲置日计入、无观测日跳过（参考 resetCard.test.ts:15-26）", () => {
    const history = [
      { localDate: "2026-10-01", observedUsedPercent: 5, sampleCount: 1 },
      { localDate: "2026-10-02", observedUsedPercent: 0, sampleCount: 0 },
      { localDate: "2026-10-03", observedUsedPercent: 20, sampleCount: 3 },
      { localDate: "2026-10-04", observedUsedPercent: 40, sampleCount: 2 },
      { localDate: "2026-10-05", observedUsedPercent: 0, sampleCount: 2 },
      { localDate: "2026-10-06", observedUsedPercent: 22, sampleCount: 4 },
    ];
    // (5 + 20 + 40 + 0 + 22) / 5 = 17.4；无观测的 10-02 跳过
    expect(estimateDailyNeedPercent(history, 14.3, atBeijing("2026-10-07"))).toBe(17.4);
  });

  it("无可用水历史时退回均匀周配速（参考 resetCard.test.ts:28-30）", () => {
    expect(estimateDailyNeedPercent([], 14.3, atBeijing("2026-10-07"))).toBe(14.3);
  });
});

describe("planResetCard", () => {
  it("周六重置波前夜不烧卡（参考 resetCard.test.ts:34-50）", () => {
    const plan = planResetCard({
      remainingPercent: 20,
      resetsAt: new Date(FRIDAY_EVENING.getTime() + 5.5 * DAY_MS).toISOString(),
      resetCredits: 1,
      creditExpiresAt: null,
      dailyNeedPercent: 30,
      weekdayHazards: DEFAULT_WEEKDAY_HAZARDS,
      tomorrowRiskPercent: 70,
      now: FRIDAY_EVENING,
    });
    expect(plan).not.toBeNull();
    expect(plan!.decision).toBe("wait-for-best-day");
    expect(plan!.bestDayOffset).toBeGreaterThanOrEqual(2);
    expect(plan!.expectedGainBestPercent).toBeGreaterThan(plan!.expectedGainTodayPercent);
    expect(plan!.forcedReset24hPercent).toBeGreaterThan(50);
  });

  it("额度见底 + 平静期 → 今日就用（参考 resetCard.test.ts:52-67）", () => {
    const plan = planResetCard({
      remainingPercent: 10,
      resetsAt: new Date(WEDNESDAY_NOON.getTime() + 6 * DAY_MS).toISOString(),
      resetCredits: 1,
      creditExpiresAt: null,
      dailyNeedPercent: 35,
      weekdayHazards: DEFAULT_WEEKDAY_HAZARDS,
      tomorrowRiskPercent: 10,
      now: WEDNESDAY_NOON,
    });
    expect(plan).not.toBeNull();
    expect(plan!.decision).toBe("use-today");
    expect(plan!.expectedGainTodayPercent).toBeGreaterThan(20);
    expect(plan!.refillTodayPercent).toBe(90);
  });

  it("额度尚多时持卡（参考 resetCard.test.ts:69-83）", () => {
    const plan = planResetCard({
      remainingPercent: 85,
      resetsAt: new Date(WEDNESDAY_NOON.getTime() + 5 * DAY_MS).toISOString(),
      resetCredits: 2,
      creditExpiresAt: null,
      dailyNeedPercent: 10,
      weekdayHazards: QUIET_HAZARDS,
      tomorrowRiskPercent: 10,
      now: WEDNESDAY_NOON,
    });
    expect(plan!.decision).toBe("hold-until-depleted");
    expect(plan!.refillTodayPercent).toBeLessThan(25);
    expect(plan!.daysUntilWorthwhile).toBeGreaterThan(0);
  });

  it("余额撑得到自然重置 → 等自然重置（参考 resetCard.test.ts:85-98）", () => {
    const plan = planResetCard({
      remainingPercent: 40,
      resetsAt: new Date(WEDNESDAY_NOON.getTime() + 5 * DAY_MS).toISOString(),
      resetCredits: 1,
      creditExpiresAt: null,
      dailyNeedPercent: 4,
      weekdayHazards: QUIET_HAZARDS,
      tomorrowRiskPercent: 5,
      now: WEDNESDAY_NOON,
    });
    expect(plan!.decision).toBe("hold-until-natural-reset");
    expect(plan!.expectedGainBestPercent).toBeLessThan(8);
  });

  it("上游显示无卡余量 → no-credits（参考 resetCard.test.ts:100-112）", () => {
    const plan = planResetCard({
      remainingPercent: 15,
      resetsAt: new Date(WEDNESDAY_NOON.getTime() + 6 * DAY_MS).toISOString(),
      resetCredits: 0,
      creditExpiresAt: null,
      dailyNeedPercent: 30,
      weekdayHazards: QUIET_HAZARDS,
      tomorrowRiskPercent: 10,
      now: WEDNESDAY_NOON,
    });
    expect(plan!.decision).toBe("no-credits");
  });

  it("校准的 24h 预报替换第一天的先验（参考 resetCard.test.ts:114-128）", () => {
    const base = {
      remainingPercent: 20,
      resetsAt: new Date(WEDNESDAY_NOON.getTime() + 6 * DAY_MS).toISOString(),
      resetCredits: 1,
      creditExpiresAt: null,
      dailyNeedPercent: 30,
      weekdayHazards: QUIET_HAZARDS,
      now: WEDNESDAY_NOON,
    };
    const calm = planResetCard({ ...base, tomorrowRiskPercent: 5 })!;
    const stormy = planResetCard({ ...base, tomorrowRiskPercent: 90 })!;
    expect(stormy.expectedGainTodayPercent).toBeLessThan(calm.expectedGainTodayPercent);
    expect(stormy.forcedReset24hPercent).toBeGreaterThan(calm.forcedReset24hPercent);
  });

  it("快过期的卡收窄候选日（参考 resetCard.test.ts:130-143）", () => {
    const plan = planResetCard({
      remainingPercent: 30,
      resetsAt: new Date(WEDNESDAY_NOON.getTime() + 10 * DAY_MS).toISOString(),
      resetCredits: 1,
      creditExpiresAt: new Date(WEDNESDAY_NOON.getTime() + 2 * DAY_MS).toISOString(),
      dailyNeedPercent: 25,
      weekdayHazards: QUIET_HAZARDS,
      tomorrowRiskPercent: 10,
      now: WEDNESDAY_NOON,
    });
    expect(plan!.outlook.length).toBeLessThanOrEqual(3);
    expect(plan!.daysUntilCreditExpiry).toBeCloseTo(2, 0);
  });

  it("周窗口不可用 → null（参考 resetCard.test.ts:145-155）", () => {
    expect(planResetCard({
      remainingPercent: 20,
      resetsAt: "not-a-date",
      resetCredits: 1,
      creditExpiresAt: null,
      dailyNeedPercent: 20,
      tomorrowRiskPercent: 10,
      now: WEDNESDAY_NOON,
    })).toBeNull();
  });
});

describe("planResetCardPacing", () => {
  it("卡触发当日全额建议，不受软上限约束（参考 resetCard.test.ts:159-171）", () => {
    const plan = planResetCardPacing({
      remainingPercent: 42,
      bestDayOffset: 0,
      fatigueKneePercent: 25,
      todayUsedPercent: 8,
      todayFractionRemaining: 0.5,
      isWeekend: false,
      forcedResetBeforePlanPercent: 30,
    });
    expect(plan.suggestedUsagePercent).toBe(42);
    expect(plan.softCapPercent).toBe(42);
  });

  it("未来卡日之前把余额摊开（参考 resetCard.test.ts:173-185）", () => {
    const plan = planResetCardPacing({
      remainingPercent: 60,
      bestDayOffset: 3,
      fatigueKneePercent: 25,
      todayUsedPercent: 0,
      todayFractionRemaining: 1,
      isWeekend: false,
      forcedResetBeforePlanPercent: 20,
    });
    expect(plan.suggestedUsagePercent).toBeGreaterThan(0);
    expect(plan.suggestedUsagePercent).toBeLessThan(60);
  });
});

describe("forcedResetBeforeDayPercent", () => {
  it("随视野增长；今日为 0（参考 resetCard.test.ts:189-195）", () => {
    expect(forcedResetBeforeDayPercent(QUIET_HAZARDS, 10, 0, WEDNESDAY_NOON)).toBe(0);
    const twoDays = forcedResetBeforeDayPercent(QUIET_HAZARDS, 10, 2, WEDNESDAY_NOON);
    const fourDays = forcedResetBeforeDayPercent(QUIET_HAZARDS, 10, 4, WEDNESDAY_NOON);
    expect(fourDays).toBeGreaterThan(twoDays);
    expect(twoDays).toBeGreaterThan(0);
  });
});

// —— 本项目新增边界用例（卡面要求：跨自然重置日；D004 北京零点唯一边界）——

describe("planResetCard：自然重置日历边界（本项目新增）", () => {
  it("resetsAt 已到/已过 → null（rc:246 后半分支）", () => {
    expect(planResetCard({
      remainingPercent: 20,
      resetsAt: new Date(WEDNESDAY_NOON.getTime() - DAY_MS).toISOString(),
      resetCredits: 1,
      creditExpiresAt: null,
      dailyNeedPercent: 30,
      weekdayHazards: QUIET_HAZARDS,
      tomorrowRiskPercent: 10,
      now: WEDNESDAY_NOON,
    })).toBeNull();
  });

  it("自然重置当日自身不进候选：候选拉满到重置前最后一个整天", () => {
    // 周三正午，自然重置 = 1.5 天后（周五零点，北京）→ naturalBound = ceil(1.5)-1 = 1
    const plan = planResetCard({
      remainingPercent: 20,
      resetsAt: atBeijing("2026-10-09", 0).toISOString(),
      resetCredits: 1,
      creditExpiresAt: null,
      dailyNeedPercent: 30,
      weekdayHazards: QUIET_HAZARDS,
      tomorrowRiskPercent: 10,
      now: WEDNESDAY_NOON,
    })!;
    expect(plan.outlook.length).toBe(2); // 仅周三、周四；周五重置日不烧卡
    expect(plan.outlook[0].localDate).toBe("2026-10-07");
    expect(plan.outlook[1].localDate).toBe("2026-10-08");
    expect(plan.bestDayLocalDate).not.toBe("2026-10-09");
  });

  it("D004 北京零点切日：重置前 12h，23:30 归今天键、00:30 归明天键", () => {
    const beforeMidnight = planResetCard({
      remainingPercent: 20,
      resetsAt: atBeijing("2026-10-10", 12).toISOString(),
      resetCredits: 1,
      creditExpiresAt: null,
      dailyNeedPercent: 30,
      weekdayHazards: QUIET_HAZARDS,
      tomorrowRiskPercent: 10,
      now: atBeijing("2026-10-09", 23, 30),
    })!;
    const afterMidnight = planResetCard({
      remainingPercent: 20,
      resetsAt: atBeijing("2026-10-10", 12).toISOString(),
      resetCredits: 1,
      creditExpiresAt: null,
      dailyNeedPercent: 30,
      weekdayHazards: QUIET_HAZARDS,
      tomorrowRiskPercent: 10,
      now: atBeijing("2026-10-10", 0, 30),
    })!;
    expect(beforeMidnight.outlook[0].localDate).toBe("2026-10-09");
    expect(afterMidnight.outlook[0].localDate).toBe("2026-10-10");
  });
});
