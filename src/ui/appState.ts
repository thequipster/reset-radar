// 应用起始态（RR14）：location.hash=#expanded → 起始展开。纯展示接线（ARCHITECTURE
// §2 UI 零业务规则），独立纯函数可测，App 只做一行接线。可复现路径=release exe 起跑
// 后将 webview 导航至 index.html#expanded（RR09_done B09 机制②，截图/验收入口）。
export function initialExpanded(hash: string): boolean {
  return hash === "#expanded";
}
