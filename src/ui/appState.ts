// 展示状态机（RR14 hash 入口 → RR27 三态）。collapsed/peek/expanded 只是展示分层，
// 不触发业务重算（02-spec §5）。hover/focus/click/Escape 全部走纯函数 nextDisplayState，
// 定时器壳在组件层；时序常量集中此处，域测试锁定。
export type DisplayState = "collapsed" | "peek" | "expanded";

/** 收起态的两种形态（RR43）：orb=迷你圆（新，默认）；bar=悬浮条胶囊（RR09 既有，保留）。 */
export type RestForm = "orb" | "bar";

/** 默认收起形态 = 迷你圆（用户点单：展开态收起后缩成圆）。悬浮条仍是可选形态，不删除。 */
export const DEFAULT_REST_FORM: RestForm = "orb";
export type DisplayEvent =
  | "pointer-enter" // 指针进入悬浮条（350ms 后由组件层发 open-peek）
  | "peek-open" // 悬停计时到点（条→预览）
  | "pointer-leave" // 离开条+预览区域（200ms 后由组件层发 peek-close）
  | "peek-close" // 离开计时到点（预览→收起）
  | "focus" // 键盘/程序聚焦悬浮条 → 与悬停同内容预览（不抢系统焦点）
  | "blur" // 焦点离开组件（预览收回）
  | "activate" // 点击/Enter/Space 展开钮 → 锁定展开
  | "collapse" // 收起按钮 / Escape（展开→收起）
  | "escape-peek" // 预览态 Escape（预览→收起）
  | "auto-collapse"; // RR43：展开态失焦/闲置到点 → 收起（落到 restForm 指定的形态）

/** 悬停展开/收回时序（02-spec §5：350ms 出现、200ms 收回）。 */
export const PEEK_OPEN_DELAY_MS = 350;
export const PEEK_CLOSE_DELAY_MS = 200;

/** RR43 自动缩圆时序：失焦宽限（点在面板内会有瞬时失焦，给一点缓冲）与空闲时长。 */
export const AUTO_COLLAPSE_BLUR_DELAY_MS = 600;
export const AUTO_COLLAPSE_IDLE_MS = 45_000;

/** RR43 贴边时序：鼠标离开后重新收回去的延迟；弹回滑入动画时长（reduced-motion 下由 CSS 兜底）。 */
export const DOCK_REDOCK_DELAY_MS = 700;
export const DOCK_POP_DURATION_MS = 140;

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
    case "auto-collapse": // RR43：与显式收起同终点，差别只在组件层是否把焦点交回入口
      return "collapsed";
  }
}

/** Escape 语义（02-spec §5）：展开→收起；预览→收起；收起态无操作。 */
export function escapeEvent(state: DisplayState): DisplayEvent | null {
  if (state === "expanded") return "collapse";
  if (state === "peek") return "escape-peek";
  return null;
}

/** hash → 收起形态（form=orb|bar 段，缺省迷你圆）。可与 #expanded 组合：#expanded&form=bar。 */
export function initialRestForm(hash: string): RestForm {
  for (const segment of hashSegments(hash)) {
    if (segment === "form=bar") return "bar";
    if (segment === "form=orb") return "orb";
  }
  return DEFAULT_REST_FORM;
}

/** 只有展开态响应“失焦/闲置自动缩圆”（RR43）：收起态与预览态本来就是小的，不动。 */
export function shouldAutoCollapse(state: DisplayState): boolean {
  return state === "expanded";
}

/** 原生弹层会抢走外壳焦点的表单控件：下拉框 / 日期与文本输入 / 多行文本。 */
export const FORM_CONTROL_TAGS: readonly string[] = ["SELECT", "INPUT", "TEXTAREA"];

/**
 * RR56：外壳失焦时是否应“暂缓”自动缩圆。WebView2 的 `<select>` 下拉与日期选择器是独立窗口，
 * 弹出瞬间外壳即失焦——过去 600ms 后面板就收成圆，用户“怎么都选不了今日建议量”。
 * 指针仍在窗口内、或焦点停在表单控件上，都说明用户还在操作，等真正离开再计时。
 */
export function shouldDeferAutoCollapse(input: { pointerInside: boolean; activeTag: string | null | undefined }): boolean {
  if (input.pointerInside) return true;
  const tag = input.activeTag?.toUpperCase() ?? "";
  return FORM_CONTROL_TAGS.includes(tag);
}
