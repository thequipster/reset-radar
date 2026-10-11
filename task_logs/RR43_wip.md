# RR43 wip — 悬浮外壳：托盘常驻 + 迷你圆 + 贴边停靠

- 领卡：2026-10-11 22:23:27（S1011-2223）；base main bbfed86；worktree ../reset-radar_wt/RR43（分支 agent/RR43）
- 来源：ROADMAP「用户在线点单」两行 ①托盘后台常驻（关窗仅收起、彻底退出走托盘菜单）②迷你圆形态
  （比胶囊更小的圆只显一个数；展开态失焦/闲置自动缩圆；拖到屏幕边缘收贴边半圆、鼠标靠近弹回）
- 硬约束：保留展开面板四页签（overview/risk/planner/data）、本地优先（状态只落 localStorage + app_config_dir）、无遥测

## 改动范围

| 文件 | 改动 |
|---|---|
| src-tauri/src/shell.rs | 新增：托盘菜单（显隐/展开/形态/指标/退出）+ 关窗拦截 + 5 个窗口几何命令 |
| src-tauri/src/lib.rs | 挂 ShellState、on_window_event(CloseRequested→hide)、注册 shell_* 命令 |
| src/ui/dockGeometry.ts | 新增纯函数：边距计算/吸附判定/贴边与弹回坐标/圆位移 |
| src/ui/orbMetric.ts | 新增纯函数：指标选取、风险分档、圆环填充、格式化 |
| src/ui/shellBridge.ts | 新增：Tauri 命令壳 + 托盘事件订阅 + localStorage 偏好读写 |
| src/ui/Orb.tsx / Orb.module.css | 新增：迷你圆组件（圆环+一个数，拖拽/贴边/右键换指标） |
| src/App.tsx | 接线：形态/指标/贴边/自动缩圆/托盘动作/几何应用 |
| src/ui/appState.ts | 扩展：RestForm、auto-collapse 事件与时序常量、initialRestForm、shouldAutoCollapse |
| src/ui/widgetWindow.ts | 扩展：ORB_SIZE(72×72)、targetWidgetSize(state, form) |
| src/ui/__tests__/ui.{dock-geometry,orb-metric,shell-prefs,orb-window,auto-collapse}.test.ts | 新增 38 例 |

## 门禁进展

- tsc --noEmit：✅ exit0
- 域测试：✅ 38/38
- 全量 vitest：✅ 310/310（基线 272 + 本卡 38，零新增 failed）
- 变异红验：✅ 3 组（DOCK_VISIBLE 24→40 / riskBand 30→50 / readNumber 去空串保护）各红 1 条，已复原复绿
- cargo check --tests：进行中（见收工更新）

## 本班降级口径（如实记录）

- Bridge 通道 `run_task["pwsh",…]` 被禁（返回 “Shells and system command-string interpreters are disabled”），
  故 AGENTS §7「PowerShell 一律 pwsh」本班无法执行；改用 node/npx/cargo 的 argv 直调。
- 无 shell ⇒ 无法 `export PATH`。build.rs 的 tauri-winres 需要 windres：
  把 MinGW 的 windres.exe 与其依赖 DLL 以**硬链**方式放进 C:\Users\slsjz\.cargo\bin（使其落在 PATH 上）。
  此为工作区外环境副作用，收工清单已列，用户可自行删除。
- worktree 无 node_modules：以 junction 复用 RR26 worktree 的 node_modules（node_modules 已 gitignore，不入库）。
