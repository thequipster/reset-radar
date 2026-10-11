// RR40：采集状态卡副文案分隔点「·」行缘悬挂的结构锁测试（RR38 口径升级）。
// 两种坏结构互为镜像，均已实证（docs/review-20261011-round4/5.md）：
//   坏①（RR38 所修，行尾悬挂）：「最近更新成功 · <span nowrap>时间段 北京时间</span>」
//     ——「·」在 nowrap 段外，窄行断点落其后 → 第一行行尾悬挂「·」；
//   坏②（RR40 所修，行首顶格）：「最近更新成功 <span nowrap>· 时间段 北京时间</span>」
//     ——「·」并入 nowrap 段后断点前移 → 第二行行首顶格「·」（避头尾缺陷换形态）。
// 根因：notices 两列网格下副文案宽约 170px、全串贴边必换行，「·」绑前文或绑后文必悬一处。
// 修复（去「·」改间距）：副文案不再含「·」，时间段前以 .noticeSub 作用域 padding 4px 作
// 视觉分隔；「成功」后的普通空格保留为干净断点，换行时段落行首缩进而非孤悬标点。
// 沿 ui.banner-polish.test.ts 读源码文本断言的同款先例；css 语义仍由该文件锁定，此处防回退。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const tsx = readFileSync(join(__dirname, "..", "DashboardPanel.tsx"), "utf8");
const css = readFileSync(join(__dirname, "..", "DashboardPanel.module.css"), "utf8");

describe("RR40：采集状态卡副文案「·」不悬行缘（行尾/行首皆锁）", () => {
  it("新结构：去「·」，nowrap 段为纯时间段（整段=「时间段 北京时间」）", () => {
    expect(tsx).toMatch(/最近更新成功 <span className=\{styles\.timeNoWrap\}>\{beijingShort\(vm!\.observedAt\)/);
  });
  it("成功分支整段不含分隔点「·」（改间距后无孤悬标点可换形态）", () => {
    const m = tsx.match(/最近更新成功[^\n]*北京时间/);
    expect(m).not.toBeNull();
    expect(m![0]).not.toContain("·");
  });
  it("坏②不得回归：「·」并入 nowrap 段首即行首顶格（RR40 所修形态）", () => {
    expect(tsx).not.toMatch(/最近更新成功 <span className=\{styles\.timeNoWrap\}>· /);
  });
  it("坏①不得回归：「·」暴露在 nowrap 段外即行尾悬挂（RR38 所修形态）", () => {
    expect(tsx).not.toMatch(/最近更新成功 · <span/);
  });
  it(".timeNoWrap 仍为 nowrap（RR35 时间段整段保护语义不动）", () => {
    expect(css).toMatch(/\.timeNoWrap\s*\{[^}]*white-space:\s*nowrap/);
  });
  it("间距分隔落地且作用域限 noticeSub（quotaSub 周额度卡不受影响）", () => {
    expect(css).toMatch(/\.noticeSub \.timeNoWrap\s*\{[^}]*padding-left:\s*4px/);
    expect(css).not.toMatch(/\.quotaSub \.timeNoWrap/);
  });
});
