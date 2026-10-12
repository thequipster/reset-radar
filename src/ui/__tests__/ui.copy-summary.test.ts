// RR27 域测试：复制摘要文本（02-spec §2——单位、模型标签、时刻、stale 标记、演示标识）。
// VM 用真实 buildDashboard 装配（快照形状与 ui.adapters.test 同源），不手造业务数字。
import { describe, expect, it } from "vitest";
import { buildDashboard } from "../adapters";
import { buildCopySummary } from "../copySummary";
import type { ProviderSnapshot } from "../types";

const AS_OF = "2026-10-10T12:00:00Z"; // 北京周日 20:00
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
      source: "app-server", usedPercent: 45, windowDurationMins: 10_080,
      resetsAt: RESETS_AT, observedAt: AS_OF,
    },
    updatedAt: AS_OF,
    status: "ok",
    message: null,
    ...overrides,
  };
}

describe("buildCopySummary", () => {
  const freshHistory = { fetchedAt: AS_OF, events: HISTORY.map((t) => ({ resetType: "regular", announcedAt: t })) };

  it("正常态：单位、模型标签、北京时刻齐备；无 stale 字样", () => {
    const vm = buildDashboard(okSnapshot(), HISTORY, new Date(AS_OF), freshHistory);
    const text = buildCopySummary(vm, { status: "missing" }, { live: true });
    expect(text).toContain("reset-radar 状态摘要\n");
    expect(text).toContain("方案：codex · PLUS");
    expect(text).toContain("周额度剩余：55%｜短窗剩余：64%");
    expect(text).toContain("重置卡：卡 ×3");
    expect(text).toContain("重置风险（未来24h 模型估计）");
    expect(text).toContain("今日建议：需求未知");
    expect(text).toContain("额度观测：2026/10/10 20:00:00（北京时间）");
    expect(text).toContain("校准：尚未生成报告");
    expect(text).not.toContain("演示");
    expect(text).not.toContain("过期");
  });

  it("演示模式首行带标识，绝不冒充实跑", () => {
    const vm = buildDashboard(okSnapshot(), HISTORY, new Date(AS_OF), freshHistory);
    const text = buildCopySummary(vm, { status: "missing" }, { live: false });
    expect(text.startsWith("reset-radar 状态摘要（演示数据 · 非本机实采）")).toBe(true);
  });

  it("stale 历史必须带“基于上次观测”标记（不能暗示实时）", () => {
    const staleHistory = { fetchedAt: "2026-10-01T12:00:00Z", events: [] };
    const vm = buildDashboard(okSnapshot(), HISTORY, new Date(AS_OF), staleHistory);
    expect(vm.historySource?.state).toBe("stale");
    const text = buildCopySummary(vm, { status: "missing" }, { live: true });
    expect(text).toContain("历史来源：已过期");
    expect(text).toContain("——以上建议基于上次观测");
  });

  it("校准三态：missing/invalid/ok（ok 零样本与有样本分支）", () => {
    const vm = buildDashboard(okSnapshot(), HISTORY, new Date(AS_OF), freshHistory);
    expect(buildCopySummary(vm, { status: "invalid" }, { live: true })).toContain("校准：报告无效，需重新生成");
    const zero = buildCopySummary(vm, {
      status: "ok",
      data: {
        state: "fresh", generatedAt: AS_OF, historyAsOf: AS_OF, coverageStart: null,
        sampleCount: 0, realizedWindows: 0, brier: null, hitRate: null, thresholdPercent: 50,
        watchPairedSamples: 0,
        excluded: { legacy: 3, invalid: 0, late: 0, pending: 0, outsideHistory: 0, duplicate: 0 },
      },
    }, { live: true });
    expect(zero).toContain("校准：数据积累中（n=0）");
    const scored = buildCopySummary(vm, {
      status: "ok",
      data: {
        state: "fresh", generatedAt: AS_OF, historyAsOf: AS_OF, coverageStart: null,
        sampleCount: 40, realizedWindows: 12, brier: 0.18, hitRate: 0.85, thresholdPercent: 50,
        watchPairedSamples: 0,
        excluded: { legacy: 0, invalid: 0, late: 0, pending: 0, outsideHistory: 0, duplicate: 0 },
      },
    }, { live: true });
    expect(scored).toContain("校准：n=40，Brier 0.180，命中率 85.0%");
  });

  it("缺周窗：不给建议数字，短窗 null 不写成 0%", () => {
    const broken = okSnapshot({
      weeklyWindow: null,
      shortWindow: null,
      resetCredits: null,
    });
    const vm = buildDashboard(broken, HISTORY, new Date(AS_OF), freshHistory);
    const text = buildCopySummary(vm, { status: "missing" }, { live: true });
    expect(text).toContain("周额度剩余：—");
    expect(text).not.toContain("短窗剩余");
    expect(text).toContain("重置卡：卡 —");
    expect(text).not.toContain("今日建议追加");
  });
});
