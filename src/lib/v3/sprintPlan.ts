// RR57 冲刺模式：用户明确「这个周期我一定会用卡」，问的不是「用不用」而是「哪天用」。
// 用户给的尺度：一个短窗（5 小时）全用完 = 周额度的 1/6，所以连续用约 30 小时就能用完一整周额度。
// 这里不用学到的日用量，而是按「尽快用完」的最快用法排日程。纯函数、无随机、可手算。
import { DAY_MS, HOUR_MS } from "../beijing";
import type { ResetCard } from "./cards";

export const CARD_BUFFER_MS = 30 * 60_000;
/** 短窗时长 5 小时；一个短窗用完 = 周额度 1/6 ⇒ 30 小时用完一周（用户给的尺度，不是平台公告）。 */
export const SPRINT_SHORT_WINDOW_HOURS = 5;
export const SPRINT_WINDOWS_PER_WEEK = 6;
export const SPRINT_HOURS_PER_WEEK = SPRINT_SHORT_WINDOW_HOURS * SPRINT_WINDOWS_PER_WEEK;
export const SPRINT_HOURS_OPTIONS = [8, 12, 16, 24] as const;
export type SprintHoursPerDay = (typeof SPRINT_HOURS_OPTIONS)[number];
export const WEEK_MS = 7 * DAY_MS;

export interface SprintInput {
  now: number;
  weekly: { remaining: number; resetsAt: number } | null;
  cards: readonly ResetCard[];
  /** 每天实际能开着用几小时：24 = 不停地用（字面的 30 小时），8/12/16 按比例拉长。 */
  hoursPerDay: number;
  /** Omitted only by legacy callers. Current UI always supplies risk-first inputs. */
  risk?: { ratePerDay: number | null; fetchedAt: number; scheduledAt: number | null };
}
export type SprintReason = "now" | "exhausted" | "after_reset" | "deadline" | "low_risk";
export interface SprintStep {
  cardId: string;
  label: string;
  /** 建议用卡时刻。 */
  useAt: number;
  /** 最晚时刻（安全截止减 30 分钟缓冲）。 */
  latestAt: number;
  reason: SprintReason;
  windowStart?: number;
  windowEnd?: number;
  probability?: number;
  prepareFrom?: number;
  /** 用卡那一刻还剩、会被覆盖掉的周额度百分比（最快用法下的估计）。 */
  overwritePercent: number;
  /** 这张卡回满的 100% 预计何时用完（下一张卡的参考时刻）。 */
  burnedOutAt: number;
  /** 用卡之前会经过的最近一次自然恢复时刻（没有则 null；reason=after_reset 时一定有）。 */
  waitForResetAt: number | null;
}
export interface SprintPlan {
  rateHoursPerWeek: number;
  hoursPerDay: number;
  /** 当前额度按最快用法什么时候用完（考虑自然恢复）。 */
  exhaustAt: number | null;
  steps: SprintStep[];
  /** 可用但没有到期时间、排不进日程的卡。 */
  unknownDeadline: ResetCard[];
  assumptions: string[];
}

/** 每小时（挂钟）能用掉的周额度百分比。 */
export function sprintRatePerHour(hoursPerDay: number): number {
  const activeShare = Math.min(24, Math.max(1, hoursPerDay)) / 24;
  return 100 / SPRINT_HOURS_PER_WEEK * activeShare;
}

interface QuotaState { at: number; quota: number; nextReset: number | null }

/** 从 state 起按最快用法推进到 at，中途遇自然恢复回满；返回那一刻剩余与下一次自然恢复。 */
function advance(state: QuotaState, at: number, rate: number): QuotaState {
  let { at: t, quota, nextReset } = state;
  while (nextReset != null && nextReset <= at) { quota = 100; t = nextReset; nextReset += WEEK_MS; }
  quota = Math.max(0, quota - rate * (at - t) / HOUR_MS);
  return { at, quota, nextReset };
}

/** 从 state 起第一次把额度用光的时刻（中途自然恢复会续上）。 */
function exhaustion(state: QuotaState, rate: number): number {
  let { at: t, quota, nextReset } = state;
  for (let guard = 0; guard < 64; guard++) {
    const candidate = t + quota / rate * HOUR_MS;
    if (nextReset == null || candidate < nextReset) return candidate;
    quota = 100; t = nextReset; nextReset += WEEK_MS;
  }
  return t + quota / rate * HOUR_MS;
}

/**
 * 用卡的净收益（百分点）：用卡会把周期重新锚到 u+7 天，相当于把整条周期线提前了 (下次自然恢复 − u)，
 * 最多多用 100%；代价是 u 时刻还剩的额度被覆盖。gain(u) = min(100, rate·(nextReset−u)) − quota(u)。
 */
