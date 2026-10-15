// RR56：规划输入的“实质签名”（纯函数）。同一签名 ⇒ 256 路径蒙特卡洛结论可以复用，
// 不必再花 18–32 s 重跑。签名刻意忽略 inputSnapshotId（它只决定随机种子，每 5 分钟刷新一次
// 就变）与 platformModel.events（规划只读聚合速率与 lastEventAt）；所有时间戳按桶取整，
// 其余数字取 4 位有效数字——这就是“输入没有实质变化”的定义。
import type { PlanningInput } from "../lib/v3/planning";
import { MODEL_BUCKET_MS, modelBucketStart } from "./modelClock";

/** 大于此值的数字视为毫秒时间戳（约 1973 年之后），按桶取整。 */
const TIMESTAMP_FLOOR = 1e11;

function normalizeNumber(value: number, bucketMs: number): number | string {
  if (!Number.isFinite(value)) return String(value);
  if (Math.abs(value) >= TIMESTAMP_FLOOR) return modelBucketStart(value, bucketMs);
  return Number(value.toPrecision(4));
}

function canonical(value: unknown, bucketMs: number): unknown {
  if (value == null) return null;
  if (typeof value === "number") return normalizeNumber(value, bucketMs);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => canonical(item, bucketMs));
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    if (record[key] === undefined) continue;
    out[key] = canonical(record[key], bucketMs);
  }
  return out;
}

/**
 * 规划输入签名。`bucketMs` 控制时间粒度：面板展开时 15 分钟，收起时 60 分钟——
 * 收起态只有迷你圆/悬浮条在看建议，一小时内复用同一份蒙特卡洛结论足够。
 */
export function planningSignature(input: PlanningInput, bucketMs: number = MODEL_BUCKET_MS): string {
  const { inputSnapshotId: _seedOnly, platformModel, ...material } = input;
  void _seedOnly;
  const model = platformModel == null ? platformModel : { ...platformModel, events: undefined };
  return JSON.stringify(canonical({ ...material, platformModel: model, bucketMs }, bucketMs));
}
