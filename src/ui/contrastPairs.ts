// RR29：对比度核验配对登记（G1「逐前景/背景组合」唯一清单）。配对=token 名或字面色值，
// 逐条注明 CSS 出处与档位；求值时按主题从 THEME_VARIABLES / CSS_ONLY_TOKENS 取色。
// 半透明口径：*-dim(0.10–0.12) 合成到所在卡片 bg-card；bg-panel(0.97) 按不透明近似；
// 渐变横幅三色 a/b/c 各算一行（结论取最严苛）。新增样式动到颜色时同步本表（域测试锁定全集）。

import type { Rgba } from "./contrast.ts";
import { composite, contrastRatio, parseCssColor } from "./contrast.ts";
import { THEME_VARIABLES, type ResolvedTheme } from "./theme.ts";

/** widget.css 独有 token（theme.ts 表未收录；与 CSS 对齐由域测试解析 widget.css 锁定）。 */
export const CSS_ONLY_TOKENS: Record<string, string> = {
  "--bg-header": "#0c1622", // 深浅两值在 widget.css 分块，见 CSS_ONLY_TOKENS_LIGHT
  "--purple-banner-a": "#9333ea", // RR34：#a855f7→#9333ea（白字 3.96→5.38 达标）
  "--purple-banner-b": "#7c3aed",
  "--purple-banner-c": "#4c1d95",
  "--suggestion-number": "#ffffff",
  "--banner-sub": "#f3e8ff", // RR34：副文案 token 化（原 rgba(196,181,253,.85) 2.14→4.56）
  "--banner-tail": "rgba(255, 255, 255, 0.9)", // RR35：尾箭头 token 化（0.65→0.9 提视觉权重）
  "--decision-icon": "#facc15",
};

/** 上述 token 的浅色值（[data-theme=light] 块）。 */
export const CSS_ONLY_TOKENS_LIGHT: Record<string, string> = {
  "--bg-header": "#f5f8fc",
  // RR34：浅紫渐变白字 1.23–1.51 缺陷 → 深紫渐变与深色统一；大数字紫→白。
  "--purple-banner-a": "#9333ea",
  "--purple-banner-b": "#7c3aed",
  "--purple-banner-c": "#4c1d95",
  "--suggestion-number": "#ffffff",
  "--banner-sub": "#f3e8ff",
  "--banner-tail": "rgba(255, 255, 255, 0.9)",
  "--decision-icon": "#854d0e",
};

/** 配对定义。fg/bg 既可写 token 名（"--text-primary"）也可写 CSS 字面色值（含 rgba）。 */
export interface ContrastPair {
  id: string;
  fg: string;
  /** 背景栈：外层在前逐层合成（如 dim 色压在卡片底上）。 */
  bgStack: string[];
  /** normal=4.5:1 正文；large=3:1 大字；graphic=3:1 图形/组件（WCAG 1.4.11）。 */
  level: "normal" | "large" | "graphic";
  /** CSS 出处（文件:规则名，DP=DashboardPanel CB=CompactBar PC=PeekCard）。 */
  source: string;
  note?: string;
}

