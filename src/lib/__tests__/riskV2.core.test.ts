import { describe, expect, it } from "vitest";

import { HOUR_MS } from "../beijing.ts";
import type { ResetEvent } from "../resetState.ts";
import {
  assessResetRiskV2,
  ageSensitivityProbability,
  COLD_START_PRIOR_DAYS,
  integrateLambda,
  RISK_WINDOW_HOURS,
  SHRINKAGE_DAYS,
  toPercentPoint,
  trainRates,
  watchBlendWeight,
  assessWatchComparability,
  type CoverageWindow,
  type WatchSignal,
} from "../riskV2.ts";

// T0 = 北京时间 2026-10-11（周日）00:00
const T0 = Date.UTC(2026, 9, 11, 0, 0, 0) - 8 * HOUR_MS;
const DAY = 24 * HOUR_MS;

const unexpected = (id: string, at: number, extra: Partial<ResetEvent> = {}): ResetEvent => ({
  id,
  kind: "unexpected",
  occurredAt: at,
  timePrecision: "exact",
  scope: "account",
  source: "test",
  ...extra,
});

const cover = (from: number, to: number): CoverageWindow => ({ from, to });

const watchAt = (probability: number, updatedAt: number, extra: Partial<WatchSignal> = {}): WatchSignal => ({
  probability,
  updatedAt,
  targetMatches: true,
  windowHours: 24,
  includesAnnouncedOrNatural: false,
  ...extra,
});

describe("§3.1 收缩发生率与冷启动", () => {
  it("完全无数据：基线每天 0.1 次 ⇒ 24h 概率约 9.5%，且标注未校准", () => {
    const risk = assessResetRiskV2({ events: [], now: T0, coverage: [] });
    expect(risk.probability24h).toBeCloseTo(0.0952, 3);
    expect(risk.quality.coldStart).toBe(true);
    expect(risk.quality.calibrated).toBe(false);
    expect(risk.assumptions).toContain("cold-start-baseline");
    expect(risk.factorSteps[0].assumption).toBe(true);
    expect(risk.factorSteps[0].note).toContain("尚未校准");
  });

  it("不再把概率夹到 2%–95%：极低发生率可低于 2%", () => {
    const risk = assessResetRiskV2({
      events: [],
      now: T0,
      coverage: [cover(T0 - 3650 * DAY, T0)],
    });
    expect(risk.probability24h).toBeLessThan(0.01);
    expect(risk.probability24h).toBeGreaterThan(0);
  });

  it("不再把概率夹到 2%–95%：极高发生率可高于 95%", () => {
    const events: ResetEvent[] = [];
    for (let i = 0; i < 40; i += 1) {
      events.push(unexpected(`u${i}`, T0 - 2 * DAY + i * ((2 * DAY) / 40)));
    }
    const risk = assessResetRiskV2({ events, now: T0, coverage: [cover(T0 - 2 * DAY, T0)] });
    expect(risk.probability24h).toBeGreaterThan(0.95);
  });

  it("收缩公式：λ0=(K+1)/(E+10)、λw=(Kw+28λ0)/(Ew+28)", () => {
    // 覆盖 10 天、2 次事件，事件都在周一（T0+1d）
    const events = [unexpected("a", T0 + DAY + 2 * HOUR_MS), unexpected("b", T0 + DAY + 4 * HOUR_MS)];
    const table = trainRates({
      events,
      coverage: [cover(T0 - 8 * DAY, T0 + 2 * DAY)],
      now: T0 + 2 * DAY,
      scope: "account",
    });
    const expectedLambda0 = (2 + 1) / (10 + COLD_START_PRIOR_DAYS);
    expect(table.lambda0).toBeCloseTo(expectedLambda0, 10);
    const monday = 1; // 周一
    const expectedLambdaW =
      (2 + SHRINKAGE_DAYS * expectedLambda0) / (table.weekday[monday].exposureDays + SHRINKAGE_DAYS);
    expect(table.weekday[monday].rate).toBeCloseTo(expectedLambdaW, 10);
  });

  it("覆盖期外的事件不计入 K，也不能把首尾跨度当成完整覆盖", () => {
    const inside = unexpected("in", T0 - 5 * DAY);
    const outside = unexpected("out", T0 - 50 * DAY);
    const risk = assessResetRiskV2({
      events: [inside, outside],
      now: T0,
      coverage: [cover(T0 - 10 * DAY, T0)],
    });
    expect(risk.unexpectedEventCount).toBe(1);
    expect(risk.effectiveExposureDays).toBeCloseTo(10, 6);
  });
});

