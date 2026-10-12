// RR27：演示场景夹具（浏览器预览与状态截图注入用，02-spec §6 末行）。
// 全部为「演示数据」：数字与生产 VM 无关，界面必须显示演示标识；绝不写入预测日志、
// 不冒充实跑证据。默认 demo=健康快照（RR08 冒烟实测形态）；异常场景按 hash 注入。
import type { ProviderSnapshot } from "./types";

function baseSnapshot(overrides: Partial<ProviderSnapshot>): ProviderSnapshot {
  const now = new Date().toISOString();
  return {
    provider: "codex",
    displayName: "CODEX",
    plan: "PLUS",
    weeklyWindow: { remainingPercent: 29, resetsAt: null, windowSeconds: 604_800 },
    shortWindow: { remainingPercent: 64, resetsAt: null, windowSeconds: 3600 },
    resetCredits: 3,
    rateLimitSnapshot: {
      source: "app-server", usedPercent: 71, windowDurationMins: 10_080,
      resetsAt: null, observedAt: now,
    },
    updatedAt: now,
    status: "ok",
    message: null,
    ...overrides,
  };
}

/** 健康周窗底（未来 2 天自然重置 + 同步观测）：demoSnapshot 与卡数场景共用——
 *  卡数场景（credits-zero/unknown）要测「no-credits 决策分支」，周窗必须有效，
 *  否则 cardPlan=null 决策卡不渲染（RR29 取证发现并修复，夹具缺陷）。 */
function healthyWeeklyWindow() {
  const now = new Date();
  const resetsAt = new Date(
    Math.ceil((Date.now() + 2 * 86_400_000) / 86_400_000) * 86_400_000,
  ).toISOString();
  return {
    weeklyWindow: { remainingPercent: 29, resetsAt, windowSeconds: 604_800 },
    rateLimitSnapshot: {
      source: "app-server", usedPercent: 71, windowDurationMins: 10_080,
      resetsAt, observedAt: now.toISOString(),
    },
  };
}

/** 默认演示快照（浏览器 demo 降级用；数值沿 RR09 demo 口径）。 */
export function demoSnapshot(): ProviderSnapshot {
  return baseSnapshot(healthyWeeklyWindow());
}

export type DemoScenario = "healthy" | "empty" | "error" | "stale" | "credits-zero" | "credits-unknown" | "loading";

export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  "healthy", "empty", "error", "stale", "credits-zero", "credits-unknown", "loading",
];

/** hash → 演示场景（组合段 #demo=empty / #expanded&demo=empty）；无匹配 null。 */
export function parseDemoScenario(hash: string): DemoScenario | null {
  for (const segment of hash.replace(/^#/, "").split("&")) {
    if (!segment.startsWith("demo=")) continue;
    const value = segment.slice("demo=".length);
    if ((DEMO_SCENARIOS as readonly string[]).includes(value)) return value as DemoScenario;
  }
  return null;
}

/** 场景 → 注入快照（返回 null 表示该场景无快照，如 loading/empty 由组件按 phase 呈现）。 */
export function demoScenarioSnapshot(scenario: DemoScenario): ProviderSnapshot | null {
  const now = new Date().toISOString();
  switch (scenario) {
    case "healthy": return demoSnapshot();
    case "empty":
      return null; // 空数组：组件显示空态
    case "error":
      return baseSnapshot({ status: "error", message: "app-server 连接超时（演示）" });
    case "stale": {
      const old = new Date(Date.now() - 26 * 3_600_000).toISOString();
      return baseSnapshot({
        updatedAt: old,
        rateLimitSnapshot: {
          source: "app-server", usedPercent: 71, windowDurationMins: 10_080,
          resetsAt: null, observedAt: old,
        },
        // 过期展示由数据层状态驱动（02-spec §6）：注入过期公告来源，UI 只映射不判定。
        resetStatus: {
          scheduledReset: null, activeWatch: null, latestReset: null,
          fetchedAt: old, generatedAt: null, freshUntil: old,
          lastAttemptAt: old, status: "ok", message: null,
        },
      });
    }
    case "credits-zero":
      // 有效周窗底（决策分支可达）+ 卡数归零：测「卡 ×0 下的用卡决策」渲染。
      return baseSnapshot({ ...healthyWeeklyWindow(), resetCredits: 0 });
    case "credits-unknown":
      // 有效周窗底 + 卡数未知：测 hideNoCreditsDecision 分支（mutedNote 提示）。
      return baseSnapshot({ ...healthyWeeklyWindow(), resetCredits: null });
    case "loading":
      return null; // 初始化骨架由 phase 呈现
  }
}
