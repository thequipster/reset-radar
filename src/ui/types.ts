// UI 层契约类型：与 src-tauri/src/models.rs 的 serde camelCase 输出一一对应（RR08）。
// UI 层零业务规则（ARCHITECTURE §2）——本文件只描述数据形状，不含任何计算。

/** 用量窗口（周窗/短窗共用）。对应 Rust UsageWindow。 */
export interface UsageWindow {
  remainingPercent: number;
  resetsAt: string | null;
  windowSeconds: number;
}

/** 官方接口原始元数据（对账展示用）。对应 Rust RateLimitSnapshot。 */
export interface RateLimitSnapshot {
  source: string;
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: string | null;
  observedAt: string;
}

/** 单 provider 快照。对应 Rust ProviderSnapshot（v1 裁剪版）。 */
export interface ProviderSnapshot {
  provider: string;
  displayName: string;
  plan: string | null;
  shortWindow: UsageWindow | null;
  weeklyWindow: UsageWindow | null;
  resetCredits: number | null;
  rateLimitSnapshot: RateLimitSnapshot | null;
  updatedAt: string;
  status: string;
  message: string | null;
}
