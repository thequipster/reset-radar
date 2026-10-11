// RR35：横幅尾箭头视觉权重 + 采集状态卡孤字换行修复的 CSS 锁定测试。
// 解析 DashboardPanel.module.css 断言两处规则在位（沿 ui.contrast.test.ts 解析 widget.css
// 的同款先例）；颜色实值与登记的咬合由 ui.contrast.test.ts 的 token 对齐测试负责。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "..", "DashboardPanel.module.css"), "utf8");

/** 取一条规则体（找不到即抛——规则被删/改名本身就是本测试要抓的回归）。 */
function rule(selector: string): string {
  const m = new RegExp("\\" + selector + "\\s*\\{([^}]*)\\}").exec(css);
  if (!m) throw new Error(`rule not found: ${selector}`);
  return m[1];
}

describe("RR35 G1①：横幅尾箭头视觉权重（字号/字重/token）", () => {
  it(".suggestionTail 与主数字同量级：22px / 700", () => {
    const body = rule(".suggestionTail");
    expect(body).toMatch(/font-size:\s*22px/);
    expect(body).toMatch(/font-weight:\s*700/);
  });
  it("颜色走 --banner-tail token（0.9 白，弃字面 0.65）", () => {
    expect(rule(".suggestionTail")).toMatch(/color:\s*var\(--banner-tail\)/);
  });
});

describe("RR35 G1②：副文案孤字换行（采集状态卡 + 顺带周额度剩余卡）", () => {
  it(".timeNoWrap 存在且整段不断行", () => {
    expect(rule(".timeNoWrap")).toMatch(/white-space:\s*nowrap/);
  });
  it("两处副文案均使用 .timeNoWrap（tsx 结构锁定）", () => {
    const tsx = readFileSync(join(__dirname, "..", "DashboardPanel.tsx"), "utf8");
    expect(tsx.match(/styles\.timeNoWrap/g)?.length ?? 0).toBe(2);
  });
});
