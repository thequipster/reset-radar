import { describe, expect, it } from "vitest";

import { DAY_MS, HOUR_MS } from "../beijing.ts";
import { estimateDemand, type DailyUsageSample } from "../plannerV2.ts";
import { createInitialState, type CycleRules, type QuotaState } from "../resetState.ts";
import {
  buildCandidates,
  DEFAULT_DECISION_HOUR,
  MIN_USEFUL_GAIN_PERCENT,
  mulberry32,
  nextShockTime,
  planResetCardV2,
  ZERO_RATE_TABLE,
  type CardState,
  type ResetCardInputV2,
} from "../resetCardV2.ts";
import { trainRates } from "../riskV2.ts";

const NOW = Date.UTC(2026, 9, 11, 0, 0, 0) - 8 * HOUR_MS; // 北京 2026-10-11 00:00
const DAY = 24 * HOUR_MS;

function flatSamples(days: number, value: number): DailyUsageSample[] {
  const out: DailyUsageSample[] = [];
  for (let i = days; i >= 1; i -= 1) {
    const at = NOW - i * DAY;
    out.push({
      dateKey: new Date(at + 8 * HOUR_MS).toISOString().slice(0, 10),
      usedPercent: value,
    });
  }
  return out;
}

const demand10 = estimateDemand(flatSamples(28, 10), NOW);

const CARD: CardState = { id: "k1", expiresAt: NOW + 30 * DAY };

const RULES: CycleRules = {
  cycleDurationHours: 168,
  cycleRuleSource: "configured",
  unexpectedResetScheduleRule: "keep",
};

const stateOf = (remaining: number, nextNatural: number | null): QuotaState =>
  createInitialState({
    remaining,
    nextNaturalResetAt: nextNatural,
    cardsRemaining: 1,
    cardExpirations: [CARD.expiresAt],
  });

const input = (over: Partial<ResetCardInputV2>): ResetCardInputV2 => ({
  now: NOW,
  state: stateOf(20, NOW + DAY),
  cards: [CARD],
  demand: demand10,
  rateTable: ZERO_RATE_TABLE,
  cycleRules: RULES,
  paths: 32,
  maxCandidateDays: 0,
  ...over,
});

describe("§5 基线行为", () => {
  it("没有可用卡 → 不适用", () => {
    const plan = planResetCardV2(input({ cards: [] }));
    expect(plan.decision).toBe("not_applicable");
    expect(plan.candidateResults).toHaveLength(0);
  });

  it("卡已过期 → 不适用", () => {
    const plan = planResetCardV2(input({ cards: [{ id: "old", expiresAt: NOW - DAY }] }));
    expect(plan.decision).toBe("not_applicable");
  });

  it("需求未知 → 暂无法可靠建议（不代入固定需求）", () => {
    const plan = planResetCardV2(input({ demand: estimateDemand([], NOW) }));
    expect(plan.decision).toBe("uncertain");
    expect(plan.explanations.some((line) => line.includes("不代入固定需求值"))).toBe(true);
  });

  it("候选时刻：现在 + 未来每日固定决策时刻 + 卡过期前最后时刻，且不晚于过期", () => {
    const candidates = buildCandidates(NOW, [CARD], DEFAULT_DECISION_HOUR, 14);
    expect(candidates[0].at).toBe(NOW);
    expect(candidates.some((item) => item.label.includes("过期前最后时刻"))).toBe(true);
    for (const candidate of candidates) {
      expect(candidate.at).toBeLessThanOrEqual(CARD.expiresAt);
    }
    // 每日 09:00（北京）
    const daily = candidates.filter((item) => item.label.includes("09:00"));
    expect(daily.length).toBeGreaterThan(0);
    for (const item of daily) {
      const hours = (item.at + 8 * HOUR_MS) % DAY_MS;
      expect(hours / HOUR_MS).toBe(DEFAULT_DECISION_HOUR);
    }
  });

  it("未来候选遇到已回满状态 → 跳过用卡，不强行消耗", () => {
    const plan = planResetCardV2(input({ state: stateOf(100, NOW + 20 * DAY) }));
    const nowCandidate = plan.candidateResults[0];
    expect(nowCandidate.cardConsumed).toBe(false);
    expect(nowCandidate.incrementalUsage).toBeCloseTo(0, 1);
    expect(nowCandidate.skippedReason).toBeTruthy();
  });

  it("主指标是实际消耗之差，不是补给规模（保留全部候选结果）", () => {
    const plan = planResetCardV2(input({}));
    expect(plan.candidateResults.length).toBeGreaterThan(1);
    for (const candidate of plan.candidateResults) {
      expect(Number.isFinite(candidate.incrementalUsage)).toBe(true);
      expect(Number.isFinite(candidate.usage)).toBe(true);
    }
    expect(plan.explanations.some((line) => line.includes("不是补给规模"))).toBe(true);
    expect(plan.explanations.some((line) => line.includes("只评估下一张卡"))).toBe(true);
  });
});

