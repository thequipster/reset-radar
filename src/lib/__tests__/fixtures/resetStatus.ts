import type { ResetStatusSnapshot } from "../../resetStatus";
export const sourceSnapshot = (patch: Partial<ResetStatusSnapshot> = {}): ResetStatusSnapshot => ({
  scheduledReset: {
    id: "future", status: "scheduled", resetType: "regular",
    announcedAt: "2026-10-11T04:00:00Z", scheduledFor: "2026-10-11T07:00:00Z",
    text: "Announced reset", source: { type: "x_post", url: "https://example.invalid/notice" },
  },
  latestReset: { announced_at: "2026-10-11T04:01:09Z", reset_type: "regular" },
  activeWatch: { reset_chance_percent: 80 },
  fetchedAt: "2026-10-11T04:59:00Z", generatedAt: "2026-10-11T04:58:00Z",
  freshUntil: "2026-10-11T05:14:00Z", lastAttemptAt: "2026-10-11T04:59:00Z",
  status: "ok", message: null, ...patch,
});
