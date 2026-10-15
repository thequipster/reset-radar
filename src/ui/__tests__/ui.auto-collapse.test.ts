// RR43 域测试：自动缩圆的时序常量与状态机接线（定时器壳在组件层，此处只锁口径）。
import { describe, expect, it } from "vitest";
import {
  AUTO_COLLAPSE_BLUR_DELAY_MS, AUTO_COLLAPSE_IDLE_MS, DEFAULT_REST_FORM, DOCK_POP_DURATION_MS,
  DOCK_REDOCK_DELAY_MS, initialRestForm, nextDisplayState, shouldAutoCollapse,
} from "../appState";

describe("自动缩圆时序常量", () => {
  it("失焦宽限 600ms（点在面板内会有瞬时失焦，给缓冲）；闲置 45s", () => {
    expect(AUTO_COLLAPSE_BLUR_DELAY_MS).toBe(600);
    expect(AUTO_COLLAPSE_IDLE_MS).toBe(45_000);
  });

  it("贴边：离开 700ms 后收回去；弹回动画 140ms", () => {
    expect(DOCK_REDOCK_DELAY_MS).toBe(700);
    expect(DOCK_POP_DURATION_MS).toBe(140);
  });
});

describe("shouldAutoCollapse（只有展开态响应）", () => {
  it("展开态为真；收起/预览本来就是小的，不动", () => {
    expect(shouldAutoCollapse("expanded")).toBe(true);
    expect(shouldAutoCollapse("collapsed")).toBe(false);
    expect(shouldAutoCollapse("peek")).toBe(false);
  });
});

describe("nextDisplayState 的 auto-collapse", () => {
  it("展开 → 收起（落到 restForm 指定的形态）；其它状态收到也不怪", () => {
    expect(nextDisplayState("expanded", "auto-collapse")).toBe("collapsed");
    expect(nextDisplayState("collapsed", "auto-collapse")).toBe("collapsed");
  });

  it("与显式收起同终点，但不替代 activate/collapse 语义", () => {
    expect(nextDisplayState("peek", "auto-collapse")).toBe("collapsed");
    expect(nextDisplayState("collapsed", "activate")).toBe("expanded");
    expect(nextDisplayState("expanded", "collapse")).toBe("collapsed");
  });
});

describe("initialRestForm（hash 入口）", () => {
  it("缺省迷你圆；form=bar 切回悬浮条；可与 #expanded 组合", () => {
    expect(DEFAULT_REST_FORM).toBe("orb");
    expect(initialRestForm("")).toBe("orb");
    expect(initialRestForm("#expanded")).toBe("orb");
    expect(initialRestForm("#form=bar")).toBe("bar");
    expect(initialRestForm("#expanded&form=bar")).toBe("bar");
    expect(initialRestForm("#form=orb")).toBe("orb");
    expect(initialRestForm("#form=capsule")).toBe("orb"); // 未知值回落默认
  });
});

describe("shouldDeferAutoCollapse（RR56：原生弹层抢焦点时不缩圆）", () => {
  it("指针仍在窗口内 → 暂缓；焦点在下拉/输入框 → 暂缓；都不是才计时", async () => {
    const { shouldDeferAutoCollapse, FORM_CONTROL_TAGS } = await import("../appState");
    expect(shouldDeferAutoCollapse({ pointerInside: true, activeTag: "BODY" })).toBe(true);
    expect(shouldDeferAutoCollapse({ pointerInside: false, activeTag: "SELECT" })).toBe(true);
    expect(shouldDeferAutoCollapse({ pointerInside: false, activeTag: "input" })).toBe(true);
    expect(shouldDeferAutoCollapse({ pointerInside: false, activeTag: "TEXTAREA" })).toBe(true);
    expect(shouldDeferAutoCollapse({ pointerInside: false, activeTag: "BUTTON" })).toBe(false);
    expect(shouldDeferAutoCollapse({ pointerInside: false, activeTag: null })).toBe(false);
    expect(FORM_CONTROL_TAGS).toEqual(["SELECT", "INPUT", "TEXTAREA"]);
  });
});
