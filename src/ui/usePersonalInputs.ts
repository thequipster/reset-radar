// RR47 本地个人输入 hook：账号键严格分仓，null 账号仅落到独立 demo 键。
// 只记录用户确认的行为；本 hook 不调用真实用卡命令。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  appendCardVersion, beijingDateKey, cardReminders, createResetCard, emptyPersonalInputs,
  personalInputsStorageKey, reconcileCardCount, recordCardUse, recordPreferenceFeedback, updateCardExpiry, updateCardState, withPersonalInputChange,
  type CardEntryPrecision, type CardReconciliation, type CardReconciliationResult, type CardReminder, type ResetCardState,
  type PersonalInputsData, type PersonalInputVersion, type PersonalPreference, type PreferenceFeedback,
  type WorkloadLevel,
} from "../lib/v3/cards";

function loadInputs(accountKey: string | null): PersonalInputsData {
  const empty = emptyPersonalInputs(accountKey);
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(personalInputsStorageKey(accountKey));
    if (raw == null) return empty;
    const parsed = JSON.parse(raw) as Partial<PersonalInputsData>;
    if (parsed.schema !== empty.schema || parsed.accountKey !== accountKey) return empty;
    return {
      ...empty,
      ...parsed,
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
      cardVersions: Array.isArray(parsed.cardVersions) ? parsed.cardVersions : [],
      useRecords: Array.isArray(parsed.useRecords) ? parsed.useRecords : [],
      inputVersions: Array.isArray(parsed.inputVersions) ? parsed.inputVersions : [],
      usualViewTimes: Array.isArray(parsed.usualViewTimes) ? parsed.usualViewTimes : [...empty.usualViewTimes],
    } as PersonalInputsData;
  } catch {
    return empty;
  }
}

export interface PersonalInputsState extends PersonalInputsData {
  /** Server account count is authoritative and never persisted as a personal estimate. */
  accountCount: number | null;
  reconciliation: CardReconciliationResult;
  reminders: CardReminder[];
  effectiveWorkloadToday: WorkloadLevel | null;
  effectiveWeeklyBudgetPercent: number | null;
}

export interface PersonalInputsController {
  state: PersonalInputsState;
  addCard(label: string, enteredExpiry: string | null, precision: CardEntryPrecision): void;
  updateExpiry(localId: string, enteredExpiry: string | null, precision: CardEntryPrecision): void;
  recordUse(localId: string): void;
  markUnresolved(localId: string): void;
  confirmAbsent(localId: string): void;
  restoreAvailable(localId: string): void;
  setWorkloadToday(level: WorkloadLevel | null): void;
  setPreference(preference: PersonalPreference | null): void;
  setUsualViewTimes(times: string[], confirmed: boolean): void;
  setWeeklyBudgetPercent(value: number | null): void;
  recordFeedback(choice: PreferenceFeedback): void;
}

