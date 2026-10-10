// 快照接线 hook（RR09）：Tauri invoke + 后台刷新事件监听；纯浏览器环境优雅降级 demo。
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ProviderSnapshot } from "./types";

/** Tauri v2 注入检测（浏览器 vite dev 下无此全局 → demo 降级）。 */
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * 浏览器降级演示快照：数值取 RR08 冒烟实测落盘样本（plan=PLUS/周窗 29%/credits 3），
  仅用于 `npm run dev` 无 Tauri 时的界面预览，不参与任何测试断言。
 */
function demoSnapshot(): ProviderSnapshot {
  const now = new Date();
  const weeklyResetsAt = new Date(
    Math.ceil((now.getTime() + 2 * 86_400_000) / 86_400_000) * 86_400_000,
  ).toISOString();
  return {
    provider: "codex",
    displayName: "CODEX",
    plan: "PLUS",
    weeklyWindow: {
      remainingPercent: 29,
      resetsAt: weeklyResetsAt,
      windowSeconds: 604_800,
    },
    shortWindow: {
      remainingPercent: 64,
      resetsAt: null,
      windowSeconds: 3600,
    },
    resetCredits: 3,
    rateLimitSnapshot: {
      source: "app-server",
      usedPercent: 71,
      windowDurationMins: 10_080,
      resetsAt: weeklyResetsAt,
      observedAt: now.toISOString(),
    },
    updatedAt: now.toISOString(),
    status: "ok",
    message: null,
  };
}

export interface SnapshotsState {
  snapshots: ProviderSnapshot[];
  /** true = Tauri 实数据；false = 浏览器 demo 降级。 */
  live: boolean;
}

/** 拉取 get_snapshots 并订阅 background-snapshots-updated（RR08 契约，lib.rs:27）。 */
export function useSnapshots(): SnapshotsState {
  const [state, setState] = useState<SnapshotsState>(() =>
    isTauri()
      ? { snapshots: [], live: true }
      : { snapshots: [demoSnapshot()], live: false },
  );

  useEffect(() => {
    if (!isTauri()) return; // 浏览器环境保持 demo，不触发会失败的调用
    let disposed = false;
    const apply = (values: ProviderSnapshot[]) => {
      if (!disposed && Array.isArray(values) && values.length > 0) {
        setState({ snapshots: values, live: true });
      }
    };
    invoke<ProviderSnapshot[]>("get_snapshots").then(apply).catch(() => {
      /* 采集失败保留空态：UI 展示 unavailable 占位，不崩溃 */
    });
    const unlisten = listen<ProviderSnapshot[]>(
      "background-snapshots-updated",
      (event) => apply(event.payload),
    );
    return () => {
      disposed = true;
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, []);

  return state;
}
