import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  effects: [] as Array<() => unknown>, refs: [] as Array<{ current: any }>, refIndex: 0,
  logs: { usage: '', cards: '' }, failWeekday: false,
}));

vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => unknown) => { state.effects.push(fn); },
  useRef: (initial: unknown) => {
    const index = state.refIndex++;
    return state.refs[index] ??= { current: initial };
  },
  useState: (initial: unknown) => [initial, () => undefined],
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string, args: Record<string, any>) => {
    if (command === 'read_observation_log') return { path: args.kind, content: state.logs[args.kind as 'usage' | 'cards'] };
    if (command !== 'append_observation_log') throw new Error(`unexpected invoke ${command}`);
    const kind = args.kind as 'usage' | 'cards';
    if (state.logs[kind] !== args.expectedContent) return 'conflict';
    const row = JSON.parse(args.line);
    if (kind === 'cards' && state.failWeekday && row.kind === 'prediction' && row.record?.modelVersion === 'platform-v3.2:D60-W28-BJT-shadow') return 'busy';
    state.logs[kind] += `${state.logs[kind] && !state.logs[kind].endsWith('\n') ? '\n' : ''}${args.line}\n`;
    return 'appended';
  },
}));

import { useV3Journal } from '../useV3Journal';
import { evaluateWeekdayJournal, weekdayExperiment } from '../../lib/v3/weekdayEvaluation';
import { WEEKDAY_VERSION } from '../../lib/v3/weekday';
import { DAY_MS } from '../../lib/v3/platform';
import type { PredictionRecordV3 } from '../../lib/v3/journal';

const issuedAt = Date.parse('2026-10-12T09:00:00+08:00');
const matureAt = issuedAt + DAY_MS + 3_600_000;
const historyDocument = {
  fetchedAt: new Date(matureAt).toISOString(), coverageThrough: new Date(matureAt).toISOString(),
  snapshotId: 'history-snapshot-a', events: [{ id: 'old-event', resetType: 'regular', announcedAt: issuedAt - DAY_MS }],
  upstream: { pagination: { has_more: false, next_cursor: null } },
};

function prediction(id: string, modelVersion: string, probability: number, historySnapshotId = 'history-snapshot-a', at = issuedAt): PredictionRecordV3 {
  return {
    id, issuedAt: at, target: 'platform_notice', windowStart: at, windowEnd: at + DAY_MS,
    probability, modelVersion, trainingCutoff: at, inputSnapshotId: 'input-1', platformHistorySnapshotId: historySnapshotId,
    cardLedgerVersion: 'ledger-1', preferenceVersion: 'preference-1', featureContributions: [], assumptions: [], evidenceQuality: ['complete'],
  };
}

function journal(enabled = false, restart = false) {
  state.refIndex = 0; state.effects = [];
  if (restart) state.refs = [];
  return useV3Journal(null, enabled);
}

async function seedHistory() {
  const row = { id: 'history-row', observedAt: historyDocument.fetchedAt, kind: 'platform_history', document: historyDocument };
  const content = state.logs.cards;
  await vi.mocked((await import('@tauri-apps/api/core')).invoke)('append_observation_log', {
    kind: 'cards', expectedContent: content, line: JSON.stringify(row),
  });
}

async function settleWithRealEffect() {
  const hook = journal(true);
  expect(state.effects.length).toBeGreaterThanOrEqual(1);
  state.effects[0]!();
  const writer = state.refs[1]?.current as Promise<unknown> | undefined;
  await writer;
  return hook;
}

const rows = () => state.logs.cards.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

