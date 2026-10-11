// v2 核心（一）：统一事件流 + 周期状态机 + 派生视图 + 预测标签。
// 规格出处：用户给定「reset-radar 核心算法 v2 实现规格」§1 定义 / §2 状态转换 / §6 派生视图 / §7.2 标签。
// 这是风险（§3）、配速（§4）、用卡模拟（§5）唯一的状态转换入口：规格 §2 开头要求
// 「风险、配速和用卡模拟必须调用同一个状态转换函数，禁止分别维护重置逻辑」。
//
// 设计底线（违反任何一条即为 bug）：
//  · 不把「余额变成 100」当成用卡成功的证据（规则 3）；
//  · 日级事件取北京零点作为「天内」代表，绝不伪造正午（规则 6）；
//  · 周期规则未知时截止时间留空，不伪造（§1、规则 5）；
//  · 用卡事件不计入意外重置分子，也不算预测命中（§6）。

import { beijingDayKey, beijingDayStart, DAY_MS, HOUR_MS } from "./beijing.ts";

export const STATE_MODEL_VERSION = "quota-state-machine-v1";
/** 风险预测目标定义版本：未来 24h 意外强制重置（不含自然重置、不含公告、不含用卡）。 */
export const TARGET_DEFINITION_VERSION = "reset-risk-target-v2";
/** 模型版本（风险发生率实现版本，§7.1 落盘字段）。 */
export const RISK_MODEL_VERSION = "risk-shrinkage-v2";

/** 周期长度无法确认时的暂定预演基准（§1）；使用时必须标注「暂定」。 */
export const ASSUMED_CYCLE_HOURS = 168;

/**
 * 自然重置是否重置风险年龄：v2 默认 **否**。
 * 规格 §2：「自然重置是否也触发短期连续重置效应，目前没有给定证据。v2 默认不改变风险年龄，
 * 单独保留事件类型，便于以后验证。」——这里用常量固定，便于日后单点翻转与回归。
 */
export const NATURAL_RESET_RESETS_RISK_AGE = false;

/** 意外强制重置后的周期规则：keep=截止保持原值，roll=滚动到事件时刻+L，unknown=不推断。 */
export type UnexpectedScheduleRule = "unknown" | "keep" | "roll";
export type CycleRuleSource = "observed" | "configured" | "assumed";

export type ResetEventKind =
  | "unexpected" // 意外强制重置（非主动、非公告执行）
  | "announced" // 公告实际执行
  | "announcement" // 仅收到公告：不是已发生事件，不改状态
  | "card" // 用卡成功
  | "card-failed" // 用卡失败
  | "natural"; // 自然重置

/** 会重置「风险年龄」的三类事件（§1 风险年龄定义）。 */
export type ForcedLikeResetKind = "unexpected" | "announced" | "card";

export type TimePrecision = "exact" | "day";
export type EventScope = "account" | "global" | "unknown";
/** observed=快照实测；preview=按周期规则预演；unknown=规则未知、不伪造。 */
export type ScheduleConfidence = "observed" | "preview" | "unknown";

export interface ResetEvent {
  readonly id: string;
  readonly kind: ResetEventKind;
  /** exact 精度下的发生时刻（UTC ms）。 */
  readonly occurredAt?: number;
  /** day 精度下的发生日（北京时间日键 YYYY-MM-DD）。 */
  readonly occurredDate?: string;
  readonly timePrecision: TimePrecision;
  readonly scope: EventScope;
  readonly source: string;
  /** 关联操作 ID：用卡操作与随后观察到的余额跳升据此合并为同一次重置（规则 2）。 */
  readonly linkedActionId?: string;
  /** 事件后快照观测到的下一次自然重置时刻；有则以它为准（覆盖预演）。 */
  readonly observedNextNaturalResetAt?: number | null;
  /** 公告的计划执行时刻（仅 announcement 用）。 */
  readonly scheduledFor?: number;
  /** 追加式更正：本事件取代该 id 的事件进入派生视图，原事件永不改写（§9 用例 12）。 */
  readonly supersedes?: string;
}

export interface CycleRules {
  readonly cycleDurationHours: number;
  readonly cycleRuleSource: CycleRuleSource;
  readonly unexpectedResetScheduleRule: UnexpectedScheduleRule;
}

export const DEFAULT_CYCLE_RULES: CycleRules = {
  cycleDurationHours: ASSUMED_CYCLE_HOURS,
  cycleRuleSource: "assumed",
  unexpectedResetScheduleRule: "unknown",
};

/** 自然重置定时事件：用卡成功后必须撤销旧事件，而不是新增一个截止后保留旧事件（规则 1）。 */
export interface ScheduledResetTimer {
  readonly id: string;
  readonly at: number;
  readonly status: "active" | "fired" | "cancelled";
  readonly cancelledByEventId?: string;
}