describe("§3.1 按时间分段积分", () => {
  it("未来 24h 跨北京午夜时按两段积分，而不是用「明天星期几」代表整天", () => {
    // 事件只落在周六中午；覆盖 28 天
    const events = [8, 15, 22].map((offset) => unexpected(`s${offset}`, T0 - offset * DAY + 12 * HOUR_MS));
    const table = trainRates({
      events,
      coverage: [cover(T0 - 28 * DAY, T0 - 28 * HOUR_MS)],
      now: T0 - 28 * HOUR_MS,
      scope: "account",
    });

    // 周五 20:00 → 周六 20:00（跨午夜，20/24 的时间在周六）
    const fridayEvening = integrateLambda(table, T0 - 28 * HOUR_MS, T0 - 4 * HOUR_MS, []);
    // 周日 20:00 → 周一 20:00（完全不含周六）
    const sundayEvening = integrateLambda(table, T0 + 20 * HOUR_MS, T0 + 44 * HOUR_MS, []);

    expect(fridayEvening).toBeGreaterThan(sundayEvening * 1.5);
  });

  it("年龄边界（36h/168h）也要切段", () => {
    const table = trainRates({
      events: [unexpected("a", T0 - 10 * DAY)],
      coverage: [cover(T0 - 30 * DAY, T0)],
      now: T0,
      scope: "account",
    });
    // 未来 24h 从「距上次重置 12h」开始：12h→24h 仍在 [0,36h) 组
    const withinFresh = integrateLambda(table, T0 - 12 * HOUR_MS, T0 + 12 * HOUR_MS, [
      { at: T0 - 24 * HOUR_MS, band: "fresh", dayPrecision: false },
    ]);
    expect(withinFresh).toBeGreaterThan(0);
  });
});

describe("§3.2 重置后年龄与敏感性", () => {
  it("年龄组参与计算：同星期下，落在有事件年龄组的概率更高", () => {
    // 三次事件集中在周一（00:00/10:00/20:00），此刻是周一 21:00（年龄 1h）
    const monday = T0 + DAY;
    const events = [
      unexpected("m1", monday),
      unexpected("m2", monday + 10 * HOUR_MS),
      unexpected("m3", monday + 20 * HOUR_MS),
    ];
    const now = monday + 21 * HOUR_MS;
    const input = { events, now, coverage: [cover(T0 - 30 * DAY, monday + DAY)] };
    const risk = assessResetRiskV2(input);
    const noAge = ageSensitivityProbability(input);

    expect(risk.probability24h).toBeGreaterThan(noAge);
    const ageStep = risk.factorSteps.find((step) => step.id === "age");
    expect(ageStep?.assumption).toBe(true);
    expect(ageStep?.note).toContain("同类状态效应假设");
  });

  it("风险年龄未知时只用星期模型", () => {
    const risk = assessResetRiskV2({
      events: [unexpected("a", T0 - 5 * DAY)],
      now: T0,
      coverage: [cover(T0 - 30 * DAY, T0)],
      requestedScope: "global", // 全局口径没有账号风险年龄
    });
    const ageStep = risk.factorSteps.find((step) => step.id === "age");
    expect(ageStep?.note).toContain("只用星期模型");
  });
});

describe("§3.3 公开历史与账号历史分用、日级事件", () => {
  it("来源范围未知的事件不进入账号训练", () => {
    const risk = assessResetRiskV2({
      events: [unexpected("u1", T0 - 2 * DAY, { scope: "unknown" })],
      now: T0,
      coverage: [cover(T0 - 30 * DAY, T0)],
    });
    expect(risk.unexpectedEventCount).toBe(0);
    expect(risk.quality.coldStart).toBe(true);
    expect(risk.quality.missing.some((item) => item.includes("来源范围未知"))).toBe(true);
  });

  it("账号样本为空时退到平台口径，并标注账号适用程度未校准", () => {
    const risk = assessResetRiskV2({
      events: [unexpected("g1", T0 - 2 * DAY, { scope: "global" })],
      now: T0,
      coverage: [cover(T0 - 30 * DAY, T0)],
    });
    expect(risk.scope).toBe("global");
    expect(risk.assumptions).toContain("global-history-as-account-proxy");
    expect(risk.quality.scopeNote).toContain("账号适用程度未校准");
    expect(risk.quality.calibrated).toBe(false);
    expect(risk.unexpectedEventCount).toBe(1);
  });

  it("日级事件进星期统计，但不进 36h 年龄子模型", () => {
    const coverage = [cover(T0 - 30 * DAY, T0)];
    const dayTable = trainRates({
      events: [
        {
          id: "d1",
          kind: "unexpected",
          occurredDate: "2026-10-09",
          timePrecision: "day",
          scope: "account",
          source: "public",
        },
      ],
      coverage,
      now: T0,
      scope: "account",
    });
    expect(dayTable.totalEvents).toBe(1);
    expect(dayTable.ageEligibleEvents).toBe(0);

    const exactTable = trainRates({ events: [unexpected("e1", T0 - 2 * DAY)], coverage, now: T0, scope: "account" });
    expect(exactTable.totalEvents).toBe(1);
    expect(exactTable.ageEligibleEvents).toBe(1);
  });
});

