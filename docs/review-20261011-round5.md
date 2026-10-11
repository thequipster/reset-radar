# REVIEW 第 5 轮验收报告 — 2026-10-11（会话 S1011-2000，锚卡 RR12）

> base：main 8b476a4（RR39 合入后）。无🟠可领（RR30 依赖用户 CI 首跑）、无🟡待合、
> 无人在飞 → 按 RUNBOOK §9.1 全量执行。产物：task_logs/RR12r5_artifacts/。
> 本轮零代码改动（纯验收+立卡+数据脚本刷新），门禁等价口径沿 RR12r2/r4 先例。

## 1. 七门 artifact（命令+结果；artifact 文件在 task_logs/RR12r5_artifacts/）

| # | 门 | 命令 | 结果 | artifact |
|---|---|---|---|---|
| 1 | 治理守卫 | `npx tsc --noEmit` | exit 0 | tsc.txt |
| 2 | 全量 vitest | `npx vitest run` | **269/269 0 failed**（29 文件） | vitest-full.txt（20:01） |
| 3 | 前端构建 | `npm run build`（tsc && vite build） | ✓ built in 1.07s | build.txt |
| 4 | Rust 检查 | `cargo check --tests`（PATH 按 §10） | Finished dev profile | cargo-check.txt |
| 5 | node 测试 | `npm run test:node` | **38/38 0 failed** | node-tests.txt |
| 6 | 发布守卫 | `node scripts/check-release.mjs` | 版本同步 0.1.0；13 链接全可达 | check-release.txt |
| 7 | 校准管线 | `node scripts/review-calibration.mjs` | exit 0；fetch fresh 60 事件（codex-resets.com，fetchedAt 2026-10-11T12:05:57Z），计分窗口 n=0 如实（冷启动，样本<30 指标仅供参考） | calibration.txt |

数据刷新后复跑终验（沿 r4 先例）：vitest 全量 **269/269 0 failed**✅、node **38/38**✅
（vitest-full-after-data.txt / node-tests-after-data.txt）。

## 2. 识图子代理独立复核（非复用交付结论；IHDR 字节核验）

派 Explore 只读子代理逐图审查（主会话不直接读图，§9.1）：

| 图 | IHDR（字节核验） | 结论 |
|---|---|---|
| docs/screenshots/20261011-rr37-capsule-dark.png | 920×152 ✅（=2×460×76，RR20 口径） | **PASS**——右端「卡×3/重置卡」+下拉钮完整、左下六点把手完整、文字锐利、与浅色孪生（rr32-capsule-light 920×152）逐元素同构；**RR37 修复确认到位** |
| docs/screenshots/20261011-rr38-expanded-light.png | 920×1380 ✅ | **FAIL**——见 G1 |
| docs/screenshots/20261011-rr38-expanded-dark.png | 920×1380 ✅ | **FAIL**——与 G1 同一缺陷 |

其余检查项全过：「北京时间」时间段整段不断行（RR35 语义保持）、横幅尾箭头「›」醒目
（RR35 无回归）、无孤字换行、无截断/重叠。

## 3. 差距定夺（逐条不悬空）

**G1（新差距，识图独立复核 FAIL×2）→ 立卡 RR40（🔧修卡 ui P3）**
现象：「采集状态」卡副文案分隔点「·」**行首顶格**——RR38 把「·」并入 .timeNoWrap 段
（DashboardPanel.tsx:239）后，换行断点移至整段之前，实际渲染为「最近更新成功」/
「· 10/11 19:45 北京时间」两行，「·」孤立于第二行行首（避头尾缺陷换形态存在），
两主题同现。RR38 交付按其卡面方向（「·」并入下行）执行无误，本轮识图判定该结果形态
仍属排版缺陷 → 新卡收敛。
修向：「·」与前文绑定（如「成功&nbsp;·」不换行空格连接，nowrap 段缩回纯时间段），
或去「·」改间距；锁测试 ui.hanging-dot.test.ts 口径同步。

**G2（BOARD 取材提示）→ 立卡 RR41（🔧修卡 docs P3）**
现象：README:110 状态行「RR01–RR35 除 RR30…REVIEW 已 3 轮」过时——实况 RR01–RR39
已闭环（RR30 仍待用户 CI 首跑）、REVIEW 已 5 轮（本报告落库后）。

**不立卡（附理由）：**
- N1 环形进度环心数字偏淡（78%/62%，双主题观察）：沿第 3 轮+D031 注脚口径——浅色
  环心=语义色列用户点单池实证注脚，深色同族；对比度报告（RR29 84 组+RR34 刷新）无该
  项不达标记录，属点单池范畴非缺陷，留用户定夺。
- N2 展开态下半留白：第 3 轮已定夺审美项，v0.3 留点单（D031 用户门控期）。
- N3 ROADMAP v0.3 三项（系统通知/配速联动开关/多窗口布局记忆）：D031 明确维持留点单，
  复检直接引 D 不重开辩论。
- N4 RR13/RR21 空壳 worktree 目录句柄占用（本轮 cmd rmdir 再试 rc=32）：git 侧早已
  拆除、主仓依赖完好，运行时积累非功能缺陷，延续观察；RR26 worktree 为用户六张参考图
  **有意保留**（RR26_done 有指引），不属遗留。
- N5 RR30：既有 🟣待用户卡（依赖用户 CI 首跑），不重复立卡。

## 4. 结论

七门全绿；RR37 修复经独立复核确认到位；RR38 修复形态不达标立 RR40 收敛；README 状态行
立 RR41 刷新。阶段切回 WORK（建议 RR40 → RR41；RR40 ui 域需 release 双主题截图，RR41
docs 可穿插）。循环仍处用户门控期（D031）：RR30 等 CI 首跑、v0.3 等点单、发布留给用户。
