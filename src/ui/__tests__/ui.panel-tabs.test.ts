// RR31 域测试：展开面板页签解析（用户指定的分模块入口）。
import { describe, expect, it } from "vitest";
import { PANEL_TABS, initialPanelTab, isPanelTab } from "../panelTabs";

describe("页签集合", () => {
  it("四页签固定顺序：概览/风险/用卡/数据", () => {
    expect(PANEL_TABS.map((tab) => tab.key)).toEqual(["overview", "risk", "planner", "data"]);
    expect(PANEL_TABS.map((tab) => tab.label)).toEqual(["概览", "风险", "用卡", "数据"]);
  });
});

describe("isPanelTab", () => {
  it("只认四个键；前缀相似与非法值都拒绝", () => {
    for (const key of ["overview", "risk", "planner", "data"]) expect(isPanelTab(key)).toBe(true);
    expect(isPanelTab("risks")).toBe(false);
    expect(isPanelTab("")).toBe(false);
    expect(isPanelTab("Overview")).toBe(false); // 大小写敏感
  });
});

describe("initialPanelTab（hash 组合段）", () => {
  it("tab= 段生效；与其他段自由组合；缺省概览", () => {
    expect(initialPanelTab("#expanded&tab=risk")).toBe("risk");
    expect(initialPanelTab("#expanded&demo=stale&tab=planner")).toBe("planner");
    expect(initialPanelTab("#tab=data")).toBe("data");
    expect(initialPanelTab("#expanded")).toBe("overview");
    expect(initialPanelTab("")).toBe("overview");
  });
  it("非法 tab 值回退概览，不误收", () => {
    expect(initialPanelTab("#expanded&tab=settings")).toBe("overview");
    expect(initialPanelTab("#tabb=risk")).toBe("overview");
  });
});
