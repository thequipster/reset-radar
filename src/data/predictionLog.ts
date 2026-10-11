// RR15数据IO薄壳：读→调用纯核心→CAS追加；并发冲突重读，业务阈值不复制。
import { appendPredictionLog, type PredictionRecord, type AppendOutcome } from "../lib/predictions.ts";

export interface PredictionLogPort {
  read(): Promise<{ path: string; content: string }>;
  append(expectedContent: string, line: string): Promise<"appended" | "conflict" | "busy">;
}
export interface PredictionWriteResult {
  path: string;
  appended: boolean;
  reason: AppendOutcome["reason"];
}

export async function persistPrediction(port: PredictionLogPort, candidate: PredictionRecord,
  pause: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 150)),
): Promise<PredictionWriteResult> {
  // D025：最多5次短暂竞争重试（总等待至多600ms），绝不永久等待锁。
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await port.read();
    const outcome = appendPredictionLog(current.content.split(/\r?\n/).filter((line) => line.trim()), candidate);
    if (!outcome.appended) return { path: current.path, appended: false, reason: outcome.reason };
    const result = await port.append(current.content, outcome.lines[outcome.lines.length - 1]!);
    if (result === "appended") return { path: current.path, appended: true, reason: outcome.reason };
    if (attempt < 4) await pause();
  }
  throw new Error("预测日志被其他写者占用或持续变化，请在下一次刷新后重试。");
}
