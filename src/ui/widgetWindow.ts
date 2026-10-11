// 悬浮窗尺寸契约（RR21 两态 → RR27 三态）。窗口基础字段（decorations/transparent/
// alwaysOnTop/skipTaskbar/shadow/focus:false）保持 RR21 对齐 codex-cockpit widget 配置；
// 本文件只持三态逻辑尺寸与副作用壳。UI 零业务规则（ARCHITECTURE §2）。
import type { DisplayState, RestForm } from "./appState";

/** 悬浮条：460=RR13 实证自然宽+余量；76=RR21 实证条高（2× 逻辑高 38 余量口径沿旧值）。 */
export const COLLAPSED_SIZE = { width: 460, height: 76 } as const;

/** 迷你预览：460 宽同条；212=02-spec §3.1（条 76 + 预览内容区 136）。 */
export const PEEK_SIZE = { width: 460, height: 212 } as const;

/** 展开面板：460 宽沿基线；690=02-spec §3.1 目标高（内容纵向滚动，maxHeight 不越工作区）。 */
export const EXPANDED_SIZE = { width: 460, height: 690 } as const;

/** 迷你圆（RR43）：圆直径 56 + 四周 8px 透明边（阴影与贴边位移的余量）→ 窗口 72×72。 */
export const ORB_DIAMETER = 56;
export const ORB_SIZE = { width: 72, height: 72 } as const;
/** 圆相对窗口的居中内缩量（透明边宽度）。 */
export const ORB_PADDING = (ORB_SIZE.width - ORB_DIAMETER) / 2;

/** 三态 → 目标窗口逻辑尺寸（纯函数，域测试覆盖）。 */
export function targetWidgetSize(
  state: DisplayState,
  form: RestForm = "bar",
): { width: number; height: number } {
  if (state === "expanded") return EXPANDED_SIZE;
  if (state === "peek") return PEEK_SIZE;
  return form === "orb" ? ORB_SIZE : COLLAPSED_SIZE;
}

/** Tauri 环境检测（浏览器 vite 预览无 __TAURI_INTERNALS__ → 副作用 no-op）。 */
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** 把窗口调到目标态尺寸（副作用壳，仅 Tauri 生效；失败静默不阻塞渲染）。 */
export async function applyWidgetSize(state: DisplayState, form: RestForm = "bar"): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
  const size = targetWidgetSize(state, form);
  await getCurrentWindow().setSize(new LogicalSize(size.width, size.height));
}

/** 关闭悬浮窗（skipTaskbar:true 无任务栏项，展开态标题栏的 × 是唯一常规退出入口）。 */
export async function closeWidget(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().close();
}
