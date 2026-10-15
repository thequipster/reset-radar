// RR56：规划 worker 的调度层。算法本身（planActions）一字未改；改的是“什么时候跑”：
//  1. 同一实质签名（planningSignature）直接复用结果——内存 LRU + localStorage 持久化，
//     重启应用也不必先烧 20 秒 CPU。
//  2. enabled=false（面板收起且结果仍新鲜）时不开 worker。
//  3. 正在跑的 worker 若新输入签名相同，不打断。
import { useEffect, useState } from "react";
import type { PlanningInput, PlanningOutput } from "../lib/v3/planning";
import { planningSignature } from "./planningSignature";

export const PLANNING_CACHE_KEY = "rr.planning.cache.v1";
const MEMORY_LIMIT = 12;
const PERSIST_LIMIT = 6;
const PERSIST_BYTES_LIMIT = 400_000;

type CacheEntry = { signature: string; result: PlanningOutput; savedAt: number };
const memory = new Map<string, CacheEntry>();
let persistedLoaded = false;

function storage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage ?? null; } catch { return null; }
}

function loadPersisted(): void {
  if (persistedLoaded) return;
  persistedLoaded = true;
  const store = storage();
  if (!store) return;
  try {
    const raw = store.getItem(PLANNING_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { entries?: CacheEntry[] };
    for (const entry of parsed.entries ?? []) {
      if (entry && typeof entry.signature === "string" && entry.result && typeof entry.savedAt === "number") memory.set(entry.signature, entry);
    }
  } catch { /* 损坏的缓存只影响下次冷启动速度 */ }
}

function persist(): void {
  const store = storage();
  if (!store) return;
  const entries = [...memory.values()].sort((a, b) => b.savedAt - a.savedAt).slice(0, PERSIST_LIMIT);
  try {
    let payload = JSON.stringify({ entries });
    while (payload.length > PERSIST_BYTES_LIMIT && entries.length > 1) { entries.pop(); payload = JSON.stringify({ entries }); }
    store.setItem(PLANNING_CACHE_KEY, payload);
  } catch { /* 配额不足时放弃持久化，内存缓存照常 */ }
}

/** 测试与故障排查用：清空两级缓存。 */
export function clearPlanningCache(): void {
  memory.clear();
  persistedLoaded = false;
  try { storage()?.removeItem(PLANNING_CACHE_KEY); } catch { /* ignore */ }
}

export function rememberPlanning(signature: string, result: PlanningOutput, now: number = Date.now()): void {
  memory.delete(signature);
  memory.set(signature, { signature, result, savedAt: now });
  while (memory.size > MEMORY_LIMIT) {
    const oldest = memory.keys().next().value;
    if (oldest == null) break;
    memory.delete(oldest);
  }
  persist();
}

export function recallPlanning(signature: string): PlanningOutput | null {
  loadPersisted();
  const hit = memory.get(signature);
  if (!hit) return null;
  memory.delete(signature);
  memory.set(signature, hit); // LRU 触达
  return hit.result;
}

export interface PlanningScheduleOptions {
  /** false ⇒ 不启动新的 worker（已有缓存命中仍直接返回；进行中的任务不会被打断）。 */
  enabled?: boolean;
  /** 签名的时间粒度（展开 15 分钟 / 收起 60 分钟）。 */
  bucketMs?: number;
}

type JobOutcome = { result: PlanningOutput | null; error: string | null };
type Job = { signature: string; worker: Worker; promise: Promise<JobOutcome>; settle: (outcome: JobOutcome) => void; done: boolean };
let currentJob: Job | null = null;

/** 全局单飞：同签名复用进行中的任务；不同签名则取消旧任务（过时建议不该覆盖新输入）。 */
function startJob(signature: string, input: PlanningInput): Job {
  if (currentJob && !currentJob.done && currentJob.signature === signature) return currentJob;
  if (currentJob && !currentJob.done) currentJob.settle({ result: null, error: null }); // settle 内部终止 worker
  let settle!: (outcome: JobOutcome) => void;
  const promise = new Promise<JobOutcome>((resolve) => { settle = resolve; });
  const worker = new Worker(new URL("./v3Planning.worker.ts", import.meta.url), { type: "module" });
  const job: Job = { signature, worker, promise, settle: () => undefined, done: false };
  job.settle = (outcome) => { if (job.done) return; job.done = true; worker.terminate(); if (outcome.result) rememberPlanning(signature, outcome.result); settle(outcome); if (currentJob === job) currentJob = null; };
  worker.onmessage = (event: MessageEvent<{ result?: PlanningOutput; error?: string }>) => job.settle({ result: event.data.result ?? null, error: event.data.error ?? null });
  worker.onerror = (event) => job.settle({ result: null, error: event.message });
  worker.postMessage(input);
  currentJob = job;
  return job;
}

/** 测试用：取消进行中的任务。 */
export function cancelPlanningJob(): void {
  if (currentJob && !currentJob.done) currentJob.settle({ result: null, error: null });
  currentJob = null;
}

export function useV3Planning(input: PlanningInput | null, options: PlanningScheduleOptions = {}) {
  const enabled = options.enabled ?? true;
  const signature = input == null ? null : planningSignature(input, options.bucketMs);
  const [state, setState] = useState<{ signature: string | null; result: PlanningOutput | null; error: string | null }>({ signature: null, result: null, error: null });
  useEffect(() => {
    if (!input || signature == null) return;
    const cached = recallPlanning(signature);
    if (cached) { setState({ signature, result: cached, error: null }); return; }
    const inFlight = currentJob != null && !currentJob.done && currentJob.signature === signature;
    if (!enabled && !inFlight) return;
    let active = true;
    void startJob(signature, input).promise.then((outcome) => {
      if (!active) return;
      if (outcome.result == null && outcome.error == null) return; // 被更新的输入取消：等待新签名的结果。
      setState({ signature, result: outcome.result, error: outcome.error });
    });
    return () => { active = false; }; // 不终止 worker：收起面板时让它算完并进缓存。
  }, [signature, enabled]); // eslint-disable-line react-hooks/exhaustive-deps -- input 只在签名变化时才需要重投
  const fresh = signature != null && state.signature === signature;
  // 签名刚切换（新桶 / 输入变化）时沿用上一份结论：mergeV31Planning 会用新鲜的 coldContext 重新核对
  // 卡片与截止，过时的比较只会让"用卡"更保守，不会凭空建议已不存在的卡；pending 提示界面"正在重算"。
  return { result: signature == null ? null : state.result, error: fresh ? state.error : null, pending: signature != null && !fresh, signature };
}
