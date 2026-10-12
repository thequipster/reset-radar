import { describe, expect, it } from 'vitest';
import { DAY_MS, backtestPlatform, bootstrapWeeklyBrierImprovement, fitPlatformModel, generateRenewalPaths, predictPlatform, summarizeOnlinePlatformScores } from '../v3/platform';

const t = (days: number) => days * DAY_MS;
describe('platform v3', () => {
  it('extending the planning horizon preserves every shared path before the shorter endpoint',()=>{
    const model=fitPlatformModel({events:[{id:'a',resetType:'regular',announcedAt:0},{id:'b',resetType:'regular',announcedAt:5*DAY_MS}],coverage:[{from:0,to:10*DAY_MS,complete:true}],trainingCutoff:10*DAY_MS});
    const short=generateRenewalPaths(model,{now:10*DAY_MS,horizonMs:21*DAY_MS,count:256,seed:42});
    const long=generateRenewalPaths(model,{now:10*DAY_MS,horizonMs:28*DAY_MS,count:256,seed:42});
    expect(long.map(path=>path.filter(at=>at<=31*DAY_MS))).toEqual(short);
  });
  it('a later revision cannot become available earlier just because the event ID was already known',()=>{
    const model=fitPlatformModel({events:[{id:'a',resetType:'regular',announcedAt:DAY_MS,firstSeenAt:DAY_MS,versionSeenAt:4*DAY_MS}],coverage:[],trainingCutoff:3*DAY_MS});
    expect(model.eventCount).toBe(0);
  });
  it('scores the exact uppercase version names emitted by the live v3 journal', () => {
    const summary=summarizeOnlinePlatformScores(['P0','P1-shadow'].map((version,i)=>({group:'primary_daily',groupDate:'2026-10-12',
      outcome:'positive' as const,record:{target:'platform_notice',issuedAt:101,trainingCutoff:100,probability:i===0?.2:.3,modelVersion:`platform-v3:${version}`}})));
    expect(summary.matchedCount).toBe(1);
    expect(summary.brierP0).toBeCloseTo(.64);
    expect(summary.brierP1).toBeCloseTo(.49);
  });
  it('counts every regular including text, deduplicates IDs, and excludes banked records', () => {
    const events = Array.from({ length: 54 }, (_, i) => ({ id: `r${i}`, resetType: 'regular', announcedAt: t(i), text: 'official notice', source: 'official' }));
    events.push({ ...events[10], text: 'revised' }, { id: 'b', resetType: 'banked', announcedAt: t(70), text: 'banked', source: 'official' });
    const model = fitPlatformModel({ events, coverage: [{ from: 0, to: t(60), complete: true }], trainingCutoff: t(60) });
    expect(model.eventCount).toBe(54);
    expect(model.completedGapCount).toBe(53);
    expect(model.k[0]).toBe(53);
  });
  it('uses completed gaps for K but a censored tail only for exposure, with exact 3/9 day bands', () => {
    const events = [{ id: 'a', resetType: 'regular', announcedAt: 0 }, { id: 'b', resetType: 'regular', announcedAt: t(11) }];
    const model = fitPlatformModel({ events, coverage: [{ from: 0, to: t(22), complete: true }], trainingCutoff: t(22) });
    expect(model.e).toEqual([6, 12, 4]); // completed 11d gap plus 11d right-censored tail
    expect(model.k).toEqual([0, 0, 1]);
    expect(model.completedGapCount).toBe(1);
  });
  it('does not treat uncovered event gaps as exposure and respects first-seen cutoff', () => {
    const events = [
      { id: 'a', resetType: 'regular', announcedAt: 0 },
      { id: 'b', resetType: 'regular', announcedAt: t(5), firstSeenAt: t(8) },
      { id: 'c', resetType: 'regular', announcedAt: t(10) },
    ];
    const model = fitPlatformModel({ events, coverage: [{ from: 0, to: t(2), complete: true }, { from: t(3), to: t(10), complete: true }], trainingCutoff: t(7) });
    expect(model.eventCount).toBe(1);
    expect(model.completedGapCount).toBe(0);
    expect(model.exposureDays).toBe(6);
    expect(model.lambda0).toBeNull();
  });
  it('integrates across age boundaries and leaves card-use outside platform inputs', () => {
    const events = [{ id: 'a', resetType: 'regular', announcedAt: 0 }, { id: 'b', resetType: 'regular', announcedAt: t(4) }, { id: 'c', resetType: 'regular', announcedAt: t(20) }];
    const model = fitPlatformModel({ events, coverage: [{ from: 0, to: t(20), complete: true }], trainingCutoff: t(20) });
    const forecast = predictPlatform(model, t(18), [t(4)]);
    expect(forecast.probability24h).toBeCloseTo(1 - Math.exp(-model.lambda0!), 12);
    expect(forecast.shadow.probability24h).toBeGreaterThan(0);
    expect(forecast.probabilities[0].probability).toBeCloseTo(1 - Math.exp(-model.lambda0! * 4), 12);
    expect(forecast.factors.at(-1)?.after).toBe(forecast.probability24h);
    expect(forecast.shadowFactors.at(-1)?.after).toBe(forecast.shadow.probability24h);
    const boundaryModel = fitPlatformModel({ events: [{ id: 'x', resetType: 'regular', announcedAt: -t(14) }, { id: 'y', resetType: 'regular', announcedAt: 0 }],
      coverage: [{ from: -t(14), to: 0, complete: true }], trainingCutoff: 0 });
    const crossing = predictPlatform(boundaryModel, t(2.5), [t(7)]);
    const [l0, l1, l2] = boundaryModel.lambda!;
    expect(crossing.shadow.probabilities[0].probability).toBeCloseTo(1 - Math.exp(-(.5 * l0 + 6 * l1 + .5 * l2)), 12);
  });
  it('generates reproducible 256-path renewal samples from the shared seed', () => {
    const model = fitPlatformModel({ events: [{ id: 'a', resetType: 'regular', announcedAt: 0 }, { id: 'b', resetType: 'regular', announcedAt: t(5) }], coverage: [{ from: 0, to: t(10), complete: true }], trainingCutoff: t(10) });
    const a = generateRenewalPaths(model, { now: t(5), horizonMs: t(30), seed: 42, count: 256 });
    const b = generateRenewalPaths(model, { now: t(5), horizonMs: t(30), seed: 42, count: 256 });
    expect(a).toEqual(b);
    expect(a).toHaveLength(256);
    expect(a.some(path => path.length > 1 && path[1] > path[0])).toBe(true);
  });
  it('merges different IDs only when an explicit relation names the same incident', () => {
    const model = fitPlatformModel({ events: [
      { id: 'a', resetType: 'regular', announcedAt: 0, relatedEventIds: ['b'] },
      { id: 'b', resetType: 'regular', announcedAt: DAY_MS },
      { id: 'c', resetType: 'regular', announcedAt: 2 * DAY_MS },
    ], coverage: [{ from: 0, to: 4 * DAY_MS, complete: true }], trainingCutoff: 4 * DAY_MS });
    expect(model.eventCount).toBe(2);
    expect(model.completedGapCount).toBe(1);
  });
  it('marks historical scoring idealized when firstSeenAt is unavailable and never labels gaps as zero', () => {
    const result = backtestPlatform({ events: [{ id: 'a', resetType: 'regular', announcedAt: t(2) }, { id: 'b', resetType: 'regular', announcedAt: t(5) }],
      coverage: [{ from: t(0), to: t(4), complete: true }, { from: t(6), to: t(9), complete: true }], from: t(0), to: t(9), horizonMs: t(1) });
    expect(result.idealized).toBe(true);
    expect(result.rows.some(r => r.label === null)).toBe(true);
    expect(result.upgradeEligible).toBe(false);
    expect(result.rows.filter(r => r.label !== null).every(r => new Date(r.issuedAt + 8 * 3_600_000).getUTCHours() === 9)).toBe(true);
  });
  it('does not treat reconstructed announcements as verified online predictions for P1 promotion', () => {
    const events = Array.from({ length: 90 }, (_, i) => ({ id: `r${i}`, resetType: 'regular', announcedAt: t(i * 5) }));
    const result = backtestPlatform({ events, coverage: [{ from: 0, to: t(500), complete: true }], from: 0, to: t(500) });
    expect(result.scoredCount).toBeGreaterThanOrEqual(60);
    expect(result.positiveCount).toBeGreaterThanOrEqual(10);
    expect(result.idealized).toBe(true);
    expect(result.upgradeEligible).toBe(false);
  });
  it('uses a reproducible whole-week paired bootstrap interval and keeps the online summary strictly matched', () => {
    const rows = [1, 2, 3, 4].flatMap(week => Array.from({ length: 3 }, (_, i) => ({ week, label: (i % 2) as 0 | 1, p0: .4, p1: .3 })));
    const a = bootstrapWeeklyBrierImprovement(rows), b = bootstrapWeeklyBrierImprovement(rows);
    expect(a).toEqual(b);
    expect(a.blockCount).toBe(4);
    expect(a.lower).toBeGreaterThan(0);
    const summary = summarizeOnlinePlatformScores([
      { group: 'primary_daily', groupDate: '2026-10-12', target: 'platform_notice', trainingCutoff: 100, issuedAt: 101, probabilityP0: .2, probabilityP1: .3, outcome: 'positive' },
      { group: 'primary_daily', groupDate: '2026-10-12', target: 'platform_notice', trainingCutoff: 100, issuedAt: 102, p0: .4, p1: .5, outcome: 'censored' },
      { group: 'temporary', groupDate: '2026-10-12', target: 'platform_notice', trainingCutoff: 100, issuedAt: 103, probabilityP0: .1, probabilityP1: .2, outcome: 'negative' },
      { group: 'primary_daily', groupDate: '2026-10-12', target: 'platform_notice', trainingCutoff: 99, issuedAt: 101, probabilityP0: .1, outcome: 'negative' },
    ]);
    expect(summary.primaryRows).toBe(3);
    expect(summary.matchedCount).toBe(1);
    expect(summary.censored).toBe(1);
    expect(summary.brierP0).toBeCloseTo(.64);
  });
});
