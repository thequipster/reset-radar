import { describe, expect, it } from "vitest";

import {
  applyResetEvents,
  createInitialState,
  activeEvents,
  groupByInstant,
  labelPredictionWindow,
  planSameInstantGroup,
  replayResetEvents,
  resolveEventTime,
  riskAgeHours,
  selectCalendarResets,
  selectUnexpectedEvents,
  splitObservationSegments,
  type CycleRules,
  type QuotaState,
  type ResetEvent,
} from "../resetState.ts";
import { beijingDayStart, HOUR_MS } from "../beijing.ts";

// 基准时刻：北京时间 2026-10-11 00:00（= UTC 2026-10-10T16:00:00Z）。
const T0 = beijingDayStart("2026-10-11") as number;
const DAY = 24 * HOUR_MS;
const L_HOURS = 168;
const L = L_HOURS * HOUR_MS;

const RULES: CycleRules = {
  cycleDurationHours: L_HOURS,
  cycleRuleSource: "configured",
  unexpectedResetScheduleRule: "unknown",
};

interface EventOverrides extends Partial<ResetEvent> {
  id: string;
  kind: ResetEvent["kind"];
}

function ev(overrides: EventOverrides): ResetEvent {
  return {
    timePrecision: "exact",
    scope: "account",
    source: "test",
    ...overrides,
  };
}

const withCard = (overrides: Partial<InitialState> = {}): QuotaState =>
  createInitialState({ remaining: 100, cardsRemaining: 1, cardExpirations: [T0 + 30 * DAY], ...overrides });

interface InitialState {
  remaining: number;
  nextNaturalResetAt: number | null;
  cardsRemaining: number;
  cardExpirations: readonly number[];
  lastForcedLikeResetAt: number | null;
  lastForcedLikeResetKind: "unexpected" | "announced" | "card" | null;
}

