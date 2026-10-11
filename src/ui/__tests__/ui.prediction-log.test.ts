import { describe, expect, it } from "vitest";
import { buildDashboard } from "../adapters";
import { sourceSnapshot } from "../../lib/__tests__/fixtures/resetStatus";
import { buildPredictionRecord } from "../../lib";
import type { ProviderSnapshot } from "../types";
const now = new Date("2026-10-11T05:00:00Z");
const input = (): ProviderSnapshot => ({ provider: "codex", displayName: "CODEX", status: "ok", message: null,
  plan: null, weeklyWindow: null, shortWindow: null, resetCredits: null, rateLimitSnapshot: null,
  updatedAt: "2026-10-10T05:00:00Z", resetStatus: sourceSnapshot() });
describe("生产预测VM", () => {
  it("候选完整来自统一评估时间和核心，不用旧额度时刻作目标日", () => {
    const vm = buildDashboard(input(), [], now);
    expect(vm.prediction).toEqual(buildPredictionRecord({ risk: vm.risk, evaluatedAt: vm.riskEvaluatedAt,
      recordedAt: now, quotaStatus: "ok", resetSourceState: "ok" }));
    expect(vm.prediction?.date).toBe("2026-10-11");
    expect(vm.prediction?.predictedRisk).toBe(vm.risk?.score);
  });
  it("风险独立于额度状态，来源过期或旧契约stale额度不冒充新预测", () => {
    expect(buildDashboard({ ...input(), status: "error" }, [], now).prediction).not.toBeNull();
    expect(buildDashboard({ ...input(), status: "stale", resetStatus: null }, [], now).prediction).toBeNull();
    expect(buildDashboard({ ...input(), resetStatus: sourceSnapshot({ status: "error" }) }, [], now).prediction).toBeNull();
  });
});