function gainAt(state: QuotaState, u: number, rate: number): number {
  const s = advance(state, u, rate);
  const shift = s.nextReset == null ? 100 : Math.min(100, rate * (s.nextReset - u) / HOUR_MS);
  return shift - s.quota;
}

export function sprintPlan(input: SprintInput): SprintPlan {
  if (input.risk !== undefined) return riskFirstPlan(input);
  const rate = sprintRatePerHour(input.hoursPerDay);
  const assumptions = [
    `按最快用法算：一个 ${SPRINT_SHORT_WINDOW_HOURS} 小时短窗用完 = 周额度的 1/${SPRINT_WINDOWS_PER_WEEK}，连续用 ${SPRINT_HOURS_PER_WEEK} 小时用完一整周。`,
    input.hoursPerDay >= 24 ? "按一天 24 小时不停地用来算。" : `按一天能用 ${input.hoursPerDay} 小时来折算成天数。`,
    "用卡会把周额度和短窗回满，并从用卡那一刻重新起算 7 天；所以刚好用完再用最不浪费，而快要自然恢复时先等恢复。",
  ];
  const available = input.cards.filter((c) => c.state === "available");
  const unknownDeadline = available.filter((c) => c.safeDeadlineAt == null);
  const usable = available
    .filter((c) => c.safeDeadlineAt != null && input.now < c.safeDeadlineAt - CARD_BUFFER_MS)
    .sort((a, b) => a.safeDeadlineAt! - b.safeDeadlineAt! || a.localId.localeCompare(b.localId));
  if (!input.weekly) return { rateHoursPerWeek: SPRINT_HOURS_PER_WEEK, hoursPerDay: input.hoursPerDay, exhaustAt: null, steps: [], unknownDeadline, assumptions };

  let state: QuotaState = { at: input.now, quota: Math.max(0, Math.min(100, input.weekly.remaining)), nextReset: Number.isFinite(input.weekly.resetsAt) && input.weekly.resetsAt > input.now ? input.weekly.resetsAt : null };
  const exhaustAt = exhaustion(state, rate);
  const steps: SprintStep[] = [];
  for (const card of usable) {
    const latestAt = card.safeDeadlineAt! - CARD_BUFFER_MS;
    const earliest = state.at;
    // 候选时刻：现在/上一张卡之后、当前额度用光、每次自然恢复后再用光、最晚时刻。取净收益最大者，并列取最早。
    const candidates = new Set<number>([earliest, latestAt]);
    const firstExhaust = exhaustion(state, rate);
    if (firstExhaust <= latestAt) candidates.add(firstExhaust);
    for (let reset = state.nextReset, guard = 0; reset != null && reset <= latestAt && guard < 8; reset += WEEK_MS, guard++) {
      const afterReset = reset + 100 / rate * HOUR_MS;
      candidates.add(Math.min(afterReset, latestAt));
    }
    // 并列时先挑“被覆盖掉的额度最少”的（按最快用法算，用光前任何时刻净收益相同；但用得越早、真实用量
    // 不到最快时白白覆盖掉的就越多），再挑最早。
    let best: { at: number; gain: number; waste: number } | null = null;
    for (const at of [...candidates].filter((t) => t >= earliest && t <= latestAt).sort((a, b) => a - b)) {
      const gain = gainAt(state, at, rate);
      const waste = advance(state, at, rate).quota;
      if (!best || gain > best.gain + 1e-9 || (Math.abs(gain - best.gain) <= 1e-9 && waste < best.waste - 1e-9)) best = { at, gain, waste };
    }
    const useAt = best?.at ?? Math.max(earliest, Math.min(latestAt, firstExhaust));
    const atUse = advance(state, useAt, rate);
    const passedReset = state.nextReset != null && state.nextReset <= useAt ? state.nextReset : null;
    // 用卡那一刻手上还剩额度（>0.5%）说明是被最晚期限卡住了，不是“刚好用完”。
    const reason: SprintReason = useAt - input.now < HOUR_MS ? "now"
      : atUse.quota > 0.5 ? "deadline"
      : passedReset != null ? "after_reset" : "exhausted";
    const burnedOutAt = useAt + 100 / rate * HOUR_MS;
    steps.push({ cardId: card.localId, label: card.label, useAt, latestAt, reason, overwritePercent: Math.max(0, Math.round(atUse.quota)), burnedOutAt, waitForResetAt: passedReset });
    // 用卡后：回满、周期重新锚到 useAt + 7 天。
    state = { at: useAt, quota: 100, nextReset: useAt + WEEK_MS };
  }
  return { rateHoursPerWeek: SPRINT_HOURS_PER_WEEK, hoursPerDay: input.hoursPerDay, exhaustAt, steps, unknownDeadline, assumptions };
}

