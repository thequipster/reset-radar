// v2 核心（三）：风险层 —— 预测「外生」意外强制重置，不预测用户自己的动作。
// 规格出处：「reset-radar 核心算法 v2 实现规格」§3（含 3.1 收缩发生率、3.2 用卡后 36h 效应、
// 3.3 公开/账号历史分用、3.4 watch 融合、3.5 解释输出）与 §8 的 risk.ts 输出契约。
//
// 预测目标（固定含义，§3 开头）：
//   如果未来 24 小时没有主动用卡或公告执行干预，发生意外强制重置的概率。
// 已删除的旧硬规则（RR44 之前 risk.ts）：周二/周六固定 70%、36h 内强行抬到 40%、
// 近 30 天频次 +12、星期偏离再加一轮、最终夹到 2–95% —— 它们重复利用同一份历史信息，
// 且输出没有概率含义。

import { beijingDayKey, beijingWeekday, DAY_MS, HOUR_MS } from "./beijing.ts";
import {
  activeEvents,
  DEFAULT_CYCLE_RULES,
  RISK_MODEL_VERSION,
  TARGET_DEFINITION_VERSION,
  resolveEventTime,
  splitObservationSegments,
  type CycleRules,
  type EventScope,
  type ResetEvent,
  type RiskAgeBand,
} from "./resetState.ts";

/** 收缩强度：28 个等效观测天（§3.1）。初始配置，不是已验证的最优值。 */
export const SHRINKAGE_DAYS = 28;
/** 冷启动先验：+1 次事件 / +10 天观测 ⇒ 无数据时每天 0.1 次，24h 概率约 9.5%。 */
export const COLD_START_PRIOR_EVENTS = 1;
export const COLD_START_PRIOR_DAYS = 10;
/** watch 融合：初始权重 0.25，有效期 24h（§3.4，均为初始配置，非已验证权重）。 */
export const WATCH_BLEND_WEIGHT = 0.25;
export const WATCH_MAX_AGE_HOURS = 24;

export const RISK_WINDOW_HOURS = 24;
const AGE_FRESH_HOURS = 36;
const AGE_MID_HOURS = 168;

const BAND_INDEX: Record<RiskAgeBand, number> = { fresh: 0, mid: 1, old: 2 };

/** §3.5：说明这是顺序归因，不是因果贡献。每个因子步骤的 note 都带上这句。 */
const SEQUENTIAL_NOTE = "（顺序归因：记录加入该因素前后的概率差，不是因果贡献。）";

export interface CoverageWindow {
  readonly from: number;
  readonly to: number;
}

export interface WatchSignal {
  /** watch 概率（0–1）。 */
  readonly probability: number;
  /** watch 数据更新时间（UTC ms）。 */
  readonly updatedAt: number;
  /** 预测对象是否与本模型目标一致（未来 24h 意外强制重置）。 */
  readonly targetMatches: boolean;
  /** watch 的预测窗口小时数。 */
  readonly windowHours: number;
  /** watch 的概率是否把公告／自然重置也算进去。 */
  readonly includesAnnouncedOrNatural: boolean;
}

export type WatchComparability = "comparable" | "reference-only" | "absent";

export interface RateCell {
  readonly exposureDays: number;
  readonly events: number;
  readonly rate: number;
}

export interface RateTable {
  /** 全局收缩发生率 λ0（次/天）。 */
  readonly lambda0: number;
  /** 按北京星期（0=周日）的 λw。 */
  readonly weekday: readonly RateCell[];
  /** 按 星期×年龄组 的 λwa，索引 = w * 3 + bandIndex。 */
  readonly weekdayAge: readonly RateCell[];
  readonly totalEvents: number;
  readonly totalExposureDays: number;
  /** 进入年龄子模型的样本（仅精确时刻事件 + 年龄来源非日级）。 */
  readonly ageEligibleEvents: number;
  readonly ageEligibleExposureDays: number;
}

export interface RiskTargetSpec {
  readonly definitionVersion: string;
  readonly label: string;
  readonly windowHours: number;
  readonly excludes: readonly string[];
  readonly note: string;
}

