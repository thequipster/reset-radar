// RR07 域测试：src/lib/calibration.ts 预测校准器。
// 真值：Brier=mean((p−y)²) 标准定义（卡面证据行）；期望值全部手算推导写在各用例注释。
// 星期/日期锚：2026-10-12=周一（与 risk.core.test.ts 同锚），由此推 10-05 周一、
// 10-11 周日、2026-12-28 周一、2027-01-01 周五；北京日键边界锚定 B06（UTC 漏 +8h 必红）。
import { describe, expect, it } from "vitest";
import {
  CALIBRATION_DEFAULT_THRESHOLD_PERCENT,
  joinPredictionsWithResets,
  scorePredictions,
  type PredictionOutcome,
} from "../calibration";

const rec = (dateKey: string, predictedPercent: number, realized: boolean): PredictionOutcome => ({
  dateKey,
  predictedPercent,
  realized,
});

describe("数学正确性（卡面验证口径）", () => {
  it("完美预测 → Brier=0、命中率=1", () => {
    // p 与 y 全一致：(1−1)²+(0−0)²+(1−1)²=0；阈值化全命中
    const s = scorePredictions([rec("2026-10-05", 100, true), rec("2026-10-06", 0, false), rec("2026-10-07", 100, true)]);
    expect(s.n).toBe(3);
    expect(s.brier).toBe(0);
    expect(s.hitRate).toBe(1);
    expect(s.baseRate).toBeCloseTo(2 / 3, 10);
  });

  it("恒 50% 预测 → Brier=0.25", () => {
    // 每条 (0.5−y)²=0.25；p=50≥阈 50 判正向，命中 2/3
    const s = scorePredictions([rec("2026-10-05", 50, true), rec("2026-10-06", 50, false), rec("2026-10-07", 50, true)]);
    expect(s.brier).toBe(0.25);
    expect(s.hitRate).toBeCloseTo(2 / 3, 10);
  });

  it("全错（自信全反）→ Brier=1、命中率=0", () => {
    // (1−0)²+(0−1)²=2，均值 1
    const s = scorePredictions([rec("2026-10-05", 100, false), rec("2026-10-06", 0, true)]);
    expect(s.brier).toBe(1);
    expect(s.hitRate).toBe(0);
    expect(s.baseRate).toBe(0.5);
  });

  it("手算混合序列 → Brier=0.225、命中率=0.75、基准率=0.25", () => {
    // p=[80,30,60,10] y=[0,0,1,0]：
    //   Brier=(0.64+0.09+0.16+0.01)/4=0.90/4=0.225
    //   阈 50%：判向 [T,F,T,F] vs 实现 [F,F,T,F] → 命中 3/4（仅 p=80 误报）
    const s = scorePredictions([
      rec("2026-10-05", 80, false),
      rec("2026-10-06", 30, false),
      rec("2026-10-07", 60, true),
      rec("2026-10-08", 10, false),
    ]);
    expect(s.brier).toBeCloseTo(0.225, 10);
    expect(s.hitRate).toBe(0.75);
    expect(s.baseRate).toBe(0.25);
    expect(s.thresholdPercent).toBe(CALIBRATION_DEFAULT_THRESHOLD_PERCENT);
  });

  it("阈值可调：同一序列阈 70% → 命中率 0.5（Brier 不变）", () => {
    // 判向变为 p≥70：[T,F,F,F] vs [F,F,T,F] → 命中 2/4（p=30/10 猜不重置✓，p=80/60 全错位）
    const records = [
      rec("2026-10-05", 80, false),
      rec("2026-10-06", 30, false),
      rec("2026-10-07", 60, true),
      rec("2026-10-08", 10, false),
    ];
    const s = scorePredictions(records, { thresholdPercent: 70 });
    expect(s.hitRate).toBe(0.5);
    expect(s.brier).toBeCloseTo(0.225, 10);
    expect(s.thresholdPercent).toBe(70);
  });

  it("空输入 → n=0 且 brier/hitRate=null（不误读为完美）", () => {
    const s = scorePredictions([]);
    expect(s.n).toBe(0);
    expect(s.brier).toBeNull();
    expect(s.hitRate).toBeNull();
    expect(s.baseRate).toBeNull();
    expect(s.byWeek).toEqual([]);
    expect(s.reliability).toEqual([]);
  });

  it("防御：形状非法/非Finite 的行剔除，不炸", () => {
    const s = scorePredictions([
      rec("2026-10-05", 50, true),
      rec("not-a-date", 50, true),
      rec("2026-10-06", Number.NaN, true),
    ]);
    expect(s.n).toBe(1);
    expect(s.brier).toBeCloseTo(0.25, 10);
  });
});

describe("byWeek 分周走势（周一分组键）", () => {
  it("按周聚合、weekKey 升序、周内指标独立", () => {
    // 周1（10-05/08/11 同属周一 10-05 起）：p=[100,0,0] y=[T,F,F] → Brier=0、命中 3/3
    // 周2（10-12/13 属周一 10-12 起）：p=[50,100] y=[F,F] → Brier=(0.25+1)/2=0.625、命中 0/2
    const s = scorePredictions([
      rec("2026-10-05", 100, true),
      rec("2026-10-08", 0, false),
      rec("2026-10-11", 0, false),
      rec("2026-10-12", 50, false),
      rec("2026-10-13", 100, false),
    ]);
    expect(s.byWeek.map((w) => w.weekKey)).toEqual(["2026-10-05", "2026-10-12"]);
    const [w1, w2] = s.byWeek;
    expect(w1.n).toBe(3);
    expect(w1.brier).toBe(0);
    expect(w1.hitRate).toBe(1);
    expect(w2.n).toBe(2);
    expect(w2.brier).toBe(0.625);
    expect(w2.hitRate).toBe(0);
  });

  it("跨年周锚定无歧义：2026-12-31 与 2027-01-01 同属周一 2026-12-28", () => {
    // ISO 周号在跨年处有周年归属歧义；用周一日期键则无（D016）
    const s = scorePredictions([rec("2026-12-31", 40, false), rec("2027-01-01", 60, true)]);
    expect(s.byWeek.map((w) => w.weekKey)).toEqual(["2026-12-28"]);
    expect(s.byWeek[0].n).toBe(2);
  });
});

