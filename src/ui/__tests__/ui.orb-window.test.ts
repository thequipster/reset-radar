// RR43 域测试：迷你圆形态的窗口尺寸契约（沿用 RR27 三态契约，只增不减）。
import { describe, expect, it } from "vitest";
import {
  COLLAPSED_SIZE, EXPANDED_SIZE, ORB_DIAMETER, ORB_PADDING, ORB_SIZE, PEEK_SIZE, targetWidgetSize,
} from "../widgetWindow";

describe("ORB_SIZE（迷你圆窗口）", () => {
  it("窗口 72×72 = 圆直径 56 + 四周 8px 透明边（阴影与贴边位移的余量）", () => {
    expect(ORB_SIZE).toEqual({ width: 72, height: 72 });
    expect(ORB_DIAMETER).toBe(56);
    expect(ORB_PADDING).toBe(8);
    expect(ORB_DIAMETER + ORB_PADDING * 2).toBe(ORB_SIZE.width);
  });

  it("比现有胶囊小得多（用户点单：更小的圆形）", () => {
    expect(ORB_SIZE.width).toBeLessThan(COLLAPSED_SIZE.width / 4);
    expect(ORB_SIZE.height).toBeLessThan(COLLAPSED_SIZE.height);
  });
});

describe("targetWidgetSize（形态参数）", () => {
  it("收起态按形态分叉：orb=72×72，bar=460×76", () => {
    expect(targetWidgetSize("collapsed", "orb")).toEqual(ORB_SIZE);
    expect(targetWidgetSize("collapsed", "bar")).toEqual(COLLAPSED_SIZE);
  });

  it("省略形态参数时保持 RR27 既有契约（460×76），老调用点不被改语义", () => {
    expect(targetWidgetSize("collapsed")).toEqual(COLLAPSED_SIZE);
  });

  it("展开/预览与形态无关（面板尺寸不随收起形态变）", () => {
    expect(targetWidgetSize("expanded", "orb")).toEqual(EXPANDED_SIZE);
    expect(targetWidgetSize("expanded", "bar")).toEqual(EXPANDED_SIZE);
    expect(targetWidgetSize("peek", "orb")).toEqual(PEEK_SIZE);
    expect(targetWidgetSize("peek", "bar")).toEqual(PEEK_SIZE);
  });
});
