// 展示状态机（RR14 hash 入口 → RR27 三态）。collapsed/peek/expanded 只是展示分层，
// 不触发业务重算（02-spec §5）。hover/focus/click/Escape 全部走纯函数 nextDisplayState，
// 定时器壳在组件层；时序常量集中此处，域测试锁定。
export type DisplayState = "collapsed" | "peek" | "expanded";
export type DisplayEvent =
  | "pointer-enter" // 指针进入悬浮条（350ms 后由组件层发 open-peek）
  | "peek-open" // 悬停计时到点（条→预览）
  | "pointer-leave" // 离开条+预览区域（200ms 后由组件层发 peek-close）
  | "peek-close" // 离开计时到点（预览→收起）
  | "focus" // 键盘/程序聚焦悬浮条 → 与悬停同内容预览（不抢系统焦点）
  | "blur" // 焦点离开组件（预览收回）
  | "activate" // 点击/Enter/Space 展开钮 → 锁定展开
  | "collapse" // 收起按钮 / Escape（展开→收起）
  | "escape-peek"; // 预览态 Escape（预览→收起）

/** 悬停展开/收回时序（02-spec §5：350ms 出现、200ms 收回）。 */
export const PEEK_OPEN_DELAY_MS = 350;
export const PEEK_CLOSE_DELAY_MS = 200;

/** hash 段集合：#expanded&demo=stale → ["expanded","demo=stale"]（组合入口，RR27 截图用）。 */
export function hashSegments(hash: string): string[] {
  return hash.replace(/^#/, "").split("&").filter((segment) => segment.length > 0);
}

/** hash 起始态（截图/验收可复现入口；含 expanded/peek 段即生效，其余一律 collapsed）。 */
export function initialDisplayState(hash: string): DisplayState {
  const segments = hashSegments(hash);
  if (segments.includes("expanded")) return "expanded";
  if (segments.includes("peek")) return "peek";
  return "collapsed";
}

/** 纯转移函数：任何「降层」事件在 expanded 下被忽略为 no-op（只能显式 collapse）。 */
export function nextDisplayState(state: DisplayState, event: DisplayEvent): DisplayState {
  switch (event) {
    case "pointer-enter":
    case "focus":
      return state === "expanded" ? "expanded" : "collapsed"; // 计时到点才 peek-open
    case "peek-open":
      return state === "expanded" ? "expanded" : "peek";
    case "pointer-leave":
    case "blur":
      return state; // 计时到点才 peek-close（移回条内可取消）
    case "peek-close":
    case "escape-peek":
      return state === "peek" ? "collapsed" : state;
    case "activate":
      return "expanded";
    case "collapse":
      return "collapsed";
  }
}

/** Escape 语义（02-spec §5）：展开→收起；预览→收起；收起态无操作。 */
export function escapeEvent(state: DisplayState): DisplayEvent | null {
  if (state === "expanded") return "collapse";
  if (state === "peek") return "escape-peek";
  return null;
}
