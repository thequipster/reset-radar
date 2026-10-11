// RR38：采集状态卡副文案行尾悬挂「·」修复的结构锁测试。
// 坏结构（RR35 余留微瑕）：「最近更新成功 · <span timeNoWrap>时间段 北京时间</span>」——「·」在
// nowrap 段外、其后空格是唯一可断点 → 窄行时第一行行尾悬挂「·」（两主题同现）。
// 修复：「·」并入 nowrap 段随时间段整段（断点只剩「成功」后的空格，悬挂消除）。
// 沿 ui.banner-polish.test.ts 读源码文本断言的同款先例；css 语义仍由该文件锁定，此处只加防回退。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const tsx = readFileSync(join(__dirname, "..", "DashboardPanel.tsx"), "utf8");
const css = readFileSync(join(__dirname, "..", "DashboardPanel.module.css"), "utf8");

describe("RR38：采集状态卡副文案「·」不悬挂行尾", () => {
  it("「·」并入 .timeNoWrap 段（整段=「· 时间段 北京时间」）", () => {
    expect(tsx).toMatch(/最近更新成功 <span className=\{styles\.timeNoWrap\}>· \{beijingShort\(vm!\.observedAt\)/);
  });
  it("旧悬挂结构不得回归（「·」暴露在 nowrap 段外即红）", () => {
    expect(tsx).not.toMatch(/最近更新成功 · <span/);
  });
  it(".timeNoWrap 仍为 nowrap（RR35 时间段整段保护语义不动）", () => {
    expect(css).toMatch(/\.timeNoWrap\s*\{[^}]*white-space:\s*nowrap/);
  });
});
