import { describe, expect, it } from "vitest";
import { plainAdvice, relativeDayLabel, whenLabel, type PlainAdviceInput } from "../plainAdvice";
import type { ResetCard } from "../../lib/v3/cards";
import type { ColdStartAdvice } from "../../lib/v3/coldStart";

const now = Date.parse("2026-10-14T10:00:00+08:00"); // 周三
const H = 3_600_000, D = 24 * H;
const card = (localId: string, label: string, safeDeadlineAt: number | null, state: ResetCard["state"] = "available"): ResetCard => ({ localId, label, enteredExpiry: null, entryPrecision: "datetime", timezone: "Asia/Shanghai", exactExpiryAt: safeDeadlineAt, safeDeadlineAt, source: "user", confirmedAt: now - D, reconciliation: "consistent", state });
const advice = (over: Partial<ColdStartAdvice>): ColdStartAdvice => ({ action: "hold_card", headline: "x", allocatedWeeklyPointsToday: 12.4, nextReviewAt: now + 10 * H, trigger: null, basis: "policy_default", expectedConsumption: 100 / 7, assumptions: [], cardId: null, ...over });
const base: PlainAdviceInput = { now, status: "ok", updatedAt: new Date(now - 60_000).toISOString(), weekly: { remaining: 29, resetsAt: now + 2 * D + 2 * H }, short: { remaining: 64, resetsAt: now + 3 * H }, resetCredits: 1, advice: advice({}), budgetToday: null, expectedDailyUse: 100 / 7, tier: "normal", basis: "policy_default", cards: [card("c1", "备用卡", now + 4 * D + 12 * H)], lastSafeActionAt: null, planningPending: false, sampleDays: 2 };

describe("日期用人话", () => {
  it("今天/明天/后天/周几（日期）", () => {
    expect(relativeDayLabel(now, now)).toBe("今天");
    expect(relativeDayLabel(now, now + 15 * H)).toBe("明天");
    expect(relativeDayLabel(now, now + 2 * D)).toBe("后天");
    expect(relativeDayLabel(now, now + 3 * D)).toBe("周六（10/17）");
    expect(relativeDayLabel(now, now + 9 * D)).toBe("10/23（周五）");
    expect(whenLabel(now, now + 3 * D + 10 * H)).toBe("周六（10/17）20:00");
  });
});

describe("plainAdvice", () => {
  it("今天的量：周额度百分比 + 档位解释；留卡时说清最晚哪天用", () => {
    const out = plainAdvice(base);
    expect(out.budget.headline).toBe("今天最多用约 12%");
    expect(out.budget.detail).toContain("本周还剩 29%");
    expect(out.budget.detail).toContain("按剩下的时间平均摊到今天就是这个数");expect(out.budget.detail).toContain("「很忙」今天会多分一点");
    expect(out.card.tone).toBe("wait");
    expect(out.card.headline).toBe("先留着「备用卡」，今天再看");
    expect(out.card.detail).toContain("最晚 周日（10/18）21:30 前要用掉，过了就作废");
    expect(out.runway.headline).toContain("大约 后天 10:43 就会用完");
    expect(out.runway.detail).toContain("要么省着点，要么到时候用卡");
    const marks = out.strip.map((d) => `${d.label}:${d.marks.map((m) => m.kind).join("+")}`);
    expect(out.strip).toHaveLength(7);
    expect(marks[0]).toBe("今天:decide+short");
    expect(marks[2]).toBe("后天:reset+empty");
    expect(marks[4]).toBe("周日:expire");
  });
  it("现在就用：标题点名卡，7 天条今天标“用卡”", () => {
    const out = plainAdvice({ ...base, advice: advice({ action: "use_card", cardId: "c1" }) });
    expect(out.card.tone).toBe("now");
    expect(out.card.headline).toBe("现在就用「备用卡」");
    expect(out.card.detail).toContain("重新开始 7 天");
    expect(out.strip[0]!.marks[0]).toEqual({ kind: "use", text: "用「备用卡」" });
  });
  it("没卡 / 卡数未知 / 要补信息 / 要刷新 各有一句话", () => {
    expect(plainAdvice({ ...base, resetCredits: 0, cards: [] }).card).toMatchObject({ tone: "none", headline: "手上没有重置卡" });
    expect(plainAdvice({ ...base, resetCredits: null, cards: [] }).card.headline).toBe("卡的数量还没读到");
    expect(plainAdvice({ ...base, advice: advice({ action: "reconcile_card" }) }).card).toMatchObject({ tone: "fill", headline: "先把卡的信息补齐" });
    const refresh = plainAdvice({ ...base, status: "stale", advice: advice({ action: "refresh" }) });
    expect(refresh.card.tone).toBe("refresh");
    expect(refresh.card.detail).toContain("上次读到额度是 今天 09:59");
  });
  it("学到的用量优先于默认档；撑得到恢复时直接说没问题", () => {
    const out = plainAdvice({ ...base, basis: "learned", budgetToday: { low: 8, high: 9.6 }, expectedDailyUse: 5 });
    expect(out.budget.headline).toBe("今天最多用约 9.6%");
    expect(out.budget.detail).toContain("实际用量学出来的");
    expect(out.runway.headline).toBe("照这个用法，撑到 后天额度恢复没问题");
    expect(out.strip.some((d) => d.marks.some((m) => m.kind === "empty"))).toBe(false);
  });
  it("没有额度数据时不编数字", () => {
    const out = plainAdvice({ ...base, weekly: null, short: null, advice: null, expectedDailyUse: null });
    expect(out.budget.percent).toBeNull();
    expect(out.budget.headline).toBe("先拿到额度数据");
    expect(out.runway.headline).toBe("还没有额度数据");
  });
});

