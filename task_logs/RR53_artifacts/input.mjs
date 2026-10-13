// ../reset-radar_wt/RR53/src/lib/__tests__/fixtures/planning-memory-input.ts
var DAY = 864e5;
var now = Date.parse("2026-10-13T01:00:00Z");
var account = { observedAt: now, weekly: { remaining: 23, resetsAt: now + 2 * DAY, durationMins: 10080 }, short: { remaining: 60, resetsAt: now + 5 * 36e5, durationMins: 300 }, availableCardCount: 0 };
var model = { version: "platform-v3", cutoff: now, events: [], k: [1, 1, 1], e: [10, 10, 10], lambda0: 0.15, lambda: [0.15, 0.15, 0.15], globalRatePerDay: 0.15, lastEventAt: now - DAY, eventCount: 3, completedGapCount: 2, exposureDays: 30, coverageDays: 30, status: "reference" };
var scenario = (i, bg) => ({ id: `scheduled-${i}${bg ? ":with-platform-background" : ""}`, source: bg ? "platform_background" : "scheduled", title: "test", probability: null, weighted: false, assumptions: [], resultingDeadlines: { weekly: null, short: null }, accountProbability24h: null, events: [{ at: now + (i + 1) * 36e5, incidentId: `incident-${i}`, kind: "scheduled_weekly_supply", certainty: "conditional" }] });
var stressInput = { now, account, cards: [], reviews: [now, now + DAY, now + 2 * DAY], preference: "service", dailyRange: null, sampleDays: 0, platformModel: model, platformRates: [{ id: "low", ratePerDay: 0.08 }, { id: "reference", ratePerDay: 0.15 }, { id: "high", ratePerDay: 0.3 }], inputSnapshotId: "RR53-fixed-comparison", supplyScenarios: Array.from({ length: 18 }, (_, i) => [scenario(i, false), scenario(i, true)]).flat() };
function goldenInputs() {
  const card = { localId: "c1", label: "card", enteredExpiry: null, entryPrecision: "datetime", timezone: "Asia/Shanghai", exactExpiryAt: now + 3 * DAY, safeDeadlineAt: now + 3 * DAY, source: "user", confirmedAt: now - DAY, reconciliation: "consistent", state: "available" };
  return [
    { ...stressInput, supplyScenarios: [scenario(0, false), scenario(0, true)] },
    { ...stressInput, supplyScenarios: [scenario(0, true)], dailyRange: { low: 5, median: 10, high: 20, p95: 30 }, dailySamples: [5, 6, 7, 8, 9, 10, 11], sampleDays: 7, todayBudget: 20 },
    { ...stressInput, platformModel: null, platformRates: [], supplyScenarios: [scenario(0, false)], dailyRange: { low: 5, median: 10, high: 20, p95: 30 }, cards: [card], account: { ...account, availableCardCount: 1 }, preference: "expiry" },
    { ...stressInput, platformModel: null, platformRates: [], supplyScenarios: [], dailyRange: { low: 5, median: 10, high: 20, p95: 30 }, cards: [card], account: { ...account, availableCardCount: 1 }, preference: "save", explicitDemand: [{ start: now, end: now + DAY, weeklyCost: 55, shortCost: 130, weight: 1 }] }
  ];
}
export {
  goldenInputs,
  stressInput
};
