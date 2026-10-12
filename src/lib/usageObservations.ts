// RR46 日耗观测：原始行只追加，日聚合只在 TS 核心计算。
// 完整日要求覆盖两个北京午夜、采样间隔不超过后台5分钟的三倍。
// 跨午夜差值按时长分摊是观测近似；回满/周期变化区间不猜消耗。
import { beijingDayFloor, beijingDayKey, DAY_MS } from "./beijing";
import type { DailyUsageSample } from "./plannerV2";

export const MAX_OBSERVATION_GAP_MS = 15 * 60_000;
export interface UsageObservation {
  id: string;
  observedAt: string;
  accountKey: string;
  remainingPercent: number;
  resetsAt: string;
}

export function parseUsageObservations(content: string): UsageObservation[] {
  return content.split(/\r?\n/).flatMap((line) => {
    try {
      const row = JSON.parse(line);
      return typeof row.id === "string" && typeof row.accountKey === "string" && row.accountKey.length > 0 &&
        Number.isFinite(Date.parse(row.observedAt)) && Number.isFinite(Date.parse(row.resetsAt)) &&
        Number.isFinite(row.remainingPercent) && row.remainingPercent >= 0 && row.remainingPercent <= 100
        ? [row as UsageObservation] : [];
    } catch { return []; }
  });
}

export function aggregateDailyUsage(rows: readonly UsageObservation[], accountKey: string | null, now: number): DailyUsageSample[] {
  if (!accountKey) return [];
  const sorted = [...new Map(rows.filter((row) => row.accountKey === accountKey && Date.parse(row.observedAt) <= now)
    .map((row) => [row.observedAt, row])).values()].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  if (sorted.length < 2) return [];
  const samples: DailyUsageSample[] = [];
  const firstDay = beijingDayFloor(Date.parse(sorted[0].observedAt));
  const cutoff = beijingDayFloor(now);
  for (let start = Math.max(firstDay, cutoff - 28 * DAY_MS); start < cutoff; start += DAY_MS) {
    const end = start + DAY_MS;
    let covered = 0;
    let used = 0;
    let exhausted = false;
    let valid = true;
    for (let index = 1; index < sorted.length; index++) {
      const previous = sorted[index - 1], current = sorted[index];
      const from = Date.parse(previous.observedAt), to = Date.parse(current.observedAt);
      const overlap = Math.max(0, Math.min(end, to) - Math.max(start, from));
      if (!overlap) continue;
      const delta = previous.remainingPercent - current.remainingPercent;
      if (to - from > MAX_OBSERVATION_GAP_MS || previous.resetsAt !== current.resetsAt || delta < 0 ||
          Date.parse(previous.resetsAt) <= to) { valid = false; break; }
      covered += overlap;
      used += delta * overlap / (to - from);
      if (current.remainingPercent === 0) exhausted = true;
    }
    // 缺采/停机/日界缺失不填零；今天尚未结束也不进入需求估计。
    if (valid && covered === DAY_MS) samples.push({
      dateKey: beijingDayKey(start), usedPercent: used,
      // 没看到0不等于没有耗尽；省略 exhausted 保留需求下界不确定性。
      ...(exhausted ? { exhausted: true } : {}),
    });
  }
  return samples;
}
