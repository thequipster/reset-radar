// RR43 贴边停靠几何（纯函数，域测试锁定）。
// 坐标口径：一律逻辑像素（DPI 无关），与 widgetWindow 的 LogicalSize/LogicalPosition 一致；
// 系统物理像素 → 逻辑像素的换算只在 shellBridge 边界做一次（TRUTH B10：manifest PerMonitorV2）。
// ARCHITECTURE §2：本文件只做「矩形 → 边 / 坐标」的呈现层几何，不产出任何业务数字。
export type DockEdge = "left" | "right" | "top" | "bottom";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** 拖到距屏幕边缘多少逻辑像素以内即吸附贴边。 */
export const DOCK_SNAP_DISTANCE = 40;

/** 自由摆放时至少保留在屏幕内的像素，防止整窗被拖出可视区找不回来。 */
export const KEEP_ON_SCREEN = 12;

/** 稳定顺序：同距时按 左→右→上→下 取，保证结果可复现（测试与视觉一致）。 */
export const DOCK_EDGES: readonly DockEdge[] = ["left", "right", "top", "bottom"];

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min; // 窗口比屏幕还大时的退化情形
  return Math.min(Math.max(value, min), max);
}

/** 将窗口完整夹回工作区，供展开前先移动到可容纳目标窗的位置。 */
export function clampVisiblePosition(
  position: { x: number; y: number },
  monitor: Rect,
  size: Size,
): { x: number; y: number } {
  return {
    x: clamp(position.x, monitor.x, monitor.x + monitor.width - size.width),
    y: clamp(position.y, monitor.y, monitor.y + monitor.height - size.height),
  };
}

/** 窗口四边到屏幕四边的距离（逻辑像素，负数 = 已越界）。 */
export function edgeDistances(window: Rect, monitor: Rect): Record<DockEdge, number> {
  return {
    left: window.x - monitor.x,
    right: monitor.x + monitor.width - (window.x + window.width),
    top: window.y - monitor.y,
    bottom: monitor.y + monitor.height - (window.y + window.height),
  };
}

/** 最近的边：只有距离 ≤ threshold 才吸附；否则返回 null（自由摆放）。 */
export function nearestDockEdge(
  window: Rect,
  monitor: Rect,
  threshold: number = DOCK_SNAP_DISTANCE,
): DockEdge | null {
  const distances = edgeDistances(window, monitor);
  let best: DockEdge | null = null;
  for (const edge of DOCK_EDGES) {
    if (distances[edge] > threshold) continue;
    if (best === null || distances[edge] < distances[best]) best = edge;
  }
  return best;
}

/** 贴边坐标：窗口中心压在屏幕边线上，圆形露出恰好一半；另一轴保持并夹在屏幕内。 */
export function dockedPosition(
  edge: DockEdge,
  monitor: Rect,
  size: Size,
  current: { x: number; y: number },
): { x: number; y: number } {
  const minX = monitor.x + KEEP_ON_SCREEN;
  const maxX = monitor.x + monitor.width - size.width - KEEP_ON_SCREEN;
  const minY = monitor.y + KEEP_ON_SCREEN;
  const maxY = monitor.y + monitor.height - size.height - KEEP_ON_SCREEN;
  switch (edge) {
    case "left":
      return { x: monitor.x - size.width / 2, y: clamp(current.y, minY, maxY) };
    case "right":
      return { x: monitor.x + monitor.width - size.width / 2, y: clamp(current.y, minY, maxY) };
    case "top":
      return { x: clamp(current.x, minX, maxX), y: monitor.y - size.height / 2 };
    case "bottom":
      return { x: clamp(current.x, minX, maxX), y: monitor.y + monitor.height - size.height / 2 };
  }
}

/** 弹回坐标：鼠标靠近时整圆滑回屏幕内，停在距该边 gap 像素处（“贴着边但完整可见”）。 */
export function poppedPosition(
  edge: DockEdge,
  monitor: Rect,
  size: Size,
  current: { x: number; y: number },
  gap: number = KEEP_ON_SCREEN,
): { x: number; y: number } {
  const docked = dockedPosition(edge, monitor, size, current);
  switch (edge) {
    case "left":
      return { x: monitor.x + gap, y: docked.y };
    case "right":
      return { x: monitor.x + monitor.width - size.width - gap, y: docked.y };
    case "top":
      return { x: docked.x, y: monitor.y + gap };
    case "bottom":
      return { x: docked.x, y: monitor.y + monitor.height - size.height - gap };
  }
}

/** 当前坐标是否已处于某边的贴边位（容差内）。用于判断“该弹回还是本来就在外面”。 */
export function isDockedAt(
  edge: DockEdge,
  window: Rect,
  monitor: Rect,
  tolerance: number = 2,
): boolean {
  const target = dockedPosition(edge, monitor, window, { x: window.x, y: window.y });
  return Math.abs(target.x - window.x) <= tolerance && Math.abs(target.y - window.y) <= tolerance;
}