describe("v2 状态机 §9 验收用例", () => {
  it("用例1 用卡撤销旧截止：原第 2 天的自然重置不能再自动回满", () => {
    const state = withCard({ nextNaturalResetAt: T0 + 2 * DAY });
    const { state: next, notes } = applyResetEvents(
      state,
      [ev({ id: "c1", kind: "card", occurredAt: T0 })],
      { cycleRules: RULES },
    );

    expect(next.remaining).toBe(100);
    expect(next.nextNaturalResetAt).toBe(T0 + L);
    expect(next.cardsRemaining).toBe(0);
    expect(next.scheduleConfidence).toBe("preview");
    expect(next.timers.filter((timer) => timer.status === "active")).toEqual([
      { id: `natural@${T0 + L}`, at: T0 + L, status: "active" },
    ]);
    const old = next.timers.find((timer) => timer.at === T0 + 2 * DAY);
    expect(old?.status).toBe("cancelled");
    expect(old?.cancelledByEventId).toBe("c1");
    expect(notes.some((note) => note.code === "timer-cancelled")).toBe(true);
  });

  it("用例2 周期以实测覆盖预演：快照给出另一个截止时间就以快照为准", () => {
    const state = withCard({ nextNaturalResetAt: T0 + 2 * DAY });
    const observed = T0 + 5 * DAY;
    const { state: next, notes } = applyResetEvents(
      state,
      [ev({ id: "c1", kind: "card", occurredAt: T0, observedNextNaturalResetAt: observed })],
      { cycleRules: RULES },
    );

    expect(next.nextNaturalResetAt).toBe(observed);
    expect(next.scheduleConfidence).toBe("observed");
    expect(next.assumptions).not.toContain("cycle-duration-assumed");
    expect(notes.some((note) => note.code === "deadline-observed")).toBe(true);

    // 预演分支：没有快照时才用周期长度，并留下「暂定」假设标记。
    const preview = applyResetEvents(
      withCard({ nextNaturalResetAt: T0 + 2 * DAY }),
      [ev({ id: "c2", kind: "card", occurredAt: T0 })],
      { cycleRules: { ...RULES, cycleRuleSource: "assumed" } },
    );
    expect(preview.state.nextNaturalResetAt).toBe(T0 + L);
    expect(preview.state.assumptions).toContain("cycle-duration-assumed");
    expect(preview.notes.some((note) => note.code === "deadline-preview" && note.assumption === true)).toBe(true);
  });

  it("用例3 风险状态归零：用卡后年龄 0，且用卡不计入意外重置计数", () => {
    const state = createInitialState({
      remaining: 20,
      cardsRemaining: 1,
      cardExpirations: [T0 + 30 * DAY],
      lastForcedLikeResetAt: T0 - 100 * HOUR_MS,
      lastForcedLikeResetKind: "unexpected",
    });
    const events = [ev({ id: "c1", kind: "card", occurredAt: T0 })];
    const { state: next } = applyResetEvents(state, events, { cycleRules: RULES });

    expect(next.lastForcedLikeResetAt).toBe(T0);
    expect(next.lastForcedLikeResetKind).toBe("card");
    expect(riskAgeHours(next, T0)).toBe(0);
    expect(selectUnexpectedEvents(events)).toHaveLength(0);
  });

  it("用例7 多次事件不重复消费旧余额：用卡→意外→自然的截止链唯一", () => {
    const events: ResetEvent[] = [
      ev({ id: "c1", kind: "card", occurredAt: T0 }),
      ev({ id: "u1", kind: "unexpected", occurredAt: T0 + 1 * DAY, observedNextNaturalResetAt: T0 + 8 * DAY }),
      ev({ id: "n1", kind: "natural", occurredAt: T0 + 8 * DAY }),
    ];
    const { state } = replayResetEvents(events, { cycleRules: RULES }, withCard({ nextNaturalResetAt: T0 + 2 * DAY }));

    expect(state.remaining).toBe(100);
    expect(state.nextNaturalResetAt).toBe(T0 + 15 * DAY);
    expect(state.cardsRemaining).toBe(0);
    const active = state.timers.filter((timer) => timer.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0].at).toBe(T0 + 15 * DAY);
    expect(state.timers.find((timer) => timer.at === T0 + 7 * DAY)?.status).toBe("cancelled");
    expect(state.timers.find((timer) => timer.at === T0 + 8 * DAY)?.status).toBe("fired");
  });

  it("用例7b 已撤销的自然重置即使收到旧截止的观测事件也不会重复回满", () => {
    const events: ResetEvent[] = [
      ev({ id: "c1", kind: "card", occurredAt: T0 }),
      ev({ id: "n-stale", kind: "natural", occurredAt: T0 + 2 * DAY }),
    ];
    const { state } = replayResetEvents(events, { cycleRules: RULES }, withCard({ nextNaturalResetAt: T0 + 2 * DAY }));

    const stale = state.timers.filter((timer) => timer.at === T0 + 2 * DAY);
    expect(stale.every((timer) => timer.status === "cancelled")).toBe(true);
    expect(state.timers.filter((timer) => timer.status === "active")).toHaveLength(1);
  });

  it("用例8 用卡不算预测命中：窗口内只有主动用卡 → 删失", () => {
    const windowStart = T0;
    const windowEnd = T0 + DAY;
    const label = labelPredictionWindow({
      windowStart,
      windowEnd,
      events: [ev({ id: "c1", kind: "card", occurredAt: T0 + 2 * HOUR_MS })],
      observedUntil: T0 + 2 * DAY,
    });
    expect(label.label).toBe("censored");
    expect(label.interventionKind).toBe("card");
  });

  it("用例8b 意外重置先发生，之后用卡不取消正例", () => {
    const label = labelPredictionWindow({
      windowStart: T0,
      windowEnd: T0 + DAY,
      events: [
        ev({ id: "u1", kind: "unexpected", occurredAt: T0 + 1 * HOUR_MS }),
        ev({ id: "c1", kind: "card", occurredAt: T0 + 5 * HOUR_MS }),
      ],
      observedUntil: T0 + 2 * DAY,
    });
    expect(label.label).toBe(1);
    expect(label.firstUnexpectedAt).toBe(T0 + 1 * HOUR_MS);
  });

  it("用例9 日期级数据不伪造精确标签：所在日与窗口边界相交 → 不确定", () => {
    const label = labelPredictionWindow({
      windowStart: T0 + 6 * HOUR_MS,
      windowEnd: T0 + 30 * HOUR_MS,
      events: [ev({ id: "u1", kind: "unexpected", occurredDate: "2026-10-11", timePrecision: "day" })],
      observedUntil: T0 + 3 * DAY,
    });
    expect(label.label).toBe("unknown");
    expect(label.reason).toContain("不按正午伪造时刻");
  });

  it("用例9b 日期级事件整日落在一个北京日窗口内 → 可判定为正例", () => {
    const label = labelPredictionWindow({
      windowStart: T0,
      windowEnd: T0 + DAY,
      events: [ev({ id: "u1", kind: "unexpected", occurredDate: "2026-10-11", timePrecision: "day" })],
      observedUntil: T0 + 2 * DAY,
    });
    expect(label.label).toBe(1);
  });

  it("用例12 追加而非改写：更正事件取代旧事件，原事件仍在流中", () => {
    const original = ev({ id: "e1", kind: "unexpected", occurredAt: T0 });
    const events: ResetEvent[] = [
      original,
      ev({ id: "e2", kind: "card", occurredAt: T0, supersedes: "e1" }),
      ev({ id: "e3", kind: "natural", occurredAt: T0, supersedes: "e1" }),
    ];
    const snapshot = JSON.parse(JSON.stringify(events)) as ResetEvent[];

    const active = activeEvents(events);
    expect(active.map((event) => event.id)).toEqual(["e3"]);
    expect(events).toEqual(snapshot);
    expect(events[0]).toEqual(original);
    expect(selectUnexpectedEvents(events)).toHaveLength(0);
  });
});

