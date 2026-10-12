// RR18：历史事件只按已确认的重置类型与数据抓取时刻参与核心计算。
// RR45：追加 v2 事件流入口——公开夹具的公告执行按平台口径（scope=global）进状态机。

import type { ResetEvent } from "./resetState.ts";

/** RR18：BACKLOG.md §RR18 将历史新鲜度阈值定为 7 天。 */
export const HISTORY_STALE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export type HistoryFreshnessState = "fresh" | "stale" | "invalid";

export interface HistoryFreshness {
  state: HistoryFreshnessState;
  fetchedAt: string | null;
  asOf: string | null;
  ageDays: number | null;
}

export interface HistorySourceAssessment extends HistoryFreshness {
  totalEvents: number | null;
  quotaResetEvents: number | null;
  excludedEvents: number | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isoEpoch(value: unknown): number | null {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const second = Number(value.slice(17, 19));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? epoch : null;
}

/** 仅保留合法 regular 事件；按时间戳精确去重并由新到旧返回规范 ISO 时刻。 */
export function selectQuotaResetHistory(events: readonly unknown[]): string[] {
  const timestamps = new Set<number>();
  for (const event of events) {
    const item = record(event);
    if (item?.resetType !== "regular") continue;
    const epoch = isoEpoch(item.announcedAt);
    if (epoch !== null) timestamps.add(epoch);
  }
  return [...timestamps].sort((left, right) => right - left).map((epoch) => new Date(epoch).toISOString());
}

/** 公告执行 ISO 串（RR03 夹具口径）→ v2 平台口径事件流（scope=global，RR45 D033）。
 *  事件 id 以原 ISO 串为锚：同参重放得到同一事件流，与账号实时观测按时间戳去重有稳定键。 */
export function historyEvents(history: readonly string[]): ResetEvent[] {
  const events: ResetEvent[] = [];
  for (const iso of history) {
    const at = Date.parse(iso);
    if (!Number.isFinite(at)) continue;
    events.push({
      id: `history-${iso}`,
      kind: "announced",
      occurredAt: at,
      timePrecision: "exact",
      scope: "global",
      source: "resets-history",
    });
  }
  return events;
}

/** 以明确传入的 now 评估抓取年龄；无效或未来时间不退回墙钟。 */
export function evaluateHistoryFreshness(fetchedAt: unknown, now: Date): HistoryFreshness {
  const fetchedMs = isoEpoch(fetchedAt);
  const nowMs = now instanceof Date ? now.getTime() : NaN;
  if (fetchedMs === null || !Number.isFinite(nowMs) || fetchedMs > nowMs) {
    return { state: "invalid", fetchedAt: null, asOf: null, ageDays: null };
  }
  const ageDays = (nowMs - fetchedMs) / DAY_MS;
  return {
    state: ageDays > HISTORY_STALE_DAYS ? "stale" : "fresh",
    fetchedAt: new Date(fetchedMs).toISOString(),
    asOf: new Date(fetchedMs).toISOString(),
    ageDays,
  };
}

/** 组合夹具结构、抓取时效与事件筛选计数，供报告与消费者共用。 */
export function assessHistorySource(document: unknown, now: Date): HistorySourceAssessment {
  const source = record(document);
  const freshness = evaluateHistoryFreshness(source?.fetchedAt, now);
  if (!Array.isArray(source?.events)) {
    return { ...freshness, state: "invalid", totalEvents: null, quotaResetEvents: null, excludedEvents: null };
  }
  const totalEvents = source.events.length;
  const quotaResetEvents = selectQuotaResetHistory(source.events).length;
  return {
    ...freshness,
    totalEvents,
    quotaResetEvents,
    excludedEvents: totalEvents - quotaResetEvents,
  };
}