describe("§9 验收用例", () => {
  it("用例4 补给很大，增量收益仍可为零（余额 20，1 天后自然重置，周期 7 天，日耗 10）", () => {
    const plan = planResetCardV2(input({ state: stateOf(20, NOW + DAY) }));
    const nowCandidate = plan.candidateResults[0];
    expect(nowCandidate.at).toBe(NOW);
    // 用卡补给 80 点，但两条时间线在观察期内的实际消耗相同
    expect(Math.abs(nowCandidate.incrementalUsage)).toBeLessThan(1);
    expect(plan.decision).toBe("hold");
    expect(plan.explanations.some((line) => line.includes("所有候选收益都不超过"))).toBe(true);
  });

  it("用例5 原本断粮时卡可以有价值（余额 0，其余同上 → 增量约 10 点）", () => {
    const plan = planResetCardV2(input({ state: stateOf(0, NOW + DAY) }));
    const nowCandidate = plan.candidateResults[0];
    expect(nowCandidate.incrementalUsage).toBeGreaterThan(9);
    expect(nowCandidate.incrementalUsage).toBeLessThan(11);
    expect(plan.decision).toBe("use_today");
    expect(plan.recommendedAt).toBe(NOW);
  });

  it("用例6 高风险不必然建议用卡：马上免费重置时，卡的增量收益下降", () => {
    const imminent = planResetCardV2(input({ state: stateOf(5, NOW + 2 * HOUR_MS) }));
    const distant = planResetCardV2(input({ state: stateOf(5, NOW + 6 * DAY) }));
    expect(imminent.candidateResults[0].incrementalUsage).toBeLessThan(
      distant.candidateResults[0].incrementalUsage,
    );
  });

  it("用例11 共同视野：所有候选比到同一个绝对终点 H = 最晚候选 + 2L，H2 = H + L", () => {
    const card: CardState = { id: "k2", expiresAt: NOW + 3 * DAY };
    const plan = planResetCardV2(
      input({ cards: [card], maxCandidateDays: 2, state: stateOf(5, NOW + 5 * DAY) }),
    );
    const latest = buildCandidates(NOW, [card], DEFAULT_DECISION_HOUR, 2).slice(-1)[0].at;
    expect(plan.horizonSensitivity.baseHorizon).toBe(latest + 2 * 168 * HOUR_MS);
    expect(plan.horizonSensitivity.extendedHorizon).toBe(latest + 3 * 168 * HOUR_MS);
    // 同一个终点下比较：候选的增量都在同一 H 上算出
    expect(plan.candidateResults.length).toBeGreaterThan(1);
  });
});

describe("§5.5–5.6 随机模拟与敏感性", () => {
  const hazardTable = () =>
    trainRates({
      events: [
        {
          id: "u1",
          kind: "unexpected",
          occurredAt: NOW - 3 * DAY,
          timePrecision: "exact",
          scope: "account",
          source: "test",
        },
      ],
      coverage: [{ from: NOW - 30 * DAY, to: NOW }],
      now: NOW,
      scope: "account",
    });

  it("随机数确定：同一 seed 得到同一序列（成对路径可复算）", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("等待时间按分段发生率求逆：发生率越高，期望等待越短", () => {
    const table = hazardTable();
    const fast = ZERO_RATE_TABLE; // λ=0 → 不会在视野内发生
    expect(nextShockTime(fast, NOW, 1, NOW + 30 * DAY, null)).toBeNull();
    const hit = nextShockTime(table, NOW, 0.05, NOW + 60 * DAY, NOW - 3 * DAY);
    expect(hit).not.toBeNull();
    expect(hit as number).toBeGreaterThan(NOW);
  });

  it("有意外重置风险时，模拟仍能给出全部候选与敏感性字段", () => {
    const plan = planResetCardV2(
      input({
        rateTable: hazardTable(),
        state: stateOf(15, NOW + 4 * DAY),
        maxCandidateDays: 3,
        cycleRules: { ...RULES, unexpectedResetScheduleRule: "unknown" },
      }),
    );
    expect(plan.candidateResults.length).toBeGreaterThan(1);
    expect(plan.demandSensitivity.map((point) => point.multiplier)).toEqual([0.75, 1, 1.25]);
    expect(plan.resetRuleSensitivity.map((point) => point.rule)).toEqual(["keep", "roll"]);
    expect(plan.assumptions).toContain("unexpected-rule-unknown");
    expect(plan.simulationError.paths).toBe(32);
    expect(plan.simulationError.note).toContain("模拟误差小不代表模型可靠");
  });

  it("周期规则为暂定假设时留下假设标记", () => {
    const plan = planResetCardV2(
      input({ cycleRules: { cycleDurationHours: 168, cycleRuleSource: "assumed", unexpectedResetScheduleRule: "unknown" } }),
    );
    expect(plan.assumptions).toContain("cycle-duration-assumed");
    expect(plan.explanations.some((line) => line.includes("暂定假设"))).toBe(true);
  });

  it("ε 默认 1 点，且不再有 8 点/25 点/85% 的固定阈值", () => {
    expect(MIN_USEFUL_GAIN_PERCENT).toBe(1);
    const plan = planResetCardV2(input({}));
    const text = plan.explanations.join("|");
    expect(text).not.toMatch(/8 点|25 点|85%/);
  });
});