describe("状态转换表", () => {
  it("仅收到公告：不改余额、不改截止、不改风险年龄", () => {
    const state = withCard({ nextNaturalResetAt: T0 + 2 * DAY, remaining: 40 });
    const { state: next, notes } = applyResetEvents(
      state,
      [ev({ id: "a1", kind: "announcement", occurredAt: T0, scheduledFor: T0 + DAY })],
      { cycleRules: RULES },
    );
    expect(next).toBe(state);
    expect(notes[0].code).toBe("announcement-recorded");
  });

  it("用卡失败：四项状态全部不变", () => {
    const state = createInitialState({
      remaining: 40,
      nextNaturalResetAt: T0 + 2 * DAY,
      cardsRemaining: 2,
      cardExpirations: [T0 + 10 * DAY, T0 + 20 * DAY],
      lastForcedLikeResetAt: T0 - 10 * HOUR_MS,
      lastForcedLikeResetKind: "unexpected",
    });
    const { state: next, notes } = applyResetEvents(
      state,
      [ev({ id: "f1", kind: "card-failed", occurredAt: T0 })],
      { cycleRules: RULES },
    );
    expect(next).toBe(state);
    expect(notes[0].code).toBe("card-failed-ignored");
  });

  it("没有可用卡：不产生回满", () => {
    const state = createInitialState({ remaining: 5, cardsRemaining: 0, nextNaturalResetAt: T0 + DAY });
    const { state: next, notes } = applyResetEvents(state, [ev({ id: "c1", kind: "card", occurredAt: T0 })], {
      cycleRules: RULES,
    });
    expect(next).toBe(state);
    expect(notes[0].code).toBe("card-unavailable");
  });

  it("自然重置默认不改变风险年龄（v2 默认，常量可见）", () => {
    const state = createInitialState({
      remaining: 3,
      nextNaturalResetAt: T0,
      lastForcedLikeResetAt: T0 - 100 * HOUR_MS,
      lastForcedLikeResetKind: "unexpected",
    });
    const { state: next } = applyResetEvents(state, [ev({ id: "n1", kind: "natural", occurredAt: T0 })], {
      cycleRules: RULES,
    });
    expect(next.remaining).toBe(100);
    expect(next.nextNaturalResetAt).toBe(T0 + L);
    expect(riskAgeHours(next, T0 + 10 * HOUR_MS)).toBe(110);
    expect(next.lastForcedLikeResetKind).toBe("unexpected");
  });

  it("意外强制重置：规则未知时截止留空，keep/roll 按已确认规则走", () => {
    const base = withCard({ nextNaturalResetAt: T0 + 3 * DAY });

    const unknown = applyResetEvents(base, [ev({ id: "u1", kind: "unexpected", occurredAt: T0 })], {
      cycleRules: RULES,
    });
    expect(unknown.state.nextNaturalResetAt).toBeNull();
    expect(unknown.state.scheduleConfidence).toBe("unknown");
    expect(unknown.state.assumptions).toContain("unexpected-schedule-unknown");

    const keep = applyResetEvents(base, [ev({ id: "u2", kind: "unexpected", occurredAt: T0 })], {
      cycleRules: { ...RULES, unexpectedResetScheduleRule: "keep" },
    });
    expect(keep.state.nextNaturalResetAt).toBe(T0 + 3 * DAY);

    const roll = applyResetEvents(base, [ev({ id: "u3", kind: "unexpected", occurredAt: T0 })], {
      cycleRules: { ...RULES, unexpectedResetScheduleRule: "roll" },
    });
    expect(roll.state.nextNaturalResetAt).toBe(T0 + L);
    expect(roll.state.scheduleConfidence).toBe("preview");
  });

  it("公告实际执行：回满并把过期公告标记为待确认不改写的反例", () => {
    const state = createInitialState({ remaining: 12, nextNaturalResetAt: T0 + DAY, cardsRemaining: 1 });
    const { state: next } = applyResetEvents(
      state,
      [ev({ id: "x1", kind: "announced", occurredAt: T0, observedNextNaturalResetAt: T0 + 9 * DAY })],
      { cycleRules: RULES },
    );
    expect(next.remaining).toBe(100);
    expect(next.nextNaturalResetAt).toBe(T0 + 9 * DAY);
    expect(next.lastForcedLikeResetKind).toBe("announced");
    expect(next.cardsRemaining).toBe(1);
  });

  it("用卡消耗最早过期的那张卡", () => {
    const state = createInitialState({
      remaining: 10,
      cardsRemaining: 2,
      cardExpirations: [T0 + 30 * DAY, T0 + 5 * DAY],
    });
    const { state: next } = applyResetEvents(state, [ev({ id: "c1", kind: "card", occurredAt: T0 })], {
      cycleRules: RULES,
    });
    expect(next.cardsRemaining).toBe(1);
    expect(next.cardExpirations).toEqual([T0 + 30 * DAY]);
  });
});

