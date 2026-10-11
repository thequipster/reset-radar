// 悬浮窗尺寸契约（RR21）：两态窗口逻辑尺寸唯一源。窗口配置字段对齐参考实现
// codex-cockpit src-tauri/tauri.conf.json（widget：decorations:false / transparent:true /
// alwaysOnTop:true / skipTaskbar:true / shadow:false / focus:false / minWidth 80 /
// maxHeight 1200 / 初始小窗动态尺寸）；其动态尺寸在 Rust 侧 PhysicalSize×scale_factor
// （codex-cockpit src-tauri/src/lib.rs:210-233），本项目进程已 DPI 感知（RR20 manifest
// PerMonitorV2），前端 LogicalSize 等效且更简。UI 零业务规则（ARCHITECTURE §2）：
// 尺寸是展示层排版常量，不产出任何业务数字。
/** 胶囊态悬浮条：460=RR13 实证胶囊自然宽 421+余量；76=浏览器实测胶囊高 63+容器 padding 12+余量（done 实证节）。 */
export const CAPSULE_SIZE = { width: 460, height: 76 } as const;

/** 展开态面板：460 宽沿 RR13/RR14 基线；648=自适应换行后实测内容高 618+padding 24+余量（done 实证节）。 */
export const EXPANDED_SIZE = { width: 460, height: 648 } as const;

/** 两态 → 目标窗口逻辑尺寸（纯函数，域测试覆盖）。 */
export function targetWidgetSize(expanded: boolean): { width: number; height: number } {
  return expanded ? EXPANDED_SIZE : CAPSULE_SIZE;
}

/** Tauri 环境检测（浏览器 vite 预览无 __TAURI_INTERNALS__ → 副作用 no-op）。 */
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** 把窗口调到目标态尺寸（副作用壳，仅 Tauri 环境生效；失败静默不阻塞渲染）。 */
export async function applyWidgetSize(expanded: boolean): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
  const size = targetWidgetSize(expanded);
  await getCurrentWindow().setSize(new LogicalSize(size.width, size.height));
}

/** 关闭悬浮窗（skipTaskbar:true 无任务栏项，展开态标题栏的 × 是唯一常规退出入口）。 */
export async function closeWidget(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().close();
}
