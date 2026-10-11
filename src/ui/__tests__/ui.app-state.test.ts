// RR27 域测试：三态展示状态机（collapsed/peek/expanded）与 hash 入口。
// 时序常量（350/200ms）只由组件层计时器使用，转移函数本身不做时间判断——
// 「计时到点」以 peek-open/peek-close 事件显式表达（02-spec §5）。
import { describe, expect, it } from "vitest";
import {
  PEEK_CLOSE_DELAY_MS, PEEK_OPEN_DELAY_MS, escapeEvent, initialDisplayState, nextDisplayState,
} from "../appState";

describe("initialDisplayState（hash 状态入口，RR14→RR27）", () => {
  it("#expanded 起始展开；#peek 起始预览；组合段互不干扰；其余一律收起", () => {
    expect(initialDisplayState("#expanded")).toBe("expanded");
    expect(initialDisplayState("#peek")).toBe("peek");
    expect(initialDisplayState("#expanded&demo=stale")).toBe("expanded");
    expect(initialDisplayState("#demo=stale&peek")).toBe("peek");
    expect(initialDisplayState("")).toBe("collapsed");
    expect(initialDisplayState("#demo=empty")).toBe("collapsed");
    expect(initialDisplayState("#expand")).toBe("collapsed"); // 前缀相似不误匹配
  });
});

describe("nextDisplayState 转移", () => {
  it("悬停计时到点才开预览：pointer-enter 只登记、peek-open 才升层", () => {
    expect(nextDisplayState("collapsed", "pointer-enter")).toBe("collapsed");
    expect(nextDisplayState("collapsed", "peek-open")).toBe("peek");
  });

  it("离开计时到点才收：pointer-leave 不立即降层，移回条内取消（peek-close 才收）", () => {
    expect(nextDisplayState("peek", "pointer-leave")).toBe("peek");
    expect(nextDisplayState("peek", "peek-close")).toBe("collapsed");
    expect(nextDisplayState("collapsed", "peek-close")).toBe("collapsed"); // 无预览可收
  });

  it("展开态是锁定的：悬停/离开/焦点事件全部 no-op，只有 activate/collapse 变化", () => {
    for (const event of ["pointer-enter", "peek-open", "pointer-leave", "peek-close", "focus", "blur", "escape-peek"] as const) {
      expect(nextDisplayState("expanded", event)).toBe("expanded");
    }
    expect(nextDisplayState("collapsed", "activate")).toBe("expanded");
    expect(nextDisplayState("peek", "activate")).toBe("expanded");
    expect(nextDisplayState("expanded", "collapse")).toBe("collapsed");
  });

  it("时序常量锚定 02-spec §5：350ms 开、200ms 收", () => {
    expect(PEEK_OPEN_DELAY_MS).toBe(350);
    expect(PEEK_CLOSE_DELAY_MS).toBe(200);
  });
});

describe("escapeEvent（Escape 语义）", () => {
  it("展开→收起；预览→收起；收起态无操作", () => {
    expect(escapeEvent("expanded")).toBe("collapse");
    expect(escapeEvent("peek")).toBe("escape-peek");
    expect(escapeEvent("collapsed")).toBeNull();
  });
});
