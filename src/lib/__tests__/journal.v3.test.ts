import { describe, expect, it } from "vitest";
import { classifyOutcome, freezePlanning, freezePrediction, nextSignalVersion, predictionGroupAt, type PredictionRecordV3 } from "../v3/journal";

const input = () => ({ id: "p-1", issuedAt: 100, target: "platform_notice" as const,
  windowStart: 100, windowEnd: 200, probability: 0.2, modelVersion: "p0-v1", trainingCutoff: 90,
  inputSnapshotId: "snapshot-1", cardLedgerVersion: "ledger-4", preferenceVersion: "pref-2",
  featureContributions: [{ key: "baseline", before: 0, after: 0.2 }], assumptions: ["coverage-complete"],
  evidenceQuality: ["observed"], });

describe("v3 frozen prediction journal", () => {
  it("freezes all target, version and cutoff inputs needed to reproduce a forecast", () => {
    const source = input();
    const row = freezePrediction(source);
    source.featureContributions[0]!.after = 0.9;
    source.assumptions.push("changed-later");
    expect(row).toMatchObject({ target: "platform_notice", modelVersion: "p0-v1", trainingCutoff: 90,
      inputSnapshotId: "snapshot-1", cardLedgerVersion: "ledger-4", preferenceVersion: "pref-2" });
    expect(row.featureContributions[0]).toMatchObject({ after: 0.2 });
    expect(row.assumptions).toEqual(["coverage-complete"]);
  });

  it("planning journal keeps explicit seed and candidate/selected/alternative summaries", () => {
    const plan = freezePlanning({ id: "plan-1", predictionId: "p-1", seed: 441, candidates: [{ action: "keep_card", score: 0.4 }],
      selected: { action: "keep_card" }, alternatives: [{ action: "use_card", difference: 0.1 }], });
    expect(plan).toEqual({ id: "plan-1", predictionId: "p-1", seed: 441,
      candidates: [{ action: "keep_card", score: 0.4 }], selected: { action: "keep_card" },
      alternatives: [{ action: "use_card", difference: 0.1 }] });
  });

  it("platform label remains scorable after card use; incomplete coverage stays pending", () => {
    const record = freezePrediction(input());
    expect(classifyOutcome(record, { completeCoverage: true, platformNotice: true })).toBe("positive");
    expect(classifyOutcome(record, { completeCoverage: true, platformNotice: true, cardUsedAt: 150 })).toBe("positive");
    expect(classifyOutcome(record, { completeCoverage: false, platformNotice: false })).toBe("pending");
    expect(classifyOutcome(record, { completeCoverage: true, platformNotice: false, cardUsedAt: 150 })).toBe("negative");
  });

  it("account outcome is censored by intervening card use and unknown when evidence is ambiguous", () => {
    const record = freezePrediction({ ...input(), target: "account_external_reset" as const, probability: null });
    expect(classifyOutcome(record, { completeCoverage: true, accountReset: "hit", cardUsedAt: 150 })).toBe("censored");
    expect(classifyOutcome(record, { completeCoverage: true, accountReset: "ambiguous" })).toBe("unknown");
    expect(classifyOutcome(record, { completeCoverage: false, accountReset: "miss" })).toBe("pending");
    expect(classifyOutcome(record, { completeCoverage: true, accountReset: "miss" })).toBe("negative");
  });

  it("demand predictions accept null probability rather than fabricating a risk score", () => {
    const row: PredictionRecordV3 = freezePrediction({ ...input(), target: "demand", probability: null });
    expect(row.probability).toBeNull();
    expect(row.target).toBe("demand");
  });

  it("starts a new first-seen clock after cancellation while retaining prior episode rows", () => {
    const first = nextSignalVersion(null, { id: "watch-1", chance: 20 }, "2026-10-12T01:00:00Z")!;
    const changed = nextSignalVersion(first, { id: "watch-1", chance: 40 }, "2026-10-12T02:00:00Z")!;
    const cancelled = nextSignalVersion(changed, null, "2026-10-12T03:00:00Z")!;
    const nextEpisode = nextSignalVersion(cancelled, { id: "watch-2", chance: 20 }, "2026-10-13T01:00:00Z")!;
    expect(first).toMatchObject({ change: "first_seen", firstSeenAt: "2026-10-12T01:00:00Z" });
    expect(changed).toMatchObject({ change: "changed", firstSeenAt: first.firstSeenAt });
    expect(cancelled).toMatchObject({ change: "cancelled", firstSeenAt: first.firstSeenAt, value: null });
    expect(nextEpisode).toMatchObject({ change: "first_seen", firstSeenAt: "2026-10-13T01:00:00Z" });
    expect(nextSignalVersion(nextEpisode, { id: "watch-2", chance: 20 }, "2026-10-13T01:05:00Z")).toBeNull();
  });

  it("creates only one Beijing 09:00 primary per day and keeps other refreshes temporary", () => {
    const atNine = Date.parse("2026-10-12T01:00:00Z");
    expect(predictionGroupAt(atNine, false)).toEqual({ group: "primary_daily", groupDate: "2026-10-12" });
    expect(predictionGroupAt(atNine, true)).toEqual({ group: "temporary" });
    expect(predictionGroupAt(atNine + 60_000, false)).toEqual({ group: "temporary" });
  });
});
