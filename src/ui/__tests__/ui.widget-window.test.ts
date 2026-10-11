// RR27 域测试：三态窗口逻辑尺寸契约（沿 RR21 实证基线，02-spec §3.1）。
import { describe, expect, it } from "vitest";
import { COLLAPSED_SIZE, EXPANDED_SIZE, PEEK_SIZE, targetWidgetSize } from "../widgetWindow";

describe("targetWidgetSize（三态窗口尺寸契约）", () => {
  it("collapsed=460×76（RR21 实证悬浮条）；peek=460×212；expanded=460×690", () => {
    expect(COLLAPSED_SIZE).toEqual({ width: 460, height: 76 });
    expect(PEEK_SIZE).toEqual({ width: 460, height: 212 });
    expect(EXPANDED_SIZE).toEqual({ width: 460, height: 690 });
    expect(targetWidgetSize("collapsed")).toEqual(COLLAPSED_SIZE);
    expect(targetWidgetSize("peek")).toEqual(PEEK_SIZE);
    expect(targetWidgetSize("expanded")).toEqual(EXPANDED_SIZE);
  });

  it("三态同宽 460（RR13 实证胶囊自然宽基线，窄窗不横滚的宽度前提）", () => {
    for (const state of ["collapsed", "peek", "expanded"] as const) {
      expect(targetWidgetSize(state).width).toBe(460);
    }
  });
});