export const RISK_TARGET: RiskTargetSpec = {
  definitionVersion: TARGET_DEFINITION_VERSION,
  label: "未来 24h 意外强制重置风险",
  windowHours: RISK_WINDOW_HOURS,
  excludes: ["主动用卡", "公告执行", "自然重置"],
  note: "含义：如果未来 24 小时没有主动用卡或公告执行干预，发生意外强制重置的概率。用卡或公告执行后重新计算。",
};

export interface SurvivalPoint {
  readonly hours: number;
  readonly survival: number;
  readonly cumulativeProbability: number;
}

export interface FactorStep {
  readonly id: "baseline" | "weekday" | "age" | "watch";
  readonly label: string;
  readonly beforeProbability: number;
  readonly afterProbability: number;
  readonly delta: number;
  readonly note: string;
  readonly assumption?: boolean;
}

export interface RiskQuality {
  /** 被确认完整观测的时间 E（天）。 */
  readonly effectiveExposureDays: number;
  /** 覆盖期内意外强制重置次数 K。 */
  readonly unexpectedEventCount: number;
  readonly dataRange: { readonly from: number | null; readonly to: number | null };
  /** 冷启动：还没有足够的账号样本，基线是产品假设。 */
  readonly coldStart: boolean;
  readonly missing: readonly string[];
  readonly scopeNote: string;
  /** 是否已完成账号口径校准（有账号样本且 E>0）。 */
  readonly calibrated: boolean;
}

export interface ResetRiskV2 {
  readonly target: RiskTargetSpec;
  /** 未来 24h 概率（0–1）。 */
  readonly probability24h: number;
  /** 存续曲线（0–72h，不套用 watch 修正）。 */
  readonly survivalCurve: readonly SurvivalPoint[];
  readonly factorSteps: readonly FactorStep[];
  readonly effectiveExposureDays: number;
  readonly unexpectedEventCount: number;
  readonly scope: EventScope;
  readonly quality: RiskQuality;
  readonly assumptions: readonly string[];
  readonly modelVersion: string;
  readonly watchComparability: WatchComparability;
}

interface AgePoint {
  readonly at: number;
  readonly band: RiskAgeBand;
  /** 该段年龄来自日级事件：不能进入年龄子模型（§3.3）。 */
  readonly dayPrecision: boolean;
}

export interface AssessRiskV2Input {
  readonly events: readonly ResetEvent[];
  readonly now: number;
  /** 被确认完整观测的区间；不给则从观察段派生（并记为缺失项）。 */
  readonly coverage?: readonly CoverageWindow[];
  readonly watch?: WatchSignal | null;
  readonly cycleRules?: CycleRules;
  /** 期望口径：account=账号风险（默认）。 */
  readonly requestedScope?: EventScope;
  /** 未来 24h 内是否已计划用卡/公告执行（用于提示而非改概率）。 */
  readonly plannedIntervention?: boolean;
}

const EMPTY_RATE: RateCell = { exposureDays: 0, events: 0, rate: 0 };

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const bandIndexOf = (band: RiskAgeBand | null): number | null => (band == null ? null : BAND_INDEX[band]);

/** 风险年龄时间线：每次强制类重置归零，并在 +36h / +168h 换组。 */
export function buildAgeTimeline(
  events: readonly ResetEvent[],
  horizonTo: number,
  scope: EventScope,
): AgePoint[] {
  const points: AgePoint[] = [];
  for (const event of activeEvents(events)) {
    if (event.kind !== "card" && event.kind !== "unexpected" && event.kind !== "announced") continue;
    if (event.scope !== scope) continue;
    const { at, precision } = resolveEventTime(event);
    if (at == null) continue;
    const dayPrecision = precision === "day";
    points.push({ at, band: "fresh", dayPrecision });
    if (at + AGE_FRESH_HOURS * HOUR_MS <= horizonTo) {
      points.push({ at: at + AGE_FRESH_HOURS * HOUR_MS, band: "mid", dayPrecision });
    }
    if (at + AGE_MID_HOURS * HOUR_MS <= horizonTo) {
      points.push({ at: at + AGE_MID_HOURS * HOUR_MS, band: "old", dayPrecision });
    }
  }
  return points.sort((a, b) => a.at - b.at);
}

export interface AgeLookup {
  readonly bandAt: (at: number) => { band: RiskAgeBand; dayPrecision: boolean } | null;
}

