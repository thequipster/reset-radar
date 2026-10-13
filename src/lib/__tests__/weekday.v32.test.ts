import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../v3/platform';
import { fitWeekdayModel, predictWeekday, WEEKDAY_SHRINKAGE_DAYS, type WeekdayModel } from '../v3/weekday';

const bjt = (day: number, hour = 0) => Date.UTC(2026, 0, day, hour - 8);
const cutoff = bjt(61);
const full = [{ from: bjt(1), to: cutoff, complete: true as const }];
const event = (at: number, id: string, extra = {}) => ({ id, resetType: 'regular', announcedAt: at, ...extra });
const input = (events = [1, 2, 3, 4, 5, 6, 7].map((d, i) => event(bjt(d, 9), String(i))), coverage = full) => ({ events, coverage, trainingCutoff: cutoff });

describe('v3.2 星期效应影子提案', () => {
  it('按BJT午夜分割暴露且七日积分保持D60整周基线', () => {
    const model = fitWeekdayModel(input());
    expect(model.exposures.reduce((a, b) => a + b, 0)).toBeCloseTo(model.base.weightedExposureDays, 9);
    const prediction = predictWeekday(model, bjt(61), 7 * DAY_MS)!;
    expect(prediction.integratedHazard).toBeCloseTo(7 * model.base.ratePerDay!, 9);
    expect(prediction.probability).toBeCloseTo(-Math.expm1(-7 * model.base.ratePerDay!), 9);
    expect(model.version).toBe('platform-v3.2:D60-W28-BJT-shadow');
    expect(model.shrinkagePerWeekdayDays).toBe(WEEKDAY_SHRINKAGE_DAYS);
  });

  it('q和乘数与独立手算一致，使用D60平滑率而不是原始lambdaAll', () => {
    const model = fitWeekdayModel(input());
    const lambda = model.base.ratePerDay!, smooth = model.shrinkagePerWeekdayDays;
    const q = model.exposures.map((exposure, d) => (model.counts[d] + smooth * lambda) / (exposure + smooth));
    const mean = q.reduce((sum, value) => sum + value, 0) / 7;
    expect(model.multipliers).toEqual(q.map(value => value / mean));
    expect(model.rates).toEqual(model.multipliers.map(value => lambda * value));
    const oldLambdaAllQ = model.exposures.map((exposure, d) => (model.counts[d] + smooth * model.base.lambdaAll!) / (exposure + smooth));
    expect(model.multipliers[0]).not.toBeCloseTo(oldLambdaAllQ[0] / (oldLambdaAllQ.reduce((a, b) => a + b, 0) / 7), 8);
  });

  it('拟合参数保留单位均值；均匀非零速率预测及正基线零时长均有效', () => {
    const model = fitWeekdayModel(input());
    expect(model.multipliers.reduce((a, b) => a + b, 0) / 7).toBeCloseTo(1, 12);
    const uniform: WeekdayModel = { ...model, rates: Array(7).fill(model.base.ratePerDay!) };
    expect(predictWeekday(uniform, cutoff, DAY_MS)?.integratedHazard).toBeCloseTo(model.base.ratePerDay!, 12);
    expect(predictWeekday(uniform, cutoff, 0)?.probability).toBe(0);
    expect(predictWeekday(uniform, cutoff, 0)?.segments).toEqual([]);
  });

  it('零基线时安全退化为均匀星期乘数，并允许零时长预测', () => {
    const model = fitWeekdayModel(input([], []));
    expect(model.multipliers).toEqual(Array(7).fill(1));
    expect(predictWeekday(model, cutoff, 0)).toBeNull();
    expect(predictWeekday(model, cutoff, -1)).toBeNull();
    expect(predictWeekday(model, cutoff - 1)).toBeNull();
    expect(predictWeekday(model, Number.NaN)).toBeNull();
  });

  it('完整覆盖但没有事件时拟合零基线率，预测仍返回零风险', () => {
    const model = fitWeekdayModel(input([], full));
    expect(model.base.ratePerDay).toBe(0);
    expect(predictWeekday(model, cutoff, DAY_MS)?.probability).toBe(0);
  });

  it('未来按BJT午夜切段，当前星期先走到午夜再走下一天', () => {
    const model = fitWeekdayModel(input());
    const now = bjt(62, 9), pred = predictWeekday(model, now, 24 * 60 * 60_000)!;
    expect(pred.segments.map(s => [s.weekday, (s.to - s.from) / 3_600_000])).toEqual([[2, 15], [3, 9]]);
    expect(pred.integratedHazard).toBeCloseTo((15 * model.rates[2] + 9 * model.rates[3]) / 24, 12);
  });

  it('排除覆盖空洞、非regular事件和训练截止之后才看到的记录', () => {
    const gapCoverage = [{ from: bjt(1), to: bjt(20), complete: true as const }, { from: bjt(22), to: cutoff, complete: true as const }];
    const events = [event(bjt(3), 'inside'), event(bjt(21), 'gap'), event(bjt(25), 'later-seen', { firstSeenAt: cutoff + 1 }), event(bjt(27), 'version-later', { versionSeenAt: cutoff + 1 }), { ...event(bjt(29), 'banked'), resetType: 'banked' }];
    const model = fitWeekdayModel(input(events, gapCoverage));
    expect(model.counts.reduce((a, b) => a + b, 0)).toBeCloseTo(Math.exp(-Math.LN2 / 60 * 58), 12);
    expect(model.exposures.reduce((a, b) => a + b, 0)).toBeCloseTo(model.base.weightedExposureDays, 9);
  });

  it('事件周几采用结束包含、开始排除的覆盖成员口径', () => {
    const from = bjt(1), to = bjt(8), model = fitWeekdayModel(input([event(from, 'excluded'), event(to, 'included')], [{ from, to, complete: true }]));
    expect(model.counts.reduce((a, b) => a + b, 0)).toBeCloseTo(Math.exp(-Math.LN2 / 60 * 53), 10);
  });
});
