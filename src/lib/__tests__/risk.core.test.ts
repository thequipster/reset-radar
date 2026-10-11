// RR04 域测试：src/lib/risk.ts 风险模型。
// 锚点：算法常量来自 codex-cockpit reset_forecast.rs（TRUTH §1 来源 3，各 rs:NNN 注释见实现）；
// 真实数据期望值来自 TRUTH §2 B07（RR03 会话独立核实的夹具统计）；星期边界 D004。
// 手工构造样例的期望值推导写在各用例注释。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assessResetRisk, beijingWeekday } from "../risk";

// RR18：固定RR03原字节回归样本，独立于每轮联网更新；保留旧算法golden，生产仅消费regular。
const fixturePath = fileURLToPath(new URL("./fixtures/resets-history-20261010.json", import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const fixtureDates: string[] = fixture.events.map((e: { announcedAt: string }) => e.announcedAt);

describe("星期基线（rs:140-144）", () => {
  it("空历史 + 目标日周二 → 70，仅 base 因子", () => {
    // 2026-10-05T12:00Z = 北京周一 20:00，+24h 落北京周二 10-06
    const r = assessResetRisk([], new Date("2026-10-05T12:00:00Z"));
    expect(r.score).toBe(70);
    expect(r.factors.map((f) => f.id)).toEqual(["base"]);
    expect(r.factors[0].delta).toBe(70);
  });

  it("空历史 + 普通日 → 10", () => {
    // 北京周二 20:00，+24h 落北京周三 10-07
    expect(assessResetRisk([], new Date("2026-10-06T12:00:00Z")).score).toBe(10);
  });

  it("D004：星期按北京时区判定，不随 UTC 滑走", () => {
    // 2026-10-11T20:00Z：UTC 侧周日→+24h 仍是周一；北京已是 10-12 周一 04:00，
    // +24h 落北京周二 10-13 → 必 70。若漏 +8h 错位会得 10。
    expect(assessResetRisk([], new Date("2026-10-11T20:00:00Z")).score).toBe(70);
  });
});

describe("连续重置效应（rs:154-167）", () => {
  it("上次重置 24h 前（≤36h 窗口）→ 抬到 40，delta=30", () => {
    // 普通日基线 10；单事件无间隔/样本不足，其余因子不触发
    const r = assessResetRisk(["2026-10-05T12:00:00Z"], new Date("2026-10-06T12:00:00Z"));
    expect(r.factors.map((f) => f.id)).toEqual(["base", "consecutive-reset"]);
    expect(r.factors[1].delta).toBe(30);
    expect(r.score).toBe(40);
  });

  it("上次重置已 3 天（>36h 窗口）→ 不触发", () => {
    const r = assessResetRisk(["2026-10-03T12:00:00Z"], new Date("2026-10-06T12:00:00Z"));
    expect(r.factors.map((f) => f.id)).toEqual(["base"]);
  });
});

describe("历史间隔条件风险（rs:169-191）", () => {
  it("6 事件等距 7 天、等待 0.5 天 → empirical=1/7，delta 触发 -12 夹紧", () => {
    // now=2026-10-12T04:00Z（北京周一 12:00，+24h 北京周二 → 基线 70，连续抬升不适用）
    // 间隔 [7×5]：atRisk=5、events=0 → empirical=(0+1)/(5+2)=14.2857%
    // delta=(14.2857-70)*0.25=-13.93 → 夹紧 -12 → 70-12=58
    const history = [
      "2026-10-11T16:00:00Z", "2026-10-04T16:00:00Z", "2026-09-27T16:00:00Z",
      "2026-09-20T16:00:00Z", "2026-09-13T16:00:00Z", "2026-09-06T16:00:00Z",
    ];
    const r = assessResetRisk(history, new Date("2026-10-12T04:00:00Z"));
    expect(r.factors.map((f) => f.id)).toEqual(["base", "interval-hazard"]);
    expect(r.factors[1].delta).toBe(-12);
    expect(r.score).toBe(58);
  });

  it("间隔样本 <5 → 不触发", () => {
    // 3 事件 2 个间隔，即使经验风险高也不算
    const r = assessResetRisk(
      ["2026-10-11T16:00:00Z", "2026-10-11T17:00:00Z", "2026-10-11T18:00:00Z"],
      new Date("2026-10-12T04:00:00Z"),
    );
    expect(r.factors.map((f) => f.id)).not.toContain("interval-hazard");
  });
});

describe("上游 watch 融合（rs:229-238）", () => {
  it("普通日 10 + watch 80 → 10+(80-10)*0.25=27.5", () => {
    const r = assessResetRisk([], new Date("2026-10-06T12:00:00Z"), 80);
    expect(r.factors.map((f) => f.id)).toEqual(["base", "tracker-watch"]);
    expect(r.factors[1].delta).toBe(17.5);
    expect(r.score).toBe(27.5);
  });

  it("周二 70 + watch 0 → 70+(0-70)*0.25=52.5（向下融合）", () => {
    const r = assessResetRisk([], new Date("2026-10-05T12:00:00Z"), 0);
    expect(r.score).toBe(52.5);
  });

  it("越界 watch 输入被最终夹紧兜住（契约 0-100 之外的防御）", () => {
    // watch=-200 → 裸算 -42.5 → 夹紧 2；watch=1000 → 裸算 302.5 → 夹紧 95（rs:239）
    expect(assessResetRisk([], new Date("2026-10-06T12:00:00Z"), -200).score).toBe(2);
    expect(assessResetRisk([], new Date("2026-10-05T12:00:00Z"), 1000).score).toBe(95);
  });
});

describe("真实夹具回归（data/resets-history.json，RR03 产出）", () => {
  it("北京星期分布与 TRUTH §2 B07 锚点完全一致（Sun..Sat = 9,4,10,12,8,7,9）", () => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const d of fixtureDates) counts[beijingWeekday(Date.parse(d))] += 1;
    expect(counts).toEqual([9, 4, 10, 12, 8, 7, 9]);
  });

  it("as_of=fetchedAt 的 golden 评估：score 24.5，因子链 base→interval→recent→weekday", () => {
    // 手工推导（数值见 task_logs/RR04_done.md）：目标日北京周一 → base 10；
    // age=2.57>1.5 无连续抬升；58 有效间隔 atRisk=34/events=8 → empirical=(8+1)/(34+2)=25.0
    // → delta=(25-10)*0.25=+3.8；recent 7>长期4.56*1.25 → +12；星期平滑 matching=4 → -1.2；
    // 10+3.75+12-1.2133=24.54 → 24.5
    const r = assessResetRisk(fixtureDates, new Date(fixture.fetchedAt));
    expect(r.factors.map((f) => f.id)).toEqual([
      "base", "interval-hazard", "recent-regime", "weekday-empirical",
    ]);
    expect(r.factors.map((f) => f.delta)).toEqual([10, 3.8, 12, -1.2]);
    expect(r.score).toBe(24.5);
  });

  it("输入乱序 + 混入非法串 → 结果与规范输入一致（解析容错 rs:110-114）", () => {
    const noisy = ["not-a-date", ...[...fixtureDates].reverse(), "", "2026-13-99"];
    expect(assessResetRisk(noisy, new Date(fixture.fetchedAt)).score).toBe(24.5);
  });
});

describe("beijingWeekday（D004 边界）", () => {
  it("UTC 23:00 已是北京次日 → 星期 +1", () => {
    // 2026-10-11T23:00Z = 北京 10-12 周一 07:00
    expect(beijingWeekday(Date.parse("2026-10-11T23:00:00Z"))).toBe(1);
    expect(new Date(Date.parse("2026-10-11T23:00:00Z")).getUTCDay()).toBe(0);
  });
});
