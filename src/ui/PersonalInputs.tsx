// RR47 个人输入区：展示台账/需求/偏好并记录用户已完成的操作；不自动触发用卡。
import { useEffect, useState } from "react";
import type { CardEntryPrecision, PersonalPreference, WorkloadLevel } from "../lib/v3/cards";
import { beijingDateKey, CARD_BUFFER_MS } from "../lib/v3/cards";
import type { PersonalInputsController } from "./usePersonalInputs";
import styles from "./PersonalInputs.module.css";

export interface PersonalInputsProps {
  accountKey: string | null;
  controller: PersonalInputsController;
  now: number;
  onRecordedUse?: () => void;
}

const WORKLOADS: { value: WorkloadLevel; label: string }[] = [
  { value: "quiet", label: "比较闲" }, { value: "normal", label: "正常干活" },
  { value: "busy", label: "可能忙很久" }, { value: "unknown", label: "还不确定" },
];

const PREFERENCES: { value: PersonalPreference; label: string }[] = [
  { value: "protect-quota", label: "别用到一半没额度" },
  { value: "use-expiring", label: "快过期的卡尽量用上" },
  { value: "save-cards", label: "卡先留着，实在不够再用" },
];

function beijingClock(value: number | null): string {
  if (value == null) return "时间待确认";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(value);
}