/** 公告到时但没有执行证据 → 待确认，不改写真实余额（规则 4）。 */
export interface PendingConfirmation {
  readonly announcementId: string;
  readonly scheduledFor: number;
  readonly note: string;
}

export interface QuotaState {
  /** 周额度剩余，百分点（0–100）。 */
  readonly remaining: number;
  /** 下一次自然重置时刻 N（UTC ms），未知为 null。 */
  readonly nextNaturalResetAt: number | null;
  readonly cardsRemaining: number;
  readonly cardExpirations: readonly number[];
  readonly lastForcedLikeResetAt: number | null;
  readonly lastForcedLikeResetKind: ForcedLikeResetKind | null;
  readonly scheduleConfidence: ScheduleConfidence;
  readonly timers: readonly ScheduledResetTimer[];
  readonly pendingConfirmations: readonly PendingConfirmation[];
  /** 累积的假设代码（去重，按首次出现顺序），供 §3.5/§8 的 assumptions 字段输出。 */
  readonly assumptions: readonly string[];
}

export type TransitionCode =
  | "card-consumed"
  | "card-unavailable"
  | "card-failed-ignored"
  | "card-skipped-natural-satisfies"
  | "deadline-observed"
  | "deadline-preview"
  | "deadline-kept"
  | "deadline-rolled"
  | "deadline-unknown-rule"
  | "timer-cancelled"
  | "timer-fired"
  | "linked-action-merged"
  | "announcement-recorded"
  | "unresolved-time"
  | "natural-age-unchanged"
  | "correction-applied";

export interface TransitionNote {
  readonly eventId: string;
  readonly code: TransitionCode;
  readonly message: string;
  /** true 表示这条是「假设/未证实」而非观测事实，UI 必须如实标注。 */
  readonly assumption?: boolean;
}

export interface TransitionContext {
  readonly cycleRules?: CycleRules;
}

const clampPercent = (value: number): number => Math.min(100, Math.max(0, value));

const note = (
  eventId: string,
  code: TransitionCode,
  message: string,
  assumption = false,
): TransitionNote => (assumption ? { eventId, code, message, assumption: true } : { eventId, code, message });

const timerId = (at: number): string => `natural@${at}`;

function withAssumption(current: readonly string[], code: string | null): readonly string[] {
  if (code == null || current.includes(code)) return current;
  return [...current, code];
}

/**
 * 解析事件时刻：
 * - day 精度 → 该北京日的 00:00（只代表「这一天」，不伪造正午，规则 6）；
 * - exact → occurredAt；
 * - 两者都缺 → null，调用方跳过并记 note（不猜）。
 */
export function resolveEventTime(event: ResetEvent): { at: number | null; precision: TimePrecision } {
  if (event.timePrecision === "day") {
    const key =
      event.occurredDate ?? (typeof event.occurredAt === "number" ? beijingDayKey(event.occurredAt) : null);
    if (key == null) return { at: null, precision: "day" };
    return { at: beijingDayStart(key), precision: "day" };
  }
  const at = typeof event.occurredAt === "number" && Number.isFinite(event.occurredAt) ? event.occurredAt : null;
  return { at, precision: "exact" };
}

export interface InitialStateInput {
  readonly remaining?: number;
  readonly nextNaturalResetAt?: number | null;
  readonly cardsRemaining?: number;
  readonly cardExpirations?: readonly number[];
  readonly lastForcedLikeResetAt?: number | null;
  readonly lastForcedLikeResetKind?: ForcedLikeResetKind | null;
  readonly scheduleConfidence?: ScheduleConfidence;
}

export function createInitialState(input: InitialStateInput = {}): QuotaState {
  const expirations = [...(input.cardExpirations ?? [])].sort((a, b) => a - b);
  const next = input.nextNaturalResetAt ?? null;
  return {
    remaining: clampPercent(input.remaining ?? 100),
    nextNaturalResetAt: next,
    cardsRemaining: input.cardsRemaining ?? expirations.length,
    cardExpirations: expirations,
    lastForcedLikeResetAt: input.lastForcedLikeResetAt ?? null,
    lastForcedLikeResetKind: input.lastForcedLikeResetKind ?? null,
    scheduleConfidence: input.scheduleConfidence ?? (next != null ? "observed" : "unknown"),
    timers: next != null ? [{ id: timerId(next), at: next, status: "active" }] : [],
    pendingConfirmations: [],
    assumptions: [],
  };
}

interface TimerOutcome {
  readonly timers: readonly ScheduledResetTimer[];
  readonly cancelled: number;
  readonly fired: number;
}

