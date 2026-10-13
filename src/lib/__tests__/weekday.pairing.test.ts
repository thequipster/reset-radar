import { describe, expect, it } from 'vitest';
import {
  dueWeekdayReviews,
  evaluateWeekdayJournal,
  weekdayExperiment,
  weekdayRollbackReview,
  WEEKDAY_BOOTSTRAP_SAMPLES,
  WEEKDAY_CONFIDENCE,
  WEEKDAY_REVIEW_DAYS,
} from '../v3/weekdayEvaluation';
import { TREND_VERSION } from '../v3/trend';
import { DAY_MS } from '../v3/platform';
import { WEEKDAY_VERSION } from '../v3/weekday';

const bjtNine = (day: number) => Date.parse('2025-01-01T01:00:00.000Z') + day * DAY_MS;
const enabledAt = bjtNine(0);

type PairOptions = {
  day?: number;
  label?: 0 | 1;
  d60?: number | null;
  weekday?: number | null;
  history?: string;
  trainingCutoff?: number;
  windowStart?: number;
  windowEnd?: number;
  group?: 'primary_daily' | 'temporary';
  verdictLabel?: 0 | 1 | null;
  outcome?: 'positive' | 'negative' | 'unknown';
  settledAt?: number;
  version?: number;
  predictionSuffix?: string;
  d60History?: string;
  weekdayHistory?: string;
  d60TrainingCutoff?: number;
  weekdayTrainingCutoff?: number;
  d60WindowEnd?: number;
  weekdayWindowEnd?: number;
  d60VerdictLabel?: 0 | 1 | null;
  weekdayVerdictLabel?: 0 | 1 | null;
  noVerdict?: boolean;
};

function fixture(rows: PairOptions[] = [], extra: unknown[] = [], activation = enabledAt) {
  const lines: unknown[] = [weekdayExperiment(activation)];
  for (const [index, row] of rows.entries()) {
    const day = row.day ?? index;
    const issuedAt = bjtNine(day);
    const windowStart = row.windowStart ?? issuedAt;
    const windowEnd = row.windowEnd ?? issuedAt + DAY_MS;
    const trainingCutoff = row.trainingCutoff ?? issuedAt - DAY_MS;
    const history = row.history ?? `history-${day}`;
    const suffix = row.predictionSuffix ?? `${day}-${index}`;
    for (const [modelVersion, probability, variant, modelHistory, modelCutoff, modelWindowEnd, modelLabel] of [
      [TREND_VERSION, row.d60 ?? 0.5, 'd60', row.d60History ?? history, row.d60TrainingCutoff ?? trainingCutoff, row.d60WindowEnd ?? windowEnd, row.d60VerdictLabel],
      [WEEKDAY_VERSION, row.weekday ?? 0.5, 'weekday', row.weekdayHistory ?? history, row.weekdayTrainingCutoff ?? trainingCutoff, row.weekdayWindowEnd ?? windowEnd, row.weekdayVerdictLabel],
    ] as const) {
      const id = `${variant}-${suffix}`;
      lines.push({
        kind: 'prediction',
        group: row.group ?? 'primary_daily',
        groupDate: new Date(issuedAt + 8 * 60 * 60_000).toISOString().slice(0, 10),
        record: {
          id,
          target: 'platform_notice',
          modelVersion,
          issuedAt,
          trainingCutoff: modelCutoff,
          windowStart,
          windowEnd: modelWindowEnd,
          probability,
          platformHistorySnapshotId: modelHistory,
        },
      });
      const label = modelLabel === undefined ? (row.verdictLabel === undefined ? (row.label ?? 0) : row.verdictLabel) : modelLabel;
      const outcome = row.outcome ?? (label === null ? 'unknown' : label === 1 ? 'positive' : 'negative');
      if (!row.noVerdict) {
        lines.push({
          kind: 'verdict',
          id: `verdict-${id}-${row.version ?? 1}`,
          predictionId: id,
          target: 'platform_notice',
          modelVersion,
          version: row.version ?? 1,
          outcome,
          label,
          windowEnd: modelWindowEnd,
          settledAt: row.settledAt ?? modelWindowEnd,
        });
      }
    }
  }
  lines.push(...extra);
  return lines.map((line) => JSON.stringify(line)).join('\n');
}

function cleanRows(count: number, positiveEvery = 8, options: Partial<PairOptions> = {}, startDay = 0): PairOptions[] {
  return Array.from({ length: count }, (_, day) => {
    const label: 0 | 1 = (day + 1) % positiveEvery === 0 ? 1 : 0;
    return {
      day: day + startDay,
      label,
      d60: 0.5,
      weekday: label ? 0.9 : 0.1,
      ...options,
    };
  });
}

