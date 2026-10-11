# 照图 UI 重构完成报告（2026-10-11，RR27）

## 交付概览

src/ui 按六张参考图整体重构：三态展示（悬浮条 / 迷你预览 / 展开面板）、深浅双主题（token 化 + 本地记忆 + 跟随系统）、自绘 SVG 图标、全状态覆盖（加载/空/失败/stale/部分 null/卡 0 与未知/公告未来与待核实/校准零样本）、NOACTIVATE 语义下的键盘路径。RR21 窗口基础（透明/置顶/skipTaskbar/focus:false/PMv2 DPI）与 RR13/RR20 成果全部保留；Rust 侧零改动。

## 组件结构

- `CompactBar`（图1，02-spec §3.2 六件线框）：拖动把手 / 品牌雷达+采集状态点+公告点 / 周余 / 24h 风险（可访问名「未来24小时强制重置模型估计」）/ 卡数（null=卡 —，0=卡 ×0）/ ≥44×44 展开钮。数字区不承担拖动。
- `PeekCard`（图2）：今日建议追加或公告计划行 + 用卡建议行 + 额度观测时刻 + 查看完整规划；stale 标「上次观测·数据过期」。
- `DashboardPanel`（图3/4/5）：常驻顶栏（拖动区+主题切换+收起+×，收起/关闭不在滚动区尾部）→ 通知行（公告琥珀卡 / 采集状态卡）→ 额度状态与今日建议（双圆环+紫色建议横幅）→ 风险分析（24h/48h 双卡+因子列表）→ 重置规划与用卡决策（卡数+决策绿卡+四指标+候选日柱状图+规划依据）→ 数据与校准底栏（三来源时刻+校准行+刷新额度/复制摘要/配速解释）。
- `viz.tsx`：SVG 圆环（环粗≈直径1/10、圆头、12点方向）与候选日柱状图（蓝渐变、最佳日绿+皇冠）。
- `icons.tsx`：20+ 自绘线性 SVG 图标（雷达/把手/主题/刷新/复制/星芒/喇叭/盾牌/脉冲/卡组/灯泡/皇冠等），纯装饰 aria-hidden、交互图标带可访问名。
- `theme.ts`+`widget.css`：深色（图3 暗色霓虹）默认、浅色（图4）对应；CSS 变量两套，`[data-theme]` 切换；`prefers-reduced-motion` 关停位移/旋转。
- `useSnapshots` 重做：initializing/empty/read-error phase、手动刷新 in-flight、事件订阅失败独立横幅（不清数据）——补齐 02-spec §7.2 前三项生命周期。
- `useCalibrationSummary`：消费 RR28 只读命令 `read_calibration_summary`。
- `appState`：三态纯转移函数（350/200ms 时序常量；expanded 锁定；Escape 降层）；组合 hash `#expanded&demo=stale` 与 `?theme=light` 为截图/验收可复现入口。

## 关键裁决（沿 02-spec 落地）

- 展开态不再渲染悬浮条（面板顶栏自带拖动/收起/关闭）；main 定高 100vh + 面板内部滚动——修复首轮截图复审发现的「底栏被窗口裁切且不可滚」。
- 悬浮条采集状态收敛为品牌旁状态点（可访问文本），去掉文本列——窄空间防叠字；文本列一律 min-width:0+ellipsis。
- 演示模式徽章：悬浮条并入品牌副行「reset-radar · 演示」，面板保留醒目徽章——独立徽章会挤爆悬浮条（二轮复审实证）。
- demo stale 的过期语义由注入的过期 resetStatus 数据层状态驱动，UI 不设过期分钟阈值（02-spec §6「不在组件设未经证据核实的过期分钟数」）。

## 验证证据

- 四绿：tsc 0 / UI 域 77/77 / 全量 234/234（基线 182 → 只升）/ Node 38/38；`npm run build`+GNU release（custom-protocol，B01）通过。
- 变异红验三组（复原后复绿）：① percentWhole null→"0%" 合并（红2，null/0 语义钉死）；② appState activate 改 no-op（红1）；③ copySummary 删 stale 标记（红1）。
- 真实窗口实测：三态窗口高度 2×(76/212/690) 物理命中（152/424/1380）；DPI 192（PMv2 在）；Escape 端到端探针（CDP 派发真实按键）1380→152 收回成功（`task_logs/RR27_artifacts/escape-result.txt`）。
- 截图 12 张落盘 `docs/screenshots/`：三态×深浅（含滚到底佐证底栏按钮/校准行可达）+ 六演示状态（empty/error/stale/credits-zero/credits-unknown/loading，全部带演示标识）。识图子代理三轮复审：首轮 10 张 FAIL（叠字/浅色未切/empty与loading未生效/底栏不可达）→ 修复 → 二轮 4 项残留 → 修复 → 三轮 8/8 PASS。
- 复审备注（不阻交付）：credits-zero 滚到底视口未见「无可用重置卡」决策卡文案——该卡在同状态顶部视口渲染（决策= no-credits 的 UI 映射），卡 ×0 与卡数未知两态已可区分；后续 REVIEW 如需可补拍该视口。

## 证据出处

- 视觉规格：docs/design/ref 六图（用户提供）+ 识图子代理文字规格（三份复审记录见 task_logs/RR27_artifacts/）。
- 交互/状态/字段契约：docs/design/02-spec.md §3/§5/§6/§7。
- 窗口基础与探针：RR21_done（widget 字段/两态实证）、RR14 shot-expanded.ps1（本卡扩 -ScrollBottom）、B01/B09/B10。
- 数字唯一来源：src/ui/adapters.ts DashboardViewModel（本卡零业务公式）；校准摘要=RR28 只读契约。

## 遗留（→REVIEW 取材）

- Tab 全键盘遍历的逐控件实测（NOACTIVATE 下点击激活后 Tab）：Escape/Enter 路径已实测，遍历顺序留 REVIEW 补证。
- 对比度逐组合 4.5:1 数值核验（token 已按识图规格取值，未逐对比实测）。
- credits-zero 决策卡视口截图补拍（见上）。
