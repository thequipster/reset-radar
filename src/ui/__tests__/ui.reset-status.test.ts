import { describe, expect, it } from "vitest";
import { buildDashboard } from "../adapters";
import type { ProviderSnapshot } from "../types";
import { assessResetRisk, planDailyUsage, planResetCard, estimateDailyNeedPercent } from "../../lib";
import { sourceSnapshot } from "../../lib/__tests__/fixtures/resetStatus";

const NOW = new Date("2026-10-11T05:00:00Z");
const HISTORY = ["2026-10-08T00:00:00Z"];
const snapshot = (): ProviderSnapshot => ({
  provider: "codex", displayName: "CODEX", plan: "PLUS", status: "ok", message: null,
  resetCredits: 3, shortWindow: null,
  weeklyWindow: { remainingPercent: 29, resetsAt: "2026-10-17T05:00:00Z", windowSeconds: 604800 },
  rateLimitSnapshot: { source: "app-server", observedAt: "2026-10-10T05:00:00Z", usedPercent: 71,
    windowDurationMins: 10080, resetsAt: "2026-10-17T05:00:00Z" },
  updatedAt: "2026-10-10T05:00:00Z", resetStatus: sourceSnapshot(),
});

describe("公告生产adapter接线", () => {
  it("新公告不冻结在旧额度观测时间，建议与核心同参逐字段一致", () => {
    const input = snapshot();
    const vm = buildDashboard(input, HISTORY, NOW);
    const schedule = input.resetStatus!.scheduledReset;
    const risk = assessResetRisk([...HISTORY, "2026-10-11T04:01:09Z"], NOW, undefined, schedule);
    expect(vm.observedAt).toBe("2026-10-10T05:00:00Z");
    expect(vm.riskEvaluatedAt).toBe(NOW.toISOString());
    expect(vm.risk).toEqual(risk);
    expect(vm.dailyPlan).toEqual(planDailyUsage({ remaining: 29, daysToReset: 6, risk: risk.score, now: NOW, scheduledReset: schedule }));
    expect(vm.cardPlan).toEqual(planResetCard({ remainingPercent: 29, resetsAt: input.weeklyWindow!.resetsAt!,
      resetCredits: 3, creditExpiresAt: null, dailyNeedPercent: estimateDailyNeedPercent([]),
      tomorrowRiskPercent: risk.score, now: NOW, scheduledReset: schedule }));
    expect(vm.resetStatus?.state).toBe("ok");
    expect(vm.dailyPlan?.planningResetAt).toBe("2026-10-11T07:00:00Z");
  });

  it("失败来源只保留展示信息，传给规划的公告为空", () => {
    const input = snapshot();
    input.resetStatus = sourceSnapshot({ status: "error", message: "TLS request failed" });
    const vm = buildDashboard(input, HISTORY, NOW);
    expect(vm.resetStatus?.state).toBe("error");
    expect(vm.resetStatus?.announcement?.announcement.id).toBe("future");
    expect(vm.resetStatus?.message).toBe("TLS request failed");
    expect(vm.dailyPlan?.planningResetAt).toBeUndefined();
    expect(vm.cardPlan?.planningResetAt).toBeUndefined();
  });

  it("不把来源抓取时间写成额度观测时间，也不合成watch概率", () => {
    const vm = buildDashboard(snapshot(), HISTORY, NOW);
    expect(vm.resetStatus?.fetchedAt).toBe("2026-10-11T04:59:00Z");
    expect(vm.observedAt).not.toBe(vm.resetStatus?.fetchedAt);
    expect(vm.risk?.factors.some((factor) => factor.id === "tracker-watch")).toBe(false); // RR16消费，RR23原样透传
    expect(vm.resetStatus?.activeWatch).toEqual({ reset_chance_percent: 80 });
  });

  it("已过自然窗口不沿用旧额度时间生成今天的用卡建议", () => {
    const input = snapshot();
    input.weeklyWindow!.resetsAt = "2026-10-11T04:59:59Z";
    expect(buildDashboard(input, HISTORY, NOW).dailyPlan).toBeNull();
    expect(buildDashboard(input, HISTORY, NOW).cardPlan).toBeNull();
  });
});
