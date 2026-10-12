// RR43 迷你圆「唯一数字」的选取与格式化（纯函数，域测试锁定）。
// ARCHITECTURE §2：数字一律取自 adapters 视图模型（源头 src/lib），本文件不做任何业务判断，
// 只负责「选哪个数 + 怎么排版」——颜色/填充代表风险，圆心里是你要的那一个数。
import type { DashboardViewModel } from "./adapters";

export type OrbMetric = "pace" | "risk" | "remaining";

export const ORB_METRICS: readonly { key: OrbMetric; label: string; hint: string }[] = [
  { key: "pace", label: "今日建议配速", hint: "今天照这个量用，重置前刚好花完" },
  { key: "risk", label: "24h 重置风险", hint: "未来 24 小时被强制重置的概率" },
  { key: "remaining", label: "周额度剩余", hint: "本周配额还剩多少" },
];

/** 默认显示配速：风险由圆环颜色表达，圆心留给“今天该怎么办”这个可执行的数。 */
export const DEFAULT_ORB_METRIC: OrbMetric = "pace";

export function isOrbMetric(value: string): value is OrbMetric {
  return ORB_METRICS.some((metric) => metric.key === value);
}

/** 右键轮换：pace → risk → remaining → pace。 */
export function nextOrbMetric(current: OrbMetric): OrbMetric {
  const index = ORB_METRICS.findIndex((metric) => metric.key === current);
  return ORB_METRICS[(index + 1) % ORB_METRICS.length].key;
}

export type RiskBand = "unknown" | "low" | "mid" | "high";

/** 风险分档阈值 30/60：与 Capsule.riskColor、DashboardPanel 风险徽章同口径（RR09 既有展示约定）。 */
export function riskBand(score: number | null): RiskBand {
  if (score == null || !Number.isFinite(score)) return "unknown";
  if (score < 30) return "low";
  if (score < 60) return "mid";
  return "high";
}

export interface OrbReadout {
  metric: OrbMetric;
  /** 圆心数字（不含单位）；无数据显示占位符。 */
  value: string;
  /** 极小号单位后缀，"" 表示不画。 */
  unit: string;
  /** 无障碍/悬浮说明：label + 数字 + 语义。 */
  title: string;
  /** 圆环填充比例 0-100（风险分）；null = 无风险数据，只画空轨。 */
  percent: number | null;
  /** 圆环颜色档位。 */
  band: RiskBand;
  /** 数字是否可用（不可用时不画数字，只留圆环）。 */
  hasValue: boolean;
}

const EMPTY_VALUE = "—";

/** 视图模型 + 指标 → 迷你圆读数。vm 为 null（空/加载中）时给出诚实的空态。 */
export function orbReadout(vm: DashboardViewModel | null, metric: OrbMetric): OrbReadout {
  const meta = ORB_METRICS.find((item) => item.key === metric) ?? ORB_METRICS[0];
  const score = vm?.riskPercent ?? null;
  const band = riskBand(score);
  const percent = score == null || !Number.isFinite(score) ? null : Math.min(100, Math.max(0, score));

  let value = EMPTY_VALUE;
  let unit = "";
  let hasValue = false;

  if (metric === "pace") {
    // v2：需求未知时 todaySuggested=null（诚实空态，不代入固定配速）。
    const suggested = vm?.dailyPlan?.todaySuggested;
    if (suggested != null && Number.isFinite(suggested)) {
      value = suggested.toFixed(1);
      hasValue = true;
    }
  } else if (metric === "risk") {
    if (score != null && Number.isFinite(score)) {
      value = score.toFixed(1);
      unit = "%";
      hasValue = true;
    }
  } else {
    const remaining = vm?.remainingPercent;
    if (remaining != null && Number.isFinite(remaining)) {
      value = String(Math.round(remaining));
      unit = "%";
      hasValue = true;
    }
  }

  const shown = hasValue ? `${value}${unit}` : EMPTY_VALUE;
  return {
    metric,
    value,
    unit,
    title: `${meta.label} ${shown}（${meta.hint}）`,
    percent,
    band,
    hasValue,
  };
}
