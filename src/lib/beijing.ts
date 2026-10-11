// 北京时间（UTC+8）日边界与星期判定：全项目唯一入口（D004：一律 +8h 后取星期/日键，绝不用本地时区）。
// v2 规格 §1：时间使用 UTC 时间戳，仅星期和日键按北京时间计算。

export const BEIJING_OFFSET_MS = 8 * 3_600_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

const pad2 = (v: number): string => String(v).padStart(2, "0");

/** UTC 时间戳 → 北京时间日键（YYYY-MM-DD）。 */
export function beijingDayKey(ms: number): string {
  const shifted = new Date(ms + BEIJING_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

/**
 * 北京时间日键 → 该日北京 00:00 对应的 UTC 时间戳；非法键（含 2026-02-31 之类溢出）返回 null。
 * 注意：日级事件取「北京零点」只代表「这一天内」，绝不把正午当成真实发生时刻（规格 §2 规则 6）。
 */
export function beijingDayStart(key: string): number | null {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (matched == null) return null;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const utcMidnight = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const at = utcMidnight - BEIJING_OFFSET_MS;
  if (!Number.isFinite(at) || beijingDayKey(at) !== key) return null;
  return at;
}

/** UTC 时间戳 → 北京星期（0=周日 … 6=周六）。 */
export function beijingWeekday(ms: number): number {
  return new Date(ms + BEIJING_OFFSET_MS).getUTCDay();
}

/** UTC 时间戳 → 该时刻在北京日内已过的小时数（0–24，浮点）。 */
export function beijingHoursIntoDay(ms: number): number {
  const into = (ms + BEIJING_OFFSET_MS) % DAY_MS;
  return (into < 0 ? into + DAY_MS : into) / HOUR_MS;
}

/** UTC 时间戳 → 该时刻所属北京日的起始时间戳。 */
export function beijingDayFloor(ms: number): number {
  return ms - beijingHoursIntoDay(ms) * HOUR_MS;
}
