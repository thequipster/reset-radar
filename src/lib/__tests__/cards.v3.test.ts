import { describe, expect, it } from "vitest";
import {
  CARD_BUFFER_MS, appendCardVersion, beijingDateKey, cardReminder, createResetCard,
  emptyPersonalInputs, parseCardExpiry, personalInputsStorageKey, reconcileCardCount, recordCardUse, selectEarliestConfirmedCard,
  updateCardExpiry, withPersonalInputChange, recordPreferenceFeedback, type ResetCard,
} from "../v3/cards";

const ms = (value: string) => Date.parse(value);

function card(localId: string, expiry: string | null, precision: "date" | "datetime" | "unknown" = "date"): ResetCard {
  return createResetCard({
    localId, label: localId, enteredExpiry: expiry, entryPrecision: precision,
    now: ms("2026-10-10T00:00:00Z"),
  });
}

describe("卡截止按北京时间和操作缓冲解释", () => {
  it("C14：只录日期时安全截止是当天北京零点，晚间最后查看提前到前一天", () => {
    const parsed = parseCardExpiry("2026-10-20", "date");
    expect(parsed.exactExpiryAt).toBeNull();
    expect(parsed.safeDeadlineAt).toBe(ms("2026-10-19T16:00:00Z"));
    const item = card("date-only", "2026-10-20");
    const reminder = cardReminder(item, ms("2026-10-18T00:00:00Z"), ["09:00", "20:00"], true);
    expect(reminder?.lastActionAt).toBe(ms("2026-10-19T12:00:00Z"));
  });

  it("C15：精确时间的候选严格早于到期减30分钟，恰好到缓冲线不算可执行", () => {
    const parsed = parseCardExpiry("2026-10-20T10:00", "datetime");
    expect(parsed.exactExpiryAt).toBe(ms("2026-10-20T02:00:00Z"));
    const item = card("exact", "2026-10-20T10:00", "datetime");
    expect(item.safeDeadlineAt).toBe(item.exactExpiryAt);
    const reminder = cardReminder(item, ms("2026-10-19T12:00:00Z"), ["09:00", "09:30", "20:00"], true);
    expect(reminder?.lastActionAt).toBe(ms("2026-10-20T01:00:00Z")); // 北京09:00；09:30恰在缓冲线，严格排除
    expect(CARD_BUFFER_MS).toBe(30 * 60_000);
  });

  it("拒绝无效日期与不可能的本地时间", () => {
    expect(() => parseCardExpiry("2026-02-30", "date")).toThrow();
    expect(() => parseCardExpiry("2026-10-20T25:00", "datetime")).toThrow();
    expect(parseCardExpiry(null, "unknown")).toEqual({ exactExpiryAt: null, safeDeadlineAt: null });
  });
});

describe("库存与用卡身份", () => {
  it("C16：日期式保守截止已过但服务端仍有卡时提示补时间，不判过期", () => {
    const expiredConservatively = card("date-past", "2026-10-10");
    const result = reconcileCardCount([expiredConservatively], 1);
    const reminder = cardReminder(expiredConservatively, ms("2026-10-12T00:00:00Z"), ["09:00", "20:00"], true);
    expect(result.status).toBe("consistent");
    expect(result.cards[0].card?.state).toBe("available");
    expect(reminder?.tier).toBe("needs-confirmation");
  });

  it("精确截止已过也只要求核对，不会自动把卡认定为过期", () => {
    const past = card("past-exact", "2026-10-10T10:00", "datetime");
    const now = ms("2026-10-12T00:00:00Z");
    const result = reconcileCardCount([past], 1);
    expect(result.cards[0].card?.state).toBe("available");
    expect(cardReminder(past, now, ["09:00"], true)?.tier).toBe("needs-confirmation");
  });

  it("C17：先选最早已确认卡；确认记录使用后不会再次选中", () => {
    const later = card("b-later", "2026-10-25");
    const earlier = card("a-earlier", "2026-10-22");
    const inputs = { ...emptyPersonalInputs("acct-a"), cards: [later, earlier] };
    expect(selectEarliestConfirmedCard(inputs.cards, 2, ms("2026-10-12T00:00:00Z"))?.localId).toBe("a-earlier");
    const afterUse = recordCardUse(inputs, "a-earlier", ms("2026-10-12T00:00:00Z"), 2);
    expect(afterUse.useRecords[0].status).toBe("user-recorded");
    expect(afterUse.cards.find((item) => item.localId === "a-earlier")?.state).toBe("used");
    expect(selectEarliestConfirmedCard(afterUse.cards, 2, ms("2026-10-12T00:00:00Z"))?.localId).toBe("b-later");
  });

  it("C18：服务端张数多于台账时补未知截止占位，不编有效期", () => {
    const result = reconcileCardCount([card("known", "2026-10-25")], 2);
    expect(result.status).toBe("supplementing");
    expect(result.placeholderCount).toBe(1);
    expect(result.planningCount).toBe(2);
    expect(result.cards[1]).toMatchObject({ placeholder: true, card: null, label: "有效期未录入的服务端卡" });
  });

  it("C19：服务端张数下降只标冲突，不擅自判定最早卡过期", () => {
    const cards = [card("one", "2026-10-15"), card("two", "2026-10-20"), card("three", "2026-10-25")];
    const result = reconcileCardCount(cards, 2);
    expect(result.status).toBe("conflict");
    expect(result.prompt).toContain("允许选择“我还不确定”");
    expect(result.cards.map((item) => item.card?.state)).toEqual(["available", "available", "available"]);
    expect(selectEarliestConfirmedCard(cards, 2, ms("2026-10-12T00:00:00Z"))).toBeNull();
  });

  it("用卡记录是用户记录，不会改变服务端张数或调用动作", () => {
    const inputs = { ...emptyPersonalInputs("acct-a"), cards: [card("used", "2026-10-25")] };
    const result = recordCardUse(inputs, "used", 1234, 1);
    expect(result.useRecords).toHaveLength(1);
    expect(result.useRecords[0]).toMatchObject({ serverCountAtRecord: 1, status: "user-recorded" });
    expect(result.cardVersions.at(-1)?.after?.state).toBe("used");
  });
});

