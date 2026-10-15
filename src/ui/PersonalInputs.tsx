// RR47 个人输入区：展示台账/需求/偏好并记录用户已完成的操作；不自动触发用卡。
import { useEffect, useRef, useState } from "react";
import { clockLabel, percentLabel, TIER_DAILY_PERCENT } from "./plainAdvice";
import type { CardEntryPrecision, PersonalPreference, PreferenceFeedback, WorkloadLevel } from "../lib/v3/cards";
import { beijingDateKey, CARD_BUFFER_MS } from "../lib/v3/cards";
import type { PersonalInputsController } from "./usePersonalInputs";
import styles from "./PersonalInputs.module.css";

export interface PersonalInputsProps {
  accountKey: string | null;
  controller: PersonalInputsController;
  now: number;
  onRecordedUse?: () => void;
  focusSection?: "budget" | "cards" | null;
}

const WORKLOADS: { value: WorkloadLevel; label: string }[] = [
  { value: "quiet", label: `轻松（≈${percentLabel(TIER_DAILY_PERCENT.light)}/天）` }, { value: "normal", label: `正常（≈${percentLabel(TIER_DAILY_PERCENT.normal)}/天）` },
  { value: "busy", label: `很忙（≈${percentLabel(TIER_DAILY_PERCENT.busy)}/天）` }, { value: "unknown", label: "不确定" },
];
const FEEDBACKS: { value: PreferenceFeedback; label: string }[] = [
  { value: "appropriate", label: "合适" }, { value: "insufficient", label: "不够用" },
  { value: "save-card", label: "我想留着卡" }, { value: "too-late", label: "提醒太晚了" },
];

const PREFERENCES: { value: PersonalPreference; label: string }[] = [
  { value: "protect-quota", label: "别用到一半没额度" },
  { value: "use-expiring", label: "快过期的卡尽量用上" },
  { value: "save-cards", label: "卡先留着，实在不够再用" },
];

function beijingClock(value: number | null): string {
  if (value == null) return "时间不详";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(value);
}

