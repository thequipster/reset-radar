// RR43 域测试：迷你圆「唯一数字」的选取与格式化。数字一律取自 adapters 视图模型，
// 本测试只锁展示口径（取哪个字段、保留几位、无数据时怎么诚实显示），不重算业务值。
import { describe, expect, it } from "vitest";
import { buildDashboard } from "../adapters";
import type { ProviderSnapshot } from "../types";
import { DEFAULT_ORB_METRIC, isOrbMetric, nextOrbMetric, orbReadout, riskBand } from "../orbMetric";
import { sourceSnapshot } from "../../lib/__tests__/fixtures/resetStatus";

const NOW = new Date("2026-10-11T05:00:00Z");
const snapshot = (): ProviderSnapshot => ({
  provider: "codex",
  displayName: "CODEX",
  plan: "PLUS",
  status: "ok",
  message: null,
  resetCredits: 3,
  shortWindow: null,
  weeklyWindow: { remainingPercent: 29, resetsAt: "2026-10-17T05:00:00Z", windowSeconds: 604800 },
  rateLimitSnapshot: {
    source: "app-server",
    observedAt: "2026-10-10T05:00:00Z",
    usedPercent: 71,
    windowDurationMins: 10080,
    resetsAt: "2026-10-17T05:00:00Z",
  },
  updatedAt: "2026-10-10T05:00:00Z",
  resetStatus: sourceSnapshot(),
});

describe("orbReadout（三种指标各显示一个数）", () => {
  it("需求未知时配速显示占位符，不代入固定值", () => {
    const vm = buildDashboard(snapshot(), [], NOW);
    const readout = orbReadout(vm, "pace");
    expect(vm.dailyPlan?.todaySuggested).toBeNull();
    expect(readout.value).toBe("—");
    expect(readout.unit).toBe("");
    expect(readout.hasValue).toBe(false);
    expect(readout.metric).toBe("pace");
  });

  it("风险：取 riskPercent，一位小数 + %，圆环填充同风险分", () => {
    const vm = buildDashboard(snapshot(), [], NOW);
    const readout = orbReadout(vm, "risk");
    expect(readout.value).toBe(vm.riskPercent.toFixed(1));
    expect(readout.unit).toBe("%");
    expect(readout.percent).toBe(vm.riskPercent);
    expect(readout.band).toBe(riskBand(vm.riskPercent));
  });

  it("剩余：周额度取整 + %", () => {
    const vm = buildDashboard(snapshot(), [], NOW);
    const readout = orbReadout(vm, "remaining");
    expect(readout.value).toBe(String(Math.round(vm.remainingPercent ?? 0)));
    expect(readout.unit).toBe("%");
    expect(readout.value).toBe("29");
  });

  it("无数据（空态/加载中）：显示占位符，圆环留空，不伪造 0%", () => {
    const readout = orbReadout(null, DEFAULT_ORB_METRIC);
    expect(readout.value).toBe("—");
    expect(readout.hasValue).toBe(false);
    expect(readout.percent).toBeNull();
    expect(readout.band).toBe("unknown");
  });

  it("字段缺失时逐个降级为占位符，而不是显示 undefined/NaN", () => {
    const vm = buildDashboard(snapshot(), [], NOW);
    const risky = { ...vm, riskPercent: Number.NaN, dailyPlan: null, remainingPercent: null };
    for (const metric of ["pace", "risk", "remaining"] as const) {
      const readout = orbReadout(risky, metric);
      expect(readout.value).toBe("—");
      expect(readout.hasValue).toBe(false);
    }
  });

  it("标题带上语义说明（悬浮/无障碍可读出这个数是什么）", () => {
    const vm = buildDashboard(snapshot(), [], NOW);
    expect(orbReadout(vm, "pace").title).toContain("今日建议配速");
    expect(orbReadout(vm, "risk").title).toContain("24h 重置风险");
    expect(orbReadout(vm, "remaining").title).toContain("周额度剩余");
  });
});

describe("riskBand（与胶囊/面板风险徽章同阈值 30/60）", () => {
  it("分档边界：<30 低，30–60 中，≥60 高；空值/NaN 归未知", () => {
    expect(riskBand(0)).toBe("low");
    expect(riskBand(29.9)).toBe("low");
    expect(riskBand(30)).toBe("mid");
    expect(riskBand(59.9)).toBe("mid");
    expect(riskBand(60)).toBe("high");
    expect(riskBand(100)).toBe("high");
    expect(riskBand(null)).toBe("unknown");
    expect(riskBand(Number.NaN)).toBe("unknown");
  });

  it("圆环填充夹在 0–100，不给负分或超界分画满环", () => {
    const vm = buildDashboard(snapshot(), [], NOW);
    const high = { ...vm, riskPercent: 180 } as typeof vm;
    const low = { ...vm, riskPercent: -20 } as typeof vm;
    expect(orbReadout(high, "risk").percent).toBe(100);
    expect(orbReadout(low, "risk").percent).toBe(0);
  });
});

describe("指标轮换（右键 / 托盘菜单同一组选项）", () => {
  it("pace → risk → remaining → pace 循环", () => {
    expect(nextOrbMetric("pace")).toBe("risk");
    expect(nextOrbMetric("risk")).toBe("remaining");
    expect(nextOrbMetric("remaining")).toBe("pace");
  });

  it("默认值是配速；非法串不通过校验", () => {
    expect(DEFAULT_ORB_METRIC).toBe("pace");
    expect(isOrbMetric("pace")).toBe(true);
    expect(isOrbMetric("nope")).toBe(false);
  });
});