describe('useV3Journal 星期影子日志与结算', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(issuedAt);
    state.logs = { usage: '', cards: '' }; state.failWeekday = false; state.effects = []; state.refs = []; state.refIndex = 0;
  });

  it('D60/W28同group与冻结tuple存盘，注册只一次，重复刷新及重启不制造primary样本', async () => {
    await seedHistory();
    let api = journal();
    const p0 = prediction('p0', 'platform-v3:P0', .2);
    await api.appendPrediction(p0);
    const frozenPrefix = state.logs.cards;
    const d60 = prediction('d60', 'platform-v3.1:D60', .25);
    const weekday = prediction('weekday', WEEKDAY_VERSION, .3);
    expect(await api.appendWeekdayPair(d60, weekday)).toEqual({ error: null });

    const first = rows(), d = first.find(row => row.record?.id === 'd60')!, w = first.find(row => row.record?.id === 'weekday')!;
    expect(state.logs.cards.startsWith(frozenPrefix)).toBe(true);
    expect(d.group).toBe('primary_daily'); expect(w.group).toBe(d.group);
    expect(w.groupDate).toBe(d.groupDate);
    for (const key of ['issuedAt', 'trainingCutoff', 'windowStart', 'windowEnd', 'platformHistorySnapshotId']) {
      expect(w.record[key]).toBe(d.record[key]);
    }
    expect(first.filter(row => row.kind === 'weekday_experiment' && row.record?.modelVersion === WEEKDAY_VERSION)).toHaveLength(1);

    expect(await api.appendWeekdayPair(d60, weekday)).toEqual({ error: null });
    api = journal(false, true); // 模拟hook卸载/重启，CAS日志保留。
    expect(await api.appendWeekdayPair(d60, weekday)).toEqual({ error: null });
    const after = rows();
    expect(after.filter(row => row.kind === 'weekday_experiment' && row.record?.modelVersion === WEEKDAY_VERSION)).toHaveLength(1);
    expect(after.filter(row => row.kind === 'prediction' && row.group === 'primary_daily' &&
      [d60.modelVersion, WEEKDAY_VERSION].includes(row.record?.modelVersion))).toHaveLength(2);
    expect(after.filter(row => row.kind === 'prediction' && row.record?.id === 'weekday')).toHaveLength(1);
  });

  it('非09:00预测只进temporary，不进入星期配对样本', async () => {
    await seedHistory();
    const at = issuedAt + 60 * 60_000, api = journal();
    expect(await api.appendWeekdayPair(prediction('d60-temp', 'platform-v3.1:D60', .25, undefined, at),
      prediction('weekday-temp', WEEKDAY_VERSION, .3, undefined, at))).toEqual({ error: null });
    const saved = rows().filter(row => row.kind === 'prediction' && ['d60-temp', 'weekday-temp'].includes(row.record?.id));
    expect(saved.map(row => row.group)).toEqual(['temporary', 'temporary']);
    expect(evaluateWeekdayJournal(state.logs.cards, at + DAY_MS).matchedCount).toBe(0);
    expect(evaluateWeekdayJournal(state.logs.cards, at + DAY_MS).temporaryCount).toBe(2);
  });

  it('成熟窗口通过真实settlement effect追加W28 verdict并形成有效配对', async () => {
    await seedHistory();
    const api = journal();
    await api.appendWeekdayPair(prediction('d60-mature', 'platform-v3.1:D60', .25), prediction('weekday-mature', WEEKDAY_VERSION, .3));
    vi.setSystemTime(matureAt);
    await settleWithRealEffect();
    const verdicts = rows().filter(row => row.kind === 'verdict' && row.predictionId === 'weekday-mature');
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].modelVersion).toBe(WEEKDAY_VERSION);
    expect(verdicts[0].outcome).toBe('negative');
    const evaluated = evaluateWeekdayJournal(state.logs.cards, matureAt);
    expect(evaluated.matchedCount).toBe(1);
    expect(evaluated.pairs[0]).toMatchObject({ d60: .25, weekday: .3, label: 0, historySnapshotId: 'history-snapshot-a' });
  });

  it('不同history snapshot的同日预测不配对', async () => {
    const api = journal();
    const registration = weekdayExperiment(issuedAt);
    const content = state.logs.cards;
    await vi.mocked((await import('@tauri-apps/api/core')).invoke)('append_observation_log', {
      kind: 'cards', expectedContent: content, line: JSON.stringify(registration),
    });
    await api.appendPrediction(prediction('d60-history-a', 'platform-v3.1:D60', .25, 'history-a'));
    await api.appendPrediction(prediction('weekday-history-b', WEEKDAY_VERSION, .3, 'history-b'));
    const evaluated = evaluateWeekdayJournal(state.logs.cards, issuedAt + DAY_MS);
    expect(evaluated.matchedCount).toBe(0);
    expect(evaluated.missingPairCount).toBe(2);
  });

  it('候选写入失败时保留D60并记录fault，后续刷新停写候选', async () => {
    await seedHistory();
    const api = journal(), d60 = prediction('d60-fault', 'platform-v3.1:D60', .25), weekday = prediction('weekday-fault', WEEKDAY_VERSION, .3);
    state.failWeekday = true;
    const failed = await api.appendWeekdayPair(d60, weekday);
    expect(failed.error).toContain('观测日志正在写入');
    let saved = rows();
    expect(saved.some(row => row.kind === 'prediction' && row.record?.id === d60.id && row.record.probability === .25)).toBe(true);
    expect(saved.some(row => row.kind === 'prediction' && row.record?.id === weekday.id)).toBe(false);
    expect(saved.filter(row => row.kind === 'weekday_fault' && row.modelVersion === WEEKDAY_VERSION)).toHaveLength(1);

    state.failWeekday = false;
    const second = await api.appendWeekdayPair(prediction('d60-later', 'platform-v3.1:D60', .26), prediction('weekday-later', WEEKDAY_VERSION, .31));
    expect(second.error).toContain('此前已停写');
    saved = rows();
    expect(saved.some(row => row.kind === 'prediction' && row.record?.id === 'd60-later')).toBe(true);
    expect(saved.some(row => row.kind === 'prediction' && row.record?.id === 'weekday-later')).toBe(false);
  });
});
