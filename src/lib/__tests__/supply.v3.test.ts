import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../v3/platform';
import { buildSupplyScenarios, normalizeSupplyIncidents } from '../v3/supply';

const state = { observedAt: 0, weekly: { remaining: 50, resetsAt: 10 * DAY_MS, durationMins: 10080 }, short: { remaining: 20, resetsAt: DAY_MS, durationMins: 300 }, availableCardCount: 1 };
const forecast = { target: 'platform_notice' as const, probability24h: 0.12, probabilities: [], model: 'constant_rate' as const, shadow: { model: 'age_piecewise' as const, probability24h: 0.2, probabilities: [] }, globalRatePerDay: 0.13, ageDays: 4, factors: [], shadowFactors: [], training: { eventCount: 54, completedGapCount: 53, exposureDays: 100 }, status: 'reference' as const };

describe('supply scenarios v3', () => {
  it('retains schedule versions, cancellation and first-seen time without inventing schedule certainty', () => {
    const incidents = normalizeSupplyIncidents({ scheduleSnapshots: [
      { id: 's1', version: 1, firstSeenAt: 100, scheduledFor: 1000, status: 'scheduled' },
      { id: 's1', version: 2, firstSeenAt: 100, scheduledFor: 2000, status: 'cancelled', cancelledAt: 1500 },
    ] });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({ id: 's1', version: 2, status: 'cancelled', firstSeenAt: 100, scheduledFor: 2000, cancelledAt: 1500 });
    expect(incidents[0].versionHistory).toHaveLength(2);
  });
  it('deduplicates only explicitly related schedule and regular incidents', () => {
    const incidents = normalizeSupplyIncidents({
      scheduleSnapshots: [{ id: 'sched', scheduledFor: 2 * DAY_MS, relatedEventIds: ['reg'] }],
      platformEvents: [{ id: 'reg', resetType: 'regular', announcedAt: 2 * DAY_MS }, { id: 'unrelated', resetType: 'regular', announcedAt: 2 * DAY_MS }],
    });
    expect(incidents.map(x => x.id).sort()).toEqual(['sched', 'unrelated']);
  });
  it('keeps account probability null at cold start and exposes named unweighted mechanism cases', () => {
    const result = buildSupplyScenarios({ accountState: state, platformForecast: forecast,
      scheduleSnapshots: [{ id: 's1', status: 'scheduled', firstSeenAt: 1, scheduledFor: DAY_MS }], now: 0, accountMappingEvidence: [] });
    expect(result.accountProbability24h).toBeNull();
    expect(result.accountProbabilityReason).toContain('尚未测得');
    expect(result.scenarios.some(x => x.id === 's1:no-show')).toBe(true);
    expect(result.scenarios.some(x => x.title.includes('按时兑现') && x.title.includes('双窗'))).toBe(true);
    expect(result.scenarios.filter(x => x.source === 'scheduled').every(x => x.weighted === false && x.probability === null)).toBe(true);
    expect(result.scenarios.find(x => x.id === 's1:按时兑现:weekly-only:reanchor')?.resultingDeadlines.weekly).toBe(DAY_MS + 7 * DAY_MS);
  });
  it('does not treat watch null/unknown as zero or alter platform P', () => {
    const a = buildSupplyScenarios({ accountState: state, platformForecast: forecast, watchSnapshots: [], now: 0 });
    const b = buildSupplyScenarios({ accountState: state, platformForecast: forecast, watchSnapshots: [{ id: 'w', reset_chance_percent: null }], now: 0 });
    expect(a.accountProbability24h).toBeNull();
    expect(b.watchNotes).toHaveLength(1);
    expect(b.scenarios.find(x => x.id === 'natural-only')?.probability).toBeNull();
  });
  it('keeps an upcoming schedule separate from platform background probability', () => {
    const result = buildSupplyScenarios({ accountState: state, platformForecast: forecast, scheduleSnapshots: [{ id: 's', scheduledFor: 2 * DAY_MS }],
      mechanismConfig: { includePlatformBackground: true }, now: 0 });
    expect(result.scenarios.find(x => x.id === 'platform-background-sensitive')?.probability).toBe(0.12);
    expect(result.scenarios.find(x => x.id === 'platform-background-sensitive')?.assumptions.join(' ')).toContain('不是账号补给概率');
  });
});
