// RR09 域测试：src/ui/adapters.ts 快照→视图模型映射。
// 锚点：adapters 是 UI 层唯一的装配逻辑（ARCHITECTURE §2），断言口径 = 与 src/lib
// 同参直算结果透传一致 + 字段映射 + 数据缺失降级；不含任何独立业务期望值。
import { describe, expect, it } from "vitest";
import {
  assessResetRisk,
  estimateDailyNeedPercent,
  planDailyUsage,
  planResetCard,
} from "../../lib";
import { buildDashboard } from "../adapters";
import type { ProviderSnapshot } from "../types";

// 固定时间轴：观测时刻 asOf=2026-10-10T12:00Z（北京周日 20:00），
// 周窗重置 resetsAt=2026-10-12T12:00Z → 恰好 daysToReset=2（整数便于对账）。
const AS_OF = "2026-10-10T12:00:00Z";
const RESETS_AT = "2026-10-12T12:00:00Z";
const HISTORY = ["2026-10-05T12:00:00Z", "2026-09-28T12:00:00Z"];

function okSnapshot(overrides: Partial<ProviderSnapshot> = {}): ProviderSnapshot {
  return {
    provider: "codex",
    displayName: "CODEX",
    plan: "PLUS",
    weeklyWindow: { remainingPercent: 55, resetsAt: RESETS_AT, windowSeconds: 604_800 },
    shortWindow: { remainingPercent: 64, resetsAt: null, windowSeconds: 3600 },
    resetCredits: 3,
    rateLimitSnapshot: {
      source: "app-server",
      usedPercent: 45,
      windowDurationMins: 10_080,
      resetsAt: RESETS_AT,
      observedAt: AS_OF,
    },
    updatedAt: AS_OF,
    status: "ok",
    message: null,
    ...overrides,
  };
}

describe("字段透传（RR08 契约 models.rs）", () => {
  it("周窗/短窗/卡量/plan 直映射到视图模型", () => {
    const vm = buildDashboard(okSnapshot(), HISTORY);
    expect(vm.remainingPercent).toBe(55);
    expect(vm.shortRemainingPercent).toBe(64);
    expect(vm.resetCredits).toBe(3);
    expect(vm.plan).toBe("PLUS");
    expect(vm.observedAt).toBe(AS_OF);
    expect(vm.status).toBe("ok");
  });

  it("主数字取周窗而非短窗（换源即红：55≠64）", () => {
    const vm = buildDashboard(okSnapshot(), HISTORY);
    expect(vm.remainingPercent).not.toBe(vm.shortRemainingPercent);
  });
});

describe("三块面板与 src/lib 同参透传", () => {
  it("风险：与 assessResetRisk(history, asOf) 逐位一致（now=观测时刻而非墙钟）", () => {
    const vm = buildDashboard(okSnapshot(), HISTORY);
    const direct = assessResetRisk(HISTORY, new Date(AS_OF));
    expect(vm.risk?.score).toBe(direct.score);
    expect(vm.risk?.factors).toEqual(direct.factors);
  });

  it("今日建议：daysToReset=2 喂参，与 planDailyUsage 同参直算一致", () => {
    const vm = buildDashboard(okSnapshot(), HISTORY);
    const score = assessResetRisk(HISTORY, new Date(AS_OF)).score;
    const direct = planDailyUsage(
      { remaining: 55, daysToReset: 2, risk: score, now: new Date(AS_OF) },
    );
    expect(vm.dailyPlan).toEqual(direct);
  });

  it("用卡规划：dailyNeed 走 lib 兜底 estimateDailyNeedPercent([])，与直算一致", () => {
    const vm = buildDashboard(okSnapshot(), HISTORY);
    const score = assessResetRisk(HISTORY, new Date(AS_OF)).score;
    const direct = planResetCard({
      remainingPercent: 55,
      resetsAt: RESETS_AT,
      resetCredits: 3,
      creditExpiresAt: null,
      dailyNeedPercent: estimateDailyNeedPercent([]),
      tomorrowRiskPercent: score,
      now: new Date(AS_OF),
    });
    expect(vm.cardPlan).toEqual(direct);
    expect(vm.cardPlan?.credits).toBe(3);
  });
});

describe("数据缺失降级", () => {
  it("无周窗 → 胶囊数字/建议/规划为空，风险仍按历史给出", () => {
    const vm = buildDashboard(
      okSnapshot({ weeklyWindow: null }),
      HISTORY,
    );
    expect(vm.remainingPercent).toBeNull();
    expect(vm.dailyPlan).toBeNull();
    expect(vm.cardPlan).toBeNull();
    expect(vm.risk).not.toBeNull();
  });

  it("周窗已过期（resetsAt ≤ 观测时刻）→ 两块面板不展示（planResetCard null 口径）", () => {
    const vm = buildDashboard(
      okSnapshot({
        weeklyWindow: { remainingPercent: 55, resetsAt: AS_OF, windowSeconds: 604_800 },
      }),
      HISTORY,
    );
    expect(vm.dailyPlan).toBeNull();
    expect(vm.cardPlan).toBeNull();
  });

  it("采集失败快照（unavailable）→ 状态透传可展示，风险面板仍可用", () => {
    const vm = buildDashboard(
      okSnapshot({
        status: "unavailable",
        message: "codex app-server 未登录",
        weeklyWindow: null,
        shortWindow: null,
        resetCredits: null,
        rateLimitSnapshot: null,
      }),
      HISTORY,
    );
    expect(vm.status).toBe("unavailable");
    expect(vm.message).toBe("codex app-server 未登录");
    expect(vm.remainingPercent).toBeNull();
    expect(vm.risk).not.toBeNull();
  });
});
