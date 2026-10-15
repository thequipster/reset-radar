// RR56：把模型结论翻译成人话（纯函数，零业务规则——只措辞，不产生新数字）。
// 用户反馈：说明太专业、看不出“到底哪天用卡”。这里统一回答四个问题：
//   ① 今天最多用多少   ② 卡现在用还是留着、最晚哪天用   ③ 照这个用法撑到几号   ④ 未来 7 天哪天有事。
import { DAY_MS, beijingDayKey } from "../lib/beijing";
import type { ResetCard } from "../lib/v3/cards";
import type { ColdStartAdvice } from "../lib/v3/coldStart";
import { sprintPlan, type SprintPlan, type SprintStep } from "../lib/v3/sprintPlan";

const BEIJING_TZ = "Asia/Shanghai";
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;
export const CARD_BUFFER_MS = 30 * 60_000;

export type Tier = "light" | "normal" | "busy";
export const TIER_LABEL: Record<Tier, string> = { light: "轻松", normal: "正常", busy: "很忙" };
/** 公开默认档：每 7 天 50 / 100 / 200 点 ⇒ 每天约 7% / 14% / 29%。 */
export const TIER_DAILY_PERCENT: Record<Tier, number> = { light: 50 / 7, normal: 100 / 7, busy: 200 / 7 };

export interface PlainAdviceInput {
  now: number;
  status: string;
  updatedAt: string;
  weekly: { remaining: number; resetsAt: number } | null;
  short: { remaining: number; resetsAt: number } | null;
  resetCredits: number | null;
  advice: ColdStartAdvice | null;
  budgetToday: { low: number; high: number } | null;
  expectedDailyUse: number | null;
  tier: Tier;
  basis: "policy_default" | "user_plan" | "learned";
  cards: readonly ResetCard[];
  lastSafeActionAt: number | null;
  planningPending: boolean;
  sampleDays: number;
  /** RR57 冲刺模式：用户说这个周期一定会用卡，只要「哪天用」，不按学到的用量算。 */
  sprint?: { enabled: boolean; hoursPerDay: number } | null;
  cardRisk?: import("../lib/v3/sprintPlan").SprintInput["risk"];
}

export type CardTone = "now" | "wait" | "none" | "fill" | "refresh";
export interface DayMark { kind: "use" | "decide" | "expire" | "reset" | "short" | "empty"; text: string }
export interface StripDay { dateKey: string; label: string; date: string; today: boolean; marks: DayMark[] }
export interface SprintLine { cardId: string; label: string; when: string; why: string; latest: string; useAt: number; reason: SprintStep["reason"] }
export interface PlainAdvice {
  budget: { headline: string; detail: string; percent: number | null };
  card: { tone: CardTone; headline: string; detail: string; cardLabel: string | null; cardId: string | null; deadlineAt: number | null; decideAt: number | null };
  runway: { headline: string; detail: string; exhaustAt: number | null };
  strip: StripDay[];
  /** 冲刺模式开启时的逐卡日程；关闭时为 null。 */
  sprint: { lines: SprintLine[]; note: string; assumptions: string[]; plan: SprintPlan; /** 排不出日程是因为还没登记卡（界面给个去填的入口） */ needCards: boolean } | null;
}

