// RR15：React只触发生产记录IO，业务候选和幂等判断来自src/lib。
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { persistPrediction, type PredictionLogPort } from "../data/predictionLog";
import type { PredictionRecord } from "../lib";

const port: PredictionLogPort = {
  read: () => invoke("read_prediction_log"),
  append: (expectedContent, line) => invoke("append_prediction_log", { expectedContent, line }),
};
export interface PredictionLogState {
  status: "idle" | "writing" | "ok" | "error";
  path: string | null;
  message: string | null;
}
export function usePredictionLog(candidate: PredictionRecord | null, live: boolean, revision: string): PredictionLogState {
  const [state, setState] = useState<PredictionLogState>({ status: "idle", path: null, message: null });
  // fetchedAt是记录执行时间，不作为依赖；避免setState渲染生成新时间导致写入循环。
  const signature = candidate == null ? null : JSON.stringify([candidate.date, candidate.predictedRisk, candidate.factorsDigest]);
  useEffect(() => {
    if (!live || !candidate) { setState({ status: "idle", path: null, message: null }); return; }
    let disposed = false;
    setState((previous) => ({ ...previous, status: "writing", message: null }));
    persistPrediction(port, candidate).then((result) => {
      if (!disposed) setState({ status: "ok", path: result.path, message: null });
    }).catch((error: unknown) => {
      if (!disposed) setState((previous) => ({ ...previous, status: "error", message: String(error) }));
    });
    return () => { disposed = true; };
  }, [signature, live, revision]);
  return state;
}
