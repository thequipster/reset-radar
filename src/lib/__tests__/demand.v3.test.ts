import { describe, expect, it } from "vitest";
import { fitDemandModel, selectDemandDays, type DemandDay, type WorkloadChoice } from "../v3/demand";

const dateForIndex = (i: number) => new Date(Date.parse("2026-09-03T00:00:00Z") + (i - 1) * 86_400_000).toISOString().slice(0, 10);
const day = (i: number, patch: Partial<DemandDay> = {}): DemandDay => ({
  dateKey: dateForIndex(i),
  weeklyCost: 8 + i,
  weeklyCoverage: 1,
  weeklyComplete: true,
  weeklyLowerBound: false,
  weeklyCrossedReset: false,
  shortCost: 2 + i / 2,
  shortCoverage: 1,
  shortComplete: true,
  shortLowerBound: false,
  shortCrossedReset: false,
  crossedReset: false,
  estimated: false,
  weeklyEstimated: false,
  shortEstimated: false,
  capacityConstrained: false,
  ...patch,
});

describe("v3 demand fit", () => {
  it('同日改为不确定会清除旧忙闲标签，重复修改不增加标签样本数',()=>{
    const days=Array.from({length:7},(_,i)=>day(i+1));
    const choices:WorkloadChoice[]=days.map(d=>({dateKey:d.dateKey,workload:'busy'}));
    choices.push({dateKey:days[0]!.dateKey,workload:'busy'},{dateKey:days[1]!.dateKey,workload:'unknown'});
    const result=fitDemandModel(days,choices,Date.parse('2026-10-01T00:00:00Z'));
    expect(result.choiceCount).toBe(6);expect(result.workloadGroups.busy.fallbackToAll).toBe(true);
  });
  it("规划样本与训练一致：短窗重置不抹去完整周耗，旧日和今日不参与", () => {
    const cutoff = Date.parse("2026-10-01T00:00:00+08:00");
    const days = [day(0), day(1, { crossedReset: true, shortCrossedReset: true }),
      day(2, { weeklyComplete: false }), day(29), day(30)];
    expect(selectDemandDays(days, cutoff).map(d => d.dateKey)).toEqual([dateForIndex(1)]);
    expect(fitDemandModel(days, [], cutoff).sampleDays).toBe(1);
  });
  it("没有有效日时保持需求和短窗配对未知，不填固定日耗", () => {
    const result = fitDemandModel([], [], Date.parse("2026-10-01T00:00:00Z"));
    expect(result.sampleDays).toBe(0);
    expect(result.status).toBe("learning");
    expect(result.weekly).toBeNull();
    expect(result.shortWindowPaired).toBeNull();
    expect(result.workload.unknown).toMatchObject({ low: null, high: null });
  });

  it("滚动最多 28 个有效北京日，并保留真实样本数与 7/14 日阶段", () => {
    const days = Array.from({ length: 35 }, (_, i) => day(i + 1));
    const result = fitDemandModel(days, [], Date.parse("2026-10-01T00:00:00Z"));
    expect(result.sampleDays).toBe(28);
    expect(result.status).toBe("estimated");
    expect(result.weekly?.median).toBeGreaterThan(0);
    expect(result.weekly?.p80).toBeGreaterThanOrEqual(result.weekly!.median);
    expect(result.weekly?.p95).toBeGreaterThanOrEqual(result.weekly!.p80);
    expect(result.shortWindowPaired?.sampleDays).toBe(28);
  });

  it("完整日不足 7 时只给初步范围，短窗配对不足时返回 null", () => {
    const result = fitDemandModel([day(1), day(2), day(3)], [], Date.parse("2026-10-01T00:00:00Z"));
    expect(result.status).toBe("preliminary");
    expect(result.sampleDays).toBe(3);
    expect(result.shortWindowPaired).toBeNull();
  });

  it("不完整、跨重置、下界与估算日不进入有效日样本", () => {
    const result = fitDemandModel([
      day(1), day(2), day(3, { weeklyComplete: false }),
      day(4, { crossedReset: true, weeklyCrossedReset: true }), day(5, { weeklyLowerBound: true }),
      day(6, { estimated: true, weeklyEstimated: true }),
    ], [], Date.parse("2026-10-01T00:00:00Z"));
    expect(result.sampleDays).toBe(2);
  });

  it("忙闲标签组少于 7 天回退全体，达到 7 天才独立建分布", () => {
    const days = Array.from({ length: 14 }, (_, i) => day(i + 1));
    const choices: WorkloadChoice[] = days.map((sample, i) => ({ dateKey: sample.dateKey, workload: i < 7 ? "busy" : "light" }));
    const result = fitDemandModel(days, choices, Date.parse("2026-10-01T00:00:00Z"));
    expect(result.workloadGroups.busy.sampleDays).toBe(7);
    expect(result.workloadGroups.busy.fallbackToAll).toBe(false);
    expect(result.workloadGroups.light.sampleDays).toBe(7);
    const fallback = fitDemandModel(days, choices.slice(0, 6), Date.parse("2026-10-01T00:00:00Z"));
    expect(fallback.workloadGroups.busy.fallbackToAll).toBe(true);
  });

  it("忙闲档取经验低中高情景；未知保留范围，不映射固定 10/25/50", () => {
    const result = fitDemandModel(Array.from({ length: 14 }, (_, i) => day(i + 1)), [], Date.parse("2026-10-01T00:00:00Z"));
    expect(result.workload.light.value).toBe(result.weekly?.p20);
    expect(result.workload.normal.value).toBe(result.weekly?.median);
    expect(result.workload.busy.value).toBe(result.weekly?.p80);
    expect(result.workload.unknown.low).toBe(result.weekly?.p20);
    expect(result.workload.unknown.high).toBe(result.weekly?.p80);
    expect([10, 25, 50]).not.toContain(result.workload.busy.value);
  });

  it("用户周预算给出 0.5/1/2 压力值但不产生概率权重", () => {
    const result = fitDemandModel([day(1)], [], Date.parse("2026-10-01T00:00:00Z"), { weeklyBudget: 20 });
    expect(result.budgetScenarios).toEqual([
      { multiplier: 0.5, weeklyBudget: 10, probability: null },
      { multiplier: 1, weeklyBudget: 20, probability: null },
      { multiplier: 2, weeklyBudget: 40, probability: null },
    ]);
  });

  it("今天的临时工作量选择不改写此前日期或长期标签样本", () => {
    const choices: WorkloadChoice[] = [{ dateKey: "2026-10-01", workload: "busy" }];
    const result = fitDemandModel(Array.from({ length: 8 }, (_, i) => day(i + 1)), choices, Date.parse("2026-10-01T00:00:00Z"));
    expect(result.choiceCount).toBe(0); // 今日选择不作为已完成历史样本。
    expect(result.workload.busy.source).toBe("experience");
    expect(result.workload.busy.value).not.toBe(50);
  });
});