describe("同刻合并与关联去重（规则 2 / 规则 5）", () => {
  it("自然重置已满足需求时不浪费一张卡", () => {
    const state = createInitialState({ remaining: 2, nextNaturalResetAt: T0, cardsRemaining: 1 });
    const group = [
      ev({ id: "n1", kind: "natural", occurredAt: T0 }),
      ev({ id: "c1", kind: "card", occurredAt: T0 }),
    ];
    const plan = planSameInstantGroup(group);
    expect(plan.primary?.id).toBe("n1");
    expect(plan.notes.map((note) => note.code)).toContain("card-skipped-natural-satisfies");

    const { state: next } = applyResetEvents(state, group, { cycleRules: RULES });
    expect(next.cardsRemaining).toBe(1);
    expect(next.remaining).toBe(100);
  });

  it("用卡操作与随后余额跳升按操作 ID 合并为同一次重置", () => {
    const state = createInitialState({ remaining: 5, cardsRemaining: 1, cardExpirations: [T0 + 9 * DAY] });
    const group = [
      ev({ id: "jump", kind: "unexpected", occurredAt: T0 + 1 * HOUR_MS, linkedActionId: "act-9" }),
      ev({ id: "c1", kind: "card", occurredAt: T0, linkedActionId: "act-9" }),
    ];
    const plan = planSameInstantGroup(group);
    expect(plan.primary?.kind).toBe("card");
    expect(plan.notes.some((note) => note.code === "linked-action-merged")).toBe(true);

    const { state: next } = applyResetEvents(state, group, { cycleRules: RULES });
    expect(next.cardsRemaining).toBe(0);
    expect(next.lastForcedLikeResetKind).toBe("card");
    expect(selectUnexpectedEvents(group)).toHaveLength(0);
  });

  it("同刻事件合并确认信息后只做一次状态转换", () => {
    const state = createInitialState({ remaining: 8, cardsRemaining: 1, nextNaturalResetAt: T0 + DAY });
    const { state: next, notes } = applyResetEvents(
      state,
      [
        ev({ id: "c1", kind: "card", occurredAt: T0 }),
        ev({ id: "u1", kind: "unexpected", occurredAt: T0, observedNextNaturalResetAt: T0 + 6 * DAY }),
      ],
      { cycleRules: RULES },
    );
    expect(next.nextNaturalResetAt).toBe(T0 + 6 * DAY);
    expect(next.remaining).toBe(100);
    expect(notes.filter((note) => note.code === "card-consumed")).toHaveLength(1);
  });
});

