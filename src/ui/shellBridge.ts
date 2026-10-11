// RR43 悬浮外壳桥：托盘/窗口 OS 基元的副作用壳（浏览器降级 no-op，与 widgetWindow 同口径）。
// 分工：几何数值全部由 TS 侧（dockGeometry.ts + widgetWindow.ts）算好再传进来，
// Rust 只执行「设坐标/显隐/退出」这类 OS 基元——算法唯一实现源仍是 TS（RUNBOOK §1.4）。
// 本地优先：偏好只写 localStorage，不外发、无遥测（ARCHITECTURE §1）。
import type { DockEdge, Rect } from "./dockGeometry";
import { DEFAULT_ORB_METRIC, isOrbMetric, type OrbMetric } from "./orbMetric";
import type { RestForm } from "./appState";

export interface ShellGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
  monitor: Rect;
}

/** Rust 托盘菜单事件名（shell.rs SHELL_ACTION_EVENT）。 */
export const SHELL_ACTION_EVENT = "rr-shell-action";

export type ShellAction =
  | "toggle"
  | "expand"
  | "quit"
  | `form:${RestForm}`
  | `metric:${OrbMetric}`;

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** 当前窗口 + 所在显示器的几何（逻辑像素；物理→逻辑换算在 Rust 侧完成）。 */
export async function shellGeometry(): Promise<ShellGeometry | null> {
  if (!isTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<ShellGeometry>("shell_geometry");
}

/** 设置窗口坐标与尺寸（逻辑像素）。 */
export async function shellSetBounds(
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke<void>("shell_set_bounds", { x, y, width, height });
}

/** 显示 / 隐藏窗口（关窗只收起，进程常驻托盘，见 shell.rs 的 CloseRequested 拦截）。 */
export async function shellSetVisible(visible: boolean): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke<void>("shell_set_visible", { visible });
}

/** 窗口当前是否可见；浏览器降级返回 null（调用方按“未知”处理，不臆断）。 */
export async function shellIsVisible(): Promise<boolean | null> {
  if (!isTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<boolean>("shell_is_visible");
}

/** 彻底退出（唯一出口在托盘菜单，shell.rs 置 quitting 后 app.exit(0)）。 */
export async function shellQuit(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke<void>("shell_quit");
}

/** 订阅托盘菜单动作；返回取消订阅函数。 */
export async function onShellAction(
  handler: (action: ShellAction) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<string>(SHELL_ACTION_EVENT, (event) => {
    handler(event.payload as ShellAction);
  });
  return unlisten;
}

/** 窗口焦点变化订阅（展开态失焦自动缩圆的触发源之一）。 */
export async function onShellFocusChanged(
  handler: (focused: boolean) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return await getCurrentWindow().onFocusChanged(({ payload }) => handler(payload));
}

// —— 外壳偏好（localStorage；与 theme.ts 的主题记忆同口径）——

export interface ShellPrefs {
  /** 收起态形态：迷你圆 / 悬浮条。 */
  form: RestForm;
  /** 迷你圆显示哪个数。 */
  metric: OrbMetric;
  /** 当前贴边的边；null = 自由摆放。 */
  dockEdge: DockEdge | null;
  /** 自由摆放时的窗口坐标（逻辑像素）；null = 未记忆，用系统默认位。 */
  x: number | null;
  y: number | null;
}

const KEY_FORM = "rr.shell.form";
const KEY_METRIC = "rr.shell.metric";
const KEY_DOCK_EDGE = "rr.shell.dockEdge";
const KEY_X = "rr.shell.x";
const KEY_Y = "rr.shell.y";

export const DEFAULT_SHELL_PREFS: ShellPrefs = {
  form: "orb",
  metric: DEFAULT_ORB_METRIC,
  dockEdge: null,
  x: null,
  y: null,
};

/** 只依赖 get/setItem 的最小接口，便于域测试用假 storage（本地优先，不碰网络）。 */
export interface PrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const DOCK_EDGES: readonly DockEdge[] = ["left", "right", "top", "bottom"];

function readNumber(value: string | null): number | null {
  // 空串 = 没记过（清除偏好时写 ""），不能当成 0，否则圆会被拽到屏幕左上角。
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 读取外壳偏好；任何坏值/缺值都回落到默认，不抛错（损坏的本地存储不该让悬浮窗起不来）。 */
export function readShellPrefs(storage: PrefsStorage | null | undefined): ShellPrefs {
  if (storage == null) return { ...DEFAULT_SHELL_PREFS };
  const read = (key: string): string | null => {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };
  const form = read(KEY_FORM);
  const metric = read(KEY_METRIC);
  const edge = read(KEY_DOCK_EDGE);
  return {
    form: form === "orb" || form === "bar" ? form : DEFAULT_SHELL_PREFS.form,
    metric: metric != null && isOrbMetric(metric) ? metric : DEFAULT_SHELL_PREFS.metric,
    dockEdge:
      edge != null && (DOCK_EDGES as readonly string[]).includes(edge) ? (edge as DockEdge) : null,
    x: readNumber(read(KEY_X)),
    y: readNumber(read(KEY_Y)),
  };
}

/** 局部写回偏好：只写传入的字段（undefined = 不动，null = 清除）。 */
export function writeShellPrefs(
  storage: PrefsStorage | null | undefined,
  patch: Partial<ShellPrefs>,
): void {
  if (storage == null) return;
  // 存储不可用时静默降级：偏好丢失不影响本次会话可用（本地优先但不强依赖）。
  const put = (key: string, value: string): void => {
    try {
      storage.setItem(key, value);
    } catch {
      /* localStorage 被禁用时不阻断 UI */
    }
  };
  if (patch.form !== undefined) put(KEY_FORM, patch.form);
  if (patch.metric !== undefined) put(KEY_METRIC, patch.metric);
  if (patch.dockEdge !== undefined) put(KEY_DOCK_EDGE, patch.dockEdge ?? "");
  if (patch.x !== undefined) put(KEY_X, patch.x === null ? "" : String(patch.x));
  if (patch.y !== undefined) put(KEY_Y, patch.y === null ? "" : String(patch.y));
}