/** 撤销所有尚未触发的自然重置定时事件（规则 1：旧周期截止时间失效）。 */
function cancelActiveTimers(
  timers: readonly ScheduledResetTimer[],
  at: number,
  byEventId: string,
): TimerOutcome {
  let cancelled = 0;
  const next = timers.map((timer) => {
    if (timer.status !== "active" || timer.at <= at) return timer;
    cancelled += 1;
    return { id: timer.id, at: timer.at, status: "cancelled" as const, cancelledByEventId: byEventId };
  });
  return { timers: next, cancelled, fired: 0 };
}

/** 自然重置到点：把已到期的定时器标记为 fired。 */
function fireTimers(timers: readonly ScheduledResetTimer[], at: number): TimerOutcome {
  let fired = 0;
  const next = timers.map((timer) => {
    if (timer.status !== "active" || timer.at > at) return timer;
    fired += 1;
    return { id: timer.id, at: timer.at, status: "fired" as const };
  });
  return { timers: next, cancelled: 0, fired };
}

const readObserved = (event: ResetEvent): number | null =>
  typeof event.observedNextNaturalResetAt === "number" && Number.isFinite(event.observedNextNaturalResetAt)
    ? event.observedNextNaturalResetAt
    : null;

function cycleMs(rules: CycleRules): number {
  return rules.cycleDurationHours * HOUR_MS;
}

/** 用卡成功：余额回满、截止改为观测值或 t+L、风险年龄归零、消耗一张卡、撤销旧定时事件。 */
function applyCard(
  state: QuotaState,
  event: ResetEvent,
  at: number,
  rules: CycleRules,
): { state: QuotaState; notes: TransitionNote[] } {
  if (state.cardsRemaining <= 0) {
    return { state, notes: [note(event.id, "card-unavailable", "没有可用卡：不产生回满，状态不变。")] };
  }
  const observed = readObserved(event);
  const next = observed ?? at + cycleMs(rules);
  const notes: TransitionNote[] = [];
  notes.push(
    observed != null
      ? note(event.id, "deadline-observed", "用卡后截止时间采用用卡后快照的观测值。")
      : note(
          event.id,
          "deadline-preview",
          `用卡后截止时间按周期 ${rules.cycleDurationHours}h 预演，待快照确认（周期来源：${rules.cycleRuleSource}）。`,
          true,
        ),
  );
  const outcome = cancelActiveTimers(state.timers, at, event.id);
  if (outcome.cancelled > 0) {
    notes.push(
      note(
        event.id,
        "timer-cancelled",
        `撤销 ${outcome.cancelled} 个旧自然重置定时事件：旧周期截止已失效，不会再次自动回满。`,
      ),
    );
  }
  notes.push(note(event.id, "card-consumed", "消耗最早过期的一张卡；风险年龄归零。"));
  const expirations = [...state.cardExpirations].sort((a, b) => a - b).slice(1);
  return {
    state: {
      ...state,
      remaining: 100,
      nextNaturalResetAt: next,
      cardsRemaining: state.cardsRemaining - 1,
      cardExpirations: expirations,
      lastForcedLikeResetAt: at,
      lastForcedLikeResetKind: "card",
      scheduleConfidence: observed != null ? "observed" : "preview",
      timers: [...outcome.timers, { id: timerId(next), at: next, status: "active" }],
      assumptions: withAssumption(state.assumptions, observed == null ? "cycle-duration-assumed" : null),
    },
    notes,
  };
}

/** 意外强制重置 / 公告实际执行：回满 + 年龄归零；截止时间优先快照，其次已确认规则，否则留空。 */
function applyForcedLike(
  state: QuotaState,
  event: ResetEvent,
  at: number,
  rules: CycleRules,
): { state: QuotaState; notes: TransitionNote[] } {
  const observed = readObserved(event);
  const notes: TransitionNote[] = [];
  let next: number | null = null;
  let confidence: ScheduleConfidence = "unknown";
  let assumptionCode: string | null = null;

  if (observed != null) {
    next = observed;
    confidence = "observed";
    notes.push(note(event.id, "deadline-observed", "截止时间采用事件后快照的观测值。"));
  } else if (rules.unexpectedResetScheduleRule === "keep") {
    next = state.nextNaturalResetAt;
    confidence = state.scheduleConfidence === "observed" ? "observed" : "preview";
    assumptionCode = "unexpected-schedule-keep";
    notes.push(
      note(event.id, "deadline-kept", `按已确认规则：截止时间保持原值（${next ?? "未知"}）。`, true),
    );
  } else if (rules.unexpectedResetScheduleRule === "roll") {
    next = at + cycleMs(rules);
    confidence = "preview";
    assumptionCode = "unexpected-schedule-roll";
    notes.push(
      note(
        event.id,
        "deadline-rolled",
        `按已确认规则：截止时间滚动到事件时刻 + ${rules.cycleDurationHours}h。`,
        true,
      ),
    );
  } else {
    next = null;
    confidence = "unknown";
    assumptionCode = "unexpected-schedule-unknown";
    notes.push(
      note(
        event.id,
        "deadline-unknown-rule",
        "意外强制重置后的周期规则未知：截止时间留空，不伪造（另需按 keep/roll 两种情景分别模拟）。",
        true,
      ),
    );
  }

  const outcome = cancelActiveTimers(state.timers, at, event.id);
  if (outcome.cancelled > 0) {
    notes.push(
      note(event.id, "timer-cancelled", `撤销 ${outcome.cancelled} 个旧自然重置定时事件。`),
    );
  }
  const kind: ForcedLikeResetKind = event.kind === "announced" ? "announced" : "unexpected";
  return {
    state: {
      ...state,
      remaining: 100,
      nextNaturalResetAt: next,
      lastForcedLikeResetAt: at,
      lastForcedLikeResetKind: kind,
      scheduleConfidence: confidence,
      timers: next != null ? [...outcome.timers, { id: timerId(next), at: next, status: "active" }] : outcome.timers,
      assumptions: withAssumption(state.assumptions, assumptionCode),
    },
    notes,
  };
}

