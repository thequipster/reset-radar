// RR47：个人重置卡台账与输入契约。纯函数只处理用户录入和服务端张数对账；
// 不调用真实用卡接口，不推断缺失的有效期或平台规则（spec-algorithm-v3.md §6/7）。
export const CARD_BUFFER_MS = 30 * 60 * 1000;
export const DEFAULT_VIEW_TIMES = ["09:00", "20:00"] as const;

export type CardEntryPrecision = "datetime" | "date" | "unknown";
export type CardReconciliation = "consistent" | "unverified" | "conflict";
export type ResetCardState = "available" | "used" | "expired-confirmed" | "unresolved";
export type WorkloadLevel = "quiet" | "normal" | "busy" | "unknown";
export type PersonalPreference = "protect-quota" | "use-expiring" | "save-cards";
export type ReminderTier = "48h" | "24h" | "last-chance" | "needs-confirmation";
export type PreferenceFeedback = "appropriate" | "insufficient" | "save-card" | "too-late";

export interface ResetCard {
  localId: string;
  label: string;
  enteredExpiry: string | null;
  entryPrecision: CardEntryPrecision;
  timezone: "Asia/Shanghai";
  exactExpiryAt: number | null;
  safeDeadlineAt: number | null;
  source: "user";
  confirmedAt: number | null;
  reconciliation: CardReconciliation;
  state: ResetCardState;
}

export type CardSnapshot = Omit<ResetCard, "localId">;

export interface CardLedgerVersion {
  id: string;
  localId: string;
  version: number;
  recordedAt: number;
  before: CardSnapshot | null;
  after: CardSnapshot | null;
}

export interface RecordedCardUse {
  id: string;
  localId: string;
  recordedAt: number;
  serverCountAtRecord: number | null;
  status: "user-recorded" | "unresolved";
}

export interface PersonalInputVersion {
  version: number;
  changedAt: number;
  field: "workloadToday" | "preference" | "usualViewTimes" | "viewTimesConfirmed" | "weeklyBudgetPercent" | "feedback" | "continueWorking" | "planningMode";
  before: unknown;
  after: unknown;
}

export interface PersonalInputsData {
  schema: "reset-radar/personal-inputs@3";
  accountKey: string | null;
  version: number;
  cards: ResetCard[];
  cardVersions: CardLedgerVersion[];
  useRecords: RecordedCardUse[];
  feedback: { choice: PreferenceFeedback; recordedAt: number }[];
  inputVersions: PersonalInputVersion[];
  workloadToday: { localDate: string; level: WorkloadLevel } | null;
  preference: PersonalPreference | null;
  usualViewTimes: string[];
  viewTimesConfirmed: boolean;
  weeklyBudgetPercent: { localDate: string; value: number } | null;
  continueWorking?: {localDate:string;value:boolean}|null;
  planningMode?: 'policy_default'|'learned';
}

export interface ReconciledCard {
  localId: string | null;
  label: string;
  card: ResetCard | null;
  placeholder: boolean;
}

export interface CardReconciliationResult {
  status: "unknown" | "consistent" | "supplementing" | "conflict";
  serverCount: number | null;
  trackedCount: number;
  placeholderCount: number;
  planningCount: number | null;
  cards: ReconciledCard[];
  prompt: string | null;
}

export interface CardReminder {
  localId: string;
  tier: ReminderTier;
  lastActionAt: number | null;
  safeDeadlineAt: number | null;
}

export function personalInputsStorageKey(accountKey: string | null): string {
  const scope = accountKey == null || accountKey === "" ? "demo:anonymous" : `account:${accountKey}`;
  return `rr.personal-inputs.v3.${encodeURIComponent(scope)}`;
}

