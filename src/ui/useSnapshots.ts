// 快照接线 hook（RR09 → RR27 生命周期重做，02-spec §7.2）：初始化中/空返回/读取错误/
// 手动刷新 in-flight 全部显式化；事件订阅失败独立横幅，不清空已有数据。
// 浏览器环境优雅降级 demo（携带演示标识）。UI 层零业务规则：数字仍只来自 VM。
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ProviderSnapshot } from "./types";
import { demoSnapshot } from "./demoScenarios";

/** Tauri v2 注入检测（浏览器 vite dev 下无此全局 → demo 降级）。 */
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type SnapshotPhase = "initializing" | "ready" | "empty" | "read-error";

export interface SnapshotsState {
  snapshots: ProviderSnapshot[];
  /** true = Tauri 实数据；false = 浏览器 demo 降级（界面必须带演示标识）。 */
  live: boolean;
  phase: SnapshotPhase;
  /** 读取失败的可读原因（phase=read-error 时非空）。 */
  readError: string | null;
  /** 后台事件订阅失败（数据仍可显示，独立横幅“自动更新不可用”）。 */
  subscriptionError: boolean;
  /** 手动刷新 in-flight（只在此已知在飞时显示刷新标识，02-spec §5）。 */
  refreshing: boolean;
  refresh: () => void;
}

export function useSnapshots(): SnapshotsState {
  const [state, setState] = useState<SnapshotsState>(() =>
    isTauri()
      ? {
          snapshots: [], live: true, phase: "initializing", readError: null,
          subscriptionError: false, refreshing: false, refresh: () => {},
        }
      : {
          snapshots: [demoSnapshot()], live: false, phase: "ready", readError: null,
          subscriptionError: false, refreshing: false, refresh: () => {},
        },
  );
  const refreshInFlight = useRef(false);

  const apply = useCallback((values: ProviderSnapshot[]) => {
    setState((prev) => ({
      ...prev,
      snapshots: Array.isArray(values) ? values : prev.snapshots,
      phase: Array.isArray(values) && values.length > 0 ? "ready" : "empty",
      readError: null,
    }));
  }, []);

  const refresh = useCallback(() => {
    if (!isTauri() || refreshInFlight.current) return; // in-flight 防连点（02-spec §2）
    refreshInFlight.current = true;
    setState((prev) => ({ ...prev, refreshing: true }));
    invoke<ProviderSnapshot[]>("refresh_snapshots")
      .then((values) => {
        apply(values);
        setState((prev) => ({ ...prev, refreshing: false }));
      })
      .catch((error: unknown) => {
        // 手动刷新失败：保留旧值并给出可读原因（02-spec §6「后续读取失败、有旧快照」）。
        setState((prev) => ({
          ...prev,
          refreshing: false,
          phase: prev.snapshots.length > 0 ? prev.phase : "read-error",
          readError: String((error as { message?: string })?.message ?? error),
        }));
      })
      .finally(() => {
        refreshInFlight.current = false;
      });
  }, [apply]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | null = null;
    let eventRevision = 0;
    invoke<ProviderSnapshot[]>("get_snapshots")
      .then((values) => {
        if (!disposed && eventRevision === 0) apply(values);
      })
      .catch((error: unknown) => {
        if (disposed) return;
        setState((prev) => ({
          ...prev,
          phase: "read-error",
          readError: String((error as { message?: string })?.message ?? error),
        }));
      });
    listen<ProviderSnapshot[]>("background-snapshots-updated", (event) => {
      if (disposed) return;
      eventRevision++;
      apply(event.payload);
    })
      .then((unsubscribe) => {
        if (disposed) unsubscribe();
        else unlisten = unsubscribe;
      })
      .catch(() => {
        // 订阅失败但读取已有结果：数据保留，横幅提示（02-spec §6）。
        if (!disposed) setState((prev) => ({ ...prev, subscriptionError: true }));
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [apply]);

  return { ...state, refresh };
}
