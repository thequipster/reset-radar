// RR27：展示层格式化（纯函数）。时间一律显式北京时区（02-spec §6：禁止截 ISO 串再标
// “北京+8”）；null 与 0 严格区分（周余 — vs 0%）。UI 零业务规则：只换算显示，不产生数字。

const BEIJING_TZ = "Asia/Shanghai";

/** ISO 时刻 → 「MM/DD HH:mm」北京时间（跨日含日期；同年省年份）。非法/空返回 null。 */
export function beijingShort(iso: string | null | undefined): string | null {
  const ms = Date.parse(iso ?? "");
  if (!Number.isFinite(ms)) return null;
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: BEIJING_TZ, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

/** ISO 时刻 → 「YYYY/MM/DD HH:mm:ss」北京时间（完整观测时刻用）。 */
export function beijingFull(iso: string | null | undefined): string | null {
  const ms = Date.parse(iso ?? "");
  if (!Number.isFinite(ms)) return null;
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: BEIJING_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

/** 北京日历日期键 YYYY-MM-DD → 「周X MM/DD」（候选日轴标签；键本身即北京语义）。 */
export function weekdayDateLabel(dateKey: string): string {
  const ms = Date.parse(`${dateKey}T12:00:00Z`);
  if (!Number.isFinite(ms)) return dateKey;
  const weekday = new Intl.DateTimeFormat("zh-CN", { timeZone: BEIJING_TZ, weekday: "short" }).format(new Date(ms));
  const short = beijingShort(new Date(ms).toISOString());
  return short != null ? `${weekday} ${short.slice(0, 5)}` : dateKey;
}

/** 0-100 数值 → 整数百分比字符串；null → "—"（不写 0%，02-spec §6 零缺失严格区分）。 */
export function percentWhole(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : `${Math.round(value)}%`;
}

/** 0-100 数值 → 一位小数百分比；null → "—"。 */
export function percent1(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`;
}

/** 百分点 delta → 带符号一位小数（如 +8.7 / −1.2；非 ASCII 减号与图稿一致）。 */
export function deltaPct(value: number): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(1)}`;
}

/** 卡数显示：null → "卡 —"，0 → "卡 ×0"（02-spec §3.2：不照搬 cardPlan.credits 默认零）。 */
export function creditsLabel(credits: number | null | undefined): string {
  return credits == null ? "卡 —" : `卡 ×${credits}`;
}

/** 天数（可小数）→ 一位小数“天”。 */
export function daysLabel(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)} 天`;
}
