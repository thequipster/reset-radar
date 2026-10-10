// 重置历史接线（RR09）：读取 RR03 采集夹具 data/resets-history.json（数据锁：只读）。
// UI 零业务规则：这里只做形状提取（events[].announcedAt），风险计算全部在 src/lib。
import historyFixture from "../../data/resets-history.json";

interface HistoryEvent {
  announcedAt: string;
}

/**
 * 已清洗的 announcedAt ISO 串列表（最新事件 2025-11-22，assessResetRisk 输入契约）。
 * 夹具由 scripts/fetch-history.mjs 生成（RR03）；正式滚动更新由后续数据卡接管。
 */
export const RESET_HISTORY_ANNOUNCED_AT: readonly string[] = (
  historyFixture.events as HistoryEvent[]
)
  .map((event) => event.announcedAt)
  .filter((value) => typeof value === "string");