/** Risk-first scheduling: remaining quota never determines the activation date.
 * P0/D60 is stationary: equal-length unannounced windows have equal risk.
 * Known resets split windows; equal-risk windows prefer the widest, then their midpoint.
 * This is an announcement risk reference, NOT a calibrated account-reset probability.
 */
export function riskFirstPlan(input: SprintInput): SprintPlan {
  const rate = sprintRatePerHour(input.hoursPerDay);
  const duration = 100 / rate * HOUR_MS;
  const risk = input.risk;
  const available = input.cards.filter(c => c.state === "available");
  const assumptions = [
    "先选风险窗口，再安排用量；当前剩余额度不决定用卡日期。",
    "当前正式模型是恒定发生率，同等时长的未知公告风险相同，不能声称哪一天更安全；持平时取避开已知重置的宽窗口中点。",
    "概率指平台公告，不等于账号一定回满；低风险也不保证不会临时重置。激活前必须重新刷新公告与额度。",
    "预留用卡后消耗整张卡额度的时间；30小时活跃用量是假设，不是平台保证。最多规划未来14天。"
  ];
  const result: SprintPlan = {rateHoursPerWeek: SPRINT_HOURS_PER_WEEK, hoursPerDay: input.hoursPerDay,
    exhaustAt: null, steps: [], unknownDeadline: available.filter(c => c.safeDeadlineAt == null), assumptions};
  if (!risk || risk.ratePerDay == null || !Number.isFinite(risk.ratePerDay) || risk.ratePerDay < 0 ||
      !Number.isFinite(risk.fetchedAt) || input.now - risk.fetchedAt > 30 * 60_000 || risk.fetchedAt > input.now + 60_000) {
    assumptions.unshift("公告历史缺失或超过30分钟未成功更新：先刷新公告，暂不指定用卡时间。");
    return result;
  }
  const referenceRisk = 1-Math.exp(-risk.ratePerDay*duration/DAY_MS);
  assumptions.push("低风险筛选上限暂定为35%的消耗期间公告风险，是可调整的规划偏好，不是已验证阈值；已知重置前后各避让12小时。 ");
  if (referenceRisk > 0.35) { assumptions.unshift("当前消耗期间公告参考风险超过35%，暂不建议为了用卡而冲刺。"); return result; }
  let earliest = input.now;
  for (const card of available.filter(c => c.safeDeadlineAt != null && c.safeDeadlineAt - CARD_BUFFER_MS > input.now)
      .sort((a,b) => a.safeDeadlineAt! - b.safeDeadlineAt! || a.localId.localeCompare(b.localId))) {
    const latestAt = card.safeDeadlineAt! - CARD_BUFFER_MS;
    const end = Math.min(input.now + 14 * DAY_MS, latestAt + duration);
    let windows = [{from: earliest, to: end}];
    // A known upcoming platform reset is not a probabilistic background event.
    const resets = [risk.scheduledAt, input.weekly?.resetsAt].filter((at): at is number => at != null && Number.isFinite(at) && at > input.now);
    for (const at of resets) {
      const left = at - 12 * HOUR_MS, right = at + 12 * HOUR_MS;
      windows = windows.flatMap(w => right <= w.from || left >= w.to ? [w] :
        [{from:w.from,to:Math.min(w.to,left)},{from:Math.max(w.from,right),to:w.to}].filter(x=>x.to>x.from));
    }
    const feasible = windows.map(w => ({...w, last:Math.min(latestAt,w.to-duration)}))
      .filter(w => w.last >= w.from).sort((a,b)=>(b.last-b.from)-(a.last-a.from)||a.from-b.from);
    const window = feasible[0];
    if (!window) continue;
    const useAt = window.from + (window.last-window.from)/2;
    const probability = 1-Math.exp(-risk.ratePerDay*duration/DAY_MS);
    const prepareHours = (input.weekly?.remaining ?? 0) / rate;
    result.steps.push({cardId:card.localId,label:card.label,useAt,latestAt,reason:"low_risk",
      overwritePercent:0,burnedOutAt:useAt+duration,waitForResetAt:null,
      windowStart:window.from,windowEnd:window.to,probability,
      prepareFrom:Math.max(input.now,useAt-prepareHours*HOUR_MS)});
    earliest = useAt + duration;
  }
  if (!result.steps.length) assumptions.unshift("目前没有能容纳完整消耗时长且避开已知重置的窗口；不强行推荐用卡。");
  return result;
}
