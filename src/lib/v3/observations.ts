import { beijingDayFloor, beijingDayKey, DAY_MS } from "../beijing";

export const DEFAULT_MAX_OBSERVATION_GAP_MS = 15 * 60_000;

export interface WindowSnapshotV3 {
  /** Identity of the provider window; usually its resetsAt value plus a local generation counter. */
  generation: string;
  usedPercent: number;
}

export interface SnapshotV3 {
  id: string;
  /** ISO timestamp as persisted; epoch milliseconds are accepted by pure callers. */
  observedAt: string | number;
  accountKey: string;
  sourceVersion: string;
  weekly: WindowSnapshotV3 | null;
  short: WindowSnapshotV3 | null;
  schemaVersion?: 3;
  rawSnapshot?: unknown;
}

export interface WindowUsageEvidence {
  generation: string;
  previousGeneration: string;
  nextGeneration: string;
  knownConsumption: number;
  coverageMs: number;
  crossedReset: boolean;
  isLowerBound: boolean;
  capacityConstrained: boolean;
}

export interface UsageObservation {
  id: string;
  accountKey: string;
  fromAt: number;
  toAt: number;
  sourceVersion: string;
  weekly: WindowUsageEvidence | null;
  short: WindowUsageEvidence | null;
}

export interface DemandDay {
  dateKey: string;
  weeklyCost: number | null;
  weeklyCoverage: number;
  weeklyComplete: boolean;
  weeklyLowerBound: boolean;
  shortCost: number | null;
  shortCoverage: number;
  shortComplete: boolean;
  shortLowerBound: boolean;
  crossedReset: boolean;
  weeklyCrossedReset: boolean;
  shortCrossedReset: boolean;
  estimated: boolean;
  weeklyEstimated: boolean;
  shortEstimated: boolean;
  capacityConstrained: boolean;
}

const timestamp = (value: string | number): number => typeof value === "number" ? value : Date.parse(value);

const validSnapshot = (snapshot: SnapshotV3): boolean =>
  typeof snapshot.id === "string" && snapshot.id.length > 0 &&
  typeof snapshot.accountKey === "string" && snapshot.accountKey.length > 0 &&
  Number.isFinite(timestamp(snapshot.observedAt)) &&
  [snapshot.weekly, snapshot.short].some((window) => window != null);

function windowEvidence(
  previous: WindowSnapshotV3 | null,
  next: WindowSnapshotV3 | null,
  duration: number,
): WindowUsageEvidence | null {
  if (previous == null || next == null ||
      !Number.isFinite(previous.usedPercent) || !Number.isFinite(next.usedPercent) ||
      previous.usedPercent < 0 || next.usedPercent < 0 || previous.usedPercent > 100 || next.usedPercent > 100 ||
      !previous.generation || !next.generation) return null;
  const crossedReset = previous.generation !== next.generation || next.usedPercent < previous.usedPercent;
  const capacityConstrained = previous.usedPercent >= 100 || next.usedPercent >= 100;
  return {
    generation: previous.generation === next.generation ? previous.generation : `${previous.generation}->${next.generation}`,
    previousGeneration: previous.generation,
    nextGeneration: next.generation,
    // A rollover hides usage before the new generation; never turn its net drop into a negative cost.
    knownConsumption: crossedReset ? 0 : Math.max(0, next.usedPercent - previous.usedPercent),
    coverageMs: duration,
    crossedReset,
    isLowerBound: crossedReset || capacityConstrained,
    capacityConstrained,
  };
}

export function buildUsageObservations(
  snapshots: readonly SnapshotV3[],
  maxGapMs = DEFAULT_MAX_OBSERVATION_GAP_MS,
): UsageObservation[] {
  const byAccount = new Map<string, SnapshotV3[]>();
  for (const snapshot of snapshots) {
    if (!validSnapshot(snapshot)) continue;
    const accountRows = byAccount.get(snapshot.accountKey) ?? [];
    accountRows.push(snapshot);
    byAccount.set(snapshot.accountKey, accountRows);
  }
  const result: UsageObservation[] = [];
  for (const [accountKey, rows] of byAccount) {
    rows.sort((a, b) => timestamp(a.observedAt) - timestamp(b.observedAt) || a.id.localeCompare(b.id));
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1]!, next = rows[index]!;
      const fromAt = timestamp(previous.observedAt), toAt = timestamp(next.observedAt);
      const duration = toAt - fromAt;
      if (duration <= 0 || duration > maxGapMs) continue;
      const weekly = windowEvidence(previous.weekly, next.weekly, duration);
      const short = windowEvidence(previous.short, next.short, duration);
      if (weekly == null && short == null) continue;
      result.push({ id: `${accountKey}:${previous.id}:${next.id}`, accountKey,
        fromAt, toAt,
        sourceVersion: next.sourceVersion,
        weekly, short });
    }
  }
  return result.sort((a, b) => a.fromAt - b.fromAt || a.accountKey.localeCompare(b.accountKey));
}

