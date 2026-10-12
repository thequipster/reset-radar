import { describe, expect, it } from "vitest";
import { aggregateUsageDays, buildUsageObservations, type SnapshotV3 } from "../v3/observations";
import { beijingDayFloor, DAY_MS } from "../beijing";

const start = Date.parse("2026-10-10T15:55:00Z"); // 北京 10/10 23:55
const snap = (at: number, weeklyUsed: number, shortUsed: number, patch: Partial<SnapshotV3> = {}): SnapshotV3 => ({
  id: `s-${at}`, observedAt: at, accountKey: "account-a", sourceVersion: "app-server-v1",
  weekly: { generation: "week-1", usedPercent: weeklyUsed },
  short: { generation: "short-1", usedPercent: shortUsed }, ...patch,
});

describe("v3 account usage observations", () => {
  it("same-generation pair records known consumption and coverage for both windows", () => {
    const rows = buildUsageObservations([snap(start, 20, 5), snap(start + 5 * 60_000, 23, 9)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ accountKey: "account-a", fromAt: start, toAt: start + 5 * 60_000 });
    expect(rows[0]?.weekly).toMatchObject({ generation: "week-1", knownConsumption: 3,
      coverageMs: 5 * 60_000, crossedReset: false, isLowerBound: false });
    expect(rows[0]?.short).toMatchObject({ generation: "short-1", knownConsumption: 4,
      crossedReset: false, isLowerBound: false });
  });

  it("generation rollover retains lower-bound evidence, not a negative or false net cost", () => {
    const rows = buildUsageObservations([
      snap(start, 80, 60),
      snap(start + 5 * 60_000, 10, 8, { weekly: { generation: "week-2", usedPercent: 10 }, short: { generation: "short-2", usedPercent: 8 } }),
    ]);
    expect(rows[0]?.weekly).toMatchObject({ knownConsumption: 0, crossedReset: true, isLowerBound: true });
    expect(rows[0]?.short).toMatchObject({ knownConsumption: 0, crossedReset: true, isLowerBound: true });
  });

  it("long gap and missing account/window never fabricate coverage", () => {
    const rows = buildUsageObservations([
      snap(start, 20, 20),
      snap(start + 20 * 60_000, 25, 25),
      snap(start + 25 * 60_000, 30, 30),
      snap(start + 30 * 60_000, 35, 35, { weekly: null }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ fromAt: start + 20 * 60_000, toAt: start + 25 * 60_000 });
    expect(rows[1]?.weekly).toBeNull();
    expect(rows[1]?.short?.coverageMs).toBe(5 * 60_000);
  });

  it("cross-midnight cost is apportioned as an estimate and not marked a complete day", () => {
    const rows = buildUsageObservations([snap(start, 20, 10), snap(start + 10 * 60_000, 30, 16)]);
    const cutoff = beijingDayFloor(start + 2 * DAY_MS);
    const days = aggregateUsageDays(rows, cutoff);
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ weeklyCost: 5, shortCost: 3, estimated: true,
      weeklyComplete: false, shortComplete: false });
    expect(days[1]).toMatchObject({ weeklyCost: 5, shortCost: 3, estimated: true,
      weeklyComplete: false, shortComplete: false });
  });

  it("capacity ceiling is a lower bound and makes a day ineligible as unconstrained demand", () => {
    const rows = buildUsageObservations([snap(start, 98, 95), snap(start + 5 * 60_000, 100, 100)]);
    expect(rows[0]?.weekly).toMatchObject({ knownConsumption: 2, isLowerBound: true, capacityConstrained: true });
    expect(rows[0]?.short).toMatchObject({ knownConsumption: 5, isLowerBound: true, capacityConstrained: true });
  });

  it("keeps weekly demand complete when the short window re-anchors inside that day", () => {
    const dayStart = Date.parse("2026-10-09T16:00:00Z"); // 北京 10/10 00:00
    const rows: SnapshotV3[] = [];
    for (let i = 0; i <= 144; i += 1) {
      const at = dayStart + i * 10 * 60_000;
      const shortReset = i >= 72;
      rows.push(snap(at, 10 + i / 20, shortReset ? (i - 72) / 2 : i / 2, {
        short: { generation: shortReset ? "short-2" : "short-1", usedPercent: shortReset ? (i - 72) / 2 : i / 2 },
      }));
    }
    const observations = buildUsageObservations(rows);
    const day = aggregateUsageDays(observations, dayStart + DAY_MS + 60_000)[0];
    expect(day).toMatchObject({ weeklyComplete: true, weeklyCrossedReset: false,
      shortComplete: false, shortCrossedReset: true, crossedReset: false });
  });
});
