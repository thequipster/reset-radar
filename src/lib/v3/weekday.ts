// v3.2：BJT星期影子；独立前瞻验证，不覆盖D60参考或用卡规划。
import { DAY_MS, fitPlatformModel } from './platform';
import { eventWeight, fitTrendModel, reliableCoverage, weightedExposure, type TrendInput } from './trend';

// RR54事先固定的工程先验：每个星期分别获得28天暴露量的收缩，不由回放拟合。
export const WEEKDAY_SHRINKAGE_DAYS = 28;
export const WEEKDAY_VERSION = 'platform-v3.2:D60-W28-BJT-shadow' as const;
const BJT_OFFSET_MS = 8 * 3_600_000;
const BJT = 'Asia/Shanghai' as const;
const MAX_DATE_MS = 8.64e15;
// 纯资源保护：超过十年视野拒绝，避免生成无界日段；不是模型参数。
const MAX_PREDICTION_SEGMENTS = 3660;
const weekdayAt = (t: number) => new Date(t + BJT_OFFSET_MS).getUTCDay();

export type WeekdayModel = {
  version: typeof WEEKDAY_VERSION; timezone: typeof BJT; shrinkagePerWeekdayDays: number;
  base: ReturnType<typeof fitTrendModel>; counts: number[]; exposures: number[]; multipliers: number[]; rates: (number | null)[];
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
    base, counts, exposures, multipliers, rates: multipliers.map(m => lambda == null ? null : lambda * m) };
}

export type WeekdaySegment = { from: number; to: number; weekday: number; ratePerDay: number; hazard: number };
export function predictWeekday(model: WeekdayModel, now: number, horizonMs = DAY_MS) {
  if (!model || !model.base || !Array.isArray(model.rates) || model.rates.length !== 7 ||
      model.rates.some(value => value == null || !Number.isFinite(value) || value < 0) ||
      model.base.ratePerDay == null || !Number.isFinite(model.base.ratePerDay) || model.base.ratePerDay < 0 ||
      !Number.isFinite(now) || Math.abs(now) > MAX_DATE_MS || now < model.base.cutoff ||
      !Number.isFinite(horizonMs) || horizonMs < 0 || horizonMs > MAX_PREDICTION_SEGMENTS * DAY_MS) return null;
  const end = now + horizonMs;
  if (!Number.isFinite(end) || Math.abs(end) > MAX_DATE_MS || !Number.isFinite(weekdayAt(now))) return null;
  const segments: WeekdaySegment[] = []; let from = now, integratedHazard = 0;
  while (from < end) {
    const to = Math.min(end, Math.floor((from + BJT_OFFSET_MS) / DAY_MS) * DAY_MS - BJT_OFFSET_MS + DAY_MS);
    if (!(to > from) || !Number.isFinite(to)) return null;
    const weekday = weekdayAt(from), rate = model.rates[weekday];
    if (rate == null || !Number.isFinite(rate) || rate < 0) return null;
    const ratePerDay = rate, hazard = ratePerDay * (to - from) / DAY_MS;
    if (!Number.isFinite(hazard) || hazard < 0) return null;
    segments.push({ from, to, weekday, ratePerDay, hazard }); integratedHazard += hazard; from = to;
    if (!Number.isFinite(integratedHazard) || segments.length > MAX_PREDICTION_SEGMENTS) return null;
  }
  const probability = -Math.expm1(-integratedHazard);
  return Number.isFinite(probability) && probability >= 0 && probability <= 1 ? { probability, integratedHazard, segments } : null;
}
