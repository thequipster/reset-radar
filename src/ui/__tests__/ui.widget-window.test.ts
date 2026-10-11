// RR21 域测试：悬浮窗尺寸契约纯函数。窗口配置约束（minWidth 80 / maxHeight 1200，
// 对齐 codex-cockpit widget 配置）在此锁死——尺寸越界=布局回归立即红。
import { describe, expect, it } from "vitest";
import {
  CAPSULE_SIZE,
  EXPANDED_SIZE,
  targetWidgetSize,
} from "../widgetWindow";

/** 参考实现 widget 窗口边界（codex-cockpit/src-tauri/tauri.conf.json：minWidth 80 / maxHeight 1200）。 */
const WINDOW_MIN_WIDTH = 80;
const WINDOW_MAX_HEIGHT = 1200;

describe("targetWidgetSize（RR21 两态窗口尺寸契约）", () => {
  it("胶囊态返回悬浮条尺寸：460 宽（RR13 实证胶囊自然宽上限）× 76 高（实测 63+12 padding+余量）", () => {
    expect(targetWidgetSize(false)).toEqual({ width: 460, height: 76 });
    expect(targetWidgetSize(false)).toEqual(CAPSULE_SIZE);
  });

  it("展开态返回面板尺寸：与胶囊同宽、更高（三块面板）", () => {
    expect(targetWidgetSize(true)).toEqual(EXPANDED_SIZE);
    expect(EXPANDED_SIZE.width).toBe(CAPSULE_SIZE.width);
    expect(EXPANDED_SIZE.height).toBeGreaterThan(CAPSULE_SIZE.height);
  });

  it("两态尺寸均在窗口边界内（minWidth 80 / maxHeight 1200）", () => {
    for (const size of [CAPSULE_SIZE, EXPANDED_SIZE]) {
      expect(size.width).toBeGreaterThanOrEqual(WINDOW_MIN_WIDTH);
      expect(size.height).toBeLessThanOrEqual(WINDOW_MAX_HEIGHT);
    }
  });

  it("胶囊态高度收紧：不再为展开态预留整窗高度（用户反馈 0.6% 占比病根）", () => {
    expect(CAPSULE_SIZE.height).toBeLessThanOrEqual(120);
  });
});
