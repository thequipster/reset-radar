// RR56：规划 worker 调度——同签名复用、缓存命中不开 worker、收起面板不打断进行中的任务。
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PlanningInput, PlanningOutput } from '../../lib/v3/planning';
const react = vi.hoisted(() => ({ effect: null as null | (() => void | (() => void)), setState: vi.fn() }));
vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => { react.effect = effect; },
  useState: () => [{ signature: null, result: null, error: null }, react.setState],
}));
import { cancelPlanningJob, clearPlanningCache, recallPlanning, useV3Planning } from '../useV3Planning';
import { planningSignature } from '../planningSignature';
class TestWorker {
  static instances: TestWorker[] = [];
  static get last() { return TestWorker.instances[TestWorker.instances.length - 1]!; }
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminate = vi.fn(); postMessage = vi.fn();
  constructor() { TestWorker.instances.push(this); }
}
const store = new Map<string, string>();
beforeEach(() => {
  react.setState.mockClear(); TestWorker.instances = [];
  vi.stubGlobal('Worker', TestWorker);
  vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } } });
  clearPlanningCache(); cancelPlanningJob(); store.clear();
});
afterEach(() => { cancelPlanningJob(); vi.unstubAllGlobals(); });
const base = { now: Date.parse('2026-10-12T02:03:04Z'), inputSnapshotId: 'worker-test@1', reviews: [Date.parse('2026-10-12T02:03:04Z')], account: { observedAt: Date.parse('2026-10-12T02:00:00Z'), weekly: { remaining: 37.25, resetsAt: Date.parse('2026-10-15T00:00:00Z'), durationMins: 10080 }, short: { remaining: 80, resetsAt: Date.parse('2026-10-12T05:00:00Z'), durationMins: 300 }, availableCardCount: 1 } } as unknown as PlanningInput;
function run(input: PlanningInput, enabled = true) { useV3Planning(input, { enabled }); const cleanup = react.effect!(); return { worker: TestWorker.last, cleanup }; }
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

it('posts the input once and copies the result back, caching it by signature', async () => {
  const { worker } = run(base); expect(worker.postMessage).toHaveBeenCalledWith(base);
  const result = { modelVersion: 'test' } as unknown as PlanningOutput;
  worker.onmessage!({ data: { result } } as MessageEvent); await flush();
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(react.setState).toHaveBeenCalledWith({ signature: planningSignature(base), result, error: null });
  worker.onerror!({ message: 'late' } as ErrorEvent); await flush();
  expect(react.setState).toHaveBeenCalledOnce();
  expect(recallPlanning(planningSignature(base))).toBe(result);
  expect(store.get('rr.planning.cache.v1')).toContain('"modelVersion":"test"');
});
it.each(['message', 'error'])('releases the worker on %s failure', async (kind) => {
  const { worker } = run(base);
  if (kind === 'message') worker.onmessage!({ data: { error: 'failed' } } as MessageEvent);
  else worker.onerror!({ message: 'failed' } as ErrorEvent);
  await flush();
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(react.setState).toHaveBeenCalledWith({ signature: planningSignature(base), result: null, error: 'failed' });
});
it('a materially identical input (new seed, +4 min, +0.004 pt) reuses the running job instead of restarting', () => {
  const first = run(base);
  const twin = { ...base, inputSnapshotId: 'worker-test@2', now: base.now + 4 * 60_000, reviews: [base.now + 4 * 60_000], account: { ...base.account, weekly: { ...base.account.weekly, remaining: 37.254 } } };
  expect(planningSignature(twin)).toBe(planningSignature(base));
  run(twin);
  expect(TestWorker.instances).toHaveLength(1);
  expect(first.worker.terminate).not.toHaveBeenCalled();
});
it('a different signature cancels the stale job and ignores its late result', async () => {
  const first = run(base);
  const changed = { ...base, account: { ...base.account, availableCardCount: 2 } };
  const second = run(changed);
  expect(first.worker.terminate).toHaveBeenCalledOnce();
  first.worker.onmessage!({ data: { result: { modelVersion: 'stale' } } } as MessageEvent); await flush();
  expect(react.setState).not.toHaveBeenCalled();
  second.worker.onmessage!({ data: { result: { modelVersion: 'fresh' } } } as MessageEvent); await flush();
  expect(react.setState).toHaveBeenCalledWith({ signature: planningSignature(changed), result: { modelVersion: 'fresh' }, error: null });
});
it('cache hits never spawn a worker, and enabled=false neither starts nor interrupts', async () => {
  const { worker, cleanup } = run(base);
  if (typeof cleanup === 'function') cleanup(); // 面板收起
  run(base, false); // 收起态重跑 effect：不新开 worker，也不终止旧的
  expect(TestWorker.instances).toHaveLength(1); expect(worker.terminate).not.toHaveBeenCalled();
  worker.onmessage!({ data: { result: { modelVersion: 'bg' } } } as MessageEvent); await flush();
  react.setState.mockClear(); TestWorker.instances = [];
  run(base, true);
  expect(TestWorker.instances).toHaveLength(0);
  expect(react.setState).toHaveBeenCalledWith({ signature: planningSignature(base), result: { modelVersion: 'bg' }, error: null });
  run({ ...base, account: { ...base.account, availableCardCount: 3 } }, false);
  expect(TestWorker.instances).toHaveLength(0);
});
it('coarser buckets fold a 50-minute drift into one signature; finer buckets do not', () => {
  const later = { ...base, now: base.now + 50 * 60_000, reviews: [base.now + 50 * 60_000] };
  expect(planningSignature(later, 60 * 60_000)).toBe(planningSignature(base, 60 * 60_000));
  expect(planningSignature(later)).not.toBe(planningSignature(base));
});