function parts(at: number): { month: string; day: string; hour: string; minute: string } {
  const list = new Intl.DateTimeFormat("zh-CN", { timeZone: BEIJING_TZ, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const get = (type: string) => list.find((p) => p.type === type)?.value ?? "";
  return { month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}
export const clockLabel = (at: number): string => { const p = parts(at); return `${p.hour}:${p.minute}`; };
export const dateLabel = (at: number): string => { const p = parts(at); return `${p.month}/${p.day}`; };
function weekdayOf(at: number): string { return WEEKDAYS[new Date(at + 8 * 3_600_000).getUTCDay()]!; }

/** 今天 / 明天 / 后天 / 周四 10/16 / 10/30（一周以外带日期）。 */
export function relativeDayLabel(now: number, at: number): string {
  const diff = Math.round((Date.parse(`${beijingDayKey(at)}T00:00:00Z`) - Date.parse(`${beijingDayKey(now)}T00:00:00Z`)) / DAY_MS);
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === 2) return "后天";
  if (diff === -1) return "昨天";
  if (diff > 2 && diff < 7) return `${weekdayOf(at)}（${dateLabel(at)}）`;
  return `${dateLabel(at)}（${weekdayOf(at)}）`;
}
/** “明天 09:00”“周四（10/16）20:00”。 */
export function whenLabel(now: number, at: number): string { const day = relativeDayLabel(now, at); return `${day}${day.endsWith("）") ? "" : " "}${clockLabel(at)}`; }

export function percentLabel(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 10) return `${Math.round(value)}%`;
  return `${Number(value.toFixed(1))}%`;
}

function durationLabel(ms: number): string {
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return "不到 1 小时";
  if (hours < 48) return `${hours} 小时`;
  return `${Math.round(hours / 24 * 10) / 10} 天`;
}

export function plainAdvice(input: PlainAdviceInput): PlainAdvice {
  const { now, weekly, short, advice } = input;
  const cardById = (id: string | null) => (id == null ? null : input.cards.find((c) => c.localId === id) ?? null);
  const usable = input.cards.filter((c) => c.state === "available" && c.safeDeadlineAt != null && now < c.safeDeadlineAt - CARD_BUFFER_MS).sort((a, b) => a.safeDeadlineAt! - b.safeDeadlineAt!);
  const earliest = usable[0] ?? null;

  // ① 今天最多用多少
  const percent = input.budgetToday?.high ?? advice?.allocatedWeeklyPointsToday ?? null;
  // 默认档的"今天份额" = 本周剩余 × 今天剩余小时占比（coldStart.allocateColdBudget），忙不忙只是给今天加权。
  const tierWeightSentence = input.tier === "busy" ? "你选了「很忙」，今天多分了一些" : input.tier === "light" ? "你选了「轻松」，今天少分了一些" : "选「很忙」今天会多分一点，「轻松」少一点";
  const basisSentence = input.basis === "learned" ? "按你最近几天的实际用量学出来的。" : input.basis === "user_plan" ? "按你填的今天预算算的。" : `${weekly ? `本周还剩 ${percentLabel(weekly.remaining)}，要撑到 ${whenLabel(now, weekly.resetsAt)} 才恢复，按剩下的时间平均摊到今天就是这个数。` : ""}${tierWeightSentence}。`;
  const budget = percent == null
    ? { percent: null, headline: weekly ? "今天的量还算不出来" : "先拿到额度数据", detail: weekly ? "等规划算完或刷新一次额度。" : "刷新一次额度，拿到周额度和短窗数据后就能给出今天的建议量。" }
    : { percent, headline: `今天最多用约 ${percentLabel(percent)}`, detail: `说的是周额度的百分比。${basisSentence}` };

  // ② 卡：用还是留、最晚哪天
  let card: PlainAdvice["card"];
  const action = advice?.action ?? null;
  const target = cardById(advice?.cardId ?? null) ?? earliest;
  const deadlineAt = target?.safeDeadlineAt == null ? null : target.safeDeadlineAt - CARD_BUFFER_MS;
  const expiresSentence = deadlineAt == null ? "" : `最晚 ${whenLabel(now, deadlineAt)} 前要用掉，过了就作废。`;
  if (action === "refresh" || input.status !== "ok" && input.status !== "stale" && !weekly) {
    card = { tone: "refresh", headline: "数据不新鲜，先刷新一下", detail: `上次读到额度是 ${whenLabel(now, Date.parse(input.updatedAt) || now)}；刷新成功后再给用卡建议。`, cardLabel: null, cardId: null, deadlineAt: null, decideAt: null };
  } else if (action === "reconcile_card") {
    card = { tone: "fill", headline: "先把卡的信息补齐", detail: "有卡的到期时间不清楚，或者张数和服务端对不上，算不出哪天用最划算。到「我的设置」里填一下就行。", cardLabel: null, cardId: null, deadlineAt, decideAt: null };
  } else if (action === "use_card" && target) {
    card = { tone: "now", headline: `现在就用「${target.label}」`, detail: `用完之后周额度和短窗都会回满，重新开始 7 天。${expiresSentence}`, cardLabel: target.label, cardId: target.localId, deadlineAt, decideAt: now };
  } else if ((input.resetCredits === 0 || input.resetCredits == null) && !earliest) {
    card = { tone: "none", headline: input.resetCredits == null ? "卡的数量还没读到" : "手上没有重置卡", detail: weekly ? `周额度 ${whenLabel(now, weekly.resetsAt)} 自动恢复，在那之前照今天的建议量用就行。` : "拿到额度数据后再看。", cardLabel: null, cardId: null, deadlineAt: null, decideAt: null };
  } else if (action === "wait_for_reset" || !earliest) {
    const unknownCount = input.cards.filter((c) => c.state === "available" && c.safeDeadlineAt == null).length;
    const cardSentence = earliest ? "卡先留着。" : unknownCount > 0 ? `有 ${unknownCount} 张卡还没填到期时间，算不出最晚哪天用——有空到「我的设置」补一下，先留着别动。` : "现在没有能用的卡。";
    card = { tone: "wait", headline: unknownCount > 0 && !earliest ? "卡先留着，顺手补一下到期时间" : "这段时间不用动卡", detail: `${weekly ? `周额度 ${whenLabel(now, weekly.resetsAt)} 自动恢复` : "等额度自动恢复"}${short ? `，短窗 ${whenLabel(now, short.resetsAt)} 恢复` : ""}；${cardSentence}`, cardLabel: null, cardId: null, deadlineAt: null, decideAt: weekly?.resetsAt ?? null };
  } else {
    const decideAt = [advice?.nextReviewAt, input.lastSafeActionAt, deadlineAt].filter((t): t is number => t != null && t > now).sort((a, b) => a - b)[0] ?? null;
    card = { tone: "wait", headline: `先留着「${earliest.label}」，${decideAt ? `${relativeDayLabel(now, decideAt)}再看` : "过几天再看"}`, detail: `${expiresSentence}${expiresSentence ? "在那之前" : ""}额度够用就先不用它${input.planningPending ? "（详细比较还在算，几十秒后更新）" : ""}。`, cardLabel: earliest.label, cardId: earliest.localId, deadlineAt, decideAt };
  }

  // ②′ 冲刺模式：用户说这个周期一定会用卡，只排「哪天用」，不看学到的用量。
  let sprint: PlainAdvice["sprint"] = null;
  if (input.sprint?.enabled && weekly && card.tone !== "refresh") {
    const plan = sprintPlan({ now, weekly, cards: input.cards, hoursPerDay: input.sprint.hoursPerDay, risk: input.cardRisk });
    const lines: SprintLine[] = plan.steps.map((step) => {
      const when = step.reason === "now" ? "现在" : whenLabel(now, step.useAt);
      const why = step.reason === "low_risk" ? `先选窗口 ${whenLabel(now,step.windowStart!)} 至 ${whenLabel(now,step.windowEnd!)}，取可激活区间中点；用卡后消耗期间的平台公告参考风险约 ${percentLabel(step.probability!*100)}（不等于账号重置概率）。可从 ${whenLabel(now,step.prepareFrom!)} 开始安排现有额度用量；若准备来不及，不必强行耗尽，先刷新重算。`
        : step.reason === "now" ? "额度已经见底，现在用最不浪费。"
        : step.reason === "exhausted" ? "按最快用法，那时手上的额度刚好用完，用卡最不浪费。"
        : step.reason === "after_reset" ? `先等 ${whenLabel(now, step.waitForResetAt!)} 自动恢复，把恢复的额度用完再用卡；提前用会白白浪费一次自然恢复。`
        : `${step.waitForResetAt ? `先等 ${whenLabel(now, step.waitForResetAt)} 自动恢复，再用恢复的额度；` : ""}卡再晚就过期了，只能那时候用；那时大约还剩 ${step.overwritePercent}% 会被覆盖掉，在那之前尽量多用。`;
      return { cardId: step.cardId, label: step.label, when, why, latest: whenLabel(now, step.latestAt), useAt: step.useAt, reason: step.reason };
    });
    const dayHours = input.sprint.hoursPerDay >= 24 ? "一天 24 小时不停地用" : `一天用 ${input.sprint.hoursPerDay} 小时`;
    const note = input.cardRisk !== undefined ? (plan.steps.length ? "日期由风险窗口先定，你再围绕它安排用量；相同风险窗口不代表已验证的安全期。" : plan.assumptions[0]!) : plan.steps.length === 0
      ? (plan.unknownDeadline.length ? `有 ${plan.unknownDeadline.length} 张卡还没填到期时间，排不出哪天用；到「我的设置」补一下。`
        : (input.resetCredits ?? 0) > 0 ? `服务端说手上有 ${input.resetCredits} 张卡，但这里还没登记它的到期时间；到「我的设置 → 我的卡」加进来，就能算出哪天用。`
        : "现在没有能排日程的卡。")
      : `按${dayHours}算，${plan.exhaustAt != null && plan.exhaustAt > now ? `现在这 ${percentLabel(weekly.remaining)} 大约 ${whenLabel(now, plan.exhaustAt)} 用完；` : ""}每用一张卡回满后再过约 ${Math.round(100 / (100 / plan.rateHoursPerWeek * Math.min(24, input.sprint.hoursPerDay) / 24))} 小时用完。`;
    sprint = { lines, note, assumptions: plan.assumptions, plan, needCards: plan.steps.length === 0 && (plan.unknownDeadline.length > 0 || (input.resetCredits ?? 0) > 0) };
    const first = plan.steps[0];
    if (!first && input.cardRisk !== undefined) card = {tone:"wait",headline:"先更新公告或等待合适窗口",detail:note,cardLabel:null,cardId:null,deadlineAt:null,decideAt:null};
    if (first) {
      const c = input.cards.find((x) => x.localId === first.cardId) ?? null;
      const rest = plan.steps.length > 1 ? `之后 ${plan.steps.slice(1).map((st) => `「${st.label}」${relativeDayLabel(now, st.useAt)}`).join("、")}。` : "";
      if (first.reason === "now") card = { tone: "now", headline: `现在就用「${first.label}」`, detail: `你选了「这周期一定用卡」：额度已经见底，现在用最不浪费。最晚 ${whenLabel(now, first.latestAt)}。${rest}`, cardLabel: first.label, cardId: first.cardId, deadlineAt: c?.safeDeadlineAt == null ? null : c.safeDeadlineAt - CARD_BUFFER_MS, decideAt: now };
      else card = { tone: "wait", headline: `「${first.label}」建议 ${whenLabel(now, first.useAt)} 用`, detail: `${lines[0]!.why}最晚 ${whenLabel(now, first.latestAt)}。${rest}`, cardLabel: first.label, cardId: first.cardId, deadlineAt: c?.safeDeadlineAt == null ? null : c.safeDeadlineAt - CARD_BUFFER_MS, decideAt: first.useAt };
    }
  }

  // ③ 照这个用法撑到几号
  let runway: PlainAdvice["runway"];
  if (!weekly) runway = { headline: "还没有额度数据", detail: "刷新一次就有了。", exhaustAt: null };
  else if (weekly.remaining <= 0) runway = { headline: "周额度已经用完", detail: `${whenLabel(now, weekly.resetsAt)} 恢复${card.tone === "now" ? "，或者现在用卡立刻回满" : ""}。`, exhaustAt: now };
  else if (input.expectedDailyUse == null || input.expectedDailyUse <= 0) runway = { headline: "还不知道你一天用多少", detail: `选一下今天忙不忙，或者再用几天让它自己学（已学 ${input.sampleDays} 天，满 7 天开始按你的习惯算）。周额度 ${whenLabel(now, weekly.resetsAt)} 恢复。`, exhaustAt: null };
  else {
    const exhaustAt = now + weekly.remaining / input.expectedDailyUse * DAY_MS;
    if (exhaustAt >= weekly.resetsAt) runway = { headline: `照这个用法，撑到 ${relativeDayLabel(now, weekly.resetsAt)}额度恢复没问题`, detail: `周额度 ${whenLabel(now, weekly.resetsAt)} 恢复${short ? `；短窗还剩 ${percentLabel(short.remaining)}，${whenLabel(now, short.resetsAt)} 恢复` : ""}。`, exhaustAt };
    else runway = { headline: `照这个用法，大约 ${whenLabel(now, exhaustAt)} 就会用完`, detail: `额度要到 ${whenLabel(now, weekly.resetsAt)} 才恢复，中间空 ${durationLabel(weekly.resetsAt - exhaustAt)}。要么省着点，要么到时候用卡。`, exhaustAt };
  }

  if (sprint && sprint.plan.exhaustAt != null && weekly) {
    const first = sprint.plan.steps[0];
    const exhaustAt = sprint.plan.exhaustAt;
    const dayHours = input.sprint!.hoursPerDay >= 24 ? "不停地用" : `一天用 ${input.sprint!.hoursPerDay} 小时`;
    runway = weekly.remaining <= 0
      ? { headline: "周额度已经用完", detail: first ? `按日程 ${whenLabel(now, first.useAt)} 用「${first.label}」回满。` : `${whenLabel(now, weekly.resetsAt)} 自动恢复。`, exhaustAt: now }
      : { headline: `${dayHours}，最快 ${whenLabel(now, exhaustAt)} 能把这 ${percentLabel(weekly.remaining)} 用完`, detail: first ? `${first.useAt <= exhaustAt + 60_000 ? "用完就" : `${relativeDayLabel(now, first.useAt)}`}用「${first.label}」回满，再过约 ${Math.round((first.burnedOutAt - first.useAt) / 3_600_000)} 小时又能用完一整周的量。` : `周额度 ${whenLabel(now, weekly.resetsAt)} 自动恢复。`, exhaustAt };
  }

  if (sprint && input.cardRisk !== undefined) {
    const first=sprint.plan.steps[0];
    budget.percent=null; budget.headline=first?`围绕 ${whenLabel(now,first.useAt)} 用卡安排用量`:"暂不安排冲刺用量";
    budget.detail="日期不是按当前用量倒推；可以灵活调整工作安排，不必为了耗尽额度而无意义地使用。";
    runway={headline:first?"先定用卡时间，再安排消耗":"暂无合适的用卡窗口",detail:first?`参考准备起点 ${whenLabel(now,first.prepareFrom!)}；用卡前刷新公告，确认剩余额度与到期时间。`:sprint.note,exhaustAt:null};
  }

  // ④ 未来 7 天
  const strip: StripDay[] = [];
  for (let i = 0; i < 7; i += 1) {
    const at = now + i * DAY_MS;
    const dateKey = beijingDayKey(at);
    strip.push({ dateKey, label: i === 0 ? "今天" : i === 1 ? "明天" : i === 2 ? "后天" : weekdayOf(at), date: dateLabel(at), today: i === 0, marks: [] });
  }
  const mark = (at: number | null, m: DayMark) => { if (at == null) return; const day = strip.find((d) => d.dateKey === beijingDayKey(at)); if (day && !day.marks.some((x) => x.kind === m.kind && x.text === m.text)) day.marks.push(m); };
  if (sprint) for (const step of sprint.plan.steps) mark(step.useAt, { kind: "use", text: `用「${step.label}」${step.reason === "now" ? "" : ` ${clockLabel(step.useAt)}`}` });
  else if (card.tone === "now") mark(now, { kind: "use", text: `用「${card.cardLabel}」` });
  else if (card.tone === "wait" && card.decideAt != null && card.cardLabel) mark(card.decideAt, { kind: "decide", text: "再看要不要用卡" });
  for (const c of usable) mark(c.safeDeadlineAt! - CARD_BUFFER_MS, { kind: "expire", text: `「${c.label}」最后期限 ${clockLabel(c.safeDeadlineAt! - CARD_BUFFER_MS)}` });
  if (weekly) mark(weekly.resetsAt, { kind: "reset", text: `周额度恢复 ${clockLabel(weekly.resetsAt)}` });
  if (short && beijingDayKey(short.resetsAt) !== beijingDayKey(weekly?.resetsAt ?? 0)) mark(short.resetsAt, { kind: "short", text: `短窗恢复 ${clockLabel(short.resetsAt)}` });
  if (!sprint && runway.exhaustAt != null && weekly && runway.exhaustAt < weekly.resetsAt && runway.exhaustAt > now) mark(runway.exhaustAt, { kind: "empty", text: "可能用完" });
  return { budget, card, runway, strip, sprint };
}