describe("§3.4 watch 融合", () => {
  const base = {
    events: [unexpected("a", T0 - 5 * DAY)],
    now: T0,
    coverage: [cover(T0 - 30 * DAY, T0)],
  };

  it("四项口径全匹配才融合，权重 = 0.25×max(0,1−数据年龄/24h)", () => {
    const local = assessResetRiskV2(base).probability24h;
    const watch = watchAt(0.5, T0);
    const weight = watchBlendWeight(watch, T0);
    expect(weight).toBeCloseTo(0.25, 10);

    const risk = assessResetRiskV2({ ...base, watch });
    expect(risk.watchComparability).toBe("comparable");
    expect(risk.probability24h).toBeCloseTo((1 - weight) * local + weight * 0.5, 10);
    const step = risk.factorSteps.find((item) => item.id === "watch");
    expect(step?.delta).not.toBe(0);
  });

  it("数据超过 24h：仅作独立参考，不融合", () => {
    const local = assessResetRiskV2(base).probability24h;
    const risk = assessResetRiskV2({ ...base, watch: watchAt(0.5, T0 - 48 * HOUR_MS) });
    expect(risk.watchComparability).toBe("reference-only");
    expect(risk.probability24h).toBeCloseTo(local, 10);
    expect(risk.factorSteps.find((item) => item.id === "watch")?.delta).toBe(0);
  });

  it("窗口不一致 / 含公告或自然重置 / 对象不一致：均不融合", () => {
    expect(assessWatchComparability(watchAt(0.5, T0, { windowHours: 48 }), T0)).toBe("reference-only");
    expect(
      assessWatchComparability(watchAt(0.5, T0, { includesAnnouncedOrNatural: true }), T0),
    ).toBe("reference-only");
    expect(assessWatchComparability(watchAt(0.5, T0, { targetMatches: false }), T0)).toBe("reference-only");
    expect(assessWatchComparability(null, T0)).toBe("absent");
  });
});

describe("§3.5 解释输出与 §8 契约", () => {
  const events = [unexpected("a", T0 - 3 * DAY), unexpected("b", T0 - 12 * DAY)];

  it("因子步骤固定顺序：基线 → 星期 → 年龄 → watch", () => {
    const risk = assessResetRiskV2({
      events,
      now: T0,
      coverage: [cover(T0 - 30 * DAY, T0)],
      watch: watchAt(0.4, T0),
    });
    expect(risk.factorSteps.map((step) => step.id)).toEqual(["baseline", "weekday", "age", "watch"]);
    for (const step of risk.factorSteps) {
      expect(step.afterProbability - step.beforeProbability).toBeCloseTo(step.delta, 10);
    }
    expect(risk.factorSteps[0].note).toContain("顺序归因");
  });

  it("返回 target / 存续曲线 / 暴露天数 / 样本数 / 质量 / 假设 / 模型版本", () => {
    const risk = assessResetRiskV2({ events, now: T0, coverage: [cover(T0 - 30 * DAY, T0)] });
    expect(risk.target.definitionVersion).toBeTruthy();
    expect(risk.target.windowHours).toBe(RISK_WINDOW_HOURS);
    expect(risk.target.excludes).toContain("主动用卡");
    expect(risk.modelVersion).toBeTruthy();
    expect(risk.effectiveExposureDays).toBeCloseTo(30, 6);
    expect(risk.unexpectedEventCount).toBe(2);
    expect(risk.quality.dataRange.from).toBe(T0 - 12 * DAY);
    expect(risk.scope).toBe("account");
  });

  it("存续曲线单调不增，24h 处与 probability24h 一致（未融合 watch 时）", () => {
    const risk = assessResetRiskV2({ events, now: T0, coverage: [cover(T0 - 30 * DAY, T0)] });
    for (let i = 1; i < risk.survivalCurve.length; i += 1) {
      expect(risk.survivalCurve[i].survival).toBeLessThanOrEqual(risk.survivalCurve[i - 1].survival + 1e-12);
    }
    const at24 = risk.survivalCurve.find((point) => point.hours === 24);
    expect(at24?.cumulativeProbability).toBeCloseTo(risk.probability24h, 10);
  });

  it("百分点换算（0–1 → 0–100，1 位小数）", () => {
    expect(toPercentPoint(0.09516)).toBe(9.5);
    expect(toPercentPoint(1)).toBe(100);
    expect(toPercentPoint(0)).toBe(0);
  });
});
