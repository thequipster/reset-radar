// RR27：主题 token（照六图落定，识图子代理规格 2026-10-11）。深色=图3暗色霓虹主参考，
// 浅色=图4右半对应；色值以 CSS 变量注入（widget.css），本文件只持纯数据与解析逻辑，
// 便于域测试锁定。UI 零业务规则（ARCHITECTURE §2）：主题不影响任何数字语义。

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

/** 本地记忆键（localStorage；读写失败按无记忆处理，不抛错）。 */
export const THEME_STORAGE_KEY = "reset-radar.theme";

export const THEME_VARIABLES: Record<ResolvedTheme, Record<string, string>> = {
  dark: {
    "--bg-panel": "rgba(12, 22, 34, 0.97)",
    "--bg-card": "#12203a",
    "--bg-card-hover": "#172942",
    "--bg-inset": "#0e1b2c",
    "--bg-skeleton": "#233247",
    "--ring-track": "#1e3050",
    "--border-subtle": "rgba(120, 170, 255, 0.14)",
    "--border-strong": "rgba(46, 124, 246, 0.55)",
    "--text-primary": "#f2f6fc",
    "--text-secondary": "#8fa3bf",
    "--text-tertiary": "#5c718c",
    "--accent-blue": "#2e7cf6",
    "--accent-blue-bright": "#38bdf8",
    "--accent-blue-deep": "#1d4ed8",
    "--accent-cyan": "#22d3ee",
    "--accent-purple": "#a855f7",
    "--accent-purple-deep": "#4c1d95",
    "--accent-purple-text": "#c084fc",
    "--accent-pink": "#fbcfe8",
    "--success": "#2ee6a6",
    "--success-deep": "#059669",
    "--success-dim": "rgba(46, 230, 166, 0.10)",
    "--warn": "#f59e0b",
    "--warn-text": "#fbbf24",
    "--warn-dim": "rgba(245, 158, 11, 0.10)",
    "--danger": "#f43f5e",
    "--danger-text": "#ff6b7a",
    "--danger-dim": "rgba(244, 63, 94, 0.12)",
    "--glow-blue": "0 0 20px rgba(46, 124, 246, 0.35)",
    "--glow-purple": "0 6px 28px rgba(147, 51, 234, 0.40)",
    "--shadow-panel": "0 12px 40px rgba(0, 0, 0, 0.55)",
    "--shadow-card": "0 4px 16px rgba(0, 0, 0, 0.35)",
    // RR32 品牌 logo token（与 widget.css 对齐，域测试锁定）：深色=精密蓝正稿。
    "--logo-ring-main": "#46e4f4",
    "--logo-ring-inner": "#179bf1",
    "--logo-grad-lo": "rgba(23, 155, 241, 0.12)",
    "--logo-grad-hi": "rgba(70, 228, 244, 0.68)",
    "--logo-glow": "drop-shadow(0 0 6px rgba(70, 228, 244, 0.45))",
  },
  light: {
    "--bg-panel": "rgba(245, 248, 252, 0.97)",
    "--bg-card": "#ffffff",
    "--bg-card-hover": "#f0f4fa",
    "--bg-inset": "#edf2f9",
    "--bg-skeleton": "#e2e9f3",
    "--ring-track": "#e2e9f3",
    "--border-subtle": "#d9e2ef",
    "--border-strong": "rgba(37, 99, 235, 0.55)",
    "--text-primary": "#16233a",
    "--text-secondary": "#5b6b84",
    "--text-tertiary": "#8896ab",
    "--accent-blue": "#2563eb",
    "--accent-blue-bright": "#3b82f6",
    "--accent-blue-deep": "#1d4ed8",
    "--accent-cyan": "#0891b2",
    "--accent-purple": "#7c3aed",
    "--accent-purple-deep": "#6d28d9",
    "--accent-purple-text": "#6d28d9",
    "--accent-pink": "#a855f7",
    "--success": "#16a34a",
    "--success-deep": "#059669",
    "--success-dim": "rgba(22, 163, 74, 0.10)",
    "--warn": "#d97706",
    "--warn-text": "#b45309",
    "--warn-dim": "#fef3c7",
    "--danger": "#dc2626",
    "--danger-text": "#dc2626",
    "--danger-dim": "#fee2e2",
    "--glow-blue": "none",
    "--glow-purple": "0 6px 20px rgba(147, 51, 234, 0.15)",
    "--shadow-panel": "0 8px 24px rgba(20, 40, 80, 0.14)",
    "--shadow-card": "0 1px 3px rgba(20, 40, 80, 0.08)",
    // RR32 浅色=02-glass 配色（深色调标记放浅底）。
    "--logo-ring-main": "#0277c8",
    "--logo-ring-inner": "#30b7ef",
    "--logo-grad-lo": "rgba(48, 183, 239, 0.12)",
    "--logo-grad-hi": "rgba(2, 119, 200, 0.68)",
    "--logo-glow": "none",
  },
};

/** URL ?theme= 截图/验收入口：只覆盖本次会话起始主题，不写本地记忆。 */
export function initialThemeOverride(search: string): ResolvedTheme | null {
  const match = /[?&]theme=(dark|light)(&|$)/.exec(search);
  return match ? (match[1] as ResolvedTheme) : null;
}

/** 偏好 + 系统深浅 → 生效主题（纯函数，域测试锁定）。 */
export function resolveTheme(pref: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

/** 读本地记忆；无记忆/坏值返回默认 dark（图3 主参考即深色）。 */
export function readThemePreference(store: Storage | null | undefined): ThemePreference {
  try {
    const raw = store?.getItem(THEME_STORAGE_KEY);
    return raw === "light" || raw === "dark" || raw === "system" ? raw : "dark";
  } catch {
    return "dark";
  }
}

export function writeThemePreference(store: Storage | null | undefined, pref: ThemePreference): boolean {
  try {
    store?.setItem(THEME_STORAGE_KEY, pref);
    return true;
  } catch {
    return false;
  }
}
