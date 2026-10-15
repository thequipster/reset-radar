// RR27 域测试：三态窗口逻辑尺寸契约（沿 RR21 实证基线，02-spec §3.1）。
import { describe, expect, it } from "vitest";
import { COLLAPSED_SIZE, EXPANDED_SIZE, PEEK_SIZE, targetWidgetSize } from "../widgetWindow";

describe("targetWidgetSize（三态窗口尺寸契约）", () => {
  it("collapsed=460×76（RR21 实证悬浮条）；peek=460×212；expanded=1080×800", () => {
    expect(COLLAPSED_SIZE).toEqual({ width: 460, height: 76 });
    expect(PEEK_SIZE).toEqual({ width: 460, height: 212 });
    expect(EXPANDED_SIZE).toEqual({ width: 1080, height: 800 });
    expect(targetWidgetSize("collapsed")).toEqual(COLLAPSED_SIZE);
    expect(targetWidgetSize("peek")).toEqual(PEEK_SIZE);
    expect(targetWidgetSize("expanded")).toEqual(EXPANDED_SIZE);
  });

  it("仅展开工作台加宽，迷你条与预览保持原尺寸", () => {
    expect(targetWidgetSize("collapsed").width).toBe(460);
    expect(targetWidgetSize("peek").width).toBe(460);
    expect(targetWidgetSize("expanded").width).toBe(1080);
  });
});
