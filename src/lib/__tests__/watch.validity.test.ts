import { describe, expect, it } from "vitest";
import { assessWatchSignal } from "../watchSignal";

const NOW = new Date("2026-10-11T05:00:00.000Z");
const signal = (patch: Record<string, unknown> = {}) => ({
  level: "strong", reset_chance_percent: 80,
  observed_at: "2026-10-11T04:00:00Z", expires_at: "2026-10-11T06:00:00Z",
  ...patch,
});

describe("active_watch 有效性", () => {
  it.each([0, 80, 100])("接受有限范围概率 %i", (percent) => {
    expect(assessWatchSignal(signal({ reset_chance_percent: percent }), NOW)).toMatchObject({ state: "active", percent });
  });

  it("接受缺失概率但不生成概率数值", () => {
    const raw: Record<string, unknown> = signal();
    delete raw.reset_chance_percent;
    expect(assessWatchSignal(raw, NOW)).toMatchObject({ state: "active", percent: null });
  });

  it("到期精确边界为 expired", () => {
    expect(assessWatchSignal(signal({ expires_at: NOW.toISOString() }), NOW).state).toBe("expired");
  });

  it("允许观测时间恰在未来五分钟，超过一毫秒标为 future", () => {
    expect(assessWatchSignal(signal({ observed_at: "2026-10-11T05:05:00.000Z" }), NOW).state).toBe("active");
    expect(assessWatchSignal(signal({ observed_at: "2026-10-11T05:05:00.001Z" }), NOW).state).toBe("future");
  });

  it("不可用来源不读取信号，null 原始信号仍表示 absent", () => {
    expect(assessWatchSignal(signal(), NOW, false).state).toBe("source-unavailable");
    expect(assessWatchSignal(null, NOW).state).toBe("absent");
  });

  it.each([
    [{ observed_at: undefined }],
    [{ expires_at: "not-a-date" }],
    [{ reset_chance_percent: "80" }],
    [{ reset_chance_percent: -1 }],
    [{ reset_chance_percent: 101 }],
    [{ level: "moderate" }],
    [{ observed_at: "2026-02-30T04:00:00Z" }],
    [{ expires_at: "2026-10-11T04:00:00Z" }],
  ] as [Record<string, unknown>][]) ("拒绝缺失或格式错误的字段 %j", (patch) => {
    expect(assessWatchSignal(signal(patch), NOW).state).toBe("invalid");
  });
});