export function PersonalInputs({ controller, accountKey, now, onRecordedUse }: PersonalInputsProps) {
  const { state } = controller;
  const [label, setLabel] = useState("");
  const [precision, setPrecision] = useState<CardEntryPrecision>("date");
  const [expiry, setExpiry] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { precision: CardEntryPrecision; expiry: string }>>({});
  const [budget, setBudget] = useState(state.effectiveWeeklyBudgetPercent == null ? "" : String(state.effectiveWeeklyBudgetPercent));
  const [viewTimes, setViewTimes] = useState(state.usualViewTimes.join(", "));
  const [error, setError] = useState<string | null>(null);
  const serverCountLabel = state.accountCount == null ? "服务端张数未知" : `服务端 ${state.accountCount} 张`;

  useEffect(() => {
    setBudget(state.effectiveWeeklyBudgetPercent == null ? "" : String(state.effectiveWeeklyBudgetPercent));
    setViewTimes(state.usualViewTimes.join(", "));
    setDrafts({});
    setError(null);
  }, [accountKey, state.version]);

  const addCard = () => {
    try {
      controller.addCard(label, expiry || null, expiry ? precision : "unknown");
      setLabel(""); setExpiry(""); setError(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  };

  const saveCardExpiry = (localId: string) => {
    const draft = drafts[localId];
    if (!draft) return;
    try {
      controller.updateExpiry(localId, draft.expiry || null, draft.expiry ? draft.precision : "unknown");
      setError(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  };

  const saveViewTimes = () => {
    const parsed = viewTimes.split(/[，,\s]+/).filter(Boolean);
    if (parsed.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) || new Set(parsed).size !== parsed.length) {
      setError("请使用 HH:mm 填写查看时段，例如 09:00, 20:00");
      return;
    }
    controller.setUsualViewTimes(parsed, true);
    setError(null);
  };

  const saveBudget = () => {
    const parsed = budget.trim() === "" ? null : Number(budget);
    if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) {
      setError("周额度预算请填写大于等于 0 的百分点");
      return;
    }
    controller.setWeeklyBudgetPercent(parsed);
    setError(null);
  };

  return (
    <section className={styles.root} aria-label="个人用量与重置卡设置">
      <header className={styles.header}>
        <div><h2>个人安排</h2><p>{accountKey == null ? "演示资料单独保存" : "只保存在此账号"} · {serverCountLabel}</p></div>
        <span className={styles.version}>v{state.version}</span>
      </header>

      {state.reconciliation.status === "conflict" && state.reconciliation.prompt && (
        <div className={styles.conflict} role="status">{state.reconciliation.prompt}<br />未确认前，只按服务端张数规划。</div>
      )}

      {state.reminders.length > 0 && <div className={styles.reminders} aria-label="重置卡提醒">
        {state.reminders.map((reminder) => {
          const card = state.cards.find((item) => item.localId === reminder.localId);
          const labelText = reminder.tier === "48h" ? "48 小时内" : reminder.tier === "24h" ? "24 小时内" :
            reminder.tier === "last-chance" ? "已到最后建议操作时段" : "请补具体到期时间或确认查看时段";
          return <p className={styles.reminder} key={`${reminder.localId}:${reminder.tier}`}>
            <strong>{card?.label ?? "重置卡"}</strong> · {labelText}
            {reminder.lastActionAt != null && <>，建议最迟 {beijingClock(reminder.lastActionAt)} 前处理</>}
            {reminder.tier === "needs-confirmation" && reminder.safeDeadlineAt != null && <>；安全截止 {beijingClock(reminder.safeDeadlineAt)}</>}
          </p>;
        })}
      </div>}

      <fieldset className={styles.group}>
        <legend>今天大概忙不忙？</legend>
        <div className={styles.options}>
          {WORKLOADS.map((option) => <button key={option.value} type="button" aria-pressed={state.effectiveWorkloadToday === option.value}
            className={state.effectiveWorkloadToday === option.value ? styles.selected : ""}
            onClick={() => controller.setWorkloadToday(option.value)}>{option.label}</button>)}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>今天你更在意什么？</legend>
        <div className={styles.options}>
          {PREFERENCES.map((option) => <button key={option.value} type="button" aria-pressed={state.preference === option.value}
            className={state.preference === option.value ? styles.selected : ""}
            onClick={() => controller.setPreference(option.value)}>{option.label}</button>)}
        </div>
        {state.preference == null && <p className={styles.hint}>默认按“别用到一半没额度”提供建议；你可以跳过或随时修改。</p>}
      </fieldset>

      <details className={styles.details}>
        <summary>卡片台账、查看时段与可选预算</summary>
        <p className={styles.hint}>只填日期，会提醒你在前一天用完；填具体时间可以晚些再决定。</p>
        <p className={styles.hint}>到期时间按北京时间记录。登记和“记录已用”只更新本地台账，不会自动使用真实重置卡。</p>

        <div className={styles.cardList}>
          {state.reconciliation.cards.map((row, index) => row.placeholder ? (
            <article className={styles.card} key={`placeholder-${index}`}>
              <strong>{row.label}</strong><span>截止未知，不会估造有效期</span>
            </article>
          ) : row.card && <article className={styles.card} key={row.card.localId}>
            <div className={styles.cardHeading}><strong>{row.card.label}</strong><span>{row.card.state === "used" ? "已记录使用" : row.card.state === "unresolved" && row.card.reconciliation === "consistent" ? "已确认不在库存" : row.card.state === "unresolved" ? "待核对" : row.card.state === "expired-confirmed" ? "已确认过期" : row.card.reconciliation === "conflict" ? "库存冲突" : row.card.entryPrecision === "datetime" && row.card.exactExpiryAt != null && row.card.exactExpiryAt <= now ? "截止已过 · 待确认" : "可用"}</span></div>
            <p>安全截止：{row.card.safeDeadlineAt == null ? "未知" : beijingClock(row.card.safeDeadlineAt)} · v{state.cardVersions.filter((item) => item.localId === row.card!.localId).length || 1}</p>
            {row.card.state === "available" && <div className={styles.cardActions}>
              <button type="button" onClick={() => { controller.recordUse(row.card!.localId); onRecordedUse?.(); }}>记录已使用</button>
              <button type="button" onClick={() => controller.markUnresolved(row.card!.localId)}>标记待核对</button>
              <button type="button" onClick={() => controller.confirmAbsent(row.card!.localId)}>确认不在库存</button>
            </div>}
            {row.card.state === "unresolved" && <div className={styles.cardActions}><button type="button" onClick={() => controller.restoreAvailable(row.card!.localId)}>恢复为待核对库存</button></div>}
            {row.card.state === "available" && <div className={styles.editExpiry}>
              <label htmlFor={`expiry-mode-${row.card.localId}`}>截止类型</label>
              <select id={`expiry-mode-${row.card.localId}`} value={drafts[row.card.localId]?.precision ?? row.card.entryPrecision}
                onChange={(event) => setDrafts((previous) => ({ ...previous, [row.card!.localId]: { precision: event.target.value as CardEntryPrecision, expiry: previous[row.card!.localId]?.expiry ?? row.card!.enteredExpiry ?? "" } }))}>
                <option value="date">只知道日期</option><option value="datetime">知道具体时间</option><option value="unknown">尚不清楚</option>
              </select>
              <label htmlFor={`expiry-${row.card.localId}`}>到期时间</label>
              <input id={`expiry-${row.card.localId}`} type={(drafts[row.card.localId]?.precision ?? row.card.entryPrecision) === "datetime" ? "datetime-local" : "date"}
                disabled={(drafts[row.card.localId]?.precision ?? row.card.entryPrecision) === "unknown"}
                value={drafts[row.card.localId]?.expiry ?? row.card.enteredExpiry ?? ""}
                onChange={(event) => setDrafts((previous) => ({ ...previous, [row.card!.localId]: { precision: previous[row.card!.localId]?.precision ?? (row.card!.entryPrecision === "datetime" ? "datetime" : "date"), expiry: event.target.value } }))} />
              <button type="button" onClick={() => saveCardExpiry(row.card!.localId)}>保存截止</button>
            </div>}
          </article>)}
        </div>

        <div className={styles.addCard}>
          <label htmlFor="personal-card-label">卡片名称</label><input id="personal-card-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如：备用重置卡" />
          <label htmlFor="personal-card-precision">截止类型</label><select id="personal-card-precision" value={precision} onChange={(event) => setPrecision(event.target.value as CardEntryPrecision)}>
            <option value="date">只知道日期</option><option value="datetime">知道具体时间</option><option value="unknown">尚不清楚</option>
          </select>
          <label htmlFor="personal-card-expiry">到期时间（可留空）</label><input id="personal-card-expiry" type={precision === "datetime" ? "datetime-local" : "date"} disabled={precision === "unknown"} value={expiry} onChange={(event) => setExpiry(event.target.value)} />
          <button type="button" onClick={addCard}>添加到台账</button>
        </div>

        {state.reconciliation.status === "supplementing" && <p className={styles.hint}>服务端多出的 {state.reconciliation.placeholderCount} 张卡只按未知截止占位，不假设 14 天有效期。</p>}
        <div className={styles.fieldRow}>
          <label htmlFor="personal-view-times">常用查看时段</label>
          <input id="personal-view-times" value={viewTimes} onChange={(event) => setViewTimes(event.target.value)} placeholder="09:00, 20:00" />
          <button type="button" onClick={saveViewTimes}>保存时段</button>
        </div>
        {!state.viewTimesConfirmed && <p className={styles.hint}>09:00、20:00 只是初始建议；确认常用时段后，提醒才会按查看时机安排。</p>}
        <div className={styles.fieldRow}>
          <label htmlFor="personal-week-budget">今天预计周额度用量（百分点，可选）</label>
          <input id="personal-week-budget" type="number" min="0" step="0.1" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="不清楚可留空" />
          <button type="button" onClick={saveBudget}>保存预算</button>
        </div>
        {state.effectiveWeeklyBudgetPercent == null && <p className={styles.hint}>未填预算时显示“正在学习”，不会代入固定日耗。</p>}
        {state.effectiveWeeklyBudgetPercent != null && <p className={styles.hint}>今日预算：{state.effectiveWeeklyBudgetPercent} 周额度百分点；用于今天的情景估算，不是统计置信区间。</p>}
      </details>
      <details className={styles.details}>
        <summary>给这次建议一个可选反馈</summary>
        <p className={styles.hint}>反馈只追加到个人输入历史；也可以跳过。</p>
        <div className={styles.options}>
          <button type="button" onClick={() => controller.recordFeedback("appropriate")}>合适</button>
          <button type="button" onClick={() => controller.recordFeedback("insufficient")}>还是不够用</button>
          <button type="button" onClick={() => controller.recordFeedback("save-card")}>我更想把卡留着</button>
          <button type="button" onClick={() => controller.recordFeedback("too-late")}>提醒太晚了</button>
          <button type="button">跳过</button>
        </div>
      </details>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <p className={styles.footer}>当前日期：{beijingDateKey(now)} · 用卡缓冲 {CARD_BUFFER_MS / 60_000} 分钟</p>
    </section>
  );
}

export default PersonalInputs;
