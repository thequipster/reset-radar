// RR29：对比度核验域测试——公式锚点 / CSS 独有 token 对齐 / 全配对数值快照（84 组
// =42对×2主题，两位小数锁定防色值漂移）。不达标组合是如实计算结果（见
// docs/a11y-contrast-20261011.md 定夺），此处锁「数值本身」与「不达标清单」两样。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { composite, contrastRatio, levelThreshold, parseCssColor, relativeLuminance } from "../contrast";
import { CONTRAST_PAIRS, CSS_ONLY_TOKENS, CSS_ONLY_TOKENS_LIGHT, pairRatio, resolveToken } from "../contrastPairs";

describe("contrast 公式锚点", () => {
  it("黑白两极 = 21，同色 = 1", () => {
    expect(contrastRatio(parseCssColor("#ffffff"), parseCssColor("#000000"))).toBeCloseTo(21, 6);
    expect(contrastRatio(parseCssColor("#123456"), parseCssColor("#123456"))).toBeCloseTo(1, 6);
  });
  it("#767676 on #fff ≈ 4.54（4.5:1 经典边界灰）", () => {
    expect(contrastRatio(parseCssColor("#767676"), parseCssColor("#ffffff"))).toBeCloseTo(4.54, 2);
  });
  it("相对亮度：纯白=1 纯黑=0", () => {
    expect(relativeLuminance(parseCssColor("#ffffff"))).toBeCloseTo(1, 6);
    expect(relativeLuminance(parseCssColor("#000000"))).toBeCloseTo(0, 6);
  });
  it("parseCssColor 覆盖本项目全集：hex6/hex3/rgb/rgba", () => {
    expect(parseCssColor("#0c1622")).toEqual({ r: 12, g: 22, b: 34, a: 1 });
    expect(parseCssColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColor("rgb(12, 22, 34)")).toEqual({ r: 12, g: 22, b: 34, a: 1 });
    expect(parseCssColor("rgba(196, 181, 253, 0.85)")).toEqual({ r: 196, g: 181, b: 253, a: 0.85 });
  });
  it("composite：半透明白压纯黑 → 中灰（alpha 直算）", () => {
    const out = composite(parseCssColor("rgba(255,255,255,0.5)"), parseCssColor("#000000"));
    expect(out.r).toBeCloseTo(127.5, 6);
    expect(out.a).toBeCloseTo(1, 6);
  });
  it("档位阈值：normal 4.5 / large、graphic 3.0", () => {
    expect(levelThreshold("normal")).toBe(4.5);
    expect(levelThreshold("large")).toBe(3.0);
    expect(levelThreshold("graphic")).toBe(3.0);
  });
});

describe("CSS 独有 token 与 widget.css 对齐", () => {
  const css = readFileSync(join(__dirname, "..", "widget.css"), "utf8");
  const darkBlock = css.slice(css.indexOf(':root'), css.indexOf('[data-theme="light"]'));
  const lightBlock = css.slice(css.indexOf('[data-theme="light"]'), css.indexOf("* {"));

  function cssVar(block: string, name: string): string {
    const m = new RegExp("\\" + name + ":\\s*([^;]+);").exec(block);
    if (!m) throw new Error(`${name} not in block`);
    return m[1].trim();
  }

  it("深色块逐 token 一致", () => {
    for (const [name, value] of Object.entries(CSS_ONLY_TOKENS)) {
      expect(cssVar(darkBlock, name)).toBe(value);
    }
  });
  it("浅色块逐 token 一致", () => {
    for (const [name, value] of Object.entries(CSS_ONLY_TOKENS_LIGHT)) {
      expect(cssVar(lightBlock, name)).toBe(value);
    }
  });
});

