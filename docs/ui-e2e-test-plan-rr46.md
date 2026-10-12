# RR46 UI DOM / E2E 验收计划

目的：验证圆形入口的两级打开流程、拖拽贴边和释放收尾，避免只凭源码断言交互正确。执行时从 RR46 当前分支重建应用，并使用全新截图；不复用 QA 报告旧图作视觉验收。

## DOM 组件验收

使用真实 DOM（Vitest Browser Mode 或 Playwright component test）挂载 App/Orb，mock shell bridge 并记录窗口 bounds 调用。

1. 点击圆圈一次：状态从 collapsed/orb 到 collapsed/bar；确认显示悬浮条而非展开面板。
2. 点击悬浮条主要入口：状态进入 expanded，确认完整面板及概览/风险/用卡/数据页签可见。
3. 对圆圈按下后拖动超过阈值，指针移出按钮并在 window 上 pointerup：确认只结束一次、调用最终贴边评估、拖拽态清除。
4. 同一拖动分别触发 pointercancel、lostpointercapture 和 window blur：确认结束回调最多一次；取消/失焦使用最近一次 pointermove 坐标，不跳回拖动起点。
5. 拖动期间制造 React rerender，再在 window 派发 pointerup：确认旧 window listener 被稳定移除、结束回调仍只发生一次。
6. 拖动期间触发 pointerenter/leave：确认 hover 弹回/回贴逻辑不介入当前拖动。
7. 对 shellSetBounds 使用可控延迟逆序完成多个 move IPC，随后完成 drop snap：确认 App 的串行队列使最终 bounds 始终为松手吸附目标。

## 原生窗口 E2E 验收

使用构建产物启动真实 Tauri 窗口，记录当前显示器的 logical bounds 与 scaleFactor；不将 CSS 坐标、物理屏幕像素混用。

1. 点击圆圈，截图确认先出现悬浮条；点击条的展开入口，截图确认进入完整面板。
2. 分别从屏幕中央拖至左、右、上、下边缘，松手后立即记录 bounds 与截图。每个方向窗口中心应落在工作区边线上，圆的屏内部分应为完整外凸半圆，无平直板条；release 后样式不能残留拖拽态。
3. 在四个角附近松手，确认吸附边选择稳定，圆弧没有被另一轴的边界夹断。
4. 从底部贴边态展开，确认目标尺寸在 work area 内完整可见；记录展开前后 bounds。
5. 等待贴边 hover 弹出及离开回贴，再重复一次拖拽，确认贴边/弹回不改变存储位置或最终 drop 目标。
6. 至少在 100% 与 200% DPI 环境各执行一轮；截图按物理分辨率核验，bounds 按逻辑像素核验。

## 验收证据

保存命令、构建版本、时间、屏幕工作区/缩放比例、各场景 bounds 和新截图。截图完成后再交由只读视觉审查代理逐图检查圆弧方向、拖拽残影、两级层级和展开面板裁切；审查结论需逐图列出通过项与可见差距。
