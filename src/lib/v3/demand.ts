import { beijingDayFloor, DAY_MS } from "../beijing";
import type { DemandDay } from "./observations";
export type { DemandDay } from "./observations";

export type Workload = "light" | "normal" | "busy" | "unknown";

export interface WorkloadChoice {
  dateKey: string;
  workload: Workload;
}

export interface DemandDistribution {
  sampleDays: number;
  p20: number;
  median: number;
  p80: number;
  p95: number;
}

export interface WorkloadScenario {
  value: number | null;
  low: number | null;
  high: number | null;
  source: "experience" | "learning";
}

export interface GroupDemandDistribution extends DemandDistribution {
  fallbackToAll: boolean;
}

export interface DemandModel {
  status: "learning" | "preliminary" | "estimated";
  sampleDays: number;
  choiceCount: number;
  weekly: DemandDistribution | null;
  shortWindowPaired: DemandDistribution | null;
  workload: Record<Workload, WorkloadScenario>;
  workloadGroups: Record<Exclude<Workload, "unknown">, GroupDemandDistribution>;
  budgetScenarios: Array<{ multiplier: 0.5 | 1 | 2; weeklyBudget: number; probability: null }>;
  thresholds: { preliminary: 7; established: 14; rollingDays: 28; workloadGroup: 7 };
}

const isValidDay = (day: DemandDay, cutoffDay: number): boolean => {
  const start = Date.parse(`${day.dateKey}T00:00:00Z`) - 8 * 60 * 60_000;
  return Number.isFinite(start) && start >= cutoffDay - 28 * DAY_MS && start < cutoffDay &&
    day.weeklyComplete && day.weeklyCoverage >= 1 && day.weeklyCost != null &&
    Number.isFinite(day.weeklyCost) && day.weeklyCost >= 0 &&
    !day.weeklyLowerBound && !(day.weeklyCrossedReset ?? day.crossedReset) &&
    !(day.weeklyEstimated ?? day.estimated) && !day.capacityConstrained;
};

function quantile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const position = (values.length - 1) * p;
  const lower = Math.floor(position), upper = Math.ceil(position);
  if (lower === upper) return values[lower]!;
  return values[lower]! + (values[upper]! - values[lower]!) * (position - lower);
}

function distribution(values: readonly number[]): DemandDistribution {
  const sorted = [...values].sort((a, b) => a - b);
  return { sampleDays: sorted.length, p20: quantile(sorted, 0.2), median: quantile(sorted, 0.5),
    p80: quantile(sorted, 0.8), p95: quantile(sorted, 0.95) };
}

function emptyScenario(): WorkloadScenario {
  return { value: null, low: null, high: null, source: "learning" };
}

export function fitDemandModel(
  observations: readonly DemandDay[],
  choices: readonly WorkloadChoice[],
  cutoff: number,
  config: { weeklyBudget?: number } = {},
): DemandModel {
  const cutoffDay = beijingDayFloor(cutoff);
  const eligible = observations.filter((day) => isValidDay(day, cutoffDay))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey)).slice(-28);
  const eligibleDates = new Set(eligible.map((day) => day.dateKey));
  const weeklyValues = eligible.map((day) => day.weeklyCost as number);
  const weekly = weeklyValues.length > 0 ? distribution(weeklyValues) : null;
  const shortValues = eligible.filter((day) => day.shortComplete && day.shortCoverage >= 1 && day.shortCost != null &&
    Number.isFinite(day.shortCost) && day.shortCost >= 0 && !day.shortLowerBound &&
    !day.shortCrossedReset && !day.shortEstimated)
    .map((day) => day.shortCost as number);
  const shortWindowPaired = shortValues.length >= 7 ? distribution(shortValues) : null;
  const choiceByDate = new Map(choices.filter((choice) => choice.workload !== "unknown")
    .map((choice) => [choice.dateKey, choice.workload]));
  const workloadGroups = {} as DemandModel["workloadGroups"];
  const workload = {} as DemandModel["workload"];

  for (const label of ["light", "normal", "busy"] as const) {
    const ownValues = eligible.filter((day) => choiceByDate.get(day.dateKey) === label)
      .map((day) => day.weeklyCost as number);
    const fallbackToAll = ownValues.length < 7;
    const values = fallbackToAll ? weeklyValues : ownValues;
    const groupDistribution = distribution(values);
    workloadGroups[label] = { ...groupDistribution, fallbackToAll };
  }
  const getGroup = (label: "light" | "normal" | "busy") => workloadGroups[label];
  const scenarios: Record<"light" | "normal" | "busy", WorkloadScenario> = {
    light: { value: weekly ? getGroup("light").p20 : null, low: weekly ? getGroup("light").p20 : null,
      high: weekly ? getGroup("light").median : null, source: weekly ? "experience" : "learning" },
    normal: { value: weekly ? getGroup("normal").median : null, low: weekly ? getGroup("normal").p20 : null,
      high: weekly ? getGroup("normal").p80 : null, source: weekly ? "experience" : "learning" },
    busy: { value: weekly ? getGroup("busy").p80 : null, low: weekly ? getGroup("busy").median : null,
      high: weekly ? getGroup("busy").p95 : null, source: weekly ? "experience" : "learning" },
  };
  workload.light = scenarios.light;
  workload.normal = scenarios.normal;
  workload.busy = scenarios.busy;
  workload.unknown = { value: null, low: weekly?.p20 ?? null, high: weekly?.p80 ?? null,
    source: weekly ? "experience" : "learning" };

  const weeklyBudget = config.weeklyBudget;
  const budgetScenarios = Number.isFinite(weeklyBudget) && (weeklyBudget as number) >= 0
    ? ([0.5, 1, 2] as const).map((multiplier) => ({ multiplier,
        weeklyBudget: (weeklyBudget as number) * multiplier, probability: null as null }))
    : [];
  return {
    status: eligible.length >= 7 ? "estimated" : eligible.length > 0 ? "preliminary" : "learning",
    sampleDays: eligible.length,
    choiceCount: choices.filter((choice) => choice.workload !== "unknown" && eligibleDates.has(choice.dateKey)).length,
    weekly, shortWindowPaired, workload, workloadGroups, budgetScenarios,
    thresholds: { preliminary: 7, established: 14, rollingDays: 28, workloadGroup: 7 },
  };
}
