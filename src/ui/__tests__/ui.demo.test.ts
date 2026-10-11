// RR27 域测试：演示场景注入（hash → 快照）。演示数据只用于预览/状态截图，
// 必须与生产采集路径隔离（02-spec §6 末行）。
import { describe, expect, it } from "vitest";
import { DEMO_SCENARIOS, demoScenarioSnapshot, demoSnapshot, parseDemoScenario } from "../demoScenarios";

describe("parseDemoScenario", () => {
  it("识别六场景；支持组合段（#expanded&demo=empty）；非法值 null", () => {
    for (const scenario of DEMO_SCENARIOS) {
      expect(parseDemoScenario(`#demo=${scenario}`)).toBe(scenario);
      expect(parseDemoScenario(`#expanded&demo=${scenario}`)).toBe(scenario);
    }
    expect(parseDemoScenario("")).toBeNull();
    expect(parseDemoScenario("#expanded")).toBeNull();
    expect(parseDemoScenario("#demo=healthy")).toBeNull();
    expect(parseDemoScenario("#xdemo=empty")).toBeNull(); // 前缀相似不误匹配
    expect(parseDemoScenario("#demo=empty&")).toBe("empty"); // 尾空段不吞场景
  });
});

describe("demoScenarioSnapshot", () => {
  it("empty/loading 无快照（由 phase 呈现）；其余场景字段形状合法", () => {
    expect(demoScenarioSnapshot("empty")).toBeNull();
    expect(demoScenarioSnapshot("loading")).toBeNull();
    const error = demoScenarioSnapshot("error");
    expect(error?.status).toBe("error");
    expect(error?.message).toContain("演示");
    expect(demoScenarioSnapshot("credits-zero")?.resetCredits).toBe(0);
    expect(demoScenarioSnapshot("credits-unknown")?.resetCredits).toBeNull();
    const stale = demoScenarioSnapshot("stale");
    const observed = stale?.rateLimitSnapshot?.observedAt ?? null;
    expect(observed != null && Date.now() - Date.parse(observed) > 24 * 3_600_000).toBe(true);
    // 过期语义来自数据层状态（注入过期公告来源），UI 不自设阈值。
    expect(stale?.resetStatus?.freshUntil).toBe(observed);
  });

  it("默认演示快照带未来自然重置时刻（配速可算）", () => {
    const snapshot = demoSnapshot();
    expect(snapshot.provider).toBe("codex");
    const resetsAt = snapshot.weeklyWindow?.resetsAt;
    expect(resetsAt != null && Date.parse(resetsAt) > Date.now()).toBe(true);
  });
});

describe("RR29：卡数场景带有效周窗（no-credits 决策分支可达）", () => {
  it("credits-zero/credits-unknown 的自然重置时刻在未来（cardPlan 可生成）", () => {
    for (const scenario of ["credits-zero", "credits-unknown"] as const) {
      const snapshot = demoScenarioSnapshot(scenario);
      const resetsAt = snapshot?.weeklyWindow?.resetsAt ?? null;
      expect(resetsAt != null && Date.parse(resetsAt) > Date.now()).toBe(true);
    }
  });
});
