// RR28→RR27 接线：只读校准摘要 hook。读取脚本生成的应用目录 calibration.json
// （read_calibration_summary 只回原文，校验在 src/lib/calibrationSummary.ts）。
// 浏览器环境无摘要（missing）；后台刷新事件后重读一次（快照可能被脚本更新）。
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { parseCalibrationSummary, type CalibrationSummaryView } from "../lib";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface CalibrationSummaryState {
  view: CalibrationSummaryView;
  /** 摘要文件路径（missing 时为 null；诊断用）。 */
  path: string | null;
}

export function useCalibrationSummary(): CalibrationSummaryState {
  const [state, setState] = useState<CalibrationSummaryState>(() => ({
    view: { status: "missing" },
    path: null,
  }));

  const read = useCallback(() => {
    invoke<{ path: string; content: string }>("read_calibration_summary")
      .then((result) => {
        setState({ view: parseCalibrationSummary(result?.content), path: result?.path ?? null });
      })
      .catch(() => {
        setState((prev) => ({ ...prev, view: { status: "invalid" } }));
      });
  }, []);

  useEffect(() => {
    if (!isTauri()) return; // 浏览器保持 missing（不伪造摘要）
    read();
    let disposed = false;
    listen<unknown>("background-snapshots-updated", () => {
      if (!disposed) read();
    })
      .then((unlisten) => {
        if (disposed) unlisten();
      })
      .catch(() => {
        /* 订阅失败保持上次摘要；UI 由快照侧横幅统一提示 */
      });
    return () => {
      disposed = true;
    };
  }, [read]);

  return state;
}