/** 自然重置：回满 + 推进到下一周期截止；默认不改变风险年龄（NATURAL_RESET_RESETS_RISK_AGE=false）。 */
function applyNatural(
  state: QuotaState,
  event: ResetEvent,
  at: number,
  rules: CycleRules,
): { state: QuotaState; notes: TransitionNote[] } {
  const observed = readObserved(event);
  const notes: TransitionNote[] = [];
  let next: number | null;
  if (observed != null) {
    next = observed;
    notes.push(note(event.id, "deadline-observed", "截止时间采用事件后快照的观测值。"));
  } else if (state.nextNaturalResetAt != null) {
    next = state.nextNaturalResetAt + cycleMs(rules);
    notes.push(
      note(
        event.id,
        "deadline-preview",
        `自然重置后按周期长度推进下一截止（周期来源：${rules.cycleRuleSource}）。`,
        rules.cycleRuleSource !== "observed",
      ),
    );
  } else {
    next = null;
    notes.push(
      note(event.id, "deadline-unknown-rule", "原截止时间未知：下一周期截止留空，不伪造。", true),
    );
  }

  const fired = fireTimers(state.timers, at);
  if (fired.fired > 0) notes.push(note(event.id, "timer-fired", `${fired.fired} 个自然重置定时事件到点触发。`));
  // 观测到的自然重置意味着真实周期在此刻结束：任何尚未触发的（含用卡预演出来的）定时事件
  // 都被新周期截止取代，否则会留下两个 active 定时器、将来重复回满。
  const cleared = cancelActiveTimers(fired.timers, at, event.id);
  if (cleared.cancelled > 0) {
    notes.push(
      note(
        event.id,
        "timer-cancelled",
        `撤销 ${cleared.cancelled} 个尚未触发的旧自然重置定时事件：新周期截止取代它们。`,
      ),
    );
  }

  if (NATURAL_RESET_RESETS_RISK_AGE) {
    notes.push(
      note(event.id, "natural-age-unchanged", "自然重置重置了风险年龄（当前常量关闭，此为分支保留）。", true),
    );
  } else {
    notes.push(
      note(
        event.id,
        "natural-age-unchanged",
        "自然重置不改变风险年龄（v2 默认；无证据支持纳入短期连续重置效应）。",
        true,
      ),
    );
  }

  return {
    state: {
      ...state,
      remaining: 100,
      nextNaturalResetAt: next,
      lastForcedLikeResetAt: NATURAL_RESET_RESETS_RISK_AGE ? at : state.lastForcedLikeResetAt,
      lastForcedLikeResetKind: NATURAL_RESET_RESETS_RISK_AGE ? "card" : state.lastForcedLikeResetKind,
      scheduleConfidence: observed != null ? "observed" : next != null ? "preview" : "unknown",
      timers:
        next != null ? [...cleared.timers, { id: timerId(next), at: next, status: "active" }] : cleared.timers,
      assumptions: withAssumption(state.assumptions, rules.cycleRuleSource !== "observed" ? "cycle-duration-assumed" : null),
    },
    notes,
  };
}

/** 单个事件的状态转换。所有调用方（风险/配速/用卡模拟）都必须走这里。 */
export function applyResetEvent(
  state: QuotaState,
  event: ResetEvent,
  context: TransitionContext = {},
): { state: QuotaState; notes: TransitionNote[] } {
  const rules = context.cycleRules ?? DEFAULT_CYCLE_RULES;
  const { at } = resolveEventTime(event);
  if (at == null) {
    return {
      state,
      notes: [note(event.id, "unresolved-time", "事件时间无法解析：跳过，不伪造发生时刻。")],
    };
  }
  switch (event.kind) {
    case "card":
      return applyCard(state, event, at, rules);
    case "unexpected":
    case "announced":
      return applyForcedLike(state, event, at, rules);
    case "natural":
      return applyNatural(state, event, at, rules);
    case "card-failed":
      return { state, notes: [note(event.id, "card-failed-ignored", "用卡失败：余额、截止、风险年龄均不变。")] };
    case "announcement":
      return { state, notes: [note(event.id, "announcement-recorded", "仅收到公告：不是已发生事件，不修改真实状态。")] };
    default:
      return { state, notes: [] };
  }
}