describe('weekday shadow pairing and review journal', () => {
  it('pairs only same frozen publication fields and same labels', () => {
    const rows: PairOptions[] = [
      { day: 0, label: 0, d60History: 'd60-snapshot', weekdayHistory: 'weekday-snapshot' },
      { day: 1, label: 0, d60TrainingCutoff: bjtNine(1) - 2 * DAY_MS },
      { day: 2, label: 0, weekdayWindowEnd: bjtNine(2) + DAY_MS - 1 },
      { day: 3, label: 0, verdictLabel: 0 },
    ];
    // The last day has valid but conflicting labels in its two model verdicts.
    const content = fixture(rows, [
      {
        kind: 'verdict', id: 'revise-weekday', predictionId: 'weekday-3-3', target: 'platform_notice',
        modelVersion: WEEKDAY_VERSION, version: 2, outcome: 'positive', label: 1,
        windowEnd: bjtNine(3) + DAY_MS, settledAt: bjtNine(3) + DAY_MS,
      },
    ]);
    const result = evaluateWeekdayJournal(content, bjtNine(6));
    expect(result.matchedCount).toBe(0);
    expect(result.missingPairCount).toBeGreaterThanOrEqual(3);
    expect(result.labelMismatchCount).toBe(1);
  });

  it('uses the latest late verdict revision and rejects malformed verdict rows', () => {
    const rows: PairOptions[] = [{ day: 0, label: 0, version: 1 }];
    const content = fixture(rows, [
      {
        kind: 'verdict', id: 'late-positive', predictionId: 'd60-0-0', target: 'platform_notice',
        modelVersion: TREND_VERSION, version: 2, outcome: 'positive', label: 1,
        windowEnd: bjtNine(0) + DAY_MS, settledAt: bjtNine(0) + DAY_MS + DAY_MS,
      },
      {
        kind: 'verdict', id: 'late-positive-weekday', predictionId: 'weekday-0-0', target: 'platform_notice',
        modelVersion: WEEKDAY_VERSION, version: 2, outcome: 'positive', label: 1,
        windowEnd: bjtNine(0) + DAY_MS, settledAt: bjtNine(0) + DAY_MS + DAY_MS,
      },
      {
        kind: 'verdict', id: 'bad-before-window', predictionId: 'd60-0-0', target: 'platform_notice',
        modelVersion: TREND_VERSION, version: 3, outcome: 'negative', label: 0,
        windowEnd: bjtNine(0) + DAY_MS, settledAt: bjtNine(0) + DAY_MS - 1,
      },
    ]);
    const result = evaluateWeekdayJournal(content, bjtNine(4));
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0]?.label).toBe(1);
    expect(result.malformedCount).toBe(1);
  });

  it('keeps unknown and pending pairs out of scoring and does not score temporary refreshes', () => {
    const rows: PairOptions[] = [
      { day: 0, label: 0, outcome: 'unknown', verdictLabel: null },
      { day: 1, label: 0, noVerdict: true },
      { day: 2, label: 0, group: 'temporary' },
      { day: 3, label: 1 },
    ];
    const result = evaluateWeekdayJournal(fixture(rows), bjtNine(5));
    expect(result.matchedCount).toBe(1);
    expect(result.unknownCount).toBe(1);
    expect(result.pendingCount).toBe(1);
    expect(result.temporaryCount).toBe(2);
    expect(result.pairs[0]?.label).toBe(1);
  });

  it('does not multiply samples when duplicate prediction or verdict rows are present', () => {
    const base = fixture([{ day: 0, label: 1 }]);
    const prediction = JSON.parse(base.split('\n')[1]!);
    const verdict = JSON.parse(base.split('\n')[3]!);
    const duplicate = `${base}\n${JSON.stringify(prediction)}\n${JSON.stringify(verdict)}`;
    expect(evaluateWeekdayJournal(duplicate, bjtNine(4)).matchedCount).toBe(1);
  });

  it('counts malformed rows and refuses a future experiment registry', () => {
    const future = weekdayExperiment(bjtNine(2));
    const rows = fixture([{ day: 0, label: 0 }]).split('\n');
    rows[0] = JSON.stringify(future);
    rows.push('{not-json');
    const result = evaluateWeekdayJournal(rows.join('\n'), bjtNine(1));
    expect(result.activationAt).toBeNull();
    expect(result.matchedCount).toBe(0);
    expect(result.malformedCount).toBeGreaterThanOrEqual(1);
  });

  it('runs only the 90/180/365-day scheduled reviews and records a missed checkpoint without backfilling', () => {
    const content = fixture(cleanRows(100));
    expect(WEEKDAY_REVIEW_DAYS).toEqual([90, 180, 365]);
    expect(dueWeekdayReviews(content, enabledAt + 89 * DAY_MS)).toEqual([]);
    const due = dueWeekdayReviews(content, enabledAt + 91 * DAY_MS);
    expect(due).toHaveLength(1);
    expect(due[0]?.record).toMatchObject({ reviewDay: 90, missed: true, eligibleForManualReview: false });
    expect(dueWeekdayReviews(content, enabledAt + 91 * DAY_MS)[0]?.record.matchedCount).toBe(89);
  });

  it('allows the scheduled review at 09:00 on the 90th Beijing calendar day after a late activation', () => {
    const lateActivation = Date.parse('2025-01-01T14:00:00.000Z'); // 22:00 BJT
    const content = fixture(cleanRows(90, 8, {}, 1), [], lateActivation);
    const morningOfDay90 = bjtNine(90);
    const review = dueWeekdayReviews(content, morningOfDay90)[0];
    expect(review?.record).toMatchObject({
      reviewDay: 90,
      missed: false,
      matchedCount: 88,
      checkpointAt: Date.parse('2025-03-31T16:00:00.000Z'), // 2025-04-01 00:00 BJT
    });
  });

  it('applies the full 90-day evidence gates while leaving final qualification to human review', () => {
    const eligible = dueWeekdayReviews(fixture(cleanRows(90)), enabledAt + 90 * DAY_MS)[0]!;
    expect(eligible.record).toMatchObject({
      reviewDay: 90,
      missed: false,
      matchedCount: 89,
      positiveCount: 11,
      eligibleForManualReview: true,
      manualReviewRequired: true,
    });
    expect(eligible.record.weekCount).toBeGreaterThanOrEqual(12);
    expect(eligible.record.blocks7.samples).toBe(10_000);
    expect(eligible.record.blocks14.samples).toBe(10_000);
    expect(eligible.record.blocks7.seed).toBe(20261012);
    expect(eligible.record.blocks14.seed).toBe(20261012);
    expect(eligible.record.blocks7.confidence).toBeCloseTo(0.9833333333333333, 12);
    expect(eligible.record.blocks14.confidence).toBeCloseTo(WEEKDAY_CONFIDENCE, 12);
    expect(eligible.record.blocks7.lower).toBeGreaterThan(0);
    expect(eligible.record.blocks14.lower).toBeGreaterThan(0);
    expect(eligible.record.reason).toContain('人工评审资格');

    const tooFewPairs = dueWeekdayReviews(fixture(cleanRows(59)), enabledAt + 90 * DAY_MS)[0]!;
    const tooFewPositives = dueWeekdayReviews(fixture(cleanRows(90, 10)), enabledAt + 90 * DAY_MS)[0]!;
    expect(tooFewPairs.record.eligibleForManualReview).toBe(false);
    expect(tooFewPositives.record.positiveCount).toBe(8);
    expect(tooFewPositives.record.eligibleForManualReview).toBe(false);
  });

  it('suggests rollback only after 28 mature adverse pairs and two adverse weekly reviews', () => {
    const rows = Array.from({ length: 36 }, (_, day) => ({ day: day + 1, label: 0 as const, d60: 0.1, weekday: 0.9 }));
    const content = fixture(rows);
    const firstAt = bjtNine(30);
    const first = weekdayRollbackReview(content, firstAt);
    expect(first).toMatchObject({ maturePairCount: 28, thresholdExceeded: true, rollbackSuggested: false });

    const priorReview = {
      kind: 'weekday_rollback_review',
      id: 'rollback-review-prior',
      observedAt: new Date(firstAt).toISOString(),
      record: { modelVersion: WEEKDAY_VERSION, reviewedAt: firstAt, thresholdExceeded: true },
    };
    const second = weekdayRollbackReview(`${content}\n${JSON.stringify(priorReview)}`, firstAt + 7 * DAY_MS);
    expect(second).toMatchObject({ maturePairCount: 28, thresholdExceeded: true, rollbackSuggested: true });

    const only27 = fixture(rows.slice(1, 28));
    expect(weekdayRollbackReview(only27, firstAt).rollbackSuggested).toBe(false);
  });
});
