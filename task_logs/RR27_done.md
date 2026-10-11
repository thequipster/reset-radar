# RR27 交付档案（照六图三态 UI 重构）

- 卡面：BACKLOG RR27（🔧修卡，ui；S1011-design4 立卡）。
- 会话：S1011-RR27（本会话，base main c546b52）。
- 分支/commit：`agent/RR27 @ 95c3a98`（单 commit，42+1 文件 +3800/−203）；patch 备份
  `task_logs/RR27.patch`（对 main 干净适用）。

## 改动范围

- 新：theme.ts / format.ts / icons.tsx（20+ 自绘 SVG）/ viz.tsx（圆环+柱状图）/ copySummary.ts /
  demoScenarios.ts / useCalibrationSummary.ts / widget.css + 3 个 CSS Modules /
  CompactBar / PeekCard / DashboardPanel；重写 appState（三态机）/ widgetWindow（三尺寸）/
  useSnapshots（生命周期）/ App.tsx（总装）；删 Capsule.tsx / ExpandedCard.tsx；
  adapters 校准参数改为直收解析视图；shot-expanded.ps1 扩 -ScrollBottom。
- 测试：新 ui.theme / ui.format / ui.copy-summary / ui.demo + 重写 ui.app-state / ui.widget-window。

## 门禁

1. tsc 退出 0。
2. UI 域 **77/77**。
3. 全量 **234/234 0 failed**（基线 182 → +52 只升）；Node 38/38。
4. Rust 未动（无第 5 门）；GNU release `--features tauri/custom-protocol`（B01）构建通过。
5. 变异红验三组（`task_logs/RR27_artifacts/mutation-proof.md`）：null/0 合并红2、
   activate 失效红1、copySummary 丢 stale 标记红1；全部原字节复原复绿。

## 实证（真实窗口）

- 三态物理高 152/424/1380 = 2×(76/212/690)（DPI 192，PMv2 在）；无横向溢出。
- Escape 端到端（CDP 真实按键）：1380→152 收回（escape-probe.ps1/escape-result.txt）。
- 12 张截图 docs/screenshots/：三态×深浅（含滚到底）+ 六演示态（全带演示标识）。
- 识图子代理三轮复审 8/8 PASS（记录 `task_logs/RR27_artifacts/visual-review-rounds.md`）；
  首轮 4 类问题（叠字/浅色未切/empty与loading未生效/底栏不可达）全部修复回归。

## 真值出处

- 六图视觉：docs/design/ref（用户原图）+ 识图文字规格。
- 契约：02-spec §3/§5/§6/§7；adapters.ts 唯一数字入口；RR28 只读校准契约。
- 窗口/探针先例：RR21_done、RR14 shot-expanded.ps1、TRUTH B01/B09/B10。

## 待用户清单

- 无阻塞。主题默认深色（图3 主参考）；如想改默认浅色或调整 token，改 theme.ts/widget.css 即可。

## 排障遗产（→REVIEW 取材）

- 悬浮条窄空间纪律：文本列必须 min-width:0+nowrap+ellipsis，图标列 flex:0 0 auto——
  否则 flex 收缩导致叠字而非截断（首轮复审实证）。
- 展开态勿与悬浮条同屏：main 必须 height:100vh+overflow:hidden，面板内部滚动；
  minHeight:100vh 会让内容把 body 撑爆被裁。
- CDP 滚动/eval 必须等 React 挂载（导航响应早于渲染 3s 级）。
- 残留：Tab 全键盘遍历逐控件实测、对比度逐组合 4.5:1 数值核验、credits-zero 决策卡视口补拍。

## →下轮

- 阶段4业务卡全部闭环。下一拍：RR12 一轮 REVIEW（全量 artifact + 逐差距定夺）。
