import { describe, expect, it } from "vitest";
import { evaluateResetStatus, historyWithResetStatus } from "../resetStatus";
import { sourceSnapshot } from "./fixtures/resetStatus";

const NOW = new Date("2026-10-11T05:00:00Z");

describe("公告来源新鲜度与可用性", () => {
  it("新鲜成功来源的regular计划可用于配速", () => {
    const snapshot = sourceSnapshot();
    const result = evaluateResetStatus(snapshot, NOW);
    expect(result.state).toBe("ok");
    expect(result.actionableReset).toEqual(snapshot.scheduledReset);
  });

  it.each([
    { freshUntil: "2026-10-11T05:00:00Z" }, // 精确边界已过期
    { freshUntil: null },
    { freshUntil: "invalid" },
    { fetchedAt: "2026-10-11T05:01:00Z" }, // 未来时钟不能伪新鲜
    { fetchedAt: null },
    { freshUntil: "2026-10-11T04:58:59Z" },
  ])("来源时效不可信时保留公告但不清仓 (%j)", (patch) => {
    const result = evaluateResetStatus(sourceSnapshot(patch), NOW);
    expect(result.state).toBe("stale");
    expect(result.announcement?.state).toBe("planned");
    expect(result.actionableReset).toBeNull();
  });

  it("新抓取失败与旧计划可同时展示，禁止继续行动", () => {
    const result = evaluateResetStatus(sourceSnapshot({ status: "error", message: "timeout" }), NOW);
    expect(result.state).toBe("error");
    expect(result.announcement?.announcement.id).toBe("future");
    expect(result.actionableReset).toBeNull();
  });

  it("来源成功但计划时刻已过时只标待核实", () => {
    const snapshot = sourceSnapshot();
    snapshot.scheduledReset!.scheduledFor = NOW.toISOString();
    const result = evaluateResetStatus(snapshot, NOW);
    expect(result.state).toBe("ok");
    expect(result.announcement?.state).toBe("awaiting-confirmation");
    expect(result.actionableReset).toBeNull();
  });

  it("成功null公告表示本次确实无计划", () => {
    expect(evaluateResetStatus(sourceSnapshot({ scheduledReset: null }), NOW).announcement).toBeNull();
  });
});

describe("最新事件并入历史", () => {
  it("新确认事件并入，让风险模型及时看到重置", () => {
    expect(historyWithResetStatus(["2026-10-08T00:00:00Z"], sourceSnapshot(), NOW)).toEqual([
      "2026-10-08T00:00:00Z", "2026-10-11T04:01:09Z",
    ]);
  });
  it("相同时刻不同ISO形式不重复增加样本", () => {
    const history = ["2026-10-11T12:01:09+08:00"];
    expect(historyWithResetStatus(history, sourceSnapshot(), NOW)).toBe(history);
  });
  it("失败、过期、未来或非法确认事件不并入", () => {
    const history = ["2026-10-08T00:00:00Z"];
    for (const source of [
      sourceSnapshot({ status: "error" }), sourceSnapshot({ freshUntil: NOW.toISOString() }),
      sourceSnapshot({ latestReset: { announced_at: "2026-10-11T05:01:00Z", reset_type: "regular" } }),
      sourceSnapshot({ latestReset: { announced_at: "invalid", reset_type: "regular" } }),
      sourceSnapshot({ latestReset: { announced_at: "2026-10-11T04:01:09Z", reset_type: "banked" } }),
    ]) expect(historyWithResetStatus(history, source, NOW)).toBe(history);
  });
});
