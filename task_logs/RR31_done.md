# RR31 交付档案（展开面板分页模块化 + 顶栏透出修复 + 图注澄清）

- 卡面：BACKLOG RR31（🔧修卡，ui；用户在线指定）。
- 会话：S1011-RR31（base main febbfb6）。
- 分支/commit：`agent/RR31 @ b0cb857`（单 commit）；patch `task_logs/RR31.patch`（对 main 干净适用）。

## 改动范围

- `src/ui/panelTabs.ts`（新）：四页签常量与 hash 解析（#expanded&tab=risk）。
- `src/ui/DashboardPanel.tsx` 重排：常驻顶栏+页签行+四页（概览/风险/用卡/数据与校准），
  每页适配 690 逻辑高；演示徽标提到顶栏常驻；数据页收编配速解释与四来源时刻行。
- `DashboardPanel.module.css`：tabBar/tabButton/page 类；顶栏改 `--bg-header` 不透明实底
  （修复 0.97 半透明透出）；页面容器 scrollbar-width:none（极端超长静默兜底，不出条）。
- `widget.css`：`--bg-header` 深 (#0c1622) / 浅 (#f5f8fc) 两 token。
- 用卡页柱状图注补防误读澄清：**期望收益=用卡后到下次重置前可实际消耗的增量
  （按强制重置风险折价），不是补给规模**——回应本轮用户算法疑问（结论：无缺陷不立卡，
  实算证据见 TRUTH §U 2026-10-11 用户 UI 反馈节）。
- 测试：新 ui.panel-tabs.test.ts（4 用例）。

## 门禁与实证

- tsc 0 / UI 域 81/81 / 全量 **238/238**（基线 234 → +4 只升）/ Node 38/38；vite build + GNU
  release（custom-protocol）通过。
- 变异红验两组（isPanelTab 恒 true 红2；缺省页签改 risk 红2），复原复绿
  （task_logs/RR31_artifacts/mutation-proof.md）。
- 六张截图（docs/screenshots/20261011-rr31-t1..t6）：识图子代理首轮 5 PASS/1 FAIL
  （演示徽章仅在数据页）→ 修 → 定点复核 2/2 PASS。验收点：无右侧滚动条、顶栏实底
  无透出、页签高亮正确、卡数未知+演示标识齐。

## 待用户清单

- 无阻塞。页签文案/顺序如想调（如「用卡」改「规划」）一句话即可。

## →下轮

- RR29/RR30 仍待领；算法疑问已答复无卡。