export function emptyPersonalInputs(accountKey: string | null): PersonalInputsData {
  return {
    schema: "reset-radar/personal-inputs@3", accountKey, version: 0, cards: [], cardVersions: [],
    useRecords: [], feedback: [], inputVersions: [], workloadToday: null, preference: null,
    usualViewTimes: [...DEFAULT_VIEW_TIMES], viewTimesConfirmed: false, weeklyBudgetPercent: null,continueWorking:null,planningMode:'policy_default',
  };
}

function beijingDateParts(value: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [year, month, day] = m.slice(1).map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** Parse date/datetime-local in Asia/Shanghai without relying on host timezone. */
export function parseCardExpiry(
  enteredExpiry: string | null,
  precision: CardEntryPrecision,
): { exactExpiryAt: number | null; safeDeadlineAt: number | null } {
  if (enteredExpiry == null || precision === "unknown") return { exactExpiryAt: null, safeDeadlineAt: null };
  if (precision === "date") {
    const parts = beijingDateParts(enteredExpiry);
    if (!parts) throw new Error("请输入有效的北京时间日期");
    const safeDeadlineAt = Date.UTC(parts.year, parts.month - 1, parts.day) - 8 * 60 * 60 * 1000;
    return { exactExpiryAt: null, safeDeadlineAt };
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(enteredExpiry);
  if (!m) throw new Error("请输入有效的北京时间日期和时间");
  const [year, month, day, hour, minute, second = "0", fraction = "0"] = m.slice(1).map((v) => v ?? "0");
  const date = beijingDateParts(`${year}-${month}-${day}`);
  const h = Number(hour); const min = Number(minute); const sec = Number(second);
  if (!date || h > 23 || min > 59 || sec > 59) throw new Error("请输入有效的北京时间日期和时间");
  const millis = Number(fraction.padEnd(3, "0"));
  const exactExpiryAt = Date.UTC(date.year, date.month - 1, date.day, h, min, sec, millis) - 8 * 60 * 60 * 1000;
  return { exactExpiryAt, safeDeadlineAt: exactExpiryAt };
}

export function createResetCard(args: {
  localId: string; label: string; enteredExpiry: string | null; entryPrecision: CardEntryPrecision; now: number;
}): ResetCard {
  const { localId, label, enteredExpiry, entryPrecision, now } = args;
  const parsed = parseCardExpiry(enteredExpiry, entryPrecision);
  return {
    localId, label, enteredExpiry, entryPrecision, ...parsed, timezone: "Asia/Shanghai", source: "user", confirmedAt: now,
    reconciliation: "unverified", state: "available",
  };
}

function cardSnapshot(card: ResetCard): CardSnapshot {
  const { localId: _localId, ...snapshot } = card;
  return snapshot;
}

export function appendCardVersion(
  history: readonly CardLedgerVersion[],
  localId: string,
  before: ResetCard | null,
  after: ResetCard | null,
  now: number,
): CardLedgerVersion[] {
  const version = 1 + history.reduce((max, item) => item.localId === localId ? Math.max(max, item.version) : max, 0);
  return [...history, {
    id: `${localId}:v${version}:${now}`, localId, version, recordedAt: now,
    before: before == null ? null : cardSnapshot(before),
    after: after == null ? null : cardSnapshot(after),
  }];
}

export function updateCardExpiry(
  cards: readonly ResetCard[], history: readonly CardLedgerVersion[], localId: string,
  enteredExpiry: string | null, precision: CardEntryPrecision, now: number,
): { cards: ResetCard[]; history: CardLedgerVersion[] } {
  const before = cards.find((card) => card.localId === localId);
  if (!before) throw new Error("找不到这张重置卡");
  const parsed = parseCardExpiry(enteredExpiry, precision);
  const after: ResetCard = {
    ...before, enteredExpiry, entryPrecision: precision, ...parsed,
    confirmedAt: now, reconciliation: "unverified",
  };
  return {
    cards: cards.map((card) => card.localId === localId ? after : card),
    history: appendCardVersion(history, localId, before, after, now),
  };
}

export function reconcileCardCount(
  cards: readonly ResetCard[], serverCount: number | null,
): CardReconciliationResult {
  const effective = [...cards];
  const tracked = effective.filter((card) => card.state === "available" || (card.state === "unresolved" && card.reconciliation !== "consistent"));
  if (serverCount == null || !Number.isInteger(serverCount) || serverCount < 0) {
    return {
      status: "unknown", serverCount: null, trackedCount: tracked.length, placeholderCount: 0,
      planningCount: null, cards: effective.map((card) => ({ localId: card.localId, label: card.label, card, placeholder: false })), prompt: null,
    };
  }
  const conflict = tracked.length > serverCount;
  const placeholderCount = conflict ? 0 : serverCount - tracked.length;
  const knownCards = effective.map((card) => {
    const reconciliation: CardReconciliation = conflict && tracked.some((item) => item.localId === card.localId)
      ? "conflict" : card.state === "unresolved" && card.reconciliation === "consistent" ? "consistent"
        : card.state === "unresolved" ? "unverified" : "consistent";
    const updated = { ...card, reconciliation };
    return { localId: card.localId, label: card.label, card: updated, placeholder: false };
  });
  const placeholders: ReconciledCard[] = Array.from({ length: placeholderCount }, (_, index) => ({
    localId: null, label: "有效期未录入的服务端卡", card: null, placeholder: true,
  }));
  return {
    status: conflict ? "conflict" : placeholderCount > 0 ? "supplementing" : "consistent",
    serverCount, trackedCount: tracked.length, placeholderCount,
    planningCount: serverCount,
    cards: [...knownCards, ...placeholders],
    prompt: conflict ? `服务端显示有 ${serverCount} 张，你的台账有 ${tracked.length} 张；哪张已不在库存？允许选择“我还不确定”。` : null,
  };
}

/** Only confirmed, available cards can be auto-selected; unknown dates never outrank known dates. */
export function selectEarliestConfirmedCard(
  cards: readonly ResetCard[], serverCount: number | null, now: number, bufferMs = CARD_BUFFER_MS,
): ResetCard | null {
  const reconciliation = reconcileCardCount(cards, serverCount);
  if (reconciliation.status === "conflict" || reconciliation.status === "unknown" || reconciliation.planningCount === 0) return null;
  return cards.filter((card) => card.state === "available" && card.confirmedAt != null &&
      card.safeDeadlineAt != null && now < card.safeDeadlineAt - bufferMs)
    .sort((a, b) => a.safeDeadlineAt! - b.safeDeadlineAt! || a.localId.localeCompare(b.localId))[0] ?? null;
}

function parseViewTime(value: string): { hour: number; minute: number } | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const hour = Number(m[1]); const minute = Number(m[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

/** Last configured viewing slot strictly before the operation buffer cutoff. */
export function computeLastActionAt(
  safeDeadlineAt: number | null, viewTimes: readonly string[], bufferMs = CARD_BUFFER_MS,
): number | null {
  if (safeDeadlineAt == null || viewTimes.length === 0) return null;
  const cutoff = safeDeadlineAt - bufferMs;
  const beijingDeadline = cutoff + 8 * 60 * 60 * 1000;
  const deadlineDay = Math.floor(beijingDeadline / 86_400_000);
  const times = viewTimes.map(parseViewTime).filter((time): time is { hour: number; minute: number } => time != null);
  let latest: number | null = null;
  for (let day = deadlineDay; day >= deadlineDay - 8; day--) {
    for (const time of times) {
      const candidate = day * 86_400_000 + time.hour * 3_600_000 + time.minute * 60_000 - 8 * 3_600_000;
      if (candidate < cutoff && (latest == null || candidate > latest)) latest = candidate;
    }
    if (latest != null) return latest;
  }
  return null;
}

export function cardReminder(
  card: ResetCard, now: number, viewTimes: readonly string[], viewTimesConfirmed: boolean,
): CardReminder | null {
  if (card.state !== "available" || card.safeDeadlineAt == null) return null;
  if (card.entryPrecision === "datetime" && card.exactExpiryAt != null && card.exactExpiryAt <= now) {
    return { localId: card.localId, tier: "needs-confirmation", lastActionAt: null, safeDeadlineAt: card.safeDeadlineAt };
  }
  if (card.entryPrecision === "date" && card.safeDeadlineAt <= now) {
    return { localId: card.localId, tier: "needs-confirmation", lastActionAt: null, safeDeadlineAt: card.safeDeadlineAt };
  }
  const lastActionAt = viewTimesConfirmed ? computeLastActionAt(card.safeDeadlineAt, viewTimes) : null;
  if (viewTimesConfirmed && lastActionAt == null) return null;
  const reminderDeadline = lastActionAt ?? card.safeDeadlineAt - CARD_BUFFER_MS;
  const remaining = reminderDeadline - now;
  if (remaining <= 0) return { localId: card.localId, tier: "last-chance", lastActionAt, safeDeadlineAt: card.safeDeadlineAt };
  if (remaining <= 24 * 3_600_000) return { localId: card.localId, tier: "24h", lastActionAt, safeDeadlineAt: card.safeDeadlineAt };
  if (remaining <= 48 * 3_600_000) return { localId: card.localId, tier: "48h", lastActionAt, safeDeadlineAt: card.safeDeadlineAt };
  return null;
}

export function cardReminders(
  cards: readonly ResetCard[], now: number, viewTimes: readonly string[], viewTimesConfirmed: boolean,
): CardReminder[] {
  return cards.map((card) => cardReminder(card, now, viewTimes, viewTimesConfirmed)).filter((item): item is CardReminder => item != null);
}

export function recordCardUse(
  inputs: PersonalInputsData, localId: string, now: number, serverCount: number | null,
): PersonalInputsData {
  const card = inputs.cards.find((item) => item.localId === localId);
  if (!card || card.state !== "available") throw new Error("只能记录台账中的可用卡");
  const after = { ...card, state: "used" as const };
  return {
    ...inputs,
    cards: inputs.cards.map((item) => item.localId === localId ? after : item),
    cardVersions: appendCardVersion(inputs.cardVersions, localId, card, after, now),
    useRecords: [...inputs.useRecords, {
      id: `use:${localId}:${now}`, localId, recordedAt: now, serverCountAtRecord: serverCount, status: "user-recorded",
    }],
  };
}

export function updateCardState(
  inputs: PersonalInputsData, localId: string, state: ResetCardState,
  reconciliation: CardReconciliation, now: number,
): PersonalInputsData {
  const before = inputs.cards.find((card) => card.localId === localId);
  if (!before) throw new Error("找不到这张重置卡");
  const after = { ...before, state, reconciliation };
  return {
    ...inputs,
    cards: inputs.cards.map((card) => card.localId === localId ? after : card),
    cardVersions: appendCardVersion(inputs.cardVersions, localId, before, after, now),
  };
}

export function withPersonalInputChange<K extends PersonalInputVersion["field"]>(
  inputs: PersonalInputsData, field: K, value: PersonalInputsData[K], now: number,
): PersonalInputsData {
  const before = inputs[field];
  return {
    ...inputs, [field]: value, version: inputs.version + 1,
    inputVersions: [...inputs.inputVersions, { version: inputs.version + 1, changedAt: now, field, before, after: value }],
  };
}

export function recordPreferenceFeedback(
  inputs: PersonalInputsData, choice: PreferenceFeedback, now: number,
): PersonalInputsData {
  const after = [...inputs.feedback, { choice, recordedAt: now }];
  return {
    ...inputs, feedback: after, version: inputs.version + 1,
    inputVersions: [...inputs.inputVersions, {
      version: inputs.version + 1, changedAt: now, field: "feedback", before: inputs.feedback, after,
    }],
  };
}

export function beijingDateKey(now: number): string {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