describe("追加版本和临时工作量", () => {
  it("C20：修改有效期追加新版本，旧版本快照仍保留原截止", () => {
    const before = card("versioned", "2026-10-22");
    const history = appendCardVersion([], before.localId, null, before, 10);
    const updated = updateCardExpiry([before], history, before.localId, "2026-10-24", "date", 20);
    expect(updated.cards[0].safeDeadlineAt).toBe(parseCardExpiry("2026-10-24", "date").safeDeadlineAt);
    expect(updated.history).toHaveLength(2);
    expect(updated.history[0].after?.safeDeadlineAt).toBe(parseCardExpiry("2026-10-22", "date").safeDeadlineAt);
    expect(updated.history[1].before?.safeDeadlineAt).toBe(updated.history[0].after?.safeDeadlineAt);
  });

  it("已记录使用的卡修改截止后仍保持已使用；提醒时段恰好到达算最后时机", () => {
    const initial = card("already-used", "2026-10-22");
    const used = recordCardUse({ ...emptyPersonalInputs("acct-a"), cards: [initial] }, initial.localId, 15, 1);
    const updated = updateCardExpiry(used.cards, used.cardVersions, initial.localId, "2026-10-24", "date", 20);
    expect(updated.cards[0].state).toBe("used");

    const atLastAction = card("at-cutoff", "2026-10-20T10:00", "datetime");
    const lastActionAt = ms("2026-10-20T01:00:00Z");
    expect(cardReminder(atLastAction, lastActionAt, ["09:00"], true)?.tier).toBe("last-chance");
  });

  it("预算版本绑定北京当天，允许超过100个百分点；反馈选择追加版本", () => {
    const day1 = ms("2026-10-12T15:59:00Z");
    const day2 = ms("2026-10-12T16:00:00Z");
    const inputs = withPersonalInputChange(emptyPersonalInputs("acct-a"), "weeklyBudgetPercent", {
      localDate: beijingDateKey(day1), value: 127.5,
    }, day1);
    expect(inputs.weeklyBudgetPercent?.value).toBe(127.5);
    expect(inputs.weeklyBudgetPercent?.localDate).not.toBe(beijingDateKey(day2));
    const feedback = recordPreferenceFeedback(inputs, "too-late", day2);
    expect(feedback.feedback).toEqual([{ choice: "too-late", recordedAt: day2 }]);
    expect(feedback.inputVersions.at(-1)?.field).toBe("feedback");
    expect(feedback.version).toBe(inputs.version + 1);
  });

  it("真实账号各自隔离；未知账号只能落到独立演示分区", () => {
    expect(personalInputsStorageKey("hash-account-a")).not.toBe(personalInputsStorageKey("hash-account-b"));
    expect(personalInputsStorageKey(null)).toContain("demo%3Aanonymous");
    expect(personalInputsStorageKey(null)).not.toBe(personalInputsStorageKey("hash-account-a"));
  });

  it("C33：很忙只记录到北京当天；跨日后不再作为今日选择", () => {
    const now = ms("2026-10-12T16:30:00Z"); // 北京 10/13 00:30
    const inputs = emptyPersonalInputs("acct-a");
    const changed = withPersonalInputChange(inputs, "workloadToday", { localDate: beijingDateKey(now), level: "busy" }, now);
    expect(changed.workloadToday).toEqual({ localDate: "2026-10-13", level: "busy" });
    const nextDay = ms("2026-10-13T16:30:00Z");
    expect(beijingDateKey(nextDay)).toBe("2026-10-14");
    expect(changed.preference).toBeNull();
    expect(changed.inputVersions.at(-1)?.field).toBe("workloadToday");
  });
});