describe("时间精度与派生视图（§6）", () => {
  it("日级事件取北京零点，绝不伪造正午", () => {
    const { at, precision } = resolveEventTime(
      ev({ id: "d1", kind: "unexpected", occurredDate: "2026-10-11", timePrecision: "day" }),
    );
    expect(precision).toBe("day");
    expect(at).toBe(T0);
    expect(at).not.toBe(T0 + 12 * HOUR_MS);
  });

  it("无法解析时间的事件被丢弃并记录", () => {
    const { groups, notes } = groupByInstant([
      ev({ id: "bad", kind: "unexpected", timePrecision: "exact" }),
    ]);
    expect(groups).toHaveLength(0);
    expect(notes[0].code).toBe("unresolved-time");
  });

  it("重置日历含用卡并标注，排除公告与失败", () => {
    const entries = selectCalendarResets([
      ev({ id: "c1", kind: "card", occurredAt: T0 }),
      ev({ id: "u1", kind: "unexpected", occurredAt: T0 + DAY }),
      ev({ id: "a1", kind: "announcement", occurredAt: T0 + 2 * DAY }),
      ev({ id: "f1", kind: "card-failed", occurredAt: T0 + 3 * DAY }),
    ]);
    expect(entries.map((entry) => entry.eventId)).toEqual(["c1", "u1"]);
    expect(entries[0].label).toBe("主动用卡");
    expect(entries[0].note).toContain("不计入意外重置分子");
  });

  it("观察段：用卡切段，前段暴露时间保留", () => {
    const segments = splitObservationSegments(
      [
        ev({ id: "u1", kind: "unexpected", occurredAt: T0 }),
        ev({ id: "c1", kind: "card", occurredAt: T0 + 100 * HOUR_MS }),
        ev({ id: "u2", kind: "unexpected", occurredAt: T0 + 300 * HOUR_MS }),
      ],
      T0 + 400 * HOUR_MS,
    );
    expect(segments).toHaveLength(3);
    expect(segments[0]).toMatchObject({ startedBy: "unexpected", endedBy: "card", exposureHours: 100 });
    expect(segments[0].endedByIntervention).toBe(true);
    expect(segments[1]).toMatchObject({ startedBy: "card", endedBy: "unexpected", exposureHours: 200 });
    expect(segments[2]).toMatchObject({ startedBy: "unexpected", endedBy: "open", exposureHours: 100 });
  });

  it("自然重置不切分观察段（不改变风险年龄）", () => {
    const segments = splitObservationSegments(
      [
        ev({ id: "u1", kind: "unexpected", occurredAt: T0 }),
        ev({ id: "n1", kind: "natural", occurredAt: T0 + 50 * HOUR_MS }),
      ],
      T0 + 80 * HOUR_MS,
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ startedBy: "unexpected", endedBy: "open", exposureHours: 80 });
  });
});

describe("预测标签 §7.2", () => {
  it("完整观测且无事件无干预 → 负例", () => {
    expect(
      labelPredictionWindow({
        windowStart: T0,
        windowEnd: T0 + DAY,
        events: [],
        observedUntil: T0 + DAY,
      }).label,
    ).toBe(0);
  });

  it("观测覆盖不足 → 不确定，不冒充负例", () => {
    const result = labelPredictionWindow({
      windowStart: T0,
      windowEnd: T0 + DAY,
      events: [],
      observedUntil: T0 + 6 * HOUR_MS,
    });
    expect(result.label).toBe("unknown");
    expect(result.reason).toContain("观测覆盖不足");
  });

  it("公告执行在意外事件之前 → 删失", () => {
    const result = labelPredictionWindow({
      windowStart: T0,
      windowEnd: T0 + DAY,
      events: [
        ev({ id: "x1", kind: "announced", occurredAt: T0 + 3 * HOUR_MS }),
        ev({ id: "u1", kind: "unexpected", occurredAt: T0 + 10 * HOUR_MS }),
      ],
      observedUntil: T0 + 2 * DAY,
    });
    expect(result.label).toBe("censored");
    expect(result.interventionKind).toBe("announced");
  });
});
