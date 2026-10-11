// RR29：WCAG 对比度计算核心（纯函数，域测试锁定）。用途=主题 token 逐「前景×背景」
// 组合的可访问性核验（G1：4.5:1 正文 / 3:1 大字与图形），报告脚本 scripts/contrast-report.mjs
// 经 node 原生 type-stripping 直载本文件（calibrate.mjs 同款口径）。UI 零业务规则不变。

/** 解析后的颜色（sRGB 0-255 + alpha 0-1）。 */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** 解析 CSS 颜色字面值：#rgb / #rrggbb / rgb() / rgba()（本项目 token 全集）。 */
export function parseCssColor(input: string): Rgba {
  const s = input.trim().toLowerCase();
  const hex3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (hex3) {
    return {
      r: parseInt(hex3[1] + hex3[1], 16),
      g: parseInt(hex3[2] + hex3[2], 16),
      b: parseInt(hex3[3] + hex3[3], 16),
      a: 1,
    };
  }
  const hex6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(s);
  if (hex6) {
    return { r: parseInt(hex6[1], 16), g: parseInt(hex6[2], 16), b: parseInt(hex6[3], 16), a: 1 };
  }
  const fn = /^(rgba?)\(([^)]+)\)$/.exec(s);
  if (fn) {
    const parts = fn[2].split(",").map((x) => x.trim());
    const num = (i: number) => Number.parseFloat(parts[i]);
    return { r: num(0), g: num(1), b: num(2), a: parts.length > 3 ? num(3) : 1 };
  }
  throw new Error(`unsupported css color: ${input}`);
}

/** 半透明前景合成到背景（source-over）；bg 的 alpha 非 1 时先视其为已不透明近似。 */
export function composite(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a + bg.a * (1 - fg.a);
  const mix = (f: number, b: number) => (a === 0 ? 0 : (fg.a * f + bg.a * (1 - fg.a) * b) / a);
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a };
}

/** WCAG 2.x 相对亮度（通道先线性化；公式出处 web.dev/articles/color-contrast，与 WCAG 2.1 一致）。 */
export function relativeLuminance(c: Rgba): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** 对比度比值 (L亮+0.05)/(L暗+0.05)，∈[1,21]。 */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** 档位阈值：正文 4.5 / 大字（≥24px，或 ≥18.66px 粗体）与图形组件 3.0（WCAG 1.4.11）。 */
export type ContrastLevel = "normal" | "large" | "graphic";

export function levelThreshold(level: ContrastLevel): number {
  return level === "normal" ? 4.5 : 3.0;
}
