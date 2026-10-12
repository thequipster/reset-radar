export type PredictionTargetV3 = "platform_notice" | "account_external_reset" | "demand";

export interface PredictionRecordV3 {
  id: string;
  issuedAt: number;
  target: PredictionTargetV3;
  windowStart: number;
  windowEnd: number;
  probability: number | null;
  modelVersion: string;
  trainingCutoff: number;
  inputSnapshotId: string;
  platformHistorySnapshotId?: string;
  cardLedgerVersion: string;
  preferenceVersion: string;
  featureContributions: unknown[];
  assumptions: string[];
  evidenceQuality: string[];
}

export interface PlanningJournalRecord {
  id: string;
  predictionId: string;
  seed: number;
  candidates: unknown[];
  selected: unknown;
  alternatives: unknown[];
}

export type PredictionOutcome = "pending" | "positive" | "negative" | "censored" | "unknown";

export interface SignalVersion<T = unknown> {
  observedAt: string;
  firstSeenAt: string;
  change: "first_seen" | "changed" | "cancelled";
  value: T | null;
}

/** First-seen belongs to one active episode; cancellation remains the final row of the old episode. */
export function nextSignalVersion<T>(
  previous: SignalVersion<T> | null,
  value: T | null,
  observedAt: string,
): SignalVersion<T> | null {
  if (previous && JSON.stringify(previous.value) === JSON.stringify(value)) return null;
  if (!previous && value == null) return null;
  const identity=(v:T|null):unknown=>v&&typeof v==='object'?'id' in v?v.id:null:null;
  const newEpisode = previous == null || previous.value == null ||
    (value!=null&&identity(value)!=null&&identity(previous.value)!=null&&identity(value)!==identity(previous.value));
  return {
    observedAt,
    firstSeenAt: newEpisode ? observedAt : previous.firstSeenAt,
    change: newEpisode ? "first_seen" : value == null ? "cancelled" : "changed",
    value,
  };
}

export function predictionGroupAt(issuedAt: number, hasPrimaryForTargetAndVersion: boolean): {
  group: "primary_daily" | "temporary";
  groupDate?: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(issuedAt);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const groupDate = `${part("year")}-${part("month")}-${part("day")}`;
  if (part("hour") === "09" && part("minute") === "00" && !hasPrimaryForTargetAndVersion) {
    return { group: "primary_daily", groupDate };
  }
  return { group: "temporary" };
}

export interface OutcomeEvidence {
  completeCoverage: boolean;
  platformNotice?: boolean;
  accountReset?: "hit" | "miss" | "unobservable" | "ambiguous";
  /** User intervention censors account replenishment, but never platform-notice outcomes. */
  cardUsedAt?: number;
}

function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function freezePrediction(input: PredictionRecordV3): PredictionRecordV3 {
  if (!input.id || !input.modelVersion || !input.inputSnapshotId || !input.cardLedgerVersion || !input.preferenceVersion) {
    throw new Error("prediction journal requires stable IDs and versions");
  }
  if (![input.issuedAt, input.windowStart, input.windowEnd, input.trainingCutoff].every(Number.isFinite) ||
      input.windowEnd <= input.windowStart || input.windowStart > input.issuedAt ||
      (input.probability != null && (!Number.isFinite(input.probability) || input.probability < 0 || input.probability > 1))) {
    throw new RangeError("prediction journal has an invalid time window or probability");
  }
  return deepCopy(input);
}

export function freezePlanning(input: PlanningJournalRecord): PlanningJournalRecord {
  if (!input.id || !input.predictionId || !Number.isSafeInteger(input.seed)) {
    throw new Error("planning journal requires IDs and a reproducible integer seed");
  }
  return deepCopy(input);
}

export function classifyOutcome(record: PredictionRecordV3, evidence: OutcomeEvidence): PredictionOutcome {
  if (record.target === "demand") return "unknown";
  if (record.target === "platform_notice") {
    if (!evidence.completeCoverage) return "pending";
    return evidence.platformNotice ? "positive" : "negative";
  }
  if (evidence.cardUsedAt != null && evidence.cardUsedAt >= record.windowStart && evidence.cardUsedAt <= record.windowEnd) {
    return "censored";
  }
  if (!evidence.completeCoverage) return "pending";
  if (evidence.accountReset === "hit") return "positive";
  if (evidence.accountReset === "miss") return "negative";
  return "unknown";
}