export function ageLookup(timeline: readonly AgePoint[]): AgeLookup {
  return {
    bandAt: (at: number) => {
      let found: AgePoint | null = null;
      for (const point of timeline) {
        if (point.at <= at) found = point;
        else break;
      }
      return found == null ? null : { band: found.band, dayPrecision: found.dayPrecision };
    },
  };
}

/** 在 [from,to) 内切段：北京午夜 + 36h/168h 年龄边界（§3.1 要求）。 */
function segmentBoundaries(from: number, to: number, timeline: readonly AgePoint[]): number[] {
  const marks = new Set<number>([from, to]);
  let cursor = Math.floor((from + 8 * HOUR_MS) / DAY_MS) * DAY_MS - 8 * HOUR_MS;
  if (cursor < from) cursor += DAY_MS;
  for (let t = cursor; t < to; t += DAY_MS) marks.add(t);
  for (const point of timeline) {
    if (point.at > from && point.at < to) marks.add(point.at);
  }
  return [...marks].filter((t) => t >= from && t <= to).sort((a, b) => a - b);
}

/**
 * 训练收缩发生率（§3.1）：
 *   λ0 = (K + 1) / (E + 10)
 *   λw = (Kw + 28·λ0) / (Ew + 28)
 *   λwa = (Kwa + 28·λw) / (Ewa + 28)
 * 日级事件进星期统计，不进年龄子模型；年龄来自日级事件的暴露也不进年龄子模型。
 */
export function trainRates(input: {
  readonly events: readonly ResetEvent[];
  readonly coverage: readonly CoverageWindow[];
  readonly now: number;
  readonly scope: EventScope;
}): RateTable {
  const { coverage, now, scope } = input;
  const events = activeEvents(input.events);
  const forcedTimeline = buildAgeTimeline(events, now, scope);
  const lookup = ageLookup(forcedTimeline);

  const weekdayEvents = new Array(7).fill(0) as number[];
  const weekdayExposure = new Array(7).fill(0) as number[];
  const ageEvents = new Array(21).fill(0) as number[];
  const ageExposure = new Array(21).fill(0) as number[];
  let totalEvents = 0;
  let totalExposure = 0;

  for (const window of coverage) {
    const from = Math.max(window.from, 0);
    const to = Math.min(window.to, now);
    if (!(to > from)) continue;
    const marks = segmentBoundaries(from, to, forcedTimeline);
    for (let i = 0; i + 1 < marks.length; i += 1) {
      const start = marks[i];
      const end = marks[i + 1];
      const days = (end - start) / DAY_MS;
      if (days <= 0) continue;
      const weekday = beijingWeekday(start);
      weekdayExposure[weekday] += days;
      totalExposure += days;
      const age = lookup.bandAt(start);
      const band = bandIndexOf(age?.band ?? null);
      if (band != null && age != null && !age.dayPrecision) {
        ageExposure[weekday * 3 + band] += days;
      }
    }
  }

  for (const event of events) {
    if (event.kind !== "unexpected" || event.scope !== scope) continue;
    const { at, precision } = resolveEventTime(event);
    if (at == null) continue;
    if (!coverage.some((window) => at >= window.from && at < Math.min(window.to, now))) continue;
    const weekday = beijingWeekday(at);
    weekdayEvents[weekday] += 1;
    totalEvents += 1;
    if (precision === "day") continue; // 不拿虚构正午训练 36h 年龄效应
    const age = lookup.bandAt(at);
    const band = bandIndexOf(age?.band ?? null);
    if (band != null && age != null && !age.dayPrecision) {
      ageEvents[weekday * 3 + band] += 1;
    }
  }

  const lambda0 = (totalEvents + COLD_START_PRIOR_EVENTS) / (totalExposure + COLD_START_PRIOR_DAYS);
  const weekday: RateCell[] = [];
  for (let w = 0; w < 7; w += 1) {
    const rate = (weekdayEvents[w] + SHRINKAGE_DAYS * lambda0) / (weekdayExposure[w] + SHRINKAGE_DAYS);
    weekday.push({ exposureDays: weekdayExposure[w], events: weekdayEvents[w], rate });
  }
  const weekdayAge: RateCell[] = [];
  for (let w = 0; w < 7; w += 1) {
    for (let band = 0; band < 3; band += 1) {
      const index = w * 3 + band;
      const rate =
        (ageEvents[index] + SHRINKAGE_DAYS * weekday[w].rate) / (ageExposure[index] + SHRINKAGE_DAYS);
      weekdayAge.push({ exposureDays: ageExposure[index], events: ageEvents[index], rate });
    }
  }

  return {
    lambda0,
    weekday,
    weekdayAge,
    totalEvents,
    totalExposureDays: totalExposure,
    ageEligibleEvents: ageEvents.reduce((sum, value) => sum + value, 0),
    ageEligibleExposureDays: ageExposure.reduce((sum, value) => sum + value, 0),
  };
}