interface GroupPlan {
  readonly primary: ResetEvent | null;
  readonly observedNextNaturalResetAt?: number | null;
  readonly notes: TransitionNote[];
}

/**
 * 同刻优先级：**用卡优先**。
 * 用卡是用户主动动作，一旦发生就必须记一笔（卡数 −1、风险年龄归零）；
 * 若同一时刻还记录了一条「意外重置」，二者几乎总是同一次事件（§6：用卡当天看到额度重置，
 * 不能给意外重置记一次，也不能给之前的高风险预测记命中），因此保留用卡事件、合并其余。
 */
const PRIORITY: readonly ResetEventKind[] = ["card", "announced", "unexpected", "natural", "card-failed", "announcement"];

const priorityOf = (kind: ResetEventKind): number => {
  const index = PRIORITY.indexOf(kind);
  return index < 0 ? PRIORITY.length : index;
};

const prefer = (a: ResetEvent, b: ResetEvent): ResetEvent =>
  priorityOf(a.kind) <= priorityOf(b.kind) ? a : b;

/**
 * 跨时刻按操作 ID 归并（规则 2）：一次用卡操作与随后观察到的余额跳升可能相隔几分钟，
 * 不是同一时刻，但属于同一次重置 —— 必须在回放前先合并，否则会既扣卡又记一次意外重置。
 */
export function dedupeByLinkedAction(
  events: readonly ResetEvent[],
): { events: ResetEvent[]; notes: TransitionNote[] } {
  const notes: TransitionNote[] = [];
  const kept: ResetEvent[] = [];
  const byAction = new Map<string, number>();
  const drops: { event: ResetEvent; actionId: string }[] = [];

  for (const event of events) {
    const actionId = event.linkedActionId;
    if (actionId == null || actionId.length === 0) {
      kept.push(event);
      continue;
    }
    const index = byAction.get(actionId);
    if (index == null) {
      byAction.set(actionId, kept.length);
      kept.push(event);
      continue;
    }
    const current = kept[index];
    const winner = prefer(current, event);
    if (winner === current) {
      drops.push({ event, actionId });
    } else {
      drops.push({ event: current, actionId });
      kept[index] = event;
    }
  }

  for (const drop of drops) {
    notes.push(
      note(
        drop.event.id,
        "linked-action-merged",
        `与操作 ${drop.actionId} 关联为同一次重置：合并掉 ${drop.event.kind} 事件，不重复计入。`,
      ),
    );
  }
  return { events: kept, notes };
}

/**
 * 同一时刻（或同一天）的多个事件：先合并确认信息，再做 **一次** 状态转换（规则 5）。
 * - 同一 linkedActionId 视为同一次重置，保留用卡事件（规则 2），其余合并掉；
 * - 自然重置已满足需求时不浪费一张卡（规则 5）。
 */
export function planSameInstantGroup(group: readonly ResetEvent[]): GroupPlan {
  const notes: TransitionNote[] = [];
  const byAction = new Map<string, ResetEvent[]>();
  const kept: ResetEvent[] = [];
  for (const event of group) {
    if (event.linkedActionId == null || event.linkedActionId.length === 0) {
      kept.push(event);
      continue;
    }
    const bucket = byAction.get(event.linkedActionId) ?? [];
    bucket.push(event);
    byAction.set(event.linkedActionId, bucket);
  }
  for (const [actionId, bucket] of byAction) {
    const winner = bucket.reduce((best, event) => prefer(best, event));
    kept.push(winner);
    for (const dropped of bucket) {
      if (dropped.id === winner.id) continue;
      notes.push(
        note(
          dropped.id,
          "linked-action-merged",
          `与操作 ${actionId} 关联为同一次重置，不重复计入（保留 ${winner.kind} 事件）。`,
        ),
      );
    }
  }

  // 非状态事件也要留下可解释记录，否则「收到公告但什么都没发生」在 UI 上不可见。
  for (const event of group) {
    if (event.kind === "announcement") {
      notes.push(note(event.id, "announcement-recorded", "仅收到公告：不是已发生事件，不修改真实状态。"));
    } else if (event.kind === "card-failed") {
      notes.push(note(event.id, "card-failed-ignored", "用卡失败：余额、截止、风险年龄均不变。"));
    }
  }

  const has = (kind: ResetEventKind): boolean => kept.some((event) => event.kind === kind);
  let candidates = kept;
  if (has("natural") && has("card")) {
    for (const event of kept) {
      if (event.kind === "card") {
        notes.push(
          note(event.id, "card-skipped-natural-satisfies", "同一时刻自然重置已满足需求：不模拟浪费一张卡。"),
        );
      }
    }
    candidates = kept.filter((event) => event.kind !== "card");
  }

  const stateChanging = candidates
    .filter((event) => event.kind !== "announcement" && event.kind !== "card-failed")
    .sort((a, b) => priorityOf(a.kind) - priorityOf(b.kind));
  const primary = stateChanging.length > 0 ? stateChanging[0] : null;

  // 合并确认信息：组内任一事件观测到新截止时间，就以观测值为准（规格：优先快照）。
  let observed: number | null | undefined;
  for (const event of candidates) {
    const value = readObserved(event);
    if (value != null) {
      observed = observed == null ? value : Math.max(observed, value);
    }
  }

  return primary == null ? { primary: null, notes } : { primary, observedNextNaturalResetAt: observed, notes };
}

