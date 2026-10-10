// RR05 域测试：planDailyUsage 三段式配速（均匀 + 风险²前拉 + 软上限 K(1+1.5r)）。
// 数值基准取自参考仓 codex-cockpit 的 dashboard 公开算例（dynamicQuota.test.ts:31-58），
// 本文件逐位对齐；其余用例覆盖 factors 可解释性、边界与容错、RR04 联动。
import { describe, expect, it } from "vitest";
import { planDailyUsage } from "../planner";
import { assessResetRisk } from "../risk";

describe("planDailyUsage：dashboard 数值回归", () => {
  it("周末算例 remaining=100/risk=61.79/K=25/days=7 → 36.1（参考 dynamicQuota.test.ts:31-44）", () => {
    const plan = planDailyUsage({
      remaining: 100,
      risk: 61.79,
      kneePercent: 25,
      daysToReset: 7,
      isWeekend: true,
    });
    expect(plan.suggested).toBe(36.1);
    expect(plan.cap).toBe(36.1);
    expect(plan.uniformPace).toBe(12.5);
    expect(plan.riskBoost).toBe(33.4);
    expect(plan.suggestedRemaining).toBe(63.9);
  });

  it("工作日无周末折扣：remaining=60/risk=40/days=4 → 19.7（参考 dynamicQuota.test.ts:47-58）", () => {
    const plan = planDailyUsage({
      remaining: 60,
      risk: 40,
      daysToReset: 4,
      isWeekend: false,
    });
    expect(plan.uniformPace).toBe(12);
    expect(plan.riskBoost).toBe(7.7);
    expect(plan.cap).toBe(40);
    expect(plan.suggested).toBe(19.7);
    expect(plan.suggestedRemaining).toBe(40.3);
  });
});

describe("planDailyUsage：可解释因子（D006）", () => {
  it("factors 各 delta 之和 = suggested（软上限生效与未生效两态）", () => {
    const capped = planDailyUsage({ remaining: 100, risk: 61.79, daysToReset: 7, isWeekend: true });
    const free = planDailyUsage({ remaining: 60, risk: 40, daysToReset: 4, isWeekend: false });
    expect(capped.factors.reduce((sum, f) => sum + f.delta, 0)).toBeCloseTo(capped.suggested, 5);
    expect(free.factors.reduce((sum, f) => sum + f.delta, 0)).toBeCloseTo(free.suggested, 5);
  });

  it("软上限生效时第三因子为负削减并标注 binding；未生效时为 0", () => {
    const capped = planDailyUsage({ remaining: 100, risk: 61.79, daysToReset: 7, isWeekend: true });
    expect(capped.factors.map((f) => f.id)).toEqual(["pace-uniform", "risk-boost", "soft-cap-binding"]);
    expect(capped.factors[2].delta).toBe(-9.8); // 36.13 - 45.91 = -9.78，削到软上限
    expect(capped.factors[2].note).toContain("生效");

    const free = planDailyUsage({ remaining: 60, risk: 40, daysToReset: 4, isWeekend: false });
    expect(free.factors[2].id).toBe("soft-cap");
    expect(free.factors[2].delta).toBe(0);
    expect(free.factors[2].note).toContain("未构成约束");
  });

  it("每个因子带 id/label/delta/note 四件（D006 渲染契约）", () => {
    const plan = planDailyUsage({ remaining: 80, risk: 30, daysToReset: 5, isWeekend: false });
    for (const factor of plan.factors) {
      expect(factor.id.length).toBeGreaterThan(0);
      expect(factor.label.length).toBeGreaterThan(0);
      expect(typeof factor.delta).toBe("number");
      expect(factor.note.length).toBeGreaterThan(0);
    }
  });
});

