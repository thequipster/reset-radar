// RR43 域测试：贴边停靠几何（纯函数）。窗口/屏幕坐标一律逻辑像素，DPI 换算不进本层。
import { describe, expect, it } from "vitest";
import {
  DOCK_SNAP_DISTANCE, KEEP_ON_SCREEN, dockedPosition, edgeDistances, isDockedAt,
  nearestDockEdge, poppedPosition, clampVisiblePosition, type Rect,
} from "../dockGeometry";

const MONITOR: Rect = { x: 0, y: 0, width: 1920, height: 1080 };
const SIZE = { width: 72, height: 72 };
const at = (x: number, y: number): Rect => ({ x, y, width: SIZE.width, height: SIZE.height });

describe("edgeDistances（四边距屏幕边的距离）", () => {
  it("正数=还差多少贴到边；负数=已越界", () => {
    expect(edgeDistances(at(100, 200), MONITOR)).toEqual({
      left: 100,
      right: 1920 - 172,
      top: 200,
      bottom: 1080 - 272,
    });
    expect(edgeDistances(at(-10, 0), MONITOR).left).toBe(-10);
  });

  it("多显示器有偏移时按显示器原点算（不是按虚拟屏原点）", () => {
    const second: Rect = { x: 1920, y: -200, width: 1280, height: 1024 };
    expect(edgeDistances(at(1924, -180), second)).toEqual({
      left: 4,
      right: 1280 - 4 - 72,
      top: 20,
      bottom: 1024 - 20 - 72,
    });
  });
});

describe("nearestDockEdge（是否该吸附）", () => {
  it("进入吸附距离才贴边，否则自由摆放", () => {
    expect(nearestDockEdge(at(10, 500), MONITOR)).toBe("left");
    expect(nearestDockEdge(at(DOCK_SNAP_DISTANCE, 500), MONITOR)).toBe("left"); // 边界内
    expect(nearestDockEdge(at(500, 500), MONITOR)).toBeNull();
    expect(nearestDockEdge(at(1896, 500), MONITOR)).toBe("right");
    expect(nearestDockEdge(at(500, 8), MONITOR)).toBe("top");
    expect(nearestDockEdge(at(500, 1080 - 72 - 8), MONITOR)).toBe("bottom");
  });

  it("同距时按 左→右→上→下 稳定取，结果可复现", () => {
    expect(nearestDockEdge(at(4, 4), MONITOR)).toBe("left");
    expect(nearestDockEdge(at(0, 0), MONITOR)).toBe("left"); // 左上同距 → 左在前
    expect(nearestDockEdge(at(1848, 1008), MONITOR)).toBe("right"); // 右下同距 → 右在前
  });
});

describe("dockedPosition（圆心压边线，露出半圆）", () => {
  it("四条边窗口中心都落在屏幕边线上", () => {
    expect(dockedPosition("left", MONITOR, SIZE, { x: 200, y: 300 })).toEqual({
      x: -36,
      y: 300,
    });
    expect(dockedPosition("right", MONITOR, SIZE, { x: 200, y: 300 })).toEqual({
      x: 1920 - 36,
      y: 300,
    });
    expect(dockedPosition("top", MONITOR, SIZE, { x: 200, y: 300 })).toEqual({
      x: 200,
      y: -36,
    });
    expect(dockedPosition("bottom", MONITOR, SIZE, { x: 200, y: 300 })).toEqual({
      x: 200,
      y: 1080 - 36,
    });
  });

  it("另一轴夹在屏幕内：贴边不会把圆甩出可见区", () => {
    const low = dockedPosition("right", MONITOR, SIZE, { x: 100, y: -9999 });
    const high = dockedPosition("right", MONITOR, SIZE, { x: 100, y: 9999 });
    expect(low.y).toBe(KEEP_ON_SCREEN);
    expect(high.y).toBe(1080 - 72 - KEEP_ON_SCREEN);
  });
});

describe("clampVisiblePosition（展开前收回工作区）", () => {
  it("将下缘展开位置完整夹回屏幕内", () => {
    expect(clampVisiblePosition({ x: 329, y: 1681 }, MONITOR, { width: 460, height: 690 }))
      .toEqual({ x: 329, y: 390 });
  });

  it("支持非零工作区原点并保证完整可见", () => {
    expect(clampVisiblePosition({ x: -999, y: 9999 }, MONITOR, SIZE))
      .toEqual({ x: 0, y: 1008 });
    const second: Rect = { x: -1920, y: -200, width: 1280, height: 1024 };
    expect(clampVisiblePosition({ x: 900, y: -900 }, second, SIZE))
      .toEqual({ x: -712, y: -200 });
  });
});

describe("poppedPosition（鼠标靠近弹回）", () => {
  it("弹回后整窗完整可见，且贴着原来那条边", () => {
    for (const edge of ["left", "right", "top", "bottom"] as const) {
      const popped = poppedPosition(edge, MONITOR, SIZE, { x: 900, y: 500 });
      expect(popped.x).toBeGreaterThanOrEqual(MONITOR.x);
      expect(popped.y).toBeGreaterThanOrEqual(MONITOR.y);
      expect(popped.x + SIZE.width).toBeLessThanOrEqual(MONITOR.x + MONITOR.width);
      expect(popped.y + SIZE.height).toBeLessThanOrEqual(MONITOR.y + MONITOR.height);
    }
    expect(poppedPosition("right", MONITOR, SIZE, { x: 900, y: 500 }).x).toBe(1920 - 72 - KEEP_ON_SCREEN);
    expect(poppedPosition("left", MONITOR, SIZE, { x: 900, y: 500 }).x).toBe(KEEP_ON_SCREEN);
  });

  it("弹回 → 再贴边回到同一个位置（反复贴边不会漂移）", () => {
    const edge = "right";
    const docked = dockedPosition(edge, MONITOR, SIZE, { x: 900, y: 500 });
    const popped = poppedPosition(edge, MONITOR, SIZE, { x: 900, y: 500 });
    expect(popped.y).toBe(docked.y);
    const again = dockedPosition(edge, MONITOR, SIZE, popped);
    expect(again).toEqual(docked);
    expect(isDockedAt(edge, { ...again, ...SIZE }, MONITOR)).toBe(true);
    expect(isDockedAt(edge, { ...popped, ...SIZE }, MONITOR)).toBe(false);
  });
});