export function usePersonalInputs(
  accountKey: string | null, accountCount: number | null, now: number,
  onChange?: (inputs: PersonalInputsState) => void,
): PersonalInputsController {
  const [data, setData] = useState<PersonalInputsData>(() => loadInputs(accountKey));
  const keyRef = useRef(accountKey);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const idSequence = useRef(0);

  useEffect(() => {
    if (keyRef.current === accountKey) return;
    keyRef.current = accountKey;
    const next = loadInputs(accountKey);
    setData(next);
  }, [accountKey]);

  useEffect(() => {
    if (data.accountKey !== accountKey || typeof window === "undefined") return;
    try { window.localStorage.setItem(personalInputsStorageKey(accountKey), JSON.stringify(data)); } catch { /* private mode: session remains usable */ }
  }, [data, accountKey]);

  const updateInput = useCallback(<K extends PersonalInputVersion["field"]>(field: K, value: PersonalInputsData[K]) => {
    setData((previous) => withPersonalInputChange(previous, field, value, now));
  }, [now]);

  const addCard = useCallback((label: string, enteredExpiry: string | null, precision: CardEntryPrecision) => {
    const cleanLabel = label.trim();
    if (cleanLabel === "") throw new Error("请给这张卡填写名称");
    const localId = `card-${now}-${++idSequence.current}`;
    const card = createResetCard({ localId, label: cleanLabel, enteredExpiry, entryPrecision: precision, now });
    setData((previous) => ({
      ...previous,
      cards: [...previous.cards, card],
      cardVersions: appendCardVersion(previous.cardVersions, localId, null, card, now),
    }));
  }, [now]);

  const updateExpiry = useCallback((localId: string, enteredExpiry: string | null, precision: CardEntryPrecision) => {
    setData((previous) => {
      const result = updateCardExpiry(previous.cards, previous.cardVersions, localId, enteredExpiry, precision, now);
      return { ...previous, ...result };
    });
  }, [now]);

  const recordUse = useCallback((localId: string) => {
    setData((previous) => recordCardUse(previous, localId, now, accountCount));
  }, [now, accountCount]);

  const markUnresolved = useCallback((localId: string) => {
    setData((previous) => updateCardState(previous, localId, "unresolved", "unverified", now));
  }, [now]);

  const confirmAbsent = useCallback((localId: string) => {
    setData((previous) => updateCardState(previous, localId, "unresolved", "consistent", now));
  }, [now]);

  const restoreAvailable = useCallback((localId: string) => {
    setData((previous) => updateCardState(previous, localId, "available", "unverified", now));
  }, [now]);

  const setWorkloadToday = useCallback((level: WorkloadLevel | null) => {
    updateInput("workloadToday", level == null ? null : { localDate: beijingDateKey(now), level });
  }, [now, updateInput]);
  const setPreference = useCallback((preference: PersonalPreference | null) => updateInput("preference", preference), [updateInput]);
  const setUsualViewTimes = useCallback((times: string[], confirmed: boolean) => {
    setData((previous) => {
      const withTimes = withPersonalInputChange(previous, "usualViewTimes", times, now);
      return withPersonalInputChange(withTimes, "viewTimesConfirmed", confirmed, now);
    });
  }, [now]);
  const setWeeklyBudgetPercent = useCallback((value: number | null) => {
    if (value != null && (!Number.isFinite(value) || value < 0)) return;
    updateInput("weeklyBudgetPercent", value == null ? null : { localDate: beijingDateKey(now), value });
  }, [updateInput]);
  const recordFeedback = useCallback((choice: PreferenceFeedback) => {
    setData((previous) => recordPreferenceFeedback(previous, choice, now));
  }, [now]);

  const isCurrentAccount = data.accountKey === accountKey;
  const activeData = isCurrentAccount ? data : emptyPersonalInputs(accountKey);
  const reconciliation = useMemo(() => reconcileCardCount(activeData.cards, accountCount), [activeData.cards, accountCount]);
  const reminders = useMemo(() => cardReminders(activeData.cards, now, activeData.usualViewTimes, activeData.viewTimesConfirmed),
    [activeData.cards, now, activeData.usualViewTimes, activeData.viewTimesConfirmed]);
  const todayKey = beijingDateKey(now);
  const effectiveWorkloadToday = activeData.workloadToday?.localDate === todayKey ? activeData.workloadToday.level : null;
  const effectiveWeeklyBudgetPercent = activeData.weeklyBudgetPercent?.localDate === todayKey ? activeData.weeklyBudgetPercent.value : null;
  const state = useMemo<PersonalInputsState>(() => ({
    ...activeData, accountKey, accountCount, reconciliation, reminders, effectiveWorkloadToday, effectiveWeeklyBudgetPercent,
  }), [activeData, accountKey, accountCount, reconciliation, reminders, effectiveWorkloadToday, effectiveWeeklyBudgetPercent]);

  useEffect(() => { onChangeRef.current?.(state); }, [state]);

  return {
    state, addCard, updateExpiry, recordUse, markUnresolved, confirmAbsent, restoreAvailable, setWorkloadToday,
    setPreference, setUsualViewTimes, setWeeklyBudgetPercent, recordFeedback,
  };
}