export const CONTRAST_PAIRS: ContrastPair[] = [
  // ── 面板基底（bg-panel 0.97 按不透明近似）──
  { id: "primary-on-panel", fg: "--text-primary", bgStack: ["--bg-panel"], level: "normal", source: "DP.shell / CB.root / PC.card" },
  { id: "secondary-on-panel", fg: "--text-secondary", bgStack: ["--bg-panel"], level: "normal", source: "DP.dataLine/.tabButton, CB.metricLabel, PC.rowValue" },
  { id: "tertiary-on-panel", fg: "--text-tertiary", bgStack: ["--bg-panel"], level: "normal", source: "CB.brandSub/.dragHandle", note: "9px 小字（比 12px 更严）" },
  { id: "danger-text-on-panel", fg: "--danger-text", bgStack: ["--bg-panel"], level: "normal", source: "CB.metricLabelRisk, DP.dataLineStale 同族" },
  { id: "warn-text-on-panel", fg: "--warn-text", bgStack: ["--bg-panel"], level: "normal", source: "CB.demoBadge, DP.dataLineStale" },
  { id: "purple-text-on-panel", fg: "--accent-purple-text", bgStack: ["--bg-panel"], level: "normal", source: "PC.rowValueAccent" },
  { id: "blue-bright-on-panel", fg: "--accent-blue-bright", bgStack: ["--bg-panel"], level: "normal", source: "PC.openButton" },
  // ── 卡片基底（bg-card）──
  { id: "primary-on-card", fg: "--text-primary", bgStack: ["--bg-card"], level: "normal", source: "DP.quotaCard/.pacingRow/.riskCard/.plannerCard/.ghostButton 等" },
  { id: "secondary-on-card", fg: "--text-secondary", bgStack: ["--bg-card"], level: "normal", source: "DP.noticeSub/.quotaSub/.pacingNote/.riskLabel/.chartTitle" },
  { id: "tertiary-on-card", fg: "--text-tertiary", bgStack: ["--bg-card"], level: "normal", source: "DP.chartNote, DP.outlook-axis(9px)" },
  { id: "blue-bright-on-card", fg: "--accent-blue-bright", bgStack: ["--bg-card"], level: "normal", source: "DP.sectionLink/.ring-value/.loadingTitle" },
  { id: "cyan-on-card", fg: "--accent-cyan", bgStack: ["--bg-card"], level: "normal", source: "DP.pacingValueCyan/.factorDeltaNegative" },
  { id: "warn-text-on-card", fg: "--warn-text", bgStack: ["--bg-card"], level: "normal", source: "DP.pacingValueWarn" },
  { id: "danger-text-on-card", fg: "--danger-text", bgStack: ["--bg-card"], level: "normal", source: "DP.pacingValueDanger/.factorDeltaPositive/.riskValueDanger" },
  { id: "purple-text-on-card", fg: "--accent-purple-text", bgStack: ["--bg-card"], level: "normal", source: "DP.pacingValuePurple" },
  { id: "success-on-card", fg: "--success", bgStack: ["--bg-card"], level: "normal", source: "DP.noticeCardOk/.outlook-value.best" },
  // ── inset / header / hover ──
  { id: "secondary-on-inset", fg: "--text-secondary", bgStack: ["--bg-inset"], level: "normal", source: "DP.iconButton" },
  { id: "blue-bright-on-inset", fg: "--accent-blue-bright", bgStack: ["--bg-inset"], level: "normal", source: "DP.sectionIcon" },
  { id: "tertiary-on-header", fg: "--text-tertiary", bgStack: ["--bg-header"], level: "normal", source: "DP.titleSub(10px)" },
  { id: "primary-on-card-hover", fg: "--text-primary", bgStack: ["--bg-card-hover"], level: "normal", source: "DP.iconButton:hover/.ghostButton:hover/.tabButton:hover" },
  { id: "blue-bright-on-card-hover", fg: "--accent-blue-bright", bgStack: ["--bg-card-hover"], level: "normal", source: "PC.openButton:hover" },
  // ── 实底按钮 / 图标底 ──
  { id: "white-on-accent-blue", fg: "#ffffff", bgStack: ["--accent-blue"], level: "normal", source: "DP.themeOptionActive/.tabButtonActive/.primaryButton" },
  { id: "white-on-blue-gradient", fg: "#ffffff", bgStack: ["--accent-blue"], level: "graphic", source: "DP.plannerCardBlueIcon(渐变最浅端 accent-blue；深端 accent-blue-deep 更严和)", note: "渐变另一端 #ffffff/--accent-blue-deep 同法可查" },
  // ── 警示卡（dim 半透明压 bg-card）──
  { id: "warn-text-on-warn-dim", fg: "--warn-text", bgStack: ["--warn-dim", "--bg-card"], level: "normal", source: "DP.noticeCardAnnouncement/.stateBannerWarn/.pacingIconWarn/.riskBadgeMid" },
  { id: "danger-text-on-danger-dim", fg: "--danger-text", bgStack: ["--danger-dim", "--bg-card"], level: "normal", source: "DP.noticeCardError/.stateBannerError/.riskIconBox/.riskBadgeHigh, CB.riskIconBox" },
  { id: "success-on-success-dim", fg: "--success", bgStack: ["--success-dim", "--bg-card"], level: "normal", source: "DP.riskBadgeLow/.decisionTitle" },
  { id: "decision-icon", fg: "--decision-icon", bgStack: ["rgba(250, 204, 21, 0.15)", "--success-dim", "--bg-card"], level: "graphic", source: "DP.decisionIcon" },
  // ── 紫色建议横幅（渐变三色各一行，labelOpacity/tail 半透明白）──
  { id: "white-on-banner-a", fg: "#ffffff", bgStack: ["--purple-banner-a"], level: "normal", source: "DP.suggestionBanner 主文案" },
  { id: "white-on-banner-b", fg: "#ffffff", bgStack: ["--purple-banner-b"], level: "normal", source: "同上（渐变中点）" },
  { id: "white-on-banner-c", fg: "#ffffff", bgStack: ["--purple-banner-c"], level: "normal", source: "同上（渐变深端）" },
  { id: "label-on-banner-a", fg: "rgba(255, 255, 255, 0.92)", bgStack: ["--purple-banner-a"], level: "normal", source: "DP.suggestionLabel(opacity .92)" },
  { id: "label-on-banner-b", fg: "rgba(255, 255, 255, 0.92)", bgStack: ["--purple-banner-b"], level: "normal", source: "同上（渐变中点）" },
  { id: "number-on-banner-a", fg: "--suggestion-number", bgStack: ["--purple-banner-a"], level: "large", source: "DP.suggestionNumber(22px/800 粗大字)" },
  { id: "number-on-banner-b", fg: "--suggestion-number", bgStack: ["--purple-banner-b"], level: "large", source: "同上（渐变中点）" },
  { id: "number-on-banner-c", fg: "--suggestion-number", bgStack: ["--purple-banner-c"], level: "large", source: "同上（渐变深端）" },
  { id: "sub-on-banner-a", fg: "--banner-sub", bgStack: ["--purple-banner-a"], level: "normal", source: "DP.suggestionSub(11px)", note: "RR32 识图遗产：浅色主题淡紫压浅紫重点核验面" },
  { id: "sub-on-banner-b", fg: "--banner-sub", bgStack: ["--purple-banner-b"], level: "normal", source: "同上（渐变中点）" },
  { id: "tail-on-banner-a", fg: "--banner-tail", bgStack: ["--purple-banner-a"], level: "normal", source: "DP.suggestionTail(22px/700，RR35 提视觉权重)" },
  { id: "banner-icon", fg: "#ffffff", bgStack: ["rgba(255, 255, 255, 0.18)", "--purple-banner-a"], level: "graphic", source: "DP.suggestionIcon" },
  // ── 胶囊状态点（纯色圆点，图形可见性）──
  { id: "dot-success-on-panel", fg: "--success", bgStack: ["--bg-panel"], level: "graphic", source: "CB 状态圆点(success)" },
  { id: "dot-warn-on-panel", fg: "--warn", bgStack: ["--bg-panel"], level: "graphic", source: "CB 状态圆点(warn)" },
  { id: "dot-danger-on-panel", fg: "--danger", bgStack: ["--bg-panel"], level: "graphic", source: "CB 状态圆点(danger)" },
];

/** token 名 → 当前主题色值（theme.ts 表 + CSS 独有 token）。 */
export function resolveToken(name: string, theme: ResolvedTheme): Rgba {
  const value = THEME_VARIABLES[theme][name] ?? (theme === "light" ? CSS_ONLY_TOKENS_LIGHT[name] : CSS_ONLY_TOKENS[name]);
  if (value === undefined) throw new Error(`unknown token: ${name} (${theme})`);
  return parseCssColor(value);
}

/** 求一对配对在该主题下的实际对比度（背景栈自底向上逐层合成）。 */
export function pairRatio(pair: ContrastPair, theme: ResolvedTheme): number {
  const fg = pair.fg.startsWith("--") ? resolveToken(pair.fg, theme) : parseCssColor(pair.fg);
  let bg = resolveToken(pair.bgStack[pair.bgStack.length - 1], theme);
  for (let i = pair.bgStack.length - 2; i >= 0; i--) {
    const layer = pair.bgStack[i].startsWith("--") ? resolveToken(pair.bgStack[i], theme) : parseCssColor(pair.bgStack[i]);
    bg = composite(layer, bg);
  }
  return contrastRatio(fg, bg);
}
