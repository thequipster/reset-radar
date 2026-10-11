// RR14 域测试：hash 状态入口纯函数。口径=#expanded 精确起始展开——URL fragment
// 浏览器原样保留、不归一化（大小写敏感）；其余一切 hash 起始胶囊态。
import { describe, expect, it } from "vitest";
import { initialExpanded } from "../appState";

describe("initialExpanded（hash 状态入口，RR14）", () => {
  it("#expanded → 起始展开", () => {
    expect(initialExpanded("#expanded")).toBe(true);
  });

  it("空 hash（默认入口）→ 起始胶囊态", () => {
    expect(initialExpanded("")).toBe(false);
  });

  it("其他片段不触发——fragment 不归一化，大小写敏感", () => {
    expect(initialExpanded("#EXPANDED")).toBe(false);
    expect(initialExpanded("#expanded/")).toBe(false);
    expect(initialExpanded("#x")).toBe(false);
  });
});