describe("planDailyUsage：行为性质", () => {
  it("risk=0 时无前拉，建议 = min(均匀, 软上限)", () => {
    const plan = planDailyUsage({ remaining: 90, risk: 0, daysToReset: 5, isWeekend: false });
    expect(plan.riskBoost).toBe(0);
    expect(plan.suggested).toBe(Math.min(plan.uniformPace, plan.cap));
  });

  it("参数格点扫描：0 ≤ suggested ≤ min(剩余, cap) 且建议后剩余不为负", () => {
    for (const remaining of [0, 7.3, 50, 100]) {
      for (const risk of [0, 25, 61.79, 100]) {
        for (const daysToReset of [0, 1, 3, 7, 12]) {
          const plan = planDailyUsage({ remaining, risk, daysToReset, isWeekend: daysToReset % 2 === 0 });
          expect(plan.suggested).toBeGreaterThanOrEqual(0);
          expect(plan.suggested).toBeLessThanOrEqual(Math.min(remaining, plan.cap) + 1e-9);
          expect(plan.suggestedRemaining).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("daysToReset=0 → 全部剩余按今天一天平摊，仅受软上限约束", () => {
    const plan = planDailyUsage({ remaining: 50, risk: 0, daysToReset: 0, isWeekend: false });
    expect(plan.uniformPace).toBe(50);
    expect(plan.suggested).toBe(25); // softCap = 25×1×1
  });

  it("daysToReset 超 7 按 7 夹紧（周期上限口径 dq:153）", () => {
    expect(planDailyUsage({ remaining: 80, risk: 0, daysToReset: 9, isWeekend: false }).uniformPace).toBe(
      planDailyUsage({ remaining: 80, risk: 0, daysToReset: 7, isWeekend: false }).uniformPace,
    );
  });

  it("isWeekend 缺省由 now 按北京时区推导（周六折扣/周二无折扣）", () => {
    // 2026-10-10 为北京周六、10-13 为北京周二（D004 边界）
    const saturday = planDailyUsage({ remaining: 40, risk: 0, daysToReset: 3, now: new Date("2026-10-10T02:00:00Z") });
    const tuesday = planDailyUsage({ remaining: 40, risk: 0, daysToReset: 3, now: new Date("2026-10-13T02:00:00Z") });
    expect(saturday.cap).toBe(18.8); // 25×1×0.75=18.75，round1 的 .5 进位 → 18.8
    expect(tuesday.cap).toBe(25);
  });

  it("显式 isWeekend 覆盖 now 推导", () => {
    const plan = planDailyUsage({
      remaining: 40,
      risk: 0,
      daysToReset: 3,
      isWeekend: false,
      now: new Date("2026-10-10T02:00:00Z"),
    });
    expect(plan.cap).toBe(25);
  });
});

describe("planDailyUsage：容错（dq:140-153 语义）", () => {
  it("risk NaN → 缺省 10", () => {
    const plan = planDailyUsage({ remaining: 50, risk: Number.NaN, daysToReset: 4, isWeekend: false });
    expect(plan.uniformPace).toBe(10);
    expect(plan.riskBoost).toBe(0.4); // (50-10)×0.01
    expect(plan.suggested).toBe(10.4);
  });

  it("remaining NaN/负 → 按 0 夹紧；daysToReset NaN/负 → 按 0 夹紧", () => {
    expect(planDailyUsage({ remaining: Number.NaN, risk: 50, daysToReset: 3, isWeekend: false }).suggested).toBe(0);
    expect(planDailyUsage({ remaining: -5, risk: 50, daysToReset: 3, isWeekend: false }).suggested).toBe(0);
    expect(planDailyUsage({ remaining: 40, risk: 50, daysToReset: Number.NaN, isWeekend: false }).uniformPace).toBe(40);
    expect(planDailyUsage({ remaining: 40, risk: 50, daysToReset: -2, isWeekend: false }).uniformPace).toBe(40);
  });
});

describe("planDailyUsage：与 RR04 assessResetRisk 联动", () => {
  it("风险分直喂配速器：空历史 score=10 → suggested 12.9（手算）", () => {
    const risk = assessResetRisk([], new Date("2026-10-13T02:00:00Z"));
    expect(risk.score).toBe(10);
    const plan = planDailyUsage({ remaining: 50, daysToReset: 3, risk: risk.score, isWeekend: false });
    // uniform 12.5 + boost 37.5×0.01=0.375 → 12.875 → 12.9；cap 25×1.15 浮点 28.7499…→28.7 未约束
    expect(plan.suggested).toBe(12.9);
    expect(plan.cap).toBe(28.7);
    expect(plan.suggestedRemaining).toBe(37.1);
  });

  it("风险升高 → 建议单调不减（p² 前拉 + 软上限放宽同向）", () => {
    const low = planDailyUsage({ remaining: 70, risk: 10, daysToReset: 5, isWeekend: false });
    const high = planDailyUsage({ remaining: 70, risk: 80, daysToReset: 5, isWeekend: false });
    expect(high.suggested).toBeGreaterThan(low.suggested);
  });
});
