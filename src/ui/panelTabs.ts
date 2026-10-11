// RR31：展开面板页签（用户指定：分模块点选替代纵向滚动）。纯解析/常量，域测试锁定。
// hash 组合段沿用 RR27 契约：#expanded&tab=risk&demo=stale。
export type PanelTab = "overview" | "risk" | "planner" | "data";

export const PANEL_TABS: readonly { key: PanelTab; label: string }[] = [
  { key: "overview", label: "概览" },
  { key: "risk", label: "风险" },
  { key: "planner", label: "用卡" },
  { key: "data", label: "数据" },
] as const;

const TAB_KEYS: readonly string[] = PANEL_TABS.map((tab) => tab.key);

export function isPanelTab(value: string): value is PanelTab {
  return (TAB_KEYS as readonly string[]).includes(value);
}

/** hash → 起始页签（tab=overview|risk|planner|data）；缺省概览。 */
export function initialPanelTab(hash: string): PanelTab {
  for (const segment of hash.replace(/^#/, "").split("&")) {
    if (!segment.startsWith("tab=")) continue;
    const value = segment.slice("tab=".length);
    if (isPanelTab(value)) return value;
  }
  return "overview";
}