/** 分段积分：Λ(t0,t1) = Σ λ(w,a) × 段时长 / 24h；年龄未知时只用星期模型。 */
export function integrateLambda(
  table: RateTable,
  from: number,
  to: number,
  timeline: readonly AgePoint[],
): number {
  if (!(to > from)) return 0;
  const lookup = ageLookup(timeline);
  const marks = segmentBoundaries(from, to, timeline);
  let lambda = 0;
  for (let i = 0; i + 1 < marks.length; i += 1) {
    const start = marks[i];
    const end = marks[i + 1];
    const weekday = beijingWeekday(start);
    const age = lookup.bandAt(start);
    const band = age == null || age.dayPrecision ? null : bandIndexOf(age.band);
    const rate =
      band == null ? table.weekday[weekday].rate : table.weekdayAge[weekday * 3 + band].rate;
    lambda += (rate * (end - start)) / DAY_MS;
  }
  return lambda;
}

const probabilityFromLambda = (lambda: number): number => clamp01(1 - Math.exp(-lambda));

/** watch 可比较性：预测对象、窗口、是否含公告/自然重置、数据更新时间四项全匹配才融合（§3.4）。 */
export function assessWatchComparability(watch: WatchSignal | null | undefined, now: number): WatchComparability {
  if (watch == null) return "absent";
  if (!Number.isFinite(watch.probability) || watch.probability < 0 || watch.probability > 1) return "reference-only";
  if (!watch.targetMatches) return "reference-only";
  if (watch.windowHours !== RISK_WINDOW_HOURS) return "reference-only";
  if (watch.includesAnnouncedOrNatural) return "reference-only";
  if (!Number.isFinite(watch.updatedAt)) return "reference-only";
  if ((now - watch.updatedAt) / HOUR_MS > WATCH_MAX_AGE_HOURS) return "reference-only";
  if (now < watch.updatedAt) return "reference-only";
  return "comparable";
}

/** watch 融合权重：0.25 × max(0, 1 − 数据年龄/24h)（§3.4）。 */
export function watchBlendWeight(watch: WatchSignal, now: number): number {
  const ageHours = Math.max(0, (now - watch.updatedAt) / HOUR_MS);
  return WATCH_BLEND_WEIGHT * Math.max(0, 1 - ageHours / WATCH_MAX_AGE_HOURS);
}