export function PersonalInputs({ controller, accountKey, now, onRecordedUse, focusSection = null }: PersonalInputsProps) {
  const { state } = controller;
  const [label, setLabel] = useState("");
  const [precision, setPrecision] = useState<CardEntryPrecision>("date");
  const [expiry, setExpiry] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { precision: CardEntryPrecision; expiry: string }>>({});
  const [budget, setBudget] = useState(state.effectiveWeeklyBudgetPercent == null ? "" : String(state.effectiveWeeklyBudgetPercent));
  const [viewTimes, setViewTimes] = useState(state.usualViewTimes.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [feedbackDone, setFeedbackDone] = useState<{ choice: PreferenceFeedback; at: number } | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const budgetRef = useRef<HTMLInputElement>(null);
  const cardsRef = useRef<HTMLInputElement>(null);
  const serverCountLabel = state.accountCount == null ? "官方还没告诉我们有几张卡" : `官方显示 ${state.accountCount} 张卡`;

  useEffect(() => {
    setBudget(state.effectiveWeeklyBudgetPercent == null ? "" : String(state.effectiveWeeklyBudgetPercent));
    setViewTimes(state.usualViewTimes.join(", "));
    setDrafts({});
    setError(null);
  }, [accountKey, state.version]);

  useEffect(() => {
    if (!focusSection) return;
    if (detailsRef.current) detailsRef.current.open = true;
    const target = focusSection === "budget" ? budgetRef.current : cardsRef.current;
    requestAnimationFrame(() => {
      target?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      target?.focus();
    });
  }, [focusSection]);

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
      setError("时间请写成 HH:mm，用逗号隔开，例如 09:00, 20:00");
      return;
    }
    controller.setUsualViewTimes(parsed, true);
    setError(null);
  };

  const saveBudget = () => {
    const parsed = budget.trim() === "" ? null : Number(budget);
    if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) {
      setError("今天的预算请填 0 或更大的数字（周额度的百分之几）");
      return;
    }
    controller.setWeeklyBudgetPercent(parsed);
    setError(null);
  };

  return (
    <section className={styles.root} aria-label="个人用量与重置卡设置">
      <header className={styles.header}>
        <div><h2>我的设置</h2><p>{accountKey == null ? "演示资料单独保存" : "只存在这台电脑、只对这个账号"} · {serverCountLabel}</p></div>
        <span className={styles.version}>v{state.version}</span>
      </header>

      {state.reconciliation.status === "conflict" && state.reconciliation.prompt && (
        <div className={styles.conflict} role="status">{state.reconciliation.prompt}<br />没核对清楚之前，按官方的张数来算。</div>
      )}

      {state.reminders.length > 0 && <div className={styles.reminders} aria-label="重置卡提醒">
        {state.reminders.map((reminder) => {
          const card = state.cards.find((item) => item.localId === reminder.localId);
          const labelText = reminder.tier === "48h" ? "两天内到期" : reminder.tier === "24h" ? "一天内到期" :
            reminder.tier === "last-chance" ? "最后机会，再不用就作废" : "只知道日期不知道几点，补上具体时间会更准";
          return <p className={styles.reminder} key={`${reminder.localId}:${reminder.tier}`}>
            <strong>{card?.label ?? "重置卡"}</strong> · {labelText}
            {reminder.lastActionAt != null && <>，最晚 {beijingClock(reminder.lastActionAt)} 前用掉</>}
            {reminder.tier === "needs-confirmation" && reminder.safeDeadlineAt != null && <>；保险起见按 {beijingClock(reminder.safeDeadlineAt)} 算</>}
          </p>;
        })}
      </div>}

      <fieldset className={styles.group}>
        <legend>今天忙不忙？</legend>
        <div className={styles.options}>
          {WORKLOADS.map((option) => <button key={option.value} type="button" aria-pressed={state.effectiveWorkloadToday === option.value}
            className={state.effectiveWorkloadToday === option.value ? styles.selected : ""}
            onClick={() => controller.setWorkloadToday(state.effectiveWorkloadToday === option.value ? null : option.value)}>{option.label}</button>)}
        </div>
        <p className={styles.hint}>{state.effectiveWorkloadToday == null ? "没选就按「正常」算。" : "再点一下可以取消。"}这三档是默认估算（每天用掉周额度的 7% / 14% / 29%），不是你的历史统计；用满 7 天后可以改成按你的习惯算。</p>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>今天你更在意什么？</legend>
        <div className={styles.options}>
          {PREFERENCES.map((option) => <button key={option.value} type="button" aria-pressed={state.preference === option.value}
            className={state.preference === option.value ? styles.selected : ""}
            onClick={() => controller.setPreference(option.value)}>{option.label}</button>)}
        </div>
        {state.preference == null && <p className={styles.hint}>不选就按“别用到一半没额度”来建议；随时可以改。</p>}
      </fieldset>

      <details ref={detailsRef} className={styles.details}>
        <summary>我的卡（到期时间）、我一般几点看、今天预算</summary>
        <p className={styles.hint}>只填日期的话，保险起见按前一天算最后期限；填了具体几点就能卡到点。时间都按北京时间。</p>
        <p className={styles.hint}>这里只是记账，不会真的帮你用卡；真用了之后回来点一下“我用了这张”。</p>

        <div className={styles.cardList}>
          {state.reconciliation.cards.map((row, index) => row.placeholder ? (
            <article className={styles.card} key={`placeholder-${index}`}>
              <strong>{row.label}</strong><span>官方多出来的一张，到期时间不知道，不替你猜</span>
            </article>
          ) : row.card && <article className={styles.card} key={row.card.localId}>
            <div className={styles.cardHeading}><strong>{row.card.label}</strong><span>{row.card.state === "used" ? "已用掉" : row.card.state === "unresolved" && row.card.reconciliation === "consistent" ? "已确认不在了" : row.card.state === "unresolved" ? "待核对" : row.card.state === "expired-confirmed" ? "已过期" : row.card.reconciliation === "conflict" ? "和官方张数对不上" : row.card.entryPrecision === "datetime" && row.card.exactExpiryAt != null && row.card.exactExpiryAt <= now ? "时间已过 · 请确认" : "能用"}</span></div>
            <p>最晚什么时候用：{row.card.safeDeadlineAt == null ? "不知道（请填到期时间）" : `${beijingClock(row.card.safeDeadlineAt - CARD_BUFFER_MS)} 前`} · 第 {state.cardVersions.filter((item) => item.localId === row.card!.localId).length || 1} 版</p>
            {row.card.state === "available" && <div className={styles.cardActions}>
              <button type="button" onClick={() => { controller.recordUse(row.card!.localId); onRecordedUse?.(); }}>我用了这张</button>
              <button type="button" onClick={() => controller.markUnresolved(row.card!.localId)}>不确定还在不在</button>
              <button type="button" onClick={() => controller.confirmAbsent(row.card!.localId)}>这张已经没了</button>
            </div>}
            {row.card.state === "unresolved" && <div className={styles.cardActions}><button type="button" onClick={() => controller.restoreAvailable(row.card!.localId)}>又找到了，恢复</button></div>}
            {row.card.state === "available" && <div className={styles.editExpiry}>
              <label htmlFor={`expiry-mode-${row.card.localId}`}>到期信息</label>
              <select id={`expiry-mode-${row.card.localId}`} value={drafts[row.card.localId]?.precision ?? row.card.entryPrecision}
                onChange={(event) => setDrafts((previous) => ({ ...previous, [row.card!.localId]: { precision: event.target.value as CardEntryPrecision, expiry: previous[row.card!.localId]?.expiry ?? row.card!.enteredExpiry ?? "" } }))}>
                <option value="date">只知道哪天</option><option value="datetime">知道具体几点</option><option value="unknown">还不知道</option>
              </select>
              <label htmlFor={`expiry-${row.card.localId}`}>到期时间</label>
              <input id={`expiry-${row.card.localId}`} type={(drafts[row.card.localId]?.precision ?? row.card.entryPrecision) === "datetime" ? "datetime-local" : "date"}
                disabled={(drafts[row.card.localId]?.precision ?? row.card.entryPrecision) === "unknown"}
                value={drafts[row.card.localId]?.expiry ?? row.card.enteredExpiry ?? ""}
                onChange={(event) => setDrafts((previous) => ({ ...previous, [row.card!.localId]: { precision: previous[row.card!.localId]?.precision ?? (row.card!.entryPrecision === "datetime" ? "datetime" : "date"), expiry: event.target.value } }))} />
              <button type="button" onClick={() => saveCardExpiry(row.card!.localId)}>保存</button>
            </div>}
          </article>)}
        </div>

        <div className={styles.addCard}>
          <label htmlFor="personal-card-label">给卡起个名</label><input ref={cardsRef} id="personal-card-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如：10 月那张" />
          <label htmlFor="personal-card-precision">到期信息</label><select id="personal-card-precision" value={precision} onChange={(event) => setPrecision(event.target.value as CardEntryPrecision)}>
            <option value="date">只知道哪天</option><option value="datetime">知道具体几点</option><option value="unknown">还不知道</option>
          </select>
          <label htmlFor="personal-card-expiry">到期时间（不知道可以空着）</label><input id="personal-card-expiry" type={precision === "datetime" ? "datetime-local" : "date"} disabled={precision === "unknown"} value={expiry} onChange={(event) => setExpiry(event.target.value)} />
          <button type="button" onClick={addCard}>加进来</button>
        </div>

        {state.reconciliation.status === "supplementing" && <p className={styles.hint}>官方比这里多 {state.reconciliation.placeholderCount} 张卡，到期时间不知道，先当“不知道哪天到期”处理；填上就能算最晚哪天用。</p>}
        <div className={styles.fieldRow}>
          <label htmlFor="personal-view-times">你一般几点会看它？（提醒按这个安排）</label>
          <input id="personal-view-times" value={viewTimes} onChange={(event) => setViewTimes(event.target.value)} placeholder="09:00, 20:00" />
          <button type="button" onClick={saveViewTimes}>保存</button>
        </div>
        {!state.viewTimesConfirmed && <p className={styles.hint}>09:00、20:00 是默认值；点一下保存确认后，提醒就会卡着你看它的时间来。</p>}
        <div className={styles.fieldRow}>
          <label htmlFor="personal-week-budget">今天打算用掉周额度的百分之几？（可不填）</label>
          <input ref={budgetRef} id="personal-week-budget" type="number" min="0" step="0.1" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="例如 15" />
          <button type="button" onClick={saveBudget}>保存</button>
        </div>
        {state.effectiveWeeklyBudgetPercent == null && <p className={styles.hint}>不填就按上面“今天忙不忙”来估。</p>}
        {state.effectiveWeeklyBudgetPercent != null && <p className={styles.hint}>今天按你填的 {state.effectiveWeeklyBudgetPercent}% 来算；明天自动失效。</p>}
      </details>
      <details className={styles.details}>
        <summary>这个建议合适吗？（可不填）</summary>
        <p className={styles.hint}>只记在本机，帮你自己回看；不填也没关系。</p>
        <div className={styles.options} role="group" aria-label="对建议的反馈">
          {FEEDBACKS.map((option) => <button key={option.value} type="button" aria-pressed={feedbackDone?.choice === option.value}
            className={feedbackDone?.choice === option.value ? styles.selected : ""}
            onClick={() => { controller.recordFeedback(option.value); setFeedbackDone({ choice: option.value, at: Date.now() }); }}>{feedbackDone?.choice === option.value ? "✓ " : ""}{option.label}</button>)}
        </div>
        {feedbackDone && <p className={styles.hint} role="status">已记录 {clockLabel(feedbackDone.at)}，谢谢。</p>}
      </details>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <p className={styles.footer}>今天是 {beijingDateKey(now)}（北京时间）· “最晚什么时候用”已经提前 {CARD_BUFFER_MS / 60_000} 分钟留了余量</p>
    </section>
  );
}

export default PersonalInputs;