interface InstantGroup {
  readonly at: number;
  readonly precision: TimePrecision;
  readonly events: ResetEvent[];
}

/** 按发生时刻分组：day 精度按「北京日」归组，exact 按时间戳归组；无法解析的单独丢弃。 */
export function groupByInstant(
  events: readonly ResetEvent[],
): { groups: InstantGroup[]; notes: TransitionNote[] } {
  const notes: TransitionNote[] = [];
  const map = new Map<string, InstantGroup>();
  const order: string[] = [];
  for (const event of events) {
    const { at, precision } = resolveEventTime(event);
    if (at == null) {
      notes.push(note(event.id, "unresolved-time", "事件时间无法解析：不参与状态回放。"));
      continue;
    }
    const key = `${precision}|${at}`;
    const existing = map.get(key);
    if (existing == null) {
      map.set(key, { at, precision, events: [event] });
      order.push(key);
    } else {
      existing.events.push(event);
    }
  }
  const groups = order
    .map((key) => map.get(key))
    .filter((group): group is InstantGroup => group != null)
    .sort((a, b) => a.at - b.at);
  return { groups, notes };
}

/** 按时间顺序回放事件流（同刻合并后才做一次转换）。 */
export function applyResetEvents(
  state: QuotaState,
  events: readonly ResetEvent[],
  context: TransitionContext = {},
): { state: QuotaState; notes: TransitionNote[] } {
  // 先跨时刻按操作 ID 归并（规则 2），再按时刻分组（规则 5）。
  const deduped = dedupeByLinkedAction(events);
  const { groups, notes } = groupByInstant(deduped.events);
  notes.unshift(...deduped.notes);
  let current = state;
  for (const group of groups) {
    const plan = planSameInstantGroup(group.events);
    notes.push(...plan.notes);
    if (plan.primary == null) continue;
    const merged: ResetEvent =
      plan.observedNextNaturalResetAt === undefined
        ? plan.primary
        : { ...plan.primary, observedNextNaturalResetAt: plan.observedNextNaturalResetAt };
    const result = applyResetEvent(current, merged, context);
    current = result.state;
    notes.push(...result.notes);
  }
  return { state: current, notes };
}

export function replayResetEvents(
  events: readonly ResetEvent[],
  context: TransitionContext = {},
  initial: QuotaState = createInitialState({ remaining: 100 }),
): { state: QuotaState; notes: TransitionNote[] } {
  return applyResetEvents(initial, events, context);
}

/** 风险年龄 A（小时）：距上次「意外强制／公告执行／用卡」重置的时间；未知返回 null。 */
export function riskAgeHours(state: QuotaState, now: number): number | null {
  if (state.lastForcedLikeResetAt == null) return null;
  return Math.max(0, (now - state.lastForcedLikeResetAt) / HOUR_MS);
}

/** 风险年龄分组（§3.1）：[0,36h)、[36h,168h)、[168h,∞)；年龄未知返回 null。 */
export type RiskAgeBand = "fresh" | "mid" | "old";
export function riskAgeBand(ageHours: number | null): RiskAgeBand | null {
  if (ageHours == null || !Number.isFinite(ageHours)) return null;
  if (ageHours < 36) return "fresh";
  if (ageHours < 168) return "mid";
  return "old";
}

// —— 派生视图（§6）：同一事件流派生不同统计口径，用卡事件绝不污染意外事件标签 ——

/**
 * 生效事件：被追加更正取代的事件（及其旧更正）不进入派生视图，但原始数组永不改写（§9 用例 12）。
 */
