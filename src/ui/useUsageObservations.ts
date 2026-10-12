// RR46 观测 IO 接线：真实成功快照只追加一次；需求聚合来自纯核心。
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { aggregateDailyUsage, parseUsageObservations, type UsageObservation } from "../lib/usageObservations";
import type { DailyUsageSample } from "../lib/plannerV2";
import type { ProviderSnapshot } from "./types";
import type { DashboardViewModel } from "./adapters";

const EMPTY_SAMPLES: DailyUsageSample[] = [];
type Log = { path: string; content: string };
async function appendOnce(kind: "usage" | "cards", row: { id: string; observedAt: string }): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const log = await invoke<Log>("read_observation_log", { kind });
    if (log.content.split(/\r?\n/).some((line) => { try { return JSON.parse(line).id === row.id; } catch { return false; } })) return log.content;
    const result = await invoke<string>("append_observation_log", { kind, expectedContent: log.content, line: JSON.stringify(row) });
    if (result === "appended") return `${log.content}${log.content && !log.content.endsWith("\n") ? "\n" : ""}${JSON.stringify(row)}\n`;
    if (result === "busy") throw new Error("观测日志正在写入，请等待下次刷新");
  }
  throw new Error("观测日志更新冲突，将在下次刷新重试");
}

export function useUsageObservations(snapshot: ProviderSnapshot | null, live: boolean) {
  const [state, setState] = useState<{ accountKey: string | null; samples: DailyUsageSample[]; error: string | null }>({ accountKey: null, samples: [], error: null });
  const tail = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    if (!live || !snapshot?.accountKey) { setState({ accountKey: null, samples: [], error: null }); return; }
    let disposed = false;
    const accountKey = snapshot.accountKey;
    const observedAt = snapshot.rateLimitSnapshot?.observedAt ?? snapshot.updatedAt;
    const window = snapshot.weeklyWindow;
    tail.current = tail.current.catch(() => {}).then(async () => {
      let content: string;
      if (snapshot.status === "ok" && window?.resetsAt && Number.isFinite(Date.parse(window.resetsAt))) {
        const row: UsageObservation = { id: `u-${accountKey}-${observedAt}`, observedAt, accountKey,
          remainingPercent: window.remainingPercent, resetsAt: window.resetsAt };
        content = await appendOnce("usage", row);
      } else content = (await invoke<Log>("read_observation_log", { kind: "usage" })).content;
      if (!disposed) setState({ accountKey, samples: aggregateDailyUsage(parseUsageObservations(content), accountKey, Date.now()), error: null });
    }).catch((error: unknown) => { if (!disposed) setState({ accountKey, samples: [], error: String(error) }); });
    return () => { disposed = true; };
  }, [snapshot?.updatedAt, snapshot?.accountKey, live]);
  return { samples: state.accountKey === snapshot?.accountKey ? state.samples : EMPTY_SAMPLES, error: state.error };
}

export function useCardDecisionLog(vm: DashboardViewModel | null, snapshot: ProviderSnapshot | null, live: boolean) {
  const [error, setError] = useState<string | null>(null);
  const signature = vm?.cardPlan == null ? null : JSON.stringify([vm.cardPlan.decision, vm.cardPlan.recommendedAt, vm.cardPlan.incrementalUsage]);
  useEffect(() => {
    if (!live || !snapshot?.accountKey || !vm?.cardPlan || !vm.prediction || snapshot.status !== "ok") return;
    let disposed = false;
    const row = { id: `c-${snapshot.accountKey}-${snapshot.updatedAt}-${signature}`, observedAt: vm.observedAt,
      accountKey: snapshot.accountKey, inputSnapshotId: vm.prediction.inputSnapshotId,
      trainingDataCutoff: vm.prediction.trainingDataCutoff, modelVersion: vm.risk.modelVersion,
      stateBeforePrediction: vm.prediction.stateBeforePrediction, dataQuality: vm.risk.quality, ...vm.cardPlan };
    appendOnce("cards", row).then(() => { if (!disposed) setError(null); }, (failure: unknown) => { if (!disposed) setError(String(failure)); });
    return () => { disposed = true; };
  }, [snapshot?.updatedAt, snapshot?.accountKey, signature, live]);
  return error;
}