describe("reliability 可靠性曲线（十分桶）", () => {
  it("桶分配与桶内统计；空桶不出现", () => {
    // p=[5,14,95,100] y=[F,T,T,T] → 桶 0-10{1,avg5,obs0}、10-20{1,avg14,obs100}、90-100{2,avg97.5,obs100}
    const s = scorePredictions([
      rec("2026-10-05", 5, false),
      rec("2026-10-06", 14, true),
      rec("2026-10-07", 95, true),
      rec("2026-10-08", 100, true),
    ]);
    expect(s.reliability.map((b) => b.label)).toEqual(["0-10", "10-20", "90-100"]);
    const [b0, b1, b9] = s.reliability;
    expect(b0).toMatchObject({ n: 1, avgPredictedPercent: 5, observedPercent: 0 });
    expect(b1).toMatchObject({ n: 1, avgPredictedPercent: 14, observedPercent: 100 });
    expect(b9).toMatchObject({ n: 2, avgPredictedPercent: 97.5, observedPercent: 100 });
  });

  it("桶界含下不含上、末桶双含", () => {
    // p=0 → 0-10；p=10 → 10-20；p=100 → 90-100
    const s = scorePredictions([
      rec("2026-10-05", 0, false),
      rec("2026-10-06", 10, true),
      rec("2026-10-07", 100, true),
    ]);
    expect(s.reliability.map((b) => b.label)).toEqual(["0-10", "10-20", "90-100"]);
    expect(s.reliability[0].observedPercent).toBe(0);
    expect(s.reliability[1].observedPercent).toBe(100);
    expect(s.reliability[2].observedPercent).toBe(100);
  });
});

describe("joinPredictionsWithResets 预测×历史对账", () => {
  const NOW = new Date("2026-10-12T02:00:00Z"); // 北京 10-12 10:00 → 当日键 2026-10-12

  it("realized 按北京日历键对账（B06 反锚定：漏 +8h 必红）", () => {
    // 2026-10-08T17:30Z = 北京 10-09 01:30 → 事件落键 2026-10-09（UTC 键会误判为 10-08）
    const out = joinPredictionsWithResets(
      [
        { date: "2026-10-08", predictedRisk: 10 },
        { date: "2026-10-09", predictedRisk: 40 },
      ],
      ["2026-10-08T17:30:00Z"],
      NOW,
    );
    expect(out).toEqual([
      { dateKey: "2026-10-08", predictedPercent: 10, realized: false },
      { dateKey: "2026-10-09", predictedPercent: 40, realized: true },
    ]);
  });

  it("同日多行取首行（ex-ante 事前预测）", () => {
    const out = joinPredictionsWithResets(
      [
        { date: "2026-10-09", predictedRisk: 40, fetchedAt: "2026-10-09T01:00:00Z" },
        { date: "2026-10-09", predictedRisk: 70, fetchedAt: "2026-10-09T20:00:00Z" },
      ],
      [],
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0].predictedPercent).toBe(40);
  });

  it("未完结北京日剔除：as_of 当日与未来行不计分", () => {
    const out = joinPredictionsWithResets(
      [
        { date: "2026-10-11", predictedRisk: 30 },
        { date: "2026-10-12", predictedRisk: 50 },
        { date: "2026-10-13", predictedRisk: 60 },
      ],
      [],
      NOW,
    );
    expect(out.map((r) => r.dateKey)).toEqual(["2026-10-11"]);
  });

  it("防御：非法行/非法 announcedAt 跳过，输出按日期升序", () => {
    const out = joinPredictionsWithResets(
      [
        { date: "2026-10-10", predictedRisk: 20 },
        { date: "garbage", predictedRisk: 20 },
        { date: "2026-10-09", predictedRisk: Number.NaN },
        { date: "2026-10-09", predictedRisk: 10 },
      ],
      ["not-a-date"],
      NOW,
    );
    expect(out.map((r) => r.dateKey)).toEqual(["2026-10-09", "2026-10-10"]);
    expect(out.every((r) => r.realized === false)).toBe(true);
  });

  it("端到端：join → scorePredictions 手算闭环", () => {
    // 事件 10-08T17:30Z 落北京键 10-09：p=[80,20] y=[0,1] → Brier=(0.64+0.64)/2=0.64、命中 0
    const s = scorePredictions(
      joinPredictionsWithResets(
        [
          { date: "2026-10-08", predictedRisk: 80 },
          { date: "2026-10-09", predictedRisk: 20 },
        ],
        ["2026-10-08T17:30:00Z"],
        NOW,
      ),
    );
    expect(s.n).toBe(2);
    expect(s.brier).toBeCloseTo(0.64, 10);
    expect(s.hitRate).toBe(0);
    expect(s.baseRate).toBe(0.5);
  });
});