export function activeEvents(events: readonly ResetEvent[]): ResetEvent[] {
  const superseded = new Set<string>();
  const corrections = new Map<string, string>();
  for (const event of events) {
    const target = event.supersedes;
    if (target == null || target.length === 0) continue;
    superseded.add(target);
    const previous = corrections.get(target);
    if (previous != null) superseded.add(previous);
    corrections.set(target, event.id);
  }
  return events.filter((event) => !superseded.has(event.id));
}

/**
 * 意外强制重置事件（发生率训练分子）：用卡／公告执行／自然重置一律不计入（§6 表）。
 * 注意：本函数只做「口径筛选」，不做时间窗过滤。
 */
export function selectUnexpectedEvents(events: readonly ResetEvent[]): ResetEvent[] {
  const active = activeEvents(events);
  // 与用卡操作关联的事件不是外生意外事件（§6：用卡当天看到额度重置，不能记为意外重置，
  // 也不能算之前高风险预测的命中）。
  const cardActions = new Set(
    active.filter((event) => event.kind === "card" && event.linkedActionId != null).map((event) => event.linkedActionId),
  );
  return active.filter(
    (event) =>
      event.kind === "unexpected" &&
      !(event.linkedActionId != null && cardActions.has(event.linkedActionId)),
  );
}

export type CalendarResetLabel = "主动用卡" | "意外强制重置" | "公告执行" | "自然重置";

export interface CalendarResetEntry {
  readonly eventId: string;
  readonly kind: ResetEventKind;
  readonly label: CalendarResetLabel;
  readonly at: number | null;
  readonly dateKey: string | null;
  readonly precision: TimePrecision;
  readonly note: string;
}

const CALENDAR_LABEL: Record<string, CalendarResetLabel> = {
  card: "主动用卡",
  unexpected: "意外强制重置",
  announced: "公告执行",
  natural: "自然重置",
};

/** 所有重置日历（含用卡，明确标注「主动用卡」）；日级事件只给日键，不伪造时刻。 */
export function selectCalendarResets(events: readonly ResetEvent[]): CalendarResetEntry[] {
  const entries: CalendarResetEntry[] = [];
  for (const event of activeEvents(events)) {
    const label = CALENDAR_LABEL[event.kind];
    if (label == null) continue; // announcement / card-failed 不是已发生重置
    const { at, precision } = resolveEventTime(event);
    entries.push({
      eventId: event.id,
      kind: event.kind,
      label,
      at,
      dateKey: at != null ? beijingDayKey(at) : null,
      precision,
      note:
        precision === "day"
          ? "日期级记录：只知道发生在这一天，时刻未伪造。"
          : event.kind === "card"
            ? "主动用卡：计入日历与周期重建，但不计入意外重置分子。"
            : "已发生的重置事件。",
    });
  }
  return entries.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
}

export interface ObservationSegment {
  readonly startAt: number;
  readonly endAt: number | null;
  readonly startedBy: ForcedLikeResetKind | "history-start";
  readonly endedBy: "card" | "unexpected" | "announced" | "open";
  /** 该段被确认完整观测的时长（小时）。 */
  readonly exposureHours: number;
  /** true=该段因用卡而结束（观察被干预打断，不是「没有发生重置」）。 */
  readonly endedByIntervention: boolean;
}

/**
 * 观察段切分（§6 末段）：用卡造成观察段结束并开启新段；前一段未发生意外重置的观测时间仍有价值，
 * 不能整个删除；新段从用卡后的风险年龄 0 开始累计暴露时间。自然重置不切段（不改风险年龄）。
 */
export function splitObservationSegments(
  events: readonly ResetEvent[],
  now: number,
  historyStart: number | null = null,
): ObservationSegment[] {
  const markers = activeEvents(events)
    .filter((event) => event.kind === "card" || event.kind === "unexpected" || event.kind === "announced")
    .map((event) => {
      const { at } = resolveEventTime(event);
      return { event, at };
    })
    .filter((entry): entry is { event: ResetEvent; at: number } => entry.at != null)
    .sort((a, b) => a.at - b.at);

  if (markers.length === 0) {
    const start = historyStart ?? 0;
    return [
      {
        startAt: start,
        endAt: now >= start ? now : start,
        startedBy: "history-start",
        endedBy: "open",
        exposureHours: Math.max(0, (now - start) / HOUR_MS),
        endedByIntervention: false,
      },
    ];
  }

  const segments: ObservationSegment[] = [];
  let segmentStart = historyStart ?? markers[0].at;
  let startedBy: ForcedLikeResetKind | "history-start" =
    historyStart != null ? "history-start" : (markers[0].event.kind as ForcedLikeResetKind);

  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const kind = marker.event.kind as ForcedLikeResetKind;
    if (index === 0 && historyStart == null) {
      // 第一个标记即本段起点（无更早的历史起点可观测）
      segmentStart = marker.at;
      startedBy = kind;
      continue;
    }
    const endAt = marker.at;
    segments.push({
      startAt: segmentStart,
      endAt,
      startedBy,
      endedBy: kind,
      exposureHours: Math.max(0, (endAt - segmentStart) / HOUR_MS),
      endedByIntervention: kind === "card",
    });
    segmentStart = marker.at;
    startedBy = kind;
  }

  segments.push({
    startAt: segmentStart,
    endAt: now,
    startedBy,
    endedBy: "open",
    exposureHours: Math.max(0, (now - segmentStart) / HOUR_MS),
    endedByIntervention: false,
  });
  return segments;
}