describe("plainAdvice 冲刺模式（这周期一定用卡）", () => {
  it("开关关着：输出 sprint=null，用卡建议仍按模型", () => {
    expect(plainAdvice({ ...base, sprint: { enabled: false, hoursPerDay: 24 } }).sprint).toBeNull();
  });
  it("开关开着：按最快用法排日程——29% 不停地用 8.7 小时用完，那时用卡；日历标出用卡日；撑到几号改成最快用完时刻", () => {
    const out = plainAdvice({ ...base, sprint: { enabled: true, hoursPerDay: 24 } });
    expect(out.sprint).not.toBeNull();
    expect(out.sprint!.lines).toHaveLength(1);
    expect(out.sprint!.lines[0]!.label).toBe("备用卡");
    // 29% / (100/30 每小时) = 8.7 小时 → 今天 18:42；自然恢复在 后天 12:00，距离 > 30 小时，所以用完就用。
    expect(out.sprint!.lines[0]!.when).toBe("今天 18:42");
    expect(out.sprint!.lines[0]!.reason).toBe("exhausted");
    expect(out.card.tone).toBe("wait");
    expect(out.card.headline).toBe("「备用卡」建议 今天 18:42 用");
    expect(out.card.cardId).toBe(base.cards[0]!.localId);
    expect(out.card.detail).toContain("刚好用完");
    expect(out.card.detail).toContain("最晚 周日（10/18）21:30");
    expect(out.runway.headline).toBe("不停地用，最快 今天 18:42 能把这 29% 用完");
    expect(out.strip[0]!.marks.some((m) => m.kind === "use" && m.text === "用「备用卡」 18:42")).toBe(true);
    expect(out.strip.some((d) => d.marks.some((m) => m.kind === "empty"))).toBe(false);
    expect(out.sprint!.note).toContain("一天 24 小时不停地用");
    expect(out.sprint!.assumptions[0]).toContain("30 小时");
  });
  it("每天 12 小时：用完时间拉长一倍（明天 03:24）；离自然恢复不到 60 小时 → 等恢复，但卡先到期 → 最晚时刻用并说清会覆盖多少", () => {
    const out = plainAdvice({ ...base, sprint: { enabled: true, hoursPerDay: 12 } });
    expect(out.runway.headline).toBe("一天用 12 小时，最快 明天 03:24 能把这 29% 用完");
    expect(out.sprint!.note).toContain("一天用 12 小时");
    const line = out.sprint!.lines[0]!;
    expect(line.reason).toBe("deadline");
    expect(line.when).toBe("周日（10/18）21:30");
    expect(line.why).toContain("先等 后天 12:00 自动恢复");
    expect(line.why).toContain("还剩 4% 会被覆盖掉");
    expect(out.card.headline).toBe("「备用卡」建议 周日（10/18）21:30 用");
  });
  it("额度已见底：现在就用，并给出记一下按钮需要的 cardId", () => {
    const out = plainAdvice({ ...base, weekly: { remaining: 0, resetsAt: now + 2 * D }, sprint: { enabled: true, hoursPerDay: 24 } });
    expect(out.card.tone).toBe("now");
    expect(out.card.headline).toBe("现在就用「备用卡」");
    expect(out.card.cardId).toBe(base.cards[0]!.localId);
    expect(out.strip[0]!.marks[0]).toMatchObject({ kind: "use", text: "用「备用卡」" });
  });
  it("没有能排的卡：说明原因，不编日程", () => {
    const out = plainAdvice({ ...base, cards: [], resetCredits: 0, sprint: { enabled: true, hoursPerDay: 24 } });
    expect(out.sprint!.lines).toEqual([]);
    expect(out.sprint!.note).toBe("现在没有能排日程的卡。");
    expect(out.sprint!.needCards).toBe(false);
    expect(out.card.tone).toBe("none");
    // 服务端说有卡、本地还没登记：提示去登记，并给界面一个入口标志
    const unregistered = plainAdvice({ ...base, cards: [], resetCredits: 3, sprint: { enabled: true, hoursPerDay: 24 } });
    expect(unregistered.sprint!.note).toContain("手上有 3 张卡，但这里还没登记它的到期时间");
    expect(unregistered.sprint!.needCards).toBe(true);
  });
});