interface MutableWindowDay {
  cost: number;
  coverageMs: number;
  lowerBound: boolean;
  crossedReset: boolean;
  capacityConstrained: boolean;
  estimated: boolean;
  generations: Set<string>;
  ranges: Array<{ from: number; to: number }>;
}

function newWindowDay(): MutableWindowDay {
  return { cost: 0, coverageMs: 0, lowerBound: false, crossedReset: false,
    capacityConstrained: false, estimated: false, generations: new Set(), ranges: [] };
}

function addWindowEvidence(
  days: Map<number, { weekly: MutableWindowDay; short: MutableWindowDay }>,
  observation: UsageObservation,
  evidence: WindowUsageEvidence | null,
  kind: "weekly" | "short",
): void {
  if (evidence == null) return;
  const duration = observation.toAt - observation.fromAt;
  if (duration <= 0) return;
  let dayStart = beijingDayFloor(observation.fromAt);
  while (dayStart < observation.toAt) {
    const dayEnd = dayStart + DAY_MS;
    const overlap = Math.max(0, Math.min(dayEnd, observation.toAt) - Math.max(dayStart, observation.fromAt));
    if (overlap > 0) {
      let day = days.get(dayStart);
      if (!day) { day = { weekly: newWindowDay(), short: newWindowDay() }; days.set(dayStart, day); }
      const target = day[kind];
      target.cost += evidence.knownConsumption * overlap / duration;
      target.coverageMs += overlap;
      target.lowerBound ||= evidence.isLowerBound;
      target.crossedReset ||= evidence.crossedReset;
      target.capacityConstrained ||= evidence.capacityConstrained;
      target.estimated ||= observation.fromAt < dayStart || observation.toAt > dayEnd;
      target.generations.add(evidence.generation);
      target.ranges.push({ from: Math.max(dayStart, observation.fromAt), to: Math.min(dayEnd, observation.toAt) });
    }
    dayStart = dayEnd;
  }
}

function dayComplete(window: MutableWindowDay): boolean {
  if (window.coverageMs !== DAY_MS || window.crossedReset || window.lowerBound || window.capacityConstrained || window.generations.size !== 1) return false;
  const sorted = [...window.ranges].sort((a, b) => a.from - b.from);
  let cursor = sorted[0]?.from;
  if (cursor == null) return false;
  const start = cursor;
  for (const range of sorted) {
    if (range.from > cursor) return false;
    cursor = Math.max(cursor, range.to);
  }
  return start === sorted[0]!.from && cursor - start === DAY_MS && start === beijingDayFloor(start);
}

export function aggregateUsageDays(observations: readonly UsageObservation[], cutoff: number): DemandDay[] {
  if (!Number.isFinite(cutoff)) return [];
  const days = new Map<number, { weekly: MutableWindowDay; short: MutableWindowDay }>();
  for (const observation of observations) {
    if (observation.toAt > cutoff) continue;
    addWindowEvidence(days, observation, observation.weekly, "weekly");
    addWindowEvidence(days, observation, observation.short, "short");
  }
  const todayStart = beijingDayFloor(cutoff);
  return [...days.entries()].filter(([start]) => start < todayStart).sort(([a], [b]) => a - b).map(([start, windows]) => {
    const weeklyComplete = dayComplete(windows.weekly);
    const shortComplete = dayComplete(windows.short);
    return {
      dateKey: beijingDayKey(start),
      weeklyCost: windows.weekly.coverageMs > 0 ? windows.weekly.cost : null,
      weeklyCoverage: Math.min(1, windows.weekly.coverageMs / DAY_MS),
      weeklyComplete,
      weeklyLowerBound: windows.weekly.lowerBound || windows.weekly.capacityConstrained,
      shortCost: windows.short.coverageMs > 0 ? windows.short.cost : null,
      shortCoverage: Math.min(1, windows.short.coverageMs / DAY_MS),
      shortComplete,
      shortLowerBound: windows.short.lowerBound || windows.short.capacityConstrained,
      // Legacy aggregate quality fields describe weekly demand. A short-window
      // re-anchor is common and must not invalidate otherwise complete weekly evidence.
      crossedReset: windows.weekly.crossedReset,
      weeklyCrossedReset: windows.weekly.crossedReset,
      shortCrossedReset: windows.short.crossedReset,
      estimated: windows.weekly.estimated,
      weeklyEstimated: windows.weekly.estimated,
      shortEstimated: windows.short.estimated,
      capacityConstrained: windows.weekly.capacityConstrained || windows.short.capacityConstrained,
    };
  });
}