// —— 预测标签（§7.2）——

export type PredictionLabel = 1 | 0 | "censored" | "unknown";

export interface PredictionWindowLabel {
  readonly label: PredictionLabel;
  readonly reason: string;
  readonly firstUnexpectedAt: number | null;
  readonly interventionAt: number | null;
  readonly interventionKind: "card" | "announced" | null;
}

export interface LabelWindowInput {
  readonly windowStart: number;
  readonly windowEnd: number;
  readonly events: readonly ResetEvent[];
  /** 数据被确认完整观测到的时刻；小于 windowEnd 即存在缺口。 */
  readonly observedUntil: number;
}

/**
 * 给一个预测窗口打标签（§7.2）：
 * - 窗口内先出现意外强制重置 → 1（之后再用卡不取消正例）；
 * - 意外事件前先用卡／公告执行 → censored（用卡不算命中，§9 用例 8）；
 * - 完整观测到窗口结束且无目标事件与干预 → 0；
 * - 数据缺失或日期精度跨窗口边界无法判断 → unknown（§9 用例 9）。
 */
export function labelPredictionWindow(input: LabelWindowInput): PredictionWindowLabel {
  const { windowStart, windowEnd, observedUntil } = input;
  const candidates = activeEvents(input.events)
    .filter((event) => event.kind === "unexpected" || event.kind === "card" || event.kind === "announced")
    .map((event) => {
      const { at, precision } = resolveEventTime(event);
      return { event, at, precision };
    })
    .filter((entry): entry is { event: ResetEvent; at: number; precision: TimePrecision } => entry.at != null)
    .sort((a, b) => a.at - b.at);

  // 日期级事件跨窗口边界 → 无法判断先后，标签不确定（不按正午猜答案）。
  for (const entry of candidates) {
    if (entry.precision !== "day") continue;
    const dayEnd = entry.at + DAY_MS;
    const straddlesStart = entry.at < windowStart && dayEnd > windowStart;
    const straddlesEnd = entry.at < windowEnd && dayEnd > windowEnd;
    if (straddlesStart || straddlesEnd) {
      return {
        label: "unknown",
        reason: "日期级事件的所在日与窗口边界相交，无法判断先后：不按正午伪造时刻。",
        firstUnexpectedAt: null,
        interventionAt: null,
        interventionKind: null,
      };
    }
  }

  const inWindow = candidates.filter((entry) => entry.at >= windowStart && entry.at < windowEnd);
  const firstUnexpected = inWindow.find((entry) => entry.event.kind === "unexpected") ?? null;
  const firstIntervention =
    inWindow.find((entry) => entry.event.kind === "card" || entry.event.kind === "announced") ?? null;

  if (firstUnexpected != null) {
    const interventionBefore =
      firstIntervention != null && firstIntervention.at < firstUnexpected.at ? firstIntervention : null;
    if (interventionBefore == null) {
      return {
        label: 1,
        reason: "窗口内先出现意外强制重置（之后的用卡不取消已有正例）。",
        firstUnexpectedAt: firstUnexpected.at,
        interventionAt: firstIntervention?.at ?? null,
        interventionKind: null,
      };
    }
  }

  if (firstIntervention != null) {
    return {
      label: "censored",
      reason:
        firstIntervention.event.kind === "card"
          ? "意外事件出现前先主动用卡：该窗口被干预删失，不算预测命中。"
          : "意外事件出现前先有公告实际执行：该窗口被干预删失。",
      firstUnexpectedAt: firstUnexpected?.at ?? null,
      interventionAt: firstIntervention.at,
      interventionKind: firstIntervention.event.kind === "card" ? "card" : "announced",
    };
  }

  if (observedUntil >= windowEnd) {
    return {
      label: 0,
      reason: "完整观测到窗口结束，没有目标事件也没有干预。",
      firstUnexpectedAt: null,
      interventionAt: null,
      interventionKind: null,
    };
  }

  return {
    label: "unknown",
    reason: "观测覆盖不足（数据缺口）：未完整观察到窗口结束，不能判定为负例。",
    firstUnexpectedAt: null,
    interventionAt: null,
    interventionKind: null,
  };
}