export function assessResetRiskV2(input: AssessRiskV2Input): ResetRiskV2 {
  const { events, now } = input;
  const rules = input.cycleRules ?? DEFAULT_CYCLE_RULES;
  const requestedScope = input.requestedScope ?? "account";
  const assumptions: string[] = [];
  const missing: string[] = [];

  // 覆盖期：显式优先；缺省从观察段派生，并如实记为「未显式确认完整覆盖」。
  const hasDatedEvents = activeEvents(events).some((event) => resolveEventTime(event).at != null);
  let coverage: CoverageWindow[] =
    input.coverage != null
      ? [...input.coverage]
      : hasDatedEvents
        ? splitObservationSegments(events, now).map((segment) => ({
            from: segment.startAt,
            to: segment.endAt ?? now,
          }))
        : [];
  if (input.coverage == null && hasDatedEvents && coverage.length > 0) {
    missing.push("未显式提供完整观测覆盖：当前由观察段派生，缺失采集期未排除。");
  }
  if (coverage.length === 0) {
    missing.push("没有可用观测覆盖：既没有事件，也没有显式确认的完整观测区间。");
  }
  coverage = coverage.filter((window) => window.to > window.from);

  // §3.3：账号风险只用账号样本；范围未知不进入账号训练；全局历史只能当平台参考。
  const accountEvents = activeEvents(events).filter((event) => event.scope === "account");
  const globalEvents = activeEvents(events).filter((event) => event.scope === "global");
  const unknownScopeCount = activeEvents(events).filter((event) => event.scope === "unknown").length;

  let scope: EventScope = requestedScope;
  let scopeNote = "";
  if (requestedScope === "account" && accountEvents.length === 0) {
    if (globalEvents.length > 0) {
      scope = "global";
      scopeNote = "平台风险参考：账号样本为空，当前概率由公开全局历史训练，账号适用程度未校准。";
      assumptions.push("global-history-as-account-proxy");
    } else {
      scopeNote = "账号与全局样本均为空：输出冷启动基线，尚未校准。";
    }
  } else if (requestedScope === "account") {
    scopeNote = unknownScopeCount > 0 ? `另有 ${unknownScopeCount} 条来源范围未知的事件未进入账号训练。` : "账号口径。";
  } else {
    scopeNote = "平台口径：只训练「平台层面出现重置事件」的风险，不等于该账号一定重置。";
  }

  const table = trainRates({ events, coverage, now, scope });
  const unexpectedEventCount = table.totalEvents;
  const coldStart = table.totalExposureDays <= 0 || unexpectedEventCount === 0;

  const timeline = buildAgeTimeline(events, now + 72 * HOUR_MS, scope);
  const lambda24 = integrateLambda(table, now, now + RISK_WINDOW_HOURS * HOUR_MS, timeline);
  const pBaseline = probabilityFromLambda(table.lambda0); // 冷启动/历史基线（不含星期结构）
  const pLambda0Only = probabilityFromLambda((table.lambda0 * RISK_WINDOW_HOURS) / 24);
  const pWeekday = probabilityFromLambda(lambda24);

  // 年龄情景：不套用年龄分组（只用星期率）作对照（§3.2 敏感性要求）。
  const timelineNoAge: readonly AgePoint[] = [];
  const lambdaNoAge = integrateLambda(table, now, now + RISK_WINDOW_HOURS * HOUR_MS, timelineNoAge);
  const pNoAge = probabilityFromLambda(lambdaNoAge);

  const factorSteps: FactorStep[] = [];
  factorSteps.push({
    id: "baseline",
    label: "冷启动／历史基线",
    beforeProbability: 0,
    afterProbability: pLambda0Only,
    delta: pLambda0Only,
    note: coldStart
      ? "没有可用样本：使用产品假设基线（每天 0.1 次 ⇒ 24h 约 9.5%），显示「尚未校准」。"
      : `覆盖期 ${table.totalExposureDays.toFixed(1)} 天内 ${unexpectedEventCount} 次意外重置，全局发生率 ${table.lambda0.toFixed(3)}/天。${SEQUENTIAL_NOTE}`,
    assumption: coldStart,
  });
  factorSteps.push({
    id: "weekday",
    label: "星期结构",
    beforeProbability: pLambda0Only,
    afterProbability: pWeekday,
    delta: pWeekday - pLambda0Only,
    note: `按北京星期分段收缩（${SHRINKAGE_DAYS} 等效观测天）并对未来 24h 逐段积分，不是用「明天星期几」代表整天。${SEQUENTIAL_NOTE}`,
  });
  factorSteps.push({
    id: "age",
    label: "重置后年龄",
    beforeProbability: pNoAge,
    afterProbability: pWeekday,
    delta: pWeekday - pNoAge,
    note:
      timeline.length === 0
        ? `风险年龄未知：只用星期模型（年龄组不参与）。${SEQUENTIAL_NOTE}`
        : `按 [0,36h)/[36h,168h)/[168h,∞) 分组；用卡后年龄归零进入短期组（同类状态效应假设，非已证实的相同幅度）。${SEQUENTIAL_NOTE}`,
    assumption: timeline.length > 0,
  });

  let probability = pWeekday;
  let lambdaLocal = lambda24;
  const comparability = assessWatchComparability(input.watch, now);
  if (input.watch != null) {
    if (comparability === "comparable") {
      const weight = watchBlendWeight(input.watch, now);
      const qBlend = (1 - weight) * pWeekday + weight * clamp01(input.watch.probability);
      const before = probability;
      probability = qBlend;
      // 把本地 24h 累积发生率按比例缩放，使积分对应 qBlend（更远日期不套用当前 watch）。
      const lambdaTarget = -Math.log(Math.max(1e-9, 1 - clamp01(qBlend)));
      lambdaLocal = lambda24 > 0 ? lambdaTarget : 0;
      factorSteps.push({
        id: "watch",
        label: "可比较的 watch 修正",
        beforeProbability: before,
        afterProbability: qBlend,
        delta: qBlend - before,
        note: `watch 四项口径匹配，以权重 ${weight.toFixed(3)} 融合（0.25×max(0,1−数据年龄/24h)）。${SEQUENTIAL_NOTE}`,
        assumption: true,
      });
    } else {
      factorSteps.push({
        id: "watch",
        label: "watch 仅作独立参考",
        beforeProbability: probability,
        afterProbability: probability,
        delta: 0,
        note: `watch 口径不匹配（预测对象/窗口/含公告或自然重置/数据更新时间），仅并列展示，不融合。${SEQUENTIAL_NOTE}`,
        assumption: true,
      });
    }
  }

  const survivalCurve: SurvivalPoint[] = [];
  for (let hours = 0; hours <= 72; hours += 6) {
    const lambda = integrateLambda(table, now, now + hours * HOUR_MS, timeline);
    survivalCurve.push({
      hours,
      survival: Math.exp(-lambda),
      cumulativeProbability: probabilityFromLambda(lambda),
    });
  }

  const rangedEvents = activeEvents(events)
    .map((event) => resolveEventTime(event).at)
    .filter((at): at is number => at != null)
    .sort((a, b) => a - b);
  const dataRange = {
    from: rangedEvents.length > 0 ? rangedEvents[0] : null,
    to: rangedEvents.length > 0 ? rangedEvents[rangedEvents.length - 1] : null,
  };

  if (coldStart) assumptions.push("cold-start-baseline");
  if (table.ageEligibleEvents === 0) {
    assumptions.push("age-model-untrained");
    missing.push("没有可用于年龄子模型的精确时刻样本：36h/168h 年龄效应未训练。");
  }
  if (unknownScopeCount > 0) missing.push(`${unknownScopeCount} 条事件来源范围未知，未进入训练。`);
  if (scope === "global") missing.push("账号样本为空：当前为平台参考概率，不等于该账号的风险。");
  if (rules.cycleRuleSource !== "observed") {
    missing.push(`周期长度来源为 ${rules.cycleRuleSource}：自然重置倒计时与预演截止按暂定值计算。`);
  }

  return {
    target: RISK_TARGET,
    probability24h: clamp01(probability),
    survivalCurve,
    factorSteps,
    effectiveExposureDays: table.totalExposureDays,
    unexpectedEventCount,
    scope,
    quality: {
      effectiveExposureDays: table.totalExposureDays,
      unexpectedEventCount,
      dataRange,
      coldStart,
      missing,
      scopeNote,
      calibrated: !coldStart && scope === "account" && table.totalExposureDays > 0,
    },
    assumptions,
    modelVersion: RISK_MODEL_VERSION,
    watchComparability: comparability,
  };
}

/** 用卡后不套用年龄修正的对照概率（§3.2：两个情景结论相反时标「对短期风险假设敏感」）。 */
export function ageSensitivityProbability(input: AssessRiskV2Input): number {
  const table = trainRates({
    events: input.events,
    coverage:
      input.coverage ??
      splitObservationSegments(input.events, input.now).map((segment) => ({
        from: segment.startAt,
        to: segment.endAt ?? input.now,
      })),
    now: input.now,
    scope: input.requestedScope ?? "account",
  });
  const lambda = integrateLambda(table, input.now, input.now + RISK_WINDOW_HOURS * HOUR_MS, []);
  return probabilityFromLambda(lambda);
}

/** 供 UI 展示：把 0–1 概率转成百分点（1 位小数）。 */
export const toPercentPoint = (probability: number): number => Math.round(clamp01(probability) * 1000) / 10;

/** 调试/落盘用：事件流的北京日键（与日级事件口径一致）。 */
export const eventDayKey = (event: ResetEvent): string | null => {
  const { at } = resolveEventTime(event);
  return at == null ? null : beijingDayKey(at);
};
