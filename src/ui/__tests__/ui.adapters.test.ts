// RR09 域测试：src/ui/adapters.ts 快照→视图模型映射。
// 锚点：adapters 是 UI 层唯一的装配逻辑（ARCHITECTURE §2），断言口径 = 与 src/lib
// 同参直算结果透传一致 + 字段映射 + 数据缺失降级；不含任何独立业务期望值。
import { describe, expect, it } from "vitest";
import { assessResetRiskV2, historyEvents } from "../../lib";
import { buildDashboard } from "../adapters";
import type { ProviderSnapshot } from "../types";
import { RESET_HISTORY_ANNOUNCED_AT, RESET_HISTORY_SOURCE } from "../history";

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

describe("RR18历史接线与独立来源", () => {
  it("生产夹具中banked排除，regular完整且无重复接到风险模型", () => {
    const expected = [...new Set(RESET_HISTORY_SOURCE.events
      .filter((event) => event.resetType === "regular")
      .map((event) => new Date(event.announcedAt).toISOString()))].sort().reverse();
    expect(RESET_HISTORY_ANNOUNCED_AT).toEqual(expected);
    for (const event of RESET_HISTORY_SOURCE.events.filter((event) => event.resetType === "banked")) {
      const instant = new Date(event.announcedAt).toISOString();
      if (!expected.includes(instant)) expect(RESET_HISTORY_ANNOUNCED_AT).not.toContain(instant);
    }
  });
  it("历史过期元数据透传，保留独立额度观测时刻且兼容旧调用", () => {
    const source = { fetchedAt: "2026-10-01T12:00:00Z", events: [
      { resetType: "regular", announcedAt: "2026-09-30T12:00:00Z" },
      { resetType: "banked", announcedAt: "2026-09-29T12:00:00Z" },
    ] };
    const vm = buildDashboard(okSnapshot(), HISTORY, new Date(AS_OF), source);
    expect(vm.historySource).toMatchObject({ state: "stale", asOf: "2026-10-01T12:00:00.000Z",
      totalEvents: 2, quotaResetEvents: 1, excludedEvents: 1 });
    expect(vm.observedAt).toBe(AS_OF);
    expect(buildDashboard(okSnapshot(), HISTORY, new Date(AS_OF)).historySource).toBeNull();
  });
});

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
  it("风险：与 v2 事件流同参评估一致（now=观测时刻而非墙钟）", () => {
    const vm = buildDashboard(okSnapshot(), HISTORY);
    const direct = assessResetRiskV2({ events: historyEvents(HISTORY), now: Date.parse(AS_OF) });
    expect(vm.risk).toEqual(direct);
    expect(vm.riskPercent).toBe(Math.round(direct.probability24h * 1000) / 10);
  });

  it("需求未知时今日建议如实为空，不伪造固定配速", () => {
    const vm = buildDashboard(okSnapshot(), HISTORY);
    expect(vm.dailyPlan?.todaySuggested).toBeNull();
    expect(vm.dailyPlan?.demandQuality).toBe("unknown");
    expect(vm.dailyPlan?.explanations.some((text) => text.includes("需求未知"))).toBe(true);
  });

  it("用卡规划使用 v2 决策契约并明确留出需求未知说明", () => {
    const vm = buildDashboard(okSnapshot(), HISTORY);
    expect(vm.cardPlan).not.toBeNull();
    expect(vm.cardPlan?.decision).toMatch(/^(not_applicable|hold|use_today|wait|uncertain)$/);
    expect(Array.isArray(vm.cardPlan?.candidateResults)).toBe(true);
    expect(Number.isFinite(vm.cardPlan?.incrementalUsage)).toBe(true);
    expect(vm.cardPlan?.horizonSensitivity).toHaveProperty("flipped");
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
