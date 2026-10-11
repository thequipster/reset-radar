/** 公告源 active_watch 的可信度门控；不在这里推断或补全上游概率。 */
export type WatchSignalState = "absent" | "active" | "expired" | "future" | "invalid" | "source-unavailable";

export interface WatchSignalAssessment {
  state: WatchSignalState;
  percent: number | null;
  level: "elevated" | "strong" | null;
  observedAt: string | null;
  expiresAt: string | null;
}

// 来源：codex-cockpit/src-tauri/src/reset_forecast.rs:8,246-265；时钟容差，不是模型调参。
const FUTURE_TOLERANCE_MS = 5 * 60_000;
const EMPTY = (state: WatchSignalState): WatchSignalAssessment => ({
  state, percent: null, level: null, observedAt: null, expiresAt: null,
});

/** 仅接收带时区的完整 ISO 日期时间，且拒绝 Date.parse 会宽松归一化的非法日期。 */
function parseIsoWithZone(value: unknown): { timestamp: number; normalized: string } | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) return null;
  if (zone !== "Z") {
    const zoneHour = Number(zone.slice(1, 3)), zoneMinute = Number(zone.slice(4, 6));
    if (zoneHour > 23 || zoneMinute > 59) return null;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return { timestamp, normalized: new Date(timestamp).toISOString() };
}

/**
 * 校验上游 active_watch。5 分钟未来容差沿用 Rust reset_forecast 的历史清洗边界，
 * 仅用于时钟偏差验证，不构成新的风险模型参数。
 * 真值出处：codex-cockpit/src-tauri/src/reset_forecast.rs:8, 246-265。
 */
export function assessWatchSignal(raw: unknown, now: Date, sourceAvailable = true): WatchSignalAssessment {
  if (!sourceAvailable) return EMPTY("source-unavailable");
  if (raw === null) return EMPTY("absent");
  if (typeof raw !== "object" || Array.isArray(raw)) return EMPTY("invalid");
  const watch = raw as Record<string, unknown>;
  const level = watch.level;
  if (level !== "elevated" && level !== "strong") return EMPTY("invalid");

  const hasPercent = Object.prototype.hasOwnProperty.call(watch, "reset_chance_percent");
  const rawPercent = watch.reset_chance_percent;
  if (hasPercent && rawPercent !== null && (typeof rawPercent !== "number" || !Number.isFinite(rawPercent) || rawPercent < 0 || rawPercent > 100)) {
    return EMPTY("invalid");
  }
  const observed = parseIsoWithZone(watch.observed_at);
  const expires = parseIsoWithZone(watch.expires_at);
  const nowMs = now.getTime();
  if (!observed || !expires || !Number.isFinite(nowMs)) return EMPTY("invalid");
  if (observed.timestamp > nowMs + FUTURE_TOLERANCE_MS) return EMPTY("future");
  if (expires.timestamp <= observed.timestamp) return EMPTY("invalid");
  if (expires.timestamp <= nowMs) return EMPTY("expired");
  return {
    state: "active",
    percent: typeof rawPercent === "number" ? rawPercent : null,
    level,
    observedAt: observed.normalized,
    expiresAt: expires.normalized,
  };
}
