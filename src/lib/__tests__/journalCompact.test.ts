import { describe, expect, it } from "vitest";
import { compactCardsLog, slimPlanningRecord } from "../v3/journalCompact";

const scenario = (id: string) => ({ id, deltaLoss: 0.1, deltaConsumedWeekly: 1.5, spent: 1, missedSafeDeadline: 0, lossTail: 0.3, consumedWeekly: 20, detail: "x".repeat(400) });
const comparison = (id: string, firstAction: string | null) => ({ id, firstAction, Ltail: 1.25, Lmean: 0.5, Nspent: 1, Eexpire: 0, scenarios: Array.from({ length: 96 }, (_, i) => scenario(`${id}-${i}`)) });
const planningRow = (n: number) => ({ id: `v3:x:${n}:planning`, observedAt: "2026-10-13T01:00:00.000Z", kind: "planning", record: { id: `v3:x:${n}:planning`, predictionId: `v3:x:${n}:platform`, seed: 12345 + n, candidates: [comparison("use", "card-1"), comparison("hold", null)], selected: comparison("use", "card-1"), alternatives: comparison("use", "card-1").scenarios } });
const predictionRow = { id: "v3:x:1:platform", observedAt: "2026-10-13T01:00:00.000Z", kind: "prediction", group: "temporary", record: { id: "v3:x:1:platform", probability: 0.12, modelVersion: "platform-v3:P0", featureContributions: [{ key: "k", before: 0.1, after: 0.12 }] } };

describe("slimPlanningRecord", () => {
  it("keeps ids, seed and the numeric conclusions but drops every scenario list", () => {
    const slim = slimPlanningRecord(planningRow(1).record as never);
    expect(slim).toMatchObject({ id: "v3:x:1:planning", predictionId: "v3:x:1:platform", seed: 12346, slim: true, alternativeCount: 96, alternatives: [] });
    expect(slim.selected).toEqual({ id: "use", firstAction: "card-1", Ltail: 1.25, Lmean: 0.5, Nspent: 1, Eexpire: 0, scenarioCount: 96 });
    expect(slim.candidates).toHaveLength(2);
    expect(JSON.stringify(slim)).not.toContain("deltaLoss");
    expect(JSON.stringify(slim).length).toBeLessThan(600);
  });
});

describe("compactCardsLog", () => {
  it("rewrites only bulky planning rows, byte-preserves everything else and reports savings", () => {
    const damaged = "{not json";
    const content = `${JSON.stringify(predictionRow)}\n${JSON.stringify(planningRow(1))}\r\n${damaged}\n${JSON.stringify(planningRow(2))}\n`;
    const plan = compactCardsLog(content, 10_000);
    expect(plan).not.toBeNull();
    const lines = plan!.content.split("\n");
    expect(lines.at(-1)).toBe("");
    expect(lines[0]).toBe(JSON.stringify(predictionRow));
    expect(lines[2]).toBe(damaged);
    const rewritten = JSON.parse(lines[1]!);
    expect(rewritten.id).toBe("v3:x:1:planning");
    expect(rewritten.record.slim).toBe(true);
    expect(rewritten.compactedFrom).toBeGreaterThan(50_000);
    expect(plan!.compactedRows).toBe(2);
    expect(plan!.rowCount).toBe(4);
    expect(plan!.savedChars).toBeGreaterThan(100_000);
    expect(plan!.content.length).toBe(content.length - plan!.savedChars - 1); // 一个 \r 也被换成了标准行尾
    // 幂等：第二次没有可省的了。
    expect(compactCardsLog(plan!.content, 1)).toBeNull();
  });
  it("returns null below the savings threshold or when nothing is bulky", () => {
    expect(compactCardsLog("", 1)).toBeNull();
    expect(compactCardsLog(`${JSON.stringify(predictionRow)}\n`, 1)).toBeNull();
    expect(compactCardsLog(`${JSON.stringify(planningRow(1))}\n`, 10_000_000)).toBeNull();
  });
});
