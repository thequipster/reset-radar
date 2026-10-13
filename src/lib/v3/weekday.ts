// v3.2 影子提案：BJT 星期效应；不接入在线预测。
import { DAY_MS, fitPlatformModel } from './platform';
import { eventWeight, fitTrendModel, reliableCoverage, weightedExposure, type TrendInput } from './trend';

// RR54事先固定的工程先验：每个星期分别获得28天暴露量的收缩，不由回放拟合。
export const WEEKDAY_SHRINKAGE_DAYS = 28;
export const WEEKDAY_VERSION = 'platform-v3.2:D60-W28-BJT-shadow' as const;
const BJT_OFFSET_MS = 8 * 3_600_000;
const BJT = 'Asia/Shanghai' as const;
const weekdayAt = (t: number) => new Date(t + BJT_OFFSET_MS).getUTCDay();

export type WeekdayModel = {
  version: typeof WEEKDAY_VERSION; timezone: typeof BJT; shrinkagePerWeekdayDays: number;
  base: ReturnType<typeof fitTrendModel>; counts: number[]; exposures: number[]; multipliers: number[]; rates: number[];
};

/** 拟合固定D60基线上的星期影子模型；训练数据严格沿用v3.1覆盖和事件归一化口径。 */
export function fitWeekdayModel(input: TrendInput): WeekdayModel {
  const base = fitTrendModel(input), counts = Array(7).fill(0) as number[], exposures = Array(7).fill(0) as number[];
  const cutoff = input.trainingCutoff, coverage = reliableCoverage(input.coverage, cutoff);
  const events = fitPlatformModel({ ...input, coverage: [] }).events
    .filter(e => coverage.some(c => e.announcedAt > c.from && e.announcedAt <= c.to));
  for (const e of events) counts[weekdayAt(e.announcedAt)] += eventWeight(cutoff, e.announcedAt);
  for (const c of coverage) {
    let from = c.from;
    while (from < c.to) {
      const nextMidnight = Math.floor((from + BJT_OFFSET_MS) / DAY_MS) * DAY_MS - BJT_OFFSET_MS + DAY_MS;
      const to = Math.min(c.to, nextMidnight);
      exposures[weekdayAt(from)] += weightedExposure(cutoff, from, to);
      from = to;
    }
  }
  const lambda = base.ratePerDay;
  const q = exposures.map((e, d) => (counts[d] + WEEKDAY_SHRINKAGE_DAYS * (lambda ?? 0)) / (e + WEEKDAY_SHRINKAGE_DAYS));
  const qMean = q.reduce((a, b) => a + b, 0) / 7;
  const multipliers = qMean > 0 ? q.map(x => x / qMean) : Array(7).fill(1);
  return { version: WEEKDAY_VERSION, timezone: BJT, shrinkagePerWeekdayDays: WEEKDAY_SHRINKAGE_DAYS,
    base, counts, exposures, multipliers, rates: multipliers.map(m => lambda == null ? 0 : lambda * m) };
}

export type WeekdaySegment = { from: number; to: number; weekday: number; ratePerDay: number; hazard: number };
export function predictWeekday(model: WeekdayModel, now: number, horizonMs = DAY_MS) {
  const rate = model.base.ratePerDay;
  if (rate == null || !Number.isFinite(rate) || rate < 0 || !Number.isFinite(now) || now < model.base.cutoff || !Number.isFinite(horizonMs) || horizonMs < 0) return null;
  const end = now + horizonMs;
  if (!Number.isFinite(end)) return null;
  const segments: WeekdaySegment[] = []; let from = now, integratedHazard = 0;
  while (from < end) {
    const to = Math.min(end, Math.floor((from + BJT_OFFSET_MS) / DAY_MS) * DAY_MS - BJT_OFFSET_MS + DAY_MS);
    const weekday = weekdayAt(from), ratePerDay = model.rates[weekday], hazard = ratePerDay * (to - from) / DAY_MS;
    segments.push({ from, to, weekday, ratePerDay, hazard }); integratedHazard += hazard; from = to;
  }
  return { probability: -Math.expm1(-integratedHazard), integratedHazard, segments };
}
