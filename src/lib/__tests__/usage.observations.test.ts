import { describe, expect, it } from "vitest";
import { aggregateDailyUsage, parseUsageObservations, type UsageObservation } from "../usageObservations";
import { DAY_MS } from "../beijing";

const ACCOUNT = "codex:fixed-account";
const OTHER = "codex:other-account";
const RESET = "2026-10-10T00:00:00.000Z";
const dayStart = (dateKey: string) => Date.parse(`${dateKey}T00:00:00.000Z`) - 8 * 60 * 60_000;

function observation(at: number, remainingPercent: number, overrides: Partial<UsageObservation> = {}): UsageObservation {
  return { id: `u-${ACCOUNT}-${at}`, observedAt: new Date(at).toISOString(), accountKey: ACCOUNT,
    remainingPercent, resetsAt: RESET, ...overrides };
}

function fiveMinuteRows(from: number, until: number, options: {
  accountKey?: string; startRemaining?: number; perStep?: number; resetsAt?: string;
} = {}): UsageObservation[] {
  const rows: UsageObservation[] = [];
  const count = (until - from) / 300_000;
  for (let i = 0; i <= count; i++) {
    rows.push(observation(from + i * 300_000, Math.max(0, (options.startRemaining ?? 90) - i * (options.perStep ?? 0.02)), {
      accountKey: options.accountKey ?? ACCOUNT,
      resetsAt: options.resetsAt ?? RESET,
    }));
  }
  return rows;
}

describe("aggregateDailyUsage", () => {
  it("两天连续 5 分钟观测按固定账号生成完整北京日差量，当前日不计", () => {
    const first = dayStart("2026-10-08");
    const now = dayStart("2026-10-10") + 8 * 60 * 60_000;
    const rows = fiveMinuteRows(first, now);
    const samples = aggregateDailyUsage(rows, ACCOUNT, now);
    expect(samples.map(({ dateKey }) => dateKey)).toEqual(["2026-10-08", "2026-10-09"]);
    expect(samples[0]?.usedPercent).toBeCloseTo(5.76, 8);
    expect(samples[1]?.usedPercent).toBeCloseTo(5.76, 8);
    expect(samples.some(({ dateKey }) => dateKey === "2026-10-10")).toBe(false);
  });

  it("只聚合选定账号，不混入另一个账号的日耗", () => {
    const start = dayStart("2026-10-08");
    const end = dayStart("2026-10-10");
    const rows = [...fiveMinuteRows(start, end, { perStep: 0.01 }),
      ...fiveMinuteRows(start, end, { accountKey: OTHER, startRemaining: 80, perStep: 0.1 })];
    const samples = aggregateDailyUsage(rows, ACCOUNT, end + DAY_MS);
    expect(samples[0]?.usedPercent).toBeCloseTo(2.88, 8);
    expect(samples[1]?.usedPercent).toBeCloseTo(2.88, 8);
    expect(aggregateDailyUsage(rows, null, end + DAY_MS)).toEqual([]);
  });

  it("缺采间隔超过 15 分钟的完整日整日剔除", () => {
    const start = dayStart("2026-10-08");
    const end = dayStart("2026-10-09");
    const rows = fiveMinuteRows(start, end);
    const gapStart = start + 8 * 60 * 60_000;
    const incomplete = rows.filter((row) => {
      const at = Date.parse(row.observedAt);
      return at < gapStart || at > gapStart + 20 * 60_000;
    });
    expect(aggregateDailyUsage(incomplete, ACCOUNT, end + DAY_MS)).toEqual([]);
  });

  it("周期变化或余额上跳会丢弃受影响日，不伪算为负日耗或用量", () => {
    const start = dayStart("2026-10-08");
    const end = dayStart("2026-10-10");
    const stable = fiveMinuteRows(start, end);
    const changedCycle = stable.map((row) => Date.parse(row.observedAt) >= dayStart("2026-10-09")
      ? { ...row, resetsAt: "2026-10-17T00:00:00.000Z" } : row);
    expect(aggregateDailyUsage(changedCycle, ACCOUNT, end + DAY_MS).map(({ dateKey }) => dateKey)).toEqual(["2026-10-09"]);

    const jumped = stable.map((row) => Date.parse(row.observedAt) === start + 12 * 60 * 60_000
      ? { ...row, remainingPercent: row.remainingPercent + 5 } : row);
    expect(aggregateDailyUsage(jumped, ACCOUNT, end + DAY_MS).map(({ dateKey }) => dateKey)).toEqual(["2026-10-09"]);
  });

  it("跨北京时间午夜的 5 分钟区间按重叠时长分摊到两天", () => {
    const first = dayStart("2026-10-08");
    // 采样落在 :02/:07…，首尾覆盖点分别在午夜前后，形成跨午夜区间。
    const rows = fiveMinuteRows(first - 3 * 60_000, first + 2 * DAY_MS + 2 * 60_000, { perStep: 0.05 });
    const samples = aggregateDailyUsage(rows, ACCOUNT, first + 2 * DAY_MS + 8 * 60 * 60_000);
    expect(samples.map(({ dateKey }) => dateKey)).toEqual(["2026-10-08", "2026-10-09"]);
    expect(samples[0]?.usedPercent).toBeCloseTo(14.4, 8);
    expect(samples[1]?.usedPercent).toBeCloseTo(14.4, 8);
  });

  it("解析跳过损坏行并保留耗尽标记", () => {
    const start = dayStart("2026-10-08");
    const end = dayStart("2026-10-09");
    const rows = fiveMinuteRows(start, end, { startRemaining: 3, perStep: 0.02 });
    const content = ["not-json", JSON.stringify(rows[0]), "{}", ...rows.slice(1).map((row) => JSON.stringify(row))].join("\n");
    const parsed = parseUsageObservations(content);
    expect(parsed).toHaveLength(rows.length);
    const samples = aggregateDailyUsage(parsed, ACCOUNT, end + DAY_MS);
    expect(samples).toHaveLength(1);
    expect(samples[0]?.exhausted).toBe(true);
    expect(samples[0]?.usedPercent).toBeCloseTo(3, 8);
  });
});
