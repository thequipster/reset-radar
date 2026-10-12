import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../v3/platform';
import { classifyAccountObservations, normalizeSupplyIncidents, type AccountObservationSnapshot } from '../v3/supply';

const at = (hour: number, minute = 0) => Date.UTC(2026, 9, 12, hour, minute);
const snapshot = (observedAt: number, overrides: Partial<AccountObservationSnapshot> = {}): AccountObservationSnapshot => ({
  observedAt,
  weekly: { remaining: 50, resetsAt: at(18), durationMins: 10080 },
  short: { remaining: 40, resetsAt: at(15), durationMins: 300 },
  availableCardCount: 1,
  ...overrides,
});
const incident = () => normalizeSupplyIncidents({ platformEvents: [{ id: 'regular-1', resetType: 'regular', announcedAt: at(10) }] });

describe('account mapping observations v3', () => {
  it('keeps announcement time separate from the observed execution interval', () => {
    const previous = snapshot(at(13));
    const current = snapshot(at(13, 5), {
      weekly: { remaining: 100, resetsAt: at(13, 5) + 7 * DAY_MS, durationMins: 10080 },
      short: { remaining: 100, resetsAt: at(13, 5) + 5 * 60_000, durationMins: 300 },
      linkedIncidentIds: ['regular-1'],
    });
    const [result] = classifyAccountObservations({ snapshots: [previous, current], incidents: incident() });
    expect(result).toMatchObject({
      interval: { fromExclusive: at(13), toInclusive: at(13, 5) },
      incidentId: 'regular-1', announcedAt: at(10), status: 'hit', knownClassification: 'platform_external_reset',
    });
  });

  it('censors an account label when a confirmed card use explains the reset', () => {
    const previous = snapshot(at(13));
    const current = snapshot(at(13, 5), { weekly: { remaining: 100, resetsAt: at(13) + 7 * DAY_MS, durationMins: 10080 }, linkedIncidentIds: ['regular-1'] });
    const [result] = classifyAccountObservations({ snapshots: [previous, current], incidents: incident(), cardOperations: [{ id: 'card-use-1', occurredAt: at(13, 2), confirmed: true }] });
    expect(result.status).toBe('unobservable');
    expect(result.knownClassification).toBe('card_use');
    expect(result.evidence.confirmedCardUseIds).toEqual(['card-use-1']);
  });

  it('does not call a full unchanged balance a miss even with complete incident-window coverage', () => {
    const previous = snapshot(at(13), { weekly: { remaining: 100, resetsAt: at(18), durationMins: 10080 }, short: { remaining: 100, resetsAt: at(15), durationMins: 300 } });
    const current = snapshot(at(13, 5), { ...previous, observedAt: at(13, 5), linkedIncidentIds: ['regular-1'] });
    const [result] = classifyAccountObservations({ snapshots: [previous, current], incidents: incident(),
      executionWindows: [{ incidentId: 'regular-1', from: at(13), to: at(13, 5), basis: 'observed_execution_window' }],
      coverage: [{ from: at(13), to: at(13, 5), complete: true }] });
    expect(result.status).toBe('unobservable');
    expect(result.knownClassification).toBe('unobservable');
  });

  it('marks overlapping natural reset and card operation as ambiguous', () => {
    const previous = snapshot(at(13), { weekly: { remaining: 25, resetsAt: at(13, 4), durationMins: 10080 } });
    const current = snapshot(at(13, 5), { weekly: { remaining: 100, resetsAt: at(13, 5) + 7 * DAY_MS, durationMins: 10080 }, linkedIncidentIds: ['regular-1'] });
    const [result] = classifyAccountObservations({ snapshots: [previous, current], incidents: incident(), cardOperations: [{ id: 'use', occurredAt: at(13, 3), confirmed: true }] });
    expect(result.status).toBe('ambiguous');
    expect(result.evidence.naturalResetCrossed).toBe(true);
  });

  it('treats a resetsAt change as observable evidence even when both balances are full', () => {
    const previous = snapshot(at(13), { weekly: { remaining: 100, resetsAt: at(18), durationMins: 10080 }, short: { remaining: 100, resetsAt: at(15), durationMins: 300 } });
    const current = snapshot(at(13, 5), { weekly: { remaining: 100, resetsAt: at(13, 5) + 7 * DAY_MS, durationMins: 10080 }, short: previous.short, linkedIncidentIds: ['regular-1'] });
    const [result] = classifyAccountObservations({ snapshots: [previous, current], incidents: incident() });
    expect(result.status).toBe('hit');
    expect(result.evidence.weeklyResetsAtChanged).toBe(true);
  });

  it('never turns temporal proximity alone into a platform hit', () => {
    const previous = snapshot(at(13));
    const current = snapshot(at(13, 5), { weekly: { remaining: 100, resetsAt: at(13, 5) + 7 * DAY_MS, durationMins: 10080 } });
    const [result] = classifyAccountObservations({ snapshots: [previous, current], incidents: incident(),
      executionWindows: [{ incidentId: 'regular-1', from: at(13), to: at(13, 5), basis: 'observed_execution_window' }] });
    expect(result.status).toBe('ambiguous');
    expect(result.incidentId).toBe('regular-1');
  });

  it('does not derive an account event from a regular announcement without account linkage', () => {
    const previous = snapshot(at(9));
    const current = snapshot(at(10), { weekly: { remaining: 100, resetsAt: at(10) + 7 * DAY_MS, durationMins: 10080 } });
    const [result] = classifyAccountObservations({ snapshots: [previous, current], incidents: incident() });
    expect(result.status).toBe('ambiguous');
    expect(result.incidentId).toBeNull();
    expect(result.announcedAt).toBeNull();
  });

  it('labels a miss only for an explicitly windowed, complete, identifiable interval with no reset', () => {
    const previous = snapshot(at(13), { weekly: { remaining: 40, resetsAt: at(18), durationMins: 10080 } });
    const current = snapshot(at(13, 5), { weekly: previous.weekly });
    const [result] = classifyAccountObservations({ snapshots: [previous, current], incidents: incident(),
      executionWindows: [{ incidentId: 'regular-1', from: at(13), to: at(13, 5), basis: 'observed_execution_window' }],
      coverage: [{ from: at(13), to: at(13, 5), complete: true }] });
    expect(result.status).toBe('miss');
    expect(result.knownClassification).toBe('no_reset_observed');
  });
});
