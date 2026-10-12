import { describe, expect, it } from "vitest";
import { buildDashboard } from "../adapters";
import type { ProviderSnapshot } from "../types";
import type { DailyUsageSample } from "../../lib/plannerV2";

const NOW = new Date("2026-10-12T00:00:00Z"); // 北京 08:00
const snapshot: ProviderSnapshot = {
  provider: "codex", displayName: "CODEX", plan: "PLUS", status: "ok", message: null,
  accountKey: "codex:survival-regression",
  weeklyWindow: { remainingPercent: 60, resetsAt: "2026-10-17T00:00:00Z", windowSeconds: 604800 },
  shortWindow: null, resetCredits: 0,
  rateLimitSnapshot: { source: "app-server", observedAt: NOW.toISOString(), usedPercent: 40,
    windowDurationMins: 10080, resetsAt: "2026-10-17T00:00:00Z" },
  updatedAt: NOW.toISOString(),
};

const usageHistory: DailyUsageSample[] = [
  "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05",
  "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10",
].map((dateKey) => ({ dateKey, usedPercent: 8 }));

describe("dashboard pace survival input", () => {
  it("uses elapsed hours from model as-of so later daily allocations have lower survival", () => {
    const vm = buildDashboard(snapshot, [
      "2026-09-20T12:00:00Z", "2026-09-27T12:00:00Z", "2026-10-04T12:00:00Z",
    ], NOW, undefined, undefined, usageHistory);
    const allocations = vm.dailyPlan?.dailyAllocations ?? [];

    expect(vm.dailyPlan?.demandQuality).toBe("estimated");
    expect(allocations.length).toBeGreaterThan(2);
    expect(allocations[0]!.survival).toBeGreaterThan(allocations[1]!.survival);
    expect(new Set(allocations.map(({ survival }) => survival)).size).toBeGreaterThan(1);
  });
});