describe("全配对数值快照（42对×2主题，计算口径见 contrastPairs 头注）", () => {
  const EXPECTED: Record<string, Record<string, number>> = {
    dark: {
      "primary-on-panel": 16.79, "secondary-on-panel": 7.07, "tertiary-on-panel": 3.64,
      "danger-text-on-panel": 6.62, "warn-text-on-panel": 10.91, "purple-text-on-panel": 6.89,
      "blue-bright-on-panel": 8.5, "primary-on-card": 14.97, "secondary-on-card": 6.31,
      "tertiary-on-card": 3.24, "blue-bright-on-card": 7.58, "cyan-on-card": 8.98,
      "warn-text-on-card": 9.73, "danger-text-on-card": 5.9, "purple-text-on-card": 6.14,
      "success-on-card": 10.04, "secondary-on-inset": 6.73, "blue-bright-on-inset": 8.09,
      "tertiary-on-header": 3.64, "primary-on-card-hover": 13.52, "blue-bright-on-card-hover": 6.84,
      "white-on-accent-blue": 3.94, "white-on-blue-gradient": 3.94, "warn-text-on-warn-dim": 8.31,
      "danger-text-on-danger-dim": 5.33, "success-on-success-dim": 8.09, "decision-icon": 6.15,
      "white-on-banner-a": 3.96, "white-on-banner-b": 5.7, "white-on-banner-c": 10.95,
      "label-on-banner-a": 3.96, "label-on-banner-b": 5.7, "number-on-banner-a": 3.96,
      "number-on-banner-b": 5.7, "number-on-banner-c": 10.95, "sub-on-banner-a": 2.14,
      "sub-on-banner-b": 3.09, "tail-on-banner-a": 3.96, "banner-icon": 3.06,
      "dot-success-on-panel": 11.26, "dot-warn-on-panel": 8.48, "dot-danger-on-panel": 4.96,
    },
    light: {
      "primary-on-panel": 14.76, "secondary-on-panel": 5.08, "tertiary-on-panel": 2.82,
      "danger-text-on-panel": 4.53, "warn-text-on-panel": 4.71, "purple-text-on-panel": 6.67,
      "blue-bright-on-panel": 3.45, "primary-on-card": 15.72, "secondary-on-card": 5.41,
      "tertiary-on-card": 3.0, "blue-bright-on-card": 3.68, "cyan-on-card": 3.68,
      "warn-text-on-card": 5.02, "danger-text-on-card": 4.83, "purple-text-on-card": 7.1,
      "success-on-card": 3.3, "secondary-on-inset": 4.81, "blue-bright-on-inset": 3.27,
      "tertiary-on-header": 2.82, "primary-on-card-hover": 14.24, "blue-bright-on-card-hover": 3.33,
      "white-on-accent-blue": 5.17, "white-on-blue-gradient": 5.17, "warn-text-on-warn-dim": 4.51,
      "danger-text-on-danger-dim": 3.95, "success-on-success-dim": 2.95, "decision-icon": 1.3,
      "white-on-banner-a": 1.23, "white-on-banner-b": 1.31, "white-on-banner-c": 1.23,
      "label-on-banner-a": 1.23, "label-on-banner-b": 1.31, "number-on-banner-a": 4.65,
      "number-on-banner-b": 4.35, "number-on-banner-c": 4.63, "sub-on-banner-a": 1.51,
      "sub-on-banner-b": 1.41, "tail-on-banner-a": 1.23, "banner-icon": 1.18,
      "dot-success-on-panel": 3.09, "dot-warn-on-panel": 2.99, "dot-danger-on-panel": 4.53,
    },
  };

  it("42 对全登记（两主题各 42，无缺无重）", () => {
    expect(CONTRAST_PAIRS).toHaveLength(42);
    expect(new Set(CONTRAST_PAIRS.map((p) => p.id)).size).toBe(42);
  });

  for (const theme of ["dark", "light"] as const) {
    it(`${theme}：逐对数值与快照一致（两位小数）`, () => {
      for (const p of CONTRAST_PAIRS) {
        expect(pairRatio(p, theme)).toBeCloseTo(EXPECTED[theme][p.id], 2);
      }
    });
  }

  it("不达标清单与定夺一致（改色值须同步更新此清单与报告）", () => {
    const failIds = (theme: "dark" | "light") =>
      CONTRAST_PAIRS.filter((p) => pairRatio(p, theme) + 1e-9 < levelThreshold(p.level))
        .map((p) => p.id)
        .sort();
    expect(failIds("dark")).toEqual([
      "label-on-banner-a", "sub-on-banner-a", "sub-on-banner-b", "tail-on-banner-a",
      "tertiary-on-card", "tertiary-on-header", "tertiary-on-panel",
      "white-on-accent-blue", "white-on-banner-a",
    ]);
    expect(failIds("light")).toEqual([
      "banner-icon", "blue-bright-on-card", "blue-bright-on-card-hover", "blue-bright-on-inset",
      "blue-bright-on-panel", "cyan-on-card", "danger-text-on-danger-dim", "decision-icon",
      "dot-warn-on-panel", "label-on-banner-a", "label-on-banner-b", "sub-on-banner-a",
      "sub-on-banner-b", "success-on-card", "success-on-success-dim", "tail-on-banner-a",
      "tertiary-on-card", "tertiary-on-header", "tertiary-on-panel",
      "white-on-banner-a", "white-on-banner-b", "white-on-banner-c",
    ]);
  });

  it("resolveToken 拒绝未知 token", () => {
    expect(() => resolveToken("--no-such-token", "dark")).toThrow(/unknown token/);
  });
});
